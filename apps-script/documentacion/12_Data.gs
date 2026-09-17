/**
 * 12_Data.gs — infraestructura de datos y repositorios del modelo normalizado.
 *
 * ── Qué hay aquí y qué NO ────────────────────────────────────────────────────
 * Aquí está todo lo que sabe de filas, columnas, identificadores, versiones y
 * caché. No hay ni una regla de negocio: los repositorios guardan y consultan,
 * los servicios (14 a 18) deciden. Esa frontera es lo que permite probar las
 * reglas sin un libro de cálculo delante y cambiar el almacenamiento sin
 * reescribir el proceso documental.
 *
 * ── Sobre qué se apoya ──────────────────────────────────────────────────────
 * Sobre el motor que ya existía en 02_Store.gs: lectura de la hoja completa una
 * sola vez por petición, escrituras encoladas y volcadas en bloques contiguos,
 * columnas localizadas por encabezado. Este archivo le añade lo que el modelo
 * normalizado necesita y el anterior no tenía:
 *
 *   · identificadores estables y deterministas (para que migrar dos veces no
 *     duplique nada);
 *   · `version_registro` con detección de conflicto (dos personas editando el
 *     mismo expediente);
 *   · sellos de creación y actualización automáticos;
 *   · consultas con filtro, orden y paginación EN EL SERVIDOR (el frontend no
 *     recibe la base entera para pintar veinticinco filas);
 *   · archivado lógico en lugar de borrado;
 *   · caché con invalidación selectiva;
 *   · historial legible y auditoría técnica como dos cosas distintas.
 */

/* ========================================================================== */
/* Identificadores                                                             */
/* ========================================================================== */

/**
 * Identificador nuevo, único y ordenable por tiempo.
 *
 * Reutiliza `docUid_` para no tener dos formatos de identificador en el mismo
 * libro, que es una de esas incoherencias que nadie recuerda haber introducido.
 */
function doc2NewId_(prefijo) {
  return docUid_(prefijo);
}

/**
 * Identificador DETERMINISTA a partir de una semilla.
 *
 * Lo usan la migración y los espejos: si la migración se ejecuta dos veces, la
 * misma fila del libro produce el mismo `expediente_id` y la segunda pasada
 * actualiza en lugar de duplicar. Es la pieza que hace que una migración sea
 * idempotente de verdad y no solo «cuidadosa».
 */
function doc2StableId_(prefijo, semilla) {
  return String(prefijo) + '_' + docHash_(String(semilla));
}

/**
 * Clave normalizada de un identificador humano (el carnet de identidad).
 *
 * ── Por qué se quita TODO lo que no es letra o cifra ────────────────────────
 * El identificador dejó de tener formato impuesto: es el carnet tal como
 * aparece en el documento. Y el mismo carnet se escribe de cinco maneras
 * distintas según quién lo teclee: `1234567 1K`, `1234567-1K`, `1.234.567 1K`,
 * `1234567  1k`. Si la clave conservara los separadores, esas cinco escrituras
 * serían cinco personas distintas y la detección de duplicados —lo único que
 * queda para evitar dos expedientes de la misma persona— no serviría de nada.
 *
 * Se quitan espacios, guiones, puntos y cualquier otro separador, y se sube a
 * mayúsculas sin acentos (`docKey_`). Queda solo lo que identifica.
 *
 * ── Compatibilidad con lo ya guardado ──────────────────────────────────────
 * Las filas antiguas tienen guardada la clave de la regla anterior (que solo
 * quitaba espacios). `doc2BuscarPorIdentificador_` compara contra la clave
 * guardada Y contra la recalculada desde el texto original, así que no hace
 * falta migrar ninguna fila para que las búsquedas sigan funcionando.
 */
function doc2NormalizarIdentificador_(valor) {
  return docKey_(valor).replace(/[^A-Z0-9]/g, '');
}

/* ========================================================================== */
/* Saneado y validación de entrada                                             */
/* ========================================================================== */

/** Texto corto saneado, con tope propio. */
function doc2Texto_(valor, tope) {
  return docText_(valor, tope || DOC2_LIMITS.MAX_TEXTO_CORTO);
}

/** Texto largo saneado, conservando saltos de línea. */
function doc2TextoLargo_(valor, tope) {
  var texto = docText_(valor, tope || DOC2_LIMITS.MAX_TEXTO_LARGO);
  return texto;
}

/** Fecha `yyyy-mm-dd` canónica o cadena vacía. */
function doc2Fecha_(valor) {
  return docDateOnly_(valor);
}

/** Booleano estricto: cualquier cosa que no sea afirmativa es `false`. */
function doc2Bool_(valor) {
  return docBoolOrNull_(valor) === true;
}

/** Uno de los valores permitidos (comparando en mayúsculas) o el de reserva. */
function doc2Enum_(valor, permitidos, reserva) {
  var clave = docKey_(valor).replace(/ /g, '_');
  for (var i = 0; i < permitidos.length; i++) {
    if (docKey_(permitidos[i]).replace(/ /g, '_') === clave) return permitidos[i];
  }
  return reserva;
}

/** Lista de códigos separados por coma, normalizada y sin huecos. */
function doc2Lista_(valor) {
  if (valor === null || valor === undefined || valor === '') return [];
  var bruto = Object.prototype.toString.call(valor) === '[object Array]'
    ? valor
    : String(valor).split(',');
  var out = [];
  for (var i = 0; i < bruto.length; i++) {
    var item = docKey_(bruto[i]).replace(/ /g, '_');
    if (item && out.indexOf(item) < 0) out.push(item);
  }
  return out;
}

/**
 * Exige campos obligatorios y devuelve el mapa de errores por campo.
 *
 * El contrato de error del módulo lleva `fields`, y esta función es la que lo
 * llena: un formulario que recibe «faltan datos» no puede marcar el campo, y uno
 * que recibe `{ nombre: "..." }` sí.
 */
function doc2ExigirCampos_(datos, requeridos) {
  var fallos = {};
  var hay = false;
  for (var i = 0; i < requeridos.length; i++) {
    var campo = requeridos[i];
    var valor = datos ? datos[campo] : null;
    if (valor === null || valor === undefined || String(valor).trim() === '') {
      fallos[campo] = 'Este dato es obligatorio.';
      hay = true;
    }
  }
  if (hay) {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'Faltan datos obligatorios.', {
      hint: 'Completa los campos marcados y vuelve a guardar.',
      details: { fields: fallos }
    });
  }
  return true;
}

/**
 * ¿Es una fecha real?
 *
 * `docDateOnly_` reordena lo que PARECE una fecha sin comprobar el calendario:
 * «32/13/2026» sale como «2026-13-32» y «2026-99-99» pasa tal cual. Esta función
 * es la que dice la verdad, y la usan tanto la validación de entrada como el
 * diagnóstico de datos ya guardados.
 */
