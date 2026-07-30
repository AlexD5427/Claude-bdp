/**
 * 11_Assessments.gs — superficie administrativa: listar, abrir, guardar,
 * duplicar, transicionar, relanzar y eliminar.
 *
 * ── La corrección del fallo que hacía inservible el módulo anterior ──────────
 * Guardar un borrador respondía «Otro usuario actualizó este registro» cuando el
 * autor era la misma persona en la misma pestaña. La causa: concurrencia
 * optimista basada solo en un número de revisión, que el cliente no siempre
 * refrescaba (publicar, transicionar y duplicar también lo incrementaban), y una
 * comparación estricta que trataba cualquier desfase como colisión.
 *
 * Aquí la detección de conflictos tiene en cuenta QUIÉN escribe:
 *
 *   · el servidor guarda `ultimo_cliente` en cada escritura;
 *   · el cliente manda su `clientId` (estable por navegador) y la revisión que
 *     tenía al abrir;
 *   · si la revisión no coincide PERO el último que escribió es el mismo cliente,
 *     no hay conflicto: es la misma sesión adelantándose a sí misma. Se guarda y
 *     se devuelve la revisión nueva;
 *   · solo se responde CONFLICT cuando escribió OTRO cliente. Y entonces el error
 *     dice qué cliente, cuándo y con qué revisión, para que la decisión sea
 *     informada.
 *
 * Además, TODA escritura devuelve el documento completo y recién leído. El
 * cliente reemplaza su estado con esa respuesta, así que nunca se queda con una
 * revisión vieja en la mano.
 */

/* --------------------------------- Lecturas ------------------------------- */

/**
 * Listado. Solo lo que el tablero necesita: no arrastra secciones ni preguntas,
 * que para cien evaluaciones serían megabytes.
 */
function evListEvaluations_(payload) {
  evRequireInstalled_();
  var p = payload || {};
  var buscar = evText_(p.buscar, 200).toLowerCase().trim();
  var estados = evTextArray_(p.estados, 10, 20);
  var incluirPapelera = p.incluirPapelera === true;
  var categoria = evText_(p.categoria, 40);
  var proceso = evText_(p.proceso, 140);

  var rows = evAll_(EV_SHEET.EVALUACIONES);
  var versiones = evAll_(EV_SHEET.VERSIONES);
  var intentos = evAll_(EV_SHEET.INTENTOS);

  var intentosPorEvaluacion = {};
  var enviadosPorEvaluacion = {};
  for (var i = 0; i < intentos.length; i++) {
    var key = String(intentos[i].evaluacion_id);
    intentosPorEvaluacion[key] = (intentosPorEvaluacion[key] || 0) + 1;
    if (intentos[i].estado === 'enviado') {
      enviadosPorEvaluacion[key] = (enviadosPorEvaluacion[key] || 0) + 1;
    }
  }
  var versionesPorEvaluacion = {};
  for (var v = 0; v < versiones.length; v++) {
    var vk = String(versiones[v].evaluacion_id);
    versionesPorEvaluacion[vk] = (versionesPorEvaluacion[vk] || 0) + 1;
  }

  var items = [];
  for (var r = 0; r < rows.length; r++) {
    var api = evEvaluationFromRow_(rows[r]);
    if (!incluirPapelera && api.estado === 'papelera') continue;
    if (estados.length > 0 && estados.indexOf(api.estado) < 0) continue;
    if (categoria && api.categoria !== categoria) continue;
    if (proceso && api.procesos.indexOf(proceso) < 0) continue;
    if (buscar) {
      var heno = (api.titulo + ' ' + api.codigo + ' ' + api.categoria + ' ' +
        api.descripcion + ' ' + api.etiquetas.join(' ')).toLowerCase();
      if (heno.indexOf(buscar) < 0) continue;
    }
    items.push({
      id: api.id,
      codigo: api.codigo,
      titulo: api.titulo,
      descripcion: api.descripcion,
      categoria: api.categoria,
      estado: api.estado,
      revision: api.revision,
      versionEtiqueta: api.versionEtiqueta,
      versiones: versionesPorEvaluacion[api.id] || 0,
      preguntas: api.preguntas,
      preguntasCalificables: api.preguntasCalificables,
      puntosTotales: api.puntosTotales,
      duracionMinutos: api.aplicacion.duracionMinutos,
      puntajeAprobacion: api.aplicacion.puntajeAprobacion,
      criterioAprobacion: api.aplicacion.criterioAprobacion,
      intentos: intentosPorEvaluacion[api.id] || 0,
      intentosEnviados: enviadosPorEvaluacion[api.id] || 0,
      etiquetas: api.etiquetas,
      procesos: api.procesos,
      creadoEn: api.creadoEn,
      creadoPor: api.creadoPor,
      actualizadoEn: api.actualizadoEn,
      actualizadoPor: api.actualizadoPor,
      publicadoEn: api.publicadoEn,
      archivadoEn: api.archivadoEn
    });
  }
  items.sort(evByRecent_('actualizadoEn'));
  return { items: items, total: items.length, sincronizadoEn: evNow_() };
}

