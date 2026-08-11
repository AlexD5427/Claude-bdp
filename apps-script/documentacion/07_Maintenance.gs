/**
 * 07_Maintenance.gs - diagnostico, autorreparacion y tareas de mantenimiento.
 *
 * -- Para que existe este archivo -------------------------------------------
 * Para que nadie tenga que abrir Apps Script nunca. Todo lo que aqui se define
 * se expone como accion del enrutador y aparece como boton en la configuracion
 * del modulo. Quien usa el sistema no es programador; si algo se rompe, la
 * respuesta correcta es un boton que lo arregla, no un manual.
 *
 * -- Como se presenta un problema -------------------------------------------
 * El diagnostico no devuelve "hay 3 errores". Devuelve una lista de hallazgos y
 * cada uno trae: que pasa, por que importa, que gravedad tiene y QUE ACCION lo
 * corrige. El frontend pinta un boton por hallazgo con esa accion dentro. Un
 * diagnostico que no dice como arreglar lo que encontro no ha terminado su
 * trabajo.
 *
 * -- Regla de oro ------------------------------------------------------------
 * Toda operacion destructiva saca un respaldo antes. Restaurar, deduplicar y
 * compactar guardan una copia previa sin preguntar. El coste es una fila en
 * _RESPALDOS; el beneficio es que ninguna equivocacion es definitiva.
 */

/* -------------------------------- Diagnostico ----------------------------- */

var DOC_SEVERIDAD = { CRITICO: 'critico', AVISO: 'aviso', INFO: 'info' };

/**
 * Revision completa del libro.
 *
 * Nunca lanza: si el diagnostico se cayera ante un libro roto seria inutil justo
 * cuando mas se necesita.
 */
