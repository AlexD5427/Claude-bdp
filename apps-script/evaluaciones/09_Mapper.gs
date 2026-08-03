/**
 * 09_Mapper.gs — traducción entre la fila de la hoja y el objeto de la API.
 *
 * Dos formas conviven a propósito:
 *
 *   FILA      claves con guion bajo, valores planos, una tabla por entidad. Es lo
 *             que hace que el libro sea legible y auditable a mano.
 *   API       objetos anidados en camelCase: la evaluación contiene secciones, la
 *             sección contiene preguntas y la pregunta contiene sus opciones. Es
 *             lo que hace que el editor pueda mandar y recibir un solo documento.
 *
 * Toda conversión pasa por aquí. Ninguna otra capa toca nombres de columna, y por
 * eso el modelo de datos se puede evolucionar cambiando el manifiesto y este
 * archivo, sin tocar la lógica de negocio.
 *
 * Las funciones `…Desde…` (fila → API) son TOLERANTES: rellenan con valores por
 * omisión y nunca lanzan, porque una fila editada a mano no debe romper la
 * lectura. Las funciones `…Hacia…` (API → fila) son ESTRICTAS: sanean, acotan y
 * validan enumeraciones, porque son la frontera de escritura.
 */

var EV_CRITERIOS = ['porcentaje', 'puntos'];

var EV_CAMPOS_PARTICIPANTE = [
  'nombre', 'documento', 'correo', 'telefono', 'cargo', 'proceso', 'observaciones'
];

/* --------------------------- Evaluación: fila → API ----------------------- */

function evEvaluationFromRow_(row) {
  return {
    id: row.id,
    codigo: row.codigo,
    titulo: row.titulo,
    descripcion: row.descripcion || '',
    categoria: evEnum_(row.categoria, 'CATEGORIA', 'conocimientos'),
    estado: evEnum_(row.estado, 'ESTADO', 'borrador'),
    revision: evInt_(row.revision, 1),
    ultimoCliente: row.ultimo_cliente || '',
    creadoEn: row.creado_en || '',
    creadoPor: row.creado_por || '',
    actualizadoEn: row.actualizado_en || '',
    actualizadoPor: row.actualizado_por || '',
    publicadoEn: row.publicado_en || '',
    publicadoPor: row.publicado_por || '',
    archivadoEn: row.archivado_en || '',
    eliminadoEn: row.eliminado_en || '',
    versionMayor: evInt_(row.version_mayor, 0),
    versionMenor: evInt_(row.version_menor, 0),
    versionEtiqueta: evVersionLabel_(evInt_(row.version_mayor, 0), evInt_(row.version_menor, 0)),
    versionVigenteId: row.version_vigente_id || '',
    preguntas: evInt_(row.preguntas, 0),
    preguntasCalificables: evInt_(row.preguntas_calificables, 0),
    puntosTotales: evNum_(row.puntos_totales, 0),
    instrucciones: evRichRead_(row.instrucciones_json, row.instrucciones_texto),
    notasInternas: row.notas_internas || '',
    aplicacion: {
      duracionMinutos: evNumOrNull_(row.duracion_minutos),
      segundosExtra: evInt_(row.duracion_segundos_extra, 0),
      puntajeAprobacion: evNumOrNull_(row.puntaje_aprobacion),
      criterioAprobacion: EV_CRITERIOS.indexOf(String(row.criterio_aprobacion)) >= 0
        ? String(row.criterio_aprobacion) : 'porcentaje',
      intentosMaximos: evInt_(row.intentos_maximos, 1),
      ventanaInicio: row.ventana_inicio || '',
      ventanaFin: row.ventana_fin || '',
      navegacion: evEnum_(row.navegacion, 'NAVEGACION', 'libre'),
      permitirRetroceso: evBool_(row.permitir_retroceso, true),
      mostrarProgreso: evBool_(row.mostrar_progreso, true),
      mezclarPreguntas: evBool_(row.mezclar_preguntas, false),
      mezclarOpciones: evBool_(row.mezclar_opciones, false),
      autoenviarAlExpirar: evBool_(row.autoenviar_al_expirar, true),
      guardadoAutomaticoSegundos: evClampInt_(row.guardado_automatico_segundos, 0, 600, 20)
    },
    participante: {
      campos: evParticipantFields_(row.campos_participante_json),
      requiereConsentimiento: evBool_(row.requiere_consentimiento, false),
      textoConsentimiento: row.texto_consentimiento || '',
      visibilidadResultado: evEnum_(row.visibilidad_resultado, 'VISIBILIDAD_RESULTADO', 'solo_envio')
    },
    integridad: evIntegrityPolicy_(row.integridad_json),
    tema: evParseJson_(row.tema_json, {}) || {},
    etiquetas: evParseJson_(row.etiquetas_json, []) || [],
    procesos: evParseJson_(row.procesos_json, []) || [],
    reglas: evParseJson_(row.reglas_json, []) || [],
    extras: evParseJson_(row.extras_json, {}) || {},
    esquemaVersion: evInt_(row.esquema_version, EV_BACKEND.schemaVersion)
  };
}

