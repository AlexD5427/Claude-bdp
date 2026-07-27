/**
 * Sanitize.gs — proyección pública.
 *
 * SEGURIDAD CRÍTICA. Este archivo es la única forma en que datos de una
 * evaluación salen hacia el portal de candidatos. Construye el DTO público
 * campo por campo (lista blanca), nunca copiando el objeto interno, de modo que
 * una columna nueva en la hoja no puede filtrarse por accidente.
 *
 * Campos que NUNCA salen:
 *   is_correct / isCorrect / correct / correctAnswer / answerKey,
 *   score_value / scoreValue / score / points_awarded / pointsAwarded /
 *   max_points / maxPoints / scoring_mode / scoringMode,
 *   feedback, internal_instructions, passing_score,
 *   created_by / updated_by, entity_version, tags, rules, rubrics,
 *   cualquier columna de auditoría y el `assessment_id` interno.
 */

/** Claves de configuración que sí pueden llegar al renderizador del candidato. */
var EVAL_PUBLIC_CONFIG_KEYS = [
  'placeholder', 'min', 'max', 'step', 'rows', 'maxLength', 'minLength',
  'scaleMin', 'scaleMax', 'scaleStep', 'columns', 'currency', 'decimals',
  'allowMultiple', 'maxSelections', 'minSelections', 'icon', 'starCount',
  'labelMin', 'labelMax', 'matrixRows', 'matrixColumns'
];

/** Filtra la configuración a la lista blanca de presentación. */
function evalPublicConfig_(config) {
  var out = {};
  if (!config || typeof config !== 'object') return out;
  for (var i = 0; i < EVAL_PUBLIC_CONFIG_KEYS.length; i++) {
    var key = EVAL_PUBLIC_CONFIG_KEYS[i];
    if (config[key] !== undefined && config[key] !== null) out[key] = config[key];
  }
  return out;
}

/** Proyección pública de una opción. */
function evalPublicOption_(option) {
  return {
    optionId: String(option.optionId),
    optionValue: String(option.optionValue || option.optionId),
    optionText: String(option.optionText || ''),
    mediaUrl: option.mediaUrl ? String(option.mediaUrl) : null
  };
}

/** Proyección pública de una pregunta (o bloque de contenido). */
function evalPublicQuestion_(question, options) {
  // `options` llega ya ordenada por `position` desde el constructor del DTO.
  var publicOptions = [];
  for (var i = 0; i < options.length; i++) {
    if (options[i].active === false) continue;
    publicOptions.push(evalPublicOption_(options[i]));
  }
  return {
    questionId: String(question.questionId),
    questionType: String(question.questionType),
    position: evalInt_(question.position, 0),
    questionText: String(question.questionText || ''),
    description: String(question.description || ''),
    helpText: String(question.helpText || ''),
    required: question.required === true,
    configuration: evalPublicConfig_(question.configuration),
    media: question.media && question.media.url
      ? { kind: String(question.media.kind || 'image'), url: String(question.media.url), alt: String(question.media.alt || '') }
      : null,
    accessibility: {
      ariaLabel: String((question.accessibility || {}).ariaLabel || ''),
      longDescription: String((question.accessibility || {}).longDescription || '')
    },
    options: publicOptions
  };
}

/**
 * DTO público completo de una evaluación publicada.
 * `snapshot` es `{ assessment, sections, questions, options }`.
 */
