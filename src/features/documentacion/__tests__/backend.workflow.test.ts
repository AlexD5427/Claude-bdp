import { describe, it, expect } from "vitest";
import {
  crearExpediente,
  loadInstalledBackend,
} from "../../../../scripts/documentacion-backend.mjs";

/**
 * Flujos de trabajo: revisiones, aprobaciones, solicitudes, prórrogas, tareas,
 * comentarios y las automatizaciones que los conectan.
 *
 * La pregunta que responde cada prueba es siempre la misma: ¿esta funcionalidad
 * sirve para trabajar? Una revisión que no deja rastro, una solicitud que sigue
 * abierta después de entregarse todo o una tarea que nadie cierra son
 * funcionalidades a medias.
 */

/** Atajo: expediente con un requisito ya entregado, listo para revisar. */
function expedienteConEntrega(h: any, codigo = "cv") {
  const creado = crearExpediente(h, { identificador: `CI-${Math.floor(Math.random() * 8999 + 1000)}-2026` });
  const requisito = creado.requisitos.find((r: any) => r.codigo === codigo)!;
  h.ok("documentacion.requisito.actualizar", {
    expedienteDocumentoId: requisito.expedienteDocumentoId,
    cambios: { estado: "ENTREGADO" },
  });
  return { ...creado, requisito };
}

describe("documentación · revisiones", () => {
  it("aprobar deja la decisión registrada con revisor, fecha y versión", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisito } = expedienteConEntrega(h);

    const res = h.ok("documentacion.revision.decidir", {
      revision: { expedienteDocumentoId: requisito.expedienteDocumentoId, estado: "APROBADO" },
    });
    expect(res.estado).toBe("APROBADO");

    const filas = h.rowsOf("RevisionesDocumentales");
    expect(filas.length).toBe(1);
    expect(filas[0].estado_revision).toBe("APROBADO");
    expect(filas[0].revisor_id).toBeTruthy();
    expect(filas[0].fecha_revision).toBeTruthy();

    const detalle = h.ok("documentacion.expediente.obtener", { expedienteId });
    const actualizado = detalle.requisitos.find((r: any) => r.codigo === requisito.codigo);
    expect(actualizado.estadoRevision).toBe("APROBADO");
    expect(actualizado.revisionActualId).toBe(filas[0].revision_id);
  });

  it("no se aprueba un requisito que no está entregado", () => {
    const h = loadInstalledBackend();
    const { requisitos } = crearExpediente(h);
    const res = h.pedir("documentacion.revision.decidir", {
      revision: { expedienteDocumentoId: requisitos[0].expedienteDocumentoId, estado: "APROBADO" },
    });
    expect(res.ok).toBe(false);
    expect(res.error.message).toMatch(/no está entregado/i);
  });

  it("observar exige motivo del catálogo y comentario", () => {
    const h = loadInstalledBackend();
    const { requisito } = expedienteConEntrega(h);

    const sinMotivo = h.pedir("documentacion.revision.decidir", {
      revision: { expedienteDocumentoId: requisito.expedienteDocumentoId, estado: "OBSERVADO", comentario: "algo" },
    });
    expect(sinMotivo.ok).toBe(false);
    expect(sinMotivo.error.fields.motivo_codigo).toBeTruthy();

    const sinComentario = h.pedir("documentacion.revision.decidir", {
      revision: { expedienteDocumentoId: requisito.expedienteDocumentoId, estado: "OBSERVADO", motivo: "FALTAN_DATOS" },
    });
    expect(sinComentario.ok).toBe(false);
    expect(sinComentario.error.fields.comentario).toBeTruthy();
  });

  it("observar crea una tarea de corrección y solo una", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisito } = expedienteConEntrega(h);

    h.ok("documentacion.revision.decidir", {
      revision: {
        expedienteDocumentoId: requisito.expedienteDocumentoId,
        estado: "OBSERVADO",
        motivo: "INFO_INCOMPLETA",
        comentario: "Falta la hoja 2.",
      },
    });
    let tareas = h.ok("documentacion.tareas.listar", { filtros: { expedienteId } }).tareas;
    expect(tareas.length).toBe(1);
    expect(tareas[0].tipo).toBe("CORRECCION");
    expect(tareas[0].origenTipo).toBe("revision");

    // Volver a observar el mismo requisito no duplica la tarea.
    h.ok("documentacion.revision.decidir", {
      revision: {
        expedienteDocumentoId: requisito.expedienteDocumentoId,
        estado: "OBSERVADO",
        motivo: "INFO_INCONSISTENTE",
        comentario: "Sigue mal.",
      },
    });
    tareas = h.ok("documentacion.tareas.listar", { filtros: { expedienteId } }).tareas;
    expect(tareas.length).toBe(1);
  });

  it("aprobar después de observar cierra la tarea que nació de la observación", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisito } = expedienteConEntrega(h);
    h.ok("documentacion.revision.decidir", {
      revision: {
        expedienteDocumentoId: requisito.expedienteDocumentoId,
        estado: "OBSERVADO",
        motivo: "FALTAN_DATOS",
        comentario: "Falta firma.",
      },
    });
    h.ok("documentacion.revision.decidir", {
      revision: { expedienteDocumentoId: requisito.expedienteDocumentoId, estado: "APROBADO" },
    });

    const tareas = h.ok("documentacion.tareas.listar", { filtros: { expedienteId } }).tareas;
    expect(tareas[0].estado).toBe("COMPLETADA");
    expect(tareas[0].completadoPor).toBe("automatizacion");
  });

  it("la cola de revisión muestra lo entregado sin revisar y lo observado primero", () => {
    const h = loadInstalledBackend();
    expedienteConEntrega(h, "cv");
    const dos = expedienteConEntrega(h, "rejap");
    h.ok("documentacion.revision.decidir", {
      revision: {
        expedienteDocumentoId: dos.requisito.expedienteDocumentoId,
        estado: "OBSERVADO",
        motivo: "REQUISITO_INCORRECTO",
        comentario: "No corresponde al año.",
      },
    });

    const cola = h.ok("documentacion.revision.cola", {});
    expect(cola.total).toBe(2);
    expect(cola.requisitos[0].estadoRevision).toBe("OBSERVADO");
    expect(cola.motivos.length).toBe(10);
  });

  it("una decisión imposible se rechaza con la lista de las permitidas", () => {
    const h = loadInstalledBackend();
    const { requisito } = expedienteConEntrega(h);
    h.ok("documentacion.revision.decidir", {
      revision: { expedienteDocumentoId: requisito.expedienteDocumentoId, estado: "APROBADO" },
    });
    const res = h.pedir("documentacion.revision.decidir", {
      revision: { expedienteDocumentoId: requisito.expedienteDocumentoId, estado: "RECHAZADO" },
    });
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe("TRANSICION_INVALIDA");
    expect(res.error.detalle.permitidos).toBeTruthy();
  });
});