/** Etiqueta de versión legible: `v0` cuando aún no se ha publicado nada. */
function evVersionLabel_(major, minor) {
  if (!major) return 'v0';
  return 'v' + major + '.' + minor;
}

/**
 * Campos que se piden al participante.
 *
 * `nombre` y `documento` son siempre obligatorios: sin ellos un resultado no se
 * puede atribuir a nadie, y el informe en PDF los exige. El resto es opcional y
 * configurable.
 */
function evParticipantFields_(raw) {
  var parsed = evParseJson_(raw, null);
  var out = [];
  var seen = {};
  if (Array.isArray(parsed)) {
    for (var i = 0; i < parsed.length; i++) {
      var entry = parsed[i];
      var key = String((entry && entry.clave) || entry || '');
      if (EV_CAMPOS_PARTICIPANTE.indexOf(key) < 0 || seen[key]) continue;
      seen[key] = true;
      out.push({
        clave: key,
        etiqueta: evText_((entry && entry.etiqueta) || '', 120) || evParticipantLabel_(key),
        obligatorio: key === 'nombre' || key === 'documento' ? true : (entry && entry.obligatorio === true),
        activo: entry && entry.activo === false ? false : true
      });
    }
  }
  var required = ['nombre', 'documento'];
  for (var r = 0; r < required.length; r++) {
    if (!seen[required[r]]) {
      out.unshift({
        clave: required[r], etiqueta: evParticipantLabel_(required[r]),
        obligatorio: true, activo: true
      });
    }
  }
  return out;
}

function evParticipantLabel_(key) {
  var labels = {
    nombre: 'Nombre completo',
    documento: 'Documento de identidad (CI)',
    correo: 'Correo electrónico',
    telefono: 'Teléfono',
    cargo: 'Cargo al que postula',
    proceso: 'Proceso',
    observaciones: 'Observaciones'
  };
  return labels[key] || key;
}

/** Política de integridad, con valores por omisión razonables. */
function evIntegrityPolicy_(raw) {
  var p = evParseJson_(raw, {}) || {};
  return {
    registrarCambioPestana: p.registrarCambioPestana !== false,
    registrarCopiaPegado: p.registrarCopiaPegado !== false,
    registrarTiempos: p.registrarTiempos !== false,
    registrarNavegacion: p.registrarNavegacion !== false,
    bloquearPegado: p.bloquearPegado === true,
    bloquearMenuContextual: p.bloquearMenuContextual === true,
    avisarAlSalir: p.avisarAlSalir !== false,
    pantallaCompletaSugerida: p.pantallaCompletaSugerida === true,
    /** Umbral de eventos de alerta a partir del cual el intento se marca en rojo. */
    umbralRiesgo: evClampInt_(p.umbralRiesgo, 1, 100, 5)
  };
}

/* --------------------------- Evaluación: API → fila ----------------------- */