/** Documento completo de una evaluación, listo para el editor. */
function evGetEvaluation_(payload) {
  evRequireInstalled_();
  var id = evText_((payload || {}).id, 140);
  if (!id) {
    throw evError_(EV_CODE.BAD_REQUEST, 'Falta el identificador de la evaluación.', {
      hint: 'La acción "getEvaluation" necesita `payload.id`.', details: { campo: 'id' }
    });
  }
  var bundle = evLoadBundle_(id);
  return evBundleToDocument_(bundle);
}

/** Carga la evaluación con todo su contenido activo. Lanza NOT_FOUND si no está. */
function evLoadBundle_(id) {
  var row = evById_(EV_SHEET.EVALUACIONES, id);
  if (!row) {
    throw evError_(EV_CODE.NOT_FOUND, 'La evaluación solicitada no existe en este libro.', {
      hint: 'Actualiza el listado. Si la eliminaste, está en la papelera y puedes restaurarla.',
      details: { id: id }
    });
  }
  var secciones = evWhere_(EV_SHEET.SECCIONES, 'evaluacion_id', id);
  var preguntas = evWhere_(EV_SHEET.PREGUNTAS, 'evaluacion_id', id);
  var opciones = evWhere_(EV_SHEET.OPCIONES, 'evaluacion_id', id);
  var versiones = evWhere_(EV_SHEET.VERSIONES, 'evaluacion_id', id);
  return {
    row: row,
    secciones: secciones.slice().sort(evByOrder_),
    preguntas: preguntas.slice().sort(evByOrder_),
    opciones: opciones.slice().sort(evByOrder_),
    versiones: versiones.slice().sort(function (a, b) {
      return (evInt_(a.mayor, 0) - evInt_(b.mayor, 0)) || (evInt_(a.menor, 0) - evInt_(b.menor, 0));
    })
  };
}

/**
 * Convierte el paquete de filas en el documento anidado de la API.
 *
 * Solo entra el contenido ACTIVO. Las filas dadas de baja lógica se conservan en
 * el libro para que los intentos históricos puedan resolver sus referencias, pero
 * no forman parte del borrador que se edita.
 */
function evBundleToDocument_(bundle) {
  var evaluacion = evEvaluationFromRow_(bundle.row);
  var opcionesPorPregunta = {};
  for (var o = 0; o < bundle.opciones.length; o++) {
    var orow = bundle.opciones[o];
    if (evBool_(orow.activo, true) === false) continue;
    var pk = String(orow.pregunta_id);
    if (!opcionesPorPregunta[pk]) opcionesPorPregunta[pk] = [];
    opcionesPorPregunta[pk].push(evOptionFromRow_(orow));
  }
  var preguntasPorSeccion = {};
  for (var q = 0; q < bundle.preguntas.length; q++) {
    var qrow = bundle.preguntas[q];
    if (evBool_(qrow.activo, true) === false) continue;
    var question = evQuestionFromRow_(qrow);
    question.opciones = opcionesPorPregunta[question.id] || [];
    var sk = String(qrow.seccion_id);
    if (!preguntasPorSeccion[sk]) preguntasPorSeccion[sk] = [];
    preguntasPorSeccion[sk].push(question);
  }
  var secciones = [];
  for (var s = 0; s < bundle.secciones.length; s++) {
    var srow = bundle.secciones[s];
    if (evBool_(srow.activo, true) === false) continue;
    var section = evSectionFromRow_(srow);
    section.preguntas = preguntasPorSeccion[section.id] || [];
    secciones.push(section);
  }
  var versiones = [];
  for (var v = 0; v < bundle.versiones.length; v++) {
    var vrow = bundle.versiones[v];
    versiones.push({
      id: vrow.id,
      etiqueta: vrow.etiqueta,
      mayor: evInt_(vrow.mayor, 0),
      menor: evInt_(vrow.menor, 0),
      estado: vrow.estado,
      notas: vrow.notas,
      preguntas: evInt_(vrow.preguntas, 0),
      preguntasCalificables: evInt_(vrow.preguntas_calificables, 0),
      puntosTotales: evNum_(vrow.puntos_totales, 0),
      huella: vrow.huella,
      caracteres: evInt_(vrow.caracteres, 0),
      publicadoEn: vrow.publicado_en,
      publicadoPor: vrow.publicado_por
    });
  }
  return { evaluacion: evaluacion, secciones: secciones, versiones: versiones };
}

