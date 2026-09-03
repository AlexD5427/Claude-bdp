import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExpedienteOperativo } from "../api/acciones";
import {
  __reiniciarCacheParaPruebas,
  VERSION_CACHE,
  estaEnCache,
  expedientesEnCache,
  guardarEnCache,
  leerDeCache,
  reconciliar,
  tamanoCache,
  vaciarCache,
} from "../state/cacheExpedientes";
import {
  __reiniciarSalidaParaPruebas,
  bombearSalida,
  descartarEntrada,
  encolarRequisitos,
  enviarEntrada,
  obtenerSalida,
  pendientesDeSincronizar,
  reintentarTodo,
  reponerEntrada,
  type EntradaSalida,
} from "../state/salida";
import {
  __reiniciarFluidezParaPruebas,
  normalizarPreferencias,
  COLUMNAS_LISTA,
  modoLigeroActivo,
} from "../state/preferencias";

/**
 * Caché, cola de salida y preferencias: la parte del módulo que aguanta cuando
 * algo falla.
 *
 * ── Qué se está probando, en una frase por área ─────────────────────────────
 * · **Caché**: abrir un expediente ya visto es instantáneo, la copia nunca se
 *   presenta como fresca, el conflicto de versión se detecta y todo se borra al
 *   cambiar de perfil (son datos personales).
 * · **Cola de salida**: un guardado que falla no se pierde, se reintenta, es
 *   idempotente, se agrupa cuando toca y NUNCA se dice «guardado» sin
 *   confirmación real del backend.
 * · **Preferencias**: un `localStorage` editado a mano no puede dejar el módulo
 *   en un estado imposible.
 */

/** Expediente mínimo con la forma que la caché espera. */
function expediente(id: string, version = 1, requisitos = 2): ExpedienteOperativo {
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
        requisitos,
        resueltos: 0,
        entregados: 0,
        pendientes: requisitos,
        noEntregados: 0,
        noAplica: 0,
        observados: 0,
        prorrogas: 0,
        prorrogasVencidas: 0,
      },
      proximaFechaCritica: "",
      diasParaFechaCritica: null,
      version,
      estadoOperacion: "ACTIVO",
      creadoEn: "2026-01-15T10:00:00.000Z",
      creadoPor: "auxiliar@bdp.com",
      actualizadoEn: "2026-01-15T10:00:00.000Z",
      actualizadoPor: "auxiliar@bdp.com",
      anio: 2026,
    },
    requisitos: Array.from({ length: requisitos }, (_, i) => ({
      expedienteDocumentoId: `${id}-req-${i}`,
      codigo: `doc-${i}`,
      nombre: `Documento ${i}`,
      descripcion: "",
      subseccion: "",
      grupo: "personal",
      orden: (i + 1) * 10,
      seccion: "generales",
      estado: "PENDIENTE" as const,
      observaciones: "",
      hojasFisicas: 0,
      presentacionFisica: "NO" as const,
      presentacionDigital: "SI" as const,
      requiereConteoHojas: false,
      heredado: false,
      obligatorio: true,
      permiteNoAplica: false,
      permiteProrroga: false,
      estadoRevision: "SIN_REVISION",
      revisionActualId: "",
      aprobacionActualId: "",
      requiereRevision: false,
      requiereAprobacion: false,
      version: 1,
      archivado: false,
      prorrogas: [],
      actualizadoEn: "",
      actualizadoPor: "",
    })),
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

