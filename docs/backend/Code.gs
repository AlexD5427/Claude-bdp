/****************************************************************************
 * BDP · Sistema de Selección y Reclutamiento
 * Backend de KPIs para Google Apps Script (pestaña "Dashboard y KPIs")
 * ---------------------------------------------------------------------------
 * Este archivo es ADITIVO. Mantiene el contrato actual del Web App
 *   GET  -> { candidatos:[...], competencias:[...] }
 * y agrega:
 *   GET  -> ahora también devuelve { kpis:{...}, estados:[...] }
 *   POST { type:"hiring_status", ... }  -> upsert de estado de contratación
 *   POST { type:"kpi_snapshot",  ... }  -> registro mensual de KPIs
 *   POST { ...candidato }               -> alta de postulante (comportamiento previo)
 *
 * Además instala un disparador (trigger) diario que, en el ÚLTIMO día del mes,
 * congela los KPIs calculados del mes en curso (snapshot de cierre de mes).
 *
 * >>> ADAPTAR <<< Ajuste los nombres de hoja/columna marcados con "ADAPTAR"
 * a su libro real de postulantes.
 ****************************************************************************/

var CONFIG = {
  HOJA_POSTULANTES: 'Postulantes',     // ADAPTAR: hoja con los candidatos
  HOJA_KPIS: 'Dashboard y KPIs',       // se crea automáticamente si no existe
  HOJA_ESTADOS: 'Estados de Contratación',
  TZ: 'America/La_Paz',
};

/* Mapa key -> { modulo, etiqueta, unidad }. Define a qué "sección" (módulo)
 * pertenece cada KPI y cómo etiquetarlo en la hoja. */
var KPI_MAP = {
  // Dashboard (panel ejecutivo)
  calidad_contratacion: { modulo: 'dashboard', etiqueta: 'Calidad de Contratación', unidad: '%' },
  tiempo_contratacion:  { modulo: 'dashboard', etiqueta: 'Tiempo de Contratación', unidad: 'días' },
  costo_contratacion:   { modulo: 'dashboard', etiqueta: 'Costo por Contratación', unidad: 'Bs' },
  tasa_rotacion:        { modulo: 'dashboard', etiqueta: 'Tasa de Rotación', unidad: '%' },
  contratados:          { modulo: 'dashboard', etiqueta: 'Contratados', unidad: '' },
  en_proceso:           { modulo: 'dashboard', etiqueta: 'En proceso', unidad: '' },
  bajas:                { modulo: 'dashboard', etiqueta: 'Bajas', unidad: '' },
  // Lista de Postulantes
  num_candidatos:          { modulo: 'postulantes', etiqueta: 'Número de Candidatos', unidad: '' },
  procesos_activos:        { modulo: 'postulantes', etiqueta: 'Procesos Activos', unidad: '' },
  prom_competencias:       { modulo: 'postulantes', etiqueta: 'Promedio Competencias', unidad: '%' },
  competencias_catalogadas:{ modulo: 'postulantes', etiqueta: 'Competencias Catalogadas', unidad: '' },
  // Comparador
  postulantes_con_comp:  { modulo: 'comparador', etiqueta: 'Perfiles con Competencias', unidad: '' },
  ajuste_promedio:       { modulo: 'comparador', etiqueta: 'Ajuste Promedio', unidad: '%' },
  brecha_promedio:       { modulo: 'comparador', etiqueta: 'Brecha Promedio', unidad: '' },
  competencias_evaluadas:{ modulo: 'comparador', etiqueta: 'Competencias Evaluadas', unidad: '' },
  // Cara a Cara
  nota_cap_prom:         { modulo: 'cara_a_cara', etiqueta: 'Nota CAP Promedio', unidad: '%' },
  nota_curriculum_prom:  { modulo: 'cara_a_cara', etiqueta: 'Currículum Promedio', unidad: '%' },
  nota_conocimiento_prom:{ modulo: 'cara_a_cara', etiqueta: 'Conocimientos Promedio', unidad: '%' },
  // Procesos
  prom_postulantes_proceso:{ modulo: 'procesos', etiqueta: 'Postulantes / Proceso', unidad: '' },
  proceso_mas_grande:      { modulo: 'procesos', etiqueta: 'Proceso Más Grande', unidad: '' },
  sin_proceso:             { modulo: 'procesos', etiqueta: 'Sin Proceso', unidad: '' },
  // Tablero
  pct_confiables:        { modulo: 'tablero', etiqueta: '% Confiables', unidad: '%' },
  pct_integridad_alta:   { modulo: 'tablero', etiqueta: '% Integridad Alta', unidad: '%' },
  pct_riesgo_robo_alto:  { modulo: 'tablero', etiqueta: '% Riesgo Robo Alto', unidad: '%' },
};

/* ===================== ENDPOINTS ===================== */

