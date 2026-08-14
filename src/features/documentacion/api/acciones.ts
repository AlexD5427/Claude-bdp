/**
 * Acciones del backend, con tipos.
 *
 * Un objeto por área con una función por acción. Es la única capa que conoce los
 * nombres de las acciones y la forma de sus parámetros: si el backend renombra
 * algo, se cambia aquí y no en once componentes. El verificador de coherencia del
 * repositorio (`npm run doc:check`) compara esta lista con el registro del backend
 * y falla si alguna acción no existe al otro lado.
 */

import { llamar, type OpcionesLlamada } from "./client";
import type { ExpedienteCabecera, ProrrogaVista, RequisitoVista } from "../domain/progreso";
import type { Capacidades } from "../domain/vocabulario";

/* ------------------------------------------------------------------ */
/* Tipos de respuesta                                                  */
/* ------------------------------------------------------------------ */

export interface EstadoModulo {
  arquitectura: string;
  version: string;
  esquema: number;
  backendHeredado: string;
  instalado: boolean;
  libro: string;
  libroUrl: string;
  horaServidor: string;
  rol: string;
  actor: string;
  capacidades: Capacidades;
  hojas: Record<string, boolean>;
  hojasFaltantes?: string[];
  migraciones: { aplicadas: string[]; pendientes: string[]; enProceso: string[]; total: number } | null;
  aniosLibro: number[];
  expedientes?: number;
  notificacionesNoLeidas?: number;
  problema?: string;
}

export interface CatalogoDocumento {
  codigo: string;
  nombre: string;
  descripcion: string;
  textoObservacion: string;
  seccion: string;
  grupo: string;
  orden: number;
  obligatorio: boolean;
  estadosPermitidos: string[];
  permiteNoAplica: boolean;
  permiteProrroga: boolean;
  tipoFuncionario: string[];
  tipoGarantia: string[];
  confidencialidad: string;
  requiereRevision: boolean;
  requiereAprobacion: boolean;
  activo: boolean;
  versionCatalogo: number;
  vigenciaDesde: string;
  vigenciaHasta: string;
  columnaLibro: string;
}

export interface CatalogoCliente {
  version: number;
  esquema: number;
  documentos: CatalogoDocumento[];
  vocabulario: Record<string, unknown>;
  auxiliares: { agencia_bdp: string[]; gerencia_bdp: string[] };
  aplicabilidad: {
    tipoFuncionario: string;
    etiqueta: string;
    tipoGarantia: string;
    habilitada: boolean;
    total: number;
    obligatorios: number;
    codigos: string[];
    nota: string;
  }[];
}

export interface PanelDatos {
  generado: string;
  filtros: Record<string, unknown>;
  tarjetas: {
    activos: number;
    completos: number;
    incompletos: number;
    observados: number;
    aprobados: number;
    archivados: number;
    pendientes: number;
    noEntregados: number;
    prorrogasVigentes: number;
    prorrogasVencidas: number;
    solicitudesVencidas: number;
    tareasFueraSla: number;
    aprobacionesPendientes: number;
  };
  avancePromedio: number;
  expedientes: number;
  completitudPorAgencia: { clave: string; expedientes: number; completos: number; avancePromedio: number }[];
  completitudPorGerencia: { clave: string; expedientes: number; completos: number; avancePromedio: number }[];
  distribucionTipoFuncionario: { clave: string; expedientes: number; completos: number; avancePromedio: number }[];
  distribucionEstados: { clave: string; total: number }[];
  evolucionMensual: { mes: string; expedientes: number; completos: number }[];
  prorrogasPorEstado: { clave: string; total: number }[];
  embudo: {
    total: number;
    entregados: number;
    enRevision: number;
    aprobados: number;
    observados: number;
    noAplica: number;
    pendientes: number;
    noEntregados: number;
  };
  requisitosNoEntregados: { codigo: string; nombre: string; total: number }[];
  requisitosObservados: { codigo: string; nombre: string; total: number }[];
  tiempoRevisionHoras: number | null;
  revisionesMedidas: number;
  desdeCache: boolean;
}

