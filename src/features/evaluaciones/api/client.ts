/**
 * Cliente tipado del backend de Evaluaciones.
 *
 * Una función por acción, con los tipos del dominio. Es la ÚNICA superficie que el
 * resto del módulo usa: ningún componente construye una petición ni conoce el
 * nombre de una acción. Cambiar el contrato es cambiar este archivo.
 *
 * Las escrituras aceptan un `solicitudId` para poder reintentar la MISMA intención
 * sin duplicarla; quien no lo pasa recibe uno nuevo en cada llamada, que es lo
 * correcto para una acción disparada por un clic.
 */

import type { Result } from "../../../shared/result";
import { escribir, leer, leerConMeta, nuevaSolicitudId, type OpcionesPeticion } from "./transport";
import type { AppErrorEvaluaciones, Envelope } from "./envelope";
import type {
  ColaIntentos,
  DetalleIntento,
  Diagnostico,
  DocumentoEvaluacion,
  EstadoBackend,
  Evaluacion,
  EventoEnviado,
  InicioIntento,
  LatidoIntento,
  PaqueteExportacion,
  PortadaPublica,
  ResultadoCandidato,
  RespuestaEnviada,
  ResumenEvaluacion,
  Seccion,
} from "../domain/model";

type Res<T> = Promise<Result<T, AppErrorEvaluaciones>>;

export { nuevaSolicitudId };

/* --------------------------------- Conexión ------------------------------- */

/** Latido con el envoltorio completo: el panel de conexión necesita `meta`. */
export function ping(opciones: OpcionesPeticion = {}): Res<Envelope<EstadoBackend>> {
  return leerConMeta<EstadoBackend>("ping", {}, { ...opciones, timeoutMs: opciones.timeoutMs ?? 12000 });
}

export function diagnosticar(profundo = false, opciones: OpcionesPeticion = {}): Res<Diagnostico> {
  return leer<Diagnostico>("diagnose", { profundo }, { ...opciones, timeoutMs: opciones.timeoutMs ?? 60000 });
}

export function instalar(solicitudId?: string): Res<{
  acciones: { sheet: string; action: string; columns?: string[] | number }[];
  informe: Diagnostico["esquema"];
  autorizacion: Diagnostico["autorizacion"];
}> {
  return escribir("install", {}, { solicitudId, timeoutMs: 90000 });
}

export function listarRegistro(limite = 100, filtros: { nivel?: string; traza?: string; accion?: string } = {}) {
  return leer<{
    entradas: {
      id: string;
      ocurridoEn: string;
      nivel: string;
      traza: string;
      accion: string;
      mensaje: string;
      contexto: Record<string, unknown>;
      pila: string;
    }[];
    total: number;
    nivelMinimo: string;
  }>("listLogs", { limite, ...filtros });
}

export function obtenerMetricas() {
  return leer<{
    acciones: {
      accion: string;
      llamadas: number;
      errores: number;
      msPromedio: number;
      msMaximo: number;
      filasLeidasPromedio: number;
      filasEscritasPromedio: number;
    }[];
    muestras: number;
    habilitadas: boolean;
  }>("getMetrics");
}

export function podarRegistro(conservar = 4000, solicitudId?: string) {
  return escribir<{ borrado: { registro: number; metricas: number }; conservar: number }>(
    "pruneLogs",
    { conservar },
    { solicitudId },
  );
}

/* ------------------------------- Administración --------------------------- */

export function listarEvaluaciones(
  filtros: {
    buscar?: string;
    estados?: string[];
    categoria?: string;
    proceso?: string;
    incluirPapelera?: boolean;
  } = {},
  opciones: OpcionesPeticion = {},
): Res<{ items: ResumenEvaluacion[]; total: number; sincronizadoEn: string }> {
  return leer("listEvaluations", { ...filtros }, opciones);
}

export function obtenerEvaluacion(id: string, opciones: OpcionesPeticion = {}): Res<DocumentoEvaluacion> {
  return leer("getEvaluation", { id }, opciones);
}

