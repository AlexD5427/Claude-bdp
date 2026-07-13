/**
 * Branching logic + rubric schemas.
 *
 * Logic rules are visual IF/AND/OR/NOT → THEN/ELSE constructs. Conditions read
 * answers, scores, section completion, etc.; actions show/hide/require/skip/
 * navigate/message/end. The validator (see logic module) detects circular
 * branches, missing targets, unreachable sections, contradictions, and invalid
 * references before an assessment can be published.
 */

import { z } from "zod";

export const conditionOperatorSchema = z.enum([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "includes",
  "not_includes",
  "is_empty",
  "is_not_empty",
  "answered",
  "not_answered",
]);
export type ConditionOperator = z.infer<typeof conditionOperatorSchema>;

export const conditionSourceSchema = z.object({
  kind: z.enum(["answer", "score", "section_score", "section_complete", "assessment_complete"]),
  /** id of the referenced block/section (empty for assessment-level sources). */
  ref: z.string().default(""),
});

export const ruleConditionSchema = z.object({
  id: z.string(),
  source: conditionSourceSchema,
  operator: conditionOperatorSchema,
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).default(""),
});
export type RuleCondition = z.infer<typeof ruleConditionSchema>;

export const ruleActionSchema = z.object({
  id: z.string(),
  type: z.enum(["show", "hide", "require", "optional", "skip", "navigate", "message", "end"]),
  /** Target block/section id for structural actions. */
  targetId: z.string().default(""),
  message: z.string().max(2000).default(""),
});
export type RuleAction = z.infer<typeof ruleActionSchema>;

export const assessmentRuleSchema = z.object({
  id: z.string(),
  name: z.string().max(200).default(""),
  enabled: z.boolean().default(true),
  /** Combine conditions with AND ("all") or OR ("any"). */
  combinator: z.enum(["all", "any"]).default("all"),
  /** Negate the combined condition result. */
  negate: z.boolean().default(false),
  conditions: z.array(ruleConditionSchema).default([]),
  thenActions: z.array(ruleActionSchema).default([]),
  elseActions: z.array(ruleActionSchema).default([]),
});
export type AssessmentRule = z.infer<typeof assessmentRuleSchema>;

/* ------------------------------- Rubrics -------------------------------- */

export const rubricLevelSchema = z.object({
  value: z.number(),
  label: z.string().max(120),
  anchor: z.string().max(1000).default(""),
});

export const rubricCriterionSchema = z.object({
  id: z.string(),
  name: z.string().max(200),
  description: z.string().max(2000).default(""),
  weight: z.number().min(0).max(1000).default(1),
  levels: z.array(rubricLevelSchema).default([]),
  reviewerGuidance: z.string().max(2000).default(""),
  requireComment: z.boolean().default(false),
});
export type RubricCriterion = z.infer<typeof rubricCriterionSchema>;

export const rubricSchema = z.object({
  id: z.string(),
  name: z.string().max(200),
  description: z.string().max(2000).default(""),
  criteria: z.array(rubricCriterionSchema).default([]),
});
export type Rubric = z.infer<typeof rubricSchema>;
