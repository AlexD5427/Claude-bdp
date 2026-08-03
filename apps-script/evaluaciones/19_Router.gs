/**
 * 19_Router.gs — el único camino de entrada.
 *
 * Toda petición recorre exactamente los mismos pasos, en el mismo orden:
 *
 *   1. abrir traza  ─ un identificador que aparece en la respuesta y en el diario;
 *   2. autorizar    ─ 06_Security.gs decide;
 *   3. si es escritura: tomar el bloqueo y comprobar idempotencia;
 *   4. ejecutar     ─ el servicio correspondiente;
 *   5. confirmar    ─ un solo volcado de todas las escrituras;
 *   6. auditar, medir y volcar el diario;
 *   7. responder    ─ siempre con el mismo envoltorio.
 *
 * Que el camino sea único es lo que permite garantizar propiedades globales: no
 * hay ninguna escritura sin bloqueo, ninguna acción sin auditoría y ninguna
 * respuesta sin traza. En el backend anterior, dos caminos distintos (GET y POST)
 * aplicaban reglas ligeramente distintas.
 *
 * ── El envoltorio ────────────────────────────────────────────────────────────
 *   {
 *     ok, accion, solicitudId, datos, error, avisos,
 *     meta: { traza, horaServidor, milisegundos, backend, esquema, modoAuth,
 *             instalado, contadores }
 *   }
 *
 * `meta` viaja SIEMPRE, incluso en los errores: es lo que permite que la pantalla
 * de conexión diga «responde, versión 2.0.0, modo llave, instalado» sin una
 * llamada aparte.
 */

/** Acciones de solo lectura: no toman bloqueo ni consumen `requestId`. */
var EV_READ_ACTIONS = {
  ping: true,
  diagnose: true,
  listEvaluations: true,
  getEvaluation: true,
  listAttempts: true,
  getAttempt: true,
  exportAttempt: true,
  listLogs: true,
  getMetrics: true,
  openAssessment: true,
  heartbeat: true
};

/** Acciones de escritura y el servicio que las atiende. */
var EV_WRITE_ACTIONS = {
  install: function (context) { return evInstallAction_(context); },
  repair: function (context) { return evInstallAction_(context); },
  createEvaluation: function (context, payload) { return evCreateEvaluation_(context, payload); },
  saveEvaluation: function (context, payload) { return evSaveEvaluation_(context, payload); },
  duplicateEvaluation: function (context, payload) { return evDuplicateEvaluation_(context, payload); },
  publishEvaluation: function (context, payload) { return evPublishEvaluation_(context, payload); },
  transitionEvaluation: function (context, payload) { return evTransitionEvaluation_(context, payload); },
  relaunchEvaluation: function (context, payload) { return evRelaunchEvaluation_(context, payload); },
  rollbackEvaluation: function (context, payload) { return evRollbackEvaluation_(context, payload); },
  deleteEvaluation: function (context, payload) { return evDeleteEvaluation_(context, payload); },
  purgeEvaluation: function (context, payload) { return evPurgeEvaluation_(context, payload); },
  gradeAnswer: function (context, payload) { return evGradeAnswer_Manual_(context, payload); },
  annulAttempt: function (context, payload) { return evAnnulAttempt_(context, payload); },
  pruneLogs: function (context, payload) { return evPruneLogsAction_(context, payload); },
  startAttempt: function (context, payload) { return evStartAttempt_(context, payload); },
  saveProgress: function (context, payload) { return evSaveProgress_(context, payload); },
  submitAttempt: function (context, payload) { return evSubmitAttempt_(context, payload); }
};

/* -------------------------------- Envoltorio ------------------------------ */

function evMeta_(auth, extra) {
  var meta = {
    traza: evTraceId_(),
    horaServidor: evNow_(),
    milisegundos: evElapsedMs_(),
    backend: EV_BACKEND.version,
    esquema: EV_BACKEND.schemaVersion,
    textoEnriquecido: EV_BACKEND.richTextVersion,
    modoAuth: auth ? auth.modo : evAuthMode_(),
    contadores: evCounters_()
  };
  if (extra) {
    for (var key in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, key)) meta[key] = extra[key];
    }
  }
  return meta;
}

function evOk_(accion, requestId, datos, avisos, auth, metaExtra) {
  return {
    ok: true,
    accion: String(accion || ''),
    solicitudId: String(requestId || ''),
    datos: datos === undefined ? null : datos,
    error: null,
    avisos: avisos || [],
    meta: evMeta_(auth, metaExtra)
  };
}

function evFail_(accion, requestId, error, avisos, auth, metaExtra) {
  var classified = evClassify_(error);
  return {
    ok: false,
    accion: String(accion || ''),
    solicitudId: String(requestId || ''),
    datos: null,
    error: {
      codigo: classified.evCode,
      mensaje: classified.message,
      pista: classified.evHint || '',
      detalle: classified.evDetails || {},
      traza: evTraceId_()
    },
    avisos: avisos || [],
    meta: evMeta_(auth, metaExtra)
  };
}

