/**
 * 20_Migrations.gs — versionado de esquema y migración de datos.
 *
 * ── El problema que resuelve ─────────────────────────────────────────────────
 * El módulo anterior guardaba cada expediente entero dentro de una celda
 * (`DETALLE JSON`) de la pestaña anual, y las filas más antiguas —más de
 * novecientas escritas a mano años antes de que existiera el módulo— no tienen ni
 * eso: solo columnas con `TIENE`, `NO TIENE`, `N/A` y `_`.
 *
 * La migración lee las dos formas y las convierte al modelo normalizado sin
 * perder nada:
 *
 *   · el JSON, cuando existe, da el checklist completo con observaciones y
 *     prórrogas;
 *   · las columnas del libro, cuando no hay JSON, dan el estado de los requisitos
 *     que esas columnas representan;
 *   · lo que no se puede deducir queda como `PENDIENTE`, que es la verdad: nadie
 *     sabe si se entregó.
 *
 * ── Cinco propiedades que una migración de producción necesita ───────────────
 *   1. **idempotente**: los identificadores son deterministas, así que ejecutarla
 *      dos veces actualiza en lugar de duplicar;
 *   2. **por lotes con punto de control**: Apps Script corta a los seis minutos;
 *      el checkpoint permite reanudar donde se quedó;
 *   3. **modo diagnóstico**: `simular: true` recorre todo y cuenta lo que haría,
 *      sin escribir una celda;
 *   4. **no destructiva**: no borra columnas desconocidas, no borra filas, no pisa
 *      un dato normalizado más nuevo que el del libro;
 *   5. **auditada**: cada ejecución deja una fila en `MigracionesDocumentacion`
 *      con su estado, su progreso y su resultado.
 */

/* ========================================================================== */
/* Registro de migraciones                                                     */
/* ========================================================================== */

/**
 * Migraciones declaradas, en orden de aplicación.
 *
 * `porLotes` indica si la migración procesa registros y necesita checkpoint. Las
 * estructurales se aplican de una vez porque tocan cabeceras, no datos.
 */
var DOC2_MIGRACIONES = [
  {
    version: '4.0.0-estructura',
    nombre: 'Crear las hojas del modelo normalizado',
    porLotes: false,
    ejecutar: function (ctx, opciones) { return doc2MigracionEstructura_(ctx, opciones); }
  },
  {
    version: '4.0.1-catalogos',
    nombre: 'Sembrar catálogo, configuración, retención y catálogos auxiliares',
    porLotes: false,
    ejecutar: function (ctx, opciones) { return doc2MigracionCatalogos_(ctx, opciones); }
  },
  {
    version: '4.0.2-expedientes',
    nombre: 'Importar los expedientes del libro anual al modelo normalizado',
    porLotes: true,
    ejecutar: function (ctx, opciones) { return doc2MigracionExpedientes_(ctx, opciones); }
  },
  {
    version: '4.0.3-resumenes',
    nombre: 'Reconstruir resúmenes y estados de los expedientes importados',
    porLotes: true,
    ejecutar: function (ctx, opciones) { return doc2MigracionResumenes_(ctx, opciones); }
  }
];

/** Estado de las migraciones: aplicadas, pendientes y a medias. */
function doc2EstadoMigraciones_() {
  var aplicadas = [];
  var pendientes = [];
  var enProceso = [];
  var filas = [];
  try { filas = doc2All_(DOC2_SHEET.MIGRACIONES, true); } catch (e) { filas = []; }

  var porVersion = {};
  for (var i = 0; i < filas.length; i++) {
    var version = String(filas[i].version);
    var previa = porVersion[version];
    // Gana la ejecución más reciente: una migración puede haberse reintentado.
    if (!previa || String(filas[i].started_at || '') > String(previa.started_at || '')) porVersion[version] = filas[i];
  }

  for (var m = 0; m < DOC2_MIGRACIONES.length; m++) {
    var declarada = DOC2_MIGRACIONES[m];
    var registro = porVersion[declarada.version];
    if (registro && String(registro.estado) === 'COMPLETADA') aplicadas.push(declarada.version);
    else if (registro && String(registro.estado) === 'EN_PROCESO') { enProceso.push(declarada.version); pendientes.push(declarada.version); }
    else pendientes.push(declarada.version);
  }

  return { aplicadas: aplicadas, pendientes: pendientes, enProceso: enProceso, total: DOC2_MIGRACIONES.length };
}

/** ¿Está aplicada esa versión? */
function doc2MigracionAplicada_(version) {
  var estado = doc2EstadoMigraciones_();
  return estado.aplicadas.indexOf(String(version)) >= 0;
}

/**
 * Ejecuta las migraciones pendientes.
 *
 * `simular: true` no escribe nada: recorre, cuenta y devuelve el informe. Es lo
 * que hay que ejecutar antes de migrar de verdad, y lo que el tutorial de
 * despliegue pide como paso previo obligatorio.
 *
 * `version` limita la ejecución a una sola migración, para poder reanudar una que
 * quedó a medias sin volver a pasar por las anteriores.
 */
