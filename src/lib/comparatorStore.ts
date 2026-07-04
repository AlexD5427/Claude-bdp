import { useSyncExternalStore } from "react";

/**
 * Comparator session store.
 *
 * The Comparador used to lose all its state whenever the operator switched
 * modules — React unmounts the module, so the list of added candidates and the
 * chosen view options were gone on return. This store fixes that: it keeps the
 * comparison (which candidates, in what order) and the per-session view options
 * in `sessionStorage`, so navigating away to Configuración and back restores
 * everything exactly as it was.
 *
 * `sessionStorage` (not `localStorage`) is deliberate: the recruitment team
 * asked for these preferences to live **only for the current session**. They
 * survive module changes and in-tab reloads but reset when the tab is closed,
 * so every fresh visit starts from a clean, empty comparator.
 */

export type ComparatorSectionId =
  | "resultados"
  | "competencias"
  | "conocimientos"
  | "herramientas"
  | "integridad"
  | "observaciones";

/** Ordered list of the comparison's report sections. */
export const COMPARATOR_SECTION_IDS: ComparatorSectionId[] = [
  "resultados",
  "competencias",
  "conocimientos",
  "herramientas",
  "integridad",
  "observaciones",
];

export const COMPARATOR_SECTION_LABELS: Record<ComparatorSectionId, string> = {
  resultados: "Resultados de Evaluación",
  competencias: "Competencias o Habilidades",
  conocimientos: "Conocimientos Técnicos",
  herramientas: "Manejo de Herramientas u otros",
  integridad: "Integridad y Confiabilidad",
  observaciones: "Observaciones Recientes",
};

export interface ComparatorState {
  /** Candidate ids added to the comparison, in insertion order. */
  selectedIds: string[];
  /** Show the "Ajuste y Brecha" line inside every competency chip. */
  showAjusteBrecha: boolean;
  /** Compact ("Compacto") grid so more candidates fit on screen / one page. */
  dense: boolean;
  /** Which report sections are visible at all. */
  sectionVisible: Record<ComparatorSectionId, boolean>;
  /** Which visible sections are folded (collapsed) to save vertical space. */
  sectionCollapsed: Record<ComparatorSectionId, boolean>;
}

const KEY = "bdp-comparador-session";

function allSections(value: boolean): Record<ComparatorSectionId, boolean> {
  return COMPARATOR_SECTION_IDS.reduce(
    (acc, id) => {
      acc[id] = value;
      return acc;
    },
    {} as Record<ComparatorSectionId, boolean>,
  );
}

export function defaultComparatorState(): ComparatorState {
  return {
    selectedIds: [],
    showAjusteBrecha: true,
    dense: false,
    sectionVisible: allSections(true),
    sectionCollapsed: allSections(false),
  };
}

function load(): ComparatorState {
  const base = defaultComparatorState();
  if (typeof window === "undefined") return base;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<ComparatorState>;
    return {
      ...base,
      ...parsed,
      selectedIds: Array.isArray(parsed.selectedIds) ? parsed.selectedIds : [],
      // Merge section maps so newly added section ids get sane defaults.
      sectionVisible: { ...base.sectionVisible, ...(parsed.sectionVisible ?? {}) },
      sectionCollapsed: { ...base.sectionCollapsed, ...(parsed.sectionCollapsed ?? {}) },
    };
  } catch {
    return base;
  }
}

let state: ComparatorState = load();
const listeners = new Set<() => void>();

function emit() {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / private mode */
  }
  for (const l of listeners) l();
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

export function setSelectedIds(ids: string[]): void {
  state = { ...state, selectedIds: ids };
  emit();
}

export function addComparator(id: string, max: number): void {
  if (state.selectedIds.includes(id) || state.selectedIds.length >= max) return;
  state = { ...state, selectedIds: [...state.selectedIds, id] };
  emit();
}

export function removeComparator(id: string): void {
  state = { ...state, selectedIds: state.selectedIds.filter((x) => x !== id) };
  emit();
}

export function clearComparator(): void {
  state = { ...state, selectedIds: [] };
  emit();
}

export function setShowAjusteBrecha(value: boolean): void {
  state = { ...state, showAjusteBrecha: value };
  emit();
}

export function setDense(value: boolean): void {
  state = { ...state, dense: value };
  emit();
}

export function toggleSectionVisible(id: ComparatorSectionId, value: boolean): void {
  state = {
    ...state,
    sectionVisible: { ...state.sectionVisible, [id]: value },
  };
  emit();
}

export function setSectionCollapsed(id: ComparatorSectionId, value: boolean): void {
  state = {
    ...state,
    sectionCollapsed: { ...state.sectionCollapsed, [id]: value },
  };
  emit();
}

/** Restore every view option (sections, chips, density) to defaults — keeps the
 *  currently selected candidates untouched. */
export function resetComparatorView(): void {
  const base = defaultComparatorState();
  state = { ...base, selectedIds: state.selectedIds };
  emit();
}

/* ------------------------------------------------------------------ */
/* React binding                                                       */
/* ------------------------------------------------------------------ */

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot(): ComparatorState {
  return state;
}

export function useComparator(): ComparatorState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
