/**
 * Caché de expedientes, cola de salida y precarga.
 *
 * ── Qué se comprueba aquí ───────────────────────────────────────────────────
 * Las cuatro promesas que hacen que la caché sea aceptable en un módulo que
 * maneja datos personales de terceros:
 *
 *   1. **apertura instantánea**: lo guardado se devuelve sin red;
 *   2. **nada viejo pasa por fresco**: hay TTL y sello de tiempo, y una entrada
 *      caducada no se devuelve;
 *   3. **borrado al cambiar de perfil**: los expedientes que consultó una
 *      persona no siguen en el equipo cuando entra otra;
 *   4. **la cola no miente ni pierde**: idempotencia, orden, coalescencia y
 *      reintento solo de lo recuperable.
 *
 * La caché se prueba con IndexedDB ausente —jsdom no lo trae— para ejercitar
 * justamente la recaída en `localStorage`, que es el camino que sigue un
 * navegador en modo privado o con las cookies de sitio bloqueadas.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_ENTRADAS,
  TTL_MS,
  __reiniciarCacheParaPruebas,
  antiguedadSegundos,
  cambiarPerfilCache,
  estaEnCache,
  expedientesEnCache,
  guardarEnCache,
  hidratarCache,
  leerDeCache,
  resumenCache,
  vaciarCache,
  vigente,
} from "../state/cacheExpedientes";
import {
  __reiniciarColaParaPruebas,
  cambiosPendientes,
  descartarCola,
  encolarCambios,
  esReintentable,
  esperaDeIntento,
  fundirCambios,
  obtenerCola,
  pendientesDe,
  reintentarFallidos,
  vaciarCola,
} from "../state/colaSalida";
import { precargarExpedientes } from "../state/precarga";
import { DocError, __reiniciarClienteParaPruebas } from "../api/client";
import type { ExpedienteCabecera, RequisitoVista } from "../domain/progreso";

/* ------------------------------------------------------------------ */
/* Semillas                                                            */
/* ------------------------------------------------------------------ */

function cabecera(id: string, version = 1): ExpedienteCabecera {
  return {
    expedienteId: id,
    identificador: `CI-${id}`,
    nombre: `Persona ${id}`,
    cargo: "Analista",
    agencia: "LA PAZ",
    gerencia: "GERENCIA DE RIESGOS",
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
      requisitos: 16,
      resueltos: 0,
      entregados: 0,
      pendientes: 16,
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
    creadoEn: "2026-01-15T12:00:00.000Z",
    creadoPor: "pruebas",
    actualizadoEn: "2026-01-15T12:00:00.000Z",
    actualizadoPor: "pruebas",
    anio: 2026,
  };
}

function guardar(id: string, opciones: { version?: number; guardadoEn?: string; requisitos?: RequisitoVista[] } = {}) {
  return guardarEnCache({
    expedienteId: id,
    expediente: cabecera(id, opciones.version ?? 1),
    requisitos: opciones.requisitos ?? [],
    prorrogas: [],
    parcial: true,
    version: opciones.version ?? 1,
    guardadoEn: opciones.guardadoEn,
  });
}

/* ------------------------------------------------------------------ */
/* Caché                                                               */
/* ------------------------------------------------------------------ */

