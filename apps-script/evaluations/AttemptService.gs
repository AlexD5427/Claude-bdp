/**
 * AttemptService.gs — intentos y respuestas del portal de candidatos.
 *
 * `startAttempt` es opcional: sirve para anclar el intento a una versión y medir
 * el tiempo. `submitAttempt` funciona con o sin él y es idempotente por
 * `requestId`.
 *
 * La calificación NO se hace aquí: se delega en ScoringService.gs. Este archivo
 * solo persiste, ancla la versión y descarta cualquier dato de puntuación que
 * venga del cliente.
 */

/* ------------------------------- Mapeo de filas -------------------------- */

function evalAttemptFromRow_(row) {
  return {
    attemptId: evalStr_(row.attempt_id, 120),
    requestId: evalStr_(row.request_id, 120),
    assessmentId: evalStr_(row.assessment_id, 120),
    assessmentVersion: evalInt_(row.assessment_version, 1),
    versionId: evalStr_(row.version_id, 120),
    participantName: evalStr_(row.participant_name, 200),
    participantEmail: evalStr_(row.participant_email, 200),
    participantDocument: evalStr_(row.participant_document, 60),
    anonymousToken: evalStr_(row.anonymous_token, 120),
    status: evalStr_(row.status, 20) || 'in_progress',
    startedAt: evalStr_(row.started_at, 40),
    submittedAt: evalStr_(row.submitted_at, 40),
    score: evalNumOrNull_(row.score),
    autoScore: evalNumOrNull_(row.auto_score),
    correctAnswers: evalInt_(row.correct_answers, 0),
    totalQuestions: evalInt_(row.total_questions, 0),
    gradableQuestions: evalInt_(row.gradable_questions, 0),
    manualPendingCount: evalInt_(row.manual_pending_count, 0),
    gradingStatus: evalStr_(row.grading_status, 40) || 'automatically_graded',
    passed: evalBool_(row.passed),
    gradedAt: evalStr_(row.graded_at, 40),
    gradedBy: evalStr_(row.graded_by, 200),
    durationSeconds: evalNumOrNull_(row.duration_seconds),
    userAgent: evalStr_(row.user_agent, EVAL_CONFIG.LIMITS.MAX_USER_AGENT),
    processId: evalStr_(row.process_id, 120)
  };
}

function evalAttemptToRow_(a) {
  return {
    attempt_id: a.attemptId,
    request_id: a.requestId,
    assessment_id: a.assessmentId,
    assessment_version: a.assessmentVersion,
    version_id: a.versionId,
    participant_name: a.participantName,
    participant_email: a.participantEmail,
    participant_document: a.participantDocument,
    anonymous_token: a.anonymousToken,
    status: a.status,
    started_at: a.startedAt,
    submitted_at: a.submittedAt || '',
    score: a.score === null || a.score === undefined ? '' : a.score,
    auto_score: a.autoScore === null || a.autoScore === undefined ? '' : a.autoScore,
    correct_answers: a.correctAnswers,
    total_questions: a.totalQuestions,
    gradable_questions: a.gradableQuestions,
    manual_pending_count: a.manualPendingCount,
    grading_status: a.gradingStatus,
    passed: a.passed === null || a.passed === undefined ? '' : evalWriteBool_(a.passed),
    graded_at: a.gradedAt || '',
    graded_by: a.gradedBy || '',
    duration_seconds: a.durationSeconds === null || a.durationSeconds === undefined ? '' : a.durationSeconds,
    user_agent: a.userAgent,
    process_id: a.processId || ''
  };
}

function evalAnswerFromRow_(row) {
  return {
    answerId: evalStr_(row.answer_id, 120),
    attemptId: evalStr_(row.attempt_id, 120),
    assessmentId: evalStr_(row.assessment_id, 120),
    questionId: evalStr_(row.question_id, 120),
    questionType: evalStr_(row.question_type, 60),
    selectedOptionId: evalStr_(row.selected_option_id, 120),
    value: evalUnwrapAnswerValue_(row.answer_value_json),
    isCorrect: evalBool_(row.is_correct),
    pointsAwarded: evalNumOrNull_(row.points_awarded),
    maxPoints: evalNum_(row.max_points, 0),
    requiresManualReview: evalBoolOr_(row.requires_manual_review, false),
    answeredAt: evalStr_(row.answered_at, 40)
  };
}

function evalAnswerToRow_(a) {
  return {
    answer_id: a.answerId,
    attempt_id: a.attemptId,
    assessment_id: a.assessmentId,
    question_id: a.questionId,
    question_type: a.questionType,
    selected_option_id: a.selectedOptionId || '',
    answer_value_json: a.value === null || a.value === undefined
      ? ''
      : JSON.stringify({ value: a.value }),
    is_correct: a.isCorrect === null || a.isCorrect === undefined ? '' : evalWriteBool_(a.isCorrect),
    points_awarded: a.pointsAwarded === null || a.pointsAwarded === undefined ? '' : a.pointsAwarded,
    max_points: a.maxPoints,
    requires_manual_review: evalWriteBool_(a.requiresManualReview),
    answered_at: a.answeredAt
  };
}

