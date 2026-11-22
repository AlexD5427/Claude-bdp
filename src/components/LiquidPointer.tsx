import { useEffect } from "react";
import { useCalmMotion } from "../hooks/useCalmMotion";

/** Superficies que reciben la luz líquida. */
const SELECTOR_VIDRIO = ".glass, .glass-heavy";

/**
 * Área máxima (px²) de un vidrio que se ilumina. Por encima —un panel de módulo
 * a pantalla completa— repintar el reflejo en cada movimiento del puntero
 * costaría más de lo que luce, así que esas superficies se quedan con su brillo
 * estático.
 */
const AREA_MAXIMA = 420_000;

/**
 * Luz líquida del vidrio.
 *
 * UN solo oyente para toda la aplicación, en lugar de un `onMouseMove` por
 * tarjeta: localiza el vidrio que hay bajo el puntero, le pone `data-lit` y le
 * pasa la posición en `--glass-x` / `--glass-y`. El CSS (`.glass::before`)
 * pinta el reflejo DEBAJO del contenido y lo enciende o apaga con una
 * transición de `--glass-lit`.
 *
 * Trabajo por fotograma: como mucho un `closest()` y un
 * `getBoundingClientRect()`, dentro de `requestAnimationFrame`. Las variables
 * están registradas con `inherits: false`, así que cambiarlas no recalcula el
 * estilo de lo que hay dentro de la tarjeta. Con movimiento reducido o en
 * pantallas táctiles no se monta nada.
 */
export function LiquidPointer() {
  const calm = useCalmMotion();

  useEffect(() => {
    if (calm) return;
    const coincide = (consulta: string) =>
      typeof window.matchMedia === "function" ? window.matchMedia(consulta).matches : false;
    if (coincide("(hover: none)")) return;

    let raf = 0;
    let ultimoX = -1;
    let ultimoY = -1;
    /** Elemento bajo el puntero; `undefined` = hay que volver a buscarlo. */
    let pendiente: Element | null | undefined = null;
    let encendido: HTMLElement | null = null;

    const apagar = () => {
      if (encendido) {
        encendido.removeAttribute("data-lit");
        encendido = null;
      }
    };

    const pintar = () => {
      raf = 0;
      if (ultimoX < 0) return;
      const objetivo = pendiente === undefined ? document.elementFromPoint(ultimoX, ultimoY) : pendiente;
      const vidrio = objetivo ? objetivo.closest<HTMLElement>(SELECTOR_VIDRIO) : null;
      if (!vidrio) {
        apagar();
        return;
      }
      const caja = vidrio.getBoundingClientRect();
      if (caja.width * caja.height > AREA_MAXIMA) {
        apagar();
        return;
      }
      if (encendido !== vidrio) {
        apagar();
        encendido = vidrio;
        vidrio.setAttribute("data-lit", "");
      }
      vidrio.style.setProperty("--glass-x", `${Math.round(ultimoX - caja.left)}px`);
      vidrio.style.setProperty("--glass-y", `${Math.round(ultimoY - caja.top)}px`);
    };

    const programar = () => {
      if (!raf) raf = requestAnimationFrame(pintar);
    };

    const alMover = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      ultimoX = e.clientX;
      ultimoY = e.clientY;
      pendiente = e.target instanceof Element ? e.target : null;
      programar();
    };

    // Al desplazar, el puntero queda quieto pero el vidrio de debajo cambia.
    const alDesplazar = () => {
      if (ultimoX < 0) return;
      pendiente = undefined;
      programar();
    };

    const alSalir = () => {
      ultimoX = -1;
      ultimoY = -1;
      pendiente = null;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      apagar();
    };

    const raiz = document.documentElement;
    document.addEventListener("pointermove", alMover, { passive: true });
    window.addEventListener("scroll", alDesplazar, { passive: true, capture: true });
    raiz.addEventListener("mouseleave", alSalir);
    window.addEventListener("blur", alSalir);

    return () => {
      document.removeEventListener("pointermove", alMover);
      window.removeEventListener("scroll", alDesplazar, { capture: true });
      raiz.removeEventListener("mouseleave", alSalir);
      window.removeEventListener("blur", alSalir);
      if (raf) cancelAnimationFrame(raf);
      apagar();
    };
  }, [calm]);

  return null;
}
