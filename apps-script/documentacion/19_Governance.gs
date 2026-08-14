/**
 * 19_Governance.gs — consentimientos, retención, archivo, inconsistencias,
 * diagnóstico, reparación y transición al expediente laboral.
 *
 * ── El tono de los hallazgos ─────────────────────────────────────────────────
 * Este archivo detecta problemas en datos que otras personas escribieron. Por eso
 * ningún mensaje acusa: se dice «posible inconsistencia» o «requiere revisión», se
 * explica qué se observó y se ofrece qué hacer. Un diagnóstico que dice «fila
 * incorrecta» sobre el trabajo de alguien genera resistencia; uno que dice «esta
 * fila tiene un estado COMPLETO con dos requisitos pendientes, conviene revisar»
 * genera una revisión.
 *
 * ── La regla de la reparación ────────────────────────────────────────────────
 * Se separa en tres niveles: automática segura (estructura y derivados),
 * requiere confirmación (afecta datos de negocio) y manual (necesita criterio).
 * Nada de negocio se borra automáticamente, nunca. Y toda reparación informa
 * exactamente qué cambió, con antes y después.
 */

/* ========================================================================== */
/* CONSENTIMIENTOS                                                             */
/* ========================================================================== */

/** Tipos de consentimiento que el proceso maneja. */
var DOC2_TIPOS_CONSENTIMIENTO = [
  { codigo: 'USO_IMAGEN', etiqueta: 'Uso de imagen', descripcion: 'Autorización para el uso de la imagen en material institucional.' },
  { codigo: 'DATOS_PERSONALES', etiqueta: 'Tratamiento de datos personales', descripcion: 'Autorización para el tratamiento de datos personales en el proceso de incorporación.' },
  { codigo: 'VERIFICACION_REFERENCIAS', etiqueta: 'Verificación de referencias', descripcion: 'Autorización para contactar referencias laborales.' }
];

/**
 * Registra la presentación de un consentimiento.
 *
 * Se guarda la VERSIÓN del texto y su huella (`texto_hash`), no el texto entero:
 * lo que hay que poder demostrar es que la persona aceptó ESA versión, y para eso
 * basta la huella. Guardar el texto completo en cada expediente multiplicaría el
 * libro sin añadir nada.
 *
 * No hay firma electrónica y no se simula ninguna. Esto es un registro
 * administrativo de una aceptación, con su medio y su evidencia textual.
 */
function doc2PresentarConsentimiento_(datos, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.EDITAR);
  var d = datos || {};
  var expediente = doc2ExigirExpediente_(d.expedienteId || d.expediente_id);

  var tipo = doc2Texto_(docKey_(d.tipo || d.tipoConsentimiento || '').replace(/ /g, '_'), 60);
  if (!tipo) {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'Indica el tipo de consentimiento.',
      {
        hint: 'Tipos configurados: ' + doc2CodigosConsentimiento_().join(', ') + '.',
        details: { fields: doc2Campo_('tipo', 'Tipo de consentimiento requerido.') }
      });
  }
  var version = doc2Texto_(d.version || d.versionTexto || 'v1', 40);
  var texto = String(d.texto || '');
  var hash = texto ? docHash_(texto) : doc2Texto_(d.textoHash || '', 80);
  if (!hash) {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'Falta el texto del consentimiento o su huella.',
      { details: { fields: doc2Campo_('texto', 'Pega el texto presentado o su huella.') } });
  }

  var id = doc2StableId_('cons', expediente.expediente_id + '|' + tipo + '|' + version);
  var existente = doc2Get_(DOC2_SHEET.CONSENTIMIENTOS, id);
  var fila = {
    consentimiento_id: id,
    expediente_id: expediente.expediente_id,
    tipo_consentimiento: tipo,
    version_texto: version,
    texto_hash: hash,
    estado: DOC2_ESTADO_CONSENTIMIENTO.PRESENTADO,
    fecha_presentacion: docNow_(),
    fecha_aceptacion: '',
    fecha_revocacion: '',
    medio: doc2Enum_(d.medio || 'PRESENCIAL', ['PRESENCIAL', 'CORREO', 'SISTEMA', 'PAPEL'], 'PRESENCIAL'),
    evidencia_textual: doc2TextoLargo_(d.evidencia || '', DOC2_LIMITS.MAX_TEXTO_MEDIO)
  };

  if (existente) {
    doc2Update_(DOC2_SHEET.CONSENTIMIENTOS, id, fila, contexto);
  } else {
    doc2Insert_(DOC2_SHEET.CONSENTIMIENTOS, fila, contexto);
  }

  doc2Historial_({
    expedienteId: expediente.expediente_id, entidadTipo: 'consentimiento', entidadId: id,
    campo: 'estado', anterior: existente ? existente.estado : '', nuevo: DOC2_ESTADO_CONSENTIMIENTO.PRESENTADO,
    motivo: 'Consentimiento ' + tipo + ' versión ' + version, actor: contexto.actor
  });
  doc2Audit_({
    tipo: 'consentimiento.presentado', expedienteId: expediente.expediente_id,
    entidadTipo: 'consentimiento', entidadId: id, actor: contexto.actor, actorId: contexto.actorId,
    origen: contexto.origen, requestId: contexto.requestId,
    metadata: { tipo: tipo, version: version }
  });

  return { consentimientoId: id, estado: fila.estado, hash: hash };
}

/** Registra la respuesta a un consentimiento: aceptado, rechazado o revocado. */
function doc2ResponderConsentimiento_(consentimientoId, estado, ctx, opciones) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.EDITAR);
  var o = opciones || {};
  var fila = doc2GetOrFail_(DOC2_SHEET.CONSENTIMIENTOS, consentimientoId, 'el consentimiento');
  var destino = doc2Enum_(estado, doc2ValoresDe_(DOC2_ESTADO_CONSENTIMIENTO), '');
  if (!destino) {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'Estado de consentimiento no reconocido.',
      { details: { fields: doc2Campo_('estado', 'Estado no válido.') } });
  }
  if (String(fila.estado) === DOC2_ESTADO_CONSENTIMIENTO.REVOCADO) {
    throw docError_(DOC_CODE.CONFLICT, 'Un consentimiento revocado no se reabre.',
      { hint: 'Presenta una versión nueva del texto para volver a pedirlo.', details: { estado: fila.estado } });
  }

  var patch = { estado: destino };
  if (destino === DOC2_ESTADO_CONSENTIMIENTO.ACEPTADO) patch.fecha_aceptacion = docNow_();
  if (destino === DOC2_ESTADO_CONSENTIMIENTO.REVOCADO) patch.fecha_revocacion = docNow_();
  if (o.evidencia !== undefined) patch.evidencia_textual = doc2TextoLargo_(o.evidencia, DOC2_LIMITS.MAX_TEXTO_MEDIO);

  var estadoAnterior = String(fila.estado || '');
  doc2Update_(DOC2_SHEET.CONSENTIMIENTOS, consentimientoId, patch, contexto, { version: o.version });
  doc2Historial_({
    expedienteId: fila.expediente_id, entidadTipo: 'consentimiento', entidadId: consentimientoId,
    campo: 'estado', anterior: estadoAnterior, nuevo: destino, motivo: o.motivo || '', actor: contexto.actor
  });
  doc2Audit_({
    tipo: 'consentimiento.respuesta', expedienteId: fila.expediente_id, entidadTipo: 'consentimiento',
    entidadId: consentimientoId, actor: contexto.actor, actorId: contexto.actorId,
    origen: contexto.origen, requestId: contexto.requestId,
    metadata: { desde: estadoAnterior, hasta: destino }
  });
  return { consentimientoId: consentimientoId, estado: destino };
}

/** Vista de un consentimiento. */
function doc2ConsentimientoVista_(fila) {
  return {
    consentimientoId: fila.consentimiento_id,
    expedienteId: fila.expediente_id,
    tipo: fila.tipo_consentimiento,
    tipoEtiqueta: doc2EtiquetaConsentimiento_(fila.tipo_consentimiento),
    version: fila.version_texto,
    hash: fila.texto_hash,
    estado: fila.estado,
    fechaPresentacion: fila.fecha_presentacion || '',
    fechaAceptacion: fila.fecha_aceptacion || '',
    fechaRevocacion: fila.fecha_revocacion || '',
    medio: fila.medio || '',
    evidencia: fila.evidencia_textual || '',
    version_registro: docInt_(fila.version_registro, 1)
  };
}

/** Etiqueta de un tipo de consentimiento. */
function doc2EtiquetaConsentimiento_(codigo) {
  var tipos = doc2TiposConsentimiento_();
  for (var i = 0; i < tipos.length; i++) {
    if (tipos[i].codigo === String(codigo)) return tipos[i].etiqueta;
  }
  return String(codigo || '');
}

