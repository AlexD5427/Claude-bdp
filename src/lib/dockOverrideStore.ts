import { useSyncExternalStore } from "react";
import type { DockPosition } from "./configStore";

/**
 * A transient override for the floating dock's anchor position.
 *
 * The Comparador asks the dock to glide to the **left edge** while the operator
 * scrolls down into the audit grid (the moment the compact name-chip strip
 * appears at the top). That frees the top of the screen for the sticky strip and
 * keeps the shortcuts reachable. This is a per-moment UI signal — not a saved
 * preference — so it lives in a tiny in-memory store rather than the config.
 *
 * `null` means "no override; use the user's configured dock position".
 */
let override: DockPosition | null = null;
const listeners = new Set<() => void>();

export function setDockOverride(pos: DockPosition | null): void {
  if (override === pos) return;
  override = pos;
  for (const l of listeners) l();
}

export function getDockOverride(): DockPosition | null {
  return override;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useDockOverride(): DockPosition | null {
  return useSyncExternalStore(subscribe, getDockOverride, getDockOverride);
}