function docDiagnose_() {
  var inicio = Date.now();
  var hallazgos = [];
  var resumen = {
    instalado: false,
    esquema: DOC_BACKEND.schemaVersion,
    backend: DOC_BACKEND.version,
    libro: '',
    libroId: '',
    anios: [],
    expedientes: 0,
    historicas: 0,
    auditoria: 0,
    respaldos: 0,
    ultimoRespaldo: ''
  };

  var informe;
  try {
    informe = docVerifySchema_();
    resumen.instalado = informe.instalado && informe.ok;
    resumen.libro = informe.libroNombre || '';
    resumen.libroId = informe.libroId || '';
  } catch (error) {
    hallazgos.push(docHallazgo_(DOC_SEVERIDAD.CRITICO, 'libro-inaccesible',
      'No se puede abrir el libro de calculo.',
      docClassify_(error).message,
      'instalar'));
    return { ok: false, resumen: resumen, hallazgos: hallazgos, ms: Date.now() - inicio };
  }

  if (informe.hojasFaltantes.length) {
    hallazgos.push(docHallazgo_(DOC_SEVERIDAD.CRITICO, 'hojas-faltantes',
      'Faltan ' + informe.hojasFaltantes.length + ' hoja(s) del sistema.',
      'Sin ellas no se puede auditar ni configurar el modulo: ' + informe.hojasFaltantes.join(', ') + '.',
      'instalar', { hojas: informe.hojasFaltantes }));
  }

  if (informe.hojasAReparar.length) {
    hallazgos.push(docHallazgo_(DOC_SEVERIDAD.CRITICO, 'columnas-faltantes',
      'Hay hojas a las que les faltan columnas.',
      'Se anadiran al final, sin mover ni borrar nada: ' + informe.hojasAReparar.join(', ') + '.',
      'reparar', { hojas: informe.hojasAReparar }));
  }

  if (informe.aniosAReparar.length) {
    hallazgos.push(docHallazgo_(DOC_SEVERIDAD.CRITICO, 'anios-incompletos',
      'Alguna pestana anual no tiene todas sus columnas.',
      'Anios afectados: ' + informe.aniosAReparar.join(', ') + '.',
      'reparar', { anios: informe.aniosAReparar }));
  }

  // Pestana del anio en curso.
  var anioActual = new Date().getFullYear();
  var anios = [];
  try { anios = docListYears_(); } catch (e) { anios = []; }
  resumen.anios = anios;
  if (anios.indexOf(anioActual) < 0) {
    hallazgos.push(docHallazgo_(DOC_SEVERIDAD.AVISO, 'anio-en-curso',
      'No existe la pestana ' + docYearSheetName_(anioActual) + '.',
      'Los ingresos de este ano no tienen donde registrarse.',
      'crear-anio', { anio: anioActual }));
  }

  // Recorrido de las pestanas anuales.
  var duplicadosTotales = 0;
  var sinFecha = 0;
  var sinCorreo = 0;
  var desactualizadas = 0;

  for (var a = 0; a < anios.length; a++) {
    var cargada = null;
    try { cargada = docLoadYear_(anios[a], false); } catch (e) { cargada = null; }
    if (!cargada) continue;

    var vistosId = {};
    var vistosNombre = {};
    for (var r = 0; r < cargada.rows.length; r++) {
      var fila = cargada.rows[r];
      resumen.expedientes++;
      if (fila.__heredada) resumen.historicas++;
      if (!fila.__heredada) {
        if (vistosId[fila.id]) duplicadosTotales++;
        vistosId[fila.id] = true;
      }
      var kn = docKey_(fila.nombre);
      if (kn) {
        if (vistosNombre[kn]) duplicadosTotales++;
        vistosNombre[kn] = true;
      }
      if (!fila.fecha_ingreso) sinFecha++;
      if (!fila.correo && !fila.__heredada) sinCorreo++;
      if (!fila.__heredada && fila.detalle_json) {
        var esperado = fila.avance >= 100 ? 'COMPLETO' : 'FALTA';
        if (String(fila.proceso) !== esperado) desactualizadas++;
      }
    }
  }

  if (duplicadosTotales > 0) {
    hallazgos.push(docHallazgo_(DOC_SEVERIDAD.AVISO, 'duplicados',
      'Hay ' + duplicadosTotales + ' posible(s) duplicado(s).',
      'Dos filas con el mismo identificador o el mismo nombre en el mismo ano.',
      'deduplicar', { total: duplicadosTotales }));
  }

  if (desactualizadas > 0) {
    hallazgos.push(docHallazgo_(DOC_SEVERIDAD.AVISO, 'metricas-desfasadas',
      desactualizadas + ' fila(s) tienen la columna Proceso desfasada.',
      'El avance guardado no coincide con lo que dice la columna. Se recalcula sin tocar los documentos.',
      'recalcular', { total: desactualizadas }));
  }

  if (sinFecha > 0) {
    hallazgos.push(docHallazgo_(DOC_SEVERIDAD.INFO, 'sin-fecha',
      sinFecha + ' fila(s) no tienen fecha de ingreso.',
      'Sin fecha no se puede calcular el atraso ni saber a que ano pertenecen.',
      '', { total: sinFecha }));
  }

  if (sinCorreo > 0) {
    hallazgos.push(docHallazgo_(DOC_SEVERIDAD.INFO, 'sin-correo',
      sinCorreo + ' expediente(s) no tienen correo.',
      'No se les puede enviar el recordatorio de documentacion pendiente.',
      '', { total: sinCorreo }));
  }

  // Bitacoras y respaldos.
  try {
    resumen.auditoria = docCountRows_(DOC_SHEET.AUDITORIA);
    if (resumen.auditoria > DOC_LIMITS.MAX_AUDIT_ROWS) {
      hallazgos.push(docHallazgo_(DOC_SEVERIDAD.AVISO, 'auditoria-grande',
        'La bitacora tiene ' + resumen.auditoria + ' lineas.',
        'Por encima de ' + DOC_LIMITS.MAX_AUDIT_ROWS + ' el libro empieza a ir lento. Se conservan las mas recientes.',
        'compactar', { filas: resumen.auditoria }));
    }
  } catch (e) { /* sin auditoria todavia */ }

  try {
    var respaldos = docAll_(DOC_SHEET.RESPALDOS);
    resumen.respaldos = respaldos.length;
    if (respaldos.length) resumen.ultimoRespaldo = respaldos[respaldos.length - 1].momento || '';
    var haceUnaSemana = new Date(Date.now() - 7 * 86400000).toISOString();
    if (!respaldos.length) {
      hallazgos.push(docHallazgo_(DOC_SEVERIDAD.AVISO, 'sin-respaldo',
        'No hay ningun respaldo guardado.',
        'Un respaldo permite volver atras si una importacion sale mal.',
        'respaldar'));
    } else if (String(resumen.ultimoRespaldo) < haceUnaSemana) {
      hallazgos.push(docHallazgo_(DOC_SEVERIDAD.INFO, 'respaldo-antiguo',
        'El ultimo respaldo es del ' + String(resumen.ultimoRespaldo).slice(0, 10) + '.',
        'Conviene sacar uno nuevo.',
        'respaldar'));
    }
  } catch (e) { /* sin hoja de respaldos todavia */ }

  var criticos = 0;
  for (var h = 0; h < hallazgos.length; h++) {
    if (hallazgos[h].severidad === DOC_SEVERIDAD.CRITICO) criticos++;
  }

  return {
    ok: criticos === 0,
    resumen: resumen,
    hallazgos: hallazgos,
    criticos: criticos,
    ms: Date.now() - inicio
  };
}