describe("documentación · aprobaciones", () => {
  it("solicitar aprobación notifica al aprobador y queda pendiente", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisito } = expedienteConEntrega(h);

    const res = h.ok("documentacion.aprobacion.solicitar", {
      aprobacion: {
        expedienteId,
        expedienteDocumentoId: requisito.expedienteDocumentoId,
        aprobadores: ["supervisora@bdp.com"],
        comentario: "Revisar el título.",
      },
    });
    expect(res.aprobaciones.length).toBe(1);

    const notificaciones = h.rowsOf("NotificacionesDocumentales");
    expect(notificaciones.length).toBe(1);
    expect(notificaciones[0].usuario_destino).toBe("supervisora@bdp.com");
    expect(notificaciones[0].entidad_tipo).toBe("aprobacion");
    expect(notificaciones[0].entidad_id).toBe(res.aprobaciones[0]);
  });

  it("sin aprobador no se puede abrir una aprobación", () => {
    const h = loadInstalledBackend();
    const { expedienteId } = crearExpediente(h);
    const res = h.pedir("documentacion.aprobacion.solicitar", { aprobacion: { expedienteId, aprobadores: [] } });
    expect(res.ok).toBe(false);
    expect(res.error.fields.aprobadores).toBeTruthy();
  });

  it("rechazar exige explicación y deja el expediente observado", () => {
    const h = loadInstalledBackend();
    const { expedienteId } = expedienteConEntrega(h);
    const abierta = h.ok("documentacion.aprobacion.solicitar", {
      aprobacion: { expedienteId, aprobadores: ["supervisora@bdp.com"] },
    });

    const sinComentario = h.pedir("documentacion.aprobacion.resolver", {
      aprobacionId: abierta.aprobaciones[0],
      decision: "RECHAZADA",
    });
    expect(sinComentario.ok).toBe(false);
    expect(sinComentario.error.fields.comentario).toBeTruthy();

    h.ok("documentacion.aprobacion.resolver", {
      aprobacionId: abierta.aprobaciones[0],
      decision: "RECHAZADA",
      comentario: "El expediente no cumple.",
    });
    const detalle = h.ok("documentacion.expediente.obtener", { expedienteId });
    expect(detalle.expediente.estado).toBe("OBSERVADO");
  });

  it("los niveles se aprueban en orden", () => {
    const h = loadInstalledBackend();
    const { expedienteId } = expedienteConEntrega(h);
    const abierta = h.ok("documentacion.aprobacion.solicitar", {
      aprobacion: { expedienteId, aprobadores: ["jefa@bdp.com", "gerente@bdp.com"], flujo: "DOBLE" },
    });
    expect(abierta.aprobaciones.length).toBe(2);

    const fueraDeOrden = h.pedir("documentacion.aprobacion.resolver", {
      aprobacionId: abierta.aprobaciones[1],
      decision: "APROBADA",
    });
    expect(fueraDeOrden.ok).toBe(false);
    expect(fueraDeOrden.error.message).toMatch(/nivel 1/i);

    h.ok("documentacion.aprobacion.resolver", { aprobacionId: abierta.aprobaciones[0], decision: "APROBADA" });
    const enOrden = h.pedir("documentacion.aprobacion.resolver", {
      aprobacionId: abierta.aprobaciones[1],
      decision: "APROBADA",
    });
    expect(enOrden.ok).toBe(true);
  });

  it("al resolverse la última aprobación de un expediente completo, queda aprobado", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisitos } = crearExpediente(h);
    h.ok("documentacion.requisitos.guardar", {
      expedienteId,
      cambios: requisitos.map((r: any) => ({
        expedienteDocumentoId: r.expedienteDocumentoId,
        estado: r.obligatorio ? "ENTREGADO" : "NO_APLICA",
      })),
    });
    const abierta = h.ok("documentacion.aprobacion.solicitar", {
      aprobacion: { expedienteId, aprobadores: ["supervisora@bdp.com"] },
    });
    h.ok("documentacion.aprobacion.resolver", { aprobacionId: abierta.aprobaciones[0], decision: "APROBADA" });

    const detalle = h.ok("documentacion.expediente.obtener", { expedienteId });
    expect(detalle.expediente.estado).toBe("APROBADO");
    const aviso = h.rowsOf("NotificacionesDocumentales").find((n) => n.tipo_evento === "expediente.aprobado");
    expect(aviso).toBeTruthy();
  });
});