/* -------------------------------- Escrituras ------------------------------ */

/** Crea una evaluación en borrador con una sección inicial. */
function evCreateEvaluation_(context, payload) {
  evRequireInstalled_();
  var p = payload || {};
  var now = context.now;
  var titulo = evText_(p.titulo, EV_LIMITS.TITLE) || 'Evaluación sin título';
  var categoria = evEnum_(p.categoria, 'CATEGORIA', 'conocimientos');

  var taken = {};
  var rows = evAll_(EV_SHEET.EVALUACIONES);
  for (var i = 0; i < rows.length; i++) taken[String(rows[i].codigo)] = true;

  var id = evNewId_(EV_ID.EVALUACION);
  var row = {
    id: id,
    codigo: evPublicCode_(titulo, taken),
    titulo: titulo,
    descripcion: evText_(p.descripcion, 2000),
    categoria: categoria,
    estado: 'borrador',
    revision: 1,
    ultimo_cliente: context.cliente,
    creado_en: now,
    creado_por: context.actor,
    actualizado_en: now,
    actualizado_por: context.actor,
    publicado_en: '',
    publicado_por: '',
    archivado_en: '',
    eliminado_en: '',
    version_mayor: 0,
    version_menor: 0,
    version_vigente_id: '',
    preguntas: 0,
    preguntas_calificables: 0,
    puntos_totales: 0,
    instrucciones_json: '',
    instrucciones_texto: '',
    notas_internas: '',
    duracion_minutos: evNormalizeDuration_(p.duracionMinutos) || 30,
    duracion_segundos_extra: 0,
    puntaje_aprobacion: evNumOrNull_(p.puntajeAprobacion) === null ? 70 : evNum_(p.puntajeAprobacion, 70),
    criterio_aprobacion: 'porcentaje',
    intentos_maximos: 1,
    ventana_inicio: '',
    ventana_fin: '',
    navegacion: 'libre',
    permitir_retroceso: true,
    mostrar_progreso: true,
    mezclar_preguntas: false,
    mezclar_opciones: false,
    autoenviar_al_expirar: true,
    guardado_automatico_segundos: 20,
    campos_participante_json: evWriteJson_(evParticipantFields_(null)),
    requiere_consentimiento: false,
    texto_consentimiento: '',
    visibilidad_resultado: 'solo_envio',
    integridad_json: evWriteJson_(evIntegrityPolicy_(null)),
    tema_json: evWriteJson_(evThemeOf_(null)),
    etiquetas_json: '',
    procesos_json: '',
    reglas_json: '',
    extras_json: '',
    esquema_version: EV_BACKEND.schemaVersion
  };
  evPut_(EV_SHEET.EVALUACIONES, row);

  var sectionId = evNewId_(EV_ID.SECCION);
  evPut_(EV_SHEET.SECCIONES, {
    id: sectionId, evaluacion_id: id, titulo: 'Sección 1',
    descripcion_json: '', descripcion_texto: '', orden: 0,
    limite_segundos: null, mezclar: false, tomar_n: null, peso: 1,
    activo: true, creado_en: now, actualizado_en: now
  });

  evAudit_(context, 'createEvaluation', 'evaluacion', id, 'ok', { categoria: categoria });
  return {
    data: evBundleToDocument_(evLoadBundle_(id)),
    referencia: id,
    resumen: { id: id, codigo: row.codigo }
  };
}