function doc2FechaValida_(valor) {
  var solo = docDateOnly_(valor);
  if (!solo) return false;
  var anio = parseInt(solo.slice(0, 4), 10);
  var mes = parseInt(solo.slice(5, 7), 10);
  var dia = parseInt(solo.slice(8, 10), 10);
  if (!(anio >= 1950 && anio <= 2100)) return false;
  if (!(mes >= 1 && mes <= 12)) return false;
  if (!(dia >= 1 && dia <= 31)) return false;
  var d = new Date(solo + 'T00:00:00Z');
  if (isNaN(d.getTime())) return false;
  return d.getUTCDate() === dia && (d.getUTCMonth() + 1) === mes;
}

/** Comprueba que una fecha, si viene, sea válida y esté en un rango razonable. */
function doc2ValidarFecha_(valor, campo, opciones) {
  var o = opciones || {};
  if (valor === null || valor === undefined || valor === '') {
    if (o.requerida) {
      throw docError_(DOC_CODE.VALIDATION_ERROR, 'La fecha "' + campo + '" es obligatoria.',
        { details: { fields: doc2Campo_(campo, 'Indica una fecha.') } });
    }
    return '';
  }
  var solo = docDateOnly_(valor);
  if (!solo) {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'La fecha "' + campo + '" no se entiende.',
      {
        hint: 'Usa el formato dd/mm/aaaa o aaaa-mm-dd.',
        details: { fields: doc2Campo_(campo, 'Formato de fecha no reconocido.') }
      });
  }
  var anio = parseInt(solo.slice(0, 4), 10);
  if (anio < 1950 || anio > 2100) {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'La fecha "' + campo + '" está fuera de rango.',
      { details: { fields: doc2Campo_(campo, 'El año debe estar entre 1950 y 2100.') } });
  }

  // `docDateOnly_` reordena lo que parece una fecha latina sin comprobar que el
  // día y el mes existan: «32/13/2026» sale como «2026-13-32». Aquí se rechaza,
  // porque una fecha imposible guardada rompe después todos los cálculos de plazo.
  if (!doc2FechaValida_(solo)) {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'La fecha "' + campo + '" no existe en el calendario.',
      {
        hint: 'Revisa el día y el mes.',
        details: { fields: doc2Campo_(campo, 'Fecha inexistente: revisa el día y el mes.') }
      });
  }
  return solo;
}

/** Azúcar para construir un mapa de un solo campo. */
function doc2Campo_(campo, mensaje) {
  var out = {};
  out[campo] = mensaje;
  return out;
}

/* ========================================================================== */
/* Creación y reparación de las hojas normalizadas                             */
/* ========================================================================== */

/**
 * Crea las hojas del modelo normalizado que falten y añade las columnas que
 * falten a las que ya existan.
 *
 * Nunca borra una columna desconocida ni reordena las existentes: si alguien
 * añadió una columna a mano para llevar una nota propia, esa columna sigue ahí.
 * Devuelve el detalle de lo que hizo, porque una reparación que no dice qué
 * cambió obliga a comparar el libro a ojo.
 */
function doc2EnsureSheets_(opciones) {
  var o = opciones || {};
  var ss = docSpreadsheet_();
  var acciones = [];
  var modificadas = [];
  var previo = DOC_STORE.allowCreate;
  DOC_STORE.allowCreate = true;

  for (var s = 0; s < DOC2_SHEET_ORDER.length; s++) {
    var nombre = DOC2_SHEET_ORDER[s];
    var esperados = docColumnNames_(nombre);
    var hoja = ss.getSheetByName(nombre);

    if (!hoja) {
      hoja = ss.insertSheet(nombre);
      hoja.getRange(1, 1, 1, esperados.length).setValues([esperados]);
      acciones.push({ hoja: nombre, accion: 'creada', columnas: esperados.length });
      modificadas.push(nombre);
    } else {
      var estado = docInspectSheet_(hoja, esperados);
      if (estado.columnasFaltantes.length) {
        var desde = Math.max(hoja.getLastColumn(), 0) + 1;
        docEnsureColumns_(hoja, desde + estado.columnasFaltantes.length - 1);
        hoja.getRange(1, desde, 1, estado.columnasFaltantes.length).setValues([estado.columnasFaltantes]);
        acciones.push({ hoja: nombre, accion: 'columnas añadidas', columnas: estado.columnasFaltantes });
        modificadas.push(nombre);
      } else if (!o.silencioso) {
        acciones.push({ hoja: nombre, accion: 'sin cambios' });
      }
    }
    if (!o.sinEstilo) doc2StyleSheet_(hoja, nombre);
  }

  // Los encabezados de las hojas tocadas cambiaron, así que su índice en memoria
  // ya no sirve. Antes de tirarlo hay que VOLCAR lo pendiente: descartar la cola
  // de escritura aquí perdería silenciosamente lo que la operación en curso
  // llevara acumulado, y esta función se llama en medio de una migración.
  if (modificadas.length) {
    docCommit_();
    for (var m = 0; m < modificadas.length; m++) {
      delete DOC_STORE.loaded[modificadas[m]];
      delete DOC_STORE.pending[modificadas[m]];
    }
  }

  var aux = doc2EnsureAuxiliar_();
  if (aux.accion !== 'sin cambios') acciones.push(aux);

  DOC_STORE.allowCreate = previo;
  return acciones;
}

/**
 * Presentación de una hoja normalizada.
 *
 * Deliberadamente sobria: estas hojas se abren para auditar, y lo que se
 * necesita entonces es recorrerlas rápido. Se congela la cabecera, se le pone el
 * azul del módulo y se fijan anchos; nada más.
 */
function doc2StyleSheet_(hoja, nombre) {
  var spec = DOC_SCHEMA[nombre];
  if (!spec) return false;
  try { hoja.setFrozenRows(1); } catch (e) { /* opcional */ }
  try {
    hoja.getRange(1, 1, 1, Math.max(spec.columns.length, hoja.getLastColumn()))
      .setBackground(DOC_COLOR.HEADER_MODULO_BG)
      .setFontColor(DOC_COLOR.HEADER_FG)
      .setFontWeight('bold')
      .setWrap(true)
      .setVerticalAlignment('middle');
    hoja.setRowHeight(1, 34);
  } catch (e) { /* opcional */ }
  try {
    for (var c = 0; c < spec.columns.length; c++) {
      hoja.setColumnWidth(c + 1, spec.columns[c].width || 150);
    }
  } catch (e) { /* opcional */ }
  return true;
}

/* ========================================================================== */
/* Hoja `Auxiliar`: catálogos por columna                                      */
/* ========================================================================== */