describe("documentación · solicitudes", () => {
  it("sin selección pide todo lo que falta y calcula la fecha límite por SLA", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisitos } = crearExpediente(h);
    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: requisitos[0].expedienteDocumentoId,
      cambios: { estado: "ENTREGADO" },
    });

    const res = h.ok("documentacion.solicitud.crear", { solicitud: { expedienteId } });
    expect(res.requisitos).toBe(17);
    expect(res.fechaLimite).toBeTruthy();

    const items = h.rowsOf("SolicitudDocumentos");
    expect(items.length).toBe(17);
    expect(items.every((i) => i.estado_item === "PENDIENTE")).toBe(true);
  });

  it("entregar un requisito cierra su ítem y completa la solicitud cuando no queda nada", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisitos } = crearExpediente(h);
    const cv = requisitos.find((r: any) => r.codigo === "cv")!;
    const foto = requisitos.find((r: any) => r.codigo === "foto-4x4")!;

    const solicitud = h.ok("documentacion.solicitud.crear", {
      solicitud: { expedienteId, codigos: ["cv", "foto-4x4"], titulo: "Los dos primeros" },
    });
    expect(solicitud.requisitos).toBe(2);

    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: cv.expedienteDocumentoId,
      cambios: { estado: "ENTREGADO" },
    });
    let vista = h.ok("documentacion.solicitudes.listar", { filtros: { expedienteId } }).solicitudes[0];
    expect(vista.cumplidos).toBe(1);
    expect(vista.estado).toBe("PENDIENTE");

    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: foto.expedienteDocumentoId,
      cambios: { estado: "ENTREGADO" },
    });
    vista = h.ok("documentacion.solicitudes.listar", { filtros: { expedienteId } }).solicitudes[0];
    expect(vista.cumplidos).toBe(2);
    expect(vista.estado).toBe("COMPLETADA");
  });

  it("una fecha límite pasada se rechaza", () => {
    const h = loadInstalledBackend();
    const { expedienteId } = crearExpediente(h);
    const res = h.pedir("documentacion.solicitud.crear", {
      solicitud: { expedienteId, fechaLimite: "2020-01-01" },
    });
    expect(res.ok).toBe(false);
    expect(res.error.fields.fecha_limite).toBeTruthy();
  });

  it("un expediente sin pendientes no admite solicitud", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisitos } = crearExpediente(h);
    h.ok("documentacion.requisitos.guardar", {
      expedienteId,
      cambios: requisitos.map((r: any) => ({
        expedienteDocumentoId: r.expedienteDocumentoId,
        estado: r.obligatorio ? "ENTREGADO" : "NO_APLICA",
      })),
    });
    const res = h.pedir("documentacion.solicitud.crear", { solicitud: { expedienteId } });
    expect(res.ok).toBe(false);
    expect(res.error.message).toMatch(/no hay requisitos/i);
  });

  it("el seguimiento cuenta recordatorios y deja comentario operativo", () => {
    const h = loadInstalledBackend();
    const { expedienteId } = crearExpediente(h);
    const solicitud = h.ok("documentacion.solicitud.crear", { solicitud: { expedienteId } });

    const res = h.ok("documentacion.solicitud.seguimiento", {
      solicitudId: solicitud.solicitudId,
      nota: "Llamada telefónica: se compromete para el lunes.",
    });
    expect(res.recordatorios).toBe(1);
    expect(res.estado).toBe("EN_SEGUIMIENTO");

    const comentarios = h.ok("documentacion.comentarios.listar", { filtros: { expedienteId } }).comentarios;
    expect(comentarios.some((c: any) => c.contenido.match(/Llamada telefónica/))).toBe(true);
  });

  it("una solicitud vencida pasa a VENCIDA y abre seguimiento en el proceso diario", () => {
    const h = loadInstalledBackend();
    const { expedienteId } = crearExpediente(h);
    h.ok("documentacion.solicitud.crear", {
      solicitud: { expedienteId, fechaLimite: h.read<string>("doc2FechaMasDias_(2)") },
    });

    h.advanceClock(5 * 86400000);
    const diario = h.ok("documentacion.proceso.diario", {});
    expect(diario.solicitudesVencidas).toBe(1);

    const vista = h.ok("documentacion.solicitudes.listar", { filtros: { expedienteId } }).solicitudes[0];
    expect(vista.estado).toBe("VENCIDA");
    expect(vista.vencida).toBe(true);

    const tareas = h.ok("documentacion.tareas.listar", { filtros: { expedienteId } }).tareas;
    expect(tareas.some((t: any) => t.origenTipo === "solicitud")).toBe(true);
  });

  it("el filtro de solicitudes vencidas alcanza al listado de expedientes", () => {
    const h = loadInstalledBackend();
    const { expedienteId } = crearExpediente(h);
    h.ok("documentacion.solicitud.crear", {
      solicitud: { expedienteId, fechaLimite: h.read<string>("doc2FechaMasDias_(1)") },
    });
    h.advanceClock(3 * 86400000);

    const listado = h.ok("documentacion.expedientes.listar", { filtros: { conSolicitudesVencidas: true } });
    expect(listado.total).toBe(1);
  });
});

