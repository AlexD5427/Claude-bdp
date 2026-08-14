/**
 * Cliente central del backend de Documentación.
 *
 * ── Por qué UN cliente ──────────────────────────────────────────────────────
 * En la versión anterior cada panel llamaba a `google.script.run` (o a `fetch`)
 * por su cuenta. Consecuencia: cada uno inventaba su propio manejo de errores, su
 * propio indicador de carga y su propio criterio de reintento, y ninguno se
 * protegía del doble envío ni de las respuestas que llegan tarde.
 *
 * Aquí eso está resuelto una vez:
 *
 *   · **identificador de solicitud** en toda escritura, para que reintentar sea
 *     seguro (el backend reconoce la repetición y devuelve el resultado original);
 *   · **prevención de doble envío**: dos llamadas idénticas simultáneas comparten
 *     la misma promesa en lugar de producir dos escrituras;
 *   · **detección de respuestas obsoletas**: cada consulta lleva un número de
 *     secuencia; si llega la de una petición anterior, se descarta. Sin esto, una
 *     búsqueda lenta sobrescribe el resultado de la rápida que se escribió después;
 *   · **tiempo máximo visible**: Apps Script puede tardar minutos; una interfaz que
 *     espera indefinidamente parece rota;
 *   · **reintento solo de lo seguro**: fallo de red o libro ocupado. Un error de
 *     validación no se reintenta, porque volver a enviar lo mismo dará lo mismo;
 *   · **errores normalizados**: siempre `codigo`, `mensaje`, `pista` y `campos`,
 *     que es lo que un formulario necesita para marcar el campo que falla.
 *
 * ── Transporte ──────────────────────────────────────────────────────────────
 * `POST` con el cuerpo como `text/plain` y `redirect: "follow"`. No es descuido:
 * con `application/json` el navegador manda un `OPTIONS` previo que Apps Script no
 * responde y la llamada muere por CORS; y Apps Script contesta con un 302 hacia
 * googleusercontent, así que la redirección hay que seguirla.
 */

import { SCRIPT_URL } from "../../../constants";

/* ------------------------------------------------------------------ */
/* Tipos del sobre                                                     */
/* ------------------------------------------------------------------ */

export interface DocMeta {
  requestId?: string;
  timestamp?: string;
  version?: string;
  esquemaNormalizado?: number;
  traza?: string;
  milisegundos?: number;
  backend?: string;
  instalado?: boolean;
  contadores?: Record<string, number>;
}

export interface DocErrorPayload {
  code?: string;
  codigo?: string;
  message?: string;
  mensaje?: string;
  hint?: string;
  pista?: string;
  fields?: Record<string, string>;
  detalle?: Record<string, unknown>;
}

export interface DocSobre<T = unknown> {
  ok: boolean;
  accion: string;
  solicitudId?: string;
  data?: T;
  datos?: T;
  error?: DocErrorPayload | null;
  avisos?: string[];
  meta?: DocMeta;
}

/** Error normalizado. Es lo único que ven los componentes. */
export class DocError extends Error {
  readonly codigo: string;
  readonly pista: string;
  readonly campos: Record<string, string>;
  readonly detalle: Record<string, unknown>;
  readonly red: boolean;
  readonly requestId: string;

  constructor(
    mensaje: string,
    opciones: {
      codigo?: string;
      pista?: string;
      campos?: Record<string, string>;
      detalle?: Record<string, unknown>;
      red?: boolean;
      requestId?: string;
    } = {},
  ) {
    super(mensaje);
    this.name = "DocError";
    this.codigo = opciones.codigo ?? "ERROR";
    this.pista = opciones.pista ?? "";
    this.campos = opciones.campos ?? {};
    this.detalle = opciones.detalle ?? {};
    this.red = opciones.red === true;
    this.requestId = opciones.requestId ?? "";
  }
}

/* ------------------------------------------------------------------ */
/* Configuración                                                       */
/* ------------------------------------------------------------------ */

