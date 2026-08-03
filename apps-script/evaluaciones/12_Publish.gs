/**
 * 12_Publish.gs — publicación, versiones inmutables y reversión.
 *
 * ── Snapshots troceados (y por qué, no comprimidos) ──────────────────────────
 * Publicar congela el contenido en un snapshot. La versión anterior del módulo lo
 * guardaba en UNA celda y, cuando una evaluación grande pasaba de 50 000
 * caracteres, Sheets abortaba la escritura a mitad de la fila: publicar fallaba
 * con «error interno» y la fila quedaba medio escrita. El parche fue comprimir
 * con gzip, lo que retrasa el problema y añade un formato opaco: quien abre el
 * libro ve base64 y no puede auditar nada.
 *
 * Aquí el snapshot se TROCEA en filas de la hoja `VersionesBloques`, de 40 000
 * caracteres cada una. Ventajas concretas:
 *
 *   · no hay techo práctico de tamaño;
 *   · el contenido sigue siendo texto legible;
 *   · si un trozo se corrompe, el diagnóstico dice exactamente cuál;
 *   · la escritura es un solo bloque de filas, así que no cuesta más.
 *
 * La huella SHA-256 del JSON completo se guarda en la versión: al leer se
 * recomprueba, de modo que un snapshot alterado o incompleto se detecta en vez de
 * servirse a medias.
 *
 * ── Numeración de versiones ──────────────────────────────────────────────────
 * Se compara el snapshot nuevo con el vigente:
 *   estructural (cambian preguntas, opciones, claves o puntajes) → sube MAYOR;
 *   seguro (solo cambian textos, ayudas o presentación)          → sube MENOR.
 * Los intentos ya iniciados quedan anclados a su versión y no se ven afectados.
 */

/* ---------------------------- Códec de snapshots -------------------------- */

/** Trocea un texto en piezas del tamaño configurado. */
function evChunkText_(text, size) {
  var chunks = [];
  var source = String(text);
  for (var i = 0; i < source.length; i += size) chunks.push(source.slice(i, i + size));
  return chunks.length > 0 ? chunks : [''];
}

/** Escribe el snapshot troceado. Devuelve `{ bloques, caracteres, huella }`. */
function evWriteSnapshot_(versionId, evaluacionId, json, now) {
  var chunks = evChunkText_(json, EV_LIMITS.SNAPSHOT_CHUNK_CHARS);
  var rows = [];
  for (var i = 0; i < chunks.length; i++) {
    rows.push({
      // Identificador determinista: republicar la misma versión reescribe los
      // mismos trozos en lugar de dejar huérfanos.
      id: versionId + '_' + i,
      version_id: versionId,
      evaluacion_id: evaluacionId,
      indice: i,
      contenido: chunks[i],
      creado_en: now
    });
  }
  evPutAll_(EV_SHEET.BLOQUES, rows);
  return { bloques: chunks.length, caracteres: json.length, huella: evFingerprint_(json) };
}

/**
 * Lee y reensambla un snapshot.
 *
 * Comprueba que no falte ningún índice y que la huella coincida. Si algo no
 * cuadra, lanza SCHEMA_ERROR describiendo el problema en lugar de devolver un
 * documento truncado que produciría una prueba a medias.
 */
