import { describe, it, expect } from "vitest";
import {
  crearExpediente,
  loadInstalledBackend,
} from "../../../../scripts/documentacion-backend.mjs";

/**
 * Panel, reportes y exportaciones.
 *
 * La propiedad que fijan estas pruebas es que los agregados salen del servidor ya
 * agregados y con datos reales. Ninguna cifra del panel puede venir de una
 * constante ni calcularse en el navegador: con novecientos expedientes eso sería
 * varios megabytes por cada carga.
 */

/** Escenario con dos agencias, avances distintos y trabajo abierto. */
function escenario(h: any) {
  const a = crearExpediente(h, { identificador: "CI-P1-2026", nombre: "Ana", agencia: "LA PAZ", gerencia: "GERENCIA DE RIESGOS" });
  const b = crearExpediente(h, { identificador: "CI-P2-2026", nombre: "Bruno", agencia: "EL ALTO", gerencia: "GERENCIA DE NEGOCIOS" });
  const c = crearExpediente(h, {
    identificador: "CI-P3-2026",
    nombre: "Clara",
    agencia: "LA PAZ",
    gerencia: "GERENCIA DE NEGOCIOS",
    tipoFuncionario: "COMERCIAL",
    tipoGarantia: "COMERCIAL_2",
  });

  // A queda completo.
  h.ok("documentacion.requisitos.guardar", {
    expedienteId: a.expedienteId,
    cambios: a.requisitos.map((r: any) => ({
      expedienteDocumentoId: r.expedienteDocumentoId,
      estado: r.obligatorio ? "ENTREGADO" : "NO_APLICA",
    })),
  });

  // B tiene una observación y una prórroga.
  const cvB = b.requisitos.find((r: any) => r.codigo === "cv")!;
  h.ok("documentacion.requisito.actualizar", {
    expedienteDocumentoId: cvB.expedienteDocumentoId,
    cambios: { estado: "ENTREGADO" },
  });
  h.ok("documentacion.revision.decidir", {
    revision: { expedienteDocumentoId: cvB.expedienteDocumentoId, estado: "OBSERVADO", motivo: "FALTAN_DATOS", comentario: "Sin firma." },
  });
  const certB = b.requisitos.find((r: any) => r.codigo === "cert-trabajo")!;
  h.ok("documentacion.prorroga.crear", {
    prorroga: { expedienteDocumentoId: certB.expedienteDocumentoId, fechaProrroga: h.read("doc2FechaMasDias_(20)"), motivo: "Trámite en curso." },
  });

  // C tiene un requisito no entregado y una solicitud abierta.
  const rejapC = c.requisitos.find((r: any) => r.codigo === "rejap")!;
  h.ok("documentacion.requisito.actualizar", {
    expedienteDocumentoId: rejapC.expedienteDocumentoId,
    cambios: { estado: "NO_ENTREGADO" },
  });
  h.ok("documentacion.solicitud.crear", { solicitud: { expedienteId: c.expedienteId } });

  return { a, b, c };
}

describe("documentación · panel operativo", () => {
  it("las tarjetas cuentan lo que hay, no una simulación", () => {
    const h = loadInstalledBackend();
    escenario(h);
    const panel = h.ok("documentacion.panel");

    expect(panel.expedientes).toBe(3);
    expect(panel.tarjetas.completos).toBe(1);
    expect(panel.tarjetas.observados).toBe(1);
    expect(panel.tarjetas.noEntregados).toBe(1);
    expect(panel.tarjetas.prorrogasVigentes).toBe(1);
    expect(panel.avancePromedio).toBeGreaterThan(0);
    expect(panel.avancePromedio).toBeLessThan(100);
  });

  it("entrega los agregados por agencia, gerencia y tipo de funcionario", () => {
    const h = loadInstalledBackend();
    escenario(h);
    const panel = h.ok("documentacion.panel");

    const laPaz = panel.completitudPorAgencia.find((x: any) => x.clave === "LA PAZ");
    expect(laPaz.expedientes).toBe(2);
    expect(laPaz.completos).toBe(1);

    const negocios = panel.completitudPorGerencia.find((x: any) => x.clave === "GERENCIA DE NEGOCIOS");
    expect(negocios.expedientes).toBe(2);

    const comercial = panel.distribucionTipoFuncionario.find((x: any) => x.clave === "COMERCIAL");
    expect(comercial.expedientes).toBe(1);
  });

  it("el embudo documental y los rankings salen de los requisitos reales", () => {
    const h = loadInstalledBackend();
    escenario(h);
    const panel = h.ok("documentacion.panel");

    expect(panel.embudo.total).toBeGreaterThan(50);
    expect(panel.embudo.entregados).toBeGreaterThan(0);
    expect(panel.embudo.observados).toBe(1);

    const noEntregado = panel.requisitosNoEntregados[0];
    expect(noEntregado.codigo).toBe("rejap");
    expect(noEntregado.nombre).toMatch(/REJAP/i);
    expect(panel.requisitosObservados[0].codigo).toBe("cv");
  });

  it("se puede filtrar por agencia y el resultado cambia", () => {
    const h = loadInstalledBackend();
    escenario(h);
    const soloElAlto = h.ok("documentacion.panel", { filtros: { agencia: "EL ALTO" } });
    expect(soloElAlto.expedientes).toBe(1);
    expect(soloElAlto.tarjetas.observados).toBe(1);
    expect(soloElAlto.tarjetas.completos).toBe(0);
  });

  it("usa caché sin filtros y la invalida cuando algo cambia", () => {
    const h = loadInstalledBackend();
    const { a } = escenario(h);
    const primera = h.ok("documentacion.panel");
    expect(primera.desdeCache).toBe(false);
    const segunda = h.ok("documentacion.panel");
    expect(segunda.desdeCache).toBe(true);

    // Una escritura invalida el caché del panel.
    h.ok("documentacion.tarea.crear", { tarea: { expedienteId: a.expedienteId, titulo: "Nueva tarea" } });
    h.ok("documentacion.expediente.recalcular", { expedienteId: a.expedienteId });
    const tercera = h.ok("documentacion.panel");
    expect(tercera.desdeCache).toBe(false);
  });
});