describe("caché de expedientes · apertura instantánea con revalidación", () => {
  beforeEach(() => {
    __reiniciarCacheParaPruebas();
    window.localStorage.clear();
  });

  it("lo guardado se lee sin tocar la red y en el mismo instante", () => {
    guardarEnCache(expediente("A"));
    expect(estaEnCache("A")).toBe(true);
    const lectura = leerDeCache("A");
    expect(lectura).not.toBeNull();
    expect(lectura!.entrada.detalle.expediente.nombre).toBe("Persona A");
    // Recién guardada: se puede mostrar sin revalidar de inmediato.
    expect(lectura!.fresca).toBe(true);
    expect(lectura!.edadMs).toBeLessThan(1000);
  });

  it("una copia con más de un minuto deja de ser fresca, pero sigue sirviendo", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-03-01T10:00:00.000Z"));
      guardarEnCache(expediente("B"));
      // Dos minutos después: se muestra igual —sin conexión es lo único que
      // hay— pero marcada, para que la interfaz diga su antigüedad.
      vi.setSystemTime(new Date("2026-03-01T10:02:00.000Z"));
      const lectura = leerDeCache("B");
      expect(lectura!.fresca).toBe(false);
      expect(lectura!.util).toBe(true);
      expect(Math.round(lectura!.edadMs / 1000)).toBe(120);
    } finally {
      vi.useRealTimers();
    }
  });

  it("una copia de más de un día se descarta al leerla", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-03-01T10:00:00.000Z"));
      guardarEnCache(expediente("C"));
      vi.setSystemTime(new Date("2026-03-03T10:00:00.000Z"));
      expect(leerDeCache("C")).toBeNull();
      // Y se saca de memoria: no se queda ocupando sitio ni conservando datos
      // personales de hace dos días.
      expect(estaEnCache("C")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("detecta que alguien se adelantó comparando la versión", () => {
    guardarEnCache(expediente("D", 3));
    const igual = reconciliar(expediente("D", 3));
    expect(igual.resultado).toBe("igual");

    const adelantada = reconciliar(expediente("D", 5));
    expect(adelantada.resultado).toBe("adelantada");
    expect(adelantada.versionAnterior).toBe(3);
    expect(adelantada.versionNueva).toBe(5);
    // Y lo que queda guardado es la versión nueva, no la vieja.
    expect(leerDeCache("D")!.entrada.version).toBe(5);
  });

  /**
   * Este caso es el que puso en evidencia que comparar solo la versión de la
   * cabecera no servía.
   *
   * Marcar un documento como entregado o escribir una observación bumpea la
   * versión del REQUISITO, no la del expediente. Con la comparación original, el
   * aviso «otra persona modificó este expediente» estaba correctamente
   * programado y no se disparaba nunca en el caso que ocurre todos los días.
   */
  it("también detecta el cambio cuando lo que se movió fue un requisito, no la cabecera", () => {
    guardarEnCache(expediente("D2", 4));

    const conRequisitoTocado = expediente("D2", 4);
    conRequisitoTocado.requisitos[0] = { ...conRequisitoTocado.requisitos[0], version: 2, estado: "ENTREGADO" };

    const res = reconciliar(conRequisitoTocado);
    expect(res.resultado).toBe("adelantada");
    // La versión de la cabecera NO cambió, y eso es exactamente el punto.
    expect(res.versionAnterior).toBe(4);
    expect(res.versionNueva).toBe(4);
  });

  it("la primera vez informa de que es nueva, no de un conflicto", () => {
    const res = reconciliar(expediente("E", 2));
    expect(res.resultado).toBe("nueva");
    expect(res.versionAnterior).toBe(0);
  });

  it("desaloja las entradas más antiguas al pasar del tope", () => {
    for (let i = 0; i < 45; i++) guardarEnCache(expediente(`X${i}`));
    expect(tamanoCache()).toBeLessThanOrEqual(40);
    // Lo último guardado sigue; lo primero ya no.
    expect(estaEnCache("X44")).toBe(true);
    expect(estaEnCache("X0")).toBe(false);
  });

  it("leer un expediente lo convierte en reciente para el desalojo", () => {
    for (let i = 0; i < 40; i++) guardarEnCache(expediente(`Y${i}`));
    // Se lee el más antiguo: pasa al final de la cola.
    expect(leerDeCache("Y0")).not.toBeNull();
    guardarEnCache(expediente("Y-nuevo"));
    expect(estaEnCache("Y0")).toBe(true);
    expect(estaEnCache("Y1")).toBe(false);
  });

  it("vaciar la caché borra todo: es lo que ocurre al cambiar de perfil", async () => {
    guardarEnCache(expediente("F"));
    guardarEnCache(expediente("G"));
    expect(expedientesEnCache()).toHaveLength(2);
    await vaciarCache();
    expect(tamanoCache()).toBe(0);
    expect(leerDeCache("F")).toBeNull();
  });

  it("la versión del esquema está declarada y se sella en cada entrada", () => {
    /* Es lo que impide que una entrada escrita por la versión anterior pinte una
       pantalla a la que le faltan campos, que se ve como un módulo roto. */
    const entrada = guardarEnCache(expediente("H"));
    expect(entrada.esquema).toBe(VERSION_CACHE);
    expect(VERSION_CACHE).toBeGreaterThan(0);
  });
});

