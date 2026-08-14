/**
 * 17_Automation.gs — eventos, automatizaciones y centro de notificaciones.
 *
 * ── Un motor de reglas que no ejecuta código ─────────────────────────────────
 * Las automatizaciones son una lista blanca declarada en 11_Domain.gs: cada una
 * une un EVENTO con una ACCIÓN nombrada que este archivo implementa. La
 * configuración puede desactivarlas, pero no puede añadir lógica nueva.
 *
 * La tentación era hacer un motor genérico que evaluara condiciones escritas en
 * una hoja de cálculo. Se descartó por dos razones: sería una vía de ejecución
 * arbitraria dentro del libro de una unidad de recursos humanos, y ninguna de las
 * ocho automatizaciones que el proceso necesita de verdad requiere esa
 * flexibilidad.
 *
 * ── Notificaciones internas primero ─────────────────────────────────────────
 * Las notificaciones se escriben en el libro y se leen desde el módulo. El correo
 * es opcional y viene apagado: un módulo que empieza a escribir a personas reales
 * en cuanto se instala es una mala sorpresa, y las pruebas nunca deben poder
 * enviar un correo a un funcionario.
 */

/** Profundidad de la cadena de eventos en curso. */
var DOC2_EVENTO_PROFUNDIDAD = 0;

/** Eventos emitidos durante la petición, para poder devolverlos y auditarlos. */
var DOC2_EVENTOS_EMITIDOS = [];

function doc2EventosReset_() {
  DOC2_EVENTO_PROFUNDIDAD = 0;
  DOC2_EVENTOS_EMITIDOS = [];
}

/** Automatizaciones activas para un evento. */
function doc2AutomatizacionesDe_(evento) {
  var desactivadas = doc2ConfigJson_('automatizaciones_desactivadas', []) || [];
  var mapa = {};
  for (var d = 0; d < desactivadas.length; d++) mapa[String(desactivadas[d])] = true;
  var salida = [];
  for (var i = 0; i < DOC2_AUTOMATIZACIONES.length; i++) {
    var regla = DOC2_AUTOMATIZACIONES[i];
    if (regla.evento !== evento) continue;
    if (mapa[regla.codigo]) continue;
    salida.push(regla);
  }
  return salida;
}

/**
 * Emite un evento y ejecuta sus automatizaciones.
 *
 * ── Por qué nunca lanza ─────────────────────────────────────────────────────
 * Porque el dato principal ya se guardó. Si al crear una tarea automática falla
 * algo, lo correcto es dejar el aviso y devolver la operación como buena, no
 * deshacer un cambio que la persona ya considera hecho. Los fallos de
 * automatización se auditan con resultado `error`, así que quedan visibles.
 *
 * ── El límite de profundidad ────────────────────────────────────────────────
 * Una automatización puede provocar un evento que dispare otra. Tres niveles es
 * suficiente para todos los encadenamientos reales (documento → recálculo →
 * expediente completo → notificación) y corta en seco cualquier ciclo.
 */
function doc2Emitir_(evento, datos, ctx) {
  var contexto = ctx || doc2CtxActual_();
  var reglas = doc2AutomatizacionesDe_(evento);
  DOC2_EVENTOS_EMITIDOS.push({ evento: evento, datos: datos || {}, reglas: reglas.length });
  if (!reglas.length) return { evento: evento, ejecutadas: 0 };

  if (DOC2_EVENTO_PROFUNDIDAD >= 3) {
    docWarn_('Cadena de automatizaciones demasiado profunda; se detiene.', { evento: evento });
    return { evento: evento, ejecutadas: 0, detenido: true };
  }

  DOC2_EVENTO_PROFUNDIDAD++;
  var ejecutadas = 0;
  try {
    for (var i = 0; i < reglas.length; i++) {
      try {
        doc2EjecutarAccion_(reglas[i], datos || {}, contexto);
        ejecutadas++;
      } catch (error) {
        var info = docClassify_(error);
        docWarn_('Automatización "' + reglas[i].codigo + '" falló.', { motivo: info.message });
        doc2Audit_({
          tipo: 'automatizacion.error', expedienteId: (datos && datos.expedienteId) || '',
          entidadTipo: 'automatizacion', entidadId: reglas[i].codigo,
          actor: 'automatizacion', origen: 'sistema', resultado: 'error',
          requestId: contexto.requestId,
          metadata: { evento: evento, motivo: info.message, codigo: info.docCode }
        });
      }
    }
  } finally {
    DOC2_EVENTO_PROFUNDIDAD--;
  }
  return { evento: evento, ejecutadas: ejecutadas };
}

