/**
 * Preferencias del módulo de Documentación.
 *
 * ── Qué guarda y por qué está aparte del resto del estado ───────────────────
 * Son las decisiones de la persona sobre CÓMO quiere ver el módulo: tamaño de
 * letra, animaciones, modo ligero, columnas visibles, orden por defecto y
 * precarga. Nada de negocio. Viven en su propia clave de `localStorage` con su
 * propia versión porque tienen otro ciclo de vida que los datos: cambian a diario
 * y sobreviven a cualquier despliegue.
 *
 * La densidad, la vista y el modo de la lista NO están aquí: ya vivían en
 * `state/consola.ts` desde antes y duplicarlas habría dado dos claves
 * persistidas para el mismo ajuste, con el efecto clásico de que la pantalla y el
 * panel de preferencias muestran valores distintos. El panel de «Esta pantalla»
 * las lee de donde ya estaban.
 *
 * ── La regla que evita el módulo inutilizable ───────────────────────────────
 * Cada preferencia se valida al leer. Un `localStorage` editado a mano, o escrito por una
 * versión anterior con otra forma, no puede tumbar el arranque ni dejar la
 * interfaz en un estado imposible: cualquier valor que no reconozcamos se
 * sustituye por el de fábrica y se sigue. Esa es la diferencia entre una
 * preferencia y una bomba de relojería.
 *
 * ── Modo ligero ─────────────────────────────────────────────────────────────
 * Tiene tres estados a propósito: `auto`, `si` y `no`. En `auto` se decide con
 * señales del equipo y, si hace falta, con una medición real de fotogramas
 * perdidos; `si` y `no` son la decisión explícita de la persona y ninguna
 * heurística la pisa.
 */

import { createStore } from "../../../shared/store";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export type TamanoLetra = "pequena" | "normal" | "grande";
export type ModoLigero = "auto" | "si" | "no";

/**
 * Columnas de la lista de expedientes que se pueden ocultar.
 *
 * Son las claves REALES de las columnas del modo operativo, no una lista
 * paralela: un interruptor que no apaga nada es peor que no tener el
 * interruptor. La persona nunca se puede ocultar —sin ella la fila no
 * identifica a nadie— y por eso no está aquí.
 *
 * El modo auditoría queda fuera a propósito: su valor es que las columnas están
 * fijas y son siempre las mismas, porque es la vista que se imprime para
 * demostrar algo. Dejar ocultar columnas ahí sería poder producir una prueba
 * incompleta sin darse cuenta.
 */
export const COLUMNAS_LISTA = [
  "ubicacion",
  "estado",
  "avance",
  "faltan",
  "observados",
  "critica",
  "responsable",
] as const;
export type ColumnaLista = (typeof COLUMNAS_LISTA)[number];

export const ORDENES_LISTA = [
  "reciente",
  "antiguo",
  "actualizado",
  "nombre",
  "identificador",
  "avance",
  "pendientes",
  "observados",
  "ingreso",
  "critica",
  "estado",
] as const;
export type OrdenLista = (typeof ORDENES_LISTA)[number];

export interface Preferencias {
  letra: TamanoLetra;
  /** `false` apaga las animaciones del módulo aunque el sistema no lo pida. */
  animaciones: boolean;
  modoLigero: ModoLigero;
  columnas: ColumnaLista[];
  orden: OrdenLista;
  /** Precarga en segundo plano de los expedientes de la lista visible. */
  precarga: boolean;
}

const DE_FABRICA: Preferencias = {
  letra: "normal",
  animaciones: true,
  modoLigero: "auto",
  columnas: [...COLUMNAS_LISTA],
  orden: "reciente",
  precarga: true,
};

const CLAVE = "bdp-documentacion-preferencias";

/* ------------------------------------------------------------------ */
/* Validación al leer                                                  */
/* ------------------------------------------------------------------ */

function unaDe<T extends string>(valor: unknown, permitidos: readonly T[], reserva: T): T {
  return permitidos.includes(valor as T) ? (valor as T) : reserva;
}

/**
 * Normaliza lo que venga del almacenamiento.
 *
 * Las columnas se filtran contra la lista conocida y, si no queda ninguna, se
 * restauran todas: una lista sin columnas es una tabla en blanco, y nadie
 * entiende por qué.
 */
export function normalizarPreferencias(crudo: unknown): Preferencias {
  const p = (crudo ?? {}) as Partial<Preferencias>;
  const columnas = Array.isArray(p.columnas)
    ? (p.columnas.filter((c): c is ColumnaLista => COLUMNAS_LISTA.includes(c as ColumnaLista)) as ColumnaLista[])
    : [];
  return {
    letra: unaDe(p.letra, ["pequena", "normal", "grande"] as const, DE_FABRICA.letra),
    animaciones: p.animaciones === false ? false : true,
    modoLigero: unaDe(p.modoLigero, ["auto", "si", "no"] as const, DE_FABRICA.modoLigero),
    columnas: columnas.length ? columnas : [...COLUMNAS_LISTA],
    orden: unaDe(p.orden, ORDENES_LISTA, DE_FABRICA.orden),
    precarga: p.precarga === false ? false : true,
  };
}

const almacen = createStore<Preferencias>(DE_FABRICA, {
  persistKey: CLAVE,
  serialize: (estado) => JSON.stringify(estado),
  deserialize: (raw) => normalizarPreferencias(JSON.parse(raw)),
});

