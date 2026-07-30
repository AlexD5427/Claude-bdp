/**
 * 10_Validate.gs — validación de entrada y validación de publicación.
 *
 * Dos niveles con exigencias distintas, y esa distinción es la clave del flujo:
 *
 *   GUARDAR BORRADOR — solo se valida la FORMA. Un borrador puede estar
 *     incompleto: es normal tener una pregunta sin opciones a media tarde. Si
 *     guardar exigiera una evaluación válida, no habría manera de trabajar por
 *     partes, y el módulo anterior perdía trabajo justamente por eso.
 *
 *   PUBLICAR — se valida el FONDO. Aquí sí: título, duración, criterio de
 *     aprobación, al menos una pregunta, opciones coherentes, claves de respuesta
 *     presentes donde hacen falta, referencias de las reglas existentes.
 *
 * Todo hallazgo lleva una `path` (`preguntas.pr_x.opciones`) para que la interfaz
 * pueda llevar al usuario al campo exacto en vez de mostrarle un párrafo.
 */

/* ------------------------ Normalización del documento --------------------- */

/**
 * Normaliza el documento que llega del editor.
 *
 * Devuelve `{ evaluacion, secciones, preguntas, opciones }` en forma plana, con
 * los identificadores conservados si son válidos, los órdenes recalculados como
 * enteros consecutivos y los tipos desconocidos rechazados.
 *
 * Recalcular el orden aquí y no confiar en el que manda el cliente elimina toda
 * una familia de fallos: posiciones repetidas, huecos y preguntas que aparecían
 * en distinto orden en el editor y en la prueba.
 */
function evNormalizeDocument_(payload, evaluacionId) {
  var issues = [];
  var doc = (payload && payload.evaluacion) || {};
  var seccionesIn = Array.isArray(payload && payload.secciones) ? payload.secciones : [];

  if (seccionesIn.length > EV_LIMITS.SECTIONS) {
    evThrowIssues_('La evaluación tiene demasiadas secciones.', [
      evIssue_('DEMASIADAS_SECCIONES',
        'El máximo es ' + EV_LIMITS.SECTIONS + ' secciones y llegaron ' + seccionesIn.length + '.',
        'secciones')
    ]);
  }

  var secciones = [];
  var preguntas = [];
  var opciones = [];
  var vistos = {};
  var totalPreguntas = 0;

  for (var s = 0; s < seccionesIn.length; s++) {
    var sIn = seccionesIn[s] || {};
    var sectionId = evUniqueId_(sIn.id, EV_ID.SECCION, vistos);
    var section = {
      id: sectionId,
      titulo: sIn.titulo,
      descripcion: sIn.descripcion,
      limiteSegundos: sIn.limiteSegundos,
      mezclar: sIn.mezclar,
      tomarN: sIn.tomarN,
      peso: sIn.peso,
      orden: secciones.length
    };
    secciones.push(section);

    var preguntasIn = Array.isArray(sIn.preguntas) ? sIn.preguntas : [];
    var ordenPregunta = 0;
    for (var q = 0; q < preguntasIn.length; q++) {
      var qIn = preguntasIn[q] || {};
      totalPreguntas++;
      if (totalPreguntas > EV_LIMITS.QUESTIONS) {
        evThrowIssues_('La evaluación tiene demasiadas preguntas.', [
          evIssue_('DEMASIADAS_PREGUNTAS',
            'El máximo es ' + EV_LIMITS.QUESTIONS + ' preguntas.', 'preguntas')
        ]);
      }
      if (!evTypeExists_(qIn.tipo)) {
        issues.push(evIssue_('TIPO_DESCONOCIDO',
          'El tipo de bloque "' + evText_(qIn.tipo, 60) + '" no existe en este backend.',
          'preguntas.' + evText_(qIn.id, 120),
          { tipo: evText_(qIn.tipo, 60), tiposValidos: evTypeIds_().length }));
        continue;
      }
      var questionId = evUniqueId_(qIn.id, EV_ID.PREGUNTA, vistos);
      var question = {
        id: questionId,
        seccionId: sectionId,
        tipo: String(qIn.tipo),
        orden: ordenPregunta++,
        enunciado: qIn.enunciado,
        ayuda: qIn.ayuda,
        obligatoria: qIn.obligatoria,
        modoPuntaje: qIn.modoPuntaje,
        puntos: qIn.puntos,
        penalizacion: qIn.penalizacion,
        competencia: qIn.competencia,
        codigo: qIn.codigo,
        respuestaEsperada: qIn.respuestaEsperada,
        configuracion: qIn.configuracion,
        validacion: qIn.validacion,
        retroalimentacion: qIn.retroalimentacion,
        medios: qIn.medios,
        accesibilidad: qIn.accesibilidad,
        etiquetas: qIn.etiquetas
      };
      preguntas.push(question);

      var opcionesIn = Array.isArray(qIn.opciones) ? qIn.opciones : [];
      if (opcionesIn.length > EV_LIMITS.OPTIONS_PER_QUESTION) {
        issues.push(evIssue_('DEMASIADAS_OPCIONES',
          'Una pregunta admite hasta ' + EV_LIMITS.OPTIONS_PER_QUESTION + ' opciones.',
          'preguntas.' + questionId + '.opciones'));
        opcionesIn = opcionesIn.slice(0, EV_LIMITS.OPTIONS_PER_QUESTION);
      }
      var ordenOpcion = 0;
      for (var o = 0; o < opcionesIn.length; o++) {
        var oIn = opcionesIn[o] || {};
        opciones.push({
          id: evUniqueId_(oIn.id, EV_ID.OPCION, vistos),
          preguntaId: questionId,
          texto: oIn.texto,
          valor: oIn.valor,
          orden: ordenOpcion++,
          correcta: oIn.correcta,
          puntos: oIn.puntos,
          claveEmparejamiento: oIn.claveEmparejamiento,
          grupo: oIn.grupo,
          imagenUrl: oIn.imagenUrl,
          retroalimentacion: oIn.retroalimentacion
        });
      }
    }
  }

  if (issues.length > 0) {
    evThrowIssues_('El documento enviado contiene bloques que no se pueden guardar.', issues);
  }

  return {
    evaluacion: doc,
    evaluacionId: evaluacionId,
    secciones: secciones,
    preguntas: preguntas,
    opciones: opciones
  };
}

