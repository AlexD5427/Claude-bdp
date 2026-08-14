/**
 * 16_Workflow.gs — prórrogas, solicitudes, revisiones, aprobaciones, comentarios
 * y tareas.
 *
 * ── Un archivo, seis entidades, una idea ─────────────────────────────────────
 * Todo lo que hay aquí sigue el mismo patrón: validar la entrada, comprobar el
 * permiso, comprobar la transición, escribir, anotar el historial, auditar,
 * emitir el evento y recalcular el resumen del expediente. Ese orden no es
 * casual:
 *
 *   · validar antes de permisos evita filtrar información con un mensaje de
 *     error («ese expediente no existe» dicho a quien no puede verlo);
 *   · la transición se comprueba en el servidor porque la interfaz puede estar
 *     desfasada;
 *   · el evento se emite DESPUÉS de escribir, porque una automatización que se
 *     dispara sobre un dato que aún no existe no tiene nada que leer.
 *
 * ── Lo que NO se hace ────────────────────────────────────────────────────────
 * No se borra nada. Cancelar una solicitud, una prórroga o una tarea es un
 * estado, no un `deleteRow`. Un expediente laboral tiene que poder explicar por
 * qué algo dejó de pedirse, y una fila borrada no explica nada.
 */

/* ========================================================================== */
/* PRÓRROGAS                                                                   */
/* ========================================================================== */

/**
 * Concede una prórroga sobre un requisito.
 *
 * ── Genérico, no cableado ───────────────────────────────────────────────────
 * La versión anterior tenía las dos prórrogas del proceso escritas en el código:
 * certificados de trabajo y título académico. Siguen funcionando exactamente
 * igual —su definición de catálogo lleva `permite_prorroga`— pero ahora cualquier
 * requisito puede admitirlas marcando esa casilla, sin tocar una línea.
 *
 * Los días restantes NO se guardan. Se calculan al leer, porque un «faltan 3
 * días» escrito en una celda miente al día siguiente.
 */
function doc2CrearProrroga_(datos, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.EDITAR);
  var d = datos || {};

  var requisito = doc2ResolverRequisito_(d);
  var expediente = doc2ExigirExpediente_(requisito.expediente_id);
  doc2ExigirExpedienteEditable_(expediente);

  if (requisito.permite_prorroga !== true) {
    throw docError_(DOC_CODE.VALIDATION_ERROR,
      'El requisito "' + doc2NombreRequisito_(requisito) + '" no admite prórroga.',
      {
        hint: 'Si el proceso cambió, habilita la prórroga para ese requisito en el catálogo.',
        details: { fields: doc2Campo_('codigo_documento', 'Requisito sin prórroga habilitada.') }
      });
  }

  var fecha = doc2ValidarFecha_(d.fechaProrroga || d.fecha_prorroga, 'fecha_prorroga', { requerida: true });
  var dias = doc2DiasHasta_(fecha);
  if (dias !== null && dias < 0) {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'La prórroga no puede terminar en el pasado.',
      { details: { fields: doc2Campo_('fecha_prorroga', 'Elige una fecha futura.') } });
  }
  var maximo = doc2ConfigInt_('prorroga_maxima_dias', DOC2_UMBRALES.prorrogaMaximaDias);
  if (dias !== null && dias > maximo) {
    throw docError_(DOC_CODE.VALIDATION_ERROR,
      'La prórroga excede el máximo de ' + maximo + ' días.',
      {
        hint: 'Concede un plazo menor o cambia el máximo en la configuración del módulo.',
        details: { fields: doc2Campo_('fecha_prorroga', 'Plazo demasiado largo (máximo ' + maximo + ' días).') }
      });
  }

  var motivo = doc2TextoLargo_(d.motivo || '', DOC2_LIMITS.MAX_TEXTO_MEDIO);
  if (!motivo) {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'Una prórroga necesita motivo.',
      {
        hint: 'Escribe por qué se concede: es lo que justifica el plazo si alguien lo audita.',
        details: { fields: doc2Campo_('motivo', 'Indica el motivo de la prórroga.') }
      });
  }

  // Una prórroga vigente sobre el mismo requisito se sustituye en lugar de
  // acumularse: dos plazos abiertos para lo mismo no significan nada.
  var vigentes = doc2ProrrogasDeRequisito_(requisito.expediente_documento_id, true);
  var fechaOriginal = doc2Fecha_(d.fechaOriginal || d.fecha_original) || '';
  for (var v = 0; v < vigentes.length; v++) {
    if (String(vigentes[v].estado_prorroga) !== DOC2_ESTADO_PRORROGA.VIGENTE &&
        String(vigentes[v].estado_prorroga) !== DOC2_ESTADO_PRORROGA.SOLICITADA) continue;
    if (!fechaOriginal) fechaOriginal = String(vigentes[v].fecha_prorroga || '');
    doc2Update_(DOC2_SHEET.PRORROGAS, vigentes[v].prorroga_id, {
      estado_prorroga: DOC2_ESTADO_PRORROGA.CANCELADA,
      cancelled_at: docNow_(),
      cancelled_by: doc2Texto_(contexto.actor, 240)
    }, contexto);
    doc2Historial_({
      expedienteId: expediente.expediente_id, entidadTipo: 'prorroga', entidadId: vigentes[v].prorroga_id,
      campo: 'estado_prorroga', anterior: vigentes[v].estado_prorroga, nuevo: DOC2_ESTADO_PRORROGA.CANCELADA,
      motivo: 'Sustituida por una prórroga nueva', actor: contexto.actor
    });
  }
  if (!fechaOriginal) fechaOriginal = expediente.fecha_ingreso || '';

  // Quien puede aprobar concede la prórroga directamente; el resto la solicita.
  var puedeAprobar = doc2Puede_(contexto, DOC2_CAPACIDAD.APROBAR) || doc2Puede_(contexto, DOC2_CAPACIDAD.REVISAR);
  var estado = puedeAprobar ? DOC2_ESTADO_PRORROGA.VIGENTE : DOC2_ESTADO_PRORROGA.SOLICITADA;

  var id = doc2NewId_('pro');
  doc2Insert_(DOC2_SHEET.PRORROGAS, {
    prorroga_id: id,
    expediente_id: expediente.expediente_id,
    expediente_documento_id: requisito.expediente_documento_id,
    codigo_documento: requisito.codigo_documento,
    fecha_original: fechaOriginal,
    fecha_prorroga: fecha,
    motivo: motivo,
    estado_prorroga: estado,
    solicitada_por: doc2Texto_(contexto.actor, 240),
    aprobada_por: puedeAprobar ? doc2Texto_(contexto.actor, 240) : '',
    fecha_aprobacion: puedeAprobar ? docNow_() : ''
  }, contexto);

  doc2Historial_({
    expedienteId: expediente.expediente_id, entidadTipo: 'prorroga', entidadId: id,
    campo: 'prorroga', anterior: '', nuevo: 'prórroga hasta ' + fecha + ' para ' + doc2NombreRequisito_(requisito),
    motivo: motivo, actor: contexto.actor
  });
  doc2Audit_({
    tipo: DOC2_EVENTO.PRORROGA_CREADA, expedienteId: expediente.expediente_id,
    entidadTipo: 'prorroga', entidadId: id, actor: contexto.actor, actorId: contexto.actorId,
    origen: contexto.origen, requestId: contexto.requestId,
    metadata: { codigo: requisito.codigo_documento, hasta: fecha, estado: estado }
  });

  doc2Emitir_(DOC2_EVENTO.PRORROGA_CREADA, {
    expedienteId: expediente.expediente_id, prorrogaId: id,
    expedienteDocumentoId: requisito.expediente_documento_id, fecha: fecha
  }, contexto);

  var resumen = doc2RecalcularExpediente_(expediente.expediente_id, contexto);
  doc2EspejoLibro_(expediente.expediente_id, contexto);

  return { prorrogaId: id, estado: estado, fecha: fecha, resumen: resumen };
}

/** Cambia el estado de una prórroga comprobando la transición. */
function doc2CambiarEstadoProrroga_(prorrogaId, estado, ctx, opciones) {
  var contexto = ctx || doc2CtxActual_();
  var o = opciones || {};
  var fila = doc2GetOrFail_(DOC2_SHEET.PRORROGAS, prorrogaId, 'la prórroga');
  var destino = doc2Enum_(estado, doc2ValoresDe_(DOC2_ESTADO_PRORROGA), '');
  if (!destino) {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'Estado de prórroga no reconocido.',
      { details: { fields: doc2Campo_('estado_prorroga', 'Estado no válido.') } });
  }
  var capacidad = (destino === DOC2_ESTADO_PRORROGA.VIGENTE || destino === DOC2_ESTADO_PRORROGA.RECHAZADA)
    ? DOC2_CAPACIDAD.REVISAR : DOC2_CAPACIDAD.EDITAR;
  doc2Autorizar_(contexto, capacidad);
  doc2ExigirTransicion_('prorroga', fila.estado_prorroga, destino);

  // El estado anterior se copia AHORA: `doc2Update_` actualiza la fila que está en
  // memoria, que es el mismo objeto que se acaba de leer. Leerlo después daría el
  // valor nuevo y el historial diría «de VIGENTE a VIGENTE».
  var estadoAnterior = String(fila.estado_prorroga || '');
  var patch = { estado_prorroga: destino };
  if (destino === DOC2_ESTADO_PRORROGA.VIGENTE) {
    patch.aprobada_por = doc2Texto_(contexto.actor, 240);
    patch.fecha_aprobacion = docNow_();
  }
  if (destino === DOC2_ESTADO_PRORROGA.CANCELADA || destino === DOC2_ESTADO_PRORROGA.RECHAZADA) {
    patch.cancelled_at = docNow_();
    patch.cancelled_by = doc2Texto_(contexto.actor, 240);
  }

  doc2Update_(DOC2_SHEET.PRORROGAS, prorrogaId, patch, contexto, { version: o.version });
  doc2Historial_({
    expedienteId: fila.expediente_id, entidadTipo: 'prorroga', entidadId: prorrogaId,
    campo: 'estado_prorroga', anterior: estadoAnterior, nuevo: destino,
    motivo: o.motivo || '', actor: contexto.actor
  });
  doc2Audit_({
    tipo: 'prorroga.estado', expedienteId: fila.expediente_id, entidadTipo: 'prorroga', entidadId: prorrogaId,
    actor: contexto.actor, actorId: contexto.actorId, origen: contexto.origen, requestId: contexto.requestId,
    metadata: { desde: estadoAnterior, hasta: destino }
  });

  var resumen = doc2RecalcularExpediente_(fila.expediente_id, contexto);
  doc2EspejoLibro_(fila.expediente_id, contexto);
  return { prorrogaId: prorrogaId, estado: destino, resumen: resumen };
}

