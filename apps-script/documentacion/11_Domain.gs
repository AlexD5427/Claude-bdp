/**
 * 11_Domain.gs — configuración de dominio del módulo de Documentación.
 *
 * ── Qué resuelve este archivo ────────────────────────────────────────────────
 * La versión anterior del módulo guardaba TODO el expediente dentro de una celda
 * (`DETALLE JSON`) de la pestaña anual. Eso funcionó para lo que existía —una
 * cabecera y un checklist— y dejó de funcionar en cuanto el proceso creció:
 * revisiones, aprobaciones, solicitudes, tareas, prórrogas con historia,
 * comentarios, consentimientos. Nada de eso se puede consultar, filtrar ni
 * agregar si vive dentro de una cadena JSON: para saber «cuántas prórrogas
 * vencen esta semana» habría que leer 900 celdas, parsear 900 JSON y sumar.
 *
 * Por eso el modelo se normaliza: una pestaña por entidad, un registro por fila,
 * identificadores estables y resúmenes materializados en el expediente. El libro
 * anual (`CONTROL INGRESOS <año>`) se conserva intacto y sigue siendo la vista
 * que el área reconoce; el modelo normalizado es la base sobre la que operan los
 * flujos nuevos. La migración (19_Migrations.gs) los reconcilia.
 *
 * ── Por qué toda la configuración está en un solo sitio ──────────────────────
 * Porque una cadena mágica repetida en cuatro archivos es un error esperando su
 * turno. Aquí están los nombres de hoja, los encabezados, los estados, las
 * transiciones permitidas, los códigos de documento, los tipos de funcionario y
 * de garantía, los permisos, los eventos, los límites, la versión del esquema,
 * las claves de caché, los SLA, los umbrales de prórroga y los códigos de error.
 * Si algo de eso cambia, cambia aquí y el resto del backend se entera solo.
 *
 * ── Compatibilidad ──────────────────────────────────────────────────────────
 * Las especificaciones nuevas se registran DENTRO de `DOC_SCHEMA`, el mismo
 * diccionario que ya usaba el motor de almacenamiento. Así las hojas nuevas
 * heredan gratis la lectura por lotes, la escritura agrupada, la validación de
 * encabezados y el techo de 50 000 caracteres por celda que 02_Store.gs ya
 * resolvía, sin un segundo motor paralelo que mantener.
 */

/**
 * Versión del modelo normalizado. La migración compara contra este número.
 *
 * v5 añadió el conteo de hojas de los documentos físicos (`hojas_fisicas` en
 * `ExpedienteDocumentos`) y los metadatos de presentación del catálogo
 * (`presentacion_fisica`, `presentacion_digital`, `requiere_conteo_hojas`,
 * `subseccion`).
 *
 * v6 añade el **requisito personalizable**: un documento cuyo nombre y cuya
 * forma de presentación los decide quien registra el expediente, no el catálogo.
 * Eso son tres columnas nuevas en `ExpedienteDocumentos`
 * (`nombre_personalizado`, `presentacion_fisica`, `presentacion_digital`) y tres
 * en `CatalogoDocumentos` (`permite_nombre_libre`, `presentacion_editable`,
 * `estado_inicial`).
 *
 * Subirla también renueva las claves de caché, que la incluyen: una respuesta
 * cacheada con la forma anterior no puede sobrevivir al despliegue.
 */
var DOC2_SCHEMA_VERSION = 6;

/** Identidad de la arquitectura nueva, para las metas de las respuestas. */
var DOC2_BACKEND = {
  arquitectura: 'documentacion-normalizada',
  version: '2.0.0',
  esquema: DOC2_SCHEMA_VERSION
};

/* ========================================================================== */
/* Hojas                                                                      */
/* ========================================================================== */

/**
 * Pestañas del modelo normalizado.
 *
 * Los nombres NO llevan guion bajo a propósito: son hojas de trabajo, no
 * bitácoras internas, y quien audita el proceso tiene que poder abrirlas.
 */
var DOC2_SHEET = {
  EXPEDIENTES: 'Expedientes',
  EXPEDIENTE_DOCS: 'ExpedienteDocumentos',
  PRORROGAS: 'ExpedienteProrrogas',
  CATALOGO: 'CatalogoDocumentos',
  SOLICITUDES: 'SolicitudesDocumentales',
  SOLICITUD_DOCS: 'SolicitudDocumentos',
  REVISIONES: 'RevisionesDocumentales',
  APROBACIONES: 'AprobacionesDocumentales',
  COMENTARIOS: 'ComentariosDocumentacion',
  TAREAS: 'TareasDocumentales',
  NOTIFICACIONES: 'NotificacionesDocumentales',
  HISTORIAL: 'HistorialDocumentacion',
  AUDITORIA: 'AuditoriaDocumentacion',
  CONSENTIMIENTOS: 'ConsentimientosDocumentacion',
  RETENCION: 'PoliticasRetencion',
  EXPORTACIONES: 'ExportacionesDocumentacion',
  FILTROS: 'FiltrosDocumentacion',
  CONFIG: 'ConfiguracionDocumentacion',
  MIGRACIONES: 'MigracionesDocumentacion',
  AUXILIAR: 'Auxiliar'
};

/* ========================================================================== */
/* Catálogos auxiliares (hoja `Auxiliar`)                                     */
/* ========================================================================== */

/**
 * La hoja `Auxiliar` guarda un catálogo por COLUMNA, no por fila.
 *
 * Es la convención que el resto de la aplicación ya usa para sus catálogos
 * (`arquetipo_disc`, `competencias_lista`): una columna por lista, un valor por
 * celda. Se mantiene igual para que el área no tenga que aprender dos formas de
 * escribir lo mismo.
 *
 * Regla dura: estas columnas NUNCA se vacían. La inicialización, el diagnóstico
 * y la reparación pueden crear la cabecera y AÑADIR valores nuevos; jamás borran
 * uno existente, porque un valor histórico —una agencia que ya cerró— sigue
 * siendo necesario para leer los expedientes antiguos.
 *
 * `cargo_bdp` es la tercera columna y la más reciente. El campo «Cargo» del alta
 * no tenía fuente de datos: cada persona lo escribía a su manera y la lista de
 * cargos del banco no existía en ningún sitio consultable. Ahora se lee de la
 * hoja con exactamente la misma lógica que agencia y gerencia. La cabecera la
 * crea el backend si falta; los valores los pega el área, porque son su lista.
 */
var DOC2_AUXILIAR_COLUMNS = ['agencia_bdp', 'gerencia_bdp', 'cargo_bdp'];

/** Semilla mínima: las gerencias del banco. Solo se usa si la columna está vacía. */
var DOC2_GERENCIA_SEMILLA = [
  'GERENCIA GENERAL',
  'GERENCIA DE OPERACIONES',
  'GERENCIA DE NEGOCIOS',
  'GERENCIA DE RIESGOS',
  'GERENCIA DE ADMINISTRACION Y FINANZAS',
  'GERENCIA DE TECNOLOGIA DE LA INFORMACION',
  'GERENCIA DE RECURSOS HUMANOS',
  'GERENCIA DE AUDITORIA INTERNA',
  'GERENCIA DE CUMPLIMIENTO'
];

/* ========================================================================== */
/* Estados y transiciones                                                      */
/* ========================================================================== */

/** Estado del expediente. */
var DOC2_ESTADO_EXPEDIENTE = {
  BORRADOR: 'BORRADOR',
  INCOMPLETO: 'INCOMPLETO',
  EN_RECOLECCION: 'EN_RECOLECCION',
  EN_REVISION: 'EN_REVISION',
  OBSERVADO: 'OBSERVADO',
  CON_PRORROGA: 'CON_PRORROGA',
  COMPLETO: 'COMPLETO',
  APROBADO: 'APROBADO',
  ARCHIVADO: 'ARCHIVADO',
  PENDIENTE_ELIMINACION: 'PENDIENTE_ELIMINACION',
  ELIMINADO_LOGICO: 'ELIMINADO_LOGICO'
};

/** Estado documental de un requisito. */
var DOC2_ESTADO_DOCUMENTO = {
  ENTREGADO: 'ENTREGADO',
  PENDIENTE: 'PENDIENTE',
  NO_ENTREGADO: 'NO_ENTREGADO',
  NO_APLICA: 'NO_APLICA'
};

/** Estado de revisión de un requisito. */
var DOC2_ESTADO_REVISION = {
  SIN_REVISION: 'SIN_REVISION',
  EN_REVISION: 'EN_REVISION',
  APROBADO: 'APROBADO',
  APROBADO_CON_OBSERVACION: 'APROBADO_CON_OBSERVACION',
  OBSERVADO: 'OBSERVADO',
  RECHAZADO: 'RECHAZADO',
  REQUIERE_CORRECCION: 'REQUIERE_CORRECCION'
};

/** Estado de una solicitud documental. */
var DOC2_ESTADO_SOLICITUD = {
  BORRADOR: 'BORRADOR',
  PENDIENTE: 'PENDIENTE',
  NOTIFICADA: 'NOTIFICADA',
  VISTA: 'VISTA',
  EN_SEGUIMIENTO: 'EN_SEGUIMIENTO',
  COMPLETADA: 'COMPLETADA',
  VENCIDA: 'VENCIDA',
  CANCELADA: 'CANCELADA'
};

/** Estado de una aprobación. */
var DOC2_ESTADO_APROBACION = {
  PENDIENTE: 'PENDIENTE',
  APROBADA: 'APROBADA',
  RECHAZADA: 'RECHAZADA',
  CANCELADA: 'CANCELADA',
  VENCIDA: 'VENCIDA'
};

/** Estado de una tarea. */
var DOC2_ESTADO_TAREA = {
  PENDIENTE: 'PENDIENTE',
  EN_PROGRESO: 'EN_PROGRESO',
  BLOQUEADA: 'BLOQUEADA',
  COMPLETADA: 'COMPLETADA',
  CANCELADA: 'CANCELADA',
  VENCIDA: 'VENCIDA'
};

/** Estado de una prórroga. */
var DOC2_ESTADO_PRORROGA = {
  SOLICITADA: 'SOLICITADA',
  VIGENTE: 'VIGENTE',
  VENCIDA: 'VENCIDA',
  CUMPLIDA: 'CUMPLIDA',
  CANCELADA: 'CANCELADA',
  RECHAZADA: 'RECHAZADA'
};

/** Estado de un consentimiento. */
var DOC2_ESTADO_CONSENTIMIENTO = {
  PRESENTADO: 'PRESENTADO',
  ACEPTADO: 'ACEPTADO',
  RECHAZADO: 'RECHAZADO',
  REVOCADO: 'REVOCADO'
};

/**
 * Transiciones permitidas.
 *
 * ── Por qué el backend las verifica ─────────────────────────────────────────
 * Porque el frontend puede quedarse con una versión vieja de la pantalla, un
 * reintento puede llegar tarde y una hoja se puede editar a mano. Si el único
 * guardián del ciclo de vida es la interfaz, tarde o temprano hay un expediente
 * `APROBADO` con documentos pendientes, y nadie sabe explicar cómo llegó ahí.
 *
 * La lectura es `origen -> [destinos permitidos]`. Un destino igual al origen
 * siempre se admite (guardar sin cambio de estado no es una transición).
 */