describe("documentación · solicitudes masivas", () => {
  it("el impacto se calcula sin escribir nada y avisa de los duplicados", () => {
    const h = loadInstalledBackend();
    const a = crearExpediente(h, { identificador: "CI-M1-2026", agencia: "LA PAZ" });
    crearExpediente(h, { identificador: "CI-M2-2026", agencia: "LA PAZ" });
    h.ok("documentacion.solicitud.crear", { solicitud: { expedienteId: a.expedienteId } });
    const solicitudesAntes = h.rowsOf("SolicitudesDocumentales").length;

    const impacto = h.ok("documentacion.solicitudes.impacto", { seleccion: { agencia: "LA PAZ" } });
    expect(impacto.expedientes).toBe(2);
    expect(impacto.duplicadosPotenciales).toBe(1);
    expect(impacto.advertencias.join(" ")).toMatch(/solicitud abierta/i);
    expect(h.rowsOf("SolicitudesDocumentales").length).toBe(solicitudesAntes);
  });

  it("la operación masiva exige confirmación explícita", () => {
    const h = loadInstalledBackend();
    crearExpediente(h, { identificador: "CI-M3-2026" });
    const res = h.pedir("documentacion.solicitudes.masiva", { seleccion: { todos: true } });
    expect(res.ok).toBe(false);
    expect(res.error.message).toMatch(/confirmación/i);
  });

  it("crea las solicitudes por lotes, omite duplicados y permite reanudar", () => {
    const h = loadInstalledBackend();
    for (let i = 0; i < 5; i++) crearExpediente(h, { identificador: `CI-MM${i}-2026`, agencia: "EL ALTO" });

    const primerLote = h.ok("documentacion.solicitudes.masiva", {
      seleccion: { agencia: "EL ALTO" },
      confirmado: true,
      lote: 2,
    });
    expect(primerLote.creadas).toBe(2);
    expect(primerLote.quedan).toBe(true);
    expect(primerLote.progreso).toBe(40);

    const segundoLote = h.ok("documentacion.solicitudes.masiva", {
      seleccion: { agencia: "EL ALTO" },
      confirmado: true,
      lote: 10,
      desde: primerLote.siguiente,
    });
    expect(segundoLote.creadas).toBe(3);
    expect(segundoLote.quedan).toBe(false);
    expect(h.rowsOf("SolicitudesDocumentales").length).toBe(5);

    // Repetir sin permitir duplicados no crea nada nuevo.
    const tercera = h.ok("documentacion.solicitudes.masiva", {
      seleccion: { agencia: "EL ALTO" },
      confirmado: true,
    });
    expect(tercera.creadas).toBe(0);
    expect(tercera.omitidas).toBe(5);
  });
});

