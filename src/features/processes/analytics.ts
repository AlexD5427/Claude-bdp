import type { ProcessSummary } from "./types";

/**
 * Analytics projections for the Processes summary view.
 *
 * These are derived from the loaded summaries (real, not fabricated). Metrics
 * that would require data the transitional backend does not yet capture (e.g.
 * average publication duration) are intentionally omitted rather than faked;
 * see ANALYTICS foundations in the docs.
 */

export interface ProcessAnalytics {
  total: number;
  active: number;
  published: number;
  closingSoon: number;
  withoutAssessments: number;
  byArea: { label: string; value: number }[];
  byStatus: { label: string; value: number }[];
}

const ACTIVE_STATUSES = new Set(["publicado", "recepcion_activa", "aprobado", "programado"]);

export function computeProcessAnalytics(rows: ProcessSummary[]): ProcessAnalytics {
  const now = Date.now();
  const sevenDays = 7 * 86400000;

  const byAreaMap = new Map<string, number>();
  const byStatusMap = new Map<string, number>();
  let active = 0;
  let published = 0;
  let closingSoon = 0;
  let withoutAssessments = 0;

  for (const r of rows) {
    if (ACTIVE_STATUSES.has(r.status)) active += 1;
    if (r.publicationStatus === "publicado") published += 1;
    if (r.assessmentCount === 0) withoutAssessments += 1;
    if (r.closingDate) {
      const diff = new Date(r.closingDate).getTime() - now;
      if (diff > 0 && diff <= sevenDays) closingSoon += 1;
    }
    const area = r.area || "Sin área";
    byAreaMap.set(area, (byAreaMap.get(area) ?? 0) + 1);
    byStatusMap.set(r.status, (byStatusMap.get(r.status) ?? 0) + 1);
  }

  const toSorted = (m: Map<string, number>) =>
    [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

  return {
    total: rows.length,
    active,
    published,
    closingSoon,
    withoutAssessments,
    byArea: toSorted(byAreaMap).slice(0, 8),
    byStatus: toSorted(byStatusMap),
  };
}
