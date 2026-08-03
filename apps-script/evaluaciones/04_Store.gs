/**
 * 04_Store.gs — motor de almacenamiento sobre Google Sheets.
 *
 * ── Por qué existe esta capa ─────────────────────────────────────────────────
 * Google Sheets es rápido leyendo y escribiendo RANGOS y lentísimo leyendo y
 * escribiendo CELDAS. Cada llamada al servicio cuesta entre 20 y 200 ms. Un
 * backend que escribe fila a fila tarda segundos en operaciones triviales; uno
 * que agrupa las escrituras tarda milisegundos. Por eso esta capa es una
 * *unidad de trabajo*:
 *
 *   1. cada hoja se lee UNA sola vez por petición y se conserva en memoria;
 *   2. las escrituras no van a la hoja: se encolan;
 *   3. al confirmar, las filas contiguas se agrupan en un único `setValues` y
 *      todas las filas nuevas se añaden en un solo bloque al final.
 *
 * Consecuencia medible: guardar una evaluación con 40 preguntas y 160 opciones
 * pasa de ~200 llamadas a Sheets a 5.
 *
 * ── Invariantes que garantiza ────────────────────────────────────────────────
 *  1. Las columnas se localizan por NOMBRE de encabezado. Nunca por posición.
 *     Añadir o mover una columna a mano no corrompe nada.
 *  2. El número de fila no es identidad. Las entidades se buscan por su `id`.
 *  3. La conversión celda ↔ valor la decide el TIPO declarado en el esquema
 *     (00_Manifest.gs). Ningún mapeador vuelve a adivinar tipos.
 *  4. La validación de longitud ocurre ANTES de escribir. Sheets graba celda a
 *     celda y aborta al llegar a la que excede el límite, dejando filas a medio
 *     escribir; validar antes convierte eso en un error tipado y una hoja intacta.
 *  5. Nada se borra por accidente: las bajas son lógicas (`activo = FALSE`) salvo
 *     en las operaciones de purga, que son explícitas.
 */

/** Estado de la unidad de trabajo. `evStoreReset_()` lo reinicia por petición. */
var EV_STORE = {
  spreadsheet: null,
  /** name → { sheet, headers, index, width, rows, byId } */
  loaded: {},
  /** name → { updates: [{row, values}], appends: [values] } */
  pending: {},
  /** Se pone a `true` durante la instalación para permitir crear hojas. */
  allowCreate: false
};

function evStoreReset_() {
  EV_STORE.spreadsheet = null;
  EV_STORE.loaded = {};
  EV_STORE.pending = {};
  EV_STORE.allowCreate = false;
}

/* ------------------------------ El libro activo --------------------------- */

/**
 * El libro de cálculo. Por id de propiedad o el contenedor del script.
 *
 * Los dos modos de fallo se distinguen a propósito: «no hay libro» y «el id
 * apunta a algo que no puedo abrir» exigen acciones distintas.
 */
function evSpreadsheet_() {
  if (EV_STORE.spreadsheet) return EV_STORE.spreadsheet;
  var id = String(evProp_(EV_PROP.SPREADSHEET_ID, '')).trim();
  if (id) {
    // Tolerante con quien pega la URL completa en lugar del identificador.
    var match = id.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
    if (match) id = match[1];
    EV_STORE.spreadsheet = SpreadsheetApp.openById(id);
    return EV_STORE.spreadsheet;
  }
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw evError_(EV_CODE.SCHEMA_ERROR,
      'El script no está asociado a ningún libro de cálculo.',
      {
        hint: 'Crea el script DESDE el libro (Extensiones → Apps Script) o define la propiedad ' +
          EV_PROP.SPREADSHEET_ID + ' con el identificador del libro.',
        details: { property: EV_PROP.SPREADSHEET_ID }
      });
  }
  EV_STORE.spreadsheet = active;
  return active;
}

/* ------------------------------ Códecs por tipo --------------------------- */

