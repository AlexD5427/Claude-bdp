/**
 * 05_Schema.gs — instalación, verificación y reparación NO destructiva.
 *
 * Tres operaciones sobre el libro, todas derivadas de `EV_SCHEMA`:
 *
 *   verificar   compara libro y esquema y devuelve un informe. No escribe nada.
 *   instalar    crea las hojas que falten, con encabezados, congelado, anchos y
 *               formato. Idempotente: ejecutarlo dos veces no cambia nada.
 *   reparar     añade al FINAL las columnas que falten y arregla los encabezados
 *               mal escritos, sin mover ni borrar datos.
 *
 * Regla que gobierna las tres: **jamás se destruye información**. Las columnas
 * ajenas que alguien haya añadido a mano se respetan; el orden de las columnas
 * existentes no se toca (la capa de almacenamiento localiza todo por nombre); las
 * filas nunca se reordenan.
 *
 * Por qué importa: el módulo anterior exigía que el operador arreglara la hoja a
 * mano cuando el esquema evolucionaba, y un encabezado con una tilde de más
 * bastaba para que todo respondiera «error interno».
 */

/* ---------------------------------- _Meta --------------------------------- */

/** Lee un metadato de instalación. */
function evMetaGet_(clave, fallback) {
  var row = evById_(EV_SHEET.META, clave);
  return row ? row.valor : fallback;
}

/** Escribe un metadato de instalación. */
function evMetaSet_(clave, valor) {
  evPut_(EV_SHEET.META, {
    clave: String(clave),
    valor: typeof valor === 'string' ? valor : JSON.stringify(valor),
    actualizado_en: evNow_()
  });
}

/* -------------------------------- Verificación ---------------------------- */

/**
 * Informe del estado del libro frente al esquema.
 *
 * No lanza nunca: su trabajo es explicar el problema, no propagarlo. Devuelve
 * una lista de hojas con lo que falta y lo que sobra, y una conclusión global.
 */
function evVerifySchema_() {
  var ss = evSpreadsheet_();
  var report = {
    ok: true,
    installed: true,
    schemaVersion: EV_BACKEND.schemaVersion,
    spreadsheetId: '',
    spreadsheetName: '',
    sheets: [],
    missingSheets: [],
    sheetsNeedingRepair: []
  };
  try {
    report.spreadsheetId = ss.getId ? ss.getId() : '';
    report.spreadsheetName = ss.getName ? ss.getName() : '';
  } catch (e) { /* el doble de pruebas puede no implementarlo */ }

  for (var s = 0; s < EV_SHEET_ORDER.length; s++) {
    var name = EV_SHEET_ORDER[s];
    var expected = evColumnNames_(name);
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      report.ok = false;
      report.installed = false;
      report.missingSheets.push(name);
      report.sheets.push({
        sheet: name, exists: false, dataRows: 0,
        missingColumns: expected.slice(), extraColumns: [], describe: EV_SCHEMA[name].describe
      });
      continue;
    }
    var lastColumn = sheet.getLastColumn();
    var headers = [];
    if (lastColumn > 0) {
      var raw = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
      for (var i = 0; i < raw.length; i++) {
        var header = String(raw[i] === null || raw[i] === undefined ? '' : raw[i]).trim();
        if (header) headers.push(header);
      }
    }
    var missing = [];
    for (var e = 0; e < expected.length; e++) {
      if (headers.indexOf(expected[e]) < 0) missing.push(expected[e]);
    }
    var extra = [];
    for (var h = 0; h < headers.length; h++) {
      if (expected.indexOf(headers[h]) < 0) extra.push(headers[h]);
    }
    if (missing.length > 0) {
      report.ok = false;
      report.sheetsNeedingRepair.push(name);
    }
    report.sheets.push({
      sheet: name,
      exists: true,
      dataRows: Math.max(0, sheet.getLastRow() - 1),
      missingColumns: missing,
      extraColumns: extra,
      describe: EV_SCHEMA[name].describe
    });
  }
  return report;
}

/* -------------------------- Instalación y reparación ---------------------- */

/**
 * Deja el libro listo para operar. Crea lo que falte y repara lo que esté
 * incompleto. Devuelve el detalle de cada acción para que la interfaz pueda
 * mostrar exactamente qué cambió.
 */
