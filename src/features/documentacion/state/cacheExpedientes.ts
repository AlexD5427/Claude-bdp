/**
 * Caché de expedientes: apertura instantánea sin mentir sobre la frescura.
 *
 * ── La decisión que este archivo revierte, y por qué ────────────────────────
 * `state/consola.ts` decía, a propósito: «NO guarda los expedientes: son datos
 * que otras personas están editando al mismo tiempo y una copia en memoria
 * envejece en segundos». El motivo era —y sigue siendo— correcto. Lo que estaba
 * mal era la conclusión: de «una copia envejece» no se sigue «no hay copia», se
 * sigue «la copia no puede presentarse como fresca».
 *
 * Así que aquí hay caché CON REVALIDACIÓN, no caché ciega:
 *
 *   1. al elegir un expediente se pinta al instante lo que hay guardado, marcado
 *      con su antigüedad («actualizado hace unos segundos»);
 *   2. en paralelo se pregunta al backend;
 *   3. si `version_registro` coincide, no pasa nada visible;
 *   4. si cambió, se reconcilia y se avisa con discreción;
 *   5. si la persona está editando ese requisito, la revalidación NO lo pisa: se
 *      guarda aparte y se ofrece.
 *
 * El punto 5 es el que hace que esto sea usable. Sin él, escribir una observación
 * larga mientras llega una revalidación borraría la frase a medias, que es
 * exactamente el tipo de fallo que este módulo ya pagó una vez.
 *
 * ── Qué se guarda y qué NO ──────────────────────────────────────────────────
 * Se guardan expedientes, que son DATOS PERSONALES: nombre, carnet, cargo,
 * agencia y el estado de su documentación. Por eso:
 *
 *   · hay TTL (una copia de hace dos días no vale para nada y sí es un riesgo);
 *   · hay tope de entradas con desalojo del menos usado;
 *   · **se borra todo al cerrar sesión o al cambiar de perfil**;
 *   · no se guardan la auditoría técnica ni el historial largo.
 *
 * Está documentado en `docs/modules/SECURITY.md`.
 *
 * ── Por qué IndexedDB y no `localStorage` ──────────────────────────────────
 * `localStorage` es sincrónico: escribir doscientos kilobytes de expedientes
 * bloquea el hilo principal y se nota como un tirón al desplazar. IndexedDB es
 * asincrónico y admite mucho más volumen. Se usa sin ninguna dependencia —la API
 * nativa basta para un almacén de clave/valor— y con `localStorage` como recaída
 * para navegadores donde IndexedDB está bloqueado (modo privado de algunos
 * Safari), en cuyo caso se guarda MENOS: solo las cabeceras.
 */

import type { ExpedienteOperativo } from "../api/acciones";

/* ------------------------------------------------------------------ */
/* Configuración                                                       */
/* ------------------------------------------------------------------ */

/**
 * Versión del esquema de la caché.
 *
 * Súbela cuando cambie la FORMA de `ExpedienteOperativo`. Una entrada guardada
 * por una versión anterior se descarta en lugar de leerse a medias: un campo que
 * falta se convierte en `undefined` y `undefined` pintado es un hueco que nadie
 * sabe explicar.
 */
const VERSION_CACHE = 2;

const NOMBRE_BD = "bdp-documentacion-cache";
const ALMACEN = "expedientes";
const CLAVE_RECAIDA = "bdp-documentacion-cache-expedientes";

/** Tope de expedientes guardados. Con 60 se cubren tres páginas de 25 y sobra. */
const MAX_ENTRADAS = 60;

/** Caducidad. Media hora: lo que dura una sesión de trabajo sobre la misma lista. */
const TTL_MS = 30 * 60 * 1000;

/** Llamadas de precarga en vuelo a la vez. Más de tres compiten con la interacción. */
const CONCURRENCIA_PRECARGA = 2;

/** Cuántos expedientes pide cada llamada de precarga por lotes. */
const LOTE_PRECARGA = 8;

/* ------------------------------------------------------------------ */
/* Tipos                                                              */
/* ------------------------------------------------------------------ */

