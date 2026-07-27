/**
 * ScoringService.gs — la ÚNICA autoridad de calificación.
 *
 * Fórmula del MVP (peso igual por pregunta):
 *
 *     score = correctAnswers / totalGradableQuestions * 100     (2 decimales)
 *
 * Garantías:
 *  · Las claves de respuesta se leen del snapshot inmutable de la versión a la
 *    que quedó anclado el intento (o de `Options` si esa versión no tiene
 *    snapshot, avisando con LEGACY_ANSWER_KEY_SOURCE).
 *  · Cualquier `isCorrect`, `pointsAwarded`, `score` o `passed` que llegue del
 *    cliente se ignora (se descarta antes, en `evalStripClientScoring_`).
 *  · Se verifica que cada pregunta pertenezca a la versión y que cada opción
 *    pertenezca a su pregunta. Una opción o pregunta ajena es VALIDATION_ERROR.
 *  · Nunca hay división por cero.
 *  · Si hay preguntas que requieren revisión humana, la nota final queda
 *    PENDIENTE (no se otorga cero automáticamente).
 */

/** Redondeo a dos decimales, estable. */
function evalRound2_(value) {
  if (!isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/** Índice del snapshot: preguntas y opciones por id, y opciones por pregunta. */
function evalBuildAnswerKey_(snapshot) {
  var questionById = {};
  var optionById = {};
  var optionsByQuestion = {};
  var activeQuestions = [];

  for (var q = 0; q < snapshot.questions.length; q++) {
    var question = snapshot.questions[q];
    if (question.active === false) continue;
    questionById[question.questionId] = question;
    activeQuestions.push(question);
  }
  for (var o = 0; o < snapshot.options.length; o++) {
    var option = snapshot.options[o];
    if (option.active === false) continue;
    if (!questionById[option.questionId]) continue;
    optionById[option.optionId] = option;
    if (!optionsByQuestion[option.questionId]) optionsByQuestion[option.questionId] = [];
    optionsByQuestion[option.questionId].push(option);
  }
  var keys = Object.keys(optionsByQuestion);
  for (var k = 0; k < keys.length; k++) {
    optionsByQuestion[keys[k]].sort(function (a, b) {
      return evalInt_(a.position, 0) - evalInt_(b.position, 0);
    });
  }
  return {
    questionById: questionById,
    optionById: optionById,
    optionsByQuestion: optionsByQuestion,
    activeQuestions: activeQuestions
  };
}

/**
 * Evalúa una única respuesta contra la clave.
 * Devuelve `{ isCorrect, pointsAwarded, maxPoints, requiresManualReview }`.
 */
function evalGradeAnswer_(question, options, answer) {
  var maxPoints = evalNum_(question.maxPoints, 0);
  if (evalRequiresManualReview_(question, options)) {
    return { isCorrect: null, pointsAwarded: null, maxPoints: maxPoints, requiresManualReview: true };
  }
  if (!evalIsAutoGradable_(question, options)) {
    return { isCorrect: null, pointsAwarded: null, maxPoints: maxPoints, requiresManualReview: false };
  }

  var spec = evalTypeSpec_(question.questionType);
  var selected = {};
  var selectedCount = 0;
  if (answer.selectedOptionId) { selected[answer.selectedOptionId] = true; selectedCount++; }
  for (var i = 0; i < answer.selectedOptionIds.length; i++) {
    if (!selected[answer.selectedOptionIds[i]]) {
      selected[answer.selectedOptionIds[i]] = true;
      selectedCount++;
    }
  }

  if (spec.optionBased && (spec.expects === 'ordering' || spec.expects === 'matching')) {
    return evalGradeStructured_(question, options, answer, maxPoints);
  }

  if (spec.optionBased) {
    var correctCount = 0;
    var allCorrectSelected = true;
    var anyIncorrectSelected = false;
    var partialPoints = 0;
    for (var o = 0; o < options.length; o++) {
      var option = options[o];
      var chosen = selected[option.optionId] === true;
      if (option.isCorrect) {
        correctCount++;
        if (!chosen) allCorrectSelected = false;
      } else if (chosen) {
        anyIncorrectSelected = true;
      }
      if (chosen) partialPoints += evalNum_(option.scoreValue, 0);
    }
    if (selectedCount === 0) {
      return { isCorrect: false, pointsAwarded: 0, maxPoints: maxPoints, requiresManualReview: false };
    }
    if (question.scoringMode === 'partial' || question.scoringMode === 'per_option') {
      var awarded = Math.max(0, partialPoints);
      return {
        isCorrect: correctCount > 0 && allCorrectSelected && !anyIncorrectSelected,
        pointsAwarded: evalRound2_(awarded),
        maxPoints: maxPoints,
        requiresManualReview: false
      };
    }
    var correct = allCorrectSelected && !anyIncorrectSelected && correctCount > 0;
    return {
      isCorrect: correct,
      pointsAwarded: correct ? maxPoints : 0,
      maxPoints: maxPoints,
      requiresManualReview: false
    };
  }

  // Preguntas sin opciones con valor esperado configurado.
  var expected = evalExpectedValue_(question);
  var isCorrect = evalMatchesExpected_(question, expected, answer.value);
  return {
    isCorrect: isCorrect,
    pointsAwarded: isCorrect ? maxPoints : 0,
    maxPoints: maxPoints,
    requiresManualReview: false
  };
}

/** Comparación del valor esperado, con tolerancia numérica opcional. */
function evalMatchesExpected_(question, expected, value) {
  if (expected === null || expected === undefined) return false;
  if (value === null || value === undefined || value === '') return false;
  var spec = evalTypeSpec_(question.questionType);
  if (spec && spec.expects === 'number') {
    var got = Number(value);
    var want = Number(expected);
    if (!isFinite(got) || !isFinite(want)) return false;
    var config = question.configuration || {};
    var tolerance = Math.abs(evalNum_(config.tolerance, 0));
    return Math.abs(got - want) <= tolerance;
  }
  return String(value).trim().toLowerCase() === String(expected).trim().toLowerCase();
}

/**
 * Calificación de ordenamientos y emparejamientos: la clave es
 * `matching_key` de cada opción y la respuesta es un mapa
 * `{ optionId: claveElegida }`.
 */
function evalGradeStructured_(question, options, answer, maxPoints) {
  var value = answer.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { isCorrect: false, pointsAwarded: 0, maxPoints: maxPoints, requiresManualReview: false };
  }
  var total = 0;
  var hits = 0;
  for (var i = 0; i < options.length; i++) {
    var option = options[i];
    var key = String(option.matchingKey || '');
    if (!key) continue;
    total++;
    var given = value[option.optionId];
    if (given !== undefined && String(given).trim().toLowerCase() === key.trim().toLowerCase()) hits++;
  }
  if (total === 0) {
    return { isCorrect: null, pointsAwarded: null, maxPoints: maxPoints, requiresManualReview: true };
  }
  var isCorrect = hits === total;
  var awarded = question.scoringMode === 'partial'
    ? evalRound2_((hits / total) * maxPoints)
    : (isCorrect ? maxPoints : 0);
  return {
    isCorrect: isCorrect,
    pointsAwarded: awarded,
    maxPoints: maxPoints,
    requiresManualReview: false
  };
}

/**
 * Califica un intento completo.
 *
 * `answers` son respuestas ya saneadas por `evalStripClientScoring_`.
 * Devuelve `{ graded, autoScore, score, correctAnswers, totalQuestions,
 * gradableQuestions, manualPendingCount, gradingStatus, passed }`.
 * Lanza VALIDATION_ERROR ante preguntas u opciones ajenas o duplicadas.
 */
function evalScoreAttempt_(snapshot, answers, passingScore) {
  var key = evalBuildAnswerKey_(snapshot);
  var issues = [];
  var seen = {};
  var normalized = [];

  for (var i = 0; i < answers.length; i++) {
    var answer = answers[i];
    if (!answer.questionId) {
      issues.push(evalIssue_('MISSING_QUESTION_ID', 'Hay una respuesta sin identificador de pregunta.'));
      continue;
    }
    if (seen[answer.questionId]) {
      issues.push(evalIssue_('DUPLICATE_ANSWER',
        'Se envió más de una respuesta para la misma pregunta.',
        { questionId: answer.questionId }));
      continue;
    }
    seen[answer.questionId] = true;
    var question = key.questionById[answer.questionId];
    if (!question) {
      issues.push(evalIssue_('FOREIGN_QUESTION',
        'La respuesta apunta a una pregunta que no pertenece a esta versión de la evaluación.',
        { questionId: answer.questionId }));
      continue;
    }
    var own = key.optionsByQuestion[answer.questionId] || [];
    var ownIds = {};
    for (var oi = 0; oi < own.length; oi++) ownIds[own[oi].optionId] = true;

    var selectedIds = [];
    if (answer.selectedOptionId) selectedIds.push(answer.selectedOptionId);
    for (var si = 0; si < answer.selectedOptionIds.length; si++) selectedIds.push(answer.selectedOptionIds[si]);
    var foreign = false;
    for (var s = 0; s < selectedIds.length; s++) {
      if (!ownIds[selectedIds[s]]) {
        issues.push(evalIssue_('FOREIGN_OPTION',
          'La opción seleccionada no pertenece a esta pregunta.',
          { questionId: answer.questionId, optionId: selectedIds[s] }));
        foreign = true;
      }
    }
    if (foreign) continue;
    normalized.push({ answer: answer, question: question, options: own });
  }

  if (issues.length > 0) {
    evalThrowIssues_('Las respuestas enviadas no son válidas.', issues);
  }

  var totalQuestions = key.activeQuestions.length;
  var gradableQuestions = 0;
  var manualQuestions = 0;
  for (var q = 0; q < key.activeQuestions.length; q++) {
    var candidate = key.activeQuestions[q];
    var candidateOptions = key.optionsByQuestion[candidate.questionId] || [];
    if (evalIsAutoGradable_(candidate, candidateOptions)) gradableQuestions++;
    else if (evalRequiresManualReview_(candidate, candidateOptions)) manualQuestions++;
  }

  var graded = [];
  var correctAnswers = 0;
  var manualPending = 0;
  for (var n = 0; n < normalized.length; n++) {
    var item = normalized[n];
    var result = evalGradeAnswer_(item.question, item.options, item.answer);
    if (result.isCorrect === true) correctAnswers++;
    if (result.requiresManualReview) manualPending++;
    graded.push({
      questionId: item.question.questionId,
      questionType: item.question.questionType,
      selectedOptionId: item.answer.selectedOptionId,
      value: item.answer.value,
      isCorrect: result.isCorrect,
      pointsAwarded: result.pointsAwarded,
      maxPoints: result.maxPoints,
      requiresManualReview: result.requiresManualReview
    });
  }

  // Las preguntas manuales no respondidas también quedan pendientes.
  if (manualQuestions > manualPending) manualPending = manualQuestions;

  var autoScore = gradableQuestions > 0
    ? evalRound2_((correctAnswers / gradableQuestions) * 100)
    : 0;

  var gradingStatus = manualPending > 0 ? 'pending_manual_review' : 'automatically_graded';
  var score = gradingStatus === 'pending_manual_review' ? null : autoScore;
  var passed = null;
  if (score !== null && passingScore !== null && passingScore !== undefined) {
    passed = score >= Number(passingScore);
  }

  return {
    graded: graded,
    autoScore: autoScore,
    score: score,
    correctAnswers: correctAnswers,
    totalQuestions: totalQuestions,
    gradableQuestions: gradableQuestions,
    manualPendingCount: manualPending,
    gradingStatus: gradingStatus,
    passed: passed
  };
}
