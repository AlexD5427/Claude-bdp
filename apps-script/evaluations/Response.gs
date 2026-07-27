/**
 * Response.gs — envoltorio uniforme de respuesta y errores tipados.
 *
 * Toda respuesta del Web App tiene exactamente esta forma:
 *   { ok, requestId, data, error, warnings }
 *
 * Los mensajes de error son textos seguros en es-MX: nunca incluyen rastros de
 * pila, rutas internas ni contenido de otras entidades.
 */

/** Códigos de error admitidos. */
var EVAL_ERROR_CODES = [
  'BAD_REQUEST',
  'UNSUPPORTED_ACTION',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'FORBIDDEN',
  'SCHEMA_ERROR',
  'LOCK_TIMEOUT',
  'INTERNAL_ERROR'
];

/** Mensajes por omisión, seguros para mostrar al usuario. */
var EVAL_ERROR_MESSAGES = {
  BAD_REQUEST: 'La solicitud no es válida.',
  UNSUPPORTED_ACTION: 'La acción solicitada no existe.',
  VALIDATION_ERROR: 'Los datos enviados no son válidos.',
  NOT_FOUND: 'El registro solicitado no existe.',
  CONFLICT: 'Otro usuario actualizó este registro. Vuelve a cargarlo.',
  FORBIDDEN: 'No tienes autorización para realizar esta acción.',
  SCHEMA_ERROR: 'La hoja de cálculo no tiene el esquema esperado. Ejecuta la verificación de esquema.',
  LOCK_TIMEOUT: 'El servidor está ocupado. Inténtalo de nuevo en unos segundos.',
  INTERNAL_ERROR: 'Ocurrió un error inesperado. Se registró para su revisión.'
};

/**
 * Construye un error tipado que el enrutador convierte en respuesta.
 * `details` debe contener solo información no sensible.
 */
function evalError_(code, message, details) {
  var safeCode = EVAL_ERROR_CODES.indexOf(code) >= 0 ? code : 'INTERNAL_ERROR';
  var error = new Error(message || EVAL_ERROR_MESSAGES[safeCode]);
  error.evalCode = safeCode;
  error.evalDetails = details || {};
  return error;
}

/** ¿Es un error tipado nuestro? */
function isEvalError_(error) {
  return !!(error && error.evalCode && EVAL_ERROR_CODES.indexOf(error.evalCode) >= 0);
}

/** Respuesta de éxito. */
function evalOk_(requestId, data, warnings) {
  return {
    ok: true,
    requestId: requestId || '',
    data: data === undefined ? null : data,
    error: null,
    warnings: warnings || []
  };
}

/** Respuesta de error. */
function evalFail_(requestId, code, message, details, warnings) {
  var safeCode = EVAL_ERROR_CODES.indexOf(code) >= 0 ? code : 'INTERNAL_ERROR';
  return {
    ok: false,
    requestId: requestId || '',
    data: null,
    error: {
      code: safeCode,
      message: message || EVAL_ERROR_MESSAGES[safeCode],
      details: details || {}
    },
    warnings: warnings || []
  };
}

/** Serializa la respuesta como JSON para `doGet`/`doPost`. */
function evalJsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
