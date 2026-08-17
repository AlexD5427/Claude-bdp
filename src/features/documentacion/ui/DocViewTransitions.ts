/**
 * View Transitions API, con red debajo.
 *
 * ── Para qué se usa aquí ────────────────────────────────────────────────────
 * Para dos saltos donde la continuidad visual ayuda a no perder el sitio: de la
 * fila de la tabla al expediente abierto, y del cambio de sección del módulo.
 * En ambos casos el navegador interpola entre el antes y el después sin que la
 * pantalla parpadee.
 *
 * ── Por qué envuelto en una función ─────────────────────────────────────────
 * La API no está en todos los navegadores (Safari la incorporó tarde, Firefox
 * más), no debe correr cuando alguien pidió menos movimiento, y no debe bloquear
 * la navegación si falla. Las tres condiciones se comprueban en un sitio y el
 * resto del módulo llama a `conTransicionDeVista(...)` sin pensar en ellas.
 *
 * Si algo no está disponible, la actualización se aplica igual, sin animación:
 * el fallback es exactamente el comportamiento anterior.
 */

import type { CSSProperties } from "react";

type IniciarTransicion = (actualizar: () => void) => unknown;

/**
 * Devuelve la función del navegador si existe.
 *
 * Se accede por una vista `unknown` en lugar de declarar una interfaz que
 * extienda `Document`: la firma exacta de `startViewTransition` ha cambiado entre
 * versiones de los tipos del DOM, y este módulo solo necesita «una función que
 * recibe una actualización».
 */
function iniciarTransicion(): IniciarTransicion | undefined {
  if (typeof document === "undefined") return undefined;
  const documento = document as unknown as { startViewTransition?: IniciarTransicion };
  if (typeof documento.startViewTransition !== "function") return undefined;
  return documento.startViewTransition.bind(document) as IniciarTransicion;
}

/** ¿El navegador puede animar entre dos estados del DOM? */
export function soportaTransicionesDeVista(): boolean {
  return !!iniciarTransicion();
}

function movimientoReducido(): boolean {
  if (typeof window === "undefined") return false;
  const porSistema = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  const porAjuste = document.documentElement.classList.contains("reduce-motion");
  return porSistema || porAjuste;
}

/**
 * Aplica `actualizar()` dentro de una transición de vista si se puede.
 *
 * `actualizar` debe ser síncrono en lo que toca al DOM de React (un `setState`):
 * la API captura el estado anterior, ejecuta la función y captura el nuevo. Si se
 * pasara una promesa larga, la pantalla quedaría congelada mientras se resuelve
 * —motivo por el que aquí no se espera nada de red dentro de la transición.
 */
export function conTransicionDeVista(actualizar: () => void): void {
  const iniciar = iniciarTransicion();
  if (!iniciar || movimientoReducido()) {
    actualizar();
    return;
  }
  try {
    iniciar(() => {
      actualizar();
    });
  } catch {
    // Una transición que falla no puede costar la navegación.
    actualizar();
  }
}

/**
 * Nombre de vista para un elemento, listo para el `style` de React.
 *
 * `viewTransitionName` todavía no está en los tipos de CSS de esta versión de
 * React, así que se construye el objeto con la propiedad como índice. El nombre
 * debe ser único en la página: dos elementos con el mismo nombre hacen que el
 * navegador aborte la transición.
 */
export function nombreDeVista(nombre: string | null | undefined): CSSProperties {
  if (!nombre) return {};
  return { viewTransitionName: nombre } as CSSProperties;
}

/** Nombre estable y válido como identificador CSS para un expediente. */
export function vistaDeExpediente(expedienteId: string): string {
  return `doc-exp-${expedienteId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}
