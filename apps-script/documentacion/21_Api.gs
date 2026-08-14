/**
 * 21_Api.gs — controladores públicos del módulo normalizado.
 *
 * ── Qué es un controlador aquí ───────────────────────────────────────────────
 * Una función de ocho líneas: acepta el sobre de la petición, saca los campos que
 * le interesan, llama a UN servicio y devuelve lo que este responda. Nada más. La
 * validación de datos, la autorización y las reglas viven en los servicios, que es
 * donde se pueden probar sin simular una petición HTTP.
 *
 * Se declaran en un registro (`DOC2_API`) en lugar de un `switch` gigante por tres
 * razones prácticas: el enrutador puede preguntar si una acción escribe (y así
 * decidir el bloqueo y la idempotencia sin duplicar la lista), la respuesta de
 * error puede enumerar las acciones disponibles, y el verificador de coherencia
 * del repositorio puede comparar este registro con el cliente del frontend y
 * detectar una acción que el navegador llama y el backend no atiende.
 *
 * ── Contrato de respuesta ────────────────────────────────────────────────────
 * El enrutador envuelve todo en la misma forma, que ahora incluye las claves
 * antiguas y las nuevas a la vez:
 *
 *   { ok, data, datos, error: { code, codigo, message, mensaje, fields, pista },
 *     meta: { requestId, timestamp, version, traza, backend, ... } }
 *
 * Los alias no son suciedad: son compatibilidad. El frontend anterior lee `datos`
 * y `error.codigo`; el nuevo lee `data` y `error.code`. Mantener los dos permite
 * desplegar el backend sin desplegar el frontend a la vez, que es exactamente la
 * situación en la que uno quiere estar el día del despliegue.
 */

/* ========================================================================== */
/* Registro de acciones                                                        */
/* ========================================================================== */

/**
 * `escribe`     necesita bloqueo, confirmación e idempotencia;
 * `instalado`   exige que el modelo normalizado exista (por defecto, sí);
 * `capacidad`   comprobación temprana; el servicio la vuelve a exigir.
 */
