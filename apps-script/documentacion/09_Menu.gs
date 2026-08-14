/**
 * 09_Menu.gs - menu dentro del libro y tareas programadas.
 *
 * -- Por que hay un menu si ya existe la web --------------------------------
 * Porque el acuerdo con el area es que puede seguir trabajando en Sheets cuando
 * le convenga. Si para reparar el libro o sacar un respaldo tuviera que abrir el
 * navegador, ese acuerdo seria falso. Las mismas acciones estan en los dos
 * sitios y hacen exactamente lo mismo.
 *
 * -- Las tareas programadas --------------------------------------------------
 * Una diaria que saca respaldo, recalcula metricas y compacta bitacoras. Se
 * instala desde el menu, no automaticamente: un disparador que aparece solo en
 * el libro de alguien es una sorpresa desagradable.
 */

/** Menu del libro. Google la ejecuta al abrirlo. */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('Documentacion')
      .addItem('Instalar o reparar', 'docMenuInstalar')
      .addItem('Diagnosticar', 'docMenuDiagnosticar')
      .addItem('Reparar automaticamente', 'docMenuAutoreparar')
      .addSeparator()
      .addItem('Instalar o actualizar (modelo normalizado)', 'docMenuInstalarModelo')
      .addItem('Simular migracion (no escribe nada)', 'docMenuSimularMigracion')
      .addItem('Migrar al modelo normalizado', 'docMenuMigrar')
      .addItem('Diagnosticar modelo normalizado', 'docMenuDiagnosticarModelo')
      .addItem('Reparar modelo normalizado', 'docMenuRepararModelo')
      .addItem('Ejecutar proceso diario ahora', 'docMenuProcesoDiario')
      .addSeparator()
      .addItem('Crear pestana del ano en curso', 'docMenuCrearAnio')
      .addItem('Recalcular avances', 'docMenuRecalcular')
      .addItem('Repintar colores', 'docMenuRecolorear')
      .addSeparator()
      .addItem('Guardar respaldo', 'docMenuRespaldar')
      .addItem('Ver respaldos', 'docMenuVerRespaldos')
      .addItem('Buscar duplicados', 'docMenuDuplicados')
      .addItem('Compactar bitacoras', 'docMenuCompactar')
      .addSeparator()
      .addItem('Activar tarea diaria', 'docInstalarDisparadores')
      .addItem('Desactivar tarea diaria', 'docQuitarDisparadores')
      .addItem('Ejecutar pruebas', 'docMenuPruebas')
      .addToUi();
  } catch (e) { /* sin interfaz disponible */ }
}

/** Envoltorio comun: prepara el contexto, ejecuta y avisa del resultado. */
function docMenuRun_(titulo, fn) {
  docLogReset_('menu');
  docStoreReset_();
  docYearsReset_();
  doc2Reset_();
  var ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { ui = null; }
  try {
    var mensaje = fn();
    docCommit_();
    docYearsCommit_();
    docFlushLog_();
    docCommit_();
    if (ui) ui.alert(titulo, mensaje, ui.ButtonSet.OK);
    return mensaje;
  } catch (error) {
    docRollback_();
    var info = docClassify_(error);
    var texto = info.message + (info.docHint ? '\n\nQue hacer: ' + info.docHint : '');
    if (ui) ui.alert(titulo + ' - no se pudo completar', texto, ui.ButtonSet.OK);
    return texto;
  }
}

function docMenuInstalar() {
  return docMenuRun_('Instalar o reparar', function () {
    var r = docInstallSchema_(docActor_(null), []);
    var lineas = [];
    for (var i = 0; i < r.acciones.length; i++) {
      lineas.push('- ' + r.acciones[i].hoja + ': ' + r.acciones[i].accion);
    }
    return 'Listo.\n\n' + lineas.join('\n');
  });
}

function docMenuDiagnosticar() {
  return docMenuRun_('Diagnostico', function () {
    var d = docDiagnose_();
    if (d.ok && !d.hallazgos.length) {
      return 'Todo correcto.\n\nExpedientes: ' + d.resumen.expedientes +
        '\nAnos: ' + d.resumen.anios.join(', ') +
        '\nLineas de auditoria: ' + d.resumen.auditoria;
    }
    var lineas = ['Expedientes: ' + d.resumen.expedientes + '   Anos: ' + d.resumen.anios.join(', '), ''];
    for (var i = 0; i < d.hallazgos.length; i++) {
      var h = d.hallazgos[i];
      lineas.push('[' + h.severidad.toUpperCase() + '] ' + h.titulo);
      lineas.push('   ' + h.detalle);
      if (h.accion) lineas.push('   Se corrige con: ' + h.accion);
      lineas.push('');
    }
    return lineas.join('\n');
  });
}