/** Edita la fecha o el motivo de una prórroga vigente. */
function doc2ActualizarProrroga_(prorrogaId, cambios, ctx, opciones) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.EDITAR);
  var o = opciones || {};
  var c = cambios || {};
  var fila = doc2GetOrFail_(DOC2_SHEET.PRORROGAS, prorrogaId, 'la prórroga');
  if (String(fila.estado_prorroga) === DOC2_ESTADO_PRORROGA.CANCELADA ||
      String(fila.estado_prorroga) === DOC2_ESTADO_PRORROGA.CUMPLIDA) {
    throw docError_(DOC_CODE.CONFLICT, 'Una prórroga cerrada no se edita.',
      { hint: 'Crea una prórroga nueva si hace falta ampliar el plazo.', details: { estado: fila.estado_prorroga } });
  }

  var patch = {};
  var antes = {};
  if (c.fechaProrroga !== undefined || c.fecha_prorroga !== undefined) {
    var fecha = doc2ValidarFecha_(c.fechaProrroga !== undefined ? c.fechaProrroga : c.fecha_prorroga, 'fecha_prorroga', { requerida: true });
    var maximo = doc2ConfigInt_('prorroga_maxima_dias', DOC2_UMBRALES.prorrogaMaximaDias);
    var dias = doc2DiasHasta_(fecha);
    if (dias !== null && dias > maximo) {
      throw docError_(DOC_CODE.VALIDATION_ERROR, 'La prórroga excede el máximo de ' + maximo + ' días.',
        { details: { fields: doc2Campo_('fecha_prorroga', 'Plazo demasiado largo.') } });
    }
    antes.fecha_prorroga = fila.fecha_prorroga;
    patch.fecha_prorroga = fecha;
  }
  if (c.motivo !== undefined) {
    antes.motivo = fila.motivo;
    patch.motivo = doc2TextoLargo_(c.motivo, DOC2_LIMITS.MAX_TEXTO_MEDIO);
  }
  if (!Object.keys(patch).length) return { prorrogaId: prorrogaId, cambios: 0, sinCambios: true };

  doc2Update_(DOC2_SHEET.PRORROGAS, prorrogaId, patch, contexto, { version: o.version });
  var cambiosHist = doc2DiffHistorial_('prorroga', prorrogaId, antes, patch,
    { actor: contexto.actor, expedienteId: fila.expediente_id, motivo: c.motivoCambio || '' });
  var resumen = doc2RecalcularExpediente_(fila.expediente_id, contexto);
  doc2EspejoLibro_(fila.expediente_id, contexto);
  return { prorrogaId: prorrogaId, cambios: cambiosHist, resumen: resumen };
}

/** Prórrogas de un requisito. */
function doc2ProrrogasDeRequisito_(expedienteDocumentoId, incluirCerradas) {
  var filas = doc2By_(DOC2_SHEET.PRORROGAS, 'expediente_documento_id', expedienteDocumentoId, false);
  if (incluirCerradas) return filas;
  var out = [];
  for (var i = 0; i < filas.length; i++) {
    var estado = String(filas[i].estado_prorroga || '');
    if (estado === DOC2_ESTADO_PRORROGA.CANCELADA || estado === DOC2_ESTADO_PRORROGA.CUMPLIDA ||
        estado === DOC2_ESTADO_PRORROGA.RECHAZADA) continue;
    out.push(filas[i]);
  }
  return out;
}

/**
 * Vista de una prórroga, con los días restantes calculados.
 *
 * `situacion` distingue tres cosas que la interfaz pinta distinto: vigente,
 * próxima a vencer (dentro del umbral configurado) y vencida.
 */
function doc2ProrrogaVista_(fila) {
  var dias = fila.fecha_prorroga ? doc2DiasHasta_(fila.fecha_prorroga) : null;
  var umbral = doc2ConfigInt_('prorroga_aviso_dias', DOC2_UMBRALES.prorrogaAvisoDias);
  var estado = String(fila.estado_prorroga || '');
  var situacion = 'cerrada';
  if (estado === DOC2_ESTADO_PRORROGA.VIGENTE || estado === DOC2_ESTADO_PRORROGA.SOLICITADA) {
    if (dias === null) situacion = 'sin_fecha';
    else if (dias < 0) situacion = 'vencida';
    else if (dias <= umbral) situacion = 'por_vencer';
    else situacion = 'vigente';
  } else if (estado === DOC2_ESTADO_PRORROGA.VENCIDA) {
    situacion = 'vencida';
  }
  return {
    prorrogaId: fila.prorroga_id,
    expedienteId: fila.expediente_id,
    expedienteDocumentoId: fila.expediente_documento_id,
    codigo: fila.codigo_documento,
    nombre: doc2NombreDeCodigo_(fila.codigo_documento),
    fechaOriginal: fila.fecha_original || '',
    fechaProrroga: fila.fecha_prorroga || '',
    diasRestantes: dias,
    situacion: situacion,
    motivo: fila.motivo || '',
    estado: estado,
    solicitadaPor: fila.solicitada_por || '',
    aprobadaPor: fila.aprobada_por || '',
    fechaAprobacion: fila.fecha_aprobacion || '',
    creadoEn: fila.created_at || '',
    version: docInt_(fila.version_registro, 1)
  };
}

/** Nombre visible de un código de documento. */
function doc2NombreDeCodigo_(codigo) {
  var def = doc2CatalogoItem_(codigo);
  return (def && def.nombre_visible) || String(codigo || '');
}

/** Lista prórrogas con filtros, para la sección Prórrogas del módulo. */
function doc2ListarProrrogas_(filtros, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.VER);
  var f = filtros || {};
  var situacion = String(f.situacion || 'todas');
  var estados = doc2Lista_(f.estado);
  var texto = f.texto ? docKey_(f.texto) : '';
  var expedientes = {};

  var resultado = doc2Query_(DOC2_SHEET.PRORROGAS, {
    orden: f.orden === 'fecha' ? 'fecha_prorroga' : 'created_at',
    direccion: f.direccion === 'asc' ? 'asc' : 'desc',
    pagina: f.pagina, porPagina: f.porPagina, sinPaginar: f.sinPaginar === true,
    filtro: function (fila) {
      if (estados.length && estados.indexOf(docKey_(fila.estado_prorroga)) < 0) return false;
      if (f.expedienteId && String(fila.expediente_id) !== String(f.expedienteId)) return false;
      var vista = doc2ProrrogaVista_(fila);
      if (situacion !== 'todas' && vista.situacion !== situacion) return false;
      if (texto) {
        var expediente = expedientes[String(fila.expediente_id)];
        if (expediente === undefined) {
          expediente = doc2Get_(DOC2_SHEET.EXPEDIENTES, fila.expediente_id);
          expedientes[String(fila.expediente_id)] = expediente;
        }
        var heno = docKey_([(expediente && expediente.nombre) || '', (expediente && expediente.identificador) || '', vista.nombre, fila.motivo].join(' '));
        if (heno.indexOf(texto) < 0) return false;
      }
      return true;
    }
  });

  var vista = [];
  for (var i = 0; i < resultado.filas.length; i++) {
    var v = doc2ProrrogaVista_(resultado.filas[i]);
    var expediente = doc2Get_(DOC2_SHEET.EXPEDIENTES, resultado.filas[i].expediente_id);
    v.expediente = expediente ? { identificador: expediente.identificador, nombre: expediente.nombre, agencia: expediente.agencia } : null;
    vista.push(v);
  }

  return { total: resultado.total, pagina: resultado.pagina, paginas: resultado.paginas, porPagina: resultado.porPagina, prorrogas: vista };
}

/** Resuelve el requisito al que se refiere una entrada (por id o por código). */
function doc2ResolverRequisito_(datos) {
  var d = datos || {};
  var id = docRaw_(d.expedienteDocumentoId || d.expediente_documento_id || '', 200);
  if (id) return doc2GetOrFail_(DOC2_SHEET.EXPEDIENTE_DOCS, id, 'el requisito');
  var expedienteId = docRaw_(d.expedienteId || d.expediente_id || '', 200);
  var codigo = docRaw_(d.codigo || d.codigo_documento || '', 120);
  if (expedienteId && codigo) {
    var expediente = doc2ExigirExpediente_(expedienteId);
    var fila = doc2RequisitoPorCodigo_(expediente.expediente_id, codigo);
    if (fila) return fila;
  }
  throw docError_(DOC_CODE.VALIDATION_ERROR, 'No se identificó el requisito.',
    {
      hint: 'Envía expedienteDocumentoId, o bien expedienteId y codigo.',
      details: { fields: doc2Campo_('expedienteDocumentoId', 'Requisito no identificado.') }
    });
}

/* ========================================================================== */
/* SOLICITUDES DOCUMENTALES                                                    */
/* ========================================================================== */

/**
 * Crea una solicitud de documentación con sus requisitos.
 *
 * La solicitud es el documento que dice «a esta persona le pedimos estos papeles
 * para esta fecha». Sin ella, el seguimiento vive en la memoria de quien lo
 * lleva.
 */
function doc2CrearSolicitud_(datos, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.SOLICITAR);
  var d = datos || {};

  var expediente = doc2ExigirExpediente_(d.expedienteId || d.expediente_id);
  doc2ExigirExpedienteEditable_(expediente);

  var codigos = doc2Lista_(d.codigos);
  var idsRequisito = [];
  var listaIds = d.expedienteDocumentoIds || [];
  for (var i = 0; i < listaIds.length; i++) {
    var raw = docRaw_(listaIds[i], 200);
    if (raw) idsRequisito.push(raw);
  }

  // Sin selección explícita se piden todos los requisitos que faltan: es lo que
  // se quiere el 90 % de las veces y ahorra una pantalla de selección.
  var requisitos = [];
  var todos = doc2RequisitosDe_(expediente.expediente_id, false);
  for (var r = 0; r < todos.length; r++) {
    var fila = todos[r];
    var estado = String(fila.estado_documental);
    var seleccionado = false;
    if (idsRequisito.length) seleccionado = idsRequisito.indexOf(String(fila.expediente_documento_id)) >= 0;
    else if (codigos.length) seleccionado = codigos.indexOf(docKey_(fila.codigo_documento)) >= 0;
    else seleccionado = (estado === DOC2_ESTADO_DOCUMENTO.PENDIENTE || estado === DOC2_ESTADO_DOCUMENTO.NO_ENTREGADO);
    if (seleccionado) requisitos.push(fila);
  }

  if (!requisitos.length) {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'No hay requisitos que solicitar.',
      {
        hint: 'Este expediente no tiene requisitos pendientes, o los seleccionados no le corresponden.',
        details: { fields: doc2Campo_('codigos', 'Selecciona al menos un requisito pendiente.') }
      });
  }

  var slaHoras = doc2ConfigInt_('sla_solicitud_horas', DOC2_SLA_HORAS.solicitud);
  var fechaLimite = doc2ValidarFecha_(d.fechaLimite || d.fecha_limite || doc2LimitePorSla_(slaHoras), 'fecha_limite', { requerida: true });
  if (doc2Vencida_(fechaLimite)) {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'La fecha límite ya pasó.',
      { details: { fields: doc2Campo_('fecha_limite', 'Elige una fecha futura.') } });
  }

  var solicitudId = doc2NewId_('sol');
  var prioridad = doc2Enum_(d.prioridad || 'MEDIA', ['BAJA', 'MEDIA', 'ALTA', 'URGENTE'], 'MEDIA');
  var canal = doc2Enum_(d.canal || 'INTERNO', ['INTERNO', 'CORREO', 'PRESENCIAL', 'TELEFONO'], 'INTERNO');
  var recordatorioDias = doc2ConfigInt_('solicitud_aviso_dias', DOC2_UMBRALES.solicitudAvisoDias);

  doc2Insert_(DOC2_SHEET.SOLICITUDES, {
    solicitud_id: solicitudId,
    expediente_id: expediente.expediente_id,
    titulo: doc2Texto_(d.titulo || ('Documentación pendiente · ' + expediente.nombre), 300),
    descripcion: doc2TextoLargo_(d.descripcion || d.instrucciones || '', DOC2_LIMITS.MAX_TEXTO_MEDIO),
    responsable_id: doc2Texto_(d.responsableId || d.responsable || expediente.responsable_id || contexto.actorId, 240),
    fecha_solicitud: doc2Hoy_(),
    fecha_limite: fechaLimite,
    prioridad: prioridad,
    estado_solicitud: d.borrador === true ? DOC2_ESTADO_SOLICITUD.BORRADOR : DOC2_ESTADO_SOLICITUD.PENDIENTE,
    canal: canal,
    ultimo_recordatorio: '',
    proximo_recordatorio: doc2FechaMasDias_(recordatorioDias),
    cantidad_recordatorios: 0
  }, contexto);

  for (var s = 0; s < requisitos.length; s++) {
    doc2Insert_(DOC2_SHEET.SOLICITUD_DOCS, {
      solicitud_documento_id: doc2StableId_('soldoc', solicitudId + '|' + requisitos[s].codigo_documento),
      solicitud_id: solicitudId,
      expediente_id: expediente.expediente_id,
      expediente_documento_id: requisitos[s].expediente_documento_id,
      codigo_documento: requisitos[s].codigo_documento,
      estado_item: 'PENDIENTE',
      fecha_cumplimiento: '',
      observacion: ''
    }, contexto);
  }

  doc2Historial_({
    expedienteId: expediente.expediente_id, entidadTipo: 'solicitud', entidadId: solicitudId,
    campo: 'solicitud', anterior: '', nuevo: 'solicitud de ' + requisitos.length + ' requisito(s) con límite ' + fechaLimite,
    actor: contexto.actor
  });
  doc2Audit_({
    tipo: DOC2_EVENTO.SOLICITUD_CREADA, expedienteId: expediente.expediente_id,
    entidadTipo: 'solicitud', entidadId: solicitudId, actor: contexto.actor, actorId: contexto.actorId,
    origen: contexto.origen, requestId: contexto.requestId,
    metadata: { requisitos: requisitos.length, limite: fechaLimite, prioridad: prioridad }
  });
  doc2Emitir_(DOC2_EVENTO.SOLICITUD_CREADA, {
    expedienteId: expediente.expediente_id, solicitudId: solicitudId, requisitos: requisitos.length
  }, contexto);

  var resumen = doc2RecalcularExpediente_(expediente.expediente_id, contexto);
  return { solicitudId: solicitudId, requisitos: requisitos.length, fechaLimite: fechaLimite, resumen: resumen };
}

