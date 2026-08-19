/**
 * Semantic design tokens for the Talent Acquisition modules.
 *
 * The Liquid Glass base (surfaces, borders, blur, ink, fills) is defined as CSS
 * custom properties in `src/index.css`. This file adds the *semantic* layer on
 * top: status intents, z-index scale, radii, and motion timings, expressed as
 * Tailwind class fragments so components stay declarative and theme-aware.
 *
 * State is NEVER communicated by color alone — every intent pairs a tint with a
 * label and (in components) an icon, satisfying WCAG 1.4.1.
 */

export type Intent =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "accent";

interface IntentStyle {
  /** Chip/pill background + text + ring, tuned for both themes. */
  chip: string;
  /** Solid dot used alongside labels. */
  dot: string;
  /** Text color for inline emphasis. */
  text: string;
}

export const INTENT: Record<Intent, IntentStyle> = {
  neutral: {
    chip: "bg-[color:var(--fill-2)] text-ink-soft ring-1 ring-[color:var(--hairline)]",
    dot: "bg-slate-400",
    text: "text-ink-soft",
  },
  info: {
    chip: "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/30",
    dot: "bg-cyan-400",
    text: "text-cyan-300",
  },
  success: {
    chip: "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30",
    dot: "bg-emerald-400",
    text: "text-emerald-300",
  },
  warning: {
    chip: "bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/30",
    dot: "bg-amber-400",
    text: "text-amber-300",
  },
  danger: {
    chip: "bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/30",
    dot: "bg-rose-400",
    text: "text-rose-300",
  },
  accent: {
    chip: "bg-indigo-500/15 text-indigo-200 ring-1 ring-indigo-400/30",
    dot: "bg-indigo-400",
    text: "text-indigo-300",
  },
};

/**
 * Escala de apilamiento.
 *
 * ── El fallo que corrige `dialog: 165` ──────────────────────────────────────
 * `GlassDialog` es la confirmación que usan los formularios grandes para
 * preguntar «¿salir sin guardar?». Valía 110, y el formulario de perfiles de cargo
 * que la abre vive en `z-[115]`: la confirmación aparecía **por detrás** del
 * formulario, así que «Descartar y salir» no se podía pulsar y Escape solo la
 * cancelaba. Quien entraba a modificar un perfil se quedaba **atrapado**: la única
 * salida era guardar o recargar la página. Es la otra mitad del «se congela» que
 * reportaba el área, esta vez en Perfiles.
 *
 * Una confirmación tiene que estar por encima de CUALQUIER superficie que la
 * pueda abrir. Las superficies de la aplicación llegan hasta 150 (celda ampliada
 * del comparador, visor de Evaluaciones), así que el diálogo va a 165 y por encima
 * solo queda el aviso flotante, que no bloquea nada.
 */
export const Z = {
  base: 0,
  sticky: 10,
  dropdown: 40,
  drawer: 90,
  dialog: 165,
  toast: 170,
} as const;

export const RADIUS = {
  sm: "rounded-xl",
  md: "rounded-2xl",
  lg: "rounded-3xl",
} as const;

/** Motion timings in seconds — short and productivity-focused. */
export const DURATION = {
  fast: 0.16,
  base: 0.28,
  slow: 0.4,
} as const;
