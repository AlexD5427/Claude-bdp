/**
 * 09_Menu.gs - el menu del libro y las tareas programadas.
 *
 * Quien administra este libro no siempre entra por la aplicacion web. Todo lo
 * que se puede hacer desde la web se puede hacer tambien desde aqui, con la
 * ventaja de que Apps Script pide los permisos de forma explicita la primera vez.
 *
 * Regla de este archivo: cada entrada del menu llama a `docMenuRun_`, que se
 * encarga del envoltorio comun -reiniciar el registro, confirmar los cambios,
 * mostrar el resultado y, sobre todo, mostrar el ERROR de forma legible-. Un
 * fallo dentro de `onOpen` que nadie captura deja el menu a medias sin decir por
 * que.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Documentacion')
    .addItem('Instalar o reparar', 'docMenuInstalar')
    .addItem('Diagnosticar', 'docMenuDiagnosticar')
    .addItem('Reparar automaticamente', 'docMenuAutoreparar')
    .addSeparator()
    .addItem('Validar catalogos (Auxiliar)', 'docMenuAuxiliar')
    .addItem('Reparar catalogos (Auxiliar)', 'docMenuAuxiliarReparar')
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
}

/**
 * Envoltorio comun de las entradas del menu.
 *
 * Reinicia el registro, ejecuta, confirma los cambios pendientes y muestra el
 * resultado. Si algo falla, muestra el mensaje ya clasificado en lugar de la
 * excepcion cruda: el codigo de `01_Core.gs` es comprensible, el volcado de la
 * pila no lo es.
 */
function docMenuRun_(titulo, fn) {
  var ui = SpreadsheetApp.getUi();
  docLogReset_(titulo);
  docStoreReset_();
  docYearsReset_();
  try {
    var mensaje = fn();
    docCommit_();
    docYearsCommit_();
    docFlushLog_();
    docCommit_();
    ui.alert(titulo, String(mensaje || 'Listo.'), ui.ButtonSet.OK);
  } catch (error) {
    docRollback_();
    var info = docClassify_(error);
    ui.alert(titulo + ' - error',
      info.message + (info.docHint ? '\n\n' + info.docHint : ''),
      ui.ButtonSet.OK);
  }
}

function docMenuInstalar() {
  docMenuRun_('Instalar o reparar', function () {
    var r = docInstallSchema_(docActor_({}), []);
    return r.acciones.length
      ? r.acciones.length + ' cambio(s):\n\n' + r.acciones.map(function (a) {
        return '- ' + a.hoja + ': ' + a.accion;
      }).join('\n')
      : 'La estructura ya estaba completa. No hizo falta cambiar nada.';
  });
}

function docMenuDiagnosticar() {
  docMenuRun_('Diagnostico', function () {
    var d = docDiagnose_();
    if (!d.hallazgos.length) return 'Sin problemas. Esquema ' + d.esquema + '.';
    return d.criticos + ' critico(s), ' + (d.hallazgos.length - d.criticos) + ' aviso(s):\n\n' +
      d.hallazgos.slice(0, 12).map(function (h) {
        return '[' + h.severidad + '] ' + h.titulo;
      }).join('\n');
  });
}

function docMenuAutoreparar() {
  docMenuRun_('Reparacion automatica', function () {
    var r = docAutoRepair_(docActor_({}), 'menu');
    return r.acciones.length
      ? r.acciones.length + ' correccion(es) aplicada(s).'
      : 'No habia nada que reparar automaticamente.';
  });
}

/**
 * Revisa la pestana `Auxiliar` sin tocarla.
 *
 * Solo lectura, siempre. Se puede pulsar sin pensarlo dos veces, que es
 * justamente por lo que esta separada de la reparacion.
 */
function docMenuAuxiliar() {
  docMenuRun_('Catalogos (Auxiliar)', function () {
    var v = docAuxValidate_();
    var lineas = [];

    lineas.push('Agencias cargadas: ' + v.opciones.agencias.length);
    lineas.push('Gerencias cargadas: ' + v.opciones.gerencias.length);

    if (!v.hallazgos.length) {
      lineas.push('');
      lineas.push('Sin problemas: las cabeceras agencia_bdp y gerencia_bdp estan');
      lineas.push('bien escritas y sus valores se leen correctamente.');
      return lineas.join('\n');
    }

    lineas.push('');
    lineas.push(v.criticos + ' critico(s), ' + (v.hallazgos.length - v.criticos) + ' aviso(s):');
    lineas.push('');
    for (var i = 0; i < v.hallazgos.length && i < 10; i++) {
      var h = v.hallazgos[i];
      lineas.push('[' + h.severidad + '] ' + h.titulo);
      lineas.push('   ' + h.detalle);
    }
    if (v.criticos > 0) {
      lineas.push('');
      lineas.push('Usa "Reparar catalogos (Auxiliar)" para corregir lo que se pueda');
      lineas.push('corregir sin riesgo. Nunca borra valores.');
    }
    return lineas.join('\n');
  });
}

