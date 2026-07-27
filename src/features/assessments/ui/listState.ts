/**
 * Assessment dashboard view-state: search, filters, sorting, and view mode.
 * Persisted per browser. Filtering and sorting are client-side over the loaded
 * summaries (the module does not paginate — see docs/evaluations/DECISIONS.md D-18).
 */

import { createStore } from "../../../shared/store";
import type { AssessmentCategory } from "../domain/categories";
import type { AssessmentLifecycle, AssessmentPublication } from "../domain/lifecycle";
import type { AssessmentSummary } from "../domain/assessment";

export type AssessmentView = "table" | "cards" | "summary";
export type AssessmentSort = "recent" | "oldest" | "name" | "questions";

export interface AssessmentFilters {
  category: AssessmentCategory[];
  lifecycle: AssessmentLifecycle[];
  publication: AssessmentPublication[];
  tags: string[];
}

export interface AssessmentListState {
  search: string;
  filters: AssessmentFilters;
  view: AssessmentView;
  sort: AssessmentSort;
}

export function emptyAssessmentFilters(): AssessmentFilters {
  return { category: [], lifecycle: [], publication: [], tags: [] };
}

export const assessmentListStore = createStore<AssessmentListState>(
  { search: "", filters: emptyAssessmentFilters(), view: "cards", sort: "recent" },
  { persistKey: "bdp-assessment-list-state" },
);

export function activeAssessmentFilterCount(f: AssessmentFilters): number {
  return f.category.length + f.lifecycle.length + f.publication.length + f.tags.length;
}

export function applyAssessmentFilters(
  items: AssessmentSummary[],
  state: Pick<AssessmentListState, "search" | "filters">,
): AssessmentSummary[] {
  const q = state.search.toLowerCase().trim();
  const f = state.filters;
  return items.filter((a) => {
    // Search covers the title, the public code (what the candidate portal uses)
    // and the category label key.
    if (q && ![a.code, a.name, a.category].some((v) => v.toLowerCase().includes(q))) return false;
    if (f.category.length && !f.category.includes(a.category)) return false;
    if (f.lifecycle.length && !f.lifecycle.includes(a.lifecycle)) return false;
    if (f.publication.length && !f.publication.includes(a.publication)) return false;
    if (f.tags.length && !f.tags.some((t) => a.tags.includes(t))) return false;
    return true;
  });
}

/** Sort a filtered list. Default is most recently updated first. */
export function applyAssessmentSort(
  items: AssessmentSummary[],
  sort: AssessmentSort,
): AssessmentSummary[] {
  const copy = items.slice();
  switch (sort) {
    case "oldest":
      return copy.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    case "name":
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    case "questions":
      return copy.sort((a, b) => b.questionCount - a.questionCount);
    case "recent":
    default:
      return copy.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}

/** Aggregate counters for the list header. Derived from real data only. */
export function assessmentListStats(items: AssessmentSummary[]) {
  return {
    total: items.length,
    published: items.filter((a) => a.publication === "published").length,
    drafts: items.filter((a) => a.lifecycle === "draft").length,
    archived: items.filter((a) => a.lifecycle === "archived").length,
  };
}