/**
 * Clave normalizada de una cabecera de `Auxiliar`.
 *
 * ── El fallo que esto corrige ───────────────────────────────────────────────
 * La versión anterior localizaba la columna con `String(cabecera).trim() === columna`.
 * Comparación exacta y sensible a todo: una cabecera escrita `Agencia_BDP`, con
 * un espacio final que `trim` sí quitaba pero un espacio DOBLE interior no, o con
 * un espacio irrompible pegado al copiar de otra hoja, no coincidía. Resultado:
 * `doc2LeerAuxiliar_` devolvía la lista VACÍA y el desplegable de Agencia
 * aparecía sin opciones, con la hoja llena de valores. Es el «no absorbe todo lo
 * que hay en la columna» que reportó el área.
 *
 * Se compara sin acentos, sin distinguir mayúsculas, sin espacios de sobra y
 * tratando el guion bajo y el espacio como el mismo separador.
 */
function doc2ClaveCabeceraAuxiliar_(valor) {
  return docKey_(valor).replace(/[\s_]+/g, '_').replace(/^_+|_+$/g, '');
}

/**
 * Índice `clave normalizada -> número de columna (1-based)` de la hoja `Auxiliar`.
 *
 * Se lee la fila 1 COMPLETA con `getMaxColumns()` y no con `getLastColumn()`:
 * cuando la última columna con datos está antes de una cabecera escrita más a la
 * derecha —algo que pasa si alguien añade `cargo_bdp` y todavía no ha pegado los
 * valores—, `getLastColumn()` se queda corto y la cabecera nueva es invisible.
 */
function doc2IndiceCabecerasAuxiliar_(hoja) {
  var ancho = Math.max(hoja.getMaxColumns(), 1);
  var cabeceras = hoja.getRange(1, 1, 1, ancho).getValues()[0];
  var indice = {};
  for (var i = 0; i < cabeceras.length; i++) {
    var clave = doc2ClaveCabeceraAuxiliar_(cabeceras[i]);
    // Gana la primera aparición: si alguien duplicó la cabecera, la columna de la
    // izquierda es la que el área ha estado llenando.
    if (clave && !indice[clave]) indice[clave] = i + 1;
  }
  return indice;
}

/** Número de columna de un catálogo auxiliar, o -1 si su cabecera no existe. */
function doc2ColumnaAuxiliar_(hoja, columna) {
  var indice = doc2IndiceCabecerasAuxiliar_(hoja);
  var buscada = doc2ClaveCabeceraAuxiliar_(columna);
  return indice[buscada] || -1;
}

/** Crea la hoja `Auxiliar` y sus cabeceras si faltan. Nunca toca los valores. */
function doc2EnsureAuxiliar_() {
  var ss = docSpreadsheet_();
  var hoja = ss.getSheetByName(DOC2_SHEET.AUXILIAR);
  var creada = false;
  if (!hoja) {
    hoja = ss.insertSheet(DOC2_SHEET.AUXILIAR);
    creada = true;
  }

  var presentes = doc2IndiceCabecerasAuxiliar_(hoja);
  var anadidas = [];
  for (var c = 0; c < DOC2_AUXILIAR_COLUMNS.length; c++) {
    var columna = DOC2_AUXILIAR_COLUMNS[c];
    if (presentes[doc2ClaveCabeceraAuxiliar_(columna)]) continue;
    var siguiente = Math.max(hoja.getLastColumn(), 0) + 1;
    docEnsureColumns_(hoja, siguiente);
    hoja.getRange(1, siguiente, 1, 1).setValues([[columna]]);
    presentes[doc2ClaveCabeceraAuxiliar_(columna)] = siguiente;
    anadidas.push(columna);
  }

  if (creada || anadidas.length) {
    try {
      hoja.getRange(1, 1, 1, Math.max(hoja.getLastColumn(), 1))
        .setBackground(DOC_COLOR.HEADER_BASE_BG)
        .setFontColor(DOC_COLOR.HEADER_FG)
        .setFontWeight('bold');
      hoja.setFrozenRows(1);
    } catch (e) { /* opcional */ }
  }

  doc2CacheInvalidar_([DOC2_CACHE.AUXILIAR]);
  // La hoja acaba de cambiar de forma: la lectura memoizada de esta petición ya
  // no describe lo que hay.
  doc2AuxiliarMemReset_();

  return {
    hoja: DOC2_SHEET.AUXILIAR,
    accion: creada ? 'creada' : (anadidas.length ? 'columnas añadidas' : 'sin cambios'),
    columnas: anadidas.length ? anadidas : DOC2_AUXILIAR_COLUMNS.length
  };
}

/**
 * Valores CRUDOS de una columna de `Auxiliar`, tal como están escritos.
 *
 * Se lee hasta `getMaxRows()` y NO se corta en la primera celda vacía: las
 * columnas de esta hoja tienen longitudes distintas y huecos —el área borra un
 * valor de en medio y deja la celda vacía— y detenerse en el primer hueco perdía
 * todo lo que venía después. Sin topes: si la columna tiene 300 valores, salen
 * los 300.
 */
function doc2LeerAuxiliarCrudo_(columna) {
  var bloque = doc2BloqueAuxiliar_();
  if (!bloque) return [];
  var clave = doc2ClaveCabeceraAuxiliar_(columna);
  var indice = bloque.indice[clave] || -1;
  if (indice < 0) return [];
  var out = [];
  for (var r = 0; r < bloque.valores.length; r++) {
    var texto = docUntext_(bloque.valores[r][indice - 1]);
    if (String(texto).trim()) out.push(texto);
  }
  return out;
}

/**
 * La hoja `Auxiliar` completa, leída UNA vez por petición.
 *
 * ── Por qué una sola lectura y no una por columna ───────────────────────────
 * `doc2LeerAuxiliarCrudo_` se llamaba tres veces —agencia, gerencia, cargo— y
 * cada llamada hacía su propio `getRange(...).getValues()` sobre mil filas, más
 * su propia lectura de la fila de cabeceras: seis viajes al servicio de Sheets
 * para traer un rectángulo que cabe en uno. En Apps Script cada viaje cuesta
 * entre 20 y 200 ms, así que el arranque del módulo pagaba casi un segundo por
 * llenar tres desplegables.
 *
 * La lectura se memoiza POR PETICIÓN (`DOC2_AUXILIAR_MEM`), no entre peticiones:
 * dentro de una misma ejecución la hoja no cambia sola, y entre peticiones ya
 * hay una caché con plazo (`DOC2_CACHE.AUXILIAR`) que es la que corresponde.
 * Confundir las dos es cómo se acaba mostrando un valor que alguien borró hace
 * media hora.
 */
var DOC2_AUXILIAR_MEM = null;

function doc2AuxiliarMemReset_() {
  DOC2_AUXILIAR_MEM = null;
}

