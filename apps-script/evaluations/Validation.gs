/**
 * Validation.gs — validación y catálogo de tipos de pregunta.
 *
 * Apps Script es la AUTORIDAD de validación. El frontend valida lo mismo para
 * dar retroalimentación inmediata, pero ninguna escritura llega a la hoja sin
 * pasar por aquí.
 *
 * Dos niveles:
 *   · `evalValidateSavePayload_` — un borrador PUEDE estar incompleto. Se valida
 *     la forma: tipos permitidos, ids válidos y únicos, referencias existentes,
 *     posiciones normalizables, rangos numéricos y ausencia de propiedades
 *     peligrosas.
 *   · `evalValidatePublish_` — reglas completas de publicación. Devuelve
 *     hallazgos navegables ({ code, message, path, questionId, optionId }).
 */

/**
 * Catálogo de tipos. `grading`:
 *   'none'                — bloque de contenido, no se califica.
 *   'auto'                — criterio objetivo derivado de las opciones correctas.
 *   'auto_if_configured'  — automático solo si existe una clave objetiva
 *                           (valor esperado o claves de emparejamiento).
 *   'manual'              — requiere revisión humana.
 *
 * Debe cubrir todos los tipos del registro del frontend
 * (src/features/assessments/question-types). Hay una prueba de paridad.
 */
var EVAL_QUESTION_TYPES = {
  /* ------------------------------ Contenido ------------------------------ */
  c_title: { kind: 'content', grading: 'none' },
  c_subtitle: { kind: 'content', grading: 'none' },
  c_paragraph: { kind: 'content', grading: 'none' },
  c_rich_text: { kind: 'content', grading: 'none' },
  c_instructions: { kind: 'content', grading: 'none' },
  c_callout: { kind: 'content', grading: 'none' },
  c_divider: { kind: 'content', grading: 'none' },
  c_page_break: { kind: 'content', grading: 'none' },
  c_image: { kind: 'content', grading: 'none' },
  c_video: { kind: 'content', grading: 'none' },
  c_audio: { kind: 'content', grading: 'none' },
  c_resource: { kind: 'content', grading: 'none' },

  /* -------------------------------- Texto -------------------------------- */
  q_short_text: { kind: 'question', grading: 'manual' },
  q_long_text: { kind: 'question', grading: 'manual' },

  /* ------------------------------- Numérico ------------------------------ */
  q_integer: { kind: 'question', grading: 'auto_if_configured', expects: 'number' },
  q_decimal: { kind: 'question', grading: 'auto_if_configured', expects: 'number' },
  q_percentage: { kind: 'question', grading: 'auto_if_configured', expects: 'number' },
  q_currency: { kind: 'question', grading: 'auto_if_configured', expects: 'number' },

  /* ------------------------------ Fecha/hora ----------------------------- */
  q_date: { kind: 'question', grading: 'auto_if_configured', expects: 'text' },
  q_time: { kind: 'question', grading: 'auto_if_configured', expects: 'text' },
  q_datetime: { kind: 'question', grading: 'auto_if_configured', expects: 'text' },

  /* -------------------------------- Opción ------------------------------- */
  q_single_choice: { kind: 'question', grading: 'auto', optionBased: true, minOptions: 2, exactlyOneCorrect: true },
  q_multiple_choice: { kind: 'question', grading: 'auto', optionBased: true, minOptions: 2, multiSelect: true },
  q_dropdown: { kind: 'question', grading: 'auto', optionBased: true, minOptions: 2, exactlyOneCorrect: true },
  q_multiselect: { kind: 'question', grading: 'auto', optionBased: true, minOptions: 2, multiSelect: true },
  q_true_false: {
    kind: 'question', grading: 'auto', optionBased: true, minOptions: 2, maxOptions: 2,
    exactlyOneCorrect: true, fixedOptions: [{ value: 'true', text: 'Verdadero' }, { value: 'false', text: 'Falso' }]
  },
  q_yes_no_na: { kind: 'question', grading: 'auto', optionBased: true, minOptions: 2, exactlyOneCorrect: true },
  q_image_choice: { kind: 'question', grading: 'auto', optionBased: true, minOptions: 2, exactlyOneCorrect: true },

  /* -------------------------------- Escalas ------------------------------ */
  q_likert: { kind: 'question', grading: 'auto', optionBased: true, minOptions: 2, exactlyOneCorrect: true },
  q_numeric_scale: { kind: 'question', grading: 'manual' },
  q_stars: { kind: 'question', grading: 'manual' },

  /* ------------------------------- Matrices ------------------------------ */
  q_matrix: { kind: 'question', grading: 'manual' },
  q_likert_matrix: { kind: 'question', grading: 'manual' },
  q_editable_table: { kind: 'question', grading: 'manual' },

  /* -------------------------- Orden / emparejar -------------------------- */
  q_ranking: { kind: 'question', grading: 'auto_if_configured', optionBased: true, minOptions: 2, expects: 'ordering' },
  q_ordering: { kind: 'question', grading: 'auto_if_configured', optionBased: true, minOptions: 2, expects: 'ordering' },
  q_matching: { kind: 'question', grading: 'auto_if_configured', optionBased: true, minOptions: 2, expects: 'matching' },
  q_categorization: { kind: 'question', grading: 'auto_if_configured', optionBased: true, minOptions: 2, expects: 'matching' },

  /* ------------------------------- Ricos --------------------------------- */
  q_hotspot: { kind: 'question', grading: 'manual' },
  q_scenario: { kind: 'question', grading: 'manual' },
  q_multi_step_case: { kind: 'question', grading: 'manual' },
  q_chart_interpretation: { kind: 'question', grading: 'manual' },
  q_file_response: { kind: 'question', grading: 'manual' },

  /* --------------------- Contratos de simulación ------------------------- */
  q_code: { kind: 'question', grading: 'manual' },
  q_sql: { kind: 'question', grading: 'manual' },
  q_spreadsheet_sim: { kind: 'question', grading: 'manual' },
  q_interactive_video: { kind: 'question', grading: 'manual' },
  q_credit_analysis: { kind: 'question', grading: 'manual' },
  q_risk_analysis: { kind: 'question', grading: 'manual' },
  q_cashier_sim: { kind: 'question', grading: 'manual' },
  q_reconciliation: { kind: 'question', grading: 'manual' },
  q_customer_service_sim: { kind: 'question', grading: 'manual' },
  q_operations_sim: { kind: 'question', grading: 'manual' },
  q_financial_statements: { kind: 'question', grading: 'manual' }
};

