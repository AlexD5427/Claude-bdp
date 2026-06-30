import { useEffect, useRef } from "react";
import { SCRIPT_URL } from "../constants";

/**
 * Monthly KPI snapshot store.
 *
 * Every render that has fresh data records the *current* month's values
 * (overwriting only the current month — past months stay frozen). This means
 * that whatever the figures are at the last update before the calendar flips
 * become that month's permanent snapshot, which is exactly the
 * "snapshot at month-end" behaviour requested. The authoritative, scheduled
 * snapshot is meant to run server-side (see docs/backend) via a time-driven
 * Apps Script trigger at 23:59 on the last day of each month; this client store
 * keeps the UI populated and is the fallback until that is deployed.
 */

export type KpiValues = Record<string, number | null>;
export interface Snapshot {
  month: string; // YYYY-MM
  values: KpiValues;
  updatedAt: string;
}
type Store = Record<string, Snapshot>;

const KEY = "bdp-kpi-history";

function load(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function save(store: Store) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(key: string, back: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 - back, 1);
  return monthKey(d);
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("es-BO", { month: "short" }).format(new Date(y, m - 1, 1));
}

/** Upsert the current month's snapshot (best-effort backend sync included). */
export function recordCurrent(values: KpiValues) {
  const store = load();
  const key = monthKey();
  store[key] = { month: key, values, updatedAt: new Date().toISOString() };
  save(store);
  try {
    void fetch(SCRIPT_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ type: "kpi_snapshot", month: key, values }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Previous calendar month's stored value for a KPI key (for MoM deltas). */
export function previousValue(key: string): number | null {
  const store = load();
  const prev = store[shiftMonth(monthKey(), 1)];
  if (!prev) return null;
  const v = prev.values[key];
  return v === undefined ? null : v;
}

/** Month-over-month delta for a KPI vs. the live current value. */
export function deltaVsPrev(key: string, current: number | null): number | null {
  const prev = previousValue(key);
  if (prev === null || current === null) return null;
  return Math.round((current - prev) * 10) / 10;
}

/**
 * Last `months` of history for a KPI key. The current month uses the live value
 * (more accurate than the just-written snapshot); past months use snapshots.
 */
export function history(
  key: string,
  current: number | null,
  months = 6,
): { label: string; value: number }[] {
  const store = load();
  const cur = monthKey();
  const out: { label: string; value: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const mk = shiftMonth(cur, i);
    const snap = store[mk];
    const raw = mk === cur ? current : (snap?.values[key] ?? null);
    out.push({ label: monthLabel(mk), value: raw ?? 0 });
  }
  return out;
}

/** Whether any past (non-current) month snapshots exist for this key. */
export function hasHistory(key: string): boolean {
  const store = load();
  const cur = monthKey();
  return Object.values(store).some((s) => s.month !== cur && s.values[key] != null);
}

/** Effect hook: persist the current value map whenever it changes. */
export function useKpiRecorder(values: KpiValues) {
  const last = useRef("");
  useEffect(() => {
    const sig = JSON.stringify(values);
    if (sig === last.current) return;
    last.current = sig;
    recordCurrent(values);
  }, [values]);
}
