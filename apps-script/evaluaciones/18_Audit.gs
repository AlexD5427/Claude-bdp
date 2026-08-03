/**
 * 18_Audit.gs — auditoría de negocio, métricas y volcado del diario.
 *
 * Tres registros con propósitos distintos, y conviene no confundirlos:
 *
 *   Auditoria  QUÉ pasó en el negocio: quién publicó, quién anuló un intento,
 *              quién borró una evaluación. Se conserva siempre y se lee cuando
 *              hay que responder «¿quién hizo esto?».
 *   Metricas   CUÁNTO costó: milisegundos, filas leídas, filas escritas, aciertos
 *              de caché. Es lo que permite decir «guardar tarda 380 ms» en lugar
 *              de «va lento».
 *   Registro   POR QUÉ falló: el diario de diagnóstico con niveles y trazas.
 *
 * Los tres se escriben en el MISMO volcado al final de la petición, así que las
 * tres hojas cuestan una sola tanda de llamadas a Sheets.
 */

/** Anota una entrada de auditoría. Nunca lanza: auditar no puede tumbar la operación. */
function evAudit_(context, accion, entidad, entidadId, resultado, metadatos) {
  try {
    evPut_(EV_SHEET.AUDITORIA, {
      id: evNewId_(EV_ID.AUDITORIA),
      traza_id: evTraceId_(),
      solicitud_id: evText_(context && context.requestId, 140),
      accion: evText_(accion, 80),
      entidad: evText_(entidad, 40),
      entidad_id: evRaw_(entidadId, 140),
      actor: evText_(context && context.actor, 200),
      cliente: evText_(context && context.cliente, 120),
      resultado: evText_(resultado, 20),
      codigo_error: '',
      milisegundos: evElapsedMs_(),
      metadatos_json: evWriteJson_(metadatos || {}),
      ocurrido_en: evNow_()
    });
  } catch (error) {
    evWarn_('No se pudo anotar la auditoría.', { accion: accion, motivo: String(error && error.message) });
  }
}

/** Auditoría de un fallo, con su código de error. */
function evAuditFailure_(context, accion, entidad, entidadId, codigo, mensaje) {
  try {
    evPut_(EV_SHEET.AUDITORIA, {
      id: evNewId_(EV_ID.AUDITORIA),
      traza_id: evTraceId_(),
      solicitud_id: evText_(context && context.requestId, 140),
      accion: evText_(accion, 80),
      entidad: evText_(entidad, 40),
      entidad_id: evRaw_(entidadId, 140),
      actor: evText_(context && context.actor, 200),
      cliente: evText_(context && context.cliente, 120),
      resultado: 'error',
      codigo_error: evText_(codigo, 40),
      milisegundos: evElapsedMs_(),
      metadatos_json: evWriteJson_({ mensaje: evRaw_(mensaje, 500) }),
      ocurrido_en: evNow_()
    });
  } catch (error) { /* ya estamos en el camino de error */ }
}

/** ¿Se escriben métricas? */
function evMetricsEnabled_() {
  return String(evProp_(EV_PROP.METRICS_ENABLED, 'true')) !== 'false';
}

/** Anota la métrica de la acción. */
function evMetric_(accion, resultado) {
  if (!evMetricsEnabled_()) return;
  try {
    var counters = evCounters_();
    evPut_(EV_SHEET.METRICAS, {
      id: evNewId_(EV_ID.METRICA),
      ocurrido_en: evNow_(),
      accion: evText_(accion, 80),
      resultado: evText_(resultado, 20),
      milisegundos: evElapsedMs_(),
      hojas_leidas: counters.sheetsRead,
      filas_leidas: counters.rowsRead,
      filas_escritas: counters.rowsWritten,
      lecturas_cache: counters.cacheHits
    });
  } catch (error) { /* las métricas son accesorias */ }
}

/**
 * Vuelca el diario a la hoja `Registro`.
 *
 * Se hace al final y en un intento separado del resto: si el volcado falla (por
 * ejemplo porque el libro ya no está accesible), la respuesta al cliente no debe
 * cambiar. Los mismos mensajes ya están en `console.*`, así que no se pierden.
 */
function evFlushLog_() {
  var buffer = evLogBuffer_();
  if (buffer.length === 0) return 0;
  try {
    evPutAll_(EV_SHEET.REGISTRO, buffer);
    evLogClearBuffer_();
    return buffer.length;
  } catch (error) {
    try { console.warn('[evaluaciones] no se pudo volcar el diario: ' + (error && error.message)); }
    catch (e) { /* nada más que hacer */ }
    return 0;
  }
}

/* ------------------------------- Idempotencia ----------------------------- */

/**
 * ¿Se procesó ya esta solicitud?
 *
 * Toda escritura llega con un `requestId`. Si ya está registrado, el efecto NO se
 * repite: se devuelve la referencia de la primera ejecución. Esto protege contra
 * el doble clic, los reintentos manuales y los reenvíos del runner cuando la red
 * falla justo después de escribir.
 */
function evFindProcessed_(requestId) {
  if (!requestId) return null;
  return evById_(EV_SHEET.SOLICITUDES, requestId);
}

function evRecordProcessed_(requestId, accion, referencia, actor, resumen) {
  if (!requestId) return;
  evPut_(EV_SHEET.SOLICITUDES, {
    solicitud_id: requestId,
    accion: evText_(accion, 80),
    referencia: evRaw_(referencia, 140),
    actor: evText_(actor, 200),
    resultado_json: evWriteJson_(resumen || {}),
    procesado_en: evNow_()
  });
}
