/**
 * 18_Reports.gs — panel operativo, reportes, exportaciones y filtros guardados.
 *
 * ── La regla que ordena este archivo ─────────────────────────────────────────
 * Los agregados se calculan en el servidor y viajan agregados. El frontend recibe
 * «17 expedientes observados» y «completitud por agencia», no diez mil filas para
 * que las sume él. Con 900 expedientes y 30 requisitos cada uno, mandar el detalle
 * al navegador serían varios megabytes por cada carga del panel.
 *
 * ── Las exportaciones son trabajos, no llamadas ──────────────────────────────
 * Exportar toda la base no cabe en una petición de Apps Script (seis minutos). Por
 * eso una exportación es una FILA en `ExportacionesDocumentacion` con estado,
 * progreso y punto de control: el cliente pide lotes, la fila recuerda por dónde
 * iba, y si algo se corta se reanuda. Además queda constancia de quién exportó
 * qué, que en un módulo con datos personales no es un detalle menor.
 *
 * ── Protección contra fórmulas ───────────────────────────────────────────────
 * Todo valor que sale hacia una hoja de cálculo pasa por `doc2Celda_`. Un nombre
 * que empiece por `=` es una fórmula para Excel y para Sheets, y un expediente
 * exportado no debería poder ejecutar nada al abrirse.
 */

/* ========================================================================== */
/* PANEL OPERATIVO                                                             */
/* ========================================================================== */

/**
 * Panel con datos reales.
 *
 * Se cachea por dos minutos porque es la primera pantalla del módulo y se abre
 * muchas veces al día; dos minutos es poco para que alguien note un desfase y
 * mucho para ahorrar cientos de lecturas. Cualquier escritura invalida el caché.
 */
