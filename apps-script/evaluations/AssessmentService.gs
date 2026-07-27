/**
 * AssessmentService.gs — superficie administrativa.
 *
 * Contiene el mapeo fila ↔ objeto y las operaciones del constructor del
 * reclutador. Todas las escrituras se ejecutan a través de
 * `evalWithWriteLock_` (bloqueo + idempotencia) desde el enrutador.
 *
 * Reglas que este archivo garantiza:
 *  · Una evaluación publicada nunca se edita destructivamente: las escrituras
 *    afectan al borrador; los snapshots de `Versions` se escriben una sola vez.
 *  · Nada se borra: las bajas de secciones, preguntas y opciones son lógicas.
 *  · `question_count`, `entity_version`, `status` y `updated_at` los calcula el
 *    servidor, nunca el cliente.
 */

/* ------------------------------- Mapeo de filas -------------------------- */

function evalAssessmentFromRow_(row) {
  return {
    assessmentId: evalStr_(row.assessment_id, 120),
    publicCode: evalStr_(row.public_code, 60),
    title: evalStr_(row.title, 200),
    description: evalStr_(row.description, 8000),
    instructions: evalStr_(row.instructions, 8000),
    status: evalStr_(row.status, 20) || 'draft',
    durationMinutes: evalNumOrNull_(row.duration_minutes),
    passingScore: evalNumOrNull_(row.passing_score),
    accessType: evalStr_(row.access_type, 20) || 'public',
    version: evalInt_(row.version, 1),
    questionCount: evalInt_(row.question_count, 0),
    createdAt: evalStr_(row.created_at, 40),
    updatedAt: evalStr_(row.updated_at, 40),
    publishedAt: evalStr_(row.published_at, 40),
    archivedAt: evalStr_(row.archived_at, 40),
    createdBy: evalStr_(row.created_by, 200),
    updatedBy: evalStr_(row.updated_by, 200),
    versionMinor: evalInt_(row.version_minor, 0),
    versionLabel: evalStr_(row.version_label, 20),
    lifecycleStatus: evalStr_(row.lifecycle_status, 20) || 'draft',
    publicationStatus: evalStr_(row.publication_status, 20) || 'unpublished',
    category: evalStr_(row.category, 40) || 'knowledge',
    purpose: evalStr_(row.purpose, 2000),
    tags: evalParseJson_(row.tags_json, []),
    linkedProcessIds: evalParseJson_(row.linked_process_ids_json, []),
    policies: evalParseJson_(row.policies_json, {}),
    theme: evalParseJson_(row.theme_json, {}),
    rules: evalParseJson_(row.rules_json, []),
    rubrics: evalParseJson_(row.rubrics_json, []),
    internalInstructions: evalStr_(row.internal_instructions, 8000),
    currentPublishedVersionId: evalStr_(row.current_published_version_id, 120),
    entityVersion: evalInt_(row.entity_version, 1),
    schemaVersion: evalInt_(row.schema_version, EVAL_CONFIG.SCHEMA_VERSION),
    syncStatus: evalStr_(row.sync_status, 20) || 'synced'
  };
}

function evalAssessmentToRow_(a) {
  return {
    assessment_id: a.assessmentId,
    public_code: a.publicCode,
    title: a.title,
    description: a.description,
    instructions: a.instructions,
    status: a.status,
    duration_minutes: a.durationMinutes === null ? '' : a.durationMinutes,
    passing_score: a.passingScore === null ? '' : a.passingScore,
    access_type: a.accessType,
    version: a.version,
    question_count: a.questionCount,
    created_at: a.createdAt,
    updated_at: a.updatedAt,
    published_at: a.publishedAt || '',
    archived_at: a.archivedAt || '',
    created_by: a.createdBy,
    updated_by: a.updatedBy,
    version_minor: a.versionMinor,
    version_label: a.versionLabel,
    lifecycle_status: a.lifecycleStatus,
    publication_status: a.publicationStatus,
    category: a.category,
    purpose: a.purpose,
    tags_json: evalWriteJson_(a.tags, '[]'),
    linked_process_ids_json: evalWriteJson_(a.linkedProcessIds, '[]'),
    policies_json: evalWriteJson_(a.policies, '{}'),
    theme_json: evalWriteJson_(a.theme, '{}'),
    rules_json: evalWriteJson_(a.rules, '[]'),
    rubrics_json: evalWriteJson_(a.rubrics, '[]'),
    internal_instructions: a.internalInstructions,
    current_published_version_id: a.currentPublishedVersionId || '',
    entity_version: a.entityVersion,
    schema_version: a.schemaVersion,
    sync_status: 'synced'
  };
}

function evalSectionFromRow_(row) {
  return {
    sectionId: evalStr_(row.section_id, 120),
    assessmentId: evalStr_(row.assessment_id, 120),
    title: evalStr_(row.title, 200),
    description: evalStr_(row.description, 8000),
    position: evalInt_(row.position, 0),
    timeLimitSeconds: evalNumOrNull_(row.time_limit_seconds),
    randomize: evalBoolOr_(row.randomize, false),
    poolSize: evalNumOrNull_(row.pool_size),
    weight: evalNum_(row.weight, 1),
    active: evalBoolOr_(row.active, true),
    createdAt: evalStr_(row.created_at, 40),
    updatedAt: evalStr_(row.updated_at, 40)
  };
}

function evalSectionToRow_(s, now) {
  return {
    section_id: s.sectionId,
    assessment_id: s.assessmentId,
    title: s.title,
    description: s.description,
    position: s.position,
    time_limit_seconds: s.timeLimitSeconds === null ? '' : s.timeLimitSeconds,
    randomize: evalWriteBool_(s.randomize),
    pool_size: s.poolSize === null ? '' : s.poolSize,
    weight: s.weight,
    active: evalWriteBool_(s.active),
    created_at: s.createdAt || now,
    updated_at: now
  };
}