function doc2BloqueAuxiliar_() {
  if (DOC2_AUXILIAR_MEM !== null) return DOC2_AUXILIAR_MEM.hoja ? DOC2_AUXILIAR_MEM : null;

  var hoja = null;
  try {
    hoja = docSpreadsheet_().getSheetByName(DOC2_SHEET.AUXILIAR);
  } catch (e) {
    hoja = null;
  }
  if (!hoja) {
    DOC2_AUXILIAR_MEM = { hoja: null, indice: {}, valores: [] };
    return null;
  }

  var indice = doc2IndiceCabecerasAuxiliar_(hoja);
  var filas = Math.max(hoja.getMaxRows(), 1);
  var ancho = Math.max(hoja.getMaxColumns(), 1);
  var valores = filas < 2 ? [] : hoja.getRange(2, 1, filas - 1, ancho).getValues();
  docCount_('hojasLeidas');
  docCount_('filasLeidas', valores.length);

  DOC2_AUXILIAR_MEM = { hoja: hoja, indice: indice, valores: valores };
  return DOC2_AUXILIAR_MEM;
}

/**
 * Lee un catálogo de la hoja `Auxiliar`, listo para un desplegable.
 *
 * Recorta espacios, colapsa los dobles, cambia el espacio irrompible por uno
 * normal y deduplica por clave normalizada (sin acentos, sin distinguir
 * mayúsculas), que en un catálogo escrito a mano es la causa habitual de que
 * «LA PAZ» y «La Paz » aparezcan como dos agencias distintas. Conserva el texto
 * tal como está escrito —solo limpiado— porque es el que la persona reconoce, y
 * ordena con `localeCompare('es')` para que las tildes no manden los valores al
 * final de la lista.
 */
function doc2LeerAuxiliar_(columna) {
  var crudos = doc2LeerAuxiliarCrudo_(columna);
  var vistos = {};
  var salida = [];
  for (var r = 0; r < crudos.length; r++) {
    var texto = String(crudos[r]).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    if (!texto) continue;
    var clave = docKey_(texto);
    if (vistos[clave]) continue;
    vistos[clave] = true;
    salida.push(texto);
  }
  salida.sort(function (a, b) { return doc2CompararEs_(a, b); });
  return salida;
}

/**
 * Comparación alfabética en español.
 *
 * `localeCompare` con la etiqueta `es` existe en Apps Script (V8) pero su
 * comportamiento con acentos no está garantizado en todos los entornos —y el
 * arnés de Node tampoco es el mismo motor—, así que se compara por la clave
 * normalizada y solo se recurre al texto original para desempatar. El resultado
 * es estable y el mismo en los dos lados.
 */
function doc2CompararEs_(a, b) {
  var ka = docKey_(a);
  var kb = docKey_(b);
  if (ka !== kb) return ka < kb ? -1 : 1;
  return String(a) < String(b) ? -1 : (String(a) > String(b) ? 1 : 0);
}

/**
 * Añade valores a un catálogo de `Auxiliar` sin borrar ni reordenar nada.
 *
 * ── El fallo que esto corrige ───────────────────────────────────────────────
 * La versión anterior escribía en `2 + actuales.length`, donde `actuales` era la
 * lista YA DEDUPLICADA. Si la columna tenía un duplicado o un hueco, la fila
 * calculada caía sobre un valor existente y lo PISABA: exactamente lo contrario
 * de la regla «de esta hoja nunca se quita un valor». Ahora se busca la última
 * fila realmente ocupada de esa columna y se escribe debajo.
 *
 * Devuelve solo lo que realmente añadió. Es la única forma de escritura que se
 * ofrece sobre esta hoja: no existe «reemplazar el catálogo», porque un catálogo
 * reemplazado deja huérfanos todos los expedientes que usaban los valores
 * anteriores.
 */
function doc2AgregarAuxiliar_(columna, valores) {
  if (DOC2_AUXILIAR_COLUMNS.indexOf(columna) < 0) {
    throw docError_(DOC_CODE.VALIDATION_ERROR, 'La columna "' + columna + '" no es un catálogo auxiliar.',
      { details: { columnasValidas: DOC2_AUXILIAR_COLUMNS } });
  }
  doc2EnsureAuxiliar_();
  var crudos = doc2LeerAuxiliarCrudo_(columna);
  var actuales = doc2LeerAuxiliar_(columna);
  var vistos = {};
  for (var a = 0; a < actuales.length; a++) vistos[docKey_(actuales[a])] = true;

  var nuevos = [];
  var lista = Object.prototype.toString.call(valores) === '[object Array]' ? valores : [valores];
  for (var i = 0; i < lista.length; i++) {
    var texto = docText_(String(lista[i] === null || lista[i] === undefined ? '' : lista[i]))
      .replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    if (!texto) continue;
    var clave = docKey_(texto);
    if (vistos[clave]) continue;
    vistos[clave] = true;
    nuevos.push(texto);
  }
  if (!nuevos.length) return { columna: columna, agregados: [], total: actuales.length };

  var ss = docSpreadsheet_();
  var hoja = ss.getSheetByName(DOC2_SHEET.AUXILIAR);
  var indice = doc2ColumnaAuxiliar_(hoja, columna);
  if (indice < 0) return { columna: columna, agregados: [], total: actuales.length };

  // La primera fila libre de ESTA columna, contando los huecos y los duplicados:
  // cada catálogo crece a su ritmo y usar el último renglón de la hoja dejaría
  // huecos, pero usar el recuento deduplicado pisaría valores.
  var desde = 2 + doc2UltimaFilaDeColumna_(hoja, indice);
  var bloque = [];
  for (var n = 0; n < nuevos.length; n++) bloque.push([nuevos[n]]);
  docEnsureRows_(hoja, desde + bloque.length + 10);
  hoja.getRange(desde, indice, bloque.length, 1).setValues(bloque);
  docCount_('filasEscritas', bloque.length);

  doc2CacheInvalidar_([DOC2_CACHE.AUXILIAR, DOC2_CACHE.CATALOGO]);
  doc2AuxiliarMemReset_();
  return { columna: columna, agregados: nuevos, total: crudos.length + nuevos.length };
}

/**
 * Cuántas filas de datos ocupa realmente una columna (huecos incluidos).
 *
 * Devuelve el desplazamiento de la última celda no vacía respecto de la fila 2.
 * Es lo que permite añadir un valor DEBAJO de todo lo escrito sin pisar nada.
 */
function doc2UltimaFilaDeColumna_(hoja, indice) {
  /* Se reutiliza el bloque ya leído de la petición cuando está disponible: esta
     función se llama una vez por columna al añadir valores, y sin la memoria
     volvía a leer mil filas por cada una. */
  var bloque = doc2BloqueAuxiliar_();
  var valores;
  if (bloque && bloque.hoja === hoja && bloque.valores.length && indice <= bloque.valores[0].length) {
    var ultimaMem = 0;
    for (var m = 0; m < bloque.valores.length; m++) {
      if (String(docUntext_(bloque.valores[m][indice - 1])).trim()) ultimaMem = m + 1;
    }
    return ultimaMem;
  }
  var filas = Math.max(hoja.getMaxRows(), 1);
  if (filas < 2) return 0;
  valores = hoja.getRange(2, indice, filas - 1, 1).getValues();
  var ultima = 0;
  for (var r = 0; r < valores.length; r++) {
    if (String(docUntext_(valores[r][0])).trim()) ultima = r + 1;
  }
  return ultima;
}