const TIMEOUT_POR_DEFECTO = 30000;
const TIMEOUT_LARGO = 180000;
const REINTENTOS = 3;

/** Acciones que escriben: llevan identificador y no se ejecutan dos veces. */
const ESCRITURAS = new Set([
  "documentacion.instalar",
  "documentacion.migrar",
  "documentacion.respaldo",
  "documentacion.reparar",
  "documentacion.proceso.diario",
  "documentacion.catalogo.guardar",
  "documentacion.auxiliares.agregar",
  "documentacion.expediente.crear",
  "documentacion.expediente.actualizar",
  "documentacion.expediente.estado",
  "documentacion.expediente.sincronizar",
  "documentacion.expediente.recalcular",
  "documentacion.expediente.archivar",
  "documentacion.expediente.restaurar",
  "documentacion.expediente.conservacion",
  "documentacion.requisito.actualizar",
  "documentacion.requisitos.guardar",
  "documentacion.prorroga.crear",
  "documentacion.prorroga.actualizar",
  "documentacion.prorroga.estado",
  "documentacion.solicitud.crear",
  "documentacion.solicitud.estado",
  "documentacion.solicitud.seguimiento",
  "documentacion.solicitudes.masiva",
  "documentacion.revision.decidir",
  "documentacion.aprobacion.solicitar",
  "documentacion.aprobacion.resolver",
  "documentacion.comentario.crear",
  "documentacion.comentario.editar",
  "documentacion.comentario.resolver",
  "documentacion.tarea.crear",
  "documentacion.tarea.actualizar",
  "documentacion.tarea.estado",
  "documentacion.notificacion.leer",
  "documentacion.notificaciones.leerTodas",
  "documentacion.exportacion.iniciar",
  "documentacion.exportacion.lote",
  "documentacion.exportacion.cancelar",
  "documentacion.filtro.guardar",
  "documentacion.filtro.eliminar",
  "documentacion.consentimiento.presentar",
  "documentacion.consentimiento.responder",
  "documentacion.retencion.aplicar",
  "documentacion.retencion.anonimizar",
  "documentacion.permisos.guardar",
  "documentacion.configuracion.guardar",
]);

/** Acciones lentas por naturaleza: instalar, migrar, exportar, reparar. */
const ACCIONES_LARGAS = new Set([
  "documentacion.instalar",
  "documentacion.migrar",
  "documentacion.respaldo",
  "documentacion.reparar",
  "documentacion.exportacion.lote",
  "documentacion.solicitudes.masiva",
  "documentacion.retencion.aplicar",
  "documentacion.proceso.diario",
]);

export function esEscritura(accion: string): boolean {
  return ESCRITURAS.has(accion);
}

/** Acciones declaradas por el cliente. La usa el verificador de coherencia. */
export function accionesDeclaradas(): string[] {
  return [...ESCRITURAS].sort();
}

/* ------------------------------------------------------------------ */
/* Estado del cliente                                                  */
/* ------------------------------------------------------------------ */

let urlActiva = SCRIPT_URL;
let actorActivo = "";
let rolActivo = "";
let contadorSecuencia = 0;

/** Peticiones en vuelo, por huella, para no enviar dos veces lo mismo. */
const enVuelo = new Map<string, Promise<unknown>>();

export function configurarCliente(opciones: { url?: string; actor?: string; rol?: string }): void {
  if (opciones.url !== undefined) urlActiva = (opciones.url || "").trim() || SCRIPT_URL;
  if (opciones.actor !== undefined) actorActivo = opciones.actor;
  if (opciones.rol !== undefined) rolActivo = opciones.rol;
}

export function urlCliente(): string {
  return urlActiva;
}

export function hayBackendConfigurado(): boolean {
  return /^https:\/\/script\.google\.com\//.test(urlActiva);
}

