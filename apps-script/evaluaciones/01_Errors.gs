/**
 * 01_Errors.gs — errores tipados, accionables y trazables.
 *
 * El backend anterior devolvía `INTERNAL_ERROR` con el texto «Ocurrió un error
 * inesperado» ante cualquier imprevisto. Eso convertía cada incidencia en una
 * investigación a ciegas. Aquí un error lleva SIEMPRE cuatro cosas:
 *
 *   code      qué clase de problema es (estable, para que el cliente decida).
 *   message   qué pasó, en español, sin rastros de pila ni rutas internas.
 *   hint      qué hacer a continuación. Es lo que convierte un error en una
 *             instrucción: «Ejecuta Evaluaciones → Instalar o reparar».
 *   details   datos no sensibles para la pantalla de diagnóstico (hoja, columna,
 *             conteos, identificadores).
 *
 * Además, todo error se correlaciona con la hoja `Registro` mediante `traceId`,
 * de modo que quien ve el mensaje en la interfaz puede buscar la entrada exacta
 * del diario con la pila completa.
 */

var EV_CODE = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNSUPPORTED_ACTION: 'UNSUPPORTED_ACTION',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMITED: 'RATE_LIMITED',
  NOT_INSTALLED: 'NOT_INSTALLED',
  SCHEMA_ERROR: 'SCHEMA_ERROR',
  BUSY: 'BUSY',
  EXPIRED: 'EXPIRED',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
};

/** Mensaje y pista por omisión de cada código. */
var EV_CODE_DEFAULTS = {
  BAD_REQUEST: {
    message: 'La solicitud no tiene la forma esperada.',
    hint: 'Revisa que la acción y la carga sean las documentadas en API.md.'
  },
  UNSUPPORTED_ACTION: {
    message: 'La acción solicitada no existe en este backend.',
    hint: 'Puede que el frontend sea más nuevo que el script. Vuelve a copiar los archivos .gs y despliega otra vez.'
  },
  VALIDATION_ERROR: {
    message: 'Los datos enviados no cumplen las reglas de la evaluación.',
    hint: 'Revisa el detalle: indica exactamente qué campo y qué pregunta lo provocan.'
  },
  NOT_FOUND: {
    message: 'El registro solicitado no existe.',
    hint: 'Actualiza el listado: puede haberse eliminado o archivado desde otra sesión.'
  },
  CONFLICT: {
    message: 'Otra sesión modificó esta evaluación después de que la abriste.',
    hint: 'Vuelve a cargarla para no perder el trabajo de la otra sesión y guarda de nuevo.'
  },
  FORBIDDEN: {
    message: 'La llave de administración no es válida.',
    hint: 'Compruébala en Evaluaciones → Conexión. Debe coincidir con la propiedad EV_ADMIN_KEY del script.'
  },
  RATE_LIMITED: {
    message: 'Se recibieron demasiadas solicitudes en poco tiempo.',
    hint: 'Espera unos segundos y vuelve a intentarlo.'
  },
  NOT_INSTALLED: {
    message: 'El libro de cálculo todavía no tiene la estructura de Evaluaciones.',
    hint: 'Abre el libro y ejecuta Evaluaciones → Instalar o reparar. También puedes llamar a la acción "install".'
  },
  SCHEMA_ERROR: {
    message: 'La estructura del libro no coincide con la que espera el backend.',
    hint: 'Ejecuta Evaluaciones → Diagnóstico para ver qué hoja o columna falta, y después Reparar.'
  },
  BUSY: {
    message: 'El libro está ocupado atendiendo otra escritura.',
    hint: 'Vuelve a intentarlo: la operación es idempotente y no se duplicará.'
  },
  EXPIRED: {
    message: 'El tiempo de la prueba terminó.',
    hint: 'La prueba se envió automáticamente con las respuestas registradas hasta ese momento.'
  },
  INTERNAL_ERROR: {
    message: 'El backend encontró un error que no supo clasificar.',
    hint: 'Se registró en la hoja Registro con su identificador de traza; ábrela para ver la causa exacta.'
  }
};

/**
 * Construye un error tipado.
 *
 * @param {string} code    Uno de EV_CODE.
 * @param {string} message Texto para la persona. Vacío ⇒ el de por omisión.
 * @param {Object} options `{ hint, details }`.
 */