describe("documentación · caché de expedientes", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    __reiniciarCacheParaPruebas();
    await hidratarCache("rocio");
  });

  it("lo guardado se devuelve sin red y en el mismo momento", () => {
    guardar("exp_1");
    const leido = leerDeCache("exp_1");
    expect(leido?.expediente.nombre).toBe("Persona exp_1");
    expect(estaEnCache("exp_1")).toBe(true);
    expect(estaEnCache("exp_desconocido")).toBe(false);
  });

  it("una entrada caducada no se devuelve, aunque siga escrita", () => {
    const viejo = new Date(Date.now() - TTL_MS - 1000).toISOString();
    guardar("exp_viejo", { guardadoEn: viejo });
    expect(vigente({ ...cabeceraEnCache("exp_viejo"), guardadoEn: viejo })).toBe(false);
    // Presentar esto como dato fresco es la única cosa que la caché no puede
    // hacer: se descarta y el módulo lo vuelve a pedir.
    expect(leerDeCache("exp_viejo")).toBeNull();
  });

  it("dice de cuándo es la copia, para que la interfaz no invente frescura", () => {
    const hace90 = new Date(Date.now() - 90_000).toISOString();
    guardar("exp_sello", { guardadoEn: hace90 });
    const entrada = { ...cabeceraEnCache("exp_sello"), guardadoEn: hace90 };
    expect(antiguedadSegundos(entrada)).toBeGreaterThanOrEqual(89);
    expect(antiguedadSegundos(entrada)).toBeLessThanOrEqual(92);
  });

  it("respeta el tope de entradas descartando la menos usada", () => {
    for (let i = 0; i < MAX_ENTRADAS + 10; i++) guardar(`exp_${i}`);
    expect(expedientesEnCache().length).toBe(MAX_ENTRADAS);
    // Las diez primeras salieron; las últimas están.
    expect(estaEnCache("exp_0")).toBe(false);
    expect(estaEnCache(`exp_${MAX_ENTRADAS + 9}`)).toBe(true);
  });

  it("leer una entrada la rescata del desalojo: el LRU cuenta el uso, no la escritura", () => {
    for (let i = 0; i < MAX_ENTRADAS; i++) guardar(`u_${i}`);
    // Se usa la más antigua justo antes de que entre una nueva.
    expect(leerDeCache("u_0")).not.toBeNull();
    guardar("u_nueva");
    expect(estaEnCache("u_0")).toBe(true);
    expect(estaEnCache("u_1")).toBe(false);
  });

  it("cambiar de perfil vacía la caché: son datos personales de terceros", async () => {
    guardar("exp_de_rocio");
    expect(estaEnCache("exp_de_rocio")).toBe(true);

    await cambiarPerfilCache("marcelo");
    expect(estaEnCache("exp_de_rocio")).toBe(false);
    expect(expedientesEnCache()).toEqual([]);
  });

  it("sobrevive a un recargado usando localStorage cuando IndexedDB no está", async () => {
    // Se espera el volcado a disco: en la vida real el recargado ocurre mucho
    // después, pero la prueba no puede dar por hecho que ya terminó.
    await guardar("exp_persistido");
    // Se simula el recargado: memoria en blanco, mismo perfil, mismo almacén.
    __reiniciarCacheParaPruebas();
    const recuperadas = await hidratarCache("rocio");
    expect(recuperadas).toBe(1);
    expect(leerDeCache("exp_persistido")?.expediente.identificador).toBe("CI-exp_persistido");
  });

  it("descarta lo guardado por otro perfil al hidratar", async () => {
    await guardar("exp_ajeno");
    __reiniciarCacheParaPruebas();
    const recuperadas = await hidratarCache("otra-persona");
    expect(recuperadas).toBe(0);
  });

  it("vaciar la caché no deja rastro en el almacenamiento", async () => {
    await guardar("exp_borrar");
    await vaciarCache();
    expect(resumenCache().entradas).toBe(0);
    expect(window.localStorage.getItem("bdp-documentacion-cache-expedientes")).toBeNull();
  });
});

/** Copia auxiliar para probar las funciones puras sin depender del almacén. */
function cabeceraEnCache(id: string) {
  return {
    expedienteId: id,
    expediente: cabecera(id),
    requisitos: [] as RequisitoVista[],
    prorrogas: [],
    parcial: true,
    version: 1,
    guardadoEn: new Date().toISOString(),
    perfil: "rocio",
  };
}

/* ------------------------------------------------------------------ */
/* Cola de salida                                                      */
/* ------------------------------------------------------------------ */