export interface Pagina<T> {
  total: number;
  pagina: number;
  paginas: number;
  porPagina: number;
  resumen?: Record<string, number>;
  [clave: string]: unknown;
  filas?: T[];
}

export interface ListadoExpedientes {
  total: number;
  pagina: number;
  paginas: number;
  porPagina: number;
  expedientes: ExpedienteCabecera[];
  resumen: {
    expedientes: number;
    avancePromedio: number;
    pendientes: number;
    noEntregados: number;
    observados: number;
    completos: number;
    prorrogasVencidas: number;
  };
}

export interface SolicitudVista {
  solicitudId: string;
  expedienteId: string;
  titulo: string;
  descripcion: string;
  responsableId: string;
  fechaSolicitud: string;
  fechaLimite: string;
  diasParaLimite: number | null;
  vencida: boolean;
  prioridad: string;
  estado: string;
  canal: string;
  ultimoRecordatorio: string;
  proximoRecordatorio: string;
  recordatorios: number;
  total: number;
  cumplidos: number;
  items: {
    solicitudDocumentoId: string;
    expedienteDocumentoId: string;
    codigo: string;
    nombre: string;
    estado: string;
    fechaCumplimiento: string;
    observacion: string;
  }[];
  creadoEn: string;
  creadoPor: string;
  version: number;
  expediente?: { identificador: string; nombre: string; agencia?: string; gerencia?: string } | null;
}

export interface RevisionVista {
  revisionId: string;
  expedienteId: string;
  expedienteDocumentoId: string;
  codigo: string;
  nombre: string;
  revisor: string;
  estado: string;
  motivo: string;
  motivoEtiqueta: string;
  comentario: string;
  fecha: string;
  versionRevisada: number;
}

export interface AprobacionVista {
  aprobacionId: string;
  expedienteId: string;
  expedienteDocumentoId: string;
  codigo: string;
  flujo: string;
  nivel: number;
  aprobador: string;
  estado: string;
  comentario: string;
  fechaLimite: string;
  diasParaLimite: number | null;
  vencida: boolean;
  fechaDecision: string;
  creadoEn: string;
  version: number;
  expediente?: { identificador: string; nombre: string } | null;
}

export interface TareaVista {
  tareaId: string;
  expedienteId: string;
  expedienteDocumentoId: string;
  codigo: string;
  tipo: string;
  titulo: string;
  descripcion: string;
  responsableId: string;
  prioridad: string;
  estado: string;
  fechaLimite: string;
  diasParaLimite: number | null;
  vencida: boolean;
  fueraDeSla: boolean;
  slaHoras: number;
  escalada: boolean;
  origenTipo: string;
  origenId: string;
  creadoEn: string;
  creadoPor: string;
  completadoEn: string;
  completadoPor: string;
  version: number;
  expediente?: { identificador: string; nombre: string } | null;
}

export interface ComentarioVista {
  comentarioId: string;
  expedienteId: string;
  expedienteDocumentoId: string;
  codigo: string;
  padreId: string;
  tipo: string;
  visibilidad: string;
  contenido: string;
  resuelto: boolean;
  creadoEn: string;
  creadoPor: string;
  editadoEn: string;
  version: number;
}

export interface HistorialEntrada {
  historialId: string;
  entidadTipo: string;
  entidadId: string;
  campo: string;
  anterior: string;
  nuevo: string;
  motivo: string;
  fecha: string;
  actor: string;
  texto: string;
}

export interface AuditoriaEvento {
  eventoId: string;
  requestId: string;
  expedienteId: string;
  entidadTipo: string;
  entidadId: string;
  tipo: string;
  actor: string;
  actorId?: string;
  origen: string;
  resultado: string;
  metadata: unknown;
  fecha: string;
}

export interface NotificacionVista {
  notificacionId: string;
  usuario: string;
  expedienteId: string;
  entidadTipo: string;
  entidadId: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  canal: string;
  estadoEnvio: string;
  leida: boolean;
  fechaLectura: string;
  fecha: string;
  error: string;
}

