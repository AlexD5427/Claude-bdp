/**
 * Signature.gs — primitivas criptográficas de la autorización por secreto de
 * servidor.
 *
 * Este archivo NO decide quién puede hacer qué: solo sabe verificar que una
 * credencial fue emitida por alguien que conoce un secreto que vive en las
 * Script Properties. La decisión de autorización está en `AuthProviders.gs` y la
 * clasificación de acciones en `Auth.gs`.
 *
 * Esquema `hmac-sha256`, versión de canonicalización `v1`:
 *
 *   firma = base64( HMAC-SHA256( secreto, cadenaCanónica ) )
 *
 *   cadenaCanónica = 'v1' \n acción \n requestId \n timestamp \n nonce \n actor
 *
 * Notas de diseño:
 *
 *  · La cadena canónica NO incluye el cuerpo. El emisor de la firma es un
 *    backend intermedio de confianza (funciones serverless) y el canal es TLS,
 *    así que el navegador nunca ve una firma que pudiera reutilizar con otro
 *    cuerpo. Incluir un resumen del cuerpo exigiría que ambos lados serializasen
 *    el JSON byte a byte igual, algo que Apps Script no garantiza al reparsear.
 *
 *  · El `timestamp` acota la validez a unos minutos y el `nonce` impide reusar
 *    una firma dentro de esa ventana (se recuerda en CacheService).
 *
 *  · La comparación de firmas es de tiempo constante para no filtrar el secreto
 *    por diferencias de tiempo.
 *
 *  · Se admiten dos secretos simultáneos (vigente y siguiente) para poder rotar
 *    sin cortar el servicio.
 */

/** Ventana de frescura admitida para el `timestamp` de la credencial. */
var EVAL_SIGNATURE_WINDOW_MS = 300000; // 5 minutos

/** Longitud mínima exigida al secreto compartido. */
var EVAL_SIGNATURE_MIN_SECRET_LENGTH = 32;

/** Versión de la canonicalización. Cambiarla invalida las firmas anteriores. */
var EVAL_SIGNATURE_VERSION = 'v1';

/** Prefijo de las claves de nonce en CacheService. */
var EVAL_SIGNATURE_NONCE_PREFIX = 'eval_nonce_';

/**
 * Cadena canónica que ambos lados firman. Cualquier cambio aquí debe replicarse
 * en el firmante (`api/_lib/appsScriptSignature.ts`); hay pruebas que comparan
 * las dos implementaciones.
 */
function evalCanonicalString_(parts) {
  return [
    EVAL_SIGNATURE_VERSION,
    String(parts.action || ''),
    String(parts.requestId || ''),
    String(parts.timestamp || ''),
    String(parts.nonce || ''),
    String(parts.actor || '')
  ].join('\n');
}

/** HMAC-SHA256 en base64 del texto dado con el secreto dado. */
function evalHmacBase64_(secret, text) {
  var bytes = Utilities.computeHmacSha256Signature(String(text), String(secret), Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

/**
 * Comparación de tiempo constante entre dos cadenas. Recorre siempre la
 * longitud del valor esperado y acumula las diferencias en lugar de cortar en
 * la primera.
 */
function evalConstantTimeEquals_(expected, actual) {
  var a = String(expected == null ? '' : expected);
  var b = String(actual == null ? '' : actual);
  var diff = a.length ^ b.length;
  for (var i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ (i < b.length ? b.charCodeAt(i) : 0);
  }
  return diff === 0;
}

/**
 * Secretos admitidos, en orden de preferencia: el vigente y el siguiente (para
 * rotación). Se descartan los que no alcanzan la longitud mínima, de modo que un
 * secreto débil equivale a «sin configurar» y el despliegue falla cerrado.
 */
function evalSignatureSecrets_() {
  var candidates = [
    evalProp_(EVAL_CONFIG.PROPS.ADMIN_SHARED_SECRET, ''),
    evalProp_(EVAL_CONFIG.PROPS.ADMIN_SHARED_SECRET_NEXT, '')
  ];
  var out = [];
  for (var i = 0; i < candidates.length; i++) {
    var secret = String(candidates[i] || '').trim();
    if (secret.length >= EVAL_SIGNATURE_MIN_SECRET_LENGTH) out.push(secret);
  }
  return out;
}

/** ¿Está configurado al menos un secreto válido? (para diagnóstico en `ping`). */
function evalSignatureConfigured_() {
  return evalSignatureSecrets_().length > 0;
}

/** Diferencia en milisegundos entre el timestamp declarado y el reloj del servidor. */
function evalSignatureSkewMs_(timestamp) {
  var parsed = Date.parse(String(timestamp || ''));
  if (isNaN(parsed)) return null;
  return Math.abs(new Date().getTime() - parsed);
}

/**
 * Recuerda el nonce durante la ventana de frescura. Devuelve `true` si el nonce
 * es nuevo y `false` si ya se había usado.
 *
 * Si CacheService no está disponible se responde `true`: la protección contra
 * repetición es defensa en profundidad (la ventana de frescura y la idempotencia
 * por `requestId` siguen vigentes) y no debe tumbar el servicio.
 */
function evalSignatureRememberNonce_(nonce) {
  try {
    var cache = CacheService.getScriptCache();
    if (!cache) return true;
    var key = EVAL_SIGNATURE_NONCE_PREFIX + evalChecksum_(String(nonce));
    if (cache.get(key)) return false;
    cache.put(key, '1', Math.ceil(EVAL_SIGNATURE_WINDOW_MS / 1000) + 60);
    return true;
  } catch (e) {
    return true;
  }
}

/**
 * Verifica una credencial firmada.
 *
 * Devuelve `{ ok: true }` o `{ ok: false, reason: <código interno> }`. El código
 * es para la bitácora del servidor: el cliente siempre recibe el mismo mensaje
 * de `FORBIDDEN`, para no convertir este endpoint en un oráculo que revele por
 * qué falló la firma.
 */
function evalVerifySignedCredential_(credential, action, requestId) {
  var secrets = evalSignatureSecrets_();
  if (secrets.length === 0) return { ok: false, reason: 'secret_not_configured' };
  if (!credential || typeof credential !== 'object') return { ok: false, reason: 'missing_credential' };

  var scheme = String(credential.scheme || '').toLowerCase();
  if (scheme !== 'hmac-sha256') return { ok: false, reason: 'unsupported_scheme' };

  var signature = String(credential.signature || '');
  var nonce = String(credential.nonce || '');
  var timestamp = String(credential.timestamp || '');
  if (!signature || !nonce || !timestamp) return { ok: false, reason: 'incomplete_credential' };
  if (nonce.length < 8 || nonce.length > 200) return { ok: false, reason: 'invalid_nonce' };

  var skew = evalSignatureSkewMs_(timestamp);
  if (skew === null) return { ok: false, reason: 'invalid_timestamp' };
  if (skew > EVAL_SIGNATURE_WINDOW_MS) return { ok: false, reason: 'stale_timestamp' };

  var canonical = evalCanonicalString_({
    action: action,
    requestId: requestId,
    timestamp: timestamp,
    nonce: nonce,
    actor: String(credential.actor || '')
  });

  var matched = false;
  for (var i = 0; i < secrets.length; i++) {
    if (evalConstantTimeEquals_(evalHmacBase64_(secrets[i], canonical), signature)) matched = true;
  }
  if (!matched) return { ok: false, reason: 'bad_signature' };

  if (!evalSignatureRememberNonce_(nonce)) return { ok: false, reason: 'replayed_nonce' };

  return { ok: true };
}