/** Los catálogos auxiliares, con caché por petición y por sesión. */
function doc2Auxiliares_() {
  var enCache = docCacheGet_(DOC2_CACHE.AUXILIAR);
  if (enCache) {
    var parseado = docParseJson_(enCache, null);
    // Se comprueba la forma: una respuesta cacheada de antes de `cargo_bdp`
    // dejaría el desplegable de Cargo vacío hasta que la caché expirase.
    if (parseado && doc2AuxiliaresCompletos_(parseado)) return parseado;
  }
  var salida = {};
  for (var i = 0; i < DOC2_AUXILIAR_COLUMNS.length; i++) {
    salida[DOC2_AUXILIAR_COLUMNS[i]] = doc2LeerAuxiliar_(DOC2_AUXILIAR_COLUMNS[i]);
  }
  docCachePut_(DOC2_CACHE.AUXILIAR, docWriteJson_(salida), DOC2_LIMITS.CACHE_AUXILIAR_SEG);
  return salida;
}

/** ¿Trae la respuesta cacheada todas las columnas declaradas hoy? */
function doc2AuxiliaresCompletos_(candidato) {
  for (var i = 0; i < DOC2_AUXILIAR_COLUMNS.length; i++) {
    var lista = candidato[DOC2_AUXILIAR_COLUMNS[i]];
    if (Object.prototype.toString.call(lista) !== '[object Array]') return false;
  }
  return true;
}

/* ========================================================================== */
/* Repositorio genérico                                                        */
/* ========================================================================== */

/** Especificación de una hoja normalizada, exigiendo que exista. */
function doc2Spec_(hoja) {
  var spec = DOC_SCHEMA[hoja];
  if (!spec || !spec.normalizada) {
    throw docError_(DOC_CODE.INTERNAL_ERROR, 'La hoja "' + hoja + '" no es una entidad normalizada.',
      { details: { hoja: hoja } });
  }
  return spec;
}

/** ¿Tiene esa hoja esa columna? Sirve para sellar solo lo que existe. */
function doc2TieneColumna_(hoja, columna) {
  return !!docColumnSpec_(hoja, columna);
}

/**
 * Inserta un registro.
 *
 * Sella `created_at`, `created_by` y `version_registro` cuando la hoja los
 * tiene. No valida reglas de negocio: eso es cosa del servicio que llama.
 */
function doc2Insert_(hoja, datos, contexto) {
  var spec = doc2Spec_(hoja);
  var ctx = contexto || {};
  var fila = {};
  for (var i = 0; i < spec.columns.length; i++) {
    var nombre = spec.columns[i].name;
    if (Object.prototype.hasOwnProperty.call(datos, nombre)) fila[nombre] = datos[nombre];
  }
  if (!fila[spec.key]) {
    throw docError_(DOC_CODE.INTERNAL_ERROR, 'Falta la clave "' + spec.key + '" al insertar en ' + hoja + '.',
      { details: { hoja: hoja } });
  }
  var ahora = docNow_();
  if (doc2TieneColumna_(hoja, 'created_at') && !fila.created_at) fila.created_at = ahora;
  if (doc2TieneColumna_(hoja, 'created_by') && !fila.created_by) fila.created_by = doc2Texto_(ctx.actor || 'sistema');
  if (doc2TieneColumna_(hoja, 'updated_at') && !fila.updated_at) fila.updated_at = ahora;
  if (doc2TieneColumna_(hoja, 'updated_by') && !fila.updated_by) fila.updated_by = doc2Texto_(ctx.actor || 'sistema');
  if (doc2TieneColumna_(hoja, 'version_registro') && !fila.version_registro) fila.version_registro = 1;

  var guardada = docPut_(hoja, fila);
  doc2InvalidarPanel_(hoja);
  docCount_('doc2Insert');
  return guardada;
}

/**
 * Actualiza un registro con control de versión optimista.
 *
 * `opciones.version` es la versión que el cliente creía tener. Si no coincide
 * con la almacenada, se rechaza con `CONFLICTO_VERSION` en lugar de sobrescribir
 * el trabajo de otra persona. Cuando el cliente no manda versión no se comprueba
 * nada: hay procesos internos (automatizaciones, recálculos) que no la conocen y
 * exigírsela solo produciría reintentos inútiles.
 */
function doc2Update_(hoja, id, patch, contexto, opciones) {
  var spec = doc2Spec_(hoja);
  var ctx = contexto || {};
  var o = opciones || {};
  var actual = docById_(hoja, id);
  if (!actual) {
    throw docError_(DOC_CODE.NOT_FOUND, 'No existe el registro ' + id + ' en ' + hoja + '.',
      { details: { hoja: hoja, id: id } });
  }

  if (o.version !== undefined && o.version !== null && o.version !== '' && doc2TieneColumna_(hoja, 'version_registro')) {
    var esperada = docInt_(o.version, 0);
    var vigente = docInt_(actual.version_registro, 1);
    if (esperada > 0 && esperada !== vigente) {
      throw docError_(DOC2_CODE.CONFLICTO_VERSION,
        'Alguien más modificó este registro mientras lo editabas.',
        {
          hint: 'Vuelve a abrirlo para ver los cambios y aplica de nuevo los tuyos.',
          details: { hoja: hoja, id: id, versionEnviada: esperada, versionActual: vigente }
        });
    }
  }

  var fila = {};
  for (var i = 0; i < spec.columns.length; i++) {
    var nombre = spec.columns[i].name;
    fila[nombre] = Object.prototype.hasOwnProperty.call(patch, nombre) ? patch[nombre] : actual[nombre];
  }
  fila[spec.key] = actual[spec.key];
  if (doc2TieneColumna_(hoja, 'updated_at')) fila.updated_at = docNow_();
  if (doc2TieneColumna_(hoja, 'updated_by')) fila.updated_by = doc2Texto_(ctx.actor || 'sistema');
  /**
   * `sinVersion` no sube `version_registro`.
   *
   * Lo usan las migraciones que solo MATERIALIZAN un campo derivado (la
   * subsección, el cero del conteo de hojas): no son un cambio del dato que
   * alguien esté editando, y subir la versión haría que la pantalla abierta de
   * cualquier persona recibiera `CONFLICTO_VERSION` al guardar, obligándola a
   * recargar y a volver a marcar lo que llevaba marcado.
   */
  if (doc2TieneColumna_(hoja, 'version_registro')) {
    fila.version_registro = o.sinVersion === true
      ? docInt_(actual.version_registro, 1)
      : docInt_(actual.version_registro, 1) + 1;
  }

  var guardada = docPut_(hoja, fila);
  doc2InvalidarPanel_(hoja);
  docCount_('doc2Update');
  return guardada;
}
/** Registro por su clave, o `null`. */
function doc2Get_(hoja, id) {
  doc2Spec_(hoja);
  return docById_(hoja, id);
}

