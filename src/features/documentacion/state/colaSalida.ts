/**
 * Cola de salida: escrituras que sobreviven a un recargado y no mienten.
 *
 * ── El problema ─────────────────────────────────────────────────────────────
 * Marcar un requisito es un `POST` a Apps Script. Tarda entre medio segundo y
 * cuatro, y a veces falla: el libro está ocupado por otra persona, la red del
 * banco se cae un minuto, alguien cierra el portátil. Sin cola, cada uno de esos
 * casos es un cambio perdido, y lo peor es que la interfaz ya lo había pintado en
 * verde. La persona ve «entregado», cierra, y al día siguiente sigue pendiente.
 *
 * ── Cómo se resuelve ────────────────────────────────────────────────────────
 * Cada escritura entra en una cola PERSISTENTE con su `solicitudId`. La interfaz
 * la pinta al instante (actualización optimista) pero la marca como **pendiente
 * de sincronizar**, no como guardada. Solo cuando el backend confirma se convierte
 * en guardada. Si el navegador se recarga con cosas en la cola, al volver siguen
 * ahí y se reintentan solas.
 *
 * ── Las cuatro propiedades que la hacen segura ──────────────────────────────
 *
 * 1. **Idempotencia.** El `solicitudId` viaja con la petición y el enrutador del
 *    backend descarta una repetida. Reintentar es gratis; sin eso, un reintento
 *    tras un tiempo agotado que en realidad SÍ llegó duplicaría el cambio.
 *
 * 2. **Coalescencia.** Marcar un requisito tres veces seguidas (pendiente →
 *    entregado → observado) no son tres escrituras: es una, la última. Se fusiona
 *    por `expedienteDocumentoId`, así que teclear una observación letra a letra no
 *    genera cuarenta peticiones.
 *
 * 3. **Orden por expediente.** Las operaciones de un mismo expediente se envían en
 *    serie. En paralelo, dos escrituras sobre el mismo expediente pelean por el
 *    `version_registro` y una de las dos se rechaza por conflicto sin necesidad.
 *
 * 4. **El guardado no miente.** Un elemento solo sale de la cola con una respuesta
 *    afirmativa del backend. Los errores de datos (una fecha imposible, un permiso
 *    que falta) no se reintentan —reintentarlos mil veces no los va a arreglar— y
 *    se muestran; los de red sí, con espera creciente.
 */

/* ------------------------------------------------------------------ */
/* Tipos                                                              */
/* ------------------------------------------------------------------ */

/** Estado de un elemento de la cola, tal como se le cuenta a la persona. */
export type EstadoEnvio = "pendiente" | "enviando" | "fallido";

export interface OperacionSalida {
  id: string;
  /** Acción del backend, por ejemplo `documentacion.requisito.actualizar`. */
  accion: string;
  parametros: Record<string, unknown>;
  /** Clave de idempotencia. La misma en todos los reintentos, por definición. */
  solicitudId: string;
  /**
   * Agrupador de serialización y de fusión.
   *
   * Dos operaciones con la misma clave se FUSIONAN (gana la última). Dos con
   * distinta clave pero mismo `expedienteId` se envían en serie.
   */
  clave: string;
  expedienteId: string;
  /** Texto llano de lo que hace, para la vista de «cambios pendientes». */
  descripcion: string;
  intentos: number;
  creadoEn: number;
  proximoIntentoEn: number;
  estado: EstadoEnvio;
  ultimoError?: string;
}

/** Cómo se envía una operación. Se inyecta para poder probar sin red. */
export type Enviar = (operacion: OperacionSalida) => Promise<void>;

export interface EstadoCola {
  operaciones: OperacionSalida[];
  pendientes: number;
  fallidas: number;
  enviando: boolean;
}

/* ------------------------------------------------------------------ */
/* Configuración                                                      */
/* ------------------------------------------------------------------ */

const CLAVE = "bdp-documentacion-outbox";
const VERSION = 1;

/** Tope de reintentos automáticos. A partir de aquí decide una persona. */
const MAX_INTENTOS = 5;

/** Espera creciente: 1 s, 2 s, 4 s, 8 s, 16 s. Con tope, para no dormir un minuto. */
function esperaDe(intentos: number): number {
  return Math.min(1000 * 2 ** Math.max(0, intentos - 1), 16000);
}