function evalQuestionFromRow_(row) {
  return {
    questionId: evalStr_(row.question_id, 120),
    assessmentId: evalStr_(row.assessment_id, 120),
    sectionId: evalStr_(row.section_id, 120),
    questionText: evalStr_(row.question_text, 8000),
    questionType: evalStr_(row.question_type, 60),
    position: evalInt_(row.position, 0),
    required: evalBoolOr_(row.required, false),
    scoringMode: evalStr_(row.scoring_mode, 20) || 'none',
    maxPoints: evalNum_(row.max_points, 0),
    weight: evalNum_(row.weight, 1),
    active: evalBoolOr_(row.active, true),
    helpText: evalStr_(row.help_text, 4000),
    description: evalStr_(row.description, 8000),
    competency: evalStr_(row.competency, 120),
    code: evalStr_(row.code, 80),
    configuration: evalParseJson_(row.configuration_json, {}),
    validation: evalParseJson_(row.validation_json, {}),
    feedback: evalParseJson_(row.feedback_json, {}),
    media: evalParseJson_(row.media_json, null),
    accessibility: evalParseJson_(row.accessibility_json, {}),
    tags: evalParseJson_(row.tags_json, []),
    configurationSchemaVersion: evalInt_(row.configuration_schema_version, EVAL_CONFIG.CONFIGURATION_SCHEMA_VERSION),
    createdAt: evalStr_(row.created_at, 40),
    updatedAt: evalStr_(row.updated_at, 40)
  };
}

function evalQuestionToRow_(q, now) {
  return {
    question_id: q.questionId,
    assessment_id: q.assessmentId,
    section_id: q.sectionId,
    question_text: q.questionText,
    question_type: q.questionType,
    position: q.position,
    required: evalWriteBool_(q.required),
    scoring_mode: q.scoringMode,
    max_points: q.maxPoints,
    weight: q.weight,
    active: evalWriteBool_(q.active),
    help_text: q.helpText,
    description: q.description,
    competency: q.competency,
    code: q.code,
    configuration_json: evalWriteJson_(q.configuration, '{}'),
    validation_json: evalWriteJson_(q.validation, '{}'),
    feedback_json: evalWriteJson_(q.feedback, '{}'),
    media_json: q.media ? evalWriteJson_(q.media, '') : '',
    accessibility_json: evalWriteJson_(q.accessibility, '{}'),
    tags_json: evalWriteJson_(q.tags, '[]'),
    configuration_schema_version: q.configurationSchemaVersion || EVAL_CONFIG.CONFIGURATION_SCHEMA_VERSION,
    created_at: q.createdAt || now,
    updated_at: now
  };
}

function evalOptionFromRow_(row) {
  return {
    optionId: evalStr_(row.option_id, 120),
    questionId: evalStr_(row.question_id, 120),
    assessmentId: evalStr_(row.assessment_id, 120),
    optionText: evalStr_(row.option_text, 1000),
    optionValue: evalStr_(row.option_value, 200),
    position: evalInt_(row.position, 0),
    isCorrect: evalBoolOr_(row.is_correct, false),
    scoreValue: evalNum_(row.score_value, 0),
    matchingKey: evalStr_(row.matching_key, 200),
    active: evalBoolOr_(row.active, true),
    feedback: evalStr_(row.feedback, 2000),
    mediaUrl: evalStr_(row.media_url, 2000),
    configuration: evalParseJson_(row.configuration_json, {}),
    createdAt: evalStr_(row.created_at, 40),
    updatedAt: evalStr_(row.updated_at, 40)
  };
}

function evalOptionToRow_(o, now) {
  return {
    option_id: o.optionId,
    question_id: o.questionId,
    assessment_id: o.assessmentId,
    option_text: o.optionText,
    option_value: o.optionValue,
    position: o.position,
    is_correct: evalWriteBool_(o.isCorrect),
    score_value: o.scoreValue,
    matching_key: o.matchingKey,
    active: evalWriteBool_(o.active),
    feedback: o.feedback,
    media_url: o.mediaUrl,
    configuration_json: evalWriteJson_(o.configuration, '{}'),
    created_at: o.createdAt || now,
    updated_at: now
  };
}

function evalVersionFromRow_(row) {
  return {
    versionId: evalStr_(row.version_id, 120),
    assessmentId: evalStr_(row.assessment_id, 120),
    version: evalInt_(row.version, 1),
    versionMinor: evalInt_(row.version_minor, 0),
    versionLabel: evalStr_(row.version_label, 20),
    state: evalStr_(row.state, 20) || 'published',
    notes: evalStr_(row.notes, 4000),
    snapshotJson: row.snapshot_json,
    snapshotSchemaVersion: evalInt_(row.snapshot_schema_version, 1),
    questionCount: evalInt_(row.question_count, 0),
    gradableQuestionCount: evalInt_(row.gradable_question_count, 0),
    checksum: evalStr_(row.checksum, 64),
    publishedAt: evalStr_(row.published_at, 40),
    publishedBy: evalStr_(row.published_by, 200),
    createdAt: evalStr_(row.created_at, 40)
  };
}

/* ------------------------------- Utilidades ------------------------------ */

/** Estado canónico (`draft`/`published`/`archived`) a partir del ciclo de vida. */
function evalDeriveStatus_(lifecycleStatus, hasPublishedVersion) {
  if (lifecycleStatus === 'archived') return 'archived';
  if (hasPublishedVersion && (lifecycleStatus === 'published' || lifecycleStatus === 'paused'
      || lifecycleStatus === 'closed')) {
    return 'published';
  }
  return 'draft';
}

/** Preguntas activas que recogen respuesta. */
function evalCountQuestions_(questions) {
  var total = 0;
  for (var i = 0; i < questions.length; i++) {
    if (questions[i].active === false) continue;
    if (evalIsQuestionType_(questions[i].questionType)) total++;
  }
  return total;
}

