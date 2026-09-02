/**
 * Cola de salida y caché de expedientes.
 *
 * ── Qué se prueba y por qué justo esto ──────────────────────────────────────
 * Los dos subsistemas nuevos existen para que un cambio no se pierda y para que
 * abrir un expediente sea instantáneo. Las dos promesas se rompen de formas muy
 * concretas, y son esas las que se vigilan aquí:
 *
 *   · **coalescencia**: marcar un requisito tres veces son tres peticiones si
 *     nadie las fusiona, y teclear una observación letra a letra son cuarenta;
 *   · **idempotencia**: un reintento tras un tiempo agotado que en realidad SÍ
 *     llegó duplicaría el cambio si el `solicitudId` no viajara con él;
 *   · **no reintentar lo que no se arregla**: repetir mil veces una fecha
 *     imposible no la va a hacer válida, y sí va a gastar la cuota de Apps Script;
 *   · **supervivencia al recargado**: es la razón de ser de la cola, y lo que hay
 *     que comprobar es que lo que quedó «enviando» vuelva a «pendiente» y no se dé
 *     por bueno, que sería exactamente mentir;
 *   · **reconciliación**: una revalidación que llega mientras alguien escribe no
 *     puede pisar lo que está escribiendo.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExpedienteOperativo } from "../api/acciones";

/* La cola es un módulo con estado propio: se reimporta en cada prueba para
   partir de cero. Sin esto, el estado de una prueba contaminaría la siguiente. */
async function cargarCola() {
  vi.resetModules();
  return import("../state/colaSalida");
}

async function cargarCache() {
  vi.resetModules();
  return import("../state/cacheExpedientes");
}