function evReadSnapshot_(versionRow) {
  var chunks = evWhere_(EV_SHEET.BLOQUES, 'version_id', versionRow.id);
  if (chunks.length === 0) {
    throw evError_(EV_CODE.SCHEMA_ERROR,
      'La versión publicada no tiene contenido guardado.',
      {
        hint: 'Vuelve a publicar la evaluación: se regenerará el contenido de la versión.',
        details: { versionId: versionRow.id, etiqueta: versionRow.etiqueta, bloquesEsperados: evInt_(versionRow.bloques, 0) }
      });
  }
  chunks.sort(function (a, b) { return evInt_(a.indice, 0) - evInt_(b.indice, 0); });
  var expected = evInt_(versionRow.bloques, chunks.length);
  var faltantes = [];
  for (var i = 0; i < expected; i++) {
    if (!chunks[i] || evInt_(chunks[i].indice, -1) !== i) faltantes.push(i);
  }
  if (faltantes.length > 0) {
    throw evError_(EV_CODE.SCHEMA_ERROR,
      'Al contenido de la versión publicada le faltan ' + faltantes.length + ' bloque(s).',
      {
        hint: 'Vuelve a publicar la evaluación. Si el problema persiste, ejecuta el diagnóstico: informa de los bloques huérfanos.',
        details: { versionId: versionRow.id, bloquesFaltantes: faltantes, bloquesEsperados: expected }
      });
  }
  var json = '';
  for (var c = 0; c < chunks.length; c++) json += chunks[c].contenido;

  var huella = String(versionRow.huella || '');
  if (huella && evFingerprint_(json) !== huella) {
    throw evError_(EV_CODE.SCHEMA_ERROR,
      'El contenido de la versión publicada no coincide con su huella: alguien lo editó a mano.',
      {
        hint: 'No se sirve contenido alterado. Vuelve a publicar la evaluación para regenerar la versión.',
        details: { versionId: versionRow.id, huellaEsperada: huella }
      });
  }
  var parsed = evParseJson_(json, null);
  if (!parsed || !parsed.evaluacion) {
    throw evError_(EV_CODE.SCHEMA_ERROR,
      'El contenido de la versión publicada no se pudo interpretar.',
      {
        hint: 'Vuelve a publicar la evaluación.',
        details: { versionId: versionRow.id, caracteres: json.length }
      });
  }
  if (evInt_(parsed.snapshotVersion, 1) > EV_BACKEND.snapshotVersion) {
    throw evError_(EV_CODE.SCHEMA_ERROR,
      'La versión publicada usa un formato más nuevo que el de este script.',
      {
        hint: 'Actualiza los archivos .gs del proyecto de Apps Script y vuelve a desplegar.',
        details: { formatoSnapshot: evInt_(parsed.snapshotVersion, 1), soportado: EV_BACKEND.snapshotVersion }
      });
  }
  return parsed;
}

/* ---------------------------- Huellas de cambio --------------------------- */

/**
 * Huella ESTRUCTURAL: todo lo que afecta a cómo se responde o se califica.
 *
 * Si cambia, los intentos ya recogidos no son comparables con los nuevos, y por
 * eso sube la versión mayor.
 */
function evStructuralFingerprint_(document) {
  var parts = [];
  for (var s = 0; s < document.secciones.length; s++) {
    var section = document.secciones[s];
    parts.push('S|' + section.id + '|' + section.orden + '|' + (section.tomarN || '') + '|' + (section.mezclar ? 1 : 0));
    for (var q = 0; q < section.preguntas.length; q++) {
      var question = section.preguntas[q];
      parts.push([
        'Q', question.id, question.tipo, question.orden,
        question.obligatoria ? 1 : 0, question.modoPuntaje,
        evNum_(question.puntos, 0), evNum_(question.penalizacion, 0),
        evWriteJson_(question.respuestaEsperada), evWriteJson_(question.validacion)
      ].join('|'));
      for (var o = 0; o < question.opciones.length; o++) {
        var option = question.opciones[o];
        parts.push([
          'O', option.id, option.orden, option.valor,
          option.correcta ? 1 : 0, evNum_(option.puntos, 0), option.claveEmparejamiento, option.grupo
        ].join('|'));
      }
    }
  }
  var app = document.evaluacion.aplicacion || {};
  parts.push(['A', app.duracionMinutos, app.puntajeAprobacion, app.criterioAprobacion,
    app.navegacion, app.mezclarPreguntas ? 1 : 0, app.mezclarOpciones ? 1 : 0].join('|'));
  return evFingerprint_(parts.join('\n'));
}