/** Carga la evaluación completa. Lanza NOT_FOUND si no existe. */
function evalLoadBundle_(ss, assessmentId) {
  var row = evalFindBy_(ss, EVAL_CONFIG.SHEETS.ASSESSMENTS, 'assessment_id', assessmentId);
  if (!row) throw evalError_('NOT_FOUND', 'La evaluación no existe.');
  var assessment = evalAssessmentFromRow_(row);
  return {
    assessment: assessment,
    sections: evalReadWhere_(ss, EVAL_CONFIG.SHEETS.SECTIONS, 'assessment_id', assessmentId)
      .map(evalSectionFromRow_)
      .sort(function (a, b) { return a.position - b.position; }),
    questions: evalReadWhere_(ss, EVAL_CONFIG.SHEETS.QUESTIONS, 'assessment_id', assessmentId)
      .map(evalQuestionFromRow_)
      .sort(function (a, b) { return a.position - b.position; }),
    options: evalReadWhere_(ss, EVAL_CONFIG.SHEETS.OPTIONS, 'assessment_id', assessmentId)
      .map(evalOptionFromRow_)
      .sort(function (a, b) { return a.position - b.position; }),
    versions: evalReadWhere_(ss, EVAL_CONFIG.SHEETS.VERSIONS, 'assessment_id', assessmentId)
      .map(evalVersionFromRow_)
      .sort(function (a, b) {
        return (a.version - b.version) || (a.versionMinor - b.versionMinor);
      })
  };
}

/** Comprueba la concurrencia optimista. */
function evalAssertEntityVersion_(assessment, expected) {
  if (expected === undefined || expected === null || expected === '') return;
  if (Number(expected) !== Number(assessment.entityVersion)) {
    throw evalError_('CONFLICT',
      'Otro usuario actualizó esta evaluación. Vuelve a cargarla antes de guardar.',
      { expected: Number(expected), current: Number(assessment.entityVersion) });
  }
}

/* --------------------------------- Lecturas ------------------------------ */

function evalListAdminAssessments_(payload) {
  var ss = evalSpreadsheet_();
  var search = evalStr_((payload || {}).search, 200).toLowerCase().trim();
  var statuses = evalStringArray_((payload || {}).status, 10, 20);
  var includeArchived = (payload || {}).includeArchived === true;

  var rows = evalReadAll_(ss, EVAL_CONFIG.SHEETS.ASSESSMENTS).map(evalAssessmentFromRow_);
  var items = [];
  for (var i = 0; i < rows.length; i++) {
    var a = rows[i];
    if (!includeArchived && statuses.length === 0 && a.status === 'archived') continue;
    if (statuses.length > 0 && statuses.indexOf(a.status) < 0) continue;
    if (search) {
      var haystack = (a.title + ' ' + a.publicCode + ' ' + a.category).toLowerCase();
      if (haystack.indexOf(search) < 0) continue;
    }
    items.push({
      assessmentId: a.assessmentId,
      publicCode: a.publicCode,
      title: a.title,
      description: a.description,
      status: a.status,
      lifecycleStatus: a.lifecycleStatus,
      publicationStatus: a.publicationStatus,
      category: a.category,
      version: a.version,
      versionMinor: a.versionMinor,
      versionLabel: a.versionLabel,
      questionCount: a.questionCount,
      durationMinutes: a.durationMinutes,
      passingScore: a.passingScore,
      accessType: a.accessType,
      tags: a.tags,
      linkedProcessCount: Array.isArray(a.linkedProcessIds) ? a.linkedProcessIds.length : 0,
      createdAt: a.createdAt,
      createdBy: a.createdBy,
      updatedAt: a.updatedAt,
      updatedBy: a.updatedBy,
      publishedAt: a.publishedAt,
      archivedAt: a.archivedAt,
      entityVersion: a.entityVersion
    });
  }
  items.sort(function (x, y) { return String(y.updatedAt).localeCompare(String(x.updatedAt)); });
  return { items: items, total: items.length, syncedAt: evalNow_() };
}

function evalGetAdminAssessment_(payload) {
  var assessmentId = evalStr_((payload || {}).assessmentId, 120);
  if (!assessmentId) throw evalError_('BAD_REQUEST', 'Falta el identificador de la evaluación.');
  var ss = evalSpreadsheet_();
  var bundle = evalLoadBundle_(ss, assessmentId);
  // Solo el contenido ACTIVO es editable. Las filas dadas de baja lógica se
  // conservan en la hoja para que los intentos históricos puedan resolver sus
  // referencias, pero no forman parte del borrador que edita el reclutador.
  return {
    assessment: bundle.assessment,
    sections: bundle.sections.filter(function (s) { return s.active !== false; }),
    questions: bundle.questions.filter(function (q) { return q.active !== false; }),
    options: bundle.options.filter(function (o) { return o.active !== false; }),
    versions: bundle.versions.map(function (v) {
      return {
        versionId: v.versionId, version: v.version, versionMinor: v.versionMinor,
        versionLabel: v.versionLabel, state: v.state, notes: v.notes,
        questionCount: v.questionCount, gradableQuestionCount: v.gradableQuestionCount,
        checksum: v.checksum, publishedAt: v.publishedAt, publishedBy: v.publishedBy
      };
    })
  };
}

/* -------------------------------- Escrituras ----------------------------- */