/** Especificación de un tipo, o `null` si no está en la lista blanca. */
function evalTypeSpec_(type) {
  var spec = EVAL_QUESTION_TYPES[String(type)];
  return spec ? spec : null;
}

/** ¿El tipo recoge una respuesta del candidato? */
function evalIsQuestionType_(type) {
  var spec = evalTypeSpec_(type);
  return !!(spec && spec.kind === 'question');
}

/** ¿El tipo usa opciones? */
function evalTypeUsesOptions_(type) {
  var spec = evalTypeSpec_(type);
  return !!(spec && spec.optionBased);
}

/** Clave objetiva del valor esperado de una pregunta sin opciones. */
function evalExpectedValue_(question) {
  var config = question.configuration || {};
  var validation = question.validation || {};
  if (config.expectedValue !== undefined && config.expectedValue !== null && config.expectedValue !== '') {
    return config.expectedValue;
  }
  if (validation.expectedValue !== undefined && validation.expectedValue !== null && validation.expectedValue !== '') {
    return validation.expectedValue;
  }
  return null;
}

/**
 * ¿Esta pregunta se puede calificar automáticamente con su configuración real?
 * `options` son las opciones ACTIVAS de la pregunta.
 */
function evalIsAutoGradable_(question, options) {
  var spec = evalTypeSpec_(question.questionType);
  if (!spec || spec.kind !== 'question') return false;
  if (question.scoringMode === 'none') return false;
  if (question.scoringMode === 'manual' || question.scoringMode === 'rubric') return false;

  if (spec.grading === 'auto') {
    if (spec.optionBased) {
      var correct = 0;
      for (var i = 0; i < options.length; i++) if (options[i].isCorrect) correct++;
      return correct > 0;
    }
    return true;
  }
  if (spec.grading === 'auto_if_configured') {
    if (spec.expects === 'ordering' || spec.expects === 'matching') {
      if (options.length === 0) return false;
      for (var j = 0; j < options.length; j++) {
        if (String(options[j].matchingKey || '') === '') return false;
      }
      return true;
    }
    return evalExpectedValue_(question) !== null;
  }
  return false;
}