/** Da forma a un hallazgo del diagnostico. */
function docHallazgo_(severidad, codigo, titulo, detalle, accion, datos) {
  return {
    severidad: severidad,
    codigo: codigo,
    titulo: titulo,
    detalle: detalle,
    accion: accion || '',
    datos: datos || {}
  };
}

/* ------------------------------ Autorreparacion --------------------------- */

/**
 * Diagnostica y aplica todo lo que se pueda arreglar solo.
 *
 * Es lo que hay detras del boton "Reparar automaticamente". El orden importa:
 * primero la estructura -sin columnas no hay donde escribir-, despues los datos.
 */
function docAutoRepair_(actor, origen) {
  var antes = docDiagnose_();
  var aplicadas = [];

  var necesitaEstructura = false;
  for (var i = 0; i < antes.hallazgos.length; i++) {
    var accion = antes.hallazgos[i].accion;
    if (accion === 'instalar' || accion === 'reparar' || accion === 'crear-anio') necesitaEstructura = true;
  }

  if (necesitaEstructura) {
    var r = docInstallSchema_(actor, [new Date().getFullYear()]);
    aplicadas.push({ accion: 'reparar-estructura', detalle: r.acciones.length + ' hoja(s) revisada(s)' });
    docYearsReset_();
  }

  for (var h = 0; h < antes.hallazgos.length; h++) {
    var hallazgo = antes.hallazgos[h];
    try {
      if (hallazgo.accion === 'recalcular') {
        var rec = docRecalc_(null, actor);
        aplicadas.push({ accion: 'recalcular', detalle: rec.actualizadas + ' fila(s) recalculada(s)' });
      } else if (hallazgo.accion === 'compactar') {
        var comp = docCompact_(actor);
        aplicadas.push({ accion: 'compactar', detalle: comp.eliminadas + ' linea(s) antigua(s) retirada(s)' });
      } else if (hallazgo.accion === 'respaldar') {
        var bak = docBackup_('autorreparacion', actor);
        aplicadas.push({ accion: 'respaldar', detalle: 'respaldo ' + bak.id });
      }
    } catch (error) {
      aplicadas.push({ accion: hallazgo.accion, error: docClassify_(error).message });
    }
  }

  // Los duplicados NO se tocan solos: fusionar personas es una decision humana.
  var despues = docDiagnose_();

  docAudit_({
    accion: DOC_ACCION.REPARACION,
    entidad: 'sistema',
    actor: actor,
    origen: origen || 'web',
    resultado: despues.ok ? 'ok' : 'parcial',
    detalle: { aplicadas: aplicadas, criticosAntes: antes.criticos, criticosDespues: despues.criticos }
  });

  return { aplicadas: aplicadas, antes: antes, despues: despues };
}

/* -------------------------- Respaldo y restauracion ----------------------- */

/**
 * Respaldo completo dentro del propio libro.
 *
 * Va en una fila de _RESPALDOS, no en un archivo aparte, por una razon practica:
 * un respaldo en Drive se mueve, se renombra o se borra; uno que viaja dentro
 * del libro esta siempre donde tiene que estar, y se copia solo cuando alguien
 * duplica el libro.
 */
