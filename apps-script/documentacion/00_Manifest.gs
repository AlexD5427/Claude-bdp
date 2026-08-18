/**
 * 00_Manifest.gs — la única descripción del libro de Documentación.
 *
 * Todo lo demás (instalador, motor de almacenamiento, mapeador, diagnóstico)
 * deriva de este archivo. Si mañana el equipo añade una columna, se añade aquí
 * y el resto del backend se entera solo.
 *
 * ── De dónde salen estos datos ───────────────────────────────────────────────
 * No están inventados. Se leyeron del libro que hoy usa el área de Reclutamiento
 * y Selección (`REGISTRO DE INGRESOS.xlsx`, pestañas CONTROL INGRESOS 2023 a
 * 2026) y se copiaron tal cual, incluidos los detalles que parecen erratas:
 *
 *   · «Tipo de Empleado » lleva un espacio al final;
 *   · «CORREO CARTA DE PRORROGA » también;
 *   · la columna L parte el encabezado con un salto de línea real;
 *   · «CONTRATO DE FIANZA» aparece DOS veces (columnas M y R).
 *
 * Se respetan a propósito. La persona que mantiene ese libro reconoce sus
 * columnas por cómo se ven, y un backend que «arregla» los encabezados por su
 * cuenta rompe sus filtros, sus fórmulas y su confianza. Para el duplicado de
 * «CONTRATO DE FIANZA» las columnas se localizan por encabezado *y número de
 * aparición* (ver `ocurrencia`), que es la única forma correcta de resolverlo.
 *
 * ── La lógica de colores del libro ───────────────────────────────────────────
 * Se dedujo cruzando los 900+ registros de las cuatro pestañas:
 *
 *   #92D050 verde       fila cerrada: el expediente está completo
 *   #73DCF5 celeste     ingreso recién abierto, todavía sin documentos cargados
 *   #FFFF00 amarillo    la celda tiene una observación que hay que leer
 *   #FF0000 rojo        crítico (persona desvinculada, documento imposible)
 *   #FFC000 ámbar       hay una prórroga corriendo
 *   #F8CBAD durazno     en gestión, con seguimiento activo
 *   #A9D08E verde claro avance parcial
 *   #B4C7E7 azul claro  columna «Proceso», que además lleva formato condicional
 *
 * Y el vocabulario de las columnas de documentos es cerrado:
 * TIENE · NO TIENE · N/A · _ (no corresponde) · y las variantes de
 * «TITULO LEGALIZADO» (TECNICO, EGRESADO, ESTUDIANTE, BACHILLER) y de
 * «VISTA O INFORMACION RAPIDA» (BOLETAS, FOLIO, FOLIO REAL).
 */

/** Identidad del backend. La interfaz la muestra en la pantalla de conexión. */
var DOC_BACKEND = {
  name: 'BDP · Documentación',
  version: '1.0.0',
  schemaVersion: 3,
  snapshotVersion: 1
};

/** Claves de `PropertiesService`. */
var DOC_PROP = {
  SPREADSHEET_ID: 'DOC_SPREADSHEET_ID',
  ADMIN_KEY: 'DOC_ADMIN_KEY',
  AUTH_MODE: 'DOC_AUTH_MODE',
  INSTALLED_AT: 'DOC_INSTALLED_AT'
};

/** Techos duros. Los de Sheets no son negociables; los demás son criterio. */
var DOC_LIMITS = {
  CELL_CHARS: 50000,
  SHORT_TEXT: 1000,
  LOCK_MS: 25000,
  MAX_ROWS_PER_READ: 5000,
  MAX_AUDIT_ROWS: 20000,
  MAX_LOG_ROWS: 5000,
  MAX_BACKUPS: 24,
  REQUEST_TTL_HOURS: 72
};

/** Hojas de sistema. Las anuales NO están aquí: se generan por año. */
var DOC_SHEET = {
  AUDITORIA: 'AUDITORIA',
  ENTREGAS: 'ENTREGA COM+SEGUROS',
  CATALOGO: '_CATALOGO',
  CONFIG: '_CONFIG',
  RESPALDOS: '_RESPALDOS',
  DIARIO: '_DIARIO',
  SOLICITUDES: '_SOLICITUDES',
  META: '_META'
};