/**
 * Tipos de consentimiento configurados.
 *
 * Se pueden ampliar desde la configuración (`tipos_consentimiento`) sin tocar
 * código, porque el catálogo de textos que el área presenta cambia con la
 * normativa.
 */
function doc2TiposConsentimiento_() {
  var extra = doc2ConfigJson_('tipos_consentimiento', []) || [];
  var salida = [];
  var vistos = {};
  for (var i = 0; i < DOC2_TIPOS_CONSENTIMIENTO.length; i++) {
    var base = DOC2_TIPOS_CONSENTIMIENTO[i];
    var codigo = base.codigo;
    if (!codigo || vistos[codigo]) continue;
    vistos[codigo] = true;
    salida.push({ codigo: codigo, etiqueta: base.etiqueta, descripcion: base.descripcion || '' });
  }
  for (var e = 0; e < extra.length; e++) {
    var item = extra[e] || {};
    var codigoExtra = docKey_(item.codigo || '').replace(/ /g, '_');
    if (!codigoExtra || vistos[codigoExtra]) continue;
    vistos[codigoExtra] = true;
    salida.push({ codigo: codigoExtra, etiqueta: String(item.etiqueta || codigoExtra), descripcion: String(item.descripcion || '') });
  }
  return salida;
}

function doc2CodigosConsentimiento_() {
  var tipos = doc2TiposConsentimiento_();
  var out = [];
  for (var i = 0; i < tipos.length; i++) out.push(tipos[i].codigo);
  return out;
}

/** Lista consentimientos, con filtros. */
function doc2ListarConsentimientos_(filtros, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.VER);
  var f = filtros || {};
  var resultado = doc2Query_(DOC2_SHEET.CONSENTIMIENTOS, {
    orden: 'created_at', direccion: 'desc', pagina: f.pagina, porPagina: f.porPagina,
    sinPaginar: f.sinPaginar === true,
    filtro: function (fila) {
      if (f.expedienteId && String(fila.expediente_id) !== String(f.expedienteId)) return false;
      if (f.tipo && docKey_(fila.tipo_consentimiento) !== docKey_(f.tipo)) return false;
      if (f.estado && docKey_(fila.estado) !== docKey_(f.estado)) return false;
      return true;
    }
  });
  var vista = [];
  for (var i = 0; i < resultado.filas.length; i++) {
    var v = doc2ConsentimientoVista_(resultado.filas[i]);
    var expediente = doc2Get_(DOC2_SHEET.EXPEDIENTES, resultado.filas[i].expediente_id);
    v.expediente = expediente ? { identificador: expediente.identificador, nombre: expediente.nombre } : null;
    vista.push(v);
  }
  return { total: resultado.total, pagina: resultado.pagina, paginas: resultado.paginas, consentimientos: vista, tipos: doc2TiposConsentimiento_() };
}

/* ========================================================================== */
/* ARCHIVO, RETENCIÓN Y ANONIMIZACIÓN                                          */
/* ========================================================================== */

/** Archiva un expediente. */
function doc2ArchivarExpediente_(expedienteId, ctx, opciones) {
  return doc2CambiarEstadoExpediente_(expedienteId, DOC2_ESTADO_EXPEDIENTE.ARCHIVADO, ctx, opciones);
}

/**
 * Restaura un expediente archivado al estado que le corresponda por contenido.
 *
 * No se devuelve al estado que tenía antes de archivarse: se recalcula. Un
 * expediente que estuvo dos años archivado puede tener prórrogas vencidas que
 * entonces estaban vigentes.
 */
function doc2RestaurarExpediente_(expedienteId, ctx, opciones) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.RESTAURAR);
  var expediente = doc2ExigirExpediente_(expedienteId);
  var estado = String(expediente.estado_expediente);
  if (estado !== DOC2_ESTADO_EXPEDIENTE.ARCHIVADO && estado !== DOC2_ESTADO_EXPEDIENTE.PENDIENTE_ELIMINACION &&
      estado !== DOC2_ESTADO_EXPEDIENTE.ELIMINADO_LOGICO) {
    return { expedienteId: expediente.expediente_id, estado: estado, sinCambios: true };
  }
  var intermedio = doc2CambiarEstadoExpediente_(expediente.expediente_id,
    estado === DOC2_ESTADO_EXPEDIENTE.ELIMINADO_LOGICO ? DOC2_ESTADO_EXPEDIENTE.ARCHIVADO : DOC2_ESTADO_EXPEDIENTE.EN_RECOLECCION,
    contexto, opciones);
  if (String(intermedio.estado) === DOC2_ESTADO_EXPEDIENTE.ARCHIVADO) {
    intermedio = doc2CambiarEstadoExpediente_(expediente.expediente_id, DOC2_ESTADO_EXPEDIENTE.EN_RECOLECCION, contexto, opciones);
  }
  var resumen = doc2RecalcularExpediente_(expediente.expediente_id, contexto);
  return { expedienteId: expediente.expediente_id, estado: resumen.estado_expediente, restaurado: true };
}

/**
 * Bloquea o desbloquea la conservación de un expediente.
 *
 * Un expediente bloqueado no lo toca la política de retención. Sirve para
 * procesos judiciales o auditorías en curso: exactamente los casos en los que
 * una limpieza automática sería un problema serio.
 */
function doc2BloquearConservacion_(expedienteId, bloquear, ctx, motivo) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.ARCHIVAR);
  var expediente = doc2ExigirExpediente_(expedienteId);
  var valor = bloquear !== false;
  var estadoOperacion = valor ? 'CONSERVACION_BLOQUEADA'
    : (String(expediente.estado_expediente) === DOC2_ESTADO_EXPEDIENTE.ARCHIVADO ? 'ARCHIVADO' : 'ACTIVO');
  if (String(expediente.estado_operacion) === estadoOperacion) {
    return { expedienteId: expediente.expediente_id, bloqueado: valor, sinCambios: true };
  }
  var operacionAnterior = String(expediente.estado_operacion || '');
  doc2Update_(DOC2_SHEET.EXPEDIENTES, expediente.expediente_id, { estado_operacion: estadoOperacion }, contexto);
  doc2Historial_({
    expedienteId: expediente.expediente_id, entidadTipo: 'expediente', entidadId: expediente.expediente_id,
    campo: 'estado_operacion', anterior: operacionAnterior, nuevo: estadoOperacion,
    motivo: motivo || (valor ? 'Conservación bloqueada' : 'Conservación desbloqueada'), actor: contexto.actor
  });
  return { expedienteId: expediente.expediente_id, bloqueado: valor, estadoOperacion: estadoOperacion };
}

/**
 * Aplica las políticas de retención.
 *
 * MARCA, no borra. Un expediente que cumplió su plazo pasa a
 * `PENDIENTE_ELIMINACION` y aparece en el diagnóstico para que una persona
 * decida. La eliminación física no se automatiza sin una política institucional
 * explícita, y esa decisión no le corresponde a este módulo.
 */
function doc2AplicarRetencion_(ctx) {
  var contexto = doc2CtxSistema_(ctx || doc2CtxActual_());
  var politicas = doc2All_(DOC2_SHEET.RETENCION, true);
  var resultado = { marcados: 0, bloqueados: 0, evaluados: 0, politicas: 0, detalle: [] };

  for (var p = 0; p < politicas.length; p++) {
    var politica = politicas[p];
    if (politica.activa !== true) continue;
    if (String(politica.tipo_entidad) !== 'expediente') continue;
    resultado.politicas++;

    var dias = docInt_(politica.dias_retencion, 0);
    if (dias <= 0) continue;
    var estadoAplicable = String(politica.estado_expediente_aplicable || '');
    var expedientes = doc2All_(DOC2_SHEET.EXPEDIENTES, true);

    for (var e = 0; e < expedientes.length; e++) {
      var expediente = expedientes[e];
      if (estadoAplicable && String(expediente.estado_expediente) !== estadoAplicable) continue;
      resultado.evaluados++;
      if (String(expediente.estado_operacion) === 'CONSERVACION_BLOQUEADA') { resultado.bloqueados++; continue; }
      if (String(expediente.estado_expediente) === DOC2_ESTADO_EXPEDIENTE.PENDIENTE_ELIMINACION ||
          String(expediente.estado_expediente) === DOC2_ESTADO_EXPEDIENTE.ELIMINADO_LOGICO) continue;

      var referencia = String(expediente.archived_at || expediente.updated_at || expediente.created_at || '').slice(0, 10);
      if (!referencia) continue;
      var limite = new Date(referencia + 'T00:00:00Z');
      if (isNaN(limite.getTime())) continue;
      limite.setUTCDate(limite.getUTCDate() + dias);
      if (limite.getTime() > Date.now()) continue;

      if (!doc2TransicionPermitida_('expediente', expediente.estado_expediente, DOC2_ESTADO_EXPEDIENTE.PENDIENTE_ELIMINACION)) continue;
      doc2Update_(DOC2_SHEET.EXPEDIENTES, expediente.expediente_id, {
        estado_expediente: DOC2_ESTADO_EXPEDIENTE.PENDIENTE_ELIMINACION,
        estado_operacion: 'PENDIENTE_ELIMINACION'
      }, contexto);
      doc2Historial_({
        expedienteId: expediente.expediente_id, entidadTipo: 'expediente', entidadId: expediente.expediente_id,
        campo: 'estado_expediente', anterior: expediente.estado_expediente, nuevo: DOC2_ESTADO_EXPEDIENTE.PENDIENTE_ELIMINACION,
        motivo: 'Política de retención «' + politica.nombre + '» (' + dias + ' días)', actor: 'retencion'
      });
      resultado.marcados++;
      resultado.detalle.push({ identificador: expediente.identificador, politica: politica.nombre });
    }
  }
  return resultado;
}

