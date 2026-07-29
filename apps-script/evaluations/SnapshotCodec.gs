/**
 * SnapshotCodec.gs — cómo viaja un snapshot publicado hasta una celda de Sheets.
 *
 * ¿Por qué existe este archivo?
 *
 * `publishAssessment` congela el borrador en un snapshot inmutable y lo guarda
 * en `Versions.snapshot_json`. Una celda de Google Sheets admite como máximo
 * 50 000 caracteres, y el snapshot de una evaluación de 20 preguntas con 4
 * opciones cada una ocupa unos 51 300. Es decir: el formato anterior tenía un
 * techo real de ~16 preguntas, y al pasarlo `setValues` lanzaba un `Error`
 * genérico de Sheets que el enrutador traducía a INTERNAL_ERROR.
 *
 * La solución es comprimir el snapshot cuando hace falta. gzip sobre este JSON
 * (claves repetidas, ids con prefijo común, fechas idénticas) reduce el tamaño
 * unas 20 veces, así que el techo pasa de ~16 preguntas a varios centenares.
 *
 * Reglas del formato:
 *
 *   · Si el JSON plano cabe con holgura, se guarda TAL CUAL. Así los snapshots
 *     pequeños siguen siendo legibles a ojo desde la hoja, que es lo que usa
 *     soporte para diagnosticar, y los libros existentes no necesitan migrarse.
 *   · Si no cabe, se guarda `EVALGZ1:` + gzip + base64.
 *   · El lector reconoce ambos formatos. No hay columna nueva ni cambio de
 *     encabezados: la codificación viaja dentro del propio valor, de modo que
 *     esta mejora NO requiere migrar ninguna hoja.
 *
 * `snapshot_schema_version` sigue describiendo el esquema LÓGICO del snapshot
 * (qué campos contiene), no cómo se transporta. Son dos cosas distintas y
 * conviene no mezclarlas.
 */

/** Marca de un snapshot comprimido. */
var EVAL_SNAPSHOT_GZIP_PREFIX = 'EVALGZ1:';

/**
 * Umbral para decidir si se guarda en claro. Deliberadamente por debajo del
 * límite duro de 50 000: deja margen para que una celda nunca quede al borde.
 */
var EVAL_SNAPSHOT_PLAIN_MAX = 40000;

/**
 * Serializa el snapshot para guardarlo en la celda.
 *
 * Devuelve el texto ya listo para `Versions.snapshot_json`. Si ni comprimido
 * cabe, lanza VALIDATION_ERROR con el tamaño real, para que el reclutador reciba
 * un mensaje accionable en vez de un INTERNAL_ERROR opaco.
 */
function evalEncodeSnapshot_(snapshotJson) {
  var text = String(snapshotJson);
  if (text.length <= EVAL_SNAPSHOT_PLAIN_MAX) return text;

  var compressed = EVAL_SNAPSHOT_GZIP_PREFIX + Utilities.base64Encode(
    Utilities.gzip(Utilities.newBlob(text, 'application/json', 'snapshot.json')).getBytes()
  );
  if (compressed.length > EVAL_CONFIG.LIMITS.MAX_CELL_CHARS) {
    throw evalError_('VALIDATION_ERROR',
      'La evaluación es demasiado grande para publicarse: el contenido congelado no cabe ' +
      'en una celda de la hoja de cálculo ni comprimido. Divide la evaluación en varias ' +
      'más pequeñas.',
      {
        path: 'questions',
        plainCharacters: text.length,
        compressedCharacters: compressed.length,
        limit: EVAL_CONFIG.LIMITS.MAX_CELL_CHARS
      });
  }
  return compressed;
}

/**
 * Devuelve el JSON del snapshot a partir del valor guardado en la celda.
 *
 * Acepta los dos formatos y NUNCA lanza: un snapshot ilegible debe comportarse
 * como «no hay snapshot» (el llamador responde NOT_FOUND), no tumbar la lectura.
 * Devuelve `null` cuando no se puede recuperar.
 */
function evalDecodeSnapshot_(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'object') return raw;
  var text = String(raw);
  if (text.indexOf(EVAL_SNAPSHOT_GZIP_PREFIX) !== 0) {
    return evalParseJson_(text, null);
  }
  try {
    var bytes = Utilities.base64Decode(text.slice(EVAL_SNAPSHOT_GZIP_PREFIX.length));
    var json = Utilities
      .ungzip(Utilities.newBlob(bytes, 'application/x-gzip', 'snapshot.gz'))
      .getDataAsString('UTF-8');
    return evalParseJson_(json, null);
  } catch (error) {
    return null;
  }
}
