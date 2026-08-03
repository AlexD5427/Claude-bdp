/**
 * 14_Scoring.gs — la ÚNICA autoridad de calificación.
 *
 * ── Reglas absolutas ─────────────────────────────────────────────────────────
 *  1. La clave de respuestas se lee del SNAPSHOT de la versión a la que el
 *     intento quedó anclado. Nunca del borrador: editar una pregunta después de
 *     que alguien la respondió no puede cambiar su nota retroactivamente.
 *  2. Cualquier `correcta`, `puntosObtenidos`, `nota` o `aprobado` que llegue del
 *     cliente se DESCARTA antes de tocar nada. El navegador solo aporta el valor
 *     de la respuesta.
 *  3. Una pregunta u opción que no pertenezca a la versión es VALIDATION_ERROR,
 *     no un dato que se ignora en silencio.
 *  4. Nunca se divide por cero, y nunca se otorga un cero automático a una
 *     pregunta que exige revisión humana: la nota queda PENDIENTE, que es lo
 *     honesto y lo que permite que el revisor la complete después.
 *
 * ── Formato del valor por tipo (contrato con el runner) ──────────────────────
 *   opcion            opciones: [idOpcion]
 *   opciones          opciones: [idOpcion, …]
 *   escala / numero    valor: número
 *   texto / fecha / hora  valor: texto
 *   matriz            valor: { idFila: "valorColumna" }  |  { idFila: ["v1","v2"] }
 *   orden             valor: [idOpcion, …] en el orden elegido
 *   emparejamiento    valor: { idOpcion: "claveElegida" }
 *   clasificacion     valor: { idOpcion: "grupoElegido" }
 *   huecos            valor: { claveHueco: "texto" }
 *   archivo           valor: "https://…"
 */

/* ------------------------------ Normalizaciones ---------------------------- */

