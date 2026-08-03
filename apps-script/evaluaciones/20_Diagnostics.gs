/**
 * 20_Diagnostics.gs — el diagnóstico que el módulo anterior no tenía.
 *
 * Cuando algo no funciona, la pregunta útil no es «¿hay un error?» sino «¿QUÉ
 * está mal y qué hago?». Este archivo responde eso: recorre el libro, la
 * configuración y los datos, y devuelve una lista de HALLAZGOS. Cada hallazgo
 * lleva severidad, qué se comprobó, qué se encontró y el paso concreto para
 * arreglarlo.
 *
 * Severidades:
 *   critico  el módulo no puede operar. Hay que actuar ya.
 *   alto     opera, pero hay riesgo real (por ejemplo, administración sin llave).
 *   medio    hay algo desalineado que conviene corregir.
 *   info     observación útil, sin acción necesaria.
 *
 * El diagnóstico es de SOLO LECTURA. Nunca arregla nada por su cuenta: quien
 * decide es la persona, y para eso está el botón «Instalar o reparar».
 */

function evFinding_(severidad, codigo, titulo, detalle, remedio, datos) {
  return {
    severidad: severidad,
    codigo: codigo,
    titulo: titulo,
    detalle: detalle,
    remedio: remedio,
    datos: datos || {}
  };
}

/**
 * Diagnóstico completo.
 *
 * `payload.profundo === true` añade las comprobaciones caras: integridad
 * referencial de intentos y respuestas, y legibilidad de todos los snapshots
 * publicados. Con pocos datos es instantáneo; se deja opcional para que un libro
 * con años de historia no agote el tiempo de ejecución.
 */