function doc2Panel_(filtros, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.VER);
  var f = filtros || {};
  var sinFiltros = !f.agencia && !f.gerencia && !f.tipoFuncionario && !f.anio;

  if (sinFiltros) {
    var enCache = docCacheGet_(DOC2_CACHE.PANEL);
    if (enCache) {
      var parseado = docParseJson_(enCache, null);
      if (parseado) { parseado.desdeCache = true; return parseado; }
    }
  }

  var expedientes = doc2All_(DOC2_SHEET.EXPEDIENTES, false);
  var lista = [];
  for (var i = 0; i < expedientes.length; i++) {
    var e = expedientes[i];
    if (String(e.estado_expediente) === DOC2_ESTADO_EXPEDIENTE.ELIMINADO_LOGICO) continue;
    if (f.agencia && docKey_(e.agencia) !== docKey_(f.agencia)) continue;
    if (f.gerencia && docKey_(e.gerencia) !== docKey_(f.gerencia)) continue;
    if (f.tipoFuncionario && docKey_(e.tipo_funcionario) !== docKey_(f.tipoFuncionario)) continue;
    if (f.anio && docYearOf_(e.fecha_ingreso || e.created_at) !== docInt_(f.anio, 0)) continue;
    lista.push(e);
  }

  var tarjetas = {
    activos: 0, completos: 0, incompletos: 0, observados: 0, aprobados: 0, archivados: 0,
    pendientes: 0, noEntregados: 0, prorrogasVigentes: 0, prorrogasVencidas: 0,
    solicitudesVencidas: 0, tareasFueraSla: 0, aprobacionesPendientes: 0
  };
  var porAgencia = {};
  var porGerencia = {};
  var porTipoFuncionario = {};
  var porEstado = {};
  var porMes = {};
  var sumaAvance = 0;

  for (var x = 0; x < lista.length; x++) {
    var fila = lista[x];
    var estado = String(fila.estado_expediente);
    var avance = docInt_(fila.porcentaje_completitud, 0);
    sumaAvance += avance;

    if (estado === DOC2_ESTADO_EXPEDIENTE.ARCHIVADO) tarjetas.archivados++;
    else tarjetas.activos++;
    if (estado === DOC2_ESTADO_EXPEDIENTE.COMPLETO) tarjetas.completos++;
    if (estado === DOC2_ESTADO_EXPEDIENTE.APROBADO) tarjetas.aprobados++;
    if (estado === DOC2_ESTADO_EXPEDIENTE.OBSERVADO) tarjetas.observados++;
    if (estado === DOC2_ESTADO_EXPEDIENTE.INCOMPLETO || estado === DOC2_ESTADO_EXPEDIENTE.EN_RECOLECCION) tarjetas.incompletos++;

    tarjetas.pendientes += docInt_(fila.total_pendientes, 0);
    tarjetas.noEntregados += docInt_(fila.total_no_entregados, 0);
    tarjetas.prorrogasVencidas += docInt_(fila.total_prorrogas_vencidas, 0);

    porEstado[estado] = (porEstado[estado] || 0) + 1;
    doc2Acumular_(porAgencia, fila.agencia || 'Sin agencia', avance);
    doc2Acumular_(porGerencia, fila.gerencia || 'Sin gerencia', avance);
    doc2Acumular_(porTipoFuncionario, fila.tipo_funcionario || 'GENERAL', avance);

    var mes = String(fila.fecha_ingreso || fila.created_at || '').slice(0, 7);
    if (mes) {
      if (!porMes[mes]) porMes[mes] = { mes: mes, expedientes: 0, completos: 0 };
      porMes[mes].expedientes++;
      if (avance >= 100) porMes[mes].completos++;
    }
  }

  // Prórrogas, solicitudes, tareas y aprobaciones se cuentan sobre sus propias
  // hojas: los totales del expediente no distinguen «vigente» de «por vencer».
  var indiceExpedientes = {};
  for (var k = 0; k < lista.length; k++) indiceExpedientes[String(lista[k].expediente_id)] = true;

  var prorrogas = doc2All_(DOC2_SHEET.PRORROGAS, false);
  var prorrogasPorEstado = {};
  for (var p = 0; p < prorrogas.length; p++) {
    if (!indiceExpedientes[String(prorrogas[p].expediente_id)]) continue;
    var estadoP = String(prorrogas[p].estado_prorroga);
    prorrogasPorEstado[estadoP] = (prorrogasPorEstado[estadoP] || 0) + 1;
    if (estadoP !== DOC2_ESTADO_PRORROGA.VIGENTE && estadoP !== DOC2_ESTADO_PRORROGA.SOLICITADA) continue;
    if (doc2Vencida_(prorrogas[p].fecha_prorroga)) tarjetas.prorrogasVencidas++;
    else tarjetas.prorrogasVigentes++;
  }

  var solicitudes = doc2All_(DOC2_SHEET.SOLICITUDES, false);
  for (var s = 0; s < solicitudes.length; s++) {
    if (!indiceExpedientes[String(solicitudes[s].expediente_id)]) continue;
    var estadoS = String(solicitudes[s].estado_solicitud);
    if (estadoS === DOC2_ESTADO_SOLICITUD.COMPLETADA || estadoS === DOC2_ESTADO_SOLICITUD.CANCELADA) continue;
    if (estadoS === DOC2_ESTADO_SOLICITUD.VENCIDA || doc2Vencida_(solicitudes[s].fecha_limite)) tarjetas.solicitudesVencidas++;
  }

  var tareas = doc2All_(DOC2_SHEET.TAREAS, false);
  for (var t = 0; t < tareas.length; t++) {
    if (!indiceExpedientes[String(tareas[t].expediente_id)]) continue;
    var estadoT = String(tareas[t].estado_tarea);
    if (estadoT === DOC2_ESTADO_TAREA.COMPLETADA || estadoT === DOC2_ESTADO_TAREA.CANCELADA) continue;
    if (estadoT === DOC2_ESTADO_TAREA.VENCIDA || doc2Vencida_(tareas[t].fecha_limite)) tarjetas.tareasFueraSla++;
  }

  var aprobaciones = doc2All_(DOC2_SHEET.APROBACIONES, false);
  for (var a = 0; a < aprobaciones.length; a++) {
    if (!indiceExpedientes[String(aprobaciones[a].expediente_id)]) continue;
    if (String(aprobaciones[a].estado_aprobacion) === DOC2_ESTADO_APROBACION.PENDIENTE) tarjetas.aprobacionesPendientes++;
  }

  // Embudo documental y ranking de requisitos problemáticos.
  var requisitos = doc2All_(DOC2_SHEET.EXPEDIENTE_DOCS, false);
  var embudo = { total: 0, entregados: 0, enRevision: 0, aprobados: 0, observados: 0, noAplica: 0, pendientes: 0, noEntregados: 0 };
  var noEntregadoPorCodigo = {};
  var observadoPorCodigo = {};
  for (var r = 0; r < requisitos.length; r++) {
    var req = requisitos[r];
    if (!indiceExpedientes[String(req.expediente_id)]) continue;
    embudo.total++;
    var estadoD = String(req.estado_documental);
    var revision = String(req.estado_revision);
    if (estadoD === DOC2_ESTADO_DOCUMENTO.ENTREGADO) embudo.entregados++;
    else if (estadoD === DOC2_ESTADO_DOCUMENTO.NO_APLICA) embudo.noAplica++;
    else if (estadoD === DOC2_ESTADO_DOCUMENTO.NO_ENTREGADO) embudo.noEntregados++;
    else embudo.pendientes++;
    if (revision === DOC2_ESTADO_REVISION.EN_REVISION) embudo.enRevision++;
    if (revision === DOC2_ESTADO_REVISION.APROBADO || revision === DOC2_ESTADO_REVISION.APROBADO_CON_OBSERVACION) embudo.aprobados++;
    if (revision === DOC2_ESTADO_REVISION.OBSERVADO || revision === DOC2_ESTADO_REVISION.REQUIERE_CORRECCION) {
      embudo.observados++;
      observadoPorCodigo[String(req.codigo_documento)] = (observadoPorCodigo[String(req.codigo_documento)] || 0) + 1;
    }
    if (estadoD === DOC2_ESTADO_DOCUMENTO.NO_ENTREGADO) {
      noEntregadoPorCodigo[String(req.codigo_documento)] = (noEntregadoPorCodigo[String(req.codigo_documento)] || 0) + 1;
    }
  }

  // Tiempo medio de revisión: de la entrega a la decisión, en horas.
  var revisiones = doc2All_(DOC2_SHEET.REVISIONES, true);
  var sumaHoras = 0;
  var conteoHoras = 0;
  for (var v = 0; v < revisiones.length; v++) {
    if (!indiceExpedientes[String(revisiones[v].expediente_id)]) continue;
    var estadoR = String(revisiones[v].estado_revision);
    if (estadoR === DOC2_ESTADO_REVISION.EN_REVISION || estadoR === DOC2_ESTADO_REVISION.SIN_REVISION) continue;
    var requisito = doc2Get_(DOC2_SHEET.EXPEDIENTE_DOCS, revisiones[v].expediente_documento_id);
    if (!requisito || !requisito.created_at || !revisiones[v].fecha_revision) continue;
    var t0 = new Date(String(requisito.created_at)).getTime();
    var t1 = new Date(String(revisiones[v].fecha_revision)).getTime();
    if (isNaN(t0) || isNaN(t1) || t1 < t0) continue;
    sumaHoras += (t1 - t0) / 3600000;
    conteoHoras++;
  }

  var salida = {
    generado: docNow_(),
    filtros: { agencia: f.agencia || '', gerencia: f.gerencia || '', tipoFuncionario: f.tipoFuncionario || '', anio: docInt_(f.anio, 0) || null },
    tarjetas: tarjetas,
    avancePromedio: lista.length ? Math.round(sumaAvance / lista.length) : 0,
    expedientes: lista.length,
    completitudPorAgencia: doc2Ranking_(porAgencia, 15),
    completitudPorGerencia: doc2Ranking_(porGerencia, 15),
    distribucionTipoFuncionario: doc2Ranking_(porTipoFuncionario, 10),
    distribucionEstados: doc2MapaAArreglo_(porEstado),
    evolucionMensual: doc2Cronologia_(porMes),
    prorrogasPorEstado: doc2MapaAArreglo_(prorrogasPorEstado),
    embudo: embudo,
    requisitosNoEntregados: doc2TopCodigos_(noEntregadoPorCodigo, 10),
    requisitosObservados: doc2TopCodigos_(observadoPorCodigo, 10),
    tiempoRevisionHoras: conteoHoras ? Math.round((sumaHoras / conteoHoras) * 10) / 10 : null,
    revisionesMedidas: conteoHoras,
    desdeCache: false
  };

  if (sinFiltros) docCachePut_(DOC2_CACHE.PANEL, docWriteJson_(salida), DOC2_LIMITS.CACHE_PANEL_SEG);
  return salida;
}

/** Acumula conteo y suma de avance por clave. */
function doc2Acumular_(mapa, clave, avance) {
  var k = String(clave);
  if (!mapa[k]) mapa[k] = { clave: k, total: 0, suma: 0, completos: 0 };
  mapa[k].total++;
  mapa[k].suma += docInt_(avance, 0);
  if (docInt_(avance, 0) >= 100) mapa[k].completos++;
}

/** Convierte el acumulador en un ranking por completitud. */
function doc2Ranking_(mapa, tope) {
  var out = [];
  for (var k in mapa) {
    if (!Object.prototype.hasOwnProperty.call(mapa, k)) continue;
    out.push({
      clave: mapa[k].clave,
      expedientes: mapa[k].total,
      completos: mapa[k].completos,
      avancePromedio: mapa[k].total ? Math.round(mapa[k].suma / mapa[k].total) : 0
    });
  }
  out.sort(function (a, b) {
    if (b.expedientes !== a.expedientes) return b.expedientes - a.expedientes;
    return String(a.clave) > String(b.clave) ? 1 : -1;
  });
  return out.slice(0, tope || 10);
}

