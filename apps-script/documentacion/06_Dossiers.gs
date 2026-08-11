/**
 * 06_Dossiers.gs - alta, consulta, edicion y baja de expedientes.
 *
 * -- El identificador --------------------------------------------------------
 * El frontend usa como clave el campo `identificador`, que el area escribe con
 * el formato "CI - numero de proceso - anio". Aqui se conserva tal cual en la
 * columna ID EXPEDIENTE. No se genera uno sintetico ni se normaliza: es la clave
 * que la persona reconoce y con la que busca.
 *
 * -- Las filas historicas ----------------------------------------------------
 * Las cuatro pestanas traen mas de novecientas filas escritas a mano, sin
 * identificador. Se leen igual y se les asigna una clave derivada del nombre
 * (ver `docLegacyId_`). Cuando alguien da de alta a una persona que ya estaba en
 * esa lista, el sistema reconoce la coincidencia por nombre y ACTUALIZA su fila
 * en lugar de crear una duplicada. Sin eso, el primer dia de uso el libro
 * tendria a media plantilla dos veces.
 */

/* ------------------------------ Metricas ---------------------------------- */

/**
 * Avance y estado de salud de un expediente.
 *
 * Mismo criterio que usa la interfaz en `src/lib/docReport.ts`, replicado aqui
 * para que las columnas del libro digan lo mismo que la pantalla. Los documentos
 * marcados "no aplica" salen del denominador: exigir un titulo legalizado a
 * quien no lo necesita distorsionaria el porcentaje de todo el equipo.
 */
function docComputeReport_(dossier, cadenciaDias) {
  var items = (dossier && dossier.items) || [];
  var aplicables = 0;
  var presentados = 0;
  var observados = 0;
  var pendientes = 0;
  var paginas = 0;
  var faltantes = [];
  var prorrogaMax = '';

  for (var i = 0; i < items.length; i++) {
    var item = items[i] || {};
    var estado = String(item.status || 'pendiente');
    paginas += docInt_(item.pages, 0);
    if (item.prorroga && String(item.prorroga) > prorrogaMax) prorrogaMax = String(item.prorroga);
    if (estado === 'no_aplica') continue;
    aplicables++;
    if (estado === 'presentado') presentados++;
    else if (estado === 'observado') { observados++; faltantes.push(item.label || item.id); }
    else { pendientes++; faltantes.push(item.label || item.id); }
  }

  var avance = aplicables > 0 ? Math.round((presentados / aplicables) * 100) : 100;
  var dias = docDaysSince_(dossier && dossier.fechaIngreso);
  var cadencia = Math.max(docInt_(cadenciaDias, 3), 1);

  var estadoSalud;
  if (avance >= 100) estadoSalud = 'completo';
  else if (dias <= cadencia * 2) estadoSalud = 'al_dia';
  else if (avance >= 50 || dias <= cadencia * 6) estadoSalud = 'en_proceso';
  else estadoSalud = 'atrasado';

  // Una prorroga vigente suspende el atraso: el plazo esta concedido por escrito.
  if (estadoSalud === 'atrasado' && prorrogaMax && prorrogaMax >= docFormatDate_(new Date())) {
    estadoSalud = 'en_proceso';
  }

  return {
    aplicables: aplicables,
    presentados: presentados,
    observados: observados,
    pendientes: pendientes,
    paginas: paginas,
    avance: avance,
    estado: estadoSalud,
    diasDesdeIngreso: dias,
    faltantes: faltantes,
    prorrogaHasta: prorrogaMax
  };
}

/** Dias transcurridos desde una fecha. Cero si no hay fecha o es futura. */
function docDaysSince_(fecha) {
  var solo = docDateOnly_(fecha);
  if (!solo) return 0;
  var d = new Date(solo + 'T00:00:00Z');
  if (isNaN(d.getTime())) return 0;
  var diff = Date.now() - d.getTime();
  return diff <= 0 ? 0 : Math.floor(diff / 86400000);
}

/* --------------------- Expediente <-> fila de la pestana ------------------ */

/**
 * Convierte un expediente en la fila que le corresponde en el libro.
 *
 * Las columnas de documentos se derivan del checklist salvo que haya un valor
 * escrito a mano, que siempre gana (ver `docSheetValuesFor_`).
 */
