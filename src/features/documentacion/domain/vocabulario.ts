/**
 * Vocabulario del módulo de Documentación.
 *
 * ── Por qué existe una copia en el cliente ───────────────────────────────────
 * El backend es la autoridad: valida estados, transiciones y permisos, y ninguna
 * decisión de este archivo puede saltarse esa validación. Lo que hay aquí es lo
 * que la interfaz necesita para PINTAR sin preguntar: la etiqueta legible de un
 * estado, su color, qué acciones tiene sentido ofrecer y en qué orden se muestran
 * las secciones.
 *
 * La alternativa —pedir el vocabulario por red antes de dibujar un chip— dejaría
 * la pantalla muda mientras no hay conexión y añadiría un viaje a cada render.
 *
 * ── Cómo se evita que las dos copias se separen ─────────────────────────────
 * Con una prueba. `dominio.test.ts` carga el backend real en el arnés de Node,
 * lee su `doc2Vocabulario_()` y lo compara contra estas constantes. Si alguien
 * añade un estado en el servidor y no aquí, la suite falla.
 */

/* ------------------------------------------------------------------ */
/* Estados                                                             */
/* ------------------------------------------------------------------ */

export const ESTADOS_EXPEDIENTE = [
  "BORRADOR",
  "INCOMPLETO",
  "EN_RECOLECCION",
  "EN_REVISION",
  "OBSERVADO",
  "CON_PRORROGA",
  "COMPLETO",
  "APROBADO",
  "ARCHIVADO",
  "PENDIENTE_ELIMINACION",
  "ELIMINADO_LOGICO",
] as const;
export type EstadoExpediente = (typeof ESTADOS_EXPEDIENTE)[number];

export const ESTADOS_DOCUMENTO = ["ENTREGADO", "PENDIENTE", "NO_ENTREGADO", "NO_APLICA"] as const;
export type EstadoDocumento = (typeof ESTADOS_DOCUMENTO)[number];

export const ESTADOS_REVISION = [
  "SIN_REVISION",
  "EN_REVISION",
  "APROBADO",
  "APROBADO_CON_OBSERVACION",
  "OBSERVADO",
  "RECHAZADO",
  "REQUIERE_CORRECCION",
] as const;
export type EstadoRevision = (typeof ESTADOS_REVISION)[number];

export const ESTADOS_SOLICITUD = [
  "BORRADOR",
  "PENDIENTE",
  "NOTIFICADA",
  "VISTA",
  "EN_SEGUIMIENTO",
  "COMPLETADA",
  "VENCIDA",
  "CANCELADA",
] as const;
export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];

export const ESTADOS_APROBACION = ["PENDIENTE", "APROBADA", "RECHAZADA", "CANCELADA", "VENCIDA"] as const;
export type EstadoAprobacion = (typeof ESTADOS_APROBACION)[number];

export const ESTADOS_TAREA = ["PENDIENTE", "EN_PROGRESO", "BLOQUEADA", "COMPLETADA", "CANCELADA", "VENCIDA"] as const;
export type EstadoTarea = (typeof ESTADOS_TAREA)[number];

export const ESTADOS_PRORROGA = ["SOLICITADA", "VIGENTE", "VENCIDA", "CUMPLIDA", "CANCELADA", "RECHAZADA"] as const;
export type EstadoProrroga = (typeof ESTADOS_PRORROGA)[number];

export const ESTADOS_CONSENTIMIENTO = ["PRESENTADO", "ACEPTADO", "RECHAZADO", "REVOCADO"] as const;
export type EstadoConsentimiento = (typeof ESTADOS_CONSENTIMIENTO)[number];

/* ------------------------------------------------------------------ */
/* Etiquetas                                                           */
/* ------------------------------------------------------------------ */

/**
 * Etiquetas en español llano.
 *
 * `EN_RECOLECCION` no se muestra nunca: se muestra «En recolección». El código
 * mantiene el vocabulario canónico y la persona lee su idioma.
 */
export const ETIQUETA_EXPEDIENTE: Record<EstadoExpediente, string> = {
  BORRADOR: "Borrador",
  INCOMPLETO: "Incompleto",
  EN_RECOLECCION: "En recolección",
  EN_REVISION: "En revisión",
  OBSERVADO: "Observado",
  CON_PRORROGA: "Con prórroga",
  COMPLETO: "Completo",
  APROBADO: "Aprobado",
  ARCHIVADO: "Archivado",
  PENDIENTE_ELIMINACION: "Pendiente de eliminación",
  ELIMINADO_LOGICO: "Eliminado",
};

