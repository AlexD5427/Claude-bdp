/**
 * 21_Maintenance.gs — el menú del libro y las tareas de cuidado.
 *
 * Todo lo que un operador necesita hacer sin salir de Google Sheets:
 * instalar, diagnosticar, generar la llave, cerrar intentos vencidos, limpiar
 * huérfanos, podar el diario y ejecutar la suite de pruebas.
 *
 * Que exista este menú es parte del encargo: el módulo se tiene que poder
 * «reparar y cuidar tanto a mano desde Apps Script como de forma automática». Las
 * funciones son las MISMAS que usa el endpoint HTTP, así que no hay dos caminos
 * que puedan divergir.
 */

/** Menú del libro. Apps Script lo llama al abrir la hoja. */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('⚙️ Evaluaciones')
      .addItem('Instalar o reparar estructura', 'menuInstalar')
      .addItem('Diagnóstico rápido', 'menuDiagnostico')
      .addItem('Diagnóstico profundo', 'menuDiagnosticoProfundo')
      .addSeparator()
      .addItem('Generar llave de administración', 'menuGenerarLlave')
      .addItem('Mostrar estado de la conexión', 'menuEstado')
      .addSeparator()
      .addItem('Cerrar intentos vencidos', 'menuCerrarVencidos')
      .addItem('Limpiar filas huérfanas', 'menuLimpiarHuerfanas')
      .addItem('Podar registro y métricas', 'menuPodar')
      .addSeparator()
      .addItem('Ejecutar pruebas del backend', 'menuPruebas')
      .addToUi();
  } catch (error) {
    // Sin interfaz (ejecución por disparador o desde la API): no es un problema.
    console.log('[evaluaciones] onOpen sin interfaz disponible.');
  }
}

