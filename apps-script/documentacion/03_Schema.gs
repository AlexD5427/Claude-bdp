/**
 * 03_Schema.gs — instalar, verificar y reparar. Nunca destruir.
 *
 * Tres operaciones sobre el libro, todas derivadas de `00_Manifest.gs`:
 *
 *   verificar   compara libro y esquema y devuelve un informe. No escribe nada.
 *   instalar    crea lo que falte con su formato completo. Idempotente.
 *   reparar     añade AL FINAL lo que falte y corrige el formato, sin mover ni
 *               borrar datos.
 *
 * ── La regla que gobierna las tres ─────────────────────────────────────────
 * Jamás se destruye información. Las columnas que alguien haya añadido a mano se
 * respetan, el orden de las existentes no se toca y las filas no se reordenan
 * nunca. Este libro es el instrumento de trabajo de una persona; el backend es
 * un invitado en él.
 *
 * ── Por qué el formato importa tanto aquí ─────────────────────────────────
 * El acuerdo con el área es que puede seguir trabajando en Sheets cuando quiera.
 * Eso solo se sostiene si la hoja que genera el sistema se ve EXACTAMENTE como
 * la que venía usando: mismos encabezados, mismos colores, mismos anchos, mismo
 * formato condicional. Si se ve distinta, deja de reconocerla y el acuerdo se
 * rompe. De ahí que este archivo dedique tanto espacio a píxeles y colores.
 */

/* ------------------------------ ¿Instalado? ------------------------------- */

/** Comprobación barata: ¿existen las hojas imprescindibles? */
function docIsInstalled_() {
  try {
    var ss = docSpreadsheet_();
    if (!ss.getSheetByName(DOC_SHEET.AUDITORIA)) return false;
    if (!ss.getSheetByName(DOC_SHEET.CATALOGO)) return false;
    if (!ss.getSheetByName(DOC_SHEET.CONFIG)) return false;
    return docListYears_().length > 0;
  } catch (e) {
    return false;
  }
}

/** Exige que esté instalado antes de operar. */
function docRequireInstalled_() {
  if (docIsInstalled_()) return;
  throw docError_(DOC_CODE.NOT_INSTALLED, '', { details: { accion: 'instalar' } });
}

/** Años con pestaña en el libro, de más reciente a más antiguo. */
function docListYears_() {
  var ss = docSpreadsheet_();
  var hojas = ss.getSheets();
  var anios = [];
  for (var i = 0; i < hojas.length; i++) {
    var anio = docYearFromSheetName_(hojas[i].getName());
    if (anio) anios.push(anio);
  }
  anios.sort(function (a, b) { return b - a; });
  return anios;
}

/* ------------------------------- Verificación ----------------------------- */

/**
 * Informe del estado del libro. No lanza nunca: su trabajo es explicar el
 * problema, no propagarlo.
 */