function doGet() {
  var out = {
    candidatos: leerPostulantes_(),       // >>> use su lectura existente
    competencias: leerCompetencias_(),    // >>> use su lectura existente
    kpis: leerKpis_(),
    estados: leerEstados_(),
  };
  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { body = {}; }

  var resp;
  if (body.type === 'kpi_snapshot') {
    escribirSnapshot_(body.month, body.values || {});
    resp = { ok: true, type: 'kpi_snapshot' };
  } else if (body.type === 'hiring_status') {
    upsertEstado_(body);
    resp = { ok: true, type: 'hiring_status' };
  } else {
    appendPostulante_(body);   // comportamiento previo: alta de postulante
    resp = { ok: true, type: 'candidato' };
  }
  return ContentService
    .createTextOutput(JSON.stringify(resp))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ===================== HOJA "Dashboard y KPIs" ===================== */
/* Formato LARGO (tidy) — una fila por (periodo, kpi). Escala indefinidamente
 * y permite filtrar por módulo/periodo/kpi con facilidad. */

function hojaKpis_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.HOJA_KPIS);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.HOJA_KPIS);
    sh.appendRow(['periodo', 'anio', 'mes', 'modulo', 'kpi', 'etiqueta', 'valor', 'unidad', 'registrado_en']);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Upsert: reemplaza las filas del periodo dado y vuelve a escribirlas. */
function escribirSnapshot_(periodo, values) {
  if (!periodo) periodo = Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM');
  var sh = hojaKpis_();
  var data = sh.getDataRange().getValues();
  // Borra filas existentes del periodo (de abajo hacia arriba).
  for (var r = data.length - 1; r >= 1; r--) {
    if (String(data[r][0]) === String(periodo)) sh.deleteRow(r + 1);
  }
  var anio = periodo.split('-')[0];
  var mes = periodo.split('-')[1];
  var now = new Date();
  var filas = [];
  Object.keys(values).forEach(function (key) {
    var meta = KPI_MAP[key] || { modulo: 'otros', etiqueta: key, unidad: '' };
    var val = values[key];
    filas.push([periodo, anio, mes, meta.modulo, key, meta.etiqueta,
                (val === null || val === undefined ? '' : val), meta.unidad, now]);
  });
  if (filas.length) {
    sh.getRange(sh.getLastRow() + 1, 1, filas.length, 9).setValues(filas);
  }
}

/** Devuelve los KPIs agrupados por periodo y módulo para el frontend. */
function leerKpis_() {
  var sh = hojaKpis_();
  var data = sh.getDataRange().getValues();
  var out = {};
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var periodo = String(row[0]);
    if (!periodo) continue;
    if (!out[periodo]) out[periodo] = {};
    out[periodo][row[4]] = (row[6] === '' ? null : Number(row[6]));
  }
  return out;
}

/* ===================== HOJA "Estados de Contratación" ===================== */

function hojaEstados_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.HOJA_ESTADOS);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.HOJA_ESTADOS);
    sh.appendRow(['identificador', 'status', 'firstSeenAt', 'contratadoAt', 'bajaAt', 'updatedAt']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function upsertEstado_(rec) {
  var sh = hojaEstados_();
  var data = sh.getDataRange().getValues();
  var now = new Date();
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][0]) === String(rec.identificador)) {
      sh.getRange(r + 1, 2, 1, 5).setValues([[
        rec.status || data[r][1],
        rec.firstSeenAt || data[r][2],
        rec.contratadoAt || data[r][3],
        rec.bajaAt || data[r][4],
        now,
      ]]);
      return;
    }
  }
  sh.appendRow([rec.identificador, rec.status, rec.firstSeenAt || '', rec.contratadoAt || '', rec.bajaAt || '', now]);
}

function leerEstados_() {
  var sh = hojaEstados_();
  var data = sh.getDataRange().getValues();
  var out = [];
  for (var r = 1; r < data.length; r++) {
    out.push({
      identificador: data[r][0], status: data[r][1], firstSeenAt: data[r][2],
      contratadoAt: data[r][3], bajaAt: data[r][4], updatedAt: data[r][5],
    });
  }
  return out;
}

/* ===================== CÁLCULO SERVER-SIDE DE KPIs ===================== */
/* Calcula los KPIs computables a partir de las hojas (no depende de que haya
 * un navegador abierto). Los KPIs N/A (calidad, costo) quedan vacíos. */

