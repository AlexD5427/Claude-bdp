import type { Transition, Variants } from "framer-motion";

/**
 * Shared motion presets.
 *
 * Centralising the app's spring/tween curves keeps every drawer, dialog, tab,
 * card and toast feeling like one product. The values echo the existing
 * `ease-spring` Tailwind token so the new modules blend with the current UI.
 *
 * Reduced-motion is enforced globally in CSS (see `index.css`), which zeroes
 * transition/animation durations; these presets therefore describe the "full
 * motion" experience and are automatically dampened for users who opt out.
 */

export const SPRING: Transition = { type: "spring", stiffness: 260, damping: 26 };
export const SPRING_SNAPPY: Transition = { type: "spring", stiffness: 380, damping: 30 };
export const SPRING_SOFT: Transition = { type: "spring", stiffness: 180, damping: 24 };
export const EASE_OUT: Transition = { duration: 0.32, ease: [0.175, 0.885, 0.32, 1.275] };

/** Fade + rise, for section/page entrances. */
export const fadeUp: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: EASE_OUT },
  exit: { opacity: 0, y: 8, transition: { duration: 0.18 } },
};

/** Scale + fade, for cards and tiles. */
export const popIn: Variants = {
  initial: { opacity: 0, scale: 0.96, y: 10 },
  animate: { opacity: 1, scale: 1, y: 0, transition: SPRING },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.15 } },
};

/** Right-hand drawer slide. */
export const drawerRight: Variants = {
  initial: { x: "100%", opacity: 0.4 },
  animate: { x: 0, opacity: 1, transition: SPRING },
  exit: { x: "100%", opacity: 0.2, transition: { duration: 0.22, ease: "easeInOut" } },
};

/** Staggered list container. */
export const listStagger: Variants = {
  animate: { transition: { staggerChildren: 0.045, delayChildren: 0.02 } },
};