function docVerifySchema_() {
  var informe = {
    ok: true,
    instalado: true,
    esquema: DOC_BACKEND.schemaVersion,
    libroId: '',
    libroNombre: '',
    hojas: [],
    hojasFaltantes: [],
    hojasAReparar: [],
    anios: [],
    aniosAReparar: []
  };

  var ss;
  try {
    ss = docSpreadsheet_();
    informe.libroId = ss.getId ? ss.getId() : '';
    informe.libroNombre = ss.getName ? ss.getName() : '';
  } catch (error) {
    informe.ok = false;
    informe.instalado = false;
    informe.problema = docClassify_(error).message;
    return informe;
  }

  for (var s = 0; s < DOC_SHEET_ORDER.length; s++) {
    var nombre = DOC_SHEET_ORDER[s];
    var esperados = docColumnNames_(nombre);
    var hoja = ss.getSheetByName(nombre);
    if (!hoja) {
      informe.ok = false;
      informe.instalado = false;
      informe.hojasFaltantes.push(nombre);
      informe.hojas.push({
        hoja: nombre, existe: false, filas: 0,
        columnasFaltantes: esperados.slice(), columnasExtra: [],
        describe: DOC_SCHEMA[nombre].describe
      });
      continue;
    }
    var estado = docInspectSheet_(hoja, esperados);
    if (estado.columnasFaltantes.length > 0) {
      informe.ok = false;
      informe.hojasAReparar.push(nombre);
    }
    informe.hojas.push({
      hoja: nombre,
      existe: true,
      filas: Math.max(0, hoja.getLastRow() - 1),
      columnasFaltantes: estado.columnasFaltantes,
      columnasExtra: estado.columnasExtra,
      describe: DOC_SCHEMA[nombre].describe
    });
  }

  var anios = docListYears_();
  if (!anios.length) {
    informe.ok = false;
    informe.instalado = false;
  }
  for (var a = 0; a < anios.length; a++) {
    var hojaAnual = ss.getSheetByName(docYearSheetName_(anios[a]));
    var faltan = docYearMissingColumns_(hojaAnual);
    informe.anios.push({
      anio: anios[a],
      hoja: docYearSheetName_(anios[a]),
      filas: Math.max(0, hojaAnual.getLastRow() - 1),
      columnasFaltantes: faltan
    });
    if (faltan.length) {
      informe.ok = false;
      informe.aniosAReparar.push(anios[a]);
    }
  }

  return informe;
}

/** Compara los encabezados de una hoja de sistema con los esperados. */
function docInspectSheet_(hoja, esperados) {
  var ultima = hoja.getLastColumn();
  var encabezados = [];
  if (ultima > 0) {
    var crudo = hoja.getRange(1, 1, 1, ultima).getValues()[0];
    for (var i = 0; i < crudo.length; i++) {
      var h = String(crudo[i] === null || crudo[i] === undefined ? '' : crudo[i]).trim();
      if (h) encabezados.push(h);
    }
  }
  var faltan = [];
  for (var e = 0; e < esperados.length; e++) {
    if (encabezados.indexOf(esperados[e]) < 0) faltan.push(esperados[e]);
  }
  var extra = [];
  for (var x = 0; x < encabezados.length; x++) {
    if (esperados.indexOf(encabezados[x]) < 0) extra.push(encabezados[x]);
  }
  return { columnasFaltantes: faltan, columnasExtra: extra };
}

/**
 * Columnas que le faltan a una pestaña anual.
 *
 * Se cuenta por APARICIONES, no por presencia: «CONTRATO DE FIANZA» tiene que
 * estar dos veces, y una hoja con una sola le falta una.
 */
function docYearMissingColumns_(hoja) {
  var columnas = docYearColumns_();
  var ultima = hoja.getLastColumn();
  var conteo = {};
  if (ultima > 0) {
    var crudo = hoja.getRange(1, 1, 1, ultima).getValues()[0];
    for (var i = 0; i < crudo.length; i++) {
      var clave = docKey_(crudo[i]);
      if (clave) conteo[clave] = (conteo[clave] || 0) + 1;
    }
  }
  var necesarias = {};
  for (var c = 0; c < columnas.length; c++) {
    var k = docKey_(columnas[c].encabezado);
    necesarias[k] = Math.max(necesarias[k] || 0, columnas[c].ocurrencia || 1);
  }
  var faltan = [];
  for (var d = 0; d < columnas.length; d++) {
    var kk = docKey_(columnas[d].encabezado);
    if ((conteo[kk] || 0) < (columnas[d].ocurrencia || 1)) faltan.push(columnas[d].encabezado);
  }
  return faltan;
}

/* ------------------------- Instalación y reparación ---------------------- */

/**
 * Deja el libro listo para operar.
 *
 * Devuelve el detalle de cada acción para que la interfaz pueda decir
 * exactamente qué cambió, en vez de un «hecho» sin contenido.
 */
