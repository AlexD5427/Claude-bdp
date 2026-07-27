/**
 * Auth.gs — autorización de las acciones administrativas.
 *
 * No existe forma de autenticar al reclutador desde el navegador contra Apps
 * Script sin incrustar un secreto en el bundle, y eso está prohibido. Por eso la
 * autorización se resuelve en el servidor con la identidad que Google ya verifica.
 *
 * Modos (propiedad de script EVALUATIONS_AUTH_MODE):
 *
 *  · 'google_identity'  (por omisión y RECOMENDADO)
 *      Despliega el Web App con «Ejecutar como: el usuario que accede» y
 *      «Quién tiene acceso: sólo usuarios de la organización». Entonces
 *      Session.getActiveUser().getEmail() devuelve una identidad verificada por
 *      Google y se compara con EVALUATIONS_ADMIN_EMAILS. Si la lista está vacía,
 *      basta con que el correo sea verificable y del dominio configurado.
 *
 *  · 'open_admin'  (SOLO pruebas)
 *      Requiere además EVALUATIONS_ALLOW_ANONYMOUS_ADMIN='true'. Permite
 *      operaciones administrativas sin identidad, y en ese caso TODA respuesta
 *      incluye la advertencia INSECURE_ADMIN_MODE, cada escritura queda auditada
 *      y el frontend muestra un aviso visible. Esto NO es seguridad: es un modo
 *      de pruebas explícito y declarado.
 *
 * Las acciones públicas nunca requieren autorización y solo alcanzan
 * evaluaciones publicadas.
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

/** Correo del usuario activo, o cadena vacía si Google no lo expone. */
function evalActiveEmail_() {
  try {
    var email = Session.getActiveUser().getEmail();
    return email ? String(email) : '';
  } catch (e) {
    return '';
  }
}

/** Lista de administradores configurada, en minúsculas. */
function evalAdminEmails_() {
  var raw = evalProp_(EVAL_CONFIG.PROPS.ADMIN_EMAILS, '');
  if (!raw) return [];
  return String(raw).split(',').map(function (value) {
    return value.trim().toLowerCase();
  }).filter(function (value) { return value !== ''; });
}

/**
 * Resuelve el contexto de autorización de una solicitud.
 *
 * Devuelve `{ actor, mode, isAdmin, warnings }`. Lanza FORBIDDEN cuando la
 * acción es administrativa y no hay autorización.
 */
function evalAuthorize_(action) {
  var mode = evalProp_(EVAL_CONFIG.PROPS.AUTH_MODE, 'google_identity');
  var email = evalActiveEmail_();
  var warnings = [];

  if (!evalIsAdminAction_(action)) {
    if (EVAL_PUBLIC_ACTIONS[String(action)] !== true) {
      throw evalError_('UNSUPPORTED_ACTION', 'La acción solicitada no existe.');
    }
    return { actor: email || 'anonymous', mode: mode, isAdmin: false, warnings: warnings };
  }

  if (mode === 'open_admin') {
    var allowed = evalProp_(EVAL_CONFIG.PROPS.ALLOW_ANONYMOUS_ADMIN, 'false');
    if (String(allowed) !== 'true') {
      throw evalError_('FORBIDDEN',
        'El modo administrativo abierto no está habilitado en este despliegue.');
    }
    warnings.push('INSECURE_ADMIN_MODE');
    return { actor: email || 'anonymous', mode: mode, isAdmin: true, warnings: warnings };
  }

  // google_identity
  if (!email) {
    throw evalError_('FORBIDDEN',
      'No se pudo verificar tu identidad. El Web App debe ejecutarse como el ' +
      'usuario que accede y con acceso restringido a la organización.');
  }
  var admins = evalAdminEmails_();
  if (admins.length > 0 && admins.indexOf(email.toLowerCase()) < 0) {
    throw evalError_('FORBIDDEN', 'Tu cuenta no está autorizada para administrar evaluaciones.');
  }
  return { actor: email, mode: mode, isAdmin: true, warnings: warnings };
}

/**
 * Actor efectivo que se registra en las hojas. Se prefiere la identidad
 * verificada; el nombre que envía el cliente solo se usa como etiqueta cuando no
 * hay identidad (modo abierto) y queda claramente marcado.
 */
function evalResolveActor_(auth, claimedActor) {
  if (auth.actor && auth.actor !== 'anonymous') return evalStr_(auth.actor, 200);
  var claimed = evalStr_(claimedActor, 150);
  return claimed ? 'sin-verificar:' + claimed : 'anonymous';
}