function doc2Migrar_(opciones, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.MIGRAR);
  var o = opciones || {};
  var simular = o.simular === true;
  var lote = Math.min(Math.max(docInt_(o.lote, DOC2_LIMITS.LOTE_MIGRACION), 10), 1000);

  // Sin las hojas del modelo no se puede ni registrar la migración: la
  // estructural se aplica siempre primero, incluso en modo simulación.
  if (!simular) doc2EnsureSheets_({ silencioso: true });

  var estado = doc2EstadoMigraciones_();
  var objetivo = o.version ? [String(o.version)] : estado.pendientes;
  var resultados = [];

  for (var i = 0; i < DOC2_MIGRACIONES.length; i++) {
    var migracion = DOC2_MIGRACIONES[i];
    if (objetivo.indexOf(migracion.version) < 0) continue;

    var registro = simular ? null : doc2AbrirMigracion_(migracion, contexto);
    var checkpoint = registro ? (docParseJson_(registro.checkpoint, {}) || {}) : {};
    var inicio = Date.now();

    try {
      var salida = migracion.ejecutar(contexto, {
        simular: simular,
        lote: lote,
        checkpoint: checkpoint,
        desde: docInt_(checkpoint.indice, 0)
      });

      if (!simular && registro) {
        doc2Update_(DOC2_SHEET.MIGRACIONES, registro.migracion_id, {
          estado: salida.quedan ? 'EN_PROCESO' : 'COMPLETADA',
          progreso: docInt_(salida.progreso, salida.quedan ? 50 : 100),
          checkpoint: salida.checkpoint || { indice: docInt_(salida.siguiente, 0) },
          filas_afectadas: docInt_(salida.filas, 0),
          resultado: doc2TextoLargo_(salida.resumen || '', DOC2_LIMITS.MAX_TEXTO_MEDIO),
          completed_at: salida.quedan ? '' : docNow_()
        }, contexto);
      }

      resultados.push({
        version: migracion.version,
        nombre: migracion.nombre,
        simulado: simular,
        ok: true,
        quedan: salida.quedan === true,
        siguiente: docInt_(salida.siguiente, 0),
        filas: docInt_(salida.filas, 0),
        detalle: salida.detalle || {},
        resumen: salida.resumen || '',
        ms: Date.now() - inicio
      });

      if (salida.quedan === true) break; // Se reanuda en la siguiente llamada.
    } catch (error) {
      var info = docClassify_(error);
      if (!simular && registro) {
        doc2Update_(DOC2_SHEET.MIGRACIONES, registro.migracion_id, {
          estado: 'ERROR',
          error_resumen: doc2TextoLargo_(info.message, DOC2_LIMITS.MAX_TEXTO_MEDIO),
          completed_at: docNow_()
        }, contexto);
      }
      resultados.push({
        version: migracion.version, nombre: migracion.nombre, simulado: simular,
        ok: false, error: info.message, codigo: info.docCode, ms: Date.now() - inicio
      });
      break; // No se sigue con las siguientes: pueden depender de esta.
    }
  }

  if (!simular) {
    doc2CacheInvalidar_([]);
    doc2Audit_({
      tipo: 'migracion.ejecutada', entidadTipo: 'sistema',
      actor: contexto.actor, actorId: contexto.actorId, origen: contexto.origen, requestId: contexto.requestId,
      metadata: { ejecutadas: resultados.length, versiones: objetivo.join(',') }
    });
  }

  return {
    simulado: simular,
    ejecutadas: resultados,
    estado: doc2EstadoMigraciones_(),
    recomendacionRespaldo: 'Antes de migrar en producción, saca una copia del libro (Archivo → Crear una copia) o ejecuta el respaldo del módulo.'
  };
}

/** Abre (o reabre) el registro de una migración. */
function doc2AbrirMigracion_(migracion, ctx) {
  var contexto = ctx || doc2CtxActual_();
  var id = doc2StableId_('mig', migracion.version);
  var existente = doc2Get_(DOC2_SHEET.MIGRACIONES, id);
  if (existente && String(existente.estado) === 'EN_PROCESO') return existente;

  var fila = {
    migracion_id: id,
    version: migracion.version,
    nombre: migracion.nombre,
    estado: 'EN_PROCESO',
    progreso: 0,
    checkpoint: existente ? docParseJson_(existente.checkpoint, {}) : {},
    filas_afectadas: 0,
    resultado: '',
    error_resumen: '',
    started_at: docNow_(),
    completed_at: '',
    executed_by: doc2Texto_(contexto.actor, 240)
  };
  if (existente) doc2Update_(DOC2_SHEET.MIGRACIONES, id, fila, contexto);
  else doc2Insert_(DOC2_SHEET.MIGRACIONES, fila, contexto);
  return doc2Get_(DOC2_SHEET.MIGRACIONES, id);
}

