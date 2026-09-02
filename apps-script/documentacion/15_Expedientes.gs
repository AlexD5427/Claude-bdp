/**
 * 15_Expedientes.gs — servicio de expedientes y requisitos.
 *
 * ── El centro del módulo ─────────────────────────────────────────────────────
 * Un expediente es una cabecera (quién, dónde, cuándo, qué rama) y un conjunto de
 * requisitos aplicables. Todo lo demás —solicitudes, revisiones, aprobaciones,
 * prórrogas, tareas, comentarios— cuelga de esos dos.
 *
 * ── Resúmenes materializados, y por qué ──────────────────────────────────────
 * `porcentaje_completitud`, `total_pendientes`, `proxima_fecha_critica` y sus
 * hermanos NO se calculan al leer: se recalculan al escribir y se guardan en la
 * fila del expediente. Es una desnormalización deliberada. La alternativa —
 * calcularlos al vuelo— obligaría a leer los requisitos de los 900 expedientes
 * para pintar el panel, que en Apps Script son varios minutos y una cuota
 * agotada. El precio es que un resumen puede quedar desfasado si alguien edita la
 * hoja a mano, y por eso existen `doc2RecalcularExpediente_`, el diagnóstico que
 * lo detecta y la reparación que lo corrige.
 *
 * ── Compatibilidad con el libro anual ────────────────────────────────────────
 * Cada escritura refleja el expediente en su pestaña `CONTROL INGRESOS <año>`
 * usando el mismo mapeador de la versión anterior. El acuerdo con el área sigue
 * en pie: quien quiera trabajar en Sheets, puede. El espejo se puede desactivar
 * con la clave `espejo_libro_anual`, pero viene encendido.
 */

/* ========================================================================== */
/* Alta                                                                        */
/* ========================================================================== */

/**
 * Crea un expediente con sus requisitos aplicables.
 *
 * ── Idempotencia ────────────────────────────────────────────────────────────
 * Además del `solicitudId` que ya protege el enrutador, el alta acepta una
 * `idempotencyKey` propia. Dos cosas distintas: el `solicitudId` evita repetir
 * UNA petición; la clave de creación evita crear DOS expedientes para la misma
 * persona desde dos pestañas del navegador. Si llega una clave ya usada, se
 * devuelve el expediente existente en lugar de un duplicado.
 */
function doc2CrearExpediente_(datos, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.EDITAR);

  var d = datos || {};
  doc2ExigirCampos_(d, ['identificador', 'nombre']);

  // El identificador es el CARNET DE IDENTIDAD tal como está en el documento: sin
  // formato impuesto. Hay carnets con letras de complemento («1234567-1A»), con
  // extensión de departamento, con puntos y con espacios; exigir un patrón solo
  // conseguía que quien registra lo escribiera «como sea» para poder continuar.
  // Lo único obligatorio es que quede algo al normalizarlo, porque de eso depende
  // la detección de duplicados.
  var identificador = doc2Texto_(d.identificador, 120);
  var normalizado = doc2NormalizarIdentificador_(identificador);
  if (!normalizado) {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'El carnet de identidad no puede quedar vacío.',
      {
        hint: 'Escríbelo como aparece en el documento; se admite cualquier formato.',
        details: { fields: doc2Campo_('identificador', 'Escribe el carnet de identidad.') }
      });
  }

  var tipoFuncionario = doc2Enum_(d.tipoFuncionario || d.tipo_funcionario || 'GENERAL',
    ['GENERAL', 'COMERCIAL', 'AUDITORIA', 'CUMPLIMIENTO', 'EJECUTIVO', 'DIRECTORIO'], 'GENERAL');
  doc2ExigirRamaHabilitada_(tipoFuncionario);

  var tipoGarantia = doc2Enum_(d.tipoGarantia || d.tipo_garantia || 'NINGUNA',
    ['NINGUNA', 'COMERCIAL_1', 'COMERCIAL_2', 'COMERCIAL_3'], 'NINGUNA');
  if (tipoFuncionario === 'COMERCIAL' && tipoGarantia === 'NINGUNA') {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'Un funcionario comercial necesita un tipo de garantía.',
      {
        hint: 'Elige Comercial Tipo 1, 2 o 3 según la garantía que presente.',
        details: { fields: doc2Campo_('tipo_garantia', 'Selecciona el tipo de garantía comercial.') }
      });
  }

  var fechaIngreso = doc2ValidarFecha_(d.fechaIngreso || d.fecha_ingreso, 'fecha_ingreso');
  var claveIdem = docRaw_(d.idempotencyKey || d.idempotency_key || contexto.requestId || '', 200);

  // ¿Ya existe? Por identificador normalizado o por clave de idempotencia.
  var existentePorClave = claveIdem ? doc2FirstBy_(DOC2_SHEET.EXPEDIENTES, 'idempotency_key_creacion', claveIdem) : null;
  if (existentePorClave) {
    return { expedienteId: existentePorClave.expediente_id, creado: false, repetido: true };
  }
  var existente = doc2BuscarPorIdentificador_(normalizado);
  if (existente) {
    // El error lleva los datos del expediente existente para que la interfaz
    // pueda ofrecer «abrirlo» en lugar de dejar a la persona con un formulario
    // lleno y un mensaje que no la lleva a ninguna parte.
    throw docError_(DOC_CODE.CONFLICT,
      'Ya existe un expediente con ese carnet: ' + (existente.nombre || existente.identificador) + '.',
      {
        hint: 'Ábrelo para seguir trabajando en él. Si de verdad son dos personas distintas, revisa el carnet.',
        details: {
          fields: doc2Campo_('identificador', 'Ya hay un expediente con este carnet.'),
          expedienteId: existente.expediente_id,
          duplicado: {
            expedienteId: existente.expediente_id,
            identificador: existente.identificador,
            nombre: existente.nombre || '',
            cargo: existente.cargo || '',
            agencia: existente.agencia || '',
            estado: existente.estado_expediente || '',
            fechaIngreso: existente.fecha_ingreso || ''
          }
        }
      });
  }

  var expedienteId = doc2StableId_('exp', normalizado);
  var fila = {
    expediente_id: expedienteId,
    identificador: identificador,
    identificador_normalizado: normalizado,
    nombre: doc2Texto_(d.nombre, 300),
    cargo: doc2Texto_(d.cargo || '', 300),
    agencia: doc2Texto_(d.agencia || d.oficina || '', 200),
    gerencia: doc2Texto_(d.gerencia || '', 200),
    fecha_ingreso: fechaIngreso,
    tipo_funcionario: tipoFuncionario,
    tipo_garantia: tipoGarantia,
    responsable_id: doc2Texto_(d.responsableId || d.responsable || contexto.actorId || '', 240),
    estado_expediente: DOC2_ESTADO_EXPEDIENTE.BORRADOR,
    porcentaje_completitud: 0,
    total_requisitos: 0,
    total_resueltos: 0,
    total_entregados: 0,
    total_pendientes: 0,
    total_no_entregados: 0,
    total_no_aplica: 0,
    total_observados: 0,
    total_hojas_fisicas: 0,
    total_documentos_fisicos: 0,
    total_prorrogas: 0,
    total_prorrogas_vencidas: 0,
    proxima_fecha_critica: '',
    version_registro: 1,
    estado_operacion: 'ACTIVO',
    idempotency_key_creacion: claveIdem
  };

  doc2Insert_(DOC2_SHEET.EXPEDIENTES, fila, contexto);
  var sincronizacion = doc2SincronizarRequisitos_(expedienteId, contexto, { silencioso: true });
  var resumen = doc2RecalcularExpediente_(expedienteId, contexto, { estadoInicial: DOC2_ESTADO_EXPEDIENTE.EN_RECOLECCION });

  // Los catálogos auxiliares aprenden de lo que se registra, sin borrar nada.
  if (fila.agencia) doc2AgregarAuxiliar_('agencia_bdp', [fila.agencia]);
  if (fila.gerencia) doc2AgregarAuxiliar_('gerencia_bdp', [fila.gerencia]);
  if (fila.cargo) doc2AgregarAuxiliar_('cargo_bdp', [fila.cargo]);

  doc2Historial_({
    expedienteId: expedienteId, entidadTipo: 'expediente', entidadId: expedienteId,
    campo: 'expediente', anterior: '', nuevo: 'expediente creado', actor: contexto.actor
  });
  doc2Audit_({
    tipo: DOC2_EVENTO.EXPEDIENTE_CREADO, expedienteId: expedienteId, entidadTipo: 'expediente',
    entidadId: expedienteId, actor: contexto.actor, actorId: contexto.actorId, origen: contexto.origen,
    requestId: contexto.requestId,
    metadata: { requisitos: sincronizacion.creados, tipoFuncionario: tipoFuncionario, tipoGarantia: tipoGarantia }
  });

  doc2Emitir_(DOC2_EVENTO.EXPEDIENTE_CREADO, { expedienteId: expedienteId }, contexto);

  // ── Alta completa en una sola ida y vuelta ────────────────────────────────
  // El asistente hacía cuatro llamadas seguidas (crear → obtener → guardar
  // requisitos → N prórrogas). Cada una es un `POST` a Apps Script con su
  // arranque, su `LockService` y su latencia: con veinticinco requisitos y dos
  // prórrogas eran seis viajes de red y el botón se quedaba «guardando» ocho o
  // diez segundos, tiempo suficiente para que alguien lo pulsara otra vez.
  //
  // Si la petición trae `requisitos` y/o `prorrogas`, se aplican AQUÍ, dentro de
  // la misma ejecución y del mismo candado. Y si algo falla a medias se revierte
  // el expediente entero: un alta a la mitad —creada pero sin sus estados— es
  // peor que un alta que no ocurrió, porque nadie sabe qué le falta.
  var aplicado = null;
  if ((d.requisitos && d.requisitos.length) || (d.prorrogas && d.prorrogas.length)) {
    try {
      aplicado = doc2AplicarAltaCompleta_(expedienteId, d, contexto);
      resumen = aplicado.resumen || resumen;
    } catch (error) {
      doc2RevertirAltaFallida_(expedienteId, contexto, docClassify_(error).message);
      throw error;
    }
  }

  doc2EspejoLibro_(expedienteId, contexto);

  return {
    expedienteId: expedienteId,
    creado: true,
    requisitos: sincronizacion.creados,
    resumen: resumen,
    // El detalle completo viaja de vuelta para que el asistente pueda abrir el
    // expediente SIN una quinta llamada. Solo cuando se pidió el alta completa:
    // en el camino corto sería un payload gratuito.
    detalle: aplicado ? aplicado.detalle : null,
    aplicado: aplicado ? { requisitos: aplicado.aplicados, prorrogas: aplicado.prorrogas, fallidos: aplicado.fallidos } : null
  };
}

/**
 * Aplica estados, observaciones, hojas y prórrogas de un alta completa.
 *
 * Los requisitos llegan por CÓDIGO de catálogo, no por `expedienteDocumentoId`:
 * el cliente no puede conocer los identificadores de unas filas que se acaban de
 * crear en esta misma ejecución. La traducción se hace aquí, que es el único sitio
 * que ya las tiene delante.
 *
 * Un requisito que no aplica a la rama elegida se ignora en silencio: el
 * asistente conserva lo que se marcó antes de cambiar de categoría, y eso es una
 * comodidad deliberada, no un error que haya que reportar.
 */
