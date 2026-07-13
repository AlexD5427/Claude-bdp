/**
 * Motion presets built on Framer Motion (the app's animation engine).
 *
 * These favor transform + opacity, keep durations short, and are consumed by
 * the Process/Assessment surfaces. Components should pair them with the
 * `reduce-motion` class the app already toggles and/or `usePrefersReducedMotion`
 * so animations collapse to instant state changes when requested.
 */

import type { Transition, Variants } from "framer-motion";
import { DURATION } from "./tokens";

export const spring: Transition = {
  type: "spring",
  stiffness: 240,
  damping: 24,
};

export const easeOut: Transition = {
  duration: DURATION.base,
  ease: [0.22, 1, 0.36, 1],
};

/** Fade + rise, for page/section mounts. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: easeOut },
  exit: { opacity: 0, y: 8, transition: { duration: DURATION.fast } },
};

/** Staggered list entrance (table rows, cards). */
export const listContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.03, delayChildren: 0.02 } },
};

export const listItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: easeOut },
};

/** Drawer slide-in from the right. */
export const drawerRight: Variants = {
  hidden: { x: "100%" },
  show: { x: 0, transition: spring },
  exit: { x: "100%", transition: { duration: DURATION.base } },
};

/** Dialog pop. */
export const dialogPop: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: spring },
  exit: { opacity: 0, y: 12, scale: 0.98, transition: { duration: DURATION.fast } },
};

/**
 * Return motion props that respect a reduced-motion preference by collapsing
 * to a plain fade (no transform, near-instant).
 */
export function respectMotion(reduce: boolean, variants: Variants): Variants {
  if (!reduce) return variants;
  return {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { duration: 0.001 } },
    exit: { opacity: 0, transition: { duration: 0.001 } },
  };
}