/**
 * Copia de seguridad lógica antes de migrar.
 *
 * Reutiliza el respaldo que ya existía (`docBackup_`), que guarda todos los
 * expedientes del libro anual en una fila de `_RESPALDOS`. Es el estado ANTERIOR a
 * la migración: si algo saliera mal, restaurarlo devuelve el libro a como estaba.
 */
function doc2RespaldoPrevio_(ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.MIGRAR);
  try {
    var respaldo = docBackup_('previo a migrar al modelo normalizado', contexto.actor);
    return { ok: true, respaldoId: respaldo.id, expedientes: respaldo.expedientes, bytes: respaldo.bytes };
  } catch (error) {
    var info = docClassify_(error);
    return {
      ok: false,
      error: info.message,
      recomendacion: 'Saca una copia manual del libro: Archivo → Crear una copia. No migres sin respaldo.'
    };
  }
}

/* ========================================================================== */
/* Migración 1: estructura                                                     */
/* ========================================================================== */

function doc2MigracionEstructura_(ctx, opciones) {
  var o = opciones || {};
  if (o.simular === true) {
    var ss = docSpreadsheet_();
    var faltan = [];
    for (var i = 0; i < DOC2_SHEET_ORDER.length; i++) {
      if (!ss.getSheetByName(DOC2_SHEET_ORDER[i])) faltan.push(DOC2_SHEET_ORDER[i]);
    }
    if (!ss.getSheetByName(DOC2_SHEET.AUXILIAR)) faltan.push(DOC2_SHEET.AUXILIAR);
    return {
      quedan: false, filas: 0,
      detalle: { hojasPorCrear: faltan },
      resumen: faltan.length ? ('Se crearían ' + faltan.length + ' hoja(s).') : 'Todas las hojas existen.'
    };
  }
  var acciones = doc2EnsureSheets_({ silencioso: true });
  return {
    quedan: false, filas: acciones.length,
    detalle: { acciones: acciones },
    resumen: acciones.length ? (acciones.length + ' hoja(s) creada(s) o ajustada(s).') : 'Sin cambios de estructura.'
  };
}

/* ========================================================================== */
/* Migración 2: catálogos                                                      */
/* ========================================================================== */

function doc2MigracionCatalogos_(ctx, opciones) {
  var o = opciones || {};
  if (o.simular === true) {
    var existentes = 0;
    try { existentes = doc2Catalogo_(true).length; } catch (e) { existentes = 0; }
    return {
      quedan: false, filas: 0,
      detalle: { catalogoActual: existentes, catalogoSemilla: DOC2_CATALOGO_SEMILLA.length },
      resumen: 'Se sembrarían ' + Math.max(0, DOC2_CATALOGO_SEMILLA.length - existentes) +
        ' documento(s) de catálogo y las claves de configuración que falten.'
    };
  }
  var catalogo = doc2SeedCatalogo_(ctx);
  var config = doc2SeedConfig_(ctx);
  var retencion = doc2SeedRetencion_(ctx);
  var auxiliares = doc2SeedAuxiliares_();
  doc2EspejoCatalogoHeredado_();
  return {
    quedan: false,
    filas: catalogo.creados + config + retencion,
    detalle: { catalogo: catalogo, configuracion: config, retencion: retencion, auxiliares: auxiliares },
    resumen: catalogo.creados + ' documento(s) de catálogo, ' + config + ' clave(s) de configuración, ' +
      retencion + ' política(s) y ' + (auxiliares.agencias.agregadas + auxiliares.gerencias.agregadas) +
      ' valor(es) auxiliar(es).'
  };
}

/* ========================================================================== */
/* Migración 3: expedientes del libro anual                                    */
/* ========================================================================== */

/**
 * Importa las filas del libro anual al modelo normalizado.
 *
 * ── Cómo se decide la rama de cada expediente ───────────────────────────────
 * El libro no tiene columna «tipo de funcionario». Lo que sí tiene son las
 * columnas de garantía (`CONTRATO DE FIANZA`, `VISTA O INFORMACION RAPIDA`) y las
 * de cumplimiento. La regla es conservadora: si esas columnas tienen contenido
 * real —algo distinto de vacío, `_` o `N/A`—, el expediente se clasifica como
 * COMERCIAL con la garantía que corresponda; si no, como GENERAL. Es una
 * inferencia, y por eso el diagnóstico marca después los casos raros para que una
 * persona los revise.
 *
 * ── Qué NO hace ─────────────────────────────────────────────────────────────
 * No toca el libro anual. No borra filas. No sobrescribe un expediente
 * normalizado que se haya editado DESPUÉS de la última vez que se guardó la fila
 * del libro: en ese caso la fila normalizada es la reciente y la del libro es la
 * copia.
 */