describe("documentación · prórrogas", () => {
  it("las dos prórrogas del proceso siguen funcionando", () => {
    const h = loadInstalledBackend();
    const { requisitos } = crearExpediente(h);
    const cert = requisitos.find((r: any) => r.codigo === "cert-trabajo")!;
    const titulo = requisitos.find((r: any) => r.codigo === "titulo-legalizado")!;
    expect(cert.permiteProrroga).toBe(true);
    expect(titulo.permiteProrroga).toBe(true);

    const uno = h.ok("documentacion.prorroga.crear", {
      prorroga: {
        expedienteDocumentoId: cert.expedienteDocumentoId,
        fechaProrroga: h.read<string>("doc2FechaMasDias_(30)"),
        motivo: "El empleador anterior tarda en emitirlo.",
      },
    });
    expect(uno.estado).toBe("VIGENTE");

    const dos = h.ok("documentacion.prorroga.crear", {
      prorroga: {
        expedienteDocumentoId: titulo.expedienteDocumentoId,
        fechaProrroga: h.read<string>("doc2FechaMasDias_(45)"),
        motivo: "Título en legalización.",
      },
    });
    expect(dos.estado).toBe("VIGENTE");
    expect(dos.resumen.total_prorrogas).toBe(2);
  });

  it("un requisito sin prórroga habilitada la rechaza", () => {
    const h = loadInstalledBackend();
    const { requisitos } = crearExpediente(h);
    const foto = requisitos.find((r: any) => r.codigo === "foto-4x4")!;
    const res = h.pedir("documentacion.prorroga.crear", {
      prorroga: { expedienteDocumentoId: foto.expedienteDocumentoId, fechaProrroga: "2026-12-01", motivo: "x" },
    });
    expect(res.ok).toBe(false);
    expect(res.error.fields.codigo_documento).toBeTruthy();
  });

  it("exige motivo, fecha futura y respeta el máximo configurable", () => {
    const h = loadInstalledBackend();
    const { requisitos } = crearExpediente(h);
    const cert = requisitos.find((r: any) => r.codigo === "cert-trabajo")!;

    const sinMotivo = h.pedir("documentacion.prorroga.crear", {
      prorroga: { expedienteDocumentoId: cert.expedienteDocumentoId, fechaProrroga: h.read<string>("doc2FechaMasDias_(10)") },
    });
    expect(sinMotivo.error.fields.motivo).toBeTruthy();

    const enPasado = h.pedir("documentacion.prorroga.crear", {
      prorroga: { expedienteDocumentoId: cert.expedienteDocumentoId, fechaProrroga: "2020-01-01", motivo: "x" },
    });
    expect(enPasado.error.fields.fecha_prorroga).toBeTruthy();

    const demasiado = h.pedir("documentacion.prorroga.crear", {
      prorroga: {
        expedienteDocumentoId: cert.expedienteDocumentoId,
        fechaProrroga: h.read<string>("doc2FechaMasDias_(200)"),
        motivo: "x",
      },
    });
    expect(demasiado.error.message).toMatch(/máximo/i);

    // El máximo es configurable.
    h.ok("documentacion.configuracion.guardar", { configuracion: { prorroga_maxima_dias: 365 } });
    const ahoraSi = h.pedir("documentacion.prorroga.crear", {
      prorroga: {
        expedienteDocumentoId: cert.expedienteDocumentoId,
        fechaProrroga: h.read<string>("doc2FechaMasDias_(200)"),
        motivo: "Caso excepcional autorizado.",
      },
    });
    expect(ahoraSi.ok).toBe(true);
  });

  it("una prórroga nueva sustituye a la vigente en lugar de acumularse", () => {
    const h = loadInstalledBackend();
    const { requisitos } = crearExpediente(h);
    const cert = requisitos.find((r: any) => r.codigo === "cert-trabajo")!;

    h.ok("documentacion.prorroga.crear", {
      prorroga: { expedienteDocumentoId: cert.expedienteDocumentoId, fechaProrroga: h.read<string>("doc2FechaMasDias_(10)"), motivo: "Primera." },
    });
    const segunda = h.ok("documentacion.prorroga.crear", {
      prorroga: { expedienteDocumentoId: cert.expedienteDocumentoId, fechaProrroga: h.read<string>("doc2FechaMasDias_(20)"), motivo: "Ampliación." },
    });
    expect(segunda.resumen.total_prorrogas).toBe(1);
    expect(h.rowsOf("ExpedienteProrrogas").length).toBe(2);
    const canceladas = h.rowsOf("ExpedienteProrrogas").filter((p) => p.estado_prorroga === "CANCELADA");
    expect(canceladas.length).toBe(1);
  });

  it("los días restantes se calculan al leer y distinguen vigente, por vencer y vencida", () => {
    const h = loadInstalledBackend();
    const { requisitos } = crearExpediente(h);
    const cert = requisitos.find((r: any) => r.codigo === "cert-trabajo")!;
    h.ok("documentacion.prorroga.crear", {
      prorroga: { expedienteDocumentoId: cert.expedienteDocumentoId, fechaProrroga: h.read<string>("doc2FechaMasDias_(10)"), motivo: "Plazo." },
    });

    let vista = h.ok("documentacion.prorrogas.listar", {}).prorrogas[0];
    expect(vista.diasRestantes).toBe(10);
    expect(vista.situacion).toBe("vigente");

    h.advanceClock(8 * 86400000);
    vista = h.ok("documentacion.prorrogas.listar", {}).prorrogas[0];
    expect(vista.diasRestantes).toBe(2);
    expect(vista.situacion).toBe("por_vencer");

    h.advanceClock(5 * 86400000);
    vista = h.ok("documentacion.prorrogas.listar", {}).prorrogas[0];
    expect(vista.situacion).toBe("vencida");
    expect(vista.diasRestantes).toBeLessThan(0);
  });

  it("el proceso diario avisa una sola vez por día aunque se ejecute dos veces", () => {
    const h = loadInstalledBackend();
    const { requisitos } = crearExpediente(h);
    const cert = requisitos.find((r: any) => r.codigo === "cert-trabajo")!;
    h.ok("documentacion.prorroga.crear", {
      prorroga: { expedienteDocumentoId: cert.expedienteDocumentoId, fechaProrroga: h.read<string>("doc2FechaMasDias_(2)"), motivo: "Plazo corto." },
    });

    const primera = h.ok("documentacion.proceso.diario", {});
    expect(primera.prorrogasAvisadas).toBe(1);
    const avisos1 = h.rowsOf("NotificacionesDocumentales").length;

    // Un disparador duplicado ejecutaría el proceso otra vez el mismo día.
    const segunda = h.ok("documentacion.proceso.diario", {});
    expect(segunda.prorrogasAvisadas).toBe(0);
    expect(h.rowsOf("NotificacionesDocumentales").length).toBe(avisos1);
  });

  it("una prórroga vencida marca el expediente y aparece en el filtro", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisitos } = crearExpediente(h);
    const cert = requisitos.find((r: any) => r.codigo === "cert-trabajo")!;
    h.ok("documentacion.prorroga.crear", {
      prorroga: { expedienteDocumentoId: cert.expedienteDocumentoId, fechaProrroga: h.read<string>("doc2FechaMasDias_(1)"), motivo: "Plazo." },
    });
    h.advanceClock(3 * 86400000);
    h.ok("documentacion.proceso.diario", {});

    const detalle = h.ok("documentacion.expediente.obtener", { expedienteId });
    expect(detalle.expediente.totales.prorrogasVencidas).toBe(1);

    const listado = h.ok("documentacion.expedientes.listar", { filtros: { conProrrogasVencidas: true } });
    expect(listado.total).toBe(1);
  });
});