function docMenuAutoreparar() {
  return docMenuRun_('Reparar automaticamente', function () {
    var r = docAutoRepair_(docActor_(null), 'menu');
    if (!r.aplicadas.length) return 'No hizo falta reparar nada.';
    var lineas = [];
    for (var i = 0; i < r.aplicadas.length; i++) {
      lineas.push('- ' + r.aplicadas[i].accion + ': ' + (r.aplicadas[i].detalle || r.aplicadas[i].error || ''));
    }
    return lineas.join('\n') + '\n\nProblemas criticos restantes: ' + r.despues.criticos;
  });
}

function docMenuCrearAnio() {
  return docMenuRun_('Crear pestana anual', function () {
    var anio = new Date().getFullYear();
    var r = docEnsureYearSheet_(anio);
    return 'Pestana ' + r.hoja + ': ' + r.accion + '.';
  });
}

function docMenuRecalcular() {
  return docMenuRun_('Recalcular avances', function () {
    var r = docRecalc_(null, docActor_(null));
    return r.actualizadas + ' fila(s) recalculada(s).\n' +
      r.omitidas + ' fila(s) sin checklist se dejaron intactas.';
  });
}

function docMenuRecolorear() {
  return docMenuRun_('Repintar colores', function () {
    var r = docRecolor_(null, docActor_(null));
    return r.pintadas + ' fila(s) repintada(s) en ' + r.anios.length + ' pestana(s).';
  });
}

function docMenuRespaldar() {
  return docMenuRun_('Guardar respaldo', function () {
    var r = docBackup_('manual desde el menu', docActor_(null));
    return 'Respaldo ' + r.id + '\n' + r.expedientes + ' expediente(s), ' + r.bytes + ' caracteres.';
  });
}

function docMenuVerRespaldos() {
  return docMenuRun_('Respaldos', function () {
    var lista = docListBackups_();
    if (!lista.length) return 'Todavia no hay ningun respaldo.';
    var lineas = [];
    for (var i = 0; i < Math.min(lista.length, 15); i++) {
      lineas.push(String(lista[i].momento).slice(0, 16).replace('T', ' ') +
        '  ' + lista[i].expedientes + ' exp.  ' + lista[i].motivo);
    }
    return lineas.join('\n');
  });
}

function docMenuDuplicados() {
  return docMenuRun_('Duplicados', function () {
    var r = docDedupe_(null, false, docActor_(null), 'menu');
    if (!r.grupos.length) return 'No se encontraron duplicados.';
    var lineas = ['Se encontraron ' + r.grupos.length + ' grupo(s):', ''];
    for (var i = 0; i < Math.min(r.grupos.length, 20); i++) {
      lineas.push('- ' + r.grupos[i].nombre + ' (' + r.grupos[i].anio + '): ' +
        r.grupos[i].total + ' filas. Se conservaria ' + r.grupos[i].conservar);
    }
    lineas.push('');
    lineas.push('No se elimino nada. Fusionar expedientes se hace desde el modulo.');
    return lineas.join('\n');
  });
}

function docMenuCompactar() {
  return docMenuRun_('Compactar', function () {
    var r = docCompact_(docActor_(null));
    return r.eliminadas + ' linea(s) antigua(s) retirada(s).';
  });
}

function docMenuPruebas() {
  return docMenuRun_('Pruebas', function () {
    return docFormatTestReport_(docEjecutarPruebas());
  });
}

/* -------------------- Menu del modelo normalizado ------------------------- */

/**
 * Contexto de administracion para el menu.
 *
 * Quien abre el menu del libro tiene acceso de edicion al libro: por eso opera
 * como administrador del modulo. La autorizacion fina la siguen aplicando los
 * servicios; esto solo evita que el menu falle por no tener rol asignado.
 */
function docMenuContexto_() {
  var actor = docActor_(null);
  return {
    requestId: docTraceId_(),
    accion: 'menu',
    actor: actor,
    actorId: actor,
    actorDisplay: actor,
    rol: 'admin',
    capacidades: doc2CapacidadesDe_('admin'),
    porLlave: true,
    origen: 'menu',
    metodo: 'MENU',
    ahora: docNow_()
  };
}

function docMenuInstalarModelo() {
  return docMenuRun_('Modelo normalizado', function () {
    var r = doc2Instalar_({ conRespaldo: true }, docMenuContexto_());
    var lineas = ['Hojas revisadas: ' + r.hojas.length];
    if (r.respaldo && r.respaldo.ok) lineas.push('Respaldo previo: ' + r.respaldo.respaldoId + ' (' + r.respaldo.expedientes + ' expedientes)');
    for (var i = 0; i < r.migracion.ejecutadas.length; i++) {
      var m = r.migracion.ejecutadas[i];
      lineas.push('- ' + m.version + ': ' + (m.ok ? m.resumen : ('ERROR ' + m.error)));
    }
    lineas.push('');
    lineas.push('Hallazgos criticos: ' + r.diagnostico.conteos.CRITICO);
    if (r.migracion.estado.pendientes.length) {
      lineas.push('Migraciones pendientes: ' + r.migracion.estado.pendientes.join(', '));
      lineas.push('Vuelve a ejecutar esta opcion para continuar donde se quedo.');
    }
    return lineas.join('\n');
  });
}

