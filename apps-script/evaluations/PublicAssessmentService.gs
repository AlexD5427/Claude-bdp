/**
 * PublicAssessmentService.gs — superficie pública (portal de candidatos).
 *
 * Reglas absolutas:
 *  · Solo alcanza evaluaciones con status='published' Y publication_status='published'.
 *  · Los borradores y las archivadas son invisibles: responden NOT_FOUND.
 *  · Todo lo que sale pasa por Sanitize.gs (lista blanca campo por campo).
 *  · Se sirve SIEMPRE el snapshot de la versión apuntada por
 *    current_published_version_id, nunca el borrador en edición.
 */

/** Carga el snapshot de una versión. Devuelve `null` si no existe. */
function evalLoadVersionSnapshot_(ss, assessmentId, versionId) {
  if (!versionId) return null;
  var row = evalFindBy_(ss, EVAL_CONFIG.SHEETS.VERSIONS, 'version_id', versionId);
  if (!row) return null;
  if (String(row.assessment_id) !== String(assessmentId)) return null;
  var snapshot = evalDecodeSnapshot_(row.snapshot_json);
  if (!snapshot || !snapshot.assessment) return null;
  if (evalInt_(snapshot.schemaVersion, 1) > EVAL_CONFIG.SNAPSHOT_SCHEMA_VERSION) {
    throw evalError_('SCHEMA_ERROR',
      'La versión publicada usa un esquema más nuevo que el del servidor.');
  }
  snapshot.sections = Array.isArray(snapshot.sections) ? snapshot.sections : [];
  snapshot.questions = Array.isArray(snapshot.questions) ? snapshot.questions : [];
  snapshot.options = Array.isArray(snapshot.options) ? snapshot.options : [];
  snapshot.versionId = String(row.version_id);
  snapshot.versionLabel = String(row.version_label || '');
  snapshot.gradableQuestionCount = evalInt_(row.gradable_question_count, 0);
  return snapshot;
}

/** ¿Esta evaluación se puede servir públicamente? */
function evalIsPubliclyServable_(assessment) {
  return assessment.status === 'published'
    && assessment.publicationStatus === 'published'
    && !!assessment.currentPublishedVersionId;
}

/**
 * Localiza una evaluación publicada por su código público.
 * Lanza NOT_FOUND cuando no existe, está en borrador, pausada, cerrada o
 * archivada — el candidato no puede distinguir entre esos casos.
 */
function evalFindPublishedByCode_(ss, publicCode) {
  var code = evalStr_(publicCode, 60).toUpperCase();
  if (!code) throw evalError_('NOT_FOUND', 'La evaluación no está disponible.');
  var rows = evalReadAll_(ss, EVAL_CONFIG.SHEETS.ASSESSMENTS);
  for (var i = 0; i < rows.length; i++) {
    var assessment = evalAssessmentFromRow_(rows[i]);
    if (String(assessment.publicCode).toUpperCase() !== code) continue;
    if (!evalIsPubliclyServable_(assessment)) break;
    return assessment;
  }
  throw evalError_('NOT_FOUND', 'La evaluación no está disponible.');
}

/**
 * Conteo de preguntas de la versión SERVIDA, no del borrador.
 *
 * `Assessments.question_count` cuenta las preguntas activas del borrador, que
 * puede tener más o menos que la versión publicada. Exponerlo sería, además de
 * inexacto, una fuga de información sobre trabajo no publicado.
 */
function evalPublishedQuestionCount_(versionsById, assessment) {
  var version = versionsById[String(assessment.currentPublishedVersionId)];
  return version ? evalInt_(version.question_count, 0) : 0;
}

/** Listado público: solo publicadas, con datos mínimos. */
function evalListPublicAssessments_(payload) {
  var ss = evalSpreadsheet_();
  var processId = evalStr_((payload || {}).processId, 120);
  var rows = evalReadAll_(ss, EVAL_CONFIG.SHEETS.ASSESSMENTS);
  var versionRows = evalReadAll_(ss, EVAL_CONFIG.SHEETS.VERSIONS);
  var versionsById = {};
  for (var v = 0; v < versionRows.length; v++) {
    versionsById[String(versionRows[v].version_id)] = versionRows[v];
  }
  var items = [];
  for (var i = 0; i < rows.length; i++) {
    var assessment = evalAssessmentFromRow_(rows[i]);
    if (!evalIsPubliclyServable_(assessment)) continue;
    if (processId) {
      var linked = Array.isArray(assessment.linkedProcessIds) ? assessment.linkedProcessIds : [];
      var found = false;
      for (var l = 0; l < linked.length; l++) {
        if (String(linked[l]) === processId) { found = true; break; }
      }
      if (!found) continue;
    }
    items.push(
      evalPublicAssessmentSummary_(assessment, evalPublishedQuestionCount_(versionsById, assessment)),
    );
  }
  items.sort(function (a, b) { return String(a.title).localeCompare(String(b.title)); });
  return { items: items, total: items.length };
}

/** Detalle público saneado de una evaluación publicada. */
function evalGetPublicAssessment_(payload) {
  var ss = evalSpreadsheet_();
  var assessment = evalFindPublishedByCode_(ss, (payload || {}).publicCode);
  var snapshot = evalLoadVersionSnapshot_(ss, assessment.assessmentId, assessment.currentPublishedVersionId);
  if (!snapshot) throw evalError_('NOT_FOUND', 'La evaluación no está disponible.');
  return evalPublicAssessment_(snapshot);
}
