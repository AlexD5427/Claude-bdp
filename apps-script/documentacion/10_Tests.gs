/**
 * 10_Tests.gs - pruebas del backend.
 *
 * -- Como se prueba sin romper nada -----------------------------------------
 * Creando un libro temporal, ejecutando todo contra el, y borrandolo al acabar.
 * Las pruebas nunca tocan el libro real: probar la instalacion, la
 * deduplicacion o la restauracion sobre los datos de produccion seria justo lo
 * contrario de lo que una prueba deberia hacer.
 *
 * -- Como usarlas ------------------------------------------------------------
 * Menu Documentacion - Ejecutar pruebas, o `docEjecutarPruebas()` desde el
 * editor. Devuelve cuantas pasaron, cuantas fallaron y por que.
 */

var DOC_TEST = { pasadas: 0, fallidas: 0, resultados: [] };

function docTestReset_() {
  DOC_TEST = { pasadas: 0, fallidas: 0, resultados: [] };
}

function docCheck_(nombre, condicion, detalle) {
  if (condicion) {
    DOC_TEST.pasadas++;
    DOC_TEST.resultados.push({ nombre: nombre, ok: true });
  } else {
    DOC_TEST.fallidas++;
    DOC_TEST.resultados.push({ nombre: nombre, ok: false, detalle: detalle || '' });
  }
}

function docCheckEq_(nombre, obtenido, esperado) {
  var iguales = String(obtenido) === String(esperado);
  docCheck_(nombre, iguales, iguales ? '' : ('se esperaba ' + esperado + ' y se obtuvo ' + obtenido));
}

/* ------------------------------ Pruebas puras ----------------------------- */

/** Utilidades de `01_Core.gs`. No necesitan libro. */
function docTestUtilidades_() {
  docCheckEq_('docKey_ quita tildes y mayusculas', docKey_('  Jose  Ramirez '), 'JOSE RAMIREZ');
  docCheckEq_('docKey_ normaliza la enye', docKey_('Muniz'), 'MUNIZ');
  docCheckEq_('docText_ neutraliza formulas', docText_('=SUM(A1:A2)').charAt(0), "'");
  docCheckEq_('docText_ no toca texto normal', docText_('Juan Perez'), 'Juan Perez');
  docCheckEq_('docUntext_ deshace el apostrofo', docUntext_(docText_('=A1')), '=A1');

  docCheckEq_('docDateOnly_ acepta ISO', docDateOnly_('2026-03-15T10:00:00Z'), '2026-03-15');
  docCheckEq_('docDateOnly_ acepta formato latino', docDateOnly_('15/03/2026'), '2026-03-15');
  docCheckEq_('docDateOnly_ acepta ano de dos cifras', docDateOnly_('01/12/24'), '2024-12-01');
  docCheckEq_('docDateOnly_ tolera vacio', docDateOnly_(''), '');

  docCheckEq_('docYearOf_ lee el ano', docYearOf_('2024-07-01'), 2024);
  docCheckEq_('docYearSheetName_ arma el nombre', docYearSheetName_(2026), 'CONTROL INGRESOS 2026');
  docCheckEq_('docYearFromSheetName_ lo deshace', docYearFromSheetName_('CONTROL INGRESOS 2026'), 2026);
  docCheckEq_('docYearFromSheetName_ ignora otras hojas', docYearFromSheetName_('AUDITORIA'), 0);

  docCheckEq_('docBoolOrNull_ entiende SI', docBoolOrNull_('SI'), true);
  docCheckEq_('docBoolOrNull_ entiende NO', docBoolOrNull_('NO'), false);
  docCheck_('docBoolOrNull_ devuelve nulo si no sabe', docBoolOrNull_('quiza') === null);

  docCheckEq_('docNumOrNull_ acepta coma decimal', docNumOrNull_('3,5'), 3.5);
  docCheck_('docHash_ es estable', docHash_('hola') === docHash_('hola'));
  docCheck_('docHash_ distingue', docHash_('hola') !== docHash_('adios'));
  docCheck_('docParseJson_ tolera basura', docParseJson_('{roto', 'reserva') === 'reserva');
}

