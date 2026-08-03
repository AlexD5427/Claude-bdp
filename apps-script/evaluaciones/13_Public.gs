/**
 * 13_Public.gs — proyección pública: lo que el candidato puede recibir.
 *
 * ── SEGURIDAD CRÍTICA ────────────────────────────────────────────────────────
 * Este archivo es la ÚNICA puerta por la que el contenido de una evaluación sale
 * hacia un navegador sin credenciales. Se construye campo por campo, con lista
 * blanca, jamás copiando el objeto interno. Así, cuando alguien añada una columna
 * al esquema, esa columna NO podrá filtrarse por accidente: si no se nombra aquí,
 * no sale.
 *
 * Lo que NUNCA sale:
 *   correcta · puntos · penalizacion · claveEmparejamiento · respuestaEsperada ·
 *   retroalimentacion · modoPuntaje · notasInternas · puntajeAprobacion ·
 *   criterioAprobacion · puntosTotales · preguntasCalificables · reglas internas ·
 *   creadoPor / actualizadoPor · revisión · identificadores internos de versión.
 *
 * Hay una prueba automatizada que serializa el payload público de una evaluación
 * con claves de respuesta y comprueba que ninguna de esas palabras aparezca en el
 * JSON resultante.
 *
 * ── Mezcla determinista ──────────────────────────────────────────────────────
 * Cuando el autor pide mezclar preguntas u opciones, el orden se calcula a partir
 * del identificador del intento. Consecuencias: cada candidato ve un orden
 * distinto, y el MISMO candidato ve siempre el mismo orden aunque recargue la
 * página. Una mezcla aleatoria de verdad haría que recargar cambiara la prueba a
 * medio hacer, que es una forma segura de perder respuestas.
 */

/* ------------------------ Localizar la evaluación viva -------------------- */

/**
 * Estado de disponibilidad de un código público.
 *
 * Devuelve `{ disponible, motivo, evaluacion, version }`. El motivo es
 * deliberadamente explícito para el reclutador (que ve el mismo endpoint al
 * previsualizar) pero el runner solo muestra el texto correspondiente al
 * candidato; nunca se revela si el código existe pero está en borrador.
 */
function evResolvePublic_(codigo) {
  var normalizado = evNormalizeCode_(codigo);
  if (!normalizado) {
    throw evError_(EV_CODE.NOT_FOUND, 'El enlace no incluye un código de evaluación.', {
      hint: 'Comprueba que copiaste el enlace completo.', details: { motivo: 'codigo_vacio' }
    });
  }
  var rows = evAll_(EV_SHEET.EVALUACIONES);
  var found = null;
  for (var i = 0; i < rows.length; i++) {
    if (evNormalizeCode_(rows[i].codigo) === normalizado) { found = rows[i]; break; }
  }
  if (!found) {
    throw evError_(EV_CODE.NOT_FOUND, 'No existe ninguna evaluación con ese código.', {
      hint: 'Revisa el enlace. Si lo recibiste por correo, pide que te lo reenvíen completo.',
      details: { motivo: 'codigo_inexistente' }
    });
  }

  var api = evEvaluationFromRow_(found);
  var motivo = '';
  if (found.estado === 'borrador') motivo = 'no_publicada';
  else if (found.estado === 'pausada') motivo = 'pausada';
  else if (found.estado === 'cerrada') motivo = 'cerrada';
  else if (found.estado === 'archivada' || found.estado === 'papelera') motivo = 'no_disponible';
  else if (!found.version_vigente_id) motivo = 'sin_version';

  if (!motivo) {
    var ahora = evNowMs_();
    var desde = evToMs_(found.ventana_inicio);
    var hasta = evToMs_(found.ventana_fin);
    if (desde !== null && ahora < desde) motivo = 'aun_no_abre';
    else if (hasta !== null && ahora > hasta) motivo = 'ventana_cerrada';
  }

  return {
    disponible: motivo === '',
    motivo: motivo,
    row: found,
    evaluacion: api,
    versionId: found.version_vigente_id
  };
}

/** Mensaje para el candidato según el motivo de indisponibilidad. */
var EV_MOTIVO_TEXTO = {
  no_publicada: 'Esta evaluación todavía no está disponible.',
  pausada: 'La evaluación está pausada temporalmente. Vuelve a intentarlo más tarde.',
  cerrada: 'El plazo de esta evaluación ya terminó.',
  no_disponible: 'Esta evaluación no está disponible.',
  sin_version: 'Esta evaluación todavía no tiene contenido publicado.',
  aun_no_abre: 'La evaluación aún no ha abierto.',
  ventana_cerrada: 'El plazo para realizar esta evaluación ya terminó.'
};