var DOC2_TRANSICIONES_EXPEDIENTE = {
  BORRADOR: ['INCOMPLETO', 'EN_RECOLECCION', 'ARCHIVADO', 'ELIMINADO_LOGICO'],
  INCOMPLETO: ['EN_RECOLECCION', 'EN_REVISION', 'OBSERVADO', 'CON_PRORROGA', 'COMPLETO', 'ARCHIVADO', 'PENDIENTE_ELIMINACION'],
  EN_RECOLECCION: ['INCOMPLETO', 'EN_REVISION', 'OBSERVADO', 'CON_PRORROGA', 'COMPLETO', 'ARCHIVADO', 'PENDIENTE_ELIMINACION'],
  EN_REVISION: ['OBSERVADO', 'CON_PRORROGA', 'COMPLETO', 'APROBADO', 'EN_RECOLECCION', 'INCOMPLETO', 'ARCHIVADO'],
  OBSERVADO: ['EN_RECOLECCION', 'EN_REVISION', 'CON_PRORROGA', 'COMPLETO', 'INCOMPLETO', 'ARCHIVADO'],
  CON_PRORROGA: ['EN_RECOLECCION', 'EN_REVISION', 'OBSERVADO', 'COMPLETO', 'INCOMPLETO', 'ARCHIVADO'],
  COMPLETO: ['EN_REVISION', 'APROBADO', 'OBSERVADO', 'INCOMPLETO', 'EN_RECOLECCION', 'ARCHIVADO'],
  APROBADO: ['ARCHIVADO', 'OBSERVADO', 'EN_REVISION'],
  ARCHIVADO: ['EN_RECOLECCION', 'INCOMPLETO', 'COMPLETO', 'APROBADO', 'PENDIENTE_ELIMINACION'],
  PENDIENTE_ELIMINACION: ['ELIMINADO_LOGICO', 'ARCHIVADO'],
  ELIMINADO_LOGICO: ['ARCHIVADO']
};

var DOC2_TRANSICIONES_DOCUMENTO = {
  PENDIENTE: ['ENTREGADO', 'NO_ENTREGADO', 'NO_APLICA'],
  NO_ENTREGADO: ['ENTREGADO', 'PENDIENTE', 'NO_APLICA'],
  ENTREGADO: ['PENDIENTE', 'NO_ENTREGADO', 'NO_APLICA'],
  NO_APLICA: ['PENDIENTE', 'ENTREGADO', 'NO_ENTREGADO']
};

var DOC2_TRANSICIONES_REVISION = {
  // Desde «sin revisión» se admite cualquier decisión: obligar a pulsar antes
  // «iniciar revisión» para poder aprobar un documento que se está mirando ahora
  // mismo es burocracia de interfaz, no control. El estado EN_REVISION sigue
  // existiendo para cuando alguien deja algo a medias y quiere marcarlo.
  SIN_REVISION: ['EN_REVISION', 'APROBADO', 'APROBADO_CON_OBSERVACION', 'OBSERVADO', 'RECHAZADO', 'REQUIERE_CORRECCION'],
  EN_REVISION: ['APROBADO', 'APROBADO_CON_OBSERVACION', 'OBSERVADO', 'RECHAZADO', 'REQUIERE_CORRECCION', 'SIN_REVISION'],
  APROBADO: ['EN_REVISION', 'OBSERVADO'],
  APROBADO_CON_OBSERVACION: ['EN_REVISION', 'APROBADO', 'OBSERVADO'],
  OBSERVADO: ['EN_REVISION', 'REQUIERE_CORRECCION', 'APROBADO', 'APROBADO_CON_OBSERVACION'],
  RECHAZADO: ['EN_REVISION'],
  REQUIERE_CORRECCION: ['EN_REVISION', 'OBSERVADO', 'APROBADO']
};

var DOC2_TRANSICIONES_SOLICITUD = {
  BORRADOR: ['PENDIENTE', 'CANCELADA'],
  PENDIENTE: ['NOTIFICADA', 'EN_SEGUIMIENTO', 'COMPLETADA', 'VENCIDA', 'CANCELADA'],
  NOTIFICADA: ['VISTA', 'EN_SEGUIMIENTO', 'COMPLETADA', 'VENCIDA', 'CANCELADA'],
  VISTA: ['EN_SEGUIMIENTO', 'COMPLETADA', 'VENCIDA', 'CANCELADA'],
  EN_SEGUIMIENTO: ['COMPLETADA', 'VENCIDA', 'CANCELADA'],
  COMPLETADA: [],
  VENCIDA: ['EN_SEGUIMIENTO', 'COMPLETADA', 'CANCELADA'],
  CANCELADA: []
};

var DOC2_TRANSICIONES_APROBACION = {
  PENDIENTE: ['APROBADA', 'RECHAZADA', 'CANCELADA', 'VENCIDA'],
  APROBADA: [],
  RECHAZADA: [],
  CANCELADA: [],
  VENCIDA: ['APROBADA', 'RECHAZADA', 'CANCELADA']
};

var DOC2_TRANSICIONES_TAREA = {
  PENDIENTE: ['EN_PROGRESO', 'BLOQUEADA', 'COMPLETADA', 'CANCELADA', 'VENCIDA'],
  EN_PROGRESO: ['BLOQUEADA', 'COMPLETADA', 'CANCELADA', 'VENCIDA'],
  BLOQUEADA: ['EN_PROGRESO', 'PENDIENTE', 'COMPLETADA', 'CANCELADA', 'VENCIDA'],
  COMPLETADA: [],
  CANCELADA: [],
  VENCIDA: ['EN_PROGRESO', 'COMPLETADA', 'CANCELADA']
};

var DOC2_TRANSICIONES_PRORROGA = {
  SOLICITADA: ['VIGENTE', 'RECHAZADA', 'CANCELADA'],
  VIGENTE: ['CUMPLIDA', 'VENCIDA', 'CANCELADA'],
  VENCIDA: ['CUMPLIDA', 'CANCELADA', 'VIGENTE'],
  CUMPLIDA: [],
  CANCELADA: [],
  RECHAZADA: ['SOLICITADA']
};

/** Máquinas de estado por entidad, para que el validador sea uno solo. */
var DOC2_MAQUINAS = {
  expediente: { estados: DOC2_ESTADO_EXPEDIENTE, transiciones: DOC2_TRANSICIONES_EXPEDIENTE },
  documento: { estados: DOC2_ESTADO_DOCUMENTO, transiciones: DOC2_TRANSICIONES_DOCUMENTO },
  revision: { estados: DOC2_ESTADO_REVISION, transiciones: DOC2_TRANSICIONES_REVISION },
  solicitud: { estados: DOC2_ESTADO_SOLICITUD, transiciones: DOC2_TRANSICIONES_SOLICITUD },
  aprobacion: { estados: DOC2_ESTADO_APROBACION, transiciones: DOC2_TRANSICIONES_APROBACION },
  tarea: { estados: DOC2_ESTADO_TAREA, transiciones: DOC2_TRANSICIONES_TAREA },
  prorroga: { estados: DOC2_ESTADO_PRORROGA, transiciones: DOC2_TRANSICIONES_PRORROGA }
};

/**
 * Alias de estados conocidos.
 *
 * El libro y la versión anterior del módulo usaban un vocabulario propio
 * (`pendiente`, `presentado`, `TIENE`, `NO TIENE`, `_`…). La migración y la
 * lectura tolerante lo traducen; escribir siempre se hace con el vocabulario
 * canónico. Un alias solo entra aquí cuando su significado es INEQUÍVOCO: ante
 * la duda, el diagnóstico lo reporta y una persona decide.
 */
var DOC2_ALIAS_DOCUMENTO = {
  'PRESENTADO': 'ENTREGADO',
  'ENTREGADO': 'ENTREGADO',
  'TIENE': 'ENTREGADO',
  'SI': 'ENTREGADO',
  'PENDIENTE': 'PENDIENTE',
  'OBSERVADO': 'PENDIENTE',
  'NO TIENE': 'NO_ENTREGADO',
  'NO_ENTREGADO': 'NO_ENTREGADO',
  'NO ENTREGADO': 'NO_ENTREGADO',
  'FALTA': 'NO_ENTREGADO',
  'N/A': 'NO_APLICA',
  'NA': 'NO_APLICA',
  'NO_APLICA': 'NO_APLICA',
  'NO APLICA': 'NO_APLICA',
  '_': 'NO_APLICA'
};

/** Alias del estado del expediente que traía la versión anterior. */
var DOC2_ALIAS_EXPEDIENTE = {
  'COMPLETO': 'COMPLETO',
  'AL_DIA': 'EN_RECOLECCION',
  'AL DIA': 'EN_RECOLECCION',
  'EN_PROCESO': 'EN_RECOLECCION',
  'EN PROCESO': 'EN_RECOLECCION',
  'ATRASADO': 'INCOMPLETO',
  'BORRADOR': 'BORRADOR',
  'INCOMPLETO': 'INCOMPLETO',
  'EN_RECOLECCION': 'EN_RECOLECCION',
  'EN_REVISION': 'EN_REVISION',
  'OBSERVADO': 'OBSERVADO',
  'CON_PRORROGA': 'CON_PRORROGA',
  'APROBADO': 'APROBADO',
  'ARCHIVADO': 'ARCHIVADO',
  'PENDIENTE_ELIMINACION': 'PENDIENTE_ELIMINACION',
  'ELIMINADO_LOGICO': 'ELIMINADO_LOGICO'
};

/* ========================================================================== */
/* Tipos de funcionario y de garantía                                          */
/* ========================================================================== */

/**
 * Ramas del proceso documental.
 *
 * `EJECUTIVO` y `DIRECTORIO` existen y se muestran, pero deshabilitadas: el área
 * todavía no ha definido su lista de requisitos. Aparecen como «En construcción»
 * en lugar de esconderse, porque esconder una rama que existe hace que alguien
 * la registre como `GENERAL` y el expediente quede mal clasificado para siempre.
 */
var DOC2_TIPO_FUNCIONARIO = [
  { codigo: 'GENERAL', etiqueta: 'Funcionario general', activo: true, descripcion: 'Requisitos generales de incorporación.' },
  { codigo: 'COMERCIAL', etiqueta: 'Funcionario comercial', activo: true, descripcion: 'Añade la garantía comercial según el tipo elegido.' },
  { codigo: 'AUDITORIA', etiqueta: 'Auditoría interna', activo: true, descripcion: 'Añade la declaración de impedimento para ser auditor.' },
  { codigo: 'CUMPLIMIENTO', etiqueta: 'Cumplimiento / UIF', activo: true, descripcion: 'Añade la acreditación LGI/FT y el examen de la UIF.' },
  /**
   * Área administrativa: los generales y nada más.
   *
   * ── Por qué es una rama propia y no «GENERAL» ─────────────────────────────
   * Porque clasificar bien es la mitad del trabajo del área. Registrar a alguien
   * de administración como «funcionario general» funciona el primer día y arruina
   * el reporte por categoría para siempre: nadie puede después distinguir a quien
   * pertenece al área administrativa de quien se registró sin clasificar. La rama
   * existe, no pide nada extra, y el asistente lo dice en voz alta y salta
   * directamente a la revisión.
   */
  { codigo: 'ADMINISTRATIVO', etiqueta: 'Funcionario área administrativa', activo: true, descripcion: 'Solo los requisitos generales: esta rama no añade documentación adicional.' },
  { codigo: 'EJECUTIVO', etiqueta: 'Funcionario ejecutivo', activo: false, descripcion: 'En construcción: la lista de requisitos está en definición.' },
  { codigo: 'DIRECTORIO', etiqueta: 'Directorio', activo: false, descripcion: 'En construcción: la lista de requisitos está en definición.' }
];

/**
 * Tipos de funcionario admitidos al escribir.
 *
 * Se deriva de `DOC2_TIPO_FUNCIONARIO` en lugar de repetirse a mano en los tres
 * `doc2Enum_` que lo necesitaban (crear, actualizar, filtrar). Esa repetición ya
 * costó un fallo real: añadir una rama al vocabulario sin añadirla a las listas
 * hacía que el asistente la ofreciera y el alta la rechazara con
 * «tipo de funcionario no existe», un mensaje imposible de interpretar desde la
 * pantalla.
 */
function doc2CodigosTipoFuncionario_() {
  var out = [];
  for (var i = 0; i < DOC2_TIPO_FUNCIONARIO.length; i++) out.push(DOC2_TIPO_FUNCIONARIO[i].codigo);
  return out;
}

/** Códigos de tipo de garantía admitidos al escribir. Misma razón que arriba. */
function doc2CodigosTipoGarantia_() {
  var out = [];
  for (var i = 0; i < DOC2_TIPO_GARANTIA.length; i++) out.push(DOC2_TIPO_GARANTIA[i].codigo);
  return out;
}