/** El catalogo de columnas: es la base de todo lo demas. */
function docTestManifiesto_() {
  var columnas = docYearColumns_();
  docCheckEq_('la pestana anual tiene 39 columnas', columnas.length, 39);
  docCheckEq_('la base tiene 23 columnas', DOC_BASE_COLUMNS.length, 23);

  docCheckEq_('se conserva el espacio final de Tipo de Empleado',
    DOC_BASE_COLUMNS[1].encabezado, 'Tipo de Empleado ');
  docCheckEq_('se conserva el espacio final de la carta de prorroga',
    DOC_BASE_COLUMNS[22].encabezado, 'CORREO CARTA DE PRORROGA ');
  docCheck_('la columna L conserva su salto de linea',
    DOC_BASE_COLUMNS[11].encabezado.indexOf('\n') > 0);

  var fianzas = 0;
  for (var i = 0; i < DOC_BASE_COLUMNS.length; i++) {
    if (DOC_BASE_COLUMNS[i].encabezado === 'CONTRATO DE FIANZA') fianzas++;
  }
  docCheckEq_('CONTRATO DE FIANZA aparece dos veces', fianzas, 2);
  docCheckEq_('la segunda es la ocurrencia 2', DOC_BASE_COLUMNS[17].ocurrencia, 2);
  docCheckEq_('y es espejo de la primera', DOC_BASE_COLUMNS[17].espejoDe, 'contrato_fianza');

  var claves = {};
  var repetidas = [];
  for (var c = 0; c < columnas.length; c++) {
    if (claves[columnas[c].clave]) repetidas.push(columnas[c].clave);
    claves[columnas[c].clave] = true;
  }
  docCheckEq_('no hay claves internas repetidas', repetidas.length, 0);

  docCheckEq_('el catalogo trae 31 documentos', DOC_CATALOGO_SEMILLA.length, 31);
  docCheckEq_('docColumnByKey_ encuentra la columna', docColumnByKey_('rejap').encabezado, 'REJAP');
  docCheck_('docYearColumnPosition_ ubica el identificador', docYearColumnPosition_('id') === 24);
}

/** La derivacion de columnas y la semantica de colores. */
function docTestDerivacion_() {
  var dossier = {
    identificador: 'PRUEBA-1',
    nombre: 'Persona De Prueba',
    fechaIngreso: '2026-01-15',
    items: [
      { id: 'rejap', label: 'REJAP', group: 'personal', status: 'presentado', pages: 2 },
      { id: 'titulo-legalizado', label: 'Titulo', group: 'personal', status: 'pendiente', pages: 0 },
      { id: 'garante-ci', label: 'CI garante', group: 'garantia', status: 'presentado', pages: 1 },
      { id: 'garante-inmueble', label: 'Inmueble', group: 'garantia', status: 'presentado', pages: 3 },
      { id: 'garante-folio', label: 'Folio', group: 'garantia', status: 'presentado', pages: 1 },
      { id: 'seguro-vida', label: 'Crediseguro', group: 'personal', status: 'no_aplica', pages: 0 }
    ]
  };

  var valores = docSheetValuesFor_(dossier);
  docCheckEq_('REJAP presentado se traduce a TIENE', valores.rejap, 'TIENE');
  docCheckEq_('el titulo pendiente se traduce a NO TIENE', valores.titulo_legalizado, 'NO TIENE');
  docCheckEq_('la fianza completa se traduce a TIENE', valores.contrato_fianza, 'TIENE');
  docCheckEq_('la columna espejo copia a la original', valores.contrato_fianza_garante, 'TIENE');
  docCheckEq_('lo que no aplica se traduce a N/A', valores.crediseguro, 'N/A');
  docCheckEq_('sin prorrogas la carta queda en guion', valores.correo_carta_prorroga, '_');

  dossier.sheet = { rejap: 'NO TIENE' };
  var conManual = docSheetValuesFor_(dossier);
  docCheckEq_('lo escrito a mano gana sobre lo derivado', conManual.rejap, 'NO TIENE');

  var informe = docComputeReport_(dossier, 3);
  docCheckEq_('los no aplica salen del denominador', informe.aplicables, 5);
  docCheckEq_('se cuentan los presentados', informe.presentados, 4);
  docCheckEq_('el avance es 80 por ciento', informe.avance, 80);
  docCheckEq_('se suman las paginas', informe.paginas, 7);

  docCheckEq_('el expediente completo se pinta de verde',
    docRowTone_({ estado: 'completo', avance: 100 }), DOC_COLOR.FILA_COMPLETA);
  docCheckEq_('el ingreso sin documentos se pinta de celeste',
    docRowTone_({ estado: 'al_dia', avance: 0, presentados: 0 }), DOC_COLOR.FILA_NUEVA);
  docCheckEq_('la prorroga manda sobre el atraso',
    docRowTone_({ estado: 'atrasado', avance: 20, prorroga_hasta: '2026-12-31' }), DOC_COLOR.FILA_PRORROGA);
  docCheckEq_('el observado se pinta de durazno',
    docRowTone_({ estado: 'en_proceso', avance: 40, presentados: 2, observados: 1 }), DOC_COLOR.FILA_GESTION);
}