export interface EntradaCache {
  expedienteId: string;
  detalle: ExpedienteOperativo;
  /** Cuándo se trajo del backend, en milisegundos. */
  guardadoEn: number;
  /** `version_registro` del expediente cuando se guardó. */
  version: number;
  esquema: number;
}

export interface LecturaCache {
  detalle: ExpedienteOperativo;
  /** Milisegundos desde que se trajo del backend. */
  antiguedadMs: number;
  /** `true` si ya pasó el TTL: se pinta, pero avisando de que puede estar vieja. */
  caducada: boolean;
}

/* ------------------------------------------------------------------ */
/* Almacén persistente                                                */
/* ------------------------------------------------------------------ */

let bd: IDBDatabase | null = null;
let bdIntentada = false;

/**
 * Abre (o crea) la base. Devuelve `null` si el navegador no la deja.
 *
 * Se intenta UNA vez: si falla, reintentarlo en cada lectura añade una promesa
 * rechazada por expediente y no cambia el resultado.
 */
function abrirBd(): Promise<IDBDatabase | null> {
  if (bd) return Promise.resolve(bd);
  if (bdIntentada) return Promise.resolve(null);
  bdIntentada = true;
  if (typeof indexedDB === "undefined") return Promise.resolve(null);

  return new Promise((resolver) => {
    let abierta = false;
    try {
      const peticion = indexedDB.open(NOMBRE_BD, VERSION_CACHE);
      peticion.onupgradeneeded = () => {
        const base = peticion.result;
        // Al subir de versión se tira el almacén entero: reinterpretar entradas
        // de una forma anterior cuesta más de lo que valen.
        if (base.objectStoreNames.contains(ALMACEN)) base.deleteObjectStore(ALMACEN);
        base.createObjectStore(ALMACEN, { keyPath: "expedienteId" });
      };
      peticion.onsuccess = () => {
        abierta = true;
        bd = peticion.result;
        resolver(bd);
      };
      peticion.onerror = () => resolver(null);
      peticion.onblocked = () => resolver(null);
      // Una pestaña que dejó una transacción abierta puede colgar la apertura sin
      // disparar `onblocked`. Un tope corto evita que la caché retrase el arranque.
      setTimeout(() => {
        if (!abierta) resolver(null);
      }, 1200);
    } catch {
      resolver(null);
    }
  });
}

function transaccion(base: IDBDatabase, modo: IDBTransactionMode): IDBObjectStore {
  return base.transaction(ALMACEN, modo).objectStore(ALMACEN);
}

function promesaDe<T>(peticion: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolver) => {
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => resolver(null);
  });
}

/* ------------------------------------------------------------------ */
/* Caché en memoria (primer nivel)                                    */
/* ------------------------------------------------------------------ */

/**
 * Mapa en memoria, que además es el LRU.
 *
 * `Map` conserva el orden de inserción, así que reinsertar una entrada al leerla
 * la manda al final y la primera clave es siempre la menos usada. Un LRU sin
 * estructura extra ni contadores que mantener.
 */
const memoria = new Map<string, EntradaCache>();

/** Marca una entrada como recién usada. */
function tocar(expedienteId: string): void {
  const entrada = memoria.get(expedienteId);
  if (!entrada) return;
  memoria.delete(expedienteId);
  memoria.set(expedienteId, entrada);
}

/** Desaloja las entradas más antiguas hasta respetar el tope. */
function desalojar(): string[] {
  const fuera: string[] = [];
  while (memoria.size > MAX_ENTRADAS) {
    const primera = memoria.keys().next();
    if (primera.done) break;
    memoria.delete(primera.value);
    fuera.push(primera.value);
  }
  return fuera;
}

/* ------------------------------------------------------------------ */
/* API de lectura y escritura                                         */
/* ------------------------------------------------------------------ */

/** Lectura sincrónica de memoria. Es la que permite pintar en el mismo fotograma. */
export function leerDeMemoria(expedienteId: string): LecturaCache | null {
  const entrada = memoria.get(expedienteId);
  if (!entrada || entrada.esquema !== VERSION_CACHE) return null;
  tocar(expedienteId);
  const antiguedadMs = Date.now() - entrada.guardadoEn;
  return { detalle: entrada.detalle, antiguedadMs, caducada: antiguedadMs > TTL_MS };
}

