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
  },
  {
    version: '5.0.0-hojas-fisicas',
    nombre: 'Añadir el conteo de hojas físicas, la forma de presentación y las subsecciones',
    porLotes: false,
    ejecutar: function (ctx, opciones) { return doc2MigracionHojasFisicas_(ctx, opciones); }
  },
  {
    version: '5.0.1-catalogo-v3',
    nombre: 'Publicar el catálogo versión 3: 16 generales, subsecciones y retiro de dos requisitos',
    porLotes: true,
    ejecutar: function (ctx, opciones) { return doc2MigracionCatalogoV3_(ctx, opciones); }
  },
  {
    version: '5.0.2-identificadores',
    nombre: 'Poner al día la clave de comparación del carnet de identidad',
    porLotes: true,
    ejecutar: function (ctx, opciones) { return doc2MigracionIdentificadores_(ctx, opciones); }
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
    // Un requisito retirado NO se exige a un expediente nuevo, ni siquiera cuando
    // la cuenta se hace desde la semilla y no desde la hoja. Sin esta línea, la
    // migración y el verificador contarían 18 generales donde el motor de
    // aplicabilidad ve 16, y las dos cifras discreparían para siempre.
    if (def.retirado === true) continue;
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
  var heredados = 0;

  // 1. Checklist del JSON.
  var items = d.items || [];
  for (var it = 0; it < items.length; it++) {
    var item = items[it] || {};
    var requisito = porCodigo[String(item.id)];
    if (!requisito) {
      /*
       * ── Rescate de un requisito RETIRADO con historia ────────────────────
       * El JSON del libro trae un documento que el catálogo vigente ya no exige
       * (`cert-trabajo`, `rc-iva`). `doc2SincronizarRequisitos_` no le creó fila
       * porque no es aplicable, y sin este bloque su estado —«presentado en
       * marzo de 2024»— desaparecería del modelo normalizado. Eso es
       * exactamente lo que la retirada del catálogo prometió NO hacer.
       *
       * Se materializa la fila si el documento existe en el catálogo (aunque
       * inactivo) y el JSON dice algo distinto de «pendiente»: un pendiente sin
       * más no es información, es la ausencia de ella.
       */
      var rescatado = doc2RescatarRequisitoHeredado_(expedienteId, item, contexto);
      if (rescatado) {
        porCodigo[String(item.id)] = rescatado;
        requisito = rescatado;
        heredados++;
      } else {
        continue;
      }
    }

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

  return { actualizados: actualizados, prorrogas: prorrogas, heredados: heredados };
}

/**
 * Crea la fila de un requisito RETIRADO que el libro sí tenía registrado.
 *
 * Devuelve la fila creada, o `null` si no hay nada que rescatar: el documento
 * no existe ni siquiera inactivo en el catálogo, o el libro lo tenía en
 * «pendiente», que no es un dato que valga la pena conservar.
 *
 * La fila nace con la subsección «Requisito heredado» para que la vista del
 * expediente pueda agruparla aparte y decir en voz alta de dónde viene, en vez
 * de mezclarla con los dieciséis vigentes y hacer creer que se sigue pidiendo.
 */
function doc2RescatarRequisitoHeredado_(expedienteId, item, ctx) {
  var contexto = ctx || doc2CtxActual_();
  var codigo = String((item && item.id) || '');
  if (!codigo) return null;

  var def = doc2CatalogoItem_(codigo);
  if (!def) return null;

  /*
   * ¿Hay algo que valga la pena conservar?
   *
   * Tres cosas cuentan como información, y la tercera es la que se me pasó
   * primero: una PRÓRROGA. Un `cert-trabajo` en «pendiente» no dice nada, pero un
   * `cert-trabajo` en «pendiente CON un plazo concedido hasta el 31 de diciembre»
   * es una decisión que alguien tomó y que hay que poder auditar. Descartarlo por
   * mirar solo el estado habría perdido justo el dato que costó una gestión.
   */
  var estado = doc2EstadoDesdeHeredado_(item.status);
  var tieneObservacion = String(item.observation || '').trim() !== '';
  var tieneProrroga = String(item.prorroga || '').trim() !== '';
  if (estado === DOC2_ESTADO_DOCUMENTO.PENDIENTE && !tieneObservacion && !tieneProrroga) return null;

  var id = doc2StableId_('expdoc', expedienteId + '|' + codigo);
  // Idempotencia: si una ejecución anterior ya la creó, se reutiliza.
  var existente = doc2Get_(DOC2_SHEET.EXPEDIENTE_DOCS, id);
  if (existente) return existente;

  doc2Insert_(DOC2_SHEET.EXPEDIENTE_DOCS, {
    expediente_documento_id: id,
    expediente_id: expedienteId,
    codigo_documento: codigo,
    version_catalogo: docInt_(def.version_catalogo, DOC2_CATALOGO_VERSION),
    seccion: def.seccion || 'generales',
    subseccion: 'Requisito heredado (ya no se exige)',
    grupo: def.grupo || 'personal',
    orden: docInt_(def.orden, 900),
    estado_documental: DOC2_ESTADO_DOCUMENTO.PENDIENTE,
    observaciones: '',
    obligatorio: false,
    permite_no_aplica: true,
    permite_prorroga: def.permite_prorroga === true,
    tipo_funcionario: def.tipo_funcionario || '',
    tipo_garantia: def.tipo_garantia || '',
    estado_revision: DOC2_ESTADO_REVISION.SIN_REVISION,
    revision_actual_id: '',
    aprobacion_actual_id: '',
    version_registro: 1
  }, contexto);

  doc2Historial_({
    expedienteId: expedienteId, entidadTipo: 'expediente_documento', entidadId: id,
    campo: 'aplicabilidad', anterior: '', nuevo: 'requisito heredado conservado',
    motivo: 'El libro tenía este requisito registrado y el catálogo vigente ya no lo exige.',
    actor: contexto.actor
  });

  return doc2GetOrFail_(DOC2_SHEET.EXPEDIENTE_DOCS, id, 'el requisito heredado');
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
/* Migración 7: clave de comparación del carnet                                */
/* ========================================================================== */

/**
 * Recalcula `identificador_normalizado` con la regla vigente.
 *
 * ── Por qué hace falta ─────────────────────────────────────────────────────
 * Desde que el campo admite el carnet tal como está en el documento, la clave de
 * comparación descarta TODA la puntuación: sin eso, «9.876.543» y «9876543» eran
 * dos personas distintas para el módulo y el informe mensual contaba dos
 * incorporaciones donde hubo una. Las filas escritas antes conservan la clave
 * antigua, y esta migración las pone al día.
 *
 * ── Por qué la unicidad NO depende de esta migración ───────────────────────
 * `doc2BuscarPorIdentificador_` recalcula la clave desde el texto ORIGINAL, que
 * es inmutable, en vez de fiarse de la columna. Así la detección de duplicados
 * funciona correctamente aunque nadie haya ejecutado esto todavía. Lo que la
 * migración arregla es lo que SÍ lee la columna: los filtros y el orden.
 *
 * ── Las colisiones se REPORTAN, no se fusionan ────────────────────────────
 * Puede que dos expedientes que antes eran distintos ahora tengan la misma
 * clave: «1234567» y «1.234.567». Fusionarlos automáticamente sería decidir que
 * son la misma persona, y eso no lo puede decidir una migración —pueden ser dos
 * carnets legítimamente parecidos, o un error de tecleo que hay que corregir a
 * mano. Se dejan los dos, se deja la clave nueva en los dos, y se devuelven en
 * `colisiones` para que una persona los mire.
 */
function doc2MigracionIdentificadores_(ctx, opciones) {
  var contexto = ctx || doc2CtxActual_();
  var o = opciones || {};
  var simular = o.simular === true;
  var lote = docInt_(o.lote, DOC2_LIMITS.LOTE_MIGRACION);
  var desde = Math.max(docInt_(o.desde, 0), 0);

  var filas = [];
  try { filas = doc2All_(DOC2_SHEET.EXPEDIENTES, true); } catch (e) { filas = []; }

  // Índice de claves nuevas para detectar colisiones. Se construye entero antes
  // de tocar nada: en un recorrido por lotes, una colisión puede estar entre un
  // expediente de este lote y otro del siguiente.
  var porClave = {};
  var colisiones = [];
  for (var i = 0; i < filas.length; i++) {
    var clave = doc2NormalizarIdentificador_(filas[i].identificador);
    if (!clave) continue;
    if (porClave[clave]) {
      colisiones.push({
        clave: clave,
        expedientes: [
          { expedienteId: porClave[clave].expediente_id, identificador: porClave[clave].identificador, nombre: porClave[clave].nombre },
          { expedienteId: filas[i].expediente_id, identificador: filas[i].identificador, nombre: filas[i].nombre }
        ]
      });
    } else {
      porClave[clave] = filas[i];
    }
  }

  var porCambiar = [];
  for (var c = 0; c < filas.length; c++) {
    var nueva = doc2NormalizarIdentificador_(filas[c].identificador);
    if (!nueva) continue;
    if (String(filas[c].identificador_normalizado || '') === nueva) continue;
    porCambiar.push(filas[c]);
  }

  if (simular) {
    return {
      quedan: false, filas: 0,
      detalle: {
        expedientes: filas.length,
        porActualizar: porCambiar.length,
        colisiones: colisiones,
        ejemplos: porCambiar.slice(0, 5).map(function (f) {
          return { identificador: f.identificador, antes: f.identificador_normalizado, despues: doc2NormalizarIdentificador_(f.identificador) };
        })
      },
      resumen: 'Se actualizaría la clave de ' + porCambiar.length + ' de ' + filas.length + ' expediente(s)' +
        (colisiones.length ? (' y quedarían ' + colisiones.length + ' pareja(s) con la MISMA clave, que hay que revisar a mano') : '') +
        '. Ningún carnet se modifica: solo su clave de comparación.'
    };
  }

  var procesados = 0;
  var actualizados = 0;
  var indice = desde;
  while (indice < porCambiar.length && procesados < lote) {
    var fila = porCambiar[indice];
    indice++;
    procesados++;
    try {
      doc2Update_(DOC2_SHEET.EXPEDIENTES, fila.expediente_id, {
        identificador_normalizado: doc2NormalizarIdentificador_(fila.identificador)
      }, contexto);
      actualizados++;
    } catch (error) {
      docWarn_('No se pudo actualizar la clave de un expediente.', {
        expediente: fila.expediente_id, motivo: docClassify_(error).message
      });
    }
  }

  return {
    quedan: indice < porCambiar.length,
    siguiente: indice,
    filas: actualizados,
    detalle: { actualizados: actualizados, colisiones: colisiones },
    resumen: actualizados + ' clave(s) de carnet puesta(s) al día' +
      (colisiones.length ? ('. ATENCIÓN: ' + colisiones.length + ' pareja(s) de expedientes comparten ahora la misma clave y hay que revisarlas a mano (ninguno se fusionó)') : '') + '.'
  };
}

/* ========================================================================== */
/* Migración 5: columnas de presentación y conteo de hojas                     */
/* ========================================================================== */

/**
 * Añade las columnas que introduce el esquema 5, sin tocar un solo dato.
 *
 *   · `ExpedienteDocumentos`: `subseccion` y `hojas_fisicas`;
 *   · `Expedientes`: `total_hojas_fisicas` y `total_documentos_fisicos`;
 *   · `CatalogoDocumentos`: `subseccion`, `subgrupo`, `presentacion_fisica`,
 *     `presentacion_digital` y `requiere_conteo_hojas`;
 *   · `Auxiliar`: la cabecera `cargo_bdp`.
 *
 * ── Por qué es tan corta ────────────────────────────────────────────────────
 * Porque `doc2EnsureSheets_` ya sabe hacer exactamente esto: compara las columnas
 * declaradas con las que hay, AÑADE las que faltan al final y no reordena ni
 * borra nada. Escribir aquí una segunda implementación del mismo recorrido sería
 * duplicar la parte peligrosa del código para no reutilizarla.
 *
 * Es idempotente por construcción: la segunda ejecución no encuentra columnas que
 * falten y no hace nada. Y no necesita lotes, porque no recorre registros: toca
 * cabeceras. La reconstrucción de los totales la hace la migración siguiente, que
 * sí va por lotes.
 */
function doc2MigracionHojasFisicas_(ctx, opciones) {
  var o = opciones || {};
  var hojasTocadas = [
    DOC2_SHEET.EXPEDIENTES,
    DOC2_SHEET.EXPEDIENTE_DOCS,
    DOC2_SHEET.CATALOGO
  ];

  if (o.simular === true) {
    var ss = docSpreadsheet_();
    var porCrear = [];
    var porAñadir = [];
    for (var i = 0; i < hojasTocadas.length; i++) {
      var hoja = ss.getSheetByName(hojasTocadas[i]);
      if (!hoja) { porCrear.push(hojasTocadas[i]); continue; }
      var estado = docInspectSheet_(hoja, docColumnNames_(hojasTocadas[i]));
      for (var c = 0; c < estado.columnasFaltantes.length; c++) {
        porAñadir.push(hojasTocadas[i] + '.' + estado.columnasFaltantes[c]);
      }
    }
    var auxiliar = ss.getSheetByName(DOC2_SHEET.AUXILIAR);
    var faltaCargo = !auxiliar || doc2ColumnaAuxiliar_(auxiliar, 'cargo_bdp') < 0;
    if (faltaCargo) porAñadir.push(DOC2_SHEET.AUXILIAR + '.cargo_bdp');
    return {
      quedan: false, filas: 0,
      detalle: { hojasPorCrear: porCrear, columnasPorAñadir: porAñadir },
      resumen: porAñadir.length || porCrear.length
        ? ('Se añadirían ' + porAñadir.length + ' columna(s)' +
           (porCrear.length ? (' y se crearían ' + porCrear.length + ' hoja(s)') : '') + '. Ningún dato se modifica.')
        : 'Las columnas nuevas ya existen. No haría nada.'
    };
  }

  var acciones = doc2EnsureSheets_({ silencioso: true });
  return {
    quedan: false, filas: acciones.length,
    detalle: { acciones: acciones },
    resumen: acciones.length
      ? (acciones.length + ' hoja(s) con columnas nuevas. Los datos existentes no se tocaron.')
      : 'Sin cambios: las columnas ya estaban.'
  };
}

/* ========================================================================== */
/* Migración 6: catálogo versión 3                                             */
/* ========================================================================== */

/**
 * Publica el catálogo versión 3 y reconstruye lo que depende de él.
 *
 * Tres cosas, en este orden y por una razón:
 *
 *   1. **sembrar el catálogo**: renombra los generales al texto del área, declara
 *      la forma de presentación y las subsecciones, crea
 *      `djj-prohibiciones-cumplimiento` y retira `cert-trabajo` y `rc-iva`;
 *   2. **sembrar `cargo_bdp`** con los cargos que ya hay en los expedientes, para
 *      que el desplegable no nazca vacío;
 *   3. **resincronizar los expedientes ABIERTOS**, por lotes: materializa la
 *      subsección en cada requisito y recalcula los totales de hojas.
 *
 * ── Qué NO hace, y es la parte importante ──────────────────────────────────
 * No borra requisitos. No cambia un solo estado documental ni una observación. No
 * degrada nada resuelto: `doc2SincronizarRequisitos_` conserva los requisitos que
 * ya tienen datos aunque hayan dejado de aplicar (los dos generales retirados,
 * justamente), y `doc2RecalcularExpediente_` respeta los estados que son decisión
 * humana (`APROBADO`, `ARCHIVADO`…).
 *
 * Los expedientes archivados o eliminados se saltan: resincronizarlos los
 * reabriría a efectos de cálculo y no hay ninguna necesidad de tocarlos.
 */
function doc2MigracionCatalogoV3_(ctx, opciones) {
  var contexto = ctx || doc2CtxActual_();
  var o = opciones || {};
  var simular = o.simular === true;
  var lote = docInt_(o.lote, DOC2_LIMITS.LOTE_MIGRACION);
  var desde = Math.max(docInt_(o.desde, 0), 0);

  var expedientes = [];
  try { expedientes = doc2All_(DOC2_SHEET.EXPEDIENTES, true); } catch (e) { expedientes = []; }
  var abiertos = [];
  for (var i = 0; i < expedientes.length; i++) {
    var estado = String(expedientes[i].estado_expediente || '');
    if (estado === DOC2_ESTADO_EXPEDIENTE.ARCHIVADO || estado === DOC2_ESTADO_EXPEDIENTE.ELIMINADO_LOGICO) continue;
    abiertos.push(expedientes[i]);
  }

  if (simular) {
    var enCatalogo = 0;
    try { enCatalogo = doc2Catalogo_(true).length; } catch (e) { enCatalogo = 0; }
    return {
      quedan: false, filas: 0,
      detalle: {
        catalogoActual: enCatalogo,
        catalogoObjetivo: DOC2_CATALOGO_SEMILLA.length,
        versionObjetivo: DOC2_CATALOGO_VERSION,
        expedientesPorResincronizar: abiertos.length,
        retirados: ['cert-trabajo', 'rc-iva'],
        nuevos: ['djj-prohibiciones-cumplimiento']
      },
      resumen: 'Se publicaría el catálogo v' + DOC2_CATALOGO_VERSION + ' (' + DOC2_CATALOGO_SEMILLA.length +
        ' filas: 1 requisito nuevo, 2 retirados sin borrar) y se resincronizarían ' + abiertos.length +
        ' expediente(s) abiertos. Ningún estado documental cambia.'
    };
  }

  var catalogo = null;
  var auxiliares = null;
  // La siembra solo hace falta en el primer lote: es una operación de una vez y
  // repetirla en cada reanudación gastaría minutos del presupuesto de ejecución.
  if (desde === 0) {
    catalogo = doc2SeedCatalogo_(contexto);
    doc2CatalogoReset_();
    doc2CacheInvalidar_();
    auxiliares = doc2SeedAuxiliares_();
    doc2EspejoCatalogoHeredado_();
  }

  var procesados = 0;
  var resincronizados = 0;
  var conservados = 0;
  var fallos = [];
  var indice = desde;

  while (indice < abiertos.length && procesados < lote) {
    var fila = abiertos[indice];
    indice++;
    procesados++;
    try {
      var sinc = doc2SincronizarRequisitos_(fila.expediente_id, contexto, { silencioso: true });
      conservados += sinc.conservados.length;
      doc2RecalcularExpediente_(fila.expediente_id, contexto);
      resincronizados++;
    } catch (error) {
      fallos.push({ expediente: fila.expediente_id, motivo: docClassify_(error).message });
    }
  }

  var quedan = indice < abiertos.length;
  return {
    quedan: quedan,
    siguiente: indice,
    filas: resincronizados,
    detalle: {
      catalogo: catalogo,
      auxiliares: auxiliares,
      resincronizados: resincronizados,
      requisitosConservados: conservados,
      fallos: fallos
    },
    resumen: (catalogo ? ('Catálogo v' + DOC2_CATALOGO_VERSION + ': ' + catalogo.creados + ' creado(s), ' +
      catalogo.actualizados + ' actualizado(s), ' + catalogo.retirados + ' retirado(s). ') : '') +
      resincronizados + ' expediente(s) resincronizado(s)' +
      (conservados ? (', ' + conservados + ' requisito(s) heredado(s) conservado(s)') : '') +
      (fallos.length ? (', ' + fallos.length + ' con error') : '') + '.'
  };
}

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
