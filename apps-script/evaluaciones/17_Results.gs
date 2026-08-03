/**
 * 17_Results.gs — resultados para el equipo evaluador.
 *
 * Lo que el módulo anterior no tenía: poder VER lo que los candidatos enviaron.
 * Aquí están las cuatro vistas que hacen falta y nada más:
 *
 *   listAttempts   la cola: quién empezó, quién terminó, con qué nota y con qué
 *                  riesgo de integridad, más los agregados de la evaluación.
 *   getAttempt     un intento completo: la pregunta tal como se le presentó, su
 *                  respuesta, la respuesta correcta, los puntos y el rastro de
 *                  eventos con su cronología.
 *   gradeAnswer    calificación manual de las preguntas abiertas, con recálculo
 *                  automático de la nota y del aprobado.
 *   exportAttempt  la misma información en un paquete plano, pensado para generar
 *                  el PDF en el navegador sin volver a pedir nada.
 *
 * Todo lo de aquí es administrativo: exige llave y NUNCA se sirve al candidato.
 */

/* ------------------------------- Cola de intentos ------------------------- */

function evListAttempts_(payload) {
  evRequireInstalled_();
  var p = payload || {};
  var evaluacionId = evText_(p.evaluacionId, 140);
  if (!evaluacionId) {
    throw evError_(EV_CODE.BAD_REQUEST, 'Falta el identificador de la evaluación.', {
      hint: 'La acción "listAttempts" necesita `payload.evaluacionId`.',
      details: { campo: 'evaluacionId' }
    });
  }
  var evaluationRow = evById_(EV_SHEET.EVALUACIONES, evaluacionId);
  if (!evaluationRow) {
    throw evError_(EV_CODE.NOT_FOUND, 'La evaluación solicitada no existe.', {
      details: { id: evaluacionId }
    });
  }
  var evaluation = evEvaluationFromRow_(evaluationRow);
  var estados = evTextArray_(p.estados, 8, 20);
  var buscar = evText_(p.buscar, 200).toLowerCase().trim();
  var soloRiesgo = p.soloRiesgo === true;

  var rows = evWhere_(EV_SHEET.INTENTOS, 'evaluacion_id', evaluacionId);
  var items = [];
  for (var i = 0; i < rows.length; i++) {
    var attempt = evAttemptFromRow_(rows[i]);
    if (estados.length > 0 && estados.indexOf(attempt.estado) < 0) continue;
    if (soloRiesgo && attempt.riesgoIntegridad < 25) continue;
    if (buscar) {
      var heno = (attempt.participante.nombre + ' ' + attempt.participante.documento + ' ' +
        attempt.participante.correo).toLowerCase();
      if (heno.indexOf(buscar) < 0) continue;
    }
    // El tiempo restante solo tiene sentido mientras el intento sigue vivo.
    attempt.segundosRestantes = attempt.estado === 'en_curso'
      ? evRemainingSeconds_(rows[i]) : null;
    items.push(attempt);
  }
  items.sort(function (a, b) {
    var left = a.enviadoEn || a.iniciadoEn;
    var right = b.enviadoEn || b.iniciadoEn;
    return String(right).localeCompare(String(left));
  });

  return {
    evaluacion: {
      id: evaluation.id,
      codigo: evaluation.codigo,
      titulo: evaluation.titulo,
      estado: evaluation.estado,
      versionEtiqueta: evaluation.versionEtiqueta,
      puntosTotales: evaluation.puntosTotales,
      puntajeAprobacion: evaluation.aplicacion.puntajeAprobacion,
      criterioAprobacion: evaluation.aplicacion.criterioAprobacion,
      duracionMinutos: evaluation.aplicacion.duracionMinutos
    },
    intentos: items,
    resumen: evAttemptsSummary_(items),
    sincronizadoEn: evNow_()
  };
}

/**
 * Agregados de la cola.
 *
 * Los promedios se calculan SOLO sobre intentos con nota firme. Incluir los
 * pendientes de revisión como ceros daría un promedio falso que además baja
 * conforme se van revisando, y eso destruye la confianza en el número.
 */
