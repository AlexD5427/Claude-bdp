/**
 * 16_Attempts.gs — el intento del candidato, de principio a fin.
 *
 * ── El reloj es del servidor ─────────────────────────────────────────────────
 * `startAttempt` calcula `limite_en` con la hora del SERVIDOR y la guarda. A
 * partir de ahí, el navegador solo cuenta hacia atrás para mostrar el reloj: cada
 * `heartbeat` y cada guardado devuelven los segundos restantes recalculados en el
 * servidor. Cambiar la hora del equipo, pausar el JavaScript o recargar la página
 * no regala ni un segundo.
 *
 * ── Los estados de un intento ────────────────────────────────────────────────
 *   en_curso   se puede guardar y enviar.
 *   enviado    inmutable; solo el revisor puede añadir puntos manuales.
 *   expirado   se pasó del límite y se cerró con lo que había. Se califica igual.
 *   abandonado el mantenimiento lo marca así si nunca se envió y quedó viejo.
 *   anulado    el revisor lo invalida a mano; no cuenta en los agregados.
 *
 * ── Resistencia a la pérdida de conexión ─────────────────────────────────────
 * El runner guarda progreso periódicamente. `saveProgress` es idempotente por
 * pregunta (el identificador de cada respuesta es determinista), así que reenviar
 * el mismo lote no duplica filas ni pierde nada. Si el candidato cierra el
 * navegador, lo guardado sigue ahí y el intento se puede retomar con su token.
 */

/* --------------------------------- Utilidades ----------------------------- */

/** Identificador determinista de una respuesta. */
function evAnswerId_(attemptId, questionId) {
  return 'rs_' + evFingerprint_(attemptId + '|' + questionId).slice(0, 24);
}

/** Segundos restantes del intento según el reloj del servidor. */
function evRemainingSeconds_(attemptRow) {
  var limite = evToMs_(attemptRow.limite_en);
  if (limite === null) return null;
  return Math.max(0, Math.round((limite - evNowMs_()) / 1000));
}

/**
 * ¿El intento pasó de su límite?
 *
 * Sin ninguna tolerancia: en el instante en que el reloj del servidor supera
 * `limite_en`, el intento está vencido. Un margen aquí sería una prórroga
 * silenciosa, y el candidato que respetó el tiempo tiene derecho a que nadie
 * conteste después.
 */
function evPastDeadline_(attemptRow) {
  var limite = evToMs_(attemptRow.limite_en);
  if (limite === null) return false;
  return evNowMs_() > limite;
}

/**
 * ¿Lleva tanto tiempo vencido que el barrido automático puede cerrarlo?
 *
 * El margen existe para no cerrar un intento cuyo envío está en vuelo, no para
 * dar tiempo extra.
 */
function evSweepable_(attemptRow) {
  var limite = evToMs_(attemptRow.limite_en);
  if (limite === null) return false;
  return evNowMs_() > limite + EV_LIMITS.SWEEP_GRACE_SECONDS * 1000;
}

/** Carga el intento y verifica su token. */
function evLoadAttempt_(payload) {
  var attemptId = evText_((payload || {}).intentoId, 140);
  if (!attemptId) {
    throw evError_(EV_CODE.BAD_REQUEST, 'Falta el identificador del intento.', {
      hint: 'Vuelve a abrir el enlace de la evaluación.', details: { campo: 'intentoId' }
    });
  }
  var row = evById_(EV_SHEET.INTENTOS, attemptId);
  if (!row) {
    throw evError_(EV_CODE.NOT_FOUND, 'Este intento no existe.', {
      hint: 'Vuelve a abrir el enlace de la evaluación para empezar de nuevo.',
      details: { intentoId: attemptId }
    });
  }
  evRequireAttemptToken_(row, (payload || {}).token);
  return row;
}