function doc2AplicarAltaCompleta_(expedienteId, datos, contexto) {
  var lista = datos.requisitos || [];
  var existentes = doc2RequisitosDe_(expedienteId, false);
  var porCodigo = {};
  for (var i = 0; i < existentes.length; i++) porCodigo[String(existentes[i].codigo_documento)] = existentes[i];

  var cambios = [];
  for (var c = 0; c < lista.length; c++) {
    var entrada = lista[c] || {};
    var fila = porCodigo[String(entrada.codigo || entrada.codigo_documento || '')];
    if (!fila) continue;
    var cambio = { expedienteDocumentoId: fila.expediente_documento_id, codigo: fila.codigo_documento };
    var tieneAlgo = false;
    if (entrada.estado !== undefined && String(entrada.estado) !== DOC2_ESTADO_DOCUMENTO.PENDIENTE) {
      cambio.estado = entrada.estado;
      tieneAlgo = true;
    }
    if (entrada.observaciones !== undefined && String(entrada.observaciones).trim() !== '') {
      cambio.observaciones = entrada.observaciones;
      tieneAlgo = true;
    }
    if (doc2TraeHojas_(entrada) && String(doc2ValorHojas_(entrada)).trim() !== '') {
      cambio.hojasFisicas = doc2ValorHojas_(entrada);
      tieneAlgo = true;
    }
    if (tieneAlgo) cambios.push(cambio);
  }

  var resultado = { aplicados: 0, fallidos: [], resumen: null };
  if (cambios.length) {
    var lote = doc2ActualizarRequisitosEnLote_(expedienteId, cambios, contexto);
    resultado.aplicados = lote.aplicados;
    resultado.resumen = lote.resumen;
    /*
     * ── Aquí el alta es ESTRICTA, y a propósito ─────────────────────────────
     * `doc2ActualizarRequisitosEnLote_` es tolerante: valida cada cambio por
     * separado y devuelve los que fallan sin tumbar los que valían. Es lo
     * correcto cuando alguien está editando un expediente que ya existe: un
     * cambio rechazado no debe hacerle perder los otros cinco.
     *
     * En un ALTA no. La persona todavía no tiene el expediente delante, y un
     * expediente creado al que le falta la mitad de lo que marcó es peor que uno
     * que no se creó: no hay forma de saber qué quedó fuera. Así que se lanza y
     * el llamador revierte.
     */
    if (lote.fallidos.length) {
      var primero = lote.fallidos[0];
      throw docError_(DOC_CODE.VALIDATION_ERROR,
        'No se pudo registrar «' + (primero.codigo || primero.requisito) + '»: ' + primero.motivo,
        {
          hint: 'Corrige ese requisito y vuelve a guardar. El expediente no se creó.',
          details: { fields: doc2Campo_('requisitos', primero.motivo), fallidos: lote.fallidos }
        });
    }
  }

  // Prórrogas: una por una porque cada una audita y valida su fecha. Fallan de
  // forma acumulativa —una fecha mal puesta no debe tirar el alta— y se reportan.
  var prorrogas = 0;
  var listaP = datos.prorrogas || [];
  for (var pp = 0; pp < listaP.length; pp++) {
    var pedido = listaP[pp] || {};
    var destino = porCodigo[String(pedido.codigo || pedido.codigo_documento || '')];
    if (!destino || destino.permite_prorroga !== true) continue;
    if (!pedido.fechaProrroga && !pedido.fecha_prorroga) continue;
    try {
      doc2CrearProrroga_({
        expedienteDocumentoId: destino.expediente_documento_id,
        fechaProrroga: pedido.fechaProrroga || pedido.fecha_prorroga,
        motivo: pedido.motivo || 'Prórroga registrada al abrir el expediente.'
      }, contexto);
      prorrogas++;
    } catch (error) {
      resultado.fallidos.push({
        codigo: destino.codigo_documento,
        motivo: docClassify_(error).message,
        parte: 'prorroga'
      });
    }
  }
  resultado.prorrogas = prorrogas;
  resultado.detalle = doc2ExpedienteOperativo_(expedienteId, contexto, { historial: 20, auditoria: 0 });
  return resultado;
}

/**
 * Deshace un alta que falló a medias.
 *
 * ── Por qué no se borra la fila ─────────────────────────────────────────────
 * Porque en este módulo no se borra nada, y porque el `idempotency_key_creacion`
 * ya escrito tiene que seguir ahí: si el cliente reintenta con la misma clave,
 * tiene que encontrar el mismo expediente y no crear un tercero. Se marca como
 * `ELIMINADO_LOGICO` con constancia del motivo, que es la reversión que el modelo
 * admite. Un administrador puede restaurarlo si el fallo fue puntual.
 *
 * La reversión no puede lanzar: si falla, el error que importa es el original.
 */
function doc2RevertirAltaFallida_(expedienteId, contexto, motivo) {
  try {
    doc2Update_(DOC2_SHEET.EXPEDIENTES, expedienteId, {
      estado_expediente: DOC2_ESTADO_EXPEDIENTE.ELIMINADO_LOGICO,
      estado_operacion: 'ALTA_REVERTIDA'
    }, contexto);
    doc2Historial_({
      expedienteId: expedienteId, entidadTipo: 'expediente', entidadId: expedienteId,
      campo: 'expediente', anterior: 'expediente creado', nuevo: 'alta revertida',
      motivo: 'El alta completa falló y se deshizo: ' + String(motivo || ''), actor: contexto.actor
    });
    doc2Audit_({
      tipo: 'expediente.alta_revertida', expedienteId: expedienteId, entidadTipo: 'expediente',
      entidadId: expedienteId, actor: contexto.actor, actorId: contexto.actorId,
      origen: contexto.origen, requestId: contexto.requestId, resultado: 'error',
      metadata: { motivo: String(motivo || '') }
    });
  } catch (e) {
    docWarn_('No se pudo revertir un alta fallida.', { expediente: expedienteId, motivo: docClassify_(e).message });
  }
}

/**
 * Detalle de VARIOS expedientes en una sola llamada.
 *
 * ── Para qué ────────────────────────────────────────────────────────────────
 * La precarga en segundo plano del frontend necesita el detalle de los
 * expedientes visibles. Pedirlos de uno en uno son N peticiones a Apps Script,
 * cada una con su arranque de contenedor: veinticinco filas eran veinticinco
 * viajes. Aquí se traen en uno.
 *
 * ── Los tres límites que la hacen segura ────────────────────────────────────
 *   1. **tope de ids** (`LOTE_MASIVO`): Apps Script corta a los seis minutos y una
 *      lista sin tope acabaría devolviendo un error en vez de datos;
 *   2. **payload recortado**: sin auditoría y con poco historial. La precarga
 *      quiere pintar la ficha rápido, no auditarla; quien la abra de verdad pide
 *      el detalle completo;
 *   3. **permisos y errores por elemento**: un expediente inaccesible o
 *      inexistente no tumba el lote, se devuelve en `fallidos`.
 */
function doc2DetalleMultiple_(ids, ctx, opciones) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.VER);
  var o = opciones || {};
  var lista = Object.prototype.toString.call(ids) === '[object Array]' ? ids : [];

  if (lista.length > DOC2_LIMITS.LOTE_MASIVO) {
    throw docError_(DOC2_CODE.LIMITE_EXCEDIDO, 'Demasiados expedientes en una sola lectura.',
      {
        hint: 'Pide como máximo ' + DOC2_LIMITS.LOTE_MASIVO + ' expedientes por llamada.',
        details: { recibidos: lista.length, maximo: DOC2_LIMITS.LOTE_MASIVO }
      });
  }

  var expedientes = [];
  var fallidos = [];
  var vistos = {};
  for (var i = 0; i < lista.length; i++) {
    var id = docRaw_(lista[i] || '', 200);
    if (!id || vistos[id]) continue;
    vistos[id] = true;
    try {
      expedientes.push(doc2ExpedienteOperativo_(id, contexto, {
        historial: docInt_(o.historial, 12),
        auditoria: 0
      }));
    } catch (error) {
      var info = docClassify_(error);
      fallidos.push({ expedienteId: id, motivo: info.message, codigo: info.docCode });
    }
  }

  return {
    expedientes: expedientes,
    fallidos: fallidos,
    solicitados: lista.length,
    devueltos: expedientes.length
  };
}

/**
 * Busca un expediente por identificador, normalizando las DOS partes.
 *
 * ── Por qué no basta comparar contra la columna guardada ────────────────────
 * `identificador_normalizado` se calculó con la regla que estaba vigente el día
 * en que se escribió esa fila. Cuando la regla se endurece —y aquí lo hizo, para
 * que «9.876.543» y «9876543» dejaran de ser dos personas—, las filas antiguas
 * conservan la clave vieja y la comparación falla justo donde importa: al
 * detectar un duplicado.
 *
 * La solución es no fiarse de la columna y recalcular desde el texto ORIGINAL,
 * que es inmutable. La columna sigue existiendo (la usan los filtros y el orden)
 * y la migración `5.0.2-identificadores` la pone al día, pero la unicidad no
 * depende de que esa migración se haya ejecutado.
 */
function doc2BuscarPorIdentificador_(valor) {
  var filas = doc2All_(DOC2_SHEET.EXPEDIENTES, true);
  var clave = doc2NormalizarIdentificador_(valor);
  if (!clave) return null;
  for (var i = 0; i < filas.length; i++) {
    if (doc2NormalizarIdentificador_(filas[i].identificador) === clave) return filas[i];
    // Reserva: una fila cuyo texto original se perdiera pero conserve la clave.
    if (String(filas[i].identificador_normalizado) === clave) return filas[i];
  }
  return null;
}

/** Expediente por su id o por su identificador humano. Lo primero que encuentre. */
function doc2ResolverExpediente_(idOIdentificador) {
  var valor = String(idOIdentificador || '');
  if (!valor) return null;
  var directo = doc2Get_(DOC2_SHEET.EXPEDIENTES, valor);
  if (directo) return directo;
  return doc2BuscarPorIdentificador_(valor);
}

function doc2ExigirExpediente_(idOIdentificador) {
  var fila = doc2ResolverExpediente_(idOIdentificador);
  if (!fila) {
    throw docError_(DOC_CODE.NOT_FOUND, 'No existe el expediente ' + idOIdentificador + '.',
      { hint: 'Revisa el identificador o actualiza la lista.', details: { id: idOIdentificador } });
  }
  return fila;
}

/* ========================================================================== */
/* Requisitos aplicables                                                       */
/* ========================================================================== */

/**
 * Pone los requisitos del expediente al día con el catálogo.
 *
 * Tres casos, y el tercero es el importante:
 *
 *   1. requisito aplicable que no existe todavía → se crea en `PENDIENTE`;
 *   2. requisito que existe y sigue aplicando → se deja como está;
 *   3. requisito que existe y YA NO aplica (cambió el tipo de garantía) → si no
 *      tiene datos se archiva; si los tiene, se CONSERVA y se marca como no
 *      aplicable, porque borrar una entrega registrada porque cambió una
 *      clasificación sería destruir trabajo real.
 *
 * Devuelve el detalle de cada decisión para que la interfaz pueda explicarlo.
 */