var DOC2_TIPO_GARANTIA = [
  { codigo: 'NINGUNA', etiqueta: 'Sin garantía', activo: true, descripcion: 'El cargo no exige garantía comercial.' },
  { codigo: 'COMERCIAL_1', etiqueta: 'Comercial Tipo 1 · garantía real', activo: true, descripcion: 'Garante con bien inmueble y folio real.' },
  { codigo: 'COMERCIAL_2', etiqueta: 'Comercial Tipo 2 · garante personal', activo: true, descripcion: 'Garante dependiente o independiente con respaldo de ingresos.' },
  { codigo: 'COMERCIAL_3', etiqueta: 'Comercial Tipo 3 · doble garante familiar', activo: true, descripcion: 'Dos garantes familiares con cédula y croquis.' }
];

/** Secciones del expediente, en el orden en que se muestran. */
var DOC2_SECCIONES = [
  { codigo: 'generales', etiqueta: 'Documentos generales', orden: 10 },
  { codigo: 'garantia', etiqueta: 'Garantía comercial', orden: 20 },
  { codigo: 'cumplimiento', etiqueta: 'Cumplimiento y UIF', orden: 30 }
];

/* ========================================================================== */
/* Catálogo de documentos                                                      */
/* ========================================================================== */

/**
 * Formas de presentación de un requisito.
 *
 * El área distingue tres casos y hasta ahora los llevaba en una tabla aparte, en
 * papel. `CONDICIONAL` es el «SÍ*» de su lista: el original físico se pide solo
 * en ciertos casos (por ejemplo, cuando la copia digital no basta para el legajo)
 * y por eso lleva asterisco y leyenda al pie, en lugar de un texto suelto
 * cableado en la interfaz.
 */
var DOC2_PRESENTACION = { SI: 'SI', NO: 'NO', CONDICIONAL: 'CONDICIONAL' };

/**
 * El catálogo canónico (versión 4).
 *
 * ── Qué cambió en la versión 3 ──────────────────────────────────────────────
 * 1. Los documentos GENERALES pasan a ser exactamente los 16 de la lista que el
 *    área entregó, con su redacción literal. `cert-trabajo` («Certificados de
 *    trabajo») y `rc-iva` («Certificado de saldo a favor del dependiente») dejan
 *    de pedirse: se marcan `activo: false` y `fecha_fin_vigencia`, así que el
 *    motor de aplicabilidad no los incluye nunca más en un alta nueva, pero
 *    siguen en el catálogo —y en los expedientes antiguos que los referencian—
 *    identificados como heredados. Sus filas NO se borran: hay expedientes de
 *    2023 con esos requisitos entregados y borrarlos sería destruir el registro.
 * 2. Cada requisito declara CÓMO se presenta (`presentacionFisica`,
 *    `presentacionDigital`) y si lleva contador de hojas
 *    (`requiereConteoHojas`). La interfaz ya no cablea la lista de documentos
 *    físicos: la deduce del catálogo, que es la única fuente.
 * 3. Las ramas de garantía se organizan en SUBSECCIONES con título. La
 *    subsección puede declararse por rama: `garante-inmueble` y `garante-folio`
 *    aplican a Tipo 1 y a Tipo 3 y pertenecen a subsecciones distintas en cada
 *    una, así que `subseccion` admite un mapa `{ COMERCIAL_1: '…', COMERCIAL_3: '…' }`
 *    además de un texto único.
 * 4. Cumplimiento gana un requisito nuevo: la declaración jurada de
 *    prohibiciones del personal de la Unidad de Cumplimiento.
 *
 * ── Qué cambia en la versión 4 ──────────────────────────────────────────────
 * 5. **Cuatro generales nuevos al final de la lista**: manual de funciones,
 *    memorándum de designación, comunicación interna y `otros-documento`.
 * 6. **El seguro de accidentes deja de llevar conteo de hojas**: pasa a ser solo
 *    digital, porque no llega papel al legajo.
 * 7. **El folio real del bien inmueble pasa a físico Y digital con conteo**, en
 *    las dos ramas donde aplica, con un solo cambio.
 * 8. **Requisitos personalizables**: `nombreLibre` y `presentacionEditable`
 *    delegan el nombre y la forma de presentación al expediente concreto, y
 *    `estadoInicial` permite que un requisito opcional nazca fuera del cálculo
 *    de avance.
 *
 * `codigo` conserva los identificadores que ya existían (`foto-4x4`,
 * `garante-ci`…). No se renombran: los expedientes guardados los referencian y
 * cambiarlos obligaría a una migración de datos a cambio de nada. Lo que cambia
 * es `nombre_visible`.
 *
 * `tipo_funcionario` y `tipo_garantia` son listas de aplicabilidad. Vacío
 * significa «para todos». El motor de 13_Catalog.gs las interpreta.
 *
 * Recuentos que produce esta semilla (comprobados por `10_Tests.gs` y por
 * `npm run doc:check`): General 20 · Administrativo 20 · Comercial T1 25 ·
 * T2 29 · T3 25 · Auditoría 21 · Cumplimiento 23.
 */
