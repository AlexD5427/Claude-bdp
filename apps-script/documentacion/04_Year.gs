/**
 * 04_Year.gs — la traducción entre una fila del libro y un expediente.
 *
 * Esta es la pieza delicada del backend, porque tiene que sostener una promesa
 * incómoda: **los mismos datos se pueden editar desde dos sitios**. Desde la web
 * (donde un expediente son 31 documentos con estado, páginas y observación) y
 * desde Sheets (donde son 14 celdas que dicen TIENE o N/A).
 *
 * ── Cómo se resuelve el conflicto ─────────────────────────────────────────
 * Con dos reglas y una columna:
 *
 *   1. La columna `DETALLE JSON` guarda el expediente completo. Es la fuente
 *      rica: nada de lo que hace el frontend se pierde al pasar por la hoja.
 *   2. Las columnas del libro (J..W) se DERIVAN del expediente… salvo que
 *      alguien las haya escrito a mano. Lo escrito a mano gana siempre y se
 *      recuerda en `sheet` dentro del JSON.
 *
 * La consecuencia práctica es la que se busca: si la persona abre Sheets y
 * cambia un «N/A» por «TIENE», el sistema no se lo pisa en la próxima
 * sincronización. Y si lo cambia desde la web, la celda se actualiza sola.
 *
 * ── El encabezado duplicado ──────────────────────────────────────────────
 * «CONTRATO DE FIANZA» aparece en la M y en la R. Buscar por nombre devolvería
 * siempre la primera y la segunda quedaría huérfana. Por eso el índice cuenta
 * apariciones: la M es la ocurrencia 1 y la R la 2.
 */

/** Caché por petición de las pestañas anuales cargadas. */
var DOC_YEARS = {};

function docYearsReset_() {
  DOC_YEARS = {};
}

/* ------------------------------ Índice de columnas ------------------------ */

/**
 * Mapa `clave interna → índice 0-based` de una pestaña anual.
 *
 * Cuenta apariciones del encabezado para resolver los duplicados. Si una columna
 * no aparece, se marca como ausente y quien escriba la omitirá: preferimos
 * guardar de menos a romper la fila entera.
 */
function docYearIndex_(hoja) {
  var ultima = hoja.getLastColumn();
  var crudo = ultima > 0 ? hoja.getRange(1, 1, 1, ultima).getValues()[0] : [];
  var vistos = {};
  var porEncabezado = {};
  for (var i = 0; i < crudo.length; i++) {
    var clave = docKey_(crudo[i]);
    if (!clave) continue;
    vistos[clave] = (vistos[clave] || 0) + 1;
    porEncabezado[clave + '#' + vistos[clave]] = i;
  }
  var columnas = docYearColumns_();
  var indice = {};
  var faltan = [];
  for (var c = 0; c < columnas.length; c++) {
    var col = columnas[c];
    var buscada = docKey_(col.encabezado) + '#' + (col.ocurrencia || 1);
    if (porEncabezado[buscada] !== undefined) {
      indice[col.clave] = porEncabezado[buscada];
    } else {
      faltan.push(col.encabezado);
    }
  }
  return { indice: indice, faltan: faltan, ancho: Math.max(ultima, columnas.length) };
}

/* -------------------------------- Carga ----------------------------------- */

/**
 * Carga una pestaña anual entera en memoria.
 *
 * Si la hoja no existe y `crear` es cierto, se crea con su formato. Si no,
 * devuelve `null`: consultar un año que nadie ha usado todavía no es un error.
 */
function docLoadYear_(anio, crear) {
  var clave = String(anio);
  if (DOC_YEARS[clave]) return DOC_YEARS[clave];

  var ss = docSpreadsheet_();
  var nombre = docYearSheetName_(anio);
  var hoja = ss.getSheetByName(nombre);
  if (!hoja) {
    if (!crear) return null;
    docEnsureYearSheet_(anio);
    hoja = ss.getSheetByName(nombre);
    if (!hoja) return null;
  }

  var mapa = docYearIndex_(hoja);
  if (mapa.faltan.length && crear) {
    docEnsureYearSheet_(anio);
    mapa = docYearIndex_(hoja);
  }

  var ultimaFila = hoja.getLastRow();
  var filas = [];
  var porId = {};
  var porNombre = {};

  if (ultimaFila >= 2) {
    var valores = hoja.getRange(2, 1, ultimaFila - 1, mapa.ancho).getValues();
    docCount_('hojasLeidas');
    docCount_('filasLeidas', valores.length);
    for (var r = 0; r < valores.length; r++) {
      var registro = docReadYearRow_(valores[r], mapa.indice, r + 2, anio);
      if (!registro) continue;
      filas.push(registro);
      if (registro.id) porId[registro.id] = registro;
      var kn = docKey_(registro.nombre);
      if (kn && !porNombre[kn]) porNombre[kn] = registro;
    }
  } else {
    docCount_('hojasLeidas');
  }

  DOC_YEARS[clave] = {
    anio: Number(anio),
    sheet: hoja,
    index: mapa.indice,
    width: mapa.ancho,
    rows: filas,
    byId: porId,
    byName: porNombre,
    nextRow: Math.max(ultimaFila + 1, 2),
    pending: { updates: [], appends: [], colors: [] }
  };
  return DOC_YEARS[clave];
}