/**
 * Códigos de error que NO se reintentan.
 *
 * Un permiso insuficiente, una validación fallida o un conflicto de versión no se
 * arreglan repitiendo la misma petición: hace falta que alguien cambie algo. Se
 * dejan en `fallido` con su mensaje, visibles, y se sacan de la rueda de
 * reintentos para no gastar red ni cuota de Apps Script.
 */
const NO_REINTENTABLES = new Set([
  "VALIDATION_ERROR",
  "PERMISO_INSUFICIENTE",
  "PERMISSION_DENIED",
  "CONFLICTO_VERSION",
  "TRANSICION_INVALIDA",
  "REQUISITO_NO_APLICABLE",
  "NOT_FOUND",
  "LIMITE_EXCEDIDO",
]);

/* ------------------------------------------------------------------ */
/* Estado                                                             */
/* ------------------------------------------------------------------ */

let operaciones: OperacionSalida[] = leerDelDisco();
let enviar: Enviar | null = null;
let bombeando = false;
let temporizador: number | null = null;
const escuchas = new Set<(estado: EstadoCola) => void>();

function leerDelDisco(): OperacionSalida[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    if (!crudo) return [];
    const guardado = JSON.parse(crudo) as { version?: number; operaciones?: OperacionSalida[] };
    if (guardado?.version !== VERSION || !Array.isArray(guardado.operaciones)) return [];
    // Lo que quedó «enviando» al recargar no se sabe si llegó. Vuelve a
    // `pendiente` y se reintenta: el `solicitudId` hace que repetirlo sea inocuo,
    // y darlo por bueno sin confirmación sería exactamente mentir.
    return guardado.operaciones
      .filter((o) => o && typeof o.accion === "string" && typeof o.solicitudId === "string")
      .map((o) => (o.estado === "enviando" ? { ...o, estado: "pendiente" as EstadoEnvio, proximoIntentoEn: 0 } : o));
  } catch {
    return [];
  }
}

function escribirEnDisco(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify({ version: VERSION, operaciones }));
  } catch {
    /* cuota llena: la cola sigue viva en memoria durante esta sesión */
  }
}

function estadoActual(): EstadoCola {
  return {
    operaciones: [...operaciones],
    pendientes: operaciones.filter((o) => o.estado !== "fallido").length,
    fallidas: operaciones.filter((o) => o.estado === "fallido").length,
    enviando: operaciones.some((o) => o.estado === "enviando"),
  };
}

function avisar(): void {
  escribirEnDisco();
  const estado = estadoActual();
  for (const escucha of escuchas) escucha(estado);
}

/** Se suscribe a los cambios de la cola. Devuelve la función para desuscribirse. */
export function observarCola(escucha: (estado: EstadoCola) => void): () => void {
  escuchas.add(escucha);
  escucha(estadoActual());
  return () => escuchas.delete(escucha);
}

export function obtenerCola(): EstadoCola {
  return estadoActual();
}

/** Declara cómo se envían las operaciones. Sin esto, la cola solo acumula. */
export function configurarEnvio(fn: Enviar | null): void {
  enviar = fn;
  if (fn) programarBombeo(0);
}

/* ------------------------------------------------------------------ */
/* Encolado                                                           */
/* ------------------------------------------------------------------ */

