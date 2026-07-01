/****************************************************************************
 * BDP · Web App (doGet / doPost) — versión ampliada
 * ---------------------------------------------------------------------------
 * Reemplazo directo del script actual del libro. Es RETROCOMPATIBLE con lo que
 * ya usa el frontend y AGREGA lo necesario para las nuevas funciones:
 *
 *   GET  ->  { candidatos:[...], competencias:[...], arquetipos_disc:[...] }
 *            · candidatos      : primera pestaña (igual que hoy)
 *            · competencias    : hoja "Auxiliar", columna A (igual que hoy)
 *            · arquetipos_disc : hoja "Auxiliar", columna cuyo encabezado
 *                                (fila 1) sea exactamente "arquetipo_disc".
 *                                Cada celda: "Nombre (Código), Descripción…".
 *
 *   POST (postulantes — comportamiento actual):
 *            · { ...candidato }               -> alta
 *            · { action:"update", ... }       -> edición
 *            · { action:"delete", identificador } -> baja
 *
 *   POST (módulo Documentación — nuevo):
 *            · { type:"documentacion", action:"upsert", dossier:{...} }
 *            · { type:"documentacion", action:"delete", identificador }
 *            · { type:"documentacion_email", identificador, to, cc, subject, kind, missingCount }
 *
 * Además incluye el envío AUTOMÁTICO de recordatorios por correo cada N días
 * (por defecto 3) desde la fecha de ingreso, con la lista de documentos
 * faltantes y copia (CC) al auxiliar a cargo. Instale el disparador una vez con
 * `instalarTriggersDocumentacion()`.
 ****************************************************************************/

var CONFIG_DOC = {
  HOJA_DOCS: 'Documentación',            // se crea si no existe
  HOJA_AVISOS: 'Avisos Documentación',   // bitácora de correos
  INTERVALO_DIAS: 3,                     // cadencia de recordatorios
  CC_AUXILIAR: '',                       // >>> correo del auxiliar en copia
  REMITENTE_NOMBRE: 'Reclutamiento y Selección · BDP',
  ASUNTO: 'BDP · Documentación pendiente para su incorporación',
  TZ: 'America/La_Paz',
};

/* ============================== GET ============================== */

function doGet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1) Postulantes — primera pestaña.
  var sheetCandidatos = ss.getSheets()[0];
  var dataC = sheetCandidatos.getDataRange().getValues();
  var headersC = dataC[0];
  var candidatos = dataC.slice(1).map(function (row) {
    var obj = {};
    headersC.forEach(function (h, i) { obj[h] = row[i]; });
    return obj;
  });

  // 2) Hoja "Auxiliar" — competencias (col A) + arquetipos DISC (col "arquetipo_disc").
  var competencias = [];
  var arquetipos_disc = [];
  var aux = ss.getSheetByName('Auxiliar');
  if (aux) {
    var dataAux = aux.getDataRange().getValues();
    if (dataAux.length > 1) {
      competencias = dataAux.slice(1)
        .map(function (r) { return r[0]; })
        .filter(function (v) { return v !== '' && v !== null; });

      var headAux = dataAux[0].map(function (h) { return String(h).trim().toLowerCase(); });
      var idx = headAux.indexOf('arquetipo_disc');
      if (idx >= 0) {
        arquetipos_disc = dataAux.slice(1)
          .map(function (r) { return r[idx]; })
          .filter(function (v) { return String(v).trim() !== ''; });
      }
    }
  }

  return json_({ candidatos: candidatos, competencias: competencias, arquetipos_disc: arquetipos_disc });
}

