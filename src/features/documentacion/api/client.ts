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

import { SCRIPT_URL, URL_DOCUMENTACION } from "../../../config/google";

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

/**
 * Tiempos máximos y reintentos.
 *
 * ── De dónde salen estos números ────────────────────────────────────────────
 * Apps Script tiene dos regímenes muy distintos y tratarlos igual era la causa
 * de la mayoría de los «TIMEOUT» que veía el área:
 *
 *   · **en caliente**, con la instancia ya arrancada, una lectura contesta en
 *     0,4–2 s;
 *   · **en frío** —la primera llamada del día, o la primera después de un
 *     despliegue— hay que sumar el arranque del intérprete y la apertura del
 *     libro: entre 5 y 20 s, y en una red de agencia más.
 *
 * Con un tope único de 30 s y tres intentos, una llamada en frío que iba a
 * contestar en el segundo 32 se abortaba tres veces seguidas: noventa segundos
 * de espera para acabar diciendo «el backend tardó demasiado», cuando el backend
 * estaba contestando. Y lo peor: cada aborto dejaba una ejecución en curso en el
 * servidor, así que el reintento competía con su propio antecesor.
 *
 * Por eso el tope CRECE con el intento (`TIMEOUT_POR_INTENTO`): el primero es
 * corto para detectar rápido un backend caído, y los siguientes dan aire al que
 * simplemente está arrancando.
 */
const TIMEOUT_POR_INTENTO = [20000, 45000, 70000] as const;
const TIMEOUT_LARGO = 180000;
const REINTENTOS = 3;

/**
 * Espera entre intentos: exponencial con dispersión.
 *
 * La espera lineal (600 ms, 1 200 ms) tenía dos problemas. El primero es que no
 * da tiempo a que se libere un libro ocupado por una escritura ajena. El
 * segundo es más sutil y se ve con cinco pestañas abiertas en la misma agencia:
 * si todas reintentan al mismo intervalo exacto, vuelven a colisionar a la vez,
 * indefinidamente. La dispersión aleatoria rompe ese sincronismo.
 */
function esperaDeReintento(intento: number): number {
  const base = Math.min(800 * 2 ** (intento - 1), 6000);
  return base + Math.round(Math.random() * 400);
}

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

/**
 * URL de la aplicación web del backend de Documentación.
 *
 * ── Por qué no es simplemente `SCRIPT_URL` ──────────────────────────────────
 * `SCRIPT_URL` es el backend del talento (postulantes, comparador). El módulo de
 * Documentación es un proyecto de Apps Script APARTE, con su propia URL `/exec`.
 * Confundirlos es exactamente el fallo que hacía que la consola «no se conectara»:
 * hablaba con el backend equivocado, que no conoce las acciones `documentacion.*`.
 *
 * La URL propia se guarda en los ajustes locales (`bdp-documentacion`) y se lee
 * aquí al arrancar, para que el cliente apunte al backend correcto desde la
 * primera llamada —incluso antes de que la consola monte y la reconfigure—.
 *
 * El orden de preferencia es: lo que esta persona guardó en ESTE equipo, y si no
 * hay nada, `URL_DOCUMENTACION` del inventario del repositorio. Solo cuando
 * tampoco hay eso se recae en `SCRIPT_URL`, que es el backend del talento y no
 * conoce estas acciones; la consola detecta ese caso y lo dice por su nombre.
 *
 * El escalón del medio es el que hace que una migración de cuenta no obligue a
 * las cinco personas del área a pegar la URL nueva a mano en su navegador: se
 * pone una vez en `src/config/google.ts` (o en `VITE_DOCUMENTACION_URL`) y todo
 * equipo que no tenga preferencia propia la toma sola.
 */
const CLAVE_AJUSTES = "bdp-documentacion";