describe("cola de salida · el guardado no miente", () => {
  beforeEach(() => {
    __reiniciarSalidaParaPruebas();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __reiniciarSalidaParaPruebas();
  });

  /** Sustituye el cliente por uno que responde lo que se le diga. */
  function fingirBackend(respuesta: () => Promise<unknown>) {
    return vi.spyOn(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any),
      "fetch" as never,
    ).mockImplementation(respuesta as never);
  }

  it("encola con su identificador de solicitud y lo conserva entre reintentos", async () => {
    let cuerpos: Record<string, unknown>[] = [];
    fingirBackend(async (...args: unknown[]) => {
      const init = args[1] as RequestInit;
      cuerpos.push(JSON.parse(String(init.body)));
      // Primera vez falla con un error de red (recuperable), luego responde bien.
      if (cuerpos.length === 1) throw new Error("network down");
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, accion: "x", data: { aplicados: 1, fallidos: [] } }) } as never;
    });

    const id = encolarRequisitos("exp-1", [{ expedienteDocumentoId: "r1", estado: "ENTREGADO" }], "1 cambio");
    const primero = await enviarEntrada(id);
    expect(primero.confirmado).toBe(false);
    // El primer intento falló: sigue pendiente y NO se dijo «guardado».
    expect(pendientesDeSincronizar()).toBe(1);
    expect(obtenerSalida().entradas[0].estado).toBe("pendiente");
    const solicitudId = obtenerSalida().entradas[0].solicitudId;

    reintentarTodo();
    await bombearSalida();
    await vi.waitFor(() => expect(pendientesDeSincronizar()).toBe(0));

    // Mismo identificador de solicitud en los dos intentos: el backend reconoce
    // la repetición y no aplica el cambio dos veces.
    expect(cuerpos.length).toBeGreaterThanOrEqual(2);
    expect(cuerpos[0].solicitudId).toBe(solicitudId);
    expect(cuerpos[1].solicitudId).toBe(solicitudId);
    cuerpos = [];
  });

  it("no confirma si el backend rechazó parte del cambio", async () => {
    fingirBackend(
      async () =>
        ({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              ok: true,
              accion: "x",
              data: { aplicados: 1, fallidos: [{ indice: 1, motivo: "El requisito no admite «no aplica»." }] },
            }),
        }) as never,
    );

    const id = encolarRequisitos(
      "exp-2",
      [
        { expedienteDocumentoId: "r1", estado: "ENTREGADO" },
        { expedienteDocumentoId: "r2", estado: "NO_APLICA" },
      ],
      "2 cambios",
    );
    const res = await enviarEntrada(id);
    expect(res.confirmado).toBe(false);

    /* La llamada no lanzó excepción, pero el backend rechazó un cambio: decir
       «guardado» ahí es exactamente el guardado que miente. */
    const entrada = obtenerSalida().entradas[0];
    expect(entrada.estado).toBe("rechazado");
    expect(entrada.ultimoError).toMatch(/no aplica/i);
    expect(pendientesDeSincronizar()).toBe(2);
  });

  it("fusiona dos cambios del mismo requisito y gana el último valor", () => {
    encolarRequisitos("exp-3", [{ expedienteDocumentoId: "r1", estado: "ENTREGADO", version: 4 }], "primero");
    encolarRequisitos("exp-3", [{ expedienteDocumentoId: "r1", estado: "NO_ENTREGADO", observaciones: "No llegó" }], "segundo");

    const entradas = obtenerSalida().entradas;
    // Una sola entrada para el expediente, con un solo cambio por requisito.
    expect(entradas).toHaveLength(1);
    expect(entradas[0].cambios).toHaveLength(1);
    expect(entradas[0].cambios[0].estado).toBe("NO_ENTREGADO");
    expect(entradas[0].cambios[0].observaciones).toBe("No llegó");
    /* La versión que viaja es la de la PRIMERA edición: es la que la persona
       tenía delante al empezar, y es la que tiene que provocar el conflicto si
       alguien se adelantó. */
    expect(entradas[0].cambios[0].version).toBe(4);
  });

  it("los cambios de expedientes distintos son entradas distintas y en orden", () => {
    encolarRequisitos("exp-A", [{ expedienteDocumentoId: "a1", estado: "ENTREGADO" }], "A");
    encolarRequisitos("exp-B", [{ expedienteDocumentoId: "b1", estado: "ENTREGADO" }], "B");
    const entradas = obtenerSalida().entradas;
    expect(entradas.map((e) => e.expedienteId)).toEqual(["exp-A", "exp-B"]);
  });

  it("un rechazo sin salida se puede descartar, y se dice qué se pierde", () => {
    encolarRequisitos("exp-4", [{ expedienteDocumentoId: "r1", estado: "ENTREGADO" }], "1 cambio");
    const id = obtenerSalida().entradas[0].id;
    descartarEntrada(id);
    expect(obtenerSalida().entradas).toHaveLength(0);
  });

  it("sin conexión no se intenta enviar: se espera a que vuelva", async () => {
    const original = navigator.onLine;
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    try {
      const espia = fingirBackend(async () => ({ ok: true, status: 200, text: async () => "{}" }) as never);
      encolarRequisitos("exp-5", [{ expedienteDocumentoId: "r1", estado: "ENTREGADO" }], "1 cambio");
      await bombearSalida();
      expect(espia).not.toHaveBeenCalled();
      expect(obtenerSalida().enLinea).toBe(false);
      expect(pendientesDeSincronizar()).toBe(1);
    } finally {
      Object.defineProperty(navigator, "onLine", { value: original, configurable: true });
    }
  });

  it("lo pendiente sobrevive a un recargado", () => {
    encolarRequisitos("exp-6", [{ expedienteDocumentoId: "r1", estado: "ENTREGADO" }], "1 cambio");
    const crudo = window.localStorage.getItem("bdp-documentacion-salida");
    expect(crudo).toBeTruthy();
    const guardado = JSON.parse(String(crudo)) as { version: number; entradas: { expedienteId: string }[] };
    expect(guardado.version).toBe(2);
    expect(guardado.entradas[0].expedienteId).toBe("exp-6");
  });
});