/** Valor de dominio → valor de celda. */
function evEncodeValue_(spec, value) {
  switch (spec.type) {
    case 'id':
      return value === null || value === undefined ? '' : evRaw_(value, 140);
    case 'text':
      return spec.enum
        ? evEnum_(value, spec.enum, spec.fallback)
        : evText_(value, EV_LIMITS.SHORT_TEXT);
    case 'long':
      return evText_(value, EV_LIMITS.CELL_CHARS - 1);
    case 'int': {
      var i = evNumOrNull_(value);
      return i === null ? '' : Math.round(i);
    }
    case 'num': {
      var n = evNumOrNull_(value);
      return n === null ? '' : n;
    }
    case 'bool': {
      var b = evBoolOrNull_(value);
      return b === null ? '' : (b ? 'TRUE' : 'FALSE');
    }
    case 'iso':
      return value === null || value === undefined ? '' : evRaw_(value, 40);
    case 'json':
      return typeof value === 'string' ? evRaw_(value, EV_LIMITS.CELL_CHARS - 1) : evWriteJson_(value);
    default:
      return evText_(value, EV_LIMITS.SHORT_TEXT);
  }
}

/**
 * Valor de celda → valor de dominio.
 *
 * El apóstrofo inicial que Sheets usa para forzar texto se retira aquí: lo pone
 * `evText_` para neutralizar fórmulas y no forma parte del dato.
 */
function evDecodeValue_(spec, raw) {
  switch (spec.type) {
    case 'id':
      return evRaw_(raw, 140);
    case 'text':
    case 'long': {
      var s = evRaw_(raw, EV_LIMITS.CELL_CHARS);
      if (s.charAt(0) === "'" && /^[=+\-@]/.test(s.charAt(1))) s = s.slice(1);
      return s;
    }
    case 'int':
      return evNumOrNull_(raw) === null ? null : evInt_(raw, 0);
    case 'num':
      return evNumOrNull_(raw);
    case 'bool':
      return evBoolOrNull_(raw);
    case 'iso':
      return evIsoFromCell_(raw);
    case 'json':
      return evParseJson_(raw, null);
    default:
      return evRaw_(raw, EV_LIMITS.SHORT_TEXT);
  }
}

/**
 * Una marca de tiempo puede volver de la hoja como texto ISO o como `Date`, si
 * alguien reformateó la columna a mano. Normalizamos siempre a ISO-8601.
 */
function evIsoFromCell_(raw) {
  if (raw === null || raw === undefined || raw === '') return '';
  if (raw instanceof Date) return raw.toISOString();
  if (typeof raw.getTime === 'function') return new Date(raw.getTime()).toISOString();
  return evRaw_(raw, 40);
}

/* ------------------------------- Carga de hojas --------------------------- */

/** Handle de la hoja. Crea la hoja solo si la instalación lo autorizó. */
function evSheetHandle_(name) {
  var ss = evSpreadsheet_();
  var sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  if (!EV_STORE.allowCreate) {
    throw evError_(EV_CODE.NOT_INSTALLED,
      'Falta la hoja "' + name + '" en el libro de cálculo.',
      {
        hint: 'Ejecuta la acción "install" o, en el libro, Evaluaciones → Instalar o reparar. No se pierde ningún dato existente.',
        details: { sheet: name, missing: true }
      });
  }
  sheet = ss.insertSheet(name);
  var headers = evColumnNames_(name);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return sheet;
}

