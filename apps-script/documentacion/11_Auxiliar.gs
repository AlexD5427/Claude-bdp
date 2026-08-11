/**
 * 11_Auxiliar.gs - la pestana `Auxiliar` y los catalogos administrables.
 *
 * -- Por que una pestana aparte y no `_CONFIG` -------------------------------
 * `_CONFIG` guarda pares clave/valor del modulo y esta oculta: nadie del area
 * la abre. `Auxiliar` es lo contrario: es una pestana de trabajo, visible, que
 * el equipo edita a mano para dar de alta una agencia nueva o retirar una
 * gerencia. Su forma tampoco es la misma: aqui cada CABECERA encabeza una
 * COLUMNA de valores, uno por fila. No es una tabla de entidades, es un par de
 * listas puestas en vertical.
 *
 * Por eso este archivo no usa el motor de `02_Store.gs`: ese motor asume
 * "una fila = una entidad con clave", y aqui no hay claves ni filas-entidad.
 * Forzarlo habria significado inventar un esquema falso.
 *
 * -- Las tres reglas que gobiernan este archivo ------------------------------
 *  1. NUNCA se borra un valor que escribio una persona. Ni al instalar, ni al
 *     reparar, ni al deduplicar. Como mucho se avisa.
 *  2. Las cabeceras se localizan por texto EXACTO (`agencia_bdp`,
 *     `gerencia_bdp`). Si aparece una variante -espacio invisible, mayuscula
 *     distinta, espacio de mas- se DIAGNOSTICA y se ofrece adoptarla, pero no
 *     se toca por iniciativa propia: renombrar la cabecera de alguien sin
 *     avisar rompe sus formulas.
 *  3. Ejecutar la instalacion dos veces no puede duplicar nada. Todo lo que
 *     escribe este archivo comprueba antes si ya existe.
 */

/** Nombre exacto de la pestana. No se traduce ni se normaliza. */
var DOC_AUX_SHEET = 'Auxiliar';

/** Cabeceras exactas que el modulo necesita encontrar o crear. */
var DOC_AUX_HEADER = {
  AGENCIA: 'agencia_bdp',
  GERENCIA: 'gerencia_bdp'
};

/** Orden en que se crean las cabeceras cuando la pestana esta vacia. */
var DOC_AUX_HEADER_ORDER = [DOC_AUX_HEADER.AGENCIA, DOC_AUX_HEADER.GERENCIA];

/** Clave de cache y su vigencia. Los catalogos cambian pocas veces al ano. */
var DOC_AUX_CACHE_KEY = 'doc_aux_opciones_v2';
var DOC_AUX_CACHE_TTL = 300;

/** Techo defensivo: una columna de catalogo con mas de esto es un error. */
var DOC_AUX_MAX_OPCIONES = 2000;

/* -------------------------------------------------------------------------- */
/* Acceso a la hoja                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Devuelve la hoja `Auxiliar`.
 *
 * `crear` en `false` devuelve `null` en lugar de lanzar: el diagnostico necesita
 * poder decir "no existe" sin que eso sea una excepcion.
 */
function docAuxSheet_(crear) {
  var ss = docSpreadsheet_();
  var hoja = ss.getSheetByName(DOC_AUX_SHEET);
  if (hoja) return hoja;
  if (!crear) return null;
  hoja = ss.insertSheet(DOC_AUX_SHEET);
  hoja.getRange(1, 1, 1, DOC_AUX_HEADER_ORDER.length).setValues([DOC_AUX_HEADER_ORDER]);
  docAuxStyleHeader_(hoja, DOC_AUX_HEADER_ORDER.length);
  hoja.setFrozenRows(1);
  docCount_('hojasCreadas');
  return hoja;
}

/**
 * Da a la fila de cabeceras el mismo aspecto que el resto del modulo.
 *
 * Se reutiliza la paleta de `00_Manifest.gs` a proposito: una pestana que
 * parece de otro sistema invita a tratarla como ajena.
 */
