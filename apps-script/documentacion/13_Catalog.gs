/**
 * 13_Catalog.gs — catálogo único de documentos y motor de aplicabilidad.
 *
 * ── Por qué el catálogo tiene que ser uno ────────────────────────────────────
 * En la versión anterior la lista de documentos vivía en tres sitios: el
 * `DOC_TEMPLATE` del frontend, la semilla `DOC_CATALOGO_SEMILLA` del backend y la
 * hoja `_CATALOGO`. Tres copias significa que añadir un requisito exige tres
 * cambios coordinados y que, el día que alguien se olvide de uno, el formulario
 * pide un documento que el reporte no cuenta.
 *
 * Aquí hay una sola fuente lógica: la hoja `CatalogoDocumentos`. La semilla del
 * código solo se usa para crearla la primera vez y para volver a poner en pie un
 * libro nuevo. A partir de ahí manda la hoja, y el frontend la recibe por la
 * acción `documentacion.catalogo`.
 *
 * ── Qué es el motor de aplicabilidad ────────────────────────────────────────
 * La pregunta «qué documentos le tocan a esta persona» tiene una respuesta que
 * depende del tipo de funcionario, del tipo de garantía, de la vigencia del
 * requisito y de si el requisito está activo. Ese cálculo estaba repartido entre
 * el formulario (que decidía qué grupos sembrar) y el informe (que decidía qué
 * contaba para el porcentaje), con criterios que no siempre coincidían. Ahora es
 * una función pura, `doc2Aplicables_`, y el formulario, la validación, la vista,
 * los reportes y las exportaciones preguntan a la misma.
 */

/* ========================================================================== */
/* Semilla y espejo                                                            */
/* ========================================================================== */

/**
 * Siembra el catálogo con los 38 documentos canónicos.
 *
 * Respeta lo que ya esté escrito: si el área editó el nombre visible de un
 * requisito o lo desactivó, la semilla no lo pisa. Solo añade los que falten.
 *
 * Cuando existe la hoja heredada `_CATALOGO` con ediciones del equipo, esas
 * ediciones se importan (etiqueta, obligatoriedad, prórroga, orden y actividad):
 * son decisiones humanas y perderlas al migrar sería el peor resultado posible.
 */
function doc2SeedCatalogo_(contexto) {
  var ctx = contexto || {};
  var heredado = doc2LeerCatalogoHeredado_();
  var creados = 0;
  var actualizados = 0;

  for (var i = 0; i < DOC2_CATALOGO_SEMILLA.length; i++) {
    var def = DOC2_CATALOGO_SEMILLA[i];
    var existente = docById_(DOC2_SHEET.CATALOGO, def.codigo);
    var legado = heredado[def.codigo] || null;

    var fila = {
      codigo_documento: def.codigo,
      nombre_visible: doc2Texto_((legado && legado.etiqueta) || def.nombre, 300),
      descripcion: doc2TextoLargo_(def.descripcion || '', DOC2_LIMITS.MAX_TEXTO_MEDIO),
      texto_observacion: doc2TextoLargo_(def.observacion || '', DOC2_LIMITS.MAX_TEXTO_MEDIO),
      seccion: def.seccion,
      grupo: def.grupo,
      orden: legado && legado.orden ? docInt_(legado.orden, (i + 1) * 10) : (i + 1) * 10,
      obligatorio: legado && legado.obligatorio !== null && legado.obligatorio !== undefined
        ? legado.obligatorio === true
        : def.obligatorio === true,
      estados_permitidos: doc2EstadosPermitidosPara_(def),
      permite_no_aplica: def.noAplica === true || def.obligatorio !== true,
      permite_prorroga: legado && legado.prorroga !== null && legado.prorroga !== undefined
        ? legado.prorroga === true
        : def.prorroga === true,
      tipo_funcionario: (def.funcionario || []).join(','),
      tipo_garantia: (def.garantia || []).join(','),
      nivel_confidencialidad: def.confidencial || 'INTERNO',
      requiere_revision: def.revision === true,
      requiere_aprobacion: def.aprobacion === true,
      activo: legado && legado.activo === false ? false : true,
      version_catalogo: DOC2_CATALOGO_VERSION,
      fecha_inicio_vigencia: '',
      fecha_fin_vigencia: '',
      columna_libro: def.columna || ''
    };

    if (!existente) {
      doc2Insert_(DOC2_SHEET.CATALOGO, fila, ctx);
      creados++;
    } else if (docInt_(existente.version_catalogo, 0) < DOC2_CATALOGO_VERSION) {
      // Actualización de versión de catálogo: se refrescan los metadatos
      // estructurales (sección, aplicabilidad, orden) y se conserva lo editable.
      doc2Update_(DOC2_SHEET.CATALOGO, def.codigo, {
        seccion: fila.seccion,
        grupo: fila.grupo,
        tipo_funcionario: fila.tipo_funcionario,
        tipo_garantia: fila.tipo_garantia,
        estados_permitidos: fila.estados_permitidos,
        requiere_revision: fila.requiere_revision,
        requiere_aprobacion: fila.requiere_aprobacion,
        version_catalogo: DOC2_CATALOGO_VERSION
      }, ctx);
      actualizados++;
    }
  }

  if (creados || actualizados) {
    doc2CacheInvalidar_([DOC2_CACHE.CATALOGO]);
    docInfo_('Catálogo normalizado sembrado.', { creados: creados, actualizados: actualizados });
  }
  return { creados: creados, actualizados: actualizados };
}