var DOC2_API = {

  /* --- Estado, vocabulario y catálogos ---------------------------------- */
  'documentacion.estado': {
    escribe: false, instalado: false,
    fn: function (p, ctx) { return doc2Estado_(ctx); }
  },
  'documentacion.vocabulario': {
    escribe: false, instalado: false,
    fn: function () { return doc2Vocabulario_(); }
  },
  'documentacion.catalogo': {
    escribe: false, capacidad: DOC2_CAPACIDAD.VER,
    fn: function () { return doc2CatalogoParaCliente_(); }
  },
  'documentacion.catalogo.guardar': {
    escribe: true, capacidad: DOC2_CAPACIDAD.CATALOGOS,
    fn: function (p, ctx) { return doc2CatalogoGuardar_(p.catalogo || p.documentos || [], ctx); }
  },
  'documentacion.auxiliares': {
    escribe: false, capacidad: DOC2_CAPACIDAD.VER,
    fn: function () { return { auxiliares: doc2Auxiliares_(), revision: doc2DiagnosticarAuxiliar_() }; }
  },
  'documentacion.auxiliares.agregar': {
    escribe: true, capacidad: DOC2_CAPACIDAD.CATALOGOS,
    fn: function (p, ctx) {
      doc2Autorizar_(ctx, DOC2_CAPACIDAD.CATALOGOS);
      return doc2AgregarAuxiliar_(String(p.columna || ''), p.valores || []);
    }
  },

  /* --- Instalación, migración y mantenimiento --------------------------- */
  'documentacion.instalar': {
    escribe: true, instalado: false, capacidad: DOC2_CAPACIDAD.MIGRAR,
    fn: function (p, ctx) { return doc2Instalar_({ simular: p.simular === true, lote: p.lote, conRespaldo: p.conRespaldo !== false }, ctx); }
  },
  'documentacion.migrar': {
    escribe: true, instalado: false, capacidad: DOC2_CAPACIDAD.MIGRAR,
    fn: function (p, ctx) { return doc2Migrar_({ simular: p.simular === true, lote: p.lote, version: p.version }, ctx); }
  },
  'documentacion.migraciones.estado': {
    escribe: false, instalado: false, capacidad: DOC2_CAPACIDAD.VER,
    fn: function () { return doc2EstadoMigraciones_(); }
  },
  'documentacion.respaldo': {
    escribe: true, instalado: false, capacidad: DOC2_CAPACIDAD.MIGRAR,
    fn: function (p, ctx) { return doc2RespaldoPrevio_(ctx); }
  },
  'documentacion.diagnostico': {
    escribe: false, instalado: false, capacidad: DOC2_CAPACIDAD.DIAGNOSTICAR,
    fn: function (p, ctx) { return doc2Diagnostico_(ctx); }
  },
  'documentacion.inconsistencias': {
    escribe: false, capacidad: DOC2_CAPACIDAD.DIAGNOSTICAR,
    fn: function (p, ctx) { return { hallazgos: doc2Inconsistencias_(ctx) }; }
  },
  'documentacion.reparar': {
    escribe: true, instalado: false, capacidad: DOC2_CAPACIDAD.REPARAR,
    fn: function (p, ctx) {
      return doc2Reparar_({
        acciones: p.acciones || [],
        confirmado: p.confirmado === true,
        incluirConfirmacion: p.incluirConfirmacion === true
      }, ctx);
    }
  },
  'documentacion.proceso.diario': {
    escribe: true, capacidad: DOC2_CAPACIDAD.REPARAR,
    fn: function (p, ctx) { return doc2ProcesoDiario_(ctx); }
  },

  /* --- Panel, reportes y exportaciones ---------------------------------- */
  'documentacion.panel': {
    escribe: false, capacidad: DOC2_CAPACIDAD.VER,
    fn: function (p, ctx) { return doc2Panel_(p.filtros || p, ctx); }
  },
  'documentacion.reporte': {
    escribe: false, capacidad: DOC2_CAPACIDAD.VER,
    fn: function (p, ctx) { return doc2Reporte_(p.tipo || 'resumen', p.filtros || {}, ctx); }
  },
  'documentacion.reportes.disponibles': {
    escribe: false, capacidad: DOC2_CAPACIDAD.VER,
    fn: function () { return { reportes: DOC2_REPORTES }; }
  },
  'documentacion.exportacion.iniciar': {
    escribe: true, capacidad: DOC2_CAPACIDAD.EXPORTAR,
    fn: function (p, ctx) { return doc2ExportarIniciar_(p, ctx); }
  },
  'documentacion.exportacion.lote': {
    escribe: true, capacidad: DOC2_CAPACIDAD.EXPORTAR,
    fn: function (p, ctx) { return doc2ExportarLote_(p.exportacionId || p.id, ctx, { lote: p.lote }); }
  },
  'documentacion.exportacion.cancelar': {
    escribe: true, capacidad: DOC2_CAPACIDAD.EXPORTAR,
    fn: function (p, ctx) { return doc2ExportarCancelar_(p.exportacionId || p.id, ctx); }
  },
  'documentacion.exportaciones.listar': {
    escribe: false, capacidad: DOC2_CAPACIDAD.EXPORTAR,
    fn: function (p, ctx) { return doc2ListarExportaciones_(p, ctx); }
  },

  /* --- Expedientes ------------------------------------------------------ */
  'documentacion.expedientes.listar': {
    escribe: false, capacidad: DOC2_CAPACIDAD.VER,
    fn: function (p, ctx) { return doc2ListarExpedientes_(p.filtros || p, ctx); }
  },
  'documentacion.expediente.obtener': {
    escribe: false, capacidad: DOC2_CAPACIDAD.VER,
    fn: function (p, ctx) {
      return doc2ExpedienteOperativo_(p.expedienteId || p.identificador || p.id, ctx, {
        historial: p.historial, auditoria: p.auditoria, incluirArchivados: p.incluirArchivados === true
      });
    }
  },
  'documentacion.expediente.crear': {
    escribe: true, capacidad: DOC2_CAPACIDAD.EDITAR,
    fn: function (p, ctx) { return doc2CrearExpediente_(p.expediente || p, ctx); }
  },
  'documentacion.expediente.actualizar': {
    escribe: true, capacidad: DOC2_CAPACIDAD.EDITAR,
    fn: function (p, ctx) {
      return doc2ActualizarExpediente_(p.expedienteId || p.id, p.cambios || p.expediente || {}, ctx, { version: p.version });
    }
  },
  'documentacion.expediente.estado': {
    escribe: true, capacidad: DOC2_CAPACIDAD.EDITAR,
    fn: function (p, ctx) {
      return doc2CambiarEstadoExpediente_(p.expedienteId || p.id, p.estado, ctx, { version: p.version, motivo: p.motivo });
    }
  },
  'documentacion.expediente.sincronizar': {
    escribe: true, capacidad: DOC2_CAPACIDAD.EDITAR,
    fn: function (p, ctx) {
      doc2Autorizar_(ctx, DOC2_CAPACIDAD.EDITAR);
      var r = doc2SincronizarRequisitos_(p.expedienteId || p.id, ctx);
      r.resumen = doc2RecalcularExpediente_(p.expedienteId || p.id, ctx);
      return r;
    }
  },
  'documentacion.expediente.recalcular': {
    escribe: true, capacidad: DOC2_CAPACIDAD.EDITAR,
    fn: function (p, ctx) {
      doc2Autorizar_(ctx, DOC2_CAPACIDAD.EDITAR);
      return doc2RecalcularExpediente_(p.expedienteId || p.id, ctx);
    }
  },
  'documentacion.expediente.archivar': {
    escribe: true, capacidad: DOC2_CAPACIDAD.ARCHIVAR,
    fn: function (p, ctx) { return doc2ArchivarExpediente_(p.expedienteId || p.id, ctx, { motivo: p.motivo, version: p.version }); }
  },
  'documentacion.expediente.restaurar': {
    escribe: true, capacidad: DOC2_CAPACIDAD.RESTAURAR,
    fn: function (p, ctx) { return doc2RestaurarExpediente_(p.expedienteId || p.id, ctx, { motivo: p.motivo }); }
  },
  'documentacion.expediente.conservacion': {
    escribe: true, capacidad: DOC2_CAPACIDAD.ARCHIVAR,
    fn: function (p, ctx) { return doc2BloquearConservacion_(p.expedienteId || p.id, p.bloquear !== false, ctx, p.motivo); }
  },
  'documentacion.expediente.laboral': {
    escribe: false, capacidad: DOC2_CAPACIDAD.APROBAR,
    fn: function (p, ctx) {
      return doc2PrepararExpedienteLaboral_(p.expedienteId || p.id, ctx, { registrarCierre: p.registrarCierre === true });
    }
  },

  /* --- Requisitos ------------------------------------------------------- */
  'documentacion.requisito.actualizar': {
    escribe: true, capacidad: DOC2_CAPACIDAD.EDITAR,
    fn: function (p, ctx) {
      return doc2ActualizarRequisito_(p.expedienteDocumentoId || p.id, p.cambios || p, ctx, { version: p.version });
    }
  },
  'documentacion.requisitos.guardar': {
    escribe: true, capacidad: DOC2_CAPACIDAD.EDITAR,
    fn: function (p, ctx) { return doc2ActualizarRequisitosEnLote_(p.expedienteId || p.id, p.cambios || [], ctx); }
  },

  /* --- Prórrogas -------------------------------------------------------- */
  'documentacion.prorroga.crear': {
    escribe: true, capacidad: DOC2_CAPACIDAD.EDITAR,
    fn: function (p, ctx) { return doc2CrearProrroga_(p.prorroga || p, ctx); }
  },
  'documentacion.prorroga.actualizar': {
    escribe: true, capacidad: DOC2_CAPACIDAD.EDITAR,
    fn: function (p, ctx) { return doc2ActualizarProrroga_(p.prorrogaId || p.id, p.cambios || p, ctx, { version: p.version }); }
  },
  'documentacion.prorroga.estado': {
    escribe: true, capacidad: DOC2_CAPACIDAD.EDITAR,
    fn: function (p, ctx) { return doc2CambiarEstadoProrroga_(p.prorrogaId || p.id, p.estado, ctx, { version: p.version, motivo: p.motivo }); }
  },
  'documentacion.prorrogas.listar': {
    escribe: false, capacidad: DOC2_CAPACIDAD.VER,
    fn: function (p, ctx) { return doc2ListarProrrogas_(p.filtros || p, ctx); }
  },

  /* --- Solicitudes ------------------------------------------------------ */
  'documentacion.solicitud.crear': {
    escribe: true, capacidad: DOC2_CAPACIDAD.SOLICITAR,
    fn: function (p, ctx) { return doc2CrearSolicitud_(p.solicitud || p, ctx); }
  },
  'documentacion.solicitud.estado': {
    escribe: true, capacidad: DOC2_CAPACIDAD.SOLICITAR,
    fn: function (p, ctx) { return doc2CambiarEstadoSolicitud_(p.solicitudId || p.id, p.estado, ctx, { version: p.version, motivo: p.motivo }); }
  },
  'documentacion.solicitud.seguimiento': {
    escribe: true, capacidad: DOC2_CAPACIDAD.SOLICITAR,
    fn: function (p, ctx) { return doc2RegistrarSeguimiento_(p.solicitudId || p.id, p.nota, ctx); }
  },
  'documentacion.solicitudes.listar': {
    escribe: false, capacidad: DOC2_CAPACIDAD.VER,
    fn: function (p, ctx) { return doc2ListarSolicitudes_(p.filtros || p, ctx); }
  },
  'documentacion.solicitudes.impacto': {
    escribe: false, capacidad: DOC2_CAPACIDAD.SOLICITAR,
    fn: function (p, ctx) { return doc2ImpactoMasivo_(p.seleccion || p, ctx); }
  },
  'documentacion.solicitudes.masiva': {
    escribe: true, capacidad: DOC2_CAPACIDAD.SOLICITAR,
    fn: function (p, ctx) { return doc2SolicitudMasiva_(p, ctx); }
  },

  /* --- Revisiones y aprobaciones ---------------------------------------- */
  'documentacion.revision.decidir': {
    escribe: true, capacidad: DOC2_CAPACIDAD.REVISAR,
    fn: function (p, ctx) { return doc2DecidirRevision_(p.revision || p, ctx); }
  },
  'documentacion.revision.cola': {
    escribe: false, capacidad: DOC2_CAPACIDAD.VER,
    fn: function (p, ctx) { return doc2ColaRevision_(p.filtros || p, ctx); }
  },
  'documentacion.aprobacion.solicitar': {
    escribe: true, capacidad: DOC2_CAPACIDAD.REVISAR,
    fn: function (p, ctx) { return doc2SolicitarAprobacion_(p.aprobacion || p, ctx); }
  },
  'documentacion.aprobacion.resolver': {
    escribe: true, capacidad: DOC2_CAPACIDAD.APROBAR,
    fn: function (p, ctx) {
      return doc2ResolverAprobacion_(p.aprobacionId || p.id, p.decision || p.estado, ctx, {
        comentario: p.comentario, version: p.version
      });
    }
  },
  'documentacion.aprobaciones.listar': {
    escribe: false, capacidad: DOC2_CAPACIDAD.VER,
    fn: function (p, ctx) { return doc2ListarAprobaciones_(p.filtros || p, ctx); }
  },

  /* --- Comentarios ------------------------------------------------------ */
  'documentacion.comentario.crear': {
    escribe: true, capacidad: DOC2_CAPACIDAD.COMENTAR,
    fn: function (p, ctx) { return doc2CrearComentario_(p.comentario || p, ctx); }
  },
  'documentacion.comentario.editar': {
    escribe: true, capacidad: DOC2_CAPACIDAD.COMENTAR,
    fn: function (p, ctx) { return doc2EditarComentario_(p.comentarioId || p.id, p.contenido, ctx, { version: p.version }); }
  },
  'documentacion.comentario.resolver': {
    escribe: true, capacidad: DOC2_CAPACIDAD.COMENTAR,
    fn: function (p, ctx) { return doc2ResolverComentario_(p.comentarioId || p.id, p.resuelto !== false, ctx); }
  },
  'documentacion.comentarios.listar': {
    escribe: false, capacidad: DOC2_CAPACIDAD.VER,
    fn: function (p, ctx) { return doc2ListarComentarios_(p.filtros || p, ctx); }
  },

  /* --- Tareas ----------------------------------------------------------- */
  'documentacion.tarea.crear': {
    escribe: true, capacidad: DOC2_CAPACIDAD.TAREAS,
    fn: function (p, ctx) { return doc2CrearTarea_(p.tarea || p, ctx); }
  },
  'documentacion.tarea.actualizar': {
    escribe: true, capacidad: DOC2_CAPACIDAD.TAREAS,
    fn: function (p, ctx) { return doc2ActualizarTarea_(p.tareaId || p.id, p.cambios || p, ctx, { version: p.version }); }
  },
  'documentacion.tarea.estado': {
    escribe: true, capacidad: DOC2_CAPACIDAD.TAREAS,
    fn: function (p, ctx) { return doc2CambiarEstadoTarea_(p.tareaId || p.id, p.estado, ctx, { version: p.version, motivo: p.motivo }); }
  },
  'documentacion.tareas.listar': {
    escribe: false, capacidad: DOC2_CAPACIDAD.VER,
    fn: function (p, ctx) { return doc2ListarTareas_(p.filtros || p, ctx); }
  },

  /* --- Notificaciones --------------------------------------------------- */
  'documentacion.notificaciones.listar': {
    escribe: false, capacidad: DOC2_CAPACIDAD.VER,
    fn: function (p, ctx) { return doc2ListarNotificaciones_(p.filtros || p, ctx); }
  },
  'documentacion.notificacion.leer': {
    escribe: true, capacidad: DOC2_CAPACIDAD.VER,
    fn: function (p, ctx) { return doc2MarcarNotificacionLeida_(p.notificacionId || p.id, ctx); }
  },
  'documentacion.notificaciones.leerTodas': {
    escribe: true, capacidad: DOC2_CAPACIDAD.VER,
    fn: function (p, ctx) { return doc2MarcarTodasLeidas_(ctx); }
  },

  /* --- Consentimientos, retención y archivo ----------------------------- */
  'documentacion.consentimiento.presentar': {
    escribe: true, capacidad: DOC2_CAPACIDAD.EDITAR,
    fn: function (p, ctx) { return doc2PresentarConsentimiento_(p.consentimiento || p, ctx); }
  },
  'documentacion.consentimiento.responder': {
    escribe: true, capacidad: DOC2_CAPACIDAD.EDITAR,
    fn: function (p, ctx) {
      return doc2ResponderConsentimiento_(p.consentimientoId || p.id, p.estado, ctx, {
        evidencia: p.evidencia, motivo: p.motivo, version: p.version
      });
    }
  },
  'documentacion.consentimientos.listar': {
    escribe: false, capacidad: DOC2_CAPACIDAD.VER,
    fn: function (p, ctx) { return doc2ListarConsentimientos_(p.filtros || p, ctx); }
  },
  'documentacion.retencion.politicas': {
    escribe: false, capacidad: DOC2_CAPACIDAD.VER,
    fn: function (p, ctx) {
      doc2Autorizar_(ctx, DOC2_CAPACIDAD.VER);
      return { politicas: doc2All_(DOC2_SHEET.RETENCION, true) };
    }
  },
  'documentacion.retencion.aplicar': {
    escribe: true, capacidad: DOC2_CAPACIDAD.ARCHIVAR,
    fn: function (p, ctx) {
      doc2Autorizar_(ctx, DOC2_CAPACIDAD.ARCHIVAR);
      return doc2AplicarRetencion_(ctx);
    }
  },
  'documentacion.retencion.planAnonimizacion': {
    escribe: false, capacidad: DOC2_CAPACIDAD.ARCHIVAR,
    fn: function (p, ctx) { return doc2PlanAnonimizacion_(p.expedienteId || p.id, ctx); }
  },
  'documentacion.retencion.anonimizar': {
    escribe: true, capacidad: DOC2_CAPACIDAD.ARCHIVAR,
    fn: function (p, ctx) { return doc2Anonimizar_(p.expedienteId || p.id, ctx, { confirmado: p.confirmado === true }); }
  },

  /* --- Auditoría, historial y filtros ----------------------------------- */
  'documentacion.auditoria.consultar': {
    escribe: false, capacidad: DOC2_CAPACIDAD.AUDITORIA,
    fn: function (p, ctx) { return doc2ConsultarAuditoria_(p.filtros || p, ctx); }
  },
  'documentacion.historial.consultar': {
    escribe: false, capacidad: DOC2_CAPACIDAD.VER,
    fn: function (p, ctx) {
      doc2Autorizar_(ctx, DOC2_CAPACIDAD.VER);
      return { historial: doc2HistorialDe_(p.expedienteId || p.id, p.limite) };
    }
  },
  'documentacion.filtro.guardar': {
    escribe: true, capacidad: DOC2_CAPACIDAD.VER,
    fn: function (p, ctx) { return doc2GuardarFiltro_(p.filtro || p, ctx); }
  },
  'documentacion.filtros.listar': {
    escribe: false, capacidad: DOC2_CAPACIDAD.VER,
    fn: function (p, ctx) { return doc2ListarFiltros_(ctx); }
  },
  'documentacion.filtro.eliminar': {
    escribe: true, capacidad: DOC2_CAPACIDAD.VER,
    fn: function (p, ctx) { return doc2EliminarFiltro_(p.filtroId || p.id, ctx); }
  },

  /* --- Permisos y configuración ---------------------------------------- */
  'documentacion.permisos.obtener': {
    escribe: false, instalado: false,
    fn: function (p, ctx) {
      return {
        rol: ctx.rol,
        actor: ctx.actorDisplay,
        actorId: ctx.actorId,
        capacidades: doc2CapacidadesMapa_(ctx),
        matriz: DOC2_PERMISOS,
        roles: DOC2_ROLES
      };
    }
  },
  'documentacion.permisos.guardar': {
    escribe: true, capacidad: DOC2_CAPACIDAD.CONFIGURAR,
    fn: function (p, ctx) { return doc2GuardarRoles_(p.roles || {}, ctx); }
  },
  'documentacion.configuracion.obtener': {
    escribe: false, capacidad: DOC2_CAPACIDAD.VER,
    fn: function (p, ctx) {
      doc2Autorizar_(ctx, DOC2_CAPACIDAD.VER);
      return {
        configuracion: doc2ConfigAll_(),
        automatizaciones: DOC2_AUTOMATIZACIONES,
        desactivadas: doc2ConfigJson_('automatizaciones_desactivadas', []),
        sla: DOC2_SLA_HORAS,
        umbrales: DOC2_UMBRALES,
        tiposConsentimiento: doc2TiposConsentimiento_()
      };
    }
  },
  'documentacion.configuracion.guardar': {
    escribe: true, capacidad: DOC2_CAPACIDAD.CONFIGURAR,
    fn: function (p, ctx) { return doc2GuardarConfiguracion_(p.configuracion || {}, ctx); }
  }
};