export const ETIQUETA_DOCUMENTO: Record<EstadoDocumento, string> = {
  ENTREGADO: "Entregado",
  PENDIENTE: "Pendiente",
  NO_ENTREGADO: "No entregado",
  NO_APLICA: "No aplica",
};

export const ETIQUETA_REVISION: Record<EstadoRevision, string> = {
  SIN_REVISION: "Sin revisión",
  EN_REVISION: "En revisión",
  APROBADO: "Aprobado",
  APROBADO_CON_OBSERVACION: "Aprobado con observación",
  OBSERVADO: "Observado",
  RECHAZADO: "Rechazado",
  REQUIERE_CORRECCION: "Requiere corrección",
};

export const ETIQUETA_SOLICITUD: Record<EstadoSolicitud, string> = {
  BORRADOR: "Borrador",
  PENDIENTE: "Pendiente",
  NOTIFICADA: "Notificada",
  VISTA: "Vista",
  EN_SEGUIMIENTO: "En seguimiento",
  COMPLETADA: "Completada",
  VENCIDA: "Vencida",
  CANCELADA: "Cancelada",
};

export const ETIQUETA_APROBACION: Record<EstadoAprobacion, string> = {
  PENDIENTE: "Pendiente",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
  CANCELADA: "Cancelada",
  VENCIDA: "Vencida",
};

export const ETIQUETA_TAREA: Record<EstadoTarea, string> = {
  PENDIENTE: "Pendiente",
  EN_PROGRESO: "En progreso",
  BLOQUEADA: "Bloqueada",
  COMPLETADA: "Completada",
  CANCELADA: "Cancelada",
  VENCIDA: "Vencida",
};

export const ETIQUETA_PRORROGA: Record<EstadoProrroga, string> = {
  SOLICITADA: "Solicitada",
  VIGENTE: "Vigente",
  VENCIDA: "Vencida",
  CUMPLIDA: "Cumplida",
  CANCELADA: "Cancelada",
  RECHAZADA: "Rechazada",
};

/* ------------------------------------------------------------------ */
/* Intenciones visuales                                               */
/* ------------------------------------------------------------------ */

/**
 * Intención semántica de cada estado.
 *
 * Se traduce a color EN EL COMPONENTE, junto con un icono y la etiqueta. El
 * estado nunca se comunica solo con color: es requisito de accesibilidad
 * (WCAG 1.4.1) y, además, en una tabla impresa en blanco y negro el color no
 * existe.
 */
export type Intencion = "neutral" | "info" | "exito" | "aviso" | "peligro" | "acento";

export const INTENCION_EXPEDIENTE: Record<EstadoExpediente, Intencion> = {
  BORRADOR: "neutral",
  INCOMPLETO: "peligro",
  EN_RECOLECCION: "info",
  EN_REVISION: "acento",
  OBSERVADO: "aviso",
  CON_PRORROGA: "aviso",
  COMPLETO: "exito",
  APROBADO: "exito",
  ARCHIVADO: "neutral",
  PENDIENTE_ELIMINACION: "peligro",
  ELIMINADO_LOGICO: "neutral",
};

export const INTENCION_DOCUMENTO: Record<EstadoDocumento, Intencion> = {
  ENTREGADO: "exito",
  PENDIENTE: "aviso",
  NO_ENTREGADO: "peligro",
  NO_APLICA: "neutral",
};

export const INTENCION_REVISION: Record<EstadoRevision, Intencion> = {
  SIN_REVISION: "neutral",
  EN_REVISION: "acento",
  APROBADO: "exito",
  APROBADO_CON_OBSERVACION: "aviso",
  OBSERVADO: "aviso",
  RECHAZADO: "peligro",
  REQUIERE_CORRECCION: "peligro",
};

export const INTENCION_SOLICITUD: Record<EstadoSolicitud, Intencion> = {
  BORRADOR: "neutral",
  PENDIENTE: "info",
  NOTIFICADA: "info",
  VISTA: "info",
  EN_SEGUIMIENTO: "acento",
  COMPLETADA: "exito",
  VENCIDA: "peligro",
  CANCELADA: "neutral",
};