/**
 * Plan de anonimización: qué se cambiaría, sin cambiar nada.
 *
 * La anonimización es irreversible, así que se presenta primero como plan. Los
 * campos que se sustituyen son los que identifican a la persona; los estados, las
 * fechas y los totales se conservan, porque son lo que sostiene la estadística
 * histórica.
 */
function doc2PlanAnonimizacion_(expedienteId, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.ARCHIVAR);
  var expediente = doc2ExigirExpediente_(expedienteId);
  return {
    expedienteId: expediente.expediente_id,
    estado: expediente.estado_expediente,
    permitido: String(expediente.estado_expediente) === DOC2_ESTADO_EXPEDIENTE.PENDIENTE_ELIMINACION ||
      String(expediente.estado_expediente) === DOC2_ESTADO_EXPEDIENTE.ELIMINADO_LOGICO,
    motivoSiNoPermitido: 'Solo se anonimiza un expediente marcado como pendiente de eliminación o eliminado lógicamente.',
    campos: [
      { campo: 'nombre', actual: expediente.nombre, futuro: 'ANONIMIZADO-' + String(expediente.expediente_id).slice(-6) },
      { campo: 'identificador', actual: expediente.identificador, futuro: 'ANON-' + String(expediente.expediente_id).slice(-6) },
      { campo: 'cargo', actual: expediente.cargo, futuro: expediente.cargo, nota: 'Se conserva: es información del puesto, no de la persona.' },
      { campo: 'agencia', actual: expediente.agencia, futuro: expediente.agencia, nota: 'Se conserva para la estadística por agencia.' },
      { campo: 'observaciones de requisitos', actual: '(texto libre)', futuro: '(vaciado)', nota: 'Puede contener datos personales.' },
      { campo: 'comentarios', actual: '(texto libre)', futuro: '(vaciado)', nota: 'Puede contener datos personales.' }
    ],
    conserva: ['estado_expediente', 'porcentaje_completitud', 'totales', 'fechas', 'historial de estados'],
    irreversible: true
  };
}

/**
 * Ejecuta la anonimización. Exige confirmación explícita.
 *
 * Solo sobre expedientes ya marcados para eliminación, y deja constancia en la
 * auditoría de quién la ejecutó: es la única operación del módulo que destruye
 * información a propósito, y tiene que poder explicarse.
 */
function doc2Anonimizar_(expedienteId, ctx, opciones) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.ARCHIVAR);
  var o = opciones || {};
  if (o.confirmado !== true) {
    throw docError_(DOC_CODE.BAD_REQUEST, 'La anonimización necesita confirmación explícita.',
      { hint: 'Revisa el plan y vuelve a enviar con confirmado: true.', details: { plan: 'documentacion.retencion.planAnonimizacion' } });
  }
  var plan = doc2PlanAnonimizacion_(expedienteId, contexto);
  if (!plan.permitido) {
    throw docError_(DOC_CODE.CONFLICT, plan.motivoSiNoPermitido, { details: { estado: plan.estado } });
  }

  var expediente = doc2ExigirExpediente_(expedienteId);
  var sufijo = String(expediente.expediente_id).slice(-6);
  doc2Update_(DOC2_SHEET.EXPEDIENTES, expediente.expediente_id, {
    nombre: 'ANONIMIZADO-' + sufijo,
    identificador: 'ANON-' + sufijo,
    identificador_normalizado: 'ANON' + sufijo,
    responsable_id: '',
    estado_expediente: DOC2_ESTADO_EXPEDIENTE.ELIMINADO_LOGICO,
    estado_operacion: 'ANONIMIZADO'
  }, contexto);

  var requisitos = doc2RequisitosDe_(expediente.expediente_id, true);
  var vaciados = 0;
  for (var i = 0; i < requisitos.length; i++) {
    if (!String(requisitos[i].observaciones || '').trim()) continue;
    doc2Update_(DOC2_SHEET.EXPEDIENTE_DOCS, requisitos[i].expediente_documento_id, { observaciones: '' }, contexto);
    vaciados++;
  }
  var comentarios = doc2By_(DOC2_SHEET.COMENTARIOS, 'expediente_id', expediente.expediente_id, true);
  for (var c = 0; c < comentarios.length; c++) {
    doc2Update_(DOC2_SHEET.COMENTARIOS, comentarios[c].comentario_id, { contenido: '(contenido anonimizado)' }, contexto);
  }

  doc2Audit_({
    tipo: 'expediente.anonimizado', expedienteId: expediente.expediente_id, entidadTipo: 'expediente',
    entidadId: expediente.expediente_id, actor: contexto.actor, actorId: contexto.actorId,
    origen: contexto.origen, requestId: contexto.requestId,
    metadata: { observacionesVaciadas: vaciados, comentarios: comentarios.length }
  });

  return { expedienteId: expediente.expediente_id, anonimizado: true, observacionesVaciadas: vaciados, comentarios: comentarios.length };
}

/* ========================================================================== */
/* TRANSICIÓN AL EXPEDIENTE LABORAL                                            */
/* ========================================================================== */

/**
 * Prepara el paso del expediente documental al laboral.
 *
 * ── Qué se hace y qué no ────────────────────────────────────────────────────
 * No existe todavía un módulo de expediente laboral en este sistema. Simular una
 * transferencia a un destino inexistente sería peor que no hacer nada: dejaría
 * expedientes marcados como «transferidos» a ningún sitio.
 *
 * Lo que sí se hace, y es útil hoy: validar que el expediente esté en condiciones,
 * decir exactamente qué falta, generar el resumen y devolver el CONTRATO de datos
 * transferibles —los campos, con su nombre y su valor— para que el día que exista
 * el destino solo haya que enviarlo. Y se registra la preparación, así que queda
 * trazabilidad de quién dio el expediente por cerrado.
 */
function doc2PrepararExpedienteLaboral_(expedienteId, ctx, opciones) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.APROBAR);
  var o = opciones || {};
  var completo = doc2ExpedienteOperativo_(expedienteId, contexto, { historial: 20, auditoria: 0 });
  var cab = completo.expediente;

  var faltantes = [];
  for (var i = 0; i < completo.requisitos.length; i++) {
    var req = completo.requisitos[i];
    if (req.archivado) continue;
    if (req.estado === DOC2_ESTADO_DOCUMENTO.ENTREGADO || req.estado === DOC2_ESTADO_DOCUMENTO.NO_APLICA) continue;
    faltantes.push({ codigo: req.codigo, nombre: req.nombre, estado: req.estado, obligatorio: req.obligatorio });
  }
  var observados = [];
  for (var r = 0; r < completo.requisitos.length; r++) {
    var revision = completo.requisitos[r].estadoRevision;
    if (revision === DOC2_ESTADO_REVISION.OBSERVADO || revision === DOC2_ESTADO_REVISION.REQUIERE_CORRECCION ||
        revision === DOC2_ESTADO_REVISION.RECHAZADO) {
      observados.push({ codigo: completo.requisitos[r].codigo, nombre: completo.requisitos[r].nombre, estado: revision });
    }
  }

  var listo = faltantes.length === 0 && observados.length === 0;
  var contrato = {
    version: 1,
    origen: 'documentacion',
    destino: 'expediente_laboral',
    generado: docNow_(),
    campos: {
      identificador: cab.identificador,
      nombre: cab.nombre,
      cargo: cab.cargo,
      agencia: cab.agencia,
      gerencia: cab.gerencia,
      fechaIngreso: cab.fechaIngreso,
      tipoFuncionario: cab.tipoFuncionario,
      tipoGarantia: cab.tipoGarantia,
      responsable: cab.responsableId,
      estadoDocumental: cab.estado,
      completitud: cab.porcentaje,
      requisitosEntregados: cab.totales.entregados,
      requisitosNoAplica: cab.totales.noAplica,
      cierreDocumental: listo ? doc2Hoy_() : '',
      resumen: completo.resumenTextual
    },
    noTransferible: ['observaciones internas', 'comentarios internos', 'auditoría técnica'],
    nota: 'No se transfiere ningún archivo binario: el módulo no los almacena.'
  };

  var registrado = false;
  if (listo && o.registrarCierre === true) {
    // Cerrar la etapa documental es aprobar el expediente: la misma máquina de
    // estados y las mismas comprobaciones, sin una vía paralela.
    if (String(cab.estado) !== DOC2_ESTADO_EXPEDIENTE.APROBADO) {
      doc2CambiarEstadoExpediente_(cab.expedienteId, DOC2_ESTADO_EXPEDIENTE.APROBADO, contexto,
        { motivo: 'Cierre de la etapa documental para el expediente laboral' });
    }
    doc2Historial_({
      expedienteId: cab.expedienteId, entidadTipo: 'expediente', entidadId: cab.expedienteId,
      campo: 'cierre_documental', anterior: '', nuevo: 'preparado para expediente laboral',
      motivo: 'Contrato de transferencia generado', actor: contexto.actor
    });
    doc2Audit_({
      tipo: 'expediente.preparado_laboral', expedienteId: cab.expedienteId, entidadTipo: 'expediente',
      entidadId: cab.expedienteId, actor: contexto.actor, actorId: contexto.actorId,
      origen: contexto.origen, requestId: contexto.requestId,
      metadata: { completitud: cab.porcentaje }
    });
    registrado = true;
  }

  return {
    expedienteId: cab.expedienteId,
    listo: listo,
    faltantes: faltantes,
    observados: observados,
    contrato: contrato,
    cierreRegistrado: registrado,
    moduloDestinoDisponible: false,
    nota: listo
      ? 'El expediente cumple los requisitos. El módulo de expediente laboral todavía no existe: el contrato queda listo para cuando exista.'
      : 'Faltan requisitos por resolver antes de cerrar la etapa documental.'
  };
}

