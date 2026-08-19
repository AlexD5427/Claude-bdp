import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SelectorAuxiliar } from "../ui/SelectorAuxiliar";
import { AltaExpedienteWizard } from "../ui/AltaExpedienteWizard";
import { __reiniciarClienteParaPruebas } from "../api/client";
import { comprobarConexion } from "../state/consola";
import { loadInstalledBackend, type DocHarness } from "../../../../scripts/documentacion-backend.mjs";

/**
 * Las dos redes de seguridad del alta.
 *
 * 1. **Catálogos auxiliares editables.** Agencia y gerencia salen de la hoja
 *    `Auxiliar` del libro. Si falta un valor, se puede añadir sin salir del
 *    formulario: se escribe en la columna correspondiente y **nunca se quita nada**.
 *    Si la escritura falla, el valor se usa igual en este expediente.
 * 2. **Borrador local.** Lo escrito en el asistente sobrevive a cerrarlo, y al
 *    volver se ofrece continuar o empezar de cero.
 */

const URL_PRUEBAS = "https://script.google.com/macros/s/pruebas/exec";

function enchufar(harness: DocHarness) {
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const cuerpo = JSON.parse(String(init.body));
    const salida = harness.call<{ getContent(): string }>("doPost", { postData: { contents: JSON.stringify(cuerpo) } });
    return { ok: true, status: 200, text: async () => salida.getContent() } as unknown as Response;
  });
}

describe("catálogos auxiliares · elegir y añadir", () => {
  let harness: DocHarness;

  beforeEach(async () => {
    window.localStorage.clear();
    __reiniciarClienteParaPruebas();
    harness = loadInstalledBackend();
    enchufar(harness);
    await comprobarConexion({ url: URL_PRUEBAS });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __reiniciarClienteParaPruebas();
    window.localStorage.clear();
  });

  function Envoltorio({ opciones }: { opciones: string[] }) {
    const [valor, setValor] = useState("");
    return (
      <>
        <SelectorAuxiliar valor={valor} onChange={setValor} opciones={opciones} columna="agencia_bdp" placeholder="Elige una agencia" />
        <p data-testid="valor">{valor}</p>
      </>
    );
  }

  it("filtra la lista al escribir y elige con un clic", async () => {
    const usuario = userEvent.setup();
    render(<Envoltorio opciones={["LA PAZ", "SANTA CRUZ", "COCHABAMBA"]} />);
    await usuario.click(screen.getByRole("button", { name: "Elige una agencia" }));
    await usuario.type(await screen.findByPlaceholderText("Buscar o escribir una nueva…"), "cocha");
    // La búsqueda ignora acentos y mayúsculas.
    const opcion = await screen.findByRole("option", { name: "COCHABAMBA" });
    await usuario.click(opcion);
    expect(screen.getByTestId("valor").textContent).toBe("COCHABAMBA");
  });

  it("añade un valor nuevo al libro y lo usa en el formulario", async () => {
    const usuario = userEvent.setup();
    render(<Envoltorio opciones={["LA PAZ"]} />);
    await usuario.click(screen.getByRole("button", { name: "Elige una agencia" }));
    await usuario.type(await screen.findByPlaceholderText("Buscar o escribir una nueva…"), "Yacuiba");
    await usuario.click(await screen.findByRole("button", { name: /Añadir «YACUIBA»/ }));

    expect(screen.getByTestId("valor").textContent).toBe("YACUIBA");
    // Y llegó a la hoja Auxiliar del libro, sin quitar lo que ya había.
    await waitFor(() => {
      const auxiliares = harness.ok("documentacion.auxiliares").auxiliares as { agencia_bdp: string[] };
      expect(auxiliares.agencia_bdp).toContain("YACUIBA");
    });
  });

  it("si el libro rechaza el alta, el valor se usa igual y se avisa", async () => {
    const usuario = userEvent.setup();
    const avisos: string[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
      const cuerpo = JSON.parse(String(init.body));
      if (cuerpo.accion === "documentacion.auxiliares.agregar") {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({ ok: false, accion: cuerpo.accion, error: { codigo: "LIBRO", mensaje: "El libro está protegido." } }),
        } as unknown as Response;
      }
      const salida = harness.call<{ getContent(): string }>("doPost", { postData: { contents: JSON.stringify(cuerpo) } });
      return { ok: true, status: 200, text: async () => salida.getContent() } as unknown as Response;
    });

    function Env() {
      const [valor, setValor] = useState("");
      return (
        <>
          <SelectorAuxiliar
            valor={valor}
            onChange={setValor}
            opciones={["LA PAZ"]}
            columna="agencia_bdp"
            placeholder="Elige una agencia"
            onAviso={(intencion, texto) => avisos.push(`${intencion}:${texto}`)}
          />
          <p data-testid="valor">{valor}</p>
        </>
      );
    }
    render(<Env />);
    await usuario.click(screen.getByRole("button", { name: "Elige una agencia" }));
    await usuario.type(await screen.findByPlaceholderText("Buscar o escribir una nueva…"), "Bermejo");
    await usuario.click(await screen.findByRole("button", { name: /Añadir «BERMEJO»/ }));

    expect(screen.getByTestId("valor").textContent).toBe("BERMEJO");
    await waitFor(() => expect(avisos.some((a) => a.startsWith("aviso:"))).toBe(true));
  });
});