/* ========================================================================== */
/* Utilidades del registro                                                     */
/* ========================================================================== */

/** ¿Existe esa acción en el modelo normalizado? */
function doc2ApiExiste_(accion) {
  return Object.prototype.hasOwnProperty.call(DOC2_API, String(accion));
}

/** ¿Escribe esa acción? Lo consulta el enrutador para decidir bloqueo. */
function doc2ApiEsEscritura_(accion) {
  var spec = DOC2_API[String(accion)];
  return !!(spec && spec.escribe === true);
}

/** Acciones disponibles, para los mensajes de error y la documentación. */
function doc2ApiAcciones_() {
  return Object.keys(DOC2_API).sort();
}

/**
 * Ejecuta un controlador.
 *
 * Siete pasos, siempre los mismos: contexto (con `requestId`), comprobación de
 * instalación, comprobación temprana de capacidad, ejecución del servicio, sello
 * de métricas, auditoría de errores y respuesta. El sobre lo pone el enrutador.
 */
function doc2ApiEjecutar_(accion, params, opciones) {
  var spec = DOC2_API[String(accion)];
  if (!spec) {
    throw docError_(DOC_CODE.UNSUPPORTED_ACTION, 'La acción "' + accion + '" no existe.',
      { hint: 'Acciones del módulo: ' + doc2ApiAcciones_().join(', ') + '.', details: { accion: accion } });
  }

  var o = opciones || {};
  var ctx = doc2Contexto_(params || {}, { accion: accion, metodo: o.metodo, origen: (params && params.origen) || 'web' });

  if (spec.instalado !== false) doc2ExigirInstalado_();
  if (spec.capacidad) doc2Autorizar_(ctx, spec.capacidad);

  var inicio = Date.now();
  var datos = spec.fn(params || {}, ctx);
  docCount_('doc2Accion');
  docInfo_('Acción ' + accion + ' completada.', { ms: Date.now() - inicio, rol: ctx.rol });
  return datos;
}