function evDiagnose_(payload) {
  var profundo = (payload || {}).profundo === true;
  var hallazgos = [];
  var informeEsquema = null;
  var libro = null;

  /* --- 1. El libro --- */
  try {
    var ss = evSpreadsheet_();
    libro = {
      nombre: ss.getName ? ss.getName() : '',
      id: ss.getId ? ss.getId() : '',
      zonaHoraria: ss.getSpreadsheetTimeZone ? ss.getSpreadsheetTimeZone() : '',
      hojas: ss.getSheets ? ss.getSheets().length : 0
    };
  } catch (error) {
    var classified = evClassify_(error);
    hallazgos.push(evFinding_('critico', 'LIBRO_INACCESIBLE',
      'No se puede abrir el libro de cálculo',
      classified.message,
      classified.evHint,
      classified.evDetails));
    return evDiagnosisResult_(hallazgos, null, null, profundo);
  }

  /* --- 2. El esquema --- */
  informeEsquema = evVerifySchema_();
  if (!informeEsquema.installed) {
    hallazgos.push(evFinding_('critico', 'NO_INSTALADO',
      'El libro no tiene la estructura de Evaluaciones',
      'Faltan ' + informeEsquema.missingSheets.length + ' hoja(s): ' +
        informeEsquema.missingSheets.join(', ') + '.',
      'Ejecuta «Instalar o reparar». Crea únicamente lo que falta y no toca los datos existentes.',
      { hojasFaltantes: informeEsquema.missingSheets }));
  } else if (informeEsquema.sheetsNeedingRepair.length > 0) {
    for (var s = 0; s < informeEsquema.sheets.length; s++) {
      var hoja = informeEsquema.sheets[s];
      if (hoja.missingColumns.length === 0) continue;
      hallazgos.push(evFinding_('critico', 'COLUMNAS_FALTANTES',
        'La hoja «' + hoja.sheet + '» está incompleta',
        'Faltan ' + hoja.missingColumns.length + ' columna(s): ' + hoja.missingColumns.join(', ') + '.',
        'Ejecuta «Instalar o reparar»: añade las columnas al final, en blanco, sin mover datos.',
        { hoja: hoja.sheet, columnasFaltantes: hoja.missingColumns }));
    }
  }
  for (var e = 0; e < informeEsquema.sheets.length; e++) {
    var extra = informeEsquema.sheets[e];
    if (extra.extraColumns.length > 0) {
      hallazgos.push(evFinding_('info', 'COLUMNAS_EXTRA',
        'La hoja «' + extra.sheet + '» tiene columnas propias',
        'Se detectaron columnas que el backend no usa: ' + extra.extraColumns.join(', ') + '.',
        'No hay que hacer nada: el backend localiza sus columnas por nombre y respeta las tuyas.',
        { hoja: extra.sheet, columnasExtra: extra.extraColumns }));
    }
  }

  /* --- 3. Autorización --- */
  var auth = evAuthDiagnostics_();
  if (auth.modo === 'abierto') {
    hallazgos.push(evFinding_('alto', 'ADMIN_SIN_LLAVE',
      'La administración está abierta a cualquiera que conozca la URL',
      'La propiedad ' + EV_PROP.ADMIN_KEY + ' no está definida (o tiene menos de 16 caracteres), ' +
        'así que las acciones administrativas se aceptan sin credencial.',
      'En el editor de Apps Script: Configuración del proyecto → Propiedades del script → añade ' +
        EV_PROP.ADMIN_KEY + ' con una cadena larga y aleatoria, y pégala en Evaluaciones → Conexión.',
      { modo: auth.modo, longitud: auth.llaveLongitud }));
  } else if (!auth.llaveSuficiente) {
    hallazgos.push(evFinding_('alto', 'LLAVE_CORTA',
      'La llave de administración es demasiado corta',
      'Tiene ' + auth.llaveLongitud + ' caracteres; el mínimo recomendado es 32.',
      'Sustitúyela por una cadena aleatoria larga y actualízala en Evaluaciones → Conexión.',
      { longitud: auth.llaveLongitud }));
  }
  if (!auth.secretoIntentos) {
    hallazgos.push(evFinding_('critico', 'SIN_SECRETO_INTENTOS',
      'No hay secreto para firmar los tokens de intento',
      'Sin él, ningún candidato puede iniciar una prueba: el backend se niega a emitir credenciales que no puede verificar.',
      'Ejecuta «Instalar o reparar»: genera el secreto automáticamente y no hay que copiarlo a ningún sitio.',
      { propiedad: EV_PROP.ATTEMPT_SECRET }));
  }

  /* --- 4. Volumen y salud de los datos --- */
  var conteos = null;
  if (informeEsquema.installed) {
    try {
      conteos = {
        evaluaciones: evCountRows_(EV_SHEET.EVALUACIONES),
        secciones: evCountRows_(EV_SHEET.SECCIONES),
        preguntas: evCountRows_(EV_SHEET.PREGUNTAS),
        opciones: evCountRows_(EV_SHEET.OPCIONES),
        versiones: evCountRows_(EV_SHEET.VERSIONES),
        bloques: evCountRows_(EV_SHEET.BLOQUES),
        intentos: evCountRows_(EV_SHEET.INTENTOS),
        respuestas: evCountRows_(EV_SHEET.RESPUESTAS),
        integridad: evCountRows_(EV_SHEET.INTEGRIDAD),
        auditoria: evCountRows_(EV_SHEET.AUDITORIA),
        registro: evCountRows_(EV_SHEET.REGISTRO),
        metricas: evCountRows_(EV_SHEET.METRICAS)
      };
    } catch (error) {
      hallazgos.push(evFinding_('alto', 'LECTURA_FALLIDA',
        'No se pudieron contar las filas de una hoja',
        evClassify_(error).message,
        evClassify_(error).evHint,
        {}));
    }
  }

  if (conteos) {
    if (conteos.registro > EV_LIMITS.LOG_ROWS) {
      hallazgos.push(evFinding_('medio', 'REGISTRO_GRANDE',
        'El diario de diagnóstico tiene ' + conteos.registro + ' filas',
        'Un diario muy grande ralentiza cada escritura, porque la hoja se lee completa al añadir una entrada.',
        'Ejecuta «Mantenimiento → Podar registro»: conserva las ' + EV_LIMITS.LOG_ROWS + ' más recientes.',
        { filas: conteos.registro, limite: EV_LIMITS.LOG_ROWS }));
    }
    if (conteos.metricas > EV_LIMITS.LOG_ROWS * 2) {
      hallazgos.push(evFinding_('medio', 'METRICAS_GRANDES',
        'La hoja de métricas tiene ' + conteos.metricas + ' filas',
        'Las métricas son útiles pero acumulativas.',
        'Ejecuta «Mantenimiento → Podar registro», que también poda las métricas, o desactívalas con ' +
          EV_PROP.METRICS_ENABLED + ' = false.',
        { filas: conteos.metricas }));
    }

    /* --- Estados incoherentes --- */
    var publicadasSinVersion = [];
    var codigos = {};
    var duplicados = [];
    var evaluaciones = evAll_(EV_SHEET.EVALUACIONES);
    for (var v = 0; v < evaluaciones.length; v++) {
      var row = evaluaciones[v];
      if ((row.estado === 'publicada' || row.estado === 'pausada') && !row.version_vigente_id) {
        publicadasSinVersion.push(row.codigo || row.id);
      }
      var codigo = evNormalizeCode_(row.codigo);
      if (codigo && codigos[codigo]) duplicados.push(codigo);
      codigos[codigo] = true;
    }
    if (publicadasSinVersion.length > 0) {
      hallazgos.push(evFinding_('critico', 'PUBLICADA_SIN_VERSION',
        publicadasSinVersion.length + ' evaluación(es) marcadas como publicadas sin contenido publicado',
        'Un candidato que abra su enlace verá «no disponible»: ' + publicadasSinVersion.join(', ') + '.',
        'Abre cada una y pulsa «Publicar». Si no debía estar publicada, despublícala.',
        { codigos: publicadasSinVersion }));
    }
    if (duplicados.length > 0) {
      hallazgos.push(evFinding_('critico', 'CODIGOS_DUPLICADOS',
        'Hay códigos públicos repetidos',
        'Dos evaluaciones comparten el código ' + duplicados.join(', ') +
          ', así que el enlace público es ambiguo.',
        'Duplica una de ellas para obtener un código nuevo y elimina la copia repetida, o corrige la columna «codigo» a mano.',
        { codigos: duplicados }));
    }

    /* --- Intentos abandonados --- */
    var intentos = evAll_(EV_SHEET.INTENTOS);
    var colgados = [];
    for (var a = 0; a < intentos.length; a++) {
      if (intentos[a].estado !== 'en_curso') continue;
      if (evSweepable_(intentos[a])) colgados.push(intentos[a].id);
    }
    if (colgados.length > 0) {
      hallazgos.push(evFinding_('medio', 'INTENTOS_EXPIRADOS_ABIERTOS',
        colgados.length + ' intento(s) siguen «en curso» con el tiempo agotado',
        'Suele ocurrir cuando el candidato cierra el navegador sin enviar. Sus respuestas guardadas están intactas.',
        'Ejecuta «Mantenimiento → Cerrar intentos vencidos»: los califica con lo que había y los marca como expirados.',
        { intentos: colgados.length }));
    }
  }

  /* --- 5. Comprobaciones profundas --- */
  var profundas = null;
  if (profundo && informeEsquema.installed) {
    profundas = evDeepChecks_(hallazgos);
  }

  /* --- 6. Sonda de rendimiento --- */
  var rendimiento = evPerformanceProbe_();
  if (rendimiento.lecturaMs > 6000) {
    hallazgos.push(evFinding_('medio', 'LECTURA_LENTA',
      'Leer las hojas principales tardó ' + rendimiento.lecturaMs + ' ms',
      'Por encima de unos seis segundos, las operaciones empiezan a acercarse al límite de ejecución de Apps Script.',
      'Poda el registro y las métricas, y archiva las evaluaciones que ya no se usen.',
      rendimiento));
  }

  return evDiagnosisResult_(hallazgos, libro, informeEsquema, profundo, conteos, rendimiento, profundas);
}