/**
 * Identificador único dentro del documento.
 *
 * Se conserva el que manda el cliente (así el editor no pierde el estado al
 * guardar) salvo que sea inválido o esté repetido. Un id repetido haría que dos
 * preguntas compartieran fila y una de las dos se perdiera silenciosamente.
 */
function evUniqueId_(candidate, prefix, seen) {
  var id = evIsId_(candidate) ? String(candidate) : evNewId_(prefix);
  while (seen[id]) id = evNewId_(prefix);
  seen[id] = true;
  return id;
}

/* -------------------------- Validación de publicación --------------------- */

/**
 * Reglas que una evaluación debe cumplir para poder publicarse.
 *
 * `evaluation` es el objeto de la API; `secciones`, `preguntas` y `opciones`, las
 * listas planas ya guardadas. Devuelve una lista de hallazgos (vacía si todo
 * está bien) — nunca lanza, para que el editor pueda mostrar la revisión previa
 * sin intentar publicar.
 */
function evValidateForPublish_(evaluation, secciones, preguntas, opciones) {
  var issues = [];
  var app = evaluation.aplicacion || {};

  /* --- Identidad --- */
  if (!String(evaluation.titulo || '').trim()) {
    issues.push(evIssue_('SIN_TITULO',
      'La evaluación necesita un título antes de publicarse.', 'evaluacion.titulo'));
  }
  if (String(evaluation.titulo || '').trim().toLowerCase() === 'evaluación sin título') {
    issues.push(evIssue_('TITULO_POR_OMISION',
      'El título sigue siendo el de por omisión. Es lo primero que ve el candidato.',
      'evaluacion.titulo'));
  }

  /* --- Contenido --- */
  var activas = [];
  for (var p = 0; p < preguntas.length; p++) {
    if (evIsQuestion_(preguntas[p].tipo)) activas.push(preguntas[p]);
  }
  if (activas.length === 0) {
    issues.push(evIssue_('SIN_PREGUNTAS',
      'La evaluación no tiene ninguna pregunta que recoja respuesta.', 'preguntas'));
  }
  if (secciones.length === 0) {
    issues.push(evIssue_('SIN_SECCIONES', 'La evaluación no tiene secciones.', 'secciones'));
  }

  /* --- Tiempo --- */
  var duracion = evNumOrNull_(app.duracionMinutos);
  if (duracion !== null && duracion <= 0) {
    issues.push(evIssue_('DURACION_INVALIDA',
      'La duración debe ser mayor que cero, o quedar vacía para no limitar el tiempo.',
      'evaluacion.aplicacion.duracionMinutos'));
  }
  if (duracion !== null && activas.length > 0 && duracion < Math.ceil(activas.length / 20)) {
    issues.push(evIssue_('DURACION_MUY_CORTA',
      'La duración es de ' + duracion + ' min para ' + activas.length +
      ' preguntas: menos de tres segundos por pregunta.',
      'evaluacion.aplicacion.duracionMinutos',
      { preguntas: activas.length, minutos: duracion }));
  }
  if (app.ventanaInicio && app.ventanaFin) {
    var desde = evToMs_(app.ventanaInicio);
    var hasta = evToMs_(app.ventanaFin);
    if (desde !== null && hasta !== null && hasta <= desde) {
      issues.push(evIssue_('VENTANA_INVERTIDA',
        'La ventana de aplicación termina antes de empezar.',
        'evaluacion.aplicacion.ventanaFin'));
    }
  }

  /* --- Puntaje y aprobación --- */
  var totalPuntos = 0;
  var calificables = 0;
  var opcionesPorPregunta = evGroupBy_(opciones, 'preguntaId');

  for (var i = 0; i < activas.length; i++) {
    var q = activas[i];
    var spec = evTypeSpec_(q.tipo);
    var own = opcionesPorPregunta[q.id] || [];
    var path = 'preguntas.' + q.id;

    if (evRichIsEmpty_(q.enunciado)) {
      issues.push(evIssue_('ENUNCIADO_VACIO',
        'Hay una pregunta sin enunciado.', path + '.enunciado', { tipo: q.tipo }));
    }

    if (spec.options === 'requeridas') {
      var minimo = spec.expects === 'orden' ? 2 : (q.tipo === 'verdadero_falso' ? 2 : 2);
      if (own.length < minimo) {
        issues.push(evIssue_('OPCIONES_INSUFICIENTES',
          'Esta pregunta necesita al menos ' + minimo + ' opciones y tiene ' + own.length + '.',
          path + '.opciones', { tipo: q.tipo, opciones: own.length }));
      }
      var textos = {};
      for (var oo = 0; oo < own.length; oo++) {
        if (evRichIsEmpty_(own[oo].texto) && !own[oo].imagenUrl) {
          issues.push(evIssue_('OPCION_VACIA',
            'Hay una opción sin texto ni imagen.', path + '.opciones.' + own[oo].id));
        }
        var plano = evRichToPlain_(own[oo].texto).trim().toLowerCase();
        if (plano && textos[plano]) {
          issues.push(evIssue_('OPCION_DUPLICADA',
            'La opción «' + evText_(plano, 80) + '» está repetida.',
            path + '.opciones.' + own[oo].id));
        }
        textos[plano] = true;
      }
    }

    var puntos = evNum_(q.puntos, 0);
    if (q.modoPuntaje !== 'ninguno') {
      totalPuntos += puntos;
      if (puntos <= 0) {
        issues.push(evIssue_('PUNTOS_CERO',
          'La pregunta puntúa pero tiene cero puntos asignados.',
          path + '.puntos', { modoPuntaje: q.modoPuntaje }));
      }
    }

    var rowLike = {
      tipo: q.tipo, modo_puntaje: q.modoPuntaje, puntos: puntos,
      respuesta_esperada: q.respuestaEsperada
    };
    var ownRowLike = [];
    for (var r = 0; r < own.length; r++) {
      ownRowLike.push({
        correcta: own[r].correcta === true,
        clave_emparejamiento: own[r].claveEmparejamiento || '',
        puntos: evNum_(own[r].puntos, 0)
      });
    }

    if (evIsAutoGradable_(rowLike, ownRowLike)) {
      calificables++;
      // Una pregunta de selección única con dos «correctas» es un estado
      // imposible: el candidato no puede acertar. Se detecta aquí porque el
      // editor puede llegar a ese estado con dos clics.
      if (spec.expects === 'opcion' && spec.multiple === false) {
        var correctas = 0;
        for (var c = 0; c < own.length; c++) if (own[c].correcta === true) correctas++;
        if (correctas > 1) {
          issues.push(evIssue_('VARIAS_CORRECTAS',
            'Es una pregunta de respuesta única y tiene ' + correctas + ' opciones marcadas como correctas.',
            path + '.opciones', { correctas: correctas }));
        }
      }
    } else if (q.modoPuntaje !== 'ninguno' && q.modoPuntaje !== 'manual' && puntos > 0) {
      issues.push(evIssue_('SIN_CLAVE',
        'La pregunta puntúa automáticamente pero no tiene respuesta correcta definida. ' +
        'Márcala como manual o define la clave.',
        path + '.respuestaEsperada', { tipo: q.tipo, modoPuntaje: q.modoPuntaje }));
    }
  }

  var aprobacion = evNumOrNull_(app.puntajeAprobacion);
  if (aprobacion !== null) {
    if (String(app.criterioAprobacion) === 'puntos') {
      if (totalPuntos > 0 && aprobacion > totalPuntos) {
        issues.push(evIssue_('APROBACION_IMPOSIBLE',
          'Se exigen ' + aprobacion + ' puntos para aprobar y la evaluación solo reparte ' + totalPuntos + '.',
          'evaluacion.aplicacion.puntajeAprobacion',
          { exigido: aprobacion, disponible: totalPuntos }));
      }
    } else if (aprobacion > 100 || aprobacion < 0) {
      issues.push(evIssue_('APROBACION_FUERA_DE_RANGO',
        'El porcentaje de aprobación debe estar entre 0 y 100.',
        'evaluacion.aplicacion.puntajeAprobacion'));
    }
    if (calificables === 0 && aprobacion > 0) {
      issues.push(evIssue_('APROBACION_SIN_CALIFICABLES',
        'Se definió un puntaje de aprobación pero ninguna pregunta se califica automáticamente: ' +
        'todos los resultados quedarían pendientes de revisión.',
        'evaluacion.aplicacion.puntajeAprobacion'));
    }
  }

  /* --- Participante --- */
  if (evaluation.participante && evaluation.participante.requiereConsentimiento
      && !String(evaluation.participante.textoConsentimiento || '').trim()) {
    issues.push(evIssue_('CONSENTIMIENTO_VACIO',
      'Se exige consentimiento pero el texto está vacío.',
      'evaluacion.participante.textoConsentimiento'));
  }

  /* --- Reglas de ramificación --- */
  var idsPregunta = {};
  for (var ip = 0; ip < preguntas.length; ip++) idsPregunta[preguntas[ip].id] = true;
  var idsSeccion = {};
  for (var is = 0; is < secciones.length; is++) idsSeccion[secciones[is].id] = true;
  var reglas = Array.isArray(evaluation.reglas) ? evaluation.reglas : [];
  for (var rr = 0; rr < reglas.length; rr++) {
    var regla = reglas[rr];
    if (regla.preguntaId && !idsPregunta[regla.preguntaId]) {
      issues.push(evIssue_('REGLA_HUERFANA',
        'Una regla depende de una pregunta que ya no existe.',
        'reglas.' + regla.id, { preguntaId: regla.preguntaId }));
    }
    if (regla.destinoSeccionId && !idsSeccion[regla.destinoSeccionId]) {
      issues.push(evIssue_('REGLA_DESTINO_INEXISTENTE',
        'Una regla salta a una sección que ya no existe.',
        'reglas.' + regla.id, { destinoSeccionId: regla.destinoSeccionId }));
    }
  }

  return issues;
}

