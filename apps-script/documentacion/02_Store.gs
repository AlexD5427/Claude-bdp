/**
 * 02_Store.gs — motor de almacenamiento sobre Google Sheets.
 *
 * ── Por qué no se escribe celda a celda ──────────────────────────────────────
 * Cada llamada al servicio de Sheets cuesta entre 20 y 200 ms. Guardar un
 * expediente con 31 documentos tocando celda por celda son ~40 llamadas: entre
 * uno y ocho segundos, con la pantalla congelada. Agrupando, son 3.
 *
 * Por eso esta capa es una *unidad de trabajo*:
 *
 *   1. cada hoja se lee UNA vez por petición y se conserva en memoria;
 *   2. las escrituras no van a la hoja, se encolan;
 *   3. al confirmar, las filas contiguas se agrupan en un único `setValues` y
 *      las nuevas se añaden en un solo bloque al final.
 *
 * ── Invariantes ──────────────────────────────────────────────────────────────
 *  1. Las columnas se localizan por ENCABEZADO, nunca por posición. Que alguien
 *     arrastre una columna en Sheets no corrompe nada.
 *  2. Cuando un encabezado se repite —«CONTRATO DE FIANZA» está dos veces en el
 *     libro real— se distingue por número de aparición.
 *  3. El número de fila no es identidad: las entidades se buscan por su clave.
 *  4. Nada se borra sin pedirlo explícitamente.
 *  5. La longitud se valida ANTES de escribir. Sheets aborta a mitad de fila si
 *     una celda excede los 50 000 caracteres, y deja la fila rota.
 */

var DOC_STORE = {
  spreadsheet: null,
  loaded: {},
  pending: {},
  allowCreate: false
};

function docStoreReset_() {
  DOC_STORE.spreadsheet = null;
  DOC_STORE.loaded = {};
  DOC_STORE.pending = {};
  DOC_STORE.allowCreate = false;
}

/* ------------------------------- El libro activo -------------------------- */

/**
 * El libro sobre el que se trabaja.
 *
 * Se acepta tanto el identificador como la URL completa pegada de la barra de
 * direcciones, porque es lo que la gente copia de verdad.
 */
function docSpreadsheet_() {
  if (DOC_STORE.spreadsheet) return DOC_STORE.spreadsheet;
  var id = String(docProp_(DOC_PROP.SPREADSHEET_ID, '')).trim();
  if (id) {
    var m = id.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
    if (m) id = m[1];
    DOC_STORE.spreadsheet = SpreadsheetApp.openById(id);
    return DOC_STORE.spreadsheet;
  }
  var activo = SpreadsheetApp.getActiveSpreadsheet();
  if (!activo) {
    throw docError_(DOC_CODE.SCHEMA_ERROR,
      'El script no está asociado a ningún libro de cálculo.',
      {
        hint: 'Crea el script DESDE el libro (Extensiones → Apps Script) o define la propiedad ' +
          DOC_PROP.SPREADSHEET_ID + ' con el identificador del libro.',
        details: { propiedad: DOC_PROP.SPREADSHEET_ID }
      });
  }
  DOC_STORE.spreadsheet = activo;
  return activo;
}

/* -------------------------------- Códecs ---------------------------------- */

/** Valor de dominio → valor de celda. */
function docEncodeValue_(spec, valor) {
  switch (spec.type) {
    case 'id':
      return valor === null || valor === undefined ? '' : docRaw_(valor, 200);
    case 'text':
      return docText_(valor, DOC_LIMITS.SHORT_TEXT);
    case 'long':
      return docText_(valor, DOC_LIMITS.CELL_CHARS - 1);
    case 'int': {
      var i = docNumOrNull_(valor);
      return i === null ? '' : Math.round(i);
    }
    case 'num': {
      var n = docNumOrNull_(valor);
      return n === null ? '' : n;
    }
    case 'bool': {
      var b = docBoolOrNull_(valor);
      return b === null ? '' : (b ? 'TRUE' : 'FALSE');
    }
    case 'iso':
      return valor === null || valor === undefined ? '' : docRaw_(valor, 40);
    case 'json':
      return typeof valor === 'string' ? docRaw_(valor, DOC_LIMITS.CELL_CHARS - 1) : docWriteJson_(valor);
    default:
      return docText_(valor, DOC_LIMITS.SHORT_TEXT);
  }
}