export const usePreferencias = almacen.use;
export const obtenerPreferencias = almacen.get;

export function ponerPreferencia<K extends keyof Preferencias>(clave: K, valor: Preferencias[K]): void {
  almacen.set((prev) => (prev[clave] === valor ? prev : { ...prev, [clave]: valor }));
}

export function alternarColumna(columna: ColumnaLista): void {
  almacen.set((prev) => {
    const visible = prev.columnas.includes(columna);
    const siguiente = visible ? prev.columnas.filter((c) => c !== columna) : [...prev.columnas, columna];
    // Nunca se queda sin columnas: quitar la última dejaría una tabla vacía.
    if (!siguiente.length) return prev;
    return { ...prev, columnas: siguiente };
  });
}

export function restaurarPreferencias(): void {
  almacen.set(() => ({ ...DE_FABRICA, columnas: [...COLUMNAS_LISTA] }));
}

/* ------------------------------------------------------------------ */
/* Detección de equipo modesto                                         */
/* ------------------------------------------------------------------ */

interface NavegadorConSenales extends Navigator {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

/**
 * ¿Este equipo pide un modo ligero?
 *
 * Las señales son indicios, no certezas, y por eso se combinan: dos núcleos, o
 * menos de 4 GB declarados, o el ahorro de datos activado, o un puntero cuya
 * actualización el navegador declara lenta (`update: slow`, que es lo que
 * reportan las pantallas de tinta electrónica y algunos equipos con
 * aceleración desactivada). Cualquiera de ellas basta: equivocarse hacia el modo
 * ligero cuesta un poco de brillo; equivocarse al revés cuesta una interfaz que
 * se arrastra.
 */
export function equipoModesto(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const nav = navigator as NavegadorConSenales;
  if (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 2) return true;
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory > 0 && nav.deviceMemory < 4) return true;
  if (nav.connection?.saveData === true) return true;
  if (window.matchMedia?.("(update: slow)").matches) return true;
  return false;
}

/**
 * ¿Está el modo ligero activo ahora mismo?
 *
 * `auto` mira las señales del equipo y la medición de fotogramas si ya se hizo.
 */
export function modoLigeroActivo(prefs = obtenerPreferencias()): boolean {
  if (prefs.modoLigero === "si") return true;
  if (prefs.modoLigero === "no") return false;
  return equipoModesto() || fotogramasPerdidosDetectados;
}

/**
 * ¿Conviene precargar expedientes en segundo plano?
 *
 * ── Por qué esto NO es el modo ligero ───────────────────────────────────────
 * La primera versión de esto ataba la precarga al modo ligero, y estaba mal.
 * Son dos costes distintos: el modo ligero recorta trabajo de PINTADO —sombras,
 * desenfoques, transiciones—, mientras la precarga gasta RED y cuota de Apps
 * Script. En un equipo lento la precarga es justamente lo que más ayuda, porque
 * abrir un expediente allí es lo que más se nota; apagarla por «modesto» era
 * castigar dos veces a la misma máquina.
 *
 * Lo que sí la apaga es la señal correcta: el ahorro de datos del sistema, que
 * es la persona diciendo explícitamente «no descargues nada que no te haya
 * pedido», y la preferencia del módulo.
 */
export function precargaActiva(prefs = obtenerPreferencias()): boolean {
  if (!prefs.precarga) return false;
  if (typeof navigator === "undefined") return false;
  return (navigator as NavegadorConSenales).connection?.saveData !== true;
}

let fotogramasPerdidosDetectados = false;

/**
 * Mide los fotogramas de la primera interacción y decide.
 *
 * ── Cómo se mide sin mentir ─────────────────────────────────────────────────
 * Se cuentan los fotogramas reales durante una ventana corta con
 * `requestAnimationFrame`. Si el equipo entrega menos de 40 fps sostenidos
 * mientras la persona está interactuando, el modo automático se enciende. NO se
 * mide en reposo: un navegador en segundo plano baja a 1 fps a propósito y
 * medirlo ahí encendería el modo ligero en una máquina perfecta.
 *
 * La medición se hace UNA vez por sesión y no se persiste: el mismo navegador en
 * otro momento puede ir sobrado.
 */
export function medirFluidez(ms = 900): void {
  if (typeof window === "undefined" || typeof requestAnimationFrame !== "function") return;
  if (fotogramasPerdidosDetectados) return;
  if (document.visibilityState === "hidden") return;

  let fotogramas = 0;
  const inicio = performance.now();
  const paso = () => {
    fotogramas += 1;
    const transcurrido = performance.now() - inicio;
    if (transcurrido < ms) {
      requestAnimationFrame(paso);
      return;
    }
    const fps = (fotogramas * 1000) / transcurrido;
    if (fps < 40) {
      fotogramasPerdidosDetectados = true;
      // Se notifica al almacén sin cambiar la preferencia: la persona sigue en
      // `auto` y puede desactivarlo cuando quiera.
      almacen.set((prev) => ({ ...prev }));
    }
  };
  requestAnimationFrame(paso);
}

/** Solo para pruebas: olvida la medición de fluidez. */
export function __reiniciarFluidezParaPruebas(): void {
  fotogramasPerdidosDetectados = false;
}
