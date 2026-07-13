/****************************************************************************
 * BDP · Sistema de Reclutamiento y Selección — Web App (Apps Script)
 * ============================================================================
 * SCRIPT ÚNICO Y AUTORITATIVO. Reemplaza por completo el script anterior del
 * libro (pegue TODO este archivo en el editor de Apps Script y vuelva a
 * implementar: "Implementar → Administrar implementaciones → Editar → Nueva
 * versión", manteniendo "Cualquiera con el enlace").
 *
 * Novedades de esta versión:
 *   • Lee la hoja de postulantes por NOMBRE ("Registro_Postulantes"), con
 *     respaldo a la primera pestaña — ya no depende de que se llame "Hoja 1".
 *   • Devuelve, además de candidatos/competencias/arquetipos_disc, los nuevos
 *     catálogos de la hoja "Auxiliar":
 *        cargos_bdp, gerencias_bdp, agencias_bdp,
 *        modalidad_reclutamiento, estado_proceso.
 *   • Sistema de PERFILES (hoja "Perfiles_y_Configuracion"): login, guardado de
 *     configuración por perfil y bitácora de actividad (log_actividad_perfil).
 *   • Enlaza las hojas "Espejo_Base" y "Espejo_Ultimo_Registro" (procesos).
 *   • RENDIMIENTO: cachea el GET completo en CacheService por tramos (chunks),
 *     así las cargas repetidas (varios usuarios/dispositivos) son casi
 *     instantáneas en lugar de tardar >10 s. La caché se invalida en cada
 *     escritura para no servir datos viejos.
 *   • Mantiene el módulo Documentación (expedientes + recordatorios por correo).
 *
 * Contrato GET (retrocompatible + ampliado):
 *   {
 *     candidatos:[...], competencias:[...], arquetipos_disc:[...],
 *     auxiliares:{ cargos_bdp, gerencias_bdp, agencias_bdp,
 *                  modalidad_reclutamiento, estado_proceso },
 *     perfiles:[ { nombre_perfil, cargo_perfil, datos_perfil,
 *                  config_personal_perfil, tiene_password } ],
 *     espejo_base:[...], espejo_ultimo:[...],
 *     sincronizado_en: "ISO"
 *   }
 *
 * Parámetros GET opcionales:
 *   ?nocache=1          → ignora la caché y relee todo.
 *   ?part=ligero        → omite espejo_base/espejo_ultimo (carga más liviana).
 ****************************************************************************/

var CONFIG = {
  // Hoja de postulantes (renombrada). Se prueban en orden; si ninguna existe,
  // se usa la primera pestaña del libro.
  HOJAS_POSTULANTES: ['Registro_Postulantes', 'Hoja 1', 'Postulantes'],
  HOJA_AUXILIAR: 'Auxiliar',
  HOJA_PERFILES: 'Perfiles_y_Configuracion',
  HOJA_ESPEJO_BASE: 'Espejo_Base',
  HOJA_ESPEJO_ULTIMO: 'Espejo_Ultimo_Registro',
  HOJA_DOCS: 'Documentación',
  HOJA_AVISOS: 'Avisos Documentación',
  HOJA_REFERENCIAS: 'Referencias_Laborales',
  CACHE_KEY: 'bdp_payload_v3',
  CACHE_SEGUNDOS: 45,        // vida de la caché del GET completo
  MAX_LOG_ENTRADAS: 400,     // tope de entradas de bitácora por perfil
  INTERVALO_DIAS_DOC: 3,
  CC_AUXILIAR: '',
  REMITENTE_NOMBRE: 'Reclutamiento y Selección · BDP',
  ASUNTO_DOC: 'BDP · Documentación pendiente para su incorporación',
  TZ: 'America/La_Paz',
};

/* ============================== GET ============================== */

function doGet(e) {
  var params = (e && e.parameter) || {};
  var ligero = params.part === 'ligero';
  var noCache = params.nocache === '1' || params.nocache === 'true';

  // ProcessOS / AssessmentOS reads are routed to their dedicated handlers and
  // return a small JSON envelope ({ status, rows|row }) that the frontend
  // adapter normalizes. They never build the heavy talent payload.
  if (params.action) {
    var ta = handleTalentGet_(SpreadsheetApp.getActiveSpreadsheet(), params);
    if (ta) return ContentService.createTextOutput(JSON.stringify(ta))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (!noCache && !ligero) {
    var cached = leerCache_();
    if (cached) return ContentService.createTextOutput(cached)
      .setMimeType(ContentService.MimeType.JSON);
  }

  var payload = construirPayload_(ligero);
  var texto = JSON.stringify(payload);
  if (!ligero) guardarCache_(texto);

  return ContentService.createTextOutput(texto).setMimeType(ContentService.MimeType.JSON);
}

function construirPayload_(ligero) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var candidatos = leerPostulantes_(ss);
  var aux = leerAuxiliar_(ss);
  var perfiles = leerPerfilesPublico_(ss);

  var payload = {
    candidatos: candidatos,
    competencias: aux.competencias,
    arquetipos_disc: aux.arquetipos_disc,
    auxiliares: {
      cargos_bdp: aux.cargos_bdp,
      gerencias_bdp: aux.gerencias_bdp,
      agencias_bdp: aux.agencias_bdp,
      modalidad_reclutamiento: aux.modalidad_reclutamiento,
      estado_proceso: aux.estado_proceso,
    },
    perfiles: perfiles,
    sincronizado_en: new Date().toISOString(),
  };

  if (!ligero) {
    payload.espejo_base = leerHojaObjetos_(ss, CONFIG.HOJA_ESPEJO_BASE);
    payload.espejo_ultimo = leerHojaObjetos_(ss, CONFIG.HOJA_ESPEJO_ULTIMO);
  }
  return payload;
}