/** Cambia el estado de una solicitud comprobando la transición. */
function doc2CambiarEstadoSolicitud_(solicitudId, estado, ctx, opciones) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.SOLICITAR);
  var o = opciones || {};
  var fila = doc2GetOrFail_(DOC2_SHEET.SOLICITUDES, solicitudId, 'la solicitud');
  var destino = doc2Enum_(estado, doc2ValoresDe_(DOC2_ESTADO_SOLICITUD), '');
  if (!destino) {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'Estado de solicitud no reconocido.',
      { details: { fields: doc2Campo_('estado_solicitud', 'Estado no válido.') } });
  }
  doc2ExigirTransicion_('solicitud', fila.estado_solicitud, destino);

  var estadoAnterior = String(fila.estado_solicitud || '');
  var patch = { estado_solicitud: destino };
  if (destino === DOC2_ESTADO_SOLICITUD.CANCELADA) patch.cancelled_at = docNow_();
  if (destino === DOC2_ESTADO_SOLICITUD.EN_SEGUIMIENTO || destino === DOC2_ESTADO_SOLICITUD.NOTIFICADA) {
    patch.ultimo_recordatorio = docNow_();
    patch.cantidad_recordatorios = docInt_(fila.cantidad_recordatorios, 0) + 1;
    patch.proximo_recordatorio = doc2FechaMasDias_(doc2ConfigInt_('solicitud_aviso_dias', DOC2_UMBRALES.solicitudAvisoDias));
  }

  doc2Update_(DOC2_SHEET.SOLICITUDES, solicitudId, patch, contexto, { version: o.version });
  doc2Historial_({
    expedienteId: fila.expediente_id, entidadTipo: 'solicitud', entidadId: solicitudId,
    campo: 'estado_solicitud', anterior: estadoAnterior, nuevo: destino,
    motivo: o.motivo || '', actor: contexto.actor
  });
  doc2Audit_({
    tipo: 'solicitud.estado', expedienteId: fila.expediente_id, entidadTipo: 'solicitud', entidadId: solicitudId,
    actor: contexto.actor, actorId: contexto.actorId, origen: contexto.origen, requestId: contexto.requestId,
    metadata: { desde: estadoAnterior, hasta: destino, motivo: o.motivo || '' }
  });

  if (destino === DOC2_ESTADO_SOLICITUD.COMPLETADA) {
    doc2Emitir_(DOC2_EVENTO.SOLICITUD_COMPLETADA, { expedienteId: fila.expediente_id, solicitudId: solicitudId }, contexto);
    doc2CompletarTareasDeOrigen_('solicitud', solicitudId, contexto, 'La solicitud se completó.');
  }

  var resumen = doc2RecalcularExpediente_(fila.expediente_id, contexto);
  return { solicitudId: solicitudId, estado: destino, resumen: resumen };
}

/** Registra un seguimiento sobre la solicitud (una llamada, un correo, una nota). */
function doc2RegistrarSeguimiento_(solicitudId, nota, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.SOLICITAR);
  var fila = doc2GetOrFail_(DOC2_SHEET.SOLICITUDES, solicitudId, 'la solicitud');
  var texto = doc2TextoLargo_(nota || '', DOC2_LIMITS.MAX_TEXTO_MEDIO);
  if (!texto) {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'El seguimiento necesita una nota.',
      { details: { fields: doc2Campo_('nota', 'Escribe qué se hizo.') } });
  }

  var patch = {
    ultimo_recordatorio: docNow_(),
    cantidad_recordatorios: docInt_(fila.cantidad_recordatorios, 0) + 1,
    proximo_recordatorio: doc2FechaMasDias_(doc2ConfigInt_('solicitud_aviso_dias', DOC2_UMBRALES.solicitudAvisoDias))
  };
  if (doc2TransicionPermitida_('solicitud', fila.estado_solicitud, DOC2_ESTADO_SOLICITUD.EN_SEGUIMIENTO)) {
    patch.estado_solicitud = DOC2_ESTADO_SOLICITUD.EN_SEGUIMIENTO;
  }
  doc2Update_(DOC2_SHEET.SOLICITUDES, solicitudId, patch, contexto);

  doc2CrearComentario_({
    expedienteId: fila.expediente_id,
    tipo: 'SEGUIMIENTO',
    visibilidad: 'OPERATIVA',
    contenido: 'Seguimiento de la solicitud «' + fila.titulo + '»: ' + texto
  }, contexto);

  doc2Historial_({
    expedienteId: fila.expediente_id, entidadTipo: 'solicitud', entidadId: solicitudId,
    campo: 'seguimiento', anterior: '', nuevo: texto, actor: contexto.actor
  });

  return { solicitudId: solicitudId, recordatorios: patch.cantidad_recordatorios, estado: patch.estado_solicitud || fila.estado_solicitud };
}

/**
 * Marca como cumplidos los ítems de solicitud que pedían un requisito ya
 * resuelto, y completa la solicitud si no queda nada.
 *
 * Es la automatización que evita el escenario más frecuente y más molesto: la
 * persona entrega el papel, alguien lo registra, y la solicitud sigue apareciendo
 * como pendiente porque nadie se acordó de cerrarla.
 */
function doc2CumplirItemsDeSolicitud_(expedienteDocumentoId, ctx) {
  var contexto = ctx || doc2CtxActual_();
  var items = doc2By_(DOC2_SHEET.SOLICITUD_DOCS, 'expediente_documento_id', expedienteDocumentoId, true);
  var afectadas = {};
  var cerrados = 0;

  for (var i = 0; i < items.length; i++) {
    if (String(items[i].estado_item) === 'CUMPLIDO') continue;
    doc2Update_(DOC2_SHEET.SOLICITUD_DOCS, items[i].solicitud_documento_id, {
      estado_item: 'CUMPLIDO',
      fecha_cumplimiento: doc2Hoy_()
    }, contexto);
    afectadas[String(items[i].solicitud_id)] = items[i].expediente_id;
    cerrados++;
  }

  var completadas = 0;
  for (var solicitudId in afectadas) {
    if (!Object.prototype.hasOwnProperty.call(afectadas, solicitudId)) continue;
    var solicitud = doc2Get_(DOC2_SHEET.SOLICITUDES, solicitudId);
    if (!solicitud) continue;
    var estado = String(solicitud.estado_solicitud);
    if (estado === DOC2_ESTADO_SOLICITUD.COMPLETADA || estado === DOC2_ESTADO_SOLICITUD.CANCELADA) continue;
    var pendientes = 0;
    var propios = doc2By_(DOC2_SHEET.SOLICITUD_DOCS, 'solicitud_id', solicitudId, true);
    for (var p = 0; p < propios.length; p++) {
      if (String(propios[p].estado_item) !== 'CUMPLIDO') pendientes++;
    }
    if (pendientes > 0) continue;
    if (!doc2TransicionPermitida_('solicitud', estado, DOC2_ESTADO_SOLICITUD.COMPLETADA)) continue;
    doc2Update_(DOC2_SHEET.SOLICITUDES, solicitudId, { estado_solicitud: DOC2_ESTADO_SOLICITUD.COMPLETADA }, contexto);
    doc2Historial_({
      expedienteId: solicitud.expediente_id, entidadTipo: 'solicitud', entidadId: solicitudId,
      campo: 'estado_solicitud', anterior: estado, nuevo: DOC2_ESTADO_SOLICITUD.COMPLETADA,
      motivo: 'Todos los requisitos solicitados quedaron resueltos', actor: contexto.actor
    });
    doc2CompletarTareasDeOrigen_('solicitud', solicitudId, contexto, 'La solicitud se completó sola al entregarse todo.');
    completadas++;
  }

  return { itemsCerrados: cerrados, solicitudesCompletadas: completadas };
}

/** Vista de una solicitud, con sus ítems y su situación temporal. */
function doc2SolicitudVista_(fila) {
  var items = doc2By_(DOC2_SHEET.SOLICITUD_DOCS, 'solicitud_id', fila.solicitud_id, true);
  var cumplidos = 0;
  var vistaItems = [];
  for (var i = 0; i < items.length; i++) {
    if (String(items[i].estado_item) === 'CUMPLIDO') cumplidos++;
    vistaItems.push({
      solicitudDocumentoId: items[i].solicitud_documento_id,
      expedienteDocumentoId: items[i].expediente_documento_id,
      codigo: items[i].codigo_documento,
      nombre: doc2NombreDeCodigo_(items[i].codigo_documento),
      estado: items[i].estado_item,
      fechaCumplimiento: items[i].fecha_cumplimiento || '',
      observacion: items[i].observacion || ''
    });
  }
  var dias = fila.fecha_limite ? doc2DiasHasta_(fila.fecha_limite) : null;
  var estado = String(fila.estado_solicitud || '');
  var abierta = estado !== DOC2_ESTADO_SOLICITUD.COMPLETADA && estado !== DOC2_ESTADO_SOLICITUD.CANCELADA;
  return {
    solicitudId: fila.solicitud_id,
    expedienteId: fila.expediente_id,
    titulo: fila.titulo,
    descripcion: fila.descripcion || '',
    responsableId: fila.responsable_id || '',
    fechaSolicitud: fila.fecha_solicitud || '',
    fechaLimite: fila.fecha_limite || '',
    diasParaLimite: dias,
    vencida: abierta && dias !== null && dias < 0,
    prioridad: fila.prioridad || 'MEDIA',
    estado: estado,
    canal: fila.canal || 'INTERNO',
    ultimoRecordatorio: fila.ultimo_recordatorio || '',
    proximoRecordatorio: fila.proximo_recordatorio || '',
    recordatorios: docInt_(fila.cantidad_recordatorios, 0),
    total: items.length,
    cumplidos: cumplidos,
    items: vistaItems,
    creadoEn: fila.created_at || '',
    creadoPor: fila.created_by || '',
    version: docInt_(fila.version_registro, 1)
  };
}