/** Prefijo de las pestañas anuales. `CONTROL INGRESOS 2026`, etc. */
var DOC_YEAR_PREFIX = 'CONTROL INGRESOS ';

/** Paleta leída del libro original. Se usa tal cual, sin reinterpretar. */
var DOC_COLOR = {
  HEADER_BASE_BG: '#1f3864',
  HEADER_DOCS_BG: '#4472c4',
  HEADER_MODULO_BG: '#005baa',
  HEADER_FG: '#ffffff',

  FILA_COMPLETA: '#92d050',
  FILA_NUEVA: '#73dcf5',
  FILA_OBSERVADA: '#ffff00',
  FILA_CRITICA: '#ff0000',
  FILA_PRORROGA: '#ffc000',
  FILA_GESTION: '#f8cbad',
  FILA_PARCIAL: '#a9d08e',

  PROCESO_BG: '#b4c7e7',

  CF_OK_BG: '#c6efce',
  CF_OK_FG: '#006100',
  CF_MAL_BG: '#ffc7ce',
  CF_MAL_FG: '#9c0006',
  CF_AVISO_BG: '#ffeb9c',
  CF_AVISO_FG: '#9c6500',

  BORDE: '#bfbfbf',
  TEXTO: '#000000'
};

/** Vocabulario cerrado de las columnas de documentos del libro. */
var DOC_VALORES = {
  TIENE: 'TIENE',
  NO_TIENE: 'NO TIENE',
  NA: 'N/A',
  GUION: '_',
  PRORROGA: 'PRORROGA'
};

/** Opciones de la lista desplegable que se instala en cada columna. */
var DOC_LISTAS = {
  PROCESO: ['COMPLETO', 'FALTA'],
  TIPO_EMPLEADO: ['REGULAR', 'PLAZO FIJO', 'EVENTUAL', 'RESOLUCION', 'CONSULTOR'],
  DOCUMENTO: ['TIENE', 'NO TIENE', 'N/A', '_', 'PRORROGA'],
  TITULO: ['TIENE', 'NO TIENE', 'N/A', '_', 'TECNICO', 'EGRESADO', 'ESTUDIANTE', 'BACHILLER', 'PRORROGA'],
  VISTA: ['TIENE', 'NO TIENE', 'N/A', '_', 'BOLETAS', 'FOLIO', 'FOLIO REAL'],
  ESTADO: ['completo', 'al_dia', 'en_proceso', 'atrasado']
};

/**
 * Las 23 columnas del libro original, en su orden y con su texto exacto.
 *
 * `clave`      nombre interno estable; nunca cambia aunque cambie el encabezado
 * `encabezado` el texto EXACTO que se escribe en la fila 1
 * `ocurrencia` cuál de las repeticiones del encabezado es esta (1 = la primera)
 * `ancho`      píxeles, convertidos desde el ancho en caracteres del original
 * `lista`      clave de `DOC_LISTAS` con la validación de datos, si aplica
 * `items`      documentos del catálogo del módulo que alimentan esta columna
 * `manual`     `true` cuando la columna la llena la persona y el módulo no la
 *              deduce (el frontend la muestra igual, en la Ficha de control)
 */