/**
 * Exige que el modelo normalizado exista.
 *
 * El mensaje dice exactamente qué ejecutar. Un «no instalado» sin instrucción
 * obliga a buscar en la documentación algo que el propio error puede decir.
 */
function doc2ExigirInstalado_() {
  var ss;
  try {
    ss = docSpreadsheet_();
  } catch (error) {
    throw docError_(DOC_CODE.NOT_INSTALLED, 'No se puede abrir el libro de cálculo.',
      { hint: 'Revisa la propiedad ' + DOC_PROP.SPREADSHEET_ID + ' en Apps Script.', details: {} });
  }
  if (!ss.getSheetByName(DOC2_SHEET.EXPEDIENTES) || !ss.getSheetByName(DOC2_SHEET.CATALOGO)) {
    throw docError_(DOC_CODE.NOT_INSTALLED,
      'El modelo normalizado de Documentación no está instalado en este libro.',
      {
        hint: 'Ejecuta la acción "documentacion.instalar" o, en el libro, Documentacion → Instalar o actualizar (modelo normalizado).',
        details: { hojasRequeridas: [DOC2_SHEET.EXPEDIENTES, DOC2_SHEET.CATALOGO], accion: 'documentacion.instalar' }
      });
  }
  return true;
}

/* ========================================================================== */
/* Controladores que necesitan algo de lógica de presentación                   */
/* ========================================================================== */