/** Datos del participante, saneados y validados contra los campos configurados. */
function evParticipantData_(raw, campos) {
  var source = raw && typeof raw === 'object' ? raw : {};
  var faltantes = [];
  var out = { nombre: '', documento: '', correo: '', extra: {} };

  for (var i = 0; i < campos.length; i++) {
    var campo = campos[i];
    if (campo.activo === false) continue;
    var valor = evText_(source[campo.clave], campo.clave === 'observaciones' ? 2000 : 200);
    if (campo.obligatorio && !valor) {
      faltantes.push(evIssue_('CAMPO_OBLIGATORIO',
        'Falta «' + campo.etiqueta + '».', 'participante.' + campo.clave));
      continue;
    }
    if (campo.clave === 'nombre') out.nombre = valor;
    else if (campo.clave === 'documento') out.documento = valor;
    else if (campo.clave === 'correo') {
      if (valor && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor)) {
        faltantes.push(evIssue_('CORREO_INVALIDO',
          'El correo electrónico no tiene un formato válido.', 'participante.correo'));
        continue;
      }
      out.correo = valor;
    } else if (valor) {
      out.extra[campo.clave] = valor;
    }
  }
  if (faltantes.length > 0) {
    evThrowIssues_('Faltan datos para identificar al participante.', faltantes);
  }
  return out;
}

/* ------------------------------- startAttempt ------------------------------ */

/**
 * Crea el intento y devuelve la prueba completa.
 *
 * Es la única acción pública que entrega preguntas, y solo lo hace después de
 * registrar el intento: no hay forma de leer una prueba sin dejar rastro de que
 * se abrió.
 */