export function nuevoRequestId(): string {
  const azar = Math.random().toString(36).slice(2, 10);
  return `req_${Date.now().toString(36)}_${azar}`;
}

/** Número de secuencia creciente para descartar respuestas obsoletas. */
export function siguienteSecuencia(): number {
  contadorSecuencia += 1;
  return contadorSecuencia;
}

export function secuenciaActual(): number {
  return contadorSecuencia;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------ */
/* Llamada                                                             */
/* ------------------------------------------------------------------ */

export interface OpcionesLlamada {
  requestId?: string;
  timeoutMs?: number;
  reintentos?: number;
  signal?: AbortSignal;
  /** Desactiva la unión de peticiones idénticas (para pruebas y para lotes). */
  sinUnir?: boolean;
  onCarga?: (cargando: boolean) => void;
}

/** Una petición, sin reintentos. */
async function unaVez<T>(
  accion: string,
  cuerpo: Record<string, unknown>,
  timeoutMs: number,
  signalExterno?: AbortSignal,
): Promise<DocSobre<T>> {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);
  const cancelar = () => controlador.abort();
  if (signalExterno) {
    if (signalExterno.aborted) controlador.abort();
    else signalExterno.addEventListener("abort", cancelar);
  }

  try {
    const respuesta = await fetch(urlActiva, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ accion, ...cuerpo }),
      signal: controlador.signal,
    });

    const texto = await respuesta.text();
    let sobre: DocSobre<T> | null = null;
    try {
      sobre = JSON.parse(texto) as DocSobre<T>;
    } catch {
      sobre = null;
    }

    if (!sobre) {
      // Casi siempre es la pantalla de inicio de sesión de Google: la
      // implementación no está publicada para «cualquier usuario».
      const pareceLogin = /accounts\.google\.com|iniciar sesión|sign in/i.test(texto);
      throw new DocError(
        pareceLogin ? "El backend pide iniciar sesión en Google." : "El backend respondió algo que no es JSON.",
        {
          codigo: pareceLogin ? "AUTENTICACION" : "RESPUESTA_INVALIDA",
          pista: pareceLogin
            ? 'Vuelve a implementar la aplicación web con acceso "Cualquier usuario".'
            : "Comprueba que la URL termine en /exec y que la implementación esté publicada.",
          detalle: { respuesta: texto.slice(0, 400) },
        },
      );
    }
    return sobre;
  } finally {
    clearTimeout(temporizador);
    if (signalExterno) signalExterno.removeEventListener("abort", cancelar);
  }
}

/**
 * Llamada al backend con todo el comportamiento del cliente.
 *
 * Devuelve `data` directamente: los componentes no manipulan el sobre. Los
 * errores llegan como `DocError`, siempre con código, pista y campos.
 */
