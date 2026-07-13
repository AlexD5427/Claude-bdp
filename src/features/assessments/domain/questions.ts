/**
 * Question, option, block, and section schemas.
 *
 * A `type` is an open plugin key (validated against the registry at runtime with
 * a graceful fallback for unknown types — see question-types/registry). Type-
 * specific settings live in `config`, and value validation lives in `validation`;
 * both are passthrough records interpreted by the plugin, so new question types
 * never require a change to this schema (no giant switch statement).
 */

import { z } from "zod";

export const scoreModeSchema = z.enum([
  "none",
  "exact",
  "partial",
  "per_option",
  "weighted",
  "manual",
  "rubric",
]);
export type ScoreMode = z.infer<typeof scoreModeSchema>;

export const assessmentScoreRuleSchema = z.object({
  mode: scoreModeSchema.default("none"),
  points: z.number().min(0).max(100000).default(0),
  weight: z.number().min(0).max(1000).default(1),
  /** Rubric id when mode === "rubric". */
  rubricId: z.string().nullable().default(null),
  /** Competency dimension this question contributes to (optional). */
  competency: z.string().max(120).default(""),
  /** Normalize raw → 0..100 when reporting. */
  normalize: z.boolean().default(false),
});
export type AssessmentScoreRule = z.infer<typeof assessmentScoreRuleSchema>;

export const assessmentOptionSchema = z.object({
  id: z.string(),
  label: z.string().max(1000),
  value: z.string().max(200).default(""),
  /** Points contributed when selected (per_option / partial scoring). */
  score: z.number().default(0),
  /** Whether this option is a correct answer (never exposed publicly). */
  correct: z.boolean().default(false),
  feedback: z.string().max(2000).default(""),
  mediaUrl: z.string().max(2000).nullable().default(null),
});
export type AssessmentOption = z.infer<typeof assessmentOptionSchema>;

export const blockMediaSchema = z
  .object({
    kind: z.enum(["image", "video", "audio", "resource"]),
    url: z.string().max(2000),
    alt: z.string().max(400).default(""),
  })
  .nullable();

export const blockAccessibilitySchema = z.object({
  ariaLabel: z.string().max(400).default(""),
  longDescription: z.string().max(4000).default(""),
});

/**
 * The universal canvas item. Content blocks and questions share this shape; the
 * plugin decides which fields it uses. `AssessmentQuestion` is the semantic
 * alias for blocks whose plugin `kind === "question"`.
 */
export const assessmentBlockSchema = z.object({
  id: z.string(),
  type: z.string().min(1),
  order: z.number().int().default(0),
  code: z.string().max(80).default(""),
  label: z.string().max(4000).default(""),
  description: z.string().max(8000).default(""),
  helpText: z.string().max(4000).default(""),
  required: z.boolean().default(false),
  options: z.array(assessmentOptionSchema).default([]),
  config: z.record(z.string(), z.unknown()).prefault({}),
  validation: z.record(z.string(), z.unknown()).prefault({}),
  score: assessmentScoreRuleSchema.prefault({}),
  feedback: z
    .object({
      correct: z.string().max(2000).default(""),
      incorrect: z.string().max(2000).default(""),
      general: z.string().max(2000).default(""),
    })
    .prefault({}),
  media: blockMediaSchema.default(null),
  accessibility: blockAccessibilitySchema.prefault({}),
  tags: z.array(z.string().max(60)).max(30).default([]),
  analyticsKey: z.string().max(120).default(""),
});
export type AssessmentBlock = z.infer<typeof assessmentBlockSchema>;
export type AssessmentQuestion = AssessmentBlock;

export const assessmentSectionSchema = z.object({
  id: z.string(),
  title: z.string().max(300).default(""),
  description: z.string().max(4000).default(""),
  order: z.number().int().default(0),
  blocks: z.array(assessmentBlockSchema).default([]),
  config: z
    .object({
      timeLimitSeconds: z.number().int().min(0).max(86400).nullable().default(null),
      randomizeBlocks: z.boolean().default(false),
      /** When set, draw this many blocks at random from the section pool. */
      poolSize: z.number().int().min(0).max(1000).nullable().default(null),
      weight: z.number().min(0).max(1000).default(1),
    })
    .prefault({}),
});
export type AssessmentSection = z.infer<typeof assessmentSectionSchema>;