var DOC2_CATALOGO_SEMILLA = [
  /* ── 16 Documentos Generales, en el orden de la lista del área ─────────── */
  {
    codigo: 'foto-4x4',
    nombre: '1 Fotografía en formato digital 4X4 fondo blanco y vestimenta formal (actualizada de los últimos 6 meses), debe ser entregada por correo electrónico, WhatsApp.',
    seccion: 'generales', grupo: 'personal', obligatorio: true,
    presentacionFisica: 'NO', presentacionDigital: 'SI'
  },
  {
    codigo: 'antecedentes-felcc',
    nombre: 'Certificado de antecedentes policiales expedido por la FELCC (vigente).',
    seccion: 'generales', grupo: 'personal', obligatorio: true,
    presentacionFisica: 'CONDICIONAL', presentacionDigital: 'SI', requiereConteoHojas: true
  },
  {
    codigo: 'rejap',
    nombre: 'Registro Judicial de Antecedentes Penales REJAP (vigente).',
    seccion: 'generales', grupo: 'personal', obligatorio: true, columna: 'rejap',
    presentacionFisica: 'CONDICIONAL', presentacionDigital: 'SI', requiereConteoHojas: true
  },
  {
    codigo: 'ci-copia',
    nombre: 'Fotocopia simple / escaneado de Carnet de Identidad.',
    seccion: 'generales', grupo: 'personal', obligatorio: true,
    presentacionFisica: 'NO', presentacionDigital: 'SI'
  },
  {
    codigo: 'factura-servicios',
    nombre: 'Fotocopia / escaneado de factura, comprobante, boleta, recibo o respaldo de servicios básicos emitida por la empresa de servicios que corresponda o Certificado de la Comunidad (en todos los casos que mencione la dirección de su domicilio).',
    seccion: 'generales', grupo: 'personal', obligatorio: true,
    presentacionFisica: 'NO', presentacionDigital: 'SI'
  },
  {
    codigo: 'croquis-domicilio',
    nombre: 'Croquis domiciliario.',
    seccion: 'generales', grupo: 'personal', obligatorio: true,
    presentacionFisica: 'NO', presentacionDigital: 'SI'
  },
  {
    codigo: 'cv',
    nombre: 'Curriculum Vitae actualizado.',
    seccion: 'generales', grupo: 'personal', obligatorio: true,
    presentacionFisica: 'NO', presentacionDigital: 'SI'
  },
  {
    codigo: 'cv-respaldo',
    nombre: 'Documentos de respaldo del Curriculum Vitae actualizado.',
    seccion: 'generales', grupo: 'personal', obligatorio: true,
    presentacionFisica: 'NO', presentacionDigital: 'SI'
  },
  {
    codigo: 'titulo-legalizado',
    nombre: 'Fotocopia legalizada del Título académico del último grado alcanzado, de acuerdo al perfil de cargo (No aplica para grado académico técnico medio o superior o egresados).',
    seccion: 'generales', grupo: 'personal', obligatorio: true, prorroga: true, noAplica: true,
    columna: 'titulo_legalizado',
    observacion: 'Admite prórroga mientras el título esté en legalización.',
    presentacionFisica: 'SI', presentacionDigital: 'SI', requiereConteoHojas: true
  },
  {
    codigo: 'cuenta-bancaria',
    nombre: 'N° de Cuenta Bancaria (BCP para zonas urbanas y Banco Unión para zonas rurales).',
    seccion: 'generales', grupo: 'personal', obligatorio: true,
    presentacionFisica: 'NO', presentacionDigital: 'SI'
  },
  {
    codigo: 'extracto-gestora',
    nombre: 'Extracto de la Gestora Pública de la Seguridad Social a Largo Plazo donde figure el número NUA o CUA.',
    seccion: 'generales', grupo: 'personal', obligatorio: true,
    presentacionFisica: 'NO', presentacionDigital: 'SI'
  },
  {
    codigo: 'djj-no-vinculacion',
    nombre: 'Declaración Jurada de No vinculación por parentesco ni Favorecimiento Crediticio.',
    seccion: 'generales', grupo: 'personal', obligatorio: true, columna: 'djj_no_codificacion',
    presentacionFisica: 'NO', presentacionDigital: 'SI'
  },
  {
    codigo: 'djj-bienes-rentas',
    nombre: 'Fotocopia / escaneado de la Declaración Jurada de Bienes y Rentas recepcionada por la Contraloría General del Estado.',
    seccion: 'generales', grupo: 'personal', obligatorio: true,
    presentacionFisica: 'NO', presentacionDigital: 'SI'
  },
  {
    /**
     * Seguro de Accidentes Personales (Alianza).
     *
     * ── Por qué ya no lleva conteo de hojas ───────────────────────────────────
     * Porque dejó de entregarse en papel. El formulario lo proporciona el banco,
     * se llena y se remite a la aseguradora por correo: al legajo físico no llega
     * nada que archivar, así que el contador de hojas pedía un dato que no
     * existe. Un contador que nadie puede rellenar con la verdad se rellena con
     * un cero, y un cero en esa columna se lee como «documento sin hojas», que es
     * una afirmación falsa. Solo `DIGITAL`.
     */
    codigo: 'seguro-accidentes',
    nombre: 'Seguro de Accidentes Personales (formulario proporcionado por el banco).',
    seccion: 'generales', grupo: 'personal', obligatorio: true, columna: 'seguros_alianza',
    presentacionFisica: 'NO', presentacionDigital: 'SI'
  },
  {
    codigo: 'seguro-vida',
    nombre: 'Seguro de Vida Individual (formulario proporcionado por el banco).',
    seccion: 'generales', grupo: 'personal', obligatorio: true, columna: 'crediseguro',
    presentacionFisica: 'SI', presentacionDigital: 'SI', requiereConteoHojas: true
  },
  {
    codigo: 'carnet-heredero',
    nombre: 'Fotocopia simple / escaneado de carnet de heredero de contrato.',
    seccion: 'generales', grupo: 'personal', obligatorio: false, noAplica: true,
    presentacionFisica: 'NO', presentacionDigital: 'SI'
  },

  /* ── Generales RETIRADOS ───────────────────────────────────────────────────
   * Siguen declarados para que su fila exista, su nombre se pueda mostrar y el
   * catálogo heredado siga completo, pero `retirado: true` los deja inactivos:
   * `doc2Aplicables_` lee solo los activos, así que un alta nueva no los pide.
   * Un expediente que ya los tenía los sigue viendo, marcados como heredados. */
  {
    codigo: 'cert-trabajo', nombre: 'Certificados de trabajo (requisito retirado)',
    seccion: 'generales', grupo: 'personal', obligatorio: false, noAplica: true, prorroga: true,
    observacion: 'Requisito retirado de la lista del área. Se conserva para los expedientes que ya lo tenían.',
    presentacionFisica: 'NO', presentacionDigital: 'SI', retirado: true
  },
  {
    codigo: 'rc-iva', nombre: 'Certificado de saldo a favor del dependiente (RC-IVA) (requisito retirado)',
    seccion: 'generales', grupo: 'personal', obligatorio: false, noAplica: true,
    observacion: 'Requisito retirado de la lista del área. Se conserva para los expedientes que ya lo tenían.',
    presentacionFisica: 'NO', presentacionDigital: 'SI', retirado: true
  },

  /* ── Generales del legajo administrativo (versión 4 del catálogo) ───────────
   * Los tres primeros son documentos que el área produce y archiva: el manual de
   * funciones firmado, el memorándum de designación y la comunicación interna del
   * alta. Van en papel al legajo Y escaneados al expediente digital, así que los
   * tres llevan contador de hojas.
   *
   * Entran AL FINAL de los generales a propósito: su `orden` sale de la posición
   * en este arreglo, y ponerlos al final es lo que hace que aparezcan después de
   * los dieciséis de la lista original —que es donde el área los espera— sin
   * renumerar nada de lo que ya existe. */
  {
    codigo: 'manual-funciones',
    nombre: 'Manual de Funciones del cargo.',
    seccion: 'generales', grupo: 'personal', obligatorio: true,
    presentacionFisica: 'SI', presentacionDigital: 'SI', requiereConteoHojas: true
  },
  {
    codigo: 'memorandum-designacion',
    nombre: 'Memorándum de Designación.',
    seccion: 'generales', grupo: 'personal', obligatorio: true,
    presentacionFisica: 'SI', presentacionDigital: 'SI', requiereConteoHojas: true
  },
  {
    codigo: 'comunicacion-interna',
    nombre: 'Comunicación Interna.',
    seccion: 'generales', grupo: 'personal', obligatorio: true,
    presentacionFisica: 'SI', presentacionDigital: 'SI', requiereConteoHojas: true
  },
  {
    /**
     * «Otros»: el requisito que el catálogo no puede prever.
     *
     * ── Qué problema resuelve ─────────────────────────────────────────────────
     * Un legajo real trae, de vez en cuando, un papel que ninguna lista
     * contempla: una certificación de un colegio profesional, una autorización
     * puntual, un anexo que pidió el directorio. Hasta ahora eso terminaba en el
     * campo de observaciones de otro documento, donde no se puede contar, ni
     * filtrar, ni exportar, ni saber cuántas hojas ocupa en el archivador.
     *
     * ── Tres cosas que lo hacen distinto de los demás ─────────────────────────
     * 1. `nombreLibre`: el nombre lo escribe quien registra el expediente y se
     *    guarda EN LA FILA DEL EXPEDIENTE (`nombre_personalizado`), no en el
     *    catálogo. Si se guardara en el catálogo, el segundo expediente que usara
     *    «Otros» renombraría el del primero.
     * 2. `presentacionEditable`: físico, digital o ambos se decide por expediente.
     *    De ahí sale si lleva contador de hojas: un documento solo digital no
     *    tiene hojas que contar.
     * 3. `estadoInicial: 'NO_APLICA'`: nace fuera del cálculo de avance. Es la
     *    diferencia entre ofrecer una herramienta y castigar a quien no la usa:
     *    si naciera `PENDIENTE`, TODOS los expedientes del banco mostrarían un
     *    requisito pendiente eterno y ninguno llegaría al 100 %.
     */
    codigo: 'otros-documento',
    nombre: 'Otros documentos (especificar)',
    seccion: 'generales', grupo: 'personal', obligatorio: false, noAplica: true,
    nombreLibre: true, presentacionEditable: true, estadoInicial: 'NO_APLICA',
    observacion: 'Escribe el nombre del documento y elige si se presenta en físico, en digital o en ambos.',
    presentacionFisica: 'SI', presentacionDigital: 'SI', requiereConteoHojas: true
  },

  /* ── Garantía comercial ────────────────────────────────────────────────────
   * Tres ramas mutuamente excluyentes de FUNCIONARIO ÁREA COMERCIAL. El motor de
   * 13_Catalog.gs filtra por `garantia`, así que un expediente ve SOLO los
   * documentos de su tipo. El ORDEN del arreglo fija el orden de presentación
   * dentro de cada rama (el `orden` se deriva de la posición) y, con él, el orden
   * de las subsecciones. Casi todos son fotocopias: digitales y sin contador de
   * hojas. La excepción es `garante-folio` —el folio real del bien inmueble—, que
   * sí se archiva en papel y por eso lleva las dos presentaciones y su conteo.
   *
   * ── Tipo 1 · garante con bien inmueble + garante familiar (4° grado) ── */
  {
    codigo: 'garante-ci', nombre: 'Fotocopia de CI del garante',
    seccion: 'garantia', grupo: 'garantia', obligatorio: true, columna: 'contrato_fianza',
    funcionario: ['COMERCIAL'], garantia: ['COMERCIAL_1'],
    subseccion: '1 Garante con Bien Inmueble',
    presentacionFisica: 'NO', presentacionDigital: 'SI'
  },
  {
    codigo: 'garante-inmueble', nombre: 'Bien Inmueble con o sin hipoteca',
    seccion: 'garantia', grupo: 'garantia', obligatorio: true, columna: 'contrato_fianza',
    funcionario: ['COMERCIAL'], garantia: ['COMERCIAL_1', 'COMERCIAL_3'],
    /* La trampa de este catálogo: el mismo documento pertenece a subsecciones
       distintas según la rama. Un texto único mentiría en una de las dos. */
    subseccion: { COMERCIAL_1: '1 Garante con Bien Inmueble', COMERCIAL_3: 'Postulante con inmueble propio' },
    presentacionFisica: 'NO', presentacionDigital: 'SI'
  },
  {
    /**
     * Folio real del bien inmueble.
     *
     * ── Un solo documento en dos ramas, y por eso el cambio es global ─────────
     * Esta entrada aplica a Comercial Tipo 1 (como documento del garante con bien
     * inmueble) y a Comercial Tipo 3 (como documento del propio postulante). Es
     * la MISMA fila del catálogo en los dos sitios: por eso marcar aquí que se
     * presenta en físico y en digital, y que lleva conteo de hojas, lo cambia en
     * las dos ramas, en la vista del expediente, en los reportes, en el informe
     * mensual y en la exportación, sin tocar nada más. Ese es el argumento de que
     * el catálogo sea una sola fuente.
     *
     * El folio real es un documento de Derechos Reales que se archiva en el
     * legajo en papel y que además se escanea, así que `SI` / `SI` + conteo.
     */
    codigo: 'garante-folio',
    nombre: 'Folio real del bien inmueble / Información rápida con antigüedad no menor a un mes.',
    seccion: 'garantia', grupo: 'garantia', obligatorio: true, columna: 'vista_informacion_rapida',
    funcionario: ['COMERCIAL'], garantia: ['COMERCIAL_1', 'COMERCIAL_3'],
    subseccion: { COMERCIAL_1: '1 Garante con Bien Inmueble', COMERCIAL_3: 'Postulante con inmueble propio' },
    presentacionFisica: 'SI', presentacionDigital: 'SI', requiereConteoHojas: true
  },
  {
    codigo: 'garante-t1-fam-ci', nombre: 'Fotocopia de CI',
    seccion: 'garantia', grupo: 'garantia', obligatorio: true,
    funcionario: ['COMERCIAL'], garantia: ['COMERCIAL_1'],
    subseccion: '1 Garante Familiar (hasta 4to grado de consanguinidad)',
    presentacionFisica: 'NO', presentacionDigital: 'SI'
  },
  {
    codigo: 'garante-t1-fam-croquis', nombre: 'Croquis domicilio',
    seccion: 'garantia', grupo: 'garantia', obligatorio: true,
    funcionario: ['COMERCIAL'], garantia: ['COMERCIAL_1'],
    subseccion: '1 Garante Familiar (hasta 4to grado de consanguinidad)',
    presentacionFisica: 'NO', presentacionDigital: 'SI'
  },

  /* ── Tipo 2 · garante que demuestre ingresos + dos garantes familiares ── */
  {
    codigo: 'garante-t2-ci', nombre: 'Fotocopia de CI',
    seccion: 'garantia', grupo: 'garantia', obligatorio: true,
    funcionario: ['COMERCIAL'], garantia: ['COMERCIAL_2'],
    subseccion: '1 Garante que demuestre ingresos',
    presentacionFisica: 'NO', presentacionDigital: 'SI'
  },
  {
    codigo: 'garante-t2-croquis', nombre: 'Croquis domicilio',
    seccion: 'garantia', grupo: 'garantia', obligatorio: true,
    funcionario: ['COMERCIAL'], garantia: ['COMERCIAL_2'],
    subseccion: '1 Garante que demuestre ingresos',
    presentacionFisica: 'NO', presentacionDigital: 'SI'
  },
  {
    codigo: 'garante-croquis-negocio', nombre: 'Croquis del negocio / Fuente laboral',
    seccion: 'garantia', grupo: 'garantia', obligatorio: true,
    funcionario: ['COMERCIAL'], garantia: ['COMERCIAL_2'],
    subseccion: '1 Garante que demuestre ingresos',
    presentacionFisica: 'NO', presentacionDigital: 'SI'
  },
  {
    codigo: 'garante-boletas', nombre: '3 últimas boletas de pago (Dependiente)',
    seccion: 'garantia', grupo: 'garantia', obligatorio: true, columna: 'vista_informacion_rapida',
    funcionario: ['COMERCIAL'], garantia: ['COMERCIAL_2'],
    subseccion: '1 Garante que demuestre ingresos',
    presentacionFisica: 'NO', presentacionDigital: 'SI'
  },
  {
    codigo: 'garante-form-200-400', nombre: 'Formulario 200-400 de las tres últimas declaraciones juradas (Independiente)',
    seccion: 'garantia', grupo: 'garantia', obligatorio: false, noAplica: true, columna: 'vista_informacion_rapida',
    funcionario: ['COMERCIAL'], garantia: ['COMERCIAL_2'],
    subseccion: '1 Garante que demuestre ingresos',
    presentacionFisica: 'NO', presentacionDigital: 'SI'
  },
  {
    codigo: 'garante-fam1-ci', nombre: 'Fotocopia de CI · Garante familiar 1',
    seccion: 'garantia', grupo: 'garantia', obligatorio: true,
    funcionario: ['COMERCIAL'], garantia: ['COMERCIAL_2'],
    subseccion: '2 Garantes Familiares (hasta 4to grado de consanguinidad)',
    presentacionFisica: 'NO', presentacionDigital: 'SI'
  },
  {
    codigo: 'garante-fam1-croquis', nombre: 'Croquis domicilio · Garante familiar 1',
    seccion: 'garantia', grupo: 'garantia', obligatorio: true,
    funcionario: ['COMERCIAL'], garantia: ['COMERCIAL_2'],
    subseccion: '2 Garantes Familiares (hasta 4to grado de consanguinidad)',
    presentacionFisica: 'NO', presentacionDigital: 'SI'
  },
  {
    codigo: 'garante-fam2-ci', nombre: 'Fotocopia de CI · Garante familiar 2',
    seccion: 'garantia', grupo: 'garantia', obligatorio: true,
    funcionario: ['COMERCIAL'], garantia: ['COMERCIAL_2'],
    subseccion: '2 Garantes Familiares (hasta 4to grado de consanguinidad)',
    presentacionFisica: 'NO', presentacionDigital: 'SI'
  },
  {
    codigo: 'garante-fam2-croquis', nombre: 'Croquis domicilio · Garante familiar 2',
    seccion: 'garantia', grupo: 'garantia', obligatorio: true,
    funcionario: ['COMERCIAL'], garantia: ['COMERCIAL_2'],
    subseccion: '2 Garantes Familiares (hasta 4to grado de consanguinidad)',
    presentacionFisica: 'NO', presentacionDigital: 'SI'
  },

  /* ── Tipo 3 · postulante con inmueble propio + garante familiar ──
   * Reutiliza `garante-inmueble` y `garante-folio` (declarados arriba); aquí van
   * sus documentos exclusivos. */
  {
    codigo: 'garante-t3-ci', nombre: 'Fotocopia de CI',
    seccion: 'garantia', grupo: 'garantia', obligatorio: true,
    funcionario: ['COMERCIAL'], garantia: ['COMERCIAL_3'],
    subseccion: 'Postulante con inmueble propio',
    presentacionFisica: 'NO', presentacionDigital: 'SI'
  },
  {
    codigo: 'garante-t3-fam-ci', nombre: 'Fotocopia de CI',
    seccion: 'garantia', grupo: 'garantia', obligatorio: true,
    funcionario: ['COMERCIAL'], garantia: ['COMERCIAL_3'],
    subseccion: '1 Garante Familiar (hasta 4to grado de consanguinidad)',
    presentacionFisica: 'NO', presentacionDigital: 'SI'
  },
  {
    codigo: 'garante-t3-fam-croquis', nombre: 'Croquis domicilio',
    seccion: 'garantia', grupo: 'garantia', obligatorio: true,
    funcionario: ['COMERCIAL'], garantia: ['COMERCIAL_3'],
    subseccion: '1 Garante Familiar (hasta 4to grado de consanguinidad)',
    presentacionFisica: 'NO', presentacionDigital: 'SI'
  },

  /* ── Cumplimiento y UIF ─────────────────────────────────────────────────────
   * AUDITORÍA exige SOLO la declaración de impedimento; CUMPLIMIENTO exige la
   * declaración de prohibiciones, la acreditación LGI/FT y el examen de la UIF.
   * Los cuatro son documentos FÍSICOS con contador de hojas: se archivan en el
   * legajo en papel. */
  {
    codigo: 'impedimento-auditor', nombre: 'Declaración de impedimento para ser Auditor Interno.',
    seccion: 'cumplimiento', grupo: 'cumplimiento', obligatorio: true,
    funcionario: ['AUDITORIA'], revision: true,
    subseccion: 'Requisito propio de Auditoría',
    presentacionFisica: 'SI', presentacionDigital: 'NO', requiereConteoHojas: true
  },
  {
    codigo: 'djj-prohibiciones-cumplimiento',
    nombre: 'Declaración Jurada de prohibiciones para personal de la Unidad de Cumplimiento',
    seccion: 'cumplimiento', grupo: 'cumplimiento', obligatorio: true,
    funcionario: ['CUMPLIMIENTO'], revision: true,
    subseccion: 'Requisitos propios de Cumplimiento',
    presentacionFisica: 'SI', presentacionDigital: 'NO', requiereConteoHojas: true
  },
  {
    codigo: 'lgi-ft',
    nombre: 'Conocimientos acreditados en temas de prevención, detección, control y reporte de LGI/FT',
    seccion: 'cumplimiento', grupo: 'cumplimiento', obligatorio: true, columna: 'conozca_funcionario',
    funcionario: ['CUMPLIMIENTO'], revision: true,
    subseccion: 'Requisitos propios de Cumplimiento',
    presentacionFisica: 'SI', presentacionDigital: 'NO', requiereConteoHojas: true
  },
  {
    codigo: 'examen-uif',
    nombre: 'Examen presencial de la UIF, el cual se realizará dentro de los tres meses de haber sido contratado',
    seccion: 'cumplimiento', grupo: 'cumplimiento', obligatorio: true, prorroga: true,
    funcionario: ['CUMPLIMIENTO'], revision: true, aprobacion: true,
    subseccion: 'Requisitos propios de Cumplimiento',
    observacion: 'El plazo son tres meses desde la contratación: se registra como prórroga con su cuenta regresiva.',
    presentacionFisica: 'SI', presentacionDigital: 'NO', requiereConteoHojas: true
  }
];