var DOC_BASE_COLUMNS = [
  { clave: 'nombre', encabezado: 'Nombre', ocurrencia: 1, ancho: 392, alineacion: 'left', grupo: 'base' },
  { clave: 'tipo_empleado', encabezado: 'Tipo de Empleado ', ocurrencia: 1, ancho: 96, alineacion: 'left', grupo: 'base', lista: 'TIPO_EMPLEADO' },
  { clave: 'responsable', encabezado: 'Responsable de Proceso', ocurrencia: 1, ancho: 144, alineacion: 'left', grupo: 'base' },
  { clave: 'fecha_ingreso', encabezado: 'Fecha Ingreso', ocurrencia: 1, ancho: 101, alineacion: 'center', grupo: 'base', formato: 'dd/mm/yyyy' },
  { clave: 'cargo', encabezado: 'Cargo', ocurrencia: 1, ancho: 377, alineacion: 'left', grupo: 'base' },
  { clave: 'oficina', encabezado: 'Oficina', ocurrencia: 1, ancho: 193, alineacion: 'left', grupo: 'base' },
  { clave: 'gerencia', encabezado: 'Gerencia', ocurrencia: 1, ancho: 173, alineacion: 'left', grupo: 'base' },
  { clave: 'observacion', encabezado: 'Observacion', ocurrencia: 1, ancho: 446, alineacion: 'left', grupo: 'base' },
  { clave: 'proceso', encabezado: 'Proceso', ocurrencia: 1, ancho: 115, alineacion: 'center', grupo: 'base', lista: 'PROCESO' },

  { clave: 'perfil', encabezado: 'PERFIL', ocurrencia: 1, ancho: 110, alineacion: 'center', grupo: 'doc', lista: 'DOCUMENTO', manual: true },
  { clave: 'mf_memo', encabezado: 'MF Y MEMO', ocurrencia: 1, ancho: 126, alineacion: 'center', grupo: 'doc', lista: 'DOCUMENTO', manual: true },
  { clave: 'consentimiento_imagen', encabezado: 'CONSENTIMIENTO DE USO DE IMAGEN\n(ESCANEAR)', ocurrencia: 1, ancho: 124, alineacion: 'center', grupo: 'doc', lista: 'DOCUMENTO', manual: true, porDefecto: '_' },
  { clave: 'contrato_fianza', encabezado: 'CONTRATO DE FIANZA', ocurrencia: 1, ancho: 99, alineacion: 'center', grupo: 'doc', lista: 'DOCUMENTO', items: ['garante-ci', 'garante-inmueble', 'garante-folio'] },
  { clave: 'comunicacion_interna', encabezado: 'COMUNICACIÓN INTERNA', ocurrencia: 1, ancho: 124, alineacion: 'center', grupo: 'doc', lista: 'DOCUMENTO', manual: true },
  { clave: 'conozca_funcionario', encabezado: 'CONOZCA A SU FUNCIONARIO (LISTAS LEC)', ocurrencia: 1, ancho: 131, alineacion: 'center', grupo: 'doc', lista: 'DOCUMENTO', items: ['lgi-ft'] },
  { clave: 'rejap', encabezado: 'REJAP', ocurrencia: 1, ancho: 158, alineacion: 'center', grupo: 'doc', lista: 'DOCUMENTO', items: ['rejap'] },
  { clave: 'titulo_legalizado', encabezado: 'TITULO LEGALIZADO', ocurrencia: 1, ancho: 105, alineacion: 'center', grupo: 'doc', lista: 'TITULO', items: ['titulo-legalizado'] },
  { clave: 'contrato_fianza_garante', encabezado: 'CONTRATO DE FIANZA', ocurrencia: 2, ancho: 112, alineacion: 'center', grupo: 'doc', lista: 'DOCUMENTO', espejoDe: 'contrato_fianza' },
  { clave: 'vista_informacion_rapida', encabezado: 'VISTA O INFORMACION RAPIDA', ocurrencia: 1, ancho: 126, alineacion: 'center', grupo: 'doc', lista: 'VISTA', items: ['garante-folio', 'garante-boletas', 'garante-form-200-400'] },
  { clave: 'seguros_alianza', encabezado: 'SEGUROS ALIANZA', ocurrencia: 1, ancho: 124, alineacion: 'center', grupo: 'doc', lista: 'DOCUMENTO', items: ['seguro-accidentes'] },
  { clave: 'crediseguro', encabezado: 'CREDISEGURO', ocurrencia: 1, ancho: 113, alineacion: 'center', grupo: 'doc', lista: 'DOCUMENTO', items: ['seguro-vida'] },
  { clave: 'djj_no_codificacion', encabezado: 'DJJ NO CODIFICACION', ocurrencia: 1, ancho: 103, alineacion: 'center', grupo: 'doc', lista: 'DOCUMENTO', items: ['djj-no-vinculacion'] },
  { clave: 'correo_carta_prorroga', encabezado: 'CORREO CARTA DE PRORROGA ', ocurrencia: 1, ancho: 99, alineacion: 'center', grupo: 'doc', lista: 'DOCUMENTO', derivada: 'prorroga' }
];

