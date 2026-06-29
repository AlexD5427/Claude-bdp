import { useEffect, useRef } from "react";

/**
 * A viewport-wide light that follows the pointer, lending the whole page a
 * sense of depth and "liquid" reactivity. A single passive listener updates
 * two CSS custom properties inside a `requestAnimationFrame` tick, so it stays
 * silky even on long pages. Pointer-events are disabled so it never blocks
 * clicks, and it bows out entirely for touch / reduced-motion users.
 */
export function CursorSpotlight() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (reduce || coarse) return;

    let raf = 0;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;

    const paint = () => {
      raf = 0;
      el.style.setProperty("--cursor-x", `${x}px`);
      el.style.setProperty("--cursor-y", `${y}px`);
    };

    const onMove = (e: MouseEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!raf) raf = requestAnimationFrame(paint);
      el.style.opacity = "1";
    };
    const onLeave = () => {
      el.style.opacity = "0";
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
      className="pointer-events-none fixed inset-0 z-[60] opacity-0 transition-opacity duration-500 no-print"
      style={{
        background:
          "radial-gradient(26rem 26rem at var(--cursor-x, 50%) var(--cursor-y, 50%), var(--spotlight), transparent 60%)",
        mixBlendMode: "screen",
      }}
    />
  );
}
