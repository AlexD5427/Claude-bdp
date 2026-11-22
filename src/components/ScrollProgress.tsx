import { motion, useScroll, useSpring } from "framer-motion";
import { useCalmMotion } from "../hooks/useCalmMotion";

/**
 * Hilo de luz que marca cuánto se ha leído del módulo.
 *
 * Los informes del comparador, los expedientes y los cuestionarios son largos;
 * la barra dice de un vistazo dónde se está sin mirar la barra de
 * desplazamiento. Se mueve solo con `transform: scaleX` (compositor) y un
 * resorte suave; con movimiento reducido sigue al desplazamiento sin resorte.
 */
export function ScrollProgress() {
  const calm = useCalmMotion();
  const { scrollYProgress } = useScroll();
  const suave = useSpring(scrollYProgress, {
    stiffness: 160,
    damping: 30,
    mass: 0.35,
    restDelta: 0.001,
  });

  return (
    <motion.div
      aria-hidden
      className="scroll-progress pointer-events-none fixed inset-x-0 top-0 z-[98] h-[3px] origin-left no-print"
      style={{ scaleX: calm ? scrollYProgress : suave }}
    />
  );
}
