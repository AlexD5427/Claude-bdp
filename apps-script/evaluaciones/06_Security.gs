/**
 * 06_Security.gs — autorización y defensas del candidato.
 *
 * ── El modelo, y por qué es este ─────────────────────────────────────────────
 * El ATS no tiene autenticación de terceros y no la va a tener: sus usuarios
 * entran con el acceso propio de la aplicación. La versión anterior de este
 * módulo intentó resolver la autorización con identidad de Google, un secreto
 * compartido, un proxy serverless que firmaba con HMAC y una frase de acceso por
 * sesión. El resultado: cinco variables de entorno, una frase que había que
 * teclear cada vez y, cuando algo no cuadraba, un «no autorizado» sin pista.
 *
 * Aquí hay DOS superficies y una sola idea por superficie:
 *
 *   ADMINISTRACIÓN (el ATS)
 *     Se protege con una llave larga guardada en la propiedad `EV_ADMIN_KEY` del
 *     script. El ATS la envía en cada llamada administrativa. Se configura UNA
 *     vez en «Evaluaciones → Conexión» y queda guardada en el navegador.
 *     Si la propiedad no existe, el backend funciona en modo ABIERTO y lo grita:
 *       · `ping` devuelve `modo: "abierto"`;
 *       · el diagnóstico marca un hallazgo de severidad alta;
 *       · la interfaz muestra un aviso permanente.
 *     Nunca hay un modo insegura y silencioso.
 *
 *   CANDIDATO (el enlace público)
 *     No hay cuentas: la prueba se abre con el código público. La defensa no está
 *     en «quién eres» sino en «qué puedes hacer»:
 *       · solo se sirven evaluaciones publicadas, y solo el snapshot saneado;
 *       · la clave de respuestas NUNCA sale del servidor;
 *       · iniciar un intento devuelve un TOKEN firmado (HMAC) ligado a ese
 *         intento; sin el token no se puede escribir ni leer nada de él;
 *       · el token no sirve para otro intento ni para otra evaluación;
 *       · el reloj es del servidor: el navegador no puede alargar la prueba;
 *       · hay límite de frecuencia por código para que nadie cree miles de
 *         intentos;
 *       · la calificación la hace el servidor y descarta cualquier puntaje que
 *         llegue del cliente.
 *
 * Eso es «básico pero robusto»: no hay superficie que explotar para hacer
 * trampa ni para tocar el libro de cálculo.
 */

/** Acciones que exigen llave de administración. */
var EV_ADMIN_ACTIONS = {
  install: true,
  repair: true,
  diagnose: true,
  listEvaluations: true,
  getEvaluation: true,
  createEvaluation: true,
  saveEvaluation: true,
  duplicateEvaluation: true,
  publishEvaluation: true,
  transitionEvaluation: true,
  relaunchEvaluation: true,
  rollbackEvaluation: true,
  deleteEvaluation: true,
  purgeEvaluation: true,
  listAttempts: true,
  getAttempt: true,
  gradeAnswer: true,
  annulAttempt: true,
  exportAttempt: true,
  listLogs: true,
  pruneLogs: true,
  getMetrics: true
};

/** Acciones abiertas: las que usa el enlace público del candidato. */
var EV_PUBLIC_ACTIONS = {
  ping: true,
  openAssessment: true,
  startAttempt: true,
  saveProgress: true,
  heartbeat: true,
  submitAttempt: true
};

function evIsAdminAction_(action) {
  return EV_ADMIN_ACTIONS[String(action)] === true;
}

function evIsPublicAction_(action) {
  return EV_PUBLIC_ACTIONS[String(action)] === true;
}

/**
 * Modo de autorización efectivo.
 *
 * `abierto` significa exactamente eso, y se informa siempre. No es un modo
 * pensado para producción, pero es el que permite que el backend funcione en el
 * primer arranque sin que nadie tenga que configurar nada.
 */
function evAuthMode_() {
  var key = String(evProp_(EV_PROP.ADMIN_KEY, ''));
  return key.length >= 16 ? 'llave' : 'abierto';
}

/** Diagnóstico de la configuración de autorización (sin revelar la llave). */
function evAuthDiagnostics_() {
  var key = String(evProp_(EV_PROP.ADMIN_KEY, ''));
  var next = String(evProp_(EV_PROP.ADMIN_KEY_NEXT, ''));
  return {
    modo: evAuthMode_(),
    llaveConfigurada: key.length > 0,
    llaveLongitud: key.length,
    llaveSuficiente: key.length >= 16,
    llaveRotacionPreparada: next.length >= 16,
    secretoIntentos: String(evProp_(EV_PROP.ATTEMPT_SECRET, '')).length >= 32
  };
}

/**
 * Comprueba la autorización de una acción.
 *
 * Devuelve `{ actor, cliente, modo, esAdmin, avisos }` o lanza FORBIDDEN. El
 * mensaje de FORBIDDEN dice qué falta y dónde arreglarlo; nunca revela la llave
 * esperada ni si la enviada era «casi» correcta.
 */