function evStartAttempt_(context, payload) {
  evRequireInstalled_();
  var p = payload || {};
  var codigo = evText_(p.codigo, EV_LIMITS.CODE);
  evRateLimit_('start_' + evNormalizeCode_(codigo), EV_LIMITS.START_RATE_PER_MINUTE);

  var resolved = evRequireAvailable_(codigo);
  var row = resolved.row;
  var api = resolved.evaluacion;
  var now = context.now;

  var versionRow = evById_(EV_SHEET.VERSIONES, resolved.versionId);
  if (!versionRow) {
    throw evError_(EV_CODE.NOT_FOUND, 'La versión publicada de esta evaluación no está disponible.', {
      hint: 'Avisa a quien te envió el enlace: la evaluación necesita volver a publicarse.',
      details: { motivo: 'version_inexistente' }
    });
  }
  var snapshot = evReadSnapshot_(versionRow);

  if (api.participante.requiereConsentimiento && p.consentimiento !== true) {
    throw evError_(EV_CODE.VALIDATION_ERROR,
      'Hay que aceptar el consentimiento informado antes de empezar.',
      { hint: 'Marca la casilla de consentimiento.', details: { campo: 'consentimiento' } });
  }

  var participante = evParticipantData_(p.participante, api.participante.campos);

  /* --- Reanudar en lugar de duplicar --- */
  var previos = evWhere_(EV_SHEET.INTENTOS, 'evaluacion_id', row.id);
  var mismos = [];
  for (var i = 0; i < previos.length; i++) {
    if (!participante.documento) break;
    if (evComparableText_(previos[i].participante_documento, true, true)
      === evComparableText_(participante.documento, true, true)) {
      mismos.push(previos[i]);
    }
  }
  for (var m = 0; m < mismos.length; m++) {
    if (mismos[m].estado !== 'en_curso') continue;
    if (evPastDeadline_(mismos[m])) continue;
    // Ya tenía un intento en curso: se le devuelve el mismo, con su token y su
    // tiempo restante real. Recargar la página no reinicia el reloj ni pierde lo
    // respondido, que es exactamente lo que un candidato espera.
    var retomado = mismos[m];
    var respuestas = evWhere_(EV_SHEET.RESPUESTAS, 'intento_id', retomado.id);
    var previas = [];
    for (var r = 0; r < respuestas.length; r++) {
      var answer = evAnswerFromRow_(respuestas[r]);
      previas.push({
        preguntaId: answer.preguntaId, opciones: answer.opciones, valor: answer.valor
      });
    }
    evAudit_(context, 'startAttempt', 'intento', retomado.id, 'ok',
      { retomado: true, evaluacion: row.id });
    return {
      data: {
        intentoId: retomado.id,
        token: evAttemptToken_(retomado),
        retomado: true,
        horaServidor: now,
        iniciadoEn: retomado.iniciado_en,
        limiteEn: retomado.limite_en,
        segundosRestantes: evRemainingSeconds_(retomado),
        respuestasPrevias: previas,
        prueba: evPublicPayload_(snapshot, retomado.id)
      },
      referencia: retomado.id,
      resumen: { intentoId: retomado.id, retomado: true }
    };
  }

  var enviados = 0;
  for (var e = 0; e < mismos.length; e++) {
    if (mismos[e].estado === 'enviado' || mismos[e].estado === 'expirado') enviados++;
  }
  var maximos = evClampInt_(api.aplicacion.intentosMaximos, 1, 20, 1);
  if (participante.documento && enviados >= maximos) {
    throw evError_(EV_CODE.FORBIDDEN,
      maximos === 1
        ? 'Ya realizaste esta evaluación y solo se permite un intento.'
        : 'Ya agotaste los ' + maximos + ' intentos permitidos para esta evaluación.',
      {
        hint: 'Si necesitas otra oportunidad, contacta con la persona que te envió el enlace.',
        details: { intentosRealizados: enviados, intentosMaximos: maximos }
      });
  }

  var attemptId = evNewId_(EV_ID.INTENTO);
  var duracion = evNumOrNull_(api.aplicacion.duracionMinutos);
  var limiteEn = '';
  if (duracion !== null) {
    var segundos = duracion * 60 + evInt_(api.aplicacion.segundosExtra, 0);
    limiteEn = evShiftIso_(now, segundos);
    // Si la ventana de aplicación cierra antes que el temporizador, manda la
    // ventana: nadie puede seguir contestando después del plazo.
    var ventana = evToMs_(row.ventana_fin);
    if (ventana !== null && evToMs_(limiteEn) > ventana) limiteEn = evFromMs_(ventana);
  }

  var attempt = {
    id: attemptId,
    evaluacion_id: row.id,
    version_id: versionRow.id,
    version_etiqueta: versionRow.etiqueta,
    solicitud_inicio: context.requestId,
    participante_nombre: participante.nombre,
    participante_documento: participante.documento,
    participante_correo: participante.correo,
    participante_json: evWriteJson_(participante.extra),
    estado: 'en_curso',
    iniciado_en: now,
    limite_en: limiteEn,
    ultimo_guardado_en: '',
    enviado_en: '',
    envio_automatico: false,
    segundos_usados: 0,
    puntos_obtenidos: null,
    puntos_posibles: evNum_(versionRow.puntos_totales, 0),
    nota: null,
    nota_automatica: null,
    correctas: 0,
    incorrectas: 0,
    sin_responder: evInt_(versionRow.preguntas, 0),
    calificables: evInt_(versionRow.preguntas_calificables, 0),
    pendientes_revision: 0,
    estado_calificacion: 'automatica',
    aprobado: null,
    calificado_en: '',
    calificado_por: '',
    riesgo_integridad: 0,
    eventos_integridad: 0,
    resumen_integridad_json: '',
    agente_usuario: evText_(p.agenteUsuario, 300),
    zona_horaria: evText_(p.zonaHoraria, 80),
    proceso_id: evText_(p.procesoId, 140),
    notas_revision: ''
  };
  evPut_(EV_SHEET.INTENTOS, attempt);

  evAudit_(context, 'startAttempt', 'intento', attemptId, 'ok', {
    evaluacion: row.id, version: versionRow.etiqueta, limiteEn: limiteEn
  });

  return {
    data: {
      intentoId: attemptId,
      token: evAttemptToken_(attempt),
      retomado: false,
      horaServidor: now,
      iniciadoEn: now,
      limiteEn: limiteEn,
      segundosRestantes: evRemainingSeconds_(attempt),
      respuestasPrevias: [],
      prueba: evPublicPayload_(snapshot, attemptId)
    },
    referencia: attemptId,
    resumen: { intentoId: attemptId, evaluacion: row.id }
  };
}

