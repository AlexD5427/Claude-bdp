/**
 * 02_Util.gs — coerciones, identificadores, tiempo y hashes.
 *
 * Funciones puras y sin estado. Nada de aquí abre el libro ni escribe: son las
 * herramientas que usan todas las capas superiores, y por eso están en un
 * archivo que no depende de nada más que del manifiesto.
 */

/* ------------------------------- Propiedades ------------------------------ */

/** Lee una Script Property. Nunca la registra en el diario. */
function evProp_(key, fallback) {
  try {
    var value = PropertiesService.getScriptProperties().getProperty(key);
    if (value === null || value === undefined || value === '') return fallback;
    return value;
  } catch (e) {
    return fallback;
  }
}

/** Escribe una Script Property. */
function evSetProp_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, String(value));
}

/* ---------------------------------- Tiempo -------------------------------- */

/** Ahora, en ISO-8601 UTC. Única fuente de «ahora» del backend. */
function evNow_() {
  return new Date().toISOString();
}

/** Milisegundos desde la época, del reloj del servidor. */
function evNowMs_() {
  return Date.now();
}

/** ISO-8601 → milisegundos, o `null` si no es una fecha. */
function evToMs_(iso) {
  if (!iso) return null;
  var ms = Date.parse(String(iso));
  return isNaN(ms) ? null : ms;
}

/** Milisegundos → ISO-8601. */
function evFromMs_(ms) {
  return new Date(ms).toISOString();
}

/** ISO-8601 desplazado `seconds` segundos. */
function evShiftIso_(iso, seconds) {
  var ms = evToMs_(iso);
  if (ms === null) return '';
  return evFromMs_(ms + Math.round(seconds * 1000));
}

/* -------------------------------- Coerciones ------------------------------ */

/**
 * Texto saneado.
 *
 * Quita caracteres de control (que rompen el CSV y el JSON de la hoja) y acota
 * la longitud. Además neutraliza el prefijo de fórmula: una celda que empieza
 * por `=`, `+`, `-` o `@` se interpreta como fórmula al abrir el libro, y eso es
 * inyección de fórmulas en toda regla.
 */
function evText_(value, maxLength) {
  if (value === null || value === undefined) return '';
  var s = String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  var limit = maxLength || EV_LIMITS.TEXT;
  if (s.length > limit) s = s.slice(0, limit);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return s;
}

/** Texto sin la protección de fórmula (para valores que nunca se muestran). */
function evRaw_(value, maxLength) {
  if (value === null || value === undefined) return '';
  var s = String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  var limit = maxLength || EV_LIMITS.TEXT;
  return s.length > limit ? s.slice(0, limit) : s;
}

/** Número o `null`. */
function evNumOrNull_(value) {
  if (value === '' || value === null || value === undefined) return null;
  var n = Number(value);
  return isFinite(n) ? n : null;
}

/** Número con valor por omisión. */
function evNum_(value, fallback) {
  var n = evNumOrNull_(value);
  return n === null ? fallback : n;
}

/** Entero con valor por omisión. */
function evInt_(value, fallback) {
  var n = evNumOrNull_(value);
  return n === null ? fallback : Math.round(n);
}

/** Entero acotado a un rango. */
function evClampInt_(value, min, max, fallback) {
  var n = evInt_(value, fallback);
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/** Booleano tolerante con lo que produce Sheets. `null` si la celda está vacía. */
function evBoolOrNull_(value) {
  if (value === true) return true;
  if (value === false) return false;
  if (value === '' || value === null || value === undefined) return null;
  var s = String(value).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'sí' || s === 'si' || s === 'verdadero') return true;
  if (s === 'false' || s === '0' || s === 'no' || s === 'falso') return false;
  return null;
}

/** Booleano con valor por omisión. */
function evBool_(value, fallback) {
  var b = evBoolOrNull_(value);
  return b === null ? fallback : b;
}

/** Redondeo estable a `decimals` cifras. */
function evRound_(value, decimals) {
  if (!isFinite(value)) return 0;
  var factor = Math.pow(10, decimals === undefined ? 2 : decimals);
  return Math.round(value * factor) / factor;
}

/** Valor de una enumeración, o el primero de la lista. */
function evEnum_(value, listName, fallback) {
  var list = EV_ENUM[listName] || [];
  var s = String(value || '');
  if (list.indexOf(s) >= 0) return s;
  if (fallback !== undefined && list.indexOf(fallback) >= 0) return fallback;
  return list[0] || '';
}

/** Arreglo de textos saneados, acotado en cantidad y longitud. */
function evTextArray_(value, maxItems, maxLength) {
  var source = Array.isArray(value) ? value : (value === undefined || value === null || value === '' ? [] : [value]);
  var out = [];
  for (var i = 0; i < source.length && out.length < maxItems; i++) {
    var item = evText_(source[i], maxLength);
    if (item) out.push(item);
  }
  return out;
}