describe("documentación · tareas y comentarios", () => {
  it("una tarea se crea, se asigna, se bloquea con motivo y se completa", () => {
    const h = loadInstalledBackend();
    const { expedienteId } = crearExpediente(h);

    const creada = h.ok("documentacion.tarea.crear", {
      tarea: { expedienteId, titulo: "Pedir el REJAP", tipo: "SEGUIMIENTO", prioridad: "ALTA" },
    });
    expect(creada.fechaLimite).toBeTruthy();

    const sinMotivo = h.pedir("documentacion.tarea.estado", { tareaId: creada.tareaId, estado: "BLOQUEADA" });
    expect(sinMotivo.ok).toBe(false);
    expect(sinMotivo.error.fields.motivo).toBeTruthy();

    h.ok("documentacion.tarea.estado", {
      tareaId: creada.tareaId,
      estado: "BLOQUEADA",
      motivo: "La persona está de viaje.",
    });
    h.ok("documentacion.tarea.actualizar", { tareaId: creada.tareaId, cambios: { responsableId: "otra@bdp.com" } });
    const completada = h.ok("documentacion.tarea.estado", { tareaId: creada.tareaId, estado: "COMPLETADA" });
    expect(completada.estado).toBe("COMPLETADA");

    const tarea = h.ok("documentacion.tareas.listar", { filtros: { expedienteId } }).tareas[0];
    expect(tarea.completadoEn).toBeTruthy();
    expect(tarea.responsableId).toBe("otra@bdp.com");
  });

  it("las tareas vencidas se marcan y se pueden filtrar", () => {
    const h = loadInstalledBackend();
    const { expedienteId } = crearExpediente(h);
    h.ok("documentacion.tarea.crear", {
      tarea: { expedienteId, titulo: "Cerrar el expediente", fechaLimite: h.read<string>("doc2FechaMasDias_(1)") },
    });
    h.advanceClock(3 * 86400000);
    const diario = h.ok("documentacion.proceso.diario", {});
    expect(diario.tareasVencidas).toBe(1);

    const vencidas = h.ok("documentacion.tareas.listar", { filtros: { soloVencidas: true } });
    expect(vencidas.total).toBe(1);
    expect(vencidas.tareas[0].estado).toBe("VENCIDA");
    expect(vencidas.tareas[0].escalada).toBe(true);
  });

  it("archivar el expediente cancela sus tareas abiertas con su motivo", () => {
    const h = loadInstalledBackend();
    const { expedienteId } = crearExpediente(h);
    h.ok("documentacion.tarea.crear", { tarea: { expedienteId, titulo: "Tarea que quedará abierta" } });
    h.ok("documentacion.expediente.archivar", { expedienteId });

    const tareas = h.ok("documentacion.tareas.listar", { filtros: { expedienteId } }).tareas;
    expect(tareas[0].estado).toBe("CANCELADA");
    const historial = h.ok("documentacion.historial.consultar", { expedienteId }).historial;
    expect(historial.some((x: any) => (x.motivo || "").match(/archiv/i))).toBe(true);
  });

  it("los comentarios internos no se devuelven a quien solo puede ver", () => {
    const h = loadInstalledBackend();
    const { expedienteId } = crearExpediente(h);
    h.ok("documentacion.comentario.crear", {
      comentario: { expedienteId, contenido: "Nota interna: insistir el viernes.", visibilidad: "INTERNA" },
    });
    h.ok("documentacion.comentario.crear", {
      comentario: { expedienteId, contenido: "Se recibió el CV en original.", visibilidad: "FORMAL" },
    });
    h.ok("documentacion.permisos.guardar", { roles: { "pasante@bdp.com": "pasante" } });

    const comoAdmin = h.ok("documentacion.expediente.obtener", { expedienteId });
    expect(comoAdmin.comentarios.length).toBe(2);

    const comoPasante = h.ok("documentacion.expediente.obtener", { expedienteId }, { actor: "pasante@bdp.com" });
    expect(comoPasante.comentarios.length).toBe(1);
    expect(comoPasante.comentarios[0].visibilidad).toBe("FORMAL");
  });

  it("editar un comentario guarda la versión anterior en el historial", () => {
    const h = loadInstalledBackend();
    const { expedienteId } = crearExpediente(h);
    const creado = h.ok("documentacion.comentario.crear", {
      comentario: { expedienteId, contenido: "Texto original." },
    });
    h.ok("documentacion.comentario.editar", { comentarioId: creado.comentarioId, contenido: "Texto corregido." });

    const historial = h.ok("documentacion.historial.consultar", { expedienteId }).historial;
    const linea = historial.find((x: any) => x.entidadTipo === "comentario");
    expect(linea.anterior).toBe("Texto original.");
    expect(linea.nuevo).toBe("Texto corregido.");
  });

  it("responder a un comentario de otro expediente se rechaza", () => {
    const h = loadInstalledBackend();
    const a = crearExpediente(h, { identificador: "CI-C1-2026" });
    const b = crearExpediente(h, { identificador: "CI-C2-2026" });
    expect(b.expedienteId).toBeTruthy();
    const enA = h.ok("documentacion.comentario.crear", { comentario: { expedienteId: a.expedienteId, contenido: "Hola." } });

    const res = h.pedir("documentacion.comentario.crear", {
      comentario: { expedienteId: b.expedienteId, contenido: "Respuesta cruzada", comentarioPadreId: enA.comentarioId },
    });
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe("RELACION_INVALIDA");
  });

  it("resolver y reabrir un comentario deja rastro", () => {
    const h = loadInstalledBackend();
    const { expedienteId } = crearExpediente(h);
    const creado = h.ok("documentacion.comentario.crear", { comentario: { expedienteId, contenido: "Pendiente de revisar." } });

    h.ok("documentacion.comentario.resolver", { comentarioId: creado.comentarioId, resuelto: true });
    let lista = h.ok("documentacion.comentarios.listar", { filtros: { expedienteId } }).comentarios;
    expect(lista[0].resuelto).toBe(true);

    h.ok("documentacion.comentario.resolver", { comentarioId: creado.comentarioId, resuelto: false });
    lista = h.ok("documentacion.comentarios.listar", { filtros: { expedienteId, soloAbiertos: true } }).comentarios;
    expect(lista.length).toBe(1);
  });
});

