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

  it("crea un expediente comercial Tipo 1 con sus 21 requisitos y aplica los estados marcados", async () => {
    const usuario = userEvent.setup();
    const creado = vi.fn();
    const error = vi.fn();

    render(<AltaExpedienteWizard abierta onCerrar={() => {}} onCreado={creado} onError={error} />);

    // Paso 1 · identidad
    await usuario.type(screen.getByPlaceholderText("Por ejemplo 1234567 o 1234567-1A"), "1234567 - 45 - 2026");
    await usuario.type(screen.getByPlaceholderText("Nombres y apellidos"), "Camila Comercial");
    await usuario.click(screen.getByRole("button", { name: /Continuar/i }));

    // Paso 2 · documentos generales — marcar la fotografía como ENTREGADO
    const foto = await screen.findByText(/^Fotografía en formato digital 4X4/);
    const filaFoto = foto.closest("li")!;
    await usuario.click(within(filaFoto).getByRole("button", { name: "Entregado" }));
    await usuario.click(screen.getByRole("button", { name: /Continuar/i }));

    // Paso 3 · tipo de funcionario → comercial → garantía Tipo 1
    await usuario.click(await screen.findByRole("button", { name: /Funcionario área comercial/i }));
    await usuario.click(await screen.findByRole("button", { name: /Tipo 1/i }));
    await usuario.click(screen.getByRole("button", { name: /Continuar/i }));

    // Paso 4 · requisitos de la categoría — continuar sin tocar
    await screen.findByText(/documentos? propios? de esta categoría/i);
    await usuario.click(screen.getByRole("button", { name: /Continuar/i }));

    // Paso 5 · revisión → guardar
    await usuario.click(await screen.findByRole("button", { name: /Guardar y abrir expediente/i }));

    await waitFor(() => expect(creado).toHaveBeenCalled());
    expect(error).not.toHaveBeenCalled();

    // El backend tiene el expediente con la rama y los requisitos correctos.
    const detalle = harness.ok("documentacion.expediente.obtener", { identificador: "1234567 - 45 - 2026" });
    expect(detalle.expediente.tipoFuncionario).toBe("COMERCIAL");
    expect(detalle.expediente.tipoGarantia).toBe("COMERCIAL_1");
    expect(detalle.requisitos.length).toBe(21);
    const foto4x4 = detalle.requisitos.find((r: { codigo: string }) => r.codigo === "foto-4x4");
    expect(foto4x4.estado).toBe("ENTREGADO");
    // Solo aparecen los documentos de garantía de la rama 1.
    const codigos = detalle.requisitos.map((r: { codigo: string }) => r.codigo);
    expect(codigos).toContain("garante-t1-fam-ci");
    expect(codigos).not.toContain("garante-fam1-ci"); // ese es de la rama 2
  });

  it("Escape cierra el asistente, y con datos escritos pide confirmación", async () => {
    const usuario = userEvent.setup();
    const cerrar = vi.fn();
    const vista = render(<AltaExpedienteWizard abierta onCerrar={cerrar} onCreado={() => {}} onError={() => {}} />);

    // Sin nada escrito, Escape cierra directamente.
    await usuario.keyboard("{Escape}");
    await waitFor(() => expect(cerrar).toHaveBeenCalledTimes(1));
    /* Se desmonta antes de la segunda parte: dos asistentes montados a la vez
       escucharían los dos el mismo Escape, y el primero contaminaría la cuenta. */
    vista.unmount();

    cerrar.mockClear();
    render(<AltaExpedienteWizard abierta onCerrar={cerrar} onCreado={() => {}} onError={() => {}} />);
    await usuario.type(screen.getByPlaceholderText("Nombres y apellidos"), "Alguien Escribiendo");

    /*
     * Con datos escritos NO se cierra de golpe: aparece la confirmación del
     * módulo. `window.confirm` está prohibido aquí —bloquea el hilo y el
     * navegador permite silenciarlo, y entonces el panel deja de poder cerrarse—.
     */
    await usuario.keyboard("{Escape}");
    expect(cerrar).not.toHaveBeenCalled();
    expect(await screen.findByText(/¿Cerrar el asistente\?/)).toBeInTheDocument();
  });

  it("los dos generales retirados no se ofrecen en un alta nueva", async () => {
    const usuario = userEvent.setup();
    render(<AltaExpedienteWizard abierta onCerrar={() => {}} onCreado={() => {}} onError={() => {}} />);

    await usuario.type(screen.getByPlaceholderText("Por ejemplo 1234567 o 1234567-1A"), "4443332");
    await usuario.type(screen.getByPlaceholderText("Nombres y apellidos"), "Sin Retirados");
    await usuario.click(screen.getByRole("button", { name: /Continuar/i }));

    // Se espera a que el paso de generales esté pintado.
    await screen.findByText(/^Fotografía en formato digital 4X4/);

    /*
     * El catálogo devuelve las 39 filas, inactivas incluidas: la administración
     * del catálogo las necesita. El asistente tiene que filtrar por `activo`, y
     * si no lo hace pide justo los dos requisitos que el área retiró.
     */
    expect(screen.queryByText(/Certificados de trabajo/i)).toBeNull();
    expect(screen.queryByText(/RC-IVA/i)).toBeNull();

    // Y siguen siendo dieciséis: ni uno más, ni uno menos.
    expect(screen.getAllByRole("button", { name: "Entregado" }).length).toBe(16);
  });

  it("auditoría añade solo la declaración de impedimento", async () => {
    const usuario = userEvent.setup();
    const creado = vi.fn();

    render(<AltaExpedienteWizard abierta onCerrar={() => {}} onCreado={creado} onError={() => {}} />);
    await usuario.type(screen.getByPlaceholderText("Por ejemplo 1234567 o 1234567-1A"), "7654321 - 9 - 2026");
    await usuario.type(screen.getByPlaceholderText("Nombres y apellidos"), "Aldo Auditor");
    await usuario.click(screen.getByRole("button", { name: /Continuar/i }));
    await usuario.click(screen.getByRole("button", { name: /Continuar/i })); // generales
    await usuario.click(await screen.findByRole("button", { name: /Funcionario área auditoría/i }));
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
});