function docMenuSimularMigracion() {
  return docMenuRun_('Simulacion de migracion', function () {
    var r = doc2Migrar_({ simular: true }, docMenuContexto_());
    var lineas = ['Nada se escribio en el libro.', ''];
    for (var i = 0; i < r.ejecutadas.length; i++) {
      lineas.push('- ' + r.ejecutadas[i].version + ': ' + (r.ejecutadas[i].resumen || r.ejecutadas[i].error));
    }
    lineas.push('');
    lineas.push(r.recomendacionRespaldo);
    return lineas.join('\n');
  });
}

function docMenuMigrar() {
  return docMenuRun_('Migracion', function () {
    var r = doc2Migrar_({}, docMenuContexto_());
    var lineas = [];
    for (var i = 0; i < r.ejecutadas.length; i++) {
      var m = r.ejecutadas[i];
      lineas.push('- ' + m.version + ': ' + (m.ok ? m.resumen : ('ERROR ' + m.error)));
    }
    if (!lineas.length) lineas.push('No habia migraciones pendientes.');
    if (r.estado.pendientes.length) {
      lineas.push('');
      lineas.push('Quedan pendientes: ' + r.estado.pendientes.join(', ') + '. Vuelve a ejecutar para continuar.');
    }
    return lineas.join('\n');
  });
}

function docMenuDiagnosticarModelo() {
  return docMenuRun_('Diagnostico del modelo', function () {
    var d = doc2Diagnostico_(docMenuContexto_());
    var lineas = [
      'Expedientes: ' + d.resumen.expedientes + '   Requisitos: ' + d.resumen.requisitos,
      'Hojas normalizadas: ' + d.resumen.hojasNormalizadas + ' de ' + DOC2_SHEET_ORDER.length,
      'Criticos: ' + d.conteos.CRITICO + '   Importantes: ' + d.conteos.IMPORTANTE +
        '   Advertencias: ' + d.conteos.ADVERTENCIA + '   Info: ' + d.conteos.INFO,
      ''
    ];
    for (var i = 0; i < Math.min(d.hallazgos.length, 20); i++) {
      var h = d.hallazgos[i];
      lineas.push('[' + h.severidad + '] ' + h.titulo);
      lineas.push('   ' + h.detalle);
      if (h.accion) lineas.push('   Se corrige con: ' + h.accion + (h.reparable === 'automatica' ? ' (automatico)' : ' (requiere confirmacion)'));
      lineas.push('');
    }
    if (!d.hallazgos.length) lineas.push('Sin hallazgos.');
    return lineas.join('\n');
  });
}

function docMenuRepararModelo() {
  return docMenuRun_('Reparacion del modelo', function () {
    var r = doc2Reparar_({}, docMenuContexto_());
    var lineas = [];
    for (var i = 0; i < r.aplicadas.length; i++) {
      lineas.push('- ' + r.aplicadas[i].accion + ': ' + r.aplicadas[i].cambios + ' cambio(s)');
    }
    if (!lineas.length) lineas.push('No hizo falta reparar nada de forma automatica.');
    lineas.push('');
    lineas.push('Criticos antes: ' + r.antes.conteos.CRITICO + '   despues: ' + r.despues.conteos.CRITICO);
    if (r.omitidas.length) {
      lineas.push('');
      lineas.push('Omitidas (requieren confirmacion desde el modulo):');
      for (var o = 0; o < r.omitidas.length; o++) lineas.push('- ' + r.omitidas[o].accion + ': ' + r.omitidas[o].motivo);
    }
    if (r.pendientesManuales.length) {
      lineas.push('');
      lineas.push('Requieren revision manual:');
      for (var m = 0; m < Math.min(r.pendientesManuales.length, 10); m++) {
        lineas.push('- ' + r.pendientesManuales[m].titulo);
      }
    }
    return lineas.join('\n');
  });
}

function docMenuProcesoDiario() {
  return docMenuRun_('Proceso diario', function () {
    var r = doc2ProcesoDiario_(docMenuContexto_());
    return [
      'Fecha: ' + r.fecha,
      'Prorrogas vencidas: ' + r.prorrogasVencidas + '   avisadas: ' + r.prorrogasAvisadas,
      'Solicitudes vencidas: ' + r.solicitudesVencidas,
      'Tareas vencidas: ' + r.tareasVencidas,
      'Aprobaciones vencidas: ' + r.aprobacionesVencidas,
      r.retencion ? ('Retencion: ' + r.retencion.marcados + ' expediente(s) marcado(s)') : '',
      r.errores.length ? ('Errores: ' + r.errores.join(' | ')) : 'Sin errores.'
    ].join('\n');
  });
}