/**
 * Columnas que añade el módulo, a la derecha de las suyas.
 *
 * Van DESPUÉS de la W a propósito: la persona sigue viendo su libro intacto al
 * abrirlo, y solo si se desplaza encuentra el bloque del sistema. `DETALLE_JSON`
 * guarda el expediente completo, que es lo que permite que una fila editada a
 * mano en Sheets y un expediente editado en la web converjan sin perder nada.
 */
var DOC_EXTRA_COLUMNS = [
  { clave: 'id', encabezado: 'ID EXPEDIENTE', ancho: 168, alineacion: 'left', grupo: 'modulo', tipo: 'id' },
  { clave: 'correo', encabezado: 'CORREO', ancho: 210, alineacion: 'left', grupo: 'modulo' },
  { clave: 'avance', encabezado: 'AVANCE %', ancho: 88, alineacion: 'center', grupo: 'modulo', tipo: 'int' },
  { clave: 'presentados', encabezado: 'DOCS PRESENTADOS', ancho: 96, alineacion: 'center', grupo: 'modulo', tipo: 'int' },
  { clave: 'pendientes', encabezado: 'DOCS PENDIENTES', ancho: 96, alineacion: 'center', grupo: 'modulo', tipo: 'int' },
  { clave: 'observados', encabezado: 'DOCS OBSERVADOS', ancho: 96, alineacion: 'center', grupo: 'modulo', tipo: 'int' },
  { clave: 'paginas', encabezado: 'PAGINAS', ancho: 80, alineacion: 'center', grupo: 'modulo', tipo: 'int' },
  { clave: 'estado', encabezado: 'ESTADO EXPEDIENTE', ancho: 130, alineacion: 'center', grupo: 'modulo', lista: 'ESTADO' },
  { clave: 'prorroga_hasta', encabezado: 'PRORROGA HASTA', ancho: 118, alineacion: 'center', grupo: 'modulo', formato: 'dd/mm/yyyy' },
  { clave: 'ultimo_aviso', encabezado: 'ULTIMO AVISO', ancho: 140, alineacion: 'center', grupo: 'modulo' },
  { clave: 'avisos', encabezado: 'AVISOS ENVIADOS', ancho: 96, alineacion: 'center', grupo: 'modulo', tipo: 'int' },
  { clave: 'detalle_json', encabezado: 'DETALLE JSON', ancho: 320, alineacion: 'left', grupo: 'modulo', tipo: 'json' },
  { clave: 'creado_en', encabezado: 'CREADO EN', ancho: 150, alineacion: 'center', grupo: 'modulo' },
  { clave: 'actualizado_en', encabezado: 'ACTUALIZADO EN', ancho: 150, alineacion: 'center', grupo: 'modulo' },
  { clave: 'actualizado_por', encabezado: 'ACTUALIZADO POR', ancho: 190, alineacion: 'left', grupo: 'modulo' },
  { clave: 'huella', encabezado: 'HUELLA', ancho: 120, alineacion: 'left', grupo: 'modulo' }
];

/** Todas las columnas de una pestaña anual, en orden. */
function docYearColumns_() {
  return DOC_BASE_COLUMNS.concat(DOC_EXTRA_COLUMNS);
}

/** Solo las columnas de documento (las que llevan TIENE / NO TIENE / N/A). */
function docDocumentColumns_() {
  var out = [];
  for (var i = 0; i < DOC_BASE_COLUMNS.length; i++) {
    if (DOC_BASE_COLUMNS[i].grupo === 'doc') out.push(DOC_BASE_COLUMNS[i]);
  }
  return out;
}

/** Busca una columna anual por su clave interna. */
function docColumnByKey_(clave) {
  var all = docYearColumns_();
  for (var i = 0; i < all.length; i++) {
    if (all[i].clave === clave) return all[i];
  }
  return null;
}