/** `{clave: n}` como arreglo ordenado. */
function doc2MapaAArreglo_(mapa) {
  var out = [];
  for (var k in mapa) {
    if (Object.prototype.hasOwnProperty.call(mapa, k)) out.push({ clave: k, total: mapa[k] });
  }
  out.sort(function (a, b) { return b.total - a.total; });
  return out;
}

/** Serie temporal ordenada por mes. */
function doc2Cronologia_(porMes) {
  var out = [];
  for (var k in porMes) {
    if (Object.prototype.hasOwnProperty.call(porMes, k)) out.push(porMes[k]);
  }
  out.sort(function (a, b) { return String(a.mes) > String(b.mes) ? 1 : -1; });
  return out.slice(-24);
}

/** Ranking de códigos de documento con su nombre visible. */
function doc2TopCodigos_(mapa, tope) {
  var out = [];
  for (var k in mapa) {
    if (!Object.prototype.hasOwnProperty.call(mapa, k)) continue;
    out.push({ codigo: k, nombre: doc2NombreDeCodigo_(k), total: mapa[k] });
  }
  out.sort(function (a, b) { return b.total - a.total; });
  return out.slice(0, tope || 10);
}

/* ========================================================================== */
/* REPORTES                                                                    */
/* ========================================================================== */

/** Tipos de reporte disponibles, con su etiqueta y la capacidad que exigen. */
var DOC2_REPORTES = [
  { codigo: 'resumen', etiqueta: 'Resumen general', capacidad: DOC2_CAPACIDAD.VER },
  { codigo: 'completitud', etiqueta: 'Completitud por expediente', capacidad: DOC2_CAPACIDAD.VER },
  { codigo: 'pendientes', etiqueta: 'Requisitos pendientes', capacidad: DOC2_CAPACIDAD.VER },
  { codigo: 'no_entregados', etiqueta: 'Requisitos no entregados', capacidad: DOC2_CAPACIDAD.VER },
  { codigo: 'observaciones', etiqueta: 'Observaciones abiertas', capacidad: DOC2_CAPACIDAD.VER },
  { codigo: 'prorrogas', etiqueta: 'Prórrogas', capacidad: DOC2_CAPACIDAD.VER },
  { codigo: 'solicitudes', etiqueta: 'Solicitudes', capacidad: DOC2_CAPACIDAD.VER },
  { codigo: 'tareas', etiqueta: 'Tareas', capacidad: DOC2_CAPACIDAD.VER },
  { codigo: 'revisiones', etiqueta: 'Revisiones', capacidad: DOC2_CAPACIDAD.VER },
  { codigo: 'aprobaciones', etiqueta: 'Aprobaciones', capacidad: DOC2_CAPACIDAD.VER },
  { codigo: 'agencia', etiqueta: 'Consolidado por agencia', capacidad: DOC2_CAPACIDAD.VER },
  { codigo: 'gerencia', etiqueta: 'Consolidado por gerencia', capacidad: DOC2_CAPACIDAD.VER },
  { codigo: 'tipo_funcionario', etiqueta: 'Consolidado por tipo de funcionario', capacidad: DOC2_CAPACIDAD.VER },
  { codigo: 'auditoria', etiqueta: 'Auditoría técnica', capacidad: DOC2_CAPACIDAD.AUDITORIA }
];

/**
 * Genera un reporte.
 *
 * Todos respetan los filtros y el permiso. El de auditoría exige la capacidad
 * `auditoria`: quien no la tiene recibe un error de permiso, no un reporte vacío,
 * porque un reporte vacío parece un error del sistema.
 */
