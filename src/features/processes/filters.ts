import type {
  ProcessStatus,
  ProcessSummary,
  PublicationStatus,
  Visibility,
} from "./types";

/**
 * Combinable, persistable filters for the Processes list. Kept as a pure module
 * (no React) so the same logic can be unit-tested and reused by table, cards and
 * Kanban views.
 */

export type AssessmentFilter = "all" | "with" | "without";
export type SortKey = "updated" | "opening" | "closing" | "title" | "vacancies" | "applications";
export type SortDir = "asc" | "desc";

export interface ProcessFilters {
  query: string;
  status: ProcessStatus[];
  publicationStatus: PublicationStatus[];
  visibility: Visibility[];
  area: string[];
  location: string[];
  assessments: AssessmentFilter;
  sortKey: SortKey;
  sortDir: SortDir;
}

export function defaultFilters(): ProcessFilters {
  return {
    query: "",
    status: [],
    publicationStatus: [],
    visibility: [],
    area: [],
    location: [],
    assessments: "all",
    sortKey: "updated",
    sortDir: "desc",
  };
}

/** Number of active (non-default) filter facets, for the "N filtros" badge. */
export function activeFilterCount(f: ProcessFilters): number {
  let n = 0;
  if (f.query.trim()) n += 1;
  n += f.status.length;
  n += f.publicationStatus.length;
  n += f.visibility.length;
  n += f.area.length;
  n += f.location.length;
  if (f.assessments !== "all") n += 1;
  return n;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Distinct, sorted facet values present in the current data. */
export function facetOptions(list: ProcessSummary[]) {
  const areas = new Set<string>();
  const locations = new Set<string>();
  for (const p of list) {
    if (p.area) areas.add(p.area);
    if (p.location) locations.add(p.location);
  }
  return {
    areas: [...areas].sort((a, b) => a.localeCompare(b, "es")),
    locations: [...locations].sort((a, b) => a.localeCompare(b, "es")),
  };
}

/** Apply the filters and sort to a list of summaries. */
export function applyFilters(list: ProcessSummary[], f: ProcessFilters): ProcessSummary[] {
  const q = norm(f.query.trim());
  const filtered = list.filter((p) => {
    if (q) {
      const haystack = norm(`${p.title} ${p.code} ${p.area} ${p.location}`);
      if (!haystack.includes(q)) return false;
    }
    if (f.status.length && !f.status.includes(p.status)) return false;
    if (f.publicationStatus.length && !f.publicationStatus.includes(p.publicationStatus)) return false;
    if (f.visibility.length && !f.visibility.includes(p.visibility)) return false;
    if (f.area.length && !f.area.includes(p.area)) return false;
    if (f.location.length && !f.location.includes(p.location)) return false;
    if (f.assessments === "with" && p.assessmentCount === 0) return false;
    if (f.assessments === "without" && p.assessmentCount > 0) return false;
    return true;
  });

  const dir = f.sortDir === "asc" ? 1 : -1;
  const byDate = (v: string | null) => (v ? new Date(v).getTime() : 0);
  filtered.sort((a, b) => {
    switch (f.sortKey) {
      case "title":
        return a.title.localeCompare(b.title, "es") * dir;
      case "vacancies":
        return (a.vacancies - b.vacancies) * dir;
      case "applications":
        return (a.applications - b.applications) * dir;
      case "opening":
        return (byDate(a.openingDate) - byDate(b.openingDate)) * dir;
      case "closing":
        return (byDate(a.closingDate) - byDate(b.closingDate)) * dir;
      case "updated":
      default:
        return (byDate(a.updatedAt) - byDate(b.updatedAt)) * dir;
    }
  });
  return filtered;
}