function evAttemptsSummary_(items) {
  var enCurso = 0;
  var enviados = 0;
  var expirados = 0;
  var anulados = 0;
  var pendientes = 0;
  var conNota = [];
  var aprobados = 0;
  var conVeredicto = 0;
  var riesgoAlto = 0;
  var segundos = [];

  for (var i = 0; i < items.length; i++) {
    var a = items[i];
    if (a.estado === 'en_curso') enCurso++;
    else if (a.estado === 'enviado') enviados++;
    else if (a.estado === 'expirado') expirados++;
    else if (a.estado === 'anulado') anulados++;
    if (a.estadoCalificacion === 'pendiente_revision') pendientes++;
    if (a.estado === 'anulado') continue;
    if (typeof a.nota === 'number') conNota.push(a.nota);
    if (a.aprobado !== null) {
      conVeredicto++;
      if (a.aprobado === true) aprobados++;
    }
    if ((a.resumenIntegridad || {}).nivel === 'alto') riesgoAlto++;
    if (a.segundosUsados > 0) segundos.push(a.segundosUsados);
  }

  var suma = 0;
  for (var n = 0; n < conNota.length; n++) suma += conNota[n];
  var ordenadas = conNota.slice().sort(function (x, y) { return x - y; });
  var mediana = ordenadas.length === 0 ? null
    : (ordenadas.length % 2 === 1
      ? ordenadas[(ordenadas.length - 1) / 2]
      : evRound_((ordenadas[ordenadas.length / 2 - 1] + ordenadas[ordenadas.length / 2]) / 2, 2));
  var sumaSegundos = 0;
  for (var s = 0; s < segundos.length; s++) sumaSegundos += segundos[s];

  return {
    total: items.length,
    enCurso: enCurso,
    enviados: enviados,
    expirados: expirados,
    anulados: anulados,
    pendientesRevision: pendientes,
    conNota: conNota.length,
    notaPromedio: conNota.length > 0 ? evRound_(suma / conNota.length, 2) : null,
    notaMediana: mediana,
    notaMinima: ordenadas.length > 0 ? ordenadas[0] : null,
    notaMaxima: ordenadas.length > 0 ? ordenadas[ordenadas.length - 1] : null,
    tasaAprobacion: conVeredicto > 0 ? evRound_((aprobados / conVeredicto) * 100, 2) : null,
    aprobados: aprobados,
    conVeredicto: conVeredicto,
    riesgoAlto: riesgoAlto,
    duracionPromedioSegundos: segundos.length > 0 ? Math.round(sumaSegundos / segundos.length) : null
  };
}

/* ----------------------------- Detalle del intento ------------------------ */

/**
 * Un intento con todo su contexto.
 *
 * La clave está en que las preguntas se leen del SNAPSHOT de la versión que el
 * candidato respondió, no del borrador actual. Si alguien editó la pregunta
 * después, el revisor sigue viendo lo que el candidato leyó de verdad: sin eso, la
 * revisión de una respuesta abierta es adivinar.
 */