/** Mapa `encabezado → índice 0-based`, exigiendo que estén todos los del esquema. */
function evHeaderIndex_(sheet, name) {
  var expected = evColumnNames_(name);
  var lastColumn = sheet.getLastColumn();
  var row = lastColumn > 0 ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0] : [];
  var index = {};
  for (var i = 0; i < row.length; i++) {
    var header = String(row[i] === null || row[i] === undefined ? '' : row[i]).trim();
    if (header && index[header] === undefined) index[header] = i;
  }
  var missing = [];
  for (var e = 0; e < expected.length; e++) {
    if (index[expected[e]] === undefined) missing.push(expected[e]);
  }
  if (missing.length > 0) {
    throw evError_(EV_CODE.SCHEMA_ERROR,
      'La hoja "' + name + '" no tiene ' + missing.length + ' columna(s) que el backend necesita.',
      {
        hint: 'Ejecuta Evaluaciones → Instalar o reparar: añade las columnas que falten al final, sin tocar los datos existentes.',
        details: { sheet: name, missingColumns: missing }
      });
  }
  return index;
}

/** Carga una hoja completa (una sola llamada a Sheets) y la deja en memoria. */
function evLoad_(name) {
  if (EV_STORE.loaded[name]) return EV_STORE.loaded[name];
  var sheet = evSheetHandle_(name);
  var index = evHeaderIndex_(sheet, name);
  var columns = EV_SCHEMA[name].columns;
  var key = EV_SCHEMA[name].key;
  var lastRow = sheet.getLastRow();
  var lastColumn = Math.max(sheet.getLastColumn(), columns.length);
  var rows = [];
  var byId = {};

  if (lastRow >= 2) {
    var values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
    evCount_('sheetsRead');
    evCount_('rowsRead', values.length);
    for (var r = 0; r < values.length; r++) {
      var raw = values[r];
      var blank = true;
      for (var c = 0; c < raw.length; c++) {
        if (raw[c] !== '' && raw[c] !== null && raw[c] !== undefined) { blank = false; break; }
      }
      if (blank) continue;
      var obj = { __row: r + 2 };
      for (var k = 0; k < columns.length; k++) {
        obj[columns[k].name] = evDecodeValue_(columns[k], raw[index[columns[k].name]]);
      }
      rows.push(obj);
      var id = String(obj[key]);
      if (id) byId[id] = obj;
    }
  } else {
    evCount_('sheetsRead');
  }

  EV_STORE.loaded[name] = {
    sheet: sheet,
    index: index,
    width: lastColumn,
    rows: rows,
    byId: byId,
    nextRow: Math.max(lastRow + 1, 2)
  };
  return EV_STORE.loaded[name];
}

/* --------------------------------- Lecturas ------------------------------- */

/** Todas las filas de una hoja (referencias vivas al caché de la petición). */
function evAll_(name) {
  return evLoad_(name).rows;
}

/** Filas cuyo campo coincide, comparando como texto. */
function evWhere_(name, field, value) {
  var wanted = String(value);
  var rows = evAll_(name);
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][field]) === wanted) out.push(rows[i]);
  }
  return out;
}

/** Primera fila que coincide, o `null`. */
function evFirst_(name, field, value) {
  var rows = evWhere_(name, field, value);
  return rows.length > 0 ? rows[0] : null;
}

/** Fila por su clave primaria, usando el índice (sin recorrer). */
function evById_(name, id) {
  if (!id) return null;
  var loaded = evLoad_(name);
  return loaded.byId[String(id)] || null;
}

/** ¿Cuántas filas de datos tiene la hoja? Sin cargarla si ya está cargada. */
function evCountRows_(name) {
  return evAll_(name).length;
}

/* -------------------------------- Escrituras ------------------------------ */

function evPendingFor_(name) {
  if (!EV_STORE.pending[name]) EV_STORE.pending[name] = { updates: [], appends: [] };
  return EV_STORE.pending[name];
}