function evAuthorize_(request) {
  var action = String(request.action || '');
  var cliente = evText_(request.clientId, 120);
  var actorDeclarado = evText_(request.actor, 200);

  if (!evIsAdminAction_(action)) {
    if (!evIsPublicAction_(action)) {
      throw evError_(EV_CODE.UNSUPPORTED_ACTION, '', { details: { action: action } });
    }
    return {
      actor: actorDeclarado ? 'candidato:' + actorDeclarado : 'candidato',
      cliente: cliente,
      modo: 'publico',
      esAdmin: false,
      avisos: []
    };
  }

  var modo = evAuthMode_();
  if (modo === 'abierto') {
    // Autorizado, pero el aviso viaja con la respuesta hasta la pantalla.
    return {
      actor: actorDeclarado || 'sin-identificar',
      cliente: cliente,
      modo: 'abierto',
      esAdmin: true,
      avisos: ['ADMIN_SIN_LLAVE']
    };
  }

  var enviada = String(request.adminKey === null || request.adminKey === undefined ? '' : request.adminKey);
  if (!enviada) {
    throw evError_(EV_CODE.FORBIDDEN,
      'Esta operación necesita la llave de administración y la solicitud no la incluye.',
      {
        hint: 'Ábrela en Evaluaciones → Conexión y pega la llave del script (propiedad EV_ADMIN_KEY). Se guarda en este navegador y no vuelve a pedirse.',
        details: { motivo: 'llave_ausente', modo: modo }
      });
  }
  var actual = String(evProp_(EV_PROP.ADMIN_KEY, ''));
  var siguiente = String(evProp_(EV_PROP.ADMIN_KEY_NEXT, ''));
  var avisos = [];
  var valida = evSecureEquals_(actual, enviada);
  if (!valida && siguiente.length >= 16 && evSecureEquals_(siguiente, enviada)) {
    valida = true;
    avisos.push('LLAVE_EN_ROTACION');
  }
  if (!valida) {
    throw evError_(EV_CODE.FORBIDDEN,
      'La llave de administración no coincide con la del script.',
      {
        hint: 'Copia de nuevo el valor de la propiedad EV_ADMIN_KEY (Proyecto → Configuración → Propiedades del script) en Evaluaciones → Conexión. Distingue mayúsculas y no admite espacios alrededor.',
        details: { motivo: 'llave_incorrecta', modo: modo, longitudRecibida: enviada.length }
      });
  }
  return {
    actor: actorDeclarado || 'administrador',
    cliente: cliente,
    modo: modo,
    esAdmin: true,
    avisos: avisos
  };
}

/* ---------------------------- Tokens de intento --------------------------- */

/**
 * Token de un intento: `v1.<hmac>`.
 *
 * Se firma sobre datos inmutables del intento (id, evaluación, versión e inicio),
 * de modo que un token no vale para otro intento y no puede fabricarse sin el
 * secreto del script. No es una cookie de sesión y no expira por sí solo: lo
 * limita el propio intento, que termina cuando se envía o cuando expira su
 * tiempo.
 */
function evAttemptToken_(attempt) {
  var secret = String(evProp_(EV_PROP.ATTEMPT_SECRET, ''));
  if (secret.length < 32) {
    throw evError_(EV_CODE.SCHEMA_ERROR,
      'El secreto de firma de intentos no está configurado.',
      {
        hint: 'Ejecuta Evaluaciones → Instalar o reparar: genera el secreto automáticamente.',
        details: { property: EV_PROP.ATTEMPT_SECRET }
      });
  }
  var message = ['v1', attempt.id, attempt.evaluacion_id, attempt.version_id, attempt.iniciado_en].join('|');
  return 'v1.' + evHmac_(secret, message);
}

/** Verifica el token de un intento. Lanza FORBIDDEN si no corresponde. */
function evRequireAttemptToken_(attempt, token) {
  var expected = evAttemptToken_(attempt);
  if (!evSecureEquals_(expected, String(token || ''))) {
    throw evError_(EV_CODE.FORBIDDEN,
      'La credencial de este intento no es válida.',
      {
        hint: 'Vuelve a abrir el enlace de la evaluación. Si el intento ya se envió, no puede modificarse.',
        details: { motivo: 'token_intento_invalido' }
      });
  }
}

/* ---------------------------- Límite de frecuencia ------------------------ */

/**
 * Límite por código y minuto para `startAttempt`.
 *
 * Usa `CacheService` porque es el único contador rápido que Apps Script ofrece.
 * Si el caché no está disponible, la operación NO se bloquea: un límite de
 * frecuencia caído no debe impedir que un candidato haga su prueba.
 */
function evRateLimit_(bucket, limitPerMinute) {
  try {
    var minute = Math.floor(evNowMs_() / 60000);
    var key = 'ev_rl_' + bucket + '_' + minute;
    var cache = CacheService.getScriptCache();
    var current = evInt_(cache.get(key), 0);
    if (current >= limitPerMinute) {
      throw evError_(EV_CODE.RATE_LIMITED,
        'Se alcanzó el límite de inicios de prueba por minuto para este enlace.',
        {
          hint: 'Espera un minuto y vuelve a intentarlo. Si esperas muchos candidatos a la vez, avísalos de que abran el enlace de forma escalonada.',
          details: { limite: limitPerMinute, ventanaSegundos: 60 }
        });
    }
    cache.put(key, String(current + 1), 120);
  } catch (error) {
    if (evIsError_(error)) throw error;
    // Caché no disponible: se continúa a propósito.
  }
}
