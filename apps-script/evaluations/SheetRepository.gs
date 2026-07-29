/**
 * SheetRepository.gs — acceso a Google Sheets por nombre de encabezado.
 *
 * Invariantes que este archivo garantiza:
 *  1. Las columnas se localizan SIEMPRE por el nombre del encabezado (fila 1).
 *     Si falta un encabezado obligatorio se lanza SCHEMA_ERROR en lugar de
 *     escribir en la columna equivocada.
 *  2. El número de fila nunca se usa como identidad fuera de esta capa: las
 *     entidades se localizan por su `*_id`.
 *  3. Las escrituras se hacen por lotes (`setValues` de rangos contiguos y un
 *     único `appendRows` equivalente), no celda por celda.
 *  4. Nada se borra: las bajas son lógicas (`active = FALSE`).
 */

/** Devuelve la hoja, creándola con sus encabezados si no existe. */
function evalSheet_(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  var headers = EVAL_HEADERS[sheetName];
  if (!headers) throw evalError_('SCHEMA_ERROR', 'Hoja desconocida: ' + sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Mapa `encabezado → índice de columna (0-based)`. Lanza SCHEMA_ERROR si falta
 * cualquiera de los encabezados esperados. Se permiten columnas extra: el
 * usuario puede añadir columnas propias sin romper el backend.
 */
function evalHeaderMap_(sheet, sheetName) {
  var expected = EVAL_HEADERS[sheetName];
  var lastColumn = sheet.getLastColumn();
  var row = lastColumn > 0
    ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
    : [];
  var map = {};
  for (var i = 0; i < row.length; i++) {
    var name = String(row[i] || '').trim();
    if (name && map[name] === undefined) map[name] = i;
  }
  var missing = [];
  for (var j = 0; j < expected.length; j++) {
    if (map[expected[j]] === undefined) missing.push(expected[j]);
  }
  if (missing.length > 0) {
    throw evalError_('SCHEMA_ERROR',
      'La hoja "' + sheetName + '" no tiene los encabezados esperados.',
      { sheet: sheetName, missing: missing });
  }
  return map;
}

/** Lee la hoja completa como arreglo de objetos `{ encabezado: valor }`. */
function evalReadAll_(ss, sheetName) {
  var sheet = evalSheet_(ss, sheetName);
  var map = evalHeaderMap_(sheet, sheetName);
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  var headers = EVAL_HEADERS[sheetName];
  var out = [];
  for (var r = 0; r < values.length; r++) {
    var raw = values[r];
    var empty = true;
    for (var c = 0; c < raw.length; c++) {
      if (raw[c] !== '' && raw[c] !== null) { empty = false; break; }
    }
    if (empty) continue;
    var obj = { __row: r + 2 };
    for (var h = 0; h < headers.length; h++) {
      obj[headers[h]] = raw[map[headers[h]]];
    }
    out.push(obj);
  }
  return out;
}

/** Filas cuyo campo coincide con el valor dado (comparación por texto). */
function evalReadWhere_(ss, sheetName, field, value) {
  var wanted = String(value);
  return evalReadAll_(ss, sheetName).filter(function (row) {
    return String(row[field]) === wanted;
  });
}

/** Primera fila cuyo campo coincide, o `null`. */
function evalFindBy_(ss, sheetName, field, value) {
  var rows = evalReadWhere_(ss, sheetName, field, value);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Convierte un objeto en un arreglo alineado a los encabezados de la hoja.
 *
 * Comprueba además el límite de 50 000 caracteres por celda ANTES de que el
 * valor llegue a `setValues`. Es importante que la comprobación ocurra aquí y no
 * en la escritura: Sheets graba las celdas en orden y aborta al llegar a la que
 * se pasa del límite, dejando la fila a medio escribir. Así es como las filas de
 * `Versions` acabaron con las 7 primeras columnas llenas y las 8 últimas vacías.
 * Con esta validación previa, o se escribe la fila entera o no se escribe nada,
 * y el error es tipado en vez de un INTERNAL_ERROR opaco.
 */
function evalToRowArray_(sheetName, map, obj, width) {
  var headers = EVAL_HEADERS[sheetName];
  var arr = [];
  for (var i = 0; i < width; i++) arr.push('');
  for (var h = 0; h < headers.length; h++) {
    var key = headers[h];
    var value = obj[key];
    if (typeof value === 'string' && value.length > EVAL_CONFIG.LIMITS.MAX_CELL_CHARS) {
      throw evalError_('VALIDATION_ERROR',
        'Un valor es demasiado largo para una celda de la hoja de cálculo.',
        {
          sheet: sheetName,
          column: key,
          characters: value.length,
          limit: EVAL_CONFIG.LIMITS.MAX_CELL_CHARS
        });
    }
    arr[map[key]] = (value === undefined || value === null) ? '' : value;
  }
  return arr;
}

/**
 * Inserta y actualiza filas en un solo paso.
 *
 * Las filas existentes se reescriben en su posición (una llamada `setValues` por
 * fila contigua) y las nuevas se añaden en un único bloque al final. Devuelve
 * `{ inserted, updated }`.
 */
function evalUpsertRows_(ss, sheetName, idField, objects) {
  if (!objects || objects.length === 0) return { inserted: 0, updated: 0 };
  var sheet = evalSheet_(ss, sheetName);
  var map = evalHeaderMap_(sheet, sheetName);
  var width = Math.max(sheet.getLastColumn(), EVAL_HEADERS[sheetName].length);

  var existing = {};
  var current = evalReadAll_(ss, sheetName);
  for (var i = 0; i < current.length; i++) {
    existing[String(current[i][idField])] = current[i].__row;
  }

  // Primero se convierte el lote completo (lo que valida longitudes y
  // encabezados) y solo después se escribe. Si un objeto es inválido, la hoja no se
  // toca: no quedan filas a medias ni lotes aplicados por la mitad.
  var toAppend = [];
  var toUpdate = [];
  for (var o = 0; o < objects.length; o++) {
    var obj = objects[o];
    var id = String(obj[idField]);
    var arr = evalToRowArray_(sheetName, map, obj, width);
    if (existing[id]) {
      toUpdate.push({ row: existing[id], values: arr });
    } else {
      toAppend.push(arr);
      // Reservar el id para que un duplicado dentro del mismo lote no se
      // añada dos veces.
      existing[id] = -1;
    }
  }

  for (var u = 0; u < toUpdate.length; u++) {
    sheet.getRange(toUpdate[u].row, 1, 1, width).setValues([toUpdate[u].values]);
  }
  if (toAppend.length > 0) {
    var start = sheet.getLastRow() + 1;
    sheet.getRange(start, 1, toAppend.length, width).setValues(toAppend);
  }
  return { inserted: toAppend.length, updated: toUpdate.length };
}

/** Marca `active = FALSE` en las filas indicadas (baja lógica, sin borrar). */
function evalDeactivateRows_(ss, sheetName, idField, ids, now) {
  if (!ids || ids.length === 0) return 0;
  var wanted = {};
  for (var i = 0; i < ids.length; i++) wanted[String(ids[i])] = true;
  var sheet = evalSheet_(ss, sheetName);
  var map = evalHeaderMap_(sheet, sheetName);
  var rows = evalReadAll_(ss, sheetName);
  var count = 0;
  for (var r = 0; r < rows.length; r++) {
    if (!wanted[String(rows[r][idField])]) continue;
    if (evalBool_(rows[r].active) === false) continue;
    sheet.getRange(rows[r].__row, map.active + 1).setValue('FALSE');
    if (map.updated_at !== undefined) {
      sheet.getRange(rows[r].__row, map.updated_at + 1).setValue(now || evalNow_());
    }
    count++;
  }
  return count;
}

/** Añade una fila suelta (auditoría, solicitudes procesadas). */
function evalAppendRow_(ss, sheetName, obj) {
  var sheet = evalSheet_(ss, sheetName);
  var map = evalHeaderMap_(sheet, sheetName);
  var width = Math.max(sheet.getLastColumn(), EVAL_HEADERS[sheetName].length);
  var arr = evalToRowArray_(sheetName, map, obj, width);
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, width).setValues([arr]);
}

/* ------------------------------- Coerciones ------------------------------ */

/** Marca de tiempo ISO-8601 UTC. */
function evalNow_() {
  return new Date().toISOString();
}

/** Texto saneado: sin caracteres de control, con longitud acotada. */
function evalStr_(value, maxLength) {
  if (value === null || value === undefined) return '';
  var s = String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  var limit = maxLength || EVAL_CONFIG.LIMITS.MAX_TEXT;
  return s.length > limit ? s.slice(0, limit) : s;
}

/** Número o `null`. */
function evalNumOrNull_(value) {
  if (value === '' || value === null || value === undefined) return null;
  var n = Number(value);
  return isFinite(n) ? n : null;
}

/** Número con valor por omisión. */
function evalNum_(value, fallback) {
  var n = evalNumOrNull_(value);
  return n === null ? fallback : n;
}

/** Entero con valor por omisión. */
function evalInt_(value, fallback) {
  var n = evalNumOrNull_(value);
  return n === null ? fallback : Math.round(n);
}

/**
 * Booleano tolerante: acepta booleanos reales y los textos que Sheets suele
 * producir. Devuelve `null` cuando la celda está vacía.
 */
function evalBool_(value) {
  if (value === true) return true;
  if (value === false) return false;
  if (value === '' || value === null || value === undefined) return null;
  var s = String(value).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'sí' || s === 'si' || s === 'verdadero') return true;
  if (s === 'false' || s === '0' || s === 'no' || s === 'falso') return false;
  return null;
}

/** Booleano con valor por omisión. */
function evalBoolOr_(value, fallback) {
  var b = evalBool_(value);
  return b === null ? fallback : b;
}

/** Serializa un booleano al formato de la hoja. */
function evalWriteBool_(value) {
  return value ? 'TRUE' : 'FALSE';
}

/**
 * Parseo seguro de JSON con valor por omisión explícito. Nunca lanza: un JSON
 * corrupto en una celda no debe tumbar toda la lectura.
 */
function evalParseJson_(raw, fallback) {
  if (raw === null || raw === undefined || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    var parsed = JSON.parse(String(raw));
    return (parsed === null || parsed === undefined) ? fallback : parsed;
  } catch (e) {
    return fallback;
  }
}

/** Serializa a JSON compacto; `{}`/`[]` vacíos se guardan como texto vacío. */
function evalWriteJson_(value, emptyAs) {
  if (value === null || value === undefined) return emptyAs === undefined ? '' : emptyAs;
  try {
    var text = JSON.stringify(value);
    if (text === '{}' || text === '[]' || text === 'null') {
      return emptyAs === undefined ? text : emptyAs;
    }
    return text;
  } catch (e) {
    return emptyAs === undefined ? '' : emptyAs;
  }
}

/* ---------------------------- Verificación ------------------------------- */

/**
 * Informe del esquema: por hoja, si existe, encabezados faltantes, sobrantes y
 * número de filas de datos. No modifica nada.
 */
function evalVerifySchema_(ss) {
  var report = { ok: true, sheets: [] };
  var names = Object.keys(EVAL_HEADERS);
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var expected = EVAL_HEADERS[name];
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      report.ok = false;
      report.sheets.push({
        sheet: name, exists: false, missingHeaders: expected.slice(),
        extraHeaders: [], dataRows: 0
      });
      continue;
    }
    var lastColumn = sheet.getLastColumn();
    var actual = lastColumn > 0
      ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (h) {
          return String(h || '').trim();
        }).filter(function (h) { return h !== ''; })
      : [];
    var missing = expected.filter(function (h) { return actual.indexOf(h) < 0; });
    var extra = actual.filter(function (h) { return expected.indexOf(h) < 0; });
    if (missing.length > 0) report.ok = false;
    report.sheets.push({
      sheet: name,
      exists: true,
      missingHeaders: missing,
      extraHeaders: extra,
      dataRows: Math.max(0, sheet.getLastRow() - 1)
    });
  }
  return report;
}