/**
 * Estado del módulo. Funciona con el libro sin instalar: es lo primero que
 * consulta el frontend y tiene que poder decir «no está instalado» en lugar de
 * fallar.
 */
function doc2Estado_(ctx) {
  var contexto = ctx || doc2CtxActual_();
  var salida = {
    arquitectura: DOC2_BACKEND.arquitectura,
    version: DOC2_BACKEND.version,
    esquema: DOC2_SCHEMA_VERSION,
    backendHeredado: DOC_BACKEND.version,
    instalado: false,
    libro: '',
    libroUrl: '',
    horaServidor: docNow_(),
    rol: contexto.rol,
    actor: contexto.actorDisplay,
    capacidades: doc2CapacidadesMapa_(contexto),
    hojas: {},
    migraciones: null,
    aniosLibro: []
  };

  try {
    var ss = docSpreadsheet_();
    salida.libro = ss.getName ? ss.getName() : '';
    try { salida.libroUrl = ss.getUrl ? ss.getUrl() : ''; } catch (e) { salida.libroUrl = ''; }
    var faltan = [];
    for (var i = 0; i < DOC2_SHEET_ORDER.length; i++) {
      var existe = !!ss.getSheetByName(DOC2_SHEET_ORDER[i]);
      salida.hojas[DOC2_SHEET_ORDER[i]] = existe;
      if (!existe) faltan.push(DOC2_SHEET_ORDER[i]);
    }
    salida.hojas[DOC2_SHEET.AUXILIAR] = !!ss.getSheetByName(DOC2_SHEET.AUXILIAR);
    salida.instalado = faltan.length === 0;
    salida.hojasFaltantes = faltan;
    try { salida.aniosLibro = docListYears_(); } catch (e) { salida.aniosLibro = []; }
    if (salida.instalado) {
      salida.migraciones = doc2EstadoMigraciones_();
      salida.expedientes = doc2Count_(DOC2_SHEET.EXPEDIENTES);
      salida.notificacionesNoLeidas = doc2ContadorNoLeidas_(contexto);
    }
  } catch (error) {
    salida.problema = docClassify_(error).message;
  }
  return salida;
}

