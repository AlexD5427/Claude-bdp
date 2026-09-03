/**
 * Precarga en segundo plano de los expedientes de la lista.
 *
 * ── Qué problema resuelve ───────────────────────────────────────────────────
 * Abrir un expediente costaba un viaje de red a Apps Script: entre uno y tres
 * segundos con la pantalla mostrando un esqueleto. En una sesión de revisión se
 * abren treinta expedientes seguidos, así que eso son entre treinta y noventa
 * segundos de espera pura repartidos en clics.
 *
 * La lista ya sabe cuáles se van a abrir: los que están en pantalla. Se traen
 * antes de que nadie los pida, en tiempo ocioso, y abrirlos pasa a ser
 * instantáneo.
 *
 * ── Las cuatro reglas que hacen que esto no estorbe ─────────────────────────
 * 1. **Nunca compite con lo que la persona pide ahora.** La cola espera a que el
 *    navegador esté ocioso (`requestIdleCallback`, o un `setTimeout` generoso
 *    donde no existe) y se pausa mientras hay una petición en primer plano.
 * 2. **Concurrencia limitada a dos.** Apps Script serializa por libro: lanzar
 *    diez peticiones a la vez no las hace más rápidas, las pone en fila y
 *    retrasa la que sí importa.
 * 3. **En lotes.** Se piden hasta el tope del backend en UNA llamada
 *    (`documentacion.expedientes.detalle`), no una por expediente.
 * 4. **Cancelable.** Al cambiar de página o de sección se descarta lo pendiente:
 *    precargar lo que ya nadie va a mirar es gastar cuota por nada.
 */

import { docApi } from "../api/acciones";
import { estaEnCache, guardarEnCache } from "./cacheExpedientes";

/** Cuántas llamadas en vuelo como máximo. Ver regla 2. */
const CONCURRENCIA = 2;

/** Cuántos expedientes por llamada. El backend tiene su propio tope y manda. */
const POR_LOTE = 8;

interface Tarea {
  ids: string[];
  cancelada: boolean;
}

let cola: Tarea[] = [];
let enVuelo = 0;
let pausada = false;
let programada = false;

/** Ids que ya se pidieron en esta sesión, para no volver a pedirlos en vano. */
const intentados = new Set<string>();

type Ventana = Window & {
  requestIdleCallback?: (cb: (plazo: { timeRemaining: () => number }) => void, opciones?: { timeout: number }) => number;
};

/** Programa el trabajo para cuando el navegador no tenga nada mejor que hacer. */
function cuandoHayaHueco(fn: () => void): void {
  if (typeof window === "undefined") return;
  const ventana = window as Ventana;
  if (typeof ventana.requestIdleCallback === "function") {
    ventana.requestIdleCallback(() => fn(), { timeout: 2500 });
    return;
  }
  // Sin `requestIdleCallback` (Safari), un retardo generoso: lo importante no es
  // la precisión, es no arrancar en el mismo fotograma que la interacción.
  window.setTimeout(fn, 400);
}

/**
 * Pausa la precarga mientras hay una petición en primer plano.
 *
 * Lo llama el cliente al empezar y terminar una lectura que la persona espera.
 * Es la diferencia entre una precarga que ayuda y una que hace que abrir un
 * expediente sea MÁS lento que antes.
 */
export function pausarPrecarga(): void {
  pausada = true;
}

export function reanudarPrecarga(): void {
  pausada = false;
  bombear();
}

/** Descarta todo lo pendiente. Se llama al navegar. */
export function cancelarPrecarga(): void {
  for (const tarea of cola) tarea.cancelada = true;
  cola = [];
}

/**
 * Encola los expedientes de la lista visible (y de la página siguiente).
 *
 * Se filtran los que ya están en caché y los ya intentados: la lista se vuelve a
 * pintar a cada filtro y sin este filtro se pediría lo mismo una y otra vez.
 */
export function precargar(expedienteIds: string[]): void {
  const pendientes = expedienteIds.filter((id) => id && !estaEnCache(id) && !intentados.has(id));
  if (!pendientes.length) return;
  for (const id of pendientes) intentados.add(id);

  for (let i = 0; i < pendientes.length; i += POR_LOTE) {
    cola.push({ ids: pendientes.slice(i, i + POR_LOTE), cancelada: false });
  }
  if (!programada) {
    programada = true;
    cuandoHayaHueco(() => {
      programada = false;
      bombear();
    });
  }
}

function bombear(): void {
  if (pausada) return;
  while (enVuelo < CONCURRENCIA && cola.length) {
    const tarea = cola.shift();
    if (!tarea || tarea.cancelada) continue;
    enVuelo += 1;
    void ejecutar(tarea).finally(() => {
      enVuelo -= 1;
      // Cada lote que termina deja hueco para el siguiente, otra vez en ocioso.
      if (cola.length) cuandoHayaHueco(bombear);
    });
  }
}

async function ejecutar(tarea: Tarea): Promise<void> {
  try {
    const res = await docApi.detalleMultiple(tarea.ids, { reintentos: 1, timeoutMs: 25000 });
    if (tarea.cancelada) return;
    for (const detalle of Object.values(res.expedientes ?? {})) {
      if (detalle?.expediente?.expedienteId) guardarEnCache(detalle);
    }
    // Lo que el backend omitió por su tope vuelve a la cola: no se pierde, pero
    // tampoco se insiste con los que fallaron.
    if (res.omitidos?.length) cola.push({ ids: res.omitidos.slice(0, POR_LOTE), cancelada: false });
  } catch {
    /**
     * Un fallo de precarga NO se reporta.
     *
     * Nadie pidió estos datos: avisar de que «no se pudo precargar» sería ruido
     * puro sobre una operación que la persona no sabe que existe. Cuando abra el
     * expediente de verdad, el error —si sigue— se verá donde corresponde.
     */
  }
}

/** Estado de la cola, para el panel de autodiagnóstico. */
export function estadoPrecarga(): { pendientes: number; enVuelo: number; pausada: boolean; intentados: number } {
  return { pendientes: cola.reduce((n, t) => n + t.ids.length, 0), enVuelo, pausada, intentados: intentados.size };
}

/** Solo para pruebas: cola vacía y memoria de intentos limpia. */
export function __reiniciarPrecargaParaPruebas(): void {
  cancelarPrecarga();
  intentados.clear();
  enVuelo = 0;
  pausada = false;
  programada = false;
}