/** ¿Requiere revisión humana (pregunta calificable pero no automática)? */
function evalRequiresManualReview_(question, options) {
  var spec = evalTypeSpec_(question.questionType);
  if (!spec || spec.kind !== 'question') return false;
  if (question.scoringMode === 'none') return false;
  return !evalIsAutoGradable_(question, options);
}

/* ------------------------------- Hallazgos ------------------------------- */

function evalIssue_(code, message, extra) {
  var issue = { code: code, message: message };
  if (extra) {
    var keys = Object.keys(extra);
    for (var i = 0; i < keys.length; i++) issue[keys[i]] = extra[keys[i]];
  }
  return issue;
}

function evalThrowIssues_(message, issues) {
  throw evalError_('VALIDATION_ERROR', message, { issues: issues });
}

/* --------------------------- Validación de guardado --------------------- */

/**
 * Valida y normaliza la carga de `updateAssessment`.
 *
 * Devuelve `{ assessment, sections, questions, options }` con posiciones
 * normalizadas a 0..n-1 y valores saneados. Lanza VALIDATION_ERROR con
 * `details.issues` cuando la forma es inválida.
 */
function evalValidateSavePayload_(payload, assessmentId) {
  var issues = [];
  var limits = EVAL_CONFIG.LIMITS;
  var incoming = payload && typeof payload === 'object' ? payload : {};
  var rawAssessment = incoming.assessment && typeof incoming.assessment === 'object'
    ? incoming.assessment : {};
  var rawSections = Array.isArray(incoming.sections) ? incoming.sections : [];
  var rawQuestions = Array.isArray(incoming.questions) ? incoming.questions : [];
  var rawOptions = Array.isArray(incoming.options) ? incoming.options : [];

  if (rawSections.length > limits.MAX_SECTIONS) {
    issues.push(evalIssue_('TOO_MANY_SECTIONS', 'La evaluación excede el máximo de secciones.'));
  }
  if (rawQuestions.length > limits.MAX_QUESTIONS) {
    issues.push(evalIssue_('TOO_MANY_QUESTIONS', 'La evaluación excede el máximo de preguntas.'));
  }

  /* --- Evaluación --- */
  var duration = evalNumOrNull_(rawAssessment.durationMinutes);
  if (duration !== null && (!isFinite(duration) || duration <= 0 || duration > 1440)) {
    issues.push(evalIssue_('INVALID_DURATION',
      'La duración debe quedar vacía o ser mayor que cero.', { path: 'durationMinutes' }));
  }
  var passing = evalNumOrNull_(rawAssessment.passingScore);
  if (passing !== null && (!isFinite(passing) || passing < 0 || passing > 100)) {
    issues.push(evalIssue_('INVALID_PASSING_SCORE',
      'La nota mínima debe quedar vacía o estar entre 0 y 100.', { path: 'passingScore' }));
  }
  var accessType = evalStr_(rawAssessment.accessType || 'public', 20);
  if (EVAL_CONFIG.ENUMS.ACCESS_TYPE.indexOf(accessType) < 0) {
    issues.push(evalIssue_('INVALID_ACCESS_TYPE', 'El tipo de acceso no es válido.', { path: 'accessType' }));
  }
  var category = evalStr_(rawAssessment.category || 'knowledge', 40);
  if (EVAL_CONFIG.ENUMS.CATEGORY.indexOf(category) < 0) category = 'knowledge';

  var assessment = {
    assessmentId: assessmentId,
    title: evalStr_(rawAssessment.title, limits.MAX_TITLE),
    description: evalStr_(rawAssessment.description, limits.MAX_TEXT),
    instructions: evalStr_(rawAssessment.instructions, limits.MAX_TEXT),
    internalInstructions: evalStr_(rawAssessment.internalInstructions, limits.MAX_TEXT),
    durationMinutes: duration,
    passingScore: passing === null ? null : Math.round(passing * 100) / 100,
    accessType: accessType,
    category: category,
    purpose: evalStr_(rawAssessment.purpose, 2000),
    tags: evalStringArray_(rawAssessment.tags, 50, 60),
    linkedProcessIds: evalStringArray_(rawAssessment.linkedProcessIds, 100, 120),
    policies: evalPlainObject_(rawAssessment.policies),
    theme: evalPlainObject_(rawAssessment.theme),
    rules: Array.isArray(rawAssessment.rules) ? rawAssessment.rules : [],
    rubrics: Array.isArray(rawAssessment.rubrics) ? rawAssessment.rubrics : []
  };

  /* --- Secciones --- */
  var sections = [];
  var sectionIds = {};
  for (var s = 0; s < rawSections.length; s++) {
    var rs = rawSections[s] || {};
    var sectionId = evalKeepOrNewId_(rs.sectionId, EVAL_ID_PREFIX.SECTION);
    if (sectionIds[sectionId]) {
      issues.push(evalIssue_('DUPLICATE_SECTION_ID',
        'Hay dos secciones con el mismo identificador.', { sectionId: sectionId }));
      continue;
    }
    sectionIds[sectionId] = true;
    sections.push({
      sectionId: sectionId,
      assessmentId: assessmentId,
      title: evalStr_(rs.title, limits.MAX_TITLE),
      description: evalStr_(rs.description, limits.MAX_TEXT),
      position: sections.length,
      timeLimitSeconds: evalNumOrNull_(rs.timeLimitSeconds),
      randomize: evalBoolOr_(rs.randomize, false),
      poolSize: evalNumOrNull_(rs.poolSize),
      weight: evalNum_(rs.weight, 1),
      active: evalBoolOr_(rs.active, true)
    });
  }

  /* --- Preguntas --- */
  var questions = [];
  var questionIds = {};
  var perSectionCount = {};
  var codes = {};
  for (var q = 0; q < rawQuestions.length; q++) {
    var rq = rawQuestions[q] || {};
    var questionId = evalKeepOrNewId_(rq.questionId, EVAL_ID_PREFIX.QUESTION);
    if (questionIds[questionId]) {
      issues.push(evalIssue_('DUPLICATE_QUESTION_ID',
        'Hay dos preguntas con el mismo identificador.', { questionId: questionId }));
      continue;
    }
    var questionType = evalStr_(rq.questionType, 60);
    if (!evalTypeSpec_(questionType)) {
      issues.push(evalIssue_('UNKNOWN_QUESTION_TYPE',
        'El tipo de pregunta "' + questionType + '" no está admitido.',
        { questionId: questionId, questionType: questionType }));
      continue;
    }
    var sectionId2 = evalStr_(rq.sectionId, 120);
    if (!sectionIds[sectionId2]) {
      issues.push(evalIssue_('ORPHAN_QUESTION',
        'La pregunta apunta a una sección que no existe.',
        { questionId: questionId, sectionId: sectionId2 }));
      continue;
    }
    var scoringMode = evalStr_(rq.scoringMode || 'none', 20);
    if (EVAL_CONFIG.ENUMS.SCORING_MODE.indexOf(scoringMode) < 0) scoringMode = 'none';
    var code = evalStr_(rq.code, 80);
    if (code) {
      if (codes[code]) {
        issues.push(evalIssue_('DUPLICATE_QUESTION_CODE',
          'El código de pregunta "' + code + '" está repetido.', { questionId: questionId }));
      }
      codes[code] = true;
    }
    var configVersion = evalInt_(rq.configurationSchemaVersion, EVAL_CONFIG.CONFIGURATION_SCHEMA_VERSION);
    if (configVersion > EVAL_CONFIG.CONFIGURATION_SCHEMA_VERSION) {
      issues.push(evalIssue_('UNSUPPORTED_CONFIG_SCHEMA',
        'La configuración de la pregunta usa una versión de esquema más nueva que la del servidor.',
        { questionId: questionId, configurationSchemaVersion: configVersion }));
      continue;
    }
    questionIds[questionId] = true;
    perSectionCount[sectionId2] = (perSectionCount[sectionId2] || 0);
    questions.push({
      questionId: questionId,
      assessmentId: assessmentId,
      sectionId: sectionId2,
      questionText: evalStr_(rq.questionText, limits.MAX_TEXT),
      questionType: questionType,
      position: perSectionCount[sectionId2]++,
      required: evalBoolOr_(rq.required, false),
      scoringMode: scoringMode,
      maxPoints: Math.max(0, evalNum_(rq.maxPoints, 0)),
      weight: Math.max(0, evalNum_(rq.weight, 1)),
      active: evalBoolOr_(rq.active, true),
      helpText: evalStr_(rq.helpText, 4000),
      description: evalStr_(rq.description, limits.MAX_TEXT),
      competency: evalStr_(rq.competency, 120),
      code: code,
      configuration: evalPlainObject_(rq.configuration),
      validation: evalPlainObject_(rq.validation),
      feedback: evalPlainObject_(rq.feedback),
      media: rq.media && typeof rq.media === 'object' ? evalPlainObject_(rq.media) : null,
      accessibility: evalPlainObject_(rq.accessibility),
      tags: evalStringArray_(rq.tags, 30, 60),
      configurationSchemaVersion: configVersion
    });
  }

  /* --- Opciones --- */
  var options = [];
  var optionIds = {};
  var perQuestionCount = {};
  var questionById = {};
  for (var qi = 0; qi < questions.length; qi++) questionById[questions[qi].questionId] = questions[qi];

  for (var o = 0; o < rawOptions.length; o++) {
    var ro = rawOptions[o] || {};
    var optionId = evalKeepOrNewId_(ro.optionId, EVAL_ID_PREFIX.OPTION);
    if (optionIds[optionId]) {
      issues.push(evalIssue_('DUPLICATE_OPTION_ID',
        'Hay dos opciones con el mismo identificador.', { optionId: optionId }));
      continue;
    }
    var ownerId = evalStr_(ro.questionId, 120);
    var owner = questionById[ownerId];
    if (!owner) {
      issues.push(evalIssue_('ORPHAN_OPTION',
        'La opción apunta a una pregunta que no existe en esta evaluación.',
        { optionId: optionId, questionId: ownerId }));
      continue;
    }
    perQuestionCount[ownerId] = (perQuestionCount[ownerId] || 0);
    if (perQuestionCount[ownerId] >= limits.MAX_OPTIONS_PER_QUESTION) {
      issues.push(evalIssue_('TOO_MANY_OPTIONS',
        'La pregunta excede el máximo de opciones.', { questionId: ownerId }));
      continue;
    }
    optionIds[optionId] = true;
    options.push({
      optionId: optionId,
      questionId: ownerId,
      assessmentId: assessmentId,
      optionText: evalStr_(ro.optionText, 1000),
      optionValue: evalStr_(ro.optionValue || optionId, 200),
      position: perQuestionCount[ownerId]++,
      isCorrect: evalBoolOr_(ro.isCorrect, false),
      scoreValue: evalNum_(ro.scoreValue, 0),
      matchingKey: evalStr_(ro.matchingKey, 200),
      active: evalBoolOr_(ro.active, true),
      feedback: evalStr_(ro.feedback, 2000),
      mediaUrl: evalStr_(ro.mediaUrl, 2000),
      configuration: evalPlainObject_(ro.configuration)
    });
  }

  if (issues.length > 0) {
    evalThrowIssues_('La estructura de la evaluación no es válida.', issues);
  }
  return { assessment: assessment, sections: sections, questions: questions, options: options };
}