/** Estados documentales admitidos por un requisito, como texto. */
function doc2EstadosPermitidosPara_(def) {
  var estados = [DOC2_ESTADO_DOCUMENTO.PENDIENTE, DOC2_ESTADO_DOCUMENTO.ENTREGADO, DOC2_ESTADO_DOCUMENTO.NO_ENTREGADO];
  if (def.noAplica === true || def.obligatorio !== true) estados.push(DOC2_ESTADO_DOCUMENTO.NO_APLICA);
  return estados.join(',');
}

/** Lee la hoja heredada `_CATALOGO` sin fallar si no existe. */
function doc2LeerCatalogoHeredado_() {
  var salida = {};
  try {
    var filas = docAll_(DOC_SHEET.CATALOGO);
    for (var i = 0; i < filas.length; i++) {
      if (!filas[i].id) continue;
      salida[String(filas[i].id)] = {
        etiqueta: filas[i].etiqueta,
        orden: filas[i].orden,
        obligatorio: filas[i].obligatorio,
        prorroga: filas[i].permite_prorroga,
        activo: filas[i].activo
      };
    }
  } catch (e) {
    salida = {};
  }
  return salida;
}

/**
 * Refleja el catálogo en la hoja heredada `_CATALOGO`.
 *
 * El espejo es DERIVADO, nunca fuente: se reescribe desde `CatalogoDocumentos`
 * para que las acciones antiguas (`configuracion.obtener`, `catalogo.guardar`)
 * sigan devolviendo lo que devolvían. Así no hay dos catálogos editables, que es
 * exactamente el problema que este archivo viene a resolver.
 */
function doc2EspejoCatalogoHeredado_() {
  var escritos = 0;
  var previo = DOC_STORE.allowCreate;
  try {
    // La hoja heredada puede no existir si el libro se instaló solo con el modelo
    // normalizado. Se autoriza crearla: es parte del contrato antiguo que este
    // módulo prometió no romper.
    DOC_STORE.allowCreate = true;
    var filas = doc2Catalogo_(true);
    for (var i = 0; i < filas.length; i++) {
      var c = filas[i];
      docPut_(DOC_SHEET.CATALOGO, {
        id: c.codigo_documento,
        etiqueta: c.nombre_visible,
        grupo: c.grupo,
        orden: docInt_(c.orden, (i + 1) * 10),
        columna_libro: c.columna_libro || '',
        permite_prorroga: c.permite_prorroga === true,
        obligatorio: c.obligatorio === true,
        activo: c.activo === true
      });
      escritos++;
    }
  } catch (e) {
    docWarn_('No se pudo actualizar el espejo del catálogo heredado.', { motivo: docClassify_(e).message });
  } finally {
    DOC_STORE.allowCreate = previo;
  }
  return escritos;
}

/* ========================================================================== */
/* Lectura del catálogo                                                        */
/* ========================================================================== */

/** Caché por petición: el catálogo se consulta muchas veces por operación. */
var DOC2_CATALOGO_MEM = null;

function doc2CatalogoReset_() {
  DOC2_CATALOGO_MEM = null;
}

/**
 * Catálogo completo, ordenado por sección y orden.
 *
 * `incluirInactivos` solo lo usan la administración del catálogo y el espejo: el
 * resto del sistema no debería ver requisitos desactivados, porque volvería a
 * pedirlos.
 */