/** Objeto → arreglo alineado a la hoja, validando el techo de celda. */
function evEncodeRow_(name, obj, width) {
  var loaded = EV_STORE.loaded[name];
  var index = loaded.index;
  var columns = EV_SCHEMA[name].columns;
  var arr = [];
  for (var i = 0; i < width; i++) arr.push('');
  for (var c = 0; c < columns.length; c++) {
    var spec = columns[c];
    var encoded = evEncodeValue_(spec, obj[spec.name]);
    if (typeof encoded === 'string' && encoded.length > EV_LIMITS.CELL_CHARS) {
      throw evError_(EV_CODE.VALIDATION_ERROR,
        'El campo "' + spec.name + '" de la hoja "' + name + '" mide ' + encoded.length +
        ' caracteres y una celda admite ' + EV_LIMITS.CELL_CHARS + '.',
        {
          hint: 'Acorta ese texto. El contenido publicado se trocea automáticamente; este límite solo alcanza a campos sueltos del borrador.',
          details: { sheet: name, column: spec.name, characters: encoded.length, limit: EV_LIMITS.CELL_CHARS }
        });
    }
    arr[index[spec.name]] = encoded;
  }
  return arr;
}

/**
 * Inserta o actualiza una entidad.
 *
 * Actualiza también el caché en memoria, así que una lectura posterior dentro de
 * la misma petición ve el valor nuevo. Sin esto, «publicar» leería el borrador
 * anterior al guardado que acaba de hacerse.
 */
function evPut_(name, obj) {
  var loaded = evLoad_(name);
  var key = EV_SCHEMA[name].key;
  var id = String(obj[key]);
  if (!id) {
    throw evError_(EV_CODE.INTERNAL_ERROR,
      'Se intentó escribir en "' + name + '" una fila sin su clave "' + key + '".',
      { details: { sheet: name, key: key } });
  }
  var values = evEncodeRow_(name, obj, loaded.width);
  var existing = loaded.byId[id];
  if (existing && existing.__row) {
    evPendingFor_(name).updates.push({ row: existing.__row, values: values });
    for (var k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k) && k !== '__row') existing[k] = obj[k];
    }
    return existing;
  }
  var stored = { __row: loaded.nextRow++ };
  var columns = EV_SCHEMA[name].columns;
  for (var c = 0; c < columns.length; c++) stored[columns[c].name] = obj[columns[c].name];
  loaded.rows.push(stored);
  loaded.byId[id] = stored;
  evPendingFor_(name).appends.push(values);
  return stored;
}

/** Inserta o actualiza un lote. Devuelve `{ insertados, actualizados }`. */
function evPutAll_(name, objects) {
  var inserted = 0;
  var updated = 0;
  for (var i = 0; i < objects.length; i++) {
    var loaded = evLoad_(name);
    var id = String(objects[i][EV_SCHEMA[name].key]);
    var existed = !!(loaded.byId[id] && loaded.byId[id].__row);
    evPut_(name, objects[i]);
    if (existed) updated++; else inserted++;
  }
  return { insertados: inserted, actualizados: updated };
}

/** Baja lógica: `activo = FALSE`. Devuelve cuántas filas cambiaron. */
function evDeactivate_(name, ids, now) {
  if (!ids || ids.length === 0) return 0;
  var stamp = now || evNow_();
  var changed = 0;
  for (var i = 0; i < ids.length; i++) {
    var row = evById_(name, ids[i]);
    if (!row || row.activo === false) continue;
    row.activo = false;
    if (evColumnSpec_(name, 'actualizado_en')) row.actualizado_en = stamp;
    evPut_(name, row);
    changed++;
  }
  return changed;
}

/**
 * Borrado real de filas. Es la única operación destructiva del motor y solo la
 * usan la papelera vaciada a propósito y el mantenimiento.
 *
 * Se borra de abajo hacia arriba: al eliminar una fila las de abajo suben, y
 * hacerlo en el otro orden borraría filas equivocadas.
 */