/* ============================== POST ============================= */

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = {};
  try { data = JSON.parse(e.postData.contents); } catch (err) { data = {}; }

  var resp;
  switch (data.type) {
    case 'proceso':              resp = handleProceso_(ss, data); break;
    case 'evaluacion':           resp = handleEvaluacion_(ss, data); break;
    case 'documentacion':        resp = handleDocumentacion_(ss, data); break;
    case 'documentacion_email':  resp = handleDocEmail_(ss, data); break;
    case 'referencia_laboral':   resp = handleReferencia_(ss, data); break;
    case 'perfil_login':         resp = handlePerfilLogin_(ss, data); break;
    case 'perfil_config':        resp = handlePerfilConfig_(ss, data); break;
    case 'perfil_log':           resp = handlePerfilLog_(ss, data); break;
    case 'hiring_status':
    case 'kpi_snapshot':
      resp = { status: 'ignored', type: data.type }; break;
    default:
      resp = handlePostulante_(ss, data); break;  // alta/edición/baja
  }

  // Only writes that change the data served by the GET should invalidate its
  // cache. Bitácora/login/config writes don't touch candidatos/perfiles/etc.,
  // so keeping the cache warm for them makes edits feel fast without serving
  // stale data after a real change. Procesos/Evaluaciones use their own sheets
  // (not the cached payload), so they don't invalidate it.
  var MUTATES = { documentacion: 1, referencia_laboral: 1 };
  var esMutacion = MUTATES[data.type] || data.type === undefined; // undefined = postulante CRUD
  if (esMutacion) invalidarCache_();

  return ContentService.createTextOutput(JSON.stringify(resp))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ===================== POSTULANTES (CRUD) ======================= */

function handlePostulante_(ss, data) {
  var sheet = hojaPostulantes_(ss);
  if (!sheet) return { status: 'error', message: 'No se encontró la hoja de postulantes' };

  if (data.action === 'delete') {
    var all = sheet.getDataRange().getValues();
    for (var i = all.length - 1; i >= 1; i--) {
      if (String(all[i][0]) == String(data.identificador)) {
        sheet.deleteRow(i + 1);
        return { status: 'success', message: 'Eliminado' };
      }
    }
    return { status: 'error', message: 'No encontrado' };
  }

  if (data.action === 'update') {
    var vals = sheet.getDataRange().getValues();
    var headers = vals[0];
    for (var r = 1; r < vals.length; r++) {
      if (String(vals[r][0]) == String(data.identificador)) {
        var row = r + 1;
        headers.forEach(function (h, idx) {
          if (data[h] !== undefined) sheet.getRange(row, idx + 1).setValue(data[h]);
        });
        return { status: 'success', message: 'Actualizado' };
      }
    }
    return { status: 'error', message: 'No encontrado' };
  }

  // Alta.
  var head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var newRow = head.map(function (h) { return data[h] !== undefined ? data[h] : ''; });
  sheet.appendRow(newRow);
  return { status: 'success', message: 'Agregado' };
}

/* ===================== LECTURA DE HOJAS ========================= */

function hojaPostulantes_(ss) {
  for (var i = 0; i < CONFIG.HOJAS_POSTULANTES.length; i++) {
    var sh = ss.getSheetByName(CONFIG.HOJAS_POSTULANTES[i]);
    if (sh) return sh;
  }
  return ss.getSheets()[0]; // respaldo: primera pestaña
}

function leerPostulantes_(ss) {
  var sh = hojaPostulantes_(ss);
  if (!sh) return [];
  return leerFilasComoObjetos_(sh);
}

/** Devuelve las filas de una hoja como objetos { encabezado: valor }. */
function leerFilasComoObjetos_(sh) {
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    // Saltar filas totalmente vacías.
    var vacia = row.every(function (v) { return v === '' || v === null; });
    if (vacia) continue;
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      if (headers[c]) obj[headers[c]] = row[c];
    }
    out.push(obj);
  }
  return out;
}

function leerHojaObjetos_(ss, nombre) {
  var sh = ss.getSheetByName(nombre);
  if (!sh) return [];
  return leerFilasComoObjetos_(sh);
}