function docBackup_(motivo, actor) {
  var anios = docListYears_();
  var contenido = { version: DOC_BACKEND.snapshotVersion, generado: docNow_(), anios: {} };
  var total = 0;

  for (var a = 0; a < anios.length; a++) {
    var cargada = docLoadYear_(anios[a], false);
    if (!cargada) continue;
    var lista = [];
    for (var r = 0; r < cargada.rows.length; r++) {
      lista.push(docCleanDossier_(docDossierFromRow_(cargada.rows[r])));
      total++;
    }
    contenido.anios[String(anios[a])] = lista;
  }

  contenido.configuracion = docConfigAll_();
  contenido.catalogo = docAll_(DOC_SHEET.CATALOGO);

  var json = docWriteJson_(contenido);
  if (json.length > DOC_LIMITS.CELL_CHARS - 100) {
    // Si no cabe, se guarda sin el catalogo ni la configuracion: los expedientes
    // son lo irrecuperable; lo demas se vuelve a sembrar en un minuto.
    delete contenido.catalogo;
    delete contenido.configuracion;
    contenido.recortado = true;
    json = docWriteJson_(contenido);
  }
  if (json.length > DOC_LIMITS.CELL_CHARS - 100) {
    throw docError_(DOC_CODE.VALIDATION_ERROR,
      'El respaldo ocupa ' + json.length + ' caracteres y no cabe en una celda.',
      {
        hint: 'Descarga el respaldo desde el modulo (boton Exportar) en lugar de guardarlo en el libro.',
        details: { caracteres: json.length, tope: DOC_LIMITS.CELL_CHARS }
      });
  }

  var id = docUid_('bak');
  docPut_(DOC_SHEET.RESPALDOS, {
    id: id,
    momento: docNow_(),
    motivo: docText_(motivo || 'manual', 200),
    anios: anios.join(', '),
    expedientes: total,
    bytes: json.length,
    huella: docHash_(json),
    contenido_json: json
  });

  docRotateBackups_();
  docAudit_({
    accion: DOC_ACCION.RESPALDO,
    entidad: 'sistema',
    referencia: id,
    actor: actor,
    detalle: { expedientes: total, bytes: json.length, motivo: motivo }
  });

  return { id: id, expedientes: total, bytes: json.length, anios: anios };
}

/** Conserva solo los ultimos respaldos. */
function docRotateBackups_() {
  try {
    var filas = docAll_(DOC_SHEET.RESPALDOS);
    if (filas.length <= DOC_LIMITS.MAX_BACKUPS) return 0;
    var sobran = filas.length - DOC_LIMITS.MAX_BACKUPS;
    var ids = [];
    for (var i = 0; i < sobran; i++) ids.push(filas[i].id);
    return docPurge_(DOC_SHEET.RESPALDOS, ids);
  } catch (e) {
    return 0;
  }
}

/** Respaldos disponibles, sin su contenido (que pesa demasiado para listarlo). */
function docListBackups_() {
  var filas = docAll_(DOC_SHEET.RESPALDOS);
  var out = [];
  for (var i = filas.length - 1; i >= 0; i--) {
    out.push({
      id: filas[i].id,
      momento: filas[i].momento,
      motivo: filas[i].motivo,
      anios: filas[i].anios,
      expedientes: docInt_(filas[i].expedientes, 0),
      bytes: docInt_(filas[i].bytes, 0),
      huella: filas[i].huella
    });
  }
  return out;
}

/**
 * Restaura un respaldo.
 *
 * Antes de tocar nada saca un respaldo del estado actual. Restaurar el que no
 * era es un error facil de cometer y, sin esa copia previa, irreversible.
 */
function docRestore_(idRespaldo, actor, origen) {
  var fila = docById_(DOC_SHEET.RESPALDOS, idRespaldo);
  if (!fila) {
    throw docError_(DOC_CODE.NOT_FOUND,
      'No existe el respaldo ' + idRespaldo + '.',
      { hint: 'Consulta la lista de respaldos disponibles.', details: { id: idRespaldo } });
  }
  var contenido = docParseJson_(fila.contenido_json, null);
  if (!contenido || !contenido.anios) {
    throw docError_(DOC_CODE.VALIDATION_ERROR,
      'El respaldo ' + idRespaldo + ' esta danado.',
      { details: { id: idRespaldo } });
  }

  var previo = docBackup_('previo a restaurar ' + idRespaldo, actor);

  var restaurados = 0;
  var fallidos = [];
  for (var anio in contenido.anios) {
    if (!Object.prototype.hasOwnProperty.call(contenido.anios, anio)) continue;
    var lista = contenido.anios[anio] || [];
    for (var i = 0; i < lista.length; i++) {
      try {
        docUpsertDossier_(lista[i], actor, 'restauracion');
        restaurados++;
      } catch (error) {
        fallidos.push({
          identificador: (lista[i] && lista[i].identificador) || '',
          motivo: docClassify_(error).message
        });
      }
    }
  }

  docAudit_({
    accion: DOC_ACCION.RESTAURACION,
    entidad: 'sistema',
    referencia: idRespaldo,
    actor: actor,
    origen: origen || 'web',
    resultado: fallidos.length ? 'parcial' : 'ok',
    detalle: { restaurados: restaurados, fallidos: fallidos.length, respaldoPrevio: previo.id }
  });

  return { restaurados: restaurados, fallidos: fallidos, respaldoPrevio: previo.id };
}

