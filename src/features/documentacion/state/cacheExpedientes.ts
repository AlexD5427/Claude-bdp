/**
 * Caché de expedientes y cola de salida.
 *
 * ── La decisión que este archivo revierte, y por qué ────────────────────────
 * `state/consola.ts` decía, con razón: «NO guarda los expedientes: son datos que
 * otras personas están editando al mismo tiempo y una copia en memoria envejece
 * en segundos». El motivo era bueno; la conclusión, demasiado. Lo que envejece no
 * se puede presentar como fresco, pero SÍ se puede presentar al instante y
 * revalidar en silencio. Eso es lo que hace este almacén: caché **con
 * revalidación**, nunca caché ciega.
 *
 * Tres reglas que se cumplen sin excepción:
 *
 *   1. **nada viejo se presenta como fresco.** Cada entrada guarda su sello de
 *      tiempo y su `version_registro`; la interfaz muestra «actualizado hace un
 *      momento» y no un punto verde;
 *   2. **una revalidación nunca pisa lo que se está editando.** Si hay cambios sin
 *      guardar sobre un expediente, la respuesta que llega se guarda en la caché
 *      pero no reemplaza lo que hay en pantalla;
 *   3. **el guardado no miente.** Un cambio no se marca guardado hasta que el
 *      backend lo confirma. Si queda en la cola, se dice.
 *
 * ── Qué se guarda y dónde ───────────────────────────────────────────────────
 * Memoria (mapa con LRU y tope de entradas) + IndexedDB, con `localStorage` como
 * recaída cuando IndexedDB está bloqueado —modo privado, políticas de empresa—.
 * Son DATOS PERSONALES: nombre, cargo, carnet y estado documental de una persona.
 * Por eso hay TTL, versión de esquema y borrado al cerrar sesión o cambiar de
 * perfil. Lo que se guarda y por qué está documentado en
 * `docs/modules/SECURITY.md`.
 *
 * ── Sin dependencias ────────────────────────────────────────────────────────
 * IndexedDB se usa a pelo con promesas envueltas a mano. Una librería de
 * almacenamiento para tres operaciones —leer, escribir, vaciar— sería otro
 * paquete que mantener y otro kilobyte en el arranque.
 */

import type { ExpedienteCabecera, ProrrogaVista, RequisitoVista } from "../domain/progreso";

/* ------------------------------------------------------------------ */
/* Forma de lo que se guarda                                           */
/* ------------------------------------------------------------------ */

/**
 * Versión del esquema de la caché.
 *
 * Sube cuando cambia la forma de lo guardado. Una entrada de una versión
 * anterior se descarta en lugar de intentar migrarla: es una copia, se puede
 * volver a pedir, y un migrador de caché es código que solo se ejecuta en el peor
 * momento posible.
 */
export const VERSION_CACHE = 3;

/** Cuánto vive una entrada antes de considerarse inservible. */
export const TTL_MS = 30 * 60 * 1000;

/** Tope de expedientes en memoria y en disco. Una jornada de trabajo cabe. */
export const MAX_ENTRADAS = 120;

export interface ExpedienteEnCache {
  expedienteId: string;
  expediente: ExpedienteCabecera;
  requisitos: RequisitoVista[];
  prorrogas: ProrrogaVista[];
  /** `true` cuando viene de la lectura por lotes: falta historial y comentarios. */
  parcial: boolean;
  /** Cuándo lo confirmó el backend. */
  guardadoEn: string;
  /** Versión del registro, para detectar que alguien se adelantó. */
  version: number;
  /** Perfil que lo pidió. Al cambiar de perfil, la caché se vacía. */
  perfil: string;
}

interface SobreGuardado {
  version: number;
  entradas: ExpedienteEnCache[];
}

/* ------------------------------------------------------------------ */
/* Almacén persistente                                                 */
/* ------------------------------------------------------------------ */

const NOMBRE_BD = "bdp-documentacion";
const ALMACEN = "expedientes";
const CLAVE_LOCAL = "bdp-documentacion-cache-expedientes";

/** Envuelve una petición de IndexedDB en una promesa. */
function comoPromesa<T>(peticion: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error);
  });
}

let bd: Promise<IDBDatabase | null> | null = null;

/**
 * Abre la base, una sola vez.
 *
 * Devuelve `null` —y no lanza— cuando IndexedDB no está disponible o está
 * bloqueado. La caché es una ayuda: si no se puede guardar, el módulo funciona
 * igual pidiendo los datos, y eso no debe costar ni un error en consola.
 */