export interface ExpedienteOperativo {
  expediente: ExpedienteCabecera;
  requisitos: RequisitoVista[];
  prorrogas: ProrrogaVista[];
  solicitudes: SolicitudVista[];
  revisiones: RevisionVista[];
  aprobaciones: AprobacionVista[];
  tareas: TareaVista[];
  comentarios: ComentarioVista[];
  consentimientos: {
    consentimientoId: string;
    tipo: string;
    tipoEtiqueta: string;
    version: string;
    hash: string;
    estado: string;
    fechaPresentacion: string;
    fechaAceptacion: string;
    fechaRevocacion: string;
    medio: string;
    evidencia: string;
  }[];
  historial: HistorialEntrada[];
  auditoria: AuditoriaEvento[];
  resumenTextual: string;
  capacidades: Capacidades;
  siguientePendiente: { expedienteDocumentoId: string; codigo: string; motivo: string } | null;
}

export interface Hallazgo {
  severidad: "INFO" | "ADVERTENCIA" | "IMPORTANTE" | "CRITICO";
  codigo: string;
  titulo: string;
  detalle: string;
  accion: string;
  reparable: false | "automatica" | "confirmacion";
  datos: { total?: number; ejemplos?: unknown[] } & Record<string, unknown>;
}

export interface Diagnostico {
  ok: boolean;
  resumen: Record<string, unknown>;
  hallazgos: Hallazgo[];
  conteos: { INFO: number; ADVERTENCIA: number; IMPORTANTE: number; CRITICO: number };
  reparablesAutomaticamente: string[];
  requierenConfirmacion: string[];
  ms: number;
}

export interface ReporteDatos {
  tipo: string;
  etiqueta: string;
  generado: string;
  columnas: string[];
  filas: (string | number | null)[][];
  total: number;
  panel?: PanelDatos;
}

export interface TrabajoExportacion {
  exportacionId: string;
  tipo: string;
  expedientes: number;
  lote: number;
  hojas: string[];
}

export interface LoteExportacion {
  exportacionId: string;
  tipo: string;
  desde: number;
  hasta: number;
  total: number;
  progreso: number;
  quedan: boolean;
  datos: Record<string, (string | number | null)[][]>;
}

/* ------------------------------------------------------------------ */
/* Acciones                                                            */
/* ------------------------------------------------------------------ */

