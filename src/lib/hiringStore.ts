import { useSyncExternalStore } from "react";
import { SCRIPT_URL } from "../constants";

/**
 * Hiring lifecycle store.
 *
 * The Google Sheet backend doesn't (yet) carry a hiring status or the dates we
 * need to measure recruitment performance, so we keep a small, resilient store
 * in `localStorage` that records, per candidate identificador:
 *
 *   · `firstSeenAt`  — when the candidate first entered a process (observed).
 *   · `status`       — "en_proceso" | "contratado" | "baja".
 *   · `contratadoAt` — when they were marked hired (drives Tiempo de Contratación).
 *   · `bajaAt`       — when they left (drives Tasa de Rotación).
 *
 * Every change is also POSTed (best-effort, fire-and-forget) to the backend with
 * a documented envelope so that, once the Apps Script side is deployed, the same
 * events persist to the "Dashboard y KPIs" sheet. Failures are swallowed — the
 * local store is the source of truth until the backend catches up.
 */

export type HiringStatus = "en_proceso" | "contratado" | "baja";

export interface HiringRecord {
  status: HiringStatus;
  firstSeenAt: string;
  contratadoAt?: string;
  bajaAt?: string;
}

export type HiringMap = Record<string, HiringRecord>;

const KEY = "bdp-hiring";

let state: HiringMap = load();
const listeners = new Set<() => void>();

function load(): HiringMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as HiringMap) : {};
  } catch {
    return {};
  }
}

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / private mode */
  }
}

function emit() {
  persist();
  for (const l of listeners) l();
}

/** Fire-and-forget backend sync (no-op until the Apps Script side exists). */
function syncBackend(id: string, record: HiringRecord) {
  try {
    void fetch(SCRIPT_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ type: "hiring_status", identificador: id, ...record }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Record `firstSeenAt` for any identificadores we haven't tracked yet. */
export function ensureSeen(ids: string[]) {
  let changed = false;
  const now = new Date().toISOString();
  const next = { ...state };
  for (const id of ids) {
    if (id && !next[id]) {
      next[id] = { status: "en_proceso", firstSeenAt: now };
      changed = true;
    }
  }
  if (changed) {
    state = next;
    emit();
  }
}

export function setStatus(id: string, status: HiringStatus) {
  const now = new Date().toISOString();
  const prev = state[id] ?? { status: "en_proceso", firstSeenAt: now };
  const record: HiringRecord = { ...prev, status };
  if (status === "contratado") record.contratadoAt = record.contratadoAt ?? now;
  if (status === "baja") record.bajaAt = now;
  state = { ...state, [id]: record };
  emit();
  syncBackend(id, record);
}

export function getRecord(id: string): HiringRecord | undefined {
  return state[id];
}

export function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getSnapshot(): HiringMap {
  return state;
}

/** React binding — re-renders when any status changes. */
export function useHiring(): HiringMap {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export const HIRING_LABELS: Record<HiringStatus, string> = {
  en_proceso: "En proceso",
  contratado: "Contratado",
  baja: "Baja",
};