/* -------------------------- Hojas de sistema ------------------------------ */

/**
 * Esquema de las hojas auxiliares. Mismo contrato que las anuales pero sin
 * pretensión estética: aquí lo que importa es que se puedan leer y auditar.
 */
var DOC_SCHEMA = {};

DOC_SCHEMA[DOC_SHEET.AUDITORIA] = {
  describe: 'Bitácora de todo lo que ocurre: aperturas, ediciones, altas, bajas, envíos y sincronizaciones.',
  key: 'id',
  columns: [
    { name: 'id', type: 'id', width: 200 },
    { name: 'momento', type: 'iso', width: 165 },
    { name: 'accion', type: 'text', width: 150 },
    { name: 'entidad', type: 'text', width: 120 },
    { name: 'referencia', type: 'text', width: 180 },
    { name: 'expediente', type: 'text', width: 180 },
    { name: 'persona', type: 'text', width: 240 },
    { name: 'anio', type: 'int', width: 70 },
    { name: 'resultado', type: 'text', width: 100 },
    { name: 'actor', type: 'text', width: 220 },
    { name: 'origen', type: 'text', width: 110 },
    { name: 'campo', type: 'text', width: 170 },
    { name: 'valor_anterior', type: 'long', width: 260 },
    { name: 'valor_nuevo', type: 'long', width: 260 },
    { name: 'detalle_json', type: 'json', width: 300 },
    { name: 'traza', type: 'text', width: 150 },
    { name: 'ms', type: 'int', width: 70 }
  ]
};

DOC_SCHEMA[DOC_SHEET.ENTREGAS] = {
  describe: 'Réplica de la pestaña ENTREGA COM+SEGUROS: comunicaciones internas emitidas por cada ingreso.',
  key: 'n_com',
  columns: [
    { name: 'N° Com', type: 'text', width: 70 },
    { name: 'Nombre', type: 'long', width: 380 },
    { name: 'FECHA DE INGRESO', type: 'iso', width: 105 },
    { name: 'DIRIGIDO A', type: 'text', width: 140 },
    { name: 'RESPONSABLE', type: 'text', width: 300 },
    { name: 'EXPEDIENTE', type: 'text', width: 180 },
    { name: 'REGISTRADO EN', type: 'iso', width: 160 }
  ],
  alias: { n_com: 'N° Com' }
};

DOC_SCHEMA[DOC_SHEET.CATALOGO] = {
  describe: 'Catálogo de documentos exigidos. Editable: lo que se ponga aquí es lo que pide el frontend.',
  key: 'id',
  columns: [
    { name: 'id', type: 'id', width: 200 },
    { name: 'etiqueta', type: 'text', width: 420 },
    { name: 'grupo', type: 'text', width: 130 },
    { name: 'orden', type: 'int', width: 70 },
    { name: 'columna_libro', type: 'text', width: 200 },
    { name: 'permite_prorroga', type: 'bool', width: 120 },
    { name: 'obligatorio', type: 'bool', width: 100 },
    { name: 'activo', type: 'bool', width: 80 }
  ]
};

DOC_SCHEMA[DOC_SHEET.CONFIG] = {
  describe: 'Configuración del módulo: correo remitente, copia, cadencia y plantillas.',
  key: 'clave',
  columns: [
    { name: 'clave', type: 'id', width: 220 },
    { name: 'valor', type: 'long', width: 620 },
    { name: 'descripcion', type: 'text', width: 380 },
    { name: 'actualizado_en', type: 'iso', width: 165 }
  ]
};

DOC_SCHEMA[DOC_SHEET.RESPALDOS] = {
  describe: 'Respaldos completos en JSON. El sistema conserva los últimos y descarta los viejos.',
  key: 'id',
  columns: [
    { name: 'id', type: 'id', width: 200 },
    { name: 'momento', type: 'iso', width: 165 },
    { name: 'motivo', type: 'text', width: 200 },
    { name: 'anios', type: 'text', width: 160 },
    { name: 'expedientes', type: 'int', width: 100 },
    { name: 'bytes', type: 'int', width: 100 },
    { name: 'huella', type: 'text', width: 140 },
    { name: 'contenido_json', type: 'json', width: 400 }
  ]
};

