/**
 * Tests.gs — pruebas ejecutables desde el editor de Apps Script.
 *
 * Ejecuta `ejecutarPruebasEvaluaciones()` y revisa el registro. Las pruebas
 * trabajan sobre datos marcados con `[PRUEBA]` y se limpian al terminar, así
 * que NO tocan datos reales. Aun así, ejecútalas en una copia de la hoja o en
 * una hoja de pruebas separada (ver GOOGLE_SHEETS_SETUP.md §Separar entornos).
 *
 * Estas mismas comprobaciones se ejecutan automáticamente en el repositorio con
 * Vitest, sobre estos archivos .gs, mediante `scripts/run-apps-script.mjs`.
 */

function ejecutarPruebasEvaluaciones() {
  var results = [];
  var suite = [
    ['El esquema declara las nueve hojas', evalTestSchemaSheets_],
    ['Los tipos de pregunta cubren opción única y verdadero/falso', evalTestTypeCatalog_],
    ['La calificación da 100 con todas correctas', evalTestScoreAllCorrect_],
    ['La calificación da 0 con todas incorrectas', evalTestScoreNoneCorrect_],
    ['La calificación da 66.67 con dos de tres', evalTestScoreTwoOfThree_],
    ['Una opción ajena se rechaza', evalTestForeignOption_],
    ['Una pregunta ajena se rechaza', evalTestForeignQuestion_],
    ['Se ignora el puntaje enviado por el cliente', evalTestClientScoreIgnored_],
    ['Las preguntas manuales dejan la nota pendiente', evalTestManualPending_],
    ['El DTO público no expone respuestas correctas', evalTestPublicSanitization_],
    ['La validación de publicación exige título y opciones', evalTestPublishValidation_]
  ];
  for (var i = 0; i < suite.length; i++) {
    try {
      suite[i][1]();
      results.push('OK   · ' + suite[i][0]);
    } catch (error) {
      results.push('FALLA · ' + suite[i][0] + ' → ' + (error && error.message ? error.message : error));
    }
  }
  var text = results.join('\n');
  console.log(text);
  return text;
}

function evalAssert_(condition, message) {
  if (!condition) throw new Error(message || 'La aserción falló.');
}

function evalAssertEquals_(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || 'Valor inesperado') + ': se esperaba ' + expected + ' y llegó ' + actual);
  }
}

function evalAssertThrows_(fn, expectedCode, message) {
  try {
    fn();
  } catch (error) {
    if (expectedCode && error.evalCode !== expectedCode) {
      throw new Error((message || 'Código inesperado') + ': ' + error.evalCode);
    }
    return error;
  }
  throw new Error(message || 'Se esperaba un error y no ocurrió.');
}

/* ------------------------------- Datos de apoyo -------------------------- */

/** Snapshot sintético con tres preguntas de opción única. */
function evalTestSnapshot_() {
  var questions = [];
  var options = [];
  for (var i = 1; i <= 3; i++) {
    questions.push({
      questionId: 'qst_' + i, assessmentId: 'asm_t', sectionId: 'sec_1',
      questionText: 'Pregunta ' + i, questionType: 'q_single_choice', position: i - 1,
      required: true, scoringMode: 'exact', maxPoints: 1, weight: 1, active: true,
      configuration: {}, validation: {}, feedback: {}, media: null, accessibility: {}, tags: []
    });
    options.push({
      optionId: 'opt_' + i + 'a', questionId: 'qst_' + i, assessmentId: 'asm_t',
      optionText: 'Correcta', optionValue: 'a', position: 0, isCorrect: true,
      scoreValue: 1, matchingKey: '', active: true, configuration: {}
    });
    options.push({
      optionId: 'opt_' + i + 'b', questionId: 'qst_' + i, assessmentId: 'asm_t',
      optionText: 'Incorrecta', optionValue: 'b', position: 1, isCorrect: false,
      scoreValue: 0, matchingKey: '', active: true, configuration: {}
    });
  }
  return {
    schemaVersion: EVAL_CONFIG.SNAPSHOT_SCHEMA_VERSION,
    assessment: {
      assessmentId: 'asm_t', publicCode: 'EVL-TEST-0001', title: 'Prueba',
      description: '', instructions: 'Lee con atención.', status: 'published',
      durationMinutes: 10, passingScore: 70, accessType: 'public', version: 1,
      versionMinor: 0, versionLabel: 'v1.0', questionCount: 3,
      createdBy: 'alguien', updatedBy: 'alguien', internalInstructions: 'secreto interno',
      policies: {}, theme: {}, rules: [], rubrics: [], tags: ['interno']
    },
    sections: [{ sectionId: 'sec_1', assessmentId: 'asm_t', title: 'Sección 1', description: '', position: 0, active: true }],
    questions: questions,
    options: options
  };
}