/** Idas y vueltas entre expediente y fila. */
function docTestMapeo_() {
  var original = {
    identificador: 'CI-123-2026',
    nombre: 'Maria Lopez',
    cargo: 'OFICIAL DE CREDITOS',
    agencia: 'OFICINA NACIONAL',
    gerencia: 'GERENCIA DE NEGOCIOS',
    correo: 'maria@ejemplo.com',
    fechaIngreso: '2026-02-01',
    createdAt: '2026-02-01T10:00:00.000Z',
    items: [
      { id: 'rejap', label: 'REJAP', group: 'personal', status: 'presentado', pages: 1 },
      { id: 'cv', label: 'CV', group: 'personal', status: 'observado', pages: 4, observation: 'falta firma' }
    ],
    emailLog: []
  };

  var fila = docRowFromDossier_(original, 'pruebas', null);
  docCheckEq_('el identificador viaja a la columna', fila.id, 'CI-123-2026');
  docCheckEq_('la oficina sale de agencia', fila.oficina, 'OFICINA NACIONAL');
  docCheckEq_('el proceso incompleto dice FALTA', fila.proceso, 'FALTA');
  docCheckEq_('el avance es 50 por ciento', fila.avance, 50);
  docCheck_('se genera la huella', String(fila.huella).length === 16);

  fila.__anio = 2026;
  var vuelta = docDossierFromRow_(fila);
  docCheckEq_('el nombre sobrevive al viaje', vuelta.nombre, 'Maria Lopez');
  docCheckEq_('el correo sobrevive', vuelta.correo, 'maria@ejemplo.com');
  docCheckEq_('los documentos sobreviven', vuelta.items.length, 2);
  docCheckEq_('la observacion sobrevive', vuelta.items[1].observation, 'falta firma');
  docCheckEq_('las paginas sobreviven', vuelta.items[1].pages, 4);

  var limpio = docCleanDossier_({
    identificador: 'X', nombre: 'Y',
    items: [{ id: 'a', status: 'inventado', pages: '3' }],
    emailLog: []
  });
  docCheckEq_('un estado invalido cae en pendiente', limpio.items[0].status, 'pendiente');
  docCheckEq_('las paginas se normalizan a numero', limpio.items[0].pages, 3);
}