export const INTENCION_APROBACION: Record<EstadoAprobacion, Intencion> = {
  PENDIENTE: "info",
  APROBADA: "exito",
  RECHAZADA: "peligro",
  CANCELADA: "neutral",
  VENCIDA: "peligro",
};

export const INTENCION_TAREA: Record<EstadoTarea, Intencion> = {
  PENDIENTE: "info",
  EN_PROGRESO: "acento",
  BLOQUEADA: "aviso",
  COMPLETADA: "exito",
  CANCELADA: "neutral",
  VENCIDA: "peligro",
};

export const INTENCION_PRORROGA: Record<EstadoProrroga, Intencion> = {
  SOLICITADA: "info",
  VIGENTE: "exito",
  VENCIDA: "peligro",
  CUMPLIDA: "neutral",
  CANCELADA: "neutral",
  RECHAZADA: "peligro",
};

/** Situación temporal de una prórroga, tal como la calcula el backend. */
export const INTENCION_SITUACION: Record<string, Intencion> = {
  vigente: "exito",
  por_vencer: "aviso",
  vencida: "peligro",
  cerrada: "neutral",
  sin_fecha: "neutral",
};

export const ETIQUETA_SITUACION: Record<string, string> = {
  vigente: "Vigente",
  por_vencer: "Por vencer",
  vencida: "Vencida",
  cerrada: "Cerrada",
  sin_fecha: "Sin fecha",
};

/* ------------------------------------------------------------------ */
/* Transiciones                                                        */
/* ------------------------------------------------------------------ */

/**
 * Transiciones permitidas, copiadas del backend.
 *
 * Sirven para NO ofrecer un botón que el servidor va a rechazar. La comprobación
 * de verdad sigue estando allí: esto solo evita el clic inútil.
 */
export const TRANSICIONES_DOCUMENTO: Record<EstadoDocumento, EstadoDocumento[]> = {
  PENDIENTE: ["ENTREGADO", "NO_ENTREGADO", "NO_APLICA"],
  NO_ENTREGADO: ["ENTREGADO", "PENDIENTE", "NO_APLICA"],
  ENTREGADO: ["PENDIENTE", "NO_ENTREGADO", "NO_APLICA"],
  NO_APLICA: ["PENDIENTE", "ENTREGADO", "NO_ENTREGADO"],
};

export const TRANSICIONES_REVISION: Record<EstadoRevision, EstadoRevision[]> = {
  SIN_REVISION: ["EN_REVISION", "APROBADO", "APROBADO_CON_OBSERVACION", "OBSERVADO", "RECHAZADO", "REQUIERE_CORRECCION"],
  EN_REVISION: ["APROBADO", "APROBADO_CON_OBSERVACION", "OBSERVADO", "RECHAZADO", "REQUIERE_CORRECCION", "SIN_REVISION"],
  APROBADO: ["EN_REVISION", "OBSERVADO"],
  APROBADO_CON_OBSERVACION: ["EN_REVISION", "APROBADO", "OBSERVADO"],
  OBSERVADO: ["EN_REVISION", "REQUIERE_CORRECCION", "APROBADO", "APROBADO_CON_OBSERVACION"],
  RECHAZADO: ["EN_REVISION"],
  REQUIERE_CORRECCION: ["EN_REVISION", "OBSERVADO", "APROBADO"],
};

export const TRANSICIONES_TAREA: Record<EstadoTarea, EstadoTarea[]> = {
  PENDIENTE: ["EN_PROGRESO", "BLOQUEADA", "COMPLETADA", "CANCELADA", "VENCIDA"],
  EN_PROGRESO: ["BLOQUEADA", "COMPLETADA", "CANCELADA", "VENCIDA"],
  BLOQUEADA: ["EN_PROGRESO", "PENDIENTE", "COMPLETADA", "CANCELADA", "VENCIDA"],
  COMPLETADA: [],
  CANCELADA: [],
  VENCIDA: ["EN_PROGRESO", "COMPLETADA", "CANCELADA"],
};

export const TRANSICIONES_SOLICITUD: Record<EstadoSolicitud, EstadoSolicitud[]> = {
  BORRADOR: ["PENDIENTE", "CANCELADA"],
  PENDIENTE: ["NOTIFICADA", "EN_SEGUIMIENTO", "COMPLETADA", "VENCIDA", "CANCELADA"],
  NOTIFICADA: ["VISTA", "EN_SEGUIMIENTO", "COMPLETADA", "VENCIDA", "CANCELADA"],
  VISTA: ["EN_SEGUIMIENTO", "COMPLETADA", "VENCIDA", "CANCELADA"],
  EN_SEGUIMIENTO: ["COMPLETADA", "VENCIDA", "CANCELADA"],
  COMPLETADA: [],
  VENCIDA: ["EN_SEGUIMIENTO", "COMPLETADA", "CANCELADA"],
  CANCELADA: [],
};