function docInstallSchema_(actor, aniosExtra) {
  var ss = docSpreadsheet_();
  DOC_STORE.allowCreate = true;
  var acciones = [];

  for (var s = 0; s < DOC_SHEET_ORDER.length; s++) {
    var nombre = DOC_SHEET_ORDER[s];
    var esperados = docColumnNames_(nombre);
    var hoja = ss.getSheetByName(nombre);

    if (!hoja) {
      hoja = ss.insertSheet(nombre);
      hoja.getRange(1, 1, 1, esperados.length).setValues([esperados]);
      acciones.push({ hoja: nombre, accion: 'creada', columnas: esperados.length });
    } else {
      var estado = docInspectSheet_(hoja, esperados);
      if (estado.columnasFaltantes.length > 0) {
        var desde = Math.max(hoja.getLastColumn(), 0) + 1;
        docEnsureColumns_(hoja, desde + estado.columnasFaltantes.length - 1);
        hoja.getRange(1, desde, 1, estado.columnasFaltantes.length)
          .setValues([estado.columnasFaltantes]);
        acciones.push({ hoja: nombre, accion: 'columnas añadidas', columnas: estado.columnasFaltantes });
      } else {
        acciones.push({ hoja: nombre, accion: 'sin cambios' });
      }
    }
    docStyleSystemSheet_(hoja, nombre);
  }

  // El caché de encabezados de la petición ya no vale: hay columnas nuevas.
  DOC_STORE.loaded = {};
  DOC_STORE.pending = {};

  // Pestañas anuales: siempre la del año en curso, más las que pidan.
  var anios = [new Date().getFullYear()];
  if (aniosExtra && aniosExtra.length) {
    for (var x = 0; x < aniosExtra.length; x++) {
      var n = docInt_(aniosExtra[x], 0);
      if (n >= 2000 && n <= 2999 && anios.indexOf(n) < 0) anios.push(n);
    }
  }
  var existentes = docListYears_();
  for (var y = 0; y < existentes.length; y++) {
    if (anios.indexOf(existentes[y]) < 0) anios.push(existentes[y]);
  }
  anios.sort(function (a, b) { return b - a; });
  for (var i = 0; i < anios.length; i++) {
    acciones.push(docEnsureYearSheet_(anios[i]));
  }

  docSeedCatalogo_();
  docSeedConfig_();
  docOrderSheets_();

  docMetaSet_('esquema', String(DOC_BACKEND.schemaVersion));
  docMetaSet_('backend', DOC_BACKEND.version);
  docMetaSet_('instalado_en', docNow_());
  docMetaSet_('instalado_por', docText_(actor || 'script', 200));
  docCommit_();
  DOC_STORE.allowCreate = false;

  docInfo_('Esquema instalado o reparado.', { acciones: acciones.length, anios: anios });
  return { acciones: acciones, informe: docVerifySchema_() };
}

/** Lee un metadato de instalación. */
function docMetaGet_(clave, porDefecto) {
  var fila = docById_(DOC_SHEET.META, clave);
  return fila ? fila.valor : porDefecto;
}

/** Escribe un metadato de instalación. */
function docMetaSet_(clave, valor) {
  docPut_(DOC_SHEET.META, {
    clave: String(clave),
    valor: typeof valor === 'string' ? valor : docWriteJson_(valor),
    actualizado_en: docNow_()
  });
}

/** Se asegura de que la hoja tenga al menos `n` columnas físicas. */
function docEnsureColumns_(hoja, n) {
  try {
    var actuales = hoja.getMaxColumns();
    if (actuales < n) hoja.insertColumnsAfter(actuales, n - actuales);
  } catch (e) { /* algunas hojas no admiten crecer; el error real saldrá al escribir */ }
}

/** Se asegura de que la hoja tenga al menos `n` filas físicas. */
function docEnsureRows_(hoja, n) {
  try {
    var actuales = hoja.getMaxRows();
    if (actuales < n) hoja.insertRowsAfter(actuales, n - actuales);
  } catch (e) { /* idem */ }
}

/* ------------------------- Pestañas anuales: creación --------------------- */

/**
 * Crea la pestaña de un año si no existe, y la deja siempre con el formato
 * correcto exista o no.
 *
 * Es idempotente a propósito: se llama en cada instalación, en cada reparación
 * y la primera vez que se guarda un expediente de un año nuevo. Que se pueda
 * llamar sin miedo es lo que permite que el 1 de enero no haya que hacer nada.
 */