/* ============================== POST ============================= */

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = {};
  try { data = JSON.parse(e.postData.contents); } catch (err) { data = {}; }

  // --- Módulo Documentación ---
  if (data.type === 'documentacion') return handleDocumentacion_(ss, data);
  if (data.type === 'documentacion_email') return handleDocEmail_(ss, data);

  // (Opcional) otros tipos que el frontend envía como "best-effort".
  if (data.type === 'hiring_status' || data.type === 'kpi_snapshot') {
    return json_({ status: 'ignored', type: data.type });
  }

  // --- Postulantes (comportamiento actual) ---
  var sheet = ss.getSheets()[0];

  if (data.action === 'delete') {
    var allData = sheet.getDataRange().getValues();
    for (var i = allData.length - 1; i >= 1; i--) {
      if (allData[i][0] == data.identificador) {
        sheet.deleteRow(i + 1);
        return json_({ status: 'success', message: 'Eliminado' });
      }
    }
    return json_({ status: 'error', message: 'No encontrado' });
  }

  if (data.action === 'update') {
    var all = sheet.getDataRange().getValues();
    var headers = all[0];
    for (var r = 1; r < all.length; r++) {
      if (all[r][0] == data.identificador) {
        var rowNumber = r + 1;
        headers.forEach(function (h, idx) {
          if (data[h] !== undefined) sheet.getRange(rowNumber, idx + 1).setValue(data[h]);
        });
        return json_({ status: 'success', message: 'Actualizado' });
      }
    }
    return json_({ status: 'error', message: 'No encontrado' });
  }

  // Alta de postulante.
  var head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var newRow = head.map(function (h) { return data[h] !== undefined ? data[h] : ''; });
  sheet.appendRow(newRow);
  return json_({ status: 'success', message: 'Agregado' });
}

/* ==================== HOJA "Documentación" ====================== */
/* Formato largo: una fila por (identificador, documento). Escala sin límite y
 * permite filtrar por persona/estado con un autofiltro. */

var DOC_HEADERS = [
  'identificador', 'nombre', 'cargo', 'agencia', 'gerencia', 'correo',
  'fecha_ingreso', 'grupo', 'documento_id', 'documento', 'estado',
  'paginas', 'observacion', 'prorroga', 'actualizado_en',
];