/**
 * Construye la fila a partir del objeto de la API y de la fila anterior.
 *
 * `previous` aporta lo que el cliente NO puede decidir: fechas de creación,
 * código público, revisión, estado y contadores. Que el servidor sea el dueño de
 * esos campos es lo que impide que un cliente desincronizado «arregle» el estado
 * de una evaluación publicada mandando `estado: "borrador"`.
 */
function evEvaluationToRow_(api, previous, context) {
  var now = context.now;
  var app = (api && api.aplicacion) || {};
  var part = (api && api.participante) || {};
  var instr = evRichPair_(api ? api.instrucciones : null);

  return {
    id: previous.id,
    codigo: previous.codigo,
    titulo: evText_(api && api.titulo, EV_LIMITS.TITLE) || previous.titulo || 'Evaluación sin título',
    descripcion: evText_(api && api.descripcion, 2000),
    categoria: evEnum_(api && api.categoria, 'CATEGORIA', 'conocimientos'),
    estado: previous.estado,
    revision: context.revision,
    ultimo_cliente: evText_(context.cliente, 120),
    creado_en: previous.creado_en || now,
    creado_por: previous.creado_por || context.actor,
    actualizado_en: now,
    actualizado_por: context.actor,
    publicado_en: previous.publicado_en || '',
    publicado_por: previous.publicado_por || '',
    archivado_en: previous.archivado_en || '',
    eliminado_en: previous.eliminado_en || '',
    version_mayor: evInt_(previous.version_mayor, 0),
    version_menor: evInt_(previous.version_menor, 0),
    version_vigente_id: previous.version_vigente_id || '',
    preguntas: context.preguntas,
    preguntas_calificables: context.preguntasCalificables,
    puntos_totales: context.puntosTotales,
    instrucciones_json: instr.json,
    instrucciones_texto: instr.texto,
    notas_internas: evText_(api && api.notasInternas, 8000),
    duracion_minutos: evNormalizeDuration_(app.duracionMinutos),
    duracion_segundos_extra: evClampInt_(app.segundosExtra, 0, 3600, 0),
    puntaje_aprobacion: evNormalizePassing_(app.puntajeAprobacion, app.criterioAprobacion),
    criterio_aprobacion: EV_CRITERIOS.indexOf(String(app.criterioAprobacion)) >= 0
      ? String(app.criterioAprobacion) : 'porcentaje',
    intentos_maximos: evClampInt_(app.intentosMaximos, 1, 20, 1),
    ventana_inicio: evNormalizeIso_(app.ventanaInicio),
    ventana_fin: evNormalizeIso_(app.ventanaFin),
    navegacion: evEnum_(app.navegacion, 'NAVEGACION', 'libre'),
    permitir_retroceso: app.permitirRetroceso !== false,
    mostrar_progreso: app.mostrarProgreso !== false,
    mezclar_preguntas: app.mezclarPreguntas === true,
    mezclar_opciones: app.mezclarOpciones === true,
    autoenviar_al_expirar: app.autoenviarAlExpirar !== false,
    guardado_automatico_segundos: evClampInt_(app.guardadoAutomaticoSegundos, 0, 600, 20),
    campos_participante_json: evWriteJson_(evParticipantFields_(evWriteJson_(part.campos))),
    requiere_consentimiento: part.requiereConsentimiento === true,
    texto_consentimiento: evText_(part.textoConsentimiento, 8000),
    visibilidad_resultado: evEnum_(part.visibilidadResultado, 'VISIBILIDAD_RESULTADO', 'solo_envio'),
    integridad_json: evWriteJson_(evIntegrityPolicy_(evWriteJson_(api && api.integridad))),
    tema_json: evWriteJson_(evThemeOf_(api && api.tema)),
    etiquetas_json: evWriteJson_(evTextArray_(api && api.etiquetas, 30, 60)),
    procesos_json: evWriteJson_(evTextArray_(api && api.procesos, 60, 120)),
    reglas_json: evWriteJson_(evRulesOf_(api && api.reglas)),
    extras_json: evWriteJson_(api && typeof api.extras === 'object' ? api.extras : {}),
    esquema_version: EV_BACKEND.schemaVersion
  };
}