/**
 * Lectura completa: memoria y, si no está, disco.
 *
 * Devolver una entrada caducada en lugar de `null` es deliberado: sirve para
 * pintar algo mientras llega la respuesta, y quien la consume ya sabe por
 * `caducada` que tiene que revalidar y que no puede presentarla como fresca.
 */
export async function leer(expedienteId: string): Promise<LecturaCache | null> {
  const enMemoria = leerDeMemoria(expedienteId);
  if (enMemoria) return enMemoria;

  const base = await abrirBd();
  if (!base) return leerDeRecaida(expedienteId);
  const entrada = await promesaDe<EntradaCache>(transaccion(base, "readonly").get(expedienteId) as IDBRequest<EntradaCache>);
  if (!entrada || entrada.esquema !== VERSION_CACHE || !entrada.detalle?.expediente) return null;

  memoria.set(expedienteId, entrada);
  desalojar();
  const antiguedadMs = Date.now() - entrada.guardadoEn;
  return { detalle: entrada.detalle, antiguedadMs, caducada: antiguedadMs > TTL_MS };
}

/** Guarda un expediente en los dos niveles. */
export function guardar(detalle: ExpedienteOperativo): void {
  const expedienteId = detalle?.expediente?.expedienteId;
  if (!expedienteId) return;

  const entrada: EntradaCache = {
    expedienteId,
    detalle: recortar(detalle),
    guardadoEn: Date.now(),
    version: detalle.expediente.version ?? 0,
    esquema: VERSION_CACHE,
  };
  memoria.delete(expedienteId);
  memoria.set(expedienteId, entrada);
  const desalojadas = desalojar();

  // El disco se actualiza sin esperar: la interfaz ya tiene lo que necesita en
  // memoria y bloquearla por una escritura de caché sería absurdo.
  void (async () => {
    const base = await abrirBd();
    if (!base) {
      guardarEnRecaida();
      return;
    }
    try {
      const almacen = transaccion(base, "readwrite");
      almacen.put(entrada);
      for (const id of desalojadas) almacen.delete(id);
    } catch {
      /* cuota llena o almacén cerrado: la caché es una ayuda, no un requisito */
    }
  })();
}

/**
 * Recorta lo que no vale la pena guardar.
 *
 * La auditoría técnica y el historial largo son lo más pesado del payload y lo
 * menos útil en una apertura instantánea: nadie abre un expediente para leer su
 * bitácora. Se piden cuando hacen falta. Recortar aquí es lo que permite que
 * sesenta expedientes quepan sin acercarse a la cuota.
 */
function recortar(detalle: ExpedienteOperativo): ExpedienteOperativo {
  return { ...detalle, auditoria: [], historial: detalle.historial.slice(0, 12) };
}

/** Olvida un expediente (por ejemplo, tras archivarlo). */
export function olvidar(expedienteId: string): void {
  memoria.delete(expedienteId);
  void (async () => {
    const base = await abrirBd();
    if (base) {
      try {
        transaccion(base, "readwrite").delete(expedienteId);
      } catch {
        /* sin consecuencias: la entrada caducará */
      }
    }
    guardarEnRecaida();
  })();
}

/**
 * Vacía la caché entera.
 *
 * Se llama al cerrar sesión y al cambiar de perfil. No es una optimización: son
 * datos personales de terceros y no pueden sobrevivir al cambio de persona que
 * usa el equipo.
 */
export async function vaciar(): Promise<void> {
  memoria.clear();
  try {
    if (typeof window !== "undefined") window.localStorage?.removeItem(CLAVE_RECAIDA);
  } catch {
    /* almacenamiento bloqueado */
  }
  const base = await abrirBd();
  if (!base) return;
  try {
    transaccion(base, "readwrite").clear();
  } catch {
    /* nada que hacer: la caché quedará caducada de todos modos */
  }
}

