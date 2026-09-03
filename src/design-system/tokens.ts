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

/**
 * Intenciones semánticas, con contraste real en los DOS temas.
 *
 * ── El fallo que esto corrige ───────────────────────────────────────────────
 * Los valores anteriores estaban pensados solo para fondo oscuro:
 * `text-cyan-200`, `text-emerald-200`, `text-amber-200`… Sobre el blanco del
 * tema claro, un tono 200 da una relación de contraste de entre 1.6:1 y 2.2:1,
 * cuando WCAG AA exige 4.5:1 en texto normal. El chip se leía en oscuro y
 * desaparecía en claro, y no lo detectaba ningún compilador.
 *
 * La solución no es elegir un tono intermedio —no existe uno que funcione en los
 * dos fondos—, sino que CADA TEMA tenga su valor. Se hace con variables CSS
 * declaradas en `src/index.css` (`--intent-*`), que el tema claro redefine: la
 * clase de Tailwind pasa a ser una referencia a la variable y el contraste lo
 * decide el tema. La prueba `contraste.test.ts` calcula la relación de cada par
 * en los dos temas y falla por debajo del umbral.
 */
export const INTENT: Record<Intent, IntentStyle> = {
  neutral: {
    chip: "bg-[color:var(--intent-neutral-bg)] text-[color:var(--intent-neutral-fg)] ring-1 ring-[color:var(--intent-neutral-ring)]",
    dot: "bg-[color:var(--intent-neutral-dot)]",
    text: "text-[color:var(--intent-neutral-fg)]",
  },
  info: {
    chip: "bg-[color:var(--intent-info-bg)] text-[color:var(--intent-info-fg)] ring-1 ring-[color:var(--intent-info-ring)]",
    dot: "bg-[color:var(--intent-info-dot)]",
    text: "text-[color:var(--intent-info-fg)]",
  },
  success: {
    chip: "bg-[color:var(--intent-success-bg)] text-[color:var(--intent-success-fg)] ring-1 ring-[color:var(--intent-success-ring)]",
    dot: "bg-[color:var(--intent-success-dot)]",
    text: "text-[color:var(--intent-success-fg)]",
  },
  warning: {
    chip: "bg-[color:var(--intent-warning-bg)] text-[color:var(--intent-warning-fg)] ring-1 ring-[color:var(--intent-warning-ring)]",
    dot: "bg-[color:var(--intent-warning-dot)]",
    text: "text-[color:var(--intent-warning-fg)]",
  },
  danger: {
    chip: "bg-[color:var(--intent-danger-bg)] text-[color:var(--intent-danger-fg)] ring-1 ring-[color:var(--intent-danger-ring)]",
    dot: "bg-[color:var(--intent-danger-dot)]",
    text: "text-[color:var(--intent-danger-fg)]",
  },
  accent: {
    chip: "bg-[color:var(--intent-accent-bg)] text-[color:var(--intent-accent-fg)] ring-1 ring-[color:var(--intent-accent-ring)]",
    dot: "bg-[color:var(--intent-accent-dot)]",
    text: "text-[color:var(--intent-accent-fg)]",
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