/** Duración: entero positivo de minutos, o `null` para «sin límite». */
function evNormalizeDuration_(value) {
  var minutes = evNumOrNull_(value);
  if (minutes === null) return null;
  if (minutes <= 0) return null;
  return Math.min(Math.round(minutes), 24 * 60);
}

/**
 * Puntaje de aprobación, acotado solo donde el límite es del dominio.
 *
 * En porcentaje se acota a 0–100: no existe un 120 %. En puntos NO se acota al
 * total de la evaluación, y esa asimetría es deliberada. El total cambia cada vez
 * que el autor añade o quita una pregunta; si se recortara al guardar, quien
 * escribe «aprueba con 50 puntos» y luego construye la prueba vería su número
 * mutilado sin explicación. En su lugar, la validación de publicación lo detecta y
 * dice exactamente cuántos puntos reparte la evaluación (APROBACION_IMPOSIBLE).
 */
function evNormalizePassing_(value, criterio) {
  var score = evNumOrNull_(value);
  if (score === null) return null;
  if (String(criterio) === 'puntos') return evRound_(Math.max(0, score), 2);
  return evRound_(Math.min(Math.max(0, score), 100), 2);
}

/** Normaliza una fecha a ISO-8601, o cadena vacía. */
function evNormalizeIso_(value) {
  var ms = evToMs_(value);
  return ms === null ? '' : evFromMs_(ms);
}

var EV_ACENTOS = ['cian', 'azul', 'indigo', 'esmeralda', 'violeta', 'ambar'];

function evThemeOf_(theme) {
  var t = theme || {};
  return {
    acento: EV_ACENTOS.indexOf(String(t.acento)) >= 0 ? String(t.acento) : 'cian',
    densidad: String(t.densidad) === 'compacta' ? 'compacta' : 'comoda',
    portadaUrl: evRichSafeLink_(t.portadaUrl),
    logoUrl: evRichSafeLink_(t.logoUrl),
    mostrarNumeracion: t.mostrarNumeracion !== false,
    animaciones: t.animaciones !== false
  };
}

/**
 * Reglas de ramificación: «si la pregunta X responde Y, salta a la sección Z».
 *
 * Se guardan saneadas pero su coherencia (que las referencias existan) la valida
 * `10_Validate.gs` al publicar, no aquí: un borrador puede tener una regla que
 * apunte a una sección que el autor está a punto de crear.
 */
function evRulesOf_(rules) {
  if (!Array.isArray(rules)) return [];
  var out = [];
  for (var i = 0; i < rules.length && out.length < 200; i++) {
    var r = rules[i];
    if (!r || typeof r !== 'object') continue;
    var accion = String(r.accion) === 'terminar' ? 'terminar'
      : (String(r.accion) === 'mostrar' ? 'mostrar' : 'saltar');
    out.push({
      id: evKeepId_(r.id, 'rg'),
      preguntaId: evRaw_(r.preguntaId, 140),
      operador: ['igual', 'distinto', 'contiene', 'mayor', 'menor', 'vacio', 'no_vacio']
        .indexOf(String(r.operador)) >= 0 ? String(r.operador) : 'igual',
      valor: evText_(r.valor, 400),
      accion: accion,
      destinoSeccionId: evRaw_(r.destinoSeccionId, 140),
      destinoPreguntaId: evRaw_(r.destinoPreguntaId, 140)
    });
  }
  return out;
}

/* ---------------------------- Sección: fila ↔ API ------------------------- */

function evSectionFromRow_(row) {
  return {
    id: row.id,
    titulo: row.titulo,
    descripcion: evRichRead_(row.descripcion_json, row.descripcion_texto),
    orden: evInt_(row.orden, 0),
    limiteSegundos: evNumOrNull_(row.limite_segundos),
    mezclar: evBool_(row.mezclar, false),
    tomarN: evNumOrNull_(row.tomar_n),
    peso: evNum_(row.peso, 1),
    activo: evBool_(row.activo, true),
    preguntas: []
  };
}

