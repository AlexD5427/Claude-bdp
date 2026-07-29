/**
 * Diagnostics.gs — informe de salud del libro, sin escribir nada.
 *
 * Nace del incidente del 28 de julio de 2026: la evaluación `EVL-NUEV-DB21` se
 * guardaba bien, el código público aparecía en la hoja, pero el portal
 * respondía «Esta evaluación no está disponible». Averiguar por qué obligaba a
 * leer nueve hojas a mano y a comparar tres columnas de estado con el contenido
 * de `Versions`. Esta herramienta responde esa pregunta en un solo paso.
 *
 * Todo lo que hay aquí es de SOLO LECTURA. La única función que puede escribir es
 * `repararEvaluaciones()`, y por omisión también funciona en seco: hay que
 * pasarle `{ dryRun: false }` explícitamente para que toque la hoja.
 *
 * Para usarlo: abre el proyecto de Apps Script, elige `diagnosticarEvaluaciones`
 * en el selector de funciones y pulsa «Ejecutar». El informe sale en el registro
 * de ejecución. Ver docs/evaluations/GUIA_OPERATIVA_FINAL.md §12.
 */

/** ¿Cuántas opciones correctas admite este tipo de pregunta? */
function evalExpectedCorrectCount_(spec) {
  if (!spec || !spec.optionBased) return null;
  if (spec.exactlyOneCorrect) return { min: 1, max: 1, label: 'exactamente una' };
  if (spec.multiSelect) return { min: 1, max: null, label: 'al menos una' };
  return null;
}

/**
 * Motivo por el que una evaluación NO se puede servir públicamente, o `''` si sí.
 * Reproduce `evalIsPubliclyServable_()` explicando cada condición.
 */
function evalWhyNotServable_(assessment, versionRow, snapshot) {
  if (assessment.status !== 'published') {
    return 'status="' + assessment.status + '" (debe ser "published")';
  }
  if (assessment.publicationStatus !== 'published') {
    return 'publication_status="' + assessment.publicationStatus + '" (debe ser "published")';
  }
  if (!assessment.currentPublishedVersionId) {
    return 'current_published_version_id está vacío: nunca se completó una publicación';
  }
  if (!versionRow) {
    return 'current_published_version_id apunta a "' + assessment.currentPublishedVersionId +
      '", que no existe en Versions';
  }
  if (String(versionRow.assessment_id) !== String(assessment.assessmentId)) {
    return 'la versión apuntada pertenece a otra evaluación';
  }
  if (!snapshot) {
    return 'la versión apuntada no tiene un snapshot_json legible';
  }
  if (!snapshot.assessment) {
    return 'el snapshot no contiene la clave "assessment"';
  }
  return '';
}

/**
 * Informe completo. Devuelve un objeto con siete secciones, en el mismo orden en
 * que conviene leerlas.
 */