DOC_SCHEMA[DOC_SHEET.DIARIO] = {
  describe: 'Diario técnico del backend. Sirve para entender un fallo sin abrir Apps Script.',
  key: 'id',
  columns: [
    { name: 'id', type: 'id', width: 200 },
    { name: 'momento', type: 'iso', width: 165 },
    { name: 'nivel', type: 'text', width: 90 },
    { name: 'accion', type: 'text', width: 150 },
    { name: 'mensaje', type: 'long', width: 520 },
    { name: 'datos_json', type: 'json', width: 320 },
    { name: 'traza', type: 'text', width: 150 }
  ]
};

DOC_SCHEMA[DOC_SHEET.SOLICITUDES] = {
  describe: 'Identificadores de solicitud ya procesados. Evita que un reintento duplique un alta.',
  key: 'solicitud_id',
  columns: [
    { name: 'solicitud_id', type: 'id', width: 260 },
    { name: 'accion', type: 'text', width: 160 },
    { name: 'referencia', type: 'text', width: 200 },
    { name: 'actor', type: 'text', width: 220 },
    { name: 'procesado_en', type: 'iso', width: 165 },
    { name: 'resultado_json', type: 'json', width: 320 }
  ]
};

DOC_SCHEMA[DOC_SHEET.META] = {
  describe: 'Metadatos de instalación: versión de esquema, quién instaló y cuándo.',
  key: 'clave',
  columns: [
    { name: 'clave', type: 'id', width: 240 },
    { name: 'valor', type: 'long', width: 520 },
    { name: 'actualizado_en', type: 'iso', width: 165 }
  ]
};

/** Orden de creación. Las anuales se crean aparte, bajo demanda. */
var DOC_SHEET_ORDER = [
  DOC_SHEET.AUDITORIA,
  DOC_SHEET.ENTREGAS,
  DOC_SHEET.CATALOGO,
  DOC_SHEET.CONFIG,
  DOC_SHEET.RESPALDOS,
  DOC_SHEET.DIARIO,
  DOC_SHEET.SOLICITUDES,
  DOC_SHEET.META
];

/** Hojas que el usuario no debería ver a diario. Se ocultan al instalar. */
var DOC_HIDDEN_SHEETS = [
  DOC_SHEET.CATALOGO,
  DOC_SHEET.CONFIG,
  DOC_SHEET.RESPALDOS,
  DOC_SHEET.DIARIO,
  DOC_SHEET.SOLICITUDES,
  DOC_SHEET.META
];

/** Nombres de las columnas de una hoja de sistema. */
function docColumnNames_(sheetName) {
  var spec = DOC_SCHEMA[sheetName];
  if (!spec) return [];
  var out = [];
  for (var i = 0; i < spec.columns.length; i++) out.push(spec.columns[i].name);
  return out;
}

/** Especificación de una columna de una hoja de sistema. */
function docColumnSpec_(sheetName, columnName) {
  var spec = DOC_SCHEMA[sheetName];
  if (!spec) return null;
  for (var i = 0; i < spec.columns.length; i++) {
    if (spec.columns[i].name === columnName) return spec.columns[i];
  }
  return null;
}

/* ------------------------- Catálogo de documentos ------------------------- */

/**
 * Los 31 documentos que hoy exige el proceso, con el mismo `id` que usa el
 * frontend (`src/lib/docTemplate.ts`). Se siembran en la hoja `_CATALOGO` la
 * primera vez y a partir de ahí manda la hoja: si el equipo añade, quita o
 * renombra un documento allí, el módulo lo respeta sin tocar código.
 */
