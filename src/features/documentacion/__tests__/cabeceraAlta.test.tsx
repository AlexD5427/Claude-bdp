import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AltaExpedienteWizard } from "../ui/AltaExpedienteWizard";
import { __reiniciarClienteParaPruebas } from "../api/client";
import { comprobarConexion } from "../state/consola";
import { relacionContraste, UMBRAL_AA } from "../../../design-system/contraste";
import { loadInstalledBackend, type DocHarness } from "../../../../scripts/documentacion-backend.mjs";

/**
 * La cabecera del asistente de alta.
 *
 * ── El fallo que corrige, y por qué se prueba ───────────────────────────────
 * Decía «Nuevo expediente documental / Paso 4 de 5 · Requisitos de la
 * categoría» y nada más. En el paso cuatro, quien llena el expediente lleva
 * tres pantallas sin ver a QUIÉN pertenece: si se equivocó de persona en el paso
 * uno, se enteraba al guardar. Y el texto del paso iba en la tinta atenuada, que
 * en el tema claro es un gris azulado sobre cristal blanco.
 *
 * Las dos cosas se prueban: que los tres datos de identidad estén, y que el
 * color con el que se pintan cumpla el umbral de WCAG AA en los dos temas.
 */

const URL_PRUEBAS = "https://script.google.com/macros/s/pruebas/exec";

function enchufar(harness: DocHarness) {
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const cuerpo = JSON.parse(String(init.body));
    const salida = harness.call<{ getContent(): string }>("doPost", { postData: { contents: JSON.stringify(cuerpo) } });
    return { ok: true, status: 200, text: async () => salida.getContent() } as unknown as Response;
  });
}

describe("cabecera del asistente · identidad en contexto", () => {
  it("muestra nombre, carnet y agencia en cuanto se escriben, y el anillo de avance", async () => {
    window.localStorage.clear();
    __reiniciarClienteParaPruebas();
    const harness = loadInstalledBackend();
    enchufar(harness);
    await comprobarConexion({ url: URL_PRUEBAS });

    const usuario = userEvent.setup();
    render(<AltaExpedienteWizard abierta onCerrar={() => {}} onCreado={() => {}} onError={() => {}} />);

    // Antes de escribir nada, la cabecera no inventa chips vacíos.
    const cabecera = screen.getByText("Nuevo expediente documental").closest("div")!.parentElement!.parentElement!;
    expect(within(cabecera).queryByText(/Sin agencia/)).toBeNull();

    await usuario.type(screen.getByPlaceholderText("Ej. 1234567 1K"), "8877665 2B");
    await usuario.type(screen.getByPlaceholderText("Nombres y apellidos"), "Rocío Casas Tapia");

    // Los dos datos escritos aparecen en la cabecera, y la agencia se anuncia
    // como ausente en lugar de desaparecer: su hueco es información.
    expect(await screen.findByTitle("Rocío Casas Tapia")).toBeInTheDocument();
    expect(screen.getByTitle("Carnet de identidad 8877665 2B")).toBeInTheDocument();
    expect(screen.getByText("Sin agencia")).toBeInTheDocument();

    // El anillo de avance está desde el principio, en cero.
    const anillo = screen.getByRole("progressbar", { name: /Avance documental/ });
    expect(anillo).toHaveAttribute("aria-valuenow", "0");

    // Y avanza al marcar un documento, sin esperar al backend.
    await usuario.click(screen.getByRole("button", { name: /Continuar/i }));
    const foto = await screen.findByText(/^1 Fotografía en formato digital 4X4/);
    await usuario.click(within(foto.closest("li")!).getByRole("button", { name: "Entregado" }));
    await waitFor(() => {
      const valor = Number(screen.getByRole("progressbar", { name: /Avance documental/ }).getAttribute("aria-valuenow"));
      expect(valor).toBeGreaterThan(0);
    });

    vi.unstubAllGlobals();
    __reiniciarClienteParaPruebas();
    window.localStorage.clear();
  });

  it("el indicador de pasos se acorta con la rama y el título del paso se anuncia", async () => {
    window.localStorage.clear();
    __reiniciarClienteParaPruebas();
    const harness = loadInstalledBackend();
    enchufar(harness);
    await comprobarConexion({ url: URL_PRUEBAS });

    const usuario = userEvent.setup();
    render(<AltaExpedienteWizard abierta onCerrar={() => {}} onCreado={() => {}} onError={() => {}} />);
    await usuario.type(screen.getByPlaceholderText("Ej. 1234567 1K"), "1");
    await usuario.type(screen.getByPlaceholderText("Nombres y apellidos"), "Ana");

    // El paso activo se marca con `aria-current="step"`, que es lo que un lector
    // de pantalla usa para decir «paso actual».
    const lista = screen.getByRole("list", { name: "Pasos del asistente" });
    expect(within(lista).getAllByRole("button").filter((b) => b.getAttribute("aria-current") === "step")).toHaveLength(1);
    expect(screen.getByText(/Paso 1 de 5/)).toBeInTheDocument();

    vi.unstubAllGlobals();
    __reiniciarClienteParaPruebas();
    window.localStorage.clear();
  });
});