/** Lista solicitudes con filtros. */
function doc2ListarSolicitudes_(filtros, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.VER);
  var f = filtros || {};
  var estados = doc2Lista_(f.estado);
  var responsable = f.responsable ? docKey_(f.responsable) : '';
  var soloVencidas = f.soloVencidas === true;
  var texto = f.texto ? docKey_(f.texto) : '';

  var resultado = doc2Query_(DOC2_SHEET.SOLICITUDES, {
    orden: f.orden === 'limite' ? 'fecha_limite' : 'created_at',
    direccion: f.direccion === 'asc' ? 'asc' : 'desc',
    pagina: f.pagina, porPagina: f.porPagina, sinPaginar: f.sinPaginar === true,
    filtro: function (fila) {
      if (f.expedienteId && String(fila.expediente_id) !== String(f.expedienteId)) return false;
      if (estados.length && estados.indexOf(docKey_(fila.estado_solicitud)) < 0) return false;
      if (responsable && docKey_(fila.responsable_id).indexOf(responsable) < 0) return false;
      var estado = String(fila.estado_solicitud);
      var abierta = estado !== DOC2_ESTADO_SOLICITUD.COMPLETADA && estado !== DOC2_ESTADO_SOLICITUD.CANCELADA;
      if (soloVencidas && !(abierta && doc2Vencida_(fila.fecha_limite))) return false;
      if (texto) {
        var expediente = doc2Get_(DOC2_SHEET.EXPEDIENTES, fila.expediente_id);
        var heno = docKey_([fila.titulo, fila.descripcion, (expediente && expediente.nombre) || '', (expediente && expediente.identificador) || ''].join(' '));
        if (heno.indexOf(texto) < 0) return false;
      }
      return true;
    }
  });

  var vista = [];
  for (var i = 0; i < resultado.filas.length; i++) {
    var v = doc2SolicitudVista_(resultado.filas[i]);
    var expediente = doc2Get_(DOC2_SHEET.EXPEDIENTES, resultado.filas[i].expediente_id);
    v.expediente = expediente ? { identificador: expediente.identificador, nombre: expediente.nombre, agencia: expediente.agencia, gerencia: expediente.gerencia } : null;
    vista.push(v);
  }
  return { total: resultado.total, pagina: resultado.pagina, paginas: resultado.paginas, porPagina: resultado.porPagina, solicitudes: vista };
}

/* ---------------------------- Solicitudes masivas ------------------------- */

/**
 * Calcula el impacto de una solicitud masiva ANTES de ejecutarla.
 *
 * Nadie debería lanzar una operación sobre doscientos expedientes sin saber a
 * cuántas personas va a escribir y cuántas ya tienen una solicitud abierta. Esta
 * función responde eso sin escribir nada.
 */
function doc2ImpactoMasivo_(seleccion, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.SOLICITAR);
  var expedientes = doc2ResolverSeleccion_(seleccion, contexto);

  var conPendientes = 0;
  var sinPendientes = 0;
  var yaConSolicitud = [];
  var detalle = [];

  for (var i = 0; i < expedientes.length; i++) {
    var expediente = expedientes[i];
    var pendientes = docInt_(expediente.total_pendientes, 0) + docInt_(expediente.total_no_entregados, 0);
    if (pendientes > 0) conPendientes++; else sinPendientes++;

    var abiertas = 0;
    var solicitudes = doc2By_(DOC2_SHEET.SOLICITUDES, 'expediente_id', expediente.expediente_id, false);
    for (var s = 0; s < solicitudes.length; s++) {
      var estado = String(solicitudes[s].estado_solicitud);
      if (estado !== DOC2_ESTADO_SOLICITUD.COMPLETADA && estado !== DOC2_ESTADO_SOLICITUD.CANCELADA) abiertas++;
    }
    if (abiertas > 0) yaConSolicitud.push({ identificador: expediente.identificador, nombre: expediente.nombre, abiertas: abiertas });

    detalle.push({
      expedienteId: expediente.expediente_id,
      identificador: expediente.identificador,
      nombre: expediente.nombre,
      agencia: expediente.agencia,
      gerencia: expediente.gerencia,
      pendientes: pendientes,
      solicitudesAbiertas: abiertas
    });
  }

  return {
    expedientes: expedientes.length,
    conPendientes: conPendientes,
    sinPendientes: sinPendientes,
    duplicadosPotenciales: yaConSolicitud.length,
    duplicados: yaConSolicitud.slice(0, 25),
    detalle: detalle.slice(0, 100),
    lote: DOC2_LIMITS.LOTE_MASIVO,
    advertencias: doc2AdvertenciasMasivas_(expedientes.length, sinPendientes, yaConSolicitud.length)
  };
}

/** Advertencias en lenguaje llano sobre una operación masiva. */
function doc2AdvertenciasMasivas_(total, sinPendientes, duplicados) {
  var avisos = [];
  if (!total) avisos.push('La selección no incluye ningún expediente.');
  if (sinPendientes) avisos.push(sinPendientes + ' expediente(s) no tienen requisitos pendientes: se omitirán.');
  if (duplicados) avisos.push(duplicados + ' expediente(s) ya tienen una solicitud abierta. Se creará otra solo si lo confirmas.');
  if (total > DOC2_LIMITS.LOTE_MASIVO) {
    avisos.push('Se procesará en lotes de ' + DOC2_LIMITS.LOTE_MASIVO + '. Si el proceso se corta, se puede reanudar desde el último lote.');
  }
  return avisos;
}

/**
 * Ejecuta una solicitud masiva por lotes, con punto de reanudación.
 *
 * `desde` es el índice del primer expediente del lote. La respuesta dice si
 * quedan más y desde dónde seguir, de modo que la interfaz puede mostrar progreso
 * real y reanudar si Apps Script corta la ejecución a los seis minutos.
 */
function doc2SolicitudMasiva_(peticion, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.SOLICITAR);
  var p = peticion || {};
  if (p.confirmado !== true) {
    throw docError_(DOC_CODE.BAD_REQUEST, 'Una operación masiva necesita confirmación explícita.',
      {
        hint: 'Revisa el impacto y vuelve a enviar con confirmado: true.',
        details: { impacto: 'documentacion.solicitudes.impacto' }
      });
  }

  var expedientes = doc2ResolverSeleccion_(p.seleccion || p, contexto);
  var desde = Math.max(docInt_(p.desde, 0), 0);
  var lote = Math.min(Math.max(docInt_(p.lote, DOC2_LIMITS.LOTE_MASIVO), 1), DOC2_LIMITS.LOTE_MASIVO);
  var permitirDuplicados = p.permitirDuplicados === true;

  var creadas = 0;
  var omitidas = 0;
  var fallidas = [];
  var procesados = 0;

  for (var i = desde; i < expedientes.length && procesados < lote; i++) {
    var expediente = expedientes[i];
    procesados++;
    try {
      var pendientes = docInt_(expediente.total_pendientes, 0) + docInt_(expediente.total_no_entregados, 0);
      if (pendientes <= 0) { omitidas++; continue; }

      if (!permitirDuplicados) {
        var abiertas = 0;
        var previas = doc2By_(DOC2_SHEET.SOLICITUDES, 'expediente_id', expediente.expediente_id, false);
        for (var s = 0; s < previas.length; s++) {
          var estado = String(previas[s].estado_solicitud);
          if (estado !== DOC2_ESTADO_SOLICITUD.COMPLETADA && estado !== DOC2_ESTADO_SOLICITUD.CANCELADA) abiertas++;
        }
        if (abiertas > 0) { omitidas++; continue; }
      }

      doc2CrearSolicitud_({
        expedienteId: expediente.expediente_id,
        titulo: p.titulo || ('Documentación pendiente · ' + expediente.nombre),
        descripcion: p.descripcion || p.instrucciones || '',
        responsableId: p.responsableId || expediente.responsable_id || '',
        fechaLimite: p.fechaLimite || '',
        prioridad: p.prioridad || 'MEDIA',
        canal: p.canal || 'INTERNO'
      }, contexto);
      creadas++;
    } catch (error) {
      var info = docClassify_(error);
      fallidas.push({ identificador: expediente.identificador, motivo: info.message, codigo: info.docCode });
    }
  }

  var siguiente = desde + procesados;
  var quedan = siguiente < expedientes.length;

  doc2Audit_({
    tipo: 'solicitudes.masivas', entidadTipo: 'lote', actor: contexto.actor, actorId: contexto.actorId,
    origen: contexto.origen, requestId: contexto.requestId,
    resultado: fallidas.length ? 'parcial' : 'ok',
    metadata: { total: expedientes.length, desde: desde, creadas: creadas, omitidas: omitidas, fallidas: fallidas.length }
  });

  if (!quedan) {
    doc2Emitir_(DOC2_EVENTO.PROCESO_MASIVO_TERMINADO, {
      proceso: 'solicitudes', total: expedientes.length, creadas: creadas
    }, contexto);
  }

  return {
    total: expedientes.length,
    procesados: procesados,
    creadas: creadas,
    omitidas: omitidas,
    fallidas: fallidas,
    siguiente: siguiente,
    quedan: quedan,
    progreso: expedientes.length ? Math.round((siguiente / expedientes.length) * 100) : 100
  };
}

/**
 * Resuelve una selección de expedientes.
 *
 * Acepta cuatro formas —lista explícita, filtro, agencia/gerencia/tipo, o «los
 * incompletos»— y devuelve siempre filas de expediente. Tope duro para que una
 * selección accidental no dispare una operación sobre todo el libro.
 */
function doc2ResolverSeleccion_(seleccion, ctx) {
  var s = seleccion || {};
  var salida = [];
  var vistos = {};

  function agregar(fila) {
    if (!fila || vistos[String(fila.expediente_id)]) return;
    vistos[String(fila.expediente_id)] = true;
    salida.push(fila);
  }

  var ids = s.expedienteIds || s.ids || [];
  for (var i = 0; i < ids.length; i++) {
    var fila = doc2ResolverExpediente_(ids[i]);
    if (fila) agregar(fila);
  }

  if (!salida.length && (s.filtro || s.agencia || s.gerencia || s.tipoFuncionario || s.soloIncompletos === true || s.todos === true)) {
    var filtros = s.filtro || {};
    if (s.agencia) filtros.agencia = s.agencia;
    if (s.gerencia) filtros.gerencia = s.gerencia;
    if (s.tipoFuncionario) filtros.tipoFuncionario = s.tipoFuncionario;
    if (s.soloIncompletos === true) filtros.conPendientes = true;
    filtros.sinPaginar = true;
    var listado = doc2ListarExpedientes_(filtros, ctx);
    for (var e = 0; e < listado.expedientes.length; e++) {
      agregar(doc2Get_(DOC2_SHEET.EXPEDIENTES, listado.expedientes[e].expedienteId));
    }
  }

  if (salida.length > DOC2_LIMITS.MAX_SELECCION_MASIVA) {
    throw docError_(DOC2_CODE.LIMITE_EXCEDIDO,
      'La selección incluye ' + salida.length + ' expedientes y el máximo por operación es ' + DOC2_LIMITS.MAX_SELECCION_MASIVA + '.',
      {
        hint: 'Acota el filtro (por agencia, gerencia o estado) y repite la operación por tramos.',
        details: { seleccionados: salida.length, maximo: DOC2_LIMITS.MAX_SELECCION_MASIVA }
      });
  }
  return salida;
}

/* ========================================================================== */
/* REVISIONES                                                                  */
/* ========================================================================== */

/**
 * Registra una decisión de revisión sobre un requisito.
 *
 * Cada decisión es una fila nueva en `RevisionesDocumentales`: append-only. El
 * requisito guarda el estado vigente y el identificador de la última decisión,
 * pero la historia completa queda, porque «¿quién aprobó esto y con qué motivo?»
 * es la pregunta que se hace seis meses después.
 */