function evGetAttempt_(payload) {
  evRequireInstalled_();
  var attemptId = evText_((payload || {}).intentoId, 140);
  if (!attemptId) {
    throw evError_(EV_CODE.BAD_REQUEST, 'Falta el identificador del intento.', {
      hint: 'La acción "getAttempt" necesita `payload.intentoId`.',
      details: { campo: 'intentoId' }
    });
  }
  var attemptRow = evById_(EV_SHEET.INTENTOS, attemptId);
  if (!attemptRow) {
    throw evError_(EV_CODE.NOT_FOUND, 'El intento solicitado no existe.', { details: { id: attemptId } });
  }
  var attempt = evAttemptFromRow_(attemptRow);
  attempt.segundosRestantes = attempt.estado === 'en_curso' ? evRemainingSeconds_(attemptRow) : null;

  var evaluationRow = evById_(EV_SHEET.EVALUACIONES, attemptRow.evaluacion_id);
  var evaluation = evaluationRow ? evEvaluationFromRow_(evaluationRow) : null;

  var indice = { preguntas: {}, orden: {}, secciones: [] };
  var versionRow = evById_(EV_SHEET.VERSIONES, attemptRow.version_id);
  var advertencias = [];
  if (versionRow) {
    try {
      indice = evSnapshotIndex_(evReadSnapshot_(versionRow));
    } catch (error) {
      advertencias.push('SNAPSHOT_ILEGIBLE');
      evWarn_('No se pudo leer el snapshot del intento; se muestran las respuestas sin su enunciado.', {
        intento: attemptId, versionId: attemptRow.version_id
      });
    }
  } else {
    advertencias.push('VERSION_INEXISTENTE');
  }

  var answerRows = evWhere_(EV_SHEET.RESPUESTAS, 'intento_id', attemptId);
  answerRows.sort(evByOrder_);
  var respuestas = [];
  for (var i = 0; i < answerRows.length; i++) {
    var answer = evAnswerFromRow_(answerRows[i]);
    var question = indice.preguntas[answer.preguntaId] || null;
    respuestas.push(evAnswerDetail_(answer, question));
  }

  // Las preguntas de la versión que el candidato no respondió también aparecen:
  // «no contestó» es información, y omitirlas haría que el informe pareciera
  // completo cuando no lo está.
  var respondidas = {};
  for (var r = 0; r < respuestas.length; r++) respondidas[respuestas[r].preguntaId] = true;
  for (var pid in indice.preguntas) {
    if (!Object.prototype.hasOwnProperty.call(indice.preguntas, pid)) continue;
    var pending = indice.preguntas[pid];
    if (!evIsQuestion_(pending.tipo) || respondidas[pid]) continue;
    respuestas.push(evAnswerDetail_({
      id: '', preguntaId: pid, tipo: pending.tipo, orden: indice.orden[pid] || 0,
      opciones: [], valor: null, valorTexto: '', correcta: null,
      puntosObtenidos: null, puntosPosibles: pending.modoPuntaje === 'ninguno' ? 0 : evNum_(pending.puntos, 0),
      requiereRevision: false, comentarioRevisor: '', segundosEnPregunta: 0,
      visitas: 0, cambios: 0, respondidaEn: ''
    }, pending));
  }
  respuestas.sort(function (a, b) { return a.orden - b.orden; });

  var eventos = evAttemptEvents_(attemptId);
  return {
    intento: attempt,
    evaluacion: evaluation ? {
      id: evaluation.id, codigo: evaluation.codigo, titulo: evaluation.titulo,
      puntosTotales: evaluation.puntosTotales,
      puntajeAprobacion: evaluation.aplicacion.puntajeAprobacion,
      criterioAprobacion: evaluation.aplicacion.criterioAprobacion,
      duracionMinutos: evaluation.aplicacion.duracionMinutos,
      integridad: evaluation.integridad
    } : null,
    respuestas: respuestas,
    eventos: eventos,
    cronologia: evTimeline_(attemptRow, eventos),
    advertencias: advertencias
  };
}

/**
 * Detalle de una respuesta con su pregunta y su clave.
 *
 * Aquí SÍ viaja la respuesta correcta: es una vista administrativa y el revisor
 * necesita compararla. Nunca pasa por la superficie pública.
 */
function evAnswerDetail_(answer, question) {
  var detalle = {
    preguntaId: answer.preguntaId,
    tipo: answer.tipo || (question ? question.tipo : ''),
    orden: answer.orden,
    respondida: !!answer.respondidaEn,
    respondidaEn: answer.respondidaEn,
    opcionesElegidas: answer.opciones,
    valor: answer.valor,
    valorTexto: answer.valorTexto,
    correcta: answer.correcta,
    puntosObtenidos: answer.puntosObtenidos,
    puntosPosibles: answer.puntosPosibles,
    requiereRevision: answer.requiereRevision,
    comentarioRevisor: answer.comentarioRevisor,
    segundosEnPregunta: answer.segundosEnPregunta,
    visitas: answer.visitas,
    cambios: answer.cambios,
    enunciado: question ? question.enunciado : evRichEmpty_(),
    enunciadoTexto: question ? evRichToPlain_(question.enunciado) : '',
    ayudaTexto: question ? evRichToPlain_(question.ayuda) : '',
    obligatoria: question ? question.obligatoria === true : false,
    modoPuntaje: question ? question.modoPuntaje : 'ninguno',
    competencia: question ? question.competencia : '',
    opciones: [],
    claveTexto: ''
  };
  if (!question) return detalle;

  var elegidas = {};
  for (var e = 0; e < answer.opciones.length; e++) elegidas[answer.opciones[e]] = true;
  var claves = [];
  var own = question.opciones || [];
  for (var o = 0; o < own.length; o++) {
    var option = own[o];
    detalle.opciones.push({
      id: option.id,
      texto: evRichToPlain_(option.texto),
      valor: option.valor,
      elegida: elegidas[option.id] === true,
      correcta: option.correcta === true,
      puntos: evNum_(option.puntos, 0),
      claveEmparejamiento: option.claveEmparejamiento || '',
      grupo: option.grupo || ''
    });
    if (option.correcta === true) claves.push(evRichToPlain_(option.texto));
    else if (option.claveEmparejamiento) {
      claves.push(evRichToPlain_(option.texto) + ' → ' + option.claveEmparejamiento);
    }
  }
  var esperado = question.respuestaEsperada;
  if (esperado) {
    if (Array.isArray(esperado.huecos)) {
      for (var h = 0; h < esperado.huecos.length; h++) {
        claves.push(esperado.huecos[h].clave + ': ' + esperado.huecos[h].respuestas.join(' / '));
      }
    } else if (esperado.valor !== undefined && esperado.valor !== null) {
      claves.push(String(esperado.valor));
      if (Array.isArray(esperado.alternativas)) claves = claves.concat(esperado.alternativas);
    } else if (Array.isArray(esperado.valores)) {
      claves = claves.concat(esperado.valores);
    }
  }
  detalle.claveTexto = claves.join(' | ');
  return detalle;
}