function docRowFromDossier_(dossier, actor, anterior) {
  var cadencia = docInt_(docConfigGet_('cadencia_dias', '3'), 3);
  var informe = docComputeReport_(dossier, cadencia);
  var derivadas = docSheetValuesFor_(dossier);

  var fila = {
    id: String(dossier.identificador || ''),
    nombre: docText_(dossier.nombre || '', 400),
    tipo_empleado: docText_(dossier.tipoEmpleado || (anterior && anterior.tipo_empleado) || '', 80),
    responsable: docText_(dossier.responsable || (anterior && anterior.responsable) || '', 160),
    fecha_ingreso: docDateOnly_(dossier.fechaIngreso),
    cargo: docText_(dossier.cargo || '', 300),
    oficina: docText_(dossier.agencia || '', 200),
    gerencia: docText_(dossier.gerencia || '', 200),
    observacion: docText_(dossier.observacion || (anterior && anterior.observacion) || '', 4000),
    proceso: informe.avance >= 100 ? 'COMPLETO' : 'FALTA',

    correo: docText_(dossier.correo || '', 200),
    avance: informe.avance,
    presentados: informe.presentados,
    pendientes: informe.pendientes,
    observados: informe.observados,
    paginas: informe.paginas,
    estado: informe.estado,
    prorroga_hasta: informe.prorrogaHasta,
    ultimo_aviso: docLastEmailAt_(dossier),
    avisos: (dossier.emailLog || []).length,
    detalle_json: docWriteJson_(docCleanDossier_(dossier)),
    creado_en: (anterior && anterior.creado_en) || dossier.createdAt || docNow_(),
    actualizado_en: docNow_(),
    actualizado_por: docText_(actor || 'web', 200)
  };

  for (var clave in derivadas) {
    if (Object.prototype.hasOwnProperty.call(derivadas, clave)) fila[clave] = derivadas[clave];
  }

  fila.huella = docHash_([
    fila.nombre, fila.cargo, fila.oficina, fila.gerencia, fila.fecha_ingreso,
    fila.avance, fila.presentados, fila.observados, fila.estado
  ].join('|'));

  return fila;
}

/** Fecha del ultimo aviso enviado, o cadena vacia. */
function docLastEmailAt_(dossier) {
  var log = (dossier && dossier.emailLog) || [];
  var ultimo = '';
  for (var i = 0; i < log.length; i++) {
    var at = String((log[i] && log[i].at) || '');
    if (at > ultimo) ultimo = at;
  }
  return ultimo;
}

/**
 * Deja el expediente listo para guardarse como JSON.
 *
 * Se recortan las observaciones muy largas y el historial de avisos a los
 * cincuenta ultimos: la columna tiene un techo de cincuenta mil caracteres y un
 * expediente con dos anios de recordatorios lo alcanzaria.
 */
function docCleanDossier_(dossier) {
  var d = dossier || {};
  var items = [];
  var origen = d.items || [];
  for (var i = 0; i < origen.length; i++) {
    var it = origen[i] || {};
    var limpio = {
      id: String(it.id || ''),
      label: docRaw_(it.label || '', 300),
      group: String(it.group || 'personal'),
      status: docEnum_(it.status, ['pendiente', 'presentado', 'observado', 'no_aplica'], 'pendiente'),
      pages: docInt_(it.pages, 0)
    };
    if (it.observation) limpio.observation = docRaw_(it.observation, 1200);
    if (it.prorroga) limpio.prorroga = docDateOnly_(it.prorroga);
    if (it.allowProrroga) limpio.allowProrroga = true;
    if (it.fileName) limpio.fileName = docRaw_(it.fileName, 300);
    items.push(limpio);
  }

  var log = (d.emailLog || []).slice(-50);
  var avisos = [];
  for (var e = 0; e < log.length; e++) {
    var ev = log[e] || {};
    avisos.push({
      id: String(ev.id || ''),
      at: String(ev.at || ''),
      to: docRaw_(ev.to || '', 300),
      cc: docRaw_(ev.cc || '', 300),
      subject: docRaw_(ev.subject || '', 300),
      kind: ev.kind === 'auto' ? 'auto' : 'manual',
      missingCount: docInt_(ev.missingCount, 0)
    });
  }

  return {
    identificador: String(d.identificador || ''),
    nombre: docRaw_(d.nombre || '', 400),
    cargo: docRaw_(d.cargo || '', 300),
    agencia: docRaw_(d.agencia || '', 200),
    gerencia: docRaw_(d.gerencia || '', 200),
    correo: docRaw_(d.correo || '', 200),
    fechaIngreso: docDateOnly_(d.fechaIngreso),
    createdAt: String(d.createdAt || docNow_()),
    tipoEmpleado: docRaw_(d.tipoEmpleado || '', 80),
    responsable: docRaw_(d.responsable || '', 160),
    observacion: docRaw_(d.observacion || '', 4000),
    sheet: d.sheet || {},
    items: items,
    emailLog: avisos
  };
}