/* ===================== HOJA "Auxiliar" ========================= */
/* Lee la hoja una sola vez y extrae cada catálogo por su encabezado. */

function leerAuxiliar_(ss) {
  var vacio = {
    competencias: [], arquetipos_disc: [], cargos_bdp: [], gerencias_bdp: [],
    agencias_bdp: [], modalidad_reclutamiento: [], estado_proceso: [],
  };
  var sh = ss.getSheetByName(CONFIG.HOJA_AUXILIAR);
  if (!sh) return vacio;
  var data = sh.getDataRange().getValues();
  if (data.length < 1) return vacio;

  var headers = data[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var col = function (nombre) {
    var idx = headers.indexOf(nombre);
    if (idx < 0) return [];
    var vals = [];
    for (var r = 1; r < data.length; r++) {
      var v = data[r][idx];
      if (v !== '' && v !== null && v !== undefined) vals.push(String(v).trim());
    }
    // Únicos, preservando orden.
    var seen = {}, uniq = [];
    vals.forEach(function (v) { if (v && !seen[v]) { seen[v] = 1; uniq.push(v); } });
    return uniq;
  };

  // "competencias": preferir encabezado nombrado; si no, la columna A (retrocompat).
  var competencias = col('competencias');
  if (!competencias.length) competencias = col('competencias_bdp');
  if (!competencias.length) {
    for (var r = 1; r < data.length; r++) {
      var v = data[r][0];
      if (v !== '' && v !== null) competencias.push(String(v).trim());
    }
  }

  return {
    competencias: competencias,
    arquetipos_disc: col('arquetipo_disc'),
    cargos_bdp: col('cargos_bdp'),
    gerencias_bdp: col('gerencias_bdp'),
    agencias_bdp: col('agencias_bdp'),
    modalidad_reclutamiento: col('modalidad_reclutamiento'),
    estado_proceso: col('estado_proceso'),
  };
}

/* ===================== PERFILES ================================= */
/* Hoja "Perfiles_y_Configuracion". Encabezados esperados:
 *   nombre_perfil | contraseña_perfil | cargo_perfil |
 *   config_personal_perfil | datos_perfil | log_actividad_perfil
 * (los acentos y mayúsculas son indiferentes; se normalizan). */

var PERFIL_COLS = {
  nombre: ['nombre_perfil', 'nombre'],
  password: ['contraseña_perfil', 'contrasena_perfil', 'password_perfil', 'clave_perfil'],
  cargo: ['cargo_perfil', 'cargo'],
  config: ['config_personal_perfil', 'config_perfil', 'configuracion_perfil'],
  datos: ['datos_perfil', 'datos'],
  log: ['log_actividad_perfil', 'log_perfil', 'bitacora_perfil'],
};

function hojaPerfiles_(ss) {
  var sh = ss.getSheetByName(CONFIG.HOJA_PERFILES);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.HOJA_PERFILES);
    sh.appendRow(['nombre_perfil', 'contraseña_perfil', 'cargo_perfil',
      'config_personal_perfil', 'datos_perfil', 'log_actividad_perfil']);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Mapa header-normalizado → índice de columna. */
function indicePerfiles_(headers) {
  var norm = headers.map(function (h) {
    return String(h).trim().toLowerCase().replace(/\s+/g, '_');
  });
  var find = function (aliases) {
    for (var i = 0; i < aliases.length; i++) {
      var idx = norm.indexOf(aliases[i]);
      if (idx >= 0) return idx;
    }
    return -1;
  };
  return {
    nombre: find(PERFIL_COLS.nombre),
    password: find(PERFIL_COLS.password),
    cargo: find(PERFIL_COLS.cargo),
    config: find(PERFIL_COLS.config),
    datos: find(PERFIL_COLS.datos),
    log: find(PERFIL_COLS.log),
  };
}

/** Perfiles para el GET público: SIN contraseñas (sólo un indicador). */
function leerPerfilesPublico_(ss) {
  var sh = ss.getSheetByName(CONFIG.HOJA_PERFILES);
  if (!sh) return [];
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  var idx = indicePerfiles_(data[0]);
  if (idx.nombre < 0) return [];
  var out = [];
  for (var r = 1; r < data.length; r++) {
    var nombre = String(data[r][idx.nombre] || '').trim();
    if (!nombre) continue;
    var pass = idx.password >= 0 ? String(data[r][idx.password] || '') : '';
    out.push({
      nombre_perfil: nombre,
      cargo_perfil: idx.cargo >= 0 ? String(data[r][idx.cargo] || '') : '',
      datos_perfil: idx.datos >= 0 ? String(data[r][idx.datos] || '') : '',
      config_personal_perfil: idx.config >= 0 ? String(data[r][idx.config] || '') : '',
      tiene_password: pass.trim() !== '',
    });
  }
  return out;
}

/** Valida credenciales y devuelve config + datos del perfil. */
function handlePerfilLogin_(ss, data) {
  var sh = ss.getSheetByName(CONFIG.HOJA_PERFILES);
  if (!sh) return { status: 'error', message: 'No hay hoja de perfiles' };
  var all = sh.getDataRange().getValues();
  var idx = indicePerfiles_(all[0]);
  for (var r = 1; r < all.length; r++) {
    var nombre = String(all[r][idx.nombre] || '').trim();
    if (nombre.toLowerCase() !== String(data.nombre || '').trim().toLowerCase()) continue;
    var pass = idx.password >= 0 ? String(all[r][idx.password] || '') : '';
    var ok = pass.trim() === '' || pass === String(data.contrasena || data['contraseña'] || '');
    if (!ok) return { status: 'error', message: 'Contraseña incorrecta' };
    return {
      status: 'success',
      perfil: {
        nombre_perfil: nombre,
        cargo_perfil: idx.cargo >= 0 ? String(all[r][idx.cargo] || '') : '',
        datos_perfil: idx.datos >= 0 ? String(all[r][idx.datos] || '') : '',
        config_personal_perfil: idx.config >= 0 ? String(all[r][idx.config] || '') : '',
      },
    };
  }
  return { status: 'error', message: 'Perfil no encontrado' };
}

/** Guarda la configuración personal (JSON) de un perfil. */
function handlePerfilConfig_(ss, data) {
  var sh = hojaPerfiles_(ss);
  var all = sh.getDataRange().getValues();
  var idx = indicePerfiles_(all[0]);
  if (idx.config < 0) return { status: 'error', message: 'Falta la columna config_personal_perfil' };
  for (var r = 1; r < all.length; r++) {
    if (String(all[r][idx.nombre] || '').trim().toLowerCase() ===
        String(data.nombre || '').trim().toLowerCase()) {
      var cfg = typeof data.config === 'string' ? data.config : JSON.stringify(data.config || {});
      sh.getRange(r + 1, idx.config + 1).setValue(cfg);
      return { status: 'success', message: 'Configuración guardada' };
    }
  }
  return { status: 'error', message: 'Perfil no encontrado' };
}

/**
 * Agrega una entrada a la bitácora del perfil. Guarda un arreglo JSON con las
 * últimas CONFIG.MAX_LOG_ENTRADAS acciones. Cada entrada:
 *   { fecha, hora, perfil, dispositivo, modulo, accion, detalle }
 */
function handlePerfilLog_(ss, data) {
  var sh = hojaPerfiles_(ss);
  var all = sh.getDataRange().getValues();
  var idx = indicePerfiles_(all[0]);
  if (idx.log < 0) return { status: 'error', message: 'Falta la columna log_actividad_perfil' };
  for (var r = 1; r < all.length; r++) {
    if (String(all[r][idx.nombre] || '').trim().toLowerCase() ===
        String(data.nombre || '').trim().toLowerCase()) {
      var actual = [];
      try { actual = JSON.parse(all[r][idx.log] || '[]'); } catch (err) { actual = []; }
      if (!Array.isArray(actual)) actual = [];
      var entrada = data.entrada || {};
      var ahora = new Date();
      actual.push({
        fecha: Utilities.formatDate(ahora, CONFIG.TZ, 'yyyy-MM-dd'),
        hora: Utilities.formatDate(ahora, CONFIG.TZ, 'HH:mm:ss'),
        perfil: String(data.nombre || ''),
        dispositivo: entrada.dispositivo || '',
        modulo: entrada.modulo || '',
        accion: entrada.accion || '',
        detalle: entrada.detalle || '',
      });
      // Conservar sólo las últimas N entradas.
      if (actual.length > CONFIG.MAX_LOG_ENTRADAS) {
        actual = actual.slice(actual.length - CONFIG.MAX_LOG_ENTRADAS);
      }
      sh.getRange(r + 1, idx.log + 1).setValue(JSON.stringify(actual));
      return { status: 'success', message: 'Actividad registrada' };
    }
  }
  return { status: 'error', message: 'Perfil no encontrado' };
}

/* ===================== CACHÉ (chunked) ========================= */
/* CacheService limita cada valor a ~100 KB, así que el payload se guarda en
 * varios tramos: <KEY>_meta con la cantidad y <KEY>_0.._n con los tramos. */

function leerCache_() {
  try {
    var cache = CacheService.getScriptCache();
    var meta = cache.get(CONFIG.CACHE_KEY + '_meta');
    if (!meta) return null;
    var n = parseInt(meta, 10);
    var keys = [];
    for (var i = 0; i < n; i++) keys.push(CONFIG.CACHE_KEY + '_' + i);
    var partes = cache.getAll(keys);
    var texto = '';
    for (var j = 0; j < n; j++) {
      var p = partes[CONFIG.CACHE_KEY + '_' + j];
      if (p === null || p === undefined) return null; // tramo expirado → reconstruir
      texto += p;
    }
    return texto;
  } catch (err) {
    return null;
  }
}

function guardarCache_(texto) {
  try {
    var cache = CacheService.getScriptCache();
    var CHUNK = 90000; // < 100 KB por clave
    var n = Math.ceil(texto.length / CHUNK) || 1;
    var obj = {};
    for (var i = 0; i < n; i++) {
      obj[CONFIG.CACHE_KEY + '_' + i] = texto.substring(i * CHUNK, (i + 1) * CHUNK);
    }
    obj[CONFIG.CACHE_KEY + '_meta'] = String(n);
    cache.putAll(obj, CONFIG.CACHE_SEGUNDOS);
  } catch (err) { /* silencioso */ }
}

function invalidarCache_() {
  try {
    var cache = CacheService.getScriptCache();
    var meta = cache.get(CONFIG.CACHE_KEY + '_meta');
    if (!meta) return;
    var n = parseInt(meta, 10);
    var keys = [CONFIG.CACHE_KEY + '_meta'];
    for (var i = 0; i < n; i++) keys.push(CONFIG.CACHE_KEY + '_' + i);
    cache.removeAll(keys);
  } catch (err) { /* silencioso */ }
}

/* ==================== MÓDULO DOCUMENTACIÓN ===================== */

var DOC_HEADERS = [
  'identificador', 'nombre', 'cargo', 'agencia', 'gerencia', 'correo',
  'fecha_ingreso', 'grupo', 'documento_id', 'documento', 'estado',
  'paginas', 'observacion', 'prorroga', 'actualizado_en',
];

function hojaDocs_(ss) {
  var sh = ss.getSheetByName(CONFIG.HOJA_DOCS);
  if (!sh) { sh = ss.insertSheet(CONFIG.HOJA_DOCS); sh.appendRow(DOC_HEADERS); sh.setFrozenRows(1); }
  return sh;
}

function handleDocumentacion_(ss, data) {
  var sh = hojaDocs_(ss);
  if (data.action === 'delete') {
    borrarFilasPorId_(sh, data.identificador);
    return { status: 'success', message: 'Expediente eliminado' };
  }
  var d = data.dossier || {};
  var id = d.identificador;
  if (!id) return { status: 'error', message: 'Falta identificador' };
  borrarFilasPorId_(sh, id);
  var now = new Date();
  var filas = (d.items || []).map(function (it) {
    return [id, d.nombre || '', d.cargo || '', d.agencia || '', d.gerencia || '',
      d.correo || '', d.fechaIngreso || '', it.group || '', it.id || '',
      it.label || '', it.status || '', it.pages || 0, it.observation || '',
      it.prorroga || '', now];
  });
  if (filas.length) sh.getRange(sh.getLastRow() + 1, 1, filas.length, DOC_HEADERS.length).setValues(filas);
  return { status: 'success', message: 'Expediente guardado', filas: filas.length };
}

function borrarFilasPorId_(sh, id) {
  var all = sh.getDataRange().getValues();
  for (var i = all.length - 1; i >= 1; i--) {
    if (String(all[i][0]) == String(id)) sh.deleteRow(i + 1);
  }
}

function hojaAvisos_(ss) {
  var sh = ss.getSheetByName(CONFIG.HOJA_AVISOS);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.HOJA_AVISOS);
    sh.appendRow(['fecha', 'identificador', 'para', 'cc', 'asunto', 'tipo', 'faltantes']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function handleDocEmail_(ss, data) {
  hojaAvisos_(ss).appendRow([new Date(), data.identificador || '', data.to || '',
    data.cc || '', data.subject || '', data.kind || 'manual', data.missingCount || 0]);
  return { status: 'success', message: 'Aviso registrado' };
}

/* ================ REFERENCIAS LABORALES (perfil) =============== */
/* Persiste el Panel de Referencias Laborales del perfil de postulante.
 * Cuerpo: { type:"referencia_laboral", action:"upsert"|"delete",
 *           identificador, referencia:{ id, ... } } */

var REF_HEADERS = [
  'identificador', 'ref_id', 'creado_en', 'autor', 'referencia_nombre',
  'referencia_cargo', 'empresa', 'relacion', 'contacto', 'calificacion',
  'recomienda', 'verificada', 'comentario', 'fortalezas', 'aspectos',
];

function hojaReferencias_(ss) {
  var sh = ss.getSheetByName(CONFIG.HOJA_REFERENCIAS);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.HOJA_REFERENCIAS);
    sh.appendRow(REF_HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function handleReferencia_(ss, data) {
  var sh = hojaReferencias_(ss);
  var ref = data.referencia || {};
  var id = data.identificador || '';
  if (data.action === 'delete') {
    var all = sh.getDataRange().getValues();
    for (var i = all.length - 1; i >= 1; i--) {
      if (String(all[i][1]) == String(ref.id)) sh.deleteRow(i + 1);
    }
    return { status: 'success', message: 'Referencia eliminada' };
  }
  if (!ref.id) return { status: 'error', message: 'Falta el id de la referencia' };
  var fila = [
    id, ref.id, ref.createdAt || new Date().toISOString(), ref.author || '',
    ref.refereeName || '', ref.refereeRole || '', ref.company || '',
    ref.relationship || '', ref.contact || '', ref.rating || 0,
    ref.recommends || '', ref.verified ? 'Sí' : 'No', ref.comment || '',
    (ref.strengths || []).join(' | '), (ref.concerns || []).join(' | '),
  ];
  // Upsert por ref_id.
  var vals = sh.getDataRange().getValues();
  for (var r = 1; r < vals.length; r++) {
    if (String(vals[r][1]) == String(ref.id)) {
      sh.getRange(r + 1, 1, 1, REF_HEADERS.length).setValues([fila]);
      return { status: 'success', message: 'Referencia actualizada' };
    }
  }
  sh.appendRow(fila);
  return { status: 'success', message: 'Referencia agregada' };
}


function enviarRecordatoriosDocumentacion() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.HOJA_DOCS);
  if (!sh) return;
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return;
  var idx = indexar_(data[0]);
  var personas = {};
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var id = row[idx.identificador];
    if (!id) continue;
    if (!personas[id]) personas[id] = {
      nombre: row[idx.nombre], cargo: row[idx.cargo], correo: row[idx.correo],
      fecha_ingreso: row[idx.fecha_ingreso], faltantes: [],
    };
    var estado = String(row[idx.estado] || '').toLowerCase();
    if (estado === 'pendiente' || estado === 'observado') personas[id].faltantes.push(row[idx.documento]);
  }
  var hoy = new Date();
  Object.keys(personas).forEach(function (id) {
    var p = personas[id];
    if (!p.correo || p.faltantes.length === 0 || !p.fecha_ingreso) return;
    var dias = Math.floor((hoy - new Date(p.fecha_ingreso)) / 86400000);
    if (dias <= 0 || dias % CONFIG.INTERVALO_DIAS_DOC !== 0) return;
    try {
      MailApp.sendEmail({
        to: p.correo, cc: CONFIG.CC_AUXILIAR, name: CONFIG.REMITENTE_NOMBRE,
        subject: CONFIG.ASUNTO_DOC, body: construirCuerpo_(p, dias),
      });
      hojaAvisos_(ss).appendRow([hoy, id, p.correo, CONFIG.CC_AUXILIAR,
        CONFIG.ASUNTO_DOC, 'auto', p.faltantes.length]);
    } catch (err) { /* reintenta en la próxima corrida */ }
  });
}