function evPurge_(name, ids) {
  if (!ids || ids.length === 0) return 0;
  var loaded = evLoad_(name);
  var wanted = {};
  for (var i = 0; i < ids.length; i++) wanted[String(ids[i])] = true;
  var key = EV_SCHEMA[name].key;
  var targets = [];
  for (var r = 0; r < loaded.rows.length; r++) {
    if (wanted[String(loaded.rows[r][key])]) targets.push(loaded.rows[r].__row);
  }
  targets.sort(function (a, b) { return b - a; });
  for (var t = 0; t < targets.length; t++) loaded.sheet.deleteRow(targets[t]);
  // El caché de esta hoja deja de ser válido: los números de fila cambiaron.
  delete EV_STORE.loaded[name];
  delete EV_STORE.pending[name];
  return targets.length;
}

/* ------------------------------- Confirmación ----------------------------- */

/**
 * Vuelca todo lo encolado.
 *
 * Las actualizaciones se agrupan por tramos de filas CONSECUTIVAS: guardar 40
 * preguntas que ocupan filas contiguas es una sola llamada, no cuarenta. Las
 * filas nuevas van en un único bloque al final de la hoja.
 */
function evCommit_() {
  var names = Object.keys(EV_STORE.pending);
  var written = 0;
  for (var n = 0; n < names.length; n++) {
    var name = names[n];
    var pending = EV_STORE.pending[name];
    var loaded = EV_STORE.loaded[name];
    if (!loaded) continue;

    if (pending.updates.length > 0) {
      // Última escritura por fila (una fila puede haberse tocado dos veces).
      var byRow = {};
      for (var u = 0; u < pending.updates.length; u++) byRow[pending.updates[u].row] = pending.updates[u].values;
      var rowNumbers = Object.keys(byRow).map(Number).sort(function (a, b) { return a - b; });

      var blockStart = 0;
      while (blockStart < rowNumbers.length) {
        var blockEnd = blockStart;
        while (blockEnd + 1 < rowNumbers.length && rowNumbers[blockEnd + 1] === rowNumbers[blockEnd] + 1) blockEnd++;
        var block = [];
        for (var b = blockStart; b <= blockEnd; b++) block.push(byRow[rowNumbers[b]]);
        loaded.sheet.getRange(rowNumbers[blockStart], 1, block.length, loaded.width).setValues(block);
        written += block.length;
        blockStart = blockEnd + 1;
      }
    }

    if (pending.appends.length > 0) {
      var start = loaded.sheet.getLastRow() + 1;
      loaded.sheet.getRange(start, 1, pending.appends.length, loaded.width).setValues(pending.appends);
      written += pending.appends.length;
    }
    EV_STORE.pending[name] = { updates: [], appends: [] };
  }
  evCount_('rowsWritten', written);
  return written;
}

/** ¿Hay algo encolado sin escribir? Lo usa el diagnóstico del enrutador. */
function evHasPendingWrites_() {
  var names = Object.keys(EV_STORE.pending);
  for (var i = 0; i < names.length; i++) {
    var p = EV_STORE.pending[names[i]];
    if (p.updates.length > 0 || p.appends.length > 0) return true;
  }
  return false;
}

/** Descarta lo encolado sin escribirlo (se usa cuando la operación falla). */
function evRollback_() {
  EV_STORE.pending = {};
  EV_STORE.loaded = {};
}

/* ----------------------------- Caché de plataforma ------------------------ */

/**
 * `CacheService` guarda hasta 100 KB por clave y es MUCHO más rápido que Sheets.
 * Se usa para el payload público de una versión publicada: es inmutable, así que
 * cachearlo por huella es seguro por construcción.
 */
function evCacheGet_(key) {
  try {
    var raw = CacheService.getScriptCache().get(key);
    if (raw) evCount_('cacheHits');
    return raw;
  } catch (e) {
    return null;
  }
}

function evCachePut_(key, value, seconds) {
  try {
    if (String(value).length > 95000) return false;
    CacheService.getScriptCache().put(key, String(value), seconds || EV_LIMITS.PUBLIC_CACHE_SECONDS);
    return true;
  } catch (e) {
    return false;
  }
}

function evCacheRemove_(key) {
  try {
    CacheService.getScriptCache().remove(key);
  } catch (e) { /* el caché es opcional */ }
}