function doc2Reporte_(tipo, filtros, ctx) {
  var contexto = ctx || doc2CtxActual_();
  var codigo = String(tipo || 'resumen');
  var definicion = null;
  for (var i = 0; i < DOC2_REPORTES.length; i++) {
    if (DOC2_REPORTES[i].codigo === codigo) definicion = DOC2_REPORTES[i];
  }
  if (!definicion) {
    throw docError_(DOC_CODE.BAD_REQUEST, 'El reporte "' + codigo + '" no existe.',
      { hint: 'Reportes disponibles: ' + doc2CodigosReporte_().join(', ') + '.', details: { tipo: codigo } });
  }
  doc2Autorizar_(contexto, definicion.capacidad);

  var f = filtros || {};
  f.sinPaginar = true;
  var expedientes = doc2ListarExpedientes_(f, contexto).expedientes;
  var indice = {};
  for (var e = 0; e < expedientes.length; e++) indice[String(expedientes[e].expedienteId)] = expedientes[e];

  var salida = { tipo: codigo, etiqueta: definicion.etiqueta, generado: docNow_(), filtros: f, filas: [], columnas: [] };

  switch (codigo) {
    case 'resumen':
      salida.columnas = ['Indicador', 'Valor'];
      var panel = doc2Panel_({ agencia: f.agencia, gerencia: f.gerencia, tipoFuncionario: f.tipoFuncionario, anio: f.anio }, contexto);
      salida.filas = [
        ['Expedientes', panel.expedientes],
        ['Avance promedio (%)', panel.avancePromedio],
        ['Completos', panel.tarjetas.completos],
        ['Aprobados', panel.tarjetas.aprobados],
        ['Incompletos', panel.tarjetas.incompletos],
        ['Observados', panel.tarjetas.observados],
        ['Requisitos pendientes', panel.tarjetas.pendientes],
        ['Requisitos no entregados', panel.tarjetas.noEntregados],
        ['Prórrogas vigentes', panel.tarjetas.prorrogasVigentes],
        ['Prórrogas vencidas', panel.tarjetas.prorrogasVencidas],
        ['Solicitudes vencidas', panel.tarjetas.solicitudesVencidas],
        ['Tareas fuera de plazo', panel.tarjetas.tareasFueraSla],
        ['Aprobaciones pendientes', panel.tarjetas.aprobacionesPendientes]
      ];
      salida.panel = panel;
      break;

    case 'completitud':
      salida.columnas = ['Identificador', 'Nombre', 'Cargo', 'Agencia', 'Gerencia', 'Tipo funcionario', 'Tipo garantía', 'Estado', 'Avance %', 'Requisitos', 'Entregados', 'Pendientes', 'No entregados', 'No aplica', 'Observados', 'Próxima fecha crítica'];
      for (var c = 0; c < expedientes.length; c++) {
        var ex = expedientes[c];
        salida.filas.push([ex.identificador, ex.nombre, ex.cargo, ex.agencia, ex.gerencia,
          ex.tipoFuncionario, ex.tipoGarantia, ex.estado, ex.porcentaje, ex.totales.requisitos,
          ex.totales.entregados, ex.totales.pendientes, ex.totales.noEntregados, ex.totales.noAplica,
          ex.totales.observados, ex.proximaFechaCritica]);
      }
      break;

    case 'pendientes':
    case 'no_entregados':
    case 'observaciones':
      salida.columnas = ['Identificador', 'Nombre', 'Agencia', 'Requisito', 'Sección', 'Estado documental', 'Estado revisión', 'Observaciones', 'Actualizado'];
      var requisitos = doc2All_(DOC2_SHEET.EXPEDIENTE_DOCS, false);
      for (var r = 0; r < requisitos.length; r++) {
        var req = requisitos[r];
        var duenio = indice[String(req.expediente_id)];
        if (!duenio) continue;
        var estadoD = String(req.estado_documental);
        var revision = String(req.estado_revision);
        var incluir = false;
        if (codigo === 'pendientes') incluir = estadoD === DOC2_ESTADO_DOCUMENTO.PENDIENTE;
        else if (codigo === 'no_entregados') incluir = estadoD === DOC2_ESTADO_DOCUMENTO.NO_ENTREGADO;
        else incluir = revision === DOC2_ESTADO_REVISION.OBSERVADO || revision === DOC2_ESTADO_REVISION.REQUIERE_CORRECCION || revision === DOC2_ESTADO_REVISION.RECHAZADO;
        if (!incluir) continue;
        salida.filas.push([duenio.identificador, duenio.nombre, duenio.agencia,
          doc2NombreRequisito_(req), req.seccion, estadoD, revision, req.observaciones || '', req.updated_at || '']);
      }
      break;

    case 'prorrogas':
      salida.columnas = ['Identificador', 'Nombre', 'Requisito', 'Fecha original', 'Fecha prórroga', 'Días restantes', 'Situación', 'Estado', 'Motivo', 'Solicitada por', 'Aprobada por'];
      var prorrogas = doc2All_(DOC2_SHEET.PRORROGAS, false);
      for (var p = 0; p < prorrogas.length; p++) {
        var duenioP = indice[String(prorrogas[p].expediente_id)];
        if (!duenioP) continue;
        var vistaP = doc2ProrrogaVista_(prorrogas[p]);
        salida.filas.push([duenioP.identificador, duenioP.nombre, vistaP.nombre, vistaP.fechaOriginal,
          vistaP.fechaProrroga, vistaP.diasRestantes, vistaP.situacion, vistaP.estado, vistaP.motivo,
          vistaP.solicitadaPor, vistaP.aprobadaPor]);
      }
      break;

    case 'solicitudes':
      salida.columnas = ['Identificador', 'Nombre', 'Título', 'Estado', 'Prioridad', 'Fecha solicitud', 'Fecha límite', 'Días', 'Requisitos', 'Cumplidos', 'Recordatorios', 'Responsable'];
      var solicitudes = doc2All_(DOC2_SHEET.SOLICITUDES, false);
      for (var s = 0; s < solicitudes.length; s++) {
        var duenioS = indice[String(solicitudes[s].expediente_id)];
        if (!duenioS) continue;
        var vistaS = doc2SolicitudVista_(solicitudes[s]);
        salida.filas.push([duenioS.identificador, duenioS.nombre, vistaS.titulo, vistaS.estado, vistaS.prioridad,
          vistaS.fechaSolicitud, vistaS.fechaLimite, vistaS.diasParaLimite, vistaS.total, vistaS.cumplidos,
          vistaS.recordatorios, vistaS.responsableId]);
      }
      break;

    case 'tareas':
      salida.columnas = ['Identificador', 'Nombre', 'Tarea', 'Tipo', 'Estado', 'Prioridad', 'Responsable', 'Fecha límite', 'Días', 'Fuera de plazo', 'Creada'];
      var tareas = doc2All_(DOC2_SHEET.TAREAS, false);
      for (var t = 0; t < tareas.length; t++) {
        var duenioT = indice[String(tareas[t].expediente_id)];
        if (!duenioT) continue;
        var vistaT = doc2TareaVista_(tareas[t]);
        salida.filas.push([duenioT.identificador, duenioT.nombre, vistaT.titulo, vistaT.tipo, vistaT.estado,
          vistaT.prioridad, vistaT.responsableId, vistaT.fechaLimite, vistaT.diasParaLimite,
          vistaT.vencida ? 'Sí' : 'No', vistaT.creadoEn]);
      }
      break;

    case 'revisiones':
      salida.columnas = ['Identificador', 'Nombre', 'Requisito', 'Decisión', 'Motivo', 'Comentario', 'Revisor', 'Fecha'];
      var revisiones = doc2All_(DOC2_SHEET.REVISIONES, true);
      for (var v = 0; v < revisiones.length; v++) {
        var duenioR = indice[String(revisiones[v].expediente_id)];
        if (!duenioR) continue;
        var vistaR = doc2RevisionVista_(revisiones[v]);
        salida.filas.push([duenioR.identificador, duenioR.nombre, vistaR.nombre, vistaR.estado,
          vistaR.motivoEtiqueta, vistaR.comentario, vistaR.revisor, vistaR.fecha]);
      }
      break;

    case 'aprobaciones':
      salida.columnas = ['Identificador', 'Nombre', 'Flujo', 'Nivel', 'Aprobador', 'Estado', 'Fecha límite', 'Fecha decisión', 'Comentario'];
      var aprobaciones = doc2All_(DOC2_SHEET.APROBACIONES, false);
      for (var a = 0; a < aprobaciones.length; a++) {
        var duenioA = indice[String(aprobaciones[a].expediente_id)];
        if (!duenioA) continue;
        var vistaA = doc2AprobacionVista_(aprobaciones[a]);
        salida.filas.push([duenioA.identificador, duenioA.nombre, vistaA.flujo, vistaA.nivel, vistaA.aprobador,
          vistaA.estado, vistaA.fechaLimite, vistaA.fechaDecision, vistaA.comentario]);
      }
      break;

    case 'agencia':
    case 'gerencia':
    case 'tipo_funcionario':
      salida.columnas = [codigo === 'agencia' ? 'Agencia' : (codigo === 'gerencia' ? 'Gerencia' : 'Tipo de funcionario'),
        'Expedientes', 'Completos', 'Avance promedio %', 'Pendientes', 'No entregados', 'Observados'];
      var agrupado = {};
      for (var g = 0; g < expedientes.length; g++) {
        var eg = expedientes[g];
        var clave = codigo === 'agencia' ? (eg.agencia || 'Sin agencia')
          : (codigo === 'gerencia' ? (eg.gerencia || 'Sin gerencia') : (eg.tipoFuncionario || 'GENERAL'));
        if (!agrupado[clave]) agrupado[clave] = { clave: clave, total: 0, completos: 0, suma: 0, pendientes: 0, noEntregados: 0, observados: 0 };
        agrupado[clave].total++;
        agrupado[clave].suma += eg.porcentaje;
        if (eg.porcentaje >= 100) agrupado[clave].completos++;
        agrupado[clave].pendientes += eg.totales.pendientes;
        agrupado[clave].noEntregados += eg.totales.noEntregados;
        agrupado[clave].observados += eg.totales.observados;
      }
      for (var ak in agrupado) {
        if (!Object.prototype.hasOwnProperty.call(agrupado, ak)) continue;
        var item = agrupado[ak];
        salida.filas.push([item.clave, item.total, item.completos,
          item.total ? Math.round(item.suma / item.total) : 0, item.pendientes, item.noEntregados, item.observados]);
      }
      salida.filas.sort(function (x, y) { return y[1] - x[1]; });
      break;

    case 'auditoria':
      salida.columnas = ['Fecha', 'Evento', 'Entidad', 'Identificador expediente', 'Actor', 'Origen', 'Resultado', 'Solicitud'];
      var eventos = doc2All_(DOC2_SHEET.AUDITORIA, true);
      var desde = docDateOnly_(f.desde);
      var hasta = docDateOnly_(f.hasta);
      var tope = Math.min(Math.max(docInt_(f.limite, 500), 1), 5000);
      for (var q = eventos.length - 1; q >= 0 && salida.filas.length < tope; q--) {
        var ev = eventos[q];
        var dia = String(ev.created_at).slice(0, 10);
        if (desde && dia < desde) continue;
        if (hasta && dia > hasta) continue;
        if (f.expedienteId && String(ev.expediente_id) !== String(f.expedienteId)) continue;
        if (f.actor && docKey_(ev.actor_display + ' ' + ev.actor_id).indexOf(docKey_(f.actor)) < 0) continue;
        var duenioE = indice[String(ev.expediente_id)];
        salida.filas.push([ev.created_at, ev.evento_tipo, ev.entidad_tipo,
          duenioE ? duenioE.identificador : (ev.expediente_id || ''), ev.actor_display || ev.actor_id,
          ev.origen, ev.resultado, ev.request_id]);
      }
      break;
  }

  salida.total = salida.filas.length;
  doc2Audit_({
    tipo: 'reporte.generado', entidadTipo: 'reporte', entidadId: codigo,
    actor: contexto.actor, actorId: contexto.actorId, origen: contexto.origen, requestId: contexto.requestId,
    metadata: { tipo: codigo, filas: salida.total }
  });
  return salida;
}