/** Valor de celda → valor de dominio. */
function docDecodeValue_(spec, crudo) {
  switch (spec.type) {
    case 'id':
      return docRaw_(crudo, 200);
    case 'text':
    case 'long':
      return docUntext_(crudo);
    case 'int':
      return docNumOrNull_(crudo) === null ? null : docInt_(crudo, 0);
    case 'num':
      return docNumOrNull_(crudo);
    case 'bool':
      return docBoolOrNull_(crudo);
    case 'iso':
      return docIsoFromCell_(crudo);
    case 'json':
      return docParseJson_(crudo, null);
    default:
      return docUntext_(crudo);
  }
}

/* ------------------------------ Carga de hojas ---------------------------- */

/** Handle de una hoja de sistema. Solo la crea si la instalación lo autorizó. */
function docSheetHandle_(nombre) {
  var ss = docSpreadsheet_();
  var hoja = ss.getSheetByName(nombre);
  if (hoja) return hoja;
  if (!DOC_STORE.allowCreate) {
    throw docError_(DOC_CODE.NOT_INSTALLED,
      'Falta la hoja "' + nombre + '" en el libro.',
      {
        hint: 'Ejecuta "instalar" o, en el libro, Documentación → Instalar o reparar. No se pierde ningún dato.',
        details: { hoja: nombre, falta: true }
      });
  }
  hoja = ss.insertSheet(nombre);
  var encabezados = docColumnNames_(nombre);
  if (encabezados.length) {
    hoja.getRange(1, 1, 1, encabezados.length).setValues([encabezados]);
    hoja.setFrozenRows(1);
  }
  return hoja;
}

/**
 * Mapa `encabezado → índice`, exigiendo que estén todos los del esquema.
 *
 * Cuando falta alguno el error dice CUÁLES faltan y cómo arreglarlo, en vez de
 * fallar más adelante con un `undefined` sin contexto.
 */
function docHeaderIndex_(hoja, nombre) {
  var esperados = docColumnNames_(nombre);
  var ultima = hoja.getLastColumn();
  var fila = ultima > 0 ? hoja.getRange(1, 1, 1, ultima).getValues()[0] : [];
  var indice = {};
  for (var i = 0; i < fila.length; i++) {
    var enc = String(fila[i] === null || fila[i] === undefined ? '' : fila[i]).trim();
    if (enc && indice[enc] === undefined) indice[enc] = i;
  }
  var faltan = [];
  for (var e = 0; e < esperados.length; e++) {
    if (indice[esperados[e]] === undefined) faltan.push(esperados[e]);
  }
  if (faltan.length > 0) {
    throw docError_(DOC_CODE.SCHEMA_ERROR,
      'La hoja "' + nombre + '" no tiene ' + faltan.length + ' columna(s) que el backend necesita.',
      {
        hint: 'Ejecuta "reparar": añade las columnas que falten al final, sin tocar los datos.',
        details: { hoja: nombre, columnasFaltantes: faltan }
      });
  }
  return indice;
}

/** Carga una hoja de sistema completa (una sola llamada) y la deja en memoria. */
function docLoad_(nombre) {
  if (DOC_STORE.loaded[nombre]) return DOC_STORE.loaded[nombre];
  var hoja = docSheetHandle_(nombre);
  var indice = docHeaderIndex_(hoja, nombre);
  var columnas = DOC_SCHEMA[nombre].columns;
  var clave = DOC_SCHEMA[nombre].key;
  var ultimaFila = hoja.getLastRow();
  var ancho = Math.max(hoja.getLastColumn(), columnas.length);
  var filas = [];
  var porId = {};

  if (ultimaFila >= 2) {
    var valores = hoja.getRange(2, 1, ultimaFila - 1, ancho).getValues();
    docCount_('hojasLeidas');
    docCount_('filasLeidas', valores.length);
    for (var r = 0; r < valores.length; r++) {
      var crudo = valores[r];
      var vacia = true;
      for (var c = 0; c < crudo.length; c++) {
        if (crudo[c] !== '' && crudo[c] !== null && crudo[c] !== undefined) { vacia = false; break; }
      }
      if (vacia) continue;
      var obj = { __row: r + 2 };
      for (var k = 0; k < columnas.length; k++) {
        obj[columnas[k].name] = docDecodeValue_(columnas[k], crudo[indice[columnas[k].name]]);
      }
      filas.push(obj);
      var id = String(obj[clave]);
      if (id) porId[id] = obj;
    }
  } else {
    docCount_('hojasLeidas');
  }

  DOC_STORE.loaded[nombre] = {
    sheet: hoja,
    index: indice,
    width: ancho,
    rows: filas,
    byId: porId,
    nextRow: Math.max(ultimaFila + 1, 2)
  };
  return DOC_STORE.loaded[nombre];
}

