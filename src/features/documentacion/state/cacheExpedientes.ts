/**
 * Caché de expedientes: apertura instantánea con revalidación.
 *
 * ── La decisión que este archivo cambia, y por qué ──────────────────────────
 * `state/consola.ts` decidió a propósito NO guardar expedientes: «son datos que
 * otras personas están editando al mismo tiempo y una copia en memoria envejece
 * en segundos». El motivo era correcto y sigue siéndolo. Lo que estaba mal era la
 * conclusión: de «una copia envejece» no se sigue «no hay copia», se sigue «la
 * copia se revalida».
 *
 * Así que aquí hay caché CON REVALIDACIÓN, no caché ciega:
 *
 *   · al elegir un expediente se muestra al instante lo que hay guardado, ya
 *     marcado con su antigüedad —nunca se presenta como fresco—;
 *   · en paralelo se pide al backend y, cuando llega, se reconcilia;
 *   · si `version_registro` cambió, se avisa con discreción: alguien más lo tocó;
 *   · una revalidación NUNCA pisa un campo que la persona está editando. Eso lo
 *     decide quien consume: la caché entrega los datos y dice que son nuevos.
 *
 * ── Qué se guarda y por qué es lo mínimo ────────────────────────────────────
 * El expediente operativo completo, que incluye nombre, cargo, agencia y
 * observaciones: son datos personales. Por eso:
 *
 *   · se guarda con un TTL corto y un tope de entradas (LRU);
 *   · se BORRA al cerrar sesión y al cambiar de perfil (`vaciarCache`);
 *   · no se guarda la auditoría técnica ni nada que la persona no vaya a ver;
 *   · queda documentado en `docs/modules/SECURITY.md`.
 *
 * ── IndexedDB sin dependencias ──────────────────────────────────────────────
 * `localStorage` es sincrónico y tiene un techo de unos 5 MB: veinte expedientes
 * completos ya lo rozan y cada escritura bloquea el hilo de la interfaz. Se usa
 * IndexedDB con la API cruda —son cuarenta líneas— y `localStorage` como recaída
 * para navegadores donde IndexedDB está bloqueada (modo privado de algunos
 * Safari). Si las dos fallan, la caché sigue funcionando solo en memoria: es una
 * ayuda, no un requisito.
 */

import type { ExpedienteOperativo } from "../api/acciones";

/* ------------------------------------------------------------------ */
/* Configuración                                                       */
/* ------------------------------------------------------------------ */

/**
 * Versión del esquema de la caché.
 *
 * Subirla descarta todo lo guardado. Es obligatorio subirla cuando cambia la
 * forma de `ExpedienteOperativo`: una entrada con la forma anterior pintaría una
 * pantalla a la que le faltan campos, y eso se ve como un módulo roto.
 *
 * La 4 añade `selloRequisitos` a la entrada. Sin subirla, las entradas viejas
 * llegarían con el sello en `undefined` y `reconciliar` las declararía
 * «adelantadas» siempre: un aviso de conflicto en cada apertura.
 */
export const VERSION_CACHE = 4;

const NOMBRE_BD = "bdp-documentacion-cache";
const ALMACEN = "expedientes";
const CLAVE_RECAIDA = "bdp-documentacion-cache-expedientes";

/** Tope de entradas en memoria y en disco. Un expediente ronda los 30 KB. */
const MAX_ENTRADAS = 40;

/** Hasta aquí la copia se considera FRESCA y no se revalida al abrir. */
const TTL_FRESCO_MS = 60_000;

/** Hasta aquí la copia sigue sirviendo para consultar y exportar sin conexión. */
const TTL_UTIL_MS = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export interface EntradaCache {
  expedienteId: string;
  detalle: ExpedienteOperativo;
  /** ISO del momento en que se guardó. */
  guardadoEn: string;
  /** `version_registro` de la cabecera, para detectar que alguien se adelantó. */
  version: number;
  /** Suma de las versiones de los requisitos. Ver `reconciliar` para el motivo. */
  selloRequisitos: number;
  /** Versión del esquema con la que se escribió. */
  esquema: number;
}