export async function llamar<T = unknown>(
  accion: string,
  params: Record<string, unknown> = {},
  opciones: OpcionesLlamada = {},
): Promise<T> {
  if (!hayBackendConfigurado()) {
    throw new DocError("No hay un backend configurado para Documentación.", {
      codigo: "SIN_BACKEND",
      pista: "Pega la URL de la aplicación web en Configuración › Conexión.",
    });
  }

  const escritura = esEscritura(accion);
  const requestId = opciones.requestId ?? nuevoRequestId();
  const timeoutMs = opciones.timeoutMs ?? (ACCIONES_LARGAS.has(accion) ? TIMEOUT_LARGO : TIMEOUT_POR_DEFECTO);
  const maxIntentos = opciones.reintentos ?? REINTENTOS;

  const cuerpo: Record<string, unknown> = {
    ...params,
    solicitudId: requestId,
    origen: "modulo-documentacion",
  };
  if (actorActivo) cuerpo.actor = actorActivo;
  if (rolActivo) cuerpo.rol = rolActivo;

  // Unión de peticiones idénticas: dos componentes que piden el panel a la vez
  // comparten una sola llamada. Las escrituras no se unen nunca —dos guardados
  // seguidos son dos intenciones distintas—, salvo que se repita el requestId.
  const huella = escritura ? `${accion}|${requestId}` : `${accion}|${JSON.stringify(params)}`;
  if (!opciones.sinUnir) {
    const previa = enVuelo.get(huella);
    if (previa) return previa as Promise<T>;
  }

  const ejecutar = async (): Promise<T> => {
    opciones.onCarga?.(true);
    let ultimoFallo: unknown = null;
    try {
      for (let intento = 1; intento <= maxIntentos; intento++) {
        try {
          const sobre = await unaVez<T>(accion, cuerpo, timeoutMs, opciones.signal);
          if (sobre.ok) return (sobre.data ?? sobre.datos ?? null) as T;

          const error = sobre.error ?? {};
          const codigo = error.code ?? error.codigo ?? "ERROR";
          const recuperable = codigo === "LIBRO_OCUPADO" || codigo === "BUSY" || codigo === "TIMEOUT";
          if (recuperable && intento < maxIntentos) {
            await esperar(600 * intento);
            continue;
          }
          throw new DocError(error.message ?? error.mensaje ?? "El backend rechazó la operación.", {
            codigo,
            pista: error.hint ?? error.pista ?? "",
            campos: error.fields ?? {},
            detalle: error.detalle ?? {},
            requestId: sobre.meta?.requestId ?? requestId,
          });
        } catch (e) {
          ultimoFallo = e;
          if (e instanceof DocError && !e.red) {
            const recuperable = e.codigo === "LIBRO_OCUPADO" || e.codigo === "TIMEOUT";
            if (!recuperable) throw e;
          }
          if (intento < maxIntentos) {
            await esperar(600 * intento);
            continue;
          }
        }
      }

      const abortado = ultimoFallo instanceof Error && ultimoFallo.name === "AbortError";
      throw new DocError(
        abortado ? "El backend tardó demasiado en responder." : "No se pudo contactar con el backend.",
        {
          codigo: abortado ? "TIMEOUT" : "SIN_RED",
          pista: abortado
            ? "La operación puede haberse completado en el libro. Vuelve a consultar antes de repetirla."
            : "Revisa la conexión y vuelve a intentarlo.",
          red: true,
          requestId,
        },
      );
    } finally {
      opciones.onCarga?.(false);
      enVuelo.delete(huella);
    }
  };

  const promesa = ejecutar();
  if (!opciones.sinUnir) enVuelo.set(huella, promesa as Promise<unknown>);
  return promesa;
}

/**
 * Consulta con control de obsolescencia.
 *
 * Devuelve `null` cuando la respuesta llegó tarde: entre que se pidió y que
 * contestó, alguien pidió otra cosa. Escribir ese resultado en la pantalla
 * mostraría el listado de la búsqueda anterior, que es el error clásico de un
 * buscador con debounce.
 */
export async function consultarVigente<T>(
  accion: string,
  params: Record<string, unknown>,
  secuencia: number,
  opciones: OpcionesLlamada = {},
): Promise<T | null> {
  const datos = await llamar<T>(accion, params, opciones);
  if (secuencia < contadorSecuencia) return null;
  return datos;
}

/** Mensaje para la persona, a partir de cualquier cosa que se haya lanzado. */
export function mensajeDeError(error: unknown): { mensaje: string; pista: string; codigo: string } {
  if (error instanceof DocError) {
    return { mensaje: error.message, pista: error.pista, codigo: error.codigo };
  }
  if (error instanceof Error) return { mensaje: error.message, pista: "", codigo: "ERROR" };
  return { mensaje: String(error), pista: "", codigo: "ERROR" };
}

/** Limpia el estado interno. Solo lo usan las pruebas. */
export function __reiniciarClienteParaPruebas(): void {
  enVuelo.clear();
  contadorSecuencia = 0;
  urlActiva = SCRIPT_URL;
  actorActivo = "";
  rolActivo = "";
}
