/**
 * Synchronization state.
 *
 * A small store tracking the last successful sync time, in-flight sync count,
 * and the active provider label. Feature UIs read this to render the
 * "Última sincronización" indicator and the manual "Sincronizar ahora" control.
 *
 * Conflict detection is handled at the repository boundary (entityVersion
 * comparison); this store surfaces the resulting `conflict` state to the UI.
 */

import { createStore } from "../../shared/store";
import { getProvider } from "../providers";

export interface SyncState {
  lastSyncedAt: string | null;
  inFlight: number;
  providerName: string;
  lastError: string | null;
}

const store = createStore<SyncState>({
  lastSyncedAt: null,
  inFlight: 0,
  providerName: getProvider().name,
  lastError: null,
});

export const syncState = {
  use: store.use,
  get: store.get,
  beginSync() {
    store.set((s) => ({ ...s, inFlight: s.inFlight + 1 }));
  },
  endSync(syncedAt?: string, error?: string | null) {
    store.set((s) => ({
      ...s,
      inFlight: Math.max(0, s.inFlight - 1),
      lastSyncedAt: syncedAt ?? s.lastSyncedAt,
      lastError: error ?? null,
    }));
  },
};

/**
 * Compare a locally edited entity's base version with the server's current
 * version to decide whether saving would overwrite someone else's change.
 */
export function detectStaleUpdate(
  baseEntityVersion: number,
  serverEntityVersion: number,
): boolean {
  return serverEntityVersion > baseEntityVersion;
}