/**
 * Cronología legible del intento: hitos y eventos, con su minuto y segundo.
 *
 * Es lo que convierte una lista de eventos en algo que se puede leer de un
 * vistazo: «a los 4 min 12 s cambió de pestaña durante 38 segundos».
 */
function evTimeline_(attemptRow, eventos) {
  var out = [];
  out.push({
    segundos: 0, tipo: 'inicio', severidad: 'info',
    texto: 'Inició la evaluación', ocurridoEn: attemptRow.iniciado_en
  });
  for (var i = 0; i < eventos.length; i++) {
    var event = eventos[i];
    // El envío se añade como hito al final a partir del propio intento (que es la
    // fuente fiable de la hora), así que su evento no se repite aquí.
    if (event.tipo === 'envio_manual' || event.tipo === 'envio_automatico') continue;
    out.push({
      segundos: event.segundosDesdeInicio,
      tipo: event.tipo,
      severidad: event.severidad,
      preguntaId: event.preguntaId,
      duracionMs: event.duracionMs,
      detalle: event.detalle,
      texto: evEventText_(event),
      ocurridoEn: event.ocurridoEn
    });
  }
  if (attemptRow.enviado_en) {
    // El envío es, por definición, lo último que pasó. Si el tiempo declarado del
    // intento fuera menor que el del último evento (relojes con desfase, o un
    // envío inmediato tras un evento tardío), se toma el mayor para que la
    // cronología no se lea al revés.
    var ultimo = 0;
    for (var u = 0; u < out.length; u++) {
      if (out[u].segundos > ultimo) ultimo = out[u].segundos;
    }
    out.push({
      segundos: Math.max(evInt_(attemptRow.segundos_usados, 0), ultimo),
      tipo: evBool_(attemptRow.envio_automatico, false) ? 'envio_automatico' : 'envio_manual',
      severidad: 'info',
      texto: evBool_(attemptRow.envio_automatico, false)
        ? 'Se envió automáticamente al agotarse el tiempo'
        : 'Envió la evaluación',
      ocurridoEn: attemptRow.enviado_en
    });
  }
  out.sort(function (a, b) { return a.segundos - b.segundos; });
  return out;
}

/** Texto en español de un evento de integridad. */
function evEventText_(event) {
  var detalle = event.detalle || {};
  var segundos = event.duracionMs > 0 ? Math.round(event.duracionMs / 1000) : 0;
  switch (event.tipo) {
    case 'pestana_oculta':
      return segundos > 0
        ? 'Salió de la pestaña durante ' + segundos + ' s'
        : 'Salió de la pestaña de la evaluación';
    case 'pestana_visible': return 'Volvió a la pestaña de la evaluación';
    case 'foco_perdido':
      return segundos > 0 ? 'La ventana perdió el foco ' + segundos + ' s' : 'La ventana perdió el foco';
    case 'foco_recuperado': return 'La ventana recuperó el foco';
    case 'pegar':
      return 'Pegó texto' + (detalle.caracteres ? ' (' + detalle.caracteres + ' caracteres)' : '');
    case 'copiar': return 'Copió texto de la evaluación';
    case 'cortar': return 'Cortó texto';
    case 'menu_contextual': return 'Abrió el menú contextual';
    case 'impresion': return 'Intentó imprimir o guardar como PDF';
    case 'captura_sospechosa': return 'Se detectó una combinación de captura de pantalla';
    case 'pantalla_completa_on': return 'Activó la pantalla completa';
    case 'pantalla_completa_off': return 'Salió de la pantalla completa';
    case 'inactividad': return 'Estuvo inactivo ' + (detalle.segundos || segundos) + ' s';
    case 'ausencia_prolongada': return 'Ausencia prolongada de ' + (detalle.segundos || segundos) + ' s';
    case 'recarga': return 'Recargó la página';
    case 'salida_intentada': return 'Intentó cerrar o abandonar la página';
    case 'reconexion': return 'Recuperó la conexión con el servidor';
    case 'ventana_redimensionada':
      return 'Cambió el tamaño de la ventana' +
        (detalle.ancho ? ' (' + detalle.ancho + '×' + detalle.alto + ')' : '');
    case 'pregunta_vista': return 'Abrió una pregunta';
    case 'pregunta_respondida': return 'Respondió una pregunta';
    case 'seccion_cambiada': return 'Cambió de sección';
    case 'guardado': return 'Se guardó el progreso';
    case 'envio_manual': return 'Envió la evaluación';
    case 'envio_automatico': return 'Envío automático por tiempo agotado';
    case 'expirado': return 'Se agotó el tiempo';
    default: return event.tipo;
  }
}