function doc2MigracionExpedientes_(ctx, opciones) {
  var contexto = ctx || doc2CtxActual_();
  var o = opciones || {};
  var simular = o.simular === true;
  var lote = docInt_(o.lote, DOC2_LIMITS.LOTE_MIGRACION);
  var desde = Math.max(docInt_(o.desde, 0), 0);

  var pendientes = doc2FilasDelLibro_();
  var procesados = 0;
  var creados = 0;
  var actualizados = 0;
  var omitidos = 0;
  var requisitosCreados = 0;
  var prorrogasCreadas = 0;
  var incidencias = [];

  for (var i = desde; i < pendientes.length && procesados < lote; i++) {
    var entrada = pendientes[i];
    procesados++;
    try {
      var resultado = doc2ImportarFilaDelLibro_(entrada, contexto, simular);
      if (resultado.omitido) omitidos++;
      else if (resultado.creado) creados++;
      else actualizados++;
      requisitosCreados += docInt_(resultado.requisitos, 0);
      prorrogasCreadas += docInt_(resultado.prorrogas, 0);
      if (resultado.incidencia) incidencias.push(resultado.incidencia);
    } catch (error) {
      var info = docClassify_(error);
      incidencias.push({
        anio: entrada.anio, fila: entrada.fila, identificador: entrada.identificador || '',
        nombre: entrada.nombre || '', motivo: info.message
      });
    }
  }

  var siguiente = desde + procesados;
  var quedan = siguiente < pendientes.length;

  return {
    quedan: quedan,
    siguiente: siguiente,
    progreso: pendientes.length ? Math.round((siguiente / pendientes.length) * 100) : 100,
    checkpoint: { indice: siguiente, total: pendientes.length },
    filas: creados + actualizados,
    detalle: {
      totalLibro: pendientes.length, procesados: procesados, creados: creados, actualizados: actualizados,
      omitidos: omitidos, requisitos: requisitosCreados, prorrogas: prorrogasCreadas,
      incidencias: incidencias.slice(0, 25)
    },
    resumen: (simular ? 'Simulación: ' : '') + creados + ' creado(s), ' + actualizados + ' actualizado(s), ' +
      omitidos + ' omitido(s), ' + requisitosCreados + ' requisito(s), ' + prorrogasCreadas + ' prórroga(s)' +
      (quedan ? '. Quedan ' + (pendientes.length - siguiente) + ' fila(s).' : '.')
  };
}

/**
 * Recorre las pestañas anuales y devuelve las filas a migrar.
 *
 * Se ordena por año descendente para que lo reciente entre primero: si la
 * migración se interrumpe, lo que ya está migrado es lo que más se usa.
 */
function doc2FilasDelLibro_() {
  var salida = [];
  var anios = [];
  try { anios = docListYears_(); } catch (e) { anios = []; }

  for (var a = 0; a < anios.length; a++) {
    var cargada = null;
    try { cargada = docLoadYear_(anios[a], false); } catch (e) { cargada = null; }
    if (!cargada) continue;
    for (var r = 0; r < cargada.rows.length; r++) {
      var fila = cargada.rows[r];
      if (!fila.nombre && !fila.id) continue;
      salida.push({
        anio: anios[a],
        fila: fila.__row,
        identificador: String(fila.id || ''),
        nombre: String(fila.nombre || ''),
        heredada: !!fila.__heredada,
        datos: fila
      });
    }
  }
  return salida;
}

/**
 * Importa UNA fila del libro.
 *
 * Devuelve `{creado, omitido, requisitos, prorrogas, incidencia}`. Es
 * deliberadamente tolerante: una fila con la fecha mal escrita se importa con la
 * fecha vacía y deja una incidencia, en lugar de detener la migración entera.
 */
