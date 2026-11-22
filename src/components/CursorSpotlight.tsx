import { useEffect, useRef } from "react";
import { useCalmMotion } from "../hooks/useCalmMotion";

/** Fracción del camino que recorre la luz en cada fotograma: da la inercia. */
const SEGUIMIENTO = 0.18;

/**
 * Una luz amplia que sigue al puntero con un poco de inercia, como si la
 * página fuera un líquido que reacciona al movimiento.
 *
 * Optimización: antes se movía cambiando la posición de un degradado que
 * ocupaba toda la ventana, lo que obligaba a repintar la pantalla entera en
 * cada movimiento del ratón. Ahora la luz es un disco fijo que se traslada con
 * `transform` —trabajo del compositor, sin repintado— y el bucle de animación
 * se detiene solo en cuanto la luz alcanza al puntero.
 *
 * No intercepta clics y no se monta con pantallas táctiles ni con movimiento
 * reducido (del sistema o de Configuración).
 */
export function CursorSpotlight() {
  const capaRef = useRef<HTMLDivElement>(null);
  const luzRef = useRef<HTMLDivElement>(null);
  const calm = useCalmMotion();

  useEffect(() => {
    const capa = capaRef.current;
    const luz = luzRef.current;
    if (!capa || !luz || calm) return;

    // Guardado igual que el resto del sistema: hay entornos que exponen la
    // propiedad sin la función.
    const coincide = (consulta: string) =>
      typeof window.matchMedia === "function" ? window.matchMedia(consulta).matches : false;
    if (coincide("(pointer: coarse)") || coincide("(hover: none)")) return;

    let raf = 0;
    let objetivoX = window.innerWidth / 2;
    let objetivoY = window.innerHeight / 2;
    let x = objetivoX;
    let y = objetivoY;
    let visible = false;

    const colocar = () => {
      luz.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    };

    const paso = () => {
      x += (objetivoX - x) * SEGUIMIENTO;
      y += (objetivoY - y) * SEGUIMIENTO;
      colocar();
      raf = Math.abs(objetivoX - x) + Math.abs(objetivoY - y) > 0.5 ? requestAnimationFrame(paso) : 0;
    };

    const alMover = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      objetivoX = e.clientX;
      objetivoY = e.clientY;
      if (!visible) {
        // Al entrar, la luz aparece donde está el puntero, sin viajar.
        visible = true;
        x = objetivoX;
        y = objetivoY;
        colocar();
        capa.style.opacity = "1";
      }
      if (!raf) raf = requestAnimationFrame(paso);
    };

    const alSalir = () => {
      visible = false;
      capa.style.opacity = "0";
    };

    const raiz = document.documentElement;
    window.addEventListener("pointermove", alMover, { passive: true });
    raiz.addEventListener("mouseleave", alSalir);
    window.addEventListener("blur", alSalir);
    return () => {
      window.removeEventListener("pointermove", alMover);
      raiz.removeEventListener("mouseleave", alSalir);
      window.removeEventListener("blur", alSalir);
      if (raf) cancelAnimationFrame(raf);
      capa.style.opacity = "0";
    };
  }, [calm]);

  return (
    <div
      ref={capaRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60] overflow-hidden opacity-0 transition-opacity duration-500 no-print"
      style={{ mixBlendMode: "screen" }}
    >
      <div
        ref={luzRef}
        className="absolute left-0 top-0 h-[52rem] w-[52rem] will-change-transform"
        style={{
          background: "radial-gradient(closest-side, var(--spotlight), transparent 60%)",
          transform: "translate3d(50vw, 50vh, 0) translate(-50%, -50%)",
        }}
      />
    </div>
  );
}