/**
 * Repara la pestana `Auxiliar`.
 *
 * Crea la hoja o las cabeceras que falten y adopta una variante de cabecera solo
 * cuando es inequivoca. NUNCA borra un valor.
 *
 * El informe distingue lo aplicado de lo PENDIENTE. Lo pendiente es lo
 * importante: son los casos ambiguos que el codigo se niega a resolver por su
 * cuenta -dos cabeceras parecidas, cabeceras duplicadas- y que necesitan que una
 * persona mire la hoja.
 */
function docMenuAuxiliarReparar() {
  docMenuRun_('Reparar catalogos (Auxiliar)', function () {
    var r = docAuxRepair_(docActor_({}), 'menu');
    var lineas = [];

    if (r.acciones.length) {
      lineas.push(r.acciones.length + ' cambio(s) aplicado(s):');
      for (var i = 0; i < r.acciones.length; i++) {
        lineas.push('- ' + r.acciones[i].accion + ': ' + r.acciones[i].detalle);
      }
    } else {
      lineas.push('No hizo falta cambiar nada.');
    }

    if (r.pendientes.length) {
      lineas.push('');
      lineas.push('Requiere tu decision (' + r.pendientes.length + '):');
      for (var p = 0; p < r.pendientes.length; p++) {
        lineas.push('- ' + r.pendientes[p].cabecera + ': ' + r.pendientes[p].motivo);
      }
    }

    lineas.push('');
    lineas.push('Agencias: ' + r.opciones.agencias.length +
      ' | Gerencias: ' + r.opciones.gerencias.length);
    return lineas.join('\n');
  });
}

function docMenuCrearAnio() {
  docMenuRun_('Crear pestana del ano', function () {
    var r = docEnsureYearSheet_(new Date().getFullYear());
    return 'Pestana "' + r.hoja + '": ' + r.accion + '.';
  });
}

function docMenuRecalcular() {
  docMenuRun_('Recalcular avances', function () {
    var r = docRecalc_(0, docActor_({}));
    return r.actualizados + ' expediente(s) actualizado(s) de ' + r.revisados + ' revisado(s).';
  });
}

function docMenuRecolorear() {
  docMenuRun_('Repintar colores', function () {
    var r = docRecolor_(0, docActor_({}));
    return r.filas + ' fila(s) repintada(s) en ' + r.hojas + ' pestana(s).';
  });
}

function docMenuRespaldar() {
  docMenuRun_('Guardar respaldo', function () {
    var r = docBackup_('manual desde el menu', docActor_({}));
    return 'Respaldo ' + r.id + ' guardado con ' + r.expedientes + ' expediente(s).';
  });
}

function docMenuVerRespaldos() {
  docMenuRun_('Respaldos', function () {
    var lista = docListBackups_();
    if (!lista.length) return 'Todavia no hay respaldos guardados.';
    return lista.slice(0, 15).map(function (b) {
      return b.id + '  |  ' + b.creado_en + '  |  ' + b.expedientes + ' exp.  |  ' + b.motivo;
    }).join('\n');
  });
}

function docMenuDuplicados() {
  docMenuRun_('Duplicados', function () {
    var r = docDedupe_(0, false, docActor_({}), 'menu');
    if (!r.grupos.length) return 'No hay identificadores repetidos.';
    return r.grupos.length + ' identificador(es) repetido(s):\n\n' +
      r.grupos.slice(0, 15).map(function (g) {
        return '- ' + g.identificador + ' (' + g.filas + ' filas)';
      }).join('\n');
  });
}

function docMenuCompactar() {
  docMenuRun_('Compactar bitacoras', function () {
    var r = docCompact_(docActor_({}));
    return r.eliminadas + ' fila(s) antigua(s) eliminada(s).';
  });
}