/** Huella de PRESENTACIÓN: textos, ayudas, tema. Cambiarla es una revisión menor. */
function evPresentationFingerprint_(document) {
  var parts = [document.evaluacion.titulo, evRichToPlain_(document.evaluacion.instrucciones)];
  for (var s = 0; s < document.secciones.length; s++) {
    var section = document.secciones[s];
    parts.push(section.titulo + '|' + evRichToPlain_(section.descripcion));
    for (var q = 0; q < section.preguntas.length; q++) {
      var question = section.preguntas[q];
      parts.push(evRichToPlain_(question.enunciado) + '|' + evRichToPlain_(question.ayuda));
      for (var o = 0; o < question.opciones.length; o++) {
        parts.push(evRichToPlain_(question.opciones[o].texto));
      }
    }
  }
  return evFingerprint_(parts.join('\n'));
}

/* --------------------------------- Publicar ------------------------------- */

/**
 * Publica el borrador como una versión inmutable.
 *
 * Orden deliberado: validar → construir snapshot → escribir versión y bloques →
 * marcar las anteriores como reemplazadas → actualizar la evaluación. Si la
 * validación falla, no se ha tocado nada y la respuesta trae la lista completa de
 * hallazgos con su ruta.
 */
function evPublishEvaluation_(context, payload) {
  evRequireInstalled_();
  var p = payload || {};
  var id = evText_(p.id, 140);
  var bundle = evLoadBundle_(id);
  var row = bundle.row;
  var now = context.now;

  if (row.estado === 'papelera' || row.estado === 'archivada') {
    throw evError_(EV_CODE.CONFLICT,
      'No se puede publicar una evaluación ' + (EV_ESTADO_LEGIBLE[row.estado] || row.estado) + '.',
      { hint: 'Restáurala primero.', details: { estado: row.estado } });
  }

  var document = evBundleToDocument_(bundle);
  var planas = evFlattenDocument_(document);
  var issues = evValidateForPublish_(document.evaluacion, planas.secciones, planas.preguntas, planas.opciones);
  if (issues.length > 0) {
    evAudit_(context, 'publishEvaluation', 'evaluacion', id, 'error',
      { hallazgos: issues.length, primero: issues[0].code });
    evThrowIssues_(
      issues.length === 1
        ? 'Falta un detalle antes de poder publicar.'
        : 'Faltan ' + issues.length + ' detalles antes de poder publicar.',
      issues);
  }

  var vigente = row.version_vigente_id ? evById_(EV_SHEET.VERSIONES, row.version_vigente_id) : null;
  if (!vigente && bundle.versiones.length > 0) vigente = bundle.versiones[bundle.versiones.length - 1];

  var estructural = evStructuralFingerprint_(document);
  var presentacion = evPresentationFingerprint_(document);
  var mayor = 1;
  var menor = 0;
  var tipoCambio = 'inicial';

  if (vigente) {
    var previousSnapshot = null;
    try {
      previousSnapshot = evReadSnapshot_(vigente);
    } catch (error) {
      // Una versión anterior ilegible no debe impedir publicar una nueva: se
      // registra y se trata el cambio como estructural.
      evWarn_('No se pudo leer el snapshot vigente; el cambio se considera estructural.', {
        versionId: vigente.id, codigo: evIsError_(error) ? error.evCode : 'desconocido'
      });
    }
    var previousEstructural = previousSnapshot ? String(previousSnapshot.huellaEstructural || '') : '';
    var previousPresentacion = previousSnapshot ? String(previousSnapshot.huellaPresentacion || '') : '';
    if (!previousEstructural || previousEstructural !== estructural) {
      mayor = evInt_(vigente.mayor, 1) + 1;
      menor = 0;
      tipoCambio = 'estructural';
    } else if (previousPresentacion !== presentacion) {
      mayor = evInt_(vigente.mayor, 1);
      menor = evInt_(vigente.menor, 0) + 1;
      tipoCambio = 'presentacion';
    } else {
      mayor = evInt_(vigente.mayor, 1);
      menor = evInt_(vigente.menor, 0) + 1;
      tipoCambio = 'sin_cambios';
    }
  }

  var etiqueta = 'v' + mayor + '.' + menor;
  var versionId = evNewId_(EV_ID.VERSION);
  var conteos = evCountDocument_(document);

  var snapshot = {
    snapshotVersion: EV_BACKEND.snapshotVersion,
    generadoEn: now,
    etiqueta: etiqueta,
    huellaEstructural: estructural,
    huellaPresentacion: presentacion,
    evaluacion: document.evaluacion,
    secciones: document.secciones
  };
  var json = JSON.stringify(snapshot);
  var escrito = evWriteSnapshot_(versionId, id, json, now);

  evPut_(EV_SHEET.VERSIONES, {
    id: versionId,
    evaluacion_id: id,
    etiqueta: etiqueta,
    mayor: mayor,
    menor: menor,
    estado: 'vigente',
    notas: evText_(p.notas, 4000),
    bloques: escrito.bloques,
    caracteres: escrito.caracteres,
    huella: escrito.huella,
    preguntas: conteos.preguntas,
    preguntas_calificables: conteos.calificables,
    puntos_totales: conteos.puntos,
    snapshot_version: EV_BACKEND.snapshotVersion,
    publicado_en: now,
    publicado_por: context.actor,
    creado_en: now
  });

  // Las versiones anteriores pasan a «reemplazada». Su contenido no se toca:
  // los intentos anclados a ellas siguen siendo reproducibles.
  for (var v = 0; v < bundle.versiones.length; v++) {
    var previous = bundle.versiones[v];
    if (previous.id === versionId || previous.estado !== 'vigente') continue;
    previous.estado = 'reemplazada';
    evPut_(EV_SHEET.VERSIONES, previous);
  }

  row.estado = 'publicada';
  row.revision = evInt_(row.revision, 1) + 1;
  row.version_mayor = mayor;
  row.version_menor = menor;
  row.version_vigente_id = versionId;
  row.publicado_en = row.publicado_en || now;
  row.publicado_por = context.actor;
  row.actualizado_en = now;
  row.actualizado_por = context.actor;
  row.ultimo_cliente = context.cliente;
  row.preguntas = conteos.preguntas;
  row.preguntas_calificables = conteos.calificables;
  row.puntos_totales = conteos.puntos;
  if (!row.ventana_inicio) row.ventana_inicio = now;
  evPut_(EV_SHEET.EVALUACIONES, row);
  evInvalidatePublicCache_(row.codigo);

  var warnings = evPublishWarnings_(document.evaluacion, planas.secciones, planas.preguntas, planas.opciones);
  evAudit_(context, 'publishEvaluation', 'evaluacion', id, 'ok', {
    version: etiqueta, tipoCambio: tipoCambio, bloques: escrito.bloques,
    caracteres: escrito.caracteres, preguntas: conteos.preguntas
  });

  return {
    data: {
      documento: evBundleToDocument_(evLoadBundle_(id)),
      version: {
        id: versionId, etiqueta: etiqueta, mayor: mayor, menor: menor,
        tipoCambio: tipoCambio, bloques: escrito.bloques, caracteres: escrito.caracteres,
        huella: escrito.huella
      },
      enlacePublico: { codigo: row.codigo },
      advertencias: warnings
    },
    referencia: id,
    resumen: { id: id, versionId: versionId, etiqueta: etiqueta, tipoCambio: tipoCambio }
  };
}