function evSectionToRow_(api, evaluacionId, orden, previous, now) {
  var desc = evRichPair_(api ? api.descripcion : null);
  return {
    id: api.id,
    evaluacion_id: evaluacionId,
    titulo: evText_(api.titulo, EV_LIMITS.TITLE) || 'Sección ' + (orden + 1),
    descripcion_json: desc.json,
    descripcion_texto: desc.texto,
    orden: orden,
    limite_segundos: evNumOrNull_(api.limiteSegundos) === null ? null
      : evClampInt_(api.limiteSegundos, 0, 24 * 3600, 0),
    mezclar: api.mezclar === true,
    tomar_n: evNumOrNull_(api.tomarN) === null ? null : evClampInt_(api.tomarN, 1, EV_LIMITS.QUESTIONS, 1),
    peso: evRound_(Math.max(0, evNum_(api.peso, 1)), 3),
    activo: true,
    creado_en: (previous && previous.creado_en) || now,
    actualizado_en: now
  };
}

/* ---------------------------- Pregunta: fila ↔ API ------------------------ */

function evQuestionFromRow_(row) {
  return {
    id: row.id,
    seccionId: row.seccion_id,
    tipo: row.tipo,
    orden: evInt_(row.orden, 0),
    enunciado: evRichRead_(row.enunciado_json, row.enunciado_texto),
    ayuda: evRichRead_(row.ayuda_json, row.ayuda_texto),
    obligatoria: evBool_(row.obligatoria, false),
    modoPuntaje: evEnum_(row.modo_puntaje, 'MODO_PUNTAJE', 'ninguno'),
    puntos: evNum_(row.puntos, 0),
    penalizacion: evNum_(row.penalizacion, 0),
    competencia: row.competencia || '',
    codigo: row.codigo || '',
    respuestaEsperada: evParseJson_(row.respuesta_esperada_json, null),
    configuracion: evParseJson_(row.configuracion_json, {}) || {},
    validacion: evParseJson_(row.validacion_json, {}) || {},
    retroalimentacion: evParseJson_(row.retroalimentacion_json, {}) || {},
    medios: evParseJson_(row.medios_json, null),
    accesibilidad: evParseJson_(row.accesibilidad_json, {}) || {},
    etiquetas: evParseJson_(row.etiquetas_json, []) || [],
    activo: evBool_(row.activo, true),
    opciones: []
  };
}

function evQuestionToRow_(api, evaluacionId, seccionId, orden, previous, now) {
  var enunciado = evRichPair_(api.enunciado);
  var ayuda = evRichPair_(api.ayuda);
  var spec = evTypeSpec_(api.tipo);
  var esPregunta = !!spec && spec.kind === 'pregunta';
  var modo = esPregunta
    ? evEnum_(api.modoPuntaje, 'MODO_PUNTAJE', spec.scoring)
    : 'ninguno';
  return {
    id: api.id,
    evaluacion_id: evaluacionId,
    seccion_id: seccionId,
    tipo: String(api.tipo),
    orden: orden,
    enunciado_json: enunciado.json,
    enunciado_texto: enunciado.texto,
    ayuda_json: ayuda.json,
    ayuda_texto: ayuda.texto,
    obligatoria: esPregunta && api.obligatoria === true,
    modo_puntaje: modo,
    puntos: modo === 'ninguno' ? 0 : evRound_(Math.max(0, evNum_(api.puntos, 1)), 3),
    penalizacion: evRound_(Math.max(0, evNum_(api.penalizacion, 0)), 3),
    competencia: evText_(api.competencia, 160),
    codigo: evText_(api.codigo, 80),
    respuesta_esperada_json: evWriteJson_(evExpectedOf_(api.tipo, api.respuestaEsperada)),
    configuracion_json: evWriteJson_(evQuestionConfigOf_(api.tipo, api.configuracion)),
    validacion_json: evWriteJson_(evQuestionValidationOf_(api.validacion)),
    retroalimentacion_json: evWriteJson_(evFeedbackOf_(api.retroalimentacion)),
    medios_json: evWriteJson_(evMediaOf_(api.medios)),
    accesibilidad_json: evWriteJson_(evAccessibilityOf_(api.accesibilidad)),
    etiquetas_json: evWriteJson_(evTextArray_(api.etiquetas, 30, 60)),
    activo: true,
    creado_en: (previous && previous.creado_en) || now,
    actualizado_en: now
  };
}