/**
 * Consulta la auditoría técnica con filtros.
 *
 * Se recorre de lo más reciente hacia atrás y se corta al llegar al límite: quien
 * abre una bitácora quiere lo último, y recorrer veinte mil filas para devolver
 * cincuenta es tiempo tirado.
 */
function doc2ConsultarAuditoria_(filtros, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.AUDITORIA);
  var f = filtros || {};
  var limite = Math.min(Math.max(docInt_(f.limite, 100), 1), 1000);
  var filas = doc2All_(DOC2_SHEET.AUDITORIA, true);
  var desde = docDateOnly_(f.desde);
  var hasta = docDateOnly_(f.hasta);
  var tipo = f.tipo ? docKey_(f.tipo) : '';
  var actor = f.actor ? docKey_(f.actor) : '';
  var texto = f.texto ? docKey_(f.texto) : '';

  var salida = [];
  for (var i = filas.length - 1; i >= 0 && salida.length < limite; i--) {
    var fila = filas[i];
    var dia = String(fila.created_at).slice(0, 10);
    if (desde && dia < desde) continue;
    if (hasta && dia > hasta) continue;
    if (f.expedienteId && String(fila.expediente_id) !== String(f.expedienteId)) continue;
    if (f.requestId && String(fila.request_id) !== String(f.requestId)) continue;
    if (tipo && docKey_(fila.evento_tipo).indexOf(tipo) < 0) continue;
    if (actor && docKey_(fila.actor_display + ' ' + fila.actor_id).indexOf(actor) < 0) continue;
    if (f.resultado && docKey_(fila.resultado) !== docKey_(f.resultado)) continue;
    if (texto) {
      var heno = docKey_([fila.evento_tipo, fila.entidad_tipo, fila.actor_display, fila.origen, docWriteJson_(fila.metadata_json)].join(' '));
      if (heno.indexOf(texto) < 0) continue;
    }
    salida.push({
      eventoId: fila.evento_id,
      requestId: fila.request_id,
      expedienteId: fila.expediente_id || '',
      entidadTipo: fila.entidad_tipo,
      entidadId: fila.entidad_id,
      tipo: fila.evento_tipo,
      actor: fila.actor_display || fila.actor_id,
      actorId: fila.actor_id,
      origen: fila.origen,
      resultado: fila.resultado,
      metadata: fila.metadata_json,
      fecha: fila.created_at
    });
  }
  return { total: filas.length, devueltos: salida.length, eventos: salida };
}

