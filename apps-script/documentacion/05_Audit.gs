/**
 * 05_Audit.gs - la bitacora del modulo.
 *
 * -- Por que se audita campo por campo -----------------------------------
 * Una linea que diga "expediente editado" no sirve para nada. Cuando hay que
 * averiguar por que un documento figura como presentado si nadie lo recibio, lo
 * que se necesita saber es: que campo cambio, de que valor a que valor, cuando y
 * quien. Por eso una sola edicion puede generar varias lineas de auditoria, una
 * por campo modificado, y no una sola linea generica.
 *
 * -- Que se registra ------------------------------------------------------
 * Altas, bajas, ediciones, aperturas de expediente, envios de aviso,
 * importaciones, respaldos, restauraciones, reparaciones y errores. Las
 * aperturas se registran porque el area necesita poder demostrar quien consulto
 * un expediente con datos personales, no solo quien lo modifico.
 *
 * -- Que NO tumba nunca una operacion -------------------------------------
 * La auditoria. Si la hoja de auditoria falla, el dato principal ya se guardo y
 * perderlo por no poder anotarlo seria absurdo. Todo aqui va protegido y, como
 * mucho, deja un aviso en la respuesta.
 */

/** Acciones reconocidas. El frontend las traduce a lenguaje humano. */
var DOC_ACCION = {
  ALTA: 'expediente.alta',
  EDICION: 'expediente.edicion',
  BAJA: 'expediente.baja',
  APERTURA: 'expediente.apertura',
  DOCUMENTO: 'documento.cambio',
  AVISO: 'aviso.envio',
  IMPORTACION: 'datos.importacion',
  EXPORTACION: 'datos.exportacion',
  RESPALDO: 'sistema.respaldo',
  RESTAURACION: 'sistema.restauracion',
  INSTALACION: 'sistema.instalacion',
  REPARACION: 'sistema.reparacion',
  MANTENIMIENTO: 'sistema.mantenimiento',
  CONFIGURACION: 'sistema.configuracion',
  ERROR: 'sistema.error'
};

/**
 * Escribe una linea de auditoria.
 *
 * Devuelve el identificador de la linea, o cadena vacia si no se pudo anotar.
 * Nunca lanza.
 */
function docAudit_(evento) {
  try {
    var e = evento || {};
    var id = docUid_('aud');
    docPut_(DOC_SHEET.AUDITORIA, {
      id: id,
      momento: docNow_(),
      accion: docRaw_(e.accion || '', 120),
      entidad: docRaw_(e.entidad || 'expediente', 60),
      referencia: docRaw_(e.referencia || '', 200),
      expediente: docRaw_(e.expediente || '', 200),
      persona: docText_(e.persona || '', 300),
      anio: docInt_(e.anio, 0),
      resultado: docRaw_(e.resultado || 'ok', 40),
      actor: docText_(e.actor || 'desconocido', 240),
      origen: docRaw_(e.origen || 'web', 40),
      campo: docRaw_(e.campo || '', 120),
      valor_anterior: docText_(docShorten_(e.anterior), 2000),
      valor_nuevo: docText_(docShorten_(e.nuevo), 2000),
      detalle_json: e.detalle || null,
      traza: docTraceId_(),
      ms: docElapsedMs_()
    });
    docCount_('auditoria');
    return id;
  } catch (error) {
    docWarn_('No se pudo escribir la auditoria.', { motivo: docClassify_(error).message });
    return '';
  }
}

/** Recorta un valor para que quepa en la celda de auditoria sin romperla. */
function docShorten_(valor) {
  if (valor === null || valor === undefined) return '';
  var texto = typeof valor === 'string' ? valor : docWriteJson_(valor);
  if (texto.length <= 1800) return texto;
  return texto.slice(0, 1790) + ' [...]';
}

/* --------------------------- Comparacion de estados ----------------------- */

/** Campos de cabecera cuyo cambio interesa registrar. */
var DOC_CAMPOS_AUDITABLES = [
  'nombre', 'tipo_empleado', 'responsable', 'fecha_ingreso', 'cargo', 'oficina',
  'gerencia', 'observacion', 'proceso', 'correo', 'estado', 'prorroga_hasta'
];