/** Crea una evaluación en borrador con una sección inicial. */
function evalCreateAssessment_(context, payload) {
  var ss = context.ss;
  var now = evalNow_();
  var title = evalStr_((payload || {}).title, EVAL_CONFIG.LIMITS.MAX_TITLE) || 'Evaluación sin título';
  var category = evalStr_((payload || {}).category, 40) || 'knowledge';
  if (EVAL_CONFIG.ENUMS.CATEGORY.indexOf(category) < 0) category = 'knowledge';

  var taken = {};
  var existing = evalReadAll_(ss, EVAL_CONFIG.SHEETS.ASSESSMENTS);
  for (var i = 0; i < existing.length; i++) taken[String(existing[i].public_code)] = true;

  var assessmentId = evalNewId_(EVAL_ID_PREFIX.ASSESSMENT);
  var assessment = {
    assessmentId: assessmentId,
    publicCode: evalPublicCode_(title, taken),
    title: title,
    description: '',
    instructions: '',
    status: 'draft',
    durationMinutes: null,
    passingScore: null,
    accessType: 'public',
    version: 1,
    questionCount: 0,
    createdAt: now,
    updatedAt: now,
    publishedAt: '',
    archivedAt: '',
    createdBy: context.actor,
    updatedBy: context.actor,
    versionMinor: 0,
    versionLabel: 'v1.0',
    lifecycleStatus: 'draft',
    publicationStatus: 'unpublished',
    category: category,
    purpose: '',
    tags: [],
    linkedProcessIds: [],
    policies: {},
    theme: {},
    rules: [],
    rubrics: [],
    internalInstructions: '',
    currentPublishedVersionId: '',
    entityVersion: 1,
    schemaVersion: EVAL_CONFIG.SCHEMA_VERSION,
    syncStatus: 'synced'
  };
  var section = {
    sectionId: evalNewId_(EVAL_ID_PREFIX.SECTION),
    assessmentId: assessmentId,
    title: 'Sección 1',
    description: '',
    position: 0,
    timeLimitSeconds: null,
    randomize: false,
    poolSize: null,
    weight: 1,
    active: true,
    createdAt: now
  };

  evalUpsertRows_(ss, EVAL_CONFIG.SHEETS.ASSESSMENTS, 'assessment_id',
    [evalAssessmentToRow_(assessment)]);
  evalUpsertRows_(ss, EVAL_CONFIG.SHEETS.SECTIONS, 'section_id',
    [evalSectionToRow_(section, now)]);

  evalAudit_(ss, {
    requestId: context.requestId, action: 'createAssessment', entityType: 'assessment',
    entityId: assessmentId, actor: context.actor, status: 'ok',
    metadata: { category: category }
  });

  return {
    data: { assessment: assessment, sections: [section], questions: [], options: [], versions: [] },
    reference: assessmentId,
    summary: { assessmentId: assessmentId }
  };
}

/**
 * Guarda el borrador completo. Un borrador puede estar incompleto: solo se
 * valida la forma. Las entidades que ya no llegan se desactivan.
 */
function evalUpdateAssessment_(context, payload) {
  var ss = context.ss;
  var now = evalNow_();
  var assessmentId = evalStr_((payload || {}).assessmentId, 120);
  if (!assessmentId) throw evalError_('BAD_REQUEST', 'Falta el identificador de la evaluación.');

  var bundle = evalLoadBundle_(ss, assessmentId);
  evalAssertEntityVersion_(bundle.assessment, (payload || {}).expectedEntityVersion);
  if (bundle.assessment.status === 'archived') {
    throw evalError_('CONFLICT',
      'Una evaluación archivada no se puede editar. Restáurala primero.');
  }

  var validated = evalValidateSavePayload_(payload, assessmentId);
  var previous = bundle.assessment;

  var assessment = {
    assessmentId: assessmentId,
    publicCode: previous.publicCode,
    title: validated.assessment.title,
    description: validated.assessment.description,
    instructions: validated.assessment.instructions,
    status: previous.status,
    durationMinutes: validated.assessment.durationMinutes,
    passingScore: validated.assessment.passingScore,
    accessType: validated.assessment.accessType,
    version: previous.version,
    questionCount: evalCountQuestions_(validated.questions),
    createdAt: previous.createdAt || now,
    updatedAt: now,
    publishedAt: previous.publishedAt,
    archivedAt: previous.archivedAt,
    createdBy: previous.createdBy || context.actor,
    updatedBy: context.actor,
    versionMinor: previous.versionMinor,
    versionLabel: previous.versionLabel || 'v1.0',
    lifecycleStatus: previous.lifecycleStatus,
    publicationStatus: previous.publicationStatus,
    category: validated.assessment.category,
    purpose: validated.assessment.purpose,
    tags: validated.assessment.tags,
    linkedProcessIds: validated.assessment.linkedProcessIds,
    policies: validated.assessment.policies,
    theme: validated.assessment.theme,
    rules: validated.assessment.rules,
    rubrics: validated.assessment.rubrics,
    internalInstructions: validated.assessment.internalInstructions,
    currentPublishedVersionId: previous.currentPublishedVersionId,
    entityVersion: previous.entityVersion + 1,
    schemaVersion: EVAL_CONFIG.SCHEMA_VERSION,
    syncStatus: 'synced'
  };

  // Conservar `created_at` de las entidades que ya existían.
  var previousSections = {};
  for (var s = 0; s < bundle.sections.length; s++) previousSections[bundle.sections[s].sectionId] = bundle.sections[s];
  var previousQuestions = {};
  for (var q = 0; q < bundle.questions.length; q++) previousQuestions[bundle.questions[q].questionId] = bundle.questions[q];
  var previousOptions = {};
  for (var o = 0; o < bundle.options.length; o++) previousOptions[bundle.options[o].optionId] = bundle.options[o];

  var sectionRows = validated.sections.map(function (section) {
    var old = previousSections[section.sectionId];
    section.createdAt = old ? old.createdAt : now;
    return evalSectionToRow_(section, now);
  });
  var questionRows = validated.questions.map(function (question) {
    var old = previousQuestions[question.questionId];
    question.createdAt = old ? old.createdAt : now;
    return evalQuestionToRow_(question, now);
  });
  var optionRows = validated.options.map(function (option) {
    var old = previousOptions[option.optionId];
    option.createdAt = old ? old.createdAt : now;
    return evalOptionToRow_(option, now);
  });

  evalUpsertRows_(ss, EVAL_CONFIG.SHEETS.ASSESSMENTS, 'assessment_id', [evalAssessmentToRow_(assessment)]);
  if (sectionRows.length > 0) evalUpsertRows_(ss, EVAL_CONFIG.SHEETS.SECTIONS, 'section_id', sectionRows);
  if (questionRows.length > 0) evalUpsertRows_(ss, EVAL_CONFIG.SHEETS.QUESTIONS, 'question_id', questionRows);
  if (optionRows.length > 0) evalUpsertRows_(ss, EVAL_CONFIG.SHEETS.OPTIONS, 'option_id', optionRows);

  // Bajas lógicas de lo que ya no llega.
  var keptSections = {};
  for (var ks = 0; ks < validated.sections.length; ks++) keptSections[validated.sections[ks].sectionId] = true;
  var keptQuestions = {};
  for (var kq = 0; kq < validated.questions.length; kq++) keptQuestions[validated.questions[kq].questionId] = true;
  var keptOptions = {};
  for (var ko = 0; ko < validated.options.length; ko++) keptOptions[validated.options[ko].optionId] = true;

  evalDeactivateRows_(ss, EVAL_CONFIG.SHEETS.SECTIONS, 'section_id',
    bundle.sections.filter(function (x) { return !keptSections[x.sectionId]; })
      .map(function (x) { return x.sectionId; }), now);
  evalDeactivateRows_(ss, EVAL_CONFIG.SHEETS.QUESTIONS, 'question_id',
    bundle.questions.filter(function (x) { return !keptQuestions[x.questionId]; })
      .map(function (x) { return x.questionId; }), now);
  evalDeactivateRows_(ss, EVAL_CONFIG.SHEETS.OPTIONS, 'option_id',
    bundle.options.filter(function (x) { return !keptOptions[x.optionId]; })
      .map(function (x) { return x.optionId; }), now);

  evalAudit_(ss, {
    requestId: context.requestId, action: 'updateAssessment', entityType: 'assessment',
    entityId: assessmentId, actor: context.actor, status: 'ok',
    metadata: {
      sections: validated.sections.length,
      questions: validated.questions.length,
      options: validated.options.length,
      entityVersion: assessment.entityVersion
    }
  });

  return {
    data: evalGetAdminAssessment_({ assessmentId: assessmentId }),
    reference: assessmentId,
    summary: { assessmentId: assessmentId, entityVersion: assessment.entityVersion }
  };
}

