/**
 * 08_Types.gs — catálogo de tipos de bloque y pregunta.
 *
 * Es el contrato compartido entre el editor, el runner del candidato y el
 * calificador. El frontend tiene el MISMO catálogo en
 * `src/features/evaluaciones/domain/questionTypes.ts` y una prueba automatizada
 * compara ambos: si alguien añade un tipo en un lado y lo olvida en el otro, la
 * suite falla. Esa era una de las grietas del módulo anterior, que declaraba 52
 * tipos en el navegador y el servidor solo entendía unos pocos.
 *
 * Cobertura: todos los tipos de Google Forms más los que un proceso de selección
 * necesita de verdad (verdadero/falso, ordenar, emparejar, clasificar, rellenar
 * huecos, escalas, moneda, porcentaje, código…).
 *
 * Campos de cada entrada:
 *   kind      'contenido' (no se responde) | 'pregunta'
 *   expects   forma del valor de respuesta; el calificador se apoya en esto
 *   options   'ninguna' | 'requeridas' | 'opcionales'
 *   auto      si el servidor puede calificarlo sin intervención humana
 *   scoring   modo de puntaje por omisión
 *   multiple  si admite varias selecciones
 */

var EV_TYPES = {

  /* ------------------------------- Contenido ------------------------------ */

  contenido_titulo:      { kind: 'contenido', expects: 'ninguno', options: 'ninguna', auto: false, scoring: 'ninguno' },
  contenido_parrafo:     { kind: 'contenido', expects: 'ninguno', options: 'ninguna', auto: false, scoring: 'ninguno' },
  contenido_aviso:       { kind: 'contenido', expects: 'ninguno', options: 'ninguna', auto: false, scoring: 'ninguno' },
  contenido_imagen:      { kind: 'contenido', expects: 'ninguno', options: 'ninguna', auto: false, scoring: 'ninguno' },
  contenido_video:       { kind: 'contenido', expects: 'ninguno', options: 'ninguna', auto: false, scoring: 'ninguno' },
  contenido_recurso:     { kind: 'contenido', expects: 'ninguno', options: 'ninguna', auto: false, scoring: 'ninguno' },
  contenido_separador:   { kind: 'contenido', expects: 'ninguno', options: 'ninguna', auto: false, scoring: 'ninguno' },

  /* ------------------------------ Texto libre ----------------------------- */

  texto_corto:           { kind: 'pregunta', expects: 'texto', options: 'ninguna', auto: true,  scoring: 'exacto' },
  texto_largo:           { kind: 'pregunta', expects: 'texto', options: 'ninguna', auto: false, scoring: 'manual' },
  correo:                { kind: 'pregunta', expects: 'texto', options: 'ninguna', auto: true,  scoring: 'exacto' },
  telefono:              { kind: 'pregunta', expects: 'texto', options: 'ninguna', auto: true,  scoring: 'exacto' },
  enlace:                { kind: 'pregunta', expects: 'texto', options: 'ninguna', auto: true,  scoring: 'exacto' },
  codigo:                { kind: 'pregunta', expects: 'texto', options: 'ninguna', auto: false, scoring: 'manual' },

  /* -------------------------------- Números ------------------------------- */

  numero:                { kind: 'pregunta', expects: 'numero', options: 'ninguna', auto: true, scoring: 'exacto' },
  decimal:               { kind: 'pregunta', expects: 'numero', options: 'ninguna', auto: true, scoring: 'exacto' },
  porcentaje:            { kind: 'pregunta', expects: 'numero', options: 'ninguna', auto: true, scoring: 'exacto' },
  moneda:                { kind: 'pregunta', expects: 'numero', options: 'ninguna', auto: true, scoring: 'exacto' },

  /* ------------------------------ Fecha y hora ---------------------------- */

  fecha:                 { kind: 'pregunta', expects: 'fecha', options: 'ninguna', auto: true, scoring: 'exacto' },
  hora:                  { kind: 'pregunta', expects: 'hora',  options: 'ninguna', auto: true, scoring: 'exacto' },
  fecha_hora:            { kind: 'pregunta', expects: 'fecha', options: 'ninguna', auto: true, scoring: 'exacto' },
  duracion:              { kind: 'pregunta', expects: 'numero', options: 'ninguna', auto: true, scoring: 'exacto' },

  /* ------------------------------- Opciones ------------------------------- */

  opcion_unica:          { kind: 'pregunta', expects: 'opcion',   options: 'requeridas', auto: true, scoring: 'exacto',  multiple: false },
  opcion_multiple:       { kind: 'pregunta', expects: 'opciones', options: 'requeridas', auto: true, scoring: 'parcial', multiple: true },
  desplegable:           { kind: 'pregunta', expects: 'opcion',   options: 'requeridas', auto: true, scoring: 'exacto',  multiple: false },
  verdadero_falso:       { kind: 'pregunta', expects: 'opcion',   options: 'requeridas', auto: true, scoring: 'exacto',  multiple: false },
  si_no_na:              { kind: 'pregunta', expects: 'opcion',   options: 'requeridas', auto: true, scoring: 'exacto',  multiple: false },
  casilla_aceptacion:    { kind: 'pregunta', expects: 'opcion',   options: 'requeridas', auto: true, scoring: 'exacto',  multiple: false },
  opcion_imagen:         { kind: 'pregunta', expects: 'opcion',   options: 'requeridas', auto: true, scoring: 'exacto',  multiple: false },

  /* -------------------------------- Escalas ------------------------------- */

  escala_lineal:         { kind: 'pregunta', expects: 'escala', options: 'ninguna', auto: true, scoring: 'exacto' },
  estrellas:             { kind: 'pregunta', expects: 'escala', options: 'ninguna', auto: true, scoring: 'exacto' },
  deslizador:            { kind: 'pregunta', expects: 'escala', options: 'ninguna', auto: true, scoring: 'exacto' },

  /* ------------------------------ Cuadrículas ----------------------------- */

  cuadricula_opcion:     { kind: 'pregunta', expects: 'matriz', options: 'requeridas', auto: true, scoring: 'parcial', multiple: false },
  cuadricula_casillas:   { kind: 'pregunta', expects: 'matriz', options: 'requeridas', auto: true, scoring: 'parcial', multiple: true },
  likert:                { kind: 'pregunta', expects: 'matriz', options: 'requeridas', auto: false, scoring: 'ninguno', multiple: false },

  /* --------------------------- Estructuras ricas -------------------------- */

  ordenar:               { kind: 'pregunta', expects: 'orden',          options: 'requeridas', auto: true, scoring: 'parcial' },
  emparejar:             { kind: 'pregunta', expects: 'emparejamiento', options: 'requeridas', auto: true, scoring: 'parcial' },
  clasificar:            { kind: 'pregunta', expects: 'clasificacion',  options: 'requeridas', auto: true, scoring: 'parcial' },
  rellenar_huecos:       { kind: 'pregunta', expects: 'huecos',         options: 'ninguna',    auto: true, scoring: 'parcial' },

  /* -------------------------------- Archivos ------------------------------ */

  archivo_enlace:        { kind: 'pregunta', expects: 'archivo', options: 'ninguna', auto: false, scoring: 'manual' }
};