function idNuevo(prefijo: string): string {
  return `${prefijo}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Encola una escritura, fusionándola con la que ya hubiera de la misma clave.
 *
 * ── El detalle del `solicitudId` al fusionar ────────────────────────────────
 * Cuando dos cambios se fusionan se genera un `solicitudId` NUEVO. Es
 * contraintuitivo —parece que conviene conservarlo— pero es necesario: si el
 * primero ya salió y volvió a la cola por un tiempo agotado, reutilizar su
 * `solicitudId` haría que el backend lo tratara como repetido y devolviera la
 * respuesta del primer envío, descartando el cambio fusionado en silencio.
 */
export function encolar(entrada: {
  accion: string;
  parametros: Record<string, unknown>;
  clave: string;
  expedienteId: string;
  descripcion: string;
}): OperacionSalida {
  const solicitudId = idNuevo("out");
  const operacion: OperacionSalida = {
    id: idNuevo("op"),
    accion: entrada.accion,
    parametros: entrada.parametros,
    solicitudId,
    clave: entrada.clave,
    expedienteId: entrada.expedienteId,
    descripcion: entrada.descripcion,
    intentos: 0,
    creadoEn: Date.now(),
    proximoIntentoEn: 0,
    estado: "pendiente",
  };

  const existente = operaciones.findIndex((o) => o.clave === entrada.clave && o.estado !== "enviando");
  if (existente >= 0) {
    // Se conserva `creadoEn` del primero: es cuando la persona empezó a esperar.
    operacion.creadoEn = operaciones[existente].creadoEn;
    operaciones[existente] = operacion;
  } else {
    operaciones.push(operacion);
  }

  avisar();
  programarBombeo(0);
  return operacion;
}

/** Reintenta ahora todo lo que quedó fallido. Lo llama el botón «reintentar». */
export function reintentarTodo(): void {
  operaciones = operaciones.map((o) =>
    o.estado === "fallido" ? { ...o, estado: "pendiente" as EstadoEnvio, intentos: 0, proximoIntentoEn: 0 } : o,
  );
  avisar();
  programarBombeo(0);
}

/**
 * Descarta una operación fallida.
 *
 * Solo las fallidas: descartar algo que puede estar en vuelo dejaría el cambio
 * aplicado en el backend y desaparecido de la interfaz.
 */
export function descartar(id: string): void {
  operaciones = operaciones.filter((o) => !(o.id === id && o.estado === "fallido"));
  avisar();
}

/** Vacía la cola. Se llama al cerrar sesión, junto con la caché. */
export function vaciarCola(): void {
  operaciones = [];
  if (temporizador !== null && typeof window !== "undefined") window.clearTimeout(temporizador);
  temporizador = null;
  avisar();
}

/* ------------------------------------------------------------------ */
/* Bombeo                                                            */
/* ------------------------------------------------------------------ */

function programarBombeo(retraso: number): void {
  if (typeof window === "undefined" || !enviar) return;
  if (temporizador !== null) window.clearTimeout(temporizador);
  temporizador = window.setTimeout(() => {
    temporizador = null;
    void bombear();
  }, retraso);
}

/**
 * Envía lo que toca, respetando el orden por expediente.
 *
 * `bombeando` evita reentrada: sin ese cerrojo, encolar tres cambios seguidos
 * lanzaría tres bombeos concurrentes y los tres cogerían la misma operación.
 */
async function bombear(): Promise<void> {
  if (bombeando || !enviar) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    // Sin conexión no se gasta un intento: se espera al evento `online`.
    return;
  }

  bombeando = true;
  try {
    const ahora = Date.now();
    const ocupados = new Set(operaciones.filter((o) => o.estado === "enviando").map((o) => o.expedienteId));
    const siguiente = operaciones.find(
      (o) => o.estado === "pendiente" && o.proximoIntentoEn <= ahora && !ocupados.has(o.expedienteId),
    );
    if (!siguiente) {
      programarSiguienteEspera();
      return;
    }

    siguiente.estado = "enviando";
    siguiente.intentos += 1;
    avisar();

    try {
      await enviar(siguiente);
      operaciones = operaciones.filter((o) => o.id !== siguiente.id);
      avisar();
    } catch (error) {
      const fallo = error as { codigo?: string; code?: string; message?: string };
      const codigo = fallo.codigo ?? fallo.code ?? "";
      const definitivo = NO_REINTENTABLES.has(codigo) || siguiente.intentos >= MAX_INTENTOS;
      siguiente.estado = definitivo ? "fallido" : "pendiente";
      siguiente.ultimoError = fallo.message ?? "No se pudo guardar.";
      siguiente.proximoIntentoEn = definitivo ? 0 : Date.now() + esperaDe(siguiente.intentos);
      avisar();
    }
  } finally {
    bombeando = false;
    if (operaciones.some((o) => o.estado === "pendiente")) programarSiguienteEspera();
  }
}

/** Programa el próximo bombeo para cuando venza la espera más cercana. */
function programarSiguienteEspera(): void {
  const pendientes = operaciones.filter((o) => o.estado === "pendiente");
  if (!pendientes.length) return;
  const ahora = Date.now();
  const proximo = Math.min(...pendientes.map((o) => Math.max(0, o.proximoIntentoEn - ahora)));
  programarBombeo(proximo);
}

/* Al volver la conexión se reintenta de inmediato, sin esperar la espera
   creciente: la espera existía porque la red estaba mal, y ya no lo está. */
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    operaciones = operaciones.map((o) => (o.estado === "pendiente" ? { ...o, proximoIntentoEn: 0 } : o));
    avisar();
    programarBombeo(0);
  });
}