function construirCuerpo_(p, dias) {
  var lista = p.faltantes.map(function (d) { return '• ' + d; }).join('\n');
  return [
    'Estimado/a ' + (p.nombre || 'postulante') + ':', '',
    'Como parte de su proceso de incorporación al Banco de Desarrollo Productivo para el cargo de ' +
      (p.cargo || '(cargo por definir)') + ', le recordamos que aún tenemos pendiente la recepción de la siguiente documentación:',
    '', lista, '',
    'Han transcurrido ' + dias + ' día(s) desde su fecha de ingreso. Le agradeceremos presentar la documentación faltante a la brevedad posible.',
    '', 'Saludos cordiales,', CONFIG.REMITENTE_NOMBRE,
  ].join('\n');
}

/* ============================ TRIGGERS ========================= */

/** Ejecute UNA VEZ para instalar el disparador diario de recordatorios (08:00). */
function instalarTriggersDocumentacion() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'enviarRecordatoriosDocumentacion') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('enviarRecordatoriosDocumentacion')
    .timeBased().everyDays(1).atHour(8).inTimezone(CONFIG.TZ).create();
}

/* ============================ HELPERS ========================== */

function indexar_(headers) {
  var map = {};
  headers.forEach(function (h, i) { map[String(h).trim()] = i; });
  return map;
}