/* --------------------------- Calificación manual --------------------------- */

/**
 * Califica a mano una respuesta y recompone los totales del intento.
 *
 * Solo se puede calificar lo que el servidor dejó pendiente: intentar puntuar a
 * mano una pregunta cerrada sería una puerta para alterar resultados objetivos.
 */
function evGradeAnswer_Manual_(context, payload) {
  evRequireInstalled_();
  var p = payload || {};
  var attemptId = evText_(p.intentoId, 140);
  var preguntaId = evText_(p.preguntaId, 140);
  var attemptRow = evById_(EV_SHEET.INTENTOS, attemptId);
  if (!attemptRow) {
    throw evError_(EV_CODE.NOT_FOUND, 'El intento indicado no existe.', { details: { id: attemptId } });
  }
  var answerRow = evById_(EV_SHEET.RESPUESTAS, evAnswerId_(attemptId, preguntaId));
  if (!answerRow) {
    throw evError_(EV_CODE.NOT_FOUND, 'Esa pregunta no tiene respuesta registrada en este intento.', {
      hint: 'Solo se pueden calificar preguntas que el candidato respondió.',
      details: { intentoId: attemptId, preguntaId: preguntaId }
    });
  }
  if (!evBool_(answerRow.requiere_revision, false) && p.forzar !== true) {
    throw evError_(EV_CODE.CONFLICT,
      'Esta pregunta la calificó el sistema automáticamente.',
      {
        hint: 'Solo se califican a mano las preguntas marcadas como pendientes de revisión.',
        details: { preguntaId: preguntaId, puedeForzar: true }
      });
  }

  var maximo = evNum_(answerRow.puntos_posibles, 0);
  var otorgados = evNumOrNull_(p.puntos);
  if (otorgados === null) {
    throw evError_(EV_CODE.BAD_REQUEST, 'Falta el puntaje a otorgar.', {
      hint: 'Envía `payload.puntos` con un número entre 0 y ' + maximo + '.',
      details: { campo: 'puntos', maximo: maximo }
    });
  }
  if (otorgados < 0 || otorgados > maximo) {
    throw evError_(EV_CODE.VALIDATION_ERROR,
      'El puntaje debe estar entre 0 y ' + maximo + ' para esta pregunta.',
      { hint: 'Ajusta el valor.', details: { recibido: otorgados, maximo: maximo } });
  }

  var now = context.now;
  answerRow.puntos_obtenidos = evRound_(otorgados, 3);
  answerRow.correcta = maximo > 0 ? otorgados >= maximo : null;
  answerRow.requiere_revision = false;
  answerRow.comentario_revisor = evText_(p.comentario, 4000);
  evPut_(EV_SHEET.RESPUESTAS, answerRow);

  var evaluationRow = evById_(EV_SHEET.EVALUACIONES, attemptRow.evaluacion_id);
  var aplicacion = evaluationRow ? evEvaluationFromRow_(evaluationRow).aplicacion : {};
  var answerRows = evWhere_(EV_SHEET.RESPUESTAS, 'intento_id', attemptId);
  var recomputo = evRecomputeAttempt_(attemptRow, answerRows, aplicacion);

  attemptRow.puntos_obtenidos = recomputo.puntosObtenidos;
  attemptRow.correctas = recomputo.correctas;
  attemptRow.incorrectas = recomputo.incorrectas;
  attemptRow.pendientes_revision = recomputo.pendientesRevision;
  attemptRow.nota = recomputo.nota;
  attemptRow.estado_calificacion = recomputo.estadoCalificacion;
  attemptRow.aprobado = recomputo.aprobado;
  attemptRow.calificado_en = now;
  attemptRow.calificado_por = context.actor;
  if (p.notasRevision !== undefined) attemptRow.notas_revision = evText_(p.notasRevision, 8000);
  evPut_(EV_SHEET.INTENTOS, attemptRow);

  evAudit_(context, 'gradeAnswer', 'intento', attemptId, 'ok', {
    preguntaId: preguntaId, puntos: answerRow.puntos_obtenidos,
    pendientes: recomputo.pendientesRevision, nota: recomputo.nota
  });

  return {
    data: {
      intentoId: attemptId,
      preguntaId: preguntaId,
      puntosObtenidos: answerRow.puntos_obtenidos,
      nota: recomputo.nota,
      aprobado: recomputo.aprobado,
      estadoCalificacion: recomputo.estadoCalificacion,
      pendientesRevision: recomputo.pendientesRevision
    },
    referencia: attemptId,
    resumen: { intentoId: attemptId, preguntaId: preguntaId }
  };
}