/**
 * Desenvuelve el valor guardado. Se persiste como `{"value": … }` para que un
 * texto libre nunca se confunda con JSON estructurado.
 */
function evalUnwrapAnswerValue_(raw) {
  var parsed = evalParseJson_(raw, null);
  if (parsed && typeof parsed === 'object' && Object.prototype.hasOwnProperty.call(parsed, 'value')) {
    return parsed.value;
  }
  return parsed;
}

/** Datos del participante, saneados. */
function evalParticipant_(raw) {
  var participant = raw && typeof raw === 'object' ? raw : {};
  return {
    name: evalStr_(participant.name, 200),
    email: evalStr_(participant.email, 200),
    document: evalStr_(participant.document, 60)
  };
}

/* --------------------------------- Acciones ------------------------------ */

/** Crea un intento en curso anclado al snapshot vigente. */
function evalStartAttempt_(context, payload) {
  var ss = context.ss;
  var now = evalNow_();
  var assessment = evalFindPublishedByCode_(ss, (payload || {}).publicCode);
  var snapshot = evalLoadVersionSnapshot_(ss, assessment.assessmentId, assessment.currentPublishedVersionId);
  if (!snapshot) throw evalError_('NOT_FOUND', 'La evaluación no está disponible.');

  var participant = evalParticipant_((payload || {}).participant);
  var attempt = {
    attemptId: evalNewId_(EVAL_ID_PREFIX.ATTEMPT),
    requestId: context.requestId,
    assessmentId: assessment.assessmentId,
    assessmentVersion: evalInt_(snapshot.assessment.version, assessment.version),
    versionId: assessment.currentPublishedVersionId,
    participantName: participant.name,
    participantEmail: participant.email,
    participantDocument: participant.document,
    anonymousToken: participant.name || participant.email ? '' : evalNewId_('anon'),
    status: 'in_progress',
    startedAt: now,
    submittedAt: '',
    score: null,
    autoScore: null,
    correctAnswers: 0,
    totalQuestions: 0,
    gradableQuestions: 0,
    manualPendingCount: 0,
    gradingStatus: 'automatically_graded',
    passed: null,
    gradedAt: '',
    gradedBy: '',
    durationSeconds: null,
    userAgent: evalStr_((payload || {}).userAgent, EVAL_CONFIG.LIMITS.MAX_USER_AGENT),
    processId: evalStr_((payload || {}).processId, 120)
  };
  evalUpsertRows_(ss, EVAL_CONFIG.SHEETS.ATTEMPTS, 'attempt_id', [evalAttemptToRow_(attempt)]);

  evalAudit_(ss, {
    requestId: context.requestId, action: 'startAttempt', entityType: 'attempt',
    entityId: attempt.attemptId, actor: 'candidate', status: 'ok',
    metadata: { assessmentId: assessment.assessmentId, versionId: attempt.versionId }
  });

  return {
    data: {
      attemptId: attempt.attemptId,
      assessmentVersion: attempt.assessmentVersion,
      versionId: attempt.versionId,
      startedAt: attempt.startedAt
    },
    reference: attempt.attemptId,
    summary: { attemptId: attempt.attemptId }
  };
}

/**
 * Recibe y califica un intento. La calificación es del servidor: cualquier
 * `isCorrect`, `pointsAwarded`, `score` o `passed` del cliente se descarta.
 */