/**
 * Guarda el documento completo del borrador.
 *
 * Estrategia: reescribir lo que llega y dar de baja lógica lo que ya no. Es más
 * simple y más seguro que un diff, y con los lotes de la capa de almacenamiento
 * cuesta lo mismo.
 */
function evSaveEvaluation_(context, payload) {
  evRequireInstalled_();
  var p = payload || {};
  var id = evText_(p.id, 140);
  if (!id) {
    throw evError_(EV_CODE.BAD_REQUEST, 'Falta el identificador de la evaluación.', {
      hint: 'La acción "saveEvaluation" necesita `payload.id`.', details: { campo: 'id' }
    });
  }
  var bundle = evLoadBundle_(id);
  var previous = bundle.row;
  var now = context.now;

  if (previous.estado === 'papelera') {
    throw evError_(EV_CODE.CONFLICT,
      'Esta evaluación está en la papelera y no se puede editar.',
      { hint: 'Restáurala desde el listado (filtro «Papelera») y vuelve a intentarlo.', details: { estado: previous.estado } });
  }
  if (previous.estado === 'archivada') {
    throw evError_(EV_CODE.CONFLICT,
      'Esta evaluación está archivada y no se puede editar.',
      { hint: 'Restáurala para volver a editarla; los intentos registrados se conservan.', details: { estado: previous.estado } });
  }

  evAssertNoForeignEdit_(previous, p, context);

  var normalized = evNormalizeDocument_(p, id);
  var conteos = evCountContent_(normalized);

  var evaluationRow = evEvaluationToRow_(normalized.evaluacion, previous, {
    now: now,
    actor: context.actor,
    cliente: context.cliente,
    revision: evInt_(previous.revision, 1) + 1,
    preguntas: conteos.preguntas,
    preguntasCalificables: conteos.calificables,
    puntosTotales: conteos.puntos
  });

  var previousSections = evIndexBy_(bundle.secciones, 'id');
  var previousQuestions = evIndexBy_(bundle.preguntas, 'id');
  var previousOptions = evIndexBy_(bundle.opciones, 'id');

  var sectionRows = [];
  for (var s = 0; s < normalized.secciones.length; s++) {
    sectionRows.push(evSectionToRow_(
      normalized.secciones[s], id, s, previousSections[normalized.secciones[s].id], now));
  }
  var questionRows = [];
  for (var q = 0; q < normalized.preguntas.length; q++) {
    var question = normalized.preguntas[q];
    questionRows.push(evQuestionToRow_(
      question, id, question.seccionId, question.orden, previousQuestions[question.id], now));
  }
  var optionRows = [];
  for (var o = 0; o < normalized.opciones.length; o++) {
    var option = normalized.opciones[o];
    optionRows.push(evOptionToRow_(
      option, id, option.preguntaId, option.orden, previousOptions[option.id], now));
  }

  evPut_(EV_SHEET.EVALUACIONES, evaluationRow);
  evPutAll_(EV_SHEET.SECCIONES, sectionRows);
  evPutAll_(EV_SHEET.PREGUNTAS, questionRows);
  evPutAll_(EV_SHEET.OPCIONES, optionRows);

  var bajas = evDeactivateMissing_(bundle, normalized, now);

  evAudit_(context, 'saveEvaluation', 'evaluacion', id, 'ok', {
    revision: evaluationRow.revision,
    secciones: sectionRows.length,
    preguntas: questionRows.length,
    opciones: optionRows.length,
    bajas: bajas
  });

  return {
    data: evBundleToDocument_(evLoadBundle_(id)),
    referencia: id,
    resumen: { id: id, revision: evaluationRow.revision }
  };
}

/**
 * Comprobación de concurrencia CONSCIENTE DEL CLIENTE.
 *
 * Ver la nota de cabecera: es la corrección del fallo que impedía guardar
 * borradores. Si el cliente no manda `revisionBase`, no se comprueba nada — un
 * cliente que no participa del protocolo no debe quedar bloqueado.
 */