function doc2Catalogo_(incluirInactivos) {
  var clave = incluirInactivos ? 'todos' : 'activos';
  if (DOC2_CATALOGO_MEM && DOC2_CATALOGO_MEM[clave]) return DOC2_CATALOGO_MEM[clave];

  var filas = docAll_(DOC2_SHEET.CATALOGO);
  var ordenSeccion = {};
  for (var s = 0; s < DOC2_SECCIONES.length; s++) ordenSeccion[DOC2_SECCIONES[s].codigo] = DOC2_SECCIONES[s].orden;

  var salida = [];
  for (var i = 0; i < filas.length; i++) {
    var fila = filas[i];
    if (!fila.codigo_documento) continue;
    if (!incluirInactivos && fila.activo !== true) continue;
    salida.push(fila);
  }
  salida.sort(function (a, b) {
    var sa = ordenSeccion[a.seccion] || 99;
    var sb = ordenSeccion[b.seccion] || 99;
    if (sa !== sb) return sa - sb;
    var oa = docInt_(a.orden, 999);
    var ob = docInt_(b.orden, 999);
    if (oa !== ob) return oa - ob;
    return String(a.codigo_documento) > String(b.codigo_documento) ? 1 : -1;
  });

  if (!DOC2_CATALOGO_MEM) DOC2_CATALOGO_MEM = {};
  DOC2_CATALOGO_MEM[clave] = salida;
  return salida;
}

/** Una definición del catálogo por su código. */
function doc2CatalogoItem_(codigo) {
  var lista = doc2Catalogo_(true);
  for (var i = 0; i < lista.length; i++) {
    if (String(lista[i].codigo_documento) === String(codigo)) return lista[i];
  }
  return null;
}

/**
 * Guarda cambios en el catálogo.
 *
 * Solo se pueden tocar los campos editables por el área: nombre visible,
 * descripción, texto de observación, orden, obligatoriedad, prórroga, no aplica,
 * revisión, aprobación, vigencia y actividad. La sección y la aplicabilidad son
 * estructura del proceso y se cambian con una versión nueva del catálogo, no
 * desde un formulario, porque cambiarlas altera qué requisitos existen en
 * expedientes ya creados.
 */