function evalSubmitAttempt_(context, payload) {
  var ss = context.ss;
  var now = evalNow_();
  var incoming = payload || {};
  var assessment = evalFindPublishedByCode_(ss, incoming.publicCode);
  var warnings = [];

  var attemptId = evalStr_(incoming.attemptId, 120);
  var existing = attemptId
    ? evalFindBy_(ss, EVAL_CONFIG.SHEETS.ATTEMPTS, 'attempt_id', attemptId)
    : null;
  var attempt = existing ? evalAttemptFromRow_(existing) : null;

  if (attempt) {
    if (String(attempt.assessmentId) !== String(assessment.assessmentId)) {
      throw evalError_('VALIDATION_ERROR',
        'El intento no corresponde a esta evaluación.');
    }
    if (attempt.status === 'submitted') {
      throw evalError_('CONFLICT', 'Este intento ya fue enviado.');
    }
  }

  var versionId = attempt && attempt.versionId
    ? attempt.versionId
    : assessment.currentPublishedVersionId;
  var snapshot = evalLoadVersionSnapshot_(ss, assessment.assessmentId, versionId);
  if (!snapshot) {
    // Respaldo para evaluaciones publicadas antes de esta migración: se lee la
    // clave de las hojas vivas y se avisa explícitamente.
    var bundle = evalLoadBundle_(ss, assessment.assessmentId);
    snapshot = {
      schemaVersion: EVAL_CONFIG.SNAPSHOT_SCHEMA_VERSION,
      assessment: bundle.assessment,
      sections: bundle.sections.filter(function (s) { return s.active !== false; }),
      questions: bundle.questions.filter(function (q) { return q.active !== false; }),
      options: bundle.options.filter(function (o) { return o.active !== false; })
    };
    warnings.push('LEGACY_ANSWER_KEY_SOURCE');
  }

  var rawAnswers = Array.isArray(incoming.answers) ? incoming.answers : [];
  if (rawAnswers.length > EVAL_CONFIG.LIMITS.MAX_ANSWERS_PER_ATTEMPT) {
    throw evalError_('VALIDATION_ERROR', 'El intento contiene demasiadas respuestas.');
  }
  var answers = [];
  for (var i = 0; i < rawAnswers.length; i++) answers.push(evalStripClientScoring_(rawAnswers[i]));

  var result = evalScoreAttempt_(snapshot, answers, assessment.passingScore);

  var participant = evalParticipant_(incoming.participant);
  var finalAttempt = {
    attemptId: attempt ? attempt.attemptId : evalNewId_(EVAL_ID_PREFIX.ATTEMPT),
    requestId: context.requestId,
    assessmentId: assessment.assessmentId,
    assessmentVersion: evalInt_(snapshot.assessment.version, assessment.version),
    versionId: versionId,
    participantName: participant.name || (attempt ? attempt.participantName : ''),
    participantEmail: participant.email || (attempt ? attempt.participantEmail : ''),
    participantDocument: participant.document || (attempt ? attempt.participantDocument : ''),
    anonymousToken: attempt ? attempt.anonymousToken : (participant.name || participant.email ? '' : evalNewId_('anon')),
    status: 'submitted',
    startedAt: attempt ? attempt.startedAt : now,
    submittedAt: now,
    score: result.score,
    autoScore: result.autoScore,
    correctAnswers: result.correctAnswers,
    totalQuestions: result.totalQuestions,
    gradableQuestions: result.gradableQuestions,
    manualPendingCount: result.manualPendingCount,
    gradingStatus: result.gradingStatus,
    passed: result.passed,
    gradedAt: result.gradingStatus === 'pending_manual_review' ? '' : now,
    gradedBy: result.gradingStatus === 'pending_manual_review' ? '' : 'system',
    durationSeconds: evalNumOrNull_(incoming.durationSeconds),
    userAgent: evalStr_(incoming.userAgent, EVAL_CONFIG.LIMITS.MAX_USER_AGENT),
    processId: evalStr_(incoming.processId, 120) || (attempt ? attempt.processId : '')
  };

  var answerRows = result.graded.map(function (item) {
    return evalAnswerToRow_({
      answerId: evalNewId_(EVAL_ID_PREFIX.ANSWER),
      attemptId: finalAttempt.attemptId,
      assessmentId: assessment.assessmentId,
      questionId: item.questionId,
      questionType: item.questionType,
      selectedOptionId: item.selectedOptionId,
      value: item.value,
      isCorrect: item.isCorrect,
      pointsAwarded: item.pointsAwarded,
      maxPoints: item.maxPoints,
      requiresManualReview: item.requiresManualReview,
      answeredAt: now
    });
  });

  evalUpsertRows_(ss, EVAL_CONFIG.SHEETS.ATTEMPTS, 'attempt_id', [evalAttemptToRow_(finalAttempt)]);
  if (answerRows.length > 0) {
    evalUpsertRows_(ss, EVAL_CONFIG.SHEETS.ANSWERS, 'answer_id', answerRows);
  }

  evalAudit_(ss, {
    requestId: context.requestId, action: 'submitAttempt', entityType: 'attempt',
    entityId: finalAttempt.attemptId, actor: 'candidate', status: 'ok',
    metadata: {
      assessmentId: assessment.assessmentId, versionId: versionId,
      gradingStatus: result.gradingStatus, gradableQuestions: result.gradableQuestions,
      correctAnswers: result.correctAnswers, answers: answerRows.length
    }
  });

  var visibility = ((assessment.policies || {}).resultVisibility || {}).candidate;
  var publicResult = evalPublicAttemptResult_({
    attemptId: finalAttempt.attemptId,
    status: finalAttempt.status,
    gradingStatus: finalAttempt.gradingStatus,
    answersReceived: answerRows.length,
    score: finalAttempt.score,
    passed: finalAttempt.passed
  }, visibility);

  return {
    data: publicResult,
    warnings: warnings,
    reference: finalAttempt.attemptId,
    summary: { attemptId: finalAttempt.attemptId, gradingStatus: finalAttempt.gradingStatus }
  };
}