/* ------------------------------- Duplicados ------------------------------- */

/**
 * Detecta duplicados. Por defecto solo informa.
 *
 * Fusionar dos expedientes es una decision con consecuencias, asi que `aplicar`
 * llega en falso salvo que se pida expresamente. Cuando se aplica, gana la fila
 * con mas avance: es la que tiene mas trabajo hecho detras.
 */
function docDedupe_(anio, aplicar, actor, origen) {
  var anios = anio ? [docInt_(anio, 0)] : docListYears_();
  var grupos = [];

  for (var a = 0; a < anios.length; a++) {
    var cargada = docLoadYear_(anios[a], false);
    if (!cargada) continue;
    var porNombre = {};
    for (var r = 0; r < cargada.rows.length; r++) {
      var fila = cargada.rows[r];
      var clave = docKey_(fila.nombre);
      if (!clave) continue;
      if (!porNombre[clave]) porNombre[clave] = [];
      porNombre[clave].push(fila);
    }
    for (var k in porNombre) {
      if (!Object.prototype.hasOwnProperty.call(porNombre, k)) continue;
      if (porNombre[k].length < 2) continue;
      var candidatas = porNombre[k].slice();
      candidatas.sort(function (x, y) {
        var dx = docInt_(x.avance, 0), dy = docInt_(y.avance, 0);
        if (dx !== dy) return dy - dx;
        return String(y.actualizado_en || '') > String(x.actualizado_en || '') ? 1 : -1;
      });
      var detalle = [];
      for (var c = 0; c < candidatas.length; c++) {
        detalle.push({
          id: candidatas[c].id,
          fila: candidatas[c].__row,
          avance: docInt_(candidatas[c].avance, 0),
          historica: !!candidatas[c].__heredada,
          actualizado: candidatas[c].actualizado_en || ''
        });
      }
      grupos.push({
        anio: anios[a],
        nombre: candidatas[0].nombre,
        total: candidatas.length,
        conservar: candidatas[0].id,
        candidatas: detalle
      });
    }
  }

  var eliminados = 0;
  if (aplicar === true && grupos.length) {
    docBackup_('previo a deduplicar', actor);
    for (var g = 0; g < grupos.length; g++) {
      var grupo = grupos[g];
      for (var d = 1; d < grupo.candidatas.length; d++) {
        try {
          if (docYearDelete_(grupo.anio, grupo.candidatas[d].id)) eliminados++;
        } catch (e) { /* se informa en el resumen */ }
      }
    }
    docYearsReset_();
  }

  docAudit_({
    accion: DOC_ACCION.MANTENIMIENTO,
    entidad: 'sistema',
    actor: actor,
    origen: origen || 'web',
    campo: 'deduplicar',
    nuevo: aplicar ? (eliminados + ' fila(s) eliminada(s)') : (grupos.length + ' grupo(s) detectado(s)'),
    detalle: { grupos: grupos.length, eliminados: eliminados, aplicado: aplicar === true }
  });

  return { grupos: grupos, aplicado: aplicar === true, eliminados: eliminados };
}

/* --------------------------- Recalculo y repintado ------------------------ */

/**
 * Recalcula avance, estado y columnas derivadas de todas las filas.
 *
 * Solo alcanza a las filas con DETALLE JSON. Las historicas escritas a mano no
 * tienen checklist del que derivar nada, y sobrescribir sus columnas con valores
 * inventados destruiria informacion real.
 */