/**
 * Reconstruye el expediente a partir de una fila.
 *
 * Si la columna DETALLE JSON tiene contenido, manda ese contenido y las columnas
 * de cabecera solo completan lo que falte: alguien pudo corregir el cargo en
 * Sheets despues del ultimo guardado desde la web.
 *
 * Si no hay JSON -las filas historicas- se reconstruye lo que se puede desde las
 * columnas del libro. El expediente sale sin checklist detallado, pero con su
 * cabecera completa y sus columnas de documentos, que es justo lo que esas filas
 * tienen.
 */
function docDossierFromRow_(fila) {
  var detalle = fila.detalle_json;
  if (typeof detalle === 'string') detalle = docParseJson_(detalle, null);
  var base = detalle || {};

  var dossier = {
    identificador: String(fila.id || base.identificador || ''),
    nombre: fila.nombre || base.nombre || '',
    cargo: fila.cargo || base.cargo || '',
    agencia: fila.oficina || base.agencia || '',
    gerencia: fila.gerencia || base.gerencia || '',
    correo: fila.correo || base.correo || '',
    fechaIngreso: fila.fecha_ingreso || base.fechaIngreso || '',
    createdAt: fila.creado_en || base.createdAt || '',
    tipoEmpleado: fila.tipo_empleado || base.tipoEmpleado || '',
    responsable: fila.responsable || base.responsable || '',
    observacion: fila.observacion || base.observacion || '',
    sheet: base.sheet || {},
    items: base.items || [],
    emailLog: base.emailLog || [],
    anio: fila.__anio || docYearOf_(fila.fecha_ingreso),
    heredada: !!fila.__heredada,
    actualizadoEn: fila.actualizado_en || '',
    actualizadoPor: fila.actualizado_por || ''
  };

  // Las columnas del libro se devuelven siempre: son lo que la persona ve.
  var docs = docDocumentColumns_();
  var columnas = {};
  for (var i = 0; i < docs.length; i++) {
    columnas[docs[i].clave] = fila[docs[i].clave] || '';
  }
  dossier.columnas = columnas;

  dossier.resumen = {
    avance: docInt_(fila.avance, 0),
    presentados: docInt_(fila.presentados, 0),
    pendientes: docInt_(fila.pendientes, 0),
    observados: docInt_(fila.observados, 0),
    paginas: docInt_(fila.paginas, 0),
    estado: fila.estado || '',
    proceso: fila.proceso || ''
  };

  return dossier;
}

/* --------------------------------- Consultas ------------------------------ */

/**
 * Lista los expedientes de un anio, o de todos.
 *
 * `detalle: false` devuelve solo la cabecera y el resumen. La lista del frontend
 * no necesita los 31 documentos de cada persona para pintar las tarjetas, y
 * enviarlos multiplicaria por diez el tamano de la respuesta.
 */
function docListDossiers_(opciones) {
  var o = opciones || {};
  var anios = [];
  if (o.anio) {
    anios = [docInt_(o.anio, new Date().getFullYear())];
  } else if (o.todos) {
    anios = docListYears_();
  } else {
    anios = docListYears_().slice(0, 1);
  }

  var conDetalle = o.detalle === true;
  var texto = o.texto ? docKey_(o.texto) : '';
  var estado = o.estado ? String(o.estado) : '';
  var salida = [];
  var totalPorAnio = {};

  for (var a = 0; a < anios.length; a++) {
    var cargada = docLoadYear_(anios[a], false);
    if (!cargada) { totalPorAnio[anios[a]] = 0; continue; }
    totalPorAnio[anios[a]] = cargada.rows.length;
    for (var r = 0; r < cargada.rows.length; r++) {
      var fila = cargada.rows[r];
      if (estado && String(fila.estado) !== estado) continue;
      if (texto) {
        var heno = docKey_([fila.nombre, fila.cargo, fila.oficina, fila.gerencia, fila.id, fila.responsable].join(' '));
        if (heno.indexOf(texto) < 0) continue;
      }
      var dossier = docDossierFromRow_(fila);
      if (!conDetalle) {
        dossier.items = [];
        dossier.emailLog = [];
      }
      salida.push(dossier);
    }
  }

  return { anios: anios, totalPorAnio: totalPorAnio, total: salida.length, expedientes: salida };
}

/**
 * Busca un expediente por identificador.
 *
 * Si no se dice en que anio esta, se recorren todos empezando por el mas
 * reciente, que es donde casi siempre esta.
 */