/**
 * Convierte una fila cruda en un registro.
 *
 * Las filas totalmente vacías se descartan. Las que tienen nombre pero no `ID
 * EXPEDIENTE` —las 900 filas históricas que la persona escribió antes de que
 * existiera este módulo— se conservan y se les inventa un identificador
 * derivado del nombre, para que se puedan leer, buscar y auditar sin tener que
 * migrarlas a mano.
 */
function docReadYearRow_(crudo, indice, numeroFila, anio) {
  var columnas = docYearColumns_();
  var vacia = true;
  for (var v = 0; v < crudo.length; v++) {
    if (crudo[v] !== '' && crudo[v] !== null && crudo[v] !== undefined) { vacia = false; break; }
  }
  if (vacia) return null;

  var reg = { __row: numeroFila, __anio: Number(anio) };
  for (var c = 0; c < columnas.length; c++) {
    var col = columnas[c];
    var pos = indice[col.clave];
    var valor = pos === undefined ? '' : crudo[pos];
    if (col.clave === 'fecha_ingreso' || col.clave === 'prorroga_hasta') {
      reg[col.clave] = docDateOnly_(valor);
    } else if (col.tipo === 'int') {
      reg[col.clave] = docNumOrNull_(valor) === null ? 0 : docInt_(valor, 0);
    } else if (col.tipo === 'json') {
      reg[col.clave] = docParseJson_(valor, null);
    } else {
      reg[col.clave] = docUntext_(valor);
    }
  }

  if (!reg.nombre && !reg.id) return null;
  reg.__heredada = !reg.id;
  if (!reg.id) reg.id = docLegacyId_(reg.nombre, anio, numeroFila);
  return reg;
}

/**
 * Identificador para las filas históricas que no lo tienen.
 *
 * Determinista: la misma fila produce siempre el mismo identificador, así que
 * se puede referenciar entre sesiones sin escribir nada en la hoja.
 */
function docLegacyId_(nombre, anio, numeroFila) {
  var base = docKey_(nombre) || ('FILA' + numeroFila);
  return 'HIST-' + anio + '-' + docHash_(base).slice(0, 8);
}

/* -------------------------------- Escritura ------------------------------- */

/** Codifica un registro a un arreglo alineado con la hoja. */
function docEncodeYearRow_(cargada, registro) {
  var columnas = docYearColumns_();
  var arr = [];
  for (var i = 0; i < cargada.width; i++) arr.push('');
  for (var c = 0; c < columnas.length; c++) {
    var col = columnas[c];
    var pos = cargada.index[col.clave];
    if (pos === undefined) continue;
    var valor = registro[col.clave];
    var codificado;
    if (col.tipo === 'int') {
      codificado = docNumOrNull_(valor) === null ? '' : docInt_(valor, 0);
    } else if (col.tipo === 'json') {
      codificado = typeof valor === 'string' ? valor : docWriteJson_(valor);
    } else if (col.tipo === 'id') {
      codificado = docRaw_(valor, 200);
    } else {
      codificado = docText_(valor, col.clave === 'observacion' ? 4000 : DOC_LIMITS.SHORT_TEXT);
    }
    if (typeof codificado === 'string' && codificado.length > DOC_LIMITS.CELL_CHARS) {
      throw docError_(DOC_CODE.VALIDATION_ERROR,
        'La columna "' + col.encabezado.replace(/\n/g, ' ') + '" mide ' + codificado.length +
        ' caracteres y una celda admite ' + DOC_LIMITS.CELL_CHARS + '.',
        {
          hint: 'Reduce el texto. Si es el detalle del expediente, acorta las observaciones de los documentos.',
          details: { columna: col.clave, caracteres: codificado.length }
        });
    }
    arr[pos] = codificado;
  }
  return arr;
}

