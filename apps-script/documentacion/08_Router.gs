/**
 * 08_Router.gs - la puerta de entrada del backend.
 *
 * -- Contrato de respuesta ---------------------------------------------------
 * TODA respuesta tiene la misma forma, salga bien o salga mal:
 *
 *   {
 *     ok, accion, solicitudId,
 *     datos,                      // solo si ok
 *     error: { codigo, mensaje, pista, detalle },  // solo si !ok
 *     avisos: [],
 *     meta: { traza, horaServidor, milisegundos, backend, esquema, instalado, contadores }
 *   }
 *
 * Una sola forma significa que el cliente tiene un solo camino de lectura. Y
 * `error.pista` es lo que permite al frontend ofrecer el boton correcto en lugar
 * de un mensaje rojo sin salida.
 *
 * -- Idempotencia ------------------------------------------------------------
 * Cada escritura viaja con un `solicitudId`. Si llega dos veces -reintento por
 * red lenta, doble clic, reenvio de la cola sin conexion- la segunda no vuelve a
 * ejecutarse: se devuelve el resultado guardado de la primera. Sin esto, una
 * conexion inestable duplica expedientes.
 *
 * -- Por que text/plain ------------------------------------------------------
 * El frontend envia el cuerpo como `text/plain`. No es descuido: con
 * `application/json` el navegador dispara una peticion OPTIONS previa que Apps
 * Script no responde, y la llamada falla por CORS. Con `text/plain` no hay
 * preflight. Y toda peticion debe seguir la redireccion (`redirect: "follow"`),
 * porque Apps Script responde con un 302 hacia googleusercontent.
 */

/* ------------------------------ Puntos de entrada ------------------------- */

function doGet(e) {
  return docDispatch_(docReadParams_(e), 'GET');
}

function doPost(e) {
  return docDispatch_(docReadParams_(e), 'POST');
}

/** Extrae el cuerpo, venga como JSON, como formulario o como parametros. */
function docReadParams_(e) {
  var params = {};
  if (!e) return params;

  if (e.parameter) {
    for (var k in e.parameter) {
      if (Object.prototype.hasOwnProperty.call(e.parameter, k)) params[k] = e.parameter[k];
    }
  }

  if (e.postData && e.postData.contents) {
    var cuerpo = docParseJson_(e.postData.contents, null);
    if (cuerpo && typeof cuerpo === 'object') {
      for (var c in cuerpo) {
        if (Object.prototype.hasOwnProperty.call(cuerpo, c)) params[c] = cuerpo[c];
      }
    } else {
      params.__crudo = String(e.postData.contents).slice(0, 2000);
    }
  }

  return params;
}

/** Correo de quien ejecuta, cuando Google lo expone. */
function docActor_(params) {
  var declarado = params && params.actor ? docRaw_(params.actor, 240) : '';
  try {
    var correo = Session.getEffectiveUser().getEmail();
    if (correo) return declarado ? (correo + ' (' + declarado + ')') : correo;
  } catch (e) { /* la web app anonima no expone el correo */ }
  return declarado || 'anonimo';
}

/* --------------------------------- Respuesta ------------------------------ */

