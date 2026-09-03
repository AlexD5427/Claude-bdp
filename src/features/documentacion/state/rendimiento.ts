/**
 * Modo ligero: el módulo detecta el equipo y baja la carga gráfica.
 *
 * ── El problema real ────────────────────────────────────────────────────────
 * El área trabaja en equipos de oficina sin GPU dedicada. Con tres superficies
 * de vidrio apiladas —armazón, panel y chip—, cada fotograma obliga al navegador
 * a leer lo que hay debajo, desenfocarlo y recomponerlo. Medido con la CPU
 * estrangulada 4×, desplazar la lista de expedientes bajaba a doce fotogramas por
 * segundo y escribir una observación acumulaba tareas largas de más de 200 ms.
 *
 * ── Qué hace este módulo ────────────────────────────────────────────────────
 * Decide si conviene el modo ligero y publica la decisión. La decisión se toma
 * con tres fuentes, en este orden:
 *
 *   1. **lo que la persona eligió** (`si` / `no`), que manda siempre;
 *   2. **las señales del equipo**: núcleos, memoria, `prefers-reduced-motion`,
 *      `(update: slow)` y conexión ahorradora;
 *   3. **la medición real** de fotogramas perdidos en la primera interacción,
 *      que es la única fuente que no se puede falsear: hay equipos con ocho
 *      núcleos y una GPU integrada que se atraganta igual.
 *
 * ── Por qué la medición se hace una sola vez ────────────────────────────────
 * Porque medir cuesta: un `requestAnimationFrame` por fotograma durante un
 * segundo. Se hace en la primera interacción real —no al arrancar, donde todo
 * está ocupado cargando y cualquier equipo parece lento— y el resultado se
 * guarda en este equipo. Si el equipo mejora, la persona puede apagar el modo a
 * mano y su decisión gana.
 */

import { useEffect } from "react";
import { createStore } from "../../../shared/store";

/** Lo que la persona eligió. `auto` deja decidir a las señales del equipo. */
export type PreferenciaLigero = "auto" | "si" | "no";

interface EstadoLigero {
  preferencia: PreferenciaLigero;
  /** ¿Las señales del equipo piden modo ligero? */
  senales: boolean;
  /** ¿La medición de fotogramas detectó que el equipo no llega? */
  medido: boolean;
  /** ¿Ya se midió? Para no volver a hacerlo en cada interacción. */
  medicionHecha: boolean;
}

const CLAVE = "bdp-documentacion-rendimiento";

const INICIAL: EstadoLigero = {
  preferencia: "auto",
  senales: false,
  medido: false,
  medicionHecha: false,
};

const PREFERENCIAS: PreferenciaLigero[] = ["auto", "si", "no"];

const almacen = createStore<EstadoLigero>(INICIAL, {
  persistKey: CLAVE,
  serialize: (estado) => JSON.stringify({ preferencia: estado.preferencia, medido: estado.medido, medicionHecha: estado.medicionHecha }),
  deserialize: (raw) => {
    const guardado = JSON.parse(raw) as Partial<EstadoLigero>;
    return {
      ...INICIAL,
      // Se valida al leer: un `localStorage` editado a mano no puede dejar el
      // módulo en un estado imposible ni tumbar el arranque.
      preferencia: PREFERENCIAS.includes(guardado.preferencia as PreferenciaLigero)
        ? (guardado.preferencia as PreferenciaLigero)
        : "auto",
      medido: guardado.medido === true,
      medicionHecha: guardado.medicionHecha === true,
    };
  },
});

export const useEstadoLigero = almacen.use;

/**
 * Señales del equipo.
 *
 * Ninguna es concluyente por sí sola, así que se suman: dos o más señales
 * significan «este equipo va a sufrir». `deviceMemory` y `hardwareConcurrency`
 * no existen en todos los navegadores; cuando faltan, no cuentan (no se asume lo
 * peor: un Safari sin esas APIs no es un equipo lento).
 */