/** Duplica una evaluación completa con identificadores nuevos. */
function evalDuplicateAssessment_(context, payload) {
  var ss = context.ss;
  var now = evalNow_();
  var sourceId = evalStr_((payload || {}).assessmentId, 120);
  var bundle = evalLoadBundle_(ss, sourceId);

  var taken = {};
  var existing = evalReadAll_(ss, EVAL_CONFIG.SHEETS.ASSESSMENTS);
  for (var i = 0; i < existing.length; i++) taken[String(existing[i].public_code)] = true;

  var newId = evalNewId_(EVAL_ID_PREFIX.ASSESSMENT);
  var title = evalStr_(bundle.assessment.title + ' (copia)', EVAL_CONFIG.LIMITS.MAX_TITLE);
  var copy = evalAssessmentFromRow_(evalAssessmentToRow_(bundle.assessment));
  copy.assessmentId = newId;
  copy.publicCode = evalPublicCode_(title, taken);
  copy.title = title;
  copy.status = 'draft';
  copy.lifecycleStatus = 'draft';
  copy.publicationStatus = 'unpublished';
  copy.version = 1;
  copy.versionMinor = 0;
  copy.versionLabel = 'v1.0';
  copy.currentPublishedVersionId = '';
  copy.publishedAt = '';
  copy.archivedAt = '';
  copy.entityVersion = 1;
  copy.createdAt = now;
  copy.updatedAt = now;
  copy.createdBy = context.actor;
  copy.updatedBy = context.actor;
  copy.linkedProcessIds = [];

  var sectionMap = {};
  var sections = bundle.sections.filter(function (s) { return s.active !== false; })
    .map(function (section, index) {
      var id = evalNewId_(EVAL_ID_PREFIX.SECTION);
      sectionMap[section.sectionId] = id;
      return {
        sectionId: id, assessmentId: newId, title: section.title, description: section.description,
        position: index, timeLimitSeconds: section.timeLimitSeconds, randomize: section.randomize,
        poolSize: section.poolSize, weight: section.weight, active: true, createdAt: now
      };
    });

  var questionMap = {};
  var perSection = {};
  var questions = [];
  for (var q = 0; q < bundle.questions.length; q++) {
    var question = bundle.questions[q];
    if (question.active === false) continue;
    var newSectionId = sectionMap[question.sectionId];
    if (!newSectionId) continue;
    var qid = evalNewId_(EVAL_ID_PREFIX.QUESTION);
    questionMap[question.questionId] = qid;
    perSection[newSectionId] = perSection[newSectionId] || 0;
    questions.push({
      questionId: qid, assessmentId: newId, sectionId: newSectionId,
      questionText: question.questionText, questionType: question.questionType,
      position: perSection[newSectionId]++, required: question.required,
      scoringMode: question.scoringMode, maxPoints: question.maxPoints, weight: question.weight,
      active: true, helpText: question.helpText, description: question.description,
      competency: question.competency, code: question.code,
      configuration: question.configuration, validation: question.validation,
      feedback: question.feedback, media: question.media, accessibility: question.accessibility,
      tags: question.tags, configurationSchemaVersion: question.configurationSchemaVersion,
      createdAt: now
    });
  }

  var perQuestion = {};
  var options = [];
  for (var o = 0; o < bundle.options.length; o++) {
    var option = bundle.options[o];
    if (option.active === false) continue;
    var newQuestionId = questionMap[option.questionId];
    if (!newQuestionId) continue;
    perQuestion[newQuestionId] = perQuestion[newQuestionId] || 0;
    options.push({
      optionId: evalNewId_(EVAL_ID_PREFIX.OPTION), questionId: newQuestionId,
      assessmentId: newId, optionText: option.optionText, optionValue: option.optionValue,
      position: perQuestion[newQuestionId]++, isCorrect: option.isCorrect,
      scoreValue: option.scoreValue, matchingKey: option.matchingKey, active: true,
      feedback: option.feedback, mediaUrl: option.mediaUrl,
      configuration: option.configuration, createdAt: now
    });
  }

  copy.questionCount = evalCountQuestions_(questions);

  evalUpsertRows_(ss, EVAL_CONFIG.SHEETS.ASSESSMENTS, 'assessment_id', [evalAssessmentToRow_(copy)]);
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

  evalAudit_(ss, {
    requestId: context.requestId, action: 'duplicateAssessment', entityType: 'assessment',
    entityId: newId, actor: context.actor, status: 'ok',
    metadata: { source: sourceId, questions: questions.length }
  });

  return {
    data: { assessment: copy, sections: sections, questions: questions, options: options, versions: [] },
    reference: newId,
    summary: { assessmentId: newId, source: sourceId }
  };
}

