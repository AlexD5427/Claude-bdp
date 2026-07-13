/**
 * Process list view-state: search, filters, sort, view mode, density, columns,
 * and saved views. Persisted per browser so the operator's preferences survive
 * reloads. Pure state + a small store — the module reads it reactively.
 */

import { createStore } from "../../../shared/store";
import type { ProcessStatus, PublicationStatus } from "../domain/status";
import type { ProcessSummary } from "../domain/models";

export type ProcessView = "table" | "cards" | "kanban" | "summary";
export type Density = "comfortable" | "compact";

export interface ProcessFilters {
  processStatus: ProcessStatus[];
  publicationStatus: PublicationStatus[];
  area: string[];
  department: string[];
  businessUnit: string[];
  location: string[];
  workMode: string[];
  employmentType: string[];
  experienceLevel: string[];
  visibility: string[];
  /** "active" | "closed" | "archived" | "all" */
  lifecycle: "active" | "closed" | "archived" | "all";
}

export interface SavedView {
  id: string;
  name: string;
  filters: ProcessFilters;
  view: ProcessView;
}

export type SortKey =
  | "title"
  | "code"
  | "area"
  | "vacancies"
  | "applications"
  | "updatedAt"
  | "openingDate"
  | "closingDate";

export interface ProcessListState {
  search: string;
  filters: ProcessFilters;
  view: ProcessView;
  density: Density;
  sort: { key: SortKey; dir: "asc" | "desc" };
  /** Column keys currently visible in the table. */
  visibleColumns: string[];
  savedViews: SavedView[];
}

export const DEFAULT_COLUMNS = [
  "code",
  "title",
  "area",
  "location",
  "vacancies",
  "applications",
  "assessments",
  "owner",
  "status",
  "publication",
  "opening",
  "closing",
  "updated",
  "actions",
];

export function emptyFilters(): ProcessFilters {
  return {
    processStatus: [],
    publicationStatus: [],
    area: [],
    department: [],
    businessUnit: [],
    location: [],
    workMode: [],
    employmentType: [],
    experienceLevel: [],
    visibility: [],
    lifecycle: "active",
  };
}

const initial: ProcessListState = {
  search: "",
  filters: emptyFilters(),
  view: "table",
  density: "comfortable",
  sort: { key: "updatedAt", dir: "desc" },
  visibleColumns: DEFAULT_COLUMNS,
  savedViews: [],
};

export const processListStore = createStore<ProcessListState>(initial, {
  persistKey: "bdp-process-list-state",
});

/** Count of active (non-default) filter facets, for the badge. */
export function activeFilterCount(f: ProcessFilters): number {
  let n = 0;
  n += f.processStatus.length;
  n += f.publicationStatus.length;
  n += f.area.length;
  n += f.department.length;
  n += f.businessUnit.length;
  n += f.location.length;
  n += f.workMode.length;
  n += f.employmentType.length;
  n += f.experienceLevel.length;
  n += f.visibility.length;
  if (f.lifecycle !== "active") n += 1;
  return n;
}

const CLOSED_STATES: ProcessStatus[] = ["closed", "finished", "cancelled"];

/** Apply filters + search + sort to a list of summaries (client-side). */
export function applyProcessFilters(
  items: ProcessSummary[],
  state: ProcessListState,
): ProcessSummary[] {
  const f = state.filters;
  const q = state.search.toLowerCase().trim();
  const filtered = items.filter((p) => {
    if (q && ![p.code, p.title, p.area, p.location, p.department].some((v) => v.toLowerCase().includes(q)))
      return false;
    if (f.processStatus.length && !f.processStatus.includes(p.processStatus)) return false;
    if (f.publicationStatus.length && !f.publicationStatus.includes(p.publicationStatus)) return false;
    if (f.area.length && !f.area.includes(p.area)) return false;
    if (f.department.length && !f.department.includes(p.department)) return false;
    if (f.businessUnit.length && !f.businessUnit.includes(p.businessUnit)) return false;
    if (f.location.length && !f.location.includes(p.location)) return false;
    if (f.workMode.length && !f.workMode.includes(p.workMode)) return false;
    if (f.employmentType.length && !f.employmentType.includes(p.employmentType)) return false;
    if (f.experienceLevel.length && !f.experienceLevel.includes(p.experienceLevel)) return false;
    if (f.visibility.length && !f.visibility.includes(p.visibility)) return false;
    if (f.lifecycle === "active" && (CLOSED_STATES.includes(p.processStatus) || p.processStatus === "archived"))
      return false;
    if (f.lifecycle === "closed" && !CLOSED_STATES.includes(p.processStatus)) return false;
    if (f.lifecycle === "archived" && p.processStatus !== "archived") return false;
    return true;
  });

  const { key, dir } = state.sort;
  const factor = dir === "asc" ? 1 : -1;
  return filtered.sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
    return String(av).localeCompare(String(bv), "es-MX") * factor;
  });
}

function sortValue(p: ProcessSummary, key: SortKey): string | number {
  switch (key) {
    case "vacancies":
      return p.vacancies;
    case "applications":
      return p.applications;
    case "updatedAt":
      return new Date(p.updatedAt).getTime();
    case "openingDate":
      return p.openingDate ? new Date(p.openingDate).getTime() : 0;
    case "closingDate":
      return p.closingDate ? new Date(p.closingDate).getTime() : 0;
    case "code":
      return p.code;
    case "area":
      return p.area;
    default:
      return p.title;
  }
}