/* -------------------------------- heartbeat ------------------------------- */

/**
 * Latido: sincroniza el reloj y detecta la expiración.
 *
 * Es una acción de LECTURA (no toma bloqueo ni consume `requestId`) para que
 * llamarla cada quince segundos no cueste nada. Si el intento ya expiró, lo dice;
 * el cierre real lo hace `submitAttempt`, que es quien puede calificar.
 */
function evHeartbeat_(payload) {
  evRequireInstalled_();
  var row = evLoadAttempt_(payload);
  var restantes = evRemainingSeconds_(row);
  return {
    intentoId: row.id,
    estado: row.estado,
    horaServidor: evNow_(),
    limiteEn: row.limite_en,
    segundosRestantes: restantes,
    expirado: row.estado === 'en_curso' && restantes !== null && restantes <= 0,
    ultimoGuardadoEn: row.ultimo_guardado_en
  };
}

/* ------------------------------- saveProgress ----------------------------- */

/**
 * Guarda el progreso sin calificar.
 *
 * No se puntúa aquí a propósito: calificar en cada autoguardado multiplicaría el
 * trabajo y, sobre todo, dejaría notas parciales en el libro que un revisor
 * podría leer como definitivas.
 */
function evSaveProgress_(context, payload) {
  evRequireInstalled_();
  var p = payload || {};
  var attemptRow = evLoadAttempt_(p);
  var now = context.now;

  if (attemptRow.estado !== 'en_curso') {
    throw evError_(EV_CODE.CONFLICT,
      attemptRow.estado === 'enviado'
        ? 'Este intento ya fue enviado y no admite más cambios.'
        : 'Este intento está ' + attemptRow.estado + ' y no admite más cambios.',
      { hint: 'Si crees que es un error, contacta con quien te envió el enlace.',
        details: { estado: attemptRow.estado } });
  }

  var evaluationRow = evById_(EV_SHEET.EVALUACIONES, attemptRow.evaluacion_id);
  var policy = evIntegrityPolicy_(evaluationRow ? evaluationRow.integridad_json : null);
  var versionRow = evById_(EV_SHEET.VERSIONES, attemptRow.version_id);
  if (!versionRow) {
    throw evError_(EV_CODE.NOT_FOUND, 'No se encontró la versión de este intento.', {
      hint: 'Envía la prueba: las respuestas guardadas se conservan.',
      details: { versionId: attemptRow.version_id }
    });
  }
  var snapshot = evReadSnapshot_(versionRow);
  var indice = evSnapshotIndex_(snapshot);

  var raw = Array.isArray(p.respuestas) ? p.respuestas : [];
  if (raw.length > EV_LIMITS.ANSWERS_PER_ATTEMPT) {
    throw evError_(EV_CODE.VALIDATION_ERROR, 'El intento envía demasiadas respuestas.', {
      hint: 'El máximo es ' + EV_LIMITS.ANSWERS_PER_ATTEMPT + '.',
      details: { recibidas: raw.length, maximo: EV_LIMITS.ANSWERS_PER_ATTEMPT }
    });
  }

  var rows = [];
  var guardadas = 0;
  for (var i = 0; i < raw.length; i++) {
    var answer = evStripClientScoring_(raw[i]);
    var question = indice.preguntas[answer.preguntaId];
    if (!question) continue; // Se ignora en silencio: el envío final sí valida.
    var own = question.opciones || [];
    rows.push({
      id: evAnswerId_(attemptRow.id, question.id),
      intento_id: attemptRow.id,
      evaluacion_id: attemptRow.evaluacion_id,
      pregunta_id: question.id,
      tipo: question.tipo,
      orden: indice.orden[question.id] || 0,
      opciones_json: evWriteJson_(answer.opciones),
      valor_json: evWrapValue_(answer.valor),
      valor_texto: evAnswerToText_(question, own, answer),
      // Sin calificar todavía: el envío es quien puntúa.
      correcta: null,
      puntos_obtenidos: null,
      puntos_posibles: question.modoPuntaje === 'ninguno' ? 0 : evNum_(question.puntos, 0),
      requiere_revision: false,
      comentario_revisor: '',
      segundos_en_pregunta: answer.segundos,
      visitas: answer.visitas,
      cambios: answer.cambios,
      respondida_en: now
    });
    guardadas++;
  }
  if (rows.length > 0) evPutAll_(EV_SHEET.RESPUESTAS, rows);

  var resumen = evRecordEvents_(attemptRow, p.eventos, policy, now);
  attemptRow.ultimo_guardado_en = now;
  attemptRow.segundos_usados = evAttemptElapsedSeconds_(attemptRow, now);
  attemptRow.riesgo_integridad = resumen.riesgo;
  attemptRow.eventos_integridad = resumen.total;
  attemptRow.resumen_integridad_json = evWriteJson_(resumen);
  evPut_(EV_SHEET.INTENTOS, attemptRow);

  var restantes = evRemainingSeconds_(attemptRow);
  return {
    data: {
      guardadoEn: now,
      respuestasGuardadas: guardadas,
      horaServidor: now,
      segundosRestantes: restantes,
      expirado: restantes !== null && restantes <= 0
    },
    referencia: attemptRow.id,
    resumen: { intentoId: attemptRow.id, respuestas: guardadas }
  };
}