function docMenuPruebas() {
  docMenuRun_('Pruebas', function () {
    var r = docRunTests_();
    return r.fallidas === 0
      ? r.total + ' prueba(s), todas correctas.'
      : r.fallidas + ' de ' + r.total + ' prueba(s) fallaron:\n\n' +
        r.detalle.filter(function (d) { return !d.ok; })
          .map(function (d) { return '- ' + d.nombre + ': ' + d.mensaje; })
          .join('\n');
  });
}

/* ------------------------------ Disparadores ------------------------------ */

/**
 * Activa la tarea diaria.
 *
 * Se quitan antes los disparadores existentes para que pulsar el menu dos veces
 * no deje dos tareas ejecutandose a la misma hora.
 */
function docInstalarDisparadores() {
  var ui = SpreadsheetApp.getUi();
  try {
    docQuitarDisparadoresInterno_();
    ScriptApp.newTrigger('docTareaDiaria').timeBased().atHour(3).everyDays(1).create();
    ui.alert('Tarea diaria', 'Activada. Se ejecutara cada dia alrededor de las 3 de la manana.', ui.ButtonSet.OK);
  } catch (error) {
    ui.alert('Tarea diaria - error', docClassify_(error).message, ui.ButtonSet.OK);
  }
}

function docQuitarDisparadores() {
  var ui = SpreadsheetApp.getUi();
  try {
    var quitados = docQuitarDisparadoresInterno_();
    ui.alert('Tarea diaria', quitados + ' disparador(es) desactivado(s).', ui.ButtonSet.OK);
  } catch (error) {
    ui.alert('Tarea diaria - error', docClassify_(error).message, ui.ButtonSet.OK);
  }
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
 * Mantenimiento nocturno.
 *
 * Cada paso va en su propio try: que falle el respaldo no puede impedir que se
 * recalculen los avances. Un mantenimiento que se detiene en el primer tropiezo
 * es un mantenimiento que deja de hacerse.
 */
function docTareaDiaria() {
  docLogReset_('tarea-diaria');
  docStoreReset_();
  docYearsReset_();

  var pasos = [];

  try {
    docEnsureYearSheet_(new Date().getFullYear());
    pasos.push('pestana del ano verificada');
  } catch (e) { pasos.push('pestana del ano: ' + docClassify_(e).message); }

  try {
    var r = docRecalc_(0, 'tarea-diaria');
    pasos.push(r.actualizados + ' avance(s) recalculado(s)');
  } catch (e) { pasos.push('recalculo: ' + docClassify_(e).message); }

  // La cache de catalogos se tira aqui para que un alta hecha el viernes por la
  // tarde este disponible el lunes sin que nadie pulse "actualizar".
  try {
    docAuxInvalidate_();
    pasos.push('cache de catalogos renovada');
  } catch (e) { pasos.push('cache de catalogos: ' + docClassify_(e).message); }

  try {
    if (docConfigGet_('respaldo_automatico', 'TRUE') === 'TRUE') {
      var b = docBackup_('automatico', 'tarea-diaria');
      pasos.push('respaldo ' + b.id);
    }
  } catch (e) { pasos.push('respaldo: ' + docClassify_(e).message); }

  try {
    docCompact_('tarea-diaria');
    pasos.push('bitacoras compactadas');
  } catch (e) { pasos.push('compactado: ' + docClassify_(e).message); }

  try {
    docAudit_({
      accion: DOC_ACCION.MANTENIMIENTO,
      entidad: 'sistema',
      actor: 'tarea-diaria',
      origen: 'disparador',
      nuevo: pasos.join(' | ')
    });
  } catch (e) { /* la auditoria no manda sobre el mantenimiento */ }

  docCommit_();
  docYearsCommit_();
  docFlushLog_();
  docCommit_();
}

/** Muestra la URL de la aplicacion web para pegarla en la configuracion. */
function docMostrarUrl() {
  var ui = SpreadsheetApp.getUi();
  try {
    var url = ScriptApp.getService().getUrl();
    ui.alert('URL del backend',
      url
        ? url + '\n\nPegala en Documentacion > Configuracion > Conexion.'
        : 'Todavia no hay implementacion publicada. Publica el proyecto como aplicacion web.',
      ui.ButtonSet.OK);
  } catch (error) {
    ui.alert('URL del backend - error', docClassify_(error).message, ui.ButtonSet.OK);
  }
}