function urlPersistidaDoc(): string {
  if (typeof window === "undefined" || !window.localStorage) return "";
  try {
    const crudo = window.localStorage.getItem(CLAVE_AJUSTES);
    if (!crudo) return "";
    const guardado = JSON.parse(crudo) as { settings?: { scriptUrl?: string } };
    const url = (guardado?.settings?.scriptUrl ?? "").trim();
    return /^https:\/\/script\.google\.com\//.test(url) ? url : "";
  } catch {
    return "";
  }
}

let urlActiva = urlPersistidaDoc() || URL_DOCUMENTACION || SCRIPT_URL;
let actorActivo = "";
let rolActivo = "";
let contadorSecuencia = 0;

/** Peticiones en vuelo, por huella, para no enviar dos veces lo mismo. */
const enVuelo = new Map<string, Promise<unknown>>();

export function configurarCliente(opciones: { url?: string; actor?: string; rol?: string }): void {
  if (opciones.url !== undefined) urlActiva = (opciones.url || "").trim() || URL_DOCUMENTACION || SCRIPT_URL;
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
/* Salud del backend                                                   */
/* ------------------------------------------------------------------ */

/**
 * Lo que el módulo sabe sobre cómo está respondiendo el backend.
 *
 * ── Por qué medir esto ──────────────────────────────────────────────────────
 * Cuando alguien del área dice «va lentísimo», nadie puede confirmarlo ni
 * desmentirlo: no hay número. El diagnóstico se hacía a base de recargar y
 * mirar. Con estas cuatro cifras, la pestaña «Esta pantalla» puede decir «las
 * últimas diez llamadas tardaron 4,2 s de media y dos fallaron», que es una
 * frase que se puede leer por teléfono y que orienta de verdad: 4 s apunta a la
 * red o al volumen del libro, y dos fallos de diez apuntan a la implementación.
 *
 * Es una ventana móvil pequeña (las últimas veinte) porque lo que interesa es
 * cómo va AHORA, no el promedio histórico: un módulo que estuvo lento esta
 * mañana y va bien ahora no debe seguir diciendo que va lento.
 */
const VENTANA_SALUD = 20;
const muestras: { ms: number; ok: boolean }[] = [];
let fallosSeguidos = 0;

function registrarLatencia(ms: number, ok: boolean): void {
  muestras.push({ ms, ok });
  if (muestras.length > VENTANA_SALUD) muestras.shift();
  fallosSeguidos = ok ? 0 : fallosSeguidos + 1;
}

export interface SaludBackend {
  /** Llamadas medidas en la ventana. */
  muestras: number;
  /** Milisegundos de la última llamada, o `null` si no hay ninguna. */
  ultimaMs: number | null;
  /** Media de las llamadas que SÍ contestaron. */
  mediaMs: number | null;
  /** La peor de la ventana, que es la que la gente recuerda. */
  peorMs: number | null;
  /** Llamadas que no llegaron a contestar. */
  fallos: number;
  /** Fallos consecutivos hasta ahora. Tres seguidos ya no es mala suerte. */
  fallosSeguidos: number;
}

export function saludBackend(): SaludBackend {
  const respondidas = muestras.filter((m) => m.ok);
  return {
    muestras: muestras.length,
    ultimaMs: muestras.length ? muestras[muestras.length - 1].ms : null,
    mediaMs: respondidas.length ? Math.round(respondidas.reduce((s, m) => s + m.ms, 0) / respondidas.length) : null,
    peorMs: muestras.length ? Math.max(...muestras.map((m) => m.ms)) : null,
    fallos: muestras.filter((m) => !m.ok).length,
    fallosSeguidos,
  };
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
  const larga = ACCIONES_LARGAS.has(accion);
  const maxIntentos = opciones.reintentos ?? REINTENTOS;
  /** Tope de ESTE intento. Crece con el número de intento; ver la constante. */
  const topeDe = (intento: number): number => {
    if (opciones.timeoutMs) return opciones.timeoutMs;
    if (larga) return TIMEOUT_LARGO;
    return TIMEOUT_POR_INTENTO[Math.min(intento, TIMEOUT_POR_INTENTO.length) - 1];
  };

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
    const arranque = Date.now();
    /**
     * ¿Ya se contabilizó esta llamada en la salud del backend?
     *
     * Hace falta porque el camino del rechazo pasa dos veces por el mismo
     * punto: se registra como «contestó» antes de lanzar el `DocError`, y ese
     * error vuelve a aparecer en el `catch` de abajo. Sin la marca, cada error
     * de validación entraba dos veces en la ventana de veinte muestras y la
     * media dejaba de describir nada.
     */
    let medido = false;
    const medir = (ok: boolean) => {
      if (medido) return;
      medido = true;
      registrarLatencia(Date.now() - arranque, ok);
    };
    try {
      for (let intento = 1; intento <= maxIntentos; intento++) {
        try {
          const sobre = await unaVez<T>(accion, cuerpo, topeDe(intento), opciones.signal);
          if (sobre.ok) {
            medir(true);
            return (sobre.data ?? sobre.datos ?? null) as T;
          }

          const error = sobre.error ?? {};
          const codigo = error.code ?? error.codigo ?? "ERROR";
          const recuperable = codigo === "LIBRO_OCUPADO" || codigo === "BUSY" || codigo === "TIMEOUT";
          if (recuperable && intento < maxIntentos) {
            await esperar(esperaDeReintento(intento));
            continue;
          }
          /* Un rechazo del backend no es un fallo de conexión: el backend
             contestó. Se cuenta como respuesta sana para que un formulario mal
             llenado no ponga el módulo en «sin conexión». */
          medir(true);
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
            if (!recuperable) {
              /* `RESPUESTA_INVALIDA` y `AUTENTICACION` llegan por aquí: el
                 servidor contestó algo que no es una respuesta —la pantalla de
                 inicio de sesión de Google, casi siempre— y eso sí cuenta como
                 llamada fallida. Un rechazo de validación ya se midió arriba y
                 la marca evita contarlo dos veces. */
              medir(false);
              throw e;
            }
          }
          // Una cancelación EXTERNA no es un fallo del backend: alguien navegó a
          // otra pantalla. No se reintenta y no cuenta contra la salud.
          if (opciones.signal?.aborted) throw e;
          if (intento < maxIntentos) {
            await esperar(esperaDeReintento(intento));
            continue;
          }
        }
      }

      medir(false);
      const abortado = ultimoFallo instanceof Error && ultimoFallo.name === "AbortError";
      /**
       * El error original viaja en el detalle.
       *
       * Antes se descartaba, y «No se pudo contactar con el backend» era todo lo
       * que llegaba a la pantalla: un fallo de CORS, un DNS caído y una
       * implementación sin publicar producían el mismo mensaje. El texto
       * original de `fetch` es lo único que distingue los tres, y sin él el
       * diagnóstico de la pestaña «Esta pantalla» no puede ayudar a nadie.
       */
      const causa = ultimoFallo instanceof Error ? `${ultimoFallo.name}: ${ultimoFallo.message}` : String(ultimoFallo ?? "");
      throw new DocError(
        abortado
          ? `El backend no respondió en ${Math.round(topeDe(maxIntentos) / 1000)} s (${maxIntentos} intentos).`
          : "No se pudo contactar con el backend.",
        {
          codigo: abortado ? "TIMEOUT" : "SIN_RED",
          pista: abortado
            ? "La operación puede haberse completado en el libro: vuelve a consultar antes de repetirla. Si se repite, prueba Configuración › Esta pantalla › Probar conexión."
            : "Revisa la conexión. Si la red está bien, puede ser que la implementación de Apps Script no esté publicada para «cualquier usuario».",
          red: true,
          requestId,
          detalle: { causa, intentos: maxIntentos, ms: Date.now() - arranque, accion },
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
  urlActiva = URL_DOCUMENTACION || SCRIPT_URL;
  actorActivo = "";
  rolActivo = "";
  muestras.length = 0;
  fallosSeguidos = 0;
}
