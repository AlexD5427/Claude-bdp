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

  it("crea un expediente comercial Tipo 1 con sus 25 requisitos, sus hojas físicas y los estados marcados", async () => {
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
    expect(detalle.requisitos.length).toBe(25);
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
    expect(detalle.requisitos.length).toBe(21);
    const codigos = detalle.requisitos.map((r: { codigo: string }) => r.codigo);
    expect(codigos).toContain("impedimento-auditor");
    expect(codigos).not.toContain("lgi-ft");
  });

  /**
   * El área administrativa salta el paso de requisitos específicos.
   *
   * Es el camino que pidió el área: elegir la categoría y pasar directamente a
   * la revisión. La prueba comprueba las tres cosas que lo hacen cierto: el
   * indicador dice «Paso 3 de 4», el aviso lo anuncia antes de pulsar, y
   * «Continuar» aterriza en la revisión.
   */
  it("el área administrativa pasa de la categoría directo a la revisión", async () => {
    const usuario = userEvent.setup();
    const creado = vi.fn();
    const err = vi.fn();

    render(<AltaExpedienteWizard abierta onCerrar={() => {}} onCreado={creado} onError={err} />);
    await usuario.type(screen.getByPlaceholderText("Ej. 1234567 1K"), "5551234 AD");
    await usuario.type(screen.getByPlaceholderText("Nombres y apellidos"), "Adela Administrativa");
    await usuario.click(screen.getByRole("button", { name: /Continuar/i }));

    // Con cinco pasos todavía: la rama no está elegida.
    expect(screen.getByText(/Paso 2 de 5/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: /Continuar/i }));

    await usuario.click(await screen.findByRole("radio", { name: /Funcionario área administrativa/i }));

    // El camino se acorta en el momento de elegir, y se dice en voz alta.
    expect(await screen.findByText(/Paso 3 de 4/)).toBeInTheDocument();
    expect(screen.getByText(/no pide documentación adicional/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Revisar requisitos de la categoría/i })).toBeNull();

    await usuario.click(screen.getByRole("button", { name: /Continuar/i }));

    // Y el siguiente paso es la revisión, no una pantalla vacía de requisitos.
    await screen.findByRole("button", { name: /Guardar y abrir expediente/i });
    expect(screen.getByText(/Paso 4 de 4/)).toBeInTheDocument();
    expect(screen.queryByText(/documentos? propios? de esta categoría/i)).toBeNull();

    await usuario.click(screen.getByRole("button", { name: /Guardar y abrir expediente/i }));
    await waitFor(() => expect(creado).toHaveBeenCalled());
    expect(err).not.toHaveBeenCalled();

    const detalle = harness.ok("documentacion.expediente.obtener", { identificador: "5551234 AD" });
    expect(detalle.expediente.tipoFuncionario).toBe("ADMINISTRATIVO");
    expect(detalle.expediente.tipoGarantia).toBe("NINGUNA");
    // Exactamente los generales: ni uno más.
    expect(detalle.requisitos.length).toBe(20);
    const codigos = detalle.requisitos.map((r: { codigo: string }) => r.codigo);
    expect(codigos).not.toContain("impedimento-auditor");
    expect(codigos).not.toContain("garante-inmueble");
    expect(codigos).toContain("manual-funciones");
  });

  /**
   * «Otros»: nombre libre, presentación elegible y conteo que aparece y se va.
   *
   * Es la prueba del requisito personalizable de punta a punta: lo que se
   * escribe en la pantalla es lo que queda en el libro, y el contador de hojas
   * obedece a la presentación elegida en lugar de al catálogo.
   */
  it("«Otros» guarda el nombre escrito y la presentación elegida", async () => {
    const usuario = userEvent.setup();
    const creado = vi.fn();
    const err = vi.fn();

    render(<AltaExpedienteWizard abierta onCerrar={() => {}} onCreado={creado} onError={err} />);
    await usuario.type(screen.getByPlaceholderText("Ej. 1234567 1K"), "9990001 OT");
    await usuario.type(screen.getByPlaceholderText("Nombres y apellidos"), "Otilia Otros");
    await usuario.click(screen.getByRole("button", { name: /Continuar/i }));

    const campo = await screen.findByLabelText("Nombre del documento");
    const fila = campo.closest("li")!;

    // Nace «no aplica» para no arrastrar un pendiente eterno, y el campo de
    // nombre está disponible igual: es la puerta de entrada del requisito.
    expect(within(fila).getByRole("button", { name: "No aplica" })).toHaveAttribute("aria-pressed", "true");
    expect(campo).not.toBeDisabled();

    // Escribir el nombre lo pone en uso: pasa a pendiente solo.
    await usuario.type(campo, "Certificación del Colegio de Auditores");
    await waitFor(() =>
      expect(within(fila).getByRole("button", { name: "Pendiente" })).toHaveAttribute("aria-pressed", "true"),
    );

    // Por defecto AMBOS, y con AMBOS el contador está visible.
    expect(within(fila).getByRole("radio", { name: "Ambos" })).toHaveAttribute("aria-checked", "true");
    expect(within(fila).getByLabelText(/Hojas del documento físico/i)).toBeInTheDocument();

    // Digital ⇒ el contador se retira del ÁRBOL, no solo de la vista: un campo
    // invisible seguiría siendo tabulable y seguiría leyéndose.
    await usuario.click(within(fila).getByRole("radio", { name: "Digital" }));
    await waitFor(() => expect(within(fila).queryByLabelText(/Hojas del documento físico/i)).toBeNull());

    // Físico ⇒ vuelve.
    await usuario.click(within(fila).getByRole("radio", { name: "Físico" }));
    const contador = await within(fila).findByLabelText(/Hojas del documento físico/i);

    await usuario.clear(contador);
    await usuario.type(contador, "4");
    await usuario.click(within(fila).getByRole("button", { name: "Entregado" }));

    await usuario.click(screen.getByRole("button", { name: /Continuar/i }));
    await usuario.click(await screen.findByRole("radio", { name: /Funcionario área administrativa/i }));
    await usuario.click(screen.getByRole("button", { name: /Continuar/i }));
    await usuario.click(await screen.findByRole("button", { name: /Guardar y abrir expediente/i }));

    await waitFor(() => expect(creado).toHaveBeenCalled());
    expect(err).not.toHaveBeenCalled();

    const detalle = harness.ok("documentacion.expediente.obtener", { identificador: "9990001 OT" });
    const otros = detalle.requisitos.find((r: { codigo: string }) => r.codigo === "otros-documento");
    expect(otros.nombre).toBe("Certificación del Colegio de Auditores");
    expect(otros.nombrePersonalizado).toBe("Certificación del Colegio de Auditores");
    expect(otros.estado).toBe("ENTREGADO");
    expect(otros.presentacionFisica).toBe("SI");
    expect(otros.presentacionDigital).toBe("NO");
    expect(otros.requiereConteoHojas).toBe(true);
    expect(otros.hojasFisicas).toBe(4);
    expect(otros.permiteNombreLibre).toBe(true);
    expect(otros.presentacionEditable).toBe(true);
  });
});

