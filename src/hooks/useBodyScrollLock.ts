import { useEffect } from "react";
import { lockBodyScroll } from "../lib/scrollLock";

/**
 * Congela el desplazamiento de la página mientras `active` sea verdadero.
 *
 * Se apoya en {@link lockBodyScroll}, que cuenta las superficies abiertas, de
 * modo que un modal encima de un visor ya no puede dejar la página bloqueada al
 * cerrarse (ver el comentario de `lib/scrollLock.ts`).
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return lockBodyScroll();
  }, [active]);
}