/* ========================================================================== */
/* INCONSISTENCIAS                                                             */
/* ========================================================================== */

/** Niveles de severidad del diagnóstico. */
var DOC2_SEVERIDAD = { INFO: 'INFO', ADVERTENCIA: 'ADVERTENCIA', IMPORTANTE: 'IMPORTANTE', CRITICO: 'CRITICO' };

/** Da forma a un hallazgo. */
function doc2Hallazgo_(severidad, codigo, titulo, detalle, accion, datos) {
  return {
    severidad: severidad,
    codigo: codigo,
    titulo: titulo,
    detalle: detalle,
    accion: accion || '',
    reparable: doc2EsReparable_(accion),
    datos: datos || {}
  };
}

/** Qué reparaciones son seguras de aplicar solas. */
var DOC2_REPARACIONES_SEGURAS = {
  'crear-hojas': true,
  'reparar-columnas': true,
  'generar-ids': true,
  'normalizar-estados': true,
  'reconstruir-resumenes': true,
  'invalidar-cache': true,
  'sembrar-config': true,
  'sembrar-catalogo': true,
  'sembrar-auxiliar': true,
  'cerrar-exportaciones': true,
  'sincronizar-requisitos': true
};

function doc2EsReparable_(accion) {
  if (!accion) return false;
  return DOC2_REPARACIONES_SEGURAS[accion] === true ? 'automatica' : 'confirmacion';
}

/**
 * Busca inconsistencias en los datos. Solo lectura.
 *
 * Cada comprobación responde a un problema que se ha visto de verdad en libros
 * compartidos: identificadores repetidos, estados que no cuadran con el
 * contenido, hijos sin padre, catálogos desalineados, resúmenes desfasados.
 */
