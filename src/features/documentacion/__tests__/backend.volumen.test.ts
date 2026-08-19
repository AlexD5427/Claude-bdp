import { describe, it, expect } from "vitest";
import { loadInstalledBackend, type DocHarness } from "../../../../scripts/documentacion-backend.mjs";

/**
 * Volumen: 100 y 1 000 expedientes con datos sintéticos.
 *
 * ── Qué mide y qué no ───────────────────────────────────────────────────────
 * NO mide el tiempo real de Apps Script: el arnés escribe en memoria y ahí un
 * `setValues` cuesta microsegundos en lugar de decenas de milisegundos. Lo que sí
 * mide, y es lo que determina ese tiempo en producción, son las magnitudes que
 * allí se pagan una por una:
 *
 *   · cuántas veces se lee cada hoja por petición (`hojasLeidas`);
 *   · cuántas filas se escriben (`filasEscritas`);
 *   · cuánto pesa la respuesta que viaja al navegador.
 *
 * Un panel que lee la hoja de expedientes mil veces funciona en memoria y agota la
 * cuota en producción. Estas pruebas fijan el techo de esas tres magnitudes.
 *
 * Los datos son sintéticos y viven en el libro de pruebas del arnés: nunca tocan
 * producción.
 */

const AGENCIAS = ["LA PAZ", "EL ALTO", "SANTA CRUZ", "COCHABAMBA", "ORURO", "TARIJA"];
const GERENCIAS = ["GERENCIA DE NEGOCIOS", "GERENCIA DE RIESGOS", "GERENCIA DE OPERACIONES"];

/** Datos de un expediente sintético. Deterministas: la misma `i`, el mismo dato. */
function sintetico(i: number) {
  return {
    identificador: `CI-V${String(i).padStart(5, "0")}-2026`,
    nombre: `Persona sintética ${i}`,
    cargo: i % 3 === 0 ? "Oficial de Negocios" : "Analista",
    agencia: AGENCIAS[i % AGENCIAS.length],
    gerencia: GERENCIAS[i % GERENCIAS.length],
    fechaIngreso: `2026-0${(i % 9) + 1}-1${i % 9}`,
    tipoFuncionario: i % 5 === 0 ? "COMERCIAL" : "GENERAL",
    tipoGarantia: i % 5 === 0 ? "COMERCIAL_2" : "NINGUNA",
    idempotencyKey: `sintetico-${i}`,
  };
}

/**
 * Siembra por el camino real: una petición HTTP por expediente.
 *
 * Es el escenario de un día de trabajo: alguien registrando ingresos uno a uno,
 * con el espejo del libro anual activo.
 */
function sembrarPorElEnrutador(h: DocHarness, n: number) {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const creado = h.ok("documentacion.expediente.crear", { expediente: sintetico(i) });
    ids.push(creado.expedienteId);
    if (i % 3 === 2) continue; // un tercio se queda sin tocar
    const detalle = h.ok("documentacion.expediente.obtener", { expedienteId: creado.expedienteId });
    const objetivo = i % 3 === 0 ? detalle.requisitos : detalle.requisitos.slice(0, 6);
    h.ok("documentacion.requisitos.guardar", {
      expedienteId: creado.expedienteId,
      cambios: objetivo.map((r: any) => ({
        expedienteDocumentoId: r.expedienteDocumentoId,
        estado: r.obligatorio ? "ENTREGADO" : "NO_APLICA",
      })),
    });
  }
  return ids;
}

/**
 * Siembra por el camino de servicio: mil altas y un solo volcado.
 *
 * Se usa para el caso de mil porque sembrar por el enrutador multiplicaría por
 * cien el tiempo de la suite sin cambiar lo que se quiere medir (las consultas y
 * los agregados sobre mil expedientes). El espejo del libro anual se desactiva
 * durante la siembra por el mismo motivo; se prueba aparte, en la suite de
 * migración.
 */