/** Arreglo de textos saneado y acotado. */
function evalStringArray_(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return [];
  var out = [];
  for (var i = 0; i < value.length && out.length < maxItems; i++) {
    var s = evalStr_(value[i], maxLength);
    if (s) out.push(s);
  }
  return out;
}

/**
 * Objeto plano seguro: descarta funciones, prototipos contaminados
 * (`__proto__`, `constructor`, `prototype`) y anidamiento excesivo.
 */
function evalPlainObject_(value, depth) {
  var level = depth || 0;
  if (level > 6) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  var out = {};
  var keys = Object.keys(value);
  for (var i = 0; i < keys.length && i < 200; i++) {
    var key = keys[i];
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    var v = value[key];
    if (typeof v === 'function') continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) out[key] = evalPlainObject_(v, level + 1);
    else if (Array.isArray(v)) out[key] = v.slice(0, 500);
    else out[key] = v;
  }
  return out;
}

/* --------------------------- Reglas de publicación ---------------------- */

/**
 * Reglas completas para publicar. Devuelve un arreglo de hallazgos; vacío
 * significa que la evaluación puede publicarse.
 */
function evalValidatePublish_(assessment, sections, questions, options) {
  var issues = [];

  if (!evalStr_(assessment.title, 200).trim()) {
    issues.push(evalIssue_('MISSING_TITLE',
      'La evaluación necesita un título antes de publicarse.', { path: 'title' }));
  }
  if (assessment.durationMinutes !== null && assessment.durationMinutes !== undefined
      && !(assessment.durationMinutes > 0)) {
    issues.push(evalIssue_('INVALID_DURATION',
      'La duración debe quedar vacía o ser mayor que cero.', { path: 'durationMinutes' }));
  }
  if (assessment.passingScore !== null && assessment.passingScore !== undefined
      && (assessment.passingScore < 0 || assessment.passingScore > 100)) {
    issues.push(evalIssue_('INVALID_PASSING_SCORE',
      'La nota mínima debe estar entre 0 y 100.', { path: 'passingScore' }));
  }
  if (EVAL_CONFIG.ENUMS.ACCESS_TYPE.indexOf(assessment.accessType) < 0) {
    issues.push(evalIssue_('INVALID_ACCESS_TYPE', 'El tipo de acceso no es válido.', { path: 'accessType' }));
  }
  if (!(evalInt_(assessment.version, 0) >= 1)) {
    issues.push(evalIssue_('INVALID_VERSION', 'La versión de la evaluación no es válida.', { path: 'version' }));
  }
  if (assessment.status === 'archived') {
    issues.push(evalIssue_('INVALID_STATUS',
      'Una evaluación archivada no puede publicarse. Restáurala primero.', { path: 'status' }));
  }

  var activeSections = sections.filter(function (s) { return s.active !== false; });
  var activeQuestions = questions.filter(function (q) {
    return q.active !== false && evalIsQuestionType_(q.questionType);
  });

  if (activeQuestions.length === 0) {
    issues.push(evalIssue_('NO_ACTIVE_QUESTIONS',
      'La evaluación necesita al menos una pregunta activa.', { path: 'questions' }));
  }

  // Posiciones consecutivas de secciones.
  var sectionPositions = activeSections.map(function (s) { return evalInt_(s.position, -1); })
    .sort(function (a, b) { return a - b; });
  for (var sp = 0; sp < sectionPositions.length; sp++) {
    if (sectionPositions[sp] !== sp) {
      issues.push(evalIssue_('NON_CONSECUTIVE_SECTION_POSITIONS',
        'Las posiciones de las secciones no son consecutivas.', { path: 'sections' }));
      break;
    }
  }

  var optionsByQuestion = {};
  for (var i = 0; i < options.length; i++) {
    var op = options[i];
    if (op.active === false) continue;
    if (!optionsByQuestion[op.questionId]) optionsByQuestion[op.questionId] = [];
    optionsByQuestion[op.questionId].push(op);
  }

  var seenQuestionIds = {};
  var bySection = {};
  for (var q = 0; q < activeQuestions.length; q++) {
    var question = activeQuestions[q];
    if (seenQuestionIds[question.questionId]) {
      issues.push(evalIssue_('DUPLICATE_QUESTION_ID',
        'Hay dos preguntas con el mismo identificador.', { questionId: question.questionId }));
      continue;
    }
    seenQuestionIds[question.questionId] = true;

    if (!bySection[question.sectionId]) bySection[question.sectionId] = [];
    bySection[question.sectionId].push(evalInt_(question.position, -1));

    var spec = evalTypeSpec_(question.questionType);
    if (!spec) {
      issues.push(evalIssue_('UNKNOWN_QUESTION_TYPE',
        'El tipo de pregunta no está admitido.',
        { questionId: question.questionId, questionType: question.questionType }));
      continue;
    }
    if (!evalStr_(question.questionText, 8000).trim()) {
      issues.push(evalIssue_('MISSING_QUESTION_TEXT',
        'Hay una pregunta sin enunciado.',
        { questionId: question.questionId, path: 'questionText' }));
    }

    var own = optionsByQuestion[question.questionId] || [];
    if (spec.optionBased) {
      var minOptions = spec.minOptions || 2;
      if (own.length < minOptions) {
        issues.push(evalIssue_('NOT_ENOUGH_OPTIONS',
          'La pregunta necesita al menos ' + minOptions + ' opciones activas.',
          { questionId: question.questionId, path: 'options' }));
      }
      if (spec.maxOptions && own.length > spec.maxOptions) {
        issues.push(evalIssue_('TOO_MANY_OPTIONS',
          'La pregunta admite como máximo ' + spec.maxOptions + ' opciones.',
          { questionId: question.questionId, path: 'options' }));
      }
      var correct = 0;
      var optionPositions = [];
      for (var oi = 0; oi < own.length; oi++) {
        var opt = own[oi];
        if (!evalStr_(opt.optionText, 1000).trim()) {
          issues.push(evalIssue_('MISSING_OPTION_TEXT',
            'Hay una opción sin texto.',
            { questionId: question.questionId, optionId: opt.optionId, path: 'options' }));
        }
        if (opt.isCorrect) correct++;
        optionPositions.push(evalInt_(opt.position, -1));
      }
      optionPositions.sort(function (a, b) { return a - b; });
      for (var op2 = 0; op2 < optionPositions.length; op2++) {
        if (optionPositions[op2] !== op2) {
          issues.push(evalIssue_('NON_CONSECUTIVE_OPTION_POSITIONS',
            'Las posiciones de las opciones no son consecutivas.',
            { questionId: question.questionId, path: 'options' }));
          break;
        }
      }
      var scored = question.scoringMode !== 'none' && question.scoringMode !== 'manual'
        && question.scoringMode !== 'rubric';
      if (scored && spec.exactlyOneCorrect && correct !== 1) {
        issues.push(evalIssue_(correct === 0 ? 'NO_CORRECT_OPTION' : 'MULTIPLE_CORRECT_OPTIONS',
          correct === 0
            ? 'La pregunta no tiene una respuesta correcta marcada.'
            : 'La pregunta tiene más de una respuesta correcta y solo admite una.',
          { questionId: question.questionId, path: 'options', correctCount: correct }));
      }
      if (scored && spec.multiSelect && correct === 0) {
        issues.push(evalIssue_('NO_CORRECT_OPTION',
          'La pregunta no tiene ninguna respuesta correcta marcada.',
          { questionId: question.questionId, path: 'options' }));
      }
      if (spec.fixedOptions) {
        var values = own.map(function (o) { return String(o.optionValue || '').toLowerCase(); }).sort();
        var wanted = spec.fixedOptions.map(function (f) { return f.value; }).sort();
        if (values.join('|') !== wanted.join('|')) {
          issues.push(evalIssue_('INVALID_FIXED_OPTIONS',
            'Las opciones de este tipo deben ser exactamente: ' +
            spec.fixedOptions.map(function (f) { return f.text; }).join(' / ') + '.',
            { questionId: question.questionId, path: 'options' }));
        }
      }
    } else if (own.length > 0) {
      issues.push(evalIssue_('UNEXPECTED_OPTIONS',
        'Este tipo de pregunta no admite opciones.',
        { questionId: question.questionId, path: 'options' }));
    }
  }

  // Posiciones consecutivas de preguntas dentro de cada sección.
  var sectionKeys = Object.keys(bySection);
  for (var sk = 0; sk < sectionKeys.length; sk++) {
    var positions = bySection[sectionKeys[sk]].slice().sort(function (a, b) { return a - b; });
    for (var p = 0; p < positions.length; p++) {
      if (positions[p] !== p) {
        issues.push(evalIssue_('NON_CONSECUTIVE_QUESTION_POSITIONS',
          'Las posiciones de las preguntas no son consecutivas.',
          { sectionId: sectionKeys[sk], path: 'questions' }));
        break;
      }
    }
  }

  // Opciones huérfanas (apuntan a preguntas inexistentes o inactivas).
  var activeIds = {};
  for (var aq = 0; aq < activeQuestions.length; aq++) activeIds[activeQuestions[aq].questionId] = true;
  var orphanKeys = Object.keys(optionsByQuestion);
  for (var ok = 0; ok < orphanKeys.length; ok++) {
    if (!activeIds[orphanKeys[ok]]) {
      issues.push(evalIssue_('ORPHAN_OPTION',
        'Hay opciones activas que pertenecen a una pregunta inexistente o inactiva.',
        { questionId: orphanKeys[ok] }));
    }
  }

  return issues;
}

/**
 * Descarta cualquier dato de calificación enviado por el cliente.
 * El servidor es la única autoridad de `isCorrect`, `pointsAwarded`, `score`,
 * `passed`, `autoScore` y `gradingStatus`.
 */
function evalStripClientScoring_(raw) {
  var answer = raw && typeof raw === 'object' ? raw : {};
  return {
    questionId: evalStr_(answer.questionId, 120),
    selectedOptionId: evalStr_(answer.selectedOptionId, 120),
    selectedOptionIds: evalStringArray_(answer.selectedOptionIds, 60, 120),
    value: answer.value === undefined ? null : answer.value
  };
}