function doc2DecidirRevision_(datos, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.REVISAR);
  var d = datos || {};

  var requisito = doc2ResolverRequisito_(d);
  var expediente = doc2ExigirExpediente_(requisito.expediente_id);
  doc2ExigirExpedienteEditable_(expediente);

  var destino = doc2Enum_(d.estado || d.decision, doc2ValoresDe_(DOC2_ESTADO_REVISION), '');
  if (!destino) {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'Decisión de revisión no reconocida.',
      {
        hint: 'Valores admitidos: ' + doc2ValoresDe_(DOC2_ESTADO_REVISION).join(', ') + '.',
        details: { fields: doc2Campo_('estado_revision', 'Decisión no válida.') }
      });
  }
  doc2ExigirTransicion_('revision', requisito.estado_revision || DOC2_ESTADO_REVISION.SIN_REVISION, destino);

  var exigeMotivo = destino === DOC2_ESTADO_REVISION.OBSERVADO || destino === DOC2_ESTADO_REVISION.RECHAZADO ||
    destino === DOC2_ESTADO_REVISION.REQUIERE_CORRECCION || destino === DOC2_ESTADO_REVISION.APROBADO_CON_OBSERVACION;
  var motivo = docKey_(d.motivo || d.motivoCodigo || '').replace(/ /g, '_');
  if (exigeMotivo) {
    var valido = false;
    for (var m = 0; m < DOC2_MOTIVOS_REVISION.length; m++) {
      if (DOC2_MOTIVOS_REVISION[m].codigo === motivo) { valido = true; break; }
    }
    if (!valido) {
      throw docError_(DOC_CODE.VALIDATION_ERROR, 'Esa decisión necesita un motivo del catálogo.',
        {
          hint: 'Motivos: ' + doc2MotivosTexto_() + '.',
          details: { fields: doc2Campo_('motivo_codigo', 'Selecciona un motivo.') }
        });
    }
  }

  var comentario = doc2TextoLargo_(d.comentario || '', DOC2_LIMITS.MAX_TEXTO_MEDIO);
  if (destino === DOC2_ESTADO_REVISION.OBSERVADO && !comentario) {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'Una observación necesita explicar qué hay que corregir.',
      { details: { fields: doc2Campo_('comentario', 'Describe la observación.') } });
  }

  // Aprobar un requisito que no está entregado no tiene sentido: se avisa en vez
  // de dejar un estado que nadie sabría interpretar.
  if ((destino === DOC2_ESTADO_REVISION.APROBADO || destino === DOC2_ESTADO_REVISION.APROBADO_CON_OBSERVACION) &&
      String(requisito.estado_documental) !== DOC2_ESTADO_DOCUMENTO.ENTREGADO &&
      String(requisito.estado_documental) !== DOC2_ESTADO_DOCUMENTO.NO_APLICA) {
    throw docError_(DOC_CODE.CONFLICT,
      'No se puede aprobar un requisito que no está entregado.',
      {
        hint: 'Marca primero el requisito como ENTREGADO (o NO_APLICA si corresponde).',
        details: { estadoDocumental: requisito.estado_documental }
      });
  }

  var revisionId = doc2NewId_('rev');
  doc2Insert_(DOC2_SHEET.REVISIONES, {
    revision_id: revisionId,
    expediente_id: expediente.expediente_id,
    expediente_documento_id: requisito.expediente_documento_id,
    codigo_documento: requisito.codigo_documento,
    revisor_id: doc2Texto_(contexto.actorId, 240),
    estado_revision: destino,
    motivo_codigo: exigeMotivo ? motivo : '',
    comentario: comentario,
    fecha_revision: docNow_(),
    version_documento_revisada: docInt_(requisito.version_registro, 1)
  }, contexto);

  var revisionAnterior = String(requisito.estado_revision || DOC2_ESTADO_REVISION.SIN_REVISION);
  doc2Update_(DOC2_SHEET.EXPEDIENTE_DOCS, requisito.expediente_documento_id, {
    estado_revision: destino,
    revision_actual_id: revisionId
  }, contexto);

  doc2Historial_({
    expedienteId: expediente.expediente_id, entidadTipo: 'expediente_documento',
    entidadId: requisito.expediente_documento_id, campo: 'estado_revision',
    anterior: revisionAnterior, nuevo: destino,
    motivo: comentario || doc2EtiquetaMotivo_(motivo), actor: contexto.actor
  });
  doc2Audit_({
    tipo: 'revision.decision', expedienteId: expediente.expediente_id, entidadTipo: 'revision',
    entidadId: revisionId, actor: contexto.actor, actorId: contexto.actorId,
    origen: contexto.origen, requestId: contexto.requestId,
    metadata: { codigo: requisito.codigo_documento, decision: destino, motivo: motivo }
  });

  if (destino === DOC2_ESTADO_REVISION.OBSERVADO || destino === DOC2_ESTADO_REVISION.REQUIERE_CORRECCION) {
    doc2Emitir_(DOC2_EVENTO.DOCUMENTO_OBSERVADO, {
      expedienteId: expediente.expediente_id,
      expedienteDocumentoId: requisito.expediente_documento_id,
      codigo: requisito.codigo_documento,
      comentario: comentario,
      motivo: motivo
    }, contexto);
  }
  if (destino === DOC2_ESTADO_REVISION.APROBADO || destino === DOC2_ESTADO_REVISION.APROBADO_CON_OBSERVACION) {
    doc2Emitir_(DOC2_EVENTO.DOCUMENTO_APROBADO, {
      expedienteId: expediente.expediente_id,
      expedienteDocumentoId: requisito.expediente_documento_id,
      codigo: requisito.codigo_documento
    }, contexto);
    doc2CompletarTareasDeOrigen_('revision', requisito.expediente_documento_id, contexto, 'El requisito quedó aprobado.');
  }

  var resumen = doc2RecalcularExpediente_(expediente.expediente_id, contexto);
  doc2EspejoLibro_(expediente.expediente_id, contexto);

  return { revisionId: revisionId, estado: destino, resumen: resumen };
}

/** Motivos de revisión como texto, para los mensajes de error. */
function doc2MotivosTexto_() {
  var out = [];
  for (var i = 0; i < DOC2_MOTIVOS_REVISION.length; i++) out.push(DOC2_MOTIVOS_REVISION[i].codigo);
  return out.join(', ');
}

/** Etiqueta legible de un motivo. */
function doc2EtiquetaMotivo_(codigo) {
  for (var i = 0; i < DOC2_MOTIVOS_REVISION.length; i++) {
    if (DOC2_MOTIVOS_REVISION[i].codigo === codigo) return DOC2_MOTIVOS_REVISION[i].etiqueta;
  }
  return codigo || '';
}

/** Vista de una decisión de revisión. */
function doc2RevisionVista_(fila) {
  return {
    revisionId: fila.revision_id,
    expedienteId: fila.expediente_id,
    expedienteDocumentoId: fila.expediente_documento_id,
    codigo: fila.codigo_documento,
    nombre: doc2NombreDeCodigo_(fila.codigo_documento),
    revisor: fila.revisor_id,
    estado: fila.estado_revision,
    motivo: fila.motivo_codigo || '',
    motivoEtiqueta: doc2EtiquetaMotivo_(fila.motivo_codigo),
    comentario: fila.comentario || '',
    fecha: fila.fecha_revision || fila.created_at || '',
    versionRevisada: docInt_(fila.version_documento_revisada, 1)
  };
}

/**
 * Cola de revisión: requisitos entregados que esperan decisión.
 *
 * Es la pantalla de trabajo de quien revisa: entra, ve qué tiene delante y
 * decide. Sin ella, revisar exige abrir expedientes uno a uno buscando qué llegó.
 */
function doc2ColaRevision_(filtros, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.VER);
  var f = filtros || {};
  var soloRequierenRevision = f.soloRequierenRevision === true;
  var estadosRevision = doc2Lista_(f.estadoRevision);

  var requisitos = doc2All_(DOC2_SHEET.EXPEDIENTE_DOCS, false);
  var pendientes = [];

  for (var i = 0; i < requisitos.length; i++) {
    var r = requisitos[i];
    var revision = String(r.estado_revision || DOC2_ESTADO_REVISION.SIN_REVISION);
    var entregado = String(r.estado_documental) === DOC2_ESTADO_DOCUMENTO.ENTREGADO;
    var def = doc2CatalogoItem_(r.codigo_documento);
    var exige = !!(def && def.requiere_revision === true);
    if (soloRequierenRevision && !exige) continue;

    var incluir;
    if (estadosRevision.length) {
      incluir = estadosRevision.indexOf(docKey_(revision)) >= 0;
    } else {
      incluir = (entregado && (revision === DOC2_ESTADO_REVISION.SIN_REVISION || revision === DOC2_ESTADO_REVISION.EN_REVISION)) ||
        revision === DOC2_ESTADO_REVISION.OBSERVADO || revision === DOC2_ESTADO_REVISION.REQUIERE_CORRECCION;
    }
    if (!incluir) continue;

    var expediente = doc2Get_(DOC2_SHEET.EXPEDIENTES, r.expediente_id);
    if (!expediente) continue;
    if (f.agencia && docKey_(expediente.agencia) !== docKey_(f.agencia)) continue;
    if (f.gerencia && docKey_(expediente.gerencia) !== docKey_(f.gerencia)) continue;
    if (f.expedienteId && String(expediente.expediente_id) !== String(f.expedienteId)) continue;
    if (f.texto) {
      var heno = docKey_([expediente.nombre, expediente.identificador, doc2NombreRequisito_(r)].join(' '));
      if (heno.indexOf(docKey_(f.texto)) < 0) continue;
    }

    pendientes.push({
      expedienteDocumentoId: r.expediente_documento_id,
      expedienteId: r.expediente_id,
      identificador: expediente.identificador,
      persona: expediente.nombre,
      agencia: expediente.agencia,
      gerencia: expediente.gerencia,
      codigo: r.codigo_documento,
      nombre: doc2NombreRequisito_(r),
      seccion: r.seccion,
      estadoDocumental: r.estado_documental,
      estadoRevision: revision,
      requiereRevision: exige,
      requiereAprobacion: !!(def && def.requiere_aprobacion === true),
      observaciones: r.observaciones || '',
      actualizadoEn: r.updated_at || '',
      version: docInt_(r.version_registro, 1)
    });
  }

  pendientes.sort(function (a, b) {
    var pa = a.estadoRevision === DOC2_ESTADO_REVISION.OBSERVADO ? 0 : 1;
    var pb = b.estadoRevision === DOC2_ESTADO_REVISION.OBSERVADO ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return String(a.actualizadoEn) < String(b.actualizadoEn) ? 1 : -1;
  });

  var porPagina = Math.min(Math.max(docInt_(f.porPagina, DOC2_LIMITS.PAGINA_POR_DEFECTO), 1), DOC2_LIMITS.PAGINA_MAXIMA);
  var pagina = Math.max(docInt_(f.pagina, 1), 1);
  var desde = (pagina - 1) * porPagina;

  return {
    total: pendientes.length,
    pagina: pagina,
    porPagina: porPagina,
    paginas: Math.max(1, Math.ceil(pendientes.length / porPagina)),
    requisitos: f.sinPaginar === true ? pendientes : pendientes.slice(desde, desde + porPagina),
    motivos: DOC2_MOTIVOS_REVISION
  };
}

/* ========================================================================== */
/* APROBACIONES                                                                */
/* ========================================================================== */