function sembrarPorServicio(h: DocHarness, n: number) {
  const ctx = h.ctx();
  h.call("doc2ConfigSet_", "espejo_libro_anual", "FALSE", ctx);
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const creado = h.call<{ expedienteId: string }>("doc2CrearExpediente_", sintetico(i), ctx);
    ids.push(creado.expedienteId);
  }
  h.call("docCommit_");
  return ids;
}

describe("documentación · volumen: 100 expedientes por el camino real", () => {
  const h = loadInstalledBackend();
  const ids = sembrarPorElEnrutador(h, 100);

  it("los 100 expedientes quedan registrados con sus requisitos", () => {
    expect(ids.length).toBe(100);
    expect(h.rowsOf("Expedientes").length).toBe(100);
    // 18 generales, más los nueve de garantía (Tipo 2) en uno de cada cinco.
    expect(h.rowsOf("ExpedienteDocumentos").length).toBeGreaterThan(1800);
  });

  it("el espejo del libro anual sigue al día con 100 expedientes", () => {
    const filas = h.rowsOf("CONTROL INGRESOS 2026");
    expect(filas.length).toBe(100);
  });

  it("el listado paginado devuelve 25 filas y una carga pequeña", () => {
    const res = h.pedir("documentacion.expedientes.listar", { filtros: { porPagina: 25 } });
    expect(res.ok).toBe(true);
    expect(res.data.expedientes.length).toBe(25);
    expect(res.data.total).toBe(100);
    // Una página de 25 expedientes con sus totales pesa unos 22 KB; el techo de
    // 80 KB deja margen y detecta si alguien mete el detalle completo en la lista.
    expect(JSON.stringify(res.data).length).toBeLessThan(80000);
  });

  it("una consulta no lee la misma hoja una vez por fila", () => {
    const res = h.pedir("documentacion.expedientes.listar", { filtros: { porPagina: 25 } });
    expect(res.meta.contadores.hojasLeidas).toBeLessThan(8);
  });

  it("el panel agrega los 100 y viaja agregado", () => {
    const res = h.pedir("documentacion.panel");
    expect(res.ok).toBe(true);
    expect(res.data.expedientes).toBe(100);
    expect(res.data.tarjetas.completos).toBeGreaterThan(20);
    expect(res.meta.contadores.hojasLeidas).toBeLessThan(12);
    expect(JSON.stringify(res.data).length).toBeLessThan(30000);
    // Ningún nombre de persona viaja en el panel.
    expect(JSON.stringify(res.data)).not.toContain("Persona sintética");
  });

  it("los filtros se aplican en el servidor", () => {
    const porAgencia = h.ok("documentacion.expedientes.listar", { filtros: { agencia: "LA PAZ", porPagina: 200 } });
    expect(porAgencia.total).toBeGreaterThan(10);
    for (const expediente of porAgencia.expedientes) expect(expediente.agencia).toBe("LA PAZ");

    const completos = h.ok("documentacion.expedientes.listar", { filtros: { progresoMin: 100, porPagina: 200 } });
    for (const expediente of completos.expedientes) expect(expediente.porcentaje).toBe(100);
  });

  it("el reporte de completitud trae las 100 filas con columnas alineadas", () => {
    const res = h.ok("documentacion.reporte", { tipo: "completitud" });
    expect(res.total).toBe(100);
    expect(res.filas.every((f: any[]) => f.length === res.columnas.length)).toBe(true);
  });

  it("la exportación completa se trocea en lotes con progreso real", () => {
    const trabajo = h.ok("documentacion.exportacion.iniciar", { tipo: "completo" });
    expect(trabajo.expedientes).toBe(100);
    const primero = h.ok("documentacion.exportacion.lote", { exportacionId: trabajo.exportacionId, lote: 40 });
    expect(primero.datos.Expedientes.length).toBe(41); // encabezado + 40
    expect(primero.quedan).toBe(true);
    expect(primero.progreso).toBe(40);
  });

  it("el diagnóstico sobre 100 expedientes no encuentra nada crítico", () => {
    const res = h.pedir("documentacion.diagnostico");
    expect(res.ok).toBe(true);
    expect(res.data.conteos.CRITICO).toBe(0);
    expect(res.data.resumen.expedientes).toBe(100);
  });
});

