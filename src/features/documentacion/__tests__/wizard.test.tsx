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

function enchufar(harness: DocHarness) {
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const cuerpo = JSON.parse(String(init.body));
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

  it("crea un expediente comercial Tipo 1 con sus 21 requisitos, sus hojas físicas y los estados marcados", async () => {
    const usuario = userEvent.setup();
    const creado = vi.fn();
    const error = vi.fn();

    render(<AltaExpedienteWizard abierta onCerrar={() => {}} onCreado={creado} onError={error} />);

    // Paso 1 · identidad. El carnet ya no tiene formato impuesto: se escribe
    // tal como aparece en el documento, complemento incluido.
    await usuario.type(screen.getByPlaceholderText("Ej. 1234567 1K"), "1234567 1K");
    await usuario.type(screen.getByPlaceholderText("Nombres y apellidos"), "Camila Comercial");
    await usuario.click(screen.getByRole("button", { name: /Continuar/i }));

    // Paso 2 · documentos generales — marcar la fotografía como ENTREGADO y
    // anotar las hojas del REJAP, que es uno de los físicos con contador.
    const foto = await screen.findByText(/^1 Fotografía en formato digital 4X4/);
    const filaFoto = foto.closest("li")!;
    await usuario.click(within(filaFoto).getByRole("button", { name: "Entregado" }));

    const rejap = screen.getByText(/^Registro Judicial de Antecedentes Penales REJAP/);
    const filaRejap = rejap.closest("li")!;
    const contador = within(filaRejap).getByLabelText(/Hojas del documento físico/i);
    await usuario.clear(contador);
    await usuario.type(contador, "3");

    // Un documento solo digital NO tiene contador: es la regla dura del catálogo.
    expect(within(filaFoto).queryByLabelText(/Hojas del documento físico/i)).toBeNull();

    await usuario.click(screen.getByRole("button", { name: /Continuar/i }));

    // Paso 3 · tipo de funcionario → comercial → garantía Tipo 1
    await usuario.click(await screen.findByRole("radio", { name: /Funcionario área comercial/i }));
    await usuario.click(await screen.findByRole("radio", { name: /Tipo 1/i }));
    await usuario.click(screen.getByRole("button", { name: /Continuar/i }));

    // Paso 4 · requisitos de la categoría — continuar sin tocar
    await screen.findByText(/documentos? propios? de esta categoría/i);
    await usuario.click(screen.getByRole("button", { name: /Continuar/i }));

    // Paso 5 · revisión → guardar
    await usuario.click(await screen.findByRole("button", { name: /Guardar y abrir expediente/i }));

    await waitFor(() => expect(creado).toHaveBeenCalled());
    expect(error).not.toHaveBeenCalled();

    // El backend tiene el expediente con la rama y los requisitos correctos.
    const detalle = harness.ok("documentacion.expediente.obtener", { identificador: "1234567 1K" });
    expect(detalle.expediente.tipoFuncionario).toBe("COMERCIAL");
    expect(detalle.expediente.tipoGarantia).toBe("COMERCIAL_1");
    expect(detalle.requisitos.length).toBe(21);
    const foto4x4 = detalle.requisitos.find((r: { codigo: string }) => r.codigo === "foto-4x4");
    expect(foto4x4.estado).toBe("ENTREGADO");
    expect(foto4x4.hojasFisicas).toBe(0);
    // El conteo de hojas llegó al libro en la MISMA llamada del alta.
    const rejapGuardado = detalle.requisitos.find((r: { codigo: string }) => r.codigo === "rejap");
    expect(rejapGuardado.hojasFisicas).toBe(3);
    expect(rejapGuardado.requiereConteoHojas).toBe(true);
    // Y las subsecciones de la rama 1 quedaron materializadas.
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

    const err = vi.fn();
    render(<AltaExpedienteWizard abierta onCerrar={() => {}} onCreado={creado} onError={err} />);
    await usuario.type(screen.getByPlaceholderText("Ej. 1234567 1K"), "7654321-9");
    await usuario.type(screen.getByPlaceholderText("Nombres y apellidos"), "Aldo Auditor");
    await usuario.click(screen.getByRole("button", { name: /Continuar/i }));
    await usuario.click(screen.getByRole("button", { name: /Continuar/i })); // generales
    await usuario.click(await screen.findByRole("radio", { name: /Funcionario área auditoría/i }));
    await usuario.click(screen.getByRole("button", { name: /Continuar/i }));
    await usuario.click(screen.getByRole("button", { name: /Continuar/i })); // específicos
    await usuario.click(await screen.findByRole("button", { name: /Guardar y abrir expediente/i }));

    await waitFor(() => expect(creado).toHaveBeenCalled());
    expect(err).not.toHaveBeenCalled();
    const detalle = harness.ok("documentacion.expediente.obtener", { identificador: "7654321-9" });
    expect(detalle.requisitos.length).toBe(17);
    const codigos = detalle.requisitos.map((r: { codigo: string }) => r.codigo);
    expect(codigos).toContain("impedimento-auditor");
    expect(codigos).not.toContain("lgi-ft");
  });
});