/** Diálogo con un texto largo, tolerante a la ausencia de interfaz. */
function evShow_(titulo, texto) {
  try {
    SpreadsheetApp.getUi().alert(titulo, String(texto).slice(0, 8000), SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (error) {
    console.log('[evaluaciones] ' + titulo + '\n' + texto);
  }
}

/* --------------------------------- Acciones -------------------------------- */

function menuInstalar() {
  var respuesta = evHandle_({
    accion: 'install',
    solicitudId: 'menu_' + Utilities.getUuid(),
    actor: evActiveUserLabel_(),
    clientId: 'menu-libro'
  });
  if (!respuesta.ok) {
    evShow_('No se pudo instalar', respuesta.error.mensaje + '\n\n' + respuesta.error.pista);
    return;
  }
  var acciones = respuesta.datos.acciones;
  var lineas = ['Estructura verificada.', ''];
  for (var i = 0; i < acciones.length; i++) {
    var a = acciones[i];
    lineas.push('· ' + a.sheet + ': ' + a.action +
      (a.columns && a.columns.length ? ' (' + a.columns.join(', ') + ')' : ''));
  }
  lineas.push('');
  lineas.push('Modo de autorización: ' + respuesta.datos.autorizacion.modo);
  if (respuesta.datos.autorizacion.modo === 'abierto') {
    lineas.push('AVISO: no hay llave de administración. Usa «Generar llave de administración».');
  }
  evShow_('Evaluaciones · instalación', lineas.join('\n'));
}

function menuDiagnostico() {
  evMostrarDiagnostico_(false);
}

function menuDiagnosticoProfundo() {
  evMostrarDiagnostico_(true);
}

function evMostrarDiagnostico_(profundo) {
  var respuesta = evHandle_({
    accion: 'diagnose',
    payload: { profundo: profundo },
    actor: evActiveUserLabel_(),
    clientId: 'menu-libro'
  });
  if (!respuesta.ok) {
    evShow_('Diagnóstico', respuesta.error.mensaje + '\n\n' + respuesta.error.pista);
    return;
  }
  var d = respuesta.datos;
  var lineas = [
    'Estado general: ' + d.estado.toUpperCase(),
    'Backend ' + d.backend.version + ' · esquema ' + d.backend.esquema,
    'Libro: ' + (d.libro ? d.libro.nombre : '—'),
    'Autorización: ' + d.autorizacion.modo,
    ''
  ];
  if (d.conteos) {
    lineas.push('Evaluaciones: ' + d.conteos.evaluaciones + ' · intentos: ' + d.conteos.intentos +
      ' · respuestas: ' + d.conteos.respuestas);
    lineas.push('Registro: ' + d.conteos.registro + ' filas · métricas: ' + d.conteos.metricas);
    lineas.push('');
  }
  if (d.rendimiento) {
    lineas.push('Lectura de hojas principales: ' + d.rendimiento.lecturaMs + ' ms · caché: ' +
      (d.rendimiento.cacheDisponible ? 'disponible' : 'no disponible'));
    lineas.push('');
  }
  if (d.hallazgos.length === 0) {
    lineas.push('Sin hallazgos. Todo en orden.');
  } else {
    lineas.push('Hallazgos (' + d.hallazgos.length + '):');
    for (var i = 0; i < d.hallazgos.length; i++) {
      var h = d.hallazgos[i];
      lineas.push('');
      lineas.push('[' + h.severidad.toUpperCase() + '] ' + h.titulo);
      lineas.push('  ' + h.detalle);
      lineas.push('  → ' + h.remedio);
    }
  }
  evShow_('Evaluaciones · diagnóstico', lineas.join('\n'));
}

/**
 * Genera una llave de administración y la muestra una sola vez.
 *
 * Se muestra en un diálogo y no se registra en ningún log: la llave es lo único
 * que separa la administración del mundo, y no debe quedar en el diario.
 */
function menuGenerarLlave() {
  var existente = String(evProp_(EV_PROP.ADMIN_KEY, ''));
  var llave = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  if (existente) {
    // Rotación sin corte: la nueva se guarda como «siguiente» y ambas se aceptan
    // hasta que se confirme. Así nadie se queda fuera a mitad de una jornada.
    evSetProp_(EV_PROP.ADMIN_KEY_NEXT, llave);
    evShow_('Nueva llave (rotación)',
      'Se generó una llave NUEVA y se guardó como llave siguiente.\n\n' + llave +
      '\n\nAmbas llaves funcionan ahora mismo. Pega esta en Evaluaciones → Conexión y, cuando ' +
      'compruebes que todo funciona, vuelve a este menú y elige «Instalar o reparar» para consolidarla.');
    return;
  }
  evSetProp_(EV_PROP.ADMIN_KEY, llave);
  evShow_('Llave de administración',
    'Cópiala y pégala en el ATS, en Evaluaciones → Conexión:\n\n' + llave +
    '\n\nNo se vuelve a mostrar. Si la pierdes, genera otra desde este mismo menú.');
}

function menuEstado() {
  var respuesta = evHandle_({ accion: 'ping', actor: evActiveUserLabel_(), clientId: 'menu-libro' });
  if (!respuesta.ok) {
    evShow_('Estado', respuesta.error.mensaje + '\n\n' + respuesta.error.pista);
    return;
  }
  var d = respuesta.datos;
  var lineas = [
    'Servicio: ' + d.servicio + ' ' + d.version,
    'Instalado: ' + (d.instalado ? 'sí' : 'no'),
    'Esquema: ' + d.esquema + ' · snapshot: ' + d.snapshot + ' · texto enriquecido: ' + d.textoEnriquecido,
    'Tipos de pregunta soportados: ' + d.tiposSoportados,
    'Autorización: ' + d.autorizacion.modo,
    'Secreto de intentos: ' + (d.autorizacion.secretoIntentos ? 'configurado' : 'FALTA'),
    'Hora del servidor: ' + d.horaServidor
  ];
  if (d.conteos) {
    lineas.push('');
    lineas.push('Evaluaciones: ' + d.conteos.evaluaciones + ' · versiones: ' + d.conteos.versiones +
      ' · intentos: ' + d.conteos.intentos);
  }
  evShow_('Evaluaciones · estado', lineas.join('\n'));
}

/**
 * Cierra los intentos cuyo tiempo venció y nunca se enviaron.
 *
 * Los califica con lo que hubiera guardado: es lo que el candidato alcanzó a
 * responder y descartarlo sería perder trabajo real. Esta función es idempotente
 * y se puede programar con un disparador diario.
 */
function evCloseExpiredAttempts_(actor) {
  evStoreReset_();
  evLogReset_('cerrarVencidos');
  evRequireInstalled_();
  var intentos = evAll_(EV_SHEET.INTENTOS);
  var cerrados = [];
  var fallidos = [];

  for (var i = 0; i < intentos.length; i++) {
    var row = intentos[i];
    if (row.estado !== 'en_curso') continue;
    if (!evSweepable_(row)) continue;
    try {
      var respuesta = evHandle_({
        accion: 'submitAttempt',
        solicitudId: 'vencido_' + row.id,
        // La llave no hace falta: `submitAttempt` es una acción pública que se
        // autoriza con el token del intento, y aquí lo firmamos nosotros mismos.
        payload: {
          intentoId: row.id,
          token: evAttemptToken_(row),
          respuestas: [],
          eventos: [{ tipo: 'expirado', secuencia: 999999, ocurridoEn: evNow_() }],
          automatico: true
        },
        actor: actor || 'mantenimiento',
        clientId: 'menu-libro'
      });
      if (respuesta.ok) cerrados.push(row.id);
      else fallidos.push({ intento: row.id, motivo: respuesta.error.mensaje });
    } catch (error) {
      fallidos.push({ intento: row.id, motivo: evClassify_(error).message });
    }
  }
  return { cerrados: cerrados, fallidos: fallidos };
}

function menuCerrarVencidos() {
  var resultado = evCloseExpiredAttempts_(evActiveUserLabel_());
  var lineas = ['Intentos cerrados: ' + resultado.cerrados.length];
  if (resultado.fallidos.length > 0) {
    lineas.push('No se pudieron cerrar: ' + resultado.fallidos.length);
    for (var i = 0; i < resultado.fallidos.length && i < 10; i++) {
      lineas.push('· ' + resultado.fallidos[i].intento + ': ' + resultado.fallidos[i].motivo);
    }
  }
  if (resultado.cerrados.length === 0 && resultado.fallidos.length === 0) {
    lineas.push('No había ninguno vencido sin enviar.');
  }
  evShow_('Evaluaciones · intentos vencidos', lineas.join('\n'));
}

/**
 * Limpia filas que apuntan a registros inexistentes.
 *
 * Solo borra lo que ya no puede referenciarse desde ningún sitio. Nunca toca
 * evaluaciones, versiones ni intentos: solo sus dependientes huérfanos.
 */
function evCleanOrphans_() {
  evStoreReset_();
  evLogReset_('limpiarHuerfanas');
  evRequireInstalled_();

  var evaluacionIds = {};
  var evaluaciones = evAll_(EV_SHEET.EVALUACIONES);
  for (var e = 0; e < evaluaciones.length; e++) evaluacionIds[String(evaluaciones[e].id)] = true;
  var intentoIds = {};
  var intentos = evAll_(EV_SHEET.INTENTOS);
  for (var i = 0; i < intentos.length; i++) intentoIds[String(intentos[i].id)] = true;
  var versionIds = {};
  var versiones = evAll_(EV_SHEET.VERSIONES);
  for (var v = 0; v < versiones.length; v++) versionIds[String(versiones[v].id)] = true;

  var borrado = {
    respuestas: evPurge_(EV_SHEET.RESPUESTAS, evOrphanIds_(EV_SHEET.RESPUESTAS, 'intento_id', intentoIds)),
    integridad: evPurge_(EV_SHEET.INTEGRIDAD, evOrphanIds_(EV_SHEET.INTEGRIDAD, 'intento_id', intentoIds)),
    bloques: evPurge_(EV_SHEET.BLOQUES, evOrphanIds_(EV_SHEET.BLOQUES, 'version_id', versionIds)),
    preguntas: evPurge_(EV_SHEET.PREGUNTAS, evOrphanIds_(EV_SHEET.PREGUNTAS, 'evaluacion_id', evaluacionIds)),
    opciones: evPurge_(EV_SHEET.OPCIONES, evOrphanIds_(EV_SHEET.OPCIONES, 'evaluacion_id', evaluacionIds)),
    secciones: evPurge_(EV_SHEET.SECCIONES, evOrphanIds_(EV_SHEET.SECCIONES, 'evaluacion_id', evaluacionIds))
  };
  evInfo_('Limpieza de filas huérfanas.', borrado);
  evFlushLog_();
  evCommit_();
  return borrado;
}

function evOrphanIds_(sheetName, field, validIds) {
  var rows = evAll_(sheetName);
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var key = String(rows[i][field] || '');
    if (key && !validIds[key]) out.push(rows[i].id);
  }
  return out;
}

function menuLimpiarHuerfanas() {
  var borrado = evCleanOrphans_();
  var total = 0;
  var lineas = [];
  for (var key in borrado) {
    if (!Object.prototype.hasOwnProperty.call(borrado, key)) continue;
    total += borrado[key];
    if (borrado[key] > 0) lineas.push('· ' + key + ': ' + borrado[key]);
  }
  evShow_('Evaluaciones · limpieza',
    total === 0 ? 'No había filas huérfanas.' : 'Se eliminaron ' + total + ' filas:\n' + lineas.join('\n'));
}

function menuPodar() {
  var respuesta = evHandle_({
    accion: 'pruneLogs',
    solicitudId: 'menu_' + Utilities.getUuid(),
    payload: { conservar: EV_LIMITS.LOG_ROWS },
    actor: evActiveUserLabel_(),
    clientId: 'menu-libro'
  });
  if (!respuesta.ok) {
    evShow_('Poda', respuesta.error.mensaje + '\n\n' + respuesta.error.pista);
    return;
  }
  evShow_('Evaluaciones · poda',
    'Registro: ' + respuesta.datos.borrado.registro + ' filas eliminadas.\n' +
    'Métricas: ' + respuesta.datos.borrado.metricas + ' filas eliminadas.\n' +
    'Se conservan las ' + respuesta.datos.conservar + ' más recientes de cada hoja.');
}

function menuPruebas() {
  var resultado = evRunTests_();
  var lineas = [
    (resultado.fallidas === 0 ? '✅ ' : '❌ ') +
      resultado.pasadas + ' de ' + resultado.total + ' pruebas en verde',
    'Duración: ' + resultado.milisegundos + ' ms',
    ''
  ];
  for (var i = 0; i < resultado.resultados.length; i++) {
    var t = resultado.resultados[i];
    if (t.ok) continue;
    lineas.push('❌ ' + t.nombre);
    lineas.push('   ' + t.motivo);
  }
  if (resultado.fallidas === 0) lineas.push('Sin fallos.');
  evShow_('Evaluaciones · pruebas', lineas.join('\n'));
}

/**
 * Etiqueta del usuario que ejecuta desde el editor.
 *
 * Se usa SOLO para la bitácora del menú. La autorización de la API no depende de
 * la identidad de Google: fue precisamente esa dependencia la que dejó el módulo
 * anterior inservible para un equipo sin cuentas de Workspace.
 */
function evActiveUserLabel_() {
  try {
    var email = Session.getActiveUser().getEmail();
    return email ? 'libro:' + email : 'libro';
  } catch (error) {
    return 'libro';
  }
}

/* ------------------------------- Disparadores ------------------------------ */

/**
 * Tarea programada. Instala un disparador diario que la llame y el libro se
 * cuidará solo: cierra vencidos, poda y deja el diagnóstico en el diario.
 */
function tareaDiariaEvaluaciones() {
  var vencidos = evCloseExpiredAttempts_('disparador');
  var poda = { registro: 0, metricas: 0 };
  try {
    evStoreReset_();
    evLogReset_('tareaDiaria');
    poda.registro = evPruneSheet_(EV_SHEET.REGISTRO, EV_LIMITS.LOG_ROWS);
    poda.metricas = evPruneSheet_(EV_SHEET.METRICAS, EV_LIMITS.LOG_ROWS);
    var diagnostico = evDiagnose_({ profundo: false });
    evInfo_('Tarea diaria completada.', {
      intentosCerrados: vencidos.cerrados.length,
      podaRegistro: poda.registro,
      podaMetricas: poda.metricas,
      estadoDiagnostico: diagnostico.estado,
      hallazgos: diagnostico.hallazgos.length
    });
    evFlushLog_();
    evCommit_();
  } catch (error) {
    console.error('[evaluaciones] tarea diaria: ' + (error && error.message));
  }
  return { vencidos: vencidos, poda: poda };
}

/** Instala el disparador diario (idempotente). */
function instalarDisparadorDiario() {
  var existentes = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existentes.length; i++) {
    if (existentes[i].getHandlerFunction() === 'tareaDiariaEvaluaciones') {
      evShow_('Disparador', 'Ya existe un disparador diario instalado.');
      return;
    }
  }
  ScriptApp.newTrigger('tareaDiariaEvaluaciones').timeBased().everyDays(1).atHour(3).create();
  evShow_('Disparador', 'Se instaló un disparador diario a las 03:00 que cierra intentos vencidos y poda el registro.');
}