function evalPublicAssessment_(snapshot) {
  var assessment = snapshot.assessment;
  var policies = assessment.policies || {};
  var optionsByQuestion = {};
  for (var o = 0; o < snapshot.options.length; o++) {
    var op = snapshot.options[o];
    if (!optionsByQuestion[op.questionId]) optionsByQuestion[op.questionId] = [];
    optionsByQuestion[op.questionId].push(op);
  }
  for (var key in optionsByQuestion) {
    if (!Object.prototype.hasOwnProperty.call(optionsByQuestion, key)) continue;
    optionsByQuestion[key].sort(function (a, b) {
      return evalInt_(a.position, 0) - evalInt_(b.position, 0);
    });
  }

  var questionsBySection = {};
  for (var q = 0; q < snapshot.questions.length; q++) {
    var question = snapshot.questions[q];
    if (question.active === false) continue;
    if (!questionsBySection[question.sectionId]) questionsBySection[question.sectionId] = [];
    questionsBySection[question.sectionId].push(question);
  }

  var sections = snapshot.sections
    .filter(function (s) { return s.active !== false; })
    .sort(function (a, b) { return evalInt_(a.position, 0) - evalInt_(b.position, 0); })
    .map(function (section) {
      var own = (questionsBySection[section.sectionId] || []).slice().sort(function (a, b) {
        return evalInt_(a.position, 0) - evalInt_(b.position, 0);
      });
      return {
        sectionId: String(section.sectionId),
        title: String(section.title || ''),
        description: String(section.description || ''),
        position: evalInt_(section.position, 0),
        timeLimitSeconds: evalNumOrNull_(section.timeLimitSeconds),
        questions: own.map(function (question) {
          return evalPublicQuestion_(question, optionsByQuestion[question.questionId] || []);
        })
      };
    });

  var questionCount = 0;
  for (var s = 0; s < sections.length; s++) {
    for (var i = 0; i < sections[s].questions.length; i++) {
      if (String(sections[s].questions[i].questionType).indexOf('q_') === 0) questionCount++;
    }
  }

  return {
    publicCode: String(assessment.publicCode),
    title: String(assessment.title || ''),
    description: String(assessment.description || ''),
    instructions: String(assessment.instructions || ''),
    durationMinutes: evalNumOrNull_(assessment.durationMinutes),
    versionLabel: String(assessment.versionLabel || ''),
    assessmentVersion: evalInt_(assessment.version, 1),
    questionCount: questionCount,
    theme: evalPublicTheme_(assessment.theme),
    navigation: evalPublicNavigation_(policies.navigation),
    consent: evalPublicConsent_(policies.consent),
    sections: sections
  };
}

/** Resumen público para el listado (aún más reducido). */
function evalPublicAssessmentSummary_(assessment, questionCount) {
  return {
    publicCode: String(assessment.publicCode),
    title: String(assessment.title || ''),
    description: String(assessment.description || ''),
    instructions: '',
    durationMinutes: evalNumOrNull_(assessment.durationMinutes),
    questionCount: evalInt_(questionCount, 0),
    versionLabel: String(assessment.versionLabel || '')
  };
}

function evalPublicTheme_(theme) {
  var t = theme || {};
  var accents = ['cyan', 'blue', 'indigo', 'emerald', 'violet'];
  var accent = accents.indexOf(String(t.accent)) >= 0 ? String(t.accent) : 'cyan';
  return {
    accent: accent,
    density: String(t.density) === 'compact' ? 'compact' : 'comfortable',
    showProgressBar: t.showProgressBar !== false
  };
}

function evalPublicNavigation_(navigation) {
  var n = navigation || {};
  var modes = ['free', 'sequential', 'one_by_one'];
  return {
    mode: modes.indexOf(String(n.mode)) >= 0 ? String(n.mode) : 'free',
    allowBack: n.allowBack !== false,
    showProgress: n.showProgress !== false
  };
}

function evalPublicConsent_(consent) {
  var c = consent || {};
  return {
    requireConsent: c.requireConsent === true,
    consentText: String(c.consentText || '').slice(0, 8000),
    requireDataPrivacyAcceptance: c.requireDataPrivacyAcceptance !== false
  };
}

/**
 * Resultado que se devuelve al candidato al enviar un intento. Respeta
 * `policies.resultVisibility.candidate` y nunca incluye la clave de respuestas.
 */
function evalPublicAttemptResult_(attempt, visibility) {
  var mode = String(visibility || 'none');
  var base = {
    attemptId: String(attempt.attemptId),
    status: String(attempt.status),
    gradingStatus: String(attempt.gradingStatus),
    received: evalInt_(attempt.answersReceived, 0)
  };
  if (mode === 'none' || mode === 'submission_only') return base;
  base.score = attempt.score === null || attempt.score === undefined ? null : Number(attempt.score);
  base.passed = attempt.passed === null || attempt.passed === undefined ? null : attempt.passed === true;
  return base;
}
