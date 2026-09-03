import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AltaExpedienteWizard } from "../ui/AltaExpedienteWizard";
import { __reiniciarClienteParaPruebas } from "../api/client";
import { comprobarConexion } from "../state/consola";
import { loadInstalledBackend, type DocHarness } from "../../../../scripts/documentacion-backend.mjs";

/**
 * El asistente de «Nuevo expediente», contra el backend real.
 *
 * Recorre el camino que hace una persona —identidad, documentos generales, tipo
 * de funcionario, garantía, requisitos de la categoría y guardado— y comprueba
 * que el expediente que queda en el libro tiene la rama correcta, sus requisitos
 * y los estados que se marcaron. Es la prueba de que el formulario y el catálogo
 * del backend hablan el mismo idioma.
 */

const URL_PRUEBAS = "https://script.google.com/macros/s/pruebas/exec";

/** Acciones que el navegador pidió, en orden. Es la métrica de «viajes de red». */
let acciones: string[] = [];

function enchufar(harness: DocHarness) {
  acciones = [];
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const cuerpo = JSON.parse(String(init.body));
    acciones.push(String(cuerpo.accion));
    const salida = harness.call<{ getContent(): string }>("doPost", { postData: { contents: JSON.stringify(cuerpo) } });
    return { ok: true, status: 200, text: async () => salida.getContent() } as unknown as Response;
  });
}

