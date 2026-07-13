/**
 * Scoring engine.
 *
 * Aggregates per-block scores (via the plugin scorers) into section and
 * assessment totals, applying section weights and optional normalization. It
 * NEVER auto-rejects a candidate and never exposes correct answers; it only
 * computes numbers a reviewer interprets.
 */

import type { AssessmentContent } from "../domain/assessment";
import type { ScoringPolicy } from "../domain/policies";
import { resolvePlugin, type AnswerValue } from "../question-types/registry";

export type AnswerMap = Record<string, AnswerValue>;

export interface SectionScore {
  sectionId: string;
  raw: number;
  max: number;
  weight: number;
  needsReview: boolean;
}

export interface AssessmentScore {
  raw: number;
  max: number;
  /** 0..100, weighted across sections when a scoring mode is set. */
  normalized: number;
  sections: SectionScore[];
  needsReview: boolean;
  /** Whether the normalized score meets the pass threshold (informational). */
  passed: boolean | null;
}

export function scoreSection(
  content: AssessmentContent,
  sectionId: string,
  answers: AnswerMap,
): SectionScore {
  const section = content.sections.find((s) => s.id === sectionId);
  if (!section) return { sectionId, raw: 0, max: 0, weight: 1, needsReview: false };
  let raw = 0;
  let max = 0;
  let needsReview = false;
  for (const block of section.blocks) {
    const plugin = resolvePlugin(block.type);
    const result = plugin.score(block, answers[block.id] ?? null);
    raw += result.raw;
    max += result.max;
    needsReview = needsReview || result.needsReview;
  }
  return { sectionId, raw, max, weight: section.config.weight ?? 1, needsReview };
}

export function scoreAssessment(
  content: AssessmentContent,
  answers: AnswerMap,
  policy: ScoringPolicy,
): AssessmentScore {
  const sections = content.sections.map((s) => scoreSection(content, s.id, answers));
  const raw = sections.reduce((sum, s) => sum + s.raw, 0);
  const max = sections.reduce((sum, s) => sum + s.max, 0);
  const needsReview = sections.some((s) => s.needsReview);

  let normalized = 0;
  if (policy.mode === "weighted") {
    const totalWeight = sections.reduce((sum, s) => sum + s.weight, 0) || 1;
    const weighted = sections.reduce(
      (sum, s) => sum + (s.max > 0 ? (s.raw / s.max) * s.weight : 0),
      0,
    );
    normalized = Math.round((weighted / totalWeight) * 100);
  } else if (max > 0 && policy.mode !== "none") {
    normalized = Math.round((raw / max) * 100);
  }

  const passed =
    policy.passThreshold == null || policy.mode === "none"
      ? null
      : normalized >= policy.passThreshold;

  return { raw, max, normalized, sections, needsReview, passed };
}