function doc2SincronizarRequisitos_(expedienteId, ctx, opciones) {
  var contexto = ctx || doc2CtxActual_();
  var o = opciones || {};
  var expediente = doc2ExigirExpediente_(expedienteId);

  var aplicables = doc2Aplicables_({
    tipoFuncionario: expediente.tipo_funcionario,
    tipoGarantia: expediente.tipo_garantia,
    fecha: expediente.fecha_ingreso
  });
  var aplicablesPorCodigo = {};
  for (var a = 0; a < aplicables.length; a++) aplicablesPorCodigo[String(aplicables[a].codigo_documento)] = aplicables[a];

  var existentes = doc2By_(DOC2_SHEET.EXPEDIENTE_DOCS, 'expediente_id', expediente.expediente_id, true);
  var porCodigo = {};
  for (var e = 0; e < existentes.length; e++) porCodigo[String(existentes[e].codigo_documento)] = existentes[e];

  var creados = 0;
  var reactivados = 0;
  var archivados = 0;
  var conservados = [];

  for (var i = 0; i < aplicables.length; i++) {
    var def = aplicables[i];
    var codigo = String(def.codigo_documento);
    var actual = porCodigo[codigo];

    if (!actual) {
      doc2Insert_(DOC2_SHEET.EXPEDIENTE_DOCS, {
        expediente_documento_id: doc2StableId_('expdoc', expediente.expediente_id + '|' + codigo),
        expediente_id: expediente.expediente_id,
        codigo_documento: codigo,
        version_catalogo: docInt_(def.version_catalogo, DOC2_CATALOGO_VERSION),
        seccion: def.seccion,
        // La subsección viene YA RESUELTA para esta rama por `doc2Aplicables_`.
        // Se materializa en la fila para que reportes y exportaciones no tengan
        // que volver a resolverla —y no puedan resolverla distinto.
        subseccion: doc2Texto_(def.subseccion || '', 200),
        grupo: def.grupo,
        orden: docInt_(def.orden, (i + 1) * 10),
        estado_documental: DOC2_ESTADO_DOCUMENTO.PENDIENTE,
        observaciones: '',
        obligatorio: def.obligatorio === true,
        permite_no_aplica: def.permite_no_aplica === true,
        permite_prorroga: def.permite_prorroga === true,
        tipo_funcionario: def.tipo_funcionario || '',
        tipo_garantia: def.tipo_garantia || '',
        estado_revision: DOC2_ESTADO_REVISION.SIN_REVISION,
        revision_actual_id: '',
        aprobacion_actual_id: '',
        version_registro: 1
      }, contexto);
      creados++;
      continue;
    }

    if (actual.archived_at) {
      doc2Unarchive_(DOC2_SHEET.EXPEDIENTE_DOCS, actual.expediente_documento_id, contexto);
      reactivados++;
    }
    // El catálogo puede haber cambiado la obligatoriedad o los permisos: se
    // refrescan sin tocar el estado ni la observación, que son datos operativos.
    doc2Update_(DOC2_SHEET.EXPEDIENTE_DOCS, actual.expediente_documento_id, {
      seccion: def.seccion,
      subseccion: doc2Texto_(def.subseccion || '', 200),
      grupo: def.grupo,
      orden: docInt_(def.orden, docInt_(actual.orden, 0)),
      obligatorio: def.obligatorio === true,
      permite_no_aplica: def.permite_no_aplica === true,
      permite_prorroga: def.permite_prorroga === true,
      version_catalogo: docInt_(def.version_catalogo, DOC2_CATALOGO_VERSION)
    }, contexto);
  }

  /*
   * Prórrogas por requisito, para el criterio de «tiene datos».
   *
   * ── El fallo que esto corrige ─────────────────────────────────────────────
   * `tieneDatos` miraba el estado, la observación y la revisión, pero NO las
   * prórrogas. Un requisito todavía pendiente al que alguien había concedido un
   * plazo —el caso normal: «el título llega en marzo, te doy hasta el 31»— se
   * consideraba vacío y se ARCHIVABA al recalcular la aplicabilidad. La fila de
   * la prórroga seguía en su hoja, pero el requisito desaparecía de la vista y
   * con él el plazo: nadie volvía a perseguirlo.
   *
   * Se lee una sola vez y se indexa, en lugar de consultar por requisito: con
   * veinticinco requisitos serían veinticinco lecturas de la misma hoja.
   */
  var prorrogasPorRequisito = {};
  var todasProrrogas = doc2By_(DOC2_SHEET.PRORROGAS, 'expediente_id', expediente.expediente_id, false);
  for (var pr = 0; pr < todasProrrogas.length; pr++) {
    var estadoPr = String(todasProrrogas[pr].estado_prorroga || '');
    if (estadoPr === DOC2_ESTADO_PRORROGA.CANCELADA || estadoPr === DOC2_ESTADO_PRORROGA.RECHAZADA) continue;
    prorrogasPorRequisito[String(todasProrrogas[pr].expediente_documento_id || '')] = true;
  }

  for (var x = 0; x < existentes.length; x++) {
    var fila = existentes[x];
    if (aplicablesPorCodigo[String(fila.codigo_documento)]) continue;
    if (fila.archived_at) continue;

    var tieneDatos = String(fila.estado_documental) !== DOC2_ESTADO_DOCUMENTO.PENDIENTE ||
      String(fila.observaciones || '').trim() !== '' ||
      docInt_(fila.hojas_fisicas, 0) > 0 ||
      prorrogasPorRequisito[String(fila.expediente_documento_id)] === true ||
      String(fila.estado_revision) !== DOC2_ESTADO_REVISION.SIN_REVISION;

    if (tieneDatos) {
      conservados.push({ codigo: fila.codigo_documento, motivo: 'Ya tenía información registrada.' });
      doc2Historial_({
        expedienteId: expediente.expediente_id, entidadTipo: 'expediente_documento',
        entidadId: fila.expediente_documento_id, campo: 'aplicabilidad',
        anterior: 'aplicable', nuevo: 'ya no aplica (se conserva por tener datos)',
        motivo: 'Cambio de tipo de funcionario o garantía', actor: contexto.actor
      });
    } else {
      doc2Archive_(DOC2_SHEET.EXPEDIENTE_DOCS, fila.expediente_documento_id, contexto);
      archivados++;
    }
  }

  if (!o.silencioso && (creados || archivados || reactivados)) {
    doc2Historial_({
      expedienteId: expediente.expediente_id, entidadTipo: 'expediente', entidadId: expediente.expediente_id,
      campo: 'requisitos',
      anterior: existentes.length + ' requisito(s)',
      nuevo: (existentes.length + creados - archivados) + ' requisito(s)',
      motivo: 'Recálculo de aplicabilidad', actor: contexto.actor
    });
  }

  return { creados: creados, archivados: archivados, reactivados: reactivados, conservados: conservados, aplicables: aplicables.length };
}

/** Requisitos vigentes de un expediente, en orden de presentación. */
function doc2RequisitosDe_(expedienteId, incluirArchivados) {
  var filas = doc2By_(DOC2_SHEET.EXPEDIENTE_DOCS, 'expediente_id', expedienteId, incluirArchivados === true);
  filas.sort(function (a, b) {
    var oa = docInt_(a.orden, 999);
    var ob = docInt_(b.orden, 999);
    if (oa !== ob) return oa - ob;
    return String(a.codigo_documento) > String(b.codigo_documento) ? 1 : -1;
  });
  return filas;
}

/* ========================================================================== */
/* Edición de la cabecera                                                      */
/* ========================================================================== */

/**
 * Edita la cabecera del expediente.
 *
 * Solo se aceptan los campos editables. El estado NO se cambia aquí: para eso
 * está `doc2CambiarEstadoExpediente_`, que valida la transición. Cambiar el tipo
 * de funcionario o de garantía recalcula los requisitos aplicables.
 */
function doc2ActualizarExpediente_(expedienteId, patch, ctx, opciones) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.EDITAR);
  var o = opciones || {};
  var expediente = doc2ExigirExpediente_(expedienteId);
  var p = patch || {};

  if (String(expediente.estado_expediente) === DOC2_ESTADO_EXPEDIENTE.ELIMINADO_LOGICO) {
    throw docError_(DOC_CODE.CONFLICT, 'Este expediente está eliminado lógicamente.',
      { hint: 'Restaúralo antes de editarlo.', details: { expedienteId: expediente.expediente_id } });
  }

  var nuevo = {};
  if (p.nombre !== undefined) nuevo.nombre = doc2Texto_(p.nombre, 300);
  if (p.cargo !== undefined) nuevo.cargo = doc2Texto_(p.cargo, 300);
  if (p.agencia !== undefined || p.oficina !== undefined) nuevo.agencia = doc2Texto_(p.agencia !== undefined ? p.agencia : p.oficina, 200);
  if (p.gerencia !== undefined) nuevo.gerencia = doc2Texto_(p.gerencia, 200);
  if (p.fechaIngreso !== undefined || p.fecha_ingreso !== undefined) {
    nuevo.fecha_ingreso = doc2ValidarFecha_(p.fechaIngreso !== undefined ? p.fechaIngreso : p.fecha_ingreso, 'fecha_ingreso');
  }
  if (p.responsableId !== undefined || p.responsable !== undefined) {
    nuevo.responsable_id = doc2Texto_(p.responsableId !== undefined ? p.responsableId : p.responsable, 240);
  }

  var cambioRama = false;
  if (p.tipoFuncionario !== undefined || p.tipo_funcionario !== undefined) {
    var tf = doc2Enum_(p.tipoFuncionario !== undefined ? p.tipoFuncionario : p.tipo_funcionario,
      ['GENERAL', 'COMERCIAL', 'AUDITORIA', 'CUMPLIMIENTO', 'EJECUTIVO', 'DIRECTORIO'], expediente.tipo_funcionario);
    doc2ExigirRamaHabilitada_(tf);
    if (tf !== expediente.tipo_funcionario) { nuevo.tipo_funcionario = tf; cambioRama = true; }
  }
  if (p.tipoGarantia !== undefined || p.tipo_garantia !== undefined) {
    var tg = doc2Enum_(p.tipoGarantia !== undefined ? p.tipoGarantia : p.tipo_garantia,
      ['NINGUNA', 'COMERCIAL_1', 'COMERCIAL_2', 'COMERCIAL_3'], expediente.tipo_garantia);
    if (tg !== expediente.tipo_garantia) { nuevo.tipo_garantia = tg; cambioRama = true; }
  }

  var funcionarioFinal = nuevo.tipo_funcionario || expediente.tipo_funcionario;
  var garantiaFinal = nuevo.tipo_garantia || expediente.tipo_garantia;
  if (funcionarioFinal === 'COMERCIAL' && garantiaFinal === 'NINGUNA') {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'Un funcionario comercial necesita un tipo de garantía.',
      { details: { fields: doc2Campo_('tipo_garantia', 'Selecciona el tipo de garantía comercial.') } });
  }

  if (!Object.keys(nuevo).length) {
    return { expedienteId: expediente.expediente_id, cambios: 0, sinCambios: true };
  }

  var antes = {};
  for (var k in nuevo) if (Object.prototype.hasOwnProperty.call(nuevo, k)) antes[k] = expediente[k];

  doc2Update_(DOC2_SHEET.EXPEDIENTES, expediente.expediente_id, nuevo, contexto, { version: o.version });
  var cambios = doc2DiffHistorial_('expediente', expediente.expediente_id, antes, nuevo,
    { actor: contexto.actor, expedienteId: expediente.expediente_id, motivo: p.motivo || '' });

  var sincronizacion = null;
  if (cambioRama) {
    sincronizacion = doc2SincronizarRequisitos_(expediente.expediente_id, contexto);
    doc2Emitir_(DOC2_EVENTO.GARANTIA_CAMBIADA, { expedienteId: expediente.expediente_id }, contexto);
  }

  if (nuevo.agencia) doc2AgregarAuxiliar_('agencia_bdp', [nuevo.agencia]);
  if (nuevo.gerencia) doc2AgregarAuxiliar_('gerencia_bdp', [nuevo.gerencia]);

  var resumen = doc2RecalcularExpediente_(expediente.expediente_id, contexto);

  doc2Audit_({
    tipo: DOC2_EVENTO.EXPEDIENTE_ACTUALIZADO, expedienteId: expediente.expediente_id,
    entidadTipo: 'expediente', entidadId: expediente.expediente_id,
    actor: contexto.actor, actorId: contexto.actorId, origen: contexto.origen, requestId: contexto.requestId,
    metadata: { campos: Object.keys(nuevo), cambioRama: cambioRama }
  });

  doc2Emitir_(DOC2_EVENTO.EXPEDIENTE_ACTUALIZADO, { expedienteId: expediente.expediente_id }, contexto);
  doc2EspejoLibro_(expediente.expediente_id, contexto);

  return {
    expedienteId: expediente.expediente_id,
    cambios: cambios,
    sincronizacion: sincronizacion,
    resumen: resumen
  };
}

/**
 * Cambia el estado del expediente comprobando la transición.
 *
 * Los estados que dependen del contenido (`COMPLETO`, `OBSERVADO`…) los calcula
 * el recálculo; esta función existe para las decisiones humanas: aprobar,
 * archivar, marcar pendiente de eliminación, restaurar.
 */