/**
 * Versión del catálogo. Se sella en cada requisito para poder auditar cambios.
 *
 * Subirla es lo que dispara el refresco de los metadatos estructurales en
 * `doc2SeedCatalogo_` (sección, aplicabilidad, presentación, subsección) sin
 * pisar lo que el área haya editado a mano.
 */
var DOC2_CATALOGO_VERSION = 4;

/**
 * Códigos generales retirados de la lista vigente.
 *
 * Se deriva de la semilla para no repetir la lista en dos sitios. Lo consultan
 * la interfaz (para marcar el requisito como heredado) y el diagnóstico.
 */
function doc2CodigosRetirados_() {
  var out = [];
  for (var i = 0; i < DOC2_CATALOGO_SEMILLA.length; i++) {
    if (DOC2_CATALOGO_SEMILLA[i].retirado === true) out.push(DOC2_CATALOGO_SEMILLA[i].codigo);
  }
  return out;
}

/** Definición de la semilla por su código, o `null`. Solo lectura. */
function doc2SemillaPorCodigo_(codigo) {
  for (var i = 0; i < DOC2_CATALOGO_SEMILLA.length; i++) {
    if (DOC2_CATALOGO_SEMILLA[i].codigo === String(codigo)) return DOC2_CATALOGO_SEMILLA[i];
  }
  return null;
}

/** Códigos de la semilla que llevan contador de hojas físicas. */
function doc2ConConteoDeHojasEnSemilla_() {
  var out = [];
  for (var i = 0; i < DOC2_CATALOGO_SEMILLA.length; i++) {
    if (DOC2_CATALOGO_SEMILLA[i].requiereConteoHojas === true) out.push(DOC2_CATALOGO_SEMILLA[i].codigo);
  }
  return out;
}

/**
 * Subsección de un requisito para una rama concreta.
 *
 * Acepta las dos formas en que puede venir declarada —texto único o mapa por
 * tipo de garantía— y devuelve cadena vacía cuando el requisito no pertenece a
 * ninguna. Es la función que usan el asistente, la vista del expediente, los
 * reportes y las exportaciones: si cada uno lo resolviera a su manera, el mismo
 * documento acabaría bajo dos títulos distintos.
 */
function doc2ResolverSubseccion_(valor, tipoGarantia) {
  if (!valor) return '';
  if (typeof valor === 'string') {
    var texto = String(valor).trim();
    if (!texto) return '';
    if (texto.charAt(0) !== '{') return texto;
    var mapa = docParseJson_(texto, null);
    if (!mapa) return texto;
    return doc2ResolverSubseccion_(mapa, tipoGarantia);
  }
  var clave = docKey_(tipoGarantia || '').replace(/[ \-]/g, '_');
  if (clave && valor[clave]) return String(valor[clave]);
  if (valor['*']) return String(valor['*']);
  // Sin rama que resolver, se devuelve la primera declarada: es mejor un título
  // aproximado que ninguno cuando alguien lista el catálogo entero.
  for (var k in valor) {
    if (Object.prototype.hasOwnProperty.call(valor, k)) return String(valor[k]);
  }
  return '';
}

/** Serializa la subsección para guardarla en la hoja: texto o JSON compacto. */
function doc2SerializarSubseccion_(valor) {
  if (!valor) return '';
  if (typeof valor === 'string') return valor;
  return docWriteJson_(valor);
}

/* ========================================================================== */
/* Requisitos personalizables                                                  */
/* ========================================================================== */

/**
 * Presentación EFECTIVA de un requisito de expediente.
 *
 * ── El problema ─────────────────────────────────────────────────────────────
 * Hasta la versión 5 la respuesta era trivial: la presentación la decía el
 * catálogo y punto. Con `otros-documento` deja de serlo, porque ese requisito
 * permite que cada expediente elija físico, digital o ambos. Eso abre la puerta
 * al error clásico de tener la misma pregunta contestada en cuatro sitios: la
 * pantalla del alta, la vista del expediente, los reportes y el informe mensual.
 * Cuando uno de los cuatro se olvida de mirar el valor de la fila, el documento
 * aparece con contador de hojas en la pantalla y sin columna en el Excel.
 *
 * Así que la respuesta vive en UNA función, y las cuatro capas la llaman.
 *
 * ── La regla, en tres líneas ────────────────────────────────────────────────
 *  1. si la fila trae una presentación propia, esa manda;
 *  2. si no, manda la del catálogo;
 *  3. el conteo de hojas se DERIVA: un requisito editable lleva contador si su
 *     presentación efectiva no es «solo digital»; uno normal lleva lo que diga
 *     `requiere_conteo_hojas`.
 *
 * El punto 3 es el que evita el estado imposible: un «Otros» marcado como solo
 * digital con doce hojas registradas.
 *
 * @param {Object} fila Fila de `ExpedienteDocumentos`, o `null`.
 * @param {Object} def  Fila del catálogo, o `null`.
 */
function doc2PresentacionEfectiva_(fila, def) {
  var editable = !!(def && def.presentacion_editable === true);
  var libre = !!(def && def.permite_nombre_libre === true);

  var fisicaFila = fila ? String(fila.presentacion_fisica || '').toUpperCase() : '';
  var digitalFila = fila ? String(fila.presentacion_digital || '').toUpperCase() : '';

  var fisica = doc2PresentacionValida_(fisicaFila, ['SI', 'NO', 'CONDICIONAL'])
    ? fisicaFila
    : String((def && def.presentacion_fisica) || 'NO').toUpperCase();
  var digital = doc2PresentacionValida_(digitalFila, ['SI', 'NO'])
    ? digitalFila
    : String((def && def.presentacion_digital) || 'SI').toUpperCase();

  if (!doc2PresentacionValida_(fisica, ['SI', 'NO', 'CONDICIONAL'])) fisica = 'NO';
  if (!doc2PresentacionValida_(digital, ['SI', 'NO'])) digital = 'SI';

  // Un requisito sin ninguna forma de presentación no es representable: el área
  // no puede pedir un documento que no se entrega de ninguna manera. Se resuelve
  // a digital, que es la entrega por defecto de todo el proceso.
  if (fisica === 'NO' && digital === 'NO') digital = 'SI';

  var conteo = editable ? fisica !== 'NO' : !!(def && def.requiere_conteo_hojas === true);

  return {
    fisica: fisica,
    digital: digital,
    requiereConteoHojas: conteo,
    presentacionEditable: editable,
    permiteNombreLibre: libre
  };
}

/** ¿Es uno de los valores admitidos? Sin lanzar: se usa para decidir reservas. */
function doc2PresentacionValida_(valor, permitidos) {
  if (!valor) return false;
  for (var i = 0; i < permitidos.length; i++) {
    if (permitidos[i] === valor) return true;
  }
  return false;
}

/**
 * Nombre EFECTIVO de un requisito.
 *
 * El nombre personalizado de la fila gana sobre el del catálogo, y el código es
 * el último recurso. Se usa en la pantalla, en los reportes, en el informe
 * mensual, en el espejo del libro anual y en los mensajes de error: un «Otros»
 * que en un sitio se llama «Certificación del colegio» y en otro
 * «Otros documentos (especificar)» es el mismo documento con dos nombres, y eso
 * rompe la única cosa que un legajo tiene que garantizar.
 */
function doc2NombreEfectivoRequisito_(fila, def) {
  var propio = fila ? String(fila.nombre_personalizado || '').trim() : '';
  if (propio) return propio;
  if (def && def.nombre_visible) return String(def.nombre_visible);
  return String((fila && fila.codigo_documento) || '');
}

/** Códigos de la semilla que permiten escribir su propio nombre. */
function doc2CodigosPersonalizables_() {
  var out = [];
  for (var i = 0; i < DOC2_CATALOGO_SEMILLA.length; i++) {
    if (DOC2_CATALOGO_SEMILLA[i].nombreLibre === true) out.push(DOC2_CATALOGO_SEMILLA[i].codigo);
  }
  return out;
}

/* ========================================================================== */
/* Motivos de revisión                                                         */
/* ========================================================================== */

/** Motivos configurables de una decisión de revisión. */
var DOC2_MOTIVOS_REVISION = [
  { codigo: 'INFO_INCOMPLETA', etiqueta: 'Información incompleta' },
  { codigo: 'INFO_INCONSISTENTE', etiqueta: 'Información inconsistente' },
  { codigo: 'REQUISITO_VENCIDO', etiqueta: 'Requisito vencido' },
  { codigo: 'REQUISITO_INCORRECTO', etiqueta: 'Requisito incorrecto' },
  { codigo: 'FALTAN_DATOS', etiqueta: 'Faltan datos' },
  { codigo: 'OBSERVACION_ABIERTA', etiqueta: 'Observación no resuelta' },
  { codigo: 'REQUIERE_PRORROGA', etiqueta: 'Prórroga necesaria' },
  { codigo: 'NO_CORRESPONDE', etiqueta: 'No corresponde' },
  { codigo: 'VALIDACION_ADICIONAL', etiqueta: 'Requiere validación adicional' },
  { codigo: 'OTRO', etiqueta: 'Otro motivo' }
];