export function crearEvaluacion(
  titulo: string,
  categoria: string,
  actor: string,
  solicitudId?: string,
): Res<DocumentoEvaluacion> {
  return escribir("createEvaluation", { titulo, categoria }, { solicitudId, actor });
}

/**
 * Guarda el documento completo del borrador.
 *
 * `revisionBase` es la revisión que el editor tenía al abrir. El servidor la usa
 * para detectar que OTRA sesión escribió en medio; la propia sesión nunca choca
 * consigo misma. `forzar` sobrescribe esos cambios de forma deliberada.
 */
export function guardarEvaluacion(
  documento: { evaluacion: Evaluacion; secciones: Seccion[] },
  opciones: { revisionBase?: number; forzar?: boolean; actor?: string; solicitudId?: string } = {},
): Res<DocumentoEvaluacion> {
  return escribir(
    "saveEvaluation",
    {
      id: documento.evaluacion.id,
      revisionBase: opciones.revisionBase,
      forzar: opciones.forzar === true,
      evaluacion: documento.evaluacion,
      secciones: documento.secciones,
    },
    { solicitudId: opciones.solicitudId, actor: opciones.actor },
  );
}

export function duplicarEvaluacion(
  id: string,
  actor: string,
  titulo?: string,
  solicitudId?: string,
): Res<DocumentoEvaluacion> {
  return escribir("duplicateEvaluation", { id, titulo }, { solicitudId, actor });
}

export interface ResultadoPublicacion {
  documento: DocumentoEvaluacion;
  version: {
    id: string;
    etiqueta: string;
    mayor: number;
    menor: number;
    tipoCambio: "inicial" | "estructural" | "presentacion" | "sin_cambios";
    bloques?: number;
    caracteres?: number;
    huella?: string;
  };
  enlacePublico: { codigo: string };
  advertencias: { code: string; message: string; path: string }[];
}

export function publicarEvaluacion(
  id: string,
  actor: string,
  notas = "",
  solicitudId?: string,
): Res<ResultadoPublicacion> {
  return escribir("publishEvaluation", { id, notas }, { solicitudId, actor });
}

export type Transicion = "pausar" | "reanudar" | "cerrar" | "archivar" | "restaurar" | "despublicar";

export function transicionar(
  id: string,
  transicion: Transicion,
  actor: string,
  solicitudId?: string,
): Res<DocumentoEvaluacion> {
  return escribir("transitionEvaluation", { id, transicion }, { solicitudId, actor });
}

export function relanzarEvaluacion(
  id: string,
  actor: string,
  ventana: { inicio?: string; fin?: string } = {},
  solicitudId?: string,
): Res<DocumentoEvaluacion> {
  return escribir(
    "relaunchEvaluation",
    { id, ventanaInicio: ventana.inicio, ventanaFin: ventana.fin },
    { solicitudId, actor },
  );
}

export function revertirVersion(
  id: string,
  versionId: string,
  actor: string,
  solicitudId?: string,
): Res<DocumentoEvaluacion> {
  return escribir("rollbackEvaluation", { id, versionId }, { solicitudId, actor });
}

export function eliminarEvaluacion(
  id: string,
  actor: string,
  solicitudId?: string,
): Res<{ id: string; estado: string }> {
  return escribir("deleteEvaluation", { id }, { solicitudId, actor });
}

/** Borrado permanente. Exige la confirmación literal que el backend pide. */
export function borrarDefinitivamente(
  id: string,
  actor: string,
  solicitudId?: string,
): Res<{ id: string; borrado: Record<string, number> }> {
  return escribir("purgeEvaluation", { id, confirmacion: "ELIMINAR" }, { solicitudId, actor });
}

/* --------------------------------- Resultados ----------------------------- */

export function listarIntentos(
  evaluacionId: string,
  filtros: { estados?: string[]; buscar?: string; soloRiesgo?: boolean } = {},
  opciones: OpcionesPeticion = {},
): Res<ColaIntentos> {
  return leer("listAttempts", { evaluacionId, ...filtros }, opciones);
}