/* ============================================================================
 * PROCESSOS + ASSESSMENTOS  —  hojas "Procesos" y "Evaluaciones"
 * ----------------------------------------------------------------------------
 * Persistencia de los módulos Procesos (ProcessOS) y Evaluaciones (AssessmentOS)
 * del frontend. Ambos usan hojas propias (una fila por entidad; los datos
 * anidados se guardan como JSON validado en el frontend). El contrato coincide
 * con el adaptador `google-apps-script` del frontend:
 *
 *   GET  ?action=list_procesos            → { status, rows:[...] }
 *   GET  ?action=get_proceso&id=...        → { status, row:{...} }
 *   GET  ?action=list_evaluaciones         → { status, rows:[...] }
 *   GET  ?action=get_evaluacion&id=...     → { status, row:{...} }
 *
 *   POST { type:"proceso", action:"create",   row:{...} }
 *   POST { type:"proceso", action:"update",   row:{...}, expectedEntityVersion }
 *   POST { type:"proceso", action:"publish"|"pause"|"close"|"archive", id, by }
 *   POST { type:"proceso", action:"duplicate", id, by }
 *   (idéntico para type:"evaluacion")
 *
 * Detección de actualización obsoleta (stale update): en `update`, si la fila
 * del servidor tiene VersionEntidad > expectedEntityVersion, se responde
 * { status:"error", code:"conflict" } y el frontend muestra el conflicto en vez
 * de sobrescribir. Las versiones publicadas de una evaluación viven dentro de
 * VersionesPublicadasJson y NUNCA se sobrescriben (el frontend crea versiones).
 * ==========================================================================*/

