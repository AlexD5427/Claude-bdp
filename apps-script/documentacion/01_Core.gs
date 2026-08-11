/**
 * 01_Core.gs — errores tipados, saneado de valores, diario y contadores.
 *
 * Tres decisiones que se toman aquí y condicionan todo lo demás:
 *
 * 1. **Los errores llevan código y pista.** «Error interno» no le sirve a nadie.
 *    Cada fallo dice qué pasó (`codigo`), qué hacer (`pista`) y con qué datos
 *    (`detalle`). El enrutador los devuelve tal cual al frontend, que puede
 *    ofrecer el botón correcto: reparar, reintentar o revisar la configuración.
 *
 * 2. **Todo texto que entra se sanea antes de tocar una celda.** Un valor que
 *    empieza por `=`, `+`, `-` o `@` es una fórmula para Sheets. Si alguien
 *    escribe `=IMPORTRANGE(...)` en el nombre de una persona, la hoja lo
 *    ejecuta. Se antepone un apóstrofo, que Sheets no muestra y desactiva la
 *    interpretación.
 *
 * 3. **El diario se acumula en memoria y se vuelca una sola vez.** Escribir
 *    línea a línea multiplicaría por diez el coste de cada petición.
 */

/* --------------------------------- Errores -------------------------------- */

var DOC_CODE = {
  BAD_REQUEST: 'SOLICITUD_INVALIDA',
  UNSUPPORTED_ACTION: 'ACCION_NO_SOPORTADA',
  UNAUTHORIZED: 'NO_AUTORIZADO',
  NOT_INSTALLED: 'LIBRO_NO_INSTALADO',
  SCHEMA_ERROR: 'ESQUEMA_INCOMPLETO',
  NOT_FOUND: 'NO_ENCONTRADO',
  CONFLICT: 'CONFLICTO',
  VALIDATION_ERROR: 'VALIDACION',
  BUSY: 'LIBRO_OCUPADO',
  QUOTA: 'CUOTA_AGOTADA',
  INTERNAL_ERROR: 'ERROR_INTERNO'
};

/** Mensajes por defecto. Se usan cuando quien lanza el error no da uno propio. */
var DOC_CODE_MESSAGE = {
  SOLICITUD_INVALIDA: 'La solicitud no tiene la forma que el backend espera.',
  ACCION_NO_SOPORTADA: 'Esa acción no existe en este backend.',
  NO_AUTORIZADO: 'La llave de administración no coincide.',
  LIBRO_NO_INSTALADO: 'El libro todavía no tiene la estructura del módulo.',
  ESQUEMA_INCOMPLETO: 'El libro existe pero le faltan hojas o columnas.',
  NO_ENCONTRADO: 'No existe el registro solicitado.',
  CONFLICTO: 'Ya existe un registro con ese identificador.',
  VALIDACION: 'Los datos enviados no pasaron la validación.',
  LIBRO_OCUPADO: 'El libro está atendiendo otra escritura.',
  CUOTA_AGOTADA: 'Se agotó la cuota diaria de Google para esta operación.',
  ERROR_INTERNO: 'Ocurrió un error inesperado en el backend.'
};

/** Pistas por defecto: qué puede hacer quien recibe el error. */
var DOC_CODE_HINT = {
  LIBRO_NO_INSTALADO: 'Ejecuta la acción "instalar" o, en el libro, Documentación → Instalar o reparar.',
  ESQUEMA_INCOMPLETO: 'Ejecuta "reparar": añade lo que falte al final, sin mover ni borrar datos.',
  LIBRO_OCUPADO: 'Reintenta con el mismo solicitudId; la operación no se duplica.',
  CUOTA_AGOTADA: 'Espera unos minutos. Si se repite, reduce la frecuencia de sincronización.',
  NO_AUTORIZADO: 'Revisa la llave de administración en la configuración del módulo.'
};

/**
 * Construye un error tipado. Se lanza con `throw docError_(...)`.
 */
function docError_(codigo, mensaje, opciones) {
  var opts = opciones || {};
  var texto = mensaje || DOC_CODE_MESSAGE[codigo] || DOC_CODE_MESSAGE.ERROR_INTERNO;
  var error = new Error(texto);
  error.docCode = codigo || DOC_CODE.INTERNAL_ERROR;
  error.docHint = opts.hint || DOC_CODE_HINT[codigo] || '';
  error.docDetails = opts.details || {};
  return error;
}