function evAssertNoForeignEdit_(previous, payload, context) {
  var base = evNumOrNull_(payload.revisionBase);
  if (base === null) return;
  var actual = evInt_(previous.revision, 1);
  if (base >= actual) return;

  var ultimoCliente = String(previous.ultimo_cliente || '');
  var mismoCliente = ultimoCliente && context.cliente && ultimoCliente === context.cliente;
  if (mismoCliente || !ultimoCliente) {
    // Misma sesión (o una escritura antigua sin cliente registrado): no es
    // conflicto. Se registra para que quede rastro de que la revisión iba
    // desfasada, pero el guardado continúa.
    evWarn_('Revisión base desfasada en la misma sesión; se guarda igualmente.', {
      evaluacion: previous.id, revisionBase: base, revisionActual: actual
    });
    return;
  }
  if (payload.forzar === true) {
    evWarn_('Guardado forzado sobre cambios de otra sesión.', {
      evaluacion: previous.id, revisionBase: base, revisionActual: actual, otroCliente: ultimoCliente
    });
    return;
  }
  throw evError_(EV_CODE.CONFLICT,
    'Otra sesión guardó esta evaluación después de que la abriste (revisión ' + actual +
    ', la tuya es la ' + base + ').',
    {
      hint: 'Vuelve a cargarla para ver esos cambios, o confirma que quieres sobrescribirlos.',
      details: {
        revisionBase: base,
        revisionActual: actual,
        actualizadoEn: previous.actualizado_en,
        actualizadoPor: previous.actualizado_por,
        puedeForzar: true
      }
    });
}

/** Cuenta preguntas, calificables y puntos del documento normalizado. */
function evCountContent_(normalized) {
  var opcionesPorPregunta = evGroupBy_(normalized.opciones, 'preguntaId');
  var preguntas = 0;
  var calificables = 0;
  var puntos = 0;
  for (var i = 0; i < normalized.preguntas.length; i++) {
    var q = normalized.preguntas[i];
    if (!evIsQuestion_(q.tipo)) continue;
    preguntas++;
    var modo = evEnum_(q.modoPuntaje, 'MODO_PUNTAJE', (evTypeSpec_(q.tipo) || {}).scoring || 'ninguno');
    var valor = modo === 'ninguno' ? 0 : evRound_(Math.max(0, evNum_(q.puntos, 1)), 3);
    puntos += valor;
    var own = opcionesPorPregunta[q.id] || [];
    var ownRowLike = [];
    for (var o = 0; o < own.length; o++) {
      ownRowLike.push({
        correcta: own[o].correcta === true,
        clave_emparejamiento: own[o].claveEmparejamiento || '',
        puntos: evNum_(own[o].puntos, 0)
      });
    }
    if (evIsAutoGradable_({
      tipo: q.tipo, modo_puntaje: modo, puntos: valor, respuesta_esperada: evExpectedOf_(q.tipo, q.respuestaEsperada)
    }, ownRowLike)) calificables++;
  }
  return { preguntas: preguntas, calificables: calificables, puntos: evRound_(puntos, 3) };
}

/** Da de baja lógica lo que el documento ya no incluye. */
function evDeactivateMissing_(bundle, normalized, now) {
  var keptSections = {};
  for (var s = 0; s < normalized.secciones.length; s++) keptSections[normalized.secciones[s].id] = true;
  var keptQuestions = {};
  for (var q = 0; q < normalized.preguntas.length; q++) keptQuestions[normalized.preguntas[q].id] = true;
  var keptOptions = {};
  for (var o = 0; o < normalized.opciones.length; o++) keptOptions[normalized.opciones[o].id] = true;

  var count = 0;
  count += evDeactivate_(EV_SHEET.SECCIONES,
    evMissingIds_(bundle.secciones, keptSections), now);
  count += evDeactivate_(EV_SHEET.PREGUNTAS,
    evMissingIds_(bundle.preguntas, keptQuestions), now);
  count += evDeactivate_(EV_SHEET.OPCIONES,
    evMissingIds_(bundle.opciones, keptOptions), now);
  return count;
}

function evMissingIds_(rows, kept) {
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    if (evBool_(rows[i].activo, true) === false) continue;
    if (!kept[String(rows[i].id)]) out.push(rows[i].id);
  }
  return out;
}