/** ¿Existe el tipo? */
function evTypeExists_(type) {
  return !!EV_TYPES[String(type)];
}

/** Declaración de un tipo, o `null`. */
function evTypeSpec_(type) {
  return EV_TYPES[String(type)] || null;
}

/** ¿Es un bloque que recoge respuesta? */
function evIsQuestion_(type) {
  var spec = evTypeSpec_(type);
  return !!spec && spec.kind === 'pregunta';
}

/** Lista de tipos declarados (para la paridad con el frontend y el diagnóstico). */
function evTypeIds_() {
  return Object.keys(EV_TYPES).sort();
}

/**
 * ¿Puede el servidor calificar esta pregunta sin intervención humana?
 *
 * Depende del tipo Y del contenido: una pregunta de opción única sin ninguna
 * opción marcada como correcta NO es calificable, y tratarla como tal regalaría
 * ceros. En ese caso queda pendiente de revisión, que es lo honesto.
 */
function evIsAutoGradable_(question, options) {
  var spec = evTypeSpec_(question.tipo);
  if (!spec || spec.kind !== 'pregunta') return false;
  if (question.modo_puntaje === 'ninguno' || question.modo_puntaje === 'manual') return false;
  if (!spec.auto) return false;

  if (spec.options === 'requeridas') {
    if (!options || options.length === 0) return false;
    if (spec.expects === 'emparejamiento' || spec.expects === 'clasificacion') {
      for (var i = 0; i < options.length; i++) {
        if (String(options[i].clave_emparejamiento || '')) return true;
      }
      return false;
    }
    if (spec.expects === 'orden') return options.length >= 2;
    if (spec.expects === 'matriz') {
      // Una cuadrícula es calificable si al menos una celda tiene clave.
      for (var g = 0; g < options.length; g++) {
        if (String(options[g].clave_emparejamiento || '')) return true;
      }
      return false;
    }
    for (var o = 0; o < options.length; o++) {
      if (options[o].correcta === true) return true;
    }
    return false;
  }

  if (spec.expects === 'huecos') {
    var blanks = (question.respuesta_esperada && question.respuesta_esperada.huecos) || [];
    return Array.isArray(blanks) && blanks.length > 0;
  }

  var expected = question.respuesta_esperada;
  if (expected === null || expected === undefined) return false;
  if (typeof expected === 'object') {
    if (Array.isArray(expected.valores)) return expected.valores.length > 0;
    return expected.valor !== undefined && expected.valor !== null && expected.valor !== '';
  }
  return String(expected) !== '';
}

/**
 * ¿Esta pregunta EXIGE revisión humana?
 *
 * Distinto de «no es auto-calificable»: aquí entran los tipos cuyo valor está en
 * el juicio de una persona (texto largo, código, archivo) y todo lo que el autor
 * marcó explícitamente como manual.
 */
function evRequiresManualReview_(question, options) {
  var spec = evTypeSpec_(question.tipo);
  if (!spec || spec.kind !== 'pregunta') return false;
  if (question.modo_puntaje === 'ninguno') return false;
  if (question.modo_puntaje === 'manual') return true;
  if (!spec.auto) return evNum_(question.puntos, 0) > 0;
  return !evIsAutoGradable_(question, options) && evNum_(question.puntos, 0) > 0;
}