export function obtenerIntento(intentoId: string, opciones: OpcionesPeticion = {}): Res<DetalleIntento> {
  return leer("getAttempt", { intentoId }, opciones);
}

export function exportarIntento(intentoId: string, opciones: OpcionesPeticion = {}): Res<PaqueteExportacion> {
  return leer("exportAttempt", { intentoId }, opciones);
}

export function calificarRespuesta(
  intentoId: string,
  preguntaId: string,
  puntos: number,
  comentario: string,
  actor: string,
  opciones: { forzar?: boolean; notasRevision?: string; solicitudId?: string } = {},
): Res<{
  intentoId: string;
  preguntaId: string;
  puntosObtenidos: number;
  nota: number | null;
  aprobado: boolean | null;
  estadoCalificacion: string;
  pendientesRevision: number;
}> {
  return escribir(
    "gradeAnswer",
    {
      intentoId,
      preguntaId,
      puntos,
      comentario,
      forzar: opciones.forzar === true,
      notasRevision: opciones.notasRevision,
    },
    { solicitudId: opciones.solicitudId, actor },
  );
}

export function anularIntento(
  intentoId: string,
  actor: string,
  opciones: { motivo?: string; restablecer?: boolean; solicitudId?: string } = {},
): Res<{ intentoId: string; estado: string }> {
  return escribir(
    "annulAttempt",
    { intentoId, motivo: opciones.motivo, restablecer: opciones.restablecer === true },
    { solicitudId: opciones.solicitudId, actor },
  );
}

/* -------------------------- Superficie del candidato ---------------------- */

/**
 * Las cuatro acciones del candidato NO envían la llave de administración.
 *
 * Es explícito (`conLlave: false`) y no accidental: el runner puede ejecutarse en
 * un navegador que nunca la tuvo, y mandarla desde ahí sería filtrarla sin razón.
 */
const SIN_LLAVE: OpcionesPeticion = { conLlave: false };

export function abrirEvaluacion(codigo: string, opciones: OpcionesPeticion = {}): Res<PortadaPublica> {
  return leer("openAssessment", { codigo }, { ...SIN_LLAVE, ...opciones });
}

export function iniciarIntento(
  codigo: string,
  participante: Record<string, string>,
  extra: { consentimiento?: boolean; agenteUsuario?: string; zonaHoraria?: string; solicitudId?: string } = {},
): Res<InicioIntento> {
  return escribir(
    "startAttempt",
    {
      codigo,
      participante,
      consentimiento: extra.consentimiento === true,
      agenteUsuario: extra.agenteUsuario,
      zonaHoraria: extra.zonaHoraria,
    },
    { ...SIN_LLAVE, solicitudId: extra.solicitudId },
  );
}

export function latido(intentoId: string, token: string, opciones: OpcionesPeticion = {}): Res<LatidoIntento> {
  return leer("heartbeat", { intentoId, token }, { ...SIN_LLAVE, ...opciones, timeoutMs: 10000 });
}

export function guardarProgreso(
  intentoId: string,
  token: string,
  respuestas: RespuestaEnviada[],
  eventos: EventoEnviado[],
  solicitudId?: string,
): Res<{
  guardadoEn: string;
  respuestasGuardadas: number;
  horaServidor: string;
  segundosRestantes: number | null;
  expirado: boolean;
}> {
  return escribir(
    "saveProgress",
    { intentoId, token, respuestas, eventos },
    { ...SIN_LLAVE, solicitudId },
  );
}

export function enviarIntento(
  intentoId: string,
  token: string,
  respuestas: RespuestaEnviada[],
  eventos: EventoEnviado[],
  automatico: boolean,
  solicitudId?: string,
): Res<ResultadoCandidato> {
  return escribir(
    "submitAttempt",
    { intentoId, token, respuestas, eventos, automatico },
    { ...SIN_LLAVE, solicitudId },
  );
}
