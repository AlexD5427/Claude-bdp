import { getPlugin } from "./question-types/registry";
import type { AssessmentDefinition, AssessmentQuestion, AssessmentSection } from "./types";

/**
 * Scoring engine.
 *
 * Scoring definitions live on each question (`question.scoring`) and are kept
 * strictly separate from candidate-facing rendering — correct answers are never
 * part of the public DTO (see `publicDto.ts`). This module computes the maximum
 * attainable score of an assessment and grades a set of answers. It supports
 * exact, partial, weighted, per-option, manual and rubric modes, section
 * weighting, pass/fail thresholds and normalised percentages.
 *
 * Grading here is server-side-ready but pure: it never rejects a candidate
 * automatically — results are intended for human review.
 */

export interface QuestionScore {
  questionId: string;
  raw: number;
  max: number;
  requiresManualReview: boolean;
}

export interface AssessmentScore {
  raw: number;
  max: number;
  percentage: number;
  passed: boolean | null;
  perQuestion: QuestionScore[];
  requiresManualReview: boolean;
}

/** Maximum points a single question can contribute (before section weight). */
export function questionMaxPoints(q: AssessmentQuestion): number {
  const { scoring } = q;
  if (scoring.mode === "none") return 0;
  if (scoring.mode === "per_option") {
    return q.options.reduce((sum, o) => sum + Math.max(0, o.points ?? 0), 0);
  }
  return Math.max(0, scoring.points) * Math.max(0, scoring.weight || 1);
}

/** Total attainable points across the whole assessment. */
export function assessmentMaxPoints(a: AssessmentDefinition): number {
  let total = 0;
  for (const section of a.sections) {
    for (const q of section.questions) total += questionMaxPoints(q);
  }
  return total;
}

/** Number of scored questions (mode !== "none"). */
export function scoredQuestionCount(a: AssessmentDefinition): number {
  let n = 0;
  for (const section of a.sections) for (const q of section.questions) if (q.scoring.mode !== "none") n += 1;
  return n;
}

/** Grade a single question against a raw answer value. */
export function gradeQuestion(q: AssessmentQuestion, answer: unknown): QuestionScore {
  const max = questionMaxPoints(q);
  const base = { questionId: q.id, max, requiresManualReview: false };
  const { scoring } = q;

  switch (scoring.mode) {
    case "none":
      return { ...base, raw: 0 };
    case "manual":
    case "rubric":
      // Awaiting a reviewer — contributes 0 until manually scored.
      return { ...base, raw: 0, requiresManualReview: true };
    case "exact": {
      const correct = correctValues(q);
      const ok = correct.length > 0 && correct.includes(String(answer));
      const raw = ok ? scoring.points * (scoring.weight || 1) : scoring.allowNegative ? -Math.abs(scoring.points) : 0;
      return { ...base, raw };
    }
    case "per_option": {
      const chosen = Array.isArray(answer) ? answer.map(String) : [String(answer)];
      let raw = 0;
      for (const opt of q.options) {
        if (chosen.includes(opt.value)) raw += opt.points ?? 0;
      }
      return { ...base, raw };
    }
    case "partial": {
      // Multiple-choice partial credit: +per correct chosen, − per incorrect
      // chosen (only if negatives enabled), clamped to [0, max].
      const correct = new Set(correctValues(q));
      const chosen = new Set(Array.isArray(answer) ? answer.map(String) : [String(answer)]);
      if (correct.size === 0) return { ...base, raw: 0, requiresManualReview: true };
      const perCorrect = (scoring.points * (scoring.weight || 1)) / correct.size;
      let raw = 0;
      for (const value of chosen) {
        if (correct.has(value)) raw += perCorrect;
        else if (scoring.allowNegative) raw -= perCorrect;
      }
      return { ...base, raw: Math.max(0, Math.min(max, raw)) };
    }
    case "weighted": {
      const correct = correctValues(q);
      const ok = correct.includes(String(answer));
      return { ...base, raw: ok ? scoring.points * (scoring.weight || 1) : 0 };
    }
    default:
      return { ...base, raw: 0 };
  }
}

/** The set of correct option values / expected value for a question. */
export function correctValues(q: AssessmentQuestion): string[] {
  const plugin = getPlugin(q.type);
  if (plugin && !plugin.capabilities.correctAnswer && q.scoring.expectedValue == null) {
    // Type has no notion of correctness → no automatic grading.
    if (q.options.every((o) => !o.correct)) return [];
  }
  const fromOptions = q.options.filter((o) => o.correct).map((o) => o.value);
  if (fromOptions.length) return fromOptions;
  if (q.scoring.expectedValue != null) return [String(q.scoring.expectedValue)];
  return [];
}

/** Grade an entire assessment given a map of `questionId → answer`. */
export function gradeAssessment(a: AssessmentDefinition, answers: Record<string, unknown>): AssessmentScore {
  const perQuestion: QuestionScore[] = [];
  let raw = 0;
  let max = 0;
  let manual = false;

  for (const section of a.sections) {
    for (const q of section.questions) {
      if (q.scoring.mode === "none") continue;
      const score = gradeQuestion(q, answers[q.id]);
      perQuestion.push(score);
      raw += score.raw;
      max += score.max;
      if (score.requiresManualReview) manual = true;
    }
  }

  const percentage = max > 0 ? Math.round((raw / max) * 1000) / 10 : 0;
  const threshold = a.scoringPolicy.passThreshold;
  const passed = threshold == null || manual ? null : percentage >= threshold;

  return { raw, max, percentage, passed, perQuestion, requiresManualReview: manual };
}

/** Estimate the reading/answer time for an assessment, in seconds. */
export function estimateDuration(sections: AssessmentSection[]): number {
  let seconds = 0;
  for (const section of sections) {
    for (const q of section.questions) {
      if (q.type === "essay") {
        seconds += 180;
        continue;
      }
      switch (q.family) {
        case "content":
          seconds += 10;
          break;
        case "scenario":
          seconds += 180;
          break;
        case "technical":
          seconds += 240;
          break;
        case "text":
          seconds += 45;
          break;
        case "matrix":
          seconds += 60;
          break;
        default:
          seconds += 25;
      }
    }
  }
  return seconds;
}
