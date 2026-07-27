/**
 * Plugin construction helpers + shared validators/scorers.
 *
 * These keep each plugin definition tiny and consistent. The default block is
 * schema-valid; validators enforce the common rules (required, length, numeric,
 * option constraints); scorers implement the standard scoring modes.
 */

import { newId } from "../../../shared/ids";
import {
  assessmentBlockSchema,
  assessmentOptionSchema,
  type AssessmentBlock,
  type AssessmentOption,
} from "../domain/questions";
import type { AnswerValue, ScoreResult, ValidationResult } from "./registry";

/** Build a schema-valid block with the given type and overrides. */
export function makeBlock(
  id: string,
  type: string,
  overrides: Partial<AssessmentBlock> = {},
): AssessmentBlock {
  return assessmentBlockSchema.parse({
    id,
    type,
    order: 0,
    ...overrides,
  });
}

/**
 * Build a schema-valid option. Every option must be created through this helper
 * (or the schema) so a new field added to `assessmentOptionSchema` can never be
 * silently omitted by a caller.
 */
export function makeOption(input: {
  id?: string;
  label: string;
  value?: string;
  score?: number;
  correct?: boolean;
  matchingKey?: string;
  feedback?: string;
  mediaUrl?: string | null;
}): AssessmentOption {
  return assessmentOptionSchema.parse({
    id: input.id ?? newId("opt"),
    label: input.label,
    value: input.value ?? input.label,
    score: input.score ?? 0,
    correct: input.correct ?? false,
    matchingKey: input.matchingKey ?? "",
    feedback: input.feedback ?? "",
    mediaUrl: input.mediaUrl ?? null,
  });
}

/** Is a candidate value considered "empty"? */
export function isEmpty(value: AnswerValue): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

/** Standard required-check used by most question plugins. */
export function validateRequired(
  block: AssessmentBlock,
  value: AnswerValue,
): ValidationResult {
  if (block.required && isEmpty(value)) {
    return { valid: false, message: "Este campo es obligatorio." };
  }
  return { valid: true };
}

/** Text length validation from `validation.minLength` / `maxLength`. */
export function validateTextLength(
  block: AssessmentBlock,
  value: AnswerValue,
): ValidationResult {
  const req = validateRequired(block, value);
  if (!req.valid) return req;
  if (typeof value !== "string") return { valid: true };
  const min = Number(block.validation.minLength ?? 0);
  const max = Number(block.validation.maxLength ?? Infinity);
  if (value.length < min) return { valid: false, message: `Mínimo ${min} caracteres.` };
  if (value.length > max) return { valid: false, message: `Máximo ${max} caracteres.` };
  return { valid: true };
}

/** Numeric validation from `validation.min` / `max` / `decimals`. */
export function validateNumeric(
  block: AssessmentBlock,
  value: AnswerValue,
): ValidationResult {
  const req = validateRequired(block, value);
  if (!req.valid) return req;
  if (isEmpty(value)) return { valid: true };
  const n = Number(value);
  if (!Number.isFinite(n)) return { valid: false, message: "Ingresa un número válido." };
  const min = block.validation.min;
  const max = block.validation.max;
  if (typeof min === "number" && n < min) return { valid: false, message: `El valor mínimo es ${min}.` };
  if (typeof max === "number" && n > max) return { valid: false, message: `El valor máximo es ${max}.` };
  return { valid: true };
}

/** Choice validation: enforce min/max selections for multi-select blocks. */
export function validateChoice(
  block: AssessmentBlock,
  value: AnswerValue,
): ValidationResult {
  const req = validateRequired(block, value);
  if (!req.valid) return req;
  if (Array.isArray(value)) {
    const min = Number(block.validation.minSelections ?? 0);
    const max = Number(block.validation.maxSelections ?? Infinity);
    if (value.length < min) return { valid: false, message: `Selecciona al menos ${min}.` };
    if (value.length > max) return { valid: false, message: `Selecciona máximo ${max}.` };
  }
  return { valid: true };
}

const zeroScore: ScoreResult = { raw: 0, max: 0, needsReview: false };

/** No-score content blocks. */
export function noScore(): ScoreResult {
  return zeroScore;
}

/**
 * Default scorer for answer questions that aren't option-based (text, numeric,
 * matrix, etc.). Anything with a scoring mode other than "none" that can't be
 * auto-graded here is flagged for manual review so a person finalizes it.
 */
export function scoreManualAware(block: AssessmentBlock): ScoreResult {
  if (block.score.mode === "none") return zeroScore;
  return { raw: 0, max: block.score.points, needsReview: true };
}

/**
 * Score a choice question. Supports exact (all-or-nothing), partial (sum of
 * selected correct option scores), and per_option (raw sum of chosen options).
 */
export function scoreChoice(block: AssessmentBlock, value: AnswerValue): ScoreResult {
  const mode = block.score.mode;
  if (mode === "none") return zeroScore;
  if (mode === "manual" || mode === "rubric") {
    return { raw: 0, max: block.score.points, needsReview: true };
  }

  const selected = new Set(
    Array.isArray(value) ? value.map(String) : value != null ? [String(value)] : [],
  );
  const correctOptions = block.options.filter((o) => o.correct);
  const max =
    mode === "per_option"
      ? block.options.reduce((s, o) => s + Math.max(0, o.score), 0)
      : block.score.points;

  if (mode === "exact") {
    const allCorrectSelected = correctOptions.every((o) => selected.has(o.value || o.id));
    const noIncorrectSelected = block.options
      .filter((o) => !o.correct)
      .every((o) => !selected.has(o.value || o.id));
    return {
      raw: allCorrectSelected && noIncorrectSelected ? block.score.points : 0,
      max,
      needsReview: false,
    };
  }

  // partial / per_option: sum the scores of selected options (clamped ≥ 0).
  const raw = block.options
    .filter((o) => selected.has(o.value || o.id))
    .reduce((s, o) => s + o.score, 0);
  return { raw: Math.max(0, raw), max, needsReview: false };
}