/**
 * Clasifica el cambio frente al último snapshot publicado.
 * Devuelve 'structural' | 'safe' | 'none'.
 */
function evalClassifyChange_(previousSnapshot, questions, options) {
  if (!previousSnapshot) return 'structural';
  var before = evalStructuralFingerprint_(previousSnapshot.questions || [], previousSnapshot.options || []);
  var after = evalStructuralFingerprint_(questions, options);
  if (before !== after) return 'structural';
  var beforeText = evalTextFingerprint_(previousSnapshot.questions || []);
  var afterText = evalTextFingerprint_(questions);
  return beforeText === afterText ? 'none' : 'safe';
}

function evalStructuralFingerprint_(questions, options) {
  var optionsByQuestion = {};
  for (var o = 0; o < options.length; o++) {
    var op = options[o];
    if (op.active === false) continue;
    if (!optionsByQuestion[op.questionId]) optionsByQuestion[op.questionId] = [];
    optionsByQuestion[op.questionId].push(op);
  }
  var parts = [];
  var active = questions.filter(function (q) { return q.active !== false; })
    .slice().sort(function (a, b) { return String(a.questionId).localeCompare(String(b.questionId)); });
  for (var q = 0; q < active.length; q++) {
    var question = active[q];
    var own = (optionsByQuestion[question.questionId] || []).slice()
      .sort(function (a, b) { return evalInt_(a.position, 0) - evalInt_(b.position, 0); });
    var optionPart = own.map(function (x) {
      return x.optionValue + '~' + x.scoreValue + '~' + (x.isCorrect ? 1 : 0) + '~' + (x.matchingKey || '');
    }).join('||');
    parts.push([
      question.questionId, question.questionType, question.sectionId,
      evalInt_(question.position, 0), question.required ? 1 : 0, question.scoringMode,
      evalNum_(question.maxPoints, 0), evalNum_(question.weight, 1),
      evalWriteJson_(question.validation, '{}'), optionPart
    ].join('~'));
  }
  return parts.join('##');
}

function evalTextFingerprint_(questions) {
  return questions.filter(function (q) { return q.active !== false; })
    .slice().sort(function (a, b) { return String(a.questionId).localeCompare(String(b.questionId)); })
    .map(function (q) { return q.questionId + '~' + q.questionText + '~' + q.helpText + '~' + q.description; })
    .join('##');
}

/** Publica el borrador como una versión inmutable. */
function evalPublishAssessment_(context, payload) {
  var ss = context.ss;
  var now = evalNow_();
  var assessmentId = evalStr_((payload || {}).assessmentId, 120);
  var bundle = evalLoadBundle_(ss, assessmentId);
  evalAssertEntityVersion_(bundle.assessment, (payload || {}).expectedEntityVersion);

  var issues = evalValidatePublish_(bundle.assessment, bundle.sections, bundle.questions, bundle.options);
  if (issues.length > 0) {
    evalAudit_(ss, {
      requestId: context.requestId, action: 'publishAssessment', entityType: 'assessment',
      entityId: assessmentId, actor: context.actor, status: 'error',
      metadata: { issues: issues.length, firstCode: issues[0].code }
    });
    evalThrowIssues_('La evaluación no puede publicarse todavía.', issues);
  }

  var activeSections = bundle.sections.filter(function (s) { return s.active !== false; });
  var activeQuestions = bundle.questions.filter(function (q) { return q.active !== false; });
  var activeOptions = bundle.options.filter(function (o) { return o.active !== false; });

  var previousVersions = bundle.versions;
  var last = null;
  for (var i = 0; i < previousVersions.length; i++) {
    if (previousVersions[i].versionId === bundle.assessment.currentPublishedVersionId) {
      last = previousVersions[i];
    }
  }
  if (!last && previousVersions.length > 0) last = previousVersions[previousVersions.length - 1];

  var previousSnapshot = last ? evalParseJson_(last.snapshotJson, null) : null;
  var change = evalClassifyChange_(previousSnapshot, activeQuestions, activeOptions);
  var major = 1;
  var minor = 0;
  if (last) {
    if (change === 'structural') { major = last.version + 1; minor = 0; }
    else { major = last.version; minor = last.versionMinor + 1; }
  }

  var optionsByQuestion = {};
  for (var o2 = 0; o2 < activeOptions.length; o2++) {
    var op2 = activeOptions[o2];
    if (!optionsByQuestion[op2.questionId]) optionsByQuestion[op2.questionId] = [];
    optionsByQuestion[op2.questionId].push(op2);
  }
  var gradable = 0;
  for (var q2 = 0; q2 < activeQuestions.length; q2++) {
    if (evalIsAutoGradable_(activeQuestions[q2], optionsByQuestion[activeQuestions[q2].questionId] || [])) {
      gradable++;
    }
  }

  var versionId = evalNewId_(EVAL_ID_PREFIX.VERSION);
  var versionLabel = 'v' + major + '.' + minor;
  var snapshotAssessment = evalAssessmentFromRow_(evalAssessmentToRow_(bundle.assessment));
  snapshotAssessment.version = major;
  snapshotAssessment.versionMinor = minor;
  snapshotAssessment.versionLabel = versionLabel;
  var snapshot = {
    schemaVersion: EVAL_CONFIG.SNAPSHOT_SCHEMA_VERSION,
    assessment: snapshotAssessment,
    sections: activeSections,
    questions: activeQuestions,
    options: activeOptions
  };
  var snapshotJson = JSON.stringify(snapshot);

  var versionRow = {
    version_id: versionId,
    assessment_id: assessmentId,
    version: major,
    version_minor: minor,
    version_label: versionLabel,
    state: 'published',
    notes: evalStr_((payload || {}).notes, 4000),
    snapshot_json: snapshotJson,
    snapshot_schema_version: EVAL_CONFIG.SNAPSHOT_SCHEMA_VERSION,
    question_count: evalCountQuestions_(activeQuestions),
    gradable_question_count: gradable,
    checksum: evalChecksum_(snapshotJson),
    published_at: now,
    published_by: context.actor,
    created_at: now
  };
  evalUpsertRows_(ss, EVAL_CONFIG.SHEETS.VERSIONS, 'version_id', [versionRow]);

  // Las versiones anteriores pasan a 'superseded' (no se borran ni se alteran
  // sus snapshots: solo cambia su estado de puntero).
  var supersede = previousVersions
    .filter(function (v) { return v.state === 'published'; })
    .map(function (v) {
      var row = {
        version_id: v.versionId, assessment_id: v.assessmentId, version: v.version,
        version_minor: v.versionMinor, version_label: v.versionLabel, state: 'superseded',
        notes: v.notes, snapshot_json: v.snapshotJson,
        snapshot_schema_version: v.snapshotSchemaVersion, question_count: v.questionCount,
        gradable_question_count: v.gradableQuestionCount, checksum: v.checksum,
        published_at: v.publishedAt, published_by: v.publishedBy, created_at: v.createdAt
      };
      return row;
    });
  if (supersede.length > 0) {
    evalUpsertRows_(ss, EVAL_CONFIG.SHEETS.VERSIONS, 'version_id', supersede);
  }

  var assessment = bundle.assessment;
  assessment.version = major;
  assessment.versionMinor = minor;
  assessment.versionLabel = versionLabel;
  assessment.lifecycleStatus = 'published';
  assessment.publicationStatus = 'published';
  assessment.status = 'published';
  assessment.currentPublishedVersionId = versionId;
  assessment.publishedAt = assessment.publishedAt || now;
  assessment.updatedAt = now;
  assessment.updatedBy = context.actor;
  assessment.entityVersion = assessment.entityVersion + 1;
  assessment.questionCount = evalCountQuestions_(activeQuestions);
  evalUpsertRows_(ss, EVAL_CONFIG.SHEETS.ASSESSMENTS, 'assessment_id', [evalAssessmentToRow_(assessment)]);

  evalAudit_(ss, {
    requestId: context.requestId, action: 'publishAssessment', entityType: 'assessment',
    entityId: assessmentId, actor: context.actor, status: 'ok',
    metadata: {
      versionLabel: versionLabel, change: change, questions: versionRow.question_count,
      gradableQuestions: gradable, checksum: versionRow.checksum
    }
  });

  return {
    data: evalGetAdminAssessment_({ assessmentId: assessmentId }),
    reference: assessmentId,
    summary: { assessmentId: assessmentId, versionId: versionId, versionLabel: versionLabel }
  };
}