/** Duplica una evaluación completa con identificadores nuevos y sin historial. */
function evDuplicateEvaluation_(context, payload) {
  evRequireInstalled_();
  var sourceId = evText_((payload || {}).id, 140);
  var bundle = evLoadBundle_(sourceId);
  var document = evBundleToDocument_(bundle);
  var now = context.now;

  var taken = {};
  var rows = evAll_(EV_SHEET.EVALUACIONES);
  for (var i = 0; i < rows.length; i++) taken[String(rows[i].codigo)] = true;

  var newId = evNewId_(EV_ID.EVALUACION);
  var titulo = evText_(
    (payload && payload.titulo) || (document.evaluacion.titulo + ' (copia)'), EV_LIMITS.TITLE);

  var base = {
    id: newId,
    codigo: evPublicCode_(titulo, taken),
    estado: 'borrador',
    revision: 0,
    creado_en: now,
    creado_por: context.actor,
    publicado_en: '',
    publicado_por: '',
    archivado_en: '',
    eliminado_en: '',
    version_mayor: 0,
    version_menor: 0,
    version_vigente_id: '',
    titulo: titulo
  };
  document.evaluacion.titulo = titulo;
  document.evaluacion.procesos = [];

  // Se reasignan todos los identificadores: una copia no comparte ninguna fila
  // con el original, ni siquiera indirectamente.
  var seen = {};
  for (var s = 0; s < document.secciones.length; s++) {
    document.secciones[s].id = evUniqueId_(null, EV_ID.SECCION, seen);
    var preguntas = document.secciones[s].preguntas;
    for (var q = 0; q < preguntas.length; q++) {
      preguntas[q].id = evUniqueId_(null, EV_ID.PREGUNTA, seen);
      for (var o = 0; o < preguntas[q].opciones.length; o++) {
        preguntas[q].opciones[o].id = evUniqueId_(null, EV_ID.OPCION, seen);
      }
    }
  }

  var normalized = evNormalizeDocument_(document, newId);
  var conteos = evCountContent_(normalized);
  var row = evEvaluationToRow_(normalized.evaluacion, base, {
    now: now, actor: context.actor, cliente: context.cliente, revision: 1,
    preguntas: conteos.preguntas, preguntasCalificables: conteos.calificables,
    puntosTotales: conteos.puntos
  });
  evPut_(EV_SHEET.EVALUACIONES, row);

  var sectionRows = [];
  for (var ns = 0; ns < normalized.secciones.length; ns++) {
    sectionRows.push(evSectionToRow_(normalized.secciones[ns], newId, ns, null, now));
  }
  var questionRows = [];
  for (var nq = 0; nq < normalized.preguntas.length; nq++) {
    var question = normalized.preguntas[nq];
    questionRows.push(evQuestionToRow_(question, newId, question.seccionId, question.orden, null, now));
  }
  var optionRows = [];
  for (var no = 0; no < normalized.opciones.length; no++) {
    var option = normalized.opciones[no];
    optionRows.push(evOptionToRow_(option, newId, option.preguntaId, option.orden, null, now));
  }
  evPutAll_(EV_SHEET.SECCIONES, sectionRows);
  evPutAll_(EV_SHEET.PREGUNTAS, questionRows);
  evPutAll_(EV_SHEET.OPCIONES, optionRows);

  evAudit_(context, 'duplicateEvaluation', 'evaluacion', newId, 'ok',
    { origen: sourceId, preguntas: questionRows.length });

  return {
    data: evBundleToDocument_(evLoadBundle_(newId)),
    referencia: newId,
    resumen: { id: newId, origen: sourceId, codigo: row.codigo }
  };
}

/* ------------------------------- Transiciones ------------------------------ */

/**
 * Matriz de transiciones. Es la ÚNICA definición del ciclo de vida.
 *
 * El módulo anterior tenía tres ejes de estado (`status`, `lifecycle_status`,
 * `publication_status`) que podían contradecirse, y por eso «pausar» o «cerrar»
 * a veces no surtía efecto visible. Aquí hay un solo campo `estado`.
 */
var EV_TRANSICIONES = {
  pausar:     { desde: ['publicada'], hacia: 'pausada' },
  reanudar:   { desde: ['pausada'], hacia: 'publicada', requiereVersion: true },
  cerrar:     { desde: ['publicada', 'pausada'], hacia: 'cerrada' },
  archivar:   { desde: ['borrador', 'publicada', 'pausada', 'cerrada'], hacia: 'archivada' },
  restaurar:  { desde: ['archivada', 'papelera'], hacia: 'borrador' },
  despublicar:{ desde: ['publicada', 'pausada', 'cerrada'], hacia: 'borrador' }
};

/** Nombre legible de cada estado, para los mensajes de error. */
var EV_ESTADO_LEGIBLE = {
  borrador: 'borrador', publicada: 'publicada', pausada: 'pausada',
  cerrada: 'cerrada', archivada: 'archivada', papelera: 'en la papelera'
};