describe("asistente de alta · borrador local", () => {
  let harness: DocHarness;

  beforeEach(async () => {
    window.localStorage.clear();
    __reiniciarClienteParaPruebas();
    harness = loadInstalledBackend();
    enchufar(harness);
    await comprobarConexion({ url: URL_PRUEBAS });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __reiniciarClienteParaPruebas();
    window.localStorage.clear();
  });

  it("guarda lo escrito y lo ofrece al volver a abrir el asistente", async () => {
    const usuario = userEvent.setup();
    const nada = () => {};

    const primera = render(
      <AltaExpedienteWizard abierta onCerrar={nada} onCreado={nada} onError={nada} />,
    );
    await usuario.type(screen.getByPlaceholderText("1234567 - 45 - 2026"), "5554443 - 12 - 2026");
    await usuario.type(screen.getByPlaceholderText("Nombres y apellidos"), "Interrumpida Pérez");
    // El borrador se guarda con retardo; se espera a que aparezca en el disco local.
    await waitFor(() => expect(window.localStorage.getItem("bdp-documentacion-alta-borrador")).toBeTruthy(), {
      timeout: 3000,
    });
    primera.unmount();

    // Segunda apertura: se ofrece continuar.
    render(<AltaExpedienteWizard abierta onCerrar={nada} onCreado={nada} onError={nada} />);
    expect(await screen.findByText("Hay un expediente a medio llenar")).toBeTruthy();
    await usuario.click(screen.getByRole("button", { name: "Continuar donde lo dejé" }));
    expect((screen.getByPlaceholderText("Nombres y apellidos") as HTMLInputElement).value).toBe("Interrumpida Pérez");
  });

  it("«empezar de cero» borra el borrador y deja el formulario vacío", async () => {
    const usuario = userEvent.setup();
    const nada = () => {};
    window.localStorage.setItem(
      "bdp-documentacion-alta-borrador",
      JSON.stringify({
        state: {
          form: { identificador: "1", nombre: "Vieja Nota", cargo: "", agencia: "", gerencia: "", fechaIngreso: "", responsableId: "" },
          categoria: "",
          garantia: "",
          docs: {},
          paso: "identidad",
        },
        savedAt: Date.now(),
      }),
    );

    render(<AltaExpedienteWizard abierta onCerrar={nada} onCreado={nada} onError={nada} />);
    await usuario.click(await screen.findByRole("button", { name: "Empezar de cero" }));
    expect(window.localStorage.getItem("bdp-documentacion-alta-borrador")).toBeNull();
    expect((screen.getByPlaceholderText("Nombres y apellidos") as HTMLInputElement).value).toBe("");
  });
});

/**
 * El catálogo en caché.
 *
 * Si la primera lectura falla, el módulo tiene que seguir sabiendo qué documentos
 * existen: sin eso, el asistente muestra pasos vacíos y parece roto.
 */
describe("catálogo · copia local como red de seguridad", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __reiniciarClienteParaPruebas();
    window.localStorage.clear();
  });

  it("guarda el catálogo recibido en el almacenamiento local", async () => {
    window.localStorage.clear();
    __reiniciarClienteParaPruebas();
    const harness = loadInstalledBackend();
    enchufar(harness);
    await comprobarConexion({ url: URL_PRUEBAS });
    await waitFor(() => expect(window.localStorage.getItem("bdp-documentacion-catalogo")).toBeTruthy());
    const guardado = JSON.parse(window.localStorage.getItem("bdp-documentacion-catalogo")!);
    expect(guardado.catalogo.documentos.length).toBe(38);
    expect(guardado.guardadoEn).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