function doc2ImportarFilaDelLibro_(entrada, ctx, simular) {
  var contexto = ctx || doc2CtxActual_();
  var fila = entrada.datos;
  var identificadorVisible = String(fila.id || '').trim();
  var nombre = String(fila.nombre || '').trim();

  if (!identificadorVisible && !nombre) return { omitido: true, requisitos: 0, prorrogas: 0 };
  if (!identificadorVisible) {
    // Las filas históricas sin identificador reciben el determinista que ya
    // usaba el módulo anterior (`HIST-<año>-<huella>`), no uno nuevo: así una
    // referencia guardada en cualquier sitio sigue apuntando a la misma persona.
    identificadorVisible = docLegacyId_(nombre, entrada.anio, entrada.fila);
  }

  var normalizado = doc2NormalizarIdentificador_(identificadorVisible);
  var expedienteId = doc2StableId_('exp', normalizado);
  var detalle = fila.detalle_json;
  if (typeof detalle === 'string') detalle = docParseJson_(detalle, null);
  var dossier = detalle || {};

  var clasificacion = doc2InferirRama_(fila, dossier);
  // La lectura de la pestaña anual ya normaliza la fecha, así que aquí solo se
  // puede saber si quedó utilizable o no. Sin fecha no hay antigüedad ni año, y
  // eso merece constar como incidencia aunque la fila se importe igual.
  var fechaIngreso = docDateOnly_(fila.fecha_ingreso);
  var incidencia = null;
  if (!fechaIngreso) {
    incidencia = {
      anio: entrada.anio, fila: entrada.fila, identificador: identificadorVisible,
      nombre: nombre,
      motivo: 'Sin fecha de ingreso utilizable: se importó vacía y habrá que completarla.'
    };
  }

  var existente = null;
  try {
    existente = doc2Get_(DOC2_SHEET.EXPEDIENTES, expedienteId);
  } catch (error) {
    // En simulación las hojas del modelo pueden no existir todavía.
    if (!simular) throw error;
    existente = null;
  }

  // Si el expediente normalizado se editó después de la última escritura del
  // libro, la copia autorizada es la normalizada: no se pisa.
  if (existente && !simular) {
    var actualizadoNormalizado = String(existente.updated_at || '');
    var actualizadoLibro = String(fila.actualizado_en || '');
    if (actualizadoNormalizado && actualizadoLibro && actualizadoNormalizado > actualizadoLibro) {
      var requisitosExistentes = doc2SincronizarRequisitos_(expedienteId, contexto, { silencioso: true });
      return {
        creado: false, omitido: false, requisitos: requisitosExistentes.creados, prorrogas: 0,
        incidencia: incidencia
      };
    }
  }

  var cabecera = {
    expediente_id: expedienteId,
    identificador: doc2Texto_(identificadorVisible, 120),
    identificador_normalizado: normalizado,
    nombre: doc2Texto_(nombre || identificadorVisible, 300),
    cargo: doc2Texto_(fila.cargo || dossier.cargo || '', 300),
    agencia: doc2Texto_(fila.oficina || dossier.agencia || '', 200),
    gerencia: doc2Texto_(fila.gerencia || dossier.gerencia || '', 200),
    fecha_ingreso: fechaIngreso,
    tipo_funcionario: clasificacion.tipoFuncionario,
    tipo_garantia: clasificacion.tipoGarantia,
    responsable_id: doc2Texto_(fila.responsable || dossier.responsable || '', 240),
    estado_expediente: doc2NormalizarEstadoExpediente_(fila.estado) || DOC2_ESTADO_EXPEDIENTE.EN_RECOLECCION,
    version_registro: existente ? docInt_(existente.version_registro, 1) : 1,
    estado_operacion: 'ACTIVO',
    idempotency_key_creacion: 'migracion:' + entrada.anio + ':' + entrada.fila,
    created_at: docIsoFromCell_(fila.creado_en) || docNow_(),
    created_by: doc2Texto_(fila.actualizado_por || 'migracion', 240),
    updated_at: docNow_(),
    updated_by: doc2Texto_(contexto.actor || 'migracion', 240)
  };

  if (simular) {
    var aplicablesSimulados;
    try {
      aplicablesSimulados = doc2Aplicables_({
        tipoFuncionario: clasificacion.tipoFuncionario,
        tipoGarantia: clasificacion.tipoGarantia,
        fecha: fechaIngreso
      });
    } catch (error) {
      // Sin hoja de catálogo se cuenta contra la semilla del código: la
      // simulación tiene que poder ejecutarse en un libro virgen, que es
      // justamente cuando más falta hace.
      aplicablesSimulados = doc2AplicablesDeSemilla_(clasificacion.tipoFuncionario, clasificacion.tipoGarantia);
    }
    return {
      creado: !existente, omitido: false,
      requisitos: aplicablesSimulados.length,
      prorrogas: doc2ContarProrrogasDelDossier_(dossier),
      incidencia: incidencia
    };
  }

  if (existente) doc2Update_(DOC2_SHEET.EXPEDIENTES, expedienteId, cabecera, contexto);
  else doc2Insert_(DOC2_SHEET.EXPEDIENTES, cabecera, contexto);

  var sincronizacion = doc2SincronizarRequisitos_(expedienteId, contexto, { silencioso: true });
  var estados = doc2EstadosDesdeLibro_(fila, dossier, expedienteId, contexto);

  return {
    creado: !existente,
    omitido: false,
    requisitos: sincronizacion.creados,
    prorrogas: estados.prorrogas,
    incidencia: incidencia
  };
}

/**
 * Requisitos aplicables calculados contra la semilla del código.
 *
 * Es el mismo criterio que el motor de aplicabilidad, pero sin leer la hoja: lo
 * usa la simulación cuando el catálogo todavía no existe.
 */