function doc2Inconsistencias_(ctx) {
  var contexto = ctx || doc2CtxActual_();
  var hallazgos = [];
  var conteo = {};

  function anotar(clave, item) {
    if (!conteo[clave]) conteo[clave] = [];
    if (conteo[clave].length < 50) conteo[clave].push(item);
    else conteo[clave].push(null);
  }
  function totales(clave) {
    return (conteo[clave] || []).length;
  }
  function ejemplos(clave) {
    var lista = conteo[clave] || [];
    var out = [];
    for (var i = 0; i < lista.length && out.length < 10; i++) if (lista[i]) out.push(lista[i]);
    return out;
  }

  var expedientes = doc2All_(DOC2_SHEET.EXPEDIENTES, true);
  var porIdentificador = {};
  var idsVistos = {};
  var indiceExpedientes = {};
  var auxiliares = doc2Auxiliares_();

  for (var i = 0; i < expedientes.length; i++) {
    var e = expedientes[i];
    indiceExpedientes[String(e.expediente_id)] = e;

    var clave = String(e.identificador_normalizado || '');
    if (clave) {
      if (porIdentificador[clave]) anotar('identificador-duplicado', { identificador: e.identificador, expedientes: [porIdentificador[clave], e.expediente_id] });
      else porIdentificador[clave] = e.expediente_id;
    } else {
      anotar('identificador-vacio', { expedienteId: e.expediente_id, nombre: e.nombre });
    }

    if (idsVistos[String(e.expediente_id)]) anotar('id-duplicado', { expedienteId: e.expediente_id });
    idsVistos[String(e.expediente_id)] = true;

    if (!doc2EsEstado_('expediente', e.estado_expediente)) {
      anotar('estado-desconocido', { expedienteId: e.expediente_id, estado: e.estado_expediente });
    }

    if (e.fecha_ingreso && !doc2FechaValida_(e.fecha_ingreso)) {
      anotar('fecha-invalida', { identificador: e.identificador, campo: 'fecha_ingreso', valor: e.fecha_ingreso });
    }

    if (docKey_(e.tipo_funcionario) === 'COMERCIAL' && docKey_(e.tipo_garantia) === 'NINGUNA') {
      anotar('comercial-sin-garantia', { identificador: e.identificador, nombre: e.nombre });
    }

    if (auxiliares.agencia_bdp.length && e.agencia && !doc2EnCatalogoAuxiliar_('agencia_bdp', e.agencia)) {
      anotar('agencia-fuera-catalogo', { identificador: e.identificador, agencia: e.agencia });
    }
    if (auxiliares.gerencia_bdp.length && e.gerencia && !doc2EnCatalogoAuxiliar_('gerencia_bdp', e.gerencia)) {
      anotar('gerencia-fuera-catalogo', { identificador: e.identificador, gerencia: e.gerencia });
    }
  }

  // Requisitos.
  var requisitos = doc2All_(DOC2_SHEET.EXPEDIENTE_DOCS, true);
  var requisitosPorExpediente = {};
  var indiceRequisitos = {};
  for (var r = 0; r < requisitos.length; r++) {
    var req = requisitos[r];
    indiceRequisitos[String(req.expediente_documento_id)] = req;
    if (!indiceExpedientes[String(req.expediente_id)]) {
      anotar('requisito-huerfano', { requisito: req.expediente_documento_id, expedienteId: req.expediente_id });
      continue;
    }
    if (!requisitosPorExpediente[String(req.expediente_id)]) requisitosPorExpediente[String(req.expediente_id)] = [];
    requisitosPorExpediente[String(req.expediente_id)].push(req);

    if (!doc2EsEstado_('documento', req.estado_documental)) {
      anotar('estado-documental-desconocido', { requisito: req.expediente_documento_id, estado: req.estado_documental });
    }
    if (String(req.estado_documental) === DOC2_ESTADO_DOCUMENTO.NO_APLICA && req.permite_no_aplica !== true) {
      anotar('no-aplica-invalido', { requisito: req.expediente_documento_id, codigo: req.codigo_documento });
    }
    if (!doc2CatalogoItem_(req.codigo_documento)) {
      anotar('requisito-fuera-catalogo', { requisito: req.expediente_documento_id, codigo: req.codigo_documento });
    }
    // ¿Pertenece a la rama del expediente?
    var duenio = indiceExpedientes[String(req.expediente_id)];
    if (duenio && !req.archived_at) {
      var def = doc2CatalogoItem_(req.codigo_documento);
      if (def) {
        var funcionarios = doc2Lista_(def.tipo_funcionario);
        var garantias = doc2Lista_(def.tipo_garantia);
        var fueraDeRama = (funcionarios.length && funcionarios.indexOf(docKey_(duenio.tipo_funcionario)) < 0) ||
          (garantias.length && garantias.indexOf(docKey_(duenio.tipo_garantia)) < 0);
        if (fueraDeRama) {
          anotar('requisito-de-otra-rama', {
            identificador: duenio.identificador, codigo: req.codigo_documento,
            rama: duenio.tipo_funcionario + '/' + duenio.tipo_garantia
          });
        }
      }
    }
    var estadoRevision = String(req.estado_revision || '');
    if (estadoRevision && !doc2EsEstado_('revision', estadoRevision)) {
      anotar('estado-revision-desconocido', { requisito: req.expediente_documento_id, estado: estadoRevision });
    }
    if ((estadoRevision === DOC2_ESTADO_REVISION.APROBADO || estadoRevision === DOC2_ESTADO_REVISION.APROBADO_CON_OBSERVACION) &&
        !req.revision_actual_id) {
      anotar('aprobacion-sin-revision', { requisito: req.expediente_documento_id, codigo: req.codigo_documento });
    }
  }

  for (var x = 0; x < expedientes.length; x++) {
    var expediente = expedientes[x];
    var propios = requisitosPorExpediente[String(expediente.expediente_id)] || [];
    var vigentes = 0;
    for (var v = 0; v < propios.length; v++) if (!propios[v].archived_at) vigentes++;
    if (!vigentes && String(expediente.estado_expediente) !== DOC2_ESTADO_EXPEDIENTE.ELIMINADO_LOGICO) {
      anotar('expediente-sin-requisitos', { identificador: expediente.identificador, nombre: expediente.nombre });
    }

    // ¿El resumen materializado coincide con la realidad?
    var recuento = { entregados: 0, pendientes: 0, noEntregados: 0, noAplica: 0, observados: 0 };
    for (var c = 0; c < propios.length; c++) {
      if (propios[c].archived_at) continue;
      var estadoD = String(propios[c].estado_documental);
      if (estadoD === DOC2_ESTADO_DOCUMENTO.ENTREGADO) recuento.entregados++;
      else if (estadoD === DOC2_ESTADO_DOCUMENTO.NO_ENTREGADO) recuento.noEntregados++;
      else if (estadoD === DOC2_ESTADO_DOCUMENTO.NO_APLICA) recuento.noAplica++;
      else recuento.pendientes++;
      var revisionEstado = String(propios[c].estado_revision);
      if (revisionEstado === DOC2_ESTADO_REVISION.OBSERVADO || revisionEstado === DOC2_ESTADO_REVISION.REQUIERE_CORRECCION ||
          revisionEstado === DOC2_ESTADO_REVISION.RECHAZADO) recuento.observados++;
    }
    if (docInt_(expediente.total_entregados, 0) !== recuento.entregados ||
        docInt_(expediente.total_pendientes, 0) !== recuento.pendientes ||
        docInt_(expediente.total_no_entregados, 0) !== recuento.noEntregados ||
        docInt_(expediente.total_no_aplica, 0) !== recuento.noAplica ||
        docInt_(expediente.total_observados, 0) !== recuento.observados) {
      anotar('resumen-desactualizado', {
        identificador: expediente.identificador,
        guardado: {
          entregados: docInt_(expediente.total_entregados, 0), pendientes: docInt_(expediente.total_pendientes, 0),
          noEntregados: docInt_(expediente.total_no_entregados, 0), noAplica: docInt_(expediente.total_no_aplica, 0),
          observados: docInt_(expediente.total_observados, 0)
        },
        real: recuento
      });
    }

    var estado = String(expediente.estado_expediente);
    if ((estado === DOC2_ESTADO_EXPEDIENTE.COMPLETO || estado === DOC2_ESTADO_EXPEDIENTE.APROBADO) &&
        (recuento.pendientes > 0 || recuento.noEntregados > 0)) {
      anotar('completo-con-pendientes', {
        identificador: expediente.identificador, estado: estado,
        pendientes: recuento.pendientes + recuento.noEntregados
      });
    }
  }

  // Prórrogas.
  var prorrogas = doc2All_(DOC2_SHEET.PRORROGAS, true);
  for (var p = 0; p < prorrogas.length; p++) {
    var pro = prorrogas[p];
    if (!indiceExpedientes[String(pro.expediente_id)]) {
      anotar('prorroga-huerfana', { prorroga: pro.prorroga_id, expedienteId: pro.expediente_id });
      continue;
    }
    var requisitoDePro = indiceRequisitos[String(pro.expediente_documento_id)];
    if (pro.expediente_documento_id && !requisitoDePro) {
      anotar('prorroga-sin-requisito', { prorroga: pro.prorroga_id, requisito: pro.expediente_documento_id });
    } else if (requisitoDePro && requisitoDePro.permite_prorroga !== true) {
      anotar('prorroga-invalida', { prorroga: pro.prorroga_id, codigo: pro.codigo_documento });
    }
    if (pro.fecha_prorroga && !doc2FechaValida_(pro.fecha_prorroga)) {
      anotar('fecha-invalida', { prorroga: pro.prorroga_id, campo: 'fecha_prorroga', valor: pro.fecha_prorroga });
    }
    if (pro.fecha_original && pro.fecha_prorroga && String(pro.fecha_prorroga) < String(pro.fecha_original)) {
      anotar('prorroga-invalida', { prorroga: pro.prorroga_id, motivo: 'La prórroga termina antes de la fecha original.' });
    }
  }

  // Solicitudes y sus ítems.
  var solicitudes = doc2All_(DOC2_SHEET.SOLICITUDES, true);
  var indiceSolicitudes = {};
  for (var s = 0; s < solicitudes.length; s++) {
    indiceSolicitudes[String(solicitudes[s].solicitud_id)] = solicitudes[s];
    if (!indiceExpedientes[String(solicitudes[s].expediente_id)]) {
      anotar('solicitud-huerfana', { solicitud: solicitudes[s].solicitud_id });
    }
  }
  var items = doc2All_(DOC2_SHEET.SOLICITUD_DOCS, true);
  var pendientesPorSolicitud = {};
  for (var it = 0; it < items.length; it++) {
    var item = items[it];
    if (!indiceSolicitudes[String(item.solicitud_id)]) {
      anotar('item-solicitud-huerfano', { item: item.solicitud_documento_id, solicitud: item.solicitud_id });
      continue;
    }
    if (String(item.estado_item) !== 'CUMPLIDO') {
      pendientesPorSolicitud[String(item.solicitud_id)] = (pendientesPorSolicitud[String(item.solicitud_id)] || 0) + 1;
    }
  }
  for (var sk in indiceSolicitudes) {
    if (!Object.prototype.hasOwnProperty.call(indiceSolicitudes, sk)) continue;
    var solicitud = indiceSolicitudes[sk];
    if (String(solicitud.estado_solicitud) !== DOC2_ESTADO_SOLICITUD.COMPLETADA) continue;
    if ((pendientesPorSolicitud[sk] || 0) > 0) {
      anotar('solicitud-completada-con-pendientes', {
        solicitud: sk, titulo: solicitud.titulo, itemsPendientes: pendientesPorSolicitud[sk]
      });
    }
  }

  // Tareas y comentarios huérfanos.
  var tareas = doc2All_(DOC2_SHEET.TAREAS, true);
  for (var t = 0; t < tareas.length; t++) {
    if (!indiceExpedientes[String(tareas[t].expediente_id)]) {
      anotar('tarea-huerfana', { tarea: tareas[t].tarea_id, titulo: tareas[t].titulo });
    }
  }
  var comentarios = doc2All_(DOC2_SHEET.COMENTARIOS, true);
  for (var cm = 0; cm < comentarios.length; cm++) {
    if (!indiceExpedientes[String(comentarios[cm].expediente_id)]) {
      anotar('comentario-huerfano', { comentario: comentarios[cm].comentario_id });
    }
  }

  // Exportaciones estancadas y migraciones incompletas.
  var exportaciones = doc2All_(DOC2_SHEET.EXPORTACIONES, true);
  for (var ex = 0; ex < exportaciones.length; ex++) {
    if (doc2ExportacionEstancada_(exportaciones[ex])) {
      anotar('exportacion-estancada', { exportacion: exportaciones[ex].exportacion_id, progreso: exportaciones[ex].progreso });
    }
  }
  var migraciones = doc2All_(DOC2_SHEET.MIGRACIONES, true);
  for (var mg = 0; mg < migraciones.length; mg++) {
    var estadoM = String(migraciones[mg].estado);
    if (estadoM === 'EN_PROCESO' || estadoM === 'ERROR') {
      anotar('migracion-incompleta', { version: migraciones[mg].version, estado: estadoM, progreso: migraciones[mg].progreso });
    }
  }

  // Disparadores duplicados.
  try {
    var handlers = {};
    var triggers = ScriptApp.getProjectTriggers();
    for (var tg = 0; tg < triggers.length; tg++) {
      var handler = triggers[tg].getHandlerFunction();
      handlers[handler] = (handlers[handler] || 0) + 1;
    }
    for (var hk in handlers) {
      if (!Object.prototype.hasOwnProperty.call(handlers, hk)) continue;
      if (handlers[hk] > 1) anotar('trigger-duplicado', { handler: hk, veces: handlers[hk] });
    }
  } catch (error) { /* sin permisos de disparadores en este contexto */ }

  // Traducción a hallazgos.
  var catalogoHallazgos = [
    { clave: 'identificador-duplicado', severidad: DOC2_SEVERIDAD.CRITICO, titulo: 'Posible identificador duplicado', detalle: 'Dos expedientes comparten el mismo identificador normalizado. Requiere revisión: puede ser la misma persona registrada dos veces.', accion: '' },
    { clave: 'id-duplicado', severidad: DOC2_SEVERIDAD.CRITICO, titulo: 'Identificadores internos repetidos', detalle: 'Dos filas comparten el mismo expediente_id. Requiere revisión manual antes de operar.', accion: '' },
    { clave: 'identificador-vacio', severidad: DOC2_SEVERIDAD.IMPORTANTE, titulo: 'Expedientes sin identificador normalizado', detalle: 'Se puede regenerar a partir del identificador visible.', accion: 'generar-ids' },
    { clave: 'estado-desconocido', severidad: DOC2_SEVERIDAD.IMPORTANTE, titulo: 'Estados de expediente no reconocidos', detalle: 'Hay estados que no pertenecen a la máquina de estados. Los alias conocidos se pueden normalizar.', accion: 'normalizar-estados' },
    { clave: 'estado-documental-desconocido', severidad: DOC2_SEVERIDAD.IMPORTANTE, titulo: 'Estados documentales no reconocidos', detalle: 'Valores fuera del vocabulario. Los alias inequívocos se normalizan; el resto requiere revisión.', accion: 'normalizar-estados' },
    { clave: 'estado-revision-desconocido', severidad: DOC2_SEVERIDAD.ADVERTENCIA, titulo: 'Estados de revisión no reconocidos', detalle: 'Requiere revisión: el valor no pertenece a la máquina de estados de revisión.', accion: 'normalizar-estados' },
    { clave: 'fecha-invalida', severidad: DOC2_SEVERIDAD.ADVERTENCIA, titulo: 'Fechas que no se pueden interpretar', detalle: 'Requiere revisión manual: corregir la fecha en la fila indicada.', accion: '' },
    { clave: 'comercial-sin-garantia', severidad: DOC2_SEVERIDAD.IMPORTANTE, titulo: 'Funcionario comercial sin tipo de garantía', detalle: 'Sin tipo de garantía no se pueden determinar sus requisitos comerciales.', accion: '' },
    { clave: 'expediente-sin-requisitos', severidad: DOC2_SEVERIDAD.IMPORTANTE, titulo: 'Expedientes sin requisitos', detalle: 'Se pueden generar desde el catálogo según su rama, sin tocar nada existente.', accion: 'sincronizar-requisitos' },
    { clave: 'requisito-huerfano', severidad: DOC2_SEVERIDAD.IMPORTANTE, titulo: 'Requisitos sin expediente', detalle: 'Apuntan a un expediente que no existe. Requiere revisión antes de decidir qué hacer.', accion: '' },
    { clave: 'requisito-fuera-catalogo', severidad: DOC2_SEVERIDAD.ADVERTENCIA, titulo: 'Requisitos con código fuera del catálogo', detalle: 'El código no está en CatalogoDocumentos. Puede ser un requisito retirado; se conserva.', accion: '' },
    { clave: 'requisito-de-otra-rama', severidad: DOC2_SEVERIDAD.ADVERTENCIA, titulo: 'Requisitos que no corresponden a la rama', detalle: 'Posible inconsistencia tras un cambio de tipo de garantía. Se conservan porque pueden tener datos.', accion: 'sincronizar-requisitos' },
    { clave: 'no-aplica-invalido', severidad: DOC2_SEVERIDAD.IMPORTANTE, titulo: 'Requisitos obligatorios marcados como no aplica', detalle: 'Requiere revisión: un requisito obligatorio no debería estar en NO_APLICA.', accion: '' },
    { clave: 'aprobacion-sin-revision', severidad: DOC2_SEVERIDAD.ADVERTENCIA, titulo: 'Requisitos aprobados sin decisión registrada', detalle: 'El estado dice aprobado pero no hay fila de revisión que lo respalde.', accion: '' },
    { clave: 'resumen-desactualizado', severidad: DOC2_SEVERIDAD.ADVERTENCIA, titulo: 'Resúmenes desfasados', detalle: 'Los totales guardados no coinciden con los requisitos. Se recalculan sin tocar los documentos.', accion: 'reconstruir-resumenes' },
    { clave: 'completo-con-pendientes', severidad: DOC2_SEVERIDAD.IMPORTANTE, titulo: 'Expedientes completos con requisitos pendientes', detalle: 'Posible inconsistencia. El recálculo ajusta el estado según el contenido real.', accion: 'reconstruir-resumenes' },
    { clave: 'prorroga-huerfana', severidad: DOC2_SEVERIDAD.ADVERTENCIA, titulo: 'Prórrogas sin expediente', detalle: 'Requiere revisión manual.', accion: '' },
    { clave: 'prorroga-sin-requisito', severidad: DOC2_SEVERIDAD.ADVERTENCIA, titulo: 'Prórrogas sin requisito asociado', detalle: 'Requiere revisión: la prórroga apunta a un requisito que no existe.', accion: '' },
    { clave: 'prorroga-invalida', severidad: DOC2_SEVERIDAD.ADVERTENCIA, titulo: 'Prórrogas con datos inconsistentes', detalle: 'Requiere revisión: fechas invertidas o requisito que no admite prórroga.', accion: '' },
    { clave: 'solicitud-huerfana', severidad: DOC2_SEVERIDAD.ADVERTENCIA, titulo: 'Solicitudes sin expediente', detalle: 'Requiere revisión manual.', accion: '' },
    { clave: 'item-solicitud-huerfano', severidad: DOC2_SEVERIDAD.ADVERTENCIA, titulo: 'Ítems de solicitud sin solicitud', detalle: 'Requiere revisión manual.', accion: '' },
    { clave: 'solicitud-completada-con-pendientes', severidad: DOC2_SEVERIDAD.ADVERTENCIA, titulo: 'Solicitudes completadas con ítems pendientes', detalle: 'Posible inconsistencia: la solicitud está cerrada pero algún requisito no se marcó.', accion: '' },
    { clave: 'tarea-huerfana', severidad: DOC2_SEVERIDAD.ADVERTENCIA, titulo: 'Tareas sin expediente', detalle: 'Requiere revisión manual.', accion: '' },
    { clave: 'comentario-huerfano', severidad: DOC2_SEVERIDAD.ADVERTENCIA, titulo: 'Comentarios sin expediente', detalle: 'Requiere revisión manual.', accion: '' },
    { clave: 'agencia-fuera-catalogo', severidad: DOC2_SEVERIDAD.INFO, titulo: 'Agencias fuera del catálogo auxiliar', detalle: 'Se pueden añadir al catálogo sin borrar nada.', accion: 'sembrar-auxiliar' },
    { clave: 'gerencia-fuera-catalogo', severidad: DOC2_SEVERIDAD.INFO, titulo: 'Gerencias fuera del catálogo auxiliar', detalle: 'Se pueden añadir al catálogo sin borrar nada.', accion: 'sembrar-auxiliar' },
    { clave: 'exportacion-estancada', severidad: DOC2_SEVERIDAD.INFO, titulo: 'Exportaciones a medias', detalle: 'Trabajos en proceso sin avance. Se pueden cerrar sin perder datos.', accion: 'cerrar-exportaciones' },
    { clave: 'migracion-incompleta', severidad: DOC2_SEVERIDAD.IMPORTANTE, titulo: 'Migraciones sin terminar', detalle: 'Hay migraciones en proceso o con error. Se pueden reanudar desde su punto de control.', accion: '' },
    { clave: 'trigger-duplicado', severidad: DOC2_SEVERIDAD.IMPORTANTE, titulo: 'Disparadores duplicados', detalle: 'El mismo proceso está programado más de una vez. Reinstala los disparadores desde el menú.', accion: '' }
  ];

  for (var h = 0; h < catalogoHallazgos.length; h++) {
    var spec = catalogoHallazgos[h];
    var total = totales(spec.clave);
    if (!total) continue;
    hallazgos.push(doc2Hallazgo_(spec.severidad, spec.clave,
      spec.titulo + ' (' + total + ')',
      spec.detalle,
      spec.accion,
      { total: total, ejemplos: ejemplos(spec.clave) }));
  }

  return hallazgos;
}

