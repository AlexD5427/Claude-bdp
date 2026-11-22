import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useCalmMotion } from "../hooks/useCalmMotion";

/**
 * Barrido de luz que cruza la pantalla al cambiar de módulo.
 *
 * Marca el cambio de contexto sin retrasarlo: el módulo nuevo se monta al
 * instante y el barrido pasa por encima, sin bloquear clics
 * (`pointer-events: none`). La capa solo existe mientras dura el barrido; en
 * reposo no queda nada montado. Con movimiento reducido no aparece.
 */
export function ModuleTransition({ moduleKey }: { moduleKey: string }) {
  const calm = useCalmMotion();
  const anterior = useRef(moduleKey);
  const [pulso, setPulso] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (anterior.current === moduleKey) return;
    anterior.current = moduleKey;
    setPulso((n) => n + 1);
    setVisible(true);
  }, [moduleKey]);

  if (calm || !visible) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[55] overflow-hidden no-print">
      <motion.div
        key={pulso}
        className="module-sweep"
        style={{ skewX: -16 }}
        initial={{ x: "-110%", opacity: 0 }}
        animate={{ x: "260%", opacity: [0, 1, 1, 0] }}
        transition={{
          x: { duration: 1.05, ease: [0.65, 0, 0.35, 1] },
          opacity: { duration: 1.05, times: [0, 0.15, 0.7, 1], ease: "linear" },
        }}
        onAnimationComplete={() => setVisible(false)}
      />
    </div>
  );
}