/**
 * Guarda claves de configuración.
 *
 * Solo se aceptan las claves declaradas en la semilla más las de listas
 * conocidas: una configuración que acepta cualquier clave se convierte en un
 * cajón desastre y, peor, en una vía para inyectar valores que otro código lea
 * sin validar.
 */
function doc2GuardarConfiguracion_(cambios, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.CONFIGURAR);
  var permitidas = {};
  for (var i = 0; i < DOC2_CONFIG_SEMILLA.length; i++) permitidas[DOC2_CONFIG_SEMILLA[i].clave] = DOC2_CONFIG_SEMILLA[i].tipo;
  permitidas.tipos_consentimiento = 'json';

  var guardadas = [];
  var rechazadas = [];
  var claves = Object.keys(cambios || {});

  for (var k = 0; k < claves.length; k++) {
    var clave = claves[k];
    var tipo = permitidas[clave];
    if (!tipo) {
      rechazadas.push({ clave: clave, motivo: 'Clave no reconocida.' });
      continue;
    }
    var valor = cambios[clave];
    if (tipo === 'int') {
      var numero = docNumOrNull_(valor);
      if (numero === null || numero < 0) {
        rechazadas.push({ clave: clave, motivo: 'Debe ser un número igual o mayor que cero.' });
        continue;
      }
      valor = String(Math.round(numero));
    } else if (tipo === 'bool') {
      var booleano = docBoolOrNull_(valor);
      if (booleano === null) {
        rechazadas.push({ clave: clave, motivo: 'Debe ser verdadero o falso.' });
        continue;
      }
      valor = booleano ? 'TRUE' : 'FALSE';
    } else if (tipo === 'json') {
      if (typeof valor === 'string') valor = docParseJson_(valor, null);
      if (valor === null || typeof valor !== 'object') {
        rechazadas.push({ clave: clave, motivo: 'Debe ser una estructura válida.' });
        continue;
      }
    } else {
      valor = doc2TextoLargo_(valor, DOC2_LIMITS.MAX_TEXTO_MEDIO);
    }

    // El mapa de roles tiene su propia puerta: concede permisos.
    if (clave === 'roles_por_actor') {
      doc2GuardarRoles_(valor, contexto);
      guardadas.push(clave);
      continue;
    }

    doc2ConfigSet_(clave, valor, contexto);
    guardadas.push(clave);
  }

  doc2Audit_({
    tipo: 'configuracion.guardada', entidadTipo: 'sistema',
    actor: contexto.actor, actorId: contexto.actorId, origen: contexto.origen, requestId: contexto.requestId,
    resultado: rechazadas.length ? 'parcial' : 'ok',
    metadata: { guardadas: guardadas, rechazadas: rechazadas.length }
  });

  return { guardadas: guardadas, rechazadas: rechazadas, configuracion: doc2ConfigAll_() };
}

/* ========================================================================== */
/* Reinicio por petición                                                       */
/* ========================================================================== */

/**
 * Limpia el estado en memoria del modelo normalizado.
 *
 * Apps Script reutiliza el contexto de ejecución entre peticiones de la misma
 * instancia. Sin este reinicio, la configuración cacheada de una petición se
 * usaría en la siguiente —con otro actor y otro rol—, que es la clase de error que
 * no se reproduce en pruebas y aparece en producción.
 */
function doc2Reset_() {
  doc2ConfigReset_();
  doc2CatalogoReset_();
  doc2EventosReset_();
  doc2PanelInvalidadoReset_();
  DOC2_CTX = null;
}