function docFindDossierRow_(id, anio) {
  var buscado = String(id || '');
  if (!buscado) return null;
  var anios = anio ? [docInt_(anio, 0)] : docListYears_();
  for (var a = 0; a < anios.length; a++) {
    var cargada = docLoadYear_(anios[a], false);
    if (!cargada) continue;
    if (cargada.byId[buscado]) return cargada.byId[buscado];
  }
  return null;
}

/** Busca por nombre, para no duplicar a quien ya esta en las filas historicas. */
function docFindRowByName_(nombre, anio) {
  var clave = docKey_(nombre);
  if (!clave) return null;
  var cargada = docLoadYear_(anio, false);
  if (!cargada) return null;
  return cargada.byName[clave] || null;
}

/**
 * Devuelve un expediente completo y registra la consulta.
 *
 * La apertura se audita porque estos expedientes contienen cedulas, domicilios y
 * datos de garantes: saber quien los consulto forma parte de protegerlos.
 */
function docGetDossier_(id, anio, actor, origen) {
  var fila = docFindDossierRow_(id, anio);
  if (!fila) {
    throw docError_(DOC_CODE.NOT_FOUND,
      'No existe el expediente ' + id + '.',
      { hint: 'Revisa el identificador o sincroniza desde el modulo.', details: { id: id, anio: anio || null } });
  }
  var dossier = docDossierFromRow_(fila);
  docAudit_({
    accion: DOC_ACCION.APERTURA,
    entidad: 'expediente',
    referencia: dossier.identificador,
    expediente: dossier.identificador,
    persona: dossier.nombre,
    anio: dossier.anio,
    actor: actor,
    origen: origen || 'web'
  });
  return dossier;
}

/* --------------------------------- Escritura ------------------------------ */

/**
 * Da de alta o actualiza un expediente.
 *
 * El anio sale de la fecha de ingreso, no de la fecha de hoy: un alta cargada en
 * enero para alguien que entro en diciembre pertenece a la pestana del anio
 * anterior, que es donde la persona la va a buscar.
 */
function docUpsertDossier_(dossier, actor, origen) {
  if (!dossier || !dossier.identificador) {
    throw docError_(DOC_CODE.VALIDATION_ERROR,
      'El expediente llego sin identificador.',
      { hint: 'El identificador tiene el formato CI - numero de proceso - anio.', details: { campo: 'identificador' } });
  }
  if (!dossier.nombre) {
    throw docError_(DOC_CODE.VALIDATION_ERROR,
      'El expediente llego sin nombre.',
      { details: { campo: 'nombre' } });
  }

  var anio = docYearOf_(dossier.fechaIngreso);
  docEnsureYearSheet_(anio);

  var filaAnterior = docFindDossierRow_(dossier.identificador, anio);
  var reutilizada = false;

  // Sin coincidencia por identificador, se prueba por nombre en el mismo anio:
  // asi las filas escritas a mano se adoptan en lugar de duplicarse.
  if (!filaAnterior) {
    var porNombre = docFindRowByName_(dossier.nombre, anio);
    if (porNombre && porNombre.__heredada) {
      filaAnterior = porNombre;
      reutilizada = true;
    }
  }

  var dossierAnterior = filaAnterior ? docDossierFromRow_(filaAnterior) : null;
  var nuevaFila = docRowFromDossier_(dossier, actor, filaAnterior);

  // Al adoptar una fila historica hay que escribir sobre SU fila fisica.
  if (reutilizada && filaAnterior) {
    var cargada = docLoadYear_(anio, true);
    if (cargada && filaAnterior.__row) {
      delete cargada.byId[filaAnterior.id];
      filaAnterior.id = nuevaFila.id;
      cargada.byId[nuevaFila.id] = filaAnterior;
    }
  }

  docYearPut_(anio, nuevaFila);

  var contexto = {
    id: nuevaFila.id,
    nombre: nuevaFila.nombre,
    anio: anio,
    actor: actor,
    origen: origen || 'web'
  };

  if (dossierAnterior) {
    var cambios = docAuditDiff_(dossierAnterior, dossier, contexto);
    if (cambios === 0) {
      docAudit_({
        accion: DOC_ACCION.EDICION,
        referencia: nuevaFila.id, expediente: nuevaFila.id, persona: nuevaFila.nombre,
        anio: anio, actor: actor, origen: origen || 'web',
        campo: 'sin cambios', anterior: '', nuevo: 'guardado sin diferencias'
      });
    }
  } else {
    docAudit_({
      accion: DOC_ACCION.ALTA,
      referencia: nuevaFila.id, expediente: nuevaFila.id, persona: nuevaFila.nombre,
      anio: anio, actor: actor, origen: origen || 'web',
      detalle: { avance: nuevaFila.avance, documentos: (dossier.items || []).length }
    });
  }

  return {
    identificador: nuevaFila.id,
    anio: anio,
    creado: !dossierAnterior,
    adoptadaHistorica: reutilizada,
    resumen: {
      avance: nuevaFila.avance,
      presentados: nuevaFila.presentados,
      pendientes: nuevaFila.pendientes,
      observados: nuevaFila.observados,
      estado: nuevaFila.estado,
      proceso: nuevaFila.proceso
    }
  };
}