function computeKpis_() {
  var cands = leerPostulantes_();
  var estados = leerEstados_();
  var v = {};

  // — Conteos / promedios básicos —
  v.num_candidatos = cands.length;
  v.prom_competencias = promedio_(cands.map(function (c) { return num_(c.nota_competencias); }));
  v.nota_cap_prom = promedio_(cands.map(function (c) { return num_(c.nota_cap); }));
  v.nota_curriculum_prom = promedio_(cands.map(function (c) { return num_(c.nota_curriculum); }));
  v.nota_conocimiento_prom = promedio_(cands.map(function (c) { return num_(c.nota_conocimiento); }));

  // — Procesos (segmento medio del identificador CI-Proceso-Año) —
  var procMap = {};
  cands.forEach(function (c) {
    var p = proceso_(c.identificador);
    if (p !== 'Sin proceso') procMap[p] = (procMap[p] || 0) + 1;
  });
  var procKeys = Object.keys(procMap);
  v.procesos_activos = procKeys.length;
  v.proceso_mas_grande = procKeys.reduce(function (m, k) { return Math.max(m, procMap[k]); }, 0) || null;
  v.prom_postulantes_proceso = procKeys.length ? Math.round(cands.length / procKeys.length) : null;
  v.sin_proceso = cands.filter(function (c) { return proceso_(c.identificador) === 'Sin proceso'; }).length;

  // — Confiabilidad / riesgo —
  var total = cands.length || 1;
  v.pct_confiables = Math.round(cands.filter(function (c) {
    var s = String(c.nivel_general_confiabilidad || '').toLowerCase();
    return s.indexOf('confiable') >= 0 && s.indexOf('no confiable') < 0;
  }).length / total * 100);
  v.pct_riesgo_robo_alto = Math.round(cands.filter(function (c) { return c.riesgo_robo === 'Alto'; }).length / total * 100);
  v.pct_integridad_alta = Math.round(cands.filter(function (c) { return c.nivel_integridad === 'Alto'; }).length / total * 100);

  // — Hiring (de la hoja de estados) —
  var contratados = estados.filter(function (e) { return e.status === 'contratado' || e.status === 'baja'; });
  v.contratados = estados.filter(function (e) { return e.status === 'contratado'; }).length;
  v.bajas = estados.filter(function (e) { return e.status === 'baja'; }).length;
  v.en_proceso = estados.filter(function (e) { return e.status === 'en_proceso'; }).length;
  var dias = [];
  contratados.forEach(function (e) {
    if (e.firstSeenAt && e.contratadoAt) {
      var d = (new Date(e.contratadoAt) - new Date(e.firstSeenAt)) / 86400000;
      if (d >= 0) dias.push(d);
    }
  });
  v.tiempo_contratacion = promedio_(dias);
  var early = contratados.filter(function (e) {
    return e.status === 'baja' && e.bajaAt && e.contratadoAt &&
      ((new Date(e.bajaAt) - new Date(e.contratadoAt)) / 86400000) <= 92;
  }).length;
  v.tasa_rotacion = contratados.length ? Math.round(early / contratados.length * 100) : null;

  // — N/A (sin conectar) —
  v.calidad_contratacion = null;
  v.costo_contratacion = null;

  return v;
}

/* ===================== SNAPSHOT MENSUAL (CRON) ===================== */

function snapshotMensual() {
  var periodo = Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM');
  escribirSnapshot_(periodo, computeKpis_());
}

/** Se ejecuta a diario; sólo congela el cierre el ÚLTIMO día del mes. */
function dailyCheck() {
  var hoy = new Date();
  var manana = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1);
  if (manana.getMonth() !== hoy.getMonth()) {  // mañana es otro mes => hoy es fin de mes
    snapshotMensual();
  }
}

/** Ejecute UNA VEZ para instalar el disparador diario (23:00-24:00). */
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyCheck') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyCheck').timeBased().atHour(23).everyDays(1)
    .inTimezone(CONFIG.TZ).create();
}

/* ===================== HELPERS ===================== */

function num_(x) { var n = parseFloat(String(x).replace(',', '.')); return isFinite(n) ? n : null; }
function promedio_(arr) {
  var xs = arr.filter(function (n) { return n !== null && n !== undefined && isFinite(n); });
  if (!xs.length) return null;
  return Math.round(xs.reduce(function (a, b) { return a + b; }, 0) / xs.length);
}
function proceso_(id) {
  var s = String(id || '').split('-');
  return (s.length >= 2 && s[1].trim()) ? s[1].trim() : 'Sin proceso';
}

/* >>> ADAPTAR: reemplace estas dos funciones por su lectura real de datos.
 * Deben devolver arreglos de objetos con las mismas claves que ya usa su
 * doGet actual. */
function leerPostulantes_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.HOJA_POSTULANTES);
  if (!sh) return [];
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  return data.slice(1).map(function (row) {
    var o = {};
    headers.forEach(function (h, i) { o[String(h).trim()] = row[i]; });
    return o;
  });
}
function leerCompetencias_() {
  // Devuelva aquí su catálogo de competencias como hoy lo hace.
  return [];
}
function appendPostulante_(obj) {
  // Conserve aquí su lógica actual de alta de postulante.
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.HOJA_POSTULANTES);
  if (!sh) return;
  var headers = sh.getDataRange().getValues()[0];
  sh.appendRow(headers.map(function (h) { return obj[String(h).trim()] || ''; }));
}