/**
 * Contraste de la cabecera, medido sobre los tokens reales del módulo.
 *
 * ── Por qué se leen del CSS y no se escriben aquí ───────────────────────────
 * Porque una constante copiada en la prueba mide la copia. Los valores se
 * extraen de `documentacion.css`, que es el archivo que el navegador va a
 * aplicar: si alguien aclara la tinta del tema claro, esta prueba falla.
 */
describe("cabecera del asistente · contraste medido de la tinta", () => {
  const css = readFileSync(join(process.cwd(), "src/features/documentacion/ui/documentacion.css"), "utf8");

  /** Valor de una variable CSS dentro de un bloque de selector concreto. */
  function token(selector: string, variable: string): string {
    const bloque = css.slice(css.indexOf(selector));
    const cuerpo = bloque.slice(bloque.indexOf("{"), bloque.indexOf("}"));
    const encontrado = cuerpo.match(new RegExp(`${variable}\\s*:\\s*([^;]+);`));
    if (!encontrado) throw new Error(`No se encontró ${variable} en ${selector}`);
    return encontrado[1].trim();
  }

  it("la tinta principal cumple AA sobre las superficies de los dos temas", () => {
    const casos: { tema: string; texto: string; base: string }[] = [
      // Tema oscuro: el módulo se pinta sobre el azul profundo de la aplicación.
      { tema: "oscuro", texto: token(".doc-console {", "--doc-text"), base: "#071426" },
      // Tema claro: cristal blanco sobre papel blanco, que es el caso que se quejaba.
      { tema: "claro", texto: token(".light .doc-console {", "--doc-text"), base: "#ffffff" },
    ];
    for (const caso of casos) {
      const ratio = relacionContraste(caso.texto, "transparent", caso.base);
      expect(ratio, `tinta principal en tema ${caso.tema}`).not.toBeNull();
      expect(ratio!, `tinta principal en tema ${caso.tema}`).toBeGreaterThanOrEqual(UMBRAL_AA.normal);
    }
  });

  it("la tinta principal del tema claro es casi negra, no un gris azulado", () => {
    /* Es la corrección concreta que pidió el área: el texto del paso y el nombre
       de la persona pasan de `--doc-text-muted` a `--doc-text`. La prueba fija
       el umbral en 8:1 —muy por encima del 4.5 que exige AA— para que nadie
       pueda «arreglar» un rediseño aclarando este token. */
    const tinta = token(".light .doc-console {", "--doc-text");
    const ratio = relacionContraste(tinta, "transparent", "#ffffff")!;
    expect(ratio).toBeGreaterThanOrEqual(8);
  });

  it("los chips de identidad de la cabecera llevan la tinta principal", () => {
    const bloque = css.slice(css.indexOf(".doc-identidad-dato {"));
    const cuerpo = bloque.slice(0, bloque.indexOf("}"));
    expect(cuerpo).toContain("color: var(--doc-text)");
    /* Y el nombre, además, con más peso: es el dato principal de la cabecera y
       tiene que ganar la jerarquía visual sin depender del color. */
    const nombre = css.slice(css.indexOf(".doc-identidad-nombre {"));
    expect(nombre.slice(0, nombre.indexOf("}"))).toContain("font-weight: 800");
  });
});