/** Inserta o actualiza un registro en la pestaña de su año. */
function docYearPut_(anio, registro) {
  var cargada = docLoadYear_(anio, true);
  if (!cargada) {
    throw docError_(DOC_CODE.SCHEMA_ERROR,
      'No se pudo abrir ni crear la pestaña ' + docYearSheetName_(anio) + '.',
      { details: { anio: anio } });
  }
  var id = String(registro.id || '');
  if (!id) {
    throw docError_(DOC_CODE.VALIDATION_ERROR,
      'El expediente no tiene identificador.',
      { hint: 'El identificador es CI - Número de proceso - Año.', details: { campo: 'id' } });
  }
  var valores = docEncodeYearRow_(cargada, registro);
  var existente = cargada.byId[id];

  if (existente && existente.__row) {
    cargada.pending.updates.push({ row: existente.__row, values: valores });
    for (var k in registro) {
      if (Object.prototype.hasOwnProperty.call(registro, k) && k !== '__row') existente[k] = registro[k];
    }
    cargada.pending.colors.push({ row: existente.__row, registro: existente });
    return existente;
  }

  var guardado = { __row: cargada.nextRow++, __anio: Number(anio) };
  var columnas = docYearColumns_();
  for (var c = 0; c < columnas.length; c++) guardado[columnas[c].clave] = registro[columnas[c].clave];
  guardado.id = id;
  cargada.rows.push(guardado);
  cargada.byId[id] = guardado;
  var kn = docKey_(guardado.nombre);
  if (kn) cargada.byName[kn] = guardado;
  cargada.pending.appends.push(valores);
  cargada.pending.colors.push({ row: guardado.__row, registro: guardado });
  return guardado;
}

/** Borra un expediente de su pestaña anual. Devuelve `true` si borró algo. */
function docYearDelete_(anio, id) {
  var cargada = docLoadYear_(anio, false);
  if (!cargada) return false;
  var existente = cargada.byId[String(id)];
  if (!existente || !existente.__row) return false;
  cargada.sheet.deleteRow(existente.__row);
  delete DOC_YEARS[String(anio)];
  return true;
}

/**
 * Vuelca lo encolado de todas las pestañas anuales.
 *
 * Mismo criterio que el motor de hojas de sistema: tramos contiguos en una sola
 * llamada. Los colores se aplican después, también agrupados por fila.
 */