function docAuxStyleHeader_(hoja, columnas) {
  if (columnas < 1) return;
  var rango = hoja.getRange(1, 1, 1, columnas);
  rango
    .setBackground(DOC_COLOR.HEADER_MODULO_BG)
    .setFontColor(DOC_COLOR.HEADER_FG)
    .setFontWeight('bold')
    .setVerticalAlignment('middle')
    .setHorizontalAlignment('left');
  for (var c = 1; c <= columnas; c++) hoja.setColumnWidth(c, 260);
}

/**
 * Clave de comparacion de cabeceras.
 *
 * Deliberadamente MAS agresiva que la comparacion exacta: colapsa espacios,
 * quita el espacio duro que llega al pegar desde Word y baja a minusculas. Sirve
 * solo para DETECTAR variantes, nunca para decidir que una variante "vale".
 */
function docAuxHeaderKey_(valor) {
  var texto = String(valor === null || valor === undefined ? '' : valor);
  return texto.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* Lectura y analisis                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Lee la pestana entera de una sola vez y la deja analizada.
 *
 * Una unica llamada a `getValues()` para toda la rejilla. Leer columna a columna
 * costaria una llamada por cabecera y el resultado seria identico.
 *
 * Devuelve, por cada cabecera conocida:
 *   `columna`      indice 1-based donde esta la cabecera exacta, o 0
 *   `variantes`    columnas cuya cabecera se parece pero no es identica
 *   `duplicadas`   columnas con la cabecera exacta repetida
 *   `valores`      los valores no vacios, saneados y sin repetir
 *   `descartados`  cuantos se ignoraron por estar repetidos
 */
function docAuxScan_() {
  var hoja = docAuxSheet_(false);
  var info = {
    existe: false,
    filas: 0,
    columnas: 0,
    cabeceras: [],
    campos: {}
  };

  for (var h = 0; h < DOC_AUX_HEADER_ORDER.length; h++) {
    info.campos[DOC_AUX_HEADER_ORDER[h]] = {
      cabecera: DOC_AUX_HEADER_ORDER[h],
      columna: 0,
      variantes: [],
      duplicadas: [],
      valores: [],
      descartados: 0,
      vacios: 0
    };
  }

  if (!hoja) return info;

  info.existe = true;
  var ultimaFila = hoja.getLastRow();
  var ultimaCol = hoja.getLastColumn();
  info.filas = ultimaFila;
  info.columnas = ultimaCol;
  if (ultimaFila < 1 || ultimaCol < 1) return info;

  var rejilla = hoja.getRange(1, 1, ultimaFila, ultimaCol).getValues();
  docCount_('hojasLeidas');
  docCount_('filasLeidas', rejilla.length);

  var fila1 = rejilla[0];
  for (var c = 0; c < fila1.length; c++) {
    var crudo = fila1[c] === null || fila1[c] === undefined ? '' : String(fila1[c]);
    if (!crudo) continue;
    info.cabeceras.push({ columna: c + 1, texto: crudo });

    for (var k = 0; k < DOC_AUX_HEADER_ORDER.length; k++) {
      var esperada = DOC_AUX_HEADER_ORDER[k];
      var campo = info.campos[esperada];
      if (crudo === esperada) {
        if (campo.columna === 0) campo.columna = c + 1;
        else campo.duplicadas.push(c + 1);
      } else if (docAuxHeaderKey_(crudo) === docAuxHeaderKey_(esperada)) {
        campo.variantes.push({ columna: c + 1, texto: crudo });
      }
    }
  }

  // Valores de cada cabecera encontrada. Se recorre la rejilla ya cargada.
  for (var n = 0; n < DOC_AUX_HEADER_ORDER.length; n++) {
    var nombre = DOC_AUX_HEADER_ORDER[n];
    var destino = info.campos[nombre];
    var col = destino.columna;
    // Si no esta la exacta pero hay UNA sola variante, se leen sus valores para
    // no dejar al usuario con un desplegable vacio mientras decide si reparar.
    if (col === 0 && destino.variantes.length === 1) col = destino.variantes[0].columna;
    if (col === 0) continue;

    var vistos = {};
    for (var r = 1; r < rejilla.length; r++) {
      var celda = rejilla[r][col - 1];
      if (celda === null || celda === undefined) { destino.vacios++; continue; }
      var texto = docUntext_(celda).replace(/\u00a0/g, ' ').trim();
      if (!texto) { destino.vacios++; continue; }
      var clave = docKey_(texto);
      if (vistos[clave]) { destino.descartados++; continue; }
      vistos[clave] = true;
      destino.valores.push(texto);
      if (destino.valores.length >= DOC_AUX_MAX_OPCIONES) break;
    }
  }

  return info;
}

/**
 * Ordena de forma amigable sin alterar el texto guardado.
 *
 * `localeCompare` con sensibilidad de base para que "Ancoraimes" y "ANCORAIMES"
 * queden juntas y las tildes no manden "Nuñez" al final de la lista.
 */
function docAuxSort_(lista) {
  var copia = lista.slice();
  copia.sort(function (a, b) {
    try {
      return String(a).localeCompare(String(b), 'es', { sensitivity: 'base', numeric: true });
    } catch (e) {
      var ka = docKey_(a);
      var kb = docKey_(b);
      return ka < kb ? -1 : (ka > kb ? 1 : 0);
    }
  });
  return copia;
}

/* -------------------------------------------------------------------------- */
/* Opciones para el frontend                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Las listas de AGENCIA y GERENCIA listas para pintar un desplegable.
 *
 * Va por cache porque el formulario las pide en cada apertura y el contenido
 * cambia un punado de veces al ano. `refrescar` la salta cuando el usuario pulsa
 * "actualizar" en la interfaz.
 */
function docAuxOptions_(refrescar) {
  if (!refrescar) {
    var enCache = docCacheGet_(DOC_AUX_CACHE_KEY);
    if (enCache) {
      var reutilizado = docParseJson_(enCache, null);
      if (reutilizado) {
        reutilizado.desdeCache = true;
        return reutilizado;
      }
    }
  }

  var info = docAuxScan_();
  var avisos = [];

  if (!info.existe) {
    avisos.push('La pestana "' + DOC_AUX_SHEET + '" todavia no existe en el libro.');
  }

  var salida = {
    hoja: DOC_AUX_SHEET,
    existe: info.existe,
    generado: docNow_(),
    desdeCache: false,
    agencias: [],
    gerencias: [],
    detalle: {},
    avisos: avisos
  };

  var mapa = {};
  mapa[DOC_AUX_HEADER.AGENCIA] = 'agencias';
  mapa[DOC_AUX_HEADER.GERENCIA] = 'gerencias';

  for (var i = 0; i < DOC_AUX_HEADER_ORDER.length; i++) {
    var cabecera = DOC_AUX_HEADER_ORDER[i];
    var campo = info.campos[cabecera];
    var destino = mapa[cabecera];

    salida[destino] = docAuxSort_(campo.valores);
    salida.detalle[cabecera] = {
      columna: campo.columna,
      total: campo.valores.length,
      duplicadosDescartados: campo.descartados,
      celdasVacias: campo.vacios,
      variantes: campo.variantes,
      duplicadas: campo.duplicadas
    };

    if (info.existe && campo.columna === 0 && campo.variantes.length === 0) {
      avisos.push('Falta la cabecera "' + cabecera + '" en ' + DOC_AUX_SHEET + '.');
    }
    if (campo.columna === 0 && campo.variantes.length === 1) {
      avisos.push('Se estan leyendo los valores de "' + campo.variantes[0].texto +
        '", que se parece a "' + cabecera + '" pero no es identica.');
    }
    if (campo.variantes.length > 1) {
      avisos.push('Hay ' + campo.variantes.length + ' cabeceras parecidas a "' + cabecera +
        '". No se puede decidir cual es la buena sin intervencion.');
    }
    if (campo.duplicadas.length) {
      avisos.push('La cabecera "' + cabecera + '" aparece ' + (campo.duplicadas.length + 1) +
        ' veces. Solo se leyo la primera (columna ' + campo.columna + ').');
    }
    if (campo.descartados) {
      avisos.push('En "' + cabecera + '" se ignoraron ' + campo.descartados +
        ' valor(es) repetido(s).');
    }
  }

  docCachePut_(DOC_AUX_CACHE_KEY, docWriteJson_(salida), DOC_AUX_CACHE_TTL);
  return salida;
}

/** Tira la cache. Se llama tras cualquier escritura sobre la pestana. */
function docAuxInvalidate_() {
  docCacheRemove_(DOC_AUX_CACHE_KEY);
}

/* -------------------------------------------------------------------------- */
/* Diagnostico (solo lectura)                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Revisa la pestana sin tocarla.
 *
 * Devuelve hallazgos con la misma forma que el resto del modulo
 * (`severidad`, `codigo`, `titulo`, `detalle`, `accion`) para que el panel de
 * mantenimiento del frontend los pinte sin ningun caso especial.
 */
function docAuxDiagnose_() {
  var info = docAuxScan_();
  var hallazgos = [];

  function anotar(severidad, codigo, titulo, detalle, accion, datos) {
    hallazgos.push({
      severidad: severidad,
      codigo: codigo,
      titulo: titulo,
      detalle: detalle,
      accion: accion || '',
      datos: datos || {}
    });
  }

  if (!info.existe) {
    anotar('critico', 'AUX_SIN_HOJA',
      'No existe la pestana "' + DOC_AUX_SHEET + '"',
      'Los desplegables de AGENCIA y GERENCIA no tienen de donde leer.',
      'auxiliar.reparar');
    return { ok: false, criticos: 1, hoja: DOC_AUX_SHEET, existe: false, hallazgos: hallazgos, resumen: {} };
  }

  var resumen = {};

  for (var i = 0; i < DOC_AUX_HEADER_ORDER.length; i++) {
    var cabecera = DOC_AUX_HEADER_ORDER[i];
    var campo = info.campos[cabecera];

    resumen[cabecera] = {
      columna: campo.columna,
      opciones: campo.valores.length,
      repetidos: campo.descartados
    };

    if (campo.columna === 0) {
      if (campo.variantes.length === 0) {
        anotar('critico', 'AUX_CABECERA_FALTA',
          'Falta la cabecera "' + cabecera + '"',
          'Ninguna columna de ' + DOC_AUX_SHEET + ' se llama exactamente asi.',
          'auxiliar.reparar', { cabecera: cabecera });
      } else {
        var textos = [];
        for (var v = 0; v < campo.variantes.length; v++) {
          textos.push('columna ' + campo.variantes[v].columna + ' = "' + campo.variantes[v].texto + '"');
        }
        anotar(campo.variantes.length === 1 ? 'aviso' : 'critico', 'AUX_CABECERA_VARIANTE',
          'La cabecera "' + cabecera + '" esta escrita de otra forma',
          'Se encontro ' + textos.join(', ') + '. Diferencias de mayusculas o espacios ' +
          'invisibles hacen que la busqueda exacta no la vea.',
          campo.variantes.length === 1 ? 'auxiliar.reparar' : '',
          { cabecera: cabecera, variantes: campo.variantes });
      }
    }

    if (campo.duplicadas.length) {
      anotar('aviso', 'AUX_CABECERA_DUPLICADA',
        'La cabecera "' + cabecera + '" esta repetida',
        'Aparece en las columnas ' + [campo.columna].concat(campo.duplicadas).join(', ') +
        '. Solo se lee la primera; el resto es invisible para el modulo.',
        '', { cabecera: cabecera, columnas: [campo.columna].concat(campo.duplicadas) });
    }

    if (campo.columna > 0 && campo.valores.length === 0) {
      anotar('aviso', 'AUX_CATALOGO_VACIO',
        'El catalogo "' + cabecera + '" esta vacio',
        'La cabecera existe pero no tiene ningun valor debajo. El desplegable ' +
        'aparecera vacio en el formulario.',
        '', { cabecera: cabecera });
    }

    if (campo.descartados) {
      anotar('aviso', 'AUX_VALORES_REPETIDOS',
        'Hay valores repetidos en "' + cabecera + '"',
        campo.descartados + ' valor(es) aparecen mas de una vez. El modulo los ' +
        'ignora al construir el desplegable, pero conviene limpiarlos en la hoja.',
        '', { cabecera: cabecera, repetidos: campo.descartados });
    }

    if (campo.valores.length >= DOC_AUX_MAX_OPCIONES) {
      anotar('aviso', 'AUX_CATALOGO_ENORME',
        'El catalogo "' + cabecera + '" alcanzo el techo de lectura',
        'Se leyeron ' + DOC_AUX_MAX_OPCIONES + ' opciones y se dejo de leer. ' +
        'Revisa si la columna tiene datos que no son opciones.',
        '', { cabecera: cabecera });
    }
  }

  var criticos = 0;
  for (var h = 0; h < hallazgos.length; h++) {
    if (hallazgos[h].severidad === 'critico') criticos++;
  }

  return {
    ok: criticos === 0,
    criticos: criticos,
    hoja: DOC_AUX_SHEET,
    existe: true,
    hallazgos: hallazgos,
    resumen: resumen
  };
}

/* -------------------------------------------------------------------------- */
/* Reparacion segura                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Deja la pestana en condiciones sin destruir nada.
 *
 * Lo que SI hace:
 *   - crea la pestana si falta;
 *   - anade al final las cabeceras que no esten;
 *   - adopta una variante inequivoca (una sola, y sin que exista la exacta)
 *     reescribiendo SOLO la celda de la cabecera, no los valores.
 *
 * Lo que NO hace nunca:
 *   - borrar columnas, valores ni filas;
 *   - reordenar columnas;
 *   - decidir entre dos variantes ambiguas;
 *   - fusionar cabeceras duplicadas.
 *
 * Es idempotente: la segunda ejecucion no encuentra nada que hacer.
 */
function docAuxRepair_(actor, origen) {
  var acciones = [];
  var pendientes = [];

  var hoja = docAuxSheet_(false);
  if (!hoja) {
    hoja = docAuxSheet_(true);
    acciones.push({
      hoja: DOC_AUX_SHEET,
      accion: 'creada',
      detalle: 'Pestana creada con las cabeceras ' + DOC_AUX_HEADER_ORDER.join(' y ') + '.'
    });
    docAuxInvalidate_();
    var reciente = docAuxDiagnose_();
    docAuxAudit_(actor, origen, acciones, pendientes);
    return {
      hoja: DOC_AUX_SHEET,
      acciones: acciones,
      pendientes: pendientes,
      despues: reciente,
      opciones: docAuxOptions_(true)
    };
  }

  var info = docAuxScan_();

  for (var i = 0; i < DOC_AUX_HEADER_ORDER.length; i++) {
    var cabecera = DOC_AUX_HEADER_ORDER[i];
    var campo = info.campos[cabecera];

    if (campo.columna > 0) {
      if (campo.duplicadas.length) {
        pendientes.push({
          cabecera: cabecera,
          motivo: 'La cabecera esta repetida en las columnas ' +
            campo.duplicadas.join(', ') + '. Fusionar columnas puede perder datos, ' +
            'asi que se deja a criterio de una persona.'
        });
      }
      continue;
    }

    if (campo.variantes.length === 1) {
      var col = campo.variantes[0].columna;
      var antes = campo.variantes[0].texto;
      hoja.getRange(1, col).setValue(cabecera);
      acciones.push({
        hoja: DOC_AUX_SHEET,
        accion: 'cabecera normalizada',
        detalle: 'Columna ' + col + ': "' + antes + '" paso a "' + cabecera +
          '". Los valores de la columna no se tocaron.'
      });
      continue;
    }

    if (campo.variantes.length > 1) {
      var lista = [];
      for (var v = 0; v < campo.variantes.length; v++) {
        lista.push('columna ' + campo.variantes[v].columna + ' ("' + campo.variantes[v].texto + '")');
      }
      pendientes.push({
        cabecera: cabecera,
        motivo: 'Hay varias cabeceras parecidas: ' + lista.join(', ') +
          '. Renombrar la equivocada dejaria el catalogo mal. Corrigelo a mano.'
      });
      continue;
    }

    // No existe ni parecida: se anade al final, sin desplazar nada.
    var destino = Math.max(hoja.getLastColumn(), 0) + 1;
    if (destino > hoja.getMaxColumns()) hoja.insertColumnsAfter(hoja.getMaxColumns(), 1);
    hoja.getRange(1, destino).setValue(cabecera);
    docAuxStyleHeader_(hoja, destino);
    acciones.push({
      hoja: DOC_AUX_SHEET,
      accion: 'cabecera anadida',
      detalle: 'Se creo "' + cabecera + '" en la columna ' + destino + ', al final y vacia.'
    });
  }

  if (hoja.getFrozenRows() < 1) {
    hoja.setFrozenRows(1);
    acciones.push({ hoja: DOC_AUX_SHEET, accion: 'fila fijada', detalle: 'Se congelo la fila de cabeceras.' });
  }

  docAuxInvalidate_();
  var despues = docAuxDiagnose_();
  docAuxAudit_(actor, origen, acciones, pendientes);

  return {
    hoja: DOC_AUX_SHEET,
    acciones: acciones,
    pendientes: pendientes,
    despues: despues,
    opciones: docAuxOptions_(true)
  };
}

/** Deja constancia de la reparacion. Protegido: no puede tumbar la operacion. */
function docAuxAudit_(actor, origen, acciones, pendientes) {
  if (!acciones.length && !pendientes.length) return;
  try {
    docAudit_({
      accion: DOC_ACCION.REPARACION,
      entidad: 'auxiliar',
      referencia: DOC_AUX_SHEET,
      actor: actor || 'sistema',
      origen: origen || 'web',
      resultado: pendientes.length ? 'parcial' : 'ok',
      campo: 'catalogos',
      nuevo: acciones.length + ' cambio(s), ' + pendientes.length + ' pendiente(s)',
      detalle: { acciones: acciones, pendientes: pendientes }
    });
  } catch (e) { /* la auditoria no manda sobre la reparacion */ }
}

/* -------------------------------------------------------------------------- */
/* Validacion de valores contra el catalogo                                    */
/* -------------------------------------------------------------------------- */

/**
 * Comprueba si un valor guardado sigue estando en el catalogo activo.
 *
 * Devuelve `{ conocido, valor, sugerencia }`. Un expediente de 2023 puede
 * apuntar a una agencia que ya se cerro: eso NO es un error y su valor no se
 * borra jamas. El frontend lo pinta como valor historico con una advertencia,
 * que es exactamente lo que pidio el area.
 */
function docAuxMatch_(cabecera, valor) {
  var texto = String(valor === null || valor === undefined ? '' : valor).trim();
  if (!texto) return { conocido: true, valor: '', sugerencia: '' };

  var opciones = docAuxOptions_(false);
  var lista = cabecera === DOC_AUX_HEADER.GERENCIA ? opciones.gerencias : opciones.agencias;
  var clave = docKey_(texto);

  for (var i = 0; i < lista.length; i++) {
    if (docKey_(lista[i]) === clave) {
      return { conocido: true, valor: lista[i], sugerencia: '' };
    }
  }

  // Sugerencia por prefijo: barata y suficiente para erratas de tecleo.
  var sugerencia = '';
  var corto = clave.slice(0, Math.max(4, Math.floor(clave.length / 2)));
  for (var s = 0; s < lista.length && corto; s++) {
    if (docKey_(lista[s]).indexOf(corto) === 0) { sugerencia = lista[s]; break; }
  }

  return { conocido: false, valor: texto, sugerencia: sugerencia };
}

/**
 * Diagnostico + opciones en una sola respuesta.
 *
 * El frontend abre el formulario y necesita las dos cosas a la vez; separarlas
 * serian dos viajes al backend para pintar una pantalla.
 */
function docAuxValidate_() {
  var diagnostico = docAuxDiagnose_();
  var opciones = docAuxOptions_(true);
  return {
    hoja: DOC_AUX_SHEET,
    ok: diagnostico.ok,
    criticos: diagnostico.criticos,
    hallazgos: diagnostico.hallazgos,
    resumen: diagnostico.resumen,
    opciones: opciones
  };
}