/** Segundos transcurridos desde el inicio, acotados al límite si existe. */
function evAttemptElapsedSeconds_(attemptRow, now) {
  var inicio = evToMs_(attemptRow.iniciado_en);
  if (inicio === null) return evInt_(attemptRow.segundos_usados, 0);
  var hasta = evToMs_(now) || evNowMs_();
  var limite = evToMs_(attemptRow.limite_en);
  if (limite !== null && hasta > limite) hasta = limite;
  return Math.max(0, Math.round((hasta - inicio) / 1000));
}

/* ------------------------------ submitAttempt ----------------------------- */

/**
 * Cierra y califica el intento.
 *
 * Acepta el envío incluso pasado el límite (con la tolerancia de gracia) porque
 * la alternativa —rechazarlo— tira a la basura el trabajo del candidato por un
 * problema de red. Lo que hace es MARCARLO: el intento queda `expirado`, se anota
 * el retraso y el revisor lo ve.
 */
function evSubmitAttempt_(context, payload) {
  evRequireInstalled_();
  var p = payload || {};
  var attemptRow = evLoadAttempt_(p);
  var now = context.now;

  if (attemptRow.estado === 'enviado') {
    // Reenvío tras una desconexión: no se recalcula ni se sobrescribe nada.
    var evaluationPrev = evById_(EV_SHEET.EVALUACIONES, attemptRow.evaluacion_id);
    return {
      data: evAttemptPublicResult_(attemptRow, evaluationPrev, true),
      referencia: attemptRow.id,
      resumen: { intentoId: attemptRow.id, repetido: true }
    };
  }
  if (attemptRow.estado === 'anulado') {
    throw evError_(EV_CODE.CONFLICT, 'Este intento fue anulado por el equipo evaluador.', {
      hint: 'Contacta con quien te envió el enlace.', details: { estado: attemptRow.estado }
    });
  }

  var evaluationRow = evById_(EV_SHEET.EVALUACIONES, attemptRow.evaluacion_id);
  if (!evaluationRow) {
    throw evError_(EV_CODE.NOT_FOUND, 'La evaluación de este intento ya no existe.', {
      hint: 'Avisa al equipo evaluador: el intento no se puede calificar.',
      details: { evaluacionId: attemptRow.evaluacion_id }
    });
  }
  var evaluation = evEvaluationFromRow_(evaluationRow);
  var versionRow = evById_(EV_SHEET.VERSIONES, attemptRow.version_id);
  if (!versionRow) {
    throw evError_(EV_CODE.NOT_FOUND, 'No se encontró la versión con la que se inició este intento.', {
      hint: 'El equipo evaluador debe volver a publicar la evaluación; las respuestas guardadas se conservan.',
      details: { versionId: attemptRow.version_id }
    });
  }
  var snapshot = evReadSnapshot_(versionRow);

  /* --- Se combinan las respuestas guardadas con las que llegan ahora --- */
  var previas = evWhere_(EV_SHEET.RESPUESTAS, 'intento_id', attemptRow.id);
  var combinadas = {};
  for (var i = 0; i < previas.length; i++) {
    var previa = evAnswerFromRow_(previas[i]);
    combinadas[previa.preguntaId] = {
      preguntaId: previa.preguntaId,
      opciones: previa.opciones,
      valor: previa.valor,
      segundos: previa.segundosEnPregunta,
      visitas: previa.visitas,
      cambios: previa.cambios
    };
  }
  var entrantes = Array.isArray(p.respuestas) ? p.respuestas : [];
  if (entrantes.length > EV_LIMITS.ANSWERS_PER_ATTEMPT) {
    throw evError_(EV_CODE.VALIDATION_ERROR, 'El intento envía demasiadas respuestas.', {
      hint: 'El máximo es ' + EV_LIMITS.ANSWERS_PER_ATTEMPT + '.',
      details: { recibidas: entrantes.length }
    });
  }
  for (var e = 0; e < entrantes.length; e++) {
    var limpia = evStripClientScoring_(entrantes[e]);
    if (!limpia.preguntaId) continue;
    combinadas[limpia.preguntaId] = limpia;
  }
  var lista = [];
  for (var key in combinadas) {
    if (Object.prototype.hasOwnProperty.call(combinadas, key)) lista.push(combinadas[key]);
  }

  var resultado = evScoreAttempt_(snapshot, lista, evaluation.aplicacion);

  // Se acepta SIEMPRE, incluso pasado el límite: rechazar el envío tiraría a la
  // basura el trabajo del candidato por un problema de red. Lo que se hace es
  // marcarlo, y el revisor lo ve en la cola y en el informe.
  var expirado = evPastDeadline_(attemptRow);
  var automatico = p.automatico === true || expirado;
  var indice = evSnapshotIndex_(snapshot);

  var answerRows = [];
  for (var d = 0; d < resultado.detalle.length; d++) {
    var item = resultado.detalle[d];
    answerRows.push({
      id: evAnswerId_(attemptRow.id, item.preguntaId),
      intento_id: attemptRow.id,
      evaluacion_id: attemptRow.evaluacion_id,
      pregunta_id: item.preguntaId,
      tipo: item.tipo,
      orden: item.orden,
      opciones_json: evWriteJson_(item.opciones),
      valor_json: evWrapValue_(item.valor),
      valor_texto: item.valorTexto,
      correcta: item.correcta,
      puntos_obtenidos: item.puntosObtenidos,
      puntos_posibles: item.puntosPosibles,
      requiere_revision: item.requiereRevision,
      comentario_revisor: '',
      segundos_en_pregunta: item.segundos,
      visitas: item.visitas,
      cambios: item.cambios,
      respondida_en: now
    });
  }
  if (answerRows.length > 0) evPutAll_(EV_SHEET.RESPUESTAS, answerRows);

  var policy = evaluation.integridad;
  var eventos = Array.isArray(p.eventos) ? p.eventos.slice() : [];
  eventos.push({
    tipo: automatico ? 'envio_automatico' : 'envio_manual',
    secuencia: evMaxEventSequence_(attemptRow.id) + 1 + eventos.length,
    ocurridoEn: now,
    detalle: { origen: automatico ? (expirado ? 'expiracion' : 'temporizador') : 'boton' }
  });
  var resumen = evRecordEvents_(attemptRow, eventos, policy, now);

  attemptRow.estado = expirado ? 'expirado' : 'enviado';
  attemptRow.enviado_en = now;
  attemptRow.envio_automatico = automatico;
  attemptRow.ultimo_guardado_en = now;
  attemptRow.segundos_usados = evAttemptElapsedSeconds_(attemptRow, now);
  attemptRow.puntos_obtenidos = resultado.puntosObtenidos;
  attemptRow.puntos_posibles = resultado.puntosPosibles;
  attemptRow.nota = resultado.nota;
  attemptRow.nota_automatica = resultado.notaAutomatica;
  attemptRow.correctas = resultado.correctas;
  attemptRow.incorrectas = resultado.incorrectas;
  attemptRow.sin_responder = resultado.sinResponder;
  attemptRow.calificables = resultado.calificables;
  attemptRow.pendientes_revision = resultado.pendientesRevision;
  attemptRow.estado_calificacion = resultado.estadoCalificacion;
  attemptRow.aprobado = resultado.aprobado;
  attemptRow.calificado_en = resultado.estadoCalificacion === 'automatica' ? now : '';
  attemptRow.calificado_por = resultado.estadoCalificacion === 'automatica' ? 'sistema' : '';
  attemptRow.riesgo_integridad = resumen.riesgo;
  attemptRow.eventos_integridad = resumen.total;
  attemptRow.resumen_integridad_json = evWriteJson_(resumen);
  evPut_(EV_SHEET.INTENTOS, attemptRow);

  evAudit_(context, 'submitAttempt', 'intento', attemptRow.id, 'ok', {
    evaluacion: attemptRow.evaluacion_id,
    estado: attemptRow.estado,
    automatico: automatico,
    respuestas: answerRows.length,
    totalPreguntas: resultado.totalPreguntas,
    calificacion: resultado.estadoCalificacion,
    riesgo: resumen.riesgo
  });
  // El índice del snapshot se usa arriba y aquí solo para el registro; se anota
  // porque un desajuste entre preguntas del snapshot y respuestas recibidas es la
  // pista más útil cuando algo no cuadra en una revisión.
  evDebug_('Intento calificado.', {
    intento: attemptRow.id,
    preguntasEnVersion: Object.keys(indice.preguntas).length,
    respuestasCalificadas: answerRows.length
  });

  return {
    data: evAttemptPublicResult_(attemptRow, evaluationRow, false),
    referencia: attemptRow.id,
    resumen: { intentoId: attemptRow.id, estado: attemptRow.estado, nota: attemptRow.nota }
  };
}