/* --------------------------------- Lecturas ------------------------------- */

function docAll_(nombre) {
  return docLoad_(nombre).rows;
}

function docWhere_(nombre, campo, valor) {
  var buscado = String(valor);
  var filas = docAll_(nombre);
  var out = [];
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i][campo]) === buscado) out.push(filas[i]);
  }
  return out;
}

function docFirst_(nombre, campo, valor) {
  var filas = docWhere_(nombre, campo, valor);
  return filas.length ? filas[0] : null;
}

function docById_(nombre, id) {
  if (!id) return null;
  return docLoad_(nombre).byId[String(id)] || null;
}

function docCountRows_(nombre) {
  try {
    return docAll_(nombre).length;
  } catch (e) {
    return 0;
  }
}

/* -------------------------------- Escrituras ------------------------------ */

function docPendingFor_(nombre) {
  if (!DOC_STORE.pending[nombre]) DOC_STORE.pending[nombre] = { updates: [], appends: [] };
  return DOC_STORE.pending[nombre];
}

/** Objeto → arreglo alineado a la hoja, validando el techo de celda. */
function docEncodeRow_(nombre, obj, ancho) {
  var cargada = DOC_STORE.loaded[nombre];
  var indice = cargada.index;
  var columnas = DOC_SCHEMA[nombre].columns;
  var arr = [];
  for (var i = 0; i < ancho; i++) arr.push('');
  for (var c = 0; c < columnas.length; c++) {
    var spec = columnas[c];
    var codificado = docEncodeValue_(spec, obj[spec.name]);
    if (typeof codificado === 'string' && codificado.length > DOC_LIMITS.CELL_CHARS) {
      throw docError_(DOC_CODE.VALIDATION_ERROR,
        'El campo "' + spec.name + '" de la hoja "' + nombre + '" mide ' + codificado.length +
        ' caracteres y una celda admite ' + DOC_LIMITS.CELL_CHARS + '.',
        {
          hint: 'Acorta ese texto. Si es un expediente muy grande, reduce las observaciones.',
          details: { hoja: nombre, columna: spec.name, caracteres: codificado.length, tope: DOC_LIMITS.CELL_CHARS }
        });
    }
    arr[indice[spec.name]] = codificado;
  }
  return arr;
}

/**
 * Inserta o actualiza una entidad en una hoja de sistema.
 *
 * Actualiza también el caché en memoria: una lectura posterior dentro de la
 * misma petición ve el valor nuevo, no el anterior.
 */
function docPut_(nombre, obj) {
  var cargada = docLoad_(nombre);
  var clave = DOC_SCHEMA[nombre].key;
  var id = String(obj[clave]);
  if (!id) {
    throw docError_(DOC_CODE.INTERNAL_ERROR,
      'Se intentó escribir en "' + nombre + '" una fila sin su clave "' + clave + '".',
      { details: { hoja: nombre, clave: clave } });
  }
  var valores = docEncodeRow_(nombre, obj, cargada.width);
  var existente = cargada.byId[id];
  if (existente && existente.__row) {
    docPendingFor_(nombre).updates.push({ row: existente.__row, values: valores });
    for (var k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k) && k !== '__row') existente[k] = obj[k];
    }
    return existente;
  }
  var guardada = { __row: cargada.nextRow++ };
  var columnas = DOC_SCHEMA[nombre].columns;
  for (var c = 0; c < columnas.length; c++) guardada[columnas[c].name] = obj[columnas[c].name];
  cargada.rows.push(guardada);
  cargada.byId[id] = guardada;
  docPendingFor_(nombre).appends.push(valores);
  return guardada;
}

/**
 * Borrado real de filas de una hoja de sistema.
 *
 * Se borra de abajo hacia arriba: al eliminar una fila las de abajo suben, y
 * hacerlo al revés borraría filas equivocadas.
 */