/**
 * Compara el expediente anterior con el nuevo y anota una linea por diferencia.
 *
 * Se comparan dos cosas: la cabecera (nombre, cargo, oficina...) y el estado de
 * cada documento del checklist. Un cambio de "pendiente" a "presentado" en un
 * documento concreto es justo el tipo de evento que despues hay que poder
 * rastrear, asi que va con su propia linea y el nombre legible del documento.
 */
function docAuditDiff_(anterior, nuevo, contexto) {
  var ctx = contexto || {};
  var lineas = 0;

  for (var c = 0; c < DOC_CAMPOS_AUDITABLES.length; c++) {
    var campo = DOC_CAMPOS_AUDITABLES[c];
    var antes = anterior ? anterior[campo] : '';
    var despues = nuevo ? nuevo[campo] : '';
    if (String(antes === null || antes === undefined ? '' : antes) ===
        String(despues === null || despues === undefined ? '' : despues)) continue;
    docAudit_({
      accion: DOC_ACCION.EDICION,
      entidad: 'expediente',
      referencia: ctx.id || '',
      expediente: ctx.id || '',
      persona: ctx.nombre || '',
      anio: ctx.anio || 0,
      actor: ctx.actor || '',
      origen: ctx.origen || 'web',
      campo: campo,
      anterior: antes,
      nuevo: despues
    });
    lineas++;
  }

  var itemsAntes = docItemsMap_(anterior);
  var itemsDespues = docItemsMap_(nuevo);
  for (var id in itemsDespues) {
    if (!Object.prototype.hasOwnProperty.call(itemsDespues, id)) continue;
    var a = itemsAntes[id];
    var d = itemsDespues[id];
    var firmaAntes = a ? docItemSignature_(a) : '';
    var firmaDespues = docItemSignature_(d);
    if (firmaAntes === firmaDespues) continue;
    docAudit_({
      accion: DOC_ACCION.DOCUMENTO,
      entidad: 'documento',
      referencia: id,
      expediente: ctx.id || '',
      persona: ctx.nombre || '',
      anio: ctx.anio || 0,
      actor: ctx.actor || '',
      origen: ctx.origen || 'web',
      campo: d.label || id,
      anterior: firmaAntes,
      nuevo: firmaDespues
    });
    lineas++;
  }

  for (var idViejo in itemsAntes) {
    if (!Object.prototype.hasOwnProperty.call(itemsAntes, idViejo)) continue;
    if (itemsDespues[idViejo]) continue;
    docAudit_({
      accion: DOC_ACCION.DOCUMENTO,
      entidad: 'documento',
      referencia: idViejo,
      expediente: ctx.id || '',
      persona: ctx.nombre || '',
      anio: ctx.anio || 0,
      actor: ctx.actor || '',
      origen: ctx.origen || 'web',
      campo: itemsAntes[idViejo].label || idViejo,
      anterior: docItemSignature_(itemsAntes[idViejo]),
      nuevo: 'documento retirado del expediente'
    });
    lineas++;
  }

  return lineas;
}

/** Indexa los documentos de un expediente por su identificador. */
function docItemsMap_(dossier) {
  var out = {};
  if (!dossier) return out;
  var lista = dossier.items || [];
  for (var i = 0; i < lista.length; i++) {
    if (lista[i] && lista[i].id) out[lista[i].id] = lista[i];
  }
  return out;
}

/** Resumen legible del estado de un documento, para el antes y el despues. */
function docItemSignature_(item) {
  if (!item) return '';
  var partes = [String(item.status || 'pendiente')];
  var paginas = docInt_(item.pages, 0);
  if (paginas > 0) partes.push(paginas + ' pag.');
  if (item.prorroga) partes.push('prorroga ' + item.prorroga);
  if (item.observation) partes.push('obs: ' + String(item.observation).slice(0, 160));
  return partes.join(' | ');
}

/* -------------------------------- Consultas ------------------------------- */

/**
 * Consulta la auditoria con filtros.
 *
 * Se recorre de la linea mas reciente hacia atras y se corta al alcanzar el
 * limite: quien mira una bitacora quiere lo ultimo, y recorrer veinte mil filas
 * para devolver cincuenta seria tirar el tiempo.
 */