/** Códigos de reporte disponibles. */
function doc2CodigosReporte_() {
  var out = [];
  for (var i = 0; i < DOC2_REPORTES.length; i++) out.push(DOC2_REPORTES[i].codigo);
  return out;
}

/* ========================================================================== */
/* EXPORTACIONES                                                               */
/* ========================================================================== */

/** Valor seguro para una celda de hoja de cálculo. */
function doc2Celda_(valor) {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'number' || typeof valor === 'boolean') return valor;
  var texto = String(valor);
  if (/^[=+\-@\t\r]/.test(texto)) return "'" + texto;
  return texto;
}

/** Aplica `doc2Celda_` a una matriz completa. */
function doc2MatrizSegura_(filas) {
  var out = [];
  for (var i = 0; i < filas.length; i++) {
    var linea = [];
    for (var c = 0; c < filas[i].length; c++) linea.push(doc2Celda_(filas[i][c]));
    out.push(linea);
  }
  return out;
}

/**
 * Abre un trabajo de exportación.
 *
 * Devuelve el identificador y el total, para que la interfaz pueda mostrar
 * progreso desde el primer lote. No genera datos todavía: eso lo hace
 * `doc2ExportarLote_`.
 */
function doc2ExportarIniciar_(peticion, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.EXPORTAR);
  var p = peticion || {};
  var tipo = doc2Enum_(p.tipo || 'expedientes',
    ['expediente', 'seleccion', 'filtrado', 'completo', 'reporte'], 'filtrado');

  var filtro = p.filtro || {};
  var expedienteIds = [];

  if (tipo === 'expediente') {
    var uno = doc2ExigirExpediente_(p.expedienteId || filtro.expedienteId);
    expedienteIds = [uno.expediente_id];
  } else if (tipo === 'seleccion') {
    var seleccionados = doc2ResolverSeleccion_({ expedienteIds: p.expedienteIds || [] }, contexto);
    for (var s = 0; s < seleccionados.length; s++) expedienteIds.push(seleccionados[s].expediente_id);
  } else if (tipo === 'reporte') {
    expedienteIds = [];
  } else {
    var consulta = {};
    for (var k in filtro) if (Object.prototype.hasOwnProperty.call(filtro, k)) consulta[k] = filtro[k];
    if (tipo === 'completo') consulta.incluirArchivados = true;
    consulta.sinPaginar = true;
    var listado = doc2ListarExpedientes_(consulta, contexto);
    for (var e = 0; e < listado.expedientes.length; e++) expedienteIds.push(listado.expedientes[e].expedienteId);
  }

  var id = doc2NewId_('exp2');
  doc2Insert_(DOC2_SHEET.EXPORTACIONES, {
    exportacion_id: id,
    tipo_exportacion: tipo,
    filtro_json: { filtro: filtro, reporte: p.reporte || '', expedientes: expedienteIds.length },
    cantidad_expedientes: expedienteIds.length,
    estado: 'EN_PROCESO',
    progreso: 0,
    checkpoint: { indice: 0, ids: expedienteIds, reporte: p.reporte || '' },
    archivo_temporal_id: '',
    archivo_url_temporal: '',
    solicitada_por: doc2Texto_(contexto.actor, 240),
    started_at: docNow_(),
    completed_at: '',
    expires_at: doc2FechaMasDias_(7),
    error_resumen: ''
  }, contexto);

  doc2Audit_({
    tipo: 'exportacion.iniciada', entidadTipo: 'exportacion', entidadId: id,
    actor: contexto.actor, actorId: contexto.actorId, origen: contexto.origen, requestId: contexto.requestId,
    metadata: { tipo: tipo, expedientes: expedienteIds.length }
  });

  return {
    exportacionId: id, tipo: tipo, expedientes: expedienteIds.length,
    lote: DOC2_LIMITS.LOTE_EXPORTACION,
    hojas: doc2HojasDeExportacion_(tipo)
  };
}