/** Exige que el código esté disponible; si no, lanza el error correspondiente. */
function evRequireAvailable_(codigo) {
  var resolved = evResolvePublic_(codigo);
  if (resolved.disponible) return resolved;
  throw evError_(EV_CODE.NOT_FOUND,
    EV_MOTIVO_TEXTO[resolved.motivo] || 'Esta evaluación no está disponible.',
    {
      hint: 'Si crees que es un error, contacta con la persona que te envió el enlace.',
      details: { motivo: resolved.motivo, ventanaInicio: resolved.row.ventana_inicio, ventanaFin: resolved.row.ventana_fin }
    });
}

/* ------------------------------ Mezcla estable ---------------------------- */

/** Generador congruente lineal sembrado con un texto. Determinista y suficiente. */
function evSeededRandom_(seed) {
  var hash = 2166136261;
  var text = String(seed);
  for (var i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  var state = hash || 123456789;
  return function () {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Mezcla Fisher-Yates con semilla. No modifica el arreglo original. */
function evSeededShuffle_(items, seed) {
  var out = items.slice();
  var random = evSeededRandom_(seed);
  for (var i = out.length - 1; i > 0; i--) {
    var j = Math.floor(random() * (i + 1));
    var tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/* --------------------------- Proyección del payload ----------------------- */

/** Claves de configuración que el runner necesita para dibujar la pregunta. */
var EV_PUBLIC_CONFIG_KEYS = [
  'marcador', 'lineas', 'minimoCaracteres', 'maximoCaracteres', 'patron',
  'minimo', 'maximo', 'paso', 'decimales', 'moneda', 'prefijo', 'sufijo',
  'etiquetaMinimo', 'etiquetaMaximo', 'estrellas',
  'minimoSelecciones', 'maximoSelecciones', 'permitirOtra', 'otraEtiqueta',
  'columnas', 'filasMatriz', 'columnasMatriz', 'unaPorFila',
  'grupos', 'huecosTexto', 'lenguaje', 'lineasCodigo',
  'formatosAceptados', 'ayudaArchivo', 'anchoImagen', 'altoImagen',
  'imagenUrl', 'videoUrl', 'enlaceUrl', 'enlaceTexto', 'tonoAviso',
  'nivelTitulo', 'alineacion', 'zonaHoraria', 'incluirSegundos'
];

function evPublicConfig_(config) {
  var out = {};
  if (!config || typeof config !== 'object') return out;
  for (var i = 0; i < EV_PUBLIC_CONFIG_KEYS.length; i++) {
    var key = EV_PUBLIC_CONFIG_KEYS[i];
    if (config[key] !== undefined && config[key] !== null && config[key] !== '') out[key] = config[key];
  }
  return out;
}

/**
 * Opción pública.
 *
 * Solo identificador, texto, valor e imagen. `correcta`, `puntos` y
 * `claveEmparejamiento` se quedan en el servidor por construcción: no se
 * mencionan aquí.
 */
function evPublicOption_(option) {
  var out = {
    id: String(option.id),
    valor: String(option.valor || option.id),
    texto: evRichSanitize_(option.texto)
  };
  if (option.imagenUrl) out.imagenUrl = String(option.imagenUrl);
  if (option.grupo) out.grupo = String(option.grupo);
  return out;
}

/** Pregunta pública (o bloque de contenido). */
function evPublicQuestion_(question, seed, mezclarOpciones) {
  var spec = evTypeSpec_(question.tipo) || {};
  var opciones = question.opciones || [];
  // Emparejar y clasificar SÍ mezclan siempre: presentarlas en el orden de la
  // clave regalaría la respuesta.
  var debeMezclar = mezclarOpciones
    || spec.expects === 'orden' || spec.expects === 'emparejamiento' || spec.expects === 'clasificacion';
  var ordenadas = debeMezclar ? evSeededShuffle_(opciones, seed + '|' + question.id) : opciones;

  var publicas = [];
  for (var i = 0; i < ordenadas.length; i++) publicas.push(evPublicOption_(ordenadas[i]));

  var out = {
    id: String(question.id),
    tipo: String(question.tipo),
    enunciado: evRichSanitize_(question.enunciado),
    ayuda: evRichSanitize_(question.ayuda),
    obligatoria: question.obligatoria === true,
    configuracion: evPublicConfig_(question.configuracion),
    opciones: publicas
  };
  if (question.medios) out.medios = evMediaOf_(question.medios);
  if (question.accesibilidad && (question.accesibilidad.etiquetaAria || question.accesibilidad.descripcionLarga)) {
    out.accesibilidad = evAccessibilityOf_(question.accesibilidad);
  }
  // Los puntos SÍ se muestran cuando el autor los reparte: el candidato tiene
  // derecho a saber cuánto vale cada pregunta. No es la clave, es el peso.
  if (question.modoPuntaje !== 'ninguno' && evNum_(question.puntos, 0) > 0) {
    out.puntos = evNum_(question.puntos, 0);
  }
  return out;
}

/**
 * Payload público completo, a partir de un snapshot publicado.
 *
 * `seed` determina la mezcla; el runner pasa el identificador del intento.
 */
function evPublicPayload_(snapshot, seed) {
  var evaluacion = snapshot.evaluacion;
  var app = evaluacion.aplicacion || {};
  var participante = evaluacion.participante || {};
  var mezclarPreguntas = app.mezclarPreguntas === true;
  var mezclarOpciones = app.mezclarOpciones === true;

  var secciones = [];
  var totalPreguntas = 0;
  for (var s = 0; s < snapshot.secciones.length; s++) {
    var section = snapshot.secciones[s];
    var preguntas = section.preguntas || [];

    // `tomarN` sirve para bancos de preguntas: se sirve un subconjunto estable.
    var seleccionadas = preguntas;
    var tomar = evNumOrNull_(section.tomarN);
    if (tomar !== null && tomar > 0 && tomar < preguntas.length) {
      var candidatas = [];
      var contenido = [];
      for (var c = 0; c < preguntas.length; c++) {
        if (evIsQuestion_(preguntas[c].tipo)) candidatas.push(preguntas[c]);
        else contenido.push(preguntas[c]);
      }
      seleccionadas = contenido.concat(
        evSeededShuffle_(candidatas, seed + '|pool|' + section.id).slice(0, tomar));
    }
    var ordenadas = (mezclarPreguntas || section.mezclar === true)
      ? evSeededShuffle_(seleccionadas, seed + '|sec|' + section.id)
      : seleccionadas;

    var publicas = [];
    for (var q = 0; q < ordenadas.length; q++) {
      publicas.push(evPublicQuestion_(ordenadas[q], seed, mezclarOpciones));
      if (evIsQuestion_(ordenadas[q].tipo)) totalPreguntas++;
    }
    secciones.push({
      id: String(section.id),
      titulo: String(section.titulo || ''),
      descripcion: evRichSanitize_(section.descripcion),
      limiteSegundos: evNumOrNull_(section.limiteSegundos),
      preguntas: publicas
    });
  }

  return {
    codigo: String(evaluacion.codigo),
    titulo: String(evaluacion.titulo || ''),
    descripcion: String(evaluacion.descripcion || ''),
    instrucciones: evRichSanitize_(evaluacion.instrucciones),
    versionEtiqueta: String(snapshot.etiqueta || ''),
    totalPreguntas: totalPreguntas,
    aplicacion: {
      duracionMinutos: evNumOrNull_(app.duracionMinutos),
      navegacion: String(app.navegacion || 'libre'),
      permitirRetroceso: app.permitirRetroceso !== false,
      mostrarProgreso: app.mostrarProgreso !== false,
      autoenviarAlExpirar: app.autoenviarAlExpirar !== false,
      guardadoAutomaticoSegundos: evClampInt_(app.guardadoAutomaticoSegundos, 0, 600, 20)
    },
    participante: {
      campos: evParticipantFields_(evWriteJson_(participante.campos)),
      requiereConsentimiento: participante.requiereConsentimiento === true,
      textoConsentimiento: String(participante.textoConsentimiento || ''),
      visibilidadResultado: String(participante.visibilidadResultado || 'solo_envio')
    },
    integridad: evIntegrityPolicy_(evWriteJson_(evaluacion.integridad)),
    tema: evThemeOf_(evaluacion.tema),
    secciones: secciones
  };
}

/**
 * `openAssessment` — portada de la evaluación, ANTES de crear el intento.
 *
 * Trae lo justo para pintar la pantalla de bienvenida: título, instrucciones,
 * duración, campos que se pedirán y consentimiento. No trae preguntas, así que
 * abrir el enlace no permite leer la prueba sin empezarla, y por eso puede
 * cachearse sin riesgo.
 */
function evOpenAssessment_(payload) {
  evRequireInstalled_();
  var codigo = evText_((payload || {}).codigo, EV_LIMITS.CODE);
  var resolved = evResolvePublic_(codigo);
  var row = resolved.row;
  var api = resolved.evaluacion;

  var base = {
    codigo: api.codigo,
    disponible: resolved.disponible,
    motivo: resolved.motivo,
    mensaje: resolved.disponible ? '' : (EV_MOTIVO_TEXTO[resolved.motivo] || 'Esta evaluación no está disponible.'),
    titulo: api.titulo,
    horaServidor: evNow_()
  };
  if (!resolved.disponible) return base;

  var version = evById_(EV_SHEET.VERSIONES, resolved.versionId);
  base.descripcion = api.descripcion;
  base.instrucciones = api.instrucciones;
  base.versionEtiqueta = version ? version.etiqueta : api.versionEtiqueta;
  base.totalPreguntas = version ? evInt_(version.preguntas, 0) : api.preguntas;
  base.duracionMinutos = api.aplicacion.duracionMinutos;
  base.intentosMaximos = api.aplicacion.intentosMaximos;
  base.participante = {
    campos: api.participante.campos,
    requiereConsentimiento: api.participante.requiereConsentimiento,
    textoConsentimiento: api.participante.textoConsentimiento
  };
  base.integridad = api.integridad;
  base.tema = api.tema;
  base.ventanaFin = row.ventana_fin || '';
  return base;
}