/* ------------------------------ Disparadores ------------------------------ */

/** Activa la tarea diaria de madrugada. Quita antes las anteriores. */
function docInstalarDisparadores() {
  return docMenuRun_('Tarea diaria', function () {
    docQuitarDisparadoresInterno_();
    ScriptApp.newTrigger('docTareaDiaria')
      .timeBased()
      .atHour(3)
      .everyDays(1)
      .create();
    return 'Tarea diaria activada. Cada madrugada guardara un respaldo, recalculara los avances y compactara las bitacoras.';
  });
}

function docQuitarDisparadores() {
  return docMenuRun_('Tarea diaria', function () {
    var n = docQuitarDisparadoresInterno_();
    return n ? ('Se desactivaron ' + n + ' tarea(s).') : 'No habia ninguna tarea activa.';
  });
}

function docQuitarDisparadoresInterno_() {
  var todos = ScriptApp.getProjectTriggers();
  var quitados = 0;
  for (var i = 0; i < todos.length; i++) {
    if (todos[i].getHandlerFunction() === 'docTareaDiaria') {
      ScriptApp.deleteTrigger(todos[i]);
      quitados++;
    }
  }
  return quitados;
}

/**
 * Tarea diaria.
 *
 * Cada paso va protegido por separado: que falle el respaldo no puede impedir
 * que se recalculen los avances, y al reves.
 */
function docTareaDiaria() {
  docLogReset_('tarea.diaria');
  docStoreReset_();
  docYearsReset_();
  doc2Reset_();
  var pasos = [];

  try {
    docEnsureYearSheet_(new Date().getFullYear());
    pasos.push('pestana del ano en curso verificada');
  } catch (e) { pasos.push('pestana anual: ' + docClassify_(e).message); }

  try {
    if (String(docConfigGet_('respaldo_automatico', 'TRUE')).toUpperCase() !== 'FALSE') {
      var b = docBackup_('automatico diario', 'tarea programada');
      pasos.push('respaldo ' + b.id + ' con ' + b.expedientes + ' expediente(s)');
    }
  } catch (e) { pasos.push('respaldo: ' + docClassify_(e).message); }

  try {
    var r = docRecalc_(new Date().getFullYear(), 'tarea programada');
    pasos.push(r.actualizadas + ' avance(s) recalculado(s)');
  } catch (e) { pasos.push('recalculo: ' + docClassify_(e).message); }

  try {
    var c = docCompact_('tarea programada');
    pasos.push(c.eliminadas + ' linea(s) compactada(s)');
  } catch (e) { pasos.push('compactacion: ' + docClassify_(e).message); }

  // Vencimientos del modelo normalizado: prorrogas, solicitudes, tareas,
  // aprobaciones y retencion. Es idempotente, asi que dos ejecuciones el mismo
  // dia no duplican avisos.
  try {
    var estadoModelo = doc2Estado_(docMenuContexto_());
    if (estadoModelo.instalado) {
      var diario = doc2ProcesoDiario_(docMenuContexto_());
      pasos.push('modelo normalizado: ' + diario.prorrogasVencidas + ' prorroga(s) vencida(s), ' +
        diario.solicitudesVencidas + ' solicitud(es) vencida(s), ' + diario.tareasVencidas + ' tarea(s) vencida(s)');
    } else {
      pasos.push('modelo normalizado no instalado: se omite su proceso diario');
    }
  } catch (e) { pasos.push('proceso diario del modelo: ' + docClassify_(e).message); }

  try {
    docAudit_({
      accion: DOC_ACCION.MANTENIMIENTO, entidad: 'sistema',
      actor: 'tarea programada', origen: 'trigger',
      campo: 'tarea diaria', nuevo: pasos.join(' | ')
    });
    docCommit_();
    docYearsCommit_();
    docFlushLog_();
    docCommit_();
  } catch (e) { /* la tarea ya hizo su trabajo */ }

  return pasos;
}

/** Muestra la URL de la aplicacion web para pegarla en el frontend. */
function docMostrarUrl() {
  return docMenuRun_('URL del backend', function () {
    var url = ScriptApp.getService().getUrl();
    if (!url) return 'Todavia no hay una implementacion publicada. Ve a Implementar y crea una implementacion de tipo Aplicacion web.';
    return 'Pega esta direccion en SCRIPT_URL dentro de src/constants.ts:\n\n' + url;
  });
}