function abrirBd(): Promise<IDBDatabase | null> {
  if (bd) return bd;
  bd = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    try {
      const peticion = indexedDB.open(NOMBRE_BD, VERSION_CACHE);
      peticion.onupgradeneeded = () => {
        const base = peticion.result;
        if (base.objectStoreNames.contains(ALMACEN)) base.deleteObjectStore(ALMACEN);
        base.createObjectStore(ALMACEN, { keyPath: "expedienteId" });
      };
      peticion.onsuccess = () => resolve(peticion.result);
      peticion.onerror = () => resolve(null);
      peticion.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return bd;
}

/** Recaída en `localStorage`: lee el sobre completo. */
function leerLocal(): SobreGuardado | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const crudo = localStorage.getItem(CLAVE_LOCAL);
    if (!crudo) return null;
    const sobre = JSON.parse(crudo) as SobreGuardado;
    if (!sobre || sobre.version !== VERSION_CACHE || !Array.isArray(sobre.entradas)) return null;
    return sobre;
  } catch {
    return null;
  }
}

function escribirLocal(entradas: ExpedienteEnCache[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CLAVE_LOCAL, JSON.stringify({ version: VERSION_CACHE, entradas }));
  } catch {
    /* cuota agotada: se pierde la copia en disco, no el trabajo */
  }
}

/* ------------------------------------------------------------------ */
/* Caché en memoria con LRU                                            */
/* ------------------------------------------------------------------ */

/**
 * `Map` de JavaScript conserva el orden de inserción, así que reinsertar una
 * entrada al leerla la manda al final y la primera clave es siempre la menos
 * usada. Eso es un LRU sin escribir un LRU.
 */
const memoria = new Map<string, ExpedienteEnCache>();
let perfilActivo = "";
let hidratada = false;

/**
 * Generación del almacén.
 *
 * ── El fallo que evita ──────────────────────────────────────────────────────
 * Guardar en disco es asíncrono (hay que abrir IndexedDB). Si entre que empieza
 * una escritura y termina alguien VACÍA la caché —al cambiar de perfil o desde
 * el autodiagnóstico—, la escritura en vuelo volvía a dejar en el disco los
 * expedientes que se acababan de borrar. Con datos personales de terceros eso no
 * es un detalle: es un borrado que no borra.
 *
 * Cada volcado anota la generación con la que empezó y se descarta si cambió.
 */
let generacion = 0;

/** ¿Está una entrada dentro de su tiempo de vida? */
export function vigente(entrada: ExpedienteEnCache, ahora = Date.now()): boolean {
  const sello = Date.parse(entrada.guardadoEn);
  if (Number.isNaN(sello)) return false;
  return ahora - sello < TTL_MS;
}

/** Segundos que lleva guardada una entrada. Lo usa el aviso «hace un momento». */
export function antiguedadSegundos(entrada: ExpedienteEnCache, ahora = Date.now()): number {
  const sello = Date.parse(entrada.guardadoEn);
  if (Number.isNaN(sello)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.round((ahora - sello) / 1000));
}

/**
 * Carga en memoria lo que haya en disco.
 *
 * Se llama al abrir el módulo. Descarta lo caducado, lo de otra versión de
 * esquema y lo de otro perfil, que es lo que hace que cambiar de persona no
 * muestre los expedientes que consultó la anterior.
 */
export async function hidratarCache(perfil: string): Promise<number> {
  if (hidratada && perfilActivo === perfil) return memoria.size;
  perfilActivo = perfil;
  memoria.clear();
  hidratada = true;

  const ahora = Date.now();
  const aceptar = (entrada: ExpedienteEnCache) => {
    if (!entrada || typeof entrada.expedienteId !== "string") return;
    if (entrada.perfil !== perfil) return;
    if (!vigente(entrada, ahora)) return;
    if (!entrada.expediente || !Array.isArray(entrada.requisitos)) return;
    memoria.set(entrada.expedienteId, entrada);
  };

  const base = await abrirBd();
  if (base) {
    try {
      const transaccion = base.transaction(ALMACEN, "readonly");
      const guardadas = await comoPromesa<ExpedienteEnCache[]>(
        transaccion.objectStore(ALMACEN).getAll() as IDBRequest<ExpedienteEnCache[]>,
      );
      for (const entrada of guardadas) aceptar(entrada);
    } catch {
      /* base ilegible: se sigue con la recaída */
    }
  }
  if (!memoria.size) {
    const sobre = leerLocal();
    if (sobre) for (const entrada of sobre.entradas) aceptar(entrada);
  }
  return memoria.size;
}