/** Registro por su clave, exigiendo que exista. */
function doc2GetOrFail_(hoja, id, etiqueta) {
  var fila = doc2Get_(hoja, id);
  if (!fila) {
    throw docError_(DOC_CODE.NOT_FOUND,
      'No existe ' + (etiqueta || 'el registro') + ' ' + id + '.',
      { hint: 'Actualiza la vista: puede haberse archivado o eliminado.', details: { hoja: hoja, id: id } });
  }
  return fila;
}

/** Todos los registros de una hoja (sin archivar, salvo que se pidan). */
function doc2All_(hoja, incluirArchivados) {
  doc2Spec_(hoja);
  var filas = docAll_(hoja);
  if (incluirArchivados === true || !doc2TieneColumna_(hoja, 'archived_at')) return filas;
  var out = [];
  for (var i = 0; i < filas.length; i++) {
    if (!filas[i].archived_at) out.push(filas[i]);
  }
  return out;
}

/** Registros cuyo campo coincide exactamente. */
function doc2By_(hoja, campo, valor, incluirArchivados) {
  var filas = doc2All_(hoja, incluirArchivados);
  var buscado = String(valor === null || valor === undefined ? '' : valor);
  var out = [];
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i][campo] === null || filas[i][campo] === undefined ? '' : filas[i][campo]) === buscado) {
      out.push(filas[i]);
    }
  }
  return out;
}

/** Primer registro cuyo campo coincide, o `null`. */
function doc2FirstBy_(hoja, campo, valor) {
  var filas = doc2By_(hoja, campo, valor, true);
  return filas.length ? filas[0] : null;
}

/**
 * Consulta con filtro, orden y paginación.
 *
 * El filtrado y la agregación ocurren AQUÍ, en el servidor. Mandar diez mil
 * filas al navegador para que muestre veinticinco es la forma más rápida de
 * convertir una tabla en una pantalla congelada, y además expone datos que quien
 * consulta no necesariamente puede ver.
 */
function doc2Query_(hoja, opciones) {
  var o = opciones || {};
  var filas = doc2All_(hoja, o.incluirArchivados === true);

  if (typeof o.filtro === 'function') {
    var filtradas = [];
    for (var i = 0; i < filas.length; i++) {
      if (o.filtro(filas[i])) filtradas.push(filas[i]);
    }
    filas = filtradas;
  }

  if (o.orden) {
    var campo = String(o.orden);
    var desc = o.direccion === 'desc';
    filas = filas.slice().sort(function (a, b) {
      var x = a[campo], y = b[campo];
      if (typeof x === 'number' && typeof y === 'number') return desc ? y - x : x - y;
      var sx = String(x === null || x === undefined ? '' : x);
      var sy = String(y === null || y === undefined ? '' : y);
      if (sx === sy) return 0;
      return desc ? (sx < sy ? 1 : -1) : (sx > sy ? 1 : -1);
    });
  }

  var total = filas.length;
  var porPagina = Math.min(Math.max(docInt_(o.porPagina, DOC2_LIMITS.PAGINA_POR_DEFECTO), 1), DOC2_LIMITS.PAGINA_MAXIMA);
  var pagina = Math.max(docInt_(o.pagina, 1), 1);
  var desde = (pagina - 1) * porPagina;
  var pagina1 = o.sinPaginar === true ? filas : filas.slice(desde, desde + porPagina);

  return {
    total: total,
    pagina: pagina,
    porPagina: porPagina,
    paginas: Math.max(1, Math.ceil(total / porPagina)),
    filas: pagina1
  };
}

/**
 * Archiva un registro (borrado lógico).
 *
 * El módulo no borra filas de negocio. Un expediente «eliminado» que reaparece
 * dos años después en una auditoría no puede haberse ido del libro sin dejar
 * rastro; se marca, se deja de listar y se puede restaurar.
 */
function doc2Archive_(hoja, id, contexto) {
  if (!doc2TieneColumna_(hoja, 'archived_at')) {
    throw docError_(DOC_CODE.INTERNAL_ERROR, 'La hoja ' + hoja + ' no admite archivado.', { details: { hoja: hoja } });
  }
  var ctx = contexto || {};
  var patch = { archived_at: docNow_() };
  if (doc2TieneColumna_(hoja, 'archived_by')) patch.archived_by = doc2Texto_(ctx.actor || 'sistema');
  return doc2Update_(hoja, id, patch, ctx);
}

/** Quita la marca de archivado. */
function doc2Unarchive_(hoja, id, contexto) {
  var patch = { archived_at: '' };
  if (doc2TieneColumna_(hoja, 'archived_by')) patch.archived_by = '';
  return doc2Update_(hoja, id, patch, contexto || {});
}

/** Cuántos registros hay, sin traerlos. */
function doc2Count_(hoja, filtro) {
  var filas = doc2All_(hoja, true);
  if (typeof filtro !== 'function') return filas.length;
  var n = 0;
  for (var i = 0; i < filas.length; i++) if (filtro(filas[i])) n++;
  return n;
}

/* ========================================================================== */
/* Configuración del módulo normalizado                                        */
/* ========================================================================== */

/** Toda la configuración como objeto plano, con caché por petición. */
var DOC2_CONFIG_MEM = null;

function doc2ConfigAll_() {
  if (DOC2_CONFIG_MEM) return DOC2_CONFIG_MEM;
  var salida = {};
  try {
    var filas = docAll_(DOC2_SHEET.CONFIG);
    for (var i = 0; i < filas.length; i++) {
      if (filas[i].activa === false) continue;
      salida[String(filas[i].clave)] = filas[i].valor;
    }
  } catch (e) {
    // Sin hoja de configuración se opera con los valores por defecto: el módulo
    // tiene que poder arrancar en un libro recién instalado.
    salida = {};
  }
  for (var s = 0; s < DOC2_CONFIG_SEMILLA.length; s++) {
    var semilla = DOC2_CONFIG_SEMILLA[s];
    if (salida[semilla.clave] === undefined || salida[semilla.clave] === '') salida[semilla.clave] = semilla.valor;
  }
  DOC2_CONFIG_MEM = salida;
  return salida;
}

function doc2ConfigReset_() {
  DOC2_CONFIG_MEM = null;
}

/** Un valor de configuración, con reserva. */
function doc2Config_(clave, porDefecto) {
  var todo = doc2ConfigAll_();
  var valor = todo[clave];
  return (valor === undefined || valor === null || valor === '') ? porDefecto : valor;
}

function doc2ConfigInt_(clave, porDefecto) {
  return docInt_(doc2Config_(clave, porDefecto), porDefecto);
}