/** Despacha la acción de una automatización. Solo estas ocho existen. */
function doc2EjecutarAccion_(regla, datos, ctx) {
  var contexto = ctx || doc2CtxActual_();
  switch (regla.accion) {
    case 'recalcularExpediente':
      if (datos.sinRecalculo === true) return false;
      if (!datos.expedienteId) return false;
      doc2RecalcularExpediente_(datos.expedienteId, contexto);
      return true;

    case 'crearTareaCorreccion':
      return doc2AccionTareaCorreccion_(datos, contexto);

    case 'notificarProrroga':
      return doc2AccionNotificarProrroga_(datos, contexto);

    case 'marcarSolicitudVencida':
      return doc2AccionSolicitudVencida_(datos, contexto);

    case 'notificarResponsable':
      return doc2AccionNotificarResponsable_(datos, contexto);

    case 'recalcularRequisitos':
      if (!datos.expedienteId) return false;
      doc2SincronizarRequisitos_(datos.expedienteId, contexto);
      doc2RecalcularExpediente_(datos.expedienteId, contexto);
      return true;

    case 'cancelarTareasAbiertas':
      return doc2AccionCancelarTareas_(datos, contexto);

    case 'actualizarEstadoPorAprobacion':
      return doc2AccionEstadoPorAprobacion_(datos, contexto);

    default:
      docWarn_('Automatización con acción desconocida.', { accion: regla.accion });
      return false;
  }
}

/* --------------------------- Acciones permitidas -------------------------- */

/**
 * Crea una tarea de corrección para un requisito observado.
 *
 * Si ya hay una tarea abierta con el mismo origen no crea otra: observar dos
 * veces el mismo documento no debería llenar la lista de tareas duplicadas.
 */
function doc2AccionTareaCorreccion_(datos, ctx) {
  if (!datos.expedienteId || !datos.expedienteDocumentoId) return false;
  var abiertas = doc2By_(DOC2_SHEET.TAREAS, 'origen_id', datos.expedienteDocumentoId, false);
  for (var i = 0; i < abiertas.length; i++) {
    if (String(abiertas[i].origen_tipo) !== 'revision') continue;
    var estado = String(abiertas[i].estado_tarea);
    if (estado !== DOC2_ESTADO_TAREA.COMPLETADA && estado !== DOC2_ESTADO_TAREA.CANCELADA) return false;
  }

  var expediente = doc2Get_(DOC2_SHEET.EXPEDIENTES, datos.expedienteId);
  if (!expediente) return false;
  var nombreRequisito = doc2NombreDeCodigo_(datos.codigo);
  var slaHoras = doc2ConfigInt_('sla_correccion_horas', DOC2_SLA_HORAS.correccion);

  // La tarea automática se crea con contexto de sistema: la capacidad de la
  // persona que observó ya se comprobó al registrar la observación.
  var interno = doc2CtxSistema_(ctx);
  doc2CrearTarea_({
    expedienteId: datos.expedienteId,
    expedienteDocumentoId: datos.expedienteDocumentoId,
    tipo: 'CORRECCION',
    titulo: 'Corregir «' + nombreRequisito + '» de ' + expediente.nombre,
    descripcion: datos.comentario ? String(datos.comentario) : 'El requisito quedó observado en la revisión.',
    responsableId: expediente.responsable_id || '',
    slaHoras: slaHoras,
    origenTipo: 'revision',
    origenId: datos.expedienteDocumentoId
  }, interno);
  return true;
}

/** Notifica al responsable que una prórroga está por vencer o venció. */
function doc2AccionNotificarProrroga_(datos, ctx) {
  if (!datos.prorrogaId) return false;
  var prorroga = doc2Get_(DOC2_SHEET.PRORROGAS, datos.prorrogaId);
  if (!prorroga) return false;
  var expediente = doc2Get_(DOC2_SHEET.EXPEDIENTES, prorroga.expediente_id);
  if (!expediente) return false;
  var dias = doc2DiasHasta_(prorroga.fecha_prorroga);
  var vencida = dias !== null && dias < 0;

  doc2Notificar_({
    usuario: expediente.responsable_id || '',
    expedienteId: expediente.expediente_id,
    entidadTipo: 'prorroga',
    entidadId: prorroga.prorroga_id,
    tipoEvento: vencida ? DOC2_EVENTO.PRORROGA_VENCIDA : DOC2_EVENTO.PRORROGA_POR_VENCER,
    titulo: (vencida ? 'Prórroga vencida · ' : 'Prórroga por vencer · ') + expediente.nombre,
    mensaje: 'La prórroga de «' + doc2NombreDeCodigo_(prorroga.codigo_documento) + '» ' +
      (vencida ? ('venció el ' + prorroga.fecha_prorroga + '.') : ('vence el ' + prorroga.fecha_prorroga + ' (en ' + dias + ' día(s)).'))
  }, ctx);
  return true;
}