/* ------------------------------ Bloqueo de escritura ---------------------- */

/**
 * Ejecuta una escritura con bloqueo e idempotencia.
 *
 * El bloqueo es del SCRIPT (no del documento) porque protege también las
 * secuencias de lectura-modificación-escritura, no solo la escritura final. La
 * comprobación de idempotencia va DENTRO del bloqueo: si no, dos peticiones con
 * el mismo `requestId` podrían colarse a la vez.
 */
function evWithLock_(context, accion, handler, payload) {
  var lock = LockService.getScriptLock();
  var tomado = false;
  // La instalación es el único caso que corre ANTES de que exista el registro de
  // idempotencia, así que no puede consultarlo. No importa: instalar es
  // idempotente por construcción (compara el libro con el esquema y añade lo que
  // falte), y necesita permiso para crear hojas.
  var bootstrap = accion === 'install' || accion === 'repair';
  try {
    tomado = lock.tryLock(EV_LIMITS.LOCK_MS);
    if (!tomado) {
      throw evError_(EV_CODE.BUSY,
        'El libro está atendiendo otra escritura y no se liberó en ' +
        Math.round(EV_LIMITS.LOCK_MS / 1000) + ' segundos.',
        {
          hint: 'Vuelve a intentarlo. La operación lleva identificador propio, así que reintentarla no la duplica.',
          details: { esperaMs: EV_LIMITS.LOCK_MS }
        });
    }
    if (bootstrap) {
      EV_STORE.allowCreate = true;
      var creacion = handler(context, payload) || {};
      return { data: creacion.data, avisos: creacion.avisos || [] };
    }
    var procesada = evFindProcessed_(context.requestId);
    if (procesada) {
      evInfo_('Solicitud repetida; se devuelve el resultado original.', {
        solicitud: context.requestId, accion: procesada.accion
      });
      return {
        data: {
          repetida: true,
          referencia: procesada.referencia,
          procesadoEn: procesada.procesado_en,
          resumen: evParseJson_(procesada.resultado_json, {}) || {}
        },
        avisos: ['SOLICITUD_REPETIDA']
      };
    }
    var outcome = handler(context, payload) || {};
    evRecordProcessed_(context.requestId, accion, outcome.referencia, context.actor, outcome.resumen);
    return { data: outcome.data, avisos: outcome.avisos || [] };
  } finally {
    if (tomado) {
      try { lock.releaseLock(); } catch (e) { /* el bloqueo ya expiró */ }
    }
  }
}

/* --------------------------------- Despacho ------------------------------- */

/** Despacha las lecturas. */
function evRunRead_(accion, payload, auth) {
  switch (accion) {
    case 'ping': return evPing_();
    case 'diagnose': return evDiagnose_(payload);
    case 'listEvaluations': return evListEvaluations_(payload);
    case 'getEvaluation': return evGetEvaluation_(payload);
    case 'listAttempts': return evListAttempts_(payload);
    case 'getAttempt': return evGetAttempt_(payload);
    case 'exportAttempt': return evExportAttempt_(payload);
    case 'listLogs': return evListLogs_(payload);
    case 'getMetrics': return evGetMetrics_(payload);
    case 'openAssessment': return evOpenAssessment_(payload);
    case 'heartbeat': return evHeartbeat_(payload);
    default:
      throw evError_(EV_CODE.UNSUPPORTED_ACTION, '', { details: { accion: accion, modo: auth.modo } });
  }
}

/**
 * Punto de entrada lógico. Lo usan `doGet`, `doPost`, el menú del libro y las
 * pruebas: hay UNA implementación, así que lo que se prueba es lo que se ejecuta.
 */
