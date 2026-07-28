/**
 * Config.gs — configuración central del backend de Evaluaciones.
 *
 * Este archivo NO contiene secretos. Todo valor sensible (correos de
 * administradores, id de la hoja de cálculo, modo de autorización, secreto
 * compartido con el backend intermedio) vive en las Script Properties del
 * proyecto de Apps Script y se lee a través de `evalProp_()`. Ver
 * docs/evaluations/APPS_SCRIPT_SETUP.md.
 *
 * Los nombres de hoja y los encabezados de este archivo son la fuente de verdad
 * del esquema y deben coincidir exactamente con docs/evaluations/DATA_MODEL.md
 * (hay una prueba automatizada que compara ambos).
 */

var EVAL_CONFIG = {
  /** Versión del esquema de fila. Se escribe en `schema_version`. */
  SCHEMA_VERSION: 1,
  /** Versión del esquema de `configuration_json` de preguntas y opciones. */
  CONFIGURATION_SCHEMA_VERSION: 1,
  /** Versión del esquema de los snapshots de versiones publicadas. */
  SNAPSHOT_SCHEMA_VERSION: 1,

  SHEETS: {
    ASSESSMENTS: 'Assessments',
    SECTIONS: 'Sections',
    QUESTIONS: 'Questions',
    OPTIONS: 'Options',
    VERSIONS: 'Versions',
    ATTEMPTS: 'Attempts',
    ANSWERS: 'Answers',
    PROCESSED_REQUESTS: 'ProcessedRequests',
    AUDIT_LOG: 'AuditLog'
  },

  /** Claves de Script Properties reconocidas. */
  PROPS: {
    /** Id de la hoja de cálculo. Si falta se usa la hoja contenedora. */
    SPREADSHEET_ID: 'EVALUATIONS_SPREADSHEET_ID',
    /** Correos autorizados para acciones administrativas, separados por comas. */
    ADMIN_EMAILS: 'EVALUATIONS_ADMIN_EMAILS',
    /**
     * Proveedor de autorización activo: 'server_secret' (por omisión),
     * 'google_identity' u 'open_admin' (solo pruebas). Ver AuthProviders.gs.
     */
    AUTH_MODE: 'EVALUATIONS_AUTH_MODE',
    /**
     * Secreto compartido con el backend intermedio que firma las operaciones
     * administrativas. Mínimo 32 caracteres. NUNCA llega al navegador.
     */
    ADMIN_SHARED_SECRET: 'EVALUATIONS_ADMIN_SHARED_SECRET',
    /** Secreto siguiente, para rotar sin cortar el servicio. */
    ADMIN_SHARED_SECRET_NEXT: 'EVALUATIONS_ADMIN_SHARED_SECRET_NEXT',
    /** Debe valer exactamente 'true' para habilitar el modo abierto. */
    ALLOW_ANONYMOUS_ADMIN: 'EVALUATIONS_ALLOW_ANONYMOUS_ADMIN',
    /** 'true' para registrar cada solicitud en AuditLog (por omisión: true). */
    AUDIT_ENABLED: 'EVALUATIONS_AUDIT_ENABLED'
  },

  LIMITS: {
    /** Espera máxima del ScriptLock antes de responder LOCK_TIMEOUT. */
    LOCK_TIMEOUT_MS: 25000,
    MAX_TEXT: 8000,
    MAX_SHORT_TEXT: 300,
    MAX_TITLE: 200,
    MAX_CODE: 60,
    MAX_SECTIONS: 200,
    MAX_QUESTIONS: 1000,
    MAX_OPTIONS_PER_QUESTION: 60,
    MAX_ANSWERS_PER_ATTEMPT: 1000,
    MAX_USER_AGENT: 300
  },

  /** Valores admitidos (listas blancas). */
  ENUMS: {
    STATUS: ['draft', 'published', 'archived'],
    LIFECYCLE: ['draft', 'in_review', 'approved', 'scheduled', 'published', 'paused', 'closed', 'archived'],
    PUBLICATION: ['unpublished', 'scheduled', 'published', 'paused', 'closed', 'archived'],
    ACCESS_TYPE: ['public'],
    SCORING_MODE: ['none', 'exact', 'partial', 'per_option', 'weighted', 'manual', 'rubric'],
    ATTEMPT_STATUS: ['in_progress', 'submitted', 'abandoned'],
    GRADING_STATUS: ['automatically_graded', 'pending_manual_review', 'fully_graded'],
    VERSION_STATE: ['published', 'superseded'],
    CATEGORY: [
      'pre_screening', 'knowledge', 'technical', 'numerical', 'situational',
      'competency', 'interview_guide', 'scorecard', 'case_study', 'simulation',
      'assessment_center', 'performance'
    ]
  }
};

