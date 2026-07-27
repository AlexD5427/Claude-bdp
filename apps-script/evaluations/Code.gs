/**
 * Code.gs — puntos de entrada del Web App de Evaluaciones.
 *
 * A propósito es un archivo mínimo: toda la lógica vive en los servicios. Aquí
 * solo se parsea la petición, se delega en el enrutador y se serializa la
 * respuesta.
 *
 * Despliegue: ver docs/evaluations/APPS_SCRIPT_SETUP.md.
 *
 * IMPORTANTE para el cliente:
 *  · Toda petición debe usar `redirect: "follow"` (Google responde 302).
 *  · Las escrituras deben enviarse con `Content-Type: text/plain;charset=utf-8`
 *    para evitar el preflight de CORS que el despliegue no puede contestar.
 */

/** Lecturas (y, si hace falta, escrituras públicas por GET no se permiten). */
function doGet(e) {
  try {
    var request = evalParseQuery_(e);
    if (!EVAL_READ_ACTIONS[request.action]) {
      return evalJsonOutput_(evalFail_(request.requestId, 'UNSUPPORTED_ACTION',
        'Esta acción solo está disponible por POST.'));
    }
    return evalJsonOutput_(evalHandleRequest_(request));
  } catch (error) {
    var code = isEvalError_(error) ? error.evalCode : 'INTERNAL_ERROR';
    return evalJsonOutput_(evalFail_('', code, error && error.message));
  }
}

/** Escrituras y lecturas. */
function doPost(e) {
  try {
    var body = evalParseBody_(e);
    return evalJsonOutput_(evalHandleRequest_({
      action: body.action,
      requestId: body.requestId,
      payload: body.payload
    }));
  } catch (error) {
    var code = isEvalError_(error) ? error.evalCode : 'INTERNAL_ERROR';
    return evalJsonOutput_(evalFail_('', code, error && error.message));
  }
}