describe("documentación · volumen: 1 000 expedientes", () => {
  const h = loadInstalledBackend();
  const ids = sembrarPorServicio(h, 1000);

  it("mil expedientes y casi veinte mil requisitos entran en el libro", () => {
    expect(ids.length).toBe(1000);
    expect(h.rowsOf("Expedientes").length).toBe(1000);
    // 18 generales por expediente, más los nueve de garantía (Tipo 2) en uno de cada cinco.
    expect(h.rowsOf("ExpedienteDocumentos").length).toBe(19800);
  });

  it("la lista sigue devolviendo una página, no la base entera", () => {
    const res = h.pedir("documentacion.expedientes.listar", { filtros: { porPagina: 25 } });
    expect(res.data.total).toBe(1000);
    expect(res.data.expedientes.length).toBe(25);
    expect(JSON.stringify(res.data).length).toBeLessThan(80000);
    expect(res.meta.contadores.hojasLeidas).toBeLessThan(8);
  });

  it("el tope de página no se puede saltar pidiendo un número enorme", () => {
    const res = h.ok("documentacion.expedientes.listar", { filtros: { porPagina: 5000 } });
    expect(res.porPagina).toBe(200);
    expect(res.expedientes.length).toBe(200);
  });

  it("el panel de mil expedientes pesa lo mismo que el de cien", () => {
    const res = h.pedir("documentacion.panel");
    expect(res.data.expedientes).toBe(1000);
    expect(JSON.stringify(res.data).length).toBeLessThan(30000);
    expect(res.meta.contadores.hojasLeidas).toBeLessThan(12);
  });

  it("buscar por texto entre mil expedientes devuelve solo lo que coincide", () => {
    const res = h.ok("documentacion.expedientes.listar", { filtros: { texto: "sintética 777" } });
    expect(res.total).toBe(1);
    expect(res.expedientes[0].nombre).toBe("Persona sintética 777");
  });

  it("la selección masiva tiene un tope duro que protege de un clic accidental", () => {
    const res = h.pedir("documentacion.solicitudes.impacto", { seleccion: { todos: true } });
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe("LIMITE_EXCEDIDO");
    expect(res.error.hint).toMatch(/acota/i);
  });

  it("una operación masiva acotada se ejecuta por lotes y se reanuda", () => {
    const impacto = h.ok("documentacion.solicitudes.impacto", { seleccion: { agencia: "ORURO" } });
    expect(impacto.expedientes).toBeGreaterThan(100);
    expect(impacto.advertencias.join(" ")).toMatch(/lotes de 50/);

    const lote = h.ok("documentacion.solicitudes.masiva", {
      seleccion: { agencia: "ORURO" },
      confirmado: true,
      lote: 50,
    });
    expect(lote.procesados).toBe(50);
    expect(lote.creadas).toBe(50);
    expect(lote.quedan).toBe(true);
    expect(lote.siguiente).toBe(50);
  });

  it("el historial de un expediente se recorta al leerlo", () => {
    const detalle = h.ok("documentacion.expediente.obtener", { expedienteId: ids[0], historial: 5 });
    expect(detalle.historial.length).toBeLessThanOrEqual(5);
  });

  it("la migración de resúmenes procesa mil expedientes por lotes", () => {
    const res = h.ok("documentacion.migrar", { version: "4.0.3-resumenes", lote: 300 });
    const paso = res.ejecutadas[0];
    expect(paso.filas).toBe(300);
    expect(paso.quedan).toBe(true);
    expect(paso.siguiente).toBe(300);

    const registro = h.rowsOf("MigracionesDocumentacion").find((m) => m.version === "4.0.3-resumenes")!;
    expect(registro.estado).toBe("EN_PROCESO");
    expect(String(registro.checkpoint)).toContain("300");
  });

  it("el diagnóstico completo sobre mil expedientes termina y no encuentra nada crítico", () => {
    const res = h.pedir("documentacion.diagnostico");
    expect(res.ok).toBe(true);
    expect(res.data.resumen.expedientes).toBe(1000);
    expect(res.data.conteos.CRITICO).toBe(0);
  });
});