/** Hojas que tendrá el libro exportado según el tipo. */
function doc2HojasDeExportacion_(tipo) {
  if (tipo === 'expediente') {
    return ['Resumen', 'Datos generales', 'Documentos', 'Observaciones', 'Prórrogas', 'Solicitudes', 'Revisiones', 'Aprobaciones', 'Tareas', 'Historial'];
  }
  if (tipo === 'reporte') return ['Reporte'];
  return ['Resumen', 'Expedientes', 'Requisitos', 'Prórrogas', 'Solicitudes', 'Revisiones', 'Aprobaciones', 'Tareas', 'Historial'];
}

/**
 * Procesa un lote de la exportación.
 *
 * Devuelve las filas del lote y actualiza el punto de control. El cliente arma el
 * archivo con lo que recibe; el backend solo se ocupa de que los datos salgan
 * completos, en orden y sin bloquear la hoja de origen (que nunca se modifica).
 */
function doc2ExportarLote_(exportacionId, ctx, opciones) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.EXPORTAR);
  var o = opciones || {};
  var trabajo = doc2GetOrFail_(DOC2_SHEET.EXPORTACIONES, exportacionId, 'la exportación');
  if (String(trabajo.estado) === 'CANCELADA') {
    throw docError_(DOC_CODE.CONFLICT, 'Esa exportación fue cancelada.', { details: { exportacionId: exportacionId } });
  }

  var checkpoint = docParseJson_(trabajo.checkpoint, { indice: 0, ids: [] }) || { indice: 0, ids: [] };
  var ids = checkpoint.ids || [];
  var desde = Math.max(docInt_(checkpoint.indice, 0), 0);
  var lote = Math.min(Math.max(docInt_(o.lote, DOC2_LIMITS.LOTE_EXPORTACION), 1), DOC2_LIMITS.LOTE_EXPORTACION);
  var tipo = String(trabajo.tipo_exportacion);

  var datos;
  var siguiente;

  if (tipo === 'reporte') {
    var filtroGuardado = docParseJson_(trabajo.filtro_json, {}) || {};
    datos = { Reporte: doc2ReporteComoHoja_(checkpoint.reporte || filtroGuardado.reporte || 'resumen', filtroGuardado.filtro || {}, contexto) };
    siguiente = ids.length;
  } else {
    var tramo = ids.slice(desde, desde + lote);
    datos = doc2DatosExportacion_(tramo, tipo, contexto, desde === 0);
    siguiente = desde + tramo.length;
  }

  var progreso = ids.length ? Math.round((siguiente / ids.length) * 100) : 100;
  var quedan = siguiente < ids.length;

  doc2Update_(DOC2_SHEET.EXPORTACIONES, exportacionId, {
    progreso: progreso,
    checkpoint: { indice: siguiente, ids: ids, reporte: checkpoint.reporte || '' },
    estado: quedan ? 'EN_PROCESO' : 'COMPLETADA',
    completed_at: quedan ? '' : docNow_()
  }, contexto);

  if (!quedan) {
    doc2Emitir_(DOC2_EVENTO.EXPORTACION_LISTA, { exportacionId: exportacionId }, contexto);
  }

  return {
    exportacionId: exportacionId,
    tipo: tipo,
    desde: desde,
    hasta: siguiente,
    total: ids.length,
    progreso: progreso,
    quedan: quedan,
    datos: datos
  };
}

/** Reporte en forma de hoja (encabezado + filas), listo para exportar. */
function doc2ReporteComoHoja_(tipo, filtros, ctx) {
  var reporte = doc2Reporte_(tipo, filtros, ctx);
  var filas = [reporte.columnas];
  for (var i = 0; i < reporte.filas.length; i++) filas.push(reporte.filas[i]);
  return doc2MatrizSegura_(filas);
}

/**
 * Construye los datos de un tramo de expedientes.
 *
 * `conEncabezado` solo va en el primer lote: los siguientes traen filas sueltas
 * que el cliente añade a las hojas que ya creó.
 */