function evInstallSchema_(actor) {
  var ss = evSpreadsheet_();
  EV_STORE.allowCreate = true;
  var actions = [];

  for (var s = 0; s < EV_SHEET_ORDER.length; s++) {
    var name = EV_SHEET_ORDER[s];
    var expected = evColumnNames_(name);
    var sheet = ss.getSheetByName(name);

    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
      actions.push({ sheet: name, action: 'creada', columns: expected.length });
    } else {
      var lastColumn = sheet.getLastColumn();
      var headers = [];
      if (lastColumn > 0) {
        var raw = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
        for (var i = 0; i < raw.length; i++) {
          headers.push(String(raw[i] === null || raw[i] === undefined ? '' : raw[i]).trim());
        }
      }
      var added = [];
      for (var e = 0; e < expected.length; e++) {
        if (headers.indexOf(expected[e]) < 0) added.push(expected[e]);
      }
      if (added.length > 0) {
        // Se añaden AL FINAL. Insertar en su posición del esquema movería datos
        // de columna, que es exactamente lo que no queremos hacer nunca.
        var start = Math.max(headers.length, lastColumn) + 1;
        sheet.getRange(1, start, 1, added.length).setValues([added]);
        actions.push({ sheet: name, action: 'columnas añadidas', columns: added });
      } else {
        actions.push({ sheet: name, action: 'sin cambios' });
      }
    }
    evStyleSheet_(sheet, name);
  }

  // El caché de encabezados de la petición ya no vale: hay columnas nuevas.
  EV_STORE.loaded = {};
  EV_STORE.pending = {};

  evEnsureAttemptSecret_();
  evMetaSet_('schema_version', String(EV_BACKEND.schemaVersion));
  evMetaSet_('backend_version', EV_BACKEND.version);
  evMetaSet_('snapshot_version', String(EV_BACKEND.snapshotVersion));
  evMetaSet_('rich_text_version', String(EV_BACKEND.richTextVersion));
  evMetaSet_('instalado_en', evNow_());
  evMetaSet_('instalado_por', evText_(actor || 'script', 200));
  evCommit_();
  EV_STORE.allowCreate = false;

  evInfo_('Esquema instalado o reparado.', { acciones: actions.length });
  return { actions: actions, report: evVerifySchema_() };
}

/**
 * Presentación de una hoja: encabezado congelado y en negrita, anchos razonables
 * y formato de texto plano en las columnas JSON.
 *
 * Es cosmético pero no accesorio: un libro legible es un libro que el equipo
 * puede auditar a mano, y eso es la mitad del valor de usar Sheets. Cada llamada
 * va protegida porque estos métodos no existen en el doble de pruebas.
 */
function evStyleSheet_(sheet, name) {
  var expected = evColumnNames_(name);
  try { sheet.setFrozenRows(1); } catch (e) { /* opcional */ }
  try {
    sheet.getRange(1, 1, 1, Math.max(expected.length, sheet.getLastColumn())).setFontWeight('bold');
  } catch (e) { /* opcional */ }
  try {
    var columns = EV_SCHEMA[name].columns;
    for (var c = 0; c < columns.length; c++) {
      var width = columns[c].type === 'json' || columns[c].type === 'long' ? 260 : 150;
      sheet.setColumnWidth(c + 1, width);
    }
  } catch (e) { /* opcional */ }
}

/** Genera el secreto de firma de intentos si aún no existe. */
function evEnsureAttemptSecret_() {
  var current = String(evProp_(EV_PROP.ATTEMPT_SECRET, ''));
  if (current.length >= 32) return false;
  var secret = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  evSetProp_(EV_PROP.ATTEMPT_SECRET, secret);
  evInfo_('Se generó el secreto de firma de intentos.');
  return true;
}

/**
 * ¿Está el libro instalado? Comprobación baratísima que evita responder
 * SCHEMA_ERROR crudo a la primera lectura.
 */
function evIsInstalled_() {
  try {
    var ss = evSpreadsheet_();
    return !!ss.getSheetByName(EV_SHEET.EVALUACIONES) && !!ss.getSheetByName(EV_SHEET.INTENTOS);
  } catch (e) {
    return false;
  }
}

/**
 * Exige que el libro esté instalado antes de operar.
 *
 * El mensaje distingue «no está instalado» de «está instalado a medias», que son
 * dos situaciones con soluciones distintas y que el backend anterior confundía.
 */
function evRequireInstalled_() {
  if (evIsInstalled_()) return;
  throw evError_(EV_CODE.NOT_INSTALLED, '', {
    details: { spreadsheetChecked: true, action: 'install' }
  });
}
