import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Text that gently scrolls sideways when it is wider than its container, then
 * eases back to the start — so a long name is never clipped, it just glides to
 * reveal the rest and returns. When the text fits, or the user prefers reduced
 * motion, it renders as a static (truncated) label.
 */
export function ScrollingText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const clipRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    const measure = () => {
      const clip = clipRef.current;
      const el = textRef.current;
      if (!clip || !el) return;
      // 2px slack avoids a jitter from sub-pixel rounding.
      setOverflow(Math.max(0, el.scrollWidth - clip.clientWidth - 2));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (clipRef.current) ro.observe(clipRef.current);
    if (textRef.current) ro.observe(textRef.current);
    return () => ro.disconnect();
  }, [text]);

  const animate = overflow > 0 && !reduce;
  // Pace the travel by distance so long names don't whip across.
  const duration = Math.max(4, overflow / 22 + 3);

  return (
    <div ref={clipRef} className={`relative overflow-hidden ${className}`}>
      <motion.span
        ref={textRef}
        className="inline-block whitespace-nowrap"
        animate={animate ? { x: [0, 0, -overflow, -overflow, 0] } : { x: 0 }}
        transition={
          animate
            ? {
                duration,
                times: [0, 0.12, 0.5, 0.62, 1],
                ease: "easeInOut",
                repeat: Infinity,
                repeatDelay: 0.6,
              }
            : { duration: 0 }
        }
      >
        {text}
      </motion.span>
    </div>
  );
}