function evHandle_(request) {
  evStoreReset_();
  var accion = String((request && request.accion) || (request && request.action) || '');
  var requestId = evRaw_((request && request.solicitudId) || (request && request.requestId) || '', 140);
  var payload = (request && request.payload && typeof request.payload === 'object') ? request.payload : {};
  evLogReset_(accion);

  if (!accion) {
    return evFail_('', requestId,
      evError_(EV_CODE.BAD_REQUEST, 'La solicitud no indica ninguna acción.', {
        hint: 'Envía `{ accion: "ping" }` para comprobar la conexión.',
        details: { campo: 'accion' }
      }), [], null, { instalado: false });
  }

  var auth;
  try {
    auth = evAuthorize_({
      action: accion,
      adminKey: (request && request.llaveAdmin) !== undefined ? request.llaveAdmin : (request && request.adminKey),
      clientId: (request && request.cliente) || (request && request.clientId),
      actor: (request && request.actor) || payload.actor
    });
  } catch (error) {
    var classified = evClassify_(error);
    evWarn_('Solicitud rechazada por autorización.', { accion: accion, codigo: classified.evCode });
    evFlushLog_();
    try { evCommit_(); } catch (e) { /* el diario es accesorio */ }
    return evFail_(accion, requestId, classified, [], null, { instalado: evIsInstalled_() });
  }

  var context = {
    accion: accion,
    requestId: requestId,
    actor: auth.actor,
    cliente: auth.cliente,
    now: evNow_(),
    esAdmin: auth.esAdmin
  };

  try {
    var avisos = auth.avisos.slice();
    var datos;

    if (EV_READ_ACTIONS[accion]) {
      datos = evRunRead_(accion, payload, auth);
    } else {
      var handler = EV_WRITE_ACTIONS[accion];
      if (!handler) {
        throw evError_(EV_CODE.UNSUPPORTED_ACTION, '', {
          details: { accion: accion, lecturas: Object.keys(EV_READ_ACTIONS), escrituras: Object.keys(EV_WRITE_ACTIONS) }
        });
      }
      if (!requestId) {
        throw evError_(EV_CODE.BAD_REQUEST,
          'Toda escritura debe llevar un identificador de solicitud.',
          {
            hint: 'Genera un `solicitudId` único por intención del usuario y reutilízalo si reintentas: así la operación no se duplica.',
            details: { campo: 'solicitudId', accion: accion }
          });
      }
      var outcome = evWithLock_(context, accion, handler, payload);
      datos = outcome.data;
      avisos = avisos.concat(outcome.avisos);
    }

    evMetric_(accion, 'ok');
    evFlushLog_();
    evCommit_();
    return evOk_(accion, requestId, datos, avisos, auth, { instalado: true });
  } catch (error) {
    var failure = evClassify_(error);
    // Se descartan las escrituras a medias: o la operación completa o nada.
    evRollback_();
    evLogReset_(accion);
    evErrorLog_(failure.message, {
      codigo: failure.evCode, accion: accion, detalle: failure.evDetails
    }, failure.evStack || '');
    try {
      evAuditFailure_(context, accion, 'solicitud', payload.id || payload.intentoId || '',
        failure.evCode, failure.message);
      evMetric_(accion, 'error');
      evFlushLog_();
      evCommit_();
    } catch (secondary) {
      // Si ni el diario se puede escribir, el problema es el libro entero. El
      // mensaje que ya se compuso sigue siendo válido y se devuelve tal cual.
      try { console.error('[evaluaciones] fallo al registrar el error: ' + (secondary && secondary.message)); }
      catch (e) { /* nada más que hacer */ }
    }
    return evFail_(accion, requestId, failure, auth.avisos, auth, { instalado: evIsInstalled_() });
  }
}

/* ---------------------------------- ping ---------------------------------- */

/**
 * Latido del backend.
 *
 * Es la primera llamada que hace el ATS y la que responde a «¿está bien esto?».
 * Devuelve identidad, estado de instalación, modo de autorización y un conteo
 * rápido, sin leer nada pesado. Si el libro no está instalado NO falla: informa,
 * porque «no instalado» es un estado legítimo del primer arranque y quien lo ve
 * necesita el botón de instalar, no un error.
 */
function evPing_() {
  var instalado = evIsInstalled_();
  var respuesta = {
    servicio: EV_BACKEND.name,
    version: EV_BACKEND.version,
    esquema: EV_BACKEND.schemaVersion,
    snapshot: EV_BACKEND.snapshotVersion,
    textoEnriquecido: EV_BACKEND.richTextVersion,
    instalado: instalado,
    horaServidor: evNow_(),
    autorizacion: evAuthDiagnostics_(),
    tiposSoportados: evTypeIds_().length
  };
  try {
    var ss = evSpreadsheet_();
    respuesta.libro = {
      nombre: ss.getName ? ss.getName() : '',
      id: ss.getId ? ss.getId() : ''
    };
  } catch (error) {
    respuesta.libro = null;
    respuesta.problemaLibro = evClassify_(error).message;
  }
  if (instalado) {
    respuesta.conteos = {
      evaluaciones: evCountRows_(EV_SHEET.EVALUACIONES),
      intentos: evCountRows_(EV_SHEET.INTENTOS),
      versiones: evCountRows_(EV_SHEET.VERSIONES)
    };
  }
  return respuesta;
}

/* -------------------------- Instalación como acción ----------------------- */

function evInstallAction_(context) {
  var resultado = evInstallSchema_(context.actor);
  evAudit_(context, 'install', 'libro', '', 'ok', { acciones: resultado.actions.length });
  return {
    data: {
      acciones: resultado.actions,
      informe: resultado.report,
      autorizacion: evAuthDiagnostics_()
    },
    referencia: 'install',
    resumen: { acciones: resultado.actions.length }
  };
}