function doc2AplicablesDeSemilla_(tipoFuncionario, tipoGarantia) {
  var funcionario = docKey_(tipoFuncionario || 'GENERAL');
  var garantia = docKey_(tipoGarantia || 'NINGUNA').replace(/[ \-]/g, '_');
  var salida = [];
  for (var i = 0; i < DOC2_CATALOGO_SEMILLA.length; i++) {
    var def = DOC2_CATALOGO_SEMILLA[i];
    var funcionarios = def.funcionario || [];
    if (funcionarios.length && funcionarios.indexOf(funcionario) < 0) continue;
    var garantias = def.garantia || [];
    if (garantias.length && garantias.indexOf(garantia) < 0) continue;
    salida.push(def);
  }
  return salida;
}

/** Cuántas prórrogas trae el JSON heredado. Solo para la simulación. */
function doc2ContarProrrogasDelDossier_(dossier) {
  var items = (dossier && dossier.items) || [];
  var n = 0;
  for (var i = 0; i < items.length; i++) if (items[i] && items[i].prorroga) n++;
  return n;
}

/**
 * Infiere la rama documental de una fila del libro.
 *
 * Conservador a propósito: solo clasifica como COMERCIAL cuando las columnas de
 * garantía tienen contenido REAL. Un `_` o un `N/A` significan «no corresponde», y
 * clasificar a media plantilla como comercial por un guion bajo obligaría a
 * corregir cientos de expedientes a mano.
 */
function doc2InferirRama_(fila, dossier) {
  var d = dossier || {};
  var declarado = docKey_(d.tipoFuncionario || '');
  if (declarado && doc2TipoFuncionario_(declarado)) {
    var declaradaGarantia = docKey_(d.tipoGarantia || '').replace(/[ \-]/g, '_');
    return {
      tipoFuncionario: declarado,
      tipoGarantia: doc2TipoGarantia_(declaradaGarantia) ? declaradaGarantia : (declarado === 'COMERCIAL' ? 'COMERCIAL_1' : 'NINGUNA'),
      inferido: false
    };
  }

  function conContenido(valor) {
    var texto = docKey_(valor);
    if (!texto) return false;
    if (texto === '_' || texto === 'N/A' || texto === 'NA' || texto === 'NO APLICA') return false;
    return true;
  }

  var items = {};
  var lista = d.items || [];
  for (var i = 0; i < lista.length; i++) {
    if (lista[i] && lista[i].id) items[String(lista[i].id)] = lista[i];
  }
  function itemActivo(codigo) {
    var item = items[codigo];
    if (!item) return false;
    var estado = String(item.status || '');
    return estado === 'presentado' || estado === 'observado' || estado === 'pendiente';
  }

  var fianza = conContenido(fila.contrato_fianza) || conContenido(fila.contrato_fianza_garante);
  var vista = conContenido(fila.vista_informacion_rapida);
  var famActivo = itemActivo('garante-fam1-ci') || itemActivo('garante-fam2-ci');
  var boletas = itemActivo('garante-boletas') || itemActivo('garante-form-200-400');
  var inmueble = itemActivo('garante-inmueble') || itemActivo('garante-folio');

  var cumplimiento = conContenido(fila.conozca_funcionario) || itemActivo('lgi-ft') || itemActivo('examen-uif');
  var auditoria = itemActivo('impedimento-auditor');

  if (fianza || vista || famActivo || boletas || inmueble) {
    var garantia = 'COMERCIAL_1';
    if (famActivo) garantia = 'COMERCIAL_3';
    else if (boletas && !inmueble) garantia = 'COMERCIAL_2';
    else if (vista && !inmueble && !boletas) garantia = 'COMERCIAL_1';
    return { tipoFuncionario: 'COMERCIAL', tipoGarantia: garantia, inferido: true };
  }
  if (auditoria) return { tipoFuncionario: 'AUDITORIA', tipoGarantia: 'NINGUNA', inferido: true };
  if (cumplimiento) return { tipoFuncionario: 'CUMPLIMIENTO', tipoGarantia: 'NINGUNA', inferido: true };
  return { tipoFuncionario: 'GENERAL', tipoGarantia: 'NINGUNA', inferido: true };
}

/**
 * Traslada los estados documentales del libro al modelo normalizado.
 *
 * Dos fuentes, en este orden de confianza:
 *
 *   1. el checklist del JSON, que tiene estado, observación y prórroga por
 *      documento;
 *   2. las columnas del libro, que cubren catorce de los treinta y un requisitos
 *      y son lo único que tienen las filas históricas.
 *
 * Nunca se degrada un estado ya registrado: si el requisito normalizado dice
 * ENTREGADO y el libro dice PENDIENTE, gana ENTREGADO. Volver atrás un estado sin
 * intervención humana sería destruir información.
 */
