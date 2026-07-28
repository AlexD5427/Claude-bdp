/**
 * AuthProviders.gs — proveedores de autorización.
 *
 * `Auth.gs` decide QUÉ acciones exigen autorización. Este archivo decide CÓMO se
 * comprueba, y lo hace detrás de una interfaz única, de modo que ni el enrutador
 * ni los servicios de negocio conozcan el mecanismo concreto.
 *
 * Interfaz `AuthorizationProvider`:
 *
 *   {
 *     id: string,
 *     label: string,
 *     // Identidad NO privilegiada, solo para etiquetar la auditoría.
 *     identify: function (request) -> string,
 *     // Autoriza una acción administrativa o lanza FORBIDDEN.
 *     authorizeAdmin: function (request) -> { actor, trust, warnings },
 *     // Diagnóstico seguro para `ping` (nunca incluye secretos).
 *     describe: function () -> object
 *   }
 *
 * `request` es `{ action, requestId, credential, claimedActor }`, donde
 * `credential` es el objeto `auth` que viaja en la solicitud (ver
 * docs/evaluations/API_CONTRACT.md §Autorización).
 *
 * Proveedores incluidos:
 *
 *  · `server_secret` (POR OMISIÓN, el modo real de este ATS)
 *      El panel de React NO puede custodiar secretos, así que un backend
 *      intermedio de confianza (funciones serverless en Vercel) firma cada
 *      operación administrativa con HMAC-SHA256 usando un secreto que solo
 *      conocen ese backend y las Script Properties. El navegador nunca ve el
 *      secreto ni la firma. Ver `api/evaluations/admin.ts`.
 *
 *  · `google_identity` (para despliegues con Google Workspace)
 *      Conserva el comportamiento anterior: el Web App se despliega con
 *      «Ejecutar como: el usuario que accede» y la identidad la verifica Google.
 *      Sigue disponible sin cambios para quien sí tenga sesión de Workspace.
 *
 *  · `open_admin` (SOLO pruebas)
 *      Exige además `EVALUATIONS_ALLOW_ANONYMOUS_ADMIN='true'` y marca cada
 *      respuesta con la advertencia INSECURE_ADMIN_MODE.
 *
 * Añadir OAuth de candidatos o Google Login en el futuro consiste en registrar
 * otro proveedor aquí. Ninguna otra capa cambia.
 */

/** Modo por omisión: el que corresponde a la arquitectura real del ATS. */
var EVAL_DEFAULT_AUTH_MODE = 'server_secret';

/** Nivel de confianza en la identidad del actor, para la auditoría. */
var EVAL_ACTOR_TRUST = {
  /** Identidad verificada por un proveedor de identidad (Google). */
  VERIFIED: 'verified',
  /** Identidad afirmada por el backend intermedio, que sí está autenticado. */
  ATTESTED: 'attested',
  /** Sin identidad comprobable. */
  UNVERIFIED: 'unverified'
};

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

/** Error FORBIDDEN con un motivo interno que solo se escribe en la bitácora. */
function evalForbidden_(message, auditReason) {
  var error = evalError_('FORBIDDEN', message);
  error.evalAuditReason = String(auditReason || '');
  return error;
}

/* ------------------------- Proveedor: server_secret ----------------------- */

/**
 * Autorización por secreto de servidor. El único que conoce el secreto es el
 * backend intermedio; el frontend se autentica contra ÉSE, no contra Apps
 * Script.
 */
var EVAL_AUTH_PROVIDER_SERVER_SECRET = {
  id: 'server_secret',
  label: 'Firma HMAC emitida por el backend intermedio',

  identify: function (request) {
    var credential = request && request.credential;
    return credential && credential.actor ? String(credential.actor) : '';
  },

  authorizeAdmin: function (request) {
    var verdict = evalVerifySignedCredential_(request.credential, request.action, request.requestId);
    if (!verdict.ok) {
      if (verdict.reason === 'secret_not_configured') {
        throw evalForbidden_(
          'La autorización administrativa no está configurada en el servidor. ' +
          'Define la propiedad ' + EVAL_CONFIG.PROPS.ADMIN_SHARED_SECRET +
          ' (mínimo ' + EVAL_SIGNATURE_MIN_SECRET_LENGTH + ' caracteres).',
          verdict.reason);
      }
      // Mismo mensaje para cualquier otro fallo: no se revela cuál falló.
      throw evalForbidden_(
        'Esta operación debe llegar firmada por el backend administrativo autorizado.',
        verdict.reason);
    }

    var actor = String((request.credential && request.credential.actor) || '');
    var admins = evalAdminEmails_();
    if (admins.length > 0 && admins.indexOf(actor.toLowerCase()) < 0) {
      throw evalForbidden_(
        'Tu cuenta no está autorizada para administrar evaluaciones.',
        'actor_not_allowlisted');
    }

    return {
      actor: actor,
      trust: EVAL_ACTOR_TRUST.ATTESTED,
      warnings: []
    };
  },

  describe: function () {
    return {
      scheme: 'hmac-sha256',
      configured: evalSignatureConfigured_(),
      freshnessSeconds: Math.round(EVAL_SIGNATURE_WINDOW_MS / 1000),
      actorAllowlist: evalAdminEmails_().length > 0
    };
  }
};