/* ---------------------------------- Pruebas ------------------------------ */

function evalTestSchemaSheets_() {
  var names = Object.keys(EVAL_HEADERS);
  evalAssertEquals_(names.length, 9, 'Número de hojas declaradas');
  evalAssert_(EVAL_HEADERS.Assessments[0] === 'assessment_id', 'La primera columna de Assessments');
  evalAssert_(EVAL_HEADERS.Options.indexOf('is_correct') >= 0, 'Options debe tener is_correct');
}

function evalTestTypeCatalog_() {
  evalAssert_(evalTypeSpec_('q_single_choice').exactlyOneCorrect === true, 'q_single_choice');
  evalAssert_(evalTypeSpec_('q_true_false').maxOptions === 2, 'q_true_false');
  evalAssert_(evalTypeSpec_('c_title').grading === 'none', 'c_title');
  evalAssert_(evalTypeSpec_('inexistente') === null, 'Un tipo inexistente no debe resolverse');
}

function evalTestScoreAllCorrect_() {
  var result = evalScoreAttempt_(evalTestSnapshot_(), [
    { questionId: 'qst_1', selectedOptionId: 'opt_1a', selectedOptionIds: [], value: null },
    { questionId: 'qst_2', selectedOptionId: 'opt_2a', selectedOptionIds: [], value: null },
    { questionId: 'qst_3', selectedOptionId: 'opt_3a', selectedOptionIds: [], value: null }
  ], 70);
  evalAssertEquals_(result.score, 100, 'Nota con todas correctas');
  evalAssertEquals_(result.passed, true, 'Debe aprobar');
  evalAssertEquals_(result.gradingStatus, 'automatically_graded', 'Estado de calificación');
}

function evalTestScoreNoneCorrect_() {
  var result = evalScoreAttempt_(evalTestSnapshot_(), [
    { questionId: 'qst_1', selectedOptionId: 'opt_1b', selectedOptionIds: [], value: null },
    { questionId: 'qst_2', selectedOptionId: 'opt_2b', selectedOptionIds: [], value: null },
    { questionId: 'qst_3', selectedOptionId: 'opt_3b', selectedOptionIds: [], value: null }
  ], 70);
  evalAssertEquals_(result.score, 0, 'Nota con todas incorrectas');
  evalAssertEquals_(result.passed, false, 'No debe aprobar');
}

function evalTestScoreTwoOfThree_() {
  var result = evalScoreAttempt_(evalTestSnapshot_(), [
    { questionId: 'qst_1', selectedOptionId: 'opt_1a', selectedOptionIds: [], value: null },
    { questionId: 'qst_2', selectedOptionId: 'opt_2a', selectedOptionIds: [], value: null },
    { questionId: 'qst_3', selectedOptionId: 'opt_3b', selectedOptionIds: [], value: null }
  ], 70);
  evalAssertEquals_(result.score, 66.67, 'Nota con dos de tres');
}

function evalTestForeignOption_() {
  evalAssertThrows_(function () {
    evalScoreAttempt_(evalTestSnapshot_(), [
      { questionId: 'qst_1', selectedOptionId: 'opt_2a', selectedOptionIds: [], value: null }
    ], null);
  }, 'VALIDATION_ERROR', 'Debe rechazar una opción de otra pregunta');
}