/* ========================================================================== */
/* Roles y permisos                                                            */
/* ========================================================================== */

/**
 * Roles. Son los MISMOS que ya usa la aplicación (`src/lib/profilesStore.ts`):
 * no se inventa un sistema de usuarios paralelo, se reutiliza el que existe.
 */
var DOC2_ROLES = ['admin', 'supervisor', 'auxiliar', 'analista', 'pasante', 'invitado'];

/** Capacidades del módulo. Cada acción pública exige una de estas. */
var DOC2_CAPACIDAD = {
  VER: 'ver',
  EDITAR: 'editar',
  REVISAR: 'revisar',
  APROBAR: 'aprobar',
  COMENTAR: 'comentar',
  SOLICITAR: 'solicitar',
  TAREAS: 'tareas',
  EXPORTAR: 'exportar',
  AUDITORIA: 'auditoria',
  DIAGNOSTICAR: 'diagnosticar',
  REPARAR: 'reparar',
  MIGRAR: 'migrar',
  CATALOGOS: 'catalogos',
  ARCHIVAR: 'archivar',
  RESTAURAR: 'restaurar',
  CONFIGURAR: 'configurar'
};

/**
 * Matriz de permisos.
 *
 * Se lee «rol -> capacidades concedidas». El `invitado` solo mira; el `pasante`
 * puede comentar porque su trabajo es precisamente dejar constancia de lo que
 * recibe, pero no puede cambiar un estado documental.
 */
var DOC2_PERMISOS = {
  admin: ['ver', 'editar', 'revisar', 'aprobar', 'comentar', 'solicitar', 'tareas', 'exportar', 'auditoria', 'diagnosticar', 'reparar', 'migrar', 'catalogos', 'archivar', 'restaurar', 'configurar'],
  supervisor: ['ver', 'editar', 'revisar', 'aprobar', 'comentar', 'solicitar', 'tareas', 'exportar', 'auditoria', 'diagnosticar', 'reparar', 'catalogos', 'archivar', 'configurar'],
  auxiliar: ['ver', 'editar', 'revisar', 'comentar', 'solicitar', 'tareas', 'exportar', 'diagnosticar'],
  analista: ['ver', 'editar', 'comentar', 'solicitar', 'tareas', 'exportar'],
  pasante: ['ver', 'comentar'],
  invitado: ['ver']
};

/** Rol de quien no está en el mapa de roles. Configurable en la hoja. */
var DOC2_ROL_POR_DEFECTO = 'analista';

/* ========================================================================== */
/* Eventos, automatizaciones, SLA y umbrales                                   */
/* ========================================================================== */

/** Eventos del dominio. Son los únicos que pueden disparar una automatización. */
var DOC2_EVENTO = {
  EXPEDIENTE_CREADO: 'expediente.creado',
  EXPEDIENTE_ACTUALIZADO: 'expediente.actualizado',
  EXPEDIENTE_COMPLETO: 'expediente.completo',
  EXPEDIENTE_APROBADO: 'expediente.aprobado',
  EXPEDIENTE_ARCHIVADO: 'expediente.archivado',
  DOCUMENTO_ACTUALIZADO: 'documento.actualizado',
  DOCUMENTO_OBSERVADO: 'documento.observado',
  DOCUMENTO_APROBADO: 'documento.aprobado',
  GARANTIA_CAMBIADA: 'expediente.garantia_cambiada',
  PRORROGA_CREADA: 'prorroga.creada',
  PRORROGA_POR_VENCER: 'prorroga.por_vencer',
  PRORROGA_VENCIDA: 'prorroga.vencida',
  SOLICITUD_CREADA: 'solicitud.creada',
  SOLICITUD_VENCIDA: 'solicitud.vencida',
  SOLICITUD_COMPLETADA: 'solicitud.completada',
  APROBACION_SOLICITADA: 'aprobacion.solicitada',
  APROBACION_RESUELTA: 'aprobacion.resuelta',
  TAREA_CREADA: 'tarea.creada',
  TAREA_VENCIDA: 'tarea.vencida',
  EXPORTACION_LISTA: 'exportacion.lista',
  PROCESO_MASIVO_TERMINADO: 'proceso.masivo_terminado'
};

/**
 * Automatizaciones permitidas.
 *
 * Es una lista blanca, no un intérprete: `evento -> acciones` con acciones
 * nombradas que el motor sabe ejecutar. La configuración puede activar y
 * desactivar cada regla, pero NO puede introducir código nuevo. Un motor de
 * reglas que evalúa expresiones venidas de una hoja de cálculo es una puerta
 * abierta a ejecución arbitraria, y aquí no hace ninguna falta.
 */
var DOC2_AUTOMATIZACIONES = [
  {
    codigo: 'completar-expediente',
    evento: DOC2_EVENTO.DOCUMENTO_ACTUALIZADO,
    accion: 'recalcularExpediente',
    descripcion: 'Al cambiar un requisito recalcula el resumen y marca el expediente como completo cuando ya no queda nada pendiente.',
    porDefecto: true
  },
  {
    codigo: 'tarea-por-observacion',
    evento: DOC2_EVENTO.DOCUMENTO_OBSERVADO,
    accion: 'crearTareaCorreccion',
    descripcion: 'Cuando un requisito queda observado crea una tarea de corrección para el responsable del expediente.',
    porDefecto: true
  },
  {
    codigo: 'aviso-prorroga',
    evento: DOC2_EVENTO.PRORROGA_POR_VENCER,
    accion: 'notificarProrroga',
    descripcion: 'Avisa al responsable cuando una prórroga entra en el umbral de vencimiento.',
    porDefecto: true
  },
  {
    codigo: 'solicitud-vencida',
    evento: DOC2_EVENTO.SOLICITUD_VENCIDA,
    accion: 'marcarSolicitudVencida',
    descripcion: 'Pasa a VENCIDA la solicitud cuya fecha límite quedó atrás y abre una tarea de seguimiento.',
    porDefecto: true
  },
  {
    codigo: 'notificar-completo',
    evento: DOC2_EVENTO.EXPEDIENTE_COMPLETO,
    accion: 'notificarResponsable',
    descripcion: 'Notifica al responsable cuando el expediente queda completo.',
    porDefecto: true
  },
  {
    codigo: 'recalcular-por-garantia',
    evento: DOC2_EVENTO.GARANTIA_CAMBIADA,
    accion: 'recalcularRequisitos',
    descripcion: 'Al cambiar el tipo de garantía recalcula qué requisitos aplican, sin borrar los que ya tenían datos.',
    porDefecto: true
  },
  {
    codigo: 'cerrar-tareas-al-archivar',
    evento: DOC2_EVENTO.EXPEDIENTE_ARCHIVADO,
    accion: 'cancelarTareasAbiertas',
    descripcion: 'Cancela las tareas abiertas de un expediente archivado, dejando constancia del motivo.',
    porDefecto: true
  },
  {
    codigo: 'estado-por-aprobacion',
    evento: DOC2_EVENTO.APROBACION_RESUELTA,
    accion: 'actualizarEstadoPorAprobacion',
    descripcion: 'Cuando se resuelve la última aprobación pendiente actualiza el estado del expediente.',
    porDefecto: true
  }
];

/** SLA por defecto, en horas. Configurable desde la hoja de configuración. */
var DOC2_SLA_HORAS = {
  revision: 48,
  aprobacion: 72,
  correccion: 24,
  seguimiento: 24,
  solicitud: 120
};

/** Umbrales de prórroga y vencimiento, en días. */
var DOC2_UMBRALES = {
  prorrogaAvisoDias: 3,
  prorrogaMaximaDias: 90,
  solicitudAvisoDias: 2,
  recordatorioDias: 3,
  retencionPorDefectoDias: 1825
};

/* ========================================================================== */
/* Límites y claves de caché                                                   */
/* ========================================================================== */

/** Techos del modelo normalizado. Los de Sheets no son negociables. */
var DOC2_LIMITS = {
  PAGINA_POR_DEFECTO: 25,
  PAGINA_MAXIMA: 200,
  LOTE_MIGRACION: 200,
  LOTE_EXPORTACION: 150,
  LOTE_MASIVO: 50,
  MAX_TEXTO_CORTO: 300,
  MAX_TEXTO_MEDIO: 2000,
  MAX_TEXTO_LARGO: 8000,
  MAX_COMENTARIO: 4000,
  MAX_SELECCION_MASIVA: 500,
  /**
   * Tope del contador de hojas de un documento físico.
   *
   * No es una restricción de negocio: es un cortafuegos contra el dedo pegado en
   * el teclado. Un legajo de mil hojas no existe, y un `999999` guardado
   * distorsiona el total de hojas del libro anual sin que nadie lo note.
   */
  MAX_HOJAS_FISICAS: 999,
  /**
   * Tope del nombre libre de un requisito personalizable.
   *
   * Cabe en la columna, cabe en la celda del libro anual y cabe en el encabezado
   * de una fila del informe impreso sin partirla. Más allá de eso el nombre deja
   * de ser un nombre y empieza a ser una observación, y para eso ya hay campo.
   */
  MAX_NOMBRE_PERSONALIZADO: 160,
  /** Tope de expedientes por lectura múltiple: seis minutos de Apps Script manda. */
  MAX_DETALLE_MULTIPLE: 12,
  CACHE_PANEL_SEG: 120,
  CACHE_CATALOGO_SEG: 600,
  CACHE_AUXILIAR_SEG: 600
};

/** Claves de caché. Centralizadas para poder invalidar sin adivinar. */
var DOC2_CACHE = {
  CATALOGO: 'doc2_catalogo_v' + DOC2_SCHEMA_VERSION,
  AUXILIAR: 'doc2_auxiliar_v' + DOC2_SCHEMA_VERSION,
  PANEL: 'doc2_panel_v' + DOC2_SCHEMA_VERSION,
  CONFIG: 'doc2_config_v' + DOC2_SCHEMA_VERSION
};

/** Códigos de error propios del modelo normalizado. */
var DOC2_CODE = {
  TRANSICION_INVALIDA: 'TRANSICION_INVALIDA',
  RAMA_DESHABILITADA: 'RAMA_DESHABILITADA',
  CONFLICTO_VERSION: 'CONFLICTO_VERSION',
  NO_APLICABLE: 'REQUISITO_NO_APLICABLE',
  MIGRACION_PENDIENTE: 'MIGRACION_PENDIENTE',
  PERMISO_INSUFICIENTE: 'PERMISO_INSUFICIENTE',
  LIMITE_EXCEDIDO: 'LIMITE_EXCEDIDO',
  RELACION_INVALIDA: 'RELACION_INVALIDA'
};

/* ========================================================================== */
/* Esquema de las hojas nuevas                                                 */
/* ========================================================================== */

/**
 * Registro de las especificaciones en `DOC_SCHEMA`.
 *
 * Se hace con una función para poder declarar las columnas de forma compacta:
 * `t` es texto corto, `l` texto largo, `i` entero, `b` booleano, `d` fecha
 * `yyyy-mm-dd`, `s` marca de tiempo ISO, `j` JSON, `k` identificador.
 */
function doc2Registrar_(nombre, describe, key, columnas) {
  var mapa = { t: 'text', l: 'long', i: 'int', n: 'num', b: 'bool', d: 'text', s: 'iso', j: 'json', k: 'id' };
  var salida = [];
  for (var i = 0; i < columnas.length; i++) {
    var partes = columnas[i].split(':');
    var tipo = mapa[partes[1] || 't'] || 'text';
    salida.push({ name: partes[0], type: tipo, width: doc2Ancho_(partes[0], tipo) });
  }
  DOC_SCHEMA[nombre] = { describe: describe, key: key, columns: salida, normalizada: true };
  return DOC_SCHEMA[nombre];
}