/** Parseo de JSON que nunca lanza: una celda corrupta no debe tumbar la lectura. */
function evParseJson_(raw, fallback) {
  if (raw === null || raw === undefined || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    var parsed = JSON.parse(String(raw));
    return (parsed === null || parsed === undefined) ? fallback : parsed;
  } catch (e) {
    return fallback;
  }
}

/** Serialización compacta. Los vacíos se guardan como celda vacía. */
function evWriteJson_(value) {
  if (value === null || value === undefined) return '';
  try {
    var text = JSON.stringify(value);
    if (text === '{}' || text === '[]' || text === 'null') return '';
    return text;
  } catch (e) {
    return '';
  }
}

/* ------------------------------ Identificadores --------------------------- */

var EV_ID = {
  EVALUACION: 'ev',
  SECCION: 'sc',
  PREGUNTA: 'pr',
  OPCION: 'op',
  VERSION: 'vr',
  BLOQUE: 'bl',
  INTENTO: 'it',
  RESPUESTA: 'rs',
  EVENTO: 'evt',
  AUDITORIA: 'au',
  REGISTRO: 'lg',
  METRICA: 'mt'
};

/** Identificador nuevo con prefijo. */
function evNewId_(prefix) {
  return String(prefix) + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 22);
}

/**
 * ¿Es un identificador aceptable?
 *
 * Solo letras, dígitos, guion y guion bajo. Esto descarta fórmulas, saltos de
 * línea y cualquier intento de usar el id como vector de inyección.
 */
function evIsId_(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{3,120}$/.test(value);
}

/** Conserva el id del cliente si es válido; si no, genera uno. */
function evKeepId_(candidate, prefix) {
  return evIsId_(candidate) ? candidate : evNewId_(prefix);
}

/**
 * Código público legible: `EV-XXXX-NNNN`.
 *
 * Se evita el alfabeto ambiguo (I, O, 0, 1) para que se pueda dictar por
 * teléfono sin errores.
 */
var EV_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function evPublicCode_(title, taken) {
  var stub = String(title || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  if (stub.length < 3) stub = 'EVAL';
  for (var attempt = 0; attempt < 60; attempt++) {
    var suffix = '';
    var uuid = Utilities.getUuid().replace(/-/g, '').toUpperCase();
    for (var i = 0; suffix.length < 4 && i < uuid.length; i++) {
      var index = parseInt(uuid.charAt(i), 16);
      suffix += EV_CODE_ALPHABET.charAt((index * 2 + i) % EV_CODE_ALPHABET.length);
    }
    var code = 'EV-' + stub + '-' + suffix;
    if (!taken || !taken[code]) return code;
  }
  return 'EV-' + stub + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
}

/** Normaliza un código escrito por una persona (espacios, minúsculas, guiones). */
function evNormalizeCode_(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').trim();
}

/* ---------------------------------- Hashes -------------------------------- */

/** Bytes con signo → hexadecimal. */
function evBytesToHex_(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    var hex = b.toString(16);
    out += hex.length === 1 ? '0' + hex : hex;
  }
  return out;
}

/** Huella SHA-256 truncada de un texto. Identifica contenido, no lo protege. */
function evFingerprint_(text) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8);
  return evBytesToHex_(bytes).slice(0, 32);
}

/** HMAC-SHA256 en base64url, sin relleno. Se usa para los tokens de intento. */
function evHmac_(secret, message) {
  var bytes = Utilities.computeHmacSha256Signature(String(message), String(secret));
  return Utilities.base64Encode(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Comparación de cadenas en tiempo constante.
 *
 * Comparar tokens con `===` filtra información por el tiempo de respuesta. Es
 * una precaución baratísima y aquí se aplica a todo lo que sea un secreto.
 */
function evSecureEquals_(a, b) {
  var left = String(a === null || a === undefined ? '' : a);
  var right = String(b === null || b === undefined ? '' : b);
  if (left.length !== right.length) return false;
  var diff = 0;
  for (var i = 0; i < left.length; i++) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

/** Ordena por un campo entero ascendente. */
function evByOrder_(a, b) {
  return evInt_(a.orden, 0) - evInt_(b.orden, 0);
}

/** Ordena por una marca de tiempo descendente (lo más reciente primero). */
function evByRecent_(field) {
  return function (a, b) {
    return String(b[field] || '').localeCompare(String(a[field] || ''));
  };
}

/** Agrupa un arreglo por el valor de un campo. */
function evGroupBy_(items, field) {
  var out = {};
  for (var i = 0; i < items.length; i++) {
    var key = String(items[i][field]);
    if (!out[key]) out[key] = [];
    out[key].push(items[i]);
  }
  return out;
}

/** Índice `valor de campo → elemento`. */
function evIndexBy_(items, field) {
  var out = {};
  for (var i = 0; i < items.length; i++) out[String(items[i][field])] = items[i];
  return out;
}