function evalTestForeignQuestion_() {
  evalAssertThrows_(function () {
    evalScoreAttempt_(evalTestSnapshot_(), [
      { questionId: 'qst_999', selectedOptionId: '', selectedOptionIds: [], value: null }
    ], null);
  }, 'VALIDATION_ERROR', 'Debe rechazar una pregunta ajena');
}

function evalTestClientScoreIgnored_() {
  var stripped = evalStripClientScoring_({
    questionId: 'qst_1', selectedOptionId: 'opt_1b',
    isCorrect: true, pointsAwarded: 99, score: 100, passed: true
  });
  evalAssert_(stripped.isCorrect === undefined, 'isCorrect debe descartarse');
  evalAssert_(stripped.pointsAwarded === undefined, 'pointsAwarded debe descartarse');
  var result = evalScoreAttempt_(evalTestSnapshot_(), [stripped], 70);
  evalAssertEquals_(result.correctAnswers, 0, 'La respuesta era incorrecta');
  evalAssertEquals_(result.score, 0, 'La nota debe ser 0 pese al puntaje enviado');
}

function evalTestManualPending_() {
  var snapshot = evalTestSnapshot_();
  snapshot.questions.push({
    questionId: 'qst_manual', assessmentId: 'asm_t', sectionId: 'sec_1',
    questionText: 'Explica tu razonamiento', questionType: 'q_long_text', position: 3,
    required: false, scoringMode: 'manual', maxPoints: 5, weight: 1, active: true,
    configuration: {}, validation: {}, feedback: {}, media: null, accessibility: {}, tags: []
  });
  var result = evalScoreAttempt_(snapshot, [
    { questionId: 'qst_1', selectedOptionId: 'opt_1a', selectedOptionIds: [], value: null },
    { questionId: 'qst_2', selectedOptionId: 'opt_2a', selectedOptionIds: [], value: null },
    { questionId: 'qst_3', selectedOptionId: 'opt_3a', selectedOptionIds: [], value: null },
    { questionId: 'qst_manual', selectedOptionId: '', selectedOptionIds: [], value: 'Mi respuesta' }
  ], 70);
  evalAssertEquals_(result.gradingStatus, 'pending_manual_review', 'Debe quedar pendiente');
  evalAssert_(result.score === null, 'La nota final debe quedar vacía, no en cero');
  evalAssertEquals_(result.autoScore, 100, 'La parte objetiva sí se califica');
  evalAssert_(result.passed === null, 'No se decide aprobación hasta la revisión');
}

function evalTestPublicSanitization_() {
  var dto = evalPublicAssessment_(evalTestSnapshot_());
  var text = JSON.stringify(dto);
  var forbidden = ['isCorrect', 'is_correct', '"correct"', 'answerKey', 'scoreValue',
    'pointsAwarded', 'maxPoints', 'scoringMode', 'feedback', 'createdBy', 'updatedBy',
    'internalInstructions', 'passingScore', 'secreto interno'];
  for (var i = 0; i < forbidden.length; i++) {
    evalAssert_(text.indexOf(forbidden[i]) < 0, 'El DTO público no debe contener ' + forbidden[i]);
  }
  evalAssert_(dto.sections[0].questions[0].options.length === 2, 'Las opciones sí deben viajar');
  evalAssert_(dto.instructions === 'Lee con atención.', 'Las instrucciones públicas sí viajan');
}

function evalTestPublishValidation_() {
  var snapshot = evalTestSnapshot_();
  var assessment = snapshot.assessment;
  assessment.title = '';
  var issues = evalValidatePublish_(assessment, snapshot.sections, snapshot.questions, snapshot.options);
  var codes = issues.map(function (i) { return i.code; });
  evalAssert_(codes.indexOf('MISSING_TITLE') >= 0, 'Debe exigir título');

  assessment.title = 'Con título';
  var single = evalTestSnapshot_();
  single.options = single.options.filter(function (o) { return o.questionId !== 'qst_1' || o.isCorrect; });
  var issues2 = evalValidatePublish_(assessment, single.sections, single.questions, single.options);
  var codes2 = issues2.map(function (i) { return i.code; });
  evalAssert_(codes2.indexOf('NOT_ENOUGH_OPTIONS') >= 0, 'Debe exigir dos opciones');
}
