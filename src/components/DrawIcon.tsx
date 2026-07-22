import { useEffect, useRef, useState, type ComponentType } from "react";

/**
 * Any stroke-based icon component that accepts `className` + `strokeWidth`.
 * Lucide icons satisfy this, and so do the bespoke SVG icons in
 * `components/icons` — both animate identically through {@link DrawIcon}.
 */
export type DrawableIcon = ComponentType<{
  className?: string;
  strokeWidth?: number | string;
}>;

/** SVG geometry elements Lucide uses — all expose `getTotalLength()`. */
const GEOMETRY = "path, line, polyline, polygon, circle, rect, ellipse";

/** Fallback contour length when a browser can't measure a shape. */
const FALLBACK_LEN = 48;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

interface DrawIconProps {
  icon: DrawableIcon;
  /** When it flips to `true`, the icon re-draws its strokes from scratch. */
  active: boolean;
  className?: string;
  strokeWidth?: number;
  /** Total stroke-draw duration, in milliseconds. */
  duration?: number;
  /** Redraw once on mount and again whenever the icon is pointer-entered. */
  redrawOnHover?: boolean;
}

/**
 * Renders a Lucide icon that *draws itself* whenever it becomes active.
 *
 * The trick is a self-normalising "line draw": for every stroked sub-shape we
 * measure its real contour with `getTotalLength()`, then animate
 * `stroke-dashoffset` from that length back to `0`. Because each shape is
 * normalised to its own length, the strokes all complete in unison regardless
 * of size — so multi-part icons (e.g. the four tiles of `LayoutDashboard`)
 * paint cleanly instead of racing. Once the draw finishes we strip the inline
 * styles so the icon renders pixel-crisp at rest. Honours reduced-motion.
 */
export function DrawIcon({
  icon: Icon,
  active,
  className,
  strokeWidth = 2,
  duration = 520,
  redrawOnHover = false,
}: DrawIconProps) {
  const ref = useRef<HTMLSpanElement>(null);
  // A monotonically increasing pulse lets `redrawOnHover` re-trigger the draw
  // (on mount and on each pointer-enter) without changing the `active` prop.
  const [pulse, setPulse] = useState(0);

  // Kick off one draw on mount for self-driven (hover) icons.
  useEffect(() => {
    if (redrawOnHover) setPulse((p: number) => p + 1);
  }, [redrawOnHover]);

  useEffect(() => {
    const draw = active || (redrawOnHover && pulse > 0);
    const root = ref.current;
    const svg = root?.querySelector("svg");
    if (!svg) return;
    const shapes = Array.from(
      svg.querySelectorAll<SVGGeometryElement>(GEOMETRY),
    );

    const clear = () => {
      for (const s of shapes) {
        s.style.transition = "none";
        s.style.strokeDasharray = "";
        s.style.strokeDashoffset = "";
      }
    };

    // At rest (or for reduced-motion users) keep the icon fully painted.
    if (!draw || prefersReducedMotion()) {
      clear();
      return;
    }

    // 1 · Hide every stroke by offsetting a dash the length of its contour.
    const lengths = shapes.map((s) => {
      const len = typeof s.getTotalLength === "function" ? s.getTotalLength() : 0;
      return Number.isFinite(len) && len > 0 ? len : FALLBACK_LEN;
    });
    shapes.forEach((s, i) => {
      s.style.transition = "none";
      s.style.strokeDasharray = `${lengths[i]}`;
      s.style.strokeDashoffset = `${lengths[i]}`;
    });

    // 2 · Force a reflow so the hidden state is committed before we animate.
    void svg.getBoundingClientRect();

    // 3 · Re-draw, with a gentle per-shape stagger for a hand-drawn feel.
    const stagger = shapes.length > 1 ? Math.min(140, duration * 0.3) : 0;
    shapes.forEach((s, i) => {
      const delay = (i / Math.max(1, shapes.length)) * stagger;
      s.style.transition = `stroke-dashoffset ${duration}ms cubic-bezier(0.16, 0.84, 0.44, 1) ${delay}ms`;
      s.style.strokeDashoffset = "0";
    });

    // 4 · Tidy up the inline styles once the animation is done.
    const timer = window.setTimeout(clear, duration + stagger + 80);
    return () => window.clearTimeout(timer);
  }, [active, duration, pulse, redrawOnHover]);

  return (
    <span
      ref={ref}
      className="grid place-items-center"
      onPointerEnter={redrawOnHover ? () => setPulse((p: number) => p + 1) : undefined}
    >
      <Icon className={className} strokeWidth={strokeWidth} />
    </span>
  );
}
