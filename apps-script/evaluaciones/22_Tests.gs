/**
 * 22_Tests.gs — suite de pruebas que se ejecuta DENTRO del proyecto.
 *
 * Se puede lanzar desde el menú del libro o desde el editor. Ejercita el camino
 * completo (crear → guardar → publicar → responder → calificar → revisar) contra
 * el libro real, y limpia lo que crea.
 *
 * Por qué existe además de la suite de Node del repositorio: la del repositorio
 * corre contra un doble de `SpreadsheetApp`, y esta corre contra Google. Si el
 * comportamiento de la plataforma cambia —o si alguien tocó el libro a mano—, esta
 * es la que se da cuenta.
 *
 * Todas las evaluaciones que crea llevan el prefijo `[PRUEBA]` y se borran al
 * terminar, incluso si una aserción falla.
 */

var EV_TEST_PREFIX = '[PRUEBA] ';

function evAssert_(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

function evAssertEquals_(esperado, obtenido, mensaje) {
  if (String(esperado) !== String(obtenido)) {
    throw new Error(mensaje + ' — esperado «' + esperado + '», obtenido «' + obtenido + '»');
  }
}

/** Petición administrativa con la llave real, como la haría el ATS. */
function evTestRequest_(accion, payload, solicitudId) {
  return evHandle_({
    accion: accion,
    solicitudId: solicitudId || ('prueba_' + Utilities.getUuid()),
    llaveAdmin: evProp_(EV_PROP.ADMIN_KEY, ''),
    clientId: 'suite-pruebas',
    actor: 'suite',
    payload: payload || {}
  });
}

/** Petición pública (sin llave). */
function evTestPublic_(accion, payload, solicitudId) {
  return evHandle_({
    accion: accion,
    solicitudId: solicitudId || ('prueba_' + Utilities.getUuid()),
    clientId: 'suite-candidato',
    payload: payload || {}
  });
}

function evTestOk_(respuesta, contexto) {
  if (!respuesta.ok) {
    throw new Error(contexto + ' → ' + respuesta.error.codigo + ': ' + respuesta.error.mensaje);
  }
  return respuesta.datos;
}

/* --------------------------------- Las pruebas ----------------------------- */

var EV_TESTS = [
  {
    nombre: 'ping responde con identidad y estado de instalación',
    ejecutar: function () {
      var datos = evTestOk_(evTestRequest_('ping'), 'ping');
      evAssertEquals_('evaluaciones', datos.servicio, 'servicio');
      evAssert_(datos.instalado === true, 'el libro debe estar instalado antes de las pruebas');
      evAssert_(datos.tiposSoportados > 30, 'debe soportar más de treinta tipos de pregunta');
    }
  },
  {
    nombre: 'el esquema del libro coincide con el manifiesto',
    ejecutar: function () {
      var informe = evVerifySchema_();
      evAssert_(informe.ok, 'el esquema tiene diferencias: ejecuta «Instalar o reparar»');
    }
  },
  {
    nombre: 'el texto enriquecido sobrevive la ida y vuelta y descarta enlaces peligrosos',
    ejecutar: function () {
      var doc = evRichSanitize_({
        v: 1,
        b: [{ t: 'p', s: [
          { x: 'Hola ', m: [] },
          { x: 'mundo', m: ['b', 'i', 'inventada'] },
          { x: ' malo', l: 'javascript:alert(1)' }
        ] }]
      });
      evAssertEquals_('Hola mundo malo', evRichToPlain_(doc), 'proyección a plano');
      evAssertEquals_('b,i', doc.b[0].s[1].m.join(','), 'marcas admitidas');
      evAssert_(doc.b[0].s[2].l === undefined, 'un enlace javascript: debe descartarse');
    }
  },
  {
    nombre: 'crear, guardar y publicar una evaluación completa',
    ejecutar: function (estado) {
      var creada = evTestOk_(evTestRequest_('createEvaluation', {
        titulo: EV_TEST_PREFIX + 'Ciclo completo', categoria: 'conocimientos'
      }), 'createEvaluation');
      estado.evaluacionId = creada.evaluacion.id;
      estado.codigo = creada.evaluacion.codigo;
      evAssertEquals_('borrador', creada.evaluacion.estado, 'estado inicial');
      evAssert_(creada.secciones.length === 1, 'debe crear una sección inicial');

      var seccionId = creada.secciones[0].id;
      var documento = {
        id: estado.evaluacionId,
        revisionBase: creada.evaluacion.revision,
        evaluacion: {
          titulo: EV_TEST_PREFIX + 'Ciclo completo',
          descripcion: 'Prueba automática',
          categoria: 'conocimientos',
          instrucciones: evRichFromPlain_('Lee con atención.'),
          aplicacion: {
            duracionMinutos: 10, puntajeAprobacion: 60, criterioAprobacion: 'porcentaje',
            intentosMaximos: 1, navegacion: 'libre', autoenviarAlExpirar: true
          },
          participante: { visibilidadResultado: 'nota' }
        },
        secciones: [{
          id: seccionId, titulo: 'Sección 1',
          preguntas: [
            {
              id: 'pr_test_uno', tipo: 'opcion_unica',
              enunciado: evRichFromPlain_('¿Cuánto es 2 + 2?'),
              obligatoria: true, modoPuntaje: 'exacto', puntos: 1,
              opciones: [
                { id: 'op_test_a', texto: evRichFromPlain_('4'), valor: 'a', correcta: true },
                { id: 'op_test_b', texto: evRichFromPlain_('5'), valor: 'b', correcta: false }
              ]
            },
            {
              id: 'pr_test_dos', tipo: 'texto_largo',
              enunciado: evRichFromPlain_('Explica tu razonamiento.'),
              obligatoria: false, modoPuntaje: 'manual', puntos: 2, opciones: []
            }
          ]
        }]
      };
      var guardada = evTestOk_(evTestRequest_('saveEvaluation', documento), 'saveEvaluation');
      evAssertEquals_(2, guardada.evaluacion.preguntas, 'preguntas contadas');
      evAssertEquals_(1, guardada.evaluacion.preguntasCalificables, 'preguntas calificables');
      evAssertEquals_(3, guardada.evaluacion.puntosTotales, 'puntos totales');
      estado.revision = guardada.evaluacion.revision;

      var publicada = evTestOk_(evTestRequest_('publishEvaluation', {
        id: estado.evaluacionId, notas: 'Publicación de prueba'
      }), 'publishEvaluation');
      evAssertEquals_('v1.0', publicada.version.etiqueta, 'etiqueta de versión');
      evAssertEquals_('publicada', publicada.documento.evaluacion.estado, 'estado tras publicar');
      estado.versionId = publicada.version.id;
    }
  },
  {
    nombre: 'guardar con una revisión desfasada desde el MISMO cliente no da conflicto',
    ejecutar: function (estado) {
      evAssert_(estado.evaluacionId, 'depende de la prueba anterior');
      var documento = {
        id: estado.evaluacionId,
        // A propósito una revisión vieja: es exactamente el caso que rompía el
        // módulo anterior con «otro usuario actualizó este registro».
        revisionBase: 1,
        evaluacion: { titulo: EV_TEST_PREFIX + 'Ciclo completo' },
        secciones: []
      };
      var respuesta = evTestRequest_('saveEvaluation', documento);
      evAssert_(respuesta.ok, 'no debía haber conflicto: ' +
        (respuesta.error ? respuesta.error.codigo : ''));
    }
  },
  {
    nombre: 'un cliente distinto con revisión vieja SÍ recibe conflicto',
    ejecutar: function (estado) {
      var respuesta = evHandle_({
        accion: 'saveEvaluation',
        solicitudId: 'prueba_' + Utilities.getUuid(),
        llaveAdmin: evProp_(EV_PROP.ADMIN_KEY, ''),
        clientId: 'otro-navegador',
        actor: 'otra-persona',
        payload: {
          id: estado.evaluacionId, revisionBase: 1,
          evaluacion: { titulo: EV_TEST_PREFIX + 'Intruso' }, secciones: []
        }
      });
      evAssert_(!respuesta.ok, 'debía rechazarse');
      evAssertEquals_('CONFLICT', respuesta.error.codigo, 'código de error');
      evAssert_(respuesta.error.detalle.puedeForzar === true, 'debe ofrecer forzar');
    }
  },
  {
    nombre: 'el payload público no filtra ninguna clave de respuesta',
    ejecutar: function (estado) {
      // Se vuelve a publicar porque la prueba de conflicto dejó el borrador sin
      // secciones; se restaura antes de seguir.
      evTestOk_(evTestRequest_('saveEvaluation', evTestDocumentoBase_(estado)), 'restaurar');
      evTestOk_(evTestRequest_('publishEvaluation', { id: estado.evaluacionId }), 'republicar');

      var inicio = evTestOk_(evTestPublic_('startAttempt', {
        codigo: estado.codigo,
        participante: { nombre: 'Prueba Automática', documento: 'PRUEBA-001' }
      }), 'startAttempt');
      estado.intentoId = inicio.intentoId;
      estado.token = inicio.token;

      var json = JSON.stringify(inicio.prueba);
      var prohibidas = ['correcta', 'claveEmparejamiento', 'respuestaEsperada',
        'puntajeAprobacion', 'notasInternas', 'modoPuntaje', 'retroalimentacion'];
      for (var i = 0; i < prohibidas.length; i++) {
        evAssert_(json.indexOf(prohibidas[i]) < 0,
          'el payload público contiene «' + prohibidas[i] + '»');
      }
      evAssert_(inicio.limiteEn, 'debe traer límite de tiempo');
      evAssert_(inicio.segundosRestantes > 0, 'debe traer segundos restantes');
    }
  },
  {
    nombre: 'responder y enviar califica en el servidor y deja lo abierto pendiente',
    ejecutar: function (estado) {
      evAssert_(estado.intentoId, 'depende de la prueba anterior');
      evTestOk_(evTestPublic_('saveProgress', {
        intentoId: estado.intentoId, token: estado.token,
        respuestas: [{ preguntaId: 'pr_test_uno', opciones: ['op_test_a'] }],
        eventos: [{ tipo: 'pegar', secuencia: 1, detalle: { caracteres: 400 } }]
      }), 'saveProgress');

      var resultado = evTestOk_(evTestPublic_('submitAttempt', {
        intentoId: estado.intentoId, token: estado.token,
        respuestas: [
          { preguntaId: 'pr_test_uno', opciones: ['op_test_a'], correcta: true, puntosObtenidos: 999 },
          { preguntaId: 'pr_test_dos', valor: 'Porque cuatro es la suma de dos y dos.' }
        ]
      }), 'submitAttempt');
      evAssert_(resultado.calificacionPendiente === true,
        'con una pregunta abierta la nota debe quedar pendiente');

      var detalle = evTestOk_(evTestRequest_('getAttempt', { intentoId: estado.intentoId }), 'getAttempt');
      evAssertEquals_('pendiente_revision', detalle.intento.estadoCalificacion, 'estado de calificación');
      evAssertEquals_(1, detalle.intento.correctas, 'una correcta');
      evAssertEquals_(1, detalle.intento.pendientesRevision, 'una pendiente');
      evAssert_(detalle.intento.riesgoIntegridad > 0, 'el pegado debe sumar riesgo');
      // Un puntaje inventado por el cliente no se acepta jamás.
      var cerrada = null;
      for (var i = 0; i < detalle.respuestas.length; i++) {
        if (detalle.respuestas[i].preguntaId === 'pr_test_uno') cerrada = detalle.respuestas[i];
      }
      evAssertEquals_(1, cerrada.puntosObtenidos, 'el servidor otorga 1 punto, no 999');
    }
  },
  {
    nombre: 'la calificación manual recompone la nota y el veredicto',
    ejecutar: function (estado) {
      var calificada = evTestOk_(evTestRequest_('gradeAnswer', {
        intentoId: estado.intentoId, preguntaId: 'pr_test_dos',
        puntos: 2, comentario: 'Respuesta correcta y bien argumentada.'
      }), 'gradeAnswer');
      evAssertEquals_(0, calificada.pendientesRevision, 'no quedan pendientes');
      evAssertEquals_(100, calificada.nota, 'nota final');
      evAssert_(calificada.aprobado === true, 'debe aprobar con 100 sobre un umbral de 60');
    }
  },
  {
    nombre: 'un token de intento ajeno se rechaza',
    ejecutar: function (estado) {
      var respuesta = evTestPublic_('saveProgress', {
        intentoId: estado.intentoId, token: 'v1.token-inventado', respuestas: []
      });
      evAssert_(!respuesta.ok, 'debía rechazarse');
      evAssertEquals_('FORBIDDEN', respuesta.error.codigo, 'código de error');
    }
  },
  {
    nombre: 'no se puede iniciar dos veces con el mismo documento si solo hay un intento',
    ejecutar: function (estado) {
      var respuesta = evTestPublic_('startAttempt', {
        codigo: estado.codigo,
        participante: { nombre: 'Prueba Automática', documento: 'PRUEBA-001' }
      });
      evAssert_(!respuesta.ok, 'debía rechazarse');
      evAssertEquals_('FORBIDDEN', respuesta.error.codigo, 'código de error');
    }
  },
  {
    nombre: 'la idempotencia impide duplicar una escritura',
    ejecutar: function (estado) {
      var solicitud = 'idem_' + Utilities.getUuid();
      var primera = evTestRequest_('transitionEvaluation',
        { id: estado.evaluacionId, transicion: 'pausar' }, solicitud);
      evAssert_(primera.ok, 'la primera debía pasar');
      var segunda = evTestRequest_('transitionEvaluation',
        { id: estado.evaluacionId, transicion: 'pausar' }, solicitud);
      evAssert_(segunda.ok, 'la repetición debía responder con éxito');
      evAssert_(segunda.avisos.indexOf('SOLICITUD_REPETIDA') >= 0, 'debe avisar de la repetición');
      evTestOk_(evTestRequest_('transitionEvaluation',
        { id: estado.evaluacionId, transicion: 'reanudar' }), 'reanudar');
    }
  },
  {
    nombre: 'una transición imposible explica desde qué estados sí se puede',
    ejecutar: function (estado) {
      var respuesta = evTestRequest_('transitionEvaluation',
        { id: estado.evaluacionId, transicion: 'reanudar' });
      evAssert_(!respuesta.ok, 'debía rechazarse: ya está publicada');
      evAssertEquals_('CONFLICT', respuesta.error.codigo, 'código de error');
      evAssert_(respuesta.error.detalle.estadosValidos.length > 0, 'debe listar los estados válidos');
    }
  },
  {
    nombre: 'publicar sin título ni preguntas devuelve hallazgos con su ruta',
    ejecutar: function () {
      var creada = evTestOk_(evTestRequest_('createEvaluation',
        { titulo: 'Evaluación sin título' }), 'createEvaluation');
      var respuesta = evTestRequest_('publishEvaluation', { id: creada.evaluacion.id });
      evAssert_(!respuesta.ok, 'debía rechazarse');
      evAssertEquals_('VALIDATION_ERROR', respuesta.error.codigo, 'código de error');
      var hallazgos = respuesta.error.detalle.issues;
      evAssert_(hallazgos.length >= 2, 'debe haber al menos dos hallazgos');
      var conRuta = 0;
      for (var i = 0; i < hallazgos.length; i++) if (hallazgos[i].path) conRuta++;
      evAssert_(conRuta > 0, 'los hallazgos deben traer la ruta del campo');
      evTestRequest_('deleteEvaluation', { id: creada.evaluacion.id });
      evTestRequest_('purgeEvaluation', { id: creada.evaluacion.id, confirmacion: 'ELIMINAR' });
    }
  },
  {
    nombre: 'el diagnóstico se ejecuta y devuelve hallazgos accionables',
    ejecutar: function () {
      var datos = evTestOk_(evTestRequest_('diagnose', { profundo: true }), 'diagnose');
      evAssert_(datos.estado, 'debe traer estado general');
      evAssert_(datos.esquema, 'debe traer el informe de esquema');
      for (var i = 0; i < datos.hallazgos.length; i++) {
        evAssert_(datos.hallazgos[i].remedio, 'todo hallazgo debe incluir su remedio');
      }
    }
  }
];

/* -------------------------------- El ejecutor ------------------------------ */

/**
 * Ejecuta la suite. Devuelve `{ total, pasadas, fallidas, milisegundos, resultados }`
 * y borra las evaluaciones que creó, incluso si algo falló.
 */
function evRunTests_() {
  var inicio = evNowMs_();
  var estado = {};
  var resultados = [];
  var pasadas = 0;

  for (var i = 0; i < EV_TESTS.length; i++) {
    var prueba = EV_TESTS[i];
    try {
      prueba.ejecutar(estado);
      resultados.push({ nombre: prueba.nombre, ok: true, motivo: '' });
      pasadas++;
    } catch (error) {
      resultados.push({
        nombre: prueba.nombre, ok: false,
        motivo: String((error && error.message) || error)
      });
    }
  }

  evTestCleanup_(estado);
  return {
    total: EV_TESTS.length,
    pasadas: pasadas,
    fallidas: EV_TESTS.length - pasadas,
    milisegundos: evNowMs_() - inicio,
    resultados: resultados
  };
}

/** Documento de prueba completo, para restaurar el borrador entre pruebas. */
function evTestDocumentoBase_(estado) {
  return {
    id: estado.evaluacionId,
    evaluacion: {
      titulo: EV_TEST_PREFIX + 'Ciclo completo',
      descripcion: 'Prueba automática',
      categoria: 'conocimientos',
      instrucciones: evRichFromPlain_('Lee con atención.'),
      aplicacion: {
        duracionMinutos: 10, puntajeAprobacion: 60, criterioAprobacion: 'porcentaje',
        intentosMaximos: 1, navegacion: 'libre', autoenviarAlExpirar: true
      },
      participante: { visibilidadResultado: 'nota' }
    },
    secciones: [{
      id: 'sc_test_base', titulo: 'Sección 1',
      preguntas: [
        {
          id: 'pr_test_uno', tipo: 'opcion_unica',
          enunciado: evRichFromPlain_('¿Cuánto es 2 + 2?'),
          obligatoria: true, modoPuntaje: 'exacto', puntos: 1,
          opciones: [
            { id: 'op_test_a', texto: evRichFromPlain_('4'), valor: 'a', correcta: true },
            { id: 'op_test_b', texto: evRichFromPlain_('5'), valor: 'b', correcta: false }
          ]
        },
        {
          id: 'pr_test_dos', tipo: 'texto_largo',
          enunciado: evRichFromPlain_('Explica tu razonamiento.'),
          obligatoria: false, modoPuntaje: 'manual', puntos: 2, opciones: []
        }
      ]
    }]
  };
}

/** Borra todo lo que la suite creó. */
function evTestCleanup_(estado) {
  try {
    var evaluaciones = evAll_(EV_SHEET.EVALUACIONES);
    for (var i = 0; i < evaluaciones.length; i++) {
      var titulo = String(evaluaciones[i].titulo || '');
      if (titulo.indexOf(EV_TEST_PREFIX) !== 0 && titulo !== 'Evaluación sin título') continue;
      if (titulo === 'Evaluación sin título' && evaluaciones[i].id !== estado.evaluacionIdVacia) {
        // Solo se borran las «sin título» que la propia suite creó; una del
        // usuario recién creada se respeta.
        continue;
      }
      evTestRequest_('purgeEvaluation', { id: evaluaciones[i].id, confirmacion: 'ELIMINAR' });
    }
  } catch (error) {
    console.warn('[evaluaciones] la limpieza de pruebas dejó restos: ' + (error && error.message));
  }
}

/** Alias para lanzar la suite desde el editor. */
function ejecutarPruebasEvaluaciones() {
  var resultado = evRunTests_();
  console.log(JSON.stringify(resultado, null, 2));
  return resultado;
}