/** Comparacion de estados para la auditoria. */
function docTestAuditoriaPura_() {
  var antes = { items: [{ id: 'rejap', label: 'REJAP', status: 'pendiente', pages: 0 }] };
  var despues = { items: [{ id: 'rejap', label: 'REJAP', status: 'presentado', pages: 2 }] };

  var mapaAntes = docItemsMap_(antes);
  docCheckEq_('los documentos se indexan por id', mapaAntes.rejap.status, 'pendiente');

  var firmaAntes = docItemSignature_(antes.items[0]);
  var firmaDespues = docItemSignature_(despues.items[0]);
  docCheck_('la firma cambia cuando cambia el estado', firmaAntes !== firmaDespues);
  docCheck_('la firma incluye las paginas', firmaDespues.indexOf('2 pag.') >= 0);
  docCheckEq_('un documento vacio da firma vacia', docItemSignature_(null), '');

  var largo = docShorten_(new Array(3000).join('x'));
  docCheck_('los valores largos se recortan', largo.length <= 1800);
}

/**
 * Vocabulario y reglas del modelo normalizado. Tampoco necesitan libro: todo lo
 * que se comprueba aqui son constantes y funciones puras de `11_Domain.gs`.
 */
function docTestModelo_() {
  var hojas = [];
  for (var clave in DOC2_SHEET) {
    if (!DOC2_SHEET.hasOwnProperty(clave)) continue;
    if (clave === 'AUXILIAR') continue;
    hojas.push(DOC2_SHEET[clave]);
  }
  docCheckEq_('el modelo declara 19 hojas normalizadas', hojas.length, 19);
  docCheckEq_('mas la hoja Auxiliar', DOC2_SHEET.AUXILIAR, 'Auxiliar');

  var repetidas = {};
  var duplicadas = 0;
  for (var h = 0; h < hojas.length; h++) {
    if (repetidas[hojas[h]]) duplicadas++;
    repetidas[hojas[h]] = true;
  }
  docCheckEq_('ninguna hoja del modelo repite nombre', duplicadas, 0);

  docCheckEq_('el catalogo canonico trae 31 documentos', DOC2_CATALOGO_SEMILLA.length, 31);
  docCheckEq_('un funcionario general sin garantia exige 18',
    doc2AplicablesDeSemilla_('GENERAL', 'NINGUNA').length, 18);
  docCheckEq_('un comercial con garantia exige 22',
    doc2AplicablesDeSemilla_('COMERCIAL', 'COMERCIAL_1').length, 22);
  docCheckEq_('cumplimiento exige 20',
    doc2AplicablesDeSemilla_('CUMPLIMIENTO', 'NINGUNA').length, 20);
  docCheckEq_('la garantia sola no anade documentos a un general',
    doc2AplicablesDeSemilla_('GENERAL', 'COMERCIAL_1').length, 18);

  docCheck_('de BORRADOR se puede pasar a EN_RECOLECCION',
    doc2TransicionPermitida_('expediente', DOC2_ESTADO_EXPEDIENTE.BORRADOR, DOC2_ESTADO_EXPEDIENTE.EN_RECOLECCION));
  docCheck_('de ARCHIVADO no se vuelve a BORRADOR',
    doc2TransicionPermitida_('expediente', DOC2_ESTADO_EXPEDIENTE.ARCHIVADO, DOC2_ESTADO_EXPEDIENTE.BORRADOR) === false);
  docCheck_('un estado consigo mismo siempre vale',
    doc2TransicionPermitida_('expediente', DOC2_ESTADO_EXPEDIENTE.COMPLETO, DOC2_ESTADO_EXPEDIENTE.COMPLETO));

  docCheckEq_('el estado heredado "presentado" se traduce',
    doc2NormalizarEstadoDocumento_('presentado'), DOC2_ESTADO_DOCUMENTO.ENTREGADO);
  docCheckEq_('y "NO TIENE" tambien',
    doc2NormalizarEstadoDocumento_('NO TIENE'), DOC2_ESTADO_DOCUMENTO.NO_ENTREGADO);

  docCheck_('un admin puede migrar', doc2RolPuede_('admin', DOC2_CAPACIDAD.MIGRAR));
  docCheck_('un auxiliar no puede migrar', doc2RolPuede_('auxiliar', DOC2_CAPACIDAD.MIGRAR) === false);
  docCheck_('un auxiliar si puede editar', doc2RolPuede_('auxiliar', DOC2_CAPACIDAD.EDITAR));
  docCheck_('un invitado no edita', doc2RolPuede_('invitado', DOC2_CAPACIDAD.EDITAR) === false);
  docCheck_('un rol inventado cae en invitado',
    doc2CapacidadesDe_('duenio-del-banco').length === doc2CapacidadesDe_('invitado').length);

  docCheckEq_('hay cuatro migraciones declaradas', DOC2_MIGRACIONES.length, 4);
  docCheckEq_('y la primera es la estructural', DOC2_MIGRACIONES[0].version, '4.0.0-estructura');
}