var TA_CONFIG = {
  HOJA_PROCESOS: 'Procesos',
  HOJA_EVALUACIONES: 'Evaluaciones',
};

var PROCESO_HEADERS = [
  'ID', 'ReferenciaExterna', 'Codigo', 'Nombre', 'Slug', 'Descripcion', 'Area',
  'Departamento', 'UnidadNegocio', 'Ubicacion', 'Modalidad', 'TipoContrato',
  'NivelExperiencia', 'Vacantes', 'ReclutadoresJson', 'ResponsablesJson',
  'GerentesJson', 'PropietarioId', 'Estado', 'EstadoPublicacion', 'Visibilidad',
  'FechaApertura', 'FechaCierre', 'EvaluacionesJson', 'FormularioJson',
  'ContenidoPublicoJson', 'ConfiguracionJson', 'VersionEsquema', 'VersionEntidad',
  'CreadoPor', 'FechaCreacion', 'ActualizadoPor', 'FechaActualizacion',
  'EstadoSincronizacion',
];

var EVALUACION_HEADERS = [
  'ID', 'ReferenciaExterna', 'Codigo', 'Nombre', 'Categoria', 'Proposito',
  'Version', 'VersionMayor', 'VersionMenor', 'Estado', 'EstadoPublicacion',
  'ProcesosJson', 'DuracionEstimada', 'PoliticaIntentosJson', 'PoliticaTiempoJson',
  'PoliticaNavegacionJson', 'PoliticaPuntuacionJson', 'PoliticaMonitoreoJson',
  'PoliticaConsentimientoJson', 'SeccionesJson', 'ReglasJson', 'TemaJson',
  'ConfiguracionJson', 'VersionesPublicadasJson', 'VersionPublicadaActual',
  'VersionEsquema', 'VersionEntidad', 'CreadoPor', 'FechaCreacion',
  'ActualizadoPor', 'FechaActualizacion', 'FechaPublicacion', 'EstadoSincronizacion',
];