describe("documentación · centro de notificaciones", () => {
  it("cuenta las no leídas, permite marcarlas y sabe a qué entidad pertenecen", () => {
    const h = loadInstalledBackend();
    const { expedienteId } = crearExpediente(h);
    h.ok("documentacion.tarea.crear", { tarea: { expedienteId, titulo: "Revisar", responsableId: "auxiliar@bdp.com" } });

    const listado = h.ok("documentacion.notificaciones.listar", {});
    expect(listado.total).toBeGreaterThan(0);
    expect(listado.noLeidas).toBeGreaterThan(0);
    const primera = listado.notificaciones[0];
    expect(primera.entidadTipo).toBe("tarea");
    expect(primera.entidadId).toBeTruthy();

    h.ok("documentacion.notificacion.leer", { notificacionId: primera.notificacionId });
    const despues = h.ok("documentacion.notificaciones.listar", { filtros: { soloNoLeidas: true } });
    expect(despues.notificaciones.length).toBe(listado.notificaciones.length - 1);

    h.ok("documentacion.notificaciones.leerTodas", {});
    expect(h.ok("documentacion.notificaciones.listar", {}).noLeidas).toBe(0);
  });

  it("el correo está apagado por defecto: no se envía nada a nadie", () => {
    const h = loadInstalledBackend();
    const { expedienteId } = crearExpediente(h);
    h.ok("documentacion.tarea.crear", { tarea: { expedienteId, titulo: "Tarea", responsableId: "persona@bdp.com" } });

    expect(h.state.mails.length).toBe(0);
    const notificacion = h.rowsOf("NotificacionesDocumentales")[0];
    expect(notificacion.canal).toBe("INTERNO");
    expect(notificacion.estado_envio).toBe("ENTREGADA");
  });

  it("con el correo habilitado se envía y se registra el envío", () => {
    const h = loadInstalledBackend();
    h.ok("documentacion.configuracion.guardar", { configuracion: { correo_habilitado: true } });
    const { expedienteId } = crearExpediente(h);
    h.ok("documentacion.tarea.crear", { tarea: { expedienteId, titulo: "Tarea", responsableId: "persona@bdp.com" } });

    expect(h.state.mails.length).toBe(1);
    expect(h.state.mails[0].to).toBe("persona@bdp.com");
    const notificacion = h.rowsOf("NotificacionesDocumentales").find((n) => n.canal === "CORREO")!;
    expect(notificacion.estado_envio).toBe("ENVIADA");
  });
});