/**
 * Respuesta esperada por tipo.
 *
 * Es lo que se compara al calificar preguntas SIN opciones. Se guarda como
 * objeto (`{ valor }`, `{ valores }`, `{ huecos }`) para que el formato no cambie
 * cuando se añadan modos nuevos.
 */
function evExpectedOf_(tipo, expected) {
  var spec = evTypeSpec_(tipo);
  if (!spec || spec.kind !== 'pregunta') return null;
  if (expected === null || expected === undefined || expected === '') return null;

  if (spec.expects === 'huecos') {
    var source = Array.isArray(expected) ? expected
      : (expected && Array.isArray(expected.huecos) ? expected.huecos : []);
    var huecos = [];
    for (var i = 0; i < source.length && huecos.length < 50; i++) {
      var hueco = source[i];
      var respuestas = evTextArray_(
        hueco && hueco.respuestas !== undefined ? hueco.respuestas : hueco, 10, 200);
      if (respuestas.length === 0) continue;
      huecos.push({
        clave: evText_((hueco && hueco.clave) || String(huecos.length + 1), 40),
        respuestas: respuestas,
        ignorarMayusculas: !(hueco && hueco.ignorarMayusculas === false),
        ignorarAcentos: !(hueco && hueco.ignorarAcentos === false)
      });
    }
    return huecos.length > 0 ? { huecos: huecos } : null;
  }

  var valor = (expected && typeof expected === 'object' && !Array.isArray(expected))
    ? expected.valor : expected;
  if (Array.isArray(valor)) {
    var valores = evTextArray_(valor, 20, 400);
    return valores.length > 0 ? { valores: valores } : null;
  }
  if (valor === null || valor === undefined || valor === '') return null;

  var out = { valor: spec.expects === 'numero' || spec.expects === 'escala'
    ? evNum_(valor, 0)
    : evText_(valor, 400) };
  if (spec.expects === 'numero' || spec.expects === 'escala') {
    out.tolerancia = Math.abs(evNum_(expected && expected.tolerancia, 0));
  } else {
    out.ignorarMayusculas = !(expected && expected.ignorarMayusculas === false);
    out.ignorarAcentos = !(expected && expected.ignorarAcentos === false);
    var alternativas = evTextArray_(expected && expected.alternativas, 20, 400);
    if (alternativas.length > 0) out.alternativas = alternativas;
  }
  return out;
}

/**
 * Configuración de presentación, filtrada por tipo.
 *
 * Es una lista blanca: una clave que no esté aquí no se guarda. Así el objeto no
 * se convierte en un cajón de sastre y el runner del candidato sabe exactamente
 * qué puede encontrar.
 */
var EV_CONFIG_KEYS = [
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

function evQuestionConfigOf_(tipo, config) {
  var source = config && typeof config === 'object' ? config : {};
  var out = {};
  for (var i = 0; i < EV_CONFIG_KEYS.length; i++) {
    var key = EV_CONFIG_KEYS[i];
    var value = source[key];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'number') { out[key] = value; continue; }
    if (typeof value === 'boolean') { out[key] = value; continue; }
    if (Array.isArray(value)) { out[key] = evTextArray_(value, 60, 400); continue; }
    if (key === 'imagenUrl' || key === 'videoUrl' || key === 'enlaceUrl') {
      var url = evRichSafeLink_(value);
      if (url) out[key] = url;
      continue;
    }
    out[key] = evText_(value, 600);
  }
  return out;
}

