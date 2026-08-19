import { useEffect } from "react";

/**
 * Bloqueo de scroll del `body`, con recuento de referencias.
 *
 * ── El problema que resuelve ─────────────────────────────────────────────────
 * Media docena de superficies (modales, cajones, visores a pantalla completa)
 * hacían cada una lo mismo por su cuenta:
 *
 *     const previo = document.body.style.overflow;
 *     document.body.style.overflow = "hidden";
 *     return () => { document.body.style.overflow = previo; };
 *
 * Con UNA superficie funciona. Con DOS que se solapan, no: la segunda captura
 * `previo = "hidden"` (lo dejó la primera) y, al cerrarse en distinto orden,
 * restaura «hidden» de forma permanente. El resultado es una página que se queda
 * «congelada» —no scrollea y parece muerta— y hay que recargar. Es el fallo que
 * el área reportaba al salir de Configuración y de Perfiles.
 *
 * ── La solución ──────────────────────────────────────────────────────────────
 * Un único contador global. El primer bloqueo guarda el valor REAL de `overflow`
 * y lo pone en `hidden`; los siguientes solo suman. Al liberar, solo el último en
 * salir restaura el valor original. Así el orden de apertura y cierre deja de
 * importar y el `body` nunca se queda bloqueado por accidente.
 *
 * Cada llamada a `bloquearScroll()` devuelve una función `liberar` idempotente:
 * llamarla dos veces no descuenta de más.
 */

let refuerzos = 0;
let overflowOriginal: string | null = null;

export function bloquearScroll(): () => void {
  if (typeof document === "undefined") return () => {};

  if (refuerzos === 0) {
    overflowOriginal = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  refuerzos += 1;

  let liberado = false;
  return function liberar() {
    if (liberado) return;
    liberado = true;
    refuerzos = Math.max(0, refuerzos - 1);
    if (refuerzos === 0) {
      document.body.style.overflow = overflowOriginal ?? "";
      overflowOriginal = null;
    }
  };
}

/**
 * Red de seguridad: fuerza el desbloqueo pase lo que pase.
 *
 * Se llama al cambiar de módulo. Si por un fallo quedara un bloqueo colgado (por
 * ejemplo, un componente que se desmonta sin ejecutar su limpieza), esto devuelve
 * la interfaz a un estado usable sin recargar la página.
 */
export function reiniciarBloqueoScroll(): void {
  if (typeof document === "undefined") return;
  refuerzos = 0;
  document.body.style.overflow = overflowOriginal ?? "";
  overflowOriginal = null;
}

/**
 * Hook: bloquea el scroll mientras `activo` sea verdadero y el componente esté
 * montado. Libera al desmontar o cuando `activo` pasa a falso.
 */
export function useBloqueoScroll(activo: boolean = true): void {
  useEffect(() => {
    if (!activo) return;
    const liberar = bloquearScroll();
    return liberar;
  }, [activo]);
}