describe("documentación · reportes", () => {
  it("cada reporte declarado devuelve columnas y filas coherentes", () => {
    const h = loadInstalledBackend();
    escenario(h);
    const disponibles = h.ok("documentacion.reportes.disponibles").reportes;
    expect(disponibles.length).toBe(14);

    for (const definicion of disponibles) {
      const res = h.pedir("documentacion.reporte", { tipo: definicion.codigo });
      expect(res.ok, `el reporte ${definicion.codigo} debería generarse`).toBe(true);
      expect(res.data.columnas.length).toBeGreaterThan(0);
      for (const fila of res.data.filas) {
        expect(fila.length).toBe(res.data.columnas.length);
      }
    }
  });

  it("el reporte de completitud trae una fila por expediente con sus totales", () => {
    const h = loadInstalledBackend();
    escenario(h);
    const res = h.ok("documentacion.reporte", { tipo: "completitud" });
    expect(res.total).toBe(3);
    const clara = res.filas.find((f: any[]) => f[1] === "Clara")!;
    expect(clara[0]).toBe("CI-P3-2026");
    expect(clara[3]).toBe("LA PAZ");
  });

  it("los reportes respetan los filtros", () => {
    const h = loadInstalledBackend();
    escenario(h);
    const res = h.ok("documentacion.reporte", { tipo: "completitud", filtros: { agencia: "EL ALTO" } });
    expect(res.total).toBe(1);
  });

  it("el reporte de auditoría exige la capacidad correspondiente", () => {
    const h = loadInstalledBackend();
    escenario(h);
    h.ok("documentacion.permisos.guardar", { roles: { "analista@bdp.com": "analista" } });
    const res = h.pedir("documentacion.reporte", { tipo: "auditoria" }, { actor: "analista@bdp.com" });
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe("PERMISO_INSUFICIENTE");
  });

  it("un reporte inexistente enumera los disponibles", () => {
    const h = loadInstalledBackend();
    const res = h.pedir("documentacion.reporte", { tipo: "inventado" });
    expect(res.ok).toBe(false);
    expect(res.error.hint).toMatch(/completitud/);
  });

  it("el reporte de prórrogas calcula los días restantes al generarse", () => {
    const h = loadInstalledBackend();
    escenario(h);
    const res = h.ok("documentacion.reporte", { tipo: "prorrogas" });
    expect(res.total).toBe(1);
    const columnaDias = res.columnas.indexOf("Días restantes");
    expect(res.filas[0][columnaDias]).toBe(20);
  });
});