/**
 * Normaliza cualquier cosa lanzada a la forma tipada.
 *
 * Los errores de la plataforma (cuota, permisos, tiempo agotado) se reconocen
 * por su mensaje y se reclasifican: son situaciones distintas con soluciones
 * distintas, y devolverlas todas como «error interno» obliga a adivinar.
 */
function docClassify_(error) {
  if (!error) {
    return { docCode: DOC_CODE.INTERNAL_ERROR, message: DOC_CODE_MESSAGE.ERROR_INTERNO, docHint: '', docDetails: {}, docStack: '' };
  }
  if (error.docCode) {
    return {
      docCode: error.docCode,
      message: String(error.message || DOC_CODE_MESSAGE[error.docCode] || ''),
      docHint: error.docHint || '',
      docDetails: error.docDetails || {},
      docStack: String(error.stack || '')
    };
  }
  var texto = String((error && error.message) || error);
  var bajo = texto.toLowerCase();
  var codigo = DOC_CODE.INTERNAL_ERROR;
  var pista = '';

  if (bajo.indexOf('quota') >= 0 || bajo.indexOf('cuota') >= 0 || bajo.indexOf('limit') >= 0) {
    codigo = DOC_CODE.QUOTA;
    pista = DOC_CODE_HINT.CUOTA_AGOTADA;
  } else if (bajo.indexOf('lock') >= 0 || bajo.indexOf('timed out') >= 0 || bajo.indexOf('timeout') >= 0) {
    codigo = DOC_CODE.BUSY;
    pista = DOC_CODE_HINT.LIBRO_OCUPADO;
  } else if (bajo.indexOf('permission') >= 0 || bajo.indexOf('permiso') >= 0 || bajo.indexOf('authoriz') >= 0) {
    codigo = DOC_CODE.UNAUTHORIZED;
    pista = 'Vuelve a autorizar el script: Apps Script → Ejecutar → Revisar permisos.';
  } else if (bajo.indexOf('not found') >= 0 || bajo.indexOf('no encontr') >= 0) {
    codigo = DOC_CODE.NOT_FOUND;
  }

  return {
    docCode: codigo,
    message: texto,
    docHint: pista,
    docDetails: {},
    docStack: String((error && error.stack) || '')
  };
}

/* -------------------------------- Utilidades ------------------------------ */

/** Marca de tiempo ISO del momento actual. */
function docNow_() {
  return new Date().toISOString();
}

/** Identificador único corto y ordenable. */
function docUid_(prefijo) {
  var base = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  return String(prefijo || 'id') + '_' + String(Date.now()) + '_' + base;
}

/** Texto crudo, recortado, sin sanear. Para identificadores y fechas ISO. */
function docRaw_(valor, maximo) {
  if (valor === null || valor === undefined) return '';
  var texto = String(valor);
  var tope = maximo || DOC_LIMITS.SHORT_TEXT;
  return texto.length > tope ? texto.slice(0, tope) : texto;
}

/**
 * Texto listo para escribirse en una celda.
 *
 * Neutraliza fórmulas y colapsa los espacios de más, que en un libro escrito a
 * mano son la causa número uno de que dos filas «iguales» no se reconozcan.
 */
function docText_(valor, maximo) {
  var texto = docRaw_(valor, maximo);
  if (!texto) return '';
  texto = texto.replace(/\u00a0/g, ' ');
  if (/^[=+\-@]/.test(texto)) texto = "'" + texto;
  return texto;
}

/** Quita el apóstrofo defensivo al leer. No forma parte del dato. */
function docUntext_(valor) {
  var texto = docRaw_(valor, DOC_LIMITS.CELL_CHARS);
  if (texto.charAt(0) === "'" && /^[=+\-@]/.test(texto.charAt(1))) return texto.slice(1);
  return texto;
}