function docAuditQuery_(filtros) {
  var f = filtros || {};
  var limite = Math.min(Math.max(docInt_(f.limite, 100), 1), 1000);
  var filas = docAll_(DOC_SHEET.AUDITORIA);
  var out = [];

  var desde = f.desde ? String(f.desde) : '';
  var hasta = f.hasta ? String(f.hasta) : '';
  var expediente = f.expediente ? String(f.expediente) : '';
  var accion = f.accion ? String(f.accion) : '';
  var actor = f.actor ? docKey_(f.actor) : '';
  var anio = docInt_(f.anio, 0);
  var texto = f.texto ? docKey_(f.texto) : '';

  for (var i = filas.length - 1; i >= 0 && out.length < limite; i--) {
    var fila = filas[i];
    if (expediente && String(fila.expediente) !== expediente) continue;
    if (accion && String(fila.accion).indexOf(accion) !== 0) continue;
    if (anio && docInt_(fila.anio, 0) !== anio) continue;
    if (actor && docKey_(fila.actor).indexOf(actor) < 0) continue;
    if (desde && String(fila.momento) < desde) continue;
    if (hasta && String(fila.momento) > hasta) continue;
    if (texto) {
      var heno = docKey_([fila.persona, fila.campo, fila.valor_anterior, fila.valor_nuevo, fila.accion].join(' '));
      if (heno.indexOf(texto) < 0) continue;
    }
    out.push({
      id: fila.id,
      momento: fila.momento,
      accion: fila.accion,
      entidad: fila.entidad,
      referencia: fila.referencia,
      expediente: fila.expediente,
      persona: fila.persona,
      anio: docInt_(fila.anio, 0),
      resultado: fila.resultado,
      actor: fila.actor,
      origen: fila.origen,
      campo: fila.campo,
      anterior: fila.valor_anterior,
      nuevo: fila.valor_nuevo,
      detalle: fila.detalle_json,
      ms: docInt_(fila.ms, 0)
    });
  }
  return { total: filas.length, devueltos: out.length, eventos: out };
}

/**
 * Metricas agregadas de la bitacora.
 *
 * Sirven para la vista de actividad del frontend: quien ha trabajado, sobre que
 * y con que intensidad, sin tener que descargar veinte mil lineas al navegador.
 */
function docAuditMetrics_(dias) {
  var ventana = Math.min(Math.max(docInt_(dias, 30), 1), 365);
  var limite = new Date(Date.now() - ventana * 86400000).toISOString();
  var filas = docAll_(DOC_SHEET.AUDITORIA);

  var porAccion = {};
  var porActor = {};
  var porDia = {};
  var porExpediente = {};
  var errores = 0;
  var considerados = 0;

  for (var i = 0; i < filas.length; i++) {
    var fila = filas[i];
    if (String(fila.momento) < limite) continue;
    considerados++;
    var accion = String(fila.accion || 'desconocida');
    porAccion[accion] = (porAccion[accion] || 0) + 1;
    var actor = String(fila.actor || 'desconocido');
    porActor[actor] = (porActor[actor] || 0) + 1;
    var dia = String(fila.momento).slice(0, 10);
    porDia[dia] = (porDia[dia] || 0) + 1;
    if (fila.expediente) porExpediente[String(fila.expediente)] = (porExpediente[String(fila.expediente)] || 0) + 1;
    if (String(fila.resultado) === 'error') errores++;
  }

  return {
    ventanaDias: ventana,
    totalHistorico: filas.length,
    eventos: considerados,
    errores: errores,
    porAccion: porAccion,
    porActor: porActor,
    porDia: porDia,
    expedientesMasActivos: docTopEntries_(porExpediente, 10)
  };
}

/** Las N entradas con mas ocurrencias de un mapa clave->conteo. */
function docTopEntries_(mapa, n) {
  var pares = [];
  for (var k in mapa) {
    if (Object.prototype.hasOwnProperty.call(mapa, k)) pares.push({ clave: k, total: mapa[k] });
  }
  pares.sort(function (a, b) { return b.total - a.total; });
  return pares.slice(0, n);
}