function evQuestionValidationOf_(validation) {
  var v = validation && typeof validation === 'object' ? validation : {};
  var out = {};
  if (v.mensaje) out.mensaje = evText_(v.mensaje, 400);
  if (v.expresion) out.expresion = evText_(v.expresion, 400);
  if (evNumOrNull_(v.minimo) !== null) out.minimo = evNum_(v.minimo, 0);
  if (evNumOrNull_(v.maximo) !== null) out.maximo = evNum_(v.maximo, 0);
  return out;
}

function evFeedbackOf_(feedback) {
  var f = feedback && typeof feedback === 'object' ? feedback : {};
  var out = {};
  if (f.correcta) out.correcta = evText_(f.correcta, 2000);
  if (f.incorrecta) out.incorrecta = evText_(f.incorrecta, 2000);
  if (f.general) out.general = evText_(f.general, 2000);
  return out;
}

function evMediaOf_(media) {
  if (!media || typeof media !== 'object') return null;
  var url = evRichSafeLink_(media.url);
  if (!url) return null;
  var kinds = ['imagen', 'video', 'audio', 'enlace'];
  return {
    tipo: kinds.indexOf(String(media.tipo)) >= 0 ? String(media.tipo) : 'imagen',
    url: url,
    alt: evText_(media.alt, 400),
    pie: evText_(media.pie, 400)
  };
}

function evAccessibilityOf_(a11y) {
  var a = a11y && typeof a11y === 'object' ? a11y : {};
  var out = {};
  if (a.etiquetaAria) out.etiquetaAria = evText_(a.etiquetaAria, 300);
  if (a.descripcionLarga) out.descripcionLarga = evText_(a.descripcionLarga, 4000);
  return out;
}

/* ---------------------------- Opción: fila ↔ API -------------------------- */

function evOptionFromRow_(row) {
  return {
    id: row.id,
    preguntaId: row.pregunta_id,
    texto: evRichRead_(row.texto_json, row.texto_plano),
    valor: row.valor || '',
    orden: evInt_(row.orden, 0),
    correcta: evBool_(row.correcta, false),
    puntos: evNum_(row.puntos, 0),
    claveEmparejamiento: row.clave_emparejamiento || '',
    grupo: row.grupo || '',
    imagenUrl: row.imagen_url || '',
    retroalimentacion: row.retroalimentacion || '',
    activo: evBool_(row.activo, true)
  };
}

function evOptionToRow_(api, evaluacionId, preguntaId, orden, previous, now) {
  var texto = evRichPair_(api.texto);
  return {
    id: api.id,
    pregunta_id: preguntaId,
    evaluacion_id: evaluacionId,
    texto_json: texto.json,
    texto_plano: texto.texto,
    valor: evText_(api.valor, 200) || ('op' + (orden + 1)),
    orden: orden,
    correcta: api.correcta === true,
    puntos: evRound_(evNum_(api.puntos, 0), 3),
    clave_emparejamiento: evText_(api.claveEmparejamiento, 200),
    grupo: evText_(api.grupo, 120),
    imagen_url: evRichSafeLink_(api.imagenUrl),
    retroalimentacion: evText_(api.retroalimentacion, 2000),
    activo: true,
    creado_en: (previous && previous.creado_en) || now,
    actualizado_en: now
  };
}

/* ----------------------------- Intento: fila → API ----------------------- */