function evalDiagnose_(ss) {
  var report = {
    generatedAt: evalNow_(),
    schema: evalVerifySchema_(ss),
    assessments: [],
    invalidVersions: [],
    questionCorrectnessIssues: [],
    scoringContradictions: [],
    recommendations: []
  };

  // Si el esquema no cuadra, cualquier otra lectura puede engañar.
  if (!report.schema.ok) {
    report.recommendations.push(
      'El esquema no está completo. Ejecuta `configurarEvaluaciones()` (añade hojas y ' +
      'columnas que falten, sin borrar nada) y vuelve a diagnosticar.'
    );
    return report;
  }

  var assessmentRows = evalReadAll_(ss, EVAL_CONFIG.SHEETS.ASSESSMENTS);
  var sectionRows = evalReadAll_(ss, EVAL_CONFIG.SHEETS.SECTIONS);
  var questionRows = evalReadAll_(ss, EVAL_CONFIG.SHEETS.QUESTIONS);
  var optionRows = evalReadAll_(ss, EVAL_CONFIG.SHEETS.OPTIONS);
  var versionRows = evalReadAll_(ss, EVAL_CONFIG.SHEETS.VERSIONS);

  var versionsById = {};
  for (var v = 0; v < versionRows.length; v++) {
    versionsById[String(versionRows[v].version_id)] = versionRows[v];
  }

  /* ---------------------- 3. Versiones inválidas -------------------------- */
  // Una fila con state='published' pero sin snapshot es un residuo de una
  // publicación que se interrumpió. No se debe borrar (es historia), pero
  // tampoco puede confundirse con una versión servible.
  for (var iv = 0; iv < versionRows.length; iv++) {
    var row = versionRows[iv];
    var decoded = evalDecodeSnapshot_(row.snapshot_json);
    var problems = [];
    if (!row.snapshot_json) problems.push('snapshot_json vacío');
    else if (!decoded) problems.push('snapshot_json ilegible');
    else if (!decoded.assessment) problems.push('el snapshot no tiene "assessment"');
    if (!row.checksum) problems.push('checksum vacío');
    if (!row.published_at) problems.push('published_at vacío');
    if (!row.created_at) problems.push('created_at vacío');
    if (problems.length === 0) continue;
    report.invalidVersions.push({
      versionId: String(row.version_id),
      assessmentId: String(row.assessment_id),
      versionLabel: String(row.version_label),
      state: String(row.state),
      pointedTo: false, // se completa más abajo
      problems: problems
    });
  }

  /* ------------------- 2. Estado de publicación --------------------------- */
  for (var a = 0; a < assessmentRows.length; a++) {
    var assessment = evalAssessmentFromRow_(assessmentRows[a]);
    var pointed = versionsById[String(assessment.currentPublishedVersionId)] || null;
    var snapshot = pointed ? evalDecodeSnapshot_(pointed.snapshot_json) : null;
    var reason = evalWhyNotServable_(assessment, pointed, snapshot);

    var mine = function (rows, field) {
      var out = [];
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i][field || 'assessment_id']) === assessment.assessmentId) out.push(rows[i]);
      }
      return out;
    };
    var mySections = mine(sectionRows);
    var myQuestions = mine(questionRows);
    var myOptions = mine(optionRows);
    var myVersions = mine(versionRows);
    var activeOf = function (rows) {
      return rows.filter(function (r) { return evalBool_(r.active) !== false; });
    };

    report.assessments.push({
      assessmentId: assessment.assessmentId,
      publicCode: assessment.publicCode,
      status: assessment.status,
      lifecycleStatus: assessment.lifecycleStatus,
      publicationStatus: assessment.publicationStatus,
      currentPublishedVersionId: assessment.currentPublishedVersionId || '(vacío)',
      entityVersion: assessment.entityVersion,
      sections: mySections.length,
      activeSections: activeOf(mySections).length,
      questions: myQuestions.length,
      activeQuestions: activeOf(myQuestions).length,
      options: myOptions.length,
      activeOptions: activeOf(myOptions).length,
      versions: myVersions.length,
      publiclyServable: reason === '',
      reason: reason
    });

    // Marca las versiones inválidas que además están apuntadas: eso sí es grave.
    for (var mv = 0; mv < report.invalidVersions.length; mv++) {
      if (report.invalidVersions[mv].versionId === assessment.currentPublishedVersionId) {
        report.invalidVersions[mv].pointedTo = true;
      }
    }

    /* ------ 4. Preguntas con correctas incompatibles con su tipo --------- */
    var optionsByQuestion = {};
    for (var o = 0; o < myOptions.length; o++) {
      if (evalBool_(myOptions[o].active) === false) continue;
      var qid = String(myOptions[o].question_id);
      if (!optionsByQuestion[qid]) optionsByQuestion[qid] = [];
      optionsByQuestion[qid].push(myOptions[o]);
    }
    for (var q = 0; q < myQuestions.length; q++) {
      var questionRow = myQuestions[q];
      if (evalBool_(questionRow.active) === false) continue;
      var spec = evalTypeSpec_(String(questionRow.question_type));
      var expected = evalExpectedCorrectCount_(spec);
      if (!expected) continue;
      var theseOptions = optionsByQuestion[String(questionRow.question_id)] || [];
      var correct = 0;
      for (var t = 0; t < theseOptions.length; t++) {
        if (evalBool_(theseOptions[t].is_correct) === true) correct++;
      }
      var wrong = correct < expected.min || (expected.max !== null && correct > expected.max);
      if (!wrong) continue;
      report.questionCorrectnessIssues.push({
        assessmentId: assessment.assessmentId,
        questionId: String(questionRow.question_id),
        position: evalInt_(questionRow.position, -1),
        questionType: String(questionRow.question_type),
        correctOptions: correct,
        expected: expected.label
      });
    }

    /* ---------- 5. Contradicciones de política de puntuación ------------ */
    // `policies_json.scoring` NO lo lee el motor de calificación: manda
    // `Questions.scoring_mode`. Se reporta como aviso para que nadie crea que
    // cambiando la política cambia la nota.
    var declaredMode = ((assessment.policies || {}).scoring || {}).mode;
    var perQuestionModes = {};
    for (var qm = 0; qm < myQuestions.length; qm++) {
      if (evalBool_(myQuestions[qm].active) === false) continue;
      if (!evalIsQuestionType_(String(myQuestions[qm].question_type))) continue;
      perQuestionModes[String(myQuestions[qm].scoring_mode || 'none')] = true;
    }
    var modes = Object.keys(perQuestionModes);
    if (declaredMode && modes.length > 0 && modes.indexOf(String(declaredMode)) < 0) {
      report.scoringContradictions.push({
        assessmentId: assessment.assessmentId,
        kind: 'POLICY_IGNORED',
        detail: 'policies_json.scoring.mode="' + declaredMode + '" pero las preguntas usan ' +
          modes.join(', ') + '. El motor califica por Questions.scoring_mode; la política ' +
          'no se lee y no afecta a la nota.'
      });
    }

    // `partial`/`per_option` sí dependen de `score_value`. Con todo a cero la
    // nota sería siempre cero, y eso sí es un error real.
    for (var q2 = 0; q2 < myQuestions.length; q2++) {
      var qr = myQuestions[q2];
      if (evalBool_(qr.active) === false) continue;
      var mode = String(qr.scoring_mode || 'none');
      if (mode !== 'partial' && mode !== 'per_option') continue;
      var opts = optionsByQuestion[String(qr.question_id)] || [];
      var anyValue = false;
      for (var ov = 0; ov < opts.length; ov++) {
        if (evalNum_(opts[ov].score_value, 0) !== 0) { anyValue = true; break; }
      }
      if (anyValue) continue;
      report.scoringContradictions.push({
        assessmentId: assessment.assessmentId,
        kind: 'ZERO_SCORE_VALUES',
        detail: 'La pregunta ' + String(qr.question_id) + ' usa scoring_mode="' + mode +
          '", que reparte puntos por score_value, pero todas sus opciones valen 0. ' +
          'Siempre daría cero puntos.'
      });
    }

    if (evalNumOrNull_(assessmentRows[a].passing_score) !== null
        && evalInt_(assessmentRows[a].question_count, 0) === 0) {
      report.scoringContradictions.push({
        assessmentId: assessment.assessmentId,
        kind: 'PASSING_SCORE_WITHOUT_QUESTIONS',
        detail: 'Hay nota mínima pero ninguna pregunta calificable.'
      });
    }
  }

  /* --------------- 6. Recomendaciones no destructivas -------------------- */
  var neverPublished = report.assessments.filter(function (item) {
    return !item.publiclyServable && item.currentPublishedVersionId === '(vacío)';
  });
  if (neverPublished.length > 0) {
    report.recommendations.push(
      'Estas evaluaciones nunca terminaron de publicarse y por eso el portal responde ' +
      'NOT_FOUND: ' + neverPublished.map(function (i) { return i.publicCode; }).join(', ') +
      '. Ábrelas en el ATS y pulsa «Publicar». No hace falta tocar la hoja a mano.'
    );
  }
  var orphanInvalid = report.invalidVersions.filter(function (item) { return !item.pointedTo; });
  if (orphanInvalid.length > 0) {
    report.recommendations.push(
      'Hay ' + orphanInvalid.length + ' fila(s) de Versions sin snapshot utilizable, restos de ' +
      'publicaciones interrumpidas. No se deben borrar. `repararEvaluaciones({ dryRun: false })` ' +
      'las marca como state="superseded" para que nunca se confundan con la versión servida; ' +
      'sus datos se conservan tal cual.'
    );
  }
  var pointedInvalid = report.invalidVersions.filter(function (item) { return item.pointedTo; });
  if (pointedInvalid.length > 0) {
    report.recommendations.push(
      'ATENCIÓN: hay versiones apuntadas por current_published_version_id sin snapshot ' +
      'legible. Vuelve a publicar la evaluación para generar un snapshot nuevo; la fila ' +
      'antigua se conserva como historia.'
    );
  }
  if (report.questionCorrectnessIssues.length > 0) {
    report.recommendations.push(
      'Hay ' + report.questionCorrectnessIssues.length + ' pregunta(s) cuyo número de opciones ' +
      'correctas no encaja con su tipo. Corrígelas en el editor: publicar las rechazará con ' +
      'VALIDATION_ERROR.'
    );
  }
  if (report.recommendations.length === 0) {
    report.recommendations.push('Sin hallazgos: el libro está coherente.');
  }
  return report;
}