/** Ancho de columna razonable según el nombre y el tipo. Solo es presentación. */
function doc2Ancho_(nombre, tipo) {
  if (tipo === 'json') return 320;
  if (tipo === 'long') return 300;
  if (tipo === 'int' || tipo === 'num' || tipo === 'bool') return 90;
  if (tipo === 'iso') return 165;
  if (nombre.indexOf('_id') >= 0 || nombre === 'codigo_documento') return 200;
  if (nombre.indexOf('nombre') >= 0 || nombre.indexOf('titulo') >= 0) return 260;
  if (nombre.indexOf('observ') >= 0 || nombre.indexOf('coment') >= 0 || nombre.indexOf('descripcion') >= 0) return 300;
  return 150;
}

doc2Registrar_(DOC2_SHEET.EXPEDIENTES,
  'Un registro por expediente documental. Los totales son resúmenes materializados: se recalculan, no se escriben a mano.',
  'expediente_id',
  [
    'expediente_id:k', 'identificador:t', 'identificador_normalizado:t', 'nombre:t', 'cargo:t',
    'agencia:t', 'gerencia:t', 'fecha_ingreso:d', 'tipo_funcionario:t', 'tipo_garantia:t',
    'responsable_id:t', 'estado_expediente:t', 'porcentaje_completitud:i',
    'total_requisitos:i', 'total_resueltos:i', 'total_entregados:i', 'total_pendientes:i',
    'total_no_entregados:i', 'total_no_aplica:i', 'total_observados:i',
    'total_prorrogas:i', 'total_prorrogas_vencidas:i', 'proxima_fecha_critica:d',
    'version_registro:i', 'estado_operacion:t', 'idempotency_key_creacion:t',
    'created_at:s', 'created_by:t', 'updated_at:s', 'updated_by:t', 'archived_at:s', 'archived_by:t'
  ]);

doc2Registrar_(DOC2_SHEET.EXPEDIENTE_DOCS,
  'Un registro por requisito aplicable a un expediente. Es la tabla que sostiene el progreso, las revisiones y los reportes.',
  'expediente_documento_id',
  [
    'expediente_documento_id:k', 'expediente_id:t', 'codigo_documento:t', 'version_catalogo:i',
    'seccion:t', 'subseccion:t', 'grupo:t', 'orden:i', 'estado_documental:t', 'observaciones:l',
    'hojas_fisicas:i',
    /* Personalización por expediente (esquema 6). Vacío = «lo que diga el
       catálogo»; no se rellenan con el valor heredado a propósito, porque
       entonces un cambio del catálogo no alcanzaría a los expedientes que nunca
       personalizaron nada. */
    'nombre_personalizado:t', 'presentacion_fisica:t', 'presentacion_digital:t',
    'obligatorio:b', 'permite_no_aplica:b', 'permite_prorroga:b',
    'tipo_funcionario:t', 'tipo_garantia:t', 'estado_revision:t',
    'revision_actual_id:t', 'aprobacion_actual_id:t', 'version_registro:i',
    'created_at:s', 'created_by:t', 'updated_at:s', 'updated_by:t', 'archived_at:s'
  ]);

doc2Registrar_(DOC2_SHEET.PRORROGAS,
  'Prórrogas concedidas por requisito. Los días restantes NO se guardan: se calculan al leer, porque un número guardado envejece.',
  'prorroga_id',
  [
    'prorroga_id:k', 'expediente_id:t', 'expediente_documento_id:t', 'codigo_documento:t',
    'fecha_original:d', 'fecha_prorroga:d', 'motivo:l', 'estado_prorroga:t',
    'solicitada_por:t', 'aprobada_por:t', 'fecha_aprobacion:s',
    'created_at:s', 'created_by:t', 'updated_at:s', 'updated_by:t', 'cancelled_at:s', 'cancelled_by:t'
  ]);

doc2Registrar_(DOC2_SHEET.CATALOGO,
  'Catálogo único de documentos exigidos. Es la fuente de verdad del formulario, la validación, los reportes y las exportaciones.',
  'codigo_documento',
  [
    'codigo_documento:k', 'nombre_visible:t', 'descripcion:l', 'texto_observacion:l',
    'seccion:t', 'subseccion:l', 'grupo:t', 'orden:i', 'obligatorio:b', 'estados_permitidos:t',
    'permite_no_aplica:b', 'permite_prorroga:b', 'tipo_funcionario:t', 'tipo_garantia:t',
    'presentacion_fisica:t', 'presentacion_digital:t', 'requiere_conteo_hojas:b',
    /* Personalización (esquema 6): quién puede escribir su propio nombre, quién
       puede elegir su presentación y con qué estado documental nace. */
    'permite_nombre_libre:b', 'presentacion_editable:b', 'estado_inicial:t',
    'nivel_confidencialidad:t', 'requiere_revision:b', 'requiere_aprobacion:b',
    'activo:b', 'version_catalogo:i', 'fecha_inicio_vigencia:d', 'fecha_fin_vigencia:d',
    'columna_libro:t'
  ]);

doc2Registrar_(DOC2_SHEET.SOLICITUDES,
  'Solicitudes de documentación enviadas a una persona o a un responsable, con su seguimiento.',
  'solicitud_id',
  [
    'solicitud_id:k', 'expediente_id:t', 'titulo:t', 'descripcion:l', 'responsable_id:t',
    'fecha_solicitud:d', 'fecha_limite:d', 'prioridad:t', 'estado_solicitud:t', 'canal:t',
    'ultimo_recordatorio:s', 'proximo_recordatorio:d', 'cantidad_recordatorios:i',
    'created_at:s', 'created_by:t', 'updated_at:s', 'updated_by:t', 'cancelled_at:s'
  ]);

doc2Registrar_(DOC2_SHEET.SOLICITUD_DOCS,
  'Requisitos incluidos en cada solicitud. Es lo que permite saber qué se pidió y qué se cumplió.',
  'solicitud_documento_id',
  [
    'solicitud_documento_id:k', 'solicitud_id:t', 'expediente_id:t', 'expediente_documento_id:t',
    'codigo_documento:t', 'estado_item:t', 'fecha_cumplimiento:d', 'observacion:l',
    'created_at:s', 'updated_at:s'
  ]);

doc2Registrar_(DOC2_SHEET.REVISIONES,
  'Decisiones de revisión documento a documento. Append-only: una decisión no se edita, se sucede.',
  'revision_id',
  [
    'revision_id:k', 'expediente_id:t', 'expediente_documento_id:t', 'codigo_documento:t',
    'revisor_id:t', 'estado_revision:t', 'motivo_codigo:t', 'comentario:l',
    'fecha_revision:s', 'version_documento_revisada:i', 'created_at:s'
  ]);

doc2Registrar_(DOC2_SHEET.APROBACIONES,
  'Aprobaciones por niveles. El flujo simple usa un solo nivel; la estructura admite varios sin migrar nada.',
  'aprobacion_id',
  [
    'aprobacion_id:k', 'expediente_id:t', 'expediente_documento_id:t', 'flujo_codigo:t',
    'nivel:i', 'aprobador_id:t', 'estado_aprobacion:t', 'comentario:l',
    'fecha_limite:d', 'fecha_decision:s', 'created_at:s', 'updated_at:s'
  ]);

doc2Registrar_(DOC2_SHEET.COMENTARIOS,
  'Comentarios del expediente y de sus requisitos, con hilos y visibilidad.',
  'comentario_id',
  [
    'comentario_id:k', 'expediente_id:t', 'expediente_documento_id:t', 'comentario_padre_id:t',
    'tipo_comentario:t', 'visibilidad:t', 'contenido:l', 'resuelto:b',
    'created_at:s', 'created_by:t', 'updated_at:s', 'updated_by:t'
  ]);

doc2Registrar_(DOC2_SHEET.TAREAS,
  'Tareas operativas asociadas a un expediente, un requisito, una solicitud, una revisión o una prórroga.',
  'tarea_id',
  [
    'tarea_id:k', 'expediente_id:t', 'expediente_documento_id:t', 'tipo_tarea:t',
    'titulo:t', 'descripcion:l', 'responsable_id:t', 'prioridad:t', 'estado_tarea:t',
    'fecha_limite:d', 'sla_horas:i', 'escalada:b', 'origen_tipo:t', 'origen_id:t',
    'created_at:s', 'created_by:t', 'completed_at:s', 'completed_by:t'
  ]);

doc2Registrar_(DOC2_SHEET.NOTIFICACIONES,
  'Centro de notificaciones interno. Cada notificación sabe a qué entidad pertenece para poder abrirla.',
  'notificacion_id',
  [
    'notificacion_id:k', 'usuario_destino:t', 'expediente_id:t', 'entidad_tipo:t', 'entidad_id:t',
    'tipo_evento:t', 'titulo:t', 'mensaje:l', 'canal:t', 'estado_envio:t',
    'fecha_programada:s', 'fecha_envio:s', 'fecha_lectura:s', 'intentos:i', 'ultimo_error:l', 'created_at:s'
  ]);

doc2Registrar_(DOC2_SHEET.HISTORIAL,
  'Historial legible: qué campo cambió, de qué valor a qué valor y por qué. Es lo que se le muestra a una persona.',
  'historial_id',
  [
    'historial_id:k', 'expediente_id:t', 'entidad_tipo:t', 'entidad_id:t', 'campo:t',
    'valor_anterior:l', 'valor_nuevo:l', 'motivo:l', 'created_at:s', 'created_by:t'
  ]);

doc2Registrar_(DOC2_SHEET.AUDITORIA,
  'Auditoría técnica: evento, solicitud, actor, entidad, resultado y metadatos acotados. No registra renders.',
  'evento_id',
  [
    'evento_id:k', 'request_id:t', 'expediente_id:t', 'entidad_tipo:t', 'entidad_id:t',
    'evento_tipo:t', 'actor_id:t', 'actor_display:t', 'origen:t', 'resultado:t',
    'metadata_json:j', 'created_at:s'
  ]);

doc2Registrar_(DOC2_SHEET.CONSENTIMIENTOS,
  'Consentimientos textuales versionados. Guarda la huella del texto aceptado, no una firma electrónica.',
  'consentimiento_id',
  [
    'consentimiento_id:k', 'expediente_id:t', 'tipo_consentimiento:t', 'version_texto:t',
    'texto_hash:t', 'estado:t', 'fecha_presentacion:s', 'fecha_aceptacion:s', 'fecha_revocacion:s',
    'medio:t', 'evidencia_textual:l', 'created_at:s', 'updated_at:s'
  ]);

doc2Registrar_(DOC2_SHEET.RETENCION,
  'Políticas de retención documental. El módulo nunca borra físicamente: marca y avisa.',
  'politica_id',
  [
    'politica_id:k', 'nombre:t', 'tipo_entidad:t', 'estado_expediente_aplicable:t',
    'dias_retencion:i', 'accion_final:t', 'activa:b', 'created_at:s', 'updated_at:s'
  ]);

doc2Registrar_(DOC2_SHEET.EXPORTACIONES,
  'Trabajos de exportación, con progreso y punto de control para poder reanudarlos.',
  'exportacion_id',
  [
    'exportacion_id:k', 'tipo_exportacion:t', 'filtro_json:j', 'cantidad_expedientes:i',
    'estado:t', 'progreso:i', 'checkpoint:j', 'archivo_temporal_id:t', 'archivo_url_temporal:l',
    'solicitada_por:t', 'created_at:s', 'started_at:s', 'completed_at:s', 'expires_at:s', 'error_resumen:l'
  ]);

doc2Registrar_(DOC2_SHEET.FILTROS,
  'Filtros guardados por persona. Se pueden compartir con el equipo.',
  'filtro_id',
  [
    'filtro_id:k', 'propietario_id:t', 'nombre:t', 'descripcion:l', 'definicion_json:j',
    'compartido:b', 'created_at:s', 'updated_at:s'
  ]);

doc2Registrar_(DOC2_SHEET.CONFIG,
  'Configuración del módulo normalizado: SLA, umbrales, automatizaciones activas y mapa de roles.',
  'configuracion_id',
  [
    'configuracion_id:k', 'clave:t', 'valor:l', 'tipo:t', 'entorno:t', 'activa:b',
    'updated_at:s', 'updated_by:t'
  ]);