/* ========================================================================== */
/* DIAGNÓSTICO                                                                 */
/* ========================================================================== */

/**
 * Diagnóstico completo del módulo. Solo lectura, nunca lanza.
 *
 * Revisa estructura, catálogos, datos, procesos y consistencia, y devuelve
 * hallazgos clasificados con la acción que los corrige. Se puede ejecutar en un
 * libro roto: es justo cuando más se necesita.
 */
function doc2Diagnostico_(ctx) {
  var contexto = ctx || doc2CtxActual_();
  var inicio = Date.now();
  var hallazgos = [];
  var resumen = {
    esquema: DOC2_SCHEMA_VERSION,
    arquitectura: DOC2_BACKEND.version,
    libro: '',
    hojasNormalizadas: 0,
    hojasFaltantes: [],
    expedientes: 0,
    requisitos: 0,
    prorrogas: 0,
    solicitudes: 0,
    tareas: 0,
    notificaciones: 0,
    migracionAplicada: '',
    migracionPendiente: false,
    catalogo: 0,
    auxiliares: { agencias: 0, gerencias: 0 }
  };

  var ss = null;
  try {
    ss = docSpreadsheet_();
    resumen.libro = ss.getName ? ss.getName() : '';
  } catch (error) {
    hallazgos.push(doc2Hallazgo_(DOC2_SEVERIDAD.CRITICO, 'libro-inaccesible',
      'No se puede abrir el libro de cálculo.',
      docClassify_(error).message + ' Sin libro no hay nada que diagnosticar.',
      'crear-hojas'));
    return { ok: false, resumen: resumen, hallazgos: hallazgos, ms: Date.now() - inicio };
  }

  // Estructura.
  for (var s = 0; s < DOC2_SHEET_ORDER.length; s++) {
    var nombre = DOC2_SHEET_ORDER[s];
    var hoja = ss.getSheetByName(nombre);
    if (!hoja) {
      resumen.hojasFaltantes.push(nombre);
      continue;
    }
    resumen.hojasNormalizadas++;
    var estado = docInspectSheet_(hoja, docColumnNames_(nombre));
    if (estado.columnasFaltantes.length) {
      hallazgos.push(doc2Hallazgo_(DOC2_SEVERIDAD.CRITICO, 'columnas-faltantes',
        'A la hoja ' + nombre + ' le faltan ' + estado.columnasFaltantes.length + ' columna(s).',
        'Se añaden al final, sin mover ni borrar datos: ' + estado.columnasFaltantes.join(', ') + '.',
        'reparar-columnas', { hoja: nombre, columnas: estado.columnasFaltantes }));
    }
  }
  if (resumen.hojasFaltantes.length) {
    hallazgos.push(doc2Hallazgo_(DOC2_SEVERIDAD.CRITICO, 'hojas-faltantes',
      'Faltan ' + resumen.hojasFaltantes.length + ' hoja(s) del modelo normalizado.',
      'Sin ellas el módulo no puede operar: ' + resumen.hojasFaltantes.join(', ') + '.',
      'crear-hojas', { hojas: resumen.hojasFaltantes }));
  }

  if (!ss.getSheetByName(DOC2_SHEET.AUXILIAR)) {
    hallazgos.push(doc2Hallazgo_(DOC2_SEVERIDAD.IMPORTANTE, 'auxiliar-faltante',
      'No existe la hoja Auxiliar.',
      'Es donde viven los catálogos de agencias y gerencias.',
      'sembrar-auxiliar'));
  }

  // Datos.
  try { resumen.expedientes = doc2Count_(DOC2_SHEET.EXPEDIENTES); } catch (e) { /* hoja ausente */ }
  try { resumen.requisitos = doc2Count_(DOC2_SHEET.EXPEDIENTE_DOCS); } catch (e) { /* idem */ }
  try { resumen.prorrogas = doc2Count_(DOC2_SHEET.PRORROGAS); } catch (e) { /* idem */ }
  try { resumen.solicitudes = doc2Count_(DOC2_SHEET.SOLICITUDES); } catch (e) { /* idem */ }
  try { resumen.tareas = doc2Count_(DOC2_SHEET.TAREAS); } catch (e) { /* idem */ }
  try { resumen.notificaciones = doc2Count_(DOC2_SHEET.NOTIFICACIONES); } catch (e) { /* idem */ }
  try { resumen.catalogo = doc2Catalogo_(true).length; } catch (e) { /* idem */ }

  if (!resumen.hojasFaltantes.length && resumen.catalogo === 0) {
    hallazgos.push(doc2Hallazgo_(DOC2_SEVERIDAD.CRITICO, 'catalogo-vacio',
      'El catálogo de documentos está vacío.',
      'Sin catálogo no se pueden determinar los requisitos de ningún expediente.',
      'sembrar-catalogo'));
  }

  try {
    var auxiliares = doc2Auxiliares_();
    resumen.auxiliares = { agencias: auxiliares.agencia_bdp.length, gerencias: auxiliares.gerencia_bdp.length };
    if (!auxiliares.gerencia_bdp.length) {
      hallazgos.push(doc2Hallazgo_(DOC2_SEVERIDAD.INFO, 'gerencias-vacias',
        'El catálogo de gerencias está vacío.',
        'Los filtros por gerencia quedarán sin opciones hasta poblarlo.',
        'sembrar-auxiliar'));
    }
    var revisionAux = doc2DiagnosticarAuxiliar_();
    if (revisionAux.duplicados.length) {
      hallazgos.push(doc2Hallazgo_(DOC2_SEVERIDAD.ADVERTENCIA, 'auxiliar-duplicados',
        'Hay ' + revisionAux.duplicados.length + ' valor(es) repetido(s) en los catálogos auxiliares.',
        'Requiere revisión: dos escrituras distintas del mismo valor aparecen como dos opciones. No se corrigen solas porque cambiaría el texto escrito.',
        '', { ejemplos: revisionAux.duplicados.slice(0, 10) }));
    }
    if (revisionAux.sospechosos.length) {
      hallazgos.push(doc2Hallazgo_(DOC2_SEVERIDAD.INFO, 'auxiliar-espacios',
        revisionAux.sospechosos.length + ' valor(es) con espacios invisibles.',
        'Se leen con espacios de más, lo que puede duplicar opciones en los desplegables.',
        '', { ejemplos: revisionAux.sospechosos.slice(0, 10) }));
    }
  } catch (e) { /* sin hoja auxiliar todavía */ }

  // Migración.
  try {
    var estadoMigracion = doc2EstadoMigraciones_();
    resumen.migracionAplicada = estadoMigracion.aplicadas.join(', ');
    resumen.migracionPendiente = estadoMigracion.pendientes.length > 0;
    if (estadoMigracion.pendientes.length) {
      hallazgos.push(doc2Hallazgo_(DOC2_SEVERIDAD.IMPORTANTE, 'migracion-pendiente',
        'Hay ' + estadoMigracion.pendientes.length + ' migración(es) sin aplicar.',
        'Versiones pendientes: ' + estadoMigracion.pendientes.join(', ') + '. Ejecuta la migración desde el módulo o el menú del libro.',
        '', { pendientes: estadoMigracion.pendientes }));
    }
  } catch (e) { /* sin hoja de migraciones todavía */ }

  // Consistencia de datos.
  try {
    var inconsistencias = doc2Inconsistencias_(contexto);
    for (var i = 0; i < inconsistencias.length; i++) hallazgos.push(inconsistencias[i]);
  } catch (error) {
    hallazgos.push(doc2Hallazgo_(DOC2_SEVERIDAD.ADVERTENCIA, 'inconsistencias-no-evaluadas',
      'No se pudieron revisar todas las inconsistencias.',
      docClassify_(error).message, ''));
  }

  var conteos = { INFO: 0, ADVERTENCIA: 0, IMPORTANTE: 0, CRITICO: 0 };
  for (var h = 0; h < hallazgos.length; h++) {
    conteos[hallazgos[h].severidad] = (conteos[hallazgos[h].severidad] || 0) + 1;
  }

  return {
    ok: conteos.CRITICO === 0,
    resumen: resumen,
    hallazgos: hallazgos,
    conteos: conteos,
    reparablesAutomaticamente: doc2AccionesReparables_(hallazgos, 'automatica'),
    requierenConfirmacion: doc2AccionesReparables_(hallazgos, 'confirmacion'),
    ms: Date.now() - inicio
  };
}