/**
 * Diagnóstico completo en el registro de ejecución. No escribe nada.
 * Ejecútala desde el editor de Apps Script.
 */
function diagnosticarEvaluaciones() {
  var report = evalDiagnose_(evalSpreadsheet_());
  console.log(evalFormatDiagnosis_(report));
  return report;
}

/** Versión legible del informe, para pegarla en un ticket de soporte. */
function evalFormatDiagnosis_(report) {
  var lines = [];
  lines.push('===== DIAGNÓSTICO DEL MÓDULO EVALUACIONES =====');
  lines.push('Generado: ' + report.generatedAt);
  lines.push('');
  lines.push('1) ESQUEMA: ' + (report.schema.ok ? 'correcto' : 'INCOMPLETO'));
  for (var s = 0; s < report.schema.sheets.length; s++) {
    var sheet = report.schema.sheets[s];
    var detail = sheet.exists ? sheet.dataRows + ' filas de datos' : 'NO EXISTE';
    if (sheet.missingHeaders.length > 0) detail += ' · faltan: ' + sheet.missingHeaders.join(', ');
    if (sheet.extraHeaders.length > 0) detail += ' · columnas extra: ' + sheet.extraHeaders.join(', ');
    lines.push('   · ' + sheet.sheet + ': ' + detail);
  }
  lines.push('');
  lines.push('2) ESTADO DE PUBLICACIÓN (' + report.assessments.length + ' evaluación/es)');
  for (var a = 0; a < report.assessments.length; a++) {
    var item = report.assessments[a];
    lines.push('   · ' + item.publicCode + '  ' + (item.publiclyServable ? '✔ SE SIRVE' : '✘ NO SE SIRVE'));
    lines.push('     status=' + item.status + ' lifecycle=' + item.lifecycleStatus +
      ' publication=' + item.publicationStatus);
    lines.push('     puntero=' + item.currentPublishedVersionId + ' entityVersion=' + item.entityVersion);
    lines.push('     secciones=' + item.activeSections + '/' + item.sections +
      ' preguntas=' + item.activeQuestions + '/' + item.questions +
      ' opciones=' + item.activeOptions + '/' + item.options +
      ' versiones=' + item.versions);
    if (item.reason) lines.push('     MOTIVO: ' + item.reason);
  }
  lines.push('');
  lines.push('3) VERSIONES INVÁLIDAS: ' + report.invalidVersions.length);
  for (var v = 0; v < report.invalidVersions.length; v++) {
    var bad = report.invalidVersions[v];
    lines.push('   · ' + bad.versionLabel + ' (' + bad.versionId + ') state=' + bad.state +
      (bad.pointedTo ? ' [APUNTADA]' : '') + ' → ' + bad.problems.join('; '));
  }
  lines.push('');
  lines.push('4) PREGUNTAS CON CORRECTAS INCOMPATIBLES: ' + report.questionCorrectnessIssues.length);
  for (var q = 0; q < report.questionCorrectnessIssues.length; q++) {
    var qi = report.questionCorrectnessIssues[q];
    lines.push('   · posición ' + qi.position + ' (' + qi.questionType + '): ' +
      qi.correctOptions + ' correcta(s), se esperaba ' + qi.expected);
  }
  lines.push('');
  lines.push('5) CONTRADICCIONES DE PUNTUACIÓN: ' + report.scoringContradictions.length);
  for (var c = 0; c < report.scoringContradictions.length; c++) {
    lines.push('   · [' + report.scoringContradictions[c].kind + '] ' +
      report.scoringContradictions[c].detail);
  }
  lines.push('');
  lines.push('6) RECOMENDACIONES');
  for (var r = 0; r < report.recommendations.length; r++) {
    lines.push('   ' + (r + 1) + '. ' + report.recommendations[r]);
  }
  lines.push('');
  lines.push('===== FIN DEL DIAGNÓSTICO =====');
  return lines.join('\n');
}