function doc2CambiarEstadoExpediente_(expedienteId, estado, ctx, opciones) {
  var contexto = ctx || doc2CtxActual_();
  var o = opciones || {};
  var expediente = doc2ExigirExpediente_(expedienteId);
  var destino = doc2Enum_(estado, doc2ValoresDe_(DOC2_ESTADO_EXPEDIENTE), '');
  if (!destino) {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'El estado "' + estado + '" no existe.',
      { details: { fields: doc2Campo_('estado_expediente', 'Estado no reconocido.') } });
  }

  var capacidad = DOC2_CAPACIDAD.EDITAR;
  if (destino === DOC2_ESTADO_EXPEDIENTE.APROBADO) capacidad = DOC2_CAPACIDAD.APROBAR;
  if (destino === DOC2_ESTADO_EXPEDIENTE.ARCHIVADO || destino === DOC2_ESTADO_EXPEDIENTE.PENDIENTE_ELIMINACION ||
      destino === DOC2_ESTADO_EXPEDIENTE.ELIMINADO_LOGICO) capacidad = DOC2_CAPACIDAD.ARCHIVAR;
  doc2Autorizar_(contexto, capacidad);

  doc2ExigirTransicion_('expediente', expediente.estado_expediente, destino);

  // Aprobar exige que no quede nada pendiente: un expediente aprobado con
  // documentos sin entregar es justo el estado inválido que este módulo existe
  // para impedir.
  if (destino === DOC2_ESTADO_EXPEDIENTE.APROBADO) {
    var pendientes = docInt_(expediente.total_pendientes, 0) + docInt_(expediente.total_no_entregados, 0);
    var observados = docInt_(expediente.total_observados, 0);
    if (pendientes > 0 || observados > 0) {
      throw docError_(DOC_CODE.CONFLICT,
        'No se puede aprobar: quedan ' + pendientes + ' requisito(s) sin entregar y ' + observados + ' observado(s).',
        {
          hint: 'Resuelve los pendientes o márcalos como no aplica cuando corresponda.',
          details: { pendientes: pendientes, observados: observados }
        });
    }
  }

  var estadoAnterior = String(expediente.estado_expediente || '');
  var patch = { estado_expediente: destino };
  if (destino === DOC2_ESTADO_EXPEDIENTE.ARCHIVADO) {
    patch.archived_at = docNow_();
    patch.archived_by = doc2Texto_(contexto.actor, 240);
    patch.estado_operacion = 'ARCHIVADO';
  } else if (String(expediente.estado_expediente) === DOC2_ESTADO_EXPEDIENTE.ARCHIVADO) {
    patch.archived_at = '';
    patch.archived_by = '';
    patch.estado_operacion = 'ACTIVO';
  }
  if (destino === DOC2_ESTADO_EXPEDIENTE.ELIMINADO_LOGICO) patch.estado_operacion = 'ELIMINADO_LOGICO';
  if (destino === DOC2_ESTADO_EXPEDIENTE.PENDIENTE_ELIMINACION) patch.estado_operacion = 'PENDIENTE_ELIMINACION';

  doc2Update_(DOC2_SHEET.EXPEDIENTES, expediente.expediente_id, patch, contexto, { version: o.version });
  doc2Historial_({
    expedienteId: expediente.expediente_id, entidadTipo: 'expediente', entidadId: expediente.expediente_id,
    campo: 'estado_expediente', anterior: estadoAnterior, nuevo: destino,
    motivo: o.motivo || '', actor: contexto.actor
  });
  doc2Audit_({
    tipo: 'expediente.estado', expedienteId: expediente.expediente_id, entidadTipo: 'expediente',
    entidadId: expediente.expediente_id, actor: contexto.actor, actorId: contexto.actorId,
    origen: contexto.origen, requestId: contexto.requestId,
    metadata: { desde: estadoAnterior, hasta: destino, motivo: o.motivo || '' }
  });

  if (destino === DOC2_ESTADO_EXPEDIENTE.APROBADO) {
    doc2Emitir_(DOC2_EVENTO.EXPEDIENTE_APROBADO, { expedienteId: expediente.expediente_id }, contexto);
  }
  if (destino === DOC2_ESTADO_EXPEDIENTE.ARCHIVADO) {
    doc2Emitir_(DOC2_EVENTO.EXPEDIENTE_ARCHIVADO, { expedienteId: expediente.expediente_id }, contexto);
  }
  doc2EspejoLibro_(expediente.expediente_id, contexto);

  return { expedienteId: expediente.expediente_id, estado: destino, anterior: estadoAnterior };
}

/** Valores de un mapa de estados, como arreglo. */
function doc2ValoresDe_(mapa) {
  var out = [];
  for (var k in mapa) if (Object.prototype.hasOwnProperty.call(mapa, k)) out.push(mapa[k]);
  return out;
}

/* ========================================================================== */
/* Estado documental de un requisito                                           */
/* ========================================================================== */

/**
 * Valida el número de hojas de un documento FÍSICO.
 *
 * ── Por qué el backend rechaza en lugar de ignorar ──────────────────────────
 * Un contador enviado sobre un requisito digital significa una de dos cosas: o el
 * cliente está desincronizado con el catálogo, o alguien está llamando a la API a
 * mano. En los dos casos, guardarlo en silencio deja un dato que nadie sabe
 * interpretar —¿cuántas hojas tiene una fotografía enviada por WhatsApp?— y
 * descartarlo en silencio hace creer que se guardó. Se rechaza con `campos` para
 * que el formulario marque exactamente el control que sobra.
 *
 * El requisito manda su propia definición del catálogo: la fila de
 * `ExpedienteDocumentos` no guarda `requiere_conteo_hojas` a propósito, porque es
 * una propiedad del documento y no de un expediente concreto. Si el catálogo lo
 * cambia, el cambio aplica de inmediato a todos.
 */
function doc2ValidarHojasFisicas_(fila, valor) {
  var def = doc2CatalogoItem_(fila.codigo_documento);
  var admite = !!(def && def.requiere_conteo_hojas === true);

  if (!admite) {
    throw docError_(DOC_CODE.VALIDATION_ERROR,
      'El requisito "' + doc2NombreRequisito_(fila) + '" no se entrega en papel: no lleva conteo de hojas.',
      {
        hint: 'El contador de hojas solo existe en los documentos que se presentan físicamente.',
        details: {
          fields: doc2Campo_('hojas_fisicas', 'Este documento no lleva conteo de hojas.'),
          codigo: fila.codigo_documento
        }
      });
  }

  // Vacío significa «sin anotar», y es distinto de cero: cero hojas es un dato
  // (alguien contó y no había nada), vacío es la ausencia de dato.
  if (valor === null || valor === undefined || String(valor).trim() === '') return '';

  var texto = String(valor).trim();
  if (!/^\d{1,4}$/.test(texto)) {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'El número de hojas tiene que ser un número entero.',
      {
        hint: 'Escribe cuántas hojas tiene el documento en papel, sin decimales ni signos.',
        details: { fields: doc2Campo_('hojas_fisicas', 'Escribe un número entero de hojas.') }
      });
  }

  var entero = docInt_(texto, -1);
  if (entero < 0 || entero > DOC2_MAX_HOJAS_FISICAS) {
    throw docError_(DOC_CODE.VALIDATION_ERROR,
      'El número de hojas tiene que estar entre 0 y ' + DOC2_MAX_HOJAS_FISICAS + '.',
      {
        hint: 'Si el documento tiene más hojas que eso, anótalo en la observación.',
        details: { fields: doc2Campo_('hojas_fisicas', 'Entre 0 y ' + DOC2_MAX_HOJAS_FISICAS + ' hojas.') }
      });
  }
  return entero;
}

/**
 * Conteo de hojas tal como lo recibe el cliente: número o `null`.
 *
 * `null` significa «sin anotar» y `0` significa «se contó y no había hojas». Son
 * dos hechos distintos y el informe los cuenta aparte, así que la conversión
 * tiene que respetar el cero.
 */
function doc2HojasVista_(valor) {
  if (valor === null || valor === undefined) return null;
  var texto = String(valor).trim();
  if (texto === '') return null;
  return docInt_(texto, 0);
}

/** ¿Trae este cambio un conteo de hojas? Acepta las dos formas de nombrarlo. */
function doc2TraeHojas_(cambio) {
  return cambio.hojasFisicas !== undefined || cambio.hojas_fisicas !== undefined;
}

/** El valor del conteo de hojas de un cambio, con cualquiera de sus dos nombres. */
function doc2ValorHojas_(cambio) {
  return cambio.hojasFisicas !== undefined ? cambio.hojasFisicas : cambio.hojas_fisicas;
}

/**
 * Cambia el estado de un requisito y su observación.
 *
 * Comprueba tres cosas antes de escribir: que la transición sea válida, que el
 * requisito admita `NO_APLICA` si es lo que se pide, y que el expediente no esté
 * cerrado. Después recalcula el resumen y emite el evento, que es lo que dispara
 * las automatizaciones (crear tarea si queda observado, marcar completo si ya no
 * falta nada).
 */
function doc2ActualizarRequisito_(expedienteDocumentoId, cambios, ctx, opciones) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.EDITAR);
  var o = opciones || {};
  var c = cambios || {};

  var fila = doc2GetOrFail_(DOC2_SHEET.EXPEDIENTE_DOCS, expedienteDocumentoId, 'el requisito');
  var expediente = doc2ExigirExpediente_(fila.expediente_id);
  doc2ExigirExpedienteEditable_(expediente);

  var patch = {};
  var antes = {};

  if (c.estado !== undefined || c.estado_documental !== undefined) {
    var pedido = doc2ExigirEstadoDocumento_(c.estado !== undefined ? c.estado : c.estado_documental);
    if (pedido === DOC2_ESTADO_DOCUMENTO.NO_APLICA && fila.permite_no_aplica !== true) {
      throw docError_(DOC2_CODE.NO_APLICABLE,
        'El requisito "' + doc2NombreRequisito_(fila) + '" es obligatorio y no admite «no aplica».',
        {
          hint: 'Si de verdad no corresponde, desactívalo en el catálogo o pide una excepción autorizada.',
          details: { fields: doc2Campo_('estado_documental', 'Este requisito no admite «no aplica».') }
        });
    }
    doc2ExigirTransicion_('documento', fila.estado_documental, pedido);
    antes.estado_documental = fila.estado_documental;
    patch.estado_documental = pedido;
  }

  if (c.observaciones !== undefined || c.observacion !== undefined) {
    antes.observaciones = fila.observaciones;
    patch.observaciones = doc2TextoLargo_(c.observaciones !== undefined ? c.observaciones : c.observacion, DOC2_LIMITS.MAX_TEXTO_MEDIO);
  }

  if (doc2TraeHojas_(c)) {
    antes.hojas_fisicas = fila.hojas_fisicas;
    patch.hojas_fisicas = doc2ValidarHojasFisicas_(fila, doc2ValorHojas_(c));
  }

  if (!Object.keys(patch).length) {
    return { expedienteDocumentoId: expedienteDocumentoId, cambios: 0, sinCambios: true };
  }

  doc2Update_(DOC2_SHEET.EXPEDIENTE_DOCS, expedienteDocumentoId, patch, contexto, { version: o.version });
  var cambiosHist = doc2DiffHistorial_('expediente_documento', expedienteDocumentoId, antes, patch, {
    actor: contexto.actor, expedienteId: expediente.expediente_id,
    motivo: c.motivo || ''
  });

  doc2Audit_({
    tipo: DOC2_EVENTO.DOCUMENTO_ACTUALIZADO, expedienteId: expediente.expediente_id,
    entidadTipo: 'expediente_documento', entidadId: expedienteDocumentoId,
    actor: contexto.actor, actorId: contexto.actorId, origen: contexto.origen, requestId: contexto.requestId,
    metadata: { codigo: fila.codigo_documento, estado: patch.estado_documental || fila.estado_documental }
  });

  var resumen = doc2RecalcularExpediente_(expediente.expediente_id, contexto);
  doc2Emitir_(DOC2_EVENTO.DOCUMENTO_ACTUALIZADO, {
    expedienteId: expediente.expediente_id,
    expedienteDocumentoId: expedienteDocumentoId,
    codigo: fila.codigo_documento,
    estado: patch.estado_documental || fila.estado_documental
  }, contexto);

  // Cumplir un requisito cierra los ítems de solicitud que lo pedían: sin esto,
  // la solicitud seguiría abierta pidiendo algo que ya se entregó.
  if (patch.estado_documental === DOC2_ESTADO_DOCUMENTO.ENTREGADO ||
      patch.estado_documental === DOC2_ESTADO_DOCUMENTO.NO_APLICA) {
    doc2CumplirItemsDeSolicitud_(expedienteDocumentoId, contexto);
  }

  doc2EspejoLibro_(expediente.expediente_id, contexto);

  return { expedienteDocumentoId: expedienteDocumentoId, cambios: cambiosHist, resumen: resumen };
}

/**
 * Aplica varios cambios de requisitos en una sola operación.
 *
 * Es lo que usa el guardado por bloque de la interfaz: marcar seis documentos
 * seguidos es UNA escritura, no seis. Cada cambio se valida por separado y los
 * que fallan se devuelven con su motivo, sin tumbar los que sí eran válidos.
 */