var DOC_CATALOGO_SEMILLA = [
  { id: 'foto-4x4', etiqueta: 'Fotografía 4x4 fondo blanco', grupo: 'personal', prorroga: false, obligatorio: true },
  { id: 'antecedentes-felcc', etiqueta: 'Certificado de antecedentes FELCC', grupo: 'personal', prorroga: false, obligatorio: true },
  { id: 'rejap', etiqueta: 'Certificado REJAP', grupo: 'personal', prorroga: false, obligatorio: true, columna: 'rejap' },
  { id: 'ci-copia', etiqueta: 'Fotocopia de Cédula de Identidad', grupo: 'personal', prorroga: false, obligatorio: true },
  { id: 'factura-servicios', etiqueta: 'Factura de servicios básicos (luz o agua)', grupo: 'personal', prorroga: false, obligatorio: true },
  { id: 'croquis-domicilio', etiqueta: 'Croquis de domicilio', grupo: 'personal', prorroga: false, obligatorio: true },
  { id: 'cv', etiqueta: 'Currículum Vitae firmado', grupo: 'personal', prorroga: false, obligatorio: true },
  { id: 'cv-respaldo', etiqueta: 'Respaldos del Currículum Vitae', grupo: 'personal', prorroga: false, obligatorio: true },
  { id: 'cert-trabajo', etiqueta: 'Certificados de trabajo anteriores', grupo: 'personal', prorroga: true, obligatorio: true },
  { id: 'titulo-legalizado', etiqueta: 'Título académico legalizado', grupo: 'personal', prorroga: true, obligatorio: true, columna: 'titulo_legalizado' },
  { id: 'cuenta-bancaria', etiqueta: 'Número de cuenta bancaria', grupo: 'personal', prorroga: false, obligatorio: true },
  { id: 'extracto-gestora', etiqueta: 'Extracto de la Gestora Pública', grupo: 'personal', prorroga: false, obligatorio: true },
  { id: 'djj-no-vinculacion', etiqueta: 'Declaración jurada de no vinculación', grupo: 'personal', prorroga: false, obligatorio: true, columna: 'djj_no_codificacion' },
  { id: 'djj-bienes-rentas', etiqueta: 'Declaración jurada de bienes y rentas', grupo: 'personal', prorroga: false, obligatorio: true },
  { id: 'seguro-accidentes', etiqueta: 'Seguro de accidentes personales (Alianza)', grupo: 'personal', prorroga: false, obligatorio: true, columna: 'seguros_alianza' },
  { id: 'seguro-vida', etiqueta: 'Seguro de desgravamen / Crediseguro', grupo: 'personal', prorroga: false, obligatorio: true, columna: 'crediseguro' },
  { id: 'rc-iva', etiqueta: 'Formulario RC-IVA (110 / 610)', grupo: 'personal', prorroga: false, obligatorio: false },
  { id: 'carnet-heredero', etiqueta: 'Carnet de identidad de herederos', grupo: 'personal', prorroga: false, obligatorio: false },

  { id: 'garante-ci', etiqueta: 'Cédula de Identidad del garante', grupo: 'garantia', prorroga: false, obligatorio: true, columna: 'contrato_fianza' },
  { id: 'garante-inmueble', etiqueta: 'Documento del bien inmueble del garante', grupo: 'garantia', prorroga: false, obligatorio: true, columna: 'contrato_fianza' },
  { id: 'garante-folio', etiqueta: 'Folio real del bien inmueble', grupo: 'garantia', prorroga: false, obligatorio: true, columna: 'vista_informacion_rapida' },
  { id: 'garante-croquis-negocio', etiqueta: 'Croquis del negocio o domicilio del garante', grupo: 'garantia', prorroga: false, obligatorio: true },
  { id: 'garante-boletas', etiqueta: 'Boletas de pago del garante', grupo: 'garantia', prorroga: false, obligatorio: false, columna: 'vista_informacion_rapida' },
  { id: 'garante-form-200-400', etiqueta: 'Formularios 200 / 400 del garante', grupo: 'garantia', prorroga: false, obligatorio: false, columna: 'vista_informacion_rapida' },
  { id: 'garante-fam1-ci', etiqueta: 'Cédula de Identidad del garante familiar 1', grupo: 'garantia', prorroga: false, obligatorio: false },
  { id: 'garante-fam1-croquis', etiqueta: 'Croquis del garante familiar 1', grupo: 'garantia', prorroga: false, obligatorio: false },
  { id: 'garante-fam2-ci', etiqueta: 'Cédula de Identidad del garante familiar 2', grupo: 'garantia', prorroga: false, obligatorio: false },
  { id: 'garante-fam2-croquis', etiqueta: 'Croquis del garante familiar 2', grupo: 'garantia', prorroga: false, obligatorio: false },
  { id: 'garante-t1-fam-ci', etiqueta: 'CI del garante familiar (Tipo 1)', grupo: 'garantia', prorroga: false, obligatorio: false },
  { id: 'garante-t1-fam-croquis', etiqueta: 'Croquis del garante familiar (Tipo 1)', grupo: 'garantia', prorroga: false, obligatorio: false },
  { id: 'garante-t2-ci', etiqueta: 'Fotocopia de CI del postulante (Tipo 2)', grupo: 'garantia', prorroga: false, obligatorio: false },
  { id: 'garante-t2-croquis', etiqueta: 'Croquis de domicilio del postulante (Tipo 2)', grupo: 'garantia', prorroga: false, obligatorio: false },
  { id: 'garante-t3-ci', etiqueta: 'Fotocopia de CI del postulante (Tipo 3)', grupo: 'garantia', prorroga: false, obligatorio: false },
  { id: 'garante-t3-fam-ci', etiqueta: 'CI del garante familiar (Tipo 3)', grupo: 'garantia', prorroga: false, obligatorio: false },
  { id: 'garante-t3-fam-croquis', etiqueta: 'Croquis del garante familiar (Tipo 3)', grupo: 'garantia', prorroga: false, obligatorio: false },

  { id: 'impedimento-auditor', etiqueta: 'Declaración de impedimento de auditor', grupo: 'cumplimiento', prorroga: false, obligatorio: true },
  { id: 'lgi-ft', etiqueta: 'Capacitación LGI/FT', grupo: 'cumplimiento', prorroga: false, obligatorio: true, columna: 'conozca_funcionario' },
  { id: 'examen-uif', etiqueta: 'Examen UIF aprobado', grupo: 'cumplimiento', prorroga: true, obligatorio: true }
];