/** Cuántos expedientes hay guardados y cuál es el más antiguo. */
export function estadoCache(): { entradas: number; masAntiguoMs: number | null } {
  let masAntiguo: number | null = null;
  for (const entrada of memoria.values()) {
    const edad = Date.now() - entrada.guardadoEn;
    if (masAntiguo === null || edad > masAntiguo) masAntiguo = edad;
  }
  return { entradas: memoria.size, masAntiguoMs: masAntiguo };
}

/* ------------------------------------------------------------------ */
/* Recaída a `localStorage`                                           */
/* ------------------------------------------------------------------ */

/**
 * Sin IndexedDB se guardan solo las CABECERAS, no los expedientes completos.
 *
 * Con `localStorage` cada escritura bloquea el hilo, y guardar sesenta
 * expedientes completos (con sus veinticinco requisitos cada uno) es un tirón
 * visible al desplazar. Las cabeceras bastan para que la lista y la vista local
 * funcionen sin conexión; el detalle se pide.
 */
function guardarEnRecaida(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const cabeceras = [...memoria.values()].slice(-MAX_ENTRADAS).map((e) => ({
      expedienteId: e.expedienteId,
      guardadoEn: e.guardadoEn,
      version: e.version,
      esquema: e.esquema,
      expediente: e.detalle.expediente,
    }));
    window.localStorage.setItem(CLAVE_RECAIDA, JSON.stringify({ esquema: VERSION_CACHE, cabeceras }));
  } catch {
    /* cuota llena: se pierde la recaída, no los datos */
  }
}

function leerDeRecaida(_expedienteId: string): LecturaCache | null {
  // La recaída guarda cabeceras, no expedientes completos: no puede satisfacer
  // una lectura de detalle. Existe para que la lista y la vista local tengan algo
  // que mostrar sin conexión, y eso lo consume `cabecerasGuardadas()`.
  return null;
}