function doc2DatosExportacion_(expedienteIds, tipo, ctx, conEncabezado) {
  var contexto = ctx || doc2CtxActual_();
  var individual = tipo === 'expediente';
  var puedeAuditoria = doc2Puede_(contexto, DOC2_CAPACIDAD.AUDITORIA);

  var hojas = {
    Resumen: [],
    Expedientes: [],
    Requisitos: [],
    Prorrogas: [],
    Solicitudes: [],
    Revisiones: [],
    Aprobaciones: [],
    Tareas: [],
    Historial: []
  };

  if (conEncabezado) {
    hojas.Resumen.push(['Identificador', 'Nombre', 'Cargo', 'Agencia', 'Gerencia', 'Tipo funcionario', 'Tipo garantía', 'Estado', 'Avance %', 'Pendientes', 'No entregados', 'Observados', 'Prórrogas', 'Próxima fecha crítica', 'Resumen']);
    hojas.Expedientes.push(['Identificador', 'Nombre', 'Cargo', 'Agencia', 'Gerencia', 'Fecha ingreso', 'Tipo funcionario', 'Tipo garantía', 'Responsable', 'Estado', 'Avance %', 'Requisitos', 'Entregados', 'Pendientes', 'No entregados', 'No aplica', 'Observados', 'Creado', 'Actualizado']);
    hojas.Requisitos.push(['Identificador', 'Nombre', 'Sección', 'Requisito', 'Código', 'Obligatorio', 'Estado documental', 'Estado revisión', 'Observaciones', 'Actualizado']);
    hojas.Prorrogas.push(['Identificador', 'Nombre', 'Requisito', 'Fecha original', 'Fecha prórroga', 'Días restantes', 'Situación', 'Estado', 'Motivo', 'Solicitada por', 'Aprobada por']);
    hojas.Solicitudes.push(['Identificador', 'Nombre', 'Título', 'Estado', 'Prioridad', 'Fecha solicitud', 'Fecha límite', 'Requisitos', 'Cumplidos', 'Recordatorios', 'Responsable']);
    hojas.Revisiones.push(['Identificador', 'Nombre', 'Requisito', 'Decisión', 'Motivo', 'Comentario', 'Revisor', 'Fecha']);
    hojas.Aprobaciones.push(['Identificador', 'Nombre', 'Flujo', 'Nivel', 'Aprobador', 'Estado', 'Fecha límite', 'Fecha decisión', 'Comentario']);
    hojas.Tareas.push(['Identificador', 'Nombre', 'Tarea', 'Tipo', 'Estado', 'Prioridad', 'Responsable', 'Fecha límite', 'Fuera de plazo']);
    hojas.Historial.push(['Identificador', 'Nombre', 'Fecha', 'Entidad', 'Campo', 'Antes', 'Después', 'Motivo', 'Actor']);
  }

  for (var i = 0; i < expedienteIds.length; i++) {
    var completo = doc2ExpedienteOperativo_(expedienteIds[i], contexto, { historial: individual ? 300 : 25, auditoria: 0 });
    var cab = completo.expediente;

    hojas.Resumen.push([cab.identificador, cab.nombre, cab.cargo, cab.agencia, cab.gerencia,
      cab.tipoFuncionarioEtiqueta, cab.tipoGarantiaEtiqueta, cab.estado, cab.porcentaje,
      cab.totales.pendientes, cab.totales.noEntregados, cab.totales.observados, cab.totales.prorrogas,
      cab.proximaFechaCritica, completo.resumenTextual]);

    hojas.Expedientes.push([cab.identificador, cab.nombre, cab.cargo, cab.agencia, cab.gerencia,
      cab.fechaIngreso, cab.tipoFuncionario, cab.tipoGarantia, cab.responsableId, cab.estado, cab.porcentaje,
      cab.totales.requisitos, cab.totales.entregados, cab.totales.pendientes, cab.totales.noEntregados,
      cab.totales.noAplica, cab.totales.observados, cab.creadoEn, cab.actualizadoEn]);

    for (var r = 0; r < completo.requisitos.length; r++) {
      var req = completo.requisitos[r];
      hojas.Requisitos.push([cab.identificador, cab.nombre, req.seccion, req.nombre, req.codigo,
        req.obligatorio ? 'Sí' : 'No', req.estado, req.estadoRevision, req.observaciones, req.actualizadoEn]);
    }
    for (var p = 0; p < completo.prorrogas.length; p++) {
      var pro = completo.prorrogas[p];
      hojas.Prorrogas.push([cab.identificador, cab.nombre, pro.nombre, pro.fechaOriginal, pro.fechaProrroga,
        pro.diasRestantes, pro.situacion, pro.estado, pro.motivo, pro.solicitadaPor, pro.aprobadaPor]);
    }
    for (var s = 0; s < completo.solicitudes.length; s++) {
      var sol = completo.solicitudes[s];
      hojas.Solicitudes.push([cab.identificador, cab.nombre, sol.titulo, sol.estado, sol.prioridad,
        sol.fechaSolicitud, sol.fechaLimite, sol.total, sol.cumplidos, sol.recordatorios, sol.responsableId]);
    }
    for (var v = 0; v < completo.revisiones.length; v++) {
      var rev = completo.revisiones[v];
      hojas.Revisiones.push([cab.identificador, cab.nombre, rev.nombre, rev.estado, rev.motivoEtiqueta,
        rev.comentario, rev.revisor, rev.fecha]);
    }
    for (var a = 0; a < completo.aprobaciones.length; a++) {
      var apr = completo.aprobaciones[a];
      hojas.Aprobaciones.push([cab.identificador, cab.nombre, apr.flujo, apr.nivel, apr.aprobador,
        apr.estado, apr.fechaLimite, apr.fechaDecision, apr.comentario]);
    }
    for (var t = 0; t < completo.tareas.length; t++) {
      var tar = completo.tareas[t];
      hojas.Tareas.push([cab.identificador, cab.nombre, tar.titulo, tar.tipo, tar.estado, tar.prioridad,
        tar.responsableId, tar.fechaLimite, tar.vencida ? 'Sí' : 'No']);
    }
    if (puedeAuditoria || individual) {
      for (var h = 0; h < completo.historial.length; h++) {
        var his = completo.historial[h];
        hojas.Historial.push([cab.identificador, cab.nombre, his.fecha, his.entidadTipo, his.campo,
          his.anterior, his.nuevo, his.motivo, his.actor]);
      }
    }
  }

  // La exportación individual añade una hoja de observaciones y otra de datos
  // generales, que en la grupal no aportan nada (serían la misma tabla repetida).
  if (individual && expedienteIds.length === 1) {
    var uno = doc2ExpedienteOperativo_(expedienteIds[0], contexto, { historial: 300, auditoria: 0 });
    hojas['Datos generales'] = doc2MatrizSegura_(doc2FichaDatosGenerales_(uno));
    hojas.Observaciones = doc2MatrizSegura_(doc2FichaObservaciones_(uno));
    hojas.Documentos = hojas.Requisitos;
  }

  var salida = {};
  for (var nombre in hojas) {
    if (!Object.prototype.hasOwnProperty.call(hojas, nombre)) continue;
    if (!hojas[nombre].length) continue;
    salida[nombre] = doc2MatrizSegura_(hojas[nombre]);
  }
  return salida;
}

/** Ficha de datos generales de un expediente, en forma de tabla clave/valor. */
function doc2FichaDatosGenerales_(completo) {
  var cab = completo.expediente;
  return [
    ['Campo', 'Valor'],
    ['Identificador', cab.identificador],
    ['Nombre', cab.nombre],
    ['Cargo', cab.cargo],
    ['Agencia', cab.agencia],
    ['Gerencia', cab.gerencia],
    ['Fecha de ingreso', cab.fechaIngreso],
    ['Días desde el ingreso', cab.diasDesdeIngreso],
    ['Tipo de funcionario', cab.tipoFuncionarioEtiqueta],
    ['Tipo de garantía', cab.tipoGarantiaEtiqueta],
    ['Responsable', cab.responsableId],
    ['Estado', cab.estado],
    ['Avance', cab.porcentaje + '%'],
    ['Requisitos', cab.totales.requisitos],
    ['Entregados', cab.totales.entregados],
    ['Pendientes', cab.totales.pendientes],
    ['No entregados', cab.totales.noEntregados],
    ['No aplica', cab.totales.noAplica],
    ['Observados', cab.totales.observados],
    ['Prórrogas', cab.totales.prorrogas],
    ['Prórrogas vencidas', cab.totales.prorrogasVencidas],
    ['Próxima fecha crítica', cab.proximaFechaCritica],
    ['Creado', cab.creadoEn + ' por ' + cab.creadoPor],
    ['Última actualización', cab.actualizadoEn + ' por ' + cab.actualizadoPor],
    ['Resumen', completo.resumenTextual]
  ];
}

/** Observaciones y comentarios de un expediente. */
function doc2FichaObservaciones_(completo) {
  var filas = [['Origen', 'Requisito', 'Texto', 'Estado', 'Fecha', 'Autor']];
  for (var r = 0; r < completo.requisitos.length; r++) {
    var req = completo.requisitos[r];
    if (!req.observaciones) continue;
    filas.push(['Requisito', req.nombre, req.observaciones, req.estadoRevision, req.actualizadoEn, req.actualizadoPor]);
  }
  for (var c = 0; c < completo.comentarios.length; c++) {
    var com = completo.comentarios[c];
    if (com.visibilidad === 'INTERNA') continue;
    filas.push(['Comentario ' + com.tipo, com.codigo ? doc2NombreDeCodigo_(com.codigo) : '', com.contenido,
      com.resuelto ? 'Resuelto' : 'Abierto', com.creadoEn, com.creadoPor]);
  }
  return filas;
}

