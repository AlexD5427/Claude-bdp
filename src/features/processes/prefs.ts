import { createStore } from "../../shared/store";
import { defaultFilters, type ProcessFilters } from "./filters";

/** Persisted user preferences for the Processes list (per browser profile). */
export type ProcessView = "table" | "cards" | "kanban" | "byProcess" | "analytics";
export type Density = "comfortable" | "compact";

export interface SavedView {
  id: string;
  name: string;
  filters: ProcessFilters;
}

export interface ProcessPrefs {
  view: ProcessView;
  density: Density;
  filters: ProcessFilters;
  savedViews: SavedView[];
}

export const processPrefsStore = createStore<ProcessPrefs>(
  {
    view: "table",
    density: "comfortable",
    filters: defaultFilters(),
    savedViews: [],
  },
  {
    key: "bdp-processos-prefs",
    hydrate: (raw, initial) => {
      if (!raw || typeof raw !== "object") return initial;
      const p = raw as Partial<ProcessPrefs>;
      return {
        view: p.view ?? initial.view,
        density: p.density ?? initial.density,
        filters: { ...initial.filters, ...(p.filters ?? {}) },
        savedViews: Array.isArray(p.savedViews) ? p.savedViews : [],
      };
    },
  },
);