/** Comprobaciones caras: integridad referencial y legibilidad de snapshots. */
function evDeepChecks_(hallazgos) {
  var resultado = {
    snapshotsRevisados: 0,
    snapshotsIlegibles: [],
    respuestasHuerfanas: 0,
    eventosHuerfanos: 0,
    preguntasHuerfanas: 0,
    opcionesHuerfanas: 0,
    bloquesHuerfanos: 0
  };

  var versiones = evAll_(EV_SHEET.VERSIONES);
  for (var v = 0; v < versiones.length; v++) {
    resultado.snapshotsRevisados++;
    try {
      evReadSnapshot_(versiones[v]);
    } catch (error) {
      resultado.snapshotsIlegibles.push({
        versionId: versiones[v].id,
        etiqueta: versiones[v].etiqueta,
        motivo: evClassify_(error).message
      });
    }
  }
  if (resultado.snapshotsIlegibles.length > 0) {
    hallazgos.push(evFinding_('critico', 'SNAPSHOTS_ILEGIBLES',
      resultado.snapshotsIlegibles.length + ' versión(es) publicadas no se pueden leer',
      'Los candidatos no podrán abrir esas evaluaciones y los intentos anclados a ellas no se pueden revisar con su enunciado original.',
      'Vuelve a publicar cada evaluación afectada. Si el contenido se editó a mano en la hoja VersionesBloques, deshaz ese cambio.',
      { versiones: resultado.snapshotsIlegibles }));
  }

  var evaluacionIds = {};
  var evaluaciones = evAll_(EV_SHEET.EVALUACIONES);
  for (var e = 0; e < evaluaciones.length; e++) evaluacionIds[String(evaluaciones[e].id)] = true;

  var intentoIds = {};
  var intentos = evAll_(EV_SHEET.INTENTOS);
  for (var i = 0; i < intentos.length; i++) intentoIds[String(intentos[i].id)] = true;

  resultado.respuestasHuerfanas = evCountOrphans_(EV_SHEET.RESPUESTAS, 'intento_id', intentoIds);
  resultado.eventosHuerfanos = evCountOrphans_(EV_SHEET.INTEGRIDAD, 'intento_id', intentoIds);
  resultado.preguntasHuerfanas = evCountOrphans_(EV_SHEET.PREGUNTAS, 'evaluacion_id', evaluacionIds);
  resultado.opcionesHuerfanas = evCountOrphans_(EV_SHEET.OPCIONES, 'evaluacion_id', evaluacionIds);

  var versionIds = {};
  for (var vv = 0; vv < versiones.length; vv++) versionIds[String(versiones[vv].id)] = true;
  resultado.bloquesHuerfanos = evCountOrphans_(EV_SHEET.BLOQUES, 'version_id', versionIds);

  var totalHuerfanos = resultado.respuestasHuerfanas + resultado.eventosHuerfanos +
    resultado.preguntasHuerfanas + resultado.opcionesHuerfanas + resultado.bloquesHuerfanos;
  if (totalHuerfanos > 0) {
    hallazgos.push(evFinding_('medio', 'FILAS_HUERFANAS',
      'Hay ' + totalHuerfanos + ' fila(s) que apuntan a registros inexistentes',
      'No afectan al funcionamiento (todo se localiza por identificador) pero ocupan espacio y ensucian las lecturas.',
      'Ejecuta «Mantenimiento → Limpiar filas huérfanas». Es reversible con Ctrl+Z en el libro justo después.',
      resultado));
  }
  return resultado;
}

