/**
 * Movimiento del módulo de Documentación.
 *
 * ── Qué resuelve ────────────────────────────────────────────────────────────
 * Tres cosas que estaban repartidas por siete pantallas: saber si hay que
 * animar, con qué duración, y con qué curva. Sin esto, cada componente inventa
 * su `transition={{ duration: 0.18 }}` y el módulo se mueve a siete velocidades
 * distintas —que es exactamente lo que hace que una interfaz parezca improvisada.
 *
 * ── La preferencia de movimiento se lee de DOS sitios ────────────────────────
 * Del sistema (`prefers-reduced-motion`) y del interruptor «Reducir movimiento»
 * de Configuración, que la aplicación refleja como la clase `reduce-motion` en
 * `<html>`. Mirar solo el primero deja el interruptor de la aplicación sin
 * efecto en este módulo, que era el caso.
 *
 * ── Escala de duraciones ────────────────────────────────────────────────────
 *   rápida  120 ms — hover, foco, cambio de color, conmutadores
 *   normal  240 ms — chips, tooltips, filas, menús
 *   lenta   420 ms — paneles, drawers, cambio de sección
 *
 * Las salidas usan la duración rápida: al cerrar algo, la decisión ya está
 * tomada y esperar la animación es fricción.
 */

import { useEffect, useState } from "react";
import type { Transition, Variants } from "framer-motion";

/** Duraciones en segundos, espejo de `--doc-duration-*` del CSS. */
export const DURACION = {
  rapida: 0.12,
  normal: 0.24,
  lenta: 0.42,
} as const;

/** Curvas, espejo de `--doc-ease-*`. */
export const CURVA = {
  salidaExpo: [0.16, 1, 0.3, 1],
  salidaQuint: [0.22, 1, 0.36, 1],
  entradaSalida: [0.65, 0, 0.35, 1],
} as const;

/**
 * ¿Hay que evitar el movimiento?
 *
 * Cuando la respuesta es sí, las animaciones no se «suavizan»: se quitan. Media
 * animación sigue moviendo la pantalla de alguien que pidió que no se mueva.
 */
export function useMovimientoReducido(): boolean {
  const [reducido, setReducido] = useState(() => leerPreferencia());

  useEffect(() => {
    if (typeof window === "undefined") return;

    const consulta = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const actualizar = () => setReducido(leerPreferencia());

    actualizar();
    consulta?.addEventListener?.("change", actualizar);

    // El interruptor de la aplicación cambia una clase del `<html>`: se observa
    // el atributo en lugar de sondear.
    let observador: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined" && typeof document !== "undefined") {
      observador = new MutationObserver(actualizar);
      observador.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    }

    return () => {
      consulta?.removeEventListener?.("change", actualizar);
      observador?.disconnect();
    };
  }, []);

  return reducido;
}

function leerPreferencia(): boolean {
  if (typeof window === "undefined") return false;
  const porSistema = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  const porAjuste = typeof document !== "undefined" && document.documentElement.classList.contains("reduce-motion");
  return porSistema || porAjuste;
}

/* ------------------------------------------------------------------ */
/* Transiciones                                                        */
/* ------------------------------------------------------------------ */

export function transicion(reducido: boolean, velocidad: keyof typeof DURACION = "normal"): Transition {
  if (reducido) return { duration: 0 };
  return { duration: DURACION[velocidad], ease: CURVA.salidaQuint };
}

/** Resorte del panel lateral: entra con cuerpo, sin rebote perceptible. */
export function resorte(reducido: boolean): Transition {
  if (reducido) return { duration: 0 };
  return { type: "spring", stiffness: 280, damping: 30, mass: 0.9 };
}

/* ------------------------------------------------------------------ */
/* Variantes                                                           */
/* ------------------------------------------------------------------ */

/**
 * Cambio de sección: la que sale se va rápido y sin desplazarse mucho; la que
 * entra sube 6 px. No se usa `scale`, que en una tabla llena reflow y desenfoca
 * el texto durante la transición.
 */
export const SECCION: Variants = {
  oculto: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0 },
  salida: { opacity: 0, y: -4 },
};

/** Entrada escalonada muy corta, para grupos de pocas tarjetas. */
export const LISTA: Variants = {
  oculto: {},
  visible: { transition: { staggerChildren: 0.025, delayChildren: 0.01 } },
};

export const ITEM: Variants = {
  oculto: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
};

/** Aparición de chips y avisos: sin desplazamiento vertical, solo escala corta. */
export const CHIP: Variants = {
  oculto: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1 },
  salida: { opacity: 0, scale: 0.98 },
};

/**
 * Devuelve las props de animación de una sección, ya resueltas para la
 * preferencia de movimiento. Evita repetir el ternario en cada pantalla.
 */
export function propsSeccion(reducido: boolean) {
  return {
    variants: SECCION,
    initial: reducido ? false : ("oculto" as const),
    animate: "visible" as const,
    exit: reducido ? undefined : ("salida" as const),
    transition: reducido ? { duration: 0 } : { duration: DURACION.normal, ease: CURVA.salidaExpo },
  };
}