/** Matriz de transiciones de ciclo de vida permitidas. */
var EVAL_TRANSITIONS = {
  archiveAssessment: {
    from: ['draft', 'in_review', 'approved', 'scheduled', 'published', 'paused', 'closed'],
    lifecycle: 'archived', publication: 'archived'
  },
  unarchiveAssessment: { from: ['archived'], lifecycle: 'draft', publication: 'unpublished' },
  pauseAssessment: { from: ['published'], lifecycle: 'paused', publication: 'paused' },
  closeAssessment: { from: ['published', 'paused'], lifecycle: 'closed', publication: 'closed' },
  resumeAssessment: { from: ['paused'], lifecycle: 'published', publication: 'published' }
};

function evalTransitionAssessment_(context, payload, action) {
  var ss = context.ss;
  var now = evalNow_();
  var transition = EVAL_TRANSITIONS[action];
  if (!transition) throw evalError_('UNSUPPORTED_ACTION', 'La acción solicitada no existe.');

  var assessmentId = evalStr_((payload || {}).assessmentId, 120);
  var bundle = evalLoadBundle_(ss, assessmentId);
  evalAssertEntityVersion_(bundle.assessment, (payload || {}).expectedEntityVersion);
  var assessment = bundle.assessment;

  if (transition.from.indexOf(assessment.lifecycleStatus) < 0) {
    throw evalError_('CONFLICT',
      'La evaluación está en estado "' + assessment.lifecycleStatus +
      '" y no admite esta acción.',
      { lifecycleStatus: assessment.lifecycleStatus, action: action });
  }

  assessment.lifecycleStatus = transition.lifecycle;
  assessment.publicationStatus = transition.publication;
  assessment.status = evalDeriveStatus_(transition.lifecycle, !!assessment.currentPublishedVersionId);
  assessment.archivedAt = transition.lifecycle === 'archived' ? now : '';
  assessment.updatedAt = now;
  assessment.updatedBy = context.actor;
  assessment.entityVersion = assessment.entityVersion + 1;
  evalUpsertRows_(ss, EVAL_CONFIG.SHEETS.ASSESSMENTS, 'assessment_id', [evalAssessmentToRow_(assessment)]);

  evalAudit_(ss, {
    requestId: context.requestId, action: action, entityType: 'assessment',
    entityId: assessmentId, actor: context.actor, status: 'ok',
    metadata: { lifecycleStatus: transition.lifecycle }
  });

  return {
    data: evalGetAdminAssessment_({ assessmentId: assessmentId }),
    reference: assessmentId,
    summary: { assessmentId: assessmentId, lifecycleStatus: transition.lifecycle }
  };
}

/**
 * Reapunta las asignaciones futuras a una versión publicada anterior. No borra
 * versiones ni altera los intentos en curso, que quedan anclados a su snapshot.
 */