function doc2CatalogoGuardar_(lista, contexto) {
  var ctx = contexto || {};
  var entrada = lista || [];
  var guardados = 0;
  var creados = 0;
  var rechazados = [];

  for (var i = 0; i < entrada.length; i++) {
    var d = entrada[i] || {};
    var codigo = docRaw_(d.codigo_documento || d.codigo || d.id || '', 120);
    if (!codigo) {
      rechazados.push({ indice: i, motivo: 'Sin código de documento.' });
      continue;
    }
    var existente = docById_(DOC2_SHEET.CATALOGO, codigo);
    var patch = {
      nombre_visible: doc2Texto_(d.nombre_visible || d.nombre || (existente && existente.nombre_visible) || codigo, 300),
      descripcion: doc2TextoLargo_(d.descripcion !== undefined ? d.descripcion : (existente && existente.descripcion) || '', DOC2_LIMITS.MAX_TEXTO_MEDIO),
      texto_observacion: doc2TextoLargo_(d.texto_observacion !== undefined ? d.texto_observacion : (existente && existente.texto_observacion) || '', DOC2_LIMITS.MAX_TEXTO_MEDIO),
      orden: docInt_(d.orden, existente ? docInt_(existente.orden, (i + 1) * 10) : (i + 1) * 10),
      obligatorio: d.obligatorio === undefined ? (existente ? existente.obligatorio === true : true) : doc2Bool_(d.obligatorio),
      permite_no_aplica: d.permite_no_aplica === undefined ? (existente ? existente.permite_no_aplica === true : true) : doc2Bool_(d.permite_no_aplica),
      permite_prorroga: d.permite_prorroga === undefined ? (existente ? existente.permite_prorroga === true : false) : doc2Bool_(d.permite_prorroga),
      requiere_revision: d.requiere_revision === undefined ? (existente ? existente.requiere_revision === true : false) : doc2Bool_(d.requiere_revision),
      requiere_aprobacion: d.requiere_aprobacion === undefined ? (existente ? existente.requiere_aprobacion === true : false) : doc2Bool_(d.requiere_aprobacion),
      nivel_confidencialidad: doc2Enum_(d.nivel_confidencialidad || (existente && existente.nivel_confidencialidad) || 'INTERNO', ['PUBLICO', 'INTERNO', 'CONFIDENCIAL', 'RESERVADO'], 'INTERNO'),
      fecha_inicio_vigencia: doc2ValidarFecha_(d.fecha_inicio_vigencia !== undefined ? d.fecha_inicio_vigencia : (existente && existente.fecha_inicio_vigencia) || '', 'fecha_inicio_vigencia'),
      fecha_fin_vigencia: doc2ValidarFecha_(d.fecha_fin_vigencia !== undefined ? d.fecha_fin_vigencia : (existente && existente.fecha_fin_vigencia) || '', 'fecha_fin_vigencia'),
      activo: d.activo === undefined ? (existente ? existente.activo === true : true) : doc2Bool_(d.activo)
    };

    if (patch.fecha_inicio_vigencia && patch.fecha_fin_vigencia && patch.fecha_fin_vigencia < patch.fecha_inicio_vigencia) {
      rechazados.push({ codigo: codigo, motivo: 'La vigencia termina antes de empezar.' });
      continue;
    }

    if (existente) {
      var antes = {};
      for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) antes[k] = existente[k];
      doc2Update_(DOC2_SHEET.CATALOGO, codigo, patch, ctx);
      doc2DiffHistorial_('catalogo', codigo, antes, patch, { actor: ctx.actor, motivo: 'Edición del catálogo' });
      guardados++;
    } else {
      // Requisito nuevo definido por el área: entra como general aplicable a
      // todos, que es lo único que se puede deducir sin más información.
      patch.codigo_documento = codigo;
      patch.seccion = doc2Enum_(d.seccion, ['generales', 'garantia', 'cumplimiento'], 'generales');
      patch.grupo = doc2Enum_(d.grupo, ['personal', 'garantia', 'cumplimiento'], 'personal');
      patch.tipo_funcionario = doc2Lista_(d.tipo_funcionario).join(',');
      patch.tipo_garantia = doc2Lista_(d.tipo_garantia).join(',');
      patch.estados_permitidos = [DOC2_ESTADO_DOCUMENTO.PENDIENTE, DOC2_ESTADO_DOCUMENTO.ENTREGADO, DOC2_ESTADO_DOCUMENTO.NO_ENTREGADO, DOC2_ESTADO_DOCUMENTO.NO_APLICA].join(',');
      patch.version_catalogo = DOC2_CATALOGO_VERSION;
      patch.columna_libro = docRaw_(d.columna_libro || '', 120);
      doc2Insert_(DOC2_SHEET.CATALOGO, patch, ctx);
      doc2Historial_({
        entidadTipo: 'catalogo', entidadId: codigo, campo: 'catalogo',
        anterior: '', nuevo: 'requisito creado', actor: ctx.actor
      });
      creados++;
    }
  }

  doc2CatalogoReset_();
  doc2CacheInvalidar_([DOC2_CACHE.CATALOGO, DOC2_CACHE.PANEL]);
  doc2EspejoCatalogoHeredado_();

  doc2Audit_({
    tipo: 'catalogo.guardado', entidadTipo: 'catalogo', actor: ctx.actor, origen: ctx.origen,
    resultado: rechazados.length ? 'parcial' : 'ok',
    metadata: { guardados: guardados, creados: creados, rechazados: rechazados.length }
  });

  return { guardados: guardados, creados: creados, rechazados: rechazados, catalogo: doc2Catalogo_(true) };
}

/* ========================================================================== */
/* Motor de aplicabilidad                                                      */
/* ========================================================================== */

/**
 * ¿Está habilitada la rama de este tipo de funcionario?
 *
 * `EJECUTIVO` y `DIRECTORIO` existen en el vocabulario pero no tienen requisitos
 * definidos. Se rechaza al crear el expediente con un error explicativo en lugar
 * de crear uno vacío que nadie sabría completar.
 */
function doc2RamaHabilitada_(tipoFuncionario) {
  var tipo = doc2TipoFuncionario_(tipoFuncionario);
  return !!(tipo && tipo.activo);
}