export const docApi = {
  /* --- Estado y catálogos ------------------------------------------ */
  estado: (o?: OpcionesLlamada) => llamar<EstadoModulo>("documentacion.estado", {}, { reintentos: 1, timeoutMs: 15000, ...o }),
  catalogo: (o?: OpcionesLlamada) => llamar<CatalogoCliente>("documentacion.catalogo", {}, o),
  vocabulario: (o?: OpcionesLlamada) =>
    llamar<{
      esquema: number;
      estados: Record<string, Record<string, string>>;
      transiciones: Record<string, Record<string, string[]>>;
      tiposFuncionario: { codigo: string; etiqueta: string; activo: boolean; descripcion: string }[];
      tiposGarantia: { codigo: string; etiqueta: string; activo: boolean; descripcion: string }[];
      motivosRevision: { codigo: string; etiqueta: string }[];
      sla: Record<string, number>;
      umbrales: Record<string, number>;
    }>("documentacion.vocabulario", {}, o),
  guardarCatalogo: (catalogo: unknown[], o?: OpcionesLlamada) =>
    llamar<{ guardados: number; creados: number; rechazados: unknown[] }>("documentacion.catalogo.guardar", { catalogo }, o),
  auxiliares: (o?: OpcionesLlamada) =>
    llamar<{ auxiliares: { agencia_bdp: string[]; gerencia_bdp: string[] }; revision: Record<string, unknown> }>(
      "documentacion.auxiliares",
      {},
      o,
    ),
  agregarAuxiliar: (columna: string, valores: string[], o?: OpcionesLlamada) =>
    llamar<{ columna: string; agregados: string[]; total: number }>("documentacion.auxiliares.agregar", { columna, valores }, o),
  permisos: (o?: OpcionesLlamada) =>
    llamar<{ rol: string; actor: string; actorId: string; capacidades: Capacidades; matriz: Record<string, string[]>; roles: string[] }>(
      "documentacion.permisos.obtener",
      {},
      o,
    ),
  guardarPermisos: (roles: Record<string, string>, o?: OpcionesLlamada) =>
    llamar<{ roles: Record<string, string>; rechazados: unknown[] }>("documentacion.permisos.guardar", { roles }, o),
  configuracion: (o?: OpcionesLlamada) =>
    llamar<{
      configuracion: Record<string, string>;
      automatizaciones: { codigo: string; evento: string; accion: string; descripcion: string; porDefecto: boolean }[];
      desactivadas: string[];
      sla: Record<string, number>;
      umbrales: Record<string, number>;
      tiposConsentimiento: { codigo: string; etiqueta: string; descripcion: string }[];
    }>("documentacion.configuracion.obtener", {}, o),
  guardarConfiguracion: (configuracion: Record<string, unknown>, o?: OpcionesLlamada) =>
    llamar<{ guardadas: string[]; rechazadas: { clave: string; motivo: string }[]; configuracion: Record<string, string> }>(
      "documentacion.configuracion.guardar",
      { configuracion },
      o,
    ),

  /* --- Instalación y mantenimiento --------------------------------- */
  instalar: (opciones: { simular?: boolean; conRespaldo?: boolean } = {}, o?: OpcionesLlamada) =>
    llamar<Record<string, unknown>>("documentacion.instalar", opciones, o),
  migrar: (opciones: { simular?: boolean; version?: string; lote?: number } = {}, o?: OpcionesLlamada) =>
    llamar<{
      simulado: boolean;
      ejecutadas: { version: string; nombre: string; ok: boolean; resumen?: string; error?: string; quedan: boolean; siguiente: number }[];
      estado: { aplicadas: string[]; pendientes: string[] };
      recomendacionRespaldo: string;
    }>("documentacion.migrar", opciones, o),
  respaldo: (o?: OpcionesLlamada) =>
    llamar<{ ok: boolean; respaldoId?: string; expedientes?: number; error?: string; recomendacion?: string }>(
      "documentacion.respaldo",
      {},
      o,
    ),
  diagnostico: (o?: OpcionesLlamada) => llamar<Diagnostico>("documentacion.diagnostico", {}, o),
  estadoMigraciones: (o?: OpcionesLlamada) =>
    llamar<{ aplicadas: string[]; pendientes: string[]; enProceso: string[]; total: number }>(
      "documentacion.migraciones.estado",
      {},
      o,
    ),
  reparar: (opciones: { acciones?: string[]; confirmado?: boolean; incluirConfirmacion?: boolean } = {}, o?: OpcionesLlamada) =>
    llamar<{
      aplicadas: { accion: string; cambios: number; detalle: unknown }[];
      omitidas: { accion: string; motivo: string }[];
      antes: { conteos: Record<string, number> };
      despues: { conteos: Record<string, number> };
      pendientesManuales: { codigo: string; severidad: string; titulo: string; queHacer: string; total: number }[];
    }>("documentacion.reparar", opciones, o),
  procesoDiario: (o?: OpcionesLlamada) => llamar<Record<string, unknown>>("documentacion.proceso.diario", {}, o),

  /* --- Panel, reportes, exportaciones ------------------------------ */
  panel: (filtros: Record<string, unknown> = {}, o?: OpcionesLlamada) => llamar<PanelDatos>("documentacion.panel", { filtros }, o),
  reportesDisponibles: (o?: OpcionesLlamada) =>
    llamar<{ reportes: { codigo: string; etiqueta: string; capacidad: string }[] }>("documentacion.reportes.disponibles", {}, o),
  reporte: (tipo: string, filtros: Record<string, unknown> = {}, o?: OpcionesLlamada) =>
    llamar<ReporteDatos>("documentacion.reporte", { tipo, filtros }, o),
  iniciarExportacion: (params: Record<string, unknown>, o?: OpcionesLlamada) =>
    llamar<TrabajoExportacion>("documentacion.exportacion.iniciar", params, o),
  loteExportacion: (exportacionId: string, lote?: number, o?: OpcionesLlamada) =>
    llamar<LoteExportacion>("documentacion.exportacion.lote", { exportacionId, lote }, o),
  cancelarExportacion: (exportacionId: string, o?: OpcionesLlamada) =>
    llamar<{ exportacionId: string; estado: string }>("documentacion.exportacion.cancelar", { exportacionId }, o),
  exportaciones: (filtros: Record<string, unknown> = {}, o?: OpcionesLlamada) =>
    llamar<{ total: number; exportaciones: Record<string, unknown>[] }>("documentacion.exportaciones.listar", filtros, o),

  /* --- Expedientes ------------------------------------------------- */
  listarExpedientes: (filtros: Record<string, unknown>, o?: OpcionesLlamada) =>
    llamar<ListadoExpedientes>("documentacion.expedientes.listar", { filtros }, o),
  obtenerExpediente: (expedienteId: string, extras: Record<string, unknown> = {}, o?: OpcionesLlamada) =>
    llamar<ExpedienteOperativo>("documentacion.expediente.obtener", { expedienteId, ...extras }, o),
  crearExpediente: (expediente: Record<string, unknown>, o?: OpcionesLlamada) =>
    llamar<{ expedienteId: string; creado: boolean; requisitos?: number; repetido?: boolean }>(
      "documentacion.expediente.crear",
      { expediente },
      o,
    ),
  actualizarExpediente: (expedienteId: string, cambios: Record<string, unknown>, version?: number, o?: OpcionesLlamada) =>
    llamar<{ expedienteId: string; cambios: number; sincronizacion?: unknown }>(
      "documentacion.expediente.actualizar",
      { expedienteId, cambios, version },
      o,
    ),
  cambiarEstadoExpediente: (expedienteId: string, estado: string, extras: Record<string, unknown> = {}, o?: OpcionesLlamada) =>
    llamar<{ expedienteId: string; estado: string; anterior: string }>(
      "documentacion.expediente.estado",
      { expedienteId, estado, ...extras },
      o,
    ),
  sincronizarRequisitos: (expedienteId: string, o?: OpcionesLlamada) =>
    llamar<{ creados: number; archivados: number; conservados: unknown[] }>("documentacion.expediente.sincronizar", { expedienteId }, o),
  archivarExpediente: (expedienteId: string, motivo?: string, o?: OpcionesLlamada) =>
    llamar<{ expedienteId: string; estado: string }>("documentacion.expediente.archivar", { expedienteId, motivo }, o),
  restaurarExpediente: (expedienteId: string, o?: OpcionesLlamada) =>
    llamar<{ expedienteId: string; estado: string; restaurado: boolean }>("documentacion.expediente.restaurar", { expedienteId }, o),
  prepararLaboral: (expedienteId: string, registrarCierre = false, o?: OpcionesLlamada) =>
    llamar<{
      listo: boolean;
      faltantes: { codigo: string; nombre: string; estado: string; obligatorio: boolean }[];
      observados: { codigo: string; nombre: string; estado: string }[];
      contrato: { campos: Record<string, unknown>; noTransferible: string[]; nota: string };
      cierreRegistrado: boolean;
      moduloDestinoDisponible: boolean;
      nota: string;
    }>("documentacion.expediente.laboral", { expedienteId, registrarCierre }, o),

  /* --- Requisitos -------------------------------------------------- */
  actualizarRequisito: (
    expedienteDocumentoId: string,
    cambios: Record<string, unknown>,
    version?: number,
    o?: OpcionesLlamada,
  ) =>
    llamar<{ expedienteDocumentoId: string; cambios: number; resumen?: Record<string, unknown> }>(
      "documentacion.requisito.actualizar",
      { expedienteDocumentoId, cambios, version },
      o,
    ),
  guardarRequisitos: (expedienteId: string, cambios: Record<string, unknown>[], o?: OpcionesLlamada) =>
    llamar<{ aplicados: number; fallidos: { indice: number; motivo: string }[]; resumen: Record<string, unknown> }>(
      "documentacion.requisitos.guardar",
      { expedienteId, cambios },
      o,
    ),

  /* --- Prórrogas --------------------------------------------------- */
  crearProrroga: (prorroga: Record<string, unknown>, o?: OpcionesLlamada) =>
    llamar<{ prorrogaId: string; estado: string; fecha: string }>("documentacion.prorroga.crear", { prorroga }, o),
  actualizarProrroga: (prorrogaId: string, cambios: Record<string, unknown>, version?: number, o?: OpcionesLlamada) =>
    llamar<{ prorrogaId: string; cambios: number }>("documentacion.prorroga.actualizar", { prorrogaId, cambios, version }, o),
  cambiarEstadoProrroga: (prorrogaId: string, estado: string, motivo?: string, o?: OpcionesLlamada) =>
    llamar<{ prorrogaId: string; estado: string }>("documentacion.prorroga.estado", { prorrogaId, estado, motivo }, o),
  listarProrrogas: (filtros: Record<string, unknown>, o?: OpcionesLlamada) =>
    llamar<{ total: number; pagina: number; paginas: number; porPagina: number; prorrogas: ProrrogaVista[] }>(
      "documentacion.prorrogas.listar",
      { filtros },
      o,
    ),

  /* --- Solicitudes ------------------------------------------------- */
  crearSolicitud: (solicitud: Record<string, unknown>, o?: OpcionesLlamada) =>
    llamar<{ solicitudId: string; requisitos: number; fechaLimite: string }>("documentacion.solicitud.crear", { solicitud }, o),
  cambiarEstadoSolicitud: (solicitudId: string, estado: string, motivo?: string, o?: OpcionesLlamada) =>
    llamar<{ solicitudId: string; estado: string }>("documentacion.solicitud.estado", { solicitudId, estado, motivo }, o),
  seguimientoSolicitud: (solicitudId: string, nota: string, o?: OpcionesLlamada) =>
    llamar<{ solicitudId: string; recordatorios: number; estado: string }>(
      "documentacion.solicitud.seguimiento",
      { solicitudId, nota },
      o,
    ),
  listarSolicitudes: (filtros: Record<string, unknown>, o?: OpcionesLlamada) =>
    llamar<{ total: number; pagina: number; paginas: number; porPagina: number; solicitudes: SolicitudVista[] }>(
      "documentacion.solicitudes.listar",
      { filtros },
      o,
    ),
  impactoMasivo: (seleccion: Record<string, unknown>, o?: OpcionesLlamada) =>
    llamar<{
      expedientes: number;
      conPendientes: number;
      sinPendientes: number;
      duplicadosPotenciales: number;
      duplicados: { identificador: string; nombre: string; abiertas: number }[];
      detalle: Record<string, unknown>[];
      lote: number;
      advertencias: string[];
    }>("documentacion.solicitudes.impacto", { seleccion }, o),
  solicitudMasiva: (params: Record<string, unknown>, o?: OpcionesLlamada) =>
    llamar<{
      total: number;
      procesados: number;
      creadas: number;
      omitidas: number;
      fallidas: { identificador: string; motivo: string }[];
      siguiente: number;
      quedan: boolean;
      progreso: number;
    }>("documentacion.solicitudes.masiva", params, o),

  /* --- Revisiones y aprobaciones ----------------------------------- */
  decidirRevision: (revision: Record<string, unknown>, o?: OpcionesLlamada) =>
    llamar<{ revisionId: string; estado: string; resumen: Record<string, unknown> }>(
      "documentacion.revision.decidir",
      { revision },
      o,
    ),
  colaRevision: (filtros: Record<string, unknown>, o?: OpcionesLlamada) =>
    llamar<{
      total: number;
      pagina: number;
      paginas: number;
      porPagina: number;
      requisitos: {
        expedienteDocumentoId: string;
        expedienteId: string;
        identificador: string;
        persona: string;
        agencia: string;
        gerencia: string;
        codigo: string;
        nombre: string;
        seccion: string;
        estadoDocumental: string;
        estadoRevision: string;
        requiereRevision: boolean;
        requiereAprobacion: boolean;
        observaciones: string;
        actualizadoEn: string;
        version: number;
      }[];
      motivos: { codigo: string; etiqueta: string }[];
    }>("documentacion.revision.cola", { filtros }, o),
  solicitarAprobacion: (aprobacion: Record<string, unknown>, o?: OpcionesLlamada) =>
    llamar<{ aprobaciones: string[]; fechaLimite: string }>("documentacion.aprobacion.solicitar", { aprobacion }, o),
  resolverAprobacion: (aprobacionId: string, decision: string, comentario?: string, o?: OpcionesLlamada) =>
    llamar<{ aprobacionId: string; estado: string }>(
      "documentacion.aprobacion.resolver",
      { aprobacionId, decision, comentario },
      o,
    ),
  listarAprobaciones: (filtros: Record<string, unknown>, o?: OpcionesLlamada) =>
    llamar<{ total: number; pagina: number; paginas: number; porPagina: number; aprobaciones: AprobacionVista[] }>(
      "documentacion.aprobaciones.listar",
      { filtros },
      o,
    ),

  /* --- Comentarios y tareas ---------------------------------------- */
  crearComentario: (comentario: Record<string, unknown>, o?: OpcionesLlamada) =>
    llamar<{ comentarioId: string }>("documentacion.comentario.crear", { comentario }, o),
  editarComentario: (comentarioId: string, contenido: string, version?: number, o?: OpcionesLlamada) =>
    llamar<{ comentarioId: string; editado?: boolean }>("documentacion.comentario.editar", { comentarioId, contenido, version }, o),
  resolverComentario: (comentarioId: string, resuelto: boolean, o?: OpcionesLlamada) =>
    llamar<{ comentarioId: string; resuelto: boolean }>("documentacion.comentario.resolver", { comentarioId, resuelto }, o),
  listarComentarios: (filtros: Record<string, unknown>, o?: OpcionesLlamada) =>
    llamar<{ total: number; pagina: number; paginas: number; porPagina: number; comentarios: ComentarioVista[] }>(
      "documentacion.comentarios.listar",
      { filtros },
      o,
    ),
  crearTarea: (tarea: Record<string, unknown>, o?: OpcionesLlamada) =>
    llamar<{ tareaId: string; fechaLimite: string }>("documentacion.tarea.crear", { tarea }, o),
  actualizarTarea: (tareaId: string, cambios: Record<string, unknown>, version?: number, o?: OpcionesLlamada) =>
    llamar<{ tareaId: string; cambios?: number }>("documentacion.tarea.actualizar", { tareaId, cambios, version }, o),
  cambiarEstadoTarea: (tareaId: string, estado: string, motivo?: string, o?: OpcionesLlamada) =>
    llamar<{ tareaId: string; estado: string }>("documentacion.tarea.estado", { tareaId, estado, motivo }, o),
  listarTareas: (filtros: Record<string, unknown>, o?: OpcionesLlamada) =>
    llamar<{ total: number; pagina: number; paginas: number; porPagina: number; tareas: TareaVista[] }>(
      "documentacion.tareas.listar",
      { filtros },
      o,
    ),

  /* --- Notificaciones, historial y auditoría ----------------------- */
  notificaciones: (filtros: Record<string, unknown> = {}, o?: OpcionesLlamada) =>
    llamar<{ total: number; pagina: number; paginas: number; porPagina: number; notificaciones: NotificacionVista[]; noLeidas: number }>(
      "documentacion.notificaciones.listar",
      { filtros },
      o,
    ),
  marcarNotificacion: (notificacionId: string, o?: OpcionesLlamada) =>
    llamar<{ notificacionId: string; leida: boolean }>("documentacion.notificacion.leer", { notificacionId }, o),
  marcarTodasLeidas: (o?: OpcionesLlamada) => llamar<{ marcadas: number }>("documentacion.notificaciones.leerTodas", {}, o),
  auditoria: (filtros: Record<string, unknown>, o?: OpcionesLlamada) =>
    llamar<{ total: number; devueltos: number; eventos: AuditoriaEvento[] }>("documentacion.auditoria.consultar", { filtros }, o),
  historial: (expedienteId: string, limite = 100, o?: OpcionesLlamada) =>
    llamar<{ historial: HistorialEntrada[] }>("documentacion.historial.consultar", { expedienteId, limite }, o),

  /* --- Filtros guardados ------------------------------------------- */
  guardarFiltro: (filtro: Record<string, unknown>, o?: OpcionesLlamada) =>
    llamar<{ filtroId: string; nombre: string; creado: boolean }>("documentacion.filtro.guardar", { filtro }, o),
  listarFiltros: (o?: OpcionesLlamada) =>
    llamar<{
      filtros: {
        filtroId: string;
        nombre: string;
        descripcion: string;
        definicion: Record<string, unknown>;
        compartido: boolean;
        propio: boolean;
        propietario: string;
        actualizadoEn: string;
      }[];
    }>("documentacion.filtros.listar", {}, o),
  eliminarFiltro: (filtroId: string, o?: OpcionesLlamada) =>
    llamar<{ filtroId: string; borrado: boolean }>("documentacion.filtro.eliminar", { filtroId }, o),

  /* --- Consentimientos y retención --------------------------------- */
  presentarConsentimiento: (consentimiento: Record<string, unknown>, o?: OpcionesLlamada) =>
    llamar<{ consentimientoId: string; estado: string; hash: string }>(
      "documentacion.consentimiento.presentar",
      { consentimiento },
      o,
    ),
  responderConsentimiento: (consentimientoId: string, estado: string, extras: Record<string, unknown> = {}, o?: OpcionesLlamada) =>
    llamar<{ consentimientoId: string; estado: string }>(
      "documentacion.consentimiento.responder",
      { consentimientoId, estado, ...extras },
      o,
    ),
  listarConsentimientos: (filtros: Record<string, unknown> = {}, o?: OpcionesLlamada) =>
    llamar<{ total: number; consentimientos: Record<string, unknown>[]; tipos: { codigo: string; etiqueta: string }[] }>(
      "documentacion.consentimientos.listar",
      { filtros },
      o,
    ),
  politicasRetencion: (o?: OpcionesLlamada) =>
    llamar<{ politicas: Record<string, unknown>[] }>("documentacion.retencion.politicas", {}, o),
  aplicarRetencion: (o?: OpcionesLlamada) =>
    llamar<{ marcados: number; bloqueados: number; evaluados: number; detalle: unknown[] }>("documentacion.retencion.aplicar", {}, o),
  planAnonimizacion: (expedienteId: string, o?: OpcionesLlamada) =>
    llamar<{
      permitido: boolean;
      motivoSiNoPermitido: string;
      campos: { campo: string; actual: string; futuro: string; nota?: string }[];
      conserva: string[];
      irreversible: boolean;
    }>("documentacion.retencion.planAnonimizacion", { expedienteId }, o),
  anonimizar: (expedienteId: string, o?: OpcionesLlamada) =>
    llamar<{ expedienteId: string; anonimizado: boolean }>(
      "documentacion.retencion.anonimizar",
      { expedienteId, confirmado: true },
      o,
    ),
  inconsistencias: (o?: OpcionesLlamada) => llamar<{ hallazgos: Hallazgo[] }>("documentacion.inconsistencias", {}, o),
};

export type DocApi = typeof docApi;