/** Pasa la solicitud a VENCIDA y abre una tarea de seguimiento. */
function doc2AccionSolicitudVencida_(datos, ctx) {
  if (!datos.solicitudId) return false;
  var solicitud = doc2Get_(DOC2_SHEET.SOLICITUDES, datos.solicitudId);
  if (!solicitud) return false;
  var estado = String(solicitud.estado_solicitud);
  if (estado === DOC2_ESTADO_SOLICITUD.COMPLETADA || estado === DOC2_ESTADO_SOLICITUD.CANCELADA ||
      estado === DOC2_ESTADO_SOLICITUD.VENCIDA) return false;

  var interno = doc2CtxSistema_(ctx);
  if (doc2TransicionPermitida_('solicitud', estado, DOC2_ESTADO_SOLICITUD.VENCIDA)) {
    doc2Update_(DOC2_SHEET.SOLICITUDES, solicitud.solicitud_id, { estado_solicitud: DOC2_ESTADO_SOLICITUD.VENCIDA }, interno);
    doc2Historial_({
      expedienteId: solicitud.expediente_id, entidadTipo: 'solicitud', entidadId: solicitud.solicitud_id,
      campo: 'estado_solicitud', anterior: estado, nuevo: DOC2_ESTADO_SOLICITUD.VENCIDA,
      motivo: 'Pasó la fecha límite', actor: 'automatizacion'
    });
  }

  var yaHay = doc2By_(DOC2_SHEET.TAREAS, 'origen_id', solicitud.solicitud_id, false);
  for (var i = 0; i < yaHay.length; i++) {
    if (String(yaHay[i].origen_tipo) !== 'solicitud') continue;
    var estadoT = String(yaHay[i].estado_tarea);
    if (estadoT !== DOC2_ESTADO_TAREA.COMPLETADA && estadoT !== DOC2_ESTADO_TAREA.CANCELADA) return true;
  }

  doc2CrearTarea_({
    expedienteId: solicitud.expediente_id,
    tipo: 'SEGUIMIENTO',
    titulo: 'Dar seguimiento a la solicitud vencida «' + solicitud.titulo + '»',
    descripcion: 'La fecha límite era ' + solicitud.fecha_limite + '.',
    responsableId: solicitud.responsable_id || '',
    origenTipo: 'solicitud',
    origenId: solicitud.solicitud_id
  }, interno);
  return true;
}

/** Notifica al responsable que el expediente quedó completo. */
function doc2AccionNotificarResponsable_(datos, ctx) {
  if (!datos.expedienteId) return false;
  var expediente = doc2Get_(DOC2_SHEET.EXPEDIENTES, datos.expedienteId);
  if (!expediente) return false;
  doc2Notificar_({
    usuario: expediente.responsable_id || '',
    expedienteId: expediente.expediente_id,
    entidadTipo: 'expediente',
    entidadId: expediente.expediente_id,
    tipoEvento: DOC2_EVENTO.EXPEDIENTE_COMPLETO,
    titulo: 'Expediente completo · ' + expediente.nombre,
    mensaje: 'Todos los requisitos exigibles están entregados. Queda listo para revisión y aprobación.'
  }, ctx);
  return true;
}

/** Cancela las tareas abiertas de un expediente archivado. */
function doc2AccionCancelarTareas_(datos, ctx) {
  if (!datos.expedienteId) return false;
  var interno = doc2CtxSistema_(ctx);
  var tareas = doc2By_(DOC2_SHEET.TAREAS, 'expediente_id', datos.expedienteId, false);
  var canceladas = 0;
  for (var i = 0; i < tareas.length; i++) {
    var estado = String(tareas[i].estado_tarea);
    if (estado === DOC2_ESTADO_TAREA.COMPLETADA || estado === DOC2_ESTADO_TAREA.CANCELADA) continue;
    if (!doc2TransicionPermitida_('tarea', estado, DOC2_ESTADO_TAREA.CANCELADA)) continue;
    doc2Update_(DOC2_SHEET.TAREAS, tareas[i].tarea_id, { estado_tarea: DOC2_ESTADO_TAREA.CANCELADA }, interno);
    doc2Historial_({
      expedienteId: datos.expedienteId, entidadTipo: 'tarea', entidadId: tareas[i].tarea_id,
      campo: 'estado_tarea', anterior: estado, nuevo: DOC2_ESTADO_TAREA.CANCELADA,
      motivo: 'El expediente se archivó.', actor: 'automatizacion'
    });
    canceladas++;
  }
  return canceladas > 0;
}