/** Clave de comparación: sin tildes, sin espacios de más, en mayúsculas. */
function docKey_(valor) {
  var texto = String(valor === null || valor === undefined ? '' : valor);
  texto = texto.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  texto = texto
    .replace(/[ÁÀÄÂÃ]/g, 'A')
    .replace(/[ÉÈËÊ]/g, 'E')
    .replace(/[ÍÌÏÎ]/g, 'I')
    .replace(/[ÓÒÖÔÕ]/g, 'O')
    .replace(/[ÚÙÜÛ]/g, 'U')
    .replace(/Ñ/g, 'N');
  return texto;
}

/** Número o `null`. Acepta la coma decimal, que es lo que se teclea aquí. */
function docNumOrNull_(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') return isFinite(valor) ? valor : null;
  var texto = String(valor).replace(/\s/g, '').replace(',', '.');
  var n = Number(texto);
  return isFinite(n) ? n : null;
}

/** Entero con valor por defecto. */
function docInt_(valor, porDefecto) {
  var n = docNumOrNull_(valor);
  return n === null ? (porDefecto || 0) : Math.round(n);
}

/** Booleano tolerante: acepta TRUE/SI/1/X y sus contrarios. */
function docBoolOrNull_(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'boolean') return valor;
  var texto = docKey_(valor);
  if (texto === 'TRUE' || texto === 'SI' || texto === 'SÍ' || texto === '1' || texto === 'X' || texto === 'VERDADERO') return true;
  if (texto === 'FALSE' || texto === 'NO' || texto === '0' || texto === 'FALSO') return false;
  return null;
}

/** Uno de los valores permitidos, o el de reserva. */
function docEnum_(valor, permitidos, reserva) {
  var clave = docKey_(valor);
  for (var i = 0; i < permitidos.length; i++) {
    if (docKey_(permitidos[i]) === clave) return permitidos[i];
  }
  return reserva === undefined ? permitidos[0] : reserva;
}

/** JSON tolerante a basura. Nunca lanza. */
function docParseJson_(texto, reserva) {
  if (texto === null || texto === undefined || texto === '') return reserva;
  if (typeof texto === 'object') return texto;
  try {
    var v = JSON.parse(String(texto));
    return v === null || v === undefined ? reserva : v;
  } catch (e) {
    return reserva;
  }
}

/** Serializa sin explotar ante referencias circulares. */
function docWriteJson_(valor) {
  if (valor === null || valor === undefined) return '';
  try {
    return JSON.stringify(valor);
  } catch (e) {
    return '';
  }
}

/**
 * Fecha en `yyyy-mm-dd` a partir de lo que sea que traiga la celda.
 *
 * Sheets devuelve `Date` si la columna tiene formato de fecha y texto si no.
 * Y quien escribe a mano usa `dd/mm/yyyy`. Los tres casos se contemplan.
 */
function docDateOnly_(valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  if (valor instanceof Date) {
    if (isNaN(valor.getTime())) return '';
    return docFormatDate_(valor);
  }
  var texto = String(valor).trim();
  var iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
  var latino = texto.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (latino) {
    var anio = latino[3].length === 2 ? '20' + latino[3] : latino[3];
    return anio + '-' + docPad2_(latino[2]) + '-' + docPad2_(latino[1]);
  }
  var d = new Date(texto);
  return isNaN(d.getTime()) ? '' : docFormatDate_(d);
}

function docFormatDate_(d) {
  return d.getFullYear() + '-' + docPad2_(d.getMonth() + 1) + '-' + docPad2_(d.getDate());
}

function docPad2_(n) {
  var s = String(n);
  return s.length >= 2 ? s : '0' + s;
}

/** Marca de tiempo ISO a partir de lo que traiga la celda. */
function docIsoFromCell_(valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  if (valor instanceof Date) return isNaN(valor.getTime()) ? '' : valor.toISOString();
  if (valor && typeof valor.getTime === 'function') return new Date(valor.getTime()).toISOString();
  return docRaw_(valor, 40);
}

/** Año (número) de una fecha `yyyy-mm-dd`, o el año en curso si no hay. */
function docYearOf_(fecha) {
  var solo = docDateOnly_(fecha);
  if (solo) {
    var n = parseInt(solo.slice(0, 4), 10);
    if (n >= 2000 && n <= 2999) return n;
  }
  return new Date().getFullYear();
}

/** Nombre de la pestaña anual de un año. */
function docYearSheetName_(anio) {
  return DOC_YEAR_PREFIX + String(anio);
}