function doc2ConfigBool_(clave, porDefecto) {
  var valor = docBoolOrNull_(doc2Config_(clave, porDefecto ? 'TRUE' : 'FALSE'));
  return valor === null ? !!porDefecto : valor;
}

function doc2ConfigJson_(clave, porDefecto) {
  return docParseJson_(doc2Config_(clave, ''), porDefecto);
}

/** Escribe una clave de configuración. */
function doc2ConfigSet_(clave, valor, contexto) {
  var ctx = contexto || {};
  var id = doc2StableId_('cfg', clave);
  var existente = docById_(DOC2_SHEET.CONFIG, id);
  var tipo = 'text';
  for (var s = 0; s < DOC2_CONFIG_SEMILLA.length; s++) {
    if (DOC2_CONFIG_SEMILLA[s].clave === clave) tipo = DOC2_CONFIG_SEMILLA[s].tipo;
  }
  var fila = {
    configuracion_id: id,
    clave: String(clave),
    valor: typeof valor === 'string' ? docText_(valor, DOC2_LIMITS.MAX_TEXTO_LARGO) : docWriteJson_(valor),
    tipo: (existente && existente.tipo) || tipo,
    entorno: (existente && existente.entorno) || 'produccion',
    activa: true,
    updated_at: docNow_(),
    updated_by: doc2Texto_(ctx.actor || 'sistema')
  };
  docPut_(DOC2_SHEET.CONFIG, fila);
  doc2ConfigReset_();
  doc2CacheInvalidar_([DOC2_CACHE.CONFIG, DOC2_CACHE.PANEL]);
  return fila;
}

/** Siembra las claves que falten. No pisa lo que ya esté escrito. */
function doc2SeedConfig_(contexto) {
  var creadas = 0;
  for (var i = 0; i < DOC2_CONFIG_SEMILLA.length; i++) {
    var semilla = DOC2_CONFIG_SEMILLA[i];
    var id = doc2StableId_('cfg', semilla.clave);
    if (docById_(DOC2_SHEET.CONFIG, id)) continue;
    docPut_(DOC2_SHEET.CONFIG, {
      configuracion_id: id,
      clave: semilla.clave,
      valor: semilla.valor,
      tipo: semilla.tipo,
      entorno: 'produccion',
      activa: true,
      updated_at: docNow_(),
      updated_by: doc2Texto_((contexto && contexto.actor) || 'instalacion')
    });
    creadas++;
  }
  if (creadas) doc2ConfigReset_();
  return creadas;
}

/** Siembra las políticas de retención por defecto. */
function doc2SeedRetencion_(contexto) {
  var politicas = [
    {
      nombre: 'Expedientes aprobados', tipo_entidad: 'expediente',
      estado_expediente_aplicable: DOC2_ESTADO_EXPEDIENTE.APROBADO,
      dias_retencion: doc2ConfigInt_('retencion_dias', DOC2_UMBRALES.retencionPorDefectoDias),
      accion_final: 'MARCAR_PENDIENTE_ELIMINACION'
    },
    {
      nombre: 'Expedientes archivados', tipo_entidad: 'expediente',
      estado_expediente_aplicable: DOC2_ESTADO_EXPEDIENTE.ARCHIVADO,
      dias_retencion: doc2ConfigInt_('retencion_dias', DOC2_UMBRALES.retencionPorDefectoDias),
      accion_final: 'MARCAR_PENDIENTE_ELIMINACION'
    },
    {
      nombre: 'Notificaciones leídas', tipo_entidad: 'notificacion',
      estado_expediente_aplicable: '', dias_retencion: 180, accion_final: 'COMPACTAR'
    }
  ];
  var creadas = 0;
  for (var i = 0; i < politicas.length; i++) {
    var p = politicas[i];
    var id = doc2StableId_('pol', p.nombre);
    if (docById_(DOC2_SHEET.RETENCION, id)) continue;
    docPut_(DOC2_SHEET.RETENCION, {
      politica_id: id,
      nombre: p.nombre,
      tipo_entidad: p.tipo_entidad,
      estado_expediente_aplicable: p.estado_expediente_aplicable,
      dias_retencion: p.dias_retencion,
      accion_final: p.accion_final,
      activa: true,
      created_at: docNow_(),
      updated_at: docNow_()
    });
    creadas++;
  }
  return creadas;
}

/* ========================================================================== */
/* Caché                                                                       */
/* ========================================================================== */

/** Hojas cuyos cambios afectan a los agregados del panel. */
var DOC2_HOJAS_DE_PANEL = {};
DOC2_HOJAS_DE_PANEL[DOC2_SHEET.EXPEDIENTES] = true;
DOC2_HOJAS_DE_PANEL[DOC2_SHEET.EXPEDIENTE_DOCS] = true;
DOC2_HOJAS_DE_PANEL[DOC2_SHEET.PRORROGAS] = true;
DOC2_HOJAS_DE_PANEL[DOC2_SHEET.SOLICITUDES] = true;
DOC2_HOJAS_DE_PANEL[DOC2_SHEET.TAREAS] = true;
DOC2_HOJAS_DE_PANEL[DOC2_SHEET.APROBACIONES] = true;
DOC2_HOJAS_DE_PANEL[DOC2_SHEET.REVISIONES] = true;

/** ¿Ya se invalidó el panel en esta petición? */
var DOC2_PANEL_INVALIDADO = false;

function doc2PanelInvalidadoReset_() {
  DOC2_PANEL_INVALIDADO = false;
}

/**
 * Invalida el caché del panel, una sola vez por petición.
 *
 * Se llama desde cada escritura sobre las hojas que alimentan los agregados. El
 * candado `DOC2_PANEL_INVALIDADO` importa: sin él, guardar veinte requisitos de un
 * expediente serían veinte llamadas al servicio de caché para borrar la misma
 * clave, y cada llamada a un servicio de Apps Script cuesta decenas de
 * milisegundos.
 */
function doc2InvalidarPanel_(hoja) {
  if (DOC2_PANEL_INVALIDADO) return false;
  if (!DOC2_HOJAS_DE_PANEL[hoja]) return false;
  DOC2_PANEL_INVALIDADO = true;
  docCacheRemove_(DOC2_CACHE.PANEL);
  return true;
}

/** Invalida una lista de claves de caché. Barato y explícito. */
function doc2CacheInvalidar_(claves) {
  var lista = claves && claves.length ? claves : [DOC2_CACHE.CATALOGO, DOC2_CACHE.AUXILIAR, DOC2_CACHE.PANEL, DOC2_CACHE.CONFIG];
  for (var i = 0; i < lista.length; i++) docCacheRemove_(lista[i]);
  return lista.length;
}

/* ========================================================================== */
/* Historial y auditoría                                                       */
/* ========================================================================== */