/** Crea (si falta) y devuelve una hoja con sus encabezados congelados. */
function taHoja_(ss, nombre, headers) {
  var sh = ss.getSheetByName(nombre);
  if (!sh) {
    sh = ss.insertSheet(nombre);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Lee una hoja de entidad como arreglo de objetos { encabezado: valor }. */
function taLeerFilas_(sh) {
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var r = 1; r < data.length; r++) {
    var vacia = data[r].every(function (v) { return v === '' || v === null; });
    if (vacia) continue;
    var obj = {};
    for (var c = 0; c < headers.length; c++) if (headers[c]) obj[headers[c]] = data[r][c];
    out.push(obj);
  }
  return out;
}

/** Enruta las lecturas GET de ProcessOS/AssessmentOS. Devuelve null si no aplica. */
function handleTalentGet_(ss, params) {
  switch (params.action) {
    case 'list_procesos':
      return { status: 'success', rows: taLeerFilas_(taHoja_(ss, TA_CONFIG.HOJA_PROCESOS, PROCESO_HEADERS)) };
    case 'get_proceso':
      return { status: 'success', row: taBuscarFila_(ss, TA_CONFIG.HOJA_PROCESOS, PROCESO_HEADERS, params.id) };
    case 'list_evaluaciones':
      return { status: 'success', rows: taLeerFilas_(taHoja_(ss, TA_CONFIG.HOJA_EVALUACIONES, EVALUACION_HEADERS)) };
    case 'get_evaluacion':
      return { status: 'success', row: taBuscarFila_(ss, TA_CONFIG.HOJA_EVALUACIONES, EVALUACION_HEADERS, params.id) };
    default:
      return null;
  }
}

function taBuscarFila_(ss, nombre, headers, id) {
  var sh = taHoja_(ss, nombre, headers);
  var filas = taLeerFilas_(sh);
  for (var i = 0; i < filas.length; i++) if (String(filas[i].ID) === String(id)) return filas[i];
  return null;
}

/** Escribe (append o update) una fila-objeto en la hoja, alineada a headers. */
function taEscribirFila_(sh, headers, obj) {
  var values = sh.getDataRange().getValues();
  var arr = headers.map(function (h) { return obj[h] !== undefined && obj[h] !== null ? obj[h] : ''; });
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][0]) === String(obj.ID)) {
      sh.getRange(r + 1, 1, 1, headers.length).setValues([arr]);
      return;
    }
  }
  sh.appendRow(arr);
}