describe("documentación · automatizaciones", () => {
  it("se pueden desactivar por configuración", () => {
    const h = loadInstalledBackend();
    h.ok("documentacion.configuracion.guardar", {
      configuracion: { automatizaciones_desactivadas: ["tarea-por-observacion"] },
    });
    const { expedienteId, requisito } = expedienteConEntrega(h);
    h.ok("documentacion.revision.decidir", {
      revision: {
        expedienteDocumentoId: requisito.expedienteDocumentoId,
        estado: "OBSERVADO",
        motivo: "FALTAN_DATOS",
        comentario: "Falta algo.",
      },
    });
    const tareas = h.ok("documentacion.tareas.listar", { filtros: { expedienteId } }).tareas;
    expect(tareas.length).toBe(0);
  });

  it("un fallo al notificar no tumba la operación que lo provocó", () => {
    const h = loadInstalledBackend();
    const { expedienteId } = crearExpediente(h);
    // Se rompe la hoja de notificaciones quitándole una cabecera: escribir en ella
    // fallará. La tarea tiene que crearse igual.
    h.spreadsheet.getSheetByName("NotificacionesDocumentales")!.getRange(1, 3, 1, 1).setValue("");

    const res = h.pedir("documentacion.tarea.crear", {
      tarea: { expedienteId, titulo: "Tarea que no se puede notificar" },
    });
    expect(res.ok).toBe(true);
    expect(h.rowsOf("TareasDocumentales").length).toBe(1);
    expect(h.state.warnings.join(" ")).toMatch(/notificación/i);
  });

  it("el fallo de una automatización queda auditado con su motivo", () => {
    const h = loadInstalledBackend();
    // Se emite un evento con un expediente que no existe: la automatización
    // «completar-expediente» intentará recalcularlo y fallará.
    h.call("doc2Emitir_", "documento.actualizado", { expedienteId: "exp_inexistente" }, h.ctx());
    h.call("docCommit_");

    const auditoria = h.rowsOf("AuditoriaDocumentacion");
    const fallo = auditoria.find((a) => a.evento_tipo === "automatizacion.error");
    expect(fallo).toBeTruthy();
    expect(fallo!.resultado).toBe("error");
    expect(String(fallo!.metadata_json)).toMatch(/completar-expediente|No existe/);
  });
});