function docYearsCommit_() {
  var escritas = 0;
  for (var clave in DOC_YEARS) {
    if (!Object.prototype.hasOwnProperty.call(DOC_YEARS, clave)) continue;
    var cargada = DOC_YEARS[clave];
    var pend = cargada.pending;
    if (!pend) continue;

    if (pend.updates.length > 0) {
      var porFila = {};
      for (var u = 0; u < pend.updates.length; u++) porFila[pend.updates[u].row] = pend.updates[u].values;
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

    if (pend.appends.length > 0) {
      var desde = cargada.sheet.getLastRow() + 1;
      docEnsureRows_(cargada.sheet, desde + pend.appends.length + 20);
      cargada.sheet.getRange(desde, 1, pend.appends.length, cargada.width).setValues(pend.appends);
      escritas += pend.appends.length;
    }

    for (var cIdx = 0; cIdx < pend.colors.length; cIdx++) {
      docPaintYearRow_(cargada, pend.colors[cIdx].row, pend.colors[cIdx].registro);
    }

    cargada.pending = { updates: [], appends: [], colors: [] };
  }
  docCount_('filasEscritas', escritas);
  return escritas;
}

/* --------------------------- Semántica de colores ------------------------- */

/**
 * Color de fondo de una fila, siguiendo la convención del libro original.
 *
 * El orden de las comprobaciones importa: una prórroga vigente manda sobre
 * «atrasado» porque el atraso está justificado y no hay que perseguir a nadie.
 */
function docRowTone_(registro) {
  var estado = String(registro.estado || '');
  var avance = docInt_(registro.avance, 0);
  var presentados = docInt_(registro.presentados, 0);
  var observados = docInt_(registro.observados, 0);

  if (estado === 'completo' || avance >= 100) return DOC_COLOR.FILA_COMPLETA;
  if (registro.prorroga_hasta) return DOC_COLOR.FILA_PRORROGA;
  if (estado === 'atrasado') return DOC_COLOR.CF_MAL_BG;
  if (observados > 0) return DOC_COLOR.FILA_GESTION;
  if (presentados === 0) return DOC_COLOR.FILA_NUEVA;
  if (avance >= 60) return DOC_COLOR.FILA_PARCIAL;
  return DOC_COLOR.FILA_NUEVA;
}

/**
 * Pinta una fila.
 *
 * Se respetan dos excepciones del libro original: la columna «Proceso» conserva
 * su azul claro (encima actúa el formato condicional) y la celda de observación
 * se pone amarilla cuando tiene texto, que es exactamente lo que hace la persona
 * a mano para marcar «esto hay que leerlo».
 */
function docPaintYearRow_(cargada, numeroFila, registro) {
  try {
    var tono = docRowTone_(registro);
    cargada.sheet.getRange(numeroFila, 1, 1, cargada.width).setBackground(tono);

    var iProceso = docYearColumnPosition_('proceso');
    if (iProceso > 0) {
      cargada.sheet.getRange(numeroFila, iProceso).setBackground(DOC_COLOR.PROCESO_BG);
    }

    var iObs = docYearColumnPosition_('observacion');
    if (iObs > 0) {
      var tieneObs = String(registro.observacion || '').trim() !== '';
      cargada.sheet.getRange(numeroFila, iObs)
        .setBackground(tieneObs ? DOC_COLOR.FILA_OBSERVADA : tono);
    }
    docCount_('filasPintadas');
  } catch (e) { /* el color es cosmético; el dato ya está guardado */ }
}

/* ---------------------- Derivación de columnas del libro ------------------ */

/**
 * Valor que le toca a una columna de documento según el checklist.
 *
 * `overrides` es lo que la persona escribió a mano; si hay algo ahí, se respeta
 * y no se discute.
 */
function docDeriveColumn_(col, items, overrides, hayProrroga) {
  var manual = overrides && Object.prototype.hasOwnProperty.call(overrides, col.clave)
    ? String(overrides[col.clave] === null || overrides[col.clave] === undefined ? '' : overrides[col.clave])
    : null;
  if (manual !== null && manual !== '') return manual;

  if (col.derivada === 'prorroga') {
    return hayProrroga ? DOC_VALORES.TIENE : DOC_VALORES.GUION;
  }

  if (col.items && col.items.length) {
    var encontrados = 0;
    var presentados = 0;
    var noAplica = 0;
    var conProrroga = 0;
    for (var i = 0; i < col.items.length; i++) {
      var item = items[col.items[i]];
      if (!item) continue;
      encontrados++;
      if (item.status === 'presentado') presentados++;
      else if (item.status === 'no_aplica') noAplica++;
      if (item.prorroga) conProrroga++;
    }
    if (encontrados === 0) return manual === null ? (col.porDefecto || DOC_VALORES.GUION) : manual;
    if (noAplica === encontrados) return DOC_VALORES.NA;
    if (presentados + noAplica === encontrados) return DOC_VALORES.TIENE;
    if (conProrroga > 0) return DOC_VALORES.PRORROGA;
    return DOC_VALORES.NO_TIENE;
  }

  if (manual !== null) return manual;
  return col.porDefecto || '';
}

/**
 * Calcula de una vez todas las columnas de documento del libro.
 *
 * La columna espejo («CONTRATO DE FIANZA» de la R) copia a su original salvo que
 * tenga valor propio: en el libro real llevan años con el mismo contenido, y
 * mantenerlas sincronizadas solas evita una fuente clásica de discrepancias.
 */
function docSheetValuesFor_(dossier) {
  var items = {};
  var lista = dossier.items || [];
  var hayProrroga = false;
  for (var i = 0; i < lista.length; i++) {
    items[lista[i].id] = lista[i];
    if (lista[i].prorroga) hayProrroga = true;
  }
  var overrides = dossier.sheet || {};
  var docs = docDocumentColumns_();
  var out = {};
  for (var d = 0; d < docs.length; d++) {
    if (docs[d].espejoDe) continue;
    out[docs[d].clave] = docDeriveColumn_(docs[d], items, overrides, hayProrroga);
  }
  for (var e = 0; e < docs.length; e++) {
    if (!docs[e].espejoDe) continue;
    var propio = overrides && overrides[docs[e].clave];
    out[docs[e].clave] = (propio === undefined || propio === null || propio === '')
      ? (out[docs[e].espejoDe] || '')
      : String(propio);
  }
  return out;
}
