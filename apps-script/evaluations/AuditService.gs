/**
 * AuditService.gs — bitácora de eventos.
 *
 * Registra quién hizo qué, cuándo y con qué resultado. Los metadatos son
 * deliberadamente pobres: NUNCA se guardan claves de respuesta, textos de
 * preguntas ni datos personales de participantes. Solo identificadores, conteos
 * y códigos.
 */

/** ¿Está habilitada la auditoría? (por omisión sí). */
function evalAuditEnabled_() {
  return String(evalProp_(EVAL_CONFIG.PROPS.AUDIT_ENABLED, 'true')) !== 'false';
}

/**
 * Escribe una entrada de auditoría. Nunca lanza: un fallo al auditar no debe
 * tumbar la operación principal, pero se refleja en el registro del ejecutor.
 */
function evalAudit_(ss, entry) {
  if (!evalAuditEnabled_()) return;
  try {
    evalAppendRow_(ss, EVAL_CONFIG.SHEETS.AUDIT_LOG, {
      audit_id: evalNewId_(EVAL_ID_PREFIX.AUDIT),
      request_id: evalStr_(entry.requestId, 120),
      action: evalStr_(entry.action, 80),
      entity_type: evalStr_(entry.entityType, 40),
      entity_id: evalStr_(entry.entityId, 120),
      actor: evalStr_(entry.actor, 200),
      status: evalStr_(entry.status || 'ok', 20),
      created_at: evalNow_(),
      metadata_json: evalWriteJson_(evalSafeMetadata_(entry.metadata), '')
    });
  } catch (e) {
    console.error('No se pudo escribir la auditoría: ' + (e && e.message ? e.message : e));
  }
}

/**
 * Metadatos seguros: solo números, booleanos y textos cortos, y con una lista
 * negra explícita de claves sensibles.
 */
var EVAL_AUDIT_FORBIDDEN_KEYS = [
  'isCorrect', 'is_correct', 'correct', 'correctAnswer', 'answerKey',
  'options', 'answers', 'participantEmail', 'participant_email',
  'participantName', 'participant_name', 'participantDocument',
  'participant_document', 'snapshot', 'snapshotJson', 'feedback', 'value'
];

function evalSafeMetadata_(metadata) {
  var out = {};
  if (!metadata || typeof metadata !== 'object') return out;
  var keys = Object.keys(metadata);
  for (var i = 0; i < keys.length && i < 40; i++) {
    var key = keys[i];
    if (EVAL_AUDIT_FORBIDDEN_KEYS.indexOf(key) >= 0) continue;
    var value = metadata[key];
    if (typeof value === 'number' || typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'string') out[key] = value.slice(0, 200);
    else if (Array.isArray(value)) out[key] = value.length;
  }
  return out;
}

/**
 * Auditoría de un error, con el código y el mensaje seguro. Se usa desde el
 * enrutador para que ningún fallo quede sin rastro.
 */
function evalAuditFailure_(action, requestId, actor, code, message, entityId) {
  try {
    var ss = evalSpreadsheet_();
    evalAudit_(ss, {
      requestId: requestId,
      action: action,
      entityType: 'request',
      entityId: entityId || '',
      actor: actor,
      status: code === 'FORBIDDEN' ? 'denied' : 'error',
      metadata: { code: code, message: String(message || '').slice(0, 200) }
    });
  } catch (e) {
    console.error('No se pudo auditar el fallo: ' + (e && e.message ? e.message : e));
  }
}