/** Encabezados exactos de cada hoja, en orden. */
var EVAL_HEADERS = {
  Assessments: [
    'assessment_id', 'public_code', 'title', 'description', 'instructions',
    'status', 'duration_minutes', 'passing_score', 'access_type', 'version',
    'question_count', 'created_at', 'updated_at', 'published_at', 'archived_at',
    'created_by', 'updated_by', 'version_minor', 'version_label',
    'lifecycle_status', 'publication_status', 'category', 'purpose', 'tags_json',
    'linked_process_ids_json', 'policies_json', 'theme_json', 'rules_json',
    'rubrics_json', 'internal_instructions', 'current_published_version_id',
    'entity_version', 'schema_version', 'sync_status'
  ],
  Sections: [
    'section_id', 'assessment_id', 'title', 'description', 'position',
    'time_limit_seconds', 'randomize', 'pool_size', 'weight', 'active',
    'created_at', 'updated_at'
  ],
  Questions: [
    'question_id', 'assessment_id', 'section_id', 'question_text',
    'question_type', 'position', 'required', 'scoring_mode', 'max_points',
    'weight', 'active', 'help_text', 'description', 'competency', 'code',
    'configuration_json', 'validation_json', 'feedback_json', 'media_json',
    'accessibility_json', 'tags_json', 'configuration_schema_version',
    'created_at', 'updated_at'
  ],
  Options: [
    'option_id', 'question_id', 'assessment_id', 'option_text', 'option_value',
    'position', 'is_correct', 'score_value', 'matching_key', 'active',
    'feedback', 'media_url', 'configuration_json', 'created_at', 'updated_at'
  ],
  Versions: [
    'version_id', 'assessment_id', 'version', 'version_minor', 'version_label',
    'state', 'notes', 'snapshot_json', 'snapshot_schema_version',
    'question_count', 'gradable_question_count', 'checksum', 'published_at',
    'published_by', 'created_at'
  ],
  Attempts: [
    'attempt_id', 'request_id', 'assessment_id', 'assessment_version',
    'version_id', 'participant_name', 'participant_email',
    'participant_document', 'anonymous_token', 'status', 'started_at',
    'submitted_at', 'score', 'auto_score', 'correct_answers', 'total_questions',
    'gradable_questions', 'manual_pending_count', 'grading_status', 'passed',
    'graded_at', 'graded_by', 'duration_seconds', 'user_agent', 'process_id'
  ],
  Answers: [
    'answer_id', 'attempt_id', 'assessment_id', 'question_id', 'question_type',
    'selected_option_id', 'answer_value_json', 'is_correct', 'points_awarded',
    'max_points', 'requires_manual_review', 'answered_at'
  ],
  ProcessedRequests: [
    'request_id', 'action', 'result_reference', 'processed_at', 'actor',
    'result_summary_json'
  ],
  AuditLog: [
    'audit_id', 'request_id', 'action', 'entity_type', 'entity_id', 'actor',
    'status', 'created_at', 'metadata_json'
  ]
};

/** Lee una Script Property con valor por omisión. Nunca la registra en el log. */
function evalProp_(key, fallback) {
  try {
    var value = PropertiesService.getScriptProperties().getProperty(key);
    if (value === null || value === undefined || value === '') return fallback;
    return value;
  } catch (e) {
    return fallback;
  }
}

/** La hoja de cálculo activa: por id de propiedad o la hoja contenedora. */
function evalSpreadsheet_() {
  var id = evalProp_(EVAL_CONFIG.PROPS.SPREADSHEET_ID, '');
  if (id) return SpreadsheetApp.openById(id);
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw evalError_('SCHEMA_ERROR',
      'No hay hoja de cálculo asociada. Configura la propiedad ' +
      EVAL_CONFIG.PROPS.SPREADSHEET_ID + '.');
  }
  return active;
}