/**
 * Abre una aprobación.
 *
 * ── Multinivel preparado, un nivel funcionando ──────────────────────────────
 * La tabla lleva `flujo_codigo` y `nivel`, así que un flujo de dos o tres firmas
 * no necesita cambiar el modelo. Pero lo que se implementa —y se prueba— es el
 * flujo simple de un nivel, porque una máquina multinivel que nadie usa es código
 * muerto con aspecto de arquitectura. Cuando el área defina el segundo nivel,
 * basta con crear dos filas con `nivel` 1 y 2.
 */
function doc2SolicitarAprobacion_(datos, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.REVISAR);
  var d = datos || {};

  var expediente = doc2ExigirExpediente_(d.expedienteId || d.expediente_id);
  doc2ExigirExpedienteEditable_(expediente);

  var requisitoId = '';
  var codigo = '';
  if (d.expedienteDocumentoId || d.codigo) {
    var requisito = doc2ResolverRequisito_({
      expedienteDocumentoId: d.expedienteDocumentoId,
      expedienteId: expediente.expediente_id,
      codigo: d.codigo
    });
    requisitoId = requisito.expediente_documento_id;
    codigo = requisito.codigo_documento;
  }

  var aprobadores = [];
  var lista = d.aprobadores || (d.aprobador ? [d.aprobador] : []);
  for (var i = 0; i < lista.length; i++) {
    var texto = doc2Texto_(lista[i], 240);
    if (texto) aprobadores.push(texto);
  }
  if (!aprobadores.length) {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'Una aprobación necesita al menos un aprobador.',
      {
        hint: 'Indica el correo o el nombre de quien debe aprobar.',
        details: { fields: doc2Campo_('aprobadores', 'Indica quién aprueba.') }
      });
  }

  var slaHoras = doc2ConfigInt_('sla_aprobacion_horas', DOC2_SLA_HORAS.aprobacion);
  var fechaLimite = doc2ValidarFecha_(d.fechaLimite || doc2LimitePorSla_(slaHoras), 'fecha_limite');
  var flujo = doc2Texto_(d.flujo || 'SIMPLE', 60);
  var creadas = [];

  for (var n = 0; n < aprobadores.length; n++) {
    var id = doc2NewId_('apr');
    doc2Insert_(DOC2_SHEET.APROBACIONES, {
      aprobacion_id: id,
      expediente_id: expediente.expediente_id,
      expediente_documento_id: requisitoId,
      flujo_codigo: flujo,
      nivel: n + 1,
      aprobador_id: aprobadores[n],
      estado_aprobacion: DOC2_ESTADO_APROBACION.PENDIENTE,
      comentario: doc2TextoLargo_(d.comentario || '', DOC2_LIMITS.MAX_TEXTO_MEDIO),
      fecha_limite: fechaLimite,
      fecha_decision: ''
    }, contexto);
    creadas.push(id);

    if (requisitoId && n === 0) {
      doc2Update_(DOC2_SHEET.EXPEDIENTE_DOCS, requisitoId, { aprobacion_actual_id: id }, contexto);
    }

    doc2Notificar_({
      usuario: aprobadores[n],
      expedienteId: expediente.expediente_id,
      entidadTipo: 'aprobacion',
      entidadId: id,
      tipoEvento: DOC2_EVENTO.APROBACION_SOLICITADA,
      titulo: 'Aprobación pendiente · ' + expediente.nombre,
      mensaje: 'Se solicitó tu aprobación' + (codigo ? ' para «' + doc2NombreDeCodigo_(codigo) + '»' : '') +
        '. Fecha límite: ' + (fechaLimite || 'sin definir') + '.'
    }, contexto);
  }

  doc2Historial_({
    expedienteId: expediente.expediente_id, entidadTipo: 'aprobacion', entidadId: creadas[0],
    campo: 'aprobacion', anterior: '', nuevo: 'aprobación solicitada a ' + aprobadores.join(', '),
    actor: contexto.actor
  });
  doc2Audit_({
    tipo: DOC2_EVENTO.APROBACION_SOLICITADA, expedienteId: expediente.expediente_id,
    entidadTipo: 'aprobacion', entidadId: creadas[0], actor: contexto.actor, actorId: contexto.actorId,
    origen: contexto.origen, requestId: contexto.requestId,
    metadata: { niveles: aprobadores.length, flujo: flujo, codigo: codigo }
  });
  doc2Emitir_(DOC2_EVENTO.APROBACION_SOLICITADA, {
    expedienteId: expediente.expediente_id, aprobacionIds: creadas
  }, contexto);

  var resumen = doc2RecalcularExpediente_(expediente.expediente_id, contexto);
  return { aprobaciones: creadas, fechaLimite: fechaLimite, resumen: resumen };
}

/** Resuelve una aprobación: aprobar, rechazar o cancelar. */
function doc2ResolverAprobacion_(aprobacionId, decision, ctx, opciones) {
  var contexto = ctx || doc2CtxActual_();
  var o = opciones || {};
  var fila = doc2GetOrFail_(DOC2_SHEET.APROBACIONES, aprobacionId, 'la aprobación');
  var destino = doc2Enum_(decision, doc2ValoresDe_(DOC2_ESTADO_APROBACION), '');
  if (!destino) {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'Decisión de aprobación no reconocida.',
      { details: { fields: doc2Campo_('estado_aprobacion', 'Decisión no válida.') } });
  }
  doc2Autorizar_(contexto, destino === DOC2_ESTADO_APROBACION.CANCELADA ? DOC2_CAPACIDAD.REVISAR : DOC2_CAPACIDAD.APROBAR);
  doc2ExigirTransicion_('aprobacion', fila.estado_aprobacion, destino);

  var comentario = doc2TextoLargo_(o.comentario || '', DOC2_LIMITS.MAX_TEXTO_MEDIO);
  if (destino === DOC2_ESTADO_APROBACION.RECHAZADA && !comentario) {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'Un rechazo necesita explicación.',
      { details: { fields: doc2Campo_('comentario', 'Explica el motivo del rechazo.') } });
  }

  // Los niveles son secuenciales: no se puede firmar el 2 antes del 1.
  if (destino === DOC2_ESTADO_APROBACION.APROBADA && docInt_(fila.nivel, 1) > 1) {
    var hermanos = doc2By_(DOC2_SHEET.APROBACIONES, 'expediente_id', fila.expediente_id, false);
    for (var h = 0; h < hermanos.length; h++) {
      if (String(hermanos[h].flujo_codigo) !== String(fila.flujo_codigo)) continue;
      if (docInt_(hermanos[h].nivel, 1) >= docInt_(fila.nivel, 1)) continue;
      if (String(hermanos[h].estado_aprobacion) === DOC2_ESTADO_APROBACION.PENDIENTE) {
        throw docError_(DOC_CODE.CONFLICT,
          'Falta la aprobación del nivel ' + hermanos[h].nivel + '.',
          { hint: 'Los niveles se aprueban en orden.', details: { nivelPendiente: hermanos[h].nivel } });
      }
    }
  }

  var estadoAnterior = String(fila.estado_aprobacion || '');
  var nivelAnterior = docInt_(fila.nivel, 1);
  doc2Update_(DOC2_SHEET.APROBACIONES, aprobacionId, {
    estado_aprobacion: destino,
    comentario: comentario || fila.comentario,
    fecha_decision: docNow_(),
    aprobador_id: fila.aprobador_id || doc2Texto_(contexto.actorId, 240)
  }, contexto, { version: o.version });

  doc2Historial_({
    expedienteId: fila.expediente_id, entidadTipo: 'aprobacion', entidadId: aprobacionId,
    campo: 'estado_aprobacion', anterior: estadoAnterior, nuevo: destino,
    motivo: comentario, actor: contexto.actor
  });
  doc2Audit_({
    tipo: DOC2_EVENTO.APROBACION_RESUELTA, expedienteId: fila.expediente_id, entidadTipo: 'aprobacion',
    entidadId: aprobacionId, actor: contexto.actor, actorId: contexto.actorId,
    origen: contexto.origen, requestId: contexto.requestId,
    metadata: { decision: destino, nivel: nivelAnterior }
  });
  doc2Emitir_(DOC2_EVENTO.APROBACION_RESUELTA, {
    expedienteId: fila.expediente_id, aprobacionId: aprobacionId, decision: destino
  }, contexto);
  doc2CompletarTareasDeOrigen_('aprobacion', aprobacionId, contexto, 'La aprobación se resolvió.');

  var resumen = doc2RecalcularExpediente_(fila.expediente_id, contexto);
  return { aprobacionId: aprobacionId, estado: destino, resumen: resumen };
}

/** Vista de una aprobación. */
function doc2AprobacionVista_(fila) {
  var dias = fila.fecha_limite ? doc2DiasHasta_(fila.fecha_limite) : null;
  return {
    aprobacionId: fila.aprobacion_id,
    expedienteId: fila.expediente_id,
    expedienteDocumentoId: fila.expediente_documento_id || '',
    codigo: fila.expediente_documento_id ? doc2CodigoDeRequisito_(fila.expediente_documento_id) : '',
    flujo: fila.flujo_codigo || 'SIMPLE',
    nivel: docInt_(fila.nivel, 1),
    aprobador: fila.aprobador_id || '',
    estado: fila.estado_aprobacion,
    comentario: fila.comentario || '',
    fechaLimite: fila.fecha_limite || '',
    diasParaLimite: dias,
    vencida: String(fila.estado_aprobacion) === DOC2_ESTADO_APROBACION.PENDIENTE && dias !== null && dias < 0,
    fechaDecision: fila.fecha_decision || '',
    creadoEn: fila.created_at || '',
    version: docInt_(fila.version_registro, 1)
  };
}

/** Código de catálogo de un requisito, sin fallar si ya no existe. */
function doc2CodigoDeRequisito_(expedienteDocumentoId) {
  var fila = doc2Get_(DOC2_SHEET.EXPEDIENTE_DOCS, expedienteDocumentoId);
  return fila ? String(fila.codigo_documento) : '';
}

/** Lista aprobaciones con filtros. */
function doc2ListarAprobaciones_(filtros, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.VER);
  var f = filtros || {};
  var estados = doc2Lista_(f.estado);
  var aprobador = f.aprobador ? docKey_(f.aprobador) : '';

  var resultado = doc2Query_(DOC2_SHEET.APROBACIONES, {
    orden: f.orden === 'limite' ? 'fecha_limite' : 'created_at',
    direccion: f.direccion === 'asc' ? 'asc' : 'desc',
    pagina: f.pagina, porPagina: f.porPagina, sinPaginar: f.sinPaginar === true,
    filtro: function (fila) {
      if (f.expedienteId && String(fila.expediente_id) !== String(f.expedienteId)) return false;
      if (estados.length && estados.indexOf(docKey_(fila.estado_aprobacion)) < 0) return false;
      if (aprobador && docKey_(fila.aprobador_id).indexOf(aprobador) < 0) return false;
      if (f.soloPendientes === true && String(fila.estado_aprobacion) !== DOC2_ESTADO_APROBACION.PENDIENTE) return false;
      return true;
    }
  });

  var vista = [];
  for (var i = 0; i < resultado.filas.length; i++) {
    var v = doc2AprobacionVista_(resultado.filas[i]);
    var expediente = doc2Get_(DOC2_SHEET.EXPEDIENTES, resultado.filas[i].expediente_id);
    v.expediente = expediente ? { identificador: expediente.identificador, nombre: expediente.nombre } : null;
    vista.push(v);
  }
  return { total: resultado.total, pagina: resultado.pagina, paginas: resultado.paginas, porPagina: resultado.porPagina, aprobaciones: vista };
}

/* ========================================================================== */
/* COMENTARIOS                                                                 */
/* ========================================================================== */