function docJsonOut_(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

function docOk_(accion, solicitudId, datos, avisos) {
  return {
    ok: true,
    accion: accion,
    solicitudId: solicitudId || '',
    datos: datos === undefined ? null : datos,
    avisos: avisos || [],
    meta: docMeta_()
  };
}

function docFail_(accion, solicitudId, error, avisos) {
  var info = docClassify_(error);
  return {
    ok: false,
    accion: accion,
    solicitudId: solicitudId || '',
    error: {
      codigo: info.docCode,
      mensaje: info.message,
      pista: info.docHint,
      detalle: info.docDetails
    },
    avisos: avisos || [],
    meta: docMeta_()
  };
}

function docMeta_() {
  var instalado = false;
  try { instalado = docIsInstalled_(); } catch (e) { instalado = false; }
  return {
    traza: docTraceId_(),
    horaServidor: docNow_(),
    milisegundos: docElapsedMs_(),
    backend: DOC_BACKEND.version,
    esquema: DOC_BACKEND.schemaVersion,
    instalado: instalado,
    contadores: docCounters_()
  };
}

/* ------------------------------- Idempotencia ----------------------------- */

/** Resultado ya calculado para una solicitud repetida, o `null`. */
function docReplay_(solicitudId) {
  if (!solicitudId) return null;
  try {
    var enCache = docCacheGet_('doc_req_' + solicitudId);
    if (enCache) return docParseJson_(enCache, null);
    var fila = docById_(DOC_SHEET.SOLICITUDES, solicitudId);
    if (fila) return docParseJson_(fila.resultado_json, null);
  } catch (e) { /* sin registro previo */ }
  return null;
}

/** Deja constancia del resultado para poder repetirlo sin re-ejecutar. */
function docRemember_(solicitudId, accion, referencia, actor, resultado) {
  if (!solicitudId) return;
  try {
    var json = docWriteJson_(resultado);
    docCachePut_('doc_req_' + solicitudId, json, 3600);
    docPut_(DOC_SHEET.SOLICITUDES, {
      solicitud_id: solicitudId,
      accion: accion,
      referencia: docRaw_(referencia || '', 200),
      actor: docText_(actor || '', 240),
      procesado_en: docNow_(),
      resultado_json: json.length > 40000 ? '{"recortado":true}' : json
    });
  } catch (e) { /* la idempotencia es una ayuda, no un requisito */ }
}

/* ---------------------------------- Bloqueo ------------------------------- */

/**
 * Ejecuta una escritura en exclusiva.
 *
 * Dos guardados simultaneos sobre la misma hoja se pisan y dejan filas a medias.
 * Si el libro esta ocupado se devuelve un error especifico con la instruccion de
 * reintentar con el MISMO identificador de solicitud, que gracias a la
 * idempotencia no duplica nada.
 */
function docWithLock_(fn) {
  var lock = LockService.getScriptLock();
  var obtenido = false;
  try {
    obtenido = lock.tryLock(DOC_LIMITS.LOCK_MS);
  } catch (e) {
    obtenido = false;
  }
  if (!obtenido) {
    throw docError_(DOC_CODE.BUSY,
      'El libro esta atendiendo otra escritura.',
      { hint: DOC_CODE_HINT.LIBRO_OCUPADO });
  }
  try {
    return fn();
  } finally {
    try { lock.releaseLock(); } catch (e) { /* ya liberado */ }
  }
}

/* --------------------------------- Despacho ------------------------------- */

/** Acciones que escriben. Necesitan bloqueo, confirmacion e idempotencia. */
var DOC_ACCIONES_ESCRITURA = {
  'instalar': true, 'reparar': true, 'crear-anio': true,
  'expediente.guardar': true, 'expediente.borrar': true, 'expedientes.importar': true,
  'aviso.registrar': true, 'configuracion.guardar': true, 'catalogo.guardar': true,
  'mantenimiento.autoreparar': true, 'mantenimiento.respaldar': true,
  'mantenimiento.restaurar': true, 'mantenimiento.deduplicar': true,
  'mantenimiento.recalcular': true, 'mantenimiento.recolorear': true,
  'mantenimiento.compactar': true, 'entrega.registrar': true
};

function docDispatch_(params, metodo) {
  var accion = String((params && params.accion) || (params && params.action) || 'estado');
  var solicitudId = docRaw_((params && (params.solicitudId || params.requestId)) || '', 200);

  docLogReset_(accion);
  docStoreReset_();
  docYearsReset_();

  var avisos = [];
  var actor = docActor_(params);

  try {
    var repetida = docReplay_(solicitudId);
    if (repetida) {
      docCount_('solicitudesRepetidas');
      return docJsonOut_(docOk_(accion, solicitudId, repetida, ['Solicitud ya procesada: se devuelve el resultado original.']));
    }

    var escribe = DOC_ACCIONES_ESCRITURA[accion] === true;
    var resultado;

    if (escribe) {
      resultado = docWithLock_(function () {
        var r = docExecute_(accion, params, actor, metodo, avisos);
        docCommit_();
        docYearsCommit_();
        docFlushLog_();
        docCommit_();
        return r;
      });
      docRemember_(solicitudId, accion, resultado && resultado.identificador, actor, resultado);
      docCommit_();
    } else {
      resultado = docExecute_(accion, params, actor, metodo, avisos);
      docCommit_();
      docYearsCommit_();
      docFlushLog_();
      docCommit_();
    }

    return docJsonOut_(docOk_(accion, solicitudId, resultado, avisos));
  } catch (error) {
    docRollback_();
    var info = docClassify_(error);
    try {
      docAudit_({
        accion: DOC_ACCION.ERROR,
        entidad: 'sistema',
        referencia: accion,
        actor: actor,
        resultado: 'error',
        campo: info.docCode,
        nuevo: info.message,
        detalle: { detalle: info.docDetails, traza: docTraceId_() }
      });
      docCommit_();
    } catch (e) { /* si ni la auditoria del error se puede escribir, se responde igual */ }
    return docJsonOut_(docFail_(accion, solicitudId, error, avisos));
  }
}

/**
 * Encaminamiento de cada accion.
 *
 * Las de lectura exigen que el libro este instalado; las de instalacion y
 * diagnostico no, porque son precisamente las que se usan cuando no lo esta.
 */
function docExecute_(accion, params, actor, metodo, avisos) {
  switch (accion) {

    /* --- Estado y diagnostico (funcionan sin instalar) --- */
    case 'estado':
    case 'ping':
      return docHealthCheck_();

    case 'diagnostico':
      return docDiagnose_();

    case 'verificar':
      return docVerifySchema_();

    /* --- Instalacion --- */
    case 'instalar':
    case 'reparar': {
      var anios = params.anios ? docParseAnios_(params.anios) : [];
      var r = docInstallSchema_(actor, anios);
      docAudit_({
        accion: accion === 'instalar' ? DOC_ACCION.INSTALACION : DOC_ACCION.REPARACION,
        entidad: 'sistema', actor: actor, origen: params.origen || 'web',
        detalle: { acciones: r.acciones }
      });
      return r;
    }

    case 'crear-anio': {
      var anio = docInt_(params.anio, new Date().getFullYear());
      var creada = docEnsureYearSheet_(anio);
      docAudit_({
        accion: DOC_ACCION.INSTALACION, entidad: 'sistema',
        referencia: creada.hoja, actor: actor, origen: params.origen || 'web',
        nuevo: creada.accion
      });
      return creada;
    }

    /* --- Expedientes --- */
    case 'expedientes.listar':
      docRequireInstalled_();
      return docListDossiers_({
        anio: params.anio ? docInt_(params.anio, 0) : 0,
        todos: params.todos === true || params.todos === 'true',
        detalle: params.detalle === true || params.detalle === 'true',
        texto: params.texto || '',
        estado: params.estado || ''
      });

    case 'expediente.obtener':
      docRequireInstalled_();
      return docGetDossier_(params.identificador || params.id, params.anio, actor, params.origen || 'web');

    case 'expediente.guardar':
      docRequireInstalled_();
      return docUpsertDossier_(params.expediente || params.dossier, actor, params.origen || 'web');

    case 'expediente.borrar':
      docRequireInstalled_();
      return docDeleteDossier_(params.identificador || params.id, params.anio, actor, params.origen || 'web');

    case 'expedientes.importar': {
      docRequireInstalled_();
      var lote = params.expedientes || params.dossiers || [];
      if (!lote.length) {
        throw docError_(DOC_CODE.BAD_REQUEST, 'No llego ningun expediente que importar.',
          { hint: 'Envia el campo expedientes con un arreglo.' });
      }
      if (params.respaldar !== false) {
        try {
          var previo = docBackup_('previo a importar', actor);
          avisos.push('Se guardo el respaldo ' + previo.id + ' antes de importar.');
        } catch (e) {
          avisos.push('No se pudo guardar el respaldo previo: ' + docClassify_(e).message);
        }
      }
      return docBulkUpsert_(lote, actor, params.origen || 'importacion');
    }

    case 'expedientes.exportar': {
      docRequireInstalled_();
      var listado = docListDossiers_({
        anio: params.anio ? docInt_(params.anio, 0) : 0,
        todos: params.todos !== false,
        detalle: true
      });
      docAudit_({
        accion: DOC_ACCION.EXPORTACION, entidad: 'lote', actor: actor,
        origen: params.origen || 'web', detalle: { expedientes: listado.total }
      });
      return {
        version: DOC_BACKEND.snapshotVersion,
        generado: docNow_(),
        origen: 'sheets',
        total: listado.total,
        anios: listado.anios,
        expedientes: listado.expedientes
      };
    }

    /* --- Avisos --- */
    case 'aviso.registrar':
      docRequireInstalled_();
      return docLogEmail_(params.identificador || params.id, params.evento || params.event, actor, params.origen || 'web');

    /* --- Configuracion y catalogo --- */
    case 'configuracion.obtener':
      docRequireInstalled_();
      return { configuracion: docConfigAll_(), catalogo: docAll_(DOC_SHEET.CATALOGO) };

    case 'configuracion.guardar': {
      docRequireInstalled_();
      var cambios = params.configuracion || params.settings || {};
      var guardadas = 0;
      for (var clave in cambios) {
        if (!Object.prototype.hasOwnProperty.call(cambios, clave)) continue;
        docConfigSet_(clave, cambios[clave]);
        guardadas++;
      }
      docAudit_({
        accion: DOC_ACCION.CONFIGURACION, entidad: 'sistema', actor: actor,
        origen: params.origen || 'web', nuevo: guardadas + ' clave(s) actualizada(s)',
        detalle: cambios
      });
      return { guardadas: guardadas, configuracion: docConfigAll_() };
    }

    case 'catalogo.guardar': {
      docRequireInstalled_();
      var documentos = params.catalogo || [];
      var escritos = 0;
      for (var i = 0; i < documentos.length; i++) {
        var d = documentos[i] || {};
        if (!d.id) continue;
        docPut_(DOC_SHEET.CATALOGO, {
          id: String(d.id),
          etiqueta: docText_(d.etiqueta || d.label || '', 400),
          grupo: docEnum_(d.grupo || d.group, ['personal', 'garantia', 'cumplimiento'], 'personal'),
          orden: docInt_(d.orden, (i + 1) * 10),
          columna_libro: docRaw_(d.columna_libro || d.columna || '', 120),
          permite_prorroga: docBoolOrNull_(d.permite_prorroga) === true,
          obligatorio: docBoolOrNull_(d.obligatorio) !== false,
          activo: docBoolOrNull_(d.activo) !== false
        });
        escritos++;
      }
      docAudit_({
        accion: DOC_ACCION.CONFIGURACION, entidad: 'catalogo', actor: actor,
        origen: params.origen || 'web', nuevo: escritos + ' documento(s)'
      });
      return { guardados: escritos, catalogo: docAll_(DOC_SHEET.CATALOGO) };
    }

    /* --- Auditoria --- */
    case 'auditoria.consultar':
      docRequireInstalled_();
      return docAuditQuery_({
        limite: params.limite, expediente: params.identificador || params.expediente,
        accion: params.filtroAccion, actor: params.filtroActor, anio: params.anio,
        desde: params.desde, hasta: params.hasta, texto: params.texto
      });

    case 'auditoria.metricas':
      docRequireInstalled_();
      return docAuditMetrics_(params.dias);

    /* --- Mantenimiento --- */
    case 'mantenimiento.autoreparar':
      return docAutoRepair_(actor, params.origen || 'web');

    case 'mantenimiento.respaldar':
      docRequireInstalled_();
      return docBackup_(params.motivo || 'manual', actor);

    case 'mantenimiento.respaldos':
      docRequireInstalled_();
      return { respaldos: docListBackups_() };

    case 'mantenimiento.restaurar':
      docRequireInstalled_();
      return docRestore_(params.respaldoId || params.id, actor, params.origen || 'web');

    case 'mantenimiento.deduplicar':
      docRequireInstalled_();
      return docDedupe_(params.anio, params.aplicar === true || params.aplicar === 'true', actor, params.origen || 'web');

    case 'mantenimiento.recalcular':
      docRequireInstalled_();
      return docRecalc_(params.anio, actor);

    case 'mantenimiento.recolorear':
      docRequireInstalled_();
      return docRecolor_(params.anio, actor);

    case 'mantenimiento.compactar':
      docRequireInstalled_();
      return docCompact_(actor);

    /* --- Entregas (pestana ENTREGA COM+SEGUROS) --- */
    case 'entregas.listar':
      docRequireInstalled_();
      return { entregas: docAll_(DOC_SHEET.ENTREGAS) };

    case 'entrega.registrar': {
      docRequireInstalled_();
      var e = params.entrega || {};
      var numero = docText_(e.numero || e.n_com || '', 40);
      if (!numero) {
        throw docError_(DOC_CODE.VALIDATION_ERROR, 'La entrega necesita un numero de comunicacion.',
          { details: { campo: 'numero' } });
      }
      docPut_(DOC_SHEET.ENTREGAS, {
        'N\u00b0 Com': numero,
        'Nombre': docText_(e.nombre || '', 600),
        'FECHA DE INGRESO': docDateOnly_(e.fechaIngreso),
        'DIRIGIDO A': docText_(e.dirigidoA || '', 200),
        'RESPONSABLE': docText_(e.responsable || '', 300),
        'EXPEDIENTE': docRaw_(e.identificador || '', 200),
        'REGISTRADO EN': docNow_()
      });
      docAudit_({
        accion: DOC_ACCION.EDICION, entidad: 'entrega', referencia: numero,
        expediente: e.identificador || '', actor: actor, origen: params.origen || 'web',
        nuevo: numero + ' | ' + (e.dirigidoA || '')
      });
      return { numero: numero };
    }

    default:
      throw docError_(DOC_CODE.UNSUPPORTED_ACTION,
        'La accion "' + accion + '" no existe en este backend.',
        {
          hint: 'Acciones disponibles: ' + docActionList_().join(', ') + '.',
          details: { accion: accion, metodo: metodo }
        });
  }
}

/** Lista de acciones, para el mensaje de error y la documentacion. */
function docActionList_() {
  return [
    'estado', 'diagnostico', 'verificar', 'instalar', 'reparar', 'crear-anio',
    'expedientes.listar', 'expediente.obtener', 'expediente.guardar', 'expediente.borrar',
    'expedientes.importar', 'expedientes.exportar', 'aviso.registrar',
    'configuracion.obtener', 'configuracion.guardar', 'catalogo.guardar',
    'auditoria.consultar', 'auditoria.metricas',
    'mantenimiento.autoreparar', 'mantenimiento.respaldar', 'mantenimiento.respaldos',
    'mantenimiento.restaurar', 'mantenimiento.deduplicar', 'mantenimiento.recalcular',
    'mantenimiento.recolorear', 'mantenimiento.compactar',
    'entregas.listar', 'entrega.registrar'
  ];
}

/** Convierte "2024,2025" o [2024, 2025] en un arreglo de numeros. */
function docParseAnios_(valor) {
  var lista = [];
  if (Object.prototype.toString.call(valor) === '[object Array]') {
    lista = valor;
  } else if (typeof valor === 'string') {
    lista = valor.split(',');
  }
  var out = [];
  for (var i = 0; i < lista.length; i++) {
    var n = docInt_(lista[i], 0);
    if (n >= 2000 && n <= 2999) out.push(n);
  }
  return out;
}