/** Texto comparable: sin acentos, sin espacios extra y en minúsculas si se pide. */
function evComparableText_(value, ignorarMayusculas, ignorarAcentos) {
  var text = String(value === null || value === undefined ? '' : value).trim().replace(/\s+/g, ' ');
  if (ignorarAcentos !== false) {
    text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  if (ignorarMayusculas !== false) text = text.toLowerCase();
  return text;
}

/** Descarta del cliente todo lo que solo el servidor puede decidir. */
function evStripClientScoring_(answer) {
  var raw = answer && typeof answer === 'object' ? answer : {};
  var opciones = [];
  var source = Array.isArray(raw.opciones) ? raw.opciones : (raw.opcion ? [raw.opcion] : []);
  for (var i = 0; i < source.length && opciones.length < 200; i++) {
    var id = evRaw_(source[i], 140);
    if (id && opciones.indexOf(id) < 0) opciones.push(id);
  }
  return {
    preguntaId: evRaw_(raw.preguntaId, 140),
    opciones: opciones,
    valor: evSanitizeAnswerValue_(raw.valor),
    segundos: evClampInt_(raw.segundos, 0, 86400, 0),
    visitas: evClampInt_(raw.visitas, 0, 10000, 0),
    cambios: evClampInt_(raw.cambios, 0, 10000, 0)
  };
}

/**
 * Sanea el valor de una respuesta.
 *
 * Acepta texto, número, booleano, arreglo de textos y objeto de un nivel. No se
 * admiten estructuras más profundas: no hacen falta para ningún tipo y limitar la
 * profundidad evita cargas patológicas.
 */
function evSanitizeAnswerValue_(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return evRaw_(value, EV_LIMITS.TEXT);
  if (Array.isArray(value)) {
    var out = [];
    for (var i = 0; i < value.length && out.length < 200; i++) {
      var item = value[i];
      if (typeof item === 'number') out.push(isFinite(item) ? item : 0);
      else out.push(evRaw_(item, 1000));
    }
    return out;
  }
  if (typeof value === 'object') {
    var obj = {};
    var keys = Object.keys(value);
    for (var k = 0; k < keys.length && k < 200; k++) {
      var key = evRaw_(keys[k], 140);
      if (!key) continue;
      var v = value[keys[k]];
      if (Array.isArray(v)) {
        var list = [];
        for (var j = 0; j < v.length && list.length < 60; j++) list.push(evRaw_(v[j], 500));
        obj[key] = list;
      } else if (typeof v === 'number') {
        obj[key] = isFinite(v) ? v : 0;
      } else if (typeof v === 'boolean') {
        obj[key] = v;
      } else {
        obj[key] = evRaw_(v, 1000);
      }
    }
    return obj;
  }
  return null;
}

/** Proyección legible del valor, para la columna espejo y los informes. */
function evAnswerToText_(question, options, answer) {
  var spec = evTypeSpec_(question.tipo) || {};
  var byId = evIndexBy_(options, 'id');

  if (spec.expects === 'opcion' || spec.expects === 'opciones') {
    var textos = [];
    for (var i = 0; i < answer.opciones.length; i++) {
      var option = byId[answer.opciones[i]];
      textos.push(option ? evRichToPlain_(option.texto) : answer.opciones[i]);
    }
    if (answer.valor) textos.push('Otra: ' + String(answer.valor));
    return textos.join(' · ');
  }
  if (spec.expects === 'orden') {
    var orden = Array.isArray(answer.valor) ? answer.valor : [];
    var pasos = [];
    for (var o = 0; o < orden.length; o++) {
      var opt = byId[orden[o]];
      pasos.push((o + 1) + '. ' + (opt ? evRichToPlain_(opt.texto) : orden[o]));
    }
    return pasos.join(' | ');
  }
  if (spec.expects === 'emparejamiento' || spec.expects === 'clasificacion' || spec.expects === 'matriz') {
    var mapa = answer.valor && typeof answer.valor === 'object' ? answer.valor : {};
    var pares = [];
    var keys = Object.keys(mapa);
    for (var k = 0; k < keys.length; k++) {
      var left = byId[keys[k]] ? evRichToPlain_(byId[keys[k]].texto) : keys[k];
      var right = Array.isArray(mapa[keys[k]]) ? mapa[keys[k]].join(', ') : mapa[keys[k]];
      pares.push(left + ' → ' + right);
    }
    return pares.join(' | ');
  }
  if (spec.expects === 'huecos') {
    var huecos = answer.valor && typeof answer.valor === 'object' ? answer.valor : {};
    var hk = Object.keys(huecos);
    var partes = [];
    for (var h = 0; h < hk.length; h++) partes.push(hk[h] + ': ' + huecos[hk[h]]);
    return partes.join(' | ');
  }
  if (Array.isArray(answer.valor)) return answer.valor.join(', ');
  if (answer.valor === null || answer.valor === undefined) return '';
  return String(answer.valor);
}

/* --------------------------- Calificación por tipo ------------------------- */

/**
 * Califica una respuesta.
 *
 * Devuelve `{ correcta, puntosObtenidos, puntosPosibles, requiereRevision }`.
 * `correcta = null` significa «no aplica» (contenido, escala sin clave) o «lo
 * decide una persona».
 */
function evGradeAnswer_(question, options, answer) {
  var spec = evTypeSpec_(question.tipo) || {};
  var maximo = question.modoPuntaje === 'ninguno' ? 0 : evNum_(question.puntos, 0);
  var pendiente = { correcta: null, puntosObtenidos: null, puntosPosibles: maximo, requiereRevision: true };
  var noAplica = { correcta: null, puntosObtenidos: null, puntosPosibles: 0, requiereRevision: false };

  if (spec.kind !== 'pregunta') return noAplica;
  if (question.modoPuntaje === 'ninguno') {
    return { correcta: null, puntosObtenidos: null, puntosPosibles: 0, requiereRevision: false };
  }

  var rowLike = {
    tipo: question.tipo, modo_puntaje: question.modoPuntaje, puntos: maximo,
    respuesta_esperada: question.respuestaEsperada
  };
  var ownRowLike = [];
  for (var i = 0; i < options.length; i++) {
    ownRowLike.push({
      correcta: options[i].correcta === true,
      clave_emparejamiento: options[i].claveEmparejamiento || '',
      puntos: evNum_(options[i].puntos, 0)
    });
  }
  if (evRequiresManualReview_(rowLike, ownRowLike)) return pendiente;
  if (!evIsAutoGradable_(rowLike, ownRowLike)) {
    return { correcta: null, puntosObtenidos: 0, puntosPosibles: maximo, requiereRevision: false };
  }

  var vacia = evIsAnswerEmpty_(spec, answer);
  if (vacia) {
    return { correcta: false, puntosObtenidos: 0, puntosPosibles: maximo, requiereRevision: false };
  }

  var resultado;
  switch (spec.expects) {
    case 'opcion':
    case 'opciones':
      resultado = evGradeOptions_(question, options, answer, spec, maximo);
      break;
    case 'orden':
      resultado = evGradeOrder_(question, options, answer, maximo);
      break;
    case 'emparejamiento':
      resultado = evGradePairs_(question, options, answer, maximo, 'claveEmparejamiento');
      break;
    case 'clasificacion':
      resultado = evGradePairs_(question, options, answer, maximo, 'claveEmparejamiento');
      break;
    case 'matriz':
      resultado = evGradeMatrix_(question, options, answer, spec, maximo);
      break;
    case 'huecos':
      resultado = evGradeBlanks_(question, answer, maximo);
      break;
    case 'numero':
    case 'escala':
      resultado = evGradeNumber_(question, answer, maximo);
      break;
    default:
      resultado = evGradeText_(question, answer, maximo);
      break;
  }

  // Penalización por respuesta incorrecta, si el autor la configuró. Nunca deja
  // la pregunta en negativo: restar más de lo que vale la pregunta convertiría
  // una prueba en una lotería.
  var penalizacion = evNum_(question.penalizacion, 0);
  if (penalizacion > 0 && resultado.correcta === false) {
    resultado.puntosObtenidos = Math.max(0, evRound_(evNum_(resultado.puntosObtenidos, 0) - penalizacion, 3));
  }
  resultado.puntosPosibles = maximo;
  resultado.requiereRevision = false;
  return resultado;
}

/** ¿La respuesta está vacía para su tipo? */
function evIsAnswerEmpty_(spec, answer) {
  if (spec.expects === 'opcion' || spec.expects === 'opciones') {
    return answer.opciones.length === 0
      && (answer.valor === null || answer.valor === undefined || answer.valor === '');
  }
  if (Array.isArray(answer.valor)) return answer.valor.length === 0;
  if (answer.valor && typeof answer.valor === 'object') return Object.keys(answer.valor).length === 0;
  return answer.valor === null || answer.valor === undefined || answer.valor === '';
}

/** Opciones: única y múltiple, con crédito exacto, parcial o por opción. */
function evGradeOptions_(question, options, answer, spec, maximo) {
  var elegidas = {};
  for (var i = 0; i < answer.opciones.length; i++) elegidas[answer.opciones[i]] = true;

  var correctasTotales = 0;
  var acertadas = 0;
  var falsosPositivos = 0;
  var puntosPorOpcion = 0;

  for (var o = 0; o < options.length; o++) {
    var option = options[o];
    var elegida = elegidas[option.id] === true;
    if (option.correcta === true) {
      correctasTotales++;
      if (elegida) acertadas++;
    } else if (elegida) {
      falsosPositivos++;
    }
    if (elegida) puntosPorOpcion += evNum_(option.puntos, 0);
  }

  var perfecta = correctasTotales > 0 && acertadas === correctasTotales && falsosPositivos === 0;

  if (question.modoPuntaje === 'por_opcion') {
    return {
      correcta: perfecta,
      puntosObtenidos: evRound_(Math.max(0, Math.min(puntosPorOpcion, maximo)), 3)
    };
  }
  if (question.modoPuntaje === 'parcial' && spec.multiple === true) {
    if (correctasTotales === 0) return { correcta: false, puntosObtenidos: 0 };
    // Crédito proporcional castigando los falsos positivos: es el criterio
    // estándar y evita que marcar todo garantice la nota máxima.
    var neto = Math.max(0, acertadas - falsosPositivos);
    return {
      correcta: perfecta,
      puntosObtenidos: evRound_((neto / correctasTotales) * maximo, 3)
    };
  }
  return { correcta: perfecta, puntosObtenidos: perfecta ? maximo : 0 };
}

/** Ordenar: crédito por posición absoluta acertada. */
function evGradeOrder_(question, options, answer, maximo) {
  var esperado = options.slice().sort(evByOrderApi_);
  var recibido = Array.isArray(answer.valor) ? answer.valor : [];
  if (esperado.length === 0) return { correcta: null, puntosObtenidos: 0 };
  var aciertos = 0;
  for (var i = 0; i < esperado.length; i++) {
    if (String(recibido[i]) === String(esperado[i].id)) aciertos++;
  }
  var perfecta = aciertos === esperado.length && recibido.length === esperado.length;
  if (question.modoPuntaje === 'exacto') {
    return { correcta: perfecta, puntosObtenidos: perfecta ? maximo : 0 };
  }
  return { correcta: perfecta, puntosObtenidos: evRound_((aciertos / esperado.length) * maximo, 3) };
}

function evByOrderApi_(a, b) {
  return evInt_(a.orden, 0) - evInt_(b.orden, 0);
}

/** Emparejar y clasificar: cada opción tiene su clave correcta. */
function evGradePairs_(question, options, answer, maximo, keyField) {
  var mapa = answer.valor && typeof answer.valor === 'object' && !Array.isArray(answer.valor)
    ? answer.valor : {};
  var total = 0;
  var aciertos = 0;
  for (var i = 0; i < options.length; i++) {
    var clave = String(options[i][keyField] || '');
    if (!clave) continue;
    total++;
    var dada = mapa[options[i].id];
    if (dada !== undefined && evComparableText_(dada, true, true) === evComparableText_(clave, true, true)) {
      aciertos++;
    }
  }
  if (total === 0) return { correcta: null, puntosObtenidos: 0 };
  var perfecta = aciertos === total;
  if (question.modoPuntaje === 'exacto') {
    return { correcta: perfecta, puntosObtenidos: perfecta ? maximo : 0 };
  }
  return { correcta: perfecta, puntosObtenidos: evRound_((aciertos / total) * maximo, 3) };
}

/**
 * Cuadrículas.
 *
 * Cada opción es una FILA; `claveEmparejamiento` guarda el valor (o los valores,
 * separados por coma) de la columna correcta. Las columnas viven en
 * `configuracion.columnasMatriz`.
 */
function evGradeMatrix_(question, options, answer, spec, maximo) {
  var mapa = answer.valor && typeof answer.valor === 'object' && !Array.isArray(answer.valor)
    ? answer.valor : {};
  var filas = 0;
  var aciertos = 0;
  for (var i = 0; i < options.length; i++) {
    var claveCruda = String(options[i].claveEmparejamiento || '');
    if (!claveCruda) continue;
    filas++;
    var esperadas = [];
    var partes = claveCruda.split(',');
    for (var p = 0; p < partes.length; p++) {
      var limpia = evComparableText_(partes[p], true, true);
      if (limpia) esperadas.push(limpia);
    }
    var dadas = [];
    var valor = mapa[options[i].id];
    if (Array.isArray(valor)) {
      for (var v = 0; v < valor.length; v++) {
        var norm = evComparableText_(valor[v], true, true);
        if (norm && dadas.indexOf(norm) < 0) dadas.push(norm);
      }
    } else if (valor !== undefined && valor !== null && valor !== '') {
      dadas.push(evComparableText_(valor, true, true));
    }
    if (spec.multiple === true) {
      if (dadas.length !== esperadas.length) continue;
      var todas = true;
      for (var e = 0; e < esperadas.length; e++) {
        if (dadas.indexOf(esperadas[e]) < 0) { todas = false; break; }
      }
      if (todas) aciertos++;
    } else if (dadas.length === 1 && esperadas.indexOf(dadas[0]) >= 0) {
      aciertos++;
    }
  }
  if (filas === 0) return { correcta: null, puntosObtenidos: 0 };
  var perfecta = aciertos === filas;
  if (question.modoPuntaje === 'exacto') {
    return { correcta: perfecta, puntosObtenidos: perfecta ? maximo : 0 };
  }
  return { correcta: perfecta, puntosObtenidos: evRound_((aciertos / filas) * maximo, 3) };
}

/** Rellenar huecos: cada hueco admite varias respuestas equivalentes. */
function evGradeBlanks_(question, answer, maximo) {
  var esperado = question.respuestaEsperada || {};
  var huecos = Array.isArray(esperado.huecos) ? esperado.huecos : [];
  if (huecos.length === 0) return { correcta: null, puntosObtenidos: 0 };
  var dadas = answer.valor && typeof answer.valor === 'object' && !Array.isArray(answer.valor)
    ? answer.valor : {};
  var aciertos = 0;
  for (var i = 0; i < huecos.length; i++) {
    var hueco = huecos[i];
    var dada = dadas[hueco.clave];
    if (dada === undefined || dada === null || dada === '') continue;
    var normalizada = evComparableText_(dada, hueco.ignorarMayusculas, hueco.ignorarAcentos);
    for (var r = 0; r < hueco.respuestas.length; r++) {
      if (evComparableText_(hueco.respuestas[r], hueco.ignorarMayusculas, hueco.ignorarAcentos) === normalizada) {
        aciertos++;
        break;
      }
    }
  }
  var perfecta = aciertos === huecos.length;
  if (question.modoPuntaje === 'exacto') {
    return { correcta: perfecta, puntosObtenidos: perfecta ? maximo : 0 };
  }
  return { correcta: perfecta, puntosObtenidos: evRound_((aciertos / huecos.length) * maximo, 3) };
}

/** Números y escalas, con tolerancia opcional. */
function evGradeNumber_(question, answer, maximo) {
  var esperado = question.respuestaEsperada || {};
  var objetivo = evNumOrNull_(esperado.valor);
  var recibido = evNumOrNull_(answer.valor);
  if (objetivo === null || recibido === null) return { correcta: false, puntosObtenidos: 0 };
  var tolerancia = Math.abs(evNum_(esperado.tolerancia, 0));
  var correcta = Math.abs(recibido - objetivo) <= tolerancia;
  return { correcta: correcta, puntosObtenidos: correcta ? maximo : 0 };
}

/** Textos, fechas y horas, con alternativas equivalentes. */
function evGradeText_(question, answer, maximo) {
  var esperado = question.respuestaEsperada || {};
  var candidatas = [];
  if (esperado.valor !== undefined && esperado.valor !== null && esperado.valor !== '') {
    candidatas.push(esperado.valor);
  }
  if (Array.isArray(esperado.valores)) candidatas = candidatas.concat(esperado.valores);
  if (Array.isArray(esperado.alternativas)) candidatas = candidatas.concat(esperado.alternativas);
  if (candidatas.length === 0) return { correcta: null, puntosObtenidos: 0 };

  var recibido = evComparableText_(answer.valor, esperado.ignorarMayusculas, esperado.ignorarAcentos);
  for (var i = 0; i < candidatas.length; i++) {
    if (evComparableText_(candidatas[i], esperado.ignorarMayusculas, esperado.ignorarAcentos) === recibido) {
      return { correcta: true, puntosObtenidos: maximo };
    }
  }
  return { correcta: false, puntosObtenidos: 0 };
}

/* --------------------------- Calificación del intento --------------------- */

/**
 * Califica un intento completo contra su snapshot.
 *
 * Devuelve el detalle por pregunta y los agregados. Lanza VALIDATION_ERROR si el
 * intento trae preguntas u opciones que no pertenecen a la versión: eso solo
 * puede pasar por un cliente manipulado o por un error de programación, y en
 * ninguno de los dos casos hay que fabricar una nota.
 */
function evScoreAttempt_(snapshot, answers, evaluacionAplicacion) {
  var indice = evSnapshotIndex_(snapshot);
  var issues = [];
  var vistas = {};
  var calificadas = [];

  for (var i = 0; i < answers.length; i++) {
    var answer = answers[i];
    if (!answer.preguntaId) {
      issues.push(evIssue_('RESPUESTA_SIN_PREGUNTA',
        'Llegó una respuesta sin identificador de pregunta.', 'respuestas.' + i));
      continue;
    }
    if (vistas[answer.preguntaId]) {
      issues.push(evIssue_('RESPUESTA_DUPLICADA',
        'Se envió más de una respuesta para la misma pregunta.',
        'respuestas.' + answer.preguntaId));
      continue;
    }
    vistas[answer.preguntaId] = true;
    var question = indice.preguntas[answer.preguntaId];
    if (!question) {
      issues.push(evIssue_('PREGUNTA_AJENA',
        'Una respuesta apunta a una pregunta que no pertenece a esta versión de la evaluación.',
        'respuestas.' + answer.preguntaId, { preguntaId: answer.preguntaId }));
      continue;
    }
    var own = question.opciones || [];
    var propias = {};
    for (var o = 0; o < own.length; o++) propias[own[o].id] = true;
    var ajena = false;
    for (var s = 0; s < answer.opciones.length; s++) {
      if (!propias[answer.opciones[s]]) {
        issues.push(evIssue_('OPCION_AJENA',
          'Una opción seleccionada no pertenece a su pregunta.',
          'respuestas.' + answer.preguntaId, { opcionId: answer.opciones[s] }));
        ajena = true;
      }
    }
    if (ajena) continue;

    var resultado = evGradeAnswer_(question, own, answer);
    calificadas.push({
      preguntaId: question.id,
      tipo: question.tipo,
      orden: indice.orden[question.id] || 0,
      opciones: answer.opciones,
      valor: answer.valor,
      valorTexto: evAnswerToText_(question, own, answer),
      correcta: resultado.correcta,
      puntosObtenidos: resultado.puntosObtenidos,
      puntosPosibles: resultado.puntosPosibles,
      requiereRevision: resultado.requiereRevision,
      segundos: answer.segundos,
      visitas: answer.visitas,
      cambios: answer.cambios
    });
  }

  if (issues.length > 0) {
    evThrowIssues_('Las respuestas enviadas no son coherentes con la evaluación.', issues);
  }

  /* --- Agregados sobre TODAS las preguntas de la versión, no solo las respondidas --- */
  var totalPreguntas = 0;
  var calificables = 0;
  var manuales = 0;
  var puntosPosibles = 0;
  for (var pid in indice.preguntas) {
    if (!Object.prototype.hasOwnProperty.call(indice.preguntas, pid)) continue;
    var q = indice.preguntas[pid];
    if (!evIsQuestion_(q.tipo)) continue;
    totalPreguntas++;
    if (q.modoPuntaje === 'ninguno') continue;
    puntosPosibles += evNum_(q.puntos, 0);
    var ownRowLike = [];
    for (var oo = 0; oo < (q.opciones || []).length; oo++) {
      ownRowLike.push({
        correcta: q.opciones[oo].correcta === true,
        clave_emparejamiento: q.opciones[oo].claveEmparejamiento || '',
        puntos: evNum_(q.opciones[oo].puntos, 0)
      });
    }
    var rowLike = {
      tipo: q.tipo, modo_puntaje: q.modoPuntaje, puntos: evNum_(q.puntos, 0),
      respuesta_esperada: q.respuestaEsperada
    };
    if (evIsAutoGradable_(rowLike, ownRowLike)) calificables++;
    else if (evRequiresManualReview_(rowLike, ownRowLike)) manuales++;
  }

  var correctas = 0;
  var incorrectas = 0;
  var pendientes = 0;
  var puntosObtenidos = 0;
  var respondidas = {};
  for (var c = 0; c < calificadas.length; c++) {
    var item = calificadas[c];
    respondidas[item.preguntaId] = true;
    if (item.correcta === true) correctas++;
    else if (item.correcta === false) incorrectas++;
    if (item.requiereRevision) pendientes++;
    puntosObtenidos += evNum_(item.puntosObtenidos, 0);
  }
  // Las preguntas manuales no respondidas también quedan pendientes: si no se
  // contaran, un intento sin contestar las abiertas se daría por «calificado».
  if (manuales > pendientes) pendientes = manuales;

  var sinResponder = 0;
  for (var pid2 in indice.preguntas) {
    if (!Object.prototype.hasOwnProperty.call(indice.preguntas, pid2)) continue;
    if (!evIsQuestion_(indice.preguntas[pid2].tipo)) continue;
    if (!respondidas[pid2]) sinResponder++;
  }

  puntosPosibles = evRound_(puntosPosibles, 3);
  puntosObtenidos = evRound_(puntosObtenidos, 3);
  var notaAutomatica = puntosPosibles > 0
    ? evRound_((puntosObtenidos / puntosPosibles) * 100, 2)
    : null;

  var estadoCalificacion = pendientes > 0 ? 'pendiente_revision' : 'automatica';
  var nota = estadoCalificacion === 'automatica' ? notaAutomatica : null;

  var app = evaluacionAplicacion || {};
  var umbral = evNumOrNull_(app.puntajeAprobacion);
  var aprobado = null;
  if (nota !== null && umbral !== null) {
    aprobado = String(app.criterioAprobacion) === 'puntos'
      ? puntosObtenidos >= umbral
      : nota >= umbral;
  }

  return {
    detalle: calificadas,
    totalPreguntas: totalPreguntas,
    calificables: calificables,
    correctas: correctas,
    incorrectas: incorrectas,
    sinResponder: sinResponder,
    pendientesRevision: pendientes,
    puntosObtenidos: puntosObtenidos,
    puntosPosibles: puntosPosibles,
    notaAutomatica: notaAutomatica,
    nota: nota,
    estadoCalificacion: estadoCalificacion,
    aprobado: aprobado
  };
}

/** Índice del snapshot: preguntas por id, con su orden global. */
function evSnapshotIndex_(snapshot) {
  var preguntas = {};
  var orden = {};
  var contador = 0;
  var secciones = snapshot.secciones || [];
  for (var s = 0; s < secciones.length; s++) {
    var own = secciones[s].preguntas || [];
    for (var q = 0; q < own.length; q++) {
      preguntas[own[q].id] = own[q];
      orden[own[q].id] = contador++;
    }
  }
  return { preguntas: preguntas, orden: orden, secciones: secciones };
}

/**
 * Recalcula los agregados de un intento a partir de las respuestas ya guardadas.
 *
 * Es lo que se ejecuta después de una calificación manual: el revisor pone los
 * puntos de una pregunta abierta y los totales, la nota y el aprobado se
 * recomponen sin volver a tocar el resto.
 */
function evRecomputeAttempt_(attemptRow, answerRows, aplicacion) {
  var puntosObtenidos = 0;
  var puntosPosibles = 0;
  var correctas = 0;
  var incorrectas = 0;
  var pendientes = 0;
  for (var i = 0; i < answerRows.length; i++) {
    var row = answerRows[i];
    puntosPosibles += evNum_(row.puntos_posibles, 0);
    if (evBool_(row.requiere_revision, false)) { pendientes++; continue; }
    puntosObtenidos += evNum_(row.puntos_obtenidos, 0);
    var correcta = evBoolOrNull_(row.correcta);
    if (correcta === true) correctas++;
    else if (correcta === false) incorrectas++;
  }
  // Las preguntas nunca respondidas siguen aportando su máximo al denominador,
  // que ya está en el intento: no se recalcula desde las respuestas para no
  // premiar el hecho de dejarlas en blanco.
  var totalPosible = evNum_(attemptRow.puntos_posibles, puntosPosibles);
  puntosObtenidos = evRound_(puntosObtenidos, 3);
  var nota = totalPosible > 0 ? evRound_((puntosObtenidos / totalPosible) * 100, 2) : null;
  var estado = pendientes > 0 ? 'pendiente_revision' : 'revisada';
  var umbral = evNumOrNull_((aplicacion || {}).puntajeAprobacion);
  var aprobado = null;
  if (pendientes === 0 && nota !== null && umbral !== null) {
    aprobado = String((aplicacion || {}).criterioAprobacion) === 'puntos'
      ? puntosObtenidos >= umbral
      : nota >= umbral;
  }
  return {
    puntosObtenidos: puntosObtenidos,
    correctas: correctas,
    incorrectas: incorrectas,
    pendientesRevision: pendientes,
    nota: pendientes > 0 ? null : nota,
    estadoCalificacion: estado,
    aprobado: aprobado
  };
}