/** Configuración por defecto de la hoja `_CONFIG`. */
var DOC_CONFIG_SEMILLA = [
  { clave: 'proveedor_correo', valor: 'gmail', descripcion: 'gmail u outlook. Define el enlace de redacción que abre el frontend.' },
  { clave: 'cuenta_remitente', valor: '', descripcion: 'Cuenta desde la que se envían los avisos.' },
  { clave: 'correo_copia', valor: '', descripcion: 'Correo que siempre va en copia.' },
  { clave: 'cadencia_dias', valor: '3', descripcion: 'Cada cuántos días se recuerda la documentación pendiente.' },
  { clave: 'avisos_automaticos', valor: 'FALSE', descripcion: 'TRUE para que el disparador diario envíe los recordatorios solo.' },
  { clave: 'pedir_confirmacion', valor: 'TRUE', descripcion: 'TRUE para que el frontend muestre la vista previa antes de enviar.' },
  { clave: 'asunto_plantilla', valor: 'Documentación pendiente · {nombre}', descripcion: 'Plantilla del asunto. Admite {nombre}, {cargo}, {faltantes}, {dias}, {avance}.' },
  { clave: 'cuerpo_plantilla', valor: 'Estimado/a {nombre}:\n\nSegún nuestro registro, a {dias} días de su ingreso aún tenemos pendiente la siguiente documentación:\n\n{faltantes}\n\nAvance actual: {avance} ({presentados} de {total} documentos).\n\nAgradeceremos su remisión a la brevedad.\n\nUnidad de Reclutamiento y Selección', descripcion: 'Plantilla del cuerpo del correo.' },
  { clave: 'anio_activo', valor: '', descripcion: 'Pestaña anual que el frontend abre por defecto. Vacío = año en curso.' },
  { clave: 'autoreparacion', valor: 'TRUE', descripcion: 'TRUE para que el backend repare el esquema solo cuando detecte que falta algo.' },
  { clave: 'respaldo_automatico', valor: 'TRUE', descripcion: 'TRUE para guardar un respaldo diario en la hoja _RESPALDOS.' }
];
