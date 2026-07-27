/**
 * RequestService.gs — idempotencia de las escrituras.
 *
 * Toda escritura llega con un `requestId` generado por el cliente. Si ese
 * identificador ya está en `ProcessedRequests`, el efecto NO se repite: se
 * devuelve la referencia de la primera ejecución con la advertencia
 * IDEMPOTENT_REPLAY. Esto protege contra el doble clic, los reintentos del
 * usuario y los reenvíos del portal de candidatos.
 *
 * La comprobación se hace DENTRO del ScriptLock, así que dos peticiones
 * simultáneas con el mismo requestId no pueden colarse a la vez.
 */

/** ¿Ya se procesó esta solicitud? Devuelve la fila o `null`. */
function evalFindProcessedRequest_(ss, requestId) {
  if (!requestId) return null;
  return evalFindBy_(ss, EVAL_CONFIG.SHEETS.PROCESSED_REQUESTS, 'request_id', requestId);
}

/** Registra la solicitud como procesada. */
function evalRecordProcessedRequest_(ss, requestId, action, resultReference, actor, summary) {
  if (!requestId) return;
  evalAppendRow_(ss, EVAL_CONFIG.SHEETS.PROCESSED_REQUESTS, {
    request_id: requestId,
    action: evalStr_(action, 80),
    result_reference: evalStr_(resultReference, 120),
    processed_at: evalNow_(),
    actor: evalStr_(actor, 200),
    result_summary_json: evalWriteJson_(summary || {}, '')
  });
}

/** Resumen de la repetición, tal como se devuelve al cliente. */
function evalReplaySummary_(row) {
  return {
    idempotentReplay: true,
    reference: evalStr_(row.result_reference, 120),
    processedAt: evalStr_(row.processed_at, 40),
    summary: evalParseJson_(row.result_summary_json, {})
  };
}

/**
 * Ejecuta `work()` con el ScriptLock tomado y con protección de idempotencia.
 *
 * `work(context)` recibe `{ ss, requestId, actor, replay }` y debe devolver
 * `{ data, reference, summary }`. El bloqueo se libera siempre en `finally`.
 */
function evalWithWriteLock_(requestId, action, actor, work) {
  var lock = LockService.getScriptLock();
  var acquired = false;
  try {
    acquired = lock.tryLock(EVAL_CONFIG.LIMITS.LOCK_TIMEOUT_MS);
    if (!acquired) {
      throw evalError_('LOCK_TIMEOUT', 'El servidor está ocupado. Inténtalo de nuevo en unos segundos.');
    }
    var ss = evalSpreadsheet_();
    var processed = evalFindProcessedRequest_(ss, requestId);
    if (processed) {
      return {
        data: evalReplaySummary_(processed),
        warnings: ['IDEMPOTENT_REPLAY'],
        replayed: true
      };
    }
    var result = work({ ss: ss, requestId: requestId, actor: actor });
    evalRecordProcessedRequest_(
      ss, requestId, action,
      result && result.reference ? result.reference : '',
      actor,
      result && result.summary ? result.summary : {}
    );
    return {
      data: result ? result.data : null,
      warnings: result && result.warnings ? result.warnings : [],
      replayed: false
    };
  } finally {
    if (acquired) {
      try { lock.releaseLock(); } catch (e) { /* el bloqueo ya expiró */ }
    }
  }
}