/**
 * Actualiza el estado del expediente cuando se resuelve la última aprobación.
 *
 * Solo actúa si TODAS las aprobaciones del flujo están resueltas: aprobar el
 * nivel 1 de un flujo de dos no aprueba el expediente.
 */
function doc2AccionEstadoPorAprobacion_(datos, ctx) {
  if (!datos.expedienteId) return false;
  var expediente = doc2Get_(DOC2_SHEET.EXPEDIENTES, datos.expedienteId);
  if (!expediente) return false;
  var aprobaciones = doc2By_(DOC2_SHEET.APROBACIONES, 'expediente_id', datos.expedienteId, false);
  if (!aprobaciones.length) return false;

  var pendientes = 0;
  var rechazadas = 0;
  var aprobadas = 0;
  for (var i = 0; i < aprobaciones.length; i++) {
    var estado = String(aprobaciones[i].estado_aprobacion);
    if (estado === DOC2_ESTADO_APROBACION.PENDIENTE) pendientes++;
    else if (estado === DOC2_ESTADO_APROBACION.RECHAZADA) rechazadas++;
    else if (estado === DOC2_ESTADO_APROBACION.APROBADA) aprobadas++;
  }
  if (pendientes > 0) return false;

  var interno = doc2CtxSistema_(ctx);
  if (rechazadas > 0) {
    if (doc2TransicionPermitida_('expediente', expediente.estado_expediente, DOC2_ESTADO_EXPEDIENTE.OBSERVADO)) {
      doc2Update_(DOC2_SHEET.EXPEDIENTES, expediente.expediente_id, { estado_expediente: DOC2_ESTADO_EXPEDIENTE.OBSERVADO }, interno);
      doc2Historial_({
        expedienteId: expediente.expediente_id, entidadTipo: 'expediente', entidadId: expediente.expediente_id,
        campo: 'estado_expediente', anterior: expediente.estado_expediente, nuevo: DOC2_ESTADO_EXPEDIENTE.OBSERVADO,
        motivo: 'Una aprobación fue rechazada.', actor: 'automatizacion'
      });
    }
    return true;
  }

  if (aprobadas > 0 && docInt_(expediente.total_pendientes, 0) === 0 && docInt_(expediente.total_no_entregados, 0) === 0 &&
      docInt_(expediente.total_observados, 0) === 0 &&
      doc2TransicionPermitida_('expediente', expediente.estado_expediente, DOC2_ESTADO_EXPEDIENTE.APROBADO)) {
    doc2Update_(DOC2_SHEET.EXPEDIENTES, expediente.expediente_id, { estado_expediente: DOC2_ESTADO_EXPEDIENTE.APROBADO }, interno);
    doc2Historial_({
      expedienteId: expediente.expediente_id, entidadTipo: 'expediente', entidadId: expediente.expediente_id,
      campo: 'estado_expediente', anterior: expediente.estado_expediente, nuevo: DOC2_ESTADO_EXPEDIENTE.APROBADO,
      motivo: 'Todas las aprobaciones quedaron resueltas.', actor: 'automatizacion'
    });
    doc2Notificar_({
      usuario: expediente.responsable_id || '', expedienteId: expediente.expediente_id,
      entidadTipo: 'expediente', entidadId: expediente.expediente_id,
      tipoEvento: DOC2_EVENTO.EXPEDIENTE_APROBADO,
      titulo: 'Expediente aprobado · ' + expediente.nombre,
      mensaje: 'El expediente quedó aprobado y listo para archivarse o convertirse en expediente laboral.'
    }, ctx);
    return true;
  }
  return false;
}

/**
 * Contexto de sistema para las automatizaciones.
 *
 * Conserva el `requestId` y el origen para poder rastrear qué petición provocó
 * qué automatización, pero usa rol `admin`: la autorización se comprobó cuando la
 * persona hizo la acción que disparó el evento, y volver a comprobarla aquí haría
 * que una automatización fallara según quién la provocó.
 */