/**
 * Anula (o restablece) un intento.
 *
 * Anular no borra: el intento y sus respuestas siguen ahí, marcados y fuera de
 * los agregados. Un resultado nunca desaparece sin dejar rastro.
 */
function evAnnulAttempt_(context, payload) {
  evRequireInstalled_();
  var p = payload || {};
  var attemptId = evText_(p.intentoId, 140);
  var attemptRow = evById_(EV_SHEET.INTENTOS, attemptId);
  if (!attemptRow) {
    throw evError_(EV_CODE.NOT_FOUND, 'El intento indicado no existe.', { details: { id: attemptId } });
  }
  var restablecer = p.restablecer === true;
  if (restablecer) {
    if (attemptRow.estado !== 'anulado') {
      throw evError_(EV_CODE.CONFLICT, 'Este intento no está anulado.', {
        hint: 'Solo se restablecen intentos anulados.', details: { estado: attemptRow.estado }
      });
    }
    attemptRow.estado = attemptRow.enviado_en ? 'enviado' : 'en_curso';
  } else {
    attemptRow.estado = 'anulado';
  }
  attemptRow.notas_revision = evText_(p.motivo || attemptRow.notas_revision, 8000);
  attemptRow.calificado_por = context.actor;
  attemptRow.calificado_en = context.now;
  evPut_(EV_SHEET.INTENTOS, attemptRow);

  evAudit_(context, 'annulAttempt', 'intento', attemptId, 'ok',
    { estado: attemptRow.estado, restablecer: restablecer });
  return {
    data: { intentoId: attemptId, estado: attemptRow.estado },
    referencia: attemptId,
    resumen: { intentoId: attemptId, estado: attemptRow.estado }
  };
}

/**
 * Paquete de exportación de un intento.
 *
 * Es `getAttempt` más los datos de cabecera que el informe necesita (identidad
 * del participante, evaluación, versión, nota, veredicto y resumen de
 * integridad), de forma que el generador de PDF del navegador no tenga que
 * componer nada ni pedir una segunda llamada.
 */
function evExportAttempt_(payload) {
  var detail = evGetAttempt_(payload);
  var attempt = detail.intento;
  return {
    generadoEn: evNow_(),
    backend: EV_BACKEND.version,
    evaluacion: detail.evaluacion,
    intento: attempt,
    identidad: {
      nombre: attempt.participante.nombre,
      documento: attempt.participante.documento,
      correo: attempt.participante.correo,
      identificador: attempt.id,
      extra: attempt.participante.extra
    },
    resultado: {
      nota: attempt.nota,
      notaAutomatica: attempt.notaAutomatica,
      puntosObtenidos: attempt.puntosObtenidos,
      puntosPosibles: attempt.puntosPosibles,
      correctas: attempt.correctas,
      incorrectas: attempt.incorrectas,
      sinResponder: attempt.sinResponder,
      aprobado: attempt.aprobado,
      estadoCalificacion: attempt.estadoCalificacion,
      pendientesRevision: attempt.pendientesRevision
    },
    integridad: {
      riesgo: attempt.riesgoIntegridad,
      resumen: attempt.resumenIntegridad,
      eventos: detail.eventos.length
    },
    respuestas: detail.respuestas,
    cronologia: detail.cronologia,
    advertencias: detail.advertencias
  };
}