/**
 * Advertencias que NO bloquean la publicación pero conviene ver.
 *
 * Separarlas de los errores es importante: si todo bloquea, la gente aprende a
 * ignorar el panel de revisión.
 */
function evPublishWarnings_(evaluation, secciones, preguntas, opciones) {
  var warnings = [];
  var app = evaluation.aplicacion || {};
  var activas = [];
  for (var p = 0; p < preguntas.length; p++) {
    if (evIsQuestion_(preguntas[p].tipo)) activas.push(preguntas[p]);
  }

  if (evNumOrNull_(app.duracionMinutos) === null) {
    warnings.push(evIssue_('SIN_DURACION',
      'La evaluación no tiene límite de tiempo. El temporizador no se mostrará.',
      'evaluacion.aplicacion.duracionMinutos'));
  }
  if (evNumOrNull_(app.puntajeAprobacion) === null && activas.length > 0) {
    warnings.push(evIssue_('SIN_APROBACION',
      'No hay criterio de aprobación: los resultados mostrarán nota pero no aprobado/no aprobado.',
      'evaluacion.aplicacion.puntajeAprobacion'));
  }
  if (evRichIsEmpty_(evaluation.instrucciones)) {
    warnings.push(evIssue_('SIN_INSTRUCCIONES',
      'No hay instrucciones para el candidato.', 'evaluacion.instrucciones'));
  }
  var conObligatorias = 0;
  for (var q = 0; q < activas.length; q++) if (activas[q].obligatoria) conObligatorias++;
  if (activas.length > 0 && conObligatorias === 0) {
    warnings.push(evIssue_('NINGUNA_OBLIGATORIA',
      'Ninguna pregunta es obligatoria: se puede enviar la prueba en blanco.', 'preguntas'));
  }
  var manuales = 0;
  var opcionesPorPregunta = evGroupBy_(opciones, 'preguntaId');
  for (var m = 0; m < activas.length; m++) {
    var own = opcionesPorPregunta[activas[m].id] || [];
    var ownRowLike = [];
    for (var r = 0; r < own.length; r++) {
      ownRowLike.push({
        correcta: own[r].correcta === true,
        clave_emparejamiento: own[r].claveEmparejamiento || '',
        puntos: evNum_(own[r].puntos, 0)
      });
    }
    if (evRequiresManualReview_({
      tipo: activas[m].tipo, modo_puntaje: activas[m].modoPuntaje,
      puntos: evNum_(activas[m].puntos, 0), respuesta_esperada: activas[m].respuestaEsperada
    }, ownRowLike)) manuales++;
  }
  if (manuales > 0) {
    warnings.push(evIssue_('REVISION_MANUAL',
      manuales + ' pregunta(s) exigen revisión humana: la nota final quedará pendiente hasta revisarlas.',
      'preguntas', { manuales: manuales }));
  }
  return warnings;
}
