import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../../../context/ThemeContext";
import { PestanaEstaPantalla } from "../ui/PestanaEstaPantalla";
import { __reiniciarCacheParaPruebas, guardarEnCache, tamanoCache } from "../state/cacheExpedientes";
import { __reiniciarSalidaParaPruebas, encolarRequisitos, obtenerSalida } from "../state/salida";
import { obtenerPreferencias, restaurarPreferencias } from "../state/preferencias";
import { obtenerConsola } from "../state/consola";
import type { ExpedienteOperativo } from "../api/acciones";

/**
 * Panel de «Esta pantalla»: autodiagnóstico, cambios pendientes y preferencias.
 *
 * ── Qué se está fijando aquí ────────────────────────────────────────────────
 * Este panel existe para una persona que está en una agencia, con algo que no
 * funciona, sin consola de JavaScript y sin acceso a Apps Script. Las pruebas
 * vigilan lo que en esa situación importa:
 *
 * · **Los cinco botones hacen algo de verdad.** Un botón grande de
 *   autodiagnóstico que no diagnostica nada es peor que su ausencia: consume la
 *   confianza que hace falta para el siguiente paso.
 * · **La cola de salida se ve con nombre y motivo.** Es la parte del módulo con
 *   más capacidad de daño silencioso: un cambio que no llega al libro y nadie lo
 *   dice significa que alguien da por entregado un documento que no lo está.
 * · **Descartar avisa de qué se pierde**, con esas palabras y no con «¿seguro?».
 * · **Las preferencias escriben donde el módulo lee.** La densidad vive en
 *   `state/consola.ts` y el resto en `state/preferencias.ts`; el panel tiene que
 *   respetar ese reparto o mostrará valores que la pantalla no usa.
 */

/** Expediente mínimo, solo para que la caché tenga algo que contar. */
function expediente(id: string): ExpedienteOperativo {
  return {
    expediente: {
      expedienteId: id,
      identificador: `CI-${id}`,
      nombre: `Persona ${id}`,
      cargo: "CAJERO",
      agencia: "LA PAZ",
      gerencia: "GERENCIA DE OPERACIONES",
      fechaIngreso: "2026-01-15",
      diasDesdeIngreso: 10,
      tipoFuncionario: "GENERAL",
      tipoFuncionarioEtiqueta: "Funcionario general",
      tipoGarantia: "NINGUNA",
      tipoGarantiaEtiqueta: "Sin garantía",
      responsableId: "auxiliar@bdp.com",
      estado: "EN_RECOLECCION",
      porcentaje: 0,
      totales: {
        requisitos: 1,
        resueltos: 0,
        entregados: 0,
        pendientes: 1,
        noEntregados: 0,
        noAplica: 0,
        observados: 0,
        prorrogas: 0,
        prorrogasVencidas: 0,
      },
      proximaFechaCritica: "",
      diasParaFechaCritica: null,
      version: 1,
      estadoOperacion: "ACTIVO",
      creadoEn: "2026-01-15T10:00:00.000Z",
      creadoPor: "auxiliar@bdp.com",
      actualizadoEn: "2026-01-15T10:00:00.000Z",
      actualizadoPor: "auxiliar@bdp.com",
      anio: 2026,
    },
    requisitos: [],
    prorrogas: [],
    solicitudes: [],
    revisiones: [],
    aprobaciones: [],
    tareas: [],
    comentarios: [],
    consentimientos: [],
    historial: [],
    auditoria: [],
    resumenTextual: `Persona ${id}.`,
    capacidades: { ver: true, editar: true },
    siguientePendiente: null,
  };
}

function montar() {
  const avisar = vi.fn();
  render(
    <ThemeProvider>
      <PestanaEstaPantalla avisar={avisar} />
    </ThemeProvider>,
  );
  return { avisar };
}

describe("autodiagnóstico · cinco botones que hacen algo", () => {
  beforeEach(() => {
    __reiniciarCacheParaPruebas();
    __reiniciarSalidaParaPruebas();
    restaurarPreferencias();
    window.localStorage.clear();
  });

  it("los cinco botones están, con su explicación de qué hacen", () => {
    montar();
    for (const etiqueta of [
      "Probar conexión",
      "Volver a sincronizar",
      "Vaciar caché local",
      "Descargar respaldo",
      "Recuperar borrador",
    ]) {
      expect(screen.getByRole("button", { name: new RegExp(etiqueta) })).toBeInTheDocument();
    }
  });

  it("informa del estado real, no de un texto fijo", () => {
    guardarEnCache(expediente("A"));
    guardarEnCache(expediente("B"));
    encolarRequisitos("A", [{ expedienteDocumentoId: "d1", estado: "ENTREGADO" }], "Un documento");
    montar();

    // El recuento de la caché sale de la caché.
    expect(screen.getByText("Expedientes en caché").nextElementSibling).toHaveTextContent("2");
    expect(screen.getByText("Cambios sin confirmar").nextElementSibling).toHaveTextContent("1");
  });

  it("vaciar la caché pide confirmación y dice cuántas copias borra", async () => {
    const usuario = userEvent.setup();
    guardarEnCache(expediente("A"));
    guardarEnCache(expediente("B"));
    montar();

    await usuario.click(screen.getByRole("button", { name: /Vaciar caché local/ }));
    const dialogo = await screen.findByRole("dialog");
    /* El texto tiene que decir tres cosas: cuántas, que el libro no se toca y
       que nada se pierde. Sin eso, la reacción sensata es no pulsar. */
    expect(within(dialogo).getByText(/2 expediente\(s\)/)).toBeInTheDocument();
    expect(within(dialogo).getByText(/El libro no se toca/)).toBeInTheDocument();

    await usuario.click(within(dialogo).getByRole("button", { name: "Vaciar" }));
    await waitFor(() => expect(tamanoCache()).toBe(0));
  });

  it("«volver a sincronizar» con la cola vacía lo dice en lugar de fingir trabajo", async () => {
    const usuario = userEvent.setup();
    const { avisar } = montar();
    await usuario.click(screen.getByRole("button", { name: /Volver a sincronizar/ }));
    expect(avisar).toHaveBeenCalledWith("info", "No hay cambios en cola.", expect.any(String));
  });
});