function hojaDocs_(ss) {
  var sh = ss.getSheetByName(CONFIG_DOC.HOJA_DOCS);
  if (!sh) {
    sh = ss.insertSheet(CONFIG_DOC.HOJA_DOCS);
    sh.appendRow(DOC_HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Upsert / delete de un expediente completo. */
function handleDocumentacion_(ss, data) {
  var sh = hojaDocs_(ss);

  if (data.action === 'delete') {
    borrarFilasPorId_(sh, data.identificador);
    return json_({ status: 'success', message: 'Expediente eliminado' });
  }

  var d = data.dossier || {};
  var id = d.identificador;
  if (!id) return json_({ status: 'error', message: 'Falta identificador' });

  // Reemplaza todas las filas de este identificador.
  borrarFilasPorId_(sh, id);
  var now = new Date();
  var filas = (d.items || []).map(function (it) {
    return [
      id, d.nombre || '', d.cargo || '', d.agencia || '', d.gerencia || '',
      d.correo || '', d.fechaIngreso || '', it.group || '', it.id || '',
      it.label || '', it.status || '', it.pages || 0, it.observation || '',
      it.prorroga || '', now,
    ];
  });
  if (filas.length) sh.getRange(sh.getLastRow() + 1, 1, filas.length, DOC_HEADERS.length).setValues(filas);
  return json_({ status: 'success', message: 'Expediente guardado', filas: filas.length });
}

function borrarFilasPorId_(sh, id) {
  var all = sh.getDataRange().getValues();
  for (var i = all.length - 1; i >= 1; i--) {
    if (all[i][0] == id) sh.deleteRow(i + 1);
  }
}

/* ==================== HOJA "Avisos Documentación" ============== */

function hojaAvisos_(ss) {
  var sh = ss.getSheetByName(CONFIG_DOC.HOJA_AVISOS);
  if (!sh) {
    sh = ss.insertSheet(CONFIG_DOC.HOJA_AVISOS);
    sh.appendRow(['fecha', 'identificador', 'para', 'cc', 'asunto', 'tipo', 'faltantes']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function handleDocEmail_(ss, data) {
  var sh = hojaAvisos_(ss);
  sh.appendRow([
    new Date(), data.identificador || '', data.to || '', data.cc || '',
    data.subject || '', data.kind || 'manual', data.missingCount || 0,
  ]);
  return json_({ status: 'success', message: 'Aviso registrado' });
}

/* ==================== RECORDATORIOS AUTOMÁTICOS ================= */
/* Envía un correo a cada persona con documentos faltantes cuando la cantidad de
 * días transcurridos desde su ingreso es múltiplo de CONFIG_DOC.INTERVALO_DIAS. */

function enviarRecordatoriosDocumentacion() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG_DOC.HOJA_DOCS);
  if (!sh) return;
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return;

  // Agrupa por identificador.
  var idx = indexar_(data[0]);
  var personas = {};
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var id = row[idx.identificador];
    if (!id) continue;
    if (!personas[id]) {
      personas[id] = {
        nombre: row[idx.nombre], cargo: row[idx.cargo], correo: row[idx.correo],
        fecha_ingreso: row[idx.fecha_ingreso], faltantes: [],
      };
    }
    var estado = String(row[idx.estado] || '').toLowerCase();
    if (estado === 'pendiente' || estado === 'observado') {
      personas[id].faltantes.push(row[idx.documento]);
    }
  }

  var hoy = new Date();
  Object.keys(personas).forEach(function (id) {
    var p = personas[id];
    if (!p.correo || p.faltantes.length === 0 || !p.fecha_ingreso) return;
    var dias = Math.floor((hoy - new Date(p.fecha_ingreso)) / 86400000);
    if (dias <= 0 || dias % CONFIG_DOC.INTERVALO_DIAS !== 0) return;

    var cuerpo = construirCuerpo_(p, dias);
    try {
      MailApp.sendEmail({
        to: p.correo,
        cc: CONFIG_DOC.CC_AUXILIAR,
        name: CONFIG_DOC.REMITENTE_NOMBRE,
        subject: CONFIG_DOC.ASUNTO,
        body: cuerpo,
      });
      hojaAvisos_(ss).appendRow([hoy, id, p.correo, CONFIG_DOC.CC_AUXILIAR,
        CONFIG_DOC.ASUNTO, 'auto', p.faltantes.length]);
    } catch (err) {
      // Silencioso: reintentará en la próxima corrida.
    }
  });
}

function construirCuerpo_(p, dias) {
  var lista = p.faltantes.map(function (d) { return '• ' + d; }).join('\n');
  return [
    'Estimado/a ' + (p.nombre || 'postulante') + ':',
    '',
    'Como parte de su proceso de incorporación al Banco de Desarrollo Productivo para el cargo de ' +
      (p.cargo || '(cargo por definir)') + ', le recordamos que aún tenemos pendiente la recepción de la siguiente documentación:',
    '',
    lista,
    '',
    'Han transcurrido ' + dias + ' día(s) desde su fecha de ingreso. Le agradeceremos presentar la documentación faltante a la brevedad posible.',
    '',
    'Saludos cordiales,',
    CONFIG_DOC.REMITENTE_NOMBRE,
  ].join('\n');
}

/** Ejecute UNA VEZ para instalar el disparador diario (autorice permisos). */
function instalarTriggersDocumentacion() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'enviarRecordatoriosDocumentacion') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('enviarRecordatoriosDocumentacion')
    .timeBased().everyDays(1).atHour(8).inTimezone(CONFIG_DOC.TZ).create();
}

/* ============================== HELPERS ========================= */

function indexar_(headers) {
  var map = {};
  headers.forEach(function (h, i) { map[String(h).trim()] = i; });
  return map;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