describe("documentación · exportaciones", () => {
  it("la exportación individual trae las hojas del expediente", () => {
    const h = loadInstalledBackend();
    const { b } = escenario(h);

    const trabajo = h.ok("documentacion.exportacion.iniciar", { tipo: "expediente", expedienteId: b.expedienteId });
    expect(trabajo.expedientes).toBe(1);
    expect(trabajo.hojas).toContain("Resumen");
    expect(trabajo.hojas).toContain("Prórrogas");

    const lote = h.ok("documentacion.exportacion.lote", { exportacionId: trabajo.exportacionId });
    expect(lote.quedan).toBe(false);
    expect(lote.progreso).toBe(100);
    expect(Object.keys(lote.datos)).toContain("Datos generales");
    expect(lote.datos.Requisitos.length).toBeGreaterThan(10);
    // La primera fila es siempre el encabezado.
    expect(lote.datos.Requisitos[0]).toContain("Requisito");
  });

  it("la exportación filtrada procesa por lotes y se puede reanudar", () => {
    const h = loadInstalledBackend();
    for (let i = 0; i < 5; i++) crearExpediente(h, { identificador: `CI-X${i}-2026`, agencia: "ORURO" });

    const trabajo = h.ok("documentacion.exportacion.iniciar", { tipo: "filtrado", filtro: { agencia: "ORURO" } });
    expect(trabajo.expedientes).toBe(5);

    const primero = h.ok("documentacion.exportacion.lote", { exportacionId: trabajo.exportacionId, lote: 2 });
    expect(primero.quedan).toBe(true);
    expect(primero.hasta).toBe(2);
    expect(primero.datos.Expedientes.length).toBe(3); // encabezado + 2

    const segundo = h.ok("documentacion.exportacion.lote", { exportacionId: trabajo.exportacionId, lote: 2 });
    expect(segundo.desde).toBe(2);
    expect(segundo.datos.Expedientes.length).toBe(2); // sin encabezado

    const tercero = h.ok("documentacion.exportacion.lote", { exportacionId: trabajo.exportacionId, lote: 2 });
    expect(tercero.quedan).toBe(false);
    expect(tercero.progreso).toBe(100);

    const registro = h.rowsOf("ExportacionesDocumentacion")[0];
    expect(registro.estado).toBe("COMPLETADA");
    expect(Number(registro.progreso)).toBe(100);
  });

  it("los valores exportados no pueden ser fórmulas", () => {
    const h = loadInstalledBackend();
    h.ok("documentacion.expediente.crear", {
      expediente: { identificador: "CI-F1-2026", nombre: "=HYPERLINK(\"http://malo\")", fechaIngreso: "2026-01-01" },
    });
    const trabajo = h.ok("documentacion.exportacion.iniciar", { tipo: "completo" });
    const lote = h.ok("documentacion.exportacion.lote", { exportacionId: trabajo.exportacionId });
    const fila = lote.datos.Expedientes[1];
    for (const celda of fila) {
      if (typeof celda === "string" && celda.length) {
        expect(/^[=+@]/.test(celda)).toBe(false);
      }
    }
  });

  it("la exportación no modifica el libro de origen", () => {
    const h = loadInstalledBackend();
    escenario(h);
    const antes = JSON.stringify(h.rowsOf("Expedientes"));
    const trabajo = h.ok("documentacion.exportacion.iniciar", { tipo: "completo" });
    h.ok("documentacion.exportacion.lote", { exportacionId: trabajo.exportacionId });
    expect(JSON.stringify(h.rowsOf("Expedientes"))).toBe(antes);
  });

  it("una exportación cancelada no admite más lotes", () => {
    const h = loadInstalledBackend();
    escenario(h);
    const trabajo = h.ok("documentacion.exportacion.iniciar", { tipo: "completo" });
    h.ok("documentacion.exportacion.cancelar", { exportacionId: trabajo.exportacionId });
    const res = h.pedir("documentacion.exportacion.lote", { exportacionId: trabajo.exportacionId });
    expect(res.ok).toBe(false);
    expect(res.error.message).toMatch(/cancelada/i);
  });

  it("una exportación estancada se detecta y se cierra en el mantenimiento", () => {
    const h = loadInstalledBackend();
    escenario(h);
    h.ok("documentacion.exportacion.iniciar", { tipo: "completo" });
    h.advanceClock(3 * 3600000);

    const listado = h.ok("documentacion.exportaciones.listar", {});
    expect(listado.exportaciones[0].estancada).toBe(true);

    const diagnostico = h.ok("documentacion.diagnostico");
    expect(diagnostico.hallazgos.map((x: any) => x.codigo)).toContain("exportacion-estancada");

    h.ok("documentacion.reparar", { acciones: ["cerrar-exportaciones"] });
    expect(h.rowsOf("ExportacionesDocumentacion")[0].estado).toBe("INTERRUMPIDA");
  });

  it("exportar exige la capacidad de exportar", () => {
    const h = loadInstalledBackend();
    h.ok("documentacion.permisos.guardar", { roles: { "pasante@bdp.com": "pasante" } });
    const res = h.pedir("documentacion.exportacion.iniciar", { tipo: "completo" }, { actor: "pasante@bdp.com" });
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe("PERMISO_INSUFICIENTE");
  });

  it("queda constancia de quién exportó qué", () => {
    const h = loadInstalledBackend();
    escenario(h);
    h.ok("documentacion.exportacion.iniciar", { tipo: "completo" }, { actor: "supervisora@bdp.com" });
    const registro = h.rowsOf("ExportacionesDocumentacion")[0];
    expect(registro.solicitada_por).toBe("supervisora@bdp.com");
    const auditoria = h.rowsOf("AuditoriaDocumentacion");
    expect(auditoria.some((a) => a.evento_tipo === "exportacion.iniciada")).toBe(true);
  });
});
