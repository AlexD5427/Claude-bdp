import { useSyncExternalStore } from "react";

/**
 * "Heavy overlay" coordination.
 *
 * Full-screen, GPU-intensive surfaces — the assessment builder canvas, the
 * import wizard, large modals — compete with the animated WebGL/mesh background
 * for the compositor. Letting both run at once was a real cause of jank on
 * mid/low devices. Any such surface registers itself here on mount; the
 * background engines watch the count and pause their render loops while at least
 * one heavy overlay is open, then resume when it closes.
 *
 * It is a tiny reference-counted store (a surface may mount before another
 * unmounts), exposed through `useSyncExternalStore` like the rest of the app's
 * lightweight stores.
 */

let count = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Register a heavy overlay; returns a disposer that decrements the count. */
export function pushHeavyOverlay(): () => void {
  count += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    count = Math.max(0, count - 1);
    emit();
  };
}

export function getHeavyOverlayCount(): number {
  return count;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** `true` while any heavy overlay is open. */
export function useHeavyOverlayActive(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => count > 0,
    () => false,
  );
}

/** Imperative getter for non-React consumers (e.g. render loops). */
export function subscribeHeavyOverlay(cb: () => void): () => void {
  return subscribe(cb);
}