/**
 * Resultado que ve el CANDIDATO al enviar.
 *
 * Respeta `visibilidadResultado`. Nunca incluye el detalle por pregunta ni las
 * respuestas correctas: quien quiera enseñar eso, lo hace fuera de la prueba.
 */
function evAttemptPublicResult_(attemptRow, evaluationRow, repetido) {
  var visibilidad = 'solo_envio';
  var titulo = '';
  if (evaluationRow) {
    var api = evEvaluationFromRow_(evaluationRow);
    visibilidad = api.participante.visibilidadResultado;
    titulo = api.titulo;
  }
  var base = {
    intentoId: attemptRow.id,
    evaluacion: titulo,
    estado: attemptRow.estado,
    enviadoEn: attemptRow.enviado_en,
    envioAutomatico: evBool_(attemptRow.envio_automatico, false),
    repetido: repetido === true,
    respuestasRegistradas: evInt_(attemptRow.correctas, 0) + evInt_(attemptRow.incorrectas, 0),
    calificacionPendiente: attemptRow.estado_calificacion === 'pendiente_revision',
    segundosUsados: evInt_(attemptRow.segundos_usados, 0)
  };
  if (visibilidad === 'nada' || visibilidad === 'solo_envio') return base;

  base.nota = evNumOrNull_(attemptRow.nota);
  base.aprobado = evBoolOrNull_(attemptRow.aprobado);
  if (visibilidad === 'nota_y_detalle') {
    base.puntosObtenidos = evNumOrNull_(attemptRow.puntos_obtenidos);
    base.puntosPosibles = evNumOrNull_(attemptRow.puntos_posibles);
    base.correctas = evInt_(attemptRow.correctas, 0);
    base.incorrectas = evInt_(attemptRow.incorrectas, 0);
    base.sinResponder = evInt_(attemptRow.sin_responder, 0);
  }
  return base;
}