function doc2EstadosDesdeLibro_(fila, dossier, expedienteId, ctx) {
  var contexto = ctx || doc2CtxActual_();
  var d = dossier || {};
  var requisitos = doc2RequisitosDe_(expedienteId, true);
  var porCodigo = {};
  for (var i = 0; i < requisitos.length; i++) porCodigo[String(requisitos[i].codigo_documento)] = requisitos[i];

  var actualizados = 0;
  var prorrogas = 0;

  // 1. Checklist del JSON.
  var items = d.items || [];
  for (var it = 0; it < items.length; it++) {
    var item = items[it] || {};
    var requisito = porCodigo[String(item.id)];
    if (!requisito) continue;

    var estado = doc2EstadoDesdeHeredado_(item.status);
    var revision = String(item.status) === 'observado' ? DOC2_ESTADO_REVISION.OBSERVADO : String(requisito.estado_revision || DOC2_ESTADO_REVISION.SIN_REVISION);
    if (estado === DOC2_ESTADO_DOCUMENTO.NO_APLICA && requisito.permite_no_aplica !== true) {
      estado = DOC2_ESTADO_DOCUMENTO.PENDIENTE;
    }
    if (doc2DegradaEstado_(requisito.estado_documental, estado)) estado = requisito.estado_documental;

    var patch = { estado_documental: estado, estado_revision: revision };
    if (item.observation) patch.observaciones = doc2TextoLargo_(item.observation, DOC2_LIMITS.MAX_TEXTO_MEDIO);
    doc2Update_(DOC2_SHEET.EXPEDIENTE_DOCS, requisito.expediente_documento_id, patch, contexto);
    actualizados++;

    if (item.prorroga && requisito.permite_prorroga === true) {
      if (doc2ImportarProrroga_(expedienteId, requisito, item.prorroga, contexto)) prorrogas++;
    }
  }

  // 2. Columnas del libro, para lo que el JSON no cubre.
  var columnas = docDocumentColumns_();
  for (var c = 0; c < columnas.length; c++) {
    var columna = columnas[c];
    if (!columna.items || !columna.items.length) continue;
    var valor = fila[columna.clave];
    if (valor === undefined || valor === null || String(valor).trim() === '') continue;
    var estadoColumna = doc2EstadoDesdeHeredado_(valor);
    for (var k = 0; k < columna.items.length; k++) {
      var requisitoColumna = porCodigo[String(columna.items[k])];
      if (!requisitoColumna) continue;
      // El JSON manda: si ese requisito ya vino en el checklist, no se toca.
      var yaEnJson = false;
      for (var j = 0; j < items.length; j++) {
        if (items[j] && String(items[j].id) === String(columna.items[k])) { yaEnJson = true; break; }
      }
      if (yaEnJson) continue;
      var estadoFinal = estadoColumna;
      if (estadoFinal === DOC2_ESTADO_DOCUMENTO.NO_APLICA && requisitoColumna.permite_no_aplica !== true) {
        estadoFinal = DOC2_ESTADO_DOCUMENTO.PENDIENTE;
      }
      if (doc2DegradaEstado_(requisitoColumna.estado_documental, estadoFinal)) continue;
      doc2Update_(DOC2_SHEET.EXPEDIENTE_DOCS, requisitoColumna.expediente_documento_id, {
        estado_documental: estadoFinal
      }, contexto);
      actualizados++;
    }
  }

  return { actualizados: actualizados, prorrogas: prorrogas };
}

/** Traduce un estado heredado (del JSON o de una columna) al vocabulario nuevo. */
function doc2EstadoDesdeHeredado_(valor) {
  var texto = String(valor === null || valor === undefined ? '' : valor);
  var clave = docKey_(texto);
  if (clave === 'PRESENTADO') return DOC2_ESTADO_DOCUMENTO.ENTREGADO;
  if (clave === 'OBSERVADO') return DOC2_ESTADO_DOCUMENTO.ENTREGADO; // llegó, pero con observación
  if (clave === 'NO_APLICA') return DOC2_ESTADO_DOCUMENTO.NO_APLICA;
  if (clave === 'PENDIENTE') return DOC2_ESTADO_DOCUMENTO.PENDIENTE;
  return doc2NormalizarEstadoDocumento_(texto);
}

/**
 * ¿Pasar de `actual` a `nuevo` sería degradar?
 *
 * ENTREGADO y NO_APLICA son estados «resueltos». Volver de ellos a PENDIENTE o
 * NO_ENTREGADO durante una migración significaría perder un registro de entrega, y
 * eso no lo puede decidir un script.
 */
function doc2DegradaEstado_(actual, nuevo) {
  var resueltos = { ENTREGADO: true, NO_APLICA: true };
  return resueltos[String(actual)] === true && resueltos[String(nuevo)] !== true;
}