function doc2ActualizarRequisitosEnLote_(expedienteId, lista, ctx, opciones) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.EDITAR);
  var expediente = doc2ExigirExpediente_(expedienteId);
  doc2ExigirExpedienteEditable_(expediente);

  var entrada = lista || [];
  if (entrada.length > DOC2_LIMITS.LOTE_MASIVO * 4) {
    throw docError_(DOC2_CODE.LIMITE_EXCEDIDO, 'Demasiados cambios en una sola operación.',
      { hint: 'Envía como máximo ' + (DOC2_LIMITS.LOTE_MASIVO * 4) + ' cambios por guardado.', details: { recibidos: entrada.length } });
  }

  var aplicados = 0;
  var fallidos = [];

  for (var i = 0; i < entrada.length; i++) {
    var cambio = entrada[i] || {};
    var id = docRaw_(cambio.expedienteDocumentoId || cambio.expediente_documento_id || '', 200);
    if (!id && cambio.codigo) {
      var porCodigo = doc2RequisitoPorCodigo_(expediente.expediente_id, cambio.codigo);
      if (porCodigo) id = porCodigo.expediente_documento_id;
    }
    if (!id) {
      fallidos.push({ indice: i, motivo: 'No se identificó el requisito.' });
      continue;
    }
    try {
      var fila = doc2GetOrFail_(DOC2_SHEET.EXPEDIENTE_DOCS, id, 'el requisito');
      if (String(fila.expediente_id) !== String(expediente.expediente_id)) {
        throw docError_(DOC2_CODE.RELACION_INVALIDA, 'Ese requisito pertenece a otro expediente.',
          { details: { expedienteId: expediente.expediente_id, requisito: id } });
      }
      var patch = {};
      var antes = {};
      if (cambio.estado !== undefined) {
        var pedido = doc2ExigirEstadoDocumento_(cambio.estado);
        if (pedido === DOC2_ESTADO_DOCUMENTO.NO_APLICA && fila.permite_no_aplica !== true) {
          throw docError_(DOC2_CODE.NO_APLICABLE, 'El requisito "' + doc2NombreRequisito_(fila) + '" no admite «no aplica».',
            { details: { codigo: fila.codigo_documento } });
        }
        doc2ExigirTransicion_('documento', fila.estado_documental, pedido);
        antes.estado_documental = fila.estado_documental;
        patch.estado_documental = pedido;
      }
      if (cambio.observaciones !== undefined || cambio.observacion !== undefined) {
        antes.observaciones = fila.observaciones;
        patch.observaciones = doc2TextoLargo_(cambio.observaciones !== undefined ? cambio.observaciones : cambio.observacion, DOC2_LIMITS.MAX_TEXTO_MEDIO);
      }
      if (doc2TraeHojas_(cambio)) {
        antes.hojas_fisicas = fila.hojas_fisicas;
        patch.hojas_fisicas = doc2ValidarHojasFisicas_(fila, doc2ValorHojas_(cambio));
      }
      if (!Object.keys(patch).length) continue;

      doc2Update_(DOC2_SHEET.EXPEDIENTE_DOCS, id, patch, contexto, { version: cambio.version });
      doc2DiffHistorial_('expediente_documento', id, antes, patch, {
        actor: contexto.actor, expedienteId: expediente.expediente_id, motivo: cambio.motivo || ''
      });
      if (patch.estado_documental === DOC2_ESTADO_DOCUMENTO.ENTREGADO ||
          patch.estado_documental === DOC2_ESTADO_DOCUMENTO.NO_APLICA) {
        doc2CumplirItemsDeSolicitud_(id, contexto);
      }
      doc2Emitir_(DOC2_EVENTO.DOCUMENTO_ACTUALIZADO, {
        expedienteId: expediente.expediente_id, expedienteDocumentoId: id,
        codigo: fila.codigo_documento, estado: patch.estado_documental || fila.estado_documental,
        sinRecalculo: true
      }, contexto);
      aplicados++;
    } catch (error) {
      var info = docClassify_(error);
      fallidos.push({ indice: i, requisito: id, codigo: cambio.codigo || '', motivo: info.message, codigoError: info.docCode });
    }
  }

  var resumen = doc2RecalcularExpediente_(expediente.expediente_id, contexto);
  doc2Audit_({
    tipo: 'requisitos.lote', expedienteId: expediente.expediente_id, entidadTipo: 'expediente',
    entidadId: expediente.expediente_id, actor: contexto.actor, actorId: contexto.actorId,
    origen: contexto.origen, requestId: contexto.requestId,
    resultado: fallidos.length ? 'parcial' : 'ok',
    metadata: { aplicados: aplicados, fallidos: fallidos.length }
  });
  doc2EspejoLibro_(expediente.expediente_id, contexto);

  return { expedienteId: expediente.expediente_id, aplicados: aplicados, fallidos: fallidos, resumen: resumen };
}

/** Requisito de un expediente por su código de catálogo. */
function doc2RequisitoPorCodigo_(expedienteId, codigo) {
  var filas = doc2By_(DOC2_SHEET.EXPEDIENTE_DOCS, 'expediente_id', expedienteId, true);
  var buscado = String(codigo);
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i].codigo_documento) === buscado) return filas[i];
  }
  return null;
}

/** Nombre visible de un requisito, con reserva al código. */
function doc2NombreRequisito_(fila) {
  var def = doc2CatalogoItem_(fila.codigo_documento);
  return (def && def.nombre_visible) || String(fila.codigo_documento || '');
}

/** Un expediente cerrado no admite cambios operativos. */
function doc2ExigirExpedienteEditable_(expediente) {
  var estado = String(expediente.estado_expediente || '');
  if (estado === DOC2_ESTADO_EXPEDIENTE.ELIMINADO_LOGICO) {
    throw docError_(DOC_CODE.CONFLICT, 'El expediente está eliminado lógicamente.',
      { hint: 'Restaúralo para poder trabajar en él.', details: { estado: estado } });
  }
  if (estado === DOC2_ESTADO_EXPEDIENTE.ARCHIVADO) {
    throw docError_(DOC_CODE.CONFLICT, 'El expediente está archivado.',
      { hint: 'Restaúralo desde la vista del expediente para poder editarlo.', details: { estado: estado } });
  }
  return true;
}

/* ========================================================================== */
/* Recálculo del resumen                                                       */
/* ========================================================================== */

/**
 * Recalcula los totales, el porcentaje, el estado y la próxima fecha crítica.
 *
 * ── El estado se deriva, salvo cuando es una decisión humana ─────────────────
 * `APROBADO`, `ARCHIVADO`, `PENDIENTE_ELIMINACION`, `ELIMINADO_LOGICO` y
 * `BORRADOR` son decisiones de una persona y no se sobrescriben. El resto
 * (`INCOMPLETO`, `EN_RECOLECCION`, `EN_REVISION`, `OBSERVADO`, `CON_PRORROGA`,
 * `COMPLETO`) describe el contenido y se deduce de él: si se dejaran a mano,
 * cualquier expediente terminaría con un estado que no corresponde a sus
 * documentos.
 */
function doc2RecalcularExpediente_(expedienteId, ctx, opciones) {
  var contexto = ctx || doc2CtxActual_();
  var o = opciones || {};
  var expediente = doc2ExigirExpediente_(expedienteId);
  var requisitos = doc2RequisitosDe_(expediente.expediente_id, false);

  var totales = {
    total_requisitos: requisitos.length,
    total_entregados: 0,
    total_pendientes: 0,
    total_no_entregados: 0,
    total_no_aplica: 0,
    total_observados: 0,
    total_resueltos: 0,
    // Resúmenes materializados del papel: los pide la lista, el informe mensual y
    // la columna PAGINAS del libro anual. Se recalculan aquí para que ninguna de
    // las tres tenga que recorrer `ExpedienteDocumentos` por su cuenta y llegar a
    // un número distinto.
    total_hojas_fisicas: 0,
    total_documentos_fisicos: 0
  };

  var hayRevisionEnCurso = false;
  for (var i = 0; i < requisitos.length; i++) {
    var r = requisitos[i];
    var estado = String(r.estado_documental || DOC2_ESTADO_DOCUMENTO.PENDIENTE);
    if (estado === DOC2_ESTADO_DOCUMENTO.ENTREGADO) totales.total_entregados++;
    else if (estado === DOC2_ESTADO_DOCUMENTO.NO_ENTREGADO) totales.total_no_entregados++;
    else if (estado === DOC2_ESTADO_DOCUMENTO.NO_APLICA) totales.total_no_aplica++;
    else totales.total_pendientes++;

    var revision = String(r.estado_revision || DOC2_ESTADO_REVISION.SIN_REVISION);
    if (revision === DOC2_ESTADO_REVISION.OBSERVADO || revision === DOC2_ESTADO_REVISION.REQUIERE_CORRECCION ||
        revision === DOC2_ESTADO_REVISION.RECHAZADO) totales.total_observados++;
    if (revision === DOC2_ESTADO_REVISION.EN_REVISION) hayRevisionEnCurso = true;

    var defR = doc2CatalogoItem_(r.codigo_documento);
    if (defR && defR.requiere_conteo_hojas === true) {
      totales.total_documentos_fisicos++;
      totales.total_hojas_fisicas += docInt_(r.hojas_fisicas, 0);
    }
  }
  totales.total_resueltos = totales.total_entregados + totales.total_no_aplica;

  var denominador = totales.total_requisitos - totales.total_no_aplica;
  var porcentaje = denominador > 0 ? Math.round((totales.total_entregados / denominador) * 100) : (totales.total_requisitos ? 100 : 0);

  var prorrogas = doc2By_(DOC2_SHEET.PRORROGAS, 'expediente_id', expediente.expediente_id, false);
  var prorrogasVigentes = 0;
  var prorrogasVencidas = 0;
  var fechasCriticas = [];
  for (var p = 0; p < prorrogas.length; p++) {
    var estadoP = String(prorrogas[p].estado_prorroga || '');
    if (estadoP === DOC2_ESTADO_PRORROGA.CANCELADA || estadoP === DOC2_ESTADO_PRORROGA.CUMPLIDA ||
        estadoP === DOC2_ESTADO_PRORROGA.RECHAZADA) continue;
    if (doc2Vencida_(prorrogas[p].fecha_prorroga)) prorrogasVencidas++;
    else { prorrogasVigentes++; if (prorrogas[p].fecha_prorroga) fechasCriticas.push(String(prorrogas[p].fecha_prorroga)); }
  }

  var solicitudes = doc2By_(DOC2_SHEET.SOLICITUDES, 'expediente_id', expediente.expediente_id, false);
  for (var s = 0; s < solicitudes.length; s++) {
    var estadoS = String(solicitudes[s].estado_solicitud || '');
    if (estadoS === DOC2_ESTADO_SOLICITUD.COMPLETADA || estadoS === DOC2_ESTADO_SOLICITUD.CANCELADA) continue;
    if (solicitudes[s].fecha_limite && !doc2Vencida_(solicitudes[s].fecha_limite)) fechasCriticas.push(String(solicitudes[s].fecha_limite));
  }

  var tareas = doc2By_(DOC2_SHEET.TAREAS, 'expediente_id', expediente.expediente_id, false);
  for (var t = 0; t < tareas.length; t++) {
    var estadoT = String(tareas[t].estado_tarea || '');
    if (estadoT === DOC2_ESTADO_TAREA.COMPLETADA || estadoT === DOC2_ESTADO_TAREA.CANCELADA) continue;
    if (tareas[t].fecha_limite && !doc2Vencida_(tareas[t].fecha_limite)) fechasCriticas.push(String(tareas[t].fecha_limite));
  }

  var aprobaciones = doc2By_(DOC2_SHEET.APROBACIONES, 'expediente_id', expediente.expediente_id, false);
  var aprobacionesPendientes = 0;
  var aprobacionesRechazadas = 0;
  for (var ap = 0; ap < aprobaciones.length; ap++) {
    var estadoAp = String(aprobaciones[ap].estado_aprobacion);
    if (estadoAp === DOC2_ESTADO_APROBACION.RECHAZADA) aprobacionesRechazadas++;
    if (estadoAp !== DOC2_ESTADO_APROBACION.PENDIENTE) continue;
    aprobacionesPendientes++;
    if (aprobaciones[ap].fecha_limite && !doc2Vencida_(aprobaciones[ap].fecha_limite)) fechasCriticas.push(String(aprobaciones[ap].fecha_limite));
  }

  fechasCriticas.sort();
  var proxima = fechasCriticas.length ? fechasCriticas[0] : '';

  var estadoActual = String(expediente.estado_expediente || DOC2_ESTADO_EXPEDIENTE.BORRADOR);
  var estadoFinal = estadoActual;
  var terminales = [DOC2_ESTADO_EXPEDIENTE.APROBADO, DOC2_ESTADO_EXPEDIENTE.ARCHIVADO,
    DOC2_ESTADO_EXPEDIENTE.PENDIENTE_ELIMINACION, DOC2_ESTADO_EXPEDIENTE.ELIMINADO_LOGICO];

  if (terminales.indexOf(estadoActual) < 0) {
    var derivado;
    // Una aprobación rechazada es una observación a nivel de expediente: si el
    // recálculo la ignorara, el estado volvería a «en recolección» en la siguiente
    // escritura y el rechazo desaparecería de la vista.
    if (totales.total_observados > 0 || aprobacionesRechazadas > 0) derivado = DOC2_ESTADO_EXPEDIENTE.OBSERVADO;
    else if (denominador > 0 && totales.total_entregados >= denominador) derivado = DOC2_ESTADO_EXPEDIENTE.COMPLETO;
    else if (hayRevisionEnCurso || aprobacionesPendientes > 0) derivado = DOC2_ESTADO_EXPEDIENTE.EN_REVISION;
    else if (prorrogasVigentes > 0) derivado = DOC2_ESTADO_EXPEDIENTE.CON_PRORROGA;
    else if (totales.total_no_entregados > 0 || prorrogasVencidas > 0) derivado = DOC2_ESTADO_EXPEDIENTE.INCOMPLETO;
    else if (totales.total_entregados > 0) derivado = DOC2_ESTADO_EXPEDIENTE.EN_RECOLECCION;
    else derivado = o.estadoInicial || DOC2_ESTADO_EXPEDIENTE.EN_RECOLECCION;

    // Si la transición derivada no es válida desde el estado actual, se respeta el
    // actual: la máquina de estados manda también sobre el cálculo automático.
    estadoFinal = doc2TransicionPermitida_('expediente', estadoActual, derivado) ? derivado : estadoActual;
  }

  var patch = {
    total_requisitos: totales.total_requisitos,
    total_resueltos: totales.total_resueltos,
    total_entregados: totales.total_entregados,
    total_pendientes: totales.total_pendientes,
    total_no_entregados: totales.total_no_entregados,
    total_no_aplica: totales.total_no_aplica,
    total_observados: totales.total_observados,
    total_hojas_fisicas: totales.total_hojas_fisicas,
    total_documentos_fisicos: totales.total_documentos_fisicos,
    total_prorrogas: prorrogasVigentes + prorrogasVencidas,
    total_prorrogas_vencidas: prorrogasVencidas,
    porcentaje_completitud: porcentaje,
    proxima_fecha_critica: proxima,
    estado_expediente: estadoFinal
  };

  var cambioEstado = estadoFinal !== estadoActual;
  var hayCambios = cambioEstado;
  if (!hayCambios) {
    for (var campo in patch) {
      if (!Object.prototype.hasOwnProperty.call(patch, campo)) continue;
      if (String(expediente[campo] === null || expediente[campo] === undefined ? '' : expediente[campo]) !==
          String(patch[campo] === null || patch[campo] === undefined ? '' : patch[campo])) { hayCambios = true; break; }
    }
  }

  if (hayCambios) {
    doc2Update_(DOC2_SHEET.EXPEDIENTES, expediente.expediente_id, patch, contexto);
    if (cambioEstado) {
      doc2Historial_({
        expedienteId: expediente.expediente_id, entidadTipo: 'expediente', entidadId: expediente.expediente_id,
        campo: 'estado_expediente', anterior: estadoActual, nuevo: estadoFinal,
        motivo: 'Recálculo automático', actor: contexto.actor
      });
      if (estadoFinal === DOC2_ESTADO_EXPEDIENTE.COMPLETO) {
        doc2Emitir_(DOC2_EVENTO.EXPEDIENTE_COMPLETO, { expedienteId: expediente.expediente_id }, contexto);
      }
    }
  }

  patch.expedienteId = expediente.expediente_id;
  patch.aprobacionesPendientes = aprobacionesPendientes;
  patch.prorrogasVigentes = prorrogasVigentes;
  return patch;
}