/* --------------------------- Pruebas con libro real ----------------------- */

/**
 * Instalacion completa sobre un libro temporal.
 *
 * Se crea, se prueba y se borra en la misma ejecucion. Si algo falla a mitad, el
 * bloque `finally` lo borra igual: dejar libros de prueba tirados en el Drive de
 * alguien es una falta de respeto.
 */
function docTestIntegracion_() {
  var temporal = null;
  var idOriginal = docProp_(DOC_PROP.SPREADSHEET_ID, '');

  try {
    temporal = SpreadsheetApp.create('PRUEBAS Documentacion ' + Date.now());
    docSetProp_(DOC_PROP.SPREADSHEET_ID, temporal.getId());
    docStoreReset_();
    docYearsReset_();

    docInstallSchema_('pruebas', [2025]);
    docStoreReset_();
    docYearsReset_();

    docCheck_('el libro queda instalado', docIsInstalled_());

    var anios = docListYears_();
    docCheck_('se creo la pestana del ano en curso', anios.indexOf(new Date().getFullYear()) >= 0);
    docCheck_('se creo la pestana pedida', anios.indexOf(2025) >= 0);

    var hoja = temporal.getSheetByName(docYearSheetName_(new Date().getFullYear()));
    docCheck_('la pestana anual existe', !!hoja);
    docCheckEq_('sin filas al empezar', Math.max(hoja.getLastRow() - 1, 0), 0);

    var mapa = docYearIndex_(hoja);
    docCheckEq_('no falta ninguna columna', mapa.faltan.length, 0);
    docCheck_('las dos fianzas apuntan a columnas distintas',
      mapa.indice.contrato_fianza !== mapa.indice.contrato_fianza_garante);

    docCheckEq_('la fila de encabezado mide 114 px', hoja.getRowHeight(1), 114);
    docCheckEq_('el encabezado de la A tiene el azul oscuro',
      String(hoja.getRange(1, 1).getBackground()).toLowerCase(), DOC_COLOR.HEADER_BASE_BG);
    docCheckEq_('el encabezado de la P tiene el azul medio',
      String(hoja.getRange(1, 16).getBackground()).toLowerCase(), DOC_COLOR.HEADER_DOCS_BG);
    docCheckEq_('la primera fila esta congelada', hoja.getFrozenRows(), 1);

    // Alta.
    var alta = docUpsertDossier_({
      identificador: 'CI-999-2026',
      nombre: 'Persona De Prueba Uno',
      cargo: 'OFICIAL MYPE',
      agencia: 'AGENCIA SUR',
      gerencia: 'GERENCIA DE NEGOCIOS',
      correo: 'prueba@ejemplo.com',
      fechaIngreso: docFormatDate_(new Date()),
      items: [
        { id: 'rejap', label: 'REJAP', group: 'personal', status: 'presentado', pages: 1 },
        { id: 'cv', label: 'CV', group: 'personal', status: 'pendiente', pages: 0 }
      ],
      emailLog: []
    }, 'pruebas', 'test');
    docCommit_();
    docYearsCommit_();

    docCheck_('el alta se registra como nueva', alta.creado === true);
    docCheckEq_('el avance del alta es 50', alta.resumen.avance, 50);

    docYearsReset_();
    var listado = docListDossiers_({ todos: true, detalle: true });
    docCheckEq_('el expediente aparece en el listado', listado.total, 1);
    docCheckEq_('con su nombre', listado.expedientes[0].nombre, 'Persona De Prueba Uno');
    docCheckEq_('y con sus documentos', listado.expedientes[0].items.length, 2);

    // Edicion.
    var editado = listado.expedientes[0];
    editado.items[1].status = 'presentado';
    editado.items[1].pages = 5;
    var edicion = docUpsertDossier_(editado, 'pruebas', 'test');
    docCommit_();
    docYearsCommit_();
    docCheck_('la edicion no crea una fila nueva', edicion.creado === false);
    docCheckEq_('el avance sube al 100', edicion.resumen.avance, 100);
    docCheckEq_('y el proceso pasa a COMPLETO', edicion.resumen.proceso, 'COMPLETO');

    docStoreReset_();
    docYearsReset_();
    var auditoria = docAuditQuery_({ limite: 100 });
    docCheck_('la auditoria registro movimientos', auditoria.devueltos > 0);
    var hayCambioDocumento = false;
    for (var a = 0; a < auditoria.eventos.length; a++) {
      if (auditoria.eventos[a].accion === DOC_ACCION.DOCUMENTO) hayCambioDocumento = true;
    }
    docCheck_('se anoto el cambio de un documento concreto', hayCambioDocumento);

    // Respaldo y restauracion.
    var respaldo = docBackup_('prueba', 'pruebas');
    docCommit_();
    docCheckEq_('el respaldo guarda el expediente', respaldo.expedientes, 1);

    docStoreReset_();
    docYearsReset_();
    docDeleteDossier_('CI-999-2026', null, 'pruebas', 'test');
    docCommit_();
    docYearsReset_();
    docCheckEq_('tras la baja no queda nada', docListDossiers_({ todos: true }).total, 0);

    docStoreReset_();
    docYearsReset_();
    var restauracion = docRestore_(respaldo.id, 'pruebas', 'test');
    docCommit_();
    docYearsCommit_();
    docCheckEq_('la restauracion devuelve el expediente', restauracion.restaurados, 1);

    docStoreReset_();
    docYearsReset_();
    docCheckEq_('y vuelve a estar en el listado', docListDossiers_({ todos: true }).total, 1);

    // Diagnostico.
    docStoreReset_();
    docYearsReset_();
    var diagnostico = docDiagnose_();
    docCheck_('el diagnostico no encuentra nada critico', diagnostico.criticos === 0);
    docCheckEq_('y cuenta el expediente', diagnostico.resumen.expedientes, 1);

    // Idempotencia de la instalacion.
    docStoreReset_();
    docYearsReset_();
    docInstallSchema_('pruebas', []);
    docCommit_();
    docStoreReset_();
    docYearsReset_();
    docCheckEq_('reinstalar no duplica expedientes', docListDossiers_({ todos: true }).total, 1);

    // Modelo normalizado sobre este mismo libro, que ya tiene un expediente
    // heredado: es justo el escenario de la migracion real.
    docStoreReset_();
    docYearsReset_();
    doc2Reset_();

    var simulacion = doc2Migrar_({ simular: true }, doc2CtxActual_('pruebas'));
    docCheck_('la simulacion no escribe nada', simulacion.simulado === true);
    docCheck_('y anuncia que hay algo que migrar', simulacion.ejecutadas.length > 0);
    docCheck_('sin escribir, la hoja Expedientes todavia no existe',
      docSpreadsheet_().getSheetByName(DOC2_SHEET.EXPEDIENTES) === null);

    doc2Reset_();
    var instalacion = doc2Instalar_({ conRespaldo: false }, doc2CtxActual_('pruebas'));
    docCheck_('la instalacion del modelo crea hojas', instalacion.hojas.length > 0);

    doc2Reset_();
    var expedientes = doc2All_(DOC2_SHEET.EXPEDIENTES, true);
    docCheckEq_('el expediente heredado se migro', expedientes.length, 1);
    docCheckEq_('conservando su identificador', expedientes[0].identificador, 'CI-999-2026');
    var requisitos = doc2By_(DOC2_SHEET.EXPEDIENTE_DOCS, 'expediente_id', expedientes[0].expediente_id, true);
    docCheck_('con sus requisitos derivados del catalogo', requisitos.length >= 18);
    docCheckEq_('el catalogo quedo sembrado',
      doc2All_(DOC2_SHEET.CATALOGO, true).length, DOC2_CATALOGO_SEMILLA.length);

    doc2Reset_();
    var panel = doc2Panel_({}, doc2CtxActual_('pruebas'));
    docCheckEq_('el panel cuenta el expediente', panel.expedientes, 1);
    docCheck_('y el embudo ve los requisitos', panel.embudo.total >= 18);

    // Segunda pasada: la migracion es idempotente.
    doc2Reset_();
    var repetida = doc2Migrar_({}, doc2CtxActual_('pruebas'));
    docCheckEq_('volver a migrar no ejecuta nada', repetida.ejecutadas.length, 0);
    doc2Reset_();
    docCheckEq_('ni duplica expedientes', doc2All_(DOC2_SHEET.EXPEDIENTES, true).length, 1);

    doc2Reset_();
    var diagnosticoModelo = doc2Diagnostico_(doc2CtxActual_('pruebas'));
    docCheckEq_('el diagnostico del modelo no ve nada critico', diagnosticoModelo.conteos.CRITICO, 0);

  } catch (error) {
    docCheck_('la prueba de integracion termina sin excepciones', false, docClassify_(error).message);
  } finally {
    try {
      if (temporal) DriveApp.getFileById(temporal.getId()).setTrashed(true);
    } catch (e) { /* el libro temporal quedara en la papelera */ }
    docSetProp_(DOC_PROP.SPREADSHEET_ID, idOriginal);
    docStoreReset_();
    docYearsReset_();
  }
}

