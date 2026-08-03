/**
 * 15_Integrity.gs — rastro de integridad del intento.
 *
 * ── Qué se registra y por qué ────────────────────────────────────────────────
 * Una prueba sin supervisión presencial no se puede «vigilar», pero sí se puede
 * DOCUMENTAR. Este archivo guarda la secuencia de lo que ocurrió durante el
 * intento para que quien revise el resultado tenga contexto en lugar de una nota
 * suelta:
 *
 *   cambio de pestaña, pérdida de foco, copiar, pegar, cortar, menú contextual,
 *   entrada y salida de pantalla completa, cambio de tamaño de ventana,
 *   navegación entre preguntas, pausas anormalmente largas, intentos de
 *   recargar, reconexiones y el envío final (manual o automático).
 *
 * Cada evento tiene una SEVERIDAD:
 *   info    forma parte del uso normal (navegar, redimensionar).
 *   aviso   merece una mirada (pegar texto corto, salir del foco un instante).
 *   alerta  es lo que un revisor querrá ver primero (pegar un texto largo,
 *           ausencias prolongadas, muchos cambios de pestaña).
 *
 * El **riesgo de integridad** es la suma ponderada de las alertas y los avisos,
 * acotada a 100. No es un veredicto: es un ordenador de la cola de revisión. El
 * informe siempre muestra los eventos concretos, porque un número sin su rastro
 * no permite tomar ninguna decisión justa.
 *
 * Nada de esto identifica al candidato más allá de lo que él mismo escribió: no
 * se guardan capturas, ni contenido del portapapeles, ni la dirección IP (que
 * Apps Script tampoco expone). De un pegado se guarda la LONGITUD, no el texto.
 */

/** Catálogo de eventos: severidad y peso en el riesgo. */
var EV_EVENTOS = {
  inicio:                 { severidad: 'info',   peso: 0 },
  pregunta_vista:         { severidad: 'info',   peso: 0 },
  pregunta_respondida:    { severidad: 'info',   peso: 0 },
  seccion_cambiada:       { severidad: 'info',   peso: 0 },
  ventana_redimensionada: { severidad: 'info',   peso: 0 },
  guardado:               { severidad: 'info',   peso: 0 },
  reconexion:             { severidad: 'aviso',  peso: 2 },
  pantalla_completa_on:   { severidad: 'info',   peso: 0 },
  pantalla_completa_off:  { severidad: 'aviso',  peso: 3 },
  foco_perdido:           { severidad: 'aviso',  peso: 2 },
  foco_recuperado:        { severidad: 'info',   peso: 0 },
  pestana_oculta:         { severidad: 'alerta', peso: 6 },
  pestana_visible:        { severidad: 'info',   peso: 0 },
  copiar:                 { severidad: 'aviso',  peso: 3 },
  cortar:                 { severidad: 'aviso',  peso: 3 },
  pegar:                  { severidad: 'alerta', peso: 8 },
  menu_contextual:        { severidad: 'aviso',  peso: 1 },
  impresion:              { severidad: 'alerta', peso: 8 },
  captura_sospechosa:     { severidad: 'alerta', peso: 6 },
  inactividad:            { severidad: 'aviso',  peso: 2 },
  ausencia_prolongada:    { severidad: 'alerta', peso: 10 },
  recarga:                { severidad: 'aviso',  peso: 4 },
  salida_intentada:       { severidad: 'aviso',  peso: 2 },
  envio_manual:           { severidad: 'info',   peso: 0 },
  envio_automatico:       { severidad: 'info',   peso: 0 },
  expirado:               { severidad: 'info',   peso: 0 }
};

/** Detalle admitido por evento: lista blanca, para no guardar contenido sensible. */
var EV_EVENTO_DETALLE = ['caracteres', 'segundos', 'desde', 'hacia', 'ancho', 'alto', 'veces', 'origen'];

function evSanitizeEventDetail_(detail) {
  var out = {};
  if (!detail || typeof detail !== 'object') return out;
  for (var i = 0; i < EV_EVENTO_DETALLE.length; i++) {
    var key = EV_EVENTO_DETALLE[i];
    var value = detail[key];
    if (value === undefined || value === null || value === '') continue;
    out[key] = typeof value === 'number' ? Math.round(value) : evText_(value, 140);
  }
  return out;
}

/**
 * Convierte los eventos que manda el runner en filas listas para guardar.
 *
 * `desde` es la secuencia más alta ya registrada: los eventos con secuencia menor
 * o igual se descartan, así que reenviar el mismo lote (por una reconexión) no
 * duplica nada.
 */
function evPrepareEvents_(attempt, events, desde, now) {
  var source = Array.isArray(events) ? events : [];
  if (source.length > EV_LIMITS.EVENTS_PER_REQUEST) source = source.slice(0, EV_LIMITS.EVENTS_PER_REQUEST);
  var iniciadoMs = evToMs_(attempt.iniciado_en) || evNowMs_();
  var rows = [];
  var maxSecuencia = desde;

  for (var i = 0; i < source.length; i++) {
    var raw = source[i] || {};
    var tipo = evText_(raw.tipo, 60);
    var catalogo = EV_EVENTOS[tipo];
    if (!catalogo) continue;
    var secuencia = evClampInt_(raw.secuencia, 1, 1000000, 0);
    if (secuencia <= desde) continue;
    if (secuencia > maxSecuencia) maxSecuencia = secuencia;

    var ocurridoMs = evToMs_(raw.ocurridoEn);
    var ocurridoEn = ocurridoMs === null ? now : evFromMs_(ocurridoMs);
    rows.push({
      // Determinista por intento y secuencia: reenvíos idempotentes por diseño.
      id: 'evt_' + attempt.id + '_' + secuencia,
      intento_id: attempt.id,
      evaluacion_id: attempt.evaluacion_id,
      secuencia: secuencia,
      tipo: tipo,
      severidad: catalogo.severidad,
      pregunta_id: evRaw_(raw.preguntaId, 140),
      ocurrido_en: ocurridoEn,
      segundos_desde_inicio: ocurridoMs === null
        ? evClampInt_(raw.segundosDesdeInicio, 0, 86400, 0)
        : Math.max(0, Math.round((ocurridoMs - iniciadoMs) / 1000)),
      duracion_ms: evClampInt_(raw.duracionMs, 0, 86400000, 0),
      detalle_json: evWriteJson_(evSanitizeEventDetail_(raw.detalle)),
      registrado_en: now
    });
  }
  return { rows: rows, maxSecuencia: maxSecuencia };
}