function doc2ExigirRamaHabilitada_(tipoFuncionario) {
  var tipo = doc2TipoFuncionario_(tipoFuncionario);
  if (!tipo) {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'El tipo de funcionario "' + tipoFuncionario + '" no existe.', {
      hint: 'Elige uno de la lista.',
      details: { fields: doc2Campo_('tipo_funcionario', 'Tipo de funcionario no reconocido.') }
    });
  }
  if (!tipo.activo) {
    throw docError_(DOC2_CODE.RAMA_DESHABILITADA,
      'La rama "' + tipo.etiqueta + '" está en construcción.',
      {
        hint: 'Su lista de requisitos todavía no está definida. Registra el expediente con otro tipo o espera la definición del área.',
        details: { fields: doc2Campo_('tipo_funcionario', 'Rama en construcción.'), tipo: tipo.codigo }
      });
  }
  return tipo;
}

/**
 * Requisitos aplicables a un expediente.
 *
 * Reglas, en este orden:
 *
 *   1. el requisito tiene que estar activo;
 *   2. tiene que estar vigente en la fecha de referencia;
 *   3. si declara tipos de funcionario, el del expediente tiene que estar;
 *   4. si declara tipos de garantía, el del expediente tiene que estar;
 *   5. las excepciones autorizadas se descartan al final.
 *
 * Devuelve las definiciones en el orden en que se muestran, para que el
 * formulario, la vista, el reporte y la exportación coincidan sin ponerse de
 * acuerdo.
 */
function doc2Aplicables_(opciones) {
  var o = opciones || {};
  var tipoFuncionario = docKey_(o.tipoFuncionario || 'GENERAL');
  var tipoGarantia = docKey_(o.tipoGarantia || 'NINGUNA').replace(/[ \-]/g, '_');
  var referencia = docDateOnly_(o.fecha) || doc2Hoy_();
  var excluir = {};
  var listaExcluir = o.excluir || [];
  for (var e = 0; e < listaExcluir.length; e++) excluir[String(listaExcluir[e])] = true;

  var catalogo = doc2Catalogo_(false);
  var salida = [];

  for (var i = 0; i < catalogo.length; i++) {
    var def = catalogo[i];
    if (excluir[String(def.codigo_documento)]) continue;

    if (def.fecha_inicio_vigencia && String(def.fecha_inicio_vigencia) > referencia) continue;
    if (def.fecha_fin_vigencia && String(def.fecha_fin_vigencia) < referencia) continue;

    var funcionarios = doc2Lista_(def.tipo_funcionario);
    if (funcionarios.length && funcionarios.indexOf(tipoFuncionario) < 0) continue;

    var garantias = doc2Lista_(def.tipo_garantia);
    if (garantias.length && garantias.indexOf(tipoGarantia) < 0) continue;

    salida.push(def);
  }

  return salida;
}

/**
 * Resumen de lo que exige cada rama, para la pantalla de configuración.
 *
 * Es la forma de comprobar de un vistazo que Comercial Tipo 3 pide cuatro
 * documentos de garantía y Auditoría uno de cumplimiento, sin tener que crear un
 * expediente de prueba por rama.
 */
function doc2MapaAplicabilidad_() {
  var salida = [];
  for (var f = 0; f < DOC2_TIPO_FUNCIONARIO.length; f++) {
    var tipo = DOC2_TIPO_FUNCIONARIO[f];
    var garantias = tipo.codigo === 'COMERCIAL'
      ? ['COMERCIAL_1', 'COMERCIAL_2', 'COMERCIAL_3']
      : ['NINGUNA'];
    for (var g = 0; g < garantias.length; g++) {
      if (!tipo.activo) {
        salida.push({
          tipoFuncionario: tipo.codigo, etiqueta: tipo.etiqueta, tipoGarantia: garantias[g],
          habilitada: false, total: 0, obligatorios: 0, codigos: [], nota: tipo.descripcion
        });
        continue;
      }
      var aplicables = doc2Aplicables_({ tipoFuncionario: tipo.codigo, tipoGarantia: garantias[g] });
      var codigos = [];
      var obligatorios = 0;
      for (var i = 0; i < aplicables.length; i++) {
        codigos.push(aplicables[i].codigo_documento);
        if (aplicables[i].obligatorio === true) obligatorios++;
      }
      salida.push({
        tipoFuncionario: tipo.codigo,
        etiqueta: tipo.etiqueta,
        tipoGarantia: garantias[g],
        habilitada: true,
        total: aplicables.length,
        obligatorios: obligatorios,
        codigos: codigos,
        nota: ''
      });
    }
  }
  return salida;
}