export function senalesDeEquipoModesto(): { ligero: boolean; motivos: string[] } {
  if (typeof window === "undefined" || typeof navigator === "undefined") return { ligero: false, motivos: [] };
  const motivos: string[] = [];

  const nucleos = (navigator as Navigator & { hardwareConcurrency?: number }).hardwareConcurrency;
  if (typeof nucleos === "number" && nucleos > 0 && nucleos <= 4) motivos.push(`${nucleos} núcleo(s)`);

  const memoria = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof memoria === "number" && memoria > 0 && memoria <= 4) motivos.push(`${memoria} GB de memoria`);

  const conexion = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conexion?.saveData === true) motivos.push("ahorro de datos activo");

  if (typeof window.matchMedia === "function") {
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) motivos.push("menos movimiento pedido");
      if (window.matchMedia("(update: slow)").matches) motivos.push("pantalla de refresco lento");
    } catch {
      /* un navegador que no entiende la consulta no aporta señal */
    }
  }

  return { ligero: motivos.length >= 2, motivos };
}

/**
 * Mide los fotogramas perdidos durante un segundo.
 *
 * Cuenta cuántos fotogramas llegan y con qué separación. Un equipo sano da unos
 * 60 en un segundo con separaciones de 16 ms; si llegan menos de 40 o hay
 * separaciones de más de 50 ms —una tarea larga que bloquea el hilo—, el módulo
 * asume que la carga gráfica sobra.
 */
export function medirFluidez(): Promise<{ fps: number; saltos: number }> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== "function") {
      resolve({ fps: 60, saltos: 0 });
      return;
    }
    const inicio = performance.now();
    let anterior = inicio;
    let fotogramas = 0;
    let saltos = 0;
    const paso = (ahora: number) => {
      fotogramas += 1;
      if (ahora - anterior > 50) saltos += 1;
      anterior = ahora;
      if (ahora - inicio < 1000) {
        requestAnimationFrame(paso);
        return;
      }
      resolve({ fps: Math.round((fotogramas * 1000) / (ahora - inicio)), saltos });
    };
    requestAnimationFrame(paso);
  });
}

/** Resuelve la decisión final a partir del estado. */
export function resolverLigero(estado: EstadoLigero): boolean {
  if (estado.preferencia === "si") return true;
  if (estado.preferencia === "no") return false;
  return estado.senales || estado.medido;
}

export function ponerPreferenciaLigero(preferencia: PreferenciaLigero): void {
  almacen.set((prev) => (prev.preferencia === preferencia ? prev : { ...prev, preferencia }));
}

/** Vuelve a medir a petición de la persona, desde el autodiagnóstico. */
export async function volverAMedirFluidez(): Promise<{ fps: number; saltos: number }> {
  const medicion = await medirFluidez();
  const insuficiente = medicion.fps < 40 || medicion.saltos >= 6;
  almacen.set((prev) => ({ ...prev, medido: insuficiente, medicionHecha: true }));
  return medicion;
}

/** Lee las señales del equipo una vez. La llama el armazón al montar. */
export function detectarSenales(): void {
  const { ligero } = senalesDeEquipoModesto();
  almacen.set((prev) => (prev.senales === ligero ? prev : { ...prev, senales: ligero }));
}

/**
 * ¿Toca modo ligero ahora?
 *
 * Además de devolver la decisión, programa la medición para la primera
 * interacción real. El efecto depende solo de `medicionHecha`, un booleano
 * estable: si dependiera de una función creada en cada renderizado se remontaría
 * en cada tecla y volvería a medir sin parar.
 */
export function useModoLigero(): boolean {
  const estado = useEstadoLigero();
  const ligero = resolverLigero(estado);

  useEffect(() => {
    detectarSenales();
  }, []);

  useEffect(() => {
    if (estado.medicionHecha) return;
    if (typeof window === "undefined") return;
    let cancelado = false;
    const medir = () => {
      if (cancelado) return;
      quitar();
      void volverAMedirFluidez();
    };
    const quitar = () => {
      window.removeEventListener("pointerdown", medir);
      window.removeEventListener("keydown", medir);
      window.removeEventListener("scroll", medir);
    };
    window.addEventListener("pointerdown", medir, { once: true });
    window.addEventListener("keydown", medir, { once: true });
    window.addEventListener("scroll", medir, { once: true, passive: true });
    return () => {
      cancelado = true;
      quitar();
    };
  }, [estado.medicionHecha]);

  return ligero;
}

/** Limpia el estado. Solo lo usan las pruebas. */
export function __reiniciarLigeroParaPruebas(): void {
  almacen.set(() => ({ ...INICIAL }));
}