/** Cancela una exportación en curso. */
function doc2ExportarCancelar_(exportacionId, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.EXPORTAR);
  var trabajo = doc2GetOrFail_(DOC2_SHEET.EXPORTACIONES, exportacionId, 'la exportación');
  if (String(trabajo.estado) === 'COMPLETADA') {
    return { exportacionId: exportacionId, estado: 'COMPLETADA', sinCambios: true };
  }
  doc2Update_(DOC2_SHEET.EXPORTACIONES, exportacionId, {
    estado: 'CANCELADA', completed_at: docNow_(), error_resumen: 'Cancelada por ' + contexto.actor
  }, contexto);
  return { exportacionId: exportacionId, estado: 'CANCELADA' };
}

/** Lista los trabajos de exportación recientes. */
function doc2ListarExportaciones_(filtros, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.EXPORTAR);
  var f = filtros || {};
  var resultado = doc2Query_(DOC2_SHEET.EXPORTACIONES, {
    orden: 'created_at', direccion: 'desc', pagina: f.pagina, porPagina: f.porPagina,
    filtro: function (fila) {
      if (f.soloMias === true && docKey_(fila.solicitada_por) !== docKey_(contexto.actor)) return false;
      if (f.estado && docKey_(fila.estado) !== docKey_(f.estado)) return false;
      return true;
    }
  });
  var vista = [];
  for (var i = 0; i < resultado.filas.length; i++) {
    var fila = resultado.filas[i];
    vista.push({
      exportacionId: fila.exportacion_id,
      tipo: fila.tipo_exportacion,
      expedientes: docInt_(fila.cantidad_expedientes, 0),
      estado: fila.estado,
      progreso: docInt_(fila.progreso, 0),
      solicitadaPor: fila.solicitada_por,
      creadoEn: fila.created_at,
      iniciadaEn: fila.started_at,
      completadaEn: fila.completed_at,
      expiraEn: fila.expires_at,
      error: fila.error_resumen || '',
      estancada: doc2ExportacionEstancada_(fila)
    });
  }
  return { total: resultado.total, pagina: resultado.pagina, paginas: resultado.paginas, exportaciones: vista };
}

/**
 * ¿Está estancada esta exportación?
 *
 * En proceso, sin avanzar y con más de dos horas encima. El diagnóstico lo
 * reporta y el mantenimiento la cierra: un trabajo que quedó a medias porque
 * alguien cerró la pestaña no debería aparecer «en proceso» para siempre.
 */
function doc2ExportacionEstancada_(fila) {
  if (String(fila.estado) !== 'EN_PROCESO') return false;
  var inicio = new Date(String(fila.started_at || fila.created_at)).getTime();
  if (isNaN(inicio)) return false;
  return (Date.now() - inicio) > 2 * 3600000;
}

/** Cierra las exportaciones estancadas y borra los temporales caducados. */
function doc2LimpiarExportaciones_(ctx) {
  var contexto = ctx || doc2CtxActual_();
  var filas = doc2All_(DOC2_SHEET.EXPORTACIONES, true);
  var cerradas = 0;
  for (var i = 0; i < filas.length; i++) {
    if (!doc2ExportacionEstancada_(filas[i])) continue;
    doc2Update_(DOC2_SHEET.EXPORTACIONES, filas[i].exportacion_id, {
      estado: 'INTERRUMPIDA',
      error_resumen: 'El proceso quedó a medias y se cerró en el mantenimiento.',
      completed_at: docNow_()
    }, contexto);
    cerradas++;
  }
  return { cerradas: cerradas };
}

/* ========================================================================== */
/* FILTROS GUARDADOS                                                           */
/* ========================================================================== */

/** Guarda un filtro con nombre. Si ya existe uno con ese nombre, lo actualiza. */
function doc2GuardarFiltro_(datos, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.VER);
  var d = datos || {};
  var nombre = doc2Texto_(d.nombre || '', 120);
  if (!nombre) {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'El filtro necesita un nombre.',
      { details: { fields: doc2Campo_('nombre', 'Ponle un nombre al filtro.') } });
  }
  var definicion = d.definicion || d.filtro || {};
  var id = doc2StableId_('flt', docKey_(contexto.actorId) + '|' + docKey_(nombre));
  var existente = doc2Get_(DOC2_SHEET.FILTROS, id);
  var fila = {
    filtro_id: id,
    propietario_id: doc2Texto_(contexto.actorId, 240),
    nombre: nombre,
    descripcion: doc2TextoLargo_(d.descripcion || '', DOC2_LIMITS.MAX_TEXTO_MEDIO),
    definicion_json: definicion,
    compartido: d.compartido === true
  };
  if (existente) doc2Update_(DOC2_SHEET.FILTROS, id, fila, contexto);
  else doc2Insert_(DOC2_SHEET.FILTROS, fila, contexto);
  return { filtroId: id, nombre: nombre, creado: !existente };
}

/** Filtros propios más los compartidos por el equipo. */
function doc2ListarFiltros_(ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.VER);
  var filas = doc2All_(DOC2_SHEET.FILTROS, true);
  var salida = [];
  var clave = docKey_(contexto.actorId);
  for (var i = 0; i < filas.length; i++) {
    var propio = docKey_(filas[i].propietario_id) === clave;
    if (!propio && filas[i].compartido !== true) continue;
    salida.push({
      filtroId: filas[i].filtro_id,
      nombre: filas[i].nombre,
      descripcion: filas[i].descripcion || '',
      definicion: docParseJson_(filas[i].definicion_json, {}),
      compartido: filas[i].compartido === true,
      propio: propio,
      propietario: filas[i].propietario_id,
      actualizadoEn: filas[i].updated_at || ''
    });
  }
  salida.sort(function (a, b) { return String(a.nombre) > String(b.nombre) ? 1 : -1; });
  return { filtros: salida };
}

/** Borra un filtro guardado. Solo su propietario (o un administrador). */
function doc2EliminarFiltro_(filtroId, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.VER);
  var fila = doc2GetOrFail_(DOC2_SHEET.FILTROS, filtroId, 'el filtro');
  var propio = docKey_(fila.propietario_id) === docKey_(contexto.actorId);
  if (!propio && !doc2Puede_(contexto, DOC2_CAPACIDAD.CONFIGURAR)) {
    throw docError_(DOC2_CODE.PERMISO_INSUFICIENTE, 'Solo puedes borrar tus propios filtros.',
      { details: { propietario: fila.propietario_id } });
  }
  // Un filtro es una preferencia de trabajo, no un dato de negocio: se borra de
  // verdad cuando su dueño lo pide.
  docPurge_(DOC2_SHEET.FILTROS, [filtroId]);
  return { filtroId: filtroId, borrado: true };
}