/**
 * Crea un comentario, opcionalmente como respuesta a otro.
 *
 * ── Visibilidad ─────────────────────────────────────────────────────────────
 *   INTERNA    nota entre quienes gestionan («insistir el viernes»);
 *   FORMAL     constancia que puede citarse en el expediente;
 *   OPERATIVA  seguimiento del día a día.
 *
 * Los internos no se devuelven a quien no tiene capacidad de edición o revisión.
 * Filtrar en el servidor y no en la interfaz es la diferencia entre una
 * restricción y una decoración.
 */
function doc2CrearComentario_(datos, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.COMENTAR);
  var d = datos || {};

  var expediente = doc2ExigirExpediente_(d.expedienteId || d.expediente_id);
  var contenido = doc2TextoLargo_(d.contenido || d.texto || '', DOC2_LIMITS.MAX_COMENTARIO);
  if (!contenido) {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'El comentario está vacío.',
      { details: { fields: doc2Campo_('contenido', 'Escribe el comentario.') } });
  }

  var requisitoId = '';
  if (d.expedienteDocumentoId || d.codigo) {
    var requisito = doc2ResolverRequisito_({
      expedienteDocumentoId: d.expedienteDocumentoId,
      expedienteId: expediente.expediente_id,
      codigo: d.codigo
    });
    requisitoId = requisito.expediente_documento_id;
  }

  var padreId = docRaw_(d.comentarioPadreId || d.padre || '', 200);
  if (padreId) {
    var padre = doc2Get_(DOC2_SHEET.COMENTARIOS, padreId);
    if (!padre || String(padre.expediente_id) !== String(expediente.expediente_id)) {
      throw docError_(DOC2_CODE.RELACION_INVALIDA, 'El comentario al que respondes no pertenece a este expediente.',
        { details: { comentarioPadreId: padreId } });
    }
  }

  var id = doc2NewId_('com');
  doc2Insert_(DOC2_SHEET.COMENTARIOS, {
    comentario_id: id,
    expediente_id: expediente.expediente_id,
    expediente_documento_id: requisitoId,
    comentario_padre_id: padreId,
    tipo_comentario: doc2Enum_(d.tipo || 'GENERAL',
      ['GENERAL', 'REQUISITO', 'REVISION', 'TAREA', 'PRORROGA', 'SEGUIMIENTO', 'APROBACION'], 'GENERAL'),
    visibilidad: doc2Enum_(d.visibilidad || 'OPERATIVA', ['INTERNA', 'FORMAL', 'OPERATIVA'], 'OPERATIVA'),
    contenido: contenido,
    resuelto: false
  }, contexto);

  doc2Audit_({
    tipo: 'comentario.creado', expedienteId: expediente.expediente_id, entidadTipo: 'comentario',
    entidadId: id, actor: contexto.actor, actorId: contexto.actorId, origen: contexto.origen,
    requestId: contexto.requestId, metadata: { requisito: requisitoId, respuesta: !!padreId }
  });

  return { comentarioId: id };
}

/**
 * Edita un comentario conservando la versión anterior en el historial.
 *
 * Solo lo puede editar quien lo escribió (o un supervisor). Un comentario que
 * cualquiera puede reescribir sin dejar rastro no sirve como constancia.
 */
function doc2EditarComentario_(comentarioId, contenido, ctx, opciones) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.COMENTAR);
  var o = opciones || {};
  var fila = doc2GetOrFail_(DOC2_SHEET.COMENTARIOS, comentarioId, 'el comentario');

  var esAutor = docKey_(fila.created_by) === docKey_(contexto.actor) || docKey_(fila.created_by) === docKey_(contexto.actorId);
  if (!esAutor && !doc2Puede_(contexto, DOC2_CAPACIDAD.REVISAR)) {
    throw docError_(DOC2_CODE.PERMISO_INSUFICIENTE, 'Solo puedes editar tus propios comentarios.',
      { hint: 'Responde al comentario en lugar de editarlo.', details: { autor: fila.created_by } });
  }

  var texto = doc2TextoLargo_(contenido, DOC2_LIMITS.MAX_COMENTARIO);
  if (!texto) {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'El comentario no puede quedar vacío.',
      { details: { fields: doc2Campo_('contenido', 'Escribe el comentario.') } });
  }
  if (texto === String(fila.contenido)) return { comentarioId: comentarioId, sinCambios: true };

  var contenidoAnterior = String(fila.contenido || '');
  doc2Update_(DOC2_SHEET.COMENTARIOS, comentarioId, { contenido: texto }, contexto, { version: o.version });
  doc2Historial_({
    expedienteId: fila.expediente_id, entidadTipo: 'comentario', entidadId: comentarioId,
    campo: 'contenido', anterior: contenidoAnterior, nuevo: texto,
    motivo: 'Comentario editado', actor: contexto.actor
  });
  return { comentarioId: comentarioId, editado: true };
}

/** Marca un comentario como resuelto (o lo reabre). */
function doc2ResolverComentario_(comentarioId, resuelto, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.COMENTAR);
  var fila = doc2GetOrFail_(DOC2_SHEET.COMENTARIOS, comentarioId, 'el comentario');
  var valor = resuelto !== false;
  var resueltoAnterior = fila.resuelto === true;
  if (resueltoAnterior === valor) return { comentarioId: comentarioId, sinCambios: true };
  doc2Update_(DOC2_SHEET.COMENTARIOS, comentarioId, { resuelto: valor }, contexto);
  doc2Historial_({
    expedienteId: fila.expediente_id, entidadTipo: 'comentario', entidadId: comentarioId,
    campo: 'resuelto', anterior: resueltoAnterior ? 'sí' : 'no', nuevo: valor ? 'sí' : 'no',
    actor: contexto.actor
  });
  return { comentarioId: comentarioId, resuelto: valor };
}

/** Comentarios de un expediente que el actor puede ver, en forma de hilos. */
function doc2ComentariosVisibles_(expedienteId, ctx) {
  var contexto = ctx || doc2CtxActual_();
  var veInternos = doc2VeComentariosInternos_(contexto);
  var filas = doc2By_(DOC2_SHEET.COMENTARIOS, 'expediente_id', expedienteId, false);
  filas.sort(function (a, b) { return String(a.created_at) > String(b.created_at) ? 1 : -1; });

  var vista = [];
  for (var i = 0; i < filas.length; i++) {
    var fila = filas[i];
    if (String(fila.visibilidad) === 'INTERNA' && !veInternos) continue;
    vista.push({
      comentarioId: fila.comentario_id,
      expedienteId: fila.expediente_id,
      expedienteDocumentoId: fila.expediente_documento_id || '',
      codigo: fila.expediente_documento_id ? doc2CodigoDeRequisito_(fila.expediente_documento_id) : '',
      padreId: fila.comentario_padre_id || '',
      tipo: fila.tipo_comentario,
      visibilidad: fila.visibilidad,
      contenido: fila.contenido,
      resuelto: fila.resuelto === true,
      creadoEn: fila.created_at,
      creadoPor: fila.created_by,
      editadoEn: fila.updated_at !== fila.created_at ? fila.updated_at : '',
      version: docInt_(fila.version_registro, 1)
    });
  }
  return vista;
}

/** Lista comentarios con filtros, para la bandeja de comentarios. */
function doc2ListarComentarios_(filtros, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.VER);
  var f = filtros || {};
  var veInternos = doc2VeComentariosInternos_(contexto);
  var tipos = doc2Lista_(f.tipo);
  var texto = f.texto ? docKey_(f.texto) : '';

  var resultado = doc2Query_(DOC2_SHEET.COMENTARIOS, {
    orden: 'created_at', direccion: 'desc',
    pagina: f.pagina, porPagina: f.porPagina, sinPaginar: f.sinPaginar === true,
    filtro: function (fila) {
      if (String(fila.visibilidad) === 'INTERNA' && !veInternos) return false;
      if (f.expedienteId && String(fila.expediente_id) !== String(f.expedienteId)) return false;
      if (tipos.length && tipos.indexOf(docKey_(fila.tipo_comentario)) < 0) return false;
      if (f.soloAbiertos === true && fila.resuelto === true) return false;
      if (texto && docKey_(fila.contenido).indexOf(texto) < 0) return false;
      return true;
    }
  });

  var vista = [];
  for (var i = 0; i < resultado.filas.length; i++) {
    var fila = resultado.filas[i];
    var expediente = doc2Get_(DOC2_SHEET.EXPEDIENTES, fila.expediente_id);
    vista.push({
      comentarioId: fila.comentario_id,
      expedienteId: fila.expediente_id,
      expediente: expediente ? { identificador: expediente.identificador, nombre: expediente.nombre } : null,
      tipo: fila.tipo_comentario,
      visibilidad: fila.visibilidad,
      contenido: fila.contenido,
      resuelto: fila.resuelto === true,
      creadoEn: fila.created_at,
      creadoPor: fila.created_by
    });
  }
  return { total: resultado.total, pagina: resultado.pagina, paginas: resultado.paginas, porPagina: resultado.porPagina, comentarios: vista };
}

/* ========================================================================== */
/* TAREAS                                                                      */
/* ========================================================================== */

/**
 * Crea una tarea.
 *
 * `origen_tipo` y `origen_id` son lo que permite cerrarla sola cuando su causa se
 * resuelve: si la tarea nació de un requisito observado y ese requisito se
 * aprueba, la tarea se completa con su motivo. Solo se automatiza cuando la
 * relación es INEQUÍVOCA; en cualquier otro caso la cierra una persona.
 */
function doc2CrearTarea_(datos, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.TAREAS);
  var d = datos || {};

  var expediente = doc2ExigirExpediente_(d.expedienteId || d.expediente_id);
  var titulo = doc2Texto_(d.titulo || '', 300);
  if (!titulo) {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'La tarea necesita un título.',
      { details: { fields: doc2Campo_('titulo', 'Escribe qué hay que hacer.') } });
  }

  var requisitoId = '';
  if (d.expedienteDocumentoId || d.codigo) {
    var requisito = doc2ResolverRequisito_({
      expedienteDocumentoId: d.expedienteDocumentoId,
      expedienteId: expediente.expediente_id,
      codigo: d.codigo
    });
    requisitoId = requisito.expediente_documento_id;
  }

  var tipo = doc2Enum_(d.tipo || d.tipo_tarea || 'SEGUIMIENTO',
    ['SEGUIMIENTO', 'CORRECCION', 'REVISION', 'APROBACION', 'SOLICITUD', 'PRORROGA', 'OTRO'], 'SEGUIMIENTO');
  var slaClave = tipo === 'CORRECCION' ? 'sla_correccion_horas'
    : (tipo === 'REVISION' ? 'sla_revision_horas'
      : (tipo === 'APROBACION' ? 'sla_aprobacion_horas' : 'sla_seguimiento_horas'));
  var slaHoras = docInt_(d.slaHoras, doc2ConfigInt_(slaClave, DOC2_SLA_HORAS.seguimiento));
  var fechaLimite = doc2ValidarFecha_(d.fechaLimite || doc2LimitePorSla_(slaHoras), 'fecha_limite');

  var id = doc2NewId_('tar');
  doc2Insert_(DOC2_SHEET.TAREAS, {
    tarea_id: id,
    expediente_id: expediente.expediente_id,
    expediente_documento_id: requisitoId,
    tipo_tarea: tipo,
    titulo: titulo,
    descripcion: doc2TextoLargo_(d.descripcion || '', DOC2_LIMITS.MAX_TEXTO_MEDIO),
    responsable_id: doc2Texto_(d.responsableId || d.responsable || expediente.responsable_id || contexto.actorId, 240),
    prioridad: doc2Enum_(d.prioridad || 'MEDIA', ['BAJA', 'MEDIA', 'ALTA', 'URGENTE'], 'MEDIA'),
    estado_tarea: DOC2_ESTADO_TAREA.PENDIENTE,
    fecha_limite: fechaLimite,
    sla_horas: slaHoras,
    escalada: false,
    origen_tipo: doc2Texto_(d.origenTipo || '', 60),
    origen_id: docRaw_(d.origenId || '', 200),
    completed_at: '',
    completed_by: ''
  }, contexto);

  doc2Notificar_({
    usuario: doc2Texto_(d.responsableId || d.responsable || expediente.responsable_id || contexto.actorId, 240),
    expedienteId: expediente.expediente_id,
    entidadTipo: 'tarea',
    entidadId: id,
    tipoEvento: DOC2_EVENTO.TAREA_CREADA,
    titulo: 'Tarea asignada · ' + titulo,
    mensaje: (d.descripcion ? String(d.descripcion) + ' ' : '') + 'Vence el ' + (fechaLimite || 'sin fecha') + '.'
  }, contexto);

  doc2Historial_({
    expedienteId: expediente.expediente_id, entidadTipo: 'tarea', entidadId: id,
    campo: 'tarea', anterior: '', nuevo: 'tarea creada: ' + titulo, actor: contexto.actor
  });
  doc2Audit_({
    tipo: DOC2_EVENTO.TAREA_CREADA, expedienteId: expediente.expediente_id, entidadTipo: 'tarea',
    entidadId: id, actor: contexto.actor, actorId: contexto.actorId, origen: contexto.origen,
    requestId: contexto.requestId, metadata: { tipo: tipo, limite: fechaLimite }
  });

  var resumen = doc2RecalcularExpediente_(expediente.expediente_id, contexto);
  return { tareaId: id, fechaLimite: fechaLimite, resumen: resumen };
}