function evCountOrphans_(sheetName, field, validIds) {
  var rows = evAll_(sheetName);
  var count = 0;
  for (var i = 0; i < rows.length; i++) {
    var key = String(rows[i][field] || '');
    if (key && !validIds[key]) count++;
  }
  return count;
}

/**
 * Sonda de rendimiento: cuánto tarda leer las hojas principales.
 *
 * Es la única cifra que permite distinguir «el módulo va lento» de «Google va
 * lento hoy», y ambas cosas exigen respuestas distintas.
 */
function evPerformanceProbe_() {
  var inicio = evNowMs_();
  var filas = 0;
  try {
    filas += evCountRows_(EV_SHEET.EVALUACIONES);
    filas += evCountRows_(EV_SHEET.PREGUNTAS);
    filas += evCountRows_(EV_SHEET.INTENTOS);
  } catch (error) { /* el hallazgo ya se registró antes */ }
  var lecturaMs = evNowMs_() - inicio;

  var cacheOk = false;
  var cacheInicio = evNowMs_();
  try {
    var clave = 'ev_probe_' + Utilities.getUuid().slice(0, 8);
    evCachePut_(clave, 'ok', 60);
    cacheOk = evCacheGet_(clave) === 'ok';
    evCacheRemove_(clave);
  } catch (error) { cacheOk = false; }

  return {
    lecturaMs: lecturaMs,
    filasLeidas: filas,
    cacheDisponible: cacheOk,
    cacheMs: evNowMs_() - cacheInicio
  };
}

function evDiagnosisResult_(hallazgos, libro, esquema, profundo, conteos, rendimiento, profundas) {
  var porSeveridad = { critico: 0, alto: 0, medio: 0, info: 0 };
  for (var i = 0; i < hallazgos.length; i++) {
    var sev = hallazgos[i].severidad;
    porSeveridad[sev] = (porSeveridad[sev] || 0) + 1;
  }
  var estado = 'ok';
  if (porSeveridad.critico > 0) estado = 'critico';
  else if (porSeveridad.alto > 0) estado = 'atencion';
  else if (porSeveridad.medio > 0) estado = 'aceptable';

  return {
    estado: estado,
    generadoEn: evNow_(),
    backend: {
      version: EV_BACKEND.version,
      esquema: EV_BACKEND.schemaVersion,
      snapshot: EV_BACKEND.snapshotVersion,
      textoEnriquecido: EV_BACKEND.richTextVersion,
      tiposSoportados: evTypeIds_()
    },
    libro: libro,
    esquema: esquema,
    autorizacion: evAuthDiagnostics_(),
    conteos: conteos || null,
    rendimiento: rendimiento || null,
    profundo: profundo === true,
    profundas: profundas || null,
    resumen: porSeveridad,
    hallazgos: hallazgos
  };
}