/** Baja de un expediente. Se audita con una copia del contenido borrado. */
function docDeleteDossier_(id, anio, actor, origen) {
  var fila = docFindDossierRow_(id, anio);
  if (!fila) {
    throw docError_(DOC_CODE.NOT_FOUND, 'No existe el expediente ' + id + '.', { details: { id: id } });
  }
  var copia = docDossierFromRow_(fila);
  var anioReal = fila.__anio || docYearOf_(fila.fecha_ingreso);
  var borrado = docYearDelete_(anioReal, fila.id);
  docAudit_({
    accion: DOC_ACCION.BAJA,
    referencia: fila.id, expediente: fila.id, persona: fila.nombre,
    anio: anioReal, actor: actor, origen: origen || 'web',
    anterior: docWriteJson_(copia), nuevo: ''
  });
  return { identificador: fila.id, anio: anioReal, borrado: borrado };
}

/**
 * Alta o actualizacion en bloque. Es la via de la importacion.
 *
 * No se detiene ante un expediente invalido: lo aparta con su motivo y sigue.
 * Al importar cien registros, que uno tenga la fecha mal no puede impedir que
 * entren los noventa y nueve buenos.
 */
function docBulkUpsert_(lista, actor, origen) {
  var entrada = lista || [];
  var creados = 0;
  var actualizados = 0;
  var adoptados = 0;
  var fallidos = [];

  for (var i = 0; i < entrada.length; i++) {
    try {
      var r = docUpsertDossier_(entrada[i], actor, origen || 'importacion');
      if (r.creado) creados++; else actualizados++;
      if (r.adoptadaHistorica) adoptados++;
    } catch (error) {
      var info = docClassify_(error);
      fallidos.push({
        identificador: (entrada[i] && entrada[i].identificador) || '(sin identificador)',
        nombre: (entrada[i] && entrada[i].nombre) || '',
        codigo: info.docCode,
        motivo: info.message
      });
    }
  }

  docAudit_({
    accion: DOC_ACCION.IMPORTACION,
    entidad: 'lote',
    actor: actor,
    origen: origen || 'importacion',
    resultado: fallidos.length ? 'parcial' : 'ok',
    detalle: { recibidos: entrada.length, creados: creados, actualizados: actualizados, adoptados: adoptados, fallidos: fallidos.length }
  });

  return {
    recibidos: entrada.length,
    creados: creados,
    actualizados: actualizados,
    adoptados: adoptados,
    fallidos: fallidos
  };
}

/** Registra el envio de un aviso y lo suma al historial del expediente. */
function docLogEmail_(id, evento, actor, origen) {
  var fila = docFindDossierRow_(id, null);
  if (!fila) {
    throw docError_(DOC_CODE.NOT_FOUND, 'No existe el expediente ' + id + '.', { details: { id: id } });
  }
  var dossier = docDossierFromRow_(fila);
  var ev = evento || {};
  var registro = {
    id: String(ev.id || docUid_('mail')),
    at: String(ev.at || docNow_()),
    to: docRaw_(ev.to || dossier.correo || '', 300),
    cc: docRaw_(ev.cc || '', 300),
    subject: docRaw_(ev.subject || '', 300),
    kind: ev.kind === 'auto' ? 'auto' : 'manual',
    missingCount: docInt_(ev.missingCount, 0)
  };
  dossier.emailLog = (dossier.emailLog || []).concat([registro]);

  var anio = fila.__anio || docYearOf_(fila.fecha_ingreso);
  var actualizada = docRowFromDossier_(dossier, actor, fila);
  docYearPut_(anio, actualizada);

  docAudit_({
    accion: DOC_ACCION.AVISO,
    entidad: 'aviso',
    referencia: registro.id,
    expediente: dossier.identificador,
    persona: dossier.nombre,
    anio: anio,
    actor: actor,
    origen: origen || 'web',
    campo: registro.kind === 'auto' ? 'aviso automatico' : 'aviso manual',
    nuevo: registro.to + ' | ' + registro.subject,
    detalle: { faltantes: registro.missingCount }
  });

  return { identificador: dossier.identificador, anio: anio, avisos: dossier.emailLog.length, evento: registro };
}