function evAttemptFromRow_(row) {
  return {
    id: row.id,
    evaluacionId: row.evaluacion_id,
    versionId: row.version_id,
    versionEtiqueta: row.version_etiqueta || '',
    participante: {
      nombre: row.participante_nombre || '',
      documento: row.participante_documento || '',
      correo: row.participante_correo || '',
      extra: evParseJson_(row.participante_json, {}) || {}
    },
    estado: evEnum_(row.estado, 'ESTADO_INTENTO', 'en_curso'),
    iniciadoEn: row.iniciado_en || '',
    limiteEn: row.limite_en || '',
    ultimoGuardadoEn: row.ultimo_guardado_en || '',
    enviadoEn: row.enviado_en || '',
    envioAutomatico: evBool_(row.envio_automatico, false),
    segundosUsados: evInt_(row.segundos_usados, 0),
    puntosObtenidos: evNumOrNull_(row.puntos_obtenidos),
    puntosPosibles: evNumOrNull_(row.puntos_posibles),
    nota: evNumOrNull_(row.nota),
    notaAutomatica: evNumOrNull_(row.nota_automatica),
    correctas: evInt_(row.correctas, 0),
    incorrectas: evInt_(row.incorrectas, 0),
    sinResponder: evInt_(row.sin_responder, 0),
    calificables: evInt_(row.calificables, 0),
    pendientesRevision: evInt_(row.pendientes_revision, 0),
    estadoCalificacion: evEnum_(row.estado_calificacion, 'CALIFICACION', 'automatica'),
    aprobado: evBoolOrNull_(row.aprobado),
    calificadoEn: row.calificado_en || '',
    calificadoPor: row.calificado_por || '',
    riesgoIntegridad: evInt_(row.riesgo_integridad, 0),
    eventosIntegridad: evInt_(row.eventos_integridad, 0),
    resumenIntegridad: evParseJson_(row.resumen_integridad_json, {}) || {},
    agenteUsuario: row.agente_usuario || '',
    zonaHoraria: row.zona_horaria || '',
    procesoId: row.proceso_id || '',
    notasRevision: row.notas_revision || ''
  };
}

function evAnswerFromRow_(row) {
  return {
    id: row.id,
    intentoId: row.intento_id,
    preguntaId: row.pregunta_id,
    tipo: row.tipo,
    orden: evInt_(row.orden, 0),
    opciones: evParseJson_(row.opciones_json, []) || [],
    valor: evUnwrapValue_(row.valor_json),
    valorTexto: row.valor_texto || '',
    correcta: evBoolOrNull_(row.correcta),
    puntosObtenidos: evNumOrNull_(row.puntos_obtenidos),
    puntosPosibles: evNum_(row.puntos_posibles, 0),
    requiereRevision: evBool_(row.requiere_revision, false),
    comentarioRevisor: row.comentario_revisor || '',
    segundosEnPregunta: evInt_(row.segundos_en_pregunta, 0),
    visitas: evInt_(row.visitas, 0),
    cambios: evInt_(row.cambios, 0),
    respondidaEn: row.respondida_en || ''
  };
}

/**
 * El valor de una respuesta se guarda envuelto en `{ v: … }`.
 *
 * Sin el envoltorio, un candidato que escribe literalmente `{"a":1}` en un campo
 * de texto produciría una celda indistinguible de un valor estructurado, y al
 * leerla volvería como objeto. El envoltorio hace que el tipo del dato sobreviva
 * la ida y vuelta.
 */
function evUnwrapValue_(raw) {
  var parsed = evParseJson_(raw, null);
  if (parsed && typeof parsed === 'object' && Object.prototype.hasOwnProperty.call(parsed, 'v')) {
    return parsed.v;
  }
  return parsed;
}

function evWrapValue_(value) {
  if (value === null || value === undefined || value === '') return '';
  return evWriteJson_({ v: value });
}

function evIntegrityEventFromRow_(row) {
  return {
    id: row.id,
    intentoId: row.intento_id,
    secuencia: evInt_(row.secuencia, 0),
    tipo: row.tipo,
    severidad: evEnum_(row.severidad, 'SEVERIDAD_EVENTO', 'info'),
    preguntaId: row.pregunta_id || '',
    ocurridoEn: row.ocurrido_en || '',
    segundosDesdeInicio: evInt_(row.segundos_desde_inicio, 0),
    duracionMs: evInt_(row.duracion_ms, 0),
    detalle: evParseJson_(row.detalle_json, {}) || {}
  };
}