/**
 * Catálogo listo para el frontend, con el vocabulario y los catálogos auxiliares.
 *
 * Va en una sola respuesta a propósito: el formulario necesita las cuatro cosas
 * para pintarse y pedirlas por separado son cuatro viajes de red para abrir una
 * pantalla.
 */
function doc2CatalogoParaCliente_() {
  var enCache = docCacheGet_(DOC2_CACHE.CATALOGO);
  if (enCache) {
    var parseado = docParseJson_(enCache, null);
    if (parseado) return parseado;
  }

  var catalogo = doc2Catalogo_(true);
  var items = [];
  for (var i = 0; i < catalogo.length; i++) {
    var c = catalogo[i];
    items.push({
      codigo: c.codigo_documento,
      nombre: c.nombre_visible,
      descripcion: c.descripcion || '',
      textoObservacion: c.texto_observacion || '',
      seccion: c.seccion,
      grupo: c.grupo,
      orden: docInt_(c.orden, 0),
      obligatorio: c.obligatorio === true,
      estadosPermitidos: doc2Lista_(c.estados_permitidos),
      permiteNoAplica: c.permite_no_aplica === true,
      permiteProrroga: c.permite_prorroga === true,
      tipoFuncionario: doc2Lista_(c.tipo_funcionario),
      tipoGarantia: doc2Lista_(c.tipo_garantia),
      confidencialidad: c.nivel_confidencialidad || 'INTERNO',
      requiereRevision: c.requiere_revision === true,
      requiereAprobacion: c.requiere_aprobacion === true,
      activo: c.activo === true,
      versionCatalogo: docInt_(c.version_catalogo, DOC2_CATALOGO_VERSION),
      vigenciaDesde: c.fecha_inicio_vigencia || '',
      vigenciaHasta: c.fecha_fin_vigencia || '',
      columnaLibro: c.columna_libro || ''
    });
  }

  var salida = {
    version: DOC2_CATALOGO_VERSION,
    esquema: DOC2_SCHEMA_VERSION,
    documentos: items,
    vocabulario: doc2Vocabulario_(),
    auxiliares: doc2Auxiliares_(),
    aplicabilidad: doc2MapaAplicabilidad_()
  };

  docCachePut_(DOC2_CACHE.CATALOGO, docWriteJson_(salida), DOC2_LIMITS.CACHE_CATALOGO_SEG);
  return salida;
}

/* ========================================================================== */
/* Catálogos auxiliares: siembra y mantenimiento                                */
/* ========================================================================== */

/**
 * Siembra `agencia_bdp` y `gerencia_bdp` con lo que ya existe en el libro.
 *
 * Las agencias no se inventan: se recogen de las columnas `Oficina` y `Gerencia`
 * de las pestañas anuales, que llevan años acumulando los valores reales que usa
 * el área. Solo si no hay ninguna gerencia se usa la semilla del código.
 */
function doc2SeedAuxiliares_() {
  doc2EnsureAuxiliar_();
  var agencias = [];
  var gerencias = [];
  var vistoA = {};
  var vistoG = {};

  var anios = [];
  try { anios = docListYears_(); } catch (e) { anios = []; }
  for (var a = 0; a < anios.length; a++) {
    var cargada = null;
    try { cargada = docLoadYear_(anios[a], false); } catch (e) { cargada = null; }
    if (!cargada) continue;
    for (var r = 0; r < cargada.rows.length; r++) {
      var oficina = String(cargada.rows[r].oficina || '').replace(/\s+/g, ' ').trim();
      var gerencia = String(cargada.rows[r].gerencia || '').replace(/\s+/g, ' ').trim();
      if (oficina && !vistoA[docKey_(oficina)]) { vistoA[docKey_(oficina)] = true; agencias.push(oficina); }
      if (gerencia && !vistoG[docKey_(gerencia)]) { vistoG[docKey_(gerencia)] = true; gerencias.push(gerencia); }
    }
  }

  // Y de los expedientes normalizados, que pueden traer valores nuevos.
  try {
    var expedientes = doc2All_(DOC2_SHEET.EXPEDIENTES, true);
    for (var e = 0; e < expedientes.length; e++) {
      var ag = String(expedientes[e].agencia || '').replace(/\s+/g, ' ').trim();
      var ge = String(expedientes[e].gerencia || '').replace(/\s+/g, ' ').trim();
      if (ag && !vistoA[docKey_(ag)]) { vistoA[docKey_(ag)] = true; agencias.push(ag); }
      if (ge && !vistoG[docKey_(ge)]) { vistoG[docKey_(ge)] = true; gerencias.push(ge); }
    }
  } catch (err) { /* todavía sin expedientes normalizados */ }

  var actuales = doc2Auxiliares_();
  if (!gerencias.length && !actuales.gerencia_bdp.length) gerencias = DOC2_GERENCIA_SEMILLA.slice();

  var rAg = doc2AgregarAuxiliar_('agencia_bdp', agencias);
  var rGe = doc2AgregarAuxiliar_('gerencia_bdp', gerencias);

  return {
    agencias: { agregadas: rAg.agregados.length, total: rAg.total },
    gerencias: { agregadas: rGe.agregados.length, total: rGe.total }
  };
}