/** Crea la prórroga heredada de un requisito, si no existe ya. */
function doc2ImportarProrroga_(expedienteId, requisito, fecha, ctx) {
  var contexto = ctx || doc2CtxActual_();
  var solo = docDateOnly_(fecha);
  if (!solo) return false;
  var id = doc2StableId_('pro', requisito.expediente_documento_id + '|' + solo);
  if (doc2Get_(DOC2_SHEET.PRORROGAS, id)) return false;

  var vencida = doc2Vencida_(solo);
  doc2Insert_(DOC2_SHEET.PRORROGAS, {
    prorroga_id: id,
    expediente_id: expedienteId,
    expediente_documento_id: requisito.expediente_documento_id,
    codigo_documento: requisito.codigo_documento,
    fecha_original: '',
    fecha_prorroga: solo,
    motivo: 'Prórroga registrada en el libro anterior.',
    estado_prorroga: vencida ? DOC2_ESTADO_PRORROGA.VENCIDA : DOC2_ESTADO_PRORROGA.VIGENTE,
    solicitada_por: 'migracion',
    aprobada_por: 'migracion',
    fecha_aprobacion: docNow_()
  }, contexto);
  return true;
}

/* ========================================================================== */
/* Migración 4: resúmenes                                                      */
/* ========================================================================== */

function doc2MigracionResumenes_(ctx, opciones) {
  var contexto = ctx || doc2CtxActual_();
  var o = opciones || {};
  var simular = o.simular === true;
  var lote = docInt_(o.lote, DOC2_LIMITS.LOTE_MIGRACION);
  var desde = Math.max(docInt_(o.desde, 0), 0);

  var expedientes = [];
  try {
    expedientes = doc2All_(DOC2_SHEET.EXPEDIENTES, true);
  } catch (error) {
    // En simulación las hojas pueden no existir todavía: no es un fallo, es que no
    // hay nada que recalcular.
    if (!simular) throw error;
    expedientes = [];
  }
  var procesados = 0;
  var recalculados = 0;

  for (var i = desde; i < expedientes.length && procesados < lote; i++) {
    procesados++;
    if (simular) { recalculados++; continue; }
    doc2RecalcularExpediente_(expedientes[i].expediente_id, contexto);
    recalculados++;
  }

  var siguiente = desde + procesados;
  var quedan = siguiente < expedientes.length;
  if (!quedan && !simular) doc2CacheInvalidar_([DOC2_CACHE.PANEL]);

  return {
    quedan: quedan,
    siguiente: siguiente,
    progreso: expedientes.length ? Math.round((siguiente / expedientes.length) * 100) : 100,
    checkpoint: { indice: siguiente, total: expedientes.length },
    filas: recalculados,
    detalle: { expedientes: expedientes.length, recalculados: recalculados },
    resumen: (simular ? 'Simulación: ' : '') + recalculados + ' resumen(es) recalculado(s)' +
      (quedan ? '. Quedan ' + (expedientes.length - siguiente) + '.' : '.')
  };
}

/* ========================================================================== */
/* Instalación completa del modelo normalizado                                 */
/* ========================================================================== */

/**
 * Deja el módulo listo para operar: estructura, catálogos y migración de datos.
 *
 * Es lo que ejecuta el botón «Instalar o actualizar» y el paso 6 del tutorial de
 * despliegue. Idempotente: se puede ejecutar tantas veces como haga falta.
 */
function doc2Instalar_(opciones, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.MIGRAR);
  var o = opciones || {};

  var respaldo = null;
  if (o.conRespaldo !== false) respaldo = doc2RespaldoPrevio_(contexto);

  var acciones = doc2EnsureSheets_({ silencioso: true });
  var migracion = doc2Migrar_({ simular: o.simular === true, lote: o.lote }, contexto);

  // Cierre del arranque: quien instala queda registrado como administrador. Si no
  // se hiciera, el libro seguiria en modo bootstrap y cualquiera podria migrarlo.
  var rolesRegistrados = null;
  if (o.simular !== true) {
    var mapaRoles = doc2ConfigJson_('roles_por_actor', {}) || {};
    if (!Object.keys(mapaRoles).length) {
      var semilla = {};
      semilla[String(contexto.actorId || 'administrador')] = 'admin';
      if (contexto.correo && docKey_(contexto.correo) !== docKey_(contexto.actorId)) semilla[String(contexto.correo)] = 'admin';
      doc2ConfigSet_('roles_por_actor', semilla, contexto);
      rolesRegistrados = semilla;
    }
  }

  var diagnostico = doc2Diagnostico_(contexto);

  doc2Audit_({
    tipo: 'modulo.instalado', entidadTipo: 'sistema',
    actor: contexto.actor, actorId: contexto.actorId, origen: contexto.origen, requestId: contexto.requestId,
    metadata: { hojas: acciones.length, migraciones: migracion.ejecutadas.length, criticos: diagnostico.conteos.CRITICO }
  });

  return {
    hojas: acciones,
    respaldo: respaldo,
    migracion: migracion,
    rolesRegistrados: rolesRegistrados,
    diagnostico: { conteos: diagnostico.conteos, resumen: diagnostico.resumen, hallazgos: diagnostico.hallazgos.length },
    esquema: DOC2_SCHEMA_VERSION
  };
}