function docEnsureYearSheet_(anio) {
  var ss = docSpreadsheet_();
  var nombre = docYearSheetName_(anio);
  var hoja = ss.getSheetByName(nombre);
  var columnas = docYearColumns_();
  var creada = false;

  if (!hoja) {
    hoja = ss.insertSheet(nombre);
    creada = true;
  }

  docEnsureColumns_(hoja, columnas.length);
  docEnsureRows_(hoja, 200);

  var faltan = docYearMissingColumns_(hoja);
  if (creada) {
    var encabezados = [];
    for (var c = 0; c < columnas.length; c++) encabezados.push(columnas[c].encabezado);
    hoja.getRange(1, 1, 1, columnas.length).setValues([encabezados]);
  } else if (faltan.length) {
    var desde = Math.max(hoja.getLastColumn(), 0) + 1;
    docEnsureColumns_(hoja, desde + faltan.length - 1);
    hoja.getRange(1, desde, 1, faltan.length).setValues([faltan]);
  }

  docStyleYearSheet_(hoja);

  return {
    hoja: nombre,
    accion: creada ? 'creada' : (faltan.length ? 'columnas añadidas' : 'formato revisado'),
    columnas: faltan.length ? faltan : columnas.length
  };
}

/**
 * Aplica a una pestaña anual el formato del libro original.
 *
 * Cada valor de aquí salió de medir el archivo real, no de un criterio estético:
 *
 *   · encabezado A..O sobre #1F3864 (azul «Accent5, más oscuro 50 %») en blanco,
 *     negrita y cursiva; P..W sobre #4472C4 (el mismo Accent5 sin oscurecer);
 *   · fila 1 de 114 px — los 85,5 puntos del original— con ajuste de texto;
 *   · fila 1 congelada y filtro sobre toda la tabla;
 *   · anchos convertidos columna por columna desde los caracteres del Excel.
 *
 * Todo va protegido: si una llamada de formato falla (hojas muy grandes, cuota
 * al límite), los datos ya están bien y no tiene sentido tumbar la operación
 * por un color.
 */
function docStyleYearSheet_(hoja) {
  var columnas = docYearColumns_();
  var total = columnas.length;

  try { hoja.setFrozenRows(1); } catch (e) { /* opcional */ }
  try { hoja.setFrozenColumns(1); } catch (e) { /* opcional */ }

  // Encabezado: tres bloques con el color que le corresponde a cada uno.
  try {
    var bloques = [
      { desde: 1, hasta: 9, fondo: DOC_COLOR.HEADER_BASE_BG, cursiva: true },
      { desde: 10, hasta: 15, fondo: DOC_COLOR.HEADER_BASE_BG, cursiva: true },
      { desde: 16, hasta: 23, fondo: DOC_COLOR.HEADER_DOCS_BG, cursiva: true },
      { desde: 24, hasta: total, fondo: DOC_COLOR.HEADER_MODULO_BG, cursiva: false }
    ];
    for (var b = 0; b < bloques.length; b++) {
      var bl = bloques[b];
      if (bl.hasta < bl.desde) continue;
      hoja.getRange(1, bl.desde, 1, bl.hasta - bl.desde + 1)
        .setBackground(bl.fondo)
        .setFontColor(DOC_COLOR.HEADER_FG)
        .setFontFamily('Calibri')
        .setFontSize(12)
        .setFontWeight('bold')
        .setFontStyle(bl.cursiva ? 'italic' : 'normal')
        .setWrap(true)
        .setVerticalAlignment('middle')
        .setHorizontalAlignment('center');
    }
    hoja.setRowHeight(1, 114);
  } catch (e) { /* opcional */ }

  // Alineación de los encabezados que en el original van a la izquierda.
  try {
    for (var i = 0; i < columnas.length; i++) {
      if (columnas[i].alineacion === 'left' && columnas[i].grupo === 'base') {
        hoja.getRange(1, i + 1).setHorizontalAlignment('left');
      }
    }
  } catch (e) { /* opcional */ }

  // Anchos, alineación del cuerpo y formato de fecha.
  try {
    for (var c = 0; c < columnas.length; c++) {
      var col = columnas[c];
      hoja.setColumnWidth(c + 1, col.ancho || 130);
      var cuerpo = hoja.getRange(2, c + 1, Math.max(hoja.getMaxRows() - 1, 1), 1);
      cuerpo.setHorizontalAlignment(col.alineacion || 'left');
      cuerpo.setVerticalAlignment('middle');
      cuerpo.setFontFamily('Calibri');
      cuerpo.setFontSize(11);
      if (col.formato) cuerpo.setNumberFormat(col.formato);
      if (col.clave === 'observacion' || col.clave === 'nombre' || col.clave === 'cargo') {
        cuerpo.setWrap(true);
      }
    }
  } catch (e) { /* opcional */ }

  // La columna «Proceso» lleva su fondo azul claro, como en el original.
  try {
    var iProceso = docYearColumnPosition_('proceso');
    if (iProceso > 0) {
      hoja.getRange(2, iProceso, Math.max(hoja.getMaxRows() - 1, 1), 1)
        .setBackground(DOC_COLOR.PROCESO_BG);
    }
  } catch (e) { /* opcional */ }

  docApplyYearValidations_(hoja);
  docApplyYearConditionalFormats_(hoja);
  docApplyYearFilter_(hoja, total);

  try {
    hoja.getRange(1, 1, Math.max(hoja.getLastRow(), 1), total)
      .setBorder(true, true, true, true, true, true, DOC_COLOR.BORDE, SpreadsheetApp.BorderStyle.SOLID);
  } catch (e) { /* opcional */ }

  return true;
}

