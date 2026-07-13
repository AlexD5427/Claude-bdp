/**
 * Assessment dashboard view-state: search, filters, and view mode. Persisted
 * per browser. Filtering is client-side over the loaded summaries.
 */

import { createStore } from "../../../shared/store";
import type { AssessmentCategory } from "../domain/categories";
import type { AssessmentLifecycle, AssessmentPublication } from "../domain/lifecycle";
import type { AssessmentSummary } from "../domain/assessment";

export type AssessmentView = "table" | "cards" | "summary";

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
}

export function emptyAssessmentFilters(): AssessmentFilters {
  return { category: [], lifecycle: [], publication: [], tags: [] };
}

export const assessmentListStore = createStore<AssessmentListState>(
  { search: "", filters: emptyAssessmentFilters(), view: "cards" },
  { persistKey: "bdp-assessment-list-state" },
);

export function activeAssessmentFilterCount(f: AssessmentFilters): number {
  return f.category.length + f.lifecycle.length + f.publication.length + f.tags.length;
}

export function applyAssessmentFilters(
  items: AssessmentSummary[],
  state: AssessmentListState,
): AssessmentSummary[] {
  const q = state.search.toLowerCase().trim();
  const f = state.filters;
  return items.filter((a) => {
    if (q && ![a.code, a.name, a.category].some((v) => v.toLowerCase().includes(q))) return false;
    if (f.category.length && !f.category.includes(a.category)) return false;
    if (f.lifecycle.length && !f.lifecycle.includes(a.lifecycle)) return false;
    if (f.publication.length && !f.publication.includes(a.publication)) return false;
    if (f.tags.length && !f.tags.some((t) => a.tags.includes(t))) return false;
    return true;
  });
}
