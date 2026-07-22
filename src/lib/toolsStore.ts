import { createStore } from "../shared/store";

/**
 * Whether the "Herramientas" quick-panel is open.
 *
 * It's a tiny in-memory boolean store (no persistence) shared by the floating
 * dock (which dims the other shortcuts and lights up the Herramientas button
 * while it's open) and the panel overlay itself.
 */
const store = createStore<boolean>(false);

export function openTools(): void {
  store.set(true);
}
export function closeTools(): void {
  store.set(false);
}
export function toggleTools(): void {
  store.set((v) => !v);
}
export function useToolsOpen(): boolean {
  return store.use();
}