/** Posición (1-based) de una columna anual por su clave interna. */
function docYearColumnPosition_(clave) {
  var columnas = docYearColumns_();
  for (var i = 0; i < columnas.length; i++) {
    if (columnas[i].clave === clave) return i + 1;
  }
  return 0;
}

/**
 * Listas desplegables.
 *
 * Se instalan con `setAllowInvalid(true)` deliberadamente. El libro real tiene
 * celdas con «tiene (solo fot)», «ES TECNICO» o «NO PRESENTO (PASIVO)»: matices
 * que la persona necesita escribir. Una validación estricta los prohibiría y la
 * obligaría a pelear con la herramienta. Así la lista ayuda a teclear rápido y
 * marca lo raro con un triángulo, sin bloquear a nadie.
 */
function docApplyYearValidations_(hoja) {
  var columnas = docYearColumns_();
  var filas = Math.max(hoja.getMaxRows() - 1, 1);
  for (var i = 0; i < columnas.length; i++) {
    var col = columnas[i];
    if (!col.lista) continue;
    var opciones = DOC_LISTAS[col.lista];
    if (!opciones) continue;
    try {
      var regla = SpreadsheetApp.newDataValidation()
        .requireValueInList(opciones, true)
        .setAllowInvalid(true)
        .setHelpText('Valores habituales: ' + opciones.join(' · ') + '. Puedes escribir una nota distinta si hace falta.')
        .build();
      hoja.getRange(2, i + 1, filas, 1).setDataValidation(regla);
    } catch (e) { /* opcional */ }
  }
}

/**
 * Formato condicional, copiado del libro original.
 *
 *   Proceso  «COMPLETO» → verde   · «FALTA» → rojo
 *   Documentos  «NO TIENE» → rojo · «TIENE» → verde · «PRORROGA» → ámbar
 *
 * En el archivo original estas reglas están troceadas en más de sesenta rangos
 * sueltos, resultado de años de copiar y pegar filas. Aquí se declaran una vez
 * por columna sobre el rango completo: mismo efecto visual, mantenible.
 */