/* ------------------------ Proveedor: google_identity ---------------------- */

/** Autorización por identidad de Google Workspace (sesión del navegador). */
var EVAL_AUTH_PROVIDER_GOOGLE_IDENTITY = {
  id: 'google_identity',
  label: 'Identidad verificada por Google Workspace',

  identify: function () {
    return evalActiveEmail_();
  },

  authorizeAdmin: function () {
    var email = evalActiveEmail_();
    if (!email) {
      throw evalForbidden_(
        'No se pudo verificar tu identidad de Google. El Web App debe ejecutarse ' +
        'como el usuario que accede y con acceso restringido a la organización.',
        'no_google_identity');
    }
    var admins = evalAdminEmails_();
    if (admins.length > 0 && admins.indexOf(email.toLowerCase()) < 0) {
      throw evalForbidden_(
        'Tu cuenta no está autorizada para administrar evaluaciones.',
        'actor_not_allowlisted');
    }
    return { actor: email, trust: EVAL_ACTOR_TRUST.VERIFIED, warnings: [] };
  },

  describe: function () {
    return {
      scheme: 'google-session',
      configured: true,
      actorAllowlist: evalAdminEmails_().length > 0
    };
  }
};

/* --------------------------- Proveedor: open_admin ------------------------ */

/** Modo de pruebas explícito. No es seguridad y se declara en cada respuesta. */
var EVAL_AUTH_PROVIDER_OPEN_ADMIN = {
  id: 'open_admin',
  label: 'Modo abierto de pruebas (sin autorización)',

  identify: function () {
    return evalActiveEmail_();
  },

  authorizeAdmin: function () {
    var allowed = evalProp_(EVAL_CONFIG.PROPS.ALLOW_ANONYMOUS_ADMIN, 'false');
    if (String(allowed) !== 'true') {
      throw evalForbidden_(
        'El modo administrativo abierto no está habilitado en este despliegue.',
        'open_admin_not_enabled');
    }
    return {
      actor: evalActiveEmail_(),
      trust: EVAL_ACTOR_TRUST.UNVERIFIED,
      warnings: ['INSECURE_ADMIN_MODE']
    };
  },

  describe: function () {
    return {
      scheme: 'none',
      configured: String(evalProp_(EVAL_CONFIG.PROPS.ALLOW_ANONYMOUS_ADMIN, 'false')) === 'true',
      insecure: true
    };
  }
};

/* ------------------------ Proveedor: local_execution ---------------------- */

/**
 * Ejecución desde el editor de Apps Script (`Setup.gs`, `Tests.gs`).
 *
 * A propósito **no** está en `EVAL_AUTH_PROVIDERS`: no se puede seleccionar con
 * la propiedad `EVALUATIONS_AUTH_MODE`, porque eso equivaldría a habilitar la
 * administración anónima por configuración. Solo se alcanza cuando el propio
 * código del proyecto llama a `evalHandleTrustedRequest_()`, y para llegar ahí ya
 * hace falta permiso de edición del proyecto de Apps Script.
 */
var EVAL_AUTH_PROVIDER_LOCAL_EXECUTION = {
  id: 'local_execution',
  label: 'Ejecución manual desde el editor de Apps Script',

  identify: function () {
    return evalActiveEmail_();
  },

  authorizeAdmin: function () {
    return {
      actor: evalActiveEmail_() || 'editor',
      trust: EVAL_ACTOR_TRUST.UNVERIFIED,
      warnings: []
    };
  },

  describe: function () {
    return { scheme: 'none', configured: true, insecure: false };
  }
};

/* --------------------------------- Registro ------------------------------- */

/**
 * Registro de proveedores. Es el ÚNICO punto donde se enumeran los mecanismos
 * de autorización admitidos.
 */
var EVAL_AUTH_PROVIDERS = {
  server_secret: EVAL_AUTH_PROVIDER_SERVER_SECRET,
  google_identity: EVAL_AUTH_PROVIDER_GOOGLE_IDENTITY,
  open_admin: EVAL_AUTH_PROVIDER_OPEN_ADMIN
};

/** Modo configurado, normalizado. Un valor desconocido cae en el por omisión. */
function evalAuthMode_() {
  var raw = String(evalProp_(EVAL_CONFIG.PROPS.AUTH_MODE, EVAL_DEFAULT_AUTH_MODE)).trim();
  return EVAL_AUTH_PROVIDERS[raw] ? raw : EVAL_DEFAULT_AUTH_MODE;
}

/** Proveedor activo. Nunca devuelve `null`. */
function evalAuthProvider_() {
  return EVAL_AUTH_PROVIDERS[evalAuthMode_()];
}

/** Diagnóstico del modo activo, seguro para publicar en `ping`. */
function evalAuthDiagnostics_() {
  var provider = evalAuthProvider_();
  var description = provider.describe();
  return {
    mode: provider.id,
    scheme: description.scheme,
    configured: description.configured === true,
    insecure: description.insecure === true
  };
}