function evError_(code, message, options) {
  var safe = EV_CODE_DEFAULTS[code] ? code : EV_CODE.INTERNAL_ERROR;
  var defaults = EV_CODE_DEFAULTS[safe];
  var opts = options || {};
  var error = new Error(message || defaults.message);
  error.evCode = safe;
  error.evHint = opts.hint || defaults.hint;
  error.evDetails = opts.details || {};
  return error;
}

/** ¿Es un error nuestro (ya clasificado)? */
function evIsError_(error) {
  return !!(error && error.evCode && EV_CODE_DEFAULTS[error.evCode]);
}

/**
 * Clasifica cualquier excepción.
 *
 * Los errores de la propia plataforma llegan como `Error` con textos conocidos.
 * Reconocerlos aquí es lo que evita que un problema perfectamente diagnosticable
 * («la celda excede 50 000 caracteres», «se superó el tiempo de ejecución») se
 * presente como un genérico INTERNAL_ERROR.
 */
function evClassify_(error) {
  if (evIsError_(error)) return error;
  var text = String((error && error.message) || error || '');

  if (/more than the maximum of 50000 characters/i.test(text)) {
    return evError_(EV_CODE.VALIDATION_ERROR,
      'Un valor supera el máximo de 50 000 caracteres que admite una celda de Google Sheets.',
      {
        hint: 'Acorta el texto de la pregunta o divídela. El contenido publicado ya se trocea automáticamente; si ves esto en el borrador, hay un campo suelto demasiado largo.',
        details: { platformLimit: EV_LIMITS.CELL_CHARS, source: 'sheets' }
      });
  }
  if (/exceeded maximum execution time/i.test(text)) {
    return evError_(EV_CODE.BUSY,
      'La operación superó el tiempo máximo de ejecución de Apps Script.',
      {
        hint: 'Suele indicar demasiadas filas acumuladas. Ejecuta Evaluaciones → Mantenimiento → Podar registro y vuelve a intentarlo.',
        details: { source: 'apps-script' }
      });
  }
  if (/service invoked too many times|too many changes/i.test(text)) {
    return evError_(EV_CODE.RATE_LIMITED,
      'Google limitó temporalmente las escrituras del script.',
      { hint: 'Espera un minuto y reintenta. La idempotencia impide que se dupliquen los efectos.', details: { source: 'quota' } });
  }
  if (/you do not have permission|no tienes permiso/i.test(text)) {
    return evError_(EV_CODE.FORBIDDEN,
      'El script no tiene permiso para abrir el libro de cálculo.',
      {
        hint: 'Vuelve a autorizar el script desde el editor de Apps Script y comprueba la propiedad EV_SPREADSHEET_ID.',
        details: { source: 'permissions' }
      });
  }
  if (/openById|not found|no se encontró/i.test(text) && /spreadsheet/i.test(text)) {
    return evError_(EV_CODE.SCHEMA_ERROR,
      'No se pudo abrir el libro de cálculo indicado.',
      {
        hint: 'Revisa la propiedad EV_SPREADSHEET_ID; debe ser el identificador del libro, no su URL completa.',
        details: { source: 'spreadsheet' }
      });
  }

  var classified = evError_(EV_CODE.INTERNAL_ERROR, '', { details: { raw: text.slice(0, 400) } });
  classified.evStack = (error && error.stack) ? String(error.stack).slice(0, 4000) : '';
  return classified;
}

/**
 * Un hallazgo de validación. La lista de hallazgos es lo que permite que la
 * interfaz enlace cada problema con el campo que lo causa, en lugar de mostrar
 * un párrafo.
 */
function evIssue_(code, message, path, details) {
  return {
    code: String(code),
    message: String(message),
    /** Ruta al campo: p. ej. `preguntas.qst_a.opciones`. */
    path: String(path || ''),
    details: details || {}
  };
}

/** Lanza VALIDATION_ERROR con la lista completa de hallazgos. */
function evThrowIssues_(message, issues) {
  throw evError_(EV_CODE.VALIDATION_ERROR, message, {
    hint: issues.length === 1
      ? 'Corrige el punto señalado y vuelve a intentarlo.'
      : 'La lista incluye los ' + issues.length + ' puntos que hay que corregir.',
    details: { issues: issues }
  });
}
