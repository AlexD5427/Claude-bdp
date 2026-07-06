import { useSyncExternalStore } from "react";

/**
 * Universal KPI filters.
 *
 * A single, workspace-wide filter state that every KPI (Dashboard hero tiles and
 * each module's KPI bar) reads from, so the whole app narrows in unison. It
 * covers a temporal window (all / year / month / week / custom range) plus four
 * process dimensions sourced from the "Auxiliar" and "Espejo" sheets: Gerencia,
 * Agencia, Modalidad de Reclutamiento and Estado del Proceso.
 *
 * Persisted in sessionStorage so it survives module navigation but resets on a
 * fresh visit — the same lifetime the team chose for the comparator session.
 */

export type PeriodMode = "all" | "anio" | "mes" | "semana" | "rango";

export interface FilterState {
  periodMode: PeriodMode;
  /** ISO dates (yyyy-mm-dd) for the custom range. */
  from: string;
  to: string;
  gerencia: string; // "" = todas
  agencia: string;
  modalidad: string;
  estado: string;
}

const KEY = "bdp-kpi-filtros";

export function defaultFilters(): FilterState {
  return { periodMode: "all", from: "", to: "", gerencia: "", agencia: "", modalidad: "", estado: "" };
}

function load(): FilterState {
  const base = defaultFilters();
  if (typeof window === "undefined") return base;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return base;
    return { ...base, ...(JSON.parse(raw) as Partial<FilterState>) };
  } catch {
    return base;
  }
}

let state: FilterState = load();
const listeners = new Set<() => void>();

function emit() {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  for (const l of listeners) l();
}

export function setFilters(patch: Partial<FilterState>): void {
  state = { ...state, ...patch };
  emit();
}

export function resetFilters(): void {
  state = defaultFilters();
  emit();
}

/** Whether any filter is narrowing results. */
export function filtersActive(f: FilterState): boolean {
  return (
    f.periodMode !== "all" ||
    f.gerencia !== "" ||
    f.agencia !== "" ||
    f.modalidad !== "" ||
    f.estado !== ""
  );
}

/** Resolve the active temporal window to an [start, end] epoch range. */
export function periodRange(f: FilterState): { start: number; end: number } | null {
  const now = new Date();
  if (f.periodMode === "all") return null;
  if (f.periodMode === "anio") {
    return {
      start: new Date(now.getFullYear(), 0, 1).getTime(),
      end: new Date(now.getFullYear(), 11, 31, 23, 59, 59).getTime(),
    };
  }
  if (f.periodMode === "mes") {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).getTime(),
    };
  }
  if (f.periodMode === "semana") {
    const day = now.getDay(); // 0 = Sunday
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((day + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { start: monday.getTime(), end: sunday.getTime() };
  }
  // Custom range.
  const start = f.from ? new Date(f.from + "T00:00:00").getTime() : -Infinity;
  const end = f.to ? new Date(f.to + "T23:59:59").getTime() : Infinity;
  return { start, end };
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot(): FilterState {
  return state;
}

export function useFilters(): FilterState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