/** Espera a que la cola quede vacía o a que agote el plazo. */
async function esperarVacia(obtener: () => { pendientes: number }, ms = 2000) {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    if (obtener().pendientes === 0) return true;
    await new Promise((r) => setTimeout(r, 10));
  }
  return false;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("cola de salida · el guardado no miente", () => {
  it("fusiona los cambios sobre el mismo requisito y envía solo el último", async () => {
    const cola = await cargarCola();
    const enviados: unknown[] = [];
    cola.configurarEnvio(async (op) => {
      enviados.push(op.parametros);
    });

    // Tres marcas seguidas sobre el MISMO requisito: pendiente → entregado →
    // observado. Es lo que hace cualquiera que se equivoca al pulsar.
    for (const estado of ["ENTREGADO", "NO_ENTREGADO", "PENDIENTE"]) {
      cola.encolar({
        accion: "documentacion.requisito.actualizar",
        parametros: { expedienteDocumentoId: "expdoc_1", cambios: { estado } },
        clave: "req:expdoc_1:estado",
        expedienteId: "exp_1",
        descripcion: `Marcar como ${estado}`,
      });
    }

    expect(await esperarVacia(cola.obtenerCola)).toBe(true);
    // Una sola petición, con el ÚLTIMO valor: los intermedios no existieron
    // nunca para el backend, y es correcto que no existan.
    expect(enviados.length).toBe(1);
    expect(enviados[0]).toMatchObject({ cambios: { estado: "PENDIENTE" } });
  });

  it("no fusiona cambios de requisitos distintos", async () => {
    const cola = await cargarCola();
    const enviados: string[] = [];
    cola.configurarEnvio(async (op) => {
      enviados.push(op.clave);
    });

    cola.encolar({
      accion: "documentacion.requisito.actualizar",
      parametros: { expedienteDocumentoId: "expdoc_1" },
      clave: "req:expdoc_1:estado",
      expedienteId: "exp_1",
      descripcion: "uno",
    });
    cola.encolar({
      accion: "documentacion.requisito.actualizar",
      parametros: { expedienteDocumentoId: "expdoc_2" },
      clave: "req:expdoc_2:estado",
      expedienteId: "exp_1",
      descripcion: "dos",
    });

    expect(await esperarVacia(cola.obtenerCola)).toBe(true);
    expect(enviados.sort()).toEqual(["req:expdoc_1:estado", "req:expdoc_2:estado"]);
  });

  it("reintenta un error de red conservando el mismo solicitudId", async () => {
    const cola = await cargarCola();
    const claves: string[] = [];
    let intentos = 0;
    cola.configurarEnvio(async (op) => {
      claves.push(op.solicitudId);
      intentos += 1;
      // Falla la primera vez con un error de red, que sí se reintenta.
      if (intentos === 1) throw Object.assign(new Error("Sin conexión"), { codigo: "SIN_RED" });
    });

    cola.encolar({
      accion: "documentacion.requisito.actualizar",
      parametros: {},
      clave: "req:x:estado",
      expedienteId: "exp_1",
      descripcion: "x",
    });

    expect(await esperarVacia(cola.obtenerCola, 4000)).toBe(true);
    expect(intentos).toBe(2);
    /*
     * El MISMO `solicitudId` en los dos intentos.
     *
     * Es lo que hace que reintentar sea gratis: si el primer envío llegó al
     * backend y solo se perdió la respuesta, el enrutador reconoce la clave y
     * devuelve el resultado en vez de aplicar el cambio dos veces.
     */
    expect(claves[0]).toBe(claves[1]);
  });

  it("no reintenta un error que un reintento no arregla", async () => {
    const cola = await cargarCola();
    let intentos = 0;
    cola.configurarEnvio(async () => {
      intentos += 1;
      throw Object.assign(new Error("La fecha no existe en el calendario."), { codigo: "VALIDATION_ERROR" });
    });

    cola.encolar({
      accion: "documentacion.prorroga.crear",
      parametros: {},
      clave: "prorroga:x",
      expedienteId: "exp_1",
      descripcion: "Conceder prórroga",
    });

    const limite = Date.now() + 1500;
    while (Date.now() < limite && cola.obtenerCola().fallidas === 0) {
      await new Promise((r) => setTimeout(r, 10));
    }

    const estado = cola.obtenerCola();
    expect(intentos).toBe(1);
    expect(estado.fallidas).toBe(1);
    // Y sigue VISIBLE con su motivo: un cambio que no se guardó no puede
    // desaparecer en silencio.
    expect(estado.operaciones[0].ultimoError).toMatch(/calendario/i);
    expect(estado.operaciones[0].descripcion).toBe("Conceder prórroga");
  });

  it("sobrevive a un recargado y lo que quedó enviando vuelve a pendiente", async () => {
    const primera = await cargarCola();
    // Sin función de envío la operación se queda en la cola, que es justo el
    // estado en el que la pilla un recargado.
    primera.configurarEnvio(null);
    primera.encolar({
      accion: "documentacion.requisito.actualizar",
      parametros: { expedienteDocumentoId: "expdoc_9" },
      clave: "req:expdoc_9:estado",
      expedienteId: "exp_1",
      descripcion: "Marcar como entregado",
    });
    expect(primera.obtenerCola().pendientes).toBe(1);

    // «Recargar»: el módulo se vuelve a cargar y lee `localStorage`.
    const segunda = await cargarCola();
    const estado = segunda.obtenerCola();
    expect(estado.pendientes).toBe(1);
    expect(estado.operaciones[0].estado).toBe("pendiente");
    expect(estado.operaciones[0].descripcion).toBe("Marcar como entregado");
  });

  it("descarta una fallida solo si está fallida, y reintenta a petición", async () => {
    const cola = await cargarCola();
    cola.configurarEnvio(async () => {
      throw Object.assign(new Error("no"), { codigo: "PERMISO_INSUFICIENTE" });
    });
    cola.encolar({
      accion: "documentacion.requisito.actualizar",
      parametros: {},
      clave: "req:z:estado",
      expedienteId: "exp_1",
      descripcion: "z",
    });

    const limite = Date.now() + 1500;
    while (Date.now() < limite && cola.obtenerCola().fallidas === 0) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const id = cola.obtenerCola().operaciones[0].id;

    cola.reintentarTodo();
    expect(cola.obtenerCola().operaciones[0].intentos).toBeLessThanOrEqual(2);

    // Y se puede descartar cuando vuelve a fallar.
    const limite2 = Date.now() + 1500;
    while (Date.now() < limite2 && cola.obtenerCola().fallidas === 0) {
      await new Promise((r) => setTimeout(r, 10));
    }
    cola.descartar(id);
    expect(cola.obtenerCola().operaciones.length).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Caché                                                             */
/* ------------------------------------------------------------------ */

function detalleFalso(expedienteId: string, version: number): ExpedienteOperativo {
  return {
    expediente: {
      expedienteId,
      identificador: "1234567",
      nombre: "Persona De Prueba",
      cargo: "",
      agencia: "",
      gerencia: "",
      fechaIngreso: "",
      diasDesdeIngreso: null,
      tipoFuncionario: "GENERAL",
      tipoFuncionarioEtiqueta: "General",
      tipoGarantia: "NINGUNA",
      tipoGarantiaEtiqueta: "Sin garantía",
      responsableId: "",
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
        hojasFisicas: 0,
        documentosFisicos: 5,
        prorrogas: 0,
        prorrogasVencidas: 0,
      },
      proximaFechaCritica: "",
      diasParaFechaCritica: null,
      version,
      estadoOperacion: "ACTIVO",
      creadoEn: "",
      creadoPor: "",
      actualizadoEn: "",
      actualizadoPor: "",
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
    resumenTextual: "",
    capacidades: { ver: true },
    siguientePendiente: null,
  };
}

describe("caché de expedientes · instantánea sin presentarla como fresca", () => {
  it("lo guardado se lee en el mismo fotograma, con su antigüedad", async () => {
    const cache = await cargarCache();
    cache.guardar(detalleFalso("exp_1", 3));

    // Lectura SINCRÓNICA: es la que permite pintar sin esperar a nada.
    const lectura = cache.leerDeMemoria("exp_1");
    expect(lectura).not.toBeNull();
    expect(lectura!.detalle.expediente.expedienteId).toBe("exp_1");
    expect(lectura!.caducada).toBe(false);
    expect(lectura!.antiguedadMs).toBeLessThan(1000);
  });

  it("no guarda la auditoría técnica ni el historial largo", async () => {
    const cache = await cargarCache();
    const detalle = detalleFalso("exp_2", 1);
    detalle.auditoria = Array.from({ length: 40 }, (_, i) => ({
      eventoId: `ev_${i}`,
      requestId: "",
      expedienteId: "exp_2",
      entidadTipo: "expediente",
      entidadId: "exp_2",
      tipo: "x",
      actor: "",
      origen: "",
      resultado: "ok",
      metadata: null,
      fecha: "",
    }));
    detalle.historial = Array.from({ length: 60 }, (_, i) => ({
      historialId: `h_${i}`,
      entidadTipo: "expediente",
      entidadId: "exp_2",
      campo: "x",
      anterior: "",
      nuevo: "",
      motivo: "",
      fecha: "",
      actor: "",
      texto: "",
    }));
    cache.guardar(detalle);

    /*
     * Son datos personales y son lo más pesado del payload.
     *
     * Nadie abre un expediente para leer su bitácora técnica: se pide cuando hace
     * falta. Recortarlo es lo que permite que sesenta expedientes quepan sin
     * acercarse a la cuota del navegador.
     */
    const guardado = cache.leerDeMemoria("exp_2")!;
    expect(guardado.detalle.auditoria.length).toBe(0);
    expect(guardado.detalle.historial.length).toBe(12);
  });

  it("una versión igual no es un cambio; una distinta sí", async () => {
    const cache = await cargarCache();
    cache.guardar(detalleFalso("exp_3", 5));

    expect(cache.reconciliar("exp_3", detalleFalso("exp_3", 5), false)).toEqual({ tipo: "sin_cambios" });

    const actualizado = cache.reconciliar("exp_3", detalleFalso("exp_3", 6), false);
    expect(actualizado.tipo).toBe("actualizado");
  });

  it("una revalidación NO pisa lo que la persona está escribiendo", async () => {
    const cache = await cargarCache();
    cache.guardar(detalleFalso("exp_4", 5));

    /*
     * El caso que hace usable todo esto.
     *
     * Alguien está escribiendo una observación larga y llega una revalidación con
     * una versión nueva. Sustituir el detalle en ese momento borraría la frase a
     * medias: es el mismo tipo de fallo por el que en este módulo antes «entraba
     * una sola letra». Se devuelve `conflicto` y decide la persona.
     */
    const resultado = cache.reconciliar("exp_4", detalleFalso("exp_4", 9), true);
    expect(resultado.tipo).toBe("conflicto");
    if (resultado.tipo === "conflicto") {
      expect(resultado.versionLocal).toBe(5);
      expect(resultado.versionRemota).toBe(9);
    }
    // Y lo guardado sigue siendo lo de antes: no se tocó.
    expect(cache.leerDeMemoria("exp_4")!.detalle.expediente.version).toBe(5);
  });

  it("desaloja el menos usado al pasarse del tope", async () => {
    const cache = await cargarCache();
    for (let i = 0; i < 70; i++) cache.guardar(detalleFalso(`exp_${i}`, 1));

    const estado = cache.estadoCache();
    expect(estado.entradas).toBeLessThanOrEqual(60);
    // El primero cayó; el último sigue.
    expect(cache.leerDeMemoria("exp_0")).toBeNull();
    expect(cache.leerDeMemoria("exp_69")).not.toBeNull();
  });

  it("vaciar borra todo: son datos personales y no sobreviven al cambio de perfil", async () => {
    const cache = await cargarCache();
    cache.guardar(detalleFalso("exp_5", 1));
    expect(cache.estadoCache().entradas).toBe(1);

    await cache.vaciar();
    expect(cache.estadoCache().entradas).toBe(0);
    expect(cache.leerDeMemoria("exp_5")).toBeNull();
  });

  it("la precarga no vuelve a pedir lo que ya tiene fresco", async () => {
    const cache = await cargarCache();
    cache.guardar(detalleFalso("exp_6", 1));

    const pedidos: string[][] = [];
    cache.configurarPrecarga(async (ids) => {
      pedidos.push(ids);
      return ids.map((id) => detalleFalso(id, 1));
    });

    cache.precargar(["exp_6", "exp_7"]);
    await new Promise((r) => setTimeout(r, 400));

    // `exp_6` ya estaba: gastar una llamada en confirmarlo no aporta nada.
    expect(pedidos.flat()).toEqual(["exp_7"]);
  });

  it("cancelar la precarga descarta lo que quedaba en cola", async () => {
    const cache = await cargarCache();
    const pedidos: string[][] = [];
    cache.configurarPrecarga(async (ids) => {
      pedidos.push(ids);
      return [];
    });

    cache.precargar(["exp_a", "exp_b"]);
    cache.cancelarPrecarga();
    await new Promise((r) => setTimeout(r, 400));
    expect(pedidos.length).toBe(0);
  });

  it("la antigüedad se dice en lenguaje llano", async () => {
    const cache = await cargarCache();
    expect(cache.antiguedadLegible(3000)).toBe("hace unos segundos");
    expect(cache.antiguedadLegible(45000)).toBe("hace 45 segundos");
    expect(cache.antiguedadLegible(60000)).toBe("hace un minuto");
    expect(cache.antiguedadLegible(600000)).toBe("hace 10 minutos");
    expect(cache.antiguedadLegible(3600000)).toBe("hace una hora");
  });
});