/* ========================================================================== */
/* Lectura: expediente operativo                                               */
/* ========================================================================== */

/**
 * Todo el expediente, listo para la pantalla de operación.
 *
 * Una sola llamada devuelve cabecera, requisitos, solicitudes, revisiones,
 * aprobaciones, prórrogas, tareas, comentarios, historial y resumen. Son diez
 * consultas al libro… que en realidad son diez lecturas de hojas ya cargadas en
 * memoria por la unidad de trabajo: la segunda vez que se pide una hoja durante
 * la misma petición no se vuelve a leer.
 *
 * La auditoría técnica solo se incluye si quien pregunta puede verla.
 */
function doc2ExpedienteOperativo_(idOIdentificador, ctx, opciones) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.VER);
  var o = opciones || {};
  var expediente = doc2ExigirExpediente_(idOIdentificador);
  var id = expediente.expediente_id;

  var requisitos = doc2RequisitosDe_(id, o.incluirArchivados === true);
  var prorrogas = doc2By_(DOC2_SHEET.PRORROGAS, 'expediente_id', id, false);
  var solicitudes = doc2By_(DOC2_SHEET.SOLICITUDES, 'expediente_id', id, false);
  var revisiones = doc2By_(DOC2_SHEET.REVISIONES, 'expediente_id', id, true);
  var aprobaciones = doc2By_(DOC2_SHEET.APROBACIONES, 'expediente_id', id, false);
  var tareas = doc2By_(DOC2_SHEET.TAREAS, 'expediente_id', id, false);
  var comentarios = doc2ComentariosVisibles_(id, contexto);
  var consentimientos = doc2By_(DOC2_SHEET.CONSENTIMIENTOS, 'expediente_id', id, false);

  var prorrogasPorRequisito = {};
  for (var p = 0; p < prorrogas.length; p++) {
    var clave = String(prorrogas[p].expediente_documento_id || '');
    if (!clave) continue;
    if (!prorrogasPorRequisito[clave]) prorrogasPorRequisito[clave] = [];
    prorrogasPorRequisito[clave].push(doc2ProrrogaVista_(prorrogas[p]));
  }

  var vistaRequisitos = [];
  for (var i = 0; i < requisitos.length; i++) {
    var r = requisitos[i];
    var def = doc2CatalogoItem_(r.codigo_documento);
    vistaRequisitos.push({
      expedienteDocumentoId: r.expediente_documento_id,
      codigo: r.codigo_documento,
      nombre: (def && def.nombre_visible) || r.codigo_documento,
      descripcion: (def && def.descripcion) || '',
      seccion: r.seccion,
      subseccion: r.subseccion || '',
      subgrupo: (def && def.subgrupo) || '',
      grupo: r.grupo,
      orden: docInt_(r.orden, 0),
      estado: r.estado_documental,
      observaciones: r.observaciones || '',
      /*
       * Vacío (no cero) cuando nadie lo ha anotado.
       *
       * La comparación es EXPLÍCITA contra null, undefined y cadena vacía, no un
       * `|| ''`: en JavaScript el cero es falso, así que `r.hojas_fisicas || ''`
       * convertía un conteo real de CERO hojas en «sin contar». Justo la
       * distinción que esta columna existe para poder hacer.
       */
      hojasFisicas: doc2HojasVista_(r.hojas_fisicas),
      presentacionFisica: (def && def.presentacion_fisica) || DOC2_PRESENTACION.NO,
      presentacionDigital: (def && def.presentacion_digital) || DOC2_PRESENTACION.SI,
      requiereConteoHojas: !!(def && def.requiere_conteo_hojas === true),
      obligatorio: r.obligatorio === true,
      permiteNoAplica: r.permite_no_aplica === true,
      permiteProrroga: r.permite_prorroga === true,
      estadoRevision: r.estado_revision || DOC2_ESTADO_REVISION.SIN_REVISION,
      revisionActualId: r.revision_actual_id || '',
      aprobacionActualId: r.aprobacion_actual_id || '',
      requiereRevision: !!(def && def.requiere_revision === true),
      requiereAprobacion: !!(def && def.requiere_aprobacion === true),
      version: docInt_(r.version_registro, 1),
      archivado: !!r.archived_at,
      prorrogas: prorrogasPorRequisito[String(r.expediente_documento_id)] || [],
      actualizadoEn: r.updated_at || '',
      actualizadoPor: r.updated_by || ''
    });
  }

  var historial = doc2HistorialDe_(id, docInt_(o.historial, 60));
  var auditoria = [];
  if (doc2Puede_(contexto, DOC2_CAPACIDAD.AUDITORIA)) {
    auditoria = doc2AuditoriaDe_(id, docInt_(o.auditoria, 40));
  }

  var cabecera = doc2ExpedienteVista_(expediente);
  var salida = {
    expediente: cabecera,
    requisitos: vistaRequisitos,
    prorrogas: doc2Mapear_(prorrogas, doc2ProrrogaVista_),
    solicitudes: doc2Mapear_(solicitudes, doc2SolicitudVista_),
    revisiones: doc2Mapear_(revisiones, doc2RevisionVista_),
    aprobaciones: doc2Mapear_(aprobaciones, doc2AprobacionVista_),
    tareas: doc2Mapear_(tareas, doc2TareaVista_),
    comentarios: comentarios,
    consentimientos: doc2Mapear_(consentimientos, doc2ConsentimientoVista_),
    historial: historial,
    auditoria: auditoria,
    resumenTextual: doc2ResumenTextual_(cabecera, vistaRequisitos, prorrogas, solicitudes, tareas),
    capacidades: doc2CapacidadesMapa_(contexto),
    siguientePendiente: doc2SiguientePendiente_(vistaRequisitos)
  };

  if (doc2ConfigBool_('auditoria_lectura', false)) {
    doc2Audit_({
      tipo: 'expediente.apertura', expedienteId: id, entidadTipo: 'expediente', entidadId: id,
      actor: contexto.actor, actorId: contexto.actorId, origen: contexto.origen, requestId: contexto.requestId
    });
  }

  return salida;
}

/** Aplica un mapeador a una lista, tolerando listas vacías. */
function doc2Mapear_(lista, fn) {
  var out = [];
  for (var i = 0; i < (lista || []).length; i++) out.push(fn(lista[i]));
  return out;
}

/** Cabecera del expediente, con los derivados que la pantalla necesita. */
function doc2ExpedienteVista_(fila) {
  var diasDesdeIngreso = null;
  if (fila.fecha_ingreso) {
    var d = doc2DiasHasta_(fila.fecha_ingreso);
    diasDesdeIngreso = d === null ? null : -d;
  }
  var tipoF = doc2TipoFuncionario_(fila.tipo_funcionario);
  var tipoG = doc2TipoGarantia_(fila.tipo_garantia);
  return {
    expedienteId: fila.expediente_id,
    identificador: fila.identificador,
    identificadorNormalizado: fila.identificador_normalizado,
    nombre: fila.nombre,
    cargo: fila.cargo || '',
    agencia: fila.agencia || '',
    gerencia: fila.gerencia || '',
    fechaIngreso: fila.fecha_ingreso || '',
    diasDesdeIngreso: diasDesdeIngreso,
    tipoFuncionario: fila.tipo_funcionario,
    tipoFuncionarioEtiqueta: (tipoF && tipoF.etiqueta) || fila.tipo_funcionario,
    tipoGarantia: fila.tipo_garantia,
    tipoGarantiaEtiqueta: (tipoG && tipoG.etiqueta) || fila.tipo_garantia,
    responsableId: fila.responsable_id || '',
    estado: fila.estado_expediente,
    porcentaje: docInt_(fila.porcentaje_completitud, 0),
    totales: {
      requisitos: docInt_(fila.total_requisitos, 0),
      resueltos: docInt_(fila.total_resueltos, 0),
      entregados: docInt_(fila.total_entregados, 0),
      pendientes: docInt_(fila.total_pendientes, 0),
      noEntregados: docInt_(fila.total_no_entregados, 0),
      noAplica: docInt_(fila.total_no_aplica, 0),
      observados: docInt_(fila.total_observados, 0),
      hojasFisicas: docInt_(fila.total_hojas_fisicas, 0),
      documentosFisicos: docInt_(fila.total_documentos_fisicos, 0),
      prorrogas: docInt_(fila.total_prorrogas, 0),
      prorrogasVencidas: docInt_(fila.total_prorrogas_vencidas, 0)
    },
    proximaFechaCritica: fila.proxima_fecha_critica || '',
    diasParaFechaCritica: fila.proxima_fecha_critica ? doc2DiasHasta_(fila.proxima_fecha_critica) : null,
    version: docInt_(fila.version_registro, 1),
    estadoOperacion: fila.estado_operacion || 'ACTIVO',
    creadoEn: fila.created_at || '',
    creadoPor: fila.created_by || '',
    actualizadoEn: fila.updated_at || '',
    actualizadoPor: fila.updated_by || '',
    archivadoEn: fila.archived_at || '',
    archivadoPor: fila.archived_by || '',
    anio: docYearOf_(fila.fecha_ingreso || fila.created_at)
  };
}