function docApplyYearConditionalFormats_(hoja) {
  try {
    var filas = Math.max(hoja.getMaxRows() - 1, 1);
    var reglas = [];

    var iProceso = docYearColumnPosition_('proceso');
    if (iProceso > 0) {
      var rProceso = [hoja.getRange(2, iProceso, filas, 1)];
      reglas.push(SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains('COMPLETO')
        .setBackground(DOC_COLOR.CF_OK_BG).setFontColor(DOC_COLOR.CF_OK_FG)
        .setRanges(rProceso).build());
      reglas.push(SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains('FALTA')
        .setBackground(DOC_COLOR.CF_MAL_BG).setFontColor(DOC_COLOR.CF_MAL_FG)
        .setRanges(rProceso).build());
    }

    var docs = docDocumentColumns_();
    var rangosDoc = [];
    for (var d = 0; d < docs.length; d++) {
      var pos = docYearColumnPosition_(docs[d].clave);
      if (pos > 0) rangosDoc.push(hoja.getRange(2, pos, filas, 1));
    }
    if (rangosDoc.length) {
      // «NO TIENE» va primero: contiene «TIENE», y la primera regla que casa gana.
      reglas.push(SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains('NO TIENE')
        .setBackground(DOC_COLOR.CF_MAL_BG).setFontColor(DOC_COLOR.CF_MAL_FG)
        .setRanges(rangosDoc).build());
      reglas.push(SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains('PRORROGA')
        .setBackground(DOC_COLOR.CF_AVISO_BG).setFontColor(DOC_COLOR.CF_AVISO_FG)
        .setRanges(rangosDoc).build());
      reglas.push(SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo('TIENE')
        .setBackground(DOC_COLOR.CF_OK_BG).setFontColor(DOC_COLOR.CF_OK_FG)
        .setRanges(rangosDoc).build());
    }

    var iEstado = docYearColumnPosition_('estado');
    if (iEstado > 0) {
      var rEstado = [hoja.getRange(2, iEstado, filas, 1)];
      reglas.push(SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo('completo')
        .setBackground(DOC_COLOR.CF_OK_BG).setFontColor(DOC_COLOR.CF_OK_FG)
        .setRanges(rEstado).build());
      reglas.push(SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo('atrasado')
        .setBackground(DOC_COLOR.CF_MAL_BG).setFontColor(DOC_COLOR.CF_MAL_FG)
        .setRanges(rEstado).build());
      reglas.push(SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo('en_proceso')
        .setBackground(DOC_COLOR.CF_AVISO_BG).setFontColor(DOC_COLOR.CF_AVISO_FG)
        .setRanges(rEstado).build());
    }

    hoja.setConditionalFormatRules(reglas);
  } catch (e) { /* opcional */ }
}

/** Rehace el filtro sobre toda la tabla. */
function docApplyYearFilter_(hoja, total) {
  try {
    var actual = hoja.getFilter();
    if (actual) actual.remove();
  } catch (e) { /* no había filtro */ }
  try {
    var filas = Math.max(hoja.getLastRow(), 2);
    hoja.getRange(1, 1, filas, total).createFilter();
  } catch (e) { /* opcional */ }
}

/* -------------------------- Hojas de sistema: estilo ---------------------- */

/**
 * Presentación de una hoja de sistema. Sobria a propósito: estas hojas se leen
 * cuando algo va mal, y lo que se necesita entonces es poder recorrerlas rápido.
 */
function docStyleSystemSheet_(hoja, nombre) {
  var spec = DOC_SCHEMA[nombre];
  if (!spec) return;
  try { hoja.setFrozenRows(1); } catch (e) { /* opcional */ }
  try {
    hoja.getRange(1, 1, 1, Math.max(spec.columns.length, hoja.getLastColumn()))
      .setBackground(nombre === DOC_SHEET.ENTREGAS ? DOC_COLOR.HEADER_BASE_BG : DOC_COLOR.HEADER_MODULO_BG)
      .setFontColor(DOC_COLOR.HEADER_FG)
      .setFontWeight('bold')
      .setWrap(true)
      .setVerticalAlignment('middle');
    hoja.setRowHeight(1, nombre === DOC_SHEET.ENTREGAS ? 44 : 34);
  } catch (e) { /* opcional */ }
  try {
    for (var c = 0; c < spec.columns.length; c++) {
      hoja.setColumnWidth(c + 1, spec.columns[c].width || 160);
    }
  } catch (e) { /* opcional */ }
  if (DOC_HIDDEN_SHEETS.indexOf(nombre) >= 0) {
    try { hoja.hideSheet(); } catch (e) { /* opcional */ }
  }
}