function doc2CtxSistema_(ctx) {
  var base = ctx || doc2CtxActual_();
  return {
    requestId: base.requestId,
    accion: 'automatizacion',
    actor: 'automatizacion',
    actorId: base.actorId || 'automatizacion',
    actorDisplay: 'automatización',
    rol: 'admin',
    capacidades: doc2CapacidadesDe_('admin'),
    porLlave: true,
    origen: 'automatizacion',
    metodo: 'INTERNO',
    ahora: docNow_()
  };
}

/* ========================================================================== */
/* Notificaciones                                                              */
/* ========================================================================== */

/**
 * Crea una notificación interna.
 *
 * Siempre lleva `entidad_tipo` y `entidad_id`: una notificación que no permite
 * abrir aquello de lo que informa obliga a buscarlo a mano, que es la forma más
 * rápida de que la gente deje de leerlas.
 *
 * El correo solo sale si `correo_habilitado` está en TRUE y hay una dirección
 * válida. Nunca se envía correo desde las pruebas ni desde el arranque.
 */
function doc2Notificar_(datos, ctx) {
  var contexto = ctx || doc2CtxActual_();
  var d = datos || {};
  try {
    var usuario = doc2Texto_(d.usuario || d.usuarioDestino || '', 240);
    if (!usuario) usuario = 'equipo';
    var id = doc2NewId_('not');
    var canal = doc2ConfigBool_('correo_habilitado', false) && /@/.test(usuario) ? 'CORREO' : 'INTERNO';

    doc2Insert_(DOC2_SHEET.NOTIFICACIONES, {
      notificacion_id: id,
      usuario_destino: usuario,
      expediente_id: docRaw_(d.expedienteId || '', 200),
      entidad_tipo: doc2Texto_(d.entidadTipo || 'expediente', 60),
      entidad_id: docRaw_(d.entidadId || '', 200),
      tipo_evento: doc2Texto_(d.tipoEvento || 'aviso', 120),
      titulo: doc2Texto_(d.titulo || 'Aviso', 300),
      mensaje: doc2TextoLargo_(d.mensaje || '', DOC2_LIMITS.MAX_TEXTO_MEDIO),
      canal: canal,
      estado_envio: canal === 'CORREO' ? 'PENDIENTE' : 'ENTREGADA',
      fecha_programada: docNow_(),
      fecha_envio: canal === 'CORREO' ? '' : docNow_(),
      fecha_lectura: '',
      intentos: 0,
      ultimo_error: ''
    }, contexto);

    if (canal === 'CORREO') doc2EnviarCorreo_(id, usuario, d, contexto);
    docCount_('notificaciones');
    return id;
  } catch (error) {
    docWarn_('No se pudo crear la notificación.', { motivo: docClassify_(error).message });
    return '';
  }
}

/**
 * Envía la notificación por correo.
 *
 * Va detrás de dos llaves —la clave de configuración y una dirección con arroba—
 * y registra el intento y el error en la propia fila. Si el envío falla, la
 * notificación interna ya existe: la información no se pierde por un problema de
 * cuota.
 */
function doc2EnviarCorreo_(notificacionId, destino, datos, ctx) {
  try {
    if (typeof MailApp === 'undefined' || !MailApp || typeof MailApp.sendEmail !== 'function') {
      doc2Update_(DOC2_SHEET.NOTIFICACIONES, notificacionId, {
        estado_envio: 'NO_DISPONIBLE',
        ultimo_error: 'El servicio de correo no está disponible en este contexto.'
      }, ctx);
      return false;
    }
    MailApp.sendEmail({
      to: destino,
      subject: '[BDP · Documentación] ' + String(datos.titulo || 'Aviso'),
      body: String(datos.mensaje || '') + '\n\n— Módulo de Documentación · BDP'
    });
    doc2Update_(DOC2_SHEET.NOTIFICACIONES, notificacionId, {
      estado_envio: 'ENVIADA', fecha_envio: docNow_(), intentos: 1
    }, ctx);
    return true;
  } catch (error) {
    var info = docClassify_(error);
    try {
      doc2Update_(DOC2_SHEET.NOTIFICACIONES, notificacionId, {
        estado_envio: 'ERROR', intentos: 1, ultimo_error: doc2Texto_(info.message, 500)
      }, ctx);
    } catch (e) { /* la notificación interna ya está creada */ }
    return false;
  }
}