/** Acciones de reparación presentes en los hallazgos, por nivel. */
function doc2AccionesReparables_(hallazgos, nivel) {
  var vistas = {};
  var out = [];
  for (var i = 0; i < hallazgos.length; i++) {
    if (!hallazgos[i].accion) continue;
    if (hallazgos[i].reparable !== nivel) continue;
    if (vistas[hallazgos[i].accion]) continue;
    vistas[hallazgos[i].accion] = true;
    out.push(hallazgos[i].accion);
  }
  return out;
}

/* ========================================================================== */
/* REPARACIÓN                                                                  */
/* ========================================================================== */

/**
 * Aplica reparaciones.
 *
 * ── Tres niveles ────────────────────────────────────────────────────────────
 *   automática     estructura, semillas, identificadores, resúmenes, caché;
 *   confirmación   toca datos de negocio y exige `confirmado: true`;
 *   manual         no se automatiza; el informe dice qué revisar.
 *
 * Devuelve el diagnóstico ANTES y DESPUÉS, y el detalle de cada cambio. Una
 * reparación que solo dice «hecho» obliga a comparar el libro a ojo para saber
 * qué pasó.
 */
function doc2Reparar_(opciones, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.REPARAR);
  var o = opciones || {};
  var antes = doc2Diagnostico_(contexto);
  var aplicadas = [];
  var omitidas = [];

  var solicitadas = o.acciones && o.acciones.length ? o.acciones : antes.reparablesAutomaticamente;
  if (o.incluirConfirmacion === true && o.confirmado === true) {
    for (var c = 0; c < antes.requierenConfirmacion.length; c++) {
      if (solicitadas.indexOf(antes.requierenConfirmacion[c]) < 0) solicitadas.push(antes.requierenConfirmacion[c]);
    }
  }

  for (var i = 0; i < solicitadas.length; i++) {
    var accion = String(solicitadas[i]);
    var esSegura = DOC2_REPARACIONES_SEGURAS[accion] === true;
    if (!esSegura && o.confirmado !== true) {
      omitidas.push({ accion: accion, motivo: 'Requiere confirmación explícita.' });
      continue;
    }
    try {
      aplicadas.push(doc2AplicarReparacion_(accion, contexto));
    } catch (error) {
      var info = docClassify_(error);
      omitidas.push({ accion: accion, motivo: info.message, codigo: info.docCode });
    }
  }

  var despues = doc2Diagnostico_(contexto);

  doc2Audit_({
    tipo: 'mantenimiento.reparacion', entidadTipo: 'sistema',
    actor: contexto.actor, actorId: contexto.actorId, origen: contexto.origen, requestId: contexto.requestId,
    resultado: omitidas.length ? 'parcial' : 'ok',
    metadata: {
      aplicadas: aplicadas.length, omitidas: omitidas.length,
      criticosAntes: antes.conteos.CRITICO, criticosDespues: despues.conteos.CRITICO
    }
  });

  return {
    aplicadas: aplicadas,
    omitidas: omitidas,
    antes: { conteos: antes.conteos, hallazgos: antes.hallazgos.length, resumen: antes.resumen },
    despues: { conteos: despues.conteos, hallazgos: despues.hallazgos.length, resumen: despues.resumen },
    pendientesManuales: doc2PendientesManuales_(despues.hallazgos)
  };
}