/** Cambia el estado de una tarea comprobando la transición. */
function doc2CambiarEstadoTarea_(tareaId, estado, ctx, opciones) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.TAREAS);
  var o = opciones || {};
  var fila = doc2GetOrFail_(DOC2_SHEET.TAREAS, tareaId, 'la tarea');
  var destino = doc2Enum_(estado, doc2ValoresDe_(DOC2_ESTADO_TAREA), '');
  if (!destino) {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'Estado de tarea no reconocido.',
      { details: { fields: doc2Campo_('estado_tarea', 'Estado no válido.') } });
  }
  doc2ExigirTransicion_('tarea', fila.estado_tarea, destino);

  if (destino === DOC2_ESTADO_TAREA.BLOQUEADA && !o.motivo) {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'Bloquear una tarea exige decir qué la bloquea.',
      { details: { fields: doc2Campo_('motivo', 'Indica el bloqueo.') } });
  }

  var estadoAnterior = String(fila.estado_tarea || '');
  var patch = { estado_tarea: destino };
  if (destino === DOC2_ESTADO_TAREA.COMPLETADA) {
    patch.completed_at = docNow_();
    patch.completed_by = doc2Texto_(contexto.actor, 240);
  }

  doc2Update_(DOC2_SHEET.TAREAS, tareaId, patch, contexto, { version: o.version });
  doc2Historial_({
    expedienteId: fila.expediente_id, entidadTipo: 'tarea', entidadId: tareaId,
    campo: 'estado_tarea', anterior: estadoAnterior, nuevo: destino,
    motivo: o.motivo || '', actor: contexto.actor
  });
  doc2Audit_({
    tipo: 'tarea.estado', expedienteId: fila.expediente_id, entidadTipo: 'tarea', entidadId: tareaId,
    actor: contexto.actor, actorId: contexto.actorId, origen: contexto.origen, requestId: contexto.requestId,
    metadata: { desde: estadoAnterior, hasta: destino }
  });

  var resumen = doc2RecalcularExpediente_(fila.expediente_id, contexto);
  return { tareaId: tareaId, estado: destino, resumen: resumen };
}

/** Reasigna o reprioriza una tarea. */
function doc2ActualizarTarea_(tareaId, cambios, ctx, opciones) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.TAREAS);
  var o = opciones || {};
  var c = cambios || {};
  var fila = doc2GetOrFail_(DOC2_SHEET.TAREAS, tareaId, 'la tarea');

  var patch = {};
  var antes = {};
  if (c.responsableId !== undefined || c.responsable !== undefined) {
    antes.responsable_id = fila.responsable_id;
    patch.responsable_id = doc2Texto_(c.responsableId !== undefined ? c.responsableId : c.responsable, 240);
  }
  if (c.prioridad !== undefined) {
    antes.prioridad = fila.prioridad;
    patch.prioridad = doc2Enum_(c.prioridad, ['BAJA', 'MEDIA', 'ALTA', 'URGENTE'], fila.prioridad || 'MEDIA');
  }
  if (c.fechaLimite !== undefined) {
    antes.fecha_limite = fila.fecha_limite;
    patch.fecha_limite = doc2ValidarFecha_(c.fechaLimite, 'fecha_limite');
  }
  if (c.titulo !== undefined) {
    antes.titulo = fila.titulo;
    patch.titulo = doc2Texto_(c.titulo, 300);
  }
  if (c.descripcion !== undefined) {
    antes.descripcion = fila.descripcion;
    patch.descripcion = doc2TextoLargo_(c.descripcion, DOC2_LIMITS.MAX_TEXTO_MEDIO);
  }
  if (!Object.keys(patch).length) return { tareaId: tareaId, sinCambios: true };

  doc2Update_(DOC2_SHEET.TAREAS, tareaId, patch, contexto, { version: o.version });
  var cambiosHist = doc2DiffHistorial_('tarea', tareaId, antes, patch,
    { actor: contexto.actor, expedienteId: fila.expediente_id, motivo: c.motivo || '' });

  if (patch.responsable_id && docKey_(patch.responsable_id) !== docKey_(antes.responsable_id)) {
    doc2Notificar_({
      usuario: patch.responsable_id, expedienteId: fila.expediente_id, entidadTipo: 'tarea', entidadId: tareaId,
      tipoEvento: DOC2_EVENTO.TAREA_CREADA, titulo: 'Tarea reasignada · ' + (patch.titulo || fila.titulo),
      mensaje: 'Se te asignó esta tarea. Vence el ' + (patch.fecha_limite || fila.fecha_limite || 'sin fecha') + '.'
    }, contexto);
  }

  var resumen = doc2RecalcularExpediente_(fila.expediente_id, contexto);
  return { tareaId: tareaId, cambios: cambiosHist, resumen: resumen };
}

/**
 * Completa las tareas abiertas que nacieron de un origen concreto.
 *
 * Se usa cuando la causa desaparece: el requisito se aprobó, la solicitud se
 * completó, la aprobación se resolvió. Cierra solo lo que apunta EXACTAMENTE a
 * ese origen, y deja constancia del motivo.
 */
function doc2CompletarTareasDeOrigen_(origenTipo, origenId, ctx, motivo) {
  var contexto = ctx || doc2CtxActual_();
  var filas = doc2By_(DOC2_SHEET.TAREAS, 'origen_id', origenId, false);
  var cerradas = 0;
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i].origen_tipo) !== String(origenTipo)) continue;
    var estado = String(filas[i].estado_tarea);
    if (estado === DOC2_ESTADO_TAREA.COMPLETADA || estado === DOC2_ESTADO_TAREA.CANCELADA) continue;
    if (!doc2TransicionPermitida_('tarea', estado, DOC2_ESTADO_TAREA.COMPLETADA)) continue;
    doc2Update_(DOC2_SHEET.TAREAS, filas[i].tarea_id, {
      estado_tarea: DOC2_ESTADO_TAREA.COMPLETADA,
      completed_at: docNow_(),
      completed_by: 'automatizacion'
    }, contexto);
    doc2Historial_({
      expedienteId: filas[i].expediente_id, entidadTipo: 'tarea', entidadId: filas[i].tarea_id,
      campo: 'estado_tarea', anterior: estado, nuevo: DOC2_ESTADO_TAREA.COMPLETADA,
      motivo: motivo || 'Su causa se resolvió.', actor: 'automatizacion'
    });
    cerradas++;
  }
  return cerradas;
}

/** Vista de una tarea. */
function doc2TareaVista_(fila) {
  var dias = fila.fecha_limite ? doc2DiasHasta_(fila.fecha_limite) : null;
  var estado = String(fila.estado_tarea || '');
  var abierta = estado !== DOC2_ESTADO_TAREA.COMPLETADA && estado !== DOC2_ESTADO_TAREA.CANCELADA;
  return {
    tareaId: fila.tarea_id,
    expedienteId: fila.expediente_id,
    expedienteDocumentoId: fila.expediente_documento_id || '',
    codigo: fila.expediente_documento_id ? doc2CodigoDeRequisito_(fila.expediente_documento_id) : '',
    tipo: fila.tipo_tarea,
    titulo: fila.titulo,
    descripcion: fila.descripcion || '',
    responsableId: fila.responsable_id || '',
    prioridad: fila.prioridad || 'MEDIA',
    estado: estado,
    fechaLimite: fila.fecha_limite || '',
    diasParaLimite: dias,
    vencida: abierta && dias !== null && dias < 0,
    fueraDeSla: abierta && dias !== null && dias < 0,
    slaHoras: docInt_(fila.sla_horas, 0),
    escalada: fila.escalada === true,
    origenTipo: fila.origen_tipo || '',
    origenId: fila.origen_id || '',
    creadoEn: fila.created_at || '',
    creadoPor: fila.created_by || '',
    completadoEn: fila.completed_at || '',
    completadoPor: fila.completed_by || '',
    version: docInt_(fila.version_registro, 1)
  };
}

/** Lista tareas con filtros. */
function doc2ListarTareas_(filtros, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.VER);
  var f = filtros || {};
  var estados = doc2Lista_(f.estado);
  var tipos = doc2Lista_(f.tipo);
  var responsable = f.responsable ? docKey_(f.responsable) : '';
  var texto = f.texto ? docKey_(f.texto) : '';

  var resultado = doc2Query_(DOC2_SHEET.TAREAS, {
    orden: f.orden === 'limite' ? 'fecha_limite' : 'created_at',
    direccion: f.direccion === 'asc' ? 'asc' : 'desc',
    pagina: f.pagina, porPagina: f.porPagina, sinPaginar: f.sinPaginar === true,
    filtro: function (fila) {
      if (f.expedienteId && String(fila.expediente_id) !== String(f.expedienteId)) return false;
      if (estados.length && estados.indexOf(docKey_(fila.estado_tarea)) < 0) return false;
      if (tipos.length && tipos.indexOf(docKey_(fila.tipo_tarea)) < 0) return false;
      if (responsable && docKey_(fila.responsable_id).indexOf(responsable) < 0) return false;
      var estado = String(fila.estado_tarea);
      var abierta = estado !== DOC2_ESTADO_TAREA.COMPLETADA && estado !== DOC2_ESTADO_TAREA.CANCELADA;
      if (f.soloAbiertas === true && !abierta) return false;
      if (f.soloVencidas === true && !(abierta && doc2Vencida_(fila.fecha_limite))) return false;
      if (texto && docKey_([fila.titulo, fila.descripcion].join(' ')).indexOf(texto) < 0) return false;
      return true;
    }
  });

  var vista = [];
  for (var i = 0; i < resultado.filas.length; i++) {
    var v = doc2TareaVista_(resultado.filas[i]);
    var expediente = doc2Get_(DOC2_SHEET.EXPEDIENTES, resultado.filas[i].expediente_id);
    v.expediente = expediente ? { identificador: expediente.identificador, nombre: expediente.nombre } : null;
    vista.push(v);
  }
  return { total: resultado.total, pagina: resultado.pagina, paginas: resultado.paginas, porPagina: resultado.porPagina, tareas: vista };
}