/**
 * Anota un cambio en el historial legible.
 *
 * Es lo que una persona lee: «estado documental: PENDIENTE → ENTREGADO». No
 * lleva metadatos técnicos ni identificadores de traza; para eso está la
 * auditoría. Nunca lanza: perder el dato principal por no poder anotarlo sería
 * absurdo.
 */
function doc2Historial_(entrada) {
  try {
    var e = entrada || {};
    var id = doc2NewId_('hist');
    docPut_(DOC2_SHEET.HISTORIAL, {
      historial_id: id,
      expediente_id: docRaw_(e.expedienteId || '', 200),
      entidad_tipo: doc2Texto_(e.entidadTipo || 'expediente', 60),
      entidad_id: docRaw_(e.entidadId || '', 200),
      campo: doc2Texto_(e.campo || '', 120),
      valor_anterior: doc2Texto_(docShorten_(e.anterior), DOC2_LIMITS.MAX_TEXTO_MEDIO),
      valor_nuevo: doc2Texto_(docShorten_(e.nuevo), DOC2_LIMITS.MAX_TEXTO_MEDIO),
      motivo: doc2Texto_(e.motivo || '', DOC2_LIMITS.MAX_TEXTO_MEDIO),
      created_at: docNow_(),
      created_by: doc2Texto_(e.actor || 'sistema')
    });
    docCount_('historial');
    return id;
  } catch (error) {
    docWarn_('No se pudo escribir el historial.', { motivo: docClassify_(error).message });
    return '';
  }
}

/**
 * Anota un evento en la auditoría técnica.
 *
 * `metadata_json` va acotado a propósito: una auditoría que guarda el expediente
 * entero en cada evento crece hasta hacer el libro inmanejable y, de paso,
 * duplica datos personales en una hoja que se conserva años.
 */
function doc2Audit_(evento) {
  try {
    var e = evento || {};
    var id = doc2NewId_('ev');
    docPut_(DOC2_SHEET.AUDITORIA, {
      evento_id: id,
      request_id: docRaw_(e.requestId || docTraceId_(), 200),
      expediente_id: docRaw_(e.expedienteId || '', 200),
      entidad_tipo: doc2Texto_(e.entidadTipo || 'sistema', 60),
      entidad_id: docRaw_(e.entidadId || '', 200),
      evento_tipo: doc2Texto_(e.tipo || 'evento', 120),
      actor_id: doc2Texto_(e.actorId || e.actor || 'desconocido', 240),
      actor_display: doc2Texto_(e.actorDisplay || e.actor || '', 240),
      origen: doc2Texto_(e.origen || 'web', 40),
      resultado: doc2Texto_(e.resultado || 'ok', 40),
      metadata_json: doc2MetadataAcotada_(e.metadata),
      created_at: docNow_()
    });
    docCount_('auditoria2');
    return id;
  } catch (error) {
    docWarn_('No se pudo escribir la auditoría técnica.', { motivo: docClassify_(error).message });
    return '';
  }
}

/**
 * Recorta los metadatos de auditoría.
 *
 * Se quedan fuera las claves con pinta de dato personal extenso y todo lo que
 * pase de 1 500 caracteres. La auditoría dice QUÉ pasó; el dato vive en su
 * entidad.
 */
function doc2MetadataAcotada_(metadata) {
  if (!metadata || typeof metadata !== 'object') return metadata === undefined ? null : metadata;
  var salida = {};
  var claves = Object.keys(metadata);
  for (var i = 0; i < claves.length && i < 20; i++) {
    var clave = claves[i];
    var valor = metadata[clave];
    if (valor === null || valor === undefined) continue;
    if (typeof valor === 'object') {
      var json = docWriteJson_(valor);
      salida[clave] = json.length > 400 ? (json.slice(0, 397) + '...') : docParseJson_(json, null);
    } else {
      var texto = String(valor);
      salida[clave] = texto.length > 300 ? (texto.slice(0, 297) + '...') : valor;
    }
  }
  var completo = docWriteJson_(salida);
  if (completo.length > 1500) return docParseJson_(completo.slice(0, 1450) + '"}', { recortado: true });
  return salida;
}

/**
 * Compara dos versiones de un registro y anota una línea de historial por campo.
 *
 * Devuelve cuántos campos cambiaron. Los sellos técnicos (`updated_at`,
 * `version_registro`…) se excluyen: registrar que la marca de tiempo cambió no
 * le dice nada a nadie.
 */
var DOC2_CAMPOS_NO_AUDITABLES = {
  updated_at: true, updated_by: true, created_at: true, created_by: true,
  version_registro: true, __row: true, idempotency_key_creacion: true
};

function doc2DiffHistorial_(entidadTipo, entidadId, antes, despues, contexto) {
  var ctx = contexto || {};
  var cambios = 0;
  for (var campo in despues) {
    if (!Object.prototype.hasOwnProperty.call(despues, campo)) continue;
    if (DOC2_CAMPOS_NO_AUDITABLES[campo]) continue;
    var a = antes ? antes[campo] : '';
    var b = despues[campo];
    if (String(a === null || a === undefined ? '' : a) === String(b === null || b === undefined ? '' : b)) continue;
    doc2Historial_({
      expedienteId: ctx.expedienteId || (despues.expediente_id || ''),
      entidadTipo: entidadTipo,
      entidadId: entidadId,
      campo: campo,
      anterior: a,
      nuevo: b,
      motivo: ctx.motivo || '',
      actor: ctx.actor || ''
    });
    cambios++;
  }
  return cambios;
}

/* ========================================================================== */
/* Fechas y SLA                                                                */
/* ========================================================================== */

/** Hoy en `yyyy-mm-dd`, según la zona del libro. */
function doc2Hoy_() {
  return docFormatDate_(new Date());
}

/** Días entre hoy y una fecha: negativo si ya pasó. */
function doc2DiasHasta_(fecha) {
  var solo = docDateOnly_(fecha);
  if (!solo) return null;
  var objetivo = new Date(solo + 'T00:00:00Z');
  if (isNaN(objetivo.getTime())) return null;
  var hoy = new Date(doc2Hoy_() + 'T00:00:00Z');
  return Math.round((objetivo.getTime() - hoy.getTime()) / 86400000);
}

/** Fecha resultante de sumar días a hoy. */
function doc2FechaMasDias_(dias) {
  var base = new Date(doc2Hoy_() + 'T00:00:00Z');
  base.setUTCDate(base.getUTCDate() + docInt_(dias, 0));
  return docFormatDate_(new Date(base.getTime()));
}

/** Fecha límite a partir de un SLA en horas. */
function doc2LimitePorSla_(horas) {
  var h = Math.max(docInt_(horas, 24), 1);
  return doc2FechaMasDias_(Math.ceil(h / 24));
}

/** ¿Está vencida esa fecha? Una fecha vacía nunca vence. */
function doc2Vencida_(fecha) {
  var dias = doc2DiasHasta_(fecha);
  return dias !== null && dias < 0;
}