/**
 * Reversión: vuelve a apuntar a una versión anterior.
 *
 * No borra versiones ni altera intentos: los que ya empezaron siguen con su
 * snapshot. Lo único que cambia es qué versión se sirve a partir de ahora.
 */
function evRollbackEvaluation_(context, payload) {
  evRequireInstalled_();
  var p = payload || {};
  var id = evText_(p.id, 140);
  var versionId = evText_(p.versionId, 140);
  var bundle = evLoadBundle_(id);
  var row = bundle.row;
  var now = context.now;

  var target = null;
  for (var i = 0; i < bundle.versiones.length; i++) {
    if (bundle.versiones[i].id === versionId) target = bundle.versiones[i];
  }
  if (!target) {
    throw evError_(EV_CODE.NOT_FOUND, 'La versión indicada no pertenece a esta evaluación.', {
      hint: 'Elige una de las versiones que aparecen en el historial.',
      details: { versionId: versionId, versionesDisponibles: bundle.versiones.length }
    });
  }
  // Se verifica que la versión destino sea legible ANTES de apuntar a ella: no
  // tiene sentido revertir a algo que no se puede servir.
  evReadSnapshot_(target);

  for (var v = 0; v < bundle.versiones.length; v++) {
    var version = bundle.versiones[v];
    var nuevoEstado = version.id === versionId ? 'vigente' : 'reemplazada';
    if (version.estado === nuevoEstado) continue;
    version.estado = nuevoEstado;
    evPut_(EV_SHEET.VERSIONES, version);
  }

  row.version_vigente_id = versionId;
  row.version_mayor = evInt_(target.mayor, 1);
  row.version_menor = evInt_(target.menor, 0);
  row.estado = row.estado === 'borrador' ? 'publicada' : row.estado;
  row.revision = evInt_(row.revision, 1) + 1;
  row.actualizado_en = now;
  row.actualizado_por = context.actor;
  row.ultimo_cliente = context.cliente;
  evPut_(EV_SHEET.EVALUACIONES, row);
  evInvalidatePublicCache_(row.codigo);

  evAudit_(context, 'rollbackEvaluation', 'evaluacion', id, 'ok',
    { versionId: versionId, etiqueta: target.etiqueta });

  return {
    data: evBundleToDocument_(evLoadBundle_(id)),
    referencia: id,
    resumen: { id: id, versionId: versionId, etiqueta: target.etiqueta }
  };
}