/**
 * Revisión de los catálogos auxiliares.
 *
 * Informa de duplicados por clave normalizada y de valores con espacios
 * invisibles. No corrige nada: fusionar «LA PAZ» con «La Paz » cambia el texto
 * que la persona escribió, y esa decisión es suya.
 */
function doc2DiagnosticarAuxiliar_() {
  var salida = { columnas: [], duplicados: [], sospechosos: [] };
  var ss = docSpreadsheet_();
  var hoja = ss.getSheetByName(DOC2_SHEET.AUXILIAR);
  if (!hoja) {
    salida.falta = true;
    return salida;
  }
  for (var c = 0; c < DOC2_AUXILIAR_COLUMNS.length; c++) {
    var columna = DOC2_AUXILIAR_COLUMNS[c];
    var crudos = doc2LeerAuxiliarCrudo_(columna);
    var vistos = {};
    for (var i = 0; i < crudos.length; i++) {
      var texto = crudos[i];
      if (!String(texto).trim()) continue;
      var clave = docKey_(texto);
      if (vistos[clave]) {
        salida.duplicados.push({ columna: columna, valor: texto, coincideCon: vistos[clave] });
      } else {
        vistos[clave] = texto;
      }
      if (/^\s|\s$|\u00a0|\s{2,}/.test(String(texto))) {
        salida.sospechosos.push({ columna: columna, valor: texto, motivo: 'Espacios invisibles o dobles.' });
      }
    }
    salida.columnas.push({ columna: columna, valores: crudos.length });
  }
  return salida;
}

/** Valores de un catálogo auxiliar TAL CUAL están escritos, sin deduplicar. */
function doc2LeerAuxiliarCrudo_(columna) {
  var ss = docSpreadsheet_();
  var hoja = ss.getSheetByName(DOC2_SHEET.AUXILIAR);
  if (!hoja) return [];
  var ancho = hoja.getLastColumn();
  if (ancho < 1) return [];
  var cabeceras = hoja.getRange(1, 1, 1, ancho).getValues()[0];
  var indice = -1;
  for (var i = 0; i < cabeceras.length; i++) {
    if (String(cabeceras[i] || '').trim() === columna) { indice = i + 1; break; }
  }
  if (indice < 0) return [];
  var filas = hoja.getLastRow();
  if (filas < 2) return [];
  var valores = hoja.getRange(2, indice, filas - 1, 1).getValues();
  var out = [];
  for (var r = 0; r < valores.length; r++) {
    var texto = docUntext_(valores[r][0]);
    if (String(texto).trim()) out.push(texto);
  }
  return out;
}

/**
 * ¿Está esta agencia o gerencia en el catálogo?
 *
 * Devuelve `true` cuando coincide, y también cuando el catálogo está vacío: un
 * catálogo sin poblar no puede bloquear el registro de un expediente. El
 * diagnóstico avisa de los valores fuera de catálogo; la creación no se detiene
 * por ello, porque el trabajo real no puede esperar a que alguien mantenga una
 * lista.
 */
function doc2EnCatalogoAuxiliar_(columna, valor) {
  var texto = String(valor || '').trim();
  if (!texto) return true;
  var lista = doc2Auxiliares_()[columna] || [];
  if (!lista.length) return true;
  var clave = docKey_(texto);
  for (var i = 0; i < lista.length; i++) {
    if (docKey_(lista[i]) === clave) return true;
  }
  return false;
}