/** Lista notificaciones del actor (o de todos, si tiene auditoría). */
function doc2ListarNotificaciones_(filtros, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.VER);
  var f = filtros || {};
  var soloMias = f.todas !== true || !doc2Puede_(contexto, DOC2_CAPACIDAD.AUDITORIA);
  var claveActor = docKey_(contexto.actorId);
  var claveActorNombre = docKey_(contexto.actor);

  var resultado = doc2Query_(DOC2_SHEET.NOTIFICACIONES, {
    orden: 'created_at', direccion: 'desc',
    pagina: f.pagina, porPagina: f.porPagina, sinPaginar: f.sinPaginar === true,
    filtro: function (fila) {
      if (soloMias) {
        var destino = docKey_(fila.usuario_destino);
        if (destino !== claveActor && destino !== claveActorNombre && destino !== 'EQUIPO') return false;
      }
      if (f.soloNoLeidas === true && fila.fecha_lectura) return false;
      if (f.expedienteId && String(fila.expediente_id) !== String(f.expedienteId)) return false;
      if (f.tipo && docKey_(fila.tipo_evento) !== docKey_(f.tipo)) return false;
      return true;
    }
  });

  var vista = [];
  for (var i = 0; i < resultado.filas.length; i++) {
    var fila = resultado.filas[i];
    vista.push({
      notificacionId: fila.notificacion_id,
      usuario: fila.usuario_destino,
      expedienteId: fila.expediente_id || '',
      entidadTipo: fila.entidad_tipo,
      entidadId: fila.entidad_id,
      tipo: fila.tipo_evento,
      titulo: fila.titulo,
      mensaje: fila.mensaje,
      canal: fila.canal,
      estadoEnvio: fila.estado_envio,
      leida: !!fila.fecha_lectura,
      fechaLectura: fila.fecha_lectura || '',
      fecha: fila.created_at,
      error: fila.ultimo_error || ''
    });
  }

  return {
    total: resultado.total, pagina: resultado.pagina, paginas: resultado.paginas,
    porPagina: resultado.porPagina, notificaciones: vista,
    noLeidas: doc2ContadorNoLeidas_(contexto)
  };
}

/** Cuántas notificaciones sin leer tiene el actor. */
function doc2ContadorNoLeidas_(ctx) {
  var contexto = ctx || doc2CtxActual_();
  var claveActor = docKey_(contexto.actorId);
  var claveNombre = docKey_(contexto.actor);
  var filas = doc2All_(DOC2_SHEET.NOTIFICACIONES, true);
  var n = 0;
  for (var i = 0; i < filas.length; i++) {
    if (filas[i].fecha_lectura) continue;
    var destino = docKey_(filas[i].usuario_destino);
    if (destino === claveActor || destino === claveNombre || destino === 'EQUIPO') n++;
  }
  return n;
}

/** Marca una notificación como leída. */
function doc2MarcarNotificacionLeida_(notificacionId, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.VER);
  var fila = doc2GetOrFail_(DOC2_SHEET.NOTIFICACIONES, notificacionId, 'la notificación');
  if (fila.fecha_lectura) return { notificacionId: notificacionId, leida: true, sinCambios: true };
  doc2Update_(DOC2_SHEET.NOTIFICACIONES, notificacionId, { fecha_lectura: docNow_() }, contexto);
  return { notificacionId: notificacionId, leida: true };
}

/** Marca como leídas todas las notificaciones del actor. */
function doc2MarcarTodasLeidas_(ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.VER);
  var claveActor = docKey_(contexto.actorId);
  var claveNombre = docKey_(contexto.actor);
  var filas = doc2All_(DOC2_SHEET.NOTIFICACIONES, true);
  var marcadas = 0;
  for (var i = 0; i < filas.length; i++) {
    if (filas[i].fecha_lectura) continue;
    var destino = docKey_(filas[i].usuario_destino);
    if (destino !== claveActor && destino !== claveNombre && destino !== 'EQUIPO') continue;
    doc2Update_(DOC2_SHEET.NOTIFICACIONES, filas[i].notificacion_id, { fecha_lectura: docNow_() }, contexto);
    marcadas++;
  }
  return { marcadas: marcadas };
}

/* ========================================================================== */
/* Proceso diario                                                              */
/* ========================================================================== */

/**
 * Barrido diario de vencimientos.
 *
 * ── Idempotente por diseño ──────────────────────────────────────────────────
 * Se puede ejecutar diez veces el mismo día sin efectos acumulados: cada paso
 * comprueba el estado antes de cambiarlo, y los avisos se emiten una sola vez por
 * entidad y por día porque se busca si ya existe una notificación de ese tipo con
 * fecha de hoy. Esto importa porque un disparador duplicado —el error más común
 * de Apps Script— no debe producir avisos duplicados.
 *
 * Cada paso va protegido por separado: que falle el barrido de prórrogas no puede
 * impedir el de solicitudes.
 */
