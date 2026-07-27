/**
 * IdService.gs — identificadores estables.
 *
 * Reglas:
 *  · El número de fila NUNCA es identidad.
 *  · Los ids son opacos: el servidor no interpreta su contenido, solo exige que
 *    sean cadenas seguras y únicas.
 *  · Los ids que llega del cliente se aceptan si son opacos y válidos (así el
 *    estado del formulario no se pierde al guardar); si faltan o si la entidad
 *    se duplica, el servidor genera uno nuevo.
 */

var EVAL_ID_PREFIX = {
  ASSESSMENT: 'asm',
  SECTION: 'sec',
  QUESTION: 'qst',
  OPTION: 'opt',
  VERSION: 'ver',
  ATTEMPT: 'att',
  ANSWER: 'ans',
  REQUEST: 'req',
  AUDIT: 'aud'
};

/** Un id nuevo con prefijo, p. ej. `qst_9f1c…`. */
function evalNewId_(prefix) {
  return String(prefix) + '_' + Utilities.getUuid();
}

/**
 * ¿Es un id aceptable? Solo letras, números, guion y guion bajo, 4..120
 * caracteres. Esto descarta fórmulas, saltos de línea e inyecciones.
 */
function evalIsValidId_(value) {
  if (typeof value !== 'string') return false;
  return /^[A-Za-z0-9_-]{4,120}$/.test(value);
}

/** Conserva el id del cliente si es válido; si no, genera uno nuevo. */
function evalKeepOrNewId_(candidate, prefix) {
  return evalIsValidId_(candidate) ? candidate : evalNewId_(prefix);
}

/**
 * Código público legible y único dentro de la hoja, p. ej. `EVL-PRES-4F2A`.
 * `taken` es un objeto usado como conjunto de códigos ya ocupados.
 */
function evalPublicCode_(title, taken) {
  var stub = String(title || '')
    .normalize ? String(title || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '') : String(title || '');
  stub = stub.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  if (stub.length < 3) stub = 'EVAL';
  var attempts = 0;
  while (attempts < 50) {
    var suffix = Utilities.getUuid().replace(/-/g, '').slice(0, 4).toUpperCase();
    var code = 'EVL-' + stub + '-' + suffix;
    if (!taken || !taken[code]) return code;
    attempts++;
  }
  return 'EVL-' + stub + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
}

/** Hash corto y estable de un texto, para el `checksum` de los snapshots. */
function evalChecksum_(text) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(text),
    Utilities.Charset.UTF_8
  );
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    var hex = b.toString(16);
    out += hex.length === 1 ? '0' + hex : hex;
  }
  return out.slice(0, 32);
}