/* --------------------------------- Ejecutor ------------------------------- */

/**
 * Ejecuta toda la bateria.
 *
 * `docEjecutarPruebas(true)` salta la prueba de integracion, que tarda cerca de
 * un minuto porque crea y borra un libro de verdad.
 */
function docEjecutarPruebas(soloRapidas) {
  docTestReset_();
  docLogReset_('pruebas');

  docTestUtilidades_();
  docTestManifiesto_();
  docTestDerivacion_();
  docTestMapeo_();
  docTestAuditoriaPura_();
  docTestModelo_();

  if (soloRapidas !== true) docTestIntegracion_();

  var informe = {
    pasadas: DOC_TEST.pasadas,
    fallidas: DOC_TEST.fallidas,
    total: DOC_TEST.pasadas + DOC_TEST.fallidas,
    resultados: DOC_TEST.resultados
  };
  try { console.log(docFormatTestReport_(informe)); } catch (e) { /* sin consola */ }
  return informe;
}

/** Informe legible para el cuadro de dialogo del menu. */
function docFormatTestReport_(informe) {
  var lineas = [informe.pasadas + ' de ' + informe.total + ' comprobaciones pasaron.'];
  if (informe.fallidas > 0) {
    lineas.push('');
    lineas.push('Fallaron ' + informe.fallidas + ':');
    for (var i = 0; i < informe.resultados.length; i++) {
      if (informe.resultados[i].ok) continue;
      lineas.push('- ' + informe.resultados[i].nombre +
        (informe.resultados[i].detalle ? ' (' + informe.resultados[i].detalle + ')' : ''));
    }
  } else {
    lineas.push('Todo correcto.');
  }
  return lineas.join('\n');
}
