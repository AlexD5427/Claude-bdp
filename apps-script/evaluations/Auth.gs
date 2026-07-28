/**
 * Auth.gs — clasificación de acciones y frontera de autorización.
 *
 * Este archivo responde a dos preguntas y a ninguna más:
 *
 *   1. ¿Esta acción es administrativa o pública?
 *   2. ¿Está autorizada?
 *
 * El CÓMO se comprueba vive en `AuthProviders.gs` detrás de la interfaz
 * `AuthorizationProvider`. Aquí no se menciona `Session.getActiveUser()`, ni
 * HMAC, ni OAuth: la separación es deliberada.
 *
 *   Autenticación  (¿quién eres?)      → proveedor de autorización
 *          ↓
 *   Autorización   (¿puedes hacerlo?)  → este archivo + el proveedor
 *          ↓
 *   Lógica de negocio                  → AssessmentService.gs y compañía
 *
 * La lógica de negocio recibe únicamente un `actor` (una etiqueta para la
 * bitácora) y nunca sabe con qué mecanismo se autorizó la llamada.
 *
 * Las acciones públicas nunca requieren autorización y solo alcanzan
 * evaluaciones publicadas y saneadas.
 */

/** Acciones que exigen autorización administrativa. */
var EVAL_ADMIN_ACTIONS = {
  listAdminAssessments: true,
  getAdminAssessment: true,
  createAssessment: true,
  updateAssessment: true,
  duplicateAssessment: true,
  publishAssessment: true,
  archiveAssessment: true,
  unarchiveAssessment: true,
  pauseAssessment: true,
  closeAssessment: true,
  resumeAssessment: true,
  rollbackAssessment: true,
  listAssessmentResults: true,
  getAttemptDetail: true,
  verifySchema: true,
  setupSchema: true
};

/** Acciones abiertas al portal de candidatos. */
var EVAL_PUBLIC_ACTIONS = {
  ping: true,
  listPublicAssessments: true,
  getPublicAssessment: true,
  startAttempt: true,
  submitAttempt: true
};

/** ¿Es una acción administrativa? */
function evalIsAdminAction_(action) {
  return EVAL_ADMIN_ACTIONS[String(action)] === true;
}

/**
 * Toda acción del enrutador debe estar clasificada en EXACTAMENTE una de las dos
 * listas. Una acción sin clasificar sería inalcanzable (responde
 * UNSUPPORTED_ACTION) y una acción administrativa listada como pública sería
 * ejecutable de forma anónima. Hay una prueba que ejercita esta función contra
 * EVAL_READ_ACTIONS y EVAL_WRITE_ACTIONS.
 */
function evalClassifyActions_() {
  var declared = {};
  var duplicated = [];
  var admin = Object.keys(EVAL_ADMIN_ACTIONS);
  var publicOnes = Object.keys(EVAL_PUBLIC_ACTIONS);
  for (var i = 0; i < admin.length; i++) declared[admin[i]] = 'admin';
  for (var j = 0; j < publicOnes.length; j++) {
    if (declared[publicOnes[j]]) duplicated.push(publicOnes[j]);
    declared[publicOnes[j]] = 'public';
  }
  var routed = Object.keys(EVAL_READ_ACTIONS).concat(Object.keys(EVAL_WRITE_ACTIONS));
  var unclassified = [];
  for (var r = 0; r < routed.length; r++) {
    if (!declared[routed[r]]) unclassified.push(routed[r]);
  }
  var orphan = [];
  for (var d = 0; d < Object.keys(declared).length; d++) {
    var name = Object.keys(declared)[d];
    if (routed.indexOf(name) < 0) orphan.push(name);
  }
  return { declared: declared, duplicated: duplicated, unclassified: unclassified, orphan: orphan };
}

/**
 * Resuelve el contexto de autorización de una solicitud.
 *
 * `request` es `{ action, requestId, credential, claimedActor }`. Devuelve
 * `{ actor, trust, mode, isAdmin, warnings }` y lanza FORBIDDEN cuando la acción
 * es administrativa y el proveedor activo no la autoriza.
 */
function evalAuthorize_(request) {
  var action = String((request && request.action) || '');
  // `trustedLocal` solo lo pone `evalHandleTrustedRequest_()`, que a su vez solo
  // se invoca desde el propio proyecto (Setup.gs / Tests.gs). Ningún campo de la
  // solicitud HTTP llega hasta aquí: `Code.gs` copia exclusivamente `action`,
  // `requestId`, `payload` y `auth`.
  var provider = (request && request.trustedLocal === true)
    ? EVAL_AUTH_PROVIDER_LOCAL_EXECUTION
    : evalAuthProvider_();
  var context = {
    action: action,
    requestId: String((request && request.requestId) || ''),
    credential: (request && request.credential) || null,
    claimedActor: String((request && request.claimedActor) || '')
  };

  if (!evalIsAdminAction_(action)) {
    if (EVAL_PUBLIC_ACTIONS[action] !== true) {
      throw evalError_('UNSUPPORTED_ACTION', 'La acción solicitada no existe.');
    }
    var identity = String(provider.identify(context) || '');
    return {
      actor: identity,
      trust: identity ? EVAL_ACTOR_TRUST.UNVERIFIED : '',
      mode: provider.id,
      isAdmin: false,
      warnings: []
    };
  }

  var decision = provider.authorizeAdmin(context);
  return {
    actor: String(decision.actor || ''),
    trust: decision.trust || EVAL_ACTOR_TRUST.UNVERIFIED,
    mode: provider.id,
    isAdmin: true,
    warnings: decision.warnings || []
  };
}

/**
 * Actor efectivo que se registra en las hojas.
 *
 * La etiqueta dice de dónde viene la identidad, para que la bitácora no mienta:
 *
 *   ana@banco.com               identidad verificada por Google
 *   proxy:ana@banco.com         identidad afirmada por el backend intermedio
 *   sin-verificar:ana           nombre enviado por el cliente, sin comprobar
 *   anonymous                   sin identidad alguna
 */
function evalResolveActor_(auth, claimedActor) {
  var actor = evalStr_(auth && auth.actor, 200);
  if (actor) {
    if (auth.trust === EVAL_ACTOR_TRUST.VERIFIED) return actor;
    if (auth.trust === EVAL_ACTOR_TRUST.ATTESTED) return 'proxy:' + actor;
    return 'sin-verificar:' + actor;
  }
  var claimed = evalStr_(claimedActor, 150);
  return claimed ? 'sin-verificar:' + claimed : 'anonymous';
}