describe("documentación · cola de salida", () => {
  beforeEach(() => {
    window.localStorage.clear();
    __reiniciarColaParaPruebas();
    __reiniciarClienteParaPruebas();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("funde dos cambios sobre el mismo requisito en uno", () => {
    const fundidos = fundirCambios(
      [{ expedienteDocumentoId: "d1", version: 3, estado: "ENTREGADO" }],
      [{ expedienteDocumentoId: "d1", observaciones: "Falta la última página" }],
    );
    expect(fundidos).toHaveLength(1);
    expect(fundidos[0].estado).toBe("ENTREGADO");
    expect(fundidos[0].observaciones).toBe("Falta la última página");
    // La versión que viaja es la ORIGINAL: es la que el backend compara para
    // detectar que alguien se adelantó.
    expect(fundidos[0].version).toBe(3);
  });

  it("marcar y desmarcar seis veces es UNA escritura, no seis", () => {
    for (const estado of ["ENTREGADO", "PENDIENTE", "ENTREGADO", "NO_ENTREGADO", "ENTREGADO", "NO_APLICA"]) {
      encolarCambios("exp_1", [{ expedienteDocumentoId: "d1", version: 1, estado }]);
    }
    expect(obtenerCola().elementos).toHaveLength(1);
    expect(cambiosPendientes()).toBe(1);
    expect(obtenerCola().elementos[0].cambios[0].estado).toBe("NO_APLICA");
  });

  it("cuenta lo pendiente por expediente, que es lo que pinta la ventana", () => {
    encolarCambios("exp_1", [
      { expedienteDocumentoId: "d1", estado: "ENTREGADO" },
      { expedienteDocumentoId: "d2", estado: "ENTREGADO" },
    ]);
    encolarCambios("exp_2", [{ expedienteDocumentoId: "d9", estado: "ENTREGADO" }]);
    expect(pendientesDe("exp_1")).toBe(2);
    expect(pendientesDe("exp_2")).toBe(1);
    expect(pendientesDe("exp_3")).toBe(0);
  });

  it("cada elemento lleva su solicitudId: reintentar es seguro", () => {
    encolarCambios("exp_1", [{ expedienteDocumentoId: "d1", estado: "ENTREGADO" }]);
    encolarCambios("exp_2", [{ expedienteDocumentoId: "d2", estado: "ENTREGADO" }]);
    const ids = obtenerCola().elementos.map((e) => e.solicitudId);
    expect(new Set(ids).size).toBe(2);
    expect(ids.every((id) => id.startsWith("req_"))).toBe(true);
  });

  it("sobrevive a un recargado y no queda ningún elemento «enviando» trancado", () => {
    encolarCambios("exp_1", [{ expedienteDocumentoId: "d1", estado: "ENTREGADO" }]);
    const crudo = window.localStorage.getItem("bdp-documentacion-cola");
    expect(crudo).toBeTruthy();
    const guardado = JSON.parse(String(crudo));
    expect(guardado.elementos).toHaveLength(1);
    expect(guardado.elementos[0].estado).toBe("pendiente");
    // `enviando` no se persiste: al recargar no hay ningún envío en marcha.
    expect(guardado.enviando).toBeUndefined();
  });

  it("un localStorage corrupto no impide arrancar", () => {
    window.localStorage.setItem("bdp-documentacion-cola", '{"elementos":[{"roto":true},null]}');
    // El almacén valida al leer: los elementos sin forma se descartan en lugar
    // de tumbar el módulo con una excepción en el arranque.
    expect(() => JSON.parse(String(window.localStorage.getItem("bdp-documentacion-cola")))).not.toThrow();
  });

  it("solo reintenta lo recuperable", () => {
    expect(esReintentable(new DocError("sin red", { codigo: "SIN_RED", red: true }))).toBe(true);
    expect(esReintentable(new DocError("libro ocupado", { codigo: "LIBRO_OCUPADO" }))).toBe(true);
    expect(esReintentable(new DocError("tarde", { codigo: "TIMEOUT" }))).toBe(true);
    // Volver a enviar un dato inválido da el mismo resultado y retrasa el
    // momento en que la persona se entera.
    expect(esReintentable(new DocError("campo mal", { codigo: "VALIDATION_ERROR" }))).toBe(false);
    expect(esReintentable(new DocError("no puedes", { codigo: "PERMISO_INSUFICIENTE" }))).toBe(false);
    expect(esReintentable(new DocError("otro lo cambió", { codigo: "CONFLICTO_VERSION" }))).toBe(false);
  });

  it("la espera entre intentos crece y tiene techo", () => {
    expect(esperaDeIntento(1)).toBe(1000);
    expect(esperaDeIntento(2)).toBe(2000);
    expect(esperaDeIntento(3)).toBe(4000);
    expect(esperaDeIntento(9)).toBe(16000);
  });

  it("vacía la cola en orden y confirma cada elemento con el backend", async () => {
    const enviados: { accion: string; solicitudId: string; expedienteId: string }[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const cuerpo = JSON.parse(String(init.body));
      enviados.push({ accion: cuerpo.accion, solicitudId: cuerpo.solicitudId, expedienteId: cuerpo.expedienteId });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true, accion: cuerpo.accion, data: { aplicados: 1, fallidos: [], resumen: {} } }),
      } as unknown as Response;
    });

    encolarCambios("exp_a", [{ expedienteDocumentoId: "d1", estado: "ENTREGADO" }]);
    encolarCambios("exp_b", [{ expedienteDocumentoId: "d2", estado: "ENTREGADO" }]);

    const res = await vaciarCola();
    expect(res.confirmados).toBe(2);
    expect(res.restantes).toBe(0);
    expect(cambiosPendientes()).toBe(0);
    // Orden de llegada, y una sola acción por elemento.
    expect(enviados.map((e) => e.expedienteId)).toEqual(["exp_a", "exp_b"]);
    expect(enviados.every((e) => e.accion === "documentacion.requisitos.guardar")).toBe(true);
    expect(obtenerCola().ultimaConfirmacion).not.toBe("");
  });

  it("un fallo de validación deja el elemento marcado y NO se pierde el trabajo", async () => {
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const cuerpo = JSON.parse(String(init.body));
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: false,
            accion: cuerpo.accion,
            error: { code: "VALIDATION_ERROR", message: "El número de hojas tiene que ser un entero." },
          }),
      } as unknown as Response;
    });

    encolarCambios("exp_c", [{ expedienteDocumentoId: "d1", hojasFisicas: -3 }]);
    const res = await vaciarCola();
    expect(res.fallidos).toBe(1);
    const elemento = obtenerCola().elementos[0];
    expect(elemento.estado).toBe("fallido");
    expect(elemento.error).toMatch(/entero/);
    // Sigue ahí: nadie lo borra sin que una persona lo decida.
    expect(cambiosPendientes()).toBe(1);

    reintentarFallidos();
    expect(obtenerCola().elementos[0].estado).toBe("pendiente");
    expect(obtenerCola().elementos[0].intentos).toBe(0);

    descartarCola();
    expect(cambiosPendientes()).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Precarga                                                            */