/** Handler de escritura para Procesos. */
function handleProceso_(ss, data) {
  return taHandleEntity_(ss, TA_CONFIG.HOJA_PROCESOS, PROCESO_HEADERS, data, {
    prefix: 'PRC',
    estadoBorrador: 'draft',
    publicacionNoPublicado: 'unpublished',
    transiciones: {
      publish: { Estado: 'published', EstadoPublicacion: 'published' },
      pause: { Estado: 'paused', EstadoPublicacion: 'paused' },
      close: { Estado: 'closed', EstadoPublicacion: 'closed' },
      archive: { Estado: 'archived', EstadoPublicacion: 'archived' },
    },
  });
}

/** Handler de escritura para Evaluaciones. */
function handleEvaluacion_(ss, data) {
  return taHandleEntity_(ss, TA_CONFIG.HOJA_EVALUACIONES, EVALUACION_HEADERS, data, {
    prefix: 'EVL',
    estadoBorrador: 'draft',
    publicacionNoPublicado: 'unpublished',
    transiciones: {
      publish: { Estado: 'published', EstadoPublicacion: 'published' },
      pause: { Estado: 'paused', EstadoPublicacion: 'paused' },
      close: { Estado: 'closed', EstadoPublicacion: 'closed' },
      archive: { Estado: 'archived', EstadoPublicacion: 'archived' },
    },
  });
}

/** Lógica compartida create/update/transición/duplicate con control de versión. */
function taHandleEntity_(ss, nombre, headers, data, opts) {
  var sh = taHoja_(ss, nombre, headers);
  var action = data.action || 'create';

  if (action === 'create') {
    var row = data.row || {};
    if (!row.ID) return { status: 'error', message: 'Falta ID' };
    row.FechaActualizacion = new Date().toISOString();
    row.EstadoSincronizacion = 'synced';
    taEscribirFila_(sh, headers, row);
    return { status: 'success', row: row };
  }

  if (action === 'update') {
    var incoming = data.row || {};
    var actual = taBuscarFila_(ss, nombre, headers, incoming.ID);
    // Detección de actualización obsoleta.
    if (actual && data.expectedEntityVersion !== undefined &&
        Number(actual.VersionEntidad) > Number(data.expectedEntityVersion)) {
      return { status: 'error', code: 'conflict', message: 'Otro usuario actualizó este registro.' };
    }
    incoming.VersionEntidad = Number(incoming.VersionEntidad || 1) + 1;
    incoming.FechaActualizacion = new Date().toISOString();
    incoming.EstadoSincronizacion = 'synced';
    taEscribirFila_(sh, headers, incoming);
    return { status: 'success', row: incoming };
  }

  if (action === 'duplicate') {
    var src = taBuscarFila_(ss, nombre, headers, data.id);
    if (!src) return { status: 'error', message: 'No encontrado' };
    var copia = {};
    headers.forEach(function (h) { copia[h] = src[h]; });
    copia.ID = opts.prefix.toLowerCase() + '_' + Utilities.getUuid();
    copia.Codigo = opts.prefix + '-' + String(src.Codigo || '').slice(0, 10) + '-COPIA';
    copia.Nombre = String(src.Nombre || '') + ' (copia)';
    copia.Estado = opts.estadoBorrador;
    copia.EstadoPublicacion = opts.publicacionNoPublicado;
    copia.VersionEntidad = 1;
    // Una copia no arrastra versiones publicadas.
    if (headers.indexOf('VersionesPublicadasJson') >= 0) copia.VersionesPublicadasJson = '[]';
    if (headers.indexOf('VersionPublicadaActual') >= 0) copia.VersionPublicadaActual = '';
    copia.FechaCreacion = new Date().toISOString();
    copia.FechaActualizacion = copia.FechaCreacion;
    copia.ActualizadoPor = data.by || '';
    copia.EstadoSincronizacion = 'synced';
    taEscribirFila_(sh, headers, copia);
    return { status: 'success', row: copia };
  }

  // Transiciones de ciclo de vida (publish/pause/close/archive) + rollback.
  var patch = opts.transiciones[action];
  if (patch || action === 'rollback' || action === 'publish') {
    var fila = taBuscarFila_(ss, nombre, headers, data.id);
    if (!fila) return { status: 'error', message: 'No encontrado' };
    if (patch) { Object.keys(patch).forEach(function (k) { fila[k] = patch[k]; }); }
    if (action === 'publish' && headers.indexOf('FechaPublicacion') >= 0) {
      fila.FechaPublicacion = new Date().toISOString();
    }
    fila.VersionEntidad = Number(fila.VersionEntidad || 1) + 1;
    fila.ActualizadoPor = data.by || '';
    fila.FechaActualizacion = new Date().toISOString();
    fila.EstadoSincronizacion = 'synced';
    taEscribirFila_(sh, headers, fila);
    return { status: 'success', row: fila };
  }

  return { status: 'error', message: 'Acción no reconocida: ' + action };
}
