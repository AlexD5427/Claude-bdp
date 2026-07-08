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
  /** Approx. pixels per second the text travels while revealing the overflow. */
  speed = 24,
}: {
  text: string;
  className?: string;
  speed?: number;
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
          overflow > 0
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