/** ¿Es el nombre de una pestaña anual? Devuelve el año o `0`. */
function docYearFromSheetName_(nombre) {
  var texto = String(nombre || '').trim();
  if (texto.indexOf(DOC_YEAR_PREFIX) !== 0) return 0;
  var n = parseInt(texto.slice(DOC_YEAR_PREFIX.length).trim(), 10);
  return (n >= 2000 && n <= 2999) ? n : 0;
}

/**
 * Huella corta y estable de un texto.
 *
 * Sirve para saber si una fila cambió sin comparar 38 celdas. No es criptografía
 * y no pretende serlo: es un detector de cambios barato.
 */
function docHash_(texto) {
  var s = String(texto === null || texto === undefined ? '' : texto);
  var h1 = 0x811c9dc5;
  var h2 = 0x01000193;
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    h1 = (h1 ^ c) >>> 0;
    h1 = (h1 * 16777619) >>> 0;
    h2 = (h2 + c * (i + 1)) >>> 0;
  }
  return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
}

/** Lee una propiedad del script. */
function docProp_(clave, porDefecto) {
  try {
    var v = PropertiesService.getScriptProperties().getProperty(clave);
    return v === null || v === undefined ? porDefecto : v;
  } catch (e) {
    return porDefecto;
  }
}

/** Escribe una propiedad del script. */
function docSetProp_(clave, valor) {
  try {
    PropertiesService.getScriptProperties().setProperty(clave, String(valor));
    return true;
  } catch (e) {
    return false;
  }
}

/* ------------------------- Diario, traza y contadores --------------------- */

var DOC_LOG = {
  traza: '',
  accion: '',
  inicio: 0,
  lineas: [],
  contadores: {}
};

/** Empieza una petición: traza nueva, cronómetro a cero, diario limpio. */
function docLogReset_(accion) {
  DOC_LOG.traza = docUid_('tz');
  DOC_LOG.accion = String(accion || '');
  DOC_LOG.inicio = Date.now();
  DOC_LOG.lineas = [];
  DOC_LOG.contadores = {};
}

function docTraceId_() {
  if (!DOC_LOG.traza) DOC_LOG.traza = docUid_('tz');
  return DOC_LOG.traza;
}

function docElapsedMs_() {
  return DOC_LOG.inicio ? (Date.now() - DOC_LOG.inicio) : 0;
}

function docCount_(clave, cuanto) {
  var n = cuanto === undefined ? 1 : cuanto;
  DOC_LOG.contadores[clave] = (DOC_LOG.contadores[clave] || 0) + n;
}

function docCounters_() {
  var out = {};
  for (var k in DOC_LOG.contadores) {
    if (Object.prototype.hasOwnProperty.call(DOC_LOG.contadores, k)) out[k] = DOC_LOG.contadores[k];
  }
  return out;
}

function docLog_(nivel, mensaje, datos) {
  DOC_LOG.lineas.push({
    id: docUid_('log'),
    momento: docNow_(),
    nivel: nivel,
    accion: DOC_LOG.accion,
    mensaje: docRaw_(mensaje, 2000),
    datos_json: datos || null,
    traza: docTraceId_()
  });
  try {
    if (nivel === 'error') console.error('[documentacion] ' + mensaje);
    else if (nivel === 'warn') console.warn('[documentacion] ' + mensaje);
  } catch (e) { /* consola no disponible en algunos contextos */ }
}

function docInfo_(mensaje, datos) { docLog_('info', mensaje, datos); }
function docWarn_(mensaje, datos) { docLog_('warn', mensaje, datos); }
function docErrorLog_(mensaje, datos) { docLog_('error', mensaje, datos); }

/**
 * Vuelca el diario a la hoja `_DIARIO`.
 *
 * Va protegido de principio a fin: si el diario no se puede escribir, la
 * operación real ya ocurrió y no tiene sentido tumbarla por un registro.
 */
function docFlushLog_() {
  if (!DOC_LOG.lineas.length) return 0;
  var pendientes = DOC_LOG.lineas.slice();
  DOC_LOG.lineas = [];
  try {
    for (var i = 0; i < pendientes.length; i++) {
      docPut_(DOC_SHEET.DIARIO, pendientes[i]);
    }
    return pendientes.length;
  } catch (e) {
    return 0;
  }
}