/**
 * Resumen de integridad de un intento: conteos por tipo, por severidad y riesgo.
 *
 * Se guarda materializado en el intento para que el listado de resultados no
 * tenga que leer la hoja de eventos completa. Con menos de diez candidatos por
 * prueba la diferencia es pequeña, pero el listado se abre muchas veces y el
 * coste de mantenerlo es una sola columna.
 */
function evIntegritySummary_(events, policy) {
  var porTipo = {};
  var porSeveridad = { info: 0, aviso: 0, alerta: 0 };
  var riesgo = 0;
  var caracteresPegados = 0;
  var segundosFuera = 0;
  var vecesFuera = 0;

  for (var i = 0; i < events.length; i++) {
    var event = events[i];
    var tipo = String(event.tipo);
    var catalogo = EV_EVENTOS[tipo] || { severidad: 'info', peso: 0 };
    porTipo[tipo] = (porTipo[tipo] || 0) + 1;
    porSeveridad[catalogo.severidad] = (porSeveridad[catalogo.severidad] || 0) + 1;
    riesgo += catalogo.peso;

    var detalle = event.detalle || evParseJson_(event.detalle_json, {}) || {};
    if (tipo === 'pegar') caracteresPegados += evInt_(detalle.caracteres, 0);
    if (tipo === 'pestana_oculta' || tipo === 'foco_perdido' || tipo === 'ausencia_prolongada') {
      vecesFuera++;
      segundosFuera += Math.round(evInt_(event.duracionMs || event.duracion_ms, 0) / 1000);
    }
  }

  // Un pegado largo pesa mucho más que uno corto: pegar cuarenta caracteres puede
  // ser un dato copiado del propio enunciado; pegar mil es traer una respuesta de
  // fuera. La escala se calibró para que ese caso, por sí solo, llegue a «alto».
  riesgo += Math.min(40, Math.floor(caracteresPegados / 50));
  riesgo += Math.min(25, Math.floor(segundosFuera / 20));
  riesgo = Math.max(0, Math.min(100, Math.round(riesgo)));

  var umbral = evClampInt_((policy || {}).umbralRiesgo, 1, 100, 5);
  var nivel = 'bajo';
  if (porSeveridad.alerta >= umbral || riesgo >= 40) nivel = 'alto';
  else if (porSeveridad.alerta > 0 || porSeveridad.aviso >= umbral || riesgo >= 12) nivel = 'medio';

  return {
    riesgo: riesgo,
    nivel: nivel,
    total: events.length,
    porSeveridad: porSeveridad,
    porTipo: porTipo,
    caracteresPegados: caracteresPegados,
    segundosFueraDeFoco: segundosFuera,
    vecesFueraDeFoco: vecesFuera
  };
}

/** Eventos de un intento, ordenados cronológicamente. */
function evAttemptEvents_(attemptId) {
  var rows = evWhere_(EV_SHEET.INTEGRIDAD, 'intento_id', attemptId);
  rows.sort(function (a, b) { return evInt_(a.secuencia, 0) - evInt_(b.secuencia, 0); });
  var out = [];
  for (var i = 0; i < rows.length; i++) out.push(evIntegrityEventFromRow_(rows[i]));
  return out;
}

/** Secuencia más alta registrada para un intento. */
function evMaxEventSequence_(attemptId) {
  var rows = evWhere_(EV_SHEET.INTEGRIDAD, 'intento_id', attemptId);
  var max = 0;
  for (var i = 0; i < rows.length; i++) {
    var seq = evInt_(rows[i].secuencia, 0);
    if (seq > max) max = seq;
  }
  return max;
}

/**
 * Registra un lote de eventos y devuelve el resumen actualizado.
 *
 * Si el intento ya acumuló el máximo de eventos, los nuevos se descartan pero el
 * hecho se anota: un intento con miles de eventos ya dice todo lo que tenía que
 * decir, y seguir escribiendo solo consumiría cuota.
 */
function evRecordEvents_(attempt, events, policy, now) {
  var yaRegistrados = evWhere_(EV_SHEET.INTEGRIDAD, 'intento_id', attempt.id);
  if (yaRegistrados.length >= EV_LIMITS.EVENTS_PER_ATTEMPT) {
    evWarn_('Intento con el máximo de eventos de integridad; se descartan los nuevos.', {
      intento: attempt.id, registrados: yaRegistrados.length
    });
    return evIntegritySummary_(yaRegistrados, policy);
  }
  var desde = 0;
  for (var i = 0; i < yaRegistrados.length; i++) {
    var seq = evInt_(yaRegistrados[i].secuencia, 0);
    if (seq > desde) desde = seq;
  }
  var prepared = evPrepareEvents_(attempt, events, desde, now);
  if (prepared.rows.length > 0) {
    evPutAll_(EV_SHEET.INTEGRIDAD, prepared.rows);
  }
  return evIntegritySummary_(yaRegistrados.concat(prepared.rows), policy);
}