/** Ejecuta una reparación concreta y describe exactamente qué cambió. */
function doc2AplicarReparacion_(accion, ctx) {
  var contexto = ctx || doc2CtxActual_();
  switch (accion) {
    case 'crear-hojas':
    case 'reparar-columnas': {
      var acciones = doc2EnsureSheets_({ silencioso: true });
      return { accion: accion, cambios: acciones.length, detalle: acciones };
    }
    case 'sembrar-config': {
      var claves = doc2SeedConfig_(contexto);
      var politicas = doc2SeedRetencion_(contexto);
      return { accion: accion, cambios: claves + politicas, detalle: { clavesCreadas: claves, politicasCreadas: politicas } };
    }
    case 'sembrar-catalogo': {
      var r = doc2SeedCatalogo_(contexto);
      doc2EspejoCatalogoHeredado_();
      return { accion: accion, cambios: r.creados + r.actualizados, detalle: r };
    }
    case 'sembrar-auxiliar': {
      var aux = doc2SeedAuxiliares_();
      return { accion: accion, cambios: aux.agencias.agregadas + aux.gerencias.agregadas, detalle: aux };
    }
    case 'generar-ids': {
      var expedientes = doc2All_(DOC2_SHEET.EXPEDIENTES, true);
      var arreglados = [];
      for (var i = 0; i < expedientes.length; i++) {
        var e = expedientes[i];
        if (e.identificador_normalizado) continue;
        var normalizado = doc2NormalizarIdentificador_(e.identificador || e.nombre || e.expediente_id);
        doc2Update_(DOC2_SHEET.EXPEDIENTES, e.expediente_id, { identificador_normalizado: normalizado }, contexto);
        arreglados.push({ expedienteId: e.expediente_id, identificadorNormalizado: normalizado });
      }
      return { accion: accion, cambios: arreglados.length, detalle: arreglados.slice(0, 20) };
    }
    case 'normalizar-estados': {
      var cambios = [];
      var lista = doc2All_(DOC2_SHEET.EXPEDIENTES, true);
      for (var x = 0; x < lista.length; x++) {
        var expediente = lista[x];
        if (doc2EsEstado_('expediente', expediente.estado_expediente)) continue;
        var canonico = doc2NormalizarEstadoExpediente_(expediente.estado_expediente);
        if (!canonico) continue;
        doc2Update_(DOC2_SHEET.EXPEDIENTES, expediente.expediente_id, { estado_expediente: canonico }, contexto);
        doc2Historial_({
          expedienteId: expediente.expediente_id, entidadTipo: 'expediente', entidadId: expediente.expediente_id,
          campo: 'estado_expediente', anterior: expediente.estado_expediente, nuevo: canonico,
          motivo: 'Normalización de alias conocido', actor: contexto.actor
        });
        cambios.push({ expedienteId: expediente.expediente_id, de: expediente.estado_expediente, a: canonico });
      }
      var requisitos = doc2All_(DOC2_SHEET.EXPEDIENTE_DOCS, true);
      for (var r = 0; r < requisitos.length; r++) {
        var req = requisitos[r];
        if (doc2EsEstado_('documento', req.estado_documental)) continue;
        var canonicoDoc = doc2NormalizarEstadoDocumento_(req.estado_documental);
        doc2Update_(DOC2_SHEET.EXPEDIENTE_DOCS, req.expediente_documento_id, { estado_documental: canonicoDoc }, contexto);
        cambios.push({ requisito: req.expediente_documento_id, de: req.estado_documental, a: canonicoDoc });
      }
      return { accion: accion, cambios: cambios.length, detalle: cambios.slice(0, 20) };
    }
    case 'reconstruir-resumenes': {
      var recalculados = 0;
      var expedientes2 = doc2All_(DOC2_SHEET.EXPEDIENTES, true);
      for (var y = 0; y < expedientes2.length; y++) {
        doc2RecalcularExpediente_(expedientes2[y].expediente_id, contexto);
        recalculados++;
      }
      doc2CacheInvalidar_([DOC2_CACHE.PANEL]);
      return { accion: accion, cambios: recalculados, detalle: { expedientes: recalculados } };
    }
    case 'sincronizar-requisitos': {
      var sincronizados = [];
      var expedientes3 = doc2All_(DOC2_SHEET.EXPEDIENTES, false);
      for (var z = 0; z < expedientes3.length; z++) {
        var resultado = doc2SincronizarRequisitos_(expedientes3[z].expediente_id, contexto, { silencioso: true });
        if (resultado.creados || resultado.archivados) {
          doc2RecalcularExpediente_(expedientes3[z].expediente_id, contexto);
          sincronizados.push({
            identificador: expedientes3[z].identificador,
            creados: resultado.creados, archivados: resultado.archivados, conservados: resultado.conservados.length
          });
        }
      }
      return { accion: accion, cambios: sincronizados.length, detalle: sincronizados.slice(0, 20) };
    }
    case 'cerrar-exportaciones': {
      var limpieza = doc2LimpiarExportaciones_(contexto);
      return { accion: accion, cambios: limpieza.cerradas, detalle: limpieza };
    }
    case 'invalidar-cache': {
      var n = doc2CacheInvalidar_([]);
      doc2CatalogoReset_();
      doc2ConfigReset_();
      return { accion: accion, cambios: n, detalle: { claves: n } };
    }
    default:
      throw docError_(DOC_CODE.BAD_REQUEST, 'La reparación "' + accion + '" no existe.',
        { hint: 'Reparaciones disponibles: ' + Object.keys(DOC2_REPARACIONES_SEGURAS).join(', ') + '.', details: { accion: accion } });
  }
}

/** Hallazgos que necesitan intervención humana, con su indicación. */
function doc2PendientesManuales_(hallazgos) {
  var out = [];
  for (var i = 0; i < hallazgos.length; i++) {
    if (hallazgos[i].reparable) continue;
    out.push({
      codigo: hallazgos[i].codigo,
      severidad: hallazgos[i].severidad,
      titulo: hallazgos[i].titulo,
      queHacer: hallazgos[i].detalle,
      total: (hallazgos[i].datos && hallazgos[i].datos.total) || 0
    });
  }
  return out;
}
