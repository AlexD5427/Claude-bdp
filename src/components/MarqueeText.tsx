import { useEffect, useRef, useState } from "react";

/**
 * Text that reveals itself when clipped.
 *
 * The comparator's first column lists the fields being audited; when a label is
 * wider than its cell it used to be hard-clipped with an ellipsis. This
 * component measures the text and, only when it actually overflows, gently
 * slides it left to expose the tail and glides it back to the start on a calm,
 * well-paced loop (with a rest at each end). When the label fits — or the user
 * prefers reduced motion — it renders as a plain, static string.
 */
export function MarqueeText({
  text,
  className = "",
  speed = 24,
  active,
}: {
  text: string;
  className?: string;
  speed?: number;
  /**
   * Cuándo puede moverse. Sin especificar, la marquesina corre siempre que el
   * texto no quepa (el comportamiento de la primera columna). Con `false` el
   * texto se queda quieto y sólo se recorta: así las celdas de texto largo del
   * comparador se mueven **únicamente** mientras hay un puntero encima.
   */
  active?: boolean;
}) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);

  useEffect(() => {
    const measure = () => {
      const wrap = wrapRef.current;
      const inner = innerRef.current;
      if (!wrap || !inner) return;
      const diff = inner.scrollWidth - wrap.clientWidth;
      setOverflow(diff > 4 ? diff : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    if (innerRef.current) ro.observe(innerRef.current);
    return () => ro.disconnect();
  }, [text]);

  const travel = overflow + 4;
  // The keyframe spends ~70% of the time moving; the rest is a pause at each
  // end. Solve for a total duration that keeps the travel speed roughly steady.
  const total = Math.max(6, ((travel / speed) * 2) / 0.7);
  const moving = overflow > 0 && active !== false;

  return (
    <span
      ref={wrapRef}
      className={`relative block overflow-hidden whitespace-nowrap ${className}`}
      title={text}
    >
      <span
        ref={innerRef}
        className="inline-block will-change-transform"
        style={
          moving
            ? {
                animation: `cmp-marquee ${total}s ease-in-out infinite`,
                ["--cmp-shift" as string]: `-${travel}px`,
              }
            : undefined
        }
      >
        {text}
      </span>
    </span>
  );
}