describe("cambios pendientes · lo que no llegó al libro se ve", () => {
  beforeEach(() => {
    __reiniciarCacheParaPruebas();
    __reiniciarSalidaParaPruebas();
    window.localStorage.clear();
  });

  it("sin nada en cola no inventa una lista vacía con aspecto de error", () => {
    montar();
    expect(screen.getByText("Nada pendiente")).toBeInTheDocument();
  });

  it("cada entrada llega con su descripción y su recuento de documentos", () => {
    encolarRequisitos(
      "exp-1",
      [
        { expedienteDocumentoId: "d1", estado: "ENTREGADO" },
        { expedienteDocumentoId: "d2", estado: "NO_APLICA" },
      ],
      "Documentos generales de Ana Muñoz",
    );
    montar();
    expect(screen.getByText("Documentos generales de Ana Muñoz")).toBeInTheDocument();
    expect(screen.getByText(/2 documento\(s\)/)).toBeInTheDocument();
  });

  it("descartar dice exactamente qué se pierde antes de perderlo", async () => {
    const usuario = userEvent.setup();
    encolarRequisitos("exp-1", [{ expedienteDocumentoId: "d1", estado: "ENTREGADO" }], "Título del garante");
    const { avisar } = montar();

    await usuario.click(screen.getByRole("button", { name: /Descartar/ }));
    /* `alertdialog` y no `dialog`: la confirmación marcada como peligrosa cambia
       el rol a propósito, para que los lectores de pantalla la anuncien
       interrumpiendo en lugar de esperar turno. */
    const dialogo = await screen.findByRole("alertdialog");
    /* «NUNCA llegaron al libro» y «habrá que volver a marcarlo a mano» son la
       información que convierte un botón peligroso en una decisión informada. */
    expect(within(dialogo).getByText(/NUNCA llegaron al libro/)).toBeInTheDocument();
    expect(within(dialogo).getByText(/volver a marcarlo a mano/)).toBeInTheDocument();

    await usuario.click(within(dialogo).getByRole("button", { name: "Descartar" }));
    await waitFor(() => expect(obtenerSalida().entradas).toHaveLength(0));
    expect(avisar).toHaveBeenCalledWith("aviso", "Cambio descartado.", expect.any(String));
  });
});

describe("preferencias · escriben donde el módulo lee", () => {
  beforeEach(() => {
    restaurarPreferencias();
    window.localStorage.clear();
  });

  it("el tamaño de letra y el modo ligero van al almacén de preferencias", async () => {
    const usuario = userEvent.setup();
    montar();

    await usuario.click(screen.getByRole("radio", { name: "Grande" }));
    await waitFor(() => expect(obtenerPreferencias().letra).toBe("grande"));

    await usuario.click(screen.getByRole("radio", { name: "Siempre" }));
    await waitFor(() => expect(obtenerPreferencias().modoLigero).toBe("si"));
  });

  it("la densidad va al almacén de la consola, que es donde vivía", async () => {
    const usuario = userEvent.setup();
    montar();
    await usuario.click(screen.getByRole("radio", { name: "Compacta" }));
    /* Si esto escribiera en `preferencias`, habría dos claves persistidas para
       el mismo ajuste y la lista seguiría mostrando la densidad anterior. */
    await waitFor(() => expect(obtenerConsola().densidad).toBe("compacta"));
  });

  it("apagar una columna la quita de las preferencias sin dejar la lista sin ninguna", async () => {
    const usuario = userEvent.setup();
    montar();
    await usuario.click(screen.getByRole("switch", { name: "Observados" }));
    await waitFor(() => expect(obtenerPreferencias().columnas).not.toContain("observados"));
    // Y sigue habiendo columnas: apagarlas todas no es un estado alcanzable aquí.
    expect(obtenerPreferencias().columnas.length).toBeGreaterThan(0);
  });

  it("el orden por defecto se aplica de inmediato, no la próxima vez", async () => {
    const usuario = userEvent.setup();
    montar();
    await usuario.selectOptions(screen.getByLabelText("Orden por defecto de la lista"), "nombre");
    await waitFor(() => expect(obtenerPreferencias().orden).toBe("nombre"));
    /* Un «orden por defecto» que solo se nota al limpiar los filtros se percibe
       como un control roto. */
    await waitFor(() => expect(obtenerConsola().filtros.orden).toBe("nombre"));
  });

  it("restaurar valores de fábrica devuelve todo, no solo lo último tocado", async () => {
    const usuario = userEvent.setup();
    montar();
    await usuario.click(screen.getByRole("radio", { name: "Grande" }));
    await usuario.click(screen.getByRole("switch", { name: "Observados" }));
    await waitFor(() => expect(obtenerPreferencias().letra).toBe("grande"));

    await usuario.click(screen.getByRole("button", { name: /Restaurar valores de fábrica/ }));
    await waitFor(() => {
      expect(obtenerPreferencias().letra).toBe("normal");
      expect(obtenerPreferencias().columnas).toContain("observados");
    });
  });
});
