import { useEffect, useRef } from "react";

/** Superficies que reciben el reflejo especular del cursor. */
const SUPERFICIES = ".glass, .glass-heavy, .glow";

/**
 * Por encima de esta fracción de la ventana, una superficie es un contenedor
 * de página (un módulo entero, una tabla larga) y no una tarjeta: moverle la
 * luz obligaría a recalcular el estilo de cientos de descendientes en cada
 * fotograma, y el reflejo ni siquiera se apreciaría.
 */
const AREA_MAXIMA = 0.6;

/**
 * A viewport-wide light that follows the pointer, lending the whole page a
 * sense of depth and "liquid" reactivity. Pointer-events are disabled so it
 * never blocks clicks, and it bows out entirely for touch / reduced-motion
 * users.
 *
 * Liquid Glass 2:
 * - La luz es una capa de tamaño fijo que se desplaza con `transform` (la mueve
 *   la GPU sin repintar). Antes se repintaba un degradado a pantalla completa
 *   en cada movimiento del ratón.
 * - Sigue al cursor con inercia, como una lámpara sobre un muelle, y el bucle
 *   se detiene en cuanto llega a su sitio.
 * - Además coloca el reflejo especular (`--gx` / `--gy`) de la superficie de
 *   vidrio que está bajo el puntero, así toda la aplicación reacciona a la luz
 *   sin que cada componente tenga que hacerlo por su cuenta.
 */
export function CursorSpotlight() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Guardado igual que el resto del sistema: hay entornos que exponen la
    // propiedad sin la función y aquí un fallo dejaría sin foco de luz a toda la
    // página.
    const mq = (q: string) =>
      typeof window.matchMedia === "function" ? window.matchMedia(q).matches : false;
    if (mq("(prefers-reduced-motion: reduce)") || mq("(pointer: coarse)")) return;

    let raf = 0;
    let objetivoX = window.innerWidth / 2;
    let objetivoY = window.innerHeight / 2;
    let x = objetivoX;
    let y = objetivoY;
    let superficie: HTMLElement | null = null;
    // Último reflejo escrito: sin cambios no se toca el estilo (cada escritura
    // obliga a recalcular la tarjeta entera).
    let ultimaSuperficie: HTMLElement | null = null;
    let ultimoGx = "";
    let ultimoGy = "";

    const pintar = () => {
      raf = 0;
      x += (objetivoX - x) * 0.2;
      y += (objetivoY - y) * 0.2;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;

      if (superficie) {
        const r = superficie.getBoundingClientRect();
        const pequena = r.width * r.height <= window.innerWidth * window.innerHeight * AREA_MAXIMA;
        if (pequena && r.width > 0 && r.height > 0) {
          const gx = `${(((objetivoX - r.left) / r.width) * 100).toFixed(1)}%`;
          const gy = `${(((objetivoY - r.top) / r.height) * 100).toFixed(1)}%`;
          if (superficie !== ultimaSuperficie || gx !== ultimoGx || gy !== ultimoGy) {
            superficie.style.setProperty("--gx", gx);
            superficie.style.setProperty("--gy", gy);
            ultimaSuperficie = superficie;
            ultimoGx = gx;
            ultimoGy = gy;
          }
        }
      }

      if (Math.abs(objetivoX - x) > 0.4 || Math.abs(objetivoY - y) > 0.4) {
        raf = requestAnimationFrame(pintar);
      }
    };

    const onMove = (e: MouseEvent) => {
      objetivoX = e.clientX;
      objetivoY = e.clientY;
      // Al entrar en la ventana la luz aparece ya bajo el cursor, en vez de
      // cruzar la pantalla desde donde se quedó.
      if (!el.classList.contains("is-on")) {
        x = objetivoX;
        y = objetivoY;
        el.classList.add("is-on");
      }
      superficie = e.target instanceof Element ? e.target.closest<HTMLElement>(SUPERFICIES) : null;
      if (!raf) raf = requestAnimationFrame(pintar);
    };
    const onLeave = () => {
      el.classList.remove("is-on");
      superficie = null;
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="lg-spotlight pointer-events-none fixed left-0 top-0 z-[60] no-print"
    />
  );
}