/** El siguiente requisito que hay que atender. Alimenta el botón «ir al siguiente». */
function doc2SiguientePendiente_(requisitos) {
  for (var i = 0; i < requisitos.length; i++) {
    var r = requisitos[i];
    if (r.archivado) continue;
    if (r.estadoRevision === DOC2_ESTADO_REVISION.OBSERVADO || r.estadoRevision === DOC2_ESTADO_REVISION.REQUIERE_CORRECCION) {
      return { expedienteDocumentoId: r.expedienteDocumentoId, codigo: r.codigo, motivo: 'observado' };
    }
  }
  for (var j = 0; j < requisitos.length; j++) {
    var q = requisitos[j];
    if (q.archivado) continue;
    if (q.estado === DOC2_ESTADO_DOCUMENTO.PENDIENTE || q.estado === DOC2_ESTADO_DOCUMENTO.NO_ENTREGADO) {
      return { expedienteDocumentoId: q.expedienteDocumentoId, codigo: q.codigo, motivo: 'pendiente' };
    }
  }
  return null;
}

/**
 * Resumen textual determinista.
 *
 * No hay ningún modelo de lenguaje detrás y no lo hay a propósito: este texto
 * puede acabar en un informe interno, y un resumen generado que «interpreta» los
 * datos es exactamente lo que no se quiere en un expediente laboral. Son frases
 * armadas con los números reales; con los mismos datos sale siempre el mismo
 * texto.
 */
function doc2ResumenTextual_(cabecera, requisitos, prorrogas, solicitudes, tareas) {
  var frases = [];
  var t = cabecera.totales;
  var denominador = t.requisitos - t.noAplica;

  frases.push(cabecera.nombre + ' (' + cabecera.identificador + ')' +
    (cabecera.cargo ? ', ' + cabecera.cargo : '') +
    (cabecera.agencia ? ', ' + cabecera.agencia : '') + '.');

  frases.push('Rama: ' + cabecera.tipoFuncionarioEtiqueta +
    (cabecera.tipoGarantia && cabecera.tipoGarantia !== 'NINGUNA' ? ' con ' + cabecera.tipoGarantiaEtiqueta : '') + '.');

  if (denominador > 0) {
    frases.push('Avance ' + cabecera.porcentaje + '%: ' + t.entregados + ' de ' + denominador +
      ' requisitos exigibles entregados' + (t.noAplica ? ' (' + t.noAplica + ' no aplican)' : '') + '.');
  } else {
    frases.push('Sin requisitos exigibles registrados.');
  }

  if (t.pendientes + t.noEntregados > 0) {
    var faltan = [];
    for (var i = 0; i < requisitos.length && faltan.length < 4; i++) {
      var r = requisitos[i];
      if (r.archivado) continue;
      if (r.estado === DOC2_ESTADO_DOCUMENTO.PENDIENTE || r.estado === DOC2_ESTADO_DOCUMENTO.NO_ENTREGADO) faltan.push(r.nombre);
    }
    frases.push('Faltan ' + (t.pendientes + t.noEntregados) + ' requisito(s)' +
      (faltan.length ? ': ' + faltan.join('; ') + (t.pendientes + t.noEntregados > faltan.length ? ' y otros' : '') : '') + '.');
  }

  if (t.observados > 0) frases.push(t.observados + ' requisito(s) con observación pendiente de resolver.');

  var vigentes = 0;
  var vencidas = 0;
  for (var p = 0; p < (prorrogas || []).length; p++) {
    var estadoP = String(prorrogas[p].estado_prorroga || '');
    if (estadoP === DOC2_ESTADO_PRORROGA.CANCELADA || estadoP === DOC2_ESTADO_PRORROGA.CUMPLIDA || estadoP === DOC2_ESTADO_PRORROGA.RECHAZADA) continue;
    if (doc2Vencida_(prorrogas[p].fecha_prorroga)) vencidas++; else vigentes++;
  }
  if (vigentes) frases.push(vigentes + ' prórroga(s) vigente(s).');
  if (vencidas) frases.push(vencidas + ' prórroga(s) vencida(s) que requieren revisión.');

  var solicitudesAbiertas = 0;
  for (var s = 0; s < (solicitudes || []).length; s++) {
    var estadoS = String(solicitudes[s].estado_solicitud || '');
    if (estadoS !== DOC2_ESTADO_SOLICITUD.COMPLETADA && estadoS !== DOC2_ESTADO_SOLICITUD.CANCELADA) solicitudesAbiertas++;
  }
  if (solicitudesAbiertas) frases.push(solicitudesAbiertas + ' solicitud(es) en curso.');

  var tareasAbiertas = 0;
  for (var k = 0; k < (tareas || []).length; k++) {
    var estadoT = String(tareas[k].estado_tarea || '');
    if (estadoT !== DOC2_ESTADO_TAREA.COMPLETADA && estadoT !== DOC2_ESTADO_TAREA.CANCELADA) tareasAbiertas++;
  }
  if (tareasAbiertas) frases.push(tareasAbiertas + ' tarea(s) abierta(s).');

  if (cabecera.proximaFechaCritica) {
    var dias = cabecera.diasParaFechaCritica;
    frases.push('Próxima fecha crítica: ' + cabecera.proximaFechaCritica +
      (dias === null ? '' : (dias < 0 ? ' (vencida hace ' + Math.abs(dias) + ' día(s))' : ' (en ' + dias + ' día(s))')) + '.');
  }

  if (cabecera.diasDesdeIngreso !== null && cabecera.diasDesdeIngreso >= 0) {
    frases.push('Han transcurrido ' + cabecera.diasDesdeIngreso + ' día(s) desde el ingreso.');
  }

  return frases.join(' ');
}

/* ========================================================================== */
/* Lectura: listado, búsqueda y filtros                                        */
/* ========================================================================== */

/**
 * Lista expedientes con filtros, orden y paginación en el servidor.
 *
 * Los filtros son combinables y todos opcionales. Cuando llega `texto` se busca
 * en identificador, nombre, cargo, agencia, gerencia y responsable con la clave
 * normalizada (sin tildes, sin dobles espacios), que es lo que hace que buscar
 * «muñoz» encuentre a «MUNOZ».
 */
function doc2ListarExpedientes_(filtros, ctx) {
  var contexto = ctx || doc2CtxActual_();
  doc2Autorizar_(contexto, DOC2_CAPACIDAD.VER);
  var f = filtros || {};

  var texto = f.texto ? docKey_(f.texto) : '';
  var estados = doc2Lista_(f.estado || f.estados);
  var agencias = f.agencia ? [docKey_(f.agencia)] : [];
  var gerencias = f.gerencia ? [docKey_(f.gerencia)] : [];
  var tiposFuncionario = doc2Lista_(f.tipoFuncionario);
  var tiposGarantia = doc2Lista_(f.tipoGarantia);
  var responsable = f.responsable ? docKey_(f.responsable) : '';
  var anio = docInt_(f.anio, 0);
  var progresoMin = f.progresoMin === undefined || f.progresoMin === '' ? null : docInt_(f.progresoMin, 0);
  var progresoMax = f.progresoMax === undefined || f.progresoMax === '' ? null : docInt_(f.progresoMax, 100);
  var soloConPendientes = f.conPendientes === true;
  var soloNoEntregados = f.conNoEntregados === true;
  var soloObservados = f.conObservados === true;
  var soloProrrogas = f.conProrrogas === true;
  var soloProrrogasVencidas = f.conProrrogasVencidas === true;
  var creadoDesde = docDateOnly_(f.creadoDesde);
  var creadoHasta = docDateOnly_(f.creadoHasta);
  var actualizadoDesde = docDateOnly_(f.actualizadoDesde);
  var ingresoDesde = docDateOnly_(f.ingresoDesde);
  var ingresoHasta = docDateOnly_(f.ingresoHasta);

  // Los conjuntos «con solicitudes vencidas» y «con tareas vencidas» se resuelven
  // con un índice previo: preguntarlo expediente por expediente sería releer las
  // hojas por cada fila.
  var indiceSolicitudesVencidas = null;
  if (f.conSolicitudesVencidas === true) indiceSolicitudesVencidas = doc2IndiceSolicitudesVencidas_();
  var indiceTareasVencidas = null;
  if (f.conTareasVencidas === true) indiceTareasVencidas = doc2IndiceTareasVencidas_();

  var resultado = doc2Query_(DOC2_SHEET.EXPEDIENTES, {
    incluirArchivados: f.incluirArchivados === true,
    orden: doc2CampoOrden_(f.orden),
    direccion: f.direccion === 'asc' ? 'asc' : 'desc',
    pagina: f.pagina,
    porPagina: f.porPagina,
    sinPaginar: f.sinPaginar === true,
    filtro: function (fila) {
      if (!f.incluirEliminados && String(fila.estado_expediente) === DOC2_ESTADO_EXPEDIENTE.ELIMINADO_LOGICO) return false;
      if (estados.length && estados.indexOf(docKey_(fila.estado_expediente)) < 0) return false;
      if (agencias.length && agencias.indexOf(docKey_(fila.agencia)) < 0) return false;
      if (gerencias.length && gerencias.indexOf(docKey_(fila.gerencia)) < 0) return false;
      if (tiposFuncionario.length && tiposFuncionario.indexOf(docKey_(fila.tipo_funcionario)) < 0) return false;
      if (tiposGarantia.length && tiposGarantia.indexOf(docKey_(fila.tipo_garantia)) < 0) return false;
      if (responsable && docKey_(fila.responsable_id).indexOf(responsable) < 0) return false;
      if (anio && docYearOf_(fila.fecha_ingreso || fila.created_at) !== anio) return false;
      if (progresoMin !== null && docInt_(fila.porcentaje_completitud, 0) < progresoMin) return false;
      if (progresoMax !== null && docInt_(fila.porcentaje_completitud, 0) > progresoMax) return false;
      if (soloConPendientes && docInt_(fila.total_pendientes, 0) <= 0) return false;
      if (soloNoEntregados && docInt_(fila.total_no_entregados, 0) <= 0) return false;
      if (soloObservados && docInt_(fila.total_observados, 0) <= 0) return false;
      if (soloProrrogas && docInt_(fila.total_prorrogas, 0) <= 0) return false;
      if (soloProrrogasVencidas && docInt_(fila.total_prorrogas_vencidas, 0) <= 0) return false;
      if (creadoDesde && String(fila.created_at).slice(0, 10) < creadoDesde) return false;
      if (creadoHasta && String(fila.created_at).slice(0, 10) > creadoHasta) return false;
      if (actualizadoDesde && String(fila.updated_at).slice(0, 10) < actualizadoDesde) return false;
      if (ingresoDesde && String(fila.fecha_ingreso || '') < ingresoDesde) return false;
      if (ingresoHasta && String(fila.fecha_ingreso || '9999') > ingresoHasta) return false;
      if (indiceSolicitudesVencidas && !indiceSolicitudesVencidas[String(fila.expediente_id)]) return false;
      if (indiceTareasVencidas && !indiceTareasVencidas[String(fila.expediente_id)]) return false;
      if (texto) {
        /*
         * El pajar incluye el carnet SIN puntuación además del original.
         *
         * Desde que el campo admite «7.654.321-2B», buscar «7654321» no lo
         * encontraba: el texto guardado tiene puntos y el que se teclea no. Se
         * añade la forma normalizada al pajar y se busca también la consulta
         * normalizada, así que las dos direcciones funcionan: escribir con puntos
         * encuentra lo guardado sin ellos, y al revés.
         */
        var heno = docKey_([fila.identificador, fila.nombre, fila.cargo, fila.agencia, fila.gerencia, fila.responsable_id].join(' ')) +
          ' ' + doc2NormalizarIdentificador_(fila.identificador);
        var agujaLimpia = doc2NormalizarIdentificador_(texto);
        if (heno.indexOf(texto) < 0 && !(agujaLimpia && heno.indexOf(agujaLimpia) >= 0)) return false;
      }
      return true;
    }
  });

  var vista = [];
  for (var i = 0; i < resultado.filas.length; i++) vista.push(doc2ExpedienteVista_(resultado.filas[i]));

  return {
    total: resultado.total,
    pagina: resultado.pagina,
    porPagina: resultado.porPagina,
    paginas: resultado.paginas,
    expedientes: vista,
    resumen: doc2ResumenDeLista_(resultado.filas)
  };
}