/** Pone las pestañas en un orden legible: años primero, sistema al final. */
function docOrderSheets_() {
  try {
    var ss = docSpreadsheet_();
    var anios = docListYears_();
    var posicion = 1;
    for (var a = 0; a < anios.length; a++) {
      var hoja = ss.getSheetByName(docYearSheetName_(anios[a]));
      if (!hoja) continue;
      ss.setActiveSheet(hoja);
      ss.moveActiveSheet(posicion++);
    }
    var visibles = [DOC_SHEET.ENTREGAS, DOC_SHEET.AUDITORIA];
    for (var v = 0; v < visibles.length; v++) {
      var hv = ss.getSheetByName(visibles[v]);
      if (!hv) continue;
      ss.setActiveSheet(hv);
      ss.moveActiveSheet(posicion++);
    }
    var primera = ss.getSheetByName(docYearSheetName_(anios[0]));
    if (primera) ss.setActiveSheet(primera);
  } catch (e) { /* opcional */ }
}

/* --------------------------------- Semillas ------------------------------- */

/** Siembra el catálogo de documentos la primera vez. Nunca pisa lo editado. */
function docSeedCatalogo_() {
  var existentes = docAll_(DOC_SHEET.CATALOGO);
  if (existentes.length > 0) return 0;
  var creados = 0;
  for (var i = 0; i < DOC_CATALOGO_SEMILLA.length; i++) {
    var d = DOC_CATALOGO_SEMILLA[i];
    docPut_(DOC_SHEET.CATALOGO, {
      id: d.id,
      etiqueta: d.etiqueta,
      grupo: d.grupo,
      orden: (i + 1) * 10,
      columna_libro: d.columna || '',
      permite_prorroga: !!d.prorroga,
      obligatorio: !!d.obligatorio,
      activo: true
    });
    creados++;
  }
  docInfo_('Catálogo de documentos sembrado.', { documentos: creados });
  return creados;
}

/** Siembra la configuración por defecto. Solo añade las claves que falten. */
function docSeedConfig_() {
  var creados = 0;
  for (var i = 0; i < DOC_CONFIG_SEMILLA.length; i++) {
    var c = DOC_CONFIG_SEMILLA[i];
    if (docById_(DOC_SHEET.CONFIG, c.clave)) continue;
    docPut_(DOC_SHEET.CONFIG, {
      clave: c.clave,
      valor: c.valor,
      descripcion: c.descripcion,
      actualizado_en: docNow_()
    });
    creados++;
  }
  if (creados) docInfo_('Configuración sembrada.', { claves: creados });
  return creados;
}

/** Lee una clave de configuración. */
function docConfigGet_(clave, porDefecto) {
  try {
    var fila = docById_(DOC_SHEET.CONFIG, clave);
    if (!fila || fila.valor === '' || fila.valor === null || fila.valor === undefined) return porDefecto;
    return fila.valor;
  } catch (e) {
    return porDefecto;
  }
}

/** Escribe una clave de configuración. */
function docConfigSet_(clave, valor) {
  var fila = docById_(DOC_SHEET.CONFIG, clave) || {};
  docPut_(DOC_SHEET.CONFIG, {
    clave: String(clave),
    valor: valor === null || valor === undefined ? '' : String(valor),
    descripcion: fila.descripcion || '',
    actualizado_en: docNow_()
  });
}

/** Toda la configuración como objeto plano, lista para el frontend. */
function docConfigAll_() {
  var out = {};
  var filas = docAll_(DOC_SHEET.CONFIG);
  for (var i = 0; i < filas.length; i++) out[filas[i].clave] = filas[i].valor;
  return out;
}