function docRecalc_(anio, actor) {
  var anios = anio ? [docInt_(anio, 0)] : docListYears_();
  var actualizadas = 0;
  var omitidas = 0;

  for (var a = 0; a < anios.length; a++) {
    var cargada = docLoadYear_(anios[a], false);
    if (!cargada) continue;
    var instantanea = cargada.rows.slice();
    for (var r = 0; r < instantanea.length; r++) {
      var fila = instantanea[r];
      if (!fila.detalle_json) { omitidas++; continue; }
      var dossier = docDossierFromRow_(fila);
      if (!dossier.items || !dossier.items.length) { omitidas++; continue; }
      var nueva = docRowFromDossier_(dossier, actor || 'mantenimiento', fila);
      docYearPut_(anios[a], nueva);
      actualizadas++;
    }
  }

  docAudit_({
    accion: DOC_ACCION.MANTENIMIENTO,
    entidad: 'sistema',
    actor: actor,
    campo: 'recalcular',
    nuevo: actualizadas + ' fila(s) recalculada(s)',
    detalle: { actualizadas: actualizadas, omitidas: omitidas, anios: anios }
  });

  return { actualizadas: actualizadas, omitidas: omitidas, anios: anios };
}

/**
 * Vuelve a aplicar el formato y los colores.
 *
 * Util cuando alguien pega filas desde otro sitio y arrastra formato ajeno, que
 * es la forma mas comun de que un libro compartido pierda su aspecto.
 */
function docRecolor_(anio, actor) {
  var anios = anio ? [docInt_(anio, 0)] : docListYears_();
  var pintadas = 0;

  for (var a = 0; a < anios.length; a++) {
    var cargada = docLoadYear_(anios[a], false);
    if (!cargada) continue;
    docStyleYearSheet_(cargada.sheet);
    for (var r = 0; r < cargada.rows.length; r++) {
      docPaintYearRow_(cargada, cargada.rows[r].__row, cargada.rows[r]);
      pintadas++;
    }
  }

  docAudit_({
    accion: DOC_ACCION.MANTENIMIENTO,
    entidad: 'sistema',
    actor: actor,
    campo: 'recolorear',
    nuevo: pintadas + ' fila(s) repintada(s)',
    detalle: { anios: anios }
  });

  return { pintadas: pintadas, anios: anios };
}

/* ------------------------------- Compactacion ----------------------------- */

/** Recorta las hojas de bitacora a un tamano manejable. */
function docCompact_(actor) {
  var eliminadas = 0;
  try { eliminadas += docTrimSheet_(DOC_SHEET.AUDITORIA, DOC_LIMITS.MAX_AUDIT_ROWS); } catch (e) { /* opcional */ }
  try { eliminadas += docTrimSheet_(DOC_SHEET.DIARIO, DOC_LIMITS.MAX_LOG_ROWS); } catch (e) { /* opcional */ }
  try { eliminadas += docPurgeOldRequests_(); } catch (e) { /* opcional */ }
  try { eliminadas += docRotateBackups_(); } catch (e) { /* opcional */ }

  docAudit_({
    accion: DOC_ACCION.MANTENIMIENTO,
    entidad: 'sistema',
    actor: actor,
    campo: 'compactar',
    nuevo: eliminadas + ' linea(s) retirada(s)'
  });

  return { eliminadas: eliminadas };
}

/** Descarta los identificadores de solicitud ya caducados. */
function docPurgeOldRequests_() {
  var limite = new Date(Date.now() - DOC_LIMITS.REQUEST_TTL_HOURS * 3600000).toISOString();
  var filas = docAll_(DOC_SHEET.SOLICITUDES);
  var ids = [];
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i].procesado_en) < limite) ids.push(filas[i].solicitud_id);
  }
  if (!ids.length) return 0;
  return docPurge_(DOC_SHEET.SOLICITUDES, ids);
}

/* ------------------------------ Latido rapido ----------------------------- */

/**
 * Comprobacion ligera para el indicador de conexion del frontend.
 *
 * Tiene que ser barata: se llama cada pocos minutos y no puede costar lo mismo
 * que un diagnostico completo.
 */
function docHealthCheck_() {
  var salida = {
    backend: DOC_BACKEND.version,
    esquema: DOC_BACKEND.schemaVersion,
    instalado: false,
    anios: [],
    anioActual: new Date().getFullYear(),
    horaServidor: docNow_()
  };
  try {
    salida.instalado = docIsInstalled_();
    salida.anios = docListYears_();
    var ss = docSpreadsheet_();
    salida.libro = ss.getName();
    salida.libroUrl = ss.getUrl();
  } catch (error) {
    salida.problema = docClassify_(error).message;
  }
  return salida;
}
