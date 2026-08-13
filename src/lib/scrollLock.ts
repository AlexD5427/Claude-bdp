/**
 * Bloqueo de desplazamiento del documento, contado por referencias.
 *
 * ## El problema que resuelve
 *
 * Nueve superficies distintas de la aplicación —el modal del cuestionario, el
 * visor de perfil, el visor ampliado del comparador, el expediente, el panel de
 * herramientas…— necesitan congelar el desplazamiento de la página mientras
 * están abiertas. Cada una lo hacía por su cuenta con el mismo patrón:
 *
 * ```ts
 * const previo = document.body.style.overflow;   // ¿y si otra ya puso "hidden"?
 * document.body.style.overflow = "hidden";
 * return () => { document.body.style.overflow = previo; };
 * ```
 *
 * Ese patrón sólo es correcto si nunca hay dos superficies solapadas. En cuanto
 * la segunda se abre encima de la primera, guarda `"hidden"` como su valor
 * «anterior» y, al cerrarse, lo **restaura**: la página se queda sin
 * desplazamiento y no hay forma de recuperarlo salvo recargar. Desde la silla
 * del analista eso se cuenta como «la página se congeló».
 *
 * ## La solución
 *
 * Un único contador. El valor original se guarda cuando el contador pasa de 0 a
 * 1 y se restaura sólo cuando vuelve a 0. Cada solicitante recibe una función de
 * liberación **idempotente**, así que un doble desmontaje —o un efecto que se
 * vuelve a ejecutar— no puede descompensar la cuenta.
 */

let depth = 0;
let previousOverflow = "";

/**
 * Congela el desplazamiento del documento y devuelve la función que lo libera.
 * Llamar a la función devuelta más de una vez no tiene efecto.
 */
export function lockBodyScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  if (depth === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  depth += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    depth = Math.max(0, depth - 1);
    if (depth === 0) document.body.style.overflow = previousOverflow;
  };
}

/** Cuántas superficies mantienen el bloqueo (para pruebas y diagnóstico). */
export function bodyScrollLockDepth(): number {
  return depth;
}