describe("asistente de nuevo expediente · integración con el backend", () => {
  let harness: DocHarness;

  beforeEach(async () => {
    window.localStorage.clear();
    __reiniciarClienteParaPruebas();
    harness = loadInstalledBackend();
    enchufar(harness);
    // Poblar el catálogo en el store de la consola, que es de donde el asistente
    // lee los documentos aplicables por rama.
    await comprobarConexion({ url: URL_PRUEBAS });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __reiniciarClienteParaPruebas();
    window.localStorage.clear();
  });

  it("crea un expediente comercial Tipo 1 con sus 21 requisitos y aplica lo marcado en una sola llamada", async () => {
    const usuario = userEvent.setup();
    const creado = vi.fn();
    const error = vi.fn();

    render(<AltaExpedienteWizard abierta onCerrar={() => {}} onCreado={creado} onError={error} />);

    // Paso 1 · identidad. El carnet se escribe TAL CUAL: sin formato impuesto.
    await usuario.type(screen.getByPlaceholderText("Ej. 1234567 LP"), "1234567 - 45 - 2026");
    await usuario.type(screen.getByPlaceholderText("Nombres y apellidos"), "Camila Comercial");
    await usuario.click(screen.getByRole("button", { name: /Continuar/i }));

    // Paso 2 · documentos generales — marcar la fotografía como ENTREGADO y
    // anotar las hojas del REJAP, que es físico.
    const foto = await screen.findByText(/Fotografía en formato digital 4X4/);
    const filaFoto = foto.closest("li")!;
    await usuario.click(within(filaFoto).getByRole("button", { name: "Entregado" }));

    const rejap = screen.getByText("Registro Judicial de Antecedentes Penales REJAP (vigente).");
    const filaRejap = rejap.closest("li")!;
    await usuario.click(within(filaRejap).getByRole("button", { name: /Una hoja más/ }));
    await usuario.click(within(filaRejap).getByRole("button", { name: /Una hoja más/ }));
    await usuario.click(within(filaRejap).getByRole("button", { name: "Entregado" }));

    // La fotografía es digital: NO tiene contador de hojas, ni oculto.
    expect(within(filaFoto).queryByRole("button", { name: /Una hoja más/ })).toBeNull();

    await usuario.click(screen.getByRole("button", { name: /Continuar/i }));

    // Paso 3 · tipo de funcionario → comercial → garantía Tipo 1
    await usuario.click(await screen.findByRole("radio", { name: /Funcionario área comercial/i }));
    await usuario.click(await screen.findByRole("radio", { name: /Tipo 1/i }));
    await usuario.click(screen.getByRole("button", { name: /Continuar/i }));

    // Paso 4 · requisitos de la categoría, con sus bloques con título
    await screen.findByText(/documentos? propios? de esta categoría/i);
    expect(screen.getByText("1 Garante con Bien Inmueble")).toBeInTheDocument();
    expect(screen.getByText("1 Garante Familiar (hasta 4to grado de consanguinidad)")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: /Continuar/i }));

    // Paso 5 · revisión. El resumen dice cuántas hojas físicas se anotaron.
    await screen.findByText("Documentos en físico");
    expect(screen.getByText(/2 hojas en 1 de 5 documento/)).toBeInTheDocument();

    /* El alta viaja en UNA sola llamada: se cuenta cuántas veces se llamó a
       `expediente.crear` y que NO hubo `requisitos.guardar` después. */
    const llamadasAntes = acciones.length;
    await usuario.click(await screen.findByRole("button", { name: /Guardar y abrir expediente/i }));

    await waitFor(() => expect(creado).toHaveBeenCalled());
    expect(error).not.toHaveBeenCalled();

    const delGuardado = acciones.slice(llamadasAntes);
    expect(delGuardado).toEqual(["documentacion.expediente.crear"]);

    // El backend tiene el expediente con la rama y los requisitos correctos.
    const detalle = harness.ok("documentacion.expediente.obtener", { identificador: "1234567 - 45 - 2026" });
    expect(detalle.expediente.tipoFuncionario).toBe("COMERCIAL");
    expect(detalle.expediente.tipoGarantia).toBe("COMERCIAL_1");
    expect(detalle.requisitos.length).toBe(21);
    const foto4x4 = detalle.requisitos.find((r: { codigo: string }) => r.codigo === "foto-4x4");
    expect(foto4x4.estado).toBe("ENTREGADO");
    // El conteo de hojas llegó al libro en la misma llamada.
    const rejapGuardado = detalle.requisitos.find((r: { codigo: string }) => r.codigo === "rejap");
    expect(rejapGuardado.estado).toBe("ENTREGADO");
    expect(rejapGuardado.hojasFisicas).toBe(2);
    // Y las subsecciones se resolvieron para ESTA rama.
    const inmueble = detalle.requisitos.find((r: { codigo: string }) => r.codigo === "garante-inmueble");
    expect(inmueble.subseccion).toBe("1 Garante con Bien Inmueble");
    // Solo aparecen los documentos de garantía de la rama 1.
    const codigos = detalle.requisitos.map((r: { codigo: string }) => r.codigo);
    expect(codigos).toContain("garante-t1-fam-ci");
    expect(codigos).not.toContain("garante-fam1-ci"); // ese es de la rama 2
  });

  it("auditoría añade solo la declaración de impedimento", async () => {
    const usuario = userEvent.setup();
    const creado = vi.fn();

    render(<AltaExpedienteWizard abierta onCerrar={() => {}} onCreado={creado} onError={() => {}} />);
    await usuario.type(screen.getByPlaceholderText("Ej. 1234567 LP"), "7654321 - 9 - 2026");
    await usuario.type(screen.getByPlaceholderText("Nombres y apellidos"), "Aldo Auditor");
    await usuario.click(screen.getByRole("button", { name: /Continuar/i }));
    await usuario.click(screen.getByRole("button", { name: /Continuar/i })); // generales
    await usuario.click(await screen.findByRole("radio", { name: /Funcionario área auditoría/i }));
    await usuario.click(screen.getByRole("button", { name: /Continuar/i }));
    await usuario.click(screen.getByRole("button", { name: /Continuar/i })); // específicos
    await usuario.click(await screen.findByRole("button", { name: /Guardar y abrir expediente/i }));

    await waitFor(() => expect(creado).toHaveBeenCalled());
    const detalle = harness.ok("documentacion.expediente.obtener", { identificador: "7654321 - 9 - 2026" });
    expect(detalle.requisitos.length).toBe(17);
    const codigos = detalle.requisitos.map((r: { codigo: string }) => r.codigo);
    expect(codigos).toContain("impedimento-auditor");
    expect(codigos).not.toContain("lgi-ft");
  });
  it("avisa del carnet repetido mientras se escribe, sin llegar al guardado", async () => {
    // El backend rechaza el duplicado al guardar, pero enterarse ahí obliga a
    // rellenar cinco pasos para nada. El asistente pregunta al libro en cuanto el
    // número parece completo, y reconoce el mismo carnet escrito de otra forma:
    // en el libro está «5556666 - 1 - 2026» y aquí se teclea «55566661 2026».
    const usuario = userEvent.setup();
    harness.ok("documentacion.expediente.crear", {
      expediente: {
        identificador: "5556666 - 1 - 2026",
        nombre: "Elena Existente",
        tipoFuncionario: "GENERAL",
        tipoGarantia: "NINGUNA",
      },
    });

    const abrir = vi.fn();
    render(
      <AltaExpedienteWizard abierta onCerrar={() => {}} onCreado={() => {}} onError={() => {}} onAbrirExistente={abrir} />,
    );
    await usuario.type(screen.getByPlaceholderText("Ej. 1234567 LP"), "55566661 2026");

    const aviso = await screen.findByText(/Ya existe un expediente con ese carnet/i, {}, { timeout: 4000 });
    expect(aviso).toBeTruthy();
    expect(screen.getByText(/Pertenece a Elena Existente/)).toBeTruthy();
    // No se ha intentado crear nada: el aviso sale de una consulta, no de un alta.
    expect(acciones).not.toContain("documentacion.expediente.crear");

    // Y lleva al expediente que ya existe en lugar de dejar a nadie a medias.
    await usuario.click(screen.getByRole("button", { name: /Abrir el expediente existente/i }));
    expect(abrir).toHaveBeenCalled();
  });

  it("al corregir el carnet el aviso se retira", async () => {
    const usuario = userEvent.setup();
    harness.ok("documentacion.expediente.crear", {
      expediente: { identificador: "1112223 LP", nombre: "Otro Alguien", tipoFuncionario: "GENERAL", tipoGarantia: "NINGUNA" },
    });
    render(<AltaExpedienteWizard abierta onCerrar={() => {}} onCreado={() => {}} onError={() => {}} />);
    const campo = screen.getByPlaceholderText("Ej. 1234567 LP");
    await usuario.type(campo, "1112223 LP");
    await screen.findByText(/Ya existe un expediente con ese carnet/i, {}, { timeout: 4000 });

    await usuario.clear(campo);
    await usuario.type(campo, "9998887 LP");
    await waitFor(() => expect(screen.queryByText(/Ya existe un expediente con ese carnet/i)).toBeNull());
  });
});