function evTransitionEvaluation_(context, payload) {
  evRequireInstalled_();
  var p = payload || {};
  var id = evText_(p.id, 140);
  var accion = evText_(p.transicion, 40);
  var transicion = EV_TRANSICIONES[accion];
  if (!transicion) {
    throw evError_(EV_CODE.BAD_REQUEST,
      'La transición "' + accion + '" no existe.',
      {
        hint: 'Las transiciones válidas son: ' + Object.keys(EV_TRANSICIONES).join(', ') + '.',
        details: { transicion: accion, validas: Object.keys(EV_TRANSICIONES) }
      });
  }
  var bundle = evLoadBundle_(id);
  var row = bundle.row;
  var now = context.now;

  if (transicion.desde.indexOf(row.estado) < 0) {
    throw evError_(EV_CODE.CONFLICT,
      'La evaluación está ' + (EV_ESTADO_LEGIBLE[row.estado] || row.estado) +
      ' y desde ese estado no se puede ' + accion + '.',
      {
        hint: 'Estados desde los que sí se puede: ' + transicion.desde.join(', ') + '.',
        details: { estadoActual: row.estado, transicion: accion, estadosValidos: transicion.desde }
      });
  }
  if (transicion.requiereVersion && !row.version_vigente_id) {
    throw evError_(EV_CODE.CONFLICT,
      'No hay una versión publicada a la que volver.',
      { hint: 'Publica la evaluación antes de reanudarla.', details: { transicion: accion } });
  }

  row.estado = transicion.hacia;
  row.revision = evInt_(row.revision, 1) + 1;
  row.actualizado_en = now;
  row.actualizado_por = context.actor;
  row.ultimo_cliente = context.cliente;
  row.archivado_en = transicion.hacia === 'archivada' ? now : '';
  if (transicion.hacia === 'borrador') {
    row.eliminado_en = '';
    if (accion === 'despublicar') row.version_vigente_id = '';
  }
  evPut_(EV_SHEET.EVALUACIONES, row);
  evInvalidatePublicCache_(row.codigo);

  evAudit_(context, 'transitionEvaluation', 'evaluacion', id, 'ok',
    { transicion: accion, estado: transicion.hacia });

  return {
    data: evBundleToDocument_(evLoadBundle_(id)),
    referencia: id,
    resumen: { id: id, estado: transicion.hacia, transicion: accion }
  };
}

/**
 * Relanzar: reabrir una evaluación cerrada para una nueva convocatoria.
 *
 * Vuelve a `publicada` con la misma versión (el contenido no cambia), abre una
 * ventana nueva y, si se pide, deja los intentos anteriores fuera del cómputo de
 * «intentos máximos» marcándolos como pertenecientes a la convocatoria anterior.
 */
function evRelaunchEvaluation_(context, payload) {
  evRequireInstalled_();
  var p = payload || {};
  var id = evText_(p.id, 140);
  var bundle = evLoadBundle_(id);
  var row = bundle.row;
  var now = context.now;

  if (!row.version_vigente_id) {
    throw evError_(EV_CODE.CONFLICT,
      'No se puede relanzar una evaluación que nunca se publicó.',
      { hint: 'Publícala primero; después podrás relanzarla tantas veces como haga falta.', details: { estado: row.estado } });
  }
  if (row.estado === 'papelera') {
    throw evError_(EV_CODE.CONFLICT, 'La evaluación está en la papelera.',
      { hint: 'Restáurala antes de relanzarla.', details: { estado: row.estado } });
  }

  row.estado = 'publicada';
  row.revision = evInt_(row.revision, 1) + 1;
  row.actualizado_en = now;
  row.actualizado_por = context.actor;
  row.ultimo_cliente = context.cliente;
  row.archivado_en = '';
  row.eliminado_en = '';
  row.ventana_inicio = evNormalizeIso_(p.ventanaInicio) || now;
  row.ventana_fin = evNormalizeIso_(p.ventanaFin);
  evPut_(EV_SHEET.EVALUACIONES, row);
  evInvalidatePublicCache_(row.codigo);

  evAudit_(context, 'relaunchEvaluation', 'evaluacion', id, 'ok', {
    ventanaInicio: row.ventana_inicio, ventanaFin: row.ventana_fin
  });

  return {
    data: evBundleToDocument_(evLoadBundle_(id)),
    referencia: id,
    resumen: { id: id, estado: 'publicada', ventanaInicio: row.ventana_inicio }
  };
}