/* --------------------------------- Diario --------------------------------- */

/** Últimas entradas del diario, filtrables por nivel y traza. */
function evListLogs_(payload) {
  evRequireInstalled_();
  var p = payload || {};
  var limite = evClampInt_(p.limite, 1, 500, 100);
  var nivel = evText_(p.nivel, 10);
  var traza = evText_(p.traza, 60);
  var accion = evText_(p.accion, 80);

  var rows = evAll_(EV_SHEET.REGISTRO).slice();
  rows.sort(evByRecent_('ocurrido_en'));
  var items = [];
  for (var i = 0; i < rows.length && items.length < limite; i++) {
    var row = rows[i];
    if (nivel && String(row.nivel) !== nivel) continue;
    if (traza && String(row.traza_id) !== traza) continue;
    if (accion && String(row.accion) !== accion) continue;
    items.push({
      id: row.id,
      ocurridoEn: row.ocurrido_en,
      nivel: row.nivel,
      traza: row.traza_id,
      accion: row.accion,
      mensaje: row.mensaje,
      contexto: evParseJson_(row.contexto_json, {}) || {},
      pila: row.pila || ''
    });
  }
  return { entradas: items, total: rows.length, nivelMinimo: String(evProp_(EV_PROP.LOG_LEVEL, 'info')) };
}

/** Métricas agregadas por acción. */
function evGetMetrics_(payload) {
  evRequireInstalled_();
  var limite = evClampInt_((payload || {}).limite, 1, 5000, 1000);
  var rows = evAll_(EV_SHEET.METRICAS).slice();
  rows.sort(evByRecent_('ocurrido_en'));
  if (rows.length > limite) rows = rows.slice(0, limite);

  var porAccion = {};
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var accion = String(row.accion || 'desconocida');
    if (!porAccion[accion]) {
      porAccion[accion] = {
        accion: accion, llamadas: 0, errores: 0, msTotal: 0, msMaximo: 0,
        filasLeidas: 0, filasEscritas: 0
      };
    }
    var bucket = porAccion[accion];
    bucket.llamadas++;
    if (String(row.resultado) === 'error') bucket.errores++;
    var ms = evInt_(row.milisegundos, 0);
    bucket.msTotal += ms;
    if (ms > bucket.msMaximo) bucket.msMaximo = ms;
    bucket.filasLeidas += evInt_(row.filas_leidas, 0);
    bucket.filasEscritas += evInt_(row.filas_escritas, 0);
  }
  var items = [];
  for (var key in porAccion) {
    if (!Object.prototype.hasOwnProperty.call(porAccion, key)) continue;
    var b = porAccion[key];
    items.push({
      accion: b.accion,
      llamadas: b.llamadas,
      errores: b.errores,
      msPromedio: Math.round(b.msTotal / b.llamadas),
      msMaximo: b.msMaximo,
      filasLeidasPromedio: Math.round(b.filasLeidas / b.llamadas),
      filasEscritasPromedio: Math.round(b.filasEscritas / b.llamadas)
    });
  }
  items.sort(function (a, b) { return b.llamadas - a.llamadas; });
  return { acciones: items, muestras: rows.length, habilitadas: evMetricsEnabled_() };
}

/** Poda el diario y las métricas conservando lo más reciente. */
function evPruneLogsAction_(context, payload) {
  evRequireInstalled_();
  var conservar = evClampInt_((payload || {}).conservar, 100, 20000, EV_LIMITS.LOG_ROWS);
  var borrado = { registro: 0, metricas: 0 };

  borrado.registro = evPruneSheet_(EV_SHEET.REGISTRO, conservar);
  borrado.metricas = evPruneSheet_(EV_SHEET.METRICAS, conservar);

  evAudit_(context, 'pruneLogs', 'libro', '', 'ok', borrado);
  return { data: { borrado: borrado, conservar: conservar }, referencia: 'pruneLogs', resumen: borrado };
}

/** Borra las filas más antiguas de una hoja, conservando las `conservar` últimas. */
function evPruneSheet_(sheetName, conservar) {
  var rows = evAll_(sheetName).slice();
  if (rows.length <= conservar) return 0;
  rows.sort(evByRecent_('ocurrido_en'));
  var sobrantes = rows.slice(conservar);
  var ids = [];
  for (var i = 0; i < sobrantes.length; i++) ids.push(sobrantes[i].id);
  return evPurge_(sheetName, ids);
}
