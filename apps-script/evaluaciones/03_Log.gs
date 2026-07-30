/**
 * 03_Log.gs — diario de diagnóstico con trazas correlacionadas.
 *
 * Dos destinos, deliberadamente distintos:
 *
 *   1. `console.*` → los registros de ejecución de Apps Script. Siempre. Es
 *      gratis, no consume cuota de escritura y sobrevive incluso si el libro está
 *      inaccesible (que es justo cuando más falta hace un registro).
 *   2. la hoja `Registro` → para que el diagnóstico se pueda leer desde la
 *      interfaz del ATS, sin abrir el editor de Apps Script.
 *
 * Las entradas se ACUMULAN en memoria durante la petición y se escriben en un
 * solo lote al final. Escribir cada línea en el momento multiplicaría por diez
 * las llamadas a Sheets y arruinaría el tiempo de respuesta; además, un error a
 * mitad de la petición dejaría un diario incoherente.
 *
 * Nada sensible entra aquí: ni llaves, ni tokens de intento, ni respuestas de
 * candidatos, ni datos personales. Se registran identificadores y conteos.
 */

var EV_LOG_LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

/** Estado de la petición en curso. `evLogReset_()` lo reinicia. */
var EV_LOG_STATE = {
  traceId: '',
  action: '',
  buffer: [],
  counters: { sheetsRead: 0, rowsRead: 0, rowsWritten: 0, cacheHits: 0 },
  startedMs: 0
};

/** Nivel mínimo que llega a la hoja. */
function evLogThreshold_() {
  var configured = String(evProp_(EV_PROP.LOG_LEVEL, 'info')).toLowerCase();
  return EV_LOG_LEVELS[configured] || EV_LOG_LEVELS.info;
}

/** Abre una traza nueva. Devuelve su identificador. */
function evLogReset_(action) {
  EV_LOG_STATE.traceId = 'tz_' + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  EV_LOG_STATE.action = String(action || '');
  EV_LOG_STATE.buffer = [];
  EV_LOG_STATE.counters = { sheetsRead: 0, rowsRead: 0, rowsWritten: 0, cacheHits: 0 };
  EV_LOG_STATE.startedMs = evNowMs_();
  return EV_LOG_STATE.traceId;
}

/** Identificador de la traza en curso. */
function evTraceId_() {
  return EV_LOG_STATE.traceId;
}

/** Milisegundos transcurridos desde el inicio de la traza. */
function evElapsedMs_() {
  return EV_LOG_STATE.startedMs ? evNowMs_() - EV_LOG_STATE.startedMs : 0;
}

/** Contadores de la petición (los alimenta la capa de almacenamiento). */
function evCounters_() {
  return EV_LOG_STATE.counters;
}

function evCount_(key, amount) {
  if (EV_LOG_STATE.counters[key] === undefined) EV_LOG_STATE.counters[key] = 0;
  EV_LOG_STATE.counters[key] += (amount === undefined ? 1 : amount);
}

/** Registra una línea. `context` debe ser pequeño y no sensible. */
function evLog_(level, message, context, stack) {
  var normalized = EV_LOG_LEVELS[level] ? level : 'info';
  var line = '[evaluaciones][' + normalized + '][' + EV_LOG_STATE.traceId + ']'
    + (EV_LOG_STATE.action ? '[' + EV_LOG_STATE.action + '] ' : ' ')
    + String(message);

  try {
    if (normalized === 'error') console.error(line, context || {});
    else if (normalized === 'warn') console.warn(line, context || {});
    else console.log(line, context || {});
  } catch (e) { /* sin consola disponible: seguimos */ }

  if (EV_LOG_LEVELS[normalized] < evLogThreshold_()) return;
  if (EV_LOG_STATE.buffer.length >= 200) return; // tope defensivo por petición
  EV_LOG_STATE.buffer.push({
    id: evNewId_(EV_ID.REGISTRO),
    ocurrido_en: evNow_(),
    nivel: normalized,
    traza_id: EV_LOG_STATE.traceId,
    accion: EV_LOG_STATE.action,
    mensaje: evRaw_(message, 2000),
    contexto_json: evWriteJson_(context || {}),
    pila: evRaw_(stack || '', 4000)
  });
}

function evDebug_(message, context) { evLog_('debug', message, context); }
function evInfo_(message, context) { evLog_('info', message, context); }
function evWarn_(message, context) { evLog_('warn', message, context); }
function evErrorLog_(message, context, stack) { evLog_('error', message, context, stack); }

/** Entradas acumuladas y aún no escritas. */
function evLogBuffer_() {
  return EV_LOG_STATE.buffer;
}

/** Descarta el búfer (lo llama el volcado tras escribirlo). */
function evLogClearBuffer_() {
  EV_LOG_STATE.buffer = [];
}