/** Vuelca la memoria a disco, respetando el tope. */
async function persistir(): Promise<void> {
  const mia = generacion;
  const base = await abrirBd();
  // La caché se vació mientras se abría la base: este volcado ya no vale.
  if (mia !== generacion) return;
  const entradas = [...memoria.values()].slice(-MAX_ENTRADAS);
  if (base) {
    try {
      const transaccion = base.transaction(ALMACEN, "readwrite");
      const almacen = transaccion.objectStore(ALMACEN);
      almacen.clear();
      for (const entrada of entradas) almacen.put(entrada);
      return;
    } catch {
      /* cuota o permiso: se usa la recaída */
    }
  }
  escribirLocal(entradas);
}

/**
 * Guarda (o reemplaza) un expediente en la caché.
 *
 * La memoria queda al día en el momento —la lectura siguiente ya lo encuentra— y
 * el volcado a disco va detrás. Se devuelve su promesa para que quien necesite
 * esperar el disco pueda hacerlo; nadie en la interfaz lo necesita, y por eso el
 * uso normal es `guardarEnCache(...)` sin `await`.
 */
export function guardarEnCache(
  entrada: Omit<ExpedienteEnCache, "perfil" | "guardadoEn"> & { guardadoEn?: string },
): Promise<void> {
  const completa: ExpedienteEnCache = {
    ...entrada,
    perfil: perfilActivo,
    guardadoEn: entrada.guardadoEn ?? new Date().toISOString(),
  };
  // Reinsertar manda la entrada al final del orden LRU.
  memoria.delete(completa.expedienteId);
  memoria.set(completa.expedienteId, completa);
  while (memoria.size > MAX_ENTRADAS) {
    const masVieja = memoria.keys().next();
    if (masVieja.done) break;
    memoria.delete(masVieja.value);
  }
  return persistir();
}

/**
 * Lee un expediente de la caché.
 *
 * Devuelve `null` si no está o si caducó. Leerlo lo marca como recién usado: en
 * una jornada de trabajo, los expedientes que se abren dos veces son los que
 * conviene conservar.
 */
export function leerDeCache(expedienteId: string): ExpedienteEnCache | null {
  const entrada = memoria.get(expedienteId);
  if (!entrada) return null;
  if (!vigente(entrada)) {
    memoria.delete(expedienteId);
    return null;
  }
  memoria.delete(expedienteId);
  memoria.set(expedienteId, entrada);
  return entrada;
}

/** ¿Está este expediente ya en la caché y vigente? La usa la precarga. */
export function estaEnCache(expedienteId: string): boolean {
  return leerDeCache(expedienteId) !== null;
}

/** Todos los expedientes guardados. Es lo que permite consultar sin conexión. */
export function expedientesEnCache(): ExpedienteEnCache[] {
  return [...memoria.values()].filter((e) => vigente(e));
}

/** Cuántos hay y de cuándo es el más antiguo. Alimenta el autodiagnóstico. */
export function resumenCache(): { entradas: number; masAntiguo: string } {
  const lista = expedientesEnCache();
  const sellos = lista.map((e) => e.guardadoEn).sort();
  return { entradas: lista.length, masAntiguo: sellos[0] ?? "" };
}

/**
 * Vacía la caché.
 *
 * Se llama al cerrar sesión, al cambiar de perfil y desde el autodiagnóstico. Son
 * datos personales: cuando dejan de hacer falta, se van.
 */
export async function vaciarCache(): Promise<void> {
  generacion += 1;
  memoria.clear();
  hidratada = false;
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(CLAVE_LOCAL);
    } catch {
      /* nada que hacer */
    }
  }
  const base = await abrirBd();
  if (!base) return;
  try {
    base.transaction(ALMACEN, "readwrite").objectStore(ALMACEN).clear();
  } catch {
    /* nada que hacer */
  }
}

/** Cambia de perfil: si es otra persona, la caché anterior no le pertenece. */
export async function cambiarPerfilCache(perfil: string): Promise<void> {
  if (perfilActivo === perfil && hidratada) return;
  if (perfilActivo && perfilActivo !== perfil) await vaciarCache();
  await hidratarCache(perfil);
}

/** Reinicia el estado interno. Solo lo usan las pruebas. */
export function __reiniciarCacheParaPruebas(): void {
  generacion += 1;
  memoria.clear();
  perfilActivo = "";
  hidratada = false;
  bd = null;
}