function docPurge_(nombre, ids) {
  if (!ids || !ids.length) return 0;
  var cargada = docLoad_(nombre);
  var buscados = {};
  for (var i = 0; i < ids.length; i++) buscados[String(ids[i])] = true;
  var clave = DOC_SCHEMA[nombre].key;
  var objetivos = [];
  for (var r = 0; r < cargada.rows.length; r++) {
    if (buscados[String(cargada.rows[r][clave])]) objetivos.push(cargada.rows[r].__row);
  }
  objetivos.sort(function (a, b) { return b - a; });
  for (var t = 0; t < objetivos.length; t++) cargada.sheet.deleteRow(objetivos[t]);
  delete DOC_STORE.loaded[nombre];
  delete DOC_STORE.pending[nombre];
  return objetivos.length;
}

/** Recorta una hoja a sus N filas más recientes. Lo usa el mantenimiento. */
function docTrimSheet_(nombre, maximo) {
  var cargada = docLoad_(nombre);
  var sobran = cargada.rows.length - maximo;
  if (sobran <= 0) return 0;
  // Las filas viejas están arriba: se borran en bloque desde la fila 2.
  cargada.sheet.deleteRows(2, sobran);
  delete DOC_STORE.loaded[nombre];
  delete DOC_STORE.pending[nombre];
  return sobran;
}

/* ------------------------------- Confirmación ----------------------------- */

/**
 * Vuelca todo lo encolado.
 *
 * Las actualizaciones se agrupan por tramos de filas CONSECUTIVAS: guardar diez
 * expedientes seguidos es una sola llamada, no diez.
 */
function docCommit_() {
  var nombres = Object.keys(DOC_STORE.pending);
  var escritas = 0;
  for (var n = 0; n < nombres.length; n++) {
    var nombre = nombres[n];
    var pendiente = DOC_STORE.pending[nombre];
    var cargada = DOC_STORE.loaded[nombre];
    if (!cargada) continue;

    if (pendiente.updates.length > 0) {
      var porFila = {};
      for (var u = 0; u < pendiente.updates.length; u++) {
        porFila[pendiente.updates[u].row] = pendiente.updates[u].values;
      }
      var numeros = Object.keys(porFila).map(Number).sort(function (a, b) { return a - b; });
      var inicio = 0;
      while (inicio < numeros.length) {
        var fin = inicio;
        while (fin + 1 < numeros.length && numeros[fin + 1] === numeros[fin] + 1) fin++;
        var bloque = [];
        for (var b = inicio; b <= fin; b++) bloque.push(porFila[numeros[b]]);
        cargada.sheet.getRange(numeros[inicio], 1, bloque.length, cargada.width).setValues(bloque);
        escritas += bloque.length;
        inicio = fin + 1;
      }
    }

    if (pendiente.appends.length > 0) {
      var desde = cargada.sheet.getLastRow() + 1;
      cargada.sheet.getRange(desde, 1, pendiente.appends.length, cargada.width)
        .setValues(pendiente.appends);
      escritas += pendiente.appends.length;
    }
    DOC_STORE.pending[nombre] = { updates: [], appends: [] };
  }
  docCount_('filasEscritas', escritas);
  return escritas;
}

/** ¿Queda algo sin volcar? Lo consulta el diagnóstico. */
function docHasPendingWrites_() {
  var nombres = Object.keys(DOC_STORE.pending);
  for (var i = 0; i < nombres.length; i++) {
    var p = DOC_STORE.pending[nombres[i]];
    if (p.updates.length > 0 || p.appends.length > 0) return true;
  }
  return false;
}

/** Descarta lo encolado sin escribirlo. Se usa cuando la operación falla. */
function docRollback_() {
  DOC_STORE.pending = {};
  DOC_STORE.loaded = {};
}

/* --------------------------------- Caché ---------------------------------- */

function docCacheGet_(clave) {
  try {
    var crudo = CacheService.getScriptCache().get(clave);
    if (crudo) docCount_('cacheAciertos');
    return crudo;
  } catch (e) {
    return null;
  }
}

function docCachePut_(clave, valor, segundos) {
  try {
    if (String(valor).length > 95000) return false;
    CacheService.getScriptCache().put(clave, String(valor), segundos || 300);
    return true;
  } catch (e) {
    return false;
  }
}

function docCacheRemove_(clave) {
  try {
    CacheService.getScriptCache().remove(clave);
  } catch (e) { /* el caché es opcional */ }
}