/** ¿Tiene sentido ofrecer este cambio de estado? */
export function puedeTransitar<T extends string>(
  mapa: Record<T, T[]>,
  desde: T | undefined,
  hasta: T,
): boolean {
  if (!desde) return true;
  if (desde === hasta) return true;
  return (mapa[desde] ?? []).includes(hasta);
}

/* ------------------------------------------------------------------ */
/* Ramas, secciones y motivos                                          */
/* ------------------------------------------------------------------ */

export interface TipoRama {
  codigo: string;
  etiqueta: string;
  activo: boolean;
  descripcion: string;
}

/**
 * Tipos de funcionario. `EJECUTIVO` y `DIRECTORIO` se muestran deshabilitados,
 * no escondidos: esconder una rama que existe hace que alguien registre esos
 * expedientes como generales y queden mal clasificados para siempre.
 */
export const TIPOS_FUNCIONARIO: TipoRama[] = [
  { codigo: "GENERAL", etiqueta: "Funcionario general", activo: true, descripcion: "Requisitos generales de incorporación." },
  { codigo: "COMERCIAL", etiqueta: "Funcionario comercial", activo: true, descripcion: "Añade la garantía comercial según el tipo elegido." },
  { codigo: "AUDITORIA", etiqueta: "Auditoría interna", activo: true, descripcion: "Añade la declaración de impedimento para ser auditor." },
  { codigo: "CUMPLIMIENTO", etiqueta: "Cumplimiento / UIF", activo: true, descripcion: "Añade la acreditación LGI/FT y el examen de la UIF." },
  { codigo: "EJECUTIVO", etiqueta: "Funcionario ejecutivo", activo: false, descripcion: "En construcción: la lista de requisitos está en definición." },
  { codigo: "DIRECTORIO", etiqueta: "Directorio", activo: false, descripcion: "En construcción: la lista de requisitos está en definición." },
];

export const TIPOS_GARANTIA: TipoRama[] = [
  { codigo: "NINGUNA", etiqueta: "Sin garantía", activo: true, descripcion: "El cargo no exige garantía comercial." },
  { codigo: "COMERCIAL_1", etiqueta: "Comercial Tipo 1 · garantía real", activo: true, descripcion: "Garante con bien inmueble y folio real." },
  { codigo: "COMERCIAL_2", etiqueta: "Comercial Tipo 2 · garante personal", activo: true, descripcion: "Garante dependiente o independiente con respaldo de ingresos." },
  { codigo: "COMERCIAL_3", etiqueta: "Comercial Tipo 3 · doble garante familiar", activo: true, descripcion: "Dos garantes familiares con cédula y croquis." },
];

export const SECCIONES_CATALOGO = [
  { codigo: "generales", etiqueta: "Documentos generales", orden: 10 },
  { codigo: "garantia", etiqueta: "Garantía comercial", orden: 20 },
  { codigo: "cumplimiento", etiqueta: "Cumplimiento y UIF", orden: 30 },
];

export const MOTIVOS_REVISION = [
  { codigo: "INFO_INCOMPLETA", etiqueta: "Información incompleta" },
  { codigo: "INFO_INCONSISTENTE", etiqueta: "Información inconsistente" },
  { codigo: "REQUISITO_VENCIDO", etiqueta: "Requisito vencido" },
  { codigo: "REQUISITO_INCORRECTO", etiqueta: "Requisito incorrecto" },
  { codigo: "FALTAN_DATOS", etiqueta: "Faltan datos" },
  { codigo: "OBSERVACION_ABIERTA", etiqueta: "Observación no resuelta" },
  { codigo: "REQUIERE_PRORROGA", etiqueta: "Prórroga necesaria" },
  { codigo: "NO_CORRESPONDE", etiqueta: "No corresponde" },
  { codigo: "VALIDACION_ADICIONAL", etiqueta: "Requiere validación adicional" },
  { codigo: "OTRO", etiqueta: "Otro motivo" },
];

