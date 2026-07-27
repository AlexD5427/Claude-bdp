/**
 * Setup.gs — inicialización y verificación del esquema.
 *
 * Estas funciones se ejecutan A MANO desde el editor de Apps Script (menú
 * «Ejecutar»). Ninguna borra datos:
 *
 *   configurarEvaluaciones()          crea las hojas y los encabezados que falten
 *   verificarEsquemaEvaluaciones()    informa del estado sin modificar nada
 *   crearDatosDePruebaEvaluaciones()  crea UNA evaluación de prueba marcada
 *   limpiarDatosDePruebaEvaluaciones() borra SOLO lo creado por la función anterior
 *   migrarDesdeHojaEvaluaciones()     importa la hoja heredada `Evaluaciones`
 *
 * Ver docs/evaluations/GOOGLE_SHEETS_SETUP.md.
 */

/** Prefijo con el que se marcan los datos de prueba, para poder limpiarlos. */
var EVAL_TEST_MARKER = '[PRUEBA]';

/**
 * Crea las hojas que falten con sus encabezados y añade los encabezados
 * ausentes al final de las hojas existentes. Nunca reordena ni renombra
 * columnas, y nunca borra datos.
 */
function configurarEvaluaciones() {
  var ss = evalSpreadsheet_();
  var created = [];
  var addedHeaders = [];
  var names = Object.keys(EVAL_HEADERS);

  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var expected = EVAL_HEADERS[name];
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, expected.length).setFontWeight('bold');
      created.push(name);
      continue;
    }
    var lastColumn = sheet.getLastColumn();
    var actual = lastColumn > 0
      ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (h) {
          return String(h || '').trim();
        })
      : [];
    var missing = expected.filter(function (h) { return actual.indexOf(h) < 0; });
    if (missing.length > 0) {
      sheet.getRange(1, lastColumn + 1, 1, missing.length).setValues([missing]);
      sheet.getRange(1, lastColumn + 1, 1, missing.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
      addedHeaders.push({ sheet: name, headers: missing });
    }
  }

  var report = {
    createdSheets: created,
    addedHeaders: addedHeaders,
    verification: evalVerifySchema_(ss)
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

/** Informe del esquema, sin modificar nada. */
function verificarEsquemaEvaluaciones() {
  var report = evalVerifySchema_(evalSpreadsheet_());
  console.log(JSON.stringify(report, null, 2));
  return report;
}

/** Acción `setupSchema` expuesta por la API (solo administradores). */
function evalSetupSchemaAction_(context) {
  var report = configurarEvaluaciones();
  evalAudit_(context.ss, {
    requestId: context.requestId, action: 'setupSchema', entityType: 'schema',
    entityId: '', actor: context.actor, status: 'ok',
    metadata: { createdSheets: report.createdSheets.length, ok: report.verification.ok }
  });
  return { data: report, reference: 'schema', summary: { ok: report.verification.ok } };
}

/**
 * Crea una evaluación de prueba completa y publicada, con el título marcado con
 * `[PRUEBA]` para poder limpiarla después sin tocar datos reales.
 */
function crearDatosDePruebaEvaluaciones() {
  configurarEvaluaciones();
  var actor = evalActiveEmail_() || 'setup';
  var requestId = evalNewId_(EVAL_ID_PREFIX.REQUEST);

  var created = evalHandleRequest_({
    action: 'createAssessment',
    requestId: requestId,
    payload: { title: EVAL_TEST_MARKER + ' Conocimientos de riesgo', category: 'knowledge', actor: actor }
  });
  if (!created.ok) throw new Error('No se pudo crear la evaluación de prueba: ' + created.error.message);

  var assessment = created.data.assessment;
  var sectionId = created.data.sections[0].sectionId;
  var q1 = evalNewId_(EVAL_ID_PREFIX.QUESTION);
  var q2 = evalNewId_(EVAL_ID_PREFIX.QUESTION);
  var q3 = evalNewId_(EVAL_ID_PREFIX.QUESTION);

  var updated = evalHandleRequest_({
    action: 'updateAssessment',
    requestId: evalNewId_(EVAL_ID_PREFIX.REQUEST),
    payload: {
      assessmentId: assessment.assessmentId,
      expectedEntityVersion: assessment.entityVersion,
      actor: actor,
      assessment: {
        title: EVAL_TEST_MARKER + ' Conocimientos de riesgo',
        description: 'Evaluación de prueba creada por Setup.gs. Se puede borrar.',
        instructions: 'Responde con base en tu experiencia.',
        durationMinutes: 15,
        passingScore: 70,
        accessType: 'public',
        category: 'knowledge'
      },
      sections: [{ sectionId: sectionId, title: 'Conocimientos generales', position: 0, active: true }],
      questions: [
        {
          questionId: q1, sectionId: sectionId, questionType: 'q_single_choice',
          questionText: '¿Qué mide la tasa de morosidad de una cartera?', position: 0,
          required: true, scoringMode: 'exact', maxPoints: 1, active: true
        },
        {
          questionId: q2, sectionId: sectionId, questionType: 'q_true_false',
          questionText: 'Una garantía reduce la pérdida esperada.', position: 1,
          required: true, scoringMode: 'exact', maxPoints: 1, active: true
        },
        {
          questionId: q3, sectionId: sectionId, questionType: 'q_long_text',
          questionText: 'Explica cómo evaluarías un crédito con historial irregular.',
          position: 2, required: false, scoringMode: 'manual', maxPoints: 5, active: true
        }
      ],
      options: [
        { questionId: q1, optionText: 'El porcentaje de créditos con atraso', optionValue: 'a', position: 0, isCorrect: true, scoreValue: 1, active: true },
        { questionId: q1, optionText: 'El total de créditos otorgados', optionValue: 'b', position: 1, isCorrect: false, active: true },
        { questionId: q1, optionText: 'La utilidad neta del periodo', optionValue: 'c', position: 2, isCorrect: false, active: true },
        { questionId: q2, optionText: 'Verdadero', optionValue: 'true', position: 0, isCorrect: true, scoreValue: 1, active: true },
        { questionId: q2, optionText: 'Falso', optionValue: 'false', position: 1, isCorrect: false, active: true }
      ]
    }
  });
  if (!updated.ok) throw new Error('No se pudo guardar la evaluación de prueba: ' + updated.error.message);

  var published = evalHandleRequest_({
    action: 'publishAssessment',
    requestId: evalNewId_(EVAL_ID_PREFIX.REQUEST),
    payload: {
      assessmentId: assessment.assessmentId,
      expectedEntityVersion: updated.data.assessment.entityVersion,
      notes: 'Versión de prueba', actor: actor
    }
  });
  if (!published.ok) throw new Error('No se pudo publicar la evaluación de prueba: ' + published.error.message);

  var result = {
    assessmentId: assessment.assessmentId,
    publicCode: published.data.assessment.publicCode,
    versionLabel: published.data.assessment.versionLabel
  };
  console.log('Evaluación de prueba lista: ' + JSON.stringify(result, null, 2));
  return result;
}

/**
 * Borra ÚNICAMENTE las filas cuyo título empieza con el marcador de prueba, más
 * sus secciones, preguntas, opciones, versiones, intentos y respuestas. No toca
 * ningún otro dato.
 */
function limpiarDatosDePruebaEvaluaciones() {
  var ss = evalSpreadsheet_();
  var assessments = evalReadAll_(ss, EVAL_CONFIG.SHEETS.ASSESSMENTS);
  var targets = {};
  var count = 0;
  for (var i = 0; i < assessments.length; i++) {
    if (String(assessments[i].title).indexOf(EVAL_TEST_MARKER) === 0) {
      targets[String(assessments[i].assessment_id)] = true;
      count++;
    }
  }
  if (count === 0) {
    console.log('No hay datos de prueba que limpiar.');
    return { removed: 0 };
  }

  var plan = [
    { sheet: EVAL_CONFIG.SHEETS.ANSWERS, field: 'assessment_id' },
    { sheet: EVAL_CONFIG.SHEETS.ATTEMPTS, field: 'assessment_id' },
    { sheet: EVAL_CONFIG.SHEETS.VERSIONS, field: 'assessment_id' },
    { sheet: EVAL_CONFIG.SHEETS.OPTIONS, field: 'assessment_id' },
    { sheet: EVAL_CONFIG.SHEETS.QUESTIONS, field: 'assessment_id' },
    { sheet: EVAL_CONFIG.SHEETS.SECTIONS, field: 'assessment_id' },
    { sheet: EVAL_CONFIG.SHEETS.ASSESSMENTS, field: 'assessment_id' }
  ];
  var removed = 0;
  for (var p = 0; p < plan.length; p++) {
    var sheet = evalSheet_(ss, plan[p].sheet);
    var rows = evalReadAll_(ss, plan[p].sheet);
    // De abajo hacia arriba para que los índices no se desplacen.
    for (var r = rows.length - 1; r >= 0; r--) {
      if (targets[String(rows[r][plan[p].field])]) {
        sheet.deleteRow(rows[r].__row);
        removed++;
      }
    }
  }
  console.log('Filas de prueba eliminadas: ' + removed);
  return { removed: removed, assessments: count };
}

/**
 * Migración desde la hoja heredada `Evaluaciones` (una fila por evaluación con
 * columnas JSON) al esquema normalizado.
 *
 * · No modifica ni borra la hoja heredada.
 * · Es idempotente: si el `assessment_id` ya existe en `Assessments`, se omite.
 * · Ejecuta primero `configurarEvaluaciones()`.
 * · Devuelve el informe para revisarlo antes de dar por buena la migración.
 */
function migrarDesdeHojaEvaluaciones() {
  configurarEvaluaciones();
  var ss = evalSpreadsheet_();
  var legacy = ss.getSheetByName('Evaluaciones');
  if (!legacy) {
    console.log('No existe la hoja heredada "Evaluaciones". Nada que migrar.');
    return { migrated: 0, skipped: 0, failed: [] };
  }
  var values = legacy.getDataRange().getValues();
  if (values.length < 2) return { migrated: 0, skipped: 0, failed: [] };
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var index = {};
  for (var h = 0; h < headers.length; h++) index[headers[h]] = h;

  var existing = {};
  var current = evalReadAll_(ss, EVAL_CONFIG.SHEETS.ASSESSMENTS);
  for (var c = 0; c < current.length; c++) existing[String(current[c].assessment_id)] = true;

  var report = { migrated: 0, skipped: 0, failed: [] };
  var now = evalNow_();

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var id = String(row[index.ID] || '');
    if (!id) continue;
    if (existing[id]) { report.skipped++; continue; }
    try {
      var sectionsJson = evalParseJson_(row[index.SeccionesJson], []);
      var config = evalParseJson_(row[index.ConfiguracionJson], {});
      var sections = [];
      var questions = [];
      var options = [];
      for (var s = 0; s < sectionsJson.length; s++) {
        var section = sectionsJson[s] || {};
        var sectionId = evalKeepOrNewId_(section.id, EVAL_ID_PREFIX.SECTION);
        sections.push({
          sectionId: sectionId, assessmentId: id, title: evalStr_(section.title, 200),
          description: evalStr_(section.description, 8000), position: s,
          timeLimitSeconds: evalNumOrNull_((section.config || {}).timeLimitSeconds),
          randomize: evalBoolOr_((section.config || {}).randomizeBlocks, false),
          poolSize: evalNumOrNull_((section.config || {}).poolSize),
          weight: evalNum_((section.config || {}).weight, 1), active: true, createdAt: now
        });
        var blocks = Array.isArray(section.blocks) ? section.blocks : [];
        for (var b = 0; b < blocks.length; b++) {
          var block = blocks[b] || {};
          if (!evalTypeSpec_(block.type)) continue;
          var questionId = evalKeepOrNewId_(block.id, EVAL_ID_PREFIX.QUESTION);
          var score = block.score || {};
          questions.push({
            questionId: questionId, assessmentId: id, sectionId: sectionId,
            questionText: evalStr_(block.label, 8000), questionType: String(block.type),
            position: b, required: evalBoolOr_(block.required, false),
            scoringMode: evalStr_(score.mode || 'none', 20),
            maxPoints: evalNum_(score.points, 0), weight: evalNum_(score.weight, 1),
            active: true, helpText: evalStr_(block.helpText, 4000),
            description: evalStr_(block.description, 8000),
            competency: evalStr_(score.competency, 120), code: evalStr_(block.code, 80),
            configuration: evalPlainObject_(block.config), validation: evalPlainObject_(block.validation),
            feedback: evalPlainObject_(block.feedback), media: block.media || null,
            accessibility: evalPlainObject_(block.accessibility),
            tags: evalStringArray_(block.tags, 30, 60),
            configurationSchemaVersion: EVAL_CONFIG.CONFIGURATION_SCHEMA_VERSION,
            createdAt: now
          });
          var blockOptions = Array.isArray(block.options) ? block.options : [];
          for (var o = 0; o < blockOptions.length; o++) {
            var option = blockOptions[o] || {};
            options.push({
              optionId: evalKeepOrNewId_(option.id, EVAL_ID_PREFIX.OPTION),
              questionId: questionId, assessmentId: id,
              optionText: evalStr_(option.label, 1000),
              optionValue: evalStr_(option.value || option.id, 200), position: o,
              isCorrect: evalBoolOr_(option.correct, false),
              scoreValue: evalNum_(option.score, 0), matchingKey: '', active: true,
              feedback: evalStr_(option.feedback, 2000),
              mediaUrl: evalStr_(option.mediaUrl, 2000), configuration: {}, createdAt: now
            });
          }
        }
      }

      var taken = {};
      var codes = evalReadAll_(ss, EVAL_CONFIG.SHEETS.ASSESSMENTS);
      for (var t = 0; t < codes.length; t++) taken[String(codes[t].public_code)] = true;
      var title = evalStr_(row[index.Nombre], 200) || 'Evaluación importada';
      var lifecycle = evalStr_(row[index.Estado], 20) || 'draft';
      var publication = evalStr_(row[index.EstadoPublicacion], 20) || 'unpublished';

      var assessment = {
        assessmentId: id,
        publicCode: evalStr_(row[index.Codigo], 60) || evalPublicCode_(title, taken),
        title: title,
        description: '',
        instructions: evalStr_(config.publicInstructions, 8000),
        status: 'draft',
        durationMinutes: evalNumOrNull_(row[index.DuracionEstimada]),
        passingScore: evalNumOrNull_((evalParseJson_(row[index.PoliticaPuntuacionJson], {}) || {}).passThreshold),
        accessType: 'public',
        version: evalInt_(row[index.VersionMayor], 1),
        questionCount: evalCountQuestions_(questions),
        createdAt: evalStr_(row[index.FechaCreacion], 40) || now,
        updatedAt: now,
        publishedAt: '',
        archivedAt: '',
        createdBy: evalStr_(row[index.CreadoPor], 200),
        updatedBy: 'migracion',
        versionMinor: evalInt_(row[index.VersionMenor], 0),
        versionLabel: 'v' + evalInt_(row[index.VersionMayor], 1) + '.' + evalInt_(row[index.VersionMenor], 0),
        lifecycleStatus: lifecycle === 'published' ? 'draft' : lifecycle,
        publicationStatus: publication === 'published' ? 'unpublished' : publication,
        category: evalStr_(row[index.Categoria], 40) || 'knowledge',
        purpose: evalStr_(row[index.Proposito], 2000),
        tags: evalStringArray_(config.tags, 50, 60),
        linkedProcessIds: evalParseJson_(row[index.ProcesosJson], []),
        policies: {
          attempt: evalParseJson_(row[index.PoliticaIntentosJson], {}),
          timing: evalParseJson_(row[index.PoliticaTiempoJson], {}),
          navigation: evalParseJson_(row[index.PoliticaNavegacionJson], {}),
          scoring: evalParseJson_(row[index.PoliticaPuntuacionJson], {}),
          monitoring: evalParseJson_(row[index.PoliticaMonitoreoJson], {}),
          consent: evalParseJson_(row[index.PoliticaConsentimientoJson], {})
        },
        theme: evalParseJson_(row[index.TemaJson], {}),
        rules: evalParseJson_(row[index.ReglasJson], []),
        rubrics: Array.isArray(config.rubrics) ? config.rubrics : [],
        internalInstructions: evalStr_(config.internalInstructions, 8000),
        currentPublishedVersionId: '',
        entityVersion: evalInt_(row[index.VersionEntidad], 1),
        schemaVersion: EVAL_CONFIG.SCHEMA_VERSION,
        syncStatus: 'synced'
      };

      evalUpsertRows_(ss, EVAL_CONFIG.SHEETS.ASSESSMENTS, 'assessment_id', [evalAssessmentToRow_(assessment)]);
      if (sections.length > 0) {
        evalUpsertRows_(ss, EVAL_CONFIG.SHEETS.SECTIONS, 'section_id',
          sections.map(function (x) { return evalSectionToRow_(x, now); }));
      }
      if (questions.length > 0) {
        evalUpsertRows_(ss, EVAL_CONFIG.SHEETS.QUESTIONS, 'question_id',
          questions.map(function (x) { return evalQuestionToRow_(x, now); }));
      }
      if (options.length > 0) {
        evalUpsertRows_(ss, EVAL_CONFIG.SHEETS.OPTIONS, 'option_id',
          options.map(function (x) { return evalOptionToRow_(x, now); }));
      }
      existing[id] = true;
      report.migrated++;
      evalAudit_(ss, {
        requestId: 'migracion', action: 'migrateLegacyAssessment', entityType: 'assessment',
        entityId: id, actor: 'migracion', status: 'ok',
        metadata: { sections: sections.length, questions: questions.length, options: options.length }
      });
    } catch (error) {
      report.failed.push({ id: id, message: String(error && error.message ? error.message : error).slice(0, 200) });
    }
  }

  console.log(JSON.stringify(report, null, 2));
  console.log('Las evaluaciones migradas quedan en BORRADOR a propósito: revísalas y ' +
    'vuelve a publicarlas para generar su snapshot de versión.');
  return report;
}