/* -------------------------------- Auxiliares ------------------------------ */

/** Documento anidado → listas planas, como las espera el validador. */
function evFlattenDocument_(document) {
  var secciones = [];
  var preguntas = [];
  var opciones = [];
  for (var s = 0; s < document.secciones.length; s++) {
    var section = document.secciones[s];
    secciones.push(section);
    for (var q = 0; q < section.preguntas.length; q++) {
      var question = section.preguntas[q];
      preguntas.push(question);
      for (var o = 0; o < question.opciones.length; o++) opciones.push(question.opciones[o]);
    }
  }
  return { secciones: secciones, preguntas: preguntas, opciones: opciones };
}

/** Conteos del documento anidado. */
function evCountDocument_(document) {
  var planas = evFlattenDocument_(document);
  var preguntas = 0;
  var calificables = 0;
  var puntos = 0;
  for (var i = 0; i < planas.preguntas.length; i++) {
    var q = planas.preguntas[i];
    if (!evIsQuestion_(q.tipo)) continue;
    preguntas++;
    if (q.modoPuntaje !== 'ninguno') puntos += evNum_(q.puntos, 0);
    var ownRowLike = [];
    for (var o = 0; o < q.opciones.length; o++) {
      ownRowLike.push({
        correcta: q.opciones[o].correcta === true,
        clave_emparejamiento: q.opciones[o].claveEmparejamiento || '',
        puntos: evNum_(q.opciones[o].puntos, 0)
      });
    }
    if (evIsAutoGradable_({
      tipo: q.tipo, modo_puntaje: q.modoPuntaje, puntos: evNum_(q.puntos, 0),
      respuesta_esperada: q.respuestaEsperada
    }, ownRowLike)) calificables++;
  }
  return { preguntas: preguntas, calificables: calificables, puntos: evRound_(puntos, 3) };
}

/** Clave de caché del payload público de un código. */
function evPublicCacheKey_(codigo) {
  return 'ev_pub_' + evNormalizeCode_(codigo);
}

/** Invalida el caché público de un código. Se llama en cada cambio de estado. */
function evInvalidatePublicCache_(codigo) {
  if (!codigo) return;
  evCacheRemove_(evPublicCacheKey_(codigo));
}