/** Traduce el campo de orden que pide el cliente a la columna real. */
function doc2CampoOrden_(orden) {
  var mapa = {
    reciente: 'created_at', antiguo: 'created_at', actualizado: 'updated_at',
    nombre: 'nombre', identificador: 'identificador_normalizado',
    avance: 'porcentaje_completitud', progreso: 'porcentaje_completitud',
    pendientes: 'total_pendientes', observados: 'total_observados',
    ingreso: 'fecha_ingreso', critica: 'proxima_fecha_critica', estado: 'estado_expediente'
  };
  return mapa[String(orden || 'reciente')] || 'created_at';
}

/** Agregados de la página consultada, para la franja de resultados. */
function doc2ResumenDeLista_(filas) {
  var salida = { expedientes: filas.length, avancePromedio: 0, pendientes: 0, noEntregados: 0, observados: 0, completos: 0, prorrogasVencidas: 0 };
  if (!filas.length) return salida;
  var suma = 0;
  for (var i = 0; i < filas.length; i++) {
    suma += docInt_(filas[i].porcentaje_completitud, 0);
    salida.pendientes += docInt_(filas[i].total_pendientes, 0);
    salida.noEntregados += docInt_(filas[i].total_no_entregados, 0);
    salida.observados += docInt_(filas[i].total_observados, 0);
    salida.prorrogasVencidas += docInt_(filas[i].total_prorrogas_vencidas, 0);
    if (docInt_(filas[i].porcentaje_completitud, 0) >= 100) salida.completos++;
  }
  salida.avancePromedio = Math.round(suma / filas.length);
  return salida;
}

/** Índice `expedienteId -> true` de expedientes con solicitudes vencidas. */
function doc2IndiceSolicitudesVencidas_() {
  var indice = {};
  var filas = doc2All_(DOC2_SHEET.SOLICITUDES, false);
  for (var i = 0; i < filas.length; i++) {
    var estado = String(filas[i].estado_solicitud || '');
    if (estado === DOC2_ESTADO_SOLICITUD.COMPLETADA || estado === DOC2_ESTADO_SOLICITUD.CANCELADA) continue;
    if (estado === DOC2_ESTADO_SOLICITUD.VENCIDA || doc2Vencida_(filas[i].fecha_limite)) {
      indice[String(filas[i].expediente_id)] = true;
    }
  }
  return indice;
}

/** Índice `expedienteId -> true` de expedientes con tareas vencidas. */
function doc2IndiceTareasVencidas_() {
  var indice = {};
  var filas = doc2All_(DOC2_SHEET.TAREAS, false);
  for (var i = 0; i < filas.length; i++) {
    var estado = String(filas[i].estado_tarea || '');
    if (estado === DOC2_ESTADO_TAREA.COMPLETADA || estado === DOC2_ESTADO_TAREA.CANCELADA) continue;
    if (estado === DOC2_ESTADO_TAREA.VENCIDA || doc2Vencida_(filas[i].fecha_limite)) {
      indice[String(filas[i].expediente_id)] = true;
    }
  }
  return indice;
}

/* ========================================================================== */
/* Historial y auditoría de un expediente                                      */
/* ========================================================================== */

/** Historial legible de un expediente, de lo más reciente a lo más antiguo. */
function doc2HistorialDe_(expedienteId, limite) {
  var filas = doc2By_(DOC2_SHEET.HISTORIAL, 'expediente_id', expedienteId, true);
  filas.sort(function (a, b) { return String(b.created_at) > String(a.created_at) ? 1 : -1; });
  var tope = Math.min(Math.max(docInt_(limite, 60), 1), 500);
  var out = [];
  for (var i = 0; i < filas.length && i < tope; i++) {
    out.push({
      historialId: filas[i].historial_id,
      entidadTipo: filas[i].entidad_tipo,
      entidadId: filas[i].entidad_id,
      campo: filas[i].campo,
      anterior: filas[i].valor_anterior,
      nuevo: filas[i].valor_nuevo,
      motivo: filas[i].motivo || '',
      fecha: filas[i].created_at,
      actor: filas[i].created_by,
      texto: doc2FraseHistorial_(filas[i])
    });
  }
  return out;
}

/**
 * Convierte una línea de historial en una frase.
 *
 * «estado_documental: PENDIENTE → ENTREGADO» es correcto y no se entiende.
 * «Estado documental: de PENDIENTE a ENTREGADO» sí.
 */
function doc2FraseHistorial_(fila) {
  var campo = String(fila.campo || '').replace(/_/g, ' ');
  var etiqueta = campo.charAt(0).toUpperCase() + campo.slice(1);
  var anterior = String(fila.valor_anterior || '');
  var nuevo = String(fila.valor_nuevo || '');
  if (!anterior && nuevo) return etiqueta + ': ' + nuevo + '.';
  if (anterior && !nuevo) return etiqueta + ': se quitó «' + anterior + '».';
  return etiqueta + ': de ' + anterior + ' a ' + nuevo + '.';
}

/** Auditoría técnica de un expediente. Solo la ve quien tiene la capacidad. */
function doc2AuditoriaDe_(expedienteId, limite) {
  /*
   * Pedir CERO eventos significa «no me la traigas».
   *
   * La lectura por lotes de la precarga lo usa: la auditoría técnica es lo más
   * pesado del payload y lo menos útil para pintar una ficha rápido. Antes el
   * tope se forzaba a un mínimo de 1 y siempre volvía un evento, que además es un
   * dato personal que no hacía falta guardar en la caché del navegador.
   */
  if (docInt_(limite, 40) <= 0) return [];
  var filas = doc2By_(DOC2_SHEET.AUDITORIA, 'expediente_id', expedienteId, true);
  filas.sort(function (a, b) { return String(b.created_at) > String(a.created_at) ? 1 : -1; });
  var tope = Math.min(Math.max(docInt_(limite, 40), 1), 500);
  var out = [];
  for (var i = 0; i < filas.length && i < tope; i++) {
    out.push({
      eventoId: filas[i].evento_id,
      requestId: filas[i].request_id,
      entidadTipo: filas[i].entidad_tipo,
      entidadId: filas[i].entidad_id,
      tipo: filas[i].evento_tipo,
      actor: filas[i].actor_display || filas[i].actor_id,
      origen: filas[i].origen,
      resultado: filas[i].resultado,
      metadata: filas[i].metadata_json,
      fecha: filas[i].created_at
    });
  }
  return out;
}

/* ========================================================================== */
/* Espejo del libro anual                                                      */
/* ========================================================================== */

/**
 * Refleja el expediente normalizado en su pestaña `CONTROL INGRESOS <año>`.
 *
 * Reutiliza el mapeador de la versión anterior (`docRowFromDossier_`), así que la
 * fila resultante es idéntica a la que escribía el módulo antiguo: mismas
 * columnas derivadas, mismo `DETALLE JSON`, mismos colores. Es lo que mantiene en
 * pie el acuerdo con el área y, de paso, lo que permite volver atrás: si mañana
 * hubiera que desactivar el modelo normalizado, el libro seguiría al día.
 *
 * Va protegido de principio a fin: el dato normalizado ya está guardado y no
 * tiene sentido tumbar la operación porque el espejo falle.
 */
function doc2EspejoLibro_(expedienteId, ctx) {
  if (!doc2ConfigBool_('espejo_libro_anual', true)) return { espejo: false };
  var contexto = ctx || doc2CtxActual_();
  try {
    var expediente = doc2ResolverExpediente_(expedienteId);
    if (!expediente) return { espejo: false };
    var dossier = doc2ADossierHeredado_(expediente);
    var anio = docYearOf_(dossier.fechaIngreso || expediente.created_at);
    docEnsureYearSheet_(anio);
    var anterior = docFindDossierRow_(dossier.identificador, anio);
    var fila = docRowFromDossier_(dossier, contexto.actor || 'modulo', anterior);
    docYearPut_(anio, fila);
    docCount_('espejoLibro');
    return { espejo: true, anio: anio, identificador: dossier.identificador };
  } catch (error) {
    docWarn_('No se pudo reflejar el expediente en el libro anual.', {
      expediente: expedienteId, motivo: docClassify_(error).message
    });
    return { espejo: false, error: docClassify_(error).message };
  }
}

/**
 * Convierte un expediente normalizado al formato heredado.
 *
 * El mapeo de estados es el punto delicado. En el modelo normalizado la
 * observación es un estado de REVISIÓN («el documento llegó pero está mal») y en
 * el heredado era un estado DOCUMENTAL. Aquí se combinan: un requisito entregado
 * cuya revisión está observada se refleja como `observado`, que es lo que el
 * libro entendía.
 */
function doc2ADossierHeredado_(expediente) {
  var requisitos = doc2RequisitosDe_(expediente.expediente_id, false);
  var prorrogas = doc2By_(DOC2_SHEET.PRORROGAS, 'expediente_id', expediente.expediente_id, false);
  var prorrogaPorDoc = {};
  for (var p = 0; p < prorrogas.length; p++) {
    var estadoP = String(prorrogas[p].estado_prorroga || '');
    if (estadoP === DOC2_ESTADO_PRORROGA.CANCELADA || estadoP === DOC2_ESTADO_PRORROGA.RECHAZADA) continue;
    var clave = String(prorrogas[p].expediente_documento_id || '');
    var fecha = String(prorrogas[p].fecha_prorroga || '');
    if (!clave || !fecha) continue;
    if (!prorrogaPorDoc[clave] || fecha > prorrogaPorDoc[clave]) prorrogaPorDoc[clave] = fecha;
  }

  var items = [];
  for (var i = 0; i < requisitos.length; i++) {
    var r = requisitos[i];
    var def = doc2CatalogoItem_(r.codigo_documento);
    var estado = 'pendiente';
    var revision = String(r.estado_revision || '');
    if (revision === DOC2_ESTADO_REVISION.OBSERVADO || revision === DOC2_ESTADO_REVISION.REQUIERE_CORRECCION ||
        revision === DOC2_ESTADO_REVISION.RECHAZADO) {
      estado = 'observado';
    } else if (String(r.estado_documental) === DOC2_ESTADO_DOCUMENTO.ENTREGADO) {
      estado = 'presentado';
    } else if (String(r.estado_documental) === DOC2_ESTADO_DOCUMENTO.NO_APLICA) {
      estado = 'no_aplica';
    }
    var item = {
      id: r.codigo_documento,
      label: (def && def.nombre_visible) || r.codigo_documento,
      group: r.grupo || 'personal',
      status: estado,
      // `pages` es el conteo de hojas del documento físico. Alimenta la columna
      // PAGINAS del bloque de gestión —que ya existía y estaba siempre a cero— y
      // el detalle por documento del `DETALLE JSON`. Las columnas A-W del Excel
      // del área no se tocan ni se renumeran.
      pages: docInt_(r.hojas_fisicas, 0)
    };
    if (r.observaciones) item.observation = String(r.observaciones);
    if (r.permite_prorroga === true) item.allowProrroga = true;
    var prorroga = prorrogaPorDoc[String(r.expediente_documento_id)];
    if (prorroga) item.prorroga = prorroga;
    items.push(item);
  }

  return {
    identificador: expediente.identificador,
    nombre: expediente.nombre,
    cargo: expediente.cargo || '',
    agencia: expediente.agencia || '',
    gerencia: expediente.gerencia || '',
    correo: '',
    fechaIngreso: expediente.fecha_ingreso || '',
    createdAt: expediente.created_at || docNow_(),
    tipoEmpleado: '',
    responsable: expediente.responsable_id || '',
    observacion: '',
    items: items,
    emailLog: [],
    sheet: {}
  };
}