/**
 * Reparación no destructiva. Por omisión NO escribe (dryRun).
 *
 * Lo único que hace es marcar como `superseded` las filas de `Versions` que
 * dicen `published` pero no tienen un snapshot utilizable y que no están
 * apuntadas por ninguna evaluación. Así dejan de poder confundirse con la
 * versión servida, y sus datos se conservan íntegros.
 *
 * NO borra filas, NO recrea hojas, NO toca snapshots válidos y NO cambia el
 * estado de ninguna evaluación. Publicar sigue siendo cosa del ATS.
 *
 * Uso:
 *   repararEvaluaciones()                    → informe en seco, no escribe
 *   repararEvaluaciones({ dryRun: false })   → aplica los cambios
 */
function repararEvaluaciones(options) {
  var dryRun = !(options && options.dryRun === false);
  var ss = evalSpreadsheet_();
  var report = evalDiagnose_(ss);
  var targets = report.invalidVersions.filter(function (item) {
    return !item.pointedTo && item.state === 'published';
  });

  var plan = targets.map(function (item) {
    return {
      versionId: item.versionId,
      versionLabel: item.versionLabel,
      from: 'published',
      to: 'superseded',
      because: item.problems.join('; ')
    };
  });

  if (!dryRun && plan.length > 0) {
    var rows = evalReadAll_(ss, EVAL_CONFIG.SHEETS.VERSIONS);
    var wanted = {};
    for (var p = 0; p < plan.length; p++) wanted[plan[p].versionId] = true;
    var updates = [];
    for (var i = 0; i < rows.length; i++) {
      if (!wanted[String(rows[i].version_id)]) continue;
      var row = rows[i];
      var copy = {};
      var headers = EVAL_HEADERS[EVAL_CONFIG.SHEETS.VERSIONS];
      for (var h = 0; h < headers.length; h++) copy[headers[h]] = row[headers[h]];
      copy.state = 'superseded';
      updates.push(copy);
    }
    evalUpsertRows_(ss, EVAL_CONFIG.SHEETS.VERSIONS, 'version_id', updates);
  }

  var result = {
    dryRun: dryRun,
    diagnosis: report,
    plan: plan,
    applied: dryRun ? 0 : plan.length
  };
  console.log(evalFormatDiagnosis_(report));
  console.log('');
  console.log(dryRun
    ? '=== MODO SECO: no se escribió nada. ' + plan.length + ' fila(s) se marcarían como ' +
      '"superseded". Para aplicarlo ejecuta repararEvaluaciones({ dryRun: false }). ==='
    : '=== APLICADO: ' + plan.length + ' fila(s) marcadas como "superseded". ===');
  return result;
}