function evalRollbackAssessment_(context, payload) {
  var ss = context.ss;
  var now = evalNow_();
  var assessmentId = evalStr_((payload || {}).assessmentId, 120);
  var versionId = evalStr_((payload || {}).versionId, 120);
  var bundle = evalLoadBundle_(ss, assessmentId);
  evalAssertEntityVersion_(bundle.assessment, (payload || {}).expectedEntityVersion);

  var target = null;
  for (var i = 0; i < bundle.versions.length; i++) {
    if (bundle.versions[i].versionId === versionId) target = bundle.versions[i];
  }
  if (!target) throw evalError_('NOT_FOUND', 'La versión indicada no existe.');

  var rows = bundle.versions.map(function (v) {
    return {
      version_id: v.versionId, assessment_id: v.assessmentId, version: v.version,
      version_minor: v.versionMinor, version_label: v.versionLabel,
      state: v.versionId === versionId ? 'published' : 'superseded',
      notes: v.notes, snapshot_json: v.snapshotJson,
      snapshot_schema_version: v.snapshotSchemaVersion, question_count: v.questionCount,
      gradable_question_count: v.gradableQuestionCount, checksum: v.checksum,
      published_at: v.publishedAt, published_by: v.publishedBy, created_at: v.createdAt
    };
  });
  evalUpsertRows_(ss, EVAL_CONFIG.SHEETS.VERSIONS, 'version_id', rows);

  var assessment = bundle.assessment;
  assessment.currentPublishedVersionId = versionId;
  assessment.version = target.version;
  assessment.versionMinor = target.versionMinor;
  assessment.versionLabel = target.versionLabel;
  assessment.updatedAt = now;
  assessment.updatedBy = context.actor;
  assessment.entityVersion = assessment.entityVersion + 1;
  evalUpsertRows_(ss, EVAL_CONFIG.SHEETS.ASSESSMENTS, 'assessment_id', [evalAssessmentToRow_(assessment)]);

  evalAudit_(ss, {
    requestId: context.requestId, action: 'rollbackAssessment', entityType: 'assessment',
    entityId: assessmentId, actor: context.actor, status: 'ok',
    metadata: { versionId: versionId, versionLabel: target.versionLabel }
  });

  return {
    data: evalGetAdminAssessment_({ assessmentId: assessmentId }),
    reference: assessmentId,
    summary: { assessmentId: assessmentId, versionId: versionId }
  };
}

/* -------------------------------- Resultados ----------------------------- */

function evalListAssessmentResults_(payload) {
  var ss = evalSpreadsheet_();
  var assessmentId = evalStr_((payload || {}).assessmentId, 120);
  if (!assessmentId) throw evalError_('BAD_REQUEST', 'Falta el identificador de la evaluación.');
  var filter = evalStringArray_((payload || {}).gradingStatus, 5, 40);

  var rows = evalReadWhere_(ss, EVAL_CONFIG.SHEETS.ATTEMPTS, 'assessment_id', assessmentId);
  var attempts = [];
  for (var i = 0; i < rows.length; i++) {
    var attempt = evalAttemptFromRow_(rows[i]);
    if (filter.length > 0 && filter.indexOf(attempt.gradingStatus) < 0) continue;
    attempts.push({
      attemptId: attempt.attemptId,
      participantName: attempt.participantName,
      participantEmail: attempt.participantEmail,
      participantDocument: attempt.participantDocument,
      status: attempt.status,
      gradingStatus: attempt.gradingStatus,
      score: attempt.score,
      autoScore: attempt.autoScore,
      correctAnswers: attempt.correctAnswers,
      totalQuestions: attempt.totalQuestions,
      gradableQuestions: attempt.gradableQuestions,
      manualPendingCount: attempt.manualPendingCount,
      passed: attempt.passed,
      assessmentVersion: attempt.assessmentVersion,
      versionId: attempt.versionId,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      durationSeconds: attempt.durationSeconds
    });
  }
  attempts.sort(function (a, b) { return String(b.submittedAt).localeCompare(String(a.submittedAt)); });

  var submitted = attempts.filter(function (a) { return a.status === 'submitted'; });
  var scored = submitted.filter(function (a) { return typeof a.score === 'number'; });
  var withThreshold = scored.filter(function (a) { return a.passed !== null; });
  var summary = {
    total: attempts.length,
    submitted: submitted.length,
    graded: scored.length,
    pendingManualReview: attempts.filter(function (a) {
      return a.gradingStatus === 'pending_manual_review';
    }).length,
    averageScore: scored.length > 0
      ? Math.round((scored.reduce(function (sum, a) { return sum + a.score; }, 0) / scored.length) * 100) / 100
      : null,
    passRate: withThreshold.length > 0
      ? Math.round((withThreshold.filter(function (a) { return a.passed === true; }).length
          / withThreshold.length) * 10000) / 100
      : null
  };
  return { attempts: attempts, summary: summary };
}

function evalGetAttemptDetail_(payload) {
  var ss = evalSpreadsheet_();
  var attemptId = evalStr_((payload || {}).attemptId, 120);
  if (!attemptId) throw evalError_('BAD_REQUEST', 'Falta el identificador del intento.');
  var row = evalFindBy_(ss, EVAL_CONFIG.SHEETS.ATTEMPTS, 'attempt_id', attemptId);
  if (!row) throw evalError_('NOT_FOUND', 'El intento no existe.');
  var attempt = evalAttemptFromRow_(row);

  var answers = evalReadWhere_(ss, EVAL_CONFIG.SHEETS.ANSWERS, 'attempt_id', attemptId)
    .map(evalAnswerFromRow_);

  var snapshot = evalLoadVersionSnapshot_(ss, attempt.assessmentId, attempt.versionId);
  var questionById = {};
  var optionById = {};
  if (snapshot) {
    for (var q = 0; q < snapshot.questions.length; q++) questionById[snapshot.questions[q].questionId] = snapshot.questions[q];
    for (var o = 0; o < snapshot.options.length; o++) optionById[snapshot.options[o].optionId] = snapshot.options[o];
  }

  return {
    attempt: attempt,
    answers: answers.map(function (answer) {
      var question = questionById[answer.questionId] || null;
      var option = answer.selectedOptionId ? (optionById[answer.selectedOptionId] || null) : null;
      return {
        answerId: answer.answerId,
        questionId: answer.questionId,
        questionType: answer.questionType,
        questionText: question ? question.questionText : '',
        selectedOptionId: answer.selectedOptionId,
        selectedOptionText: option ? option.optionText : '',
        value: answer.value,
        isCorrect: answer.isCorrect,
        pointsAwarded: answer.pointsAwarded,
        maxPoints: answer.maxPoints,
        requiresManualReview: answer.requiresManualReview,
        answeredAt: answer.answeredAt
      };
    })
  };
}