export const PRIORIDADES = ["BAJA", "MEDIA", "ALTA", "URGENTE"] as const;
export type Prioridad = (typeof PRIORIDADES)[number];

export const INTENCION_PRIORIDAD: Record<Prioridad, Intencion> = {
  BAJA: "neutral",
  MEDIA: "info",
  ALTA: "aviso",
  URGENTE: "peligro",
};

export const TIPOS_TAREA = ["SEGUIMIENTO", "CORRECCION", "REVISION", "APROBACION", "SOLICITUD", "PRORROGA", "OTRO"] as const;

export const VISIBILIDADES_COMENTARIO = [
  { codigo: "OPERATIVA", etiqueta: "Operativa", descripcion: "Seguimiento del día a día." },
  { codigo: "FORMAL", etiqueta: "Formal", descripcion: "Constancia que puede citarse en el expediente." },
  { codigo: "INTERNA", etiqueta: "Interna", descripcion: "Nota del equipo. No sale de aquí." },
];

/* ------------------------------------------------------------------ */
/* Capacidades y secciones del módulo                                  */
/* ------------------------------------------------------------------ */

export const CAPACIDADES = [
  "ver",
  "editar",
  "revisar",
  "aprobar",
  "comentar",
  "solicitar",
  "tareas",
  "exportar",
  "auditoria",
  "diagnosticar",
  "reparar",
  "migrar",
  "catalogos",
  "archivar",
  "restaurar",
  "configurar",
] as const;
export type Capacidad = (typeof CAPACIDADES)[number];

export type Capacidades = Partial<Record<Capacidad, boolean>>;

export type SeccionId =
  | "panel"
  | "expedientes"
  | "solicitudes"
  | "revision"
  | "aprobaciones"
  | "prorrogas"
  | "tareas"
  | "reportes"
  | "exportaciones"
  | "notificaciones"
  | "auditoria"
  | "configuracion"
  | "local";

export interface SeccionDef {
  id: SeccionId;
  etiqueta: string;
  /** Capacidad mínima. Sin ella la sección no se muestra. */
  capacidad: Capacidad;
  descripcion: string;
}

/**
 * Menú del módulo, en el orden en que se muestra.
 *
 * Las secciones que el rol no puede usar NO se pintan. La comprobación real la
 * hace el backend en cada acción; ocultarlas evita ofrecer trabajo que después se
 * va a rechazar.
 */
export const SECCIONES: SeccionDef[] = [
  { id: "panel", etiqueta: "Panel", capacidad: "ver", descripcion: "Estado general del proceso documental." },
  { id: "expedientes", etiqueta: "Expedientes", capacidad: "ver", descripcion: "Buscar, abrir y crear expedientes." },
  { id: "solicitudes", etiqueta: "Solicitudes", capacidad: "ver", descripcion: "Qué se pidió, a quién y para cuándo." },
  { id: "revision", etiqueta: "Revisión", capacidad: "ver", descripcion: "Cola de requisitos entregados por revisar." },
  { id: "aprobaciones", etiqueta: "Aprobaciones", capacidad: "ver", descripcion: "Firmas pendientes y resueltas." },
  { id: "prorrogas", etiqueta: "Prórrogas", capacidad: "ver", descripcion: "Plazos concedidos y su vencimiento." },
  { id: "tareas", etiqueta: "Tareas", capacidad: "ver", descripcion: "Trabajo asignado y fuera de plazo." },
  { id: "reportes", etiqueta: "Reportes", capacidad: "ver", descripcion: "Consolidados por agencia, gerencia y estado." },
  { id: "exportaciones", etiqueta: "Exportaciones", capacidad: "exportar", descripcion: "Descargas a Excel y su historial." },
  { id: "notificaciones", etiqueta: "Notificaciones", capacidad: "ver", descripcion: "Avisos del módulo." },
  { id: "auditoria", etiqueta: "Auditoría", capacidad: "auditoria", descripcion: "Bitácora técnica de eventos." },
  { id: "configuracion", etiqueta: "Configuración", capacidad: "ver", descripcion: "Catálogo, plazos, permisos y mantenimiento." },
  { id: "local", etiqueta: "Vista local", capacidad: "ver", descripcion: "Expedientes guardados en este equipo." },
];

/** Secciones que el rol actual puede ver. */
export function seccionesPermitidas(capacidades: Capacidades): SeccionDef[] {
  return SECCIONES.filter((seccion) => capacidades[seccion.capacidad] === true);
}