doc2Registrar_(DOC2_SHEET.MIGRACIONES,
  'Bitácora de migraciones de esquema, con estado, progreso y punto de control.',
  'migracion_id',
  [
    'migracion_id:k', 'version:t', 'nombre:t', 'estado:t', 'progreso:i', 'checkpoint:j',
    'filas_afectadas:i', 'resultado:l', 'error_resumen:l',
    'started_at:s', 'completed_at:s', 'executed_by:t'
  ]);

/**
 * `Auxiliar` no se registra en `DOC_SCHEMA`.
 *
 * Su forma es distinta —un catálogo por columna, no un registro por fila— y
 * forzarla dentro del motor de entidades obligaría a inventar una clave que no
 * tiene. Se lee y se escribe con funciones propias (13_Catalog.gs) que respetan
 * la regla de no borrar nunca un valor existente.
 */

/** Orden de creación de las hojas normalizadas. */
var DOC2_SHEET_ORDER = [
  DOC2_SHEET.EXPEDIENTES,
  DOC2_SHEET.EXPEDIENTE_DOCS,
  DOC2_SHEET.PRORROGAS,
  DOC2_SHEET.CATALOGO,
  DOC2_SHEET.SOLICITUDES,
  DOC2_SHEET.SOLICITUD_DOCS,
  DOC2_SHEET.REVISIONES,
  DOC2_SHEET.APROBACIONES,
  DOC2_SHEET.COMENTARIOS,
  DOC2_SHEET.TAREAS,
  DOC2_SHEET.NOTIFICACIONES,
  DOC2_SHEET.HISTORIAL,
  DOC2_SHEET.AUDITORIA,
  DOC2_SHEET.CONSENTIMIENTOS,
  DOC2_SHEET.RETENCION,
  DOC2_SHEET.EXPORTACIONES,
  DOC2_SHEET.FILTROS,
  DOC2_SHEET.CONFIG,
  DOC2_SHEET.MIGRACIONES
];

/** Configuración por defecto del modelo normalizado. */
var DOC2_CONFIG_SEMILLA = [
  { clave: 'sla_revision_horas', valor: String(DOC2_SLA_HORAS.revision), tipo: 'int' },
  { clave: 'sla_aprobacion_horas', valor: String(DOC2_SLA_HORAS.aprobacion), tipo: 'int' },
  { clave: 'sla_correccion_horas', valor: String(DOC2_SLA_HORAS.correccion), tipo: 'int' },
  { clave: 'sla_seguimiento_horas', valor: String(DOC2_SLA_HORAS.seguimiento), tipo: 'int' },
  { clave: 'sla_solicitud_horas', valor: String(DOC2_SLA_HORAS.solicitud), tipo: 'int' },
  { clave: 'prorroga_aviso_dias', valor: String(DOC2_UMBRALES.prorrogaAvisoDias), tipo: 'int' },
  { clave: 'prorroga_maxima_dias', valor: String(DOC2_UMBRALES.prorrogaMaximaDias), tipo: 'int' },
  { clave: 'solicitud_aviso_dias', valor: String(DOC2_UMBRALES.solicitudAvisoDias), tipo: 'int' },
  { clave: 'retencion_dias', valor: String(DOC2_UMBRALES.retencionPorDefectoDias), tipo: 'int' },
  { clave: 'rol_por_defecto', valor: DOC2_ROL_POR_DEFECTO, tipo: 'text' },
  { clave: 'roles_por_actor', valor: '{}', tipo: 'json' },
  { clave: 'automatizaciones_desactivadas', valor: '[]', tipo: 'json' },
  { clave: 'correo_habilitado', valor: 'FALSE', tipo: 'bool' },
  { clave: 'auditoria_lectura', valor: 'FALSE', tipo: 'bool' },
  { clave: 'espejo_libro_anual', valor: 'TRUE', tipo: 'bool' },
  { clave: 'exigir_llave_admin', valor: 'FALSE', tipo: 'bool' },
  { clave: 'confiar_en_actor_declarado', valor: 'TRUE', tipo: 'bool' },
  { clave: 'tipos_consentimiento', valor: '[]', tipo: 'json' }
];

/* ========================================================================== */
/* Ayudas de dominio                                                           */
/* ========================================================================== */

/** ¿Es un estado conocido de esa máquina? */
function doc2EsEstado_(entidad, estado) {
  var maquina = DOC2_MAQUINAS[entidad];
  if (!maquina) return false;
  var clave = String(estado || '').toUpperCase();
  for (var k in maquina.estados) {
    if (Object.prototype.hasOwnProperty.call(maquina.estados, k) && maquina.estados[k] === clave) return true;
  }
  return false;
}

/**
 * ¿Se puede pasar de `desde` a `hasta`?
 *
 * Quedarse en el mismo estado siempre se permite: guardar una observación no es
 * cambiar de estado y no tiene por qué pelear con la máquina.
 */
function doc2TransicionPermitida_(entidad, desde, hasta) {
  var maquina = DOC2_MAQUINAS[entidad];
  if (!maquina) return false;
  var origen = String(desde || '').toUpperCase();
  var destino = String(hasta || '').toUpperCase();
  if (!destino) return false;
  if (origen === destino) return true;
  if (!origen) return true;
  var permitidos = maquina.transiciones[origen];
  if (!permitidos) return false;
  return permitidos.indexOf(destino) >= 0;
}

/** Exige una transición válida o lanza un error explicativo. */
function doc2ExigirTransicion_(entidad, desde, hasta) {
  if (doc2TransicionPermitida_(entidad, desde, hasta)) return String(hasta).toUpperCase();
  var maquina = DOC2_MAQUINAS[entidad];
  var permitidos = (maquina && maquina.transiciones[String(desde || '').toUpperCase()]) || [];
  throw docError_(DOC2_CODE.TRANSICION_INVALIDA,
    'No se puede pasar de ' + (desde || 'sin estado') + ' a ' + hasta + '.',
    {
      hint: permitidos.length
        ? ('Desde ' + desde + ' solo se admite: ' + permitidos.join(', ') + '.')
        : 'Ese estado es final: no admite más cambios.',
      details: { entidad: entidad, desde: desde, hasta: hasta, permitidos: permitidos }
    });
}

/** Normaliza un estado documental venido de cualquier época del sistema. */
function doc2NormalizarEstadoDocumento_(valor) {
  var clave = docKey_(valor);
  if (!clave) return DOC2_ESTADO_DOCUMENTO.PENDIENTE;
  var mapeado = DOC2_ALIAS_DOCUMENTO[clave];
  if (mapeado) return mapeado;
  // Valores libres del libro («TIENE (SOLO FOTOCOPIA)», «ES TECNICO»…): si
  // empiezan por un alias conocido se resuelven; si no, se dejan pendientes y el
  // diagnóstico lo reporta como posible inconsistencia.
  for (var alias in DOC2_ALIAS_DOCUMENTO) {
    if (!Object.prototype.hasOwnProperty.call(DOC2_ALIAS_DOCUMENTO, alias)) continue;
    if (alias.length > 2 && clave.indexOf(alias) === 0) return DOC2_ALIAS_DOCUMENTO[alias];
  }
  return DOC2_ESTADO_DOCUMENTO.PENDIENTE;
}

/**
 * Exige un estado documental del vocabulario, sin tolerancia.
 *
 * La tolerancia de `doc2NormalizarEstadoDocumento_` existe para LEER: el libro
 * tiene celdas con «TIENE (SOLO FOTOCOPIA)» y hay que poder interpretarlas. Pero al
 * ESCRIBIR desde la interfaz, un valor desconocido es un error del cliente y
 * convertirlo en «pendiente» en silencio significaría perder el cambio sin avisar.
 */
function doc2ExigirEstadoDocumento_(valor) {
  var clave = docKey_(valor).replace(/ /g, '_');
  var permitidos = doc2ValoresDe_(DOC2_ESTADO_DOCUMENTO);
  for (var i = 0; i < permitidos.length; i++) {
    if (permitidos[i] === clave) return permitidos[i];
  }
  throw docError_(DOC_CODE.VALIDATION_ERROR,
    'El estado documental "' + valor + '" no existe.',
    {
      hint: 'Valores admitidos: ' + permitidos.join(', ') + '.',
      details: { fields: doc2Campo_('estado_documental', 'Estado no reconocido.'), permitidos: permitidos }
    });
}

/** Normaliza un estado de expediente venido de cualquier época del sistema. */
function doc2NormalizarEstadoExpediente_(valor) {
  var clave = docKey_(valor).replace(/ /g, '_');
  return DOC2_ALIAS_EXPEDIENTE[clave] || '';
}

/** Definición de un tipo de funcionario. */
function doc2TipoFuncionario_(codigo) {
  var clave = docKey_(codigo);
  for (var i = 0; i < DOC2_TIPO_FUNCIONARIO.length; i++) {
    if (DOC2_TIPO_FUNCIONARIO[i].codigo === clave) return DOC2_TIPO_FUNCIONARIO[i];
  }
  return null;
}

/** Definición de un tipo de garantía. */
function doc2TipoGarantia_(codigo) {
  var clave = docKey_(codigo).replace(/[ \-]/g, '_');
  for (var i = 0; i < DOC2_TIPO_GARANTIA.length; i++) {
    if (DOC2_TIPO_GARANTIA[i].codigo === clave) return DOC2_TIPO_GARANTIA[i];
  }
  return null;
}

/** Capacidades de un rol. */
function doc2CapacidadesDe_(rol) {
  var clave = String(rol || '').toLowerCase();
  return DOC2_PERMISOS[clave] || DOC2_PERMISOS.invitado;
}

/** ¿Ese rol tiene esa capacidad? */
function doc2RolPuede_(rol, capacidad) {
  return doc2CapacidadesDe_(rol).indexOf(capacidad) >= 0;
}

/** Catálogo completo de motivos, tipos y estados, para que el frontend no los duplique. */
function doc2Vocabulario_() {
  return {
    esquema: DOC2_SCHEMA_VERSION,
    estados: {
      expediente: DOC2_ESTADO_EXPEDIENTE,
      documento: DOC2_ESTADO_DOCUMENTO,
      revision: DOC2_ESTADO_REVISION,
      solicitud: DOC2_ESTADO_SOLICITUD,
      aprobacion: DOC2_ESTADO_APROBACION,
      tarea: DOC2_ESTADO_TAREA,
      prorroga: DOC2_ESTADO_PRORROGA,
      consentimiento: DOC2_ESTADO_CONSENTIMIENTO
    },
    transiciones: {
      expediente: DOC2_TRANSICIONES_EXPEDIENTE,
      documento: DOC2_TRANSICIONES_DOCUMENTO,
      revision: DOC2_TRANSICIONES_REVISION,
      solicitud: DOC2_TRANSICIONES_SOLICITUD,
      aprobacion: DOC2_TRANSICIONES_APROBACION,
      tarea: DOC2_TRANSICIONES_TAREA,
      prorroga: DOC2_TRANSICIONES_PRORROGA
    },
    tiposFuncionario: DOC2_TIPO_FUNCIONARIO,
    tiposGarantia: DOC2_TIPO_GARANTIA,
    secciones: DOC2_SECCIONES,
    presentaciones: DOC2_PRESENTACION,
    codigosRetirados: doc2CodigosRetirados_(),
    codigosPersonalizables: doc2CodigosPersonalizables_(),
    maxHojasFisicas: DOC2_LIMITS.MAX_HOJAS_FISICAS,
    maxNombrePersonalizado: DOC2_LIMITS.MAX_NOMBRE_PERSONALIZADO,
    motivosRevision: DOC2_MOTIVOS_REVISION,
    automatizaciones: DOC2_AUTOMATIZACIONES,
    capacidades: DOC2_CAPACIDAD,
    permisos: DOC2_PERMISOS,
    sla: DOC2_SLA_HORAS,
    umbrales: DOC2_UMBRALES
  };
}
