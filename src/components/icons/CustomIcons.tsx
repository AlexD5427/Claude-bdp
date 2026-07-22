import { forwardRef, type SVGProps } from "react";

/**
 * Bespoke, stroke-only icons that match Lucide's drawing model so they animate
 * with {@link ../DrawIcon}: `fill=none`, `stroke=currentColor`, round caps and
 * every shape is a measurable geometry element (`path`, `line`, `circle`,
 * `rect`). They accept the same `className` / `strokeWidth` props as a
 * `LucideIcon`, so the dock treats them exactly like the built-in glyphs.
 */
export type IconProps = SVGProps<SVGSVGElement> & { strokeWidth?: number | string };

function baseProps(strokeWidth: number | string) {
  return {
    xmlns: "http://www.w3.org/2000/svg",
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

/**
 * Perfiles de Cargo — an ID/credential card with a person and detail lines,
 * evoking a structured "job profile" record.
 */
export const PerfilCargoIcon = forwardRef<SVGSVGElement, IconProps>(
  function PerfilCargoIcon({ strokeWidth = 2, ...rest }, ref) {
    return (
      <svg ref={ref} {...baseProps(strokeWidth)} {...rest}>
        <rect x="2.5" y="4.5" width="19" height="15" rx="2.6" />
        <circle cx="8" cy="10" r="2.1" />
        <path d="M4.7 16.2c0-1.9 1.5-3.2 3.3-3.2s3.3 1.3 3.3 3.2" />
        <line x1="14.5" y1="9" x2="18.7" y2="9" />
        <line x1="14.5" y1="12.3" x2="18.7" y2="12.3" />
        <line x1="14.5" y1="15.6" x2="17.3" y2="15.6" />
      </svg>
    );
  },
);

/**
 * Herramientas — two crossed open-end wrenches ("llaves inglesas"), the same
 * spanner drawn twice and rotated so they form the classic tools "X".
 */
const WRENCH =
  "M14.5 6.1a1 1 0 0 0 0 1.4l1.5 1.5a1 1 0 0 0 1.4 0l3.2-3.2a5 5 0 0 1-6.7 6.6L8 18.8a1.8 1.8 0 0 1-2.5-2.5l6.4-5.9a5 5 0 0 1 6.6-6.7z";

export const HerramientasIcon = forwardRef<SVGSVGElement, IconProps>(
  function HerramientasIcon({ strokeWidth = 2, ...rest }, ref) {
    return (
      <svg ref={ref} {...baseProps(strokeWidth)} {...rest}>
        <path d={WRENCH} />
        <path d={WRENCH} transform="rotate(90 12 12)" />
      </svg>
    );
  },
);
