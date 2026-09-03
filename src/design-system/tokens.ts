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
 * Estilos por intención, expresados con los TONOS del tema.
 *
 * ── El fallo que corrige ────────────────────────────────────────────────────
 * Estos chips llevaban colores fijos de Tailwind pensados para vidrio oscuro
 * (`bg-cyan-500/15 text-cyan-200`). Sobre el tema claro, un `text-cyan-200` es
 * casi blanco: el chip se veía, pero su etiqueta no. Medido: 1.6:1, frente al
 * 4.5:1 que exige la WCAG AA.
 *
 * La corrección no es «poner otro azul»: es que el color lo elija el TEMA. Cada
 * intención pide su trío `--tone-<nombre>-{bg,fg,ring,dot}`, que `src/index.css`
 * declara dos veces —una por tema— con contraste comprobado. El componente pide
 * la intención y no sabe de colores, que es lo que permite añadir un tema nuevo
 * sin tocar un solo `.tsx`.
 *
 * `features/documentacion/__tests__/contraste.test.ts` mide estos tonos en los
 * dos temas y falla por debajo del umbral.
 */
export const INTENT: Record<Intent, IntentStyle> = {
  neutral: {
    chip: "bg-[color:var(--tone-neutral-bg)] text-[color:var(--tone-neutral-fg)] ring-1 ring-[color:var(--tone-neutral-ring)]",
    dot: "bg-[color:var(--tone-neutral-dot)]",
    text: "text-[color:var(--tone-neutral-fg)]",
  },
  info: {
    chip: "bg-[color:var(--tone-info-bg)] text-[color:var(--tone-info-fg)] ring-1 ring-[color:var(--tone-info-ring)]",
    dot: "bg-[color:var(--tone-info-dot)]",
    text: "text-[color:var(--tone-info-fg)]",
  },
  success: {
    chip: "bg-[color:var(--tone-exito-bg)] text-[color:var(--tone-exito-fg)] ring-1 ring-[color:var(--tone-exito-ring)]",
    dot: "bg-[color:var(--tone-exito-dot)]",
    text: "text-[color:var(--tone-exito-fg)]",
  },
  warning: {
    chip: "bg-[color:var(--tone-aviso-bg)] text-[color:var(--tone-aviso-fg)] ring-1 ring-[color:var(--tone-aviso-ring)]",
    dot: "bg-[color:var(--tone-aviso-dot)]",
    text: "text-[color:var(--tone-aviso-fg)]",
  },
  danger: {
    chip: "bg-[color:var(--tone-peligro-bg)] text-[color:var(--tone-peligro-fg)] ring-1 ring-[color:var(--tone-peligro-ring)]",
    dot: "bg-[color:var(--tone-peligro-dot)]",
    text: "text-[color:var(--tone-peligro-fg)]",
  },
  accent: {
    chip: "bg-[color:var(--tone-acento-bg)] text-[color:var(--tone-acento-fg)] ring-1 ring-[color:var(--tone-acento-ring)]",
    dot: "bg-[color:var(--tone-acento-dot)]",
    text: "text-[color:var(--tone-acento-fg)]",
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