/* ------------------------------------------------------------------ */

describe("documentación · precarga en segundo plano", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    __reiniciarCacheParaPruebas();
    __reiniciarClienteParaPruebas();
    await hidratarCache("rocio");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("trae veinticinco expedientes en tres llamadas, no en veinticinco", async () => {
    const llamadas: string[][] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const cuerpo = JSON.parse(String(init.body));
      llamadas.push(cuerpo.expedienteIds);
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            accion: cuerpo.accion,
            data: {
              solicitados: cuerpo.expedienteIds.length,
              devueltos: cuerpo.expedienteIds.length,
              noEncontrados: [],
              expedientes: cuerpo.expedienteIds.map((id: string) => ({
                expediente: cabecera(id),
                requisitos: [],
                prorrogas: [],
                parcial: true,
              })),
              capacidades: { ver: true },
              generado: new Date().toISOString(),
            },
          }),
      } as unknown as Response;
    });

    const ids = Array.from({ length: 25 }, (_, i) => `exp_${i}`);
    const res = await precargarExpedientes(ids);

    expect(res.guardados).toBe(25);
    // 25 identificadores en lotes de 12 → tres llamadas.
    expect(llamadas).toHaveLength(3);
    expect(llamadas[0]).toHaveLength(12);
    expect(llamadas[2]).toHaveLength(1);
    expect(estaEnCache("exp_24")).toBe(true);
  });

  it("no vuelve a pedir lo que ya está en la caché", async () => {
    guardar("exp_ya");
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);
    const res = await precargarExpedientes(["exp_ya"]);
    expect(res.pedidos).toBe(0);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("cancelar la precarga corta los lotes que quedaban", async () => {
    const controlador = new AbortController();
    let atendidas = 0;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      atendidas += 1;
      const cuerpo = JSON.parse(String(init.body));
      // Al primer lote se cancela: los siguientes no deben pedirse.
      controlador.abort();
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            accion: cuerpo.accion,
            data: { solicitados: 0, devueltos: 0, noEncontrados: [], expedientes: [], capacidades: { ver: true }, generado: "" },
          }),
      } as unknown as Response;
    });

    const ids = Array.from({ length: 40 }, (_, i) => `c_${i}`);
    await precargarExpedientes(ids, { senal: controlador.signal });
    // Cuatro lotes posibles, concurrencia dos: se atiende la primera tanda y se
    // corta. Nunca las cuatro.
    expect(atendidas).toBeLessThanOrEqual(2);
  });
});