export interface LecturaCache {
  entrada: EntradaCache;
  /** Milisegundos desde que se guardó. */
  edadMs: number;
  /** ¿Se puede mostrar sin revalidar? */
  fresca: boolean;
  /** ¿Sigue siendo útil para consultar sin conexión? */
  util: boolean;
}

/* ------------------------------------------------------------------ */
/* Memoria (LRU)                                                       */
/* ------------------------------------------------------------------ */

/**
 * `Map` conserva el orden de inserción, así que el LRU sale gratis: al leer se
 * reinserta la clave (pasa al final) y al desalojar se quita la primera.
 */
const memoria = new Map<string, EntradaCache>();
const oyentes = new Set<() => void>();

function avisar(): void {
  for (const oyente of oyentes) oyente();
}

export function suscribirCache(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

function desalojar(): void {
  while (memoria.size > MAX_ENTRADAS) {
    const primera = memoria.keys().next();
    if (primera.done) break;
    memoria.delete(primera.value);
    void borrarDeDisco(primera.value);
  }
}

/* ------------------------------------------------------------------ */
/* IndexedDB                                                           */
/* ------------------------------------------------------------------ */

let bd: IDBDatabase | null = null;
let bdIntentada = false;

function abrirBd(): Promise<IDBDatabase | null> {
  if (bd) return Promise.resolve(bd);
  if (bdIntentada) return Promise.resolve(null);
  bdIntentada = true;
  if (typeof indexedDB === "undefined") return Promise.resolve(null);

  return new Promise((resolve) => {
    let peticion: IDBOpenDBRequest;
    try {
      peticion = indexedDB.open(NOMBRE_BD, VERSION_CACHE);
    } catch {
      resolve(null);
      return;
    }
    peticion.onupgradeneeded = () => {
      const activa = peticion.result;
      // Al subir de versión se tira el almacén entero: una entrada con la forma
      // anterior no se puede migrar de forma fiable y no vale la pena intentarlo.
      if (activa.objectStoreNames.contains(ALMACEN)) activa.deleteObjectStore(ALMACEN);
      activa.createObjectStore(ALMACEN, { keyPath: "expedienteId" });
    };
    peticion.onsuccess = () => {
      bd = peticion.result;
      resolve(bd);
    };
    peticion.onerror = () => resolve(null);
    peticion.onblocked = () => resolve(null);
  });
}

async function escribirEnDisco(entrada: EntradaCache): Promise<void> {
  const base = await abrirBd();
  if (!base) {
    escribirRecaida();
    return;
  }
  try {
    const tx = base.transaction(ALMACEN, "readwrite");
    tx.objectStore(ALMACEN).put(entrada);
  } catch {
    /* cuota agotada o transacción rechazada: la memoria sigue sirviendo */
  }
}

async function borrarDeDisco(expedienteId: string): Promise<void> {
  const base = await abrirBd();
  if (!base) {
    escribirRecaida();
    return;
  }
  try {
    const tx = base.transaction(ALMACEN, "readwrite");
    tx.objectStore(ALMACEN).delete(expedienteId);
  } catch {
    /* ídem */
  }
}

async function leerTodoDeDisco(): Promise<EntradaCache[]> {
  const base = await abrirBd();
  if (!base) return leerRecaida();
  return new Promise((resolve) => {
    try {
      const tx = base.transaction(ALMACEN, "readonly");
      const peticion = tx.objectStore(ALMACEN).getAll();
      peticion.onsuccess = () => resolve((peticion.result ?? []) as EntradaCache[]);
      peticion.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

/* ------------------------------------------------------------------ */
/* Recaída en localStorage                                             */
/* ------------------------------------------------------------------ */

/**
 * Solo se guardan las CINCO entradas más recientes en la recaída.
 *
 * `localStorage` es sincrónico: escribir medio megabyte bloquea el hilo de la
 * interfaz el tiempo suficiente para que se note. Cinco expedientes cubren el
 * caso que importa —volver al que estabas mirando— sin ese coste.
 */
function escribirRecaida(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const recientes = [...memoria.values()].slice(-5);
    window.localStorage.setItem(CLAVE_RECAIDA, JSON.stringify({ esquema: VERSION_CACHE, entradas: recientes }));
  } catch {
    /* almacenamiento lleno: se sigue sin recaída */
  }
}

function leerRecaida(): EntradaCache[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const crudo = window.localStorage.getItem(CLAVE_RECAIDA);
    if (!crudo) return [];
    const guardado = JSON.parse(crudo) as { esquema?: number; entradas?: EntradaCache[] };
    if (guardado?.esquema !== VERSION_CACHE) return [];
    return Array.isArray(guardado.entradas) ? guardado.entradas : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

/** ¿Tiene la entrada la forma que esta versión espera? */
function entradaValida(entrada: unknown): entrada is EntradaCache {
  const e = entrada as EntradaCache | null;
  return Boolean(
    e &&
      typeof e.expedienteId === "string" &&
      e.esquema === VERSION_CACHE &&
      e.detalle &&
      Array.isArray(e.detalle.requisitos) &&
      e.detalle.expediente &&
      typeof e.detalle.expediente.expedienteId === "string",
  );
}

/**
 * Carga en memoria lo que haya en disco. Se llama una vez, al abrir el módulo.
 *
 * Descarta lo caducado y lo escrito por otra versión del esquema. Devuelve
 * cuántas entradas quedaron utilizables, que es lo que el autodiagnóstico
 * muestra.
 */
export async function hidratarCache(): Promise<number> {
  const guardadas = await leerTodoDeDisco();
  const ahora = Date.now();
  const utiles = guardadas
    .filter(entradaValida)
    .filter((e) => ahora - new Date(e.guardadoEn).getTime() < TTL_UTIL_MS)
    .sort((a, b) => (a.guardadoEn < b.guardadoEn ? -1 : 1));

  for (const entrada of utiles.slice(-MAX_ENTRADAS)) memoria.set(entrada.expedienteId, entrada);
  // Lo caducado se borra del disco en el mismo paso: si no, una entrada de hace
  // un mes se queda ahí ocupando cuota y conservando datos personales.
  for (const entrada of guardadas) {
    if (!memoria.has(entrada.expedienteId)) void borrarDeDisco(entrada.expedienteId);
  }
  if (utiles.length) avisar();
  return memoria.size;
}

/** Guarda —o reemplaza— el detalle de un expediente. */
export function guardarEnCache(detalle: ExpedienteOperativo): EntradaCache {
  const expedienteId = detalle.expediente.expedienteId;
  const entrada: EntradaCache = {
    expedienteId,
    detalle,
    guardadoEn: new Date().toISOString(),
    version: detalle.expediente.version ?? 1,
    selloRequisitos: selloRequisitos(detalle),
    esquema: VERSION_CACHE,
  };
  // Se borra antes de insertar para que el `Map` lo coloque al final: es lo que
  // convierte el orden de inserción en un LRU de verdad.
  memoria.delete(expedienteId);
  memoria.set(expedienteId, entrada);
  desalojar();
  void escribirEnDisco(entrada);
  avisar();
  return entrada;
}

/** Lee del caché sin tocar la red. `null` si no hay nada utilizable. */
export function leerDeCache(expedienteId: string): LecturaCache | null {
  const entrada = memoria.get(expedienteId);
  if (!entrada) return null;
  const edadMs = Date.now() - new Date(entrada.guardadoEn).getTime();
  if (edadMs >= TTL_UTIL_MS) {
    memoria.delete(expedienteId);
    void borrarDeDisco(expedienteId);
    return null;
  }
  // Reinserción: leerlo lo convierte en «reciente» para el LRU.
  memoria.delete(expedienteId);
  memoria.set(expedienteId, entrada);
  return { entrada, edadMs, fresca: edadMs < TTL_FRESCO_MS, util: true };
}

/** ¿Está este expediente en la caché? Sin efectos secundarios. */
export function estaEnCache(expedienteId: string): boolean {
  return memoria.has(expedienteId);
}

/** Los expedientes guardados, del más reciente al más antiguo. */
export function expedientesEnCache(): EntradaCache[] {
  return [...memoria.values()].reverse();
}

export function tamanoCache(): number {
  return memoria.size;
}

/**
 * Vacía la caché entera.
 *
 * Se llama al cerrar sesión, al cambiar de perfil y desde el autodiagnóstico.
 * Son datos personales: quedarse guardados después de cambiar de persona sería
 * una fuga, aunque el módulo no los muestre.
 */
export async function vaciarCache(): Promise<void> {
  memoria.clear();
  avisar();
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.removeItem(CLAVE_RECAIDA);
    } catch {
      /* nada que hacer */
    }
  }
  const base = await abrirBd();
  if (!base) return;
  try {
    const tx = base.transaction(ALMACEN, "readwrite");
    tx.objectStore(ALMACEN).clear();
  } catch {
    /* nada que hacer */
  }
}

/**
 * Reconcilia una copia recién llegada con la que hay guardada.
 *
 * Devuelve qué pasó, y esa distinción es lo que permite avisar con honestidad:
 *
 *   · `nueva`      no había copia previa;
 *   · `igual`      el servidor confirma lo que ya teníamos;
 *   · `adelantada` algo cambió por fuera: alguien más lo modificó.
 *
 * ── Por qué no basta `version_registro` de la cabecera ──────────────────────
 * Era lo que esta función comparaba al principio, y en una prueba con el backend
 * real quedó claro que casi nunca salta: marcar un documento como entregado o
 * escribir una observación bumpea la versión del REQUISITO, no la de la
 * cabecera. La cabecera solo cambia cuando se toca el expediente en sí —el
 * cargo, la agencia, el estado— que es la minoría de las ediciones.
 *
 * O sea: el aviso «otra persona modificó este expediente» estaba, técnicamente,
 * bien programado y no se disparaba nunca en el caso que importa. Por eso el
 * sello incluye la suma de las versiones de los requisitos: cada versión solo
 * sube, así que la suma solo sube, y cualquier cambio en cualquier documento la
 * mueve. No hace falta comparar requisito por requisito para decidir si hay que
 * revalidar la pantalla.
 */
function selloRequisitos(detalle: ExpedienteOperativo): number {
  let suma = 0;
  for (const r of detalle.requisitos ?? []) suma += r.version ?? 1;
  return suma;
}

export function reconciliar(detalle: ExpedienteOperativo): {
  resultado: "nueva" | "igual" | "adelantada";
  versionAnterior: number;
  versionNueva: number;
} {
  const expedienteId = detalle.expediente.expedienteId;
  const previa = memoria.get(expedienteId);
  const versionNueva = detalle.expediente.version ?? 1;
  const selloNuevo = selloRequisitos(detalle);
  guardarEnCache(detalle);
  if (!previa) return { resultado: "nueva", versionAnterior: 0, versionNueva };
  if (previa.version === versionNueva && previa.selloRequisitos === selloNuevo) {
    return { resultado: "igual", versionAnterior: previa.version, versionNueva };
  }
  return { resultado: "adelantada", versionAnterior: previa.version, versionNueva };
}

/** Solo para pruebas: deja la caché en memoria como recién arrancada. */
export function __reiniciarCacheParaPruebas(): void {
  memoria.clear();
  bd = null;
  bdIntentada = false;
}
