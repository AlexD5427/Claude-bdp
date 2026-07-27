/**
 * Router.gs — enrutado, autorización, bloqueo e idempotencia.
 *
 * Único punto de entrada lógico. Cada solicitud pasa por el mismo camino:
 *   1. Parseo seguro de la carga.
 *   2. Autorización (Auth.gs).
 *   3. Comprobación de idempotencia + ScriptLock si es escritura.
 *   4. Servicio correspondiente.
 *   5. Auditoría.
 *   6. Respuesta con el envoltorio uniforme.
 */

/** Acciones de solo lectura (no toman bloqueo ni consumen requestId). */
var EVAL_READ_ACTIONS = {
  ping: true,
  listAdminAssessments: true,
  getAdminAssessment: true,
  listAssessmentResults: true,
  getAttemptDetail: true,
  verifySchema: true,
  listPublicAssessments: true,
  getPublicAssessment: true
};

/** Acciones de escritura y su servicio. */
var EVAL_WRITE_ACTIONS = {
  createAssessment: function (context, payload) { return evalCreateAssessment_(context, payload); },
  updateAssessment: function (context, payload) { return evalUpdateAssessment_(context, payload); },
  duplicateAssessment: function (context, payload) { return evalDuplicateAssessment_(context, payload); },
  publishAssessment: function (context, payload) { return evalPublishAssessment_(context, payload); },
  archiveAssessment: function (context, payload) { return evalTransitionAssessment_(context, payload, 'archiveAssessment'); },
  unarchiveAssessment: function (context, payload) { return evalTransitionAssessment_(context, payload, 'unarchiveAssessment'); },
  pauseAssessment: function (context, payload) { return evalTransitionAssessment_(context, payload, 'pauseAssessment'); },
  closeAssessment: function (context, payload) { return evalTransitionAssessment_(context, payload, 'closeAssessment'); },
  resumeAssessment: function (context, payload) { return evalTransitionAssessment_(context, payload, 'resumeAssessment'); },
  rollbackAssessment: function (context, payload) { return evalRollbackAssessment_(context, payload); },
  startAttempt: function (context, payload) { return evalStartAttempt_(context, payload); },
  submitAttempt: function (context, payload) { return evalSubmitAttempt_(context, payload); },
  setupSchema: function (context) { return evalSetupSchemaAction_(context); }
};

/** Parseo seguro del cuerpo POST. */
function evalParseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  var text = String(e.postData.contents);
  if (text.length > 5000000) {
    throw evalError_('BAD_REQUEST', 'La solicitud es demasiado grande.');
  }
  try {
    var parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    throw evalError_('BAD_REQUEST', 'El cuerpo de la solicitud no es JSON válido.');
  }
}

/** Parseo seguro de los parámetros GET (`action` + `payload` JSON). */
function evalParseQuery_(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var request = { action: String(params.action || ''), requestId: String(params.requestId || '') };
  if (params.payload) {
    try {
      var parsed = JSON.parse(String(params.payload));
      request.payload = parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      throw evalError_('BAD_REQUEST', 'El parámetro payload no es JSON válido.');
    }
  } else {
    // Permite pasar campos sueltos, p. ej. ?action=getPublicAssessment&publicCode=…
    var payload = {};
    var keys = Object.keys(params);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] === 'action' || keys[i] === 'requestId' || keys[i] === 'payload') continue;
      payload[keys[i]] = params[keys[i]];
    }
    request.payload = payload;
  }
  return request;
}

/**
 * Ejecuta una solicitud ya parseada. Es la función que usan `doGet`, `doPost` y
 * las pruebas.
 */
function evalHandleRequest_(request) {
  var action = String((request && request.action) || '');
  var requestId = String((request && request.requestId) || '');
  var payload = (request && request.payload && typeof request.payload === 'object')
    ? request.payload : {};

  if (!action) return evalFail_(requestId, 'BAD_REQUEST', 'Falta el campo "action".');

  var auth;
  try {
    auth = evalAuthorize_(action);
  } catch (error) {
    var authCode = isEvalError_(error) ? error.evalCode : 'INTERNAL_ERROR';
    evalAuditFailure_(action, requestId, evalActiveEmail_(), authCode, error && error.message, '');
    return evalFail_(requestId, authCode, error && error.message, {}, []);
  }

  var actor = evalResolveActor_(auth, payload.actor);

  try {
    if (action === 'ping') {
      return evalOk_(requestId, {
        service: 'evaluations',
        schemaVersion: EVAL_CONFIG.SCHEMA_VERSION,
        authMode: auth.mode,
        serverTime: evalNow_()
      }, auth.warnings);
    }

    if (EVAL_READ_ACTIONS[action]) {
      var data = evalRunRead_(action, payload);
      return evalOk_(requestId, data, auth.warnings);
    }

    var handler = EVAL_WRITE_ACTIONS[action];
    if (!handler) return evalFail_(requestId, 'UNSUPPORTED_ACTION', 'La acción solicitada no existe.');

    if (!requestId) {
      return evalFail_(requestId, 'BAD_REQUEST',
        'Toda escritura debe incluir un "requestId" para garantizar la idempotencia.');
    }

    var outcome = evalWithWriteLock_(requestId, action, actor, function (context) {
      return handler({ ss: context.ss, requestId: requestId, actor: actor }, payload);
    });
    var warnings = auth.warnings.concat(outcome.warnings || []);
    return evalOk_(requestId, outcome.data, warnings);
  } catch (error) {
    var code = isEvalError_(error) ? error.evalCode : 'INTERNAL_ERROR';
    var message = isEvalError_(error)
      ? error.message
      : EVAL_ERROR_MESSAGES.INTERNAL_ERROR;
    var details = isEvalError_(error) ? error.evalDetails : {};
    if (!isEvalError_(error)) {
      console.error('[evaluations] ' + action + ': ' + (error && error.stack ? error.stack : error));
    }
    evalAuditFailure_(action, requestId, actor, code, message,
      evalStr_(payload.assessmentId || payload.attemptId || '', 120));
    return evalFail_(requestId, code, message, details, auth.warnings);
  }
}

/** Despacha las lecturas. */
function evalRunRead_(action, payload) {
  switch (action) {
    case 'listAdminAssessments': return evalListAdminAssessments_(payload);
    case 'getAdminAssessment': return evalGetAdminAssessment_(payload);
    case 'listAssessmentResults': return evalListAssessmentResults_(payload);
    case 'getAttemptDetail': return evalGetAttemptDetail_(payload);
    case 'verifySchema': return evalVerifySchema_(evalSpreadsheet_());
    case 'listPublicAssessments': return evalListPublicAssessments_(payload);
    case 'getPublicAssessment': return evalGetPublicAssessment_(payload);
    default: throw evalError_('UNSUPPORTED_ACTION', 'La acción solicitada no existe.');
  }
}