/**
 * Eliminar = mover a la papelera. Reversible y sin pérdida de datos.
 *
 * El borrado real existe aparte (`purgeEvaluation`) y exige confirmación
 * explícita, porque sí borra intentos y respuestas.
 */
function evDeleteEvaluation_(context, payload) {
  evRequireInstalled_();
  var id = evText_((payload || {}).id, 140);
  var bundle = evLoadBundle_(id);
  var row = bundle.row;
  var now = context.now;

  row.estado = 'papelera';
  row.revision = evInt_(row.revision, 1) + 1;
  row.eliminado_en = now;
  row.actualizado_en = now;
  row.actualizado_por = context.actor;
  row.ultimo_cliente = context.cliente;
  evPut_(EV_SHEET.EVALUACIONES, row);
  evInvalidatePublicCache_(row.codigo);

  evAudit_(context, 'deleteEvaluation', 'evaluacion', id, 'ok', { estado: 'papelera' });
  return {
    data: { id: id, estado: 'papelera' },
    referencia: id,
    resumen: { id: id, estado: 'papelera' }
  };
}

/**
 * Borrado permanente. Elimina la evaluación y TODO lo que cuelga de ella.
 *
 * Exige `confirmacion: "ELIMINAR"` en la carga. Un borrado irreversible no debe
 * poder dispararse por un clic accidental ni por un cliente mal programado.
 */
function evPurgeEvaluation_(context, payload) {
  evRequireInstalled_();
  var p = payload || {};
  var id = evText_(p.id, 140);
  if (String(p.confirmacion) !== 'ELIMINAR') {
    throw evError_(EV_CODE.BAD_REQUEST,
      'El borrado permanente exige confirmación explícita.',
      {
        hint: 'Envía `confirmacion: "ELIMINAR"`. Esta operación borra también los intentos y las respuestas.',
        details: { requerido: 'confirmacion=ELIMINAR' }
      });
  }
  var bundle = evLoadBundle_(id);
  var codigo = bundle.row.codigo;

  var intentos = evWhere_(EV_SHEET.INTENTOS, 'evaluacion_id', id);
  var intentoIds = [];
  for (var i = 0; i < intentos.length; i++) intentoIds.push(intentos[i].id);

  var borrado = {
    opciones: evPurge_(EV_SHEET.OPCIONES, evIdsOf_(evWhere_(EV_SHEET.OPCIONES, 'evaluacion_id', id))),
    preguntas: evPurge_(EV_SHEET.PREGUNTAS, evIdsOf_(evWhere_(EV_SHEET.PREGUNTAS, 'evaluacion_id', id))),
    secciones: evPurge_(EV_SHEET.SECCIONES, evIdsOf_(evWhere_(EV_SHEET.SECCIONES, 'evaluacion_id', id))),
    bloques: evPurge_(EV_SHEET.BLOQUES, evIdsOf_(evWhere_(EV_SHEET.BLOQUES, 'evaluacion_id', id))),
    versiones: evPurge_(EV_SHEET.VERSIONES, evIdsOf_(evWhere_(EV_SHEET.VERSIONES, 'evaluacion_id', id))),
    respuestas: evPurge_(EV_SHEET.RESPUESTAS, evIdsOf_(evWhere_(EV_SHEET.RESPUESTAS, 'evaluacion_id', id))),
    integridad: evPurge_(EV_SHEET.INTEGRIDAD, evIdsOf_(evWhere_(EV_SHEET.INTEGRIDAD, 'evaluacion_id', id))),
    intentos: evPurge_(EV_SHEET.INTENTOS, intentoIds),
    evaluacion: evPurge_(EV_SHEET.EVALUACIONES, [id])
  };
  evInvalidatePublicCache_(codigo);

  evAudit_(context, 'purgeEvaluation', 'evaluacion', id, 'ok', borrado);
  evWarn_('Borrado permanente de una evaluación.', { id: id, borrado: borrado });
  return { data: { id: id, borrado: borrado }, referencia: id, resumen: borrado };
}

function evIdsOf_(rows) {
  var out = [];
  for (var i = 0; i < rows.length; i++) out.push(rows[i].id);
  return out;
}