describe("cola de salida · recuperar un borrador no duplica nada", () => {
  beforeEach(() => __reiniciarSalidaParaPruebas());

  it("reponer conserva el identificador de solicitud, que es lo que hace la operación segura", () => {
    const id = encolarRequisitos("exp-1", [{ expedienteDocumentoId: "d1", estado: "ENTREGADO" }], "Un documento");
    const original = obtenerSalida().entradas.find((e) => e.id === id)!;
    __reiniciarSalidaParaPruebas();
    expect(obtenerSalida().entradas).toHaveLength(0);

    reponerEntrada(original);
    const repuesta = obtenerSalida().entradas[0];
    /* El `solicitudId` viaja intacto: si el cambio SÍ había llegado al libro, el
       backend reconoce la solicitud y no la aplica dos veces. Sin esa garantía,
       «recuperar borrador» sería «duplicar el trabajo». */
    expect(repuesta.solicitudId).toBe(original.solicitudId);
    /* Se repone lista para salir. `reponerEntrada` bombea la cola acto seguido,
       así que aquí ya puede estar en `enviando`: lo que se fija es que NO llega
       marcada como confirmada, que sería decir que está en el libro sin que el
       libro haya dicho nada. */
    expect(repuesta.estado).not.toBe("confirmado");
    expect(repuesta.ultimoError).toBe("");
    // El identificador LOCAL sí es nuevo: es la fila de la cola, no la solicitud.
    expect(repuesta.id).not.toBe(original.id);
  });

  it("reponer dos veces la misma entrada no la duplica", () => {
    const id = encolarRequisitos("exp-2", [{ expedienteDocumentoId: "d2", estado: "ENTREGADO" }], "Otro documento");
    const original = obtenerSalida().entradas.find((e) => e.id === id)!;
    reponerEntrada(original);
    reponerEntrada(original);
    expect(obtenerSalida().entradas.filter((e) => e.solicitudId === original.solicitudId)).toHaveLength(1);
  });

  it("una entrada sin cambios o sin solicitudId se ignora", () => {
    reponerEntrada({ solicitudId: "", cambios: [] } as unknown as EntradaSalida);
    expect(obtenerSalida().entradas).toHaveLength(0);
  });
});

describe("preferencias · un localStorage editado a mano no tumba el módulo", () => {
  beforeEach(() => {
    __reiniciarFluidezParaPruebas();
  });

  it("un valor imposible se sustituye por el de fábrica", () => {
    const prefs = normalizarPreferencias({
      letra: 42,
      modoLigero: "quizás",
      orden: "por-color",
      columnas: ["inventada", "estado"],
      animaciones: "sí",
      precarga: null,
    });
    expect(prefs.letra).toBe("normal");
    expect(prefs.modoLigero).toBe("auto");
    expect(prefs.orden).toBe("reciente");
    // Se conserva la columna válida y se descarta la inventada.
    expect(prefs.columnas).toEqual(["estado"]);
    expect(prefs.animaciones).toBe(true);
    expect(prefs.precarga).toBe(true);
  });

  it("una lista de columnas vacía restaura todas", () => {
    // Una tabla sin columnas es una pantalla en blanco y nadie entiende por qué.
    expect(normalizarPreferencias({ columnas: [] }).columnas).toEqual([...COLUMNAS_LISTA]);
    expect(normalizarPreferencias({ columnas: "todas" }).columnas).toEqual([...COLUMNAS_LISTA]);
  });

  it("basura total devuelve las preferencias de fábrica", () => {
    expect(normalizarPreferencias(null).letra).toBe("normal");
    expect(normalizarPreferencias("hola").orden).toBe("reciente");
    expect(normalizarPreferencias(12345).modoLigero).toBe("auto");
  });

  it("la decisión explícita de la persona manda sobre la heurística", () => {
    const base = normalizarPreferencias({});
    expect(modoLigeroActivo({ ...base, modoLigero: "si" })).toBe(true);
    expect(modoLigeroActivo({ ...base, modoLigero: "no" })).toBe(false);
  });
});