/** Cabeceras guardadas, para consultar y exportar sin conexión. */
export function cabecerasGuardadas(): { expedienteId: string; guardadoEn: number }[] {
  const deMemoria = [...memoria.values()].map((e) => ({ expedienteId: e.expedienteId, guardadoEn: e.guardadoEn }));
  if (deMemoria.length) return deMemoria;
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const crudo = window.localStorage.getItem(CLAVE_RECAIDA);
    if (!crudo) return [];
    const guardado = JSON.parse(crudo) as { esquema?: number; cabeceras?: { expedienteId: string; guardadoEn: number }[] };
    if (guardado?.esquema !== VERSION_CACHE || !Array.isArray(guardado.cabeceras)) return [];
    return guardado.cabeceras;
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Precarga en segundo plano                                          */
/* ------------------------------------------------------------------ */

type TraerLote = (ids: string[]) => Promise<ExpedienteOperativo[]>;

/** Cola de precarga. Una sola: dos colas compitiendo por la red no aceleran nada. */
const cola: string[] = [];
let enVuelo = 0;
let generacion = 0;
let traerLote: TraerLote | null = null;

/**
 * Declara cómo se traen los expedientes.
 *
 * Se inyecta en vez de importar `docApi` aquí por dos razones: este módulo se
 * puede probar sin red, y la precarga tiene que poder usar la lectura POR LOTES
 * cuando el backend la soporta y caer a la individual cuando no, decisión que
 * pertenece a quien conoce el estado del backend.
 */
export function configurarPrecarga(fn: TraerLote | null): void {
  traerLote = fn;
}

/**
 * Programa la precarga de unos expedientes.
 *
 * ── Las tres reglas que evitan que la precarga estorbe ──────────────────────
 *   1. **no se precarga lo que ya está fresco**: sería gastar una llamada en
 *      confirmar lo que ya sabemos;
 *   2. **se ejecuta en tiempo ocioso** (`requestIdleCallback`), así que nunca
 *      compite con el fotograma en el que alguien está desplazando;
 *   3. **se cancela al navegar**: `generacion` invalida los lotes en vuelo. Sin
 *      esto, cambiar de página tres veces deja tres precargas peleándose por la
 *      red mientras la persona espera la página que sí pidió.
 */
export function precargar(expedienteIds: string[]): void {
  if (!traerLote) return;
  for (const id of expedienteIds) {
    if (!id) continue;
    const enCache = leerDeMemoria(id);
    if (enCache && !enCache.caducada) continue;
    if (cola.includes(id)) continue;
    cola.push(id);
  }
  enOcioso(() => vaciarCola(generacion));
}

/** Cancela la precarga pendiente. Se llama al cambiar de sección o de página. */
export function cancelarPrecarga(): void {
  cola.length = 0;
  generacion += 1;
}

function enOcioso(fn: () => void): void {
  if (typeof window === "undefined") return;
  const conOcioso = window as Window & {
    requestIdleCallback?: (cb: () => void, opciones?: { timeout: number }) => number;
  };
  if (typeof conOcioso.requestIdleCallback === "function") conOcioso.requestIdleCallback(fn, { timeout: 2000 });
  else window.setTimeout(fn, 300);
}

async function vaciarCola(miGeneracion: number): Promise<void> {
  if (!traerLote) return;
  while (cola.length && enVuelo < CONCURRENCIA_PRECARGA) {
    if (miGeneracion !== generacion) return;
    const lote = cola.splice(0, LOTE_PRECARGA);
    enVuelo += 1;
    void (async () => {
      try {
        const detalles = await traerLote!(lote);
        // Se comprueba la generación DESPUÉS de la respuesta: si mientras
        // llegaba se navegó a otra pantalla, guardar es inofensivo pero seguir
        // vaciando la cola vieja no lo es.
        for (const detalle of detalles) guardar(detalle);
      } catch {
        /* la precarga es una mejora: si falla, la apertura será la de siempre */
      } finally {
        enVuelo -= 1;
        if (cola.length && miGeneracion === generacion) enOcioso(() => vaciarCola(miGeneracion));
      }
    })();
  }
}

/* ------------------------------------------------------------------ */
/* Reconciliación                                                     */
/* ------------------------------------------------------------------ */

export type ResultadoRevalidacion =
  | { tipo: "sin_cambios" }
  | { tipo: "actualizado"; detalle: ExpedienteOperativo }
  | { tipo: "conflicto"; detalle: ExpedienteOperativo; versionLocal: number; versionRemota: number };

/**
 * Compara lo que llegó del backend con lo que había guardado.
 *
 * ── Por qué distingue «actualizado» de «conflicto» ─────────────────────────
 * No es lo mismo que el expediente haya cambiado (otra persona lo tocó y hay que
 * refrescar la pantalla, sin más) que que haya cambiado MIENTRAS alguien lo
 * estaba editando aquí. En el segundo caso hay dos verdades y la decisión es de
 * la persona: pisar lo suyo con lo de fuera sin preguntar es la forma más rápida
 * de perder media hora de trabajo.
 *
 * `editando` lo decide quien llama: es la única que sabe si hay un cuadro de
 * texto con el cursor dentro.
 */
export function reconciliar(
  expedienteId: string,
  remoto: ExpedienteOperativo,
  editando: boolean,
): ResultadoRevalidacion {
  const local = memoria.get(expedienteId);
  const versionRemota = remoto.expediente.version ?? 0;

  if (!local) {
    guardar(remoto);
    return { tipo: "actualizado", detalle: remoto };
  }
  if (local.version === versionRemota) {
    // Aun sin cambio de versión se refresca el sello de tiempo: la copia acaba de
    // confirmarse contra el backend y ya no es «de hace diez minutos».
    local.guardadoEn = Date.now();
    return { tipo: "sin_cambios" };
  }
  if (editando) {
    return { tipo: "conflicto", detalle: remoto, versionLocal: local.version, versionRemota };
  }
  guardar(remoto);
  return { tipo: "actualizado", detalle: remoto };
}

/** Texto llano de la antigüedad de una copia. Para el sello de «actualizado hace…». */
export function antiguedadLegible(ms: number): string {
  const segundos = Math.round(ms / 1000);
  if (segundos < 10) return "hace unos segundos";
  if (segundos < 60) return `hace ${segundos} segundos`;
  const minutos = Math.round(segundos / 60);
  if (minutos === 1) return "hace un minuto";
  if (minutos < 60) return `hace ${minutos} minutos`;
  const horas = Math.round(minutos / 60);
  return horas === 1 ? "hace una hora" : `hace ${horas} horas`;
}