function doc2ProcesoDiario_(ctx) {
  var contexto = doc2CtxSistema_(ctx || doc2CtxActual_('tarea programada'));
  var resultado = {
    fecha: doc2Hoy_(),
    prorrogasVencidas: 0, prorrogasAvisadas: 0,
    solicitudesVencidas: 0, tareasVencidas: 0, aprobacionesVencidas: 0,
    retencion: null, errores: []
  };

  // 1. Prórrogas.
  try {
    var umbral = doc2ConfigInt_('prorroga_aviso_dias', DOC2_UMBRALES.prorrogaAvisoDias);
    var prorrogas = doc2All_(DOC2_SHEET.PRORROGAS, false);
    for (var i = 0; i < prorrogas.length; i++) {
      var p = prorrogas[i];
      var estado = String(p.estado_prorroga);
      if (estado !== DOC2_ESTADO_PRORROGA.VIGENTE && estado !== DOC2_ESTADO_PRORROGA.SOLICITADA) continue;
      var dias = doc2DiasHasta_(p.fecha_prorroga);
      if (dias === null) continue;

      if (dias < 0) {
        if (doc2TransicionPermitida_('prorroga', estado, DOC2_ESTADO_PRORROGA.VENCIDA)) {
          doc2Update_(DOC2_SHEET.PRORROGAS, p.prorroga_id, { estado_prorroga: DOC2_ESTADO_PRORROGA.VENCIDA }, contexto);
          doc2Historial_({
            expedienteId: p.expediente_id, entidadTipo: 'prorroga', entidadId: p.prorroga_id,
            campo: 'estado_prorroga', anterior: estado, nuevo: DOC2_ESTADO_PRORROGA.VENCIDA,
            motivo: 'Venció el plazo', actor: 'proceso diario'
          });
          resultado.prorrogasVencidas++;
        }
        if (!doc2YaAvisadoHoy_('prorroga', p.prorroga_id, DOC2_EVENTO.PRORROGA_VENCIDA)) {
          doc2Emitir_(DOC2_EVENTO.PRORROGA_POR_VENCER, { prorrogaId: p.prorroga_id, expedienteId: p.expediente_id }, contexto);
          resultado.prorrogasAvisadas++;
        }
        doc2RecalcularExpediente_(p.expediente_id, contexto);
      } else if (dias <= umbral) {
        if (!doc2YaAvisadoHoy_('prorroga', p.prorroga_id, DOC2_EVENTO.PRORROGA_POR_VENCER)) {
          doc2Emitir_(DOC2_EVENTO.PRORROGA_POR_VENCER, { prorrogaId: p.prorroga_id, expedienteId: p.expediente_id }, contexto);
          resultado.prorrogasAvisadas++;
        }
      }
    }
  } catch (error) {
    resultado.errores.push('prorrogas: ' + docClassify_(error).message);
  }

  // 2. Solicitudes vencidas.
  try {
    var solicitudes = doc2All_(DOC2_SHEET.SOLICITUDES, false);
    for (var s = 0; s < solicitudes.length; s++) {
      var sol = solicitudes[s];
      var estadoS = String(sol.estado_solicitud);
      if (estadoS === DOC2_ESTADO_SOLICITUD.COMPLETADA || estadoS === DOC2_ESTADO_SOLICITUD.CANCELADA ||
          estadoS === DOC2_ESTADO_SOLICITUD.VENCIDA || estadoS === DOC2_ESTADO_SOLICITUD.BORRADOR) continue;
      if (!doc2Vencida_(sol.fecha_limite)) continue;
      doc2Emitir_(DOC2_EVENTO.SOLICITUD_VENCIDA, { solicitudId: sol.solicitud_id, expedienteId: sol.expediente_id }, contexto);
      resultado.solicitudesVencidas++;
    }
  } catch (error) {
    resultado.errores.push('solicitudes: ' + docClassify_(error).message);
  }

  // 3. Tareas vencidas.
  try {
    var tareas = doc2All_(DOC2_SHEET.TAREAS, false);
    for (var t = 0; t < tareas.length; t++) {
      var tarea = tareas[t];
      var estadoT = String(tarea.estado_tarea);
      if (estadoT === DOC2_ESTADO_TAREA.COMPLETADA || estadoT === DOC2_ESTADO_TAREA.CANCELADA ||
          estadoT === DOC2_ESTADO_TAREA.VENCIDA) continue;
      if (!doc2Vencida_(tarea.fecha_limite)) continue;
      if (doc2TransicionPermitida_('tarea', estadoT, DOC2_ESTADO_TAREA.VENCIDA)) {
        doc2Update_(DOC2_SHEET.TAREAS, tarea.tarea_id, { estado_tarea: DOC2_ESTADO_TAREA.VENCIDA, escalada: true }, contexto);
        doc2Historial_({
          expedienteId: tarea.expediente_id, entidadTipo: 'tarea', entidadId: tarea.tarea_id,
          campo: 'estado_tarea', anterior: estadoT, nuevo: DOC2_ESTADO_TAREA.VENCIDA,
          motivo: 'Pasó la fecha límite', actor: 'proceso diario'
        });
      }
      if (!doc2YaAvisadoHoy_('tarea', tarea.tarea_id, DOC2_EVENTO.TAREA_VENCIDA)) {
        doc2Notificar_({
          usuario: tarea.responsable_id || '', expedienteId: tarea.expediente_id,
          entidadTipo: 'tarea', entidadId: tarea.tarea_id, tipoEvento: DOC2_EVENTO.TAREA_VENCIDA,
          titulo: 'Tarea fuera de plazo · ' + tarea.titulo,
          mensaje: 'Vencía el ' + tarea.fecha_limite + ' y sigue abierta.'
        }, contexto);
      }
      resultado.tareasVencidas++;
    }
  } catch (error) {
    resultado.errores.push('tareas: ' + docClassify_(error).message);
  }

  // 4. Aprobaciones vencidas.
  try {
    var aprobaciones = doc2All_(DOC2_SHEET.APROBACIONES, false);
    for (var a = 0; a < aprobaciones.length; a++) {
      var apr = aprobaciones[a];
      if (String(apr.estado_aprobacion) !== DOC2_ESTADO_APROBACION.PENDIENTE) continue;
      if (!doc2Vencida_(apr.fecha_limite)) continue;
      if (doc2TransicionPermitida_('aprobacion', apr.estado_aprobacion, DOC2_ESTADO_APROBACION.VENCIDA)) {
        doc2Update_(DOC2_SHEET.APROBACIONES, apr.aprobacion_id, { estado_aprobacion: DOC2_ESTADO_APROBACION.VENCIDA }, contexto);
        doc2Historial_({
          expedienteId: apr.expediente_id, entidadTipo: 'aprobacion', entidadId: apr.aprobacion_id,
          campo: 'estado_aprobacion', anterior: DOC2_ESTADO_APROBACION.PENDIENTE, nuevo: DOC2_ESTADO_APROBACION.VENCIDA,
          motivo: 'Pasó la fecha límite', actor: 'proceso diario'
        });
        resultado.aprobacionesVencidas++;
      }
    }
  } catch (error) {
    resultado.errores.push('aprobaciones: ' + docClassify_(error).message);
  }

  // 5. Retención documental (solo marca y avisa; nunca borra).
  try {
    resultado.retencion = doc2AplicarRetencion_(contexto);
  } catch (error) {
    resultado.errores.push('retencion: ' + docClassify_(error).message);
  }

  doc2Audit_({
    tipo: 'proceso.diario', entidadTipo: 'sistema', actor: 'proceso diario', origen: 'trigger',
    resultado: resultado.errores.length ? 'parcial' : 'ok',
    metadata: {
      prorrogasVencidas: resultado.prorrogasVencidas, solicitudesVencidas: resultado.solicitudesVencidas,
      tareasVencidas: resultado.tareasVencidas, aprobacionesVencidas: resultado.aprobacionesVencidas
    }
  });

  return resultado;
}

/**
 * ¿Ya se avisó hoy de esta entidad con este tipo de evento?
 *
 * Es lo que hace que el proceso diario se pueda ejecutar dos veces sin duplicar
 * avisos, y que dos disparadores instalados por error no llenen el centro de
 * notificaciones.
 */
function doc2YaAvisadoHoy_(entidadTipo, entidadId, tipoEvento) {
  var hoy = doc2Hoy_();
  var filas = doc2By_(DOC2_SHEET.NOTIFICACIONES, 'entidad_id', entidadId, true);
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i].entidad_tipo) !== String(entidadTipo)) continue;
    if (String(filas[i].tipo_evento) !== String(tipoEvento)) continue;
    if (String(filas[i].created_at).slice(0, 10) === hoy) return true;
  }
  return false;
}
