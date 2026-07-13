/**
 * Assessment policy schemas.
 *
 * Each policy is an independent, validated object so the same delivery engine
 * can drive very different assessments (a timed technical test vs. an untimed
 * structured interview guide). Defaults are conservative and safe.
 */

import { z } from "zod";

export const attemptPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(100).default(1),
  /** Allow an authorized reviewer to reopen a completed attempt. */
  allowAuthorizedReopen: z.boolean().default(false),
});
export type AttemptPolicy = z.infer<typeof attemptPolicySchema>;

export const timingPolicySchema = z.object({
  mode: z.enum(["untimed", "total", "per_section", "per_question"]).default("untimed"),
  totalSeconds: z.number().int().min(0).max(86400).nullable().default(null),
  perQuestionSeconds: z.number().int().min(0).max(7200).nullable().default(null),
  graceSeconds: z.number().int().min(0).max(3600).default(0),
  /** Warn the candidate when this many seconds remain. */
  warnAtSeconds: z.number().int().min(0).max(3600).default(60),
  availabilityStart: z.string().nullable().default(null),
  availabilityEnd: z.string().nullable().default(null),
});
export type TimingPolicy = z.infer<typeof timingPolicySchema>;

export const navigationPolicySchema = z.object({
  mode: z.enum(["free", "sequential", "one_by_one"]).default("free"),
  allowBack: z.boolean().default(true),
  showProgress: z.boolean().default(true),
});
export type NavigationPolicy = z.infer<typeof navigationPolicySchema>;

export const resumePolicySchema = z.object({
  allowResume: z.boolean().default(true),
  /** Persist progress so a candidate can leave and return. */
  autosaveSeconds: z.number().int().min(0).max(600).default(20),
});
export type ResumePolicy = z.infer<typeof resumePolicySchema>;

export const randomizationPolicySchema = z.object({
  randomizeSections: z.boolean().default(false),
  randomizeQuestions: z.boolean().default(false),
  randomizeOptions: z.boolean().default(false),
  /** Deterministic seed strategy — the same candidate/attempt always matches. */
  seedStrategy: z.enum(["attempt", "candidate", "fixed"]).default("attempt"),
});
export type RandomizationPolicy = z.infer<typeof randomizationPolicySchema>;

export const scoringPolicySchema = z.object({
  mode: z.enum(["none", "sum", "weighted", "normalized"]).default("none"),
  passThreshold: z.number().min(0).max(100).nullable().default(null),
  /** Never auto-reject candidates on the basis of a score. */
  autoRejectBelowThreshold: z.literal(false).default(false),
  showScoreToCandidate: z.boolean().default(false),
});
export type ScoringPolicy = z.infer<typeof scoringPolicySchema>;

export const resultVisibilitySchema = z.object({
  candidate: z.enum(["none", "submission_only", "score", "score_and_feedback"]).default("none"),
  reviewer: z.enum(["score", "score_and_answers", "full"]).default("full"),
});
export type ResultVisibility = z.infer<typeof resultVisibilitySchema>;

export const monitoringPolicySchema = z.object({
  requireFullscreen: z.boolean().default(false),
  detectTabSwitch: z.boolean().default(false),
  /** No webcam/biometric proctoring is implemented; contract only. */
  proctoring: z.enum(["none"]).default("none"),
});
export type MonitoringPolicy = z.infer<typeof monitoringPolicySchema>;

export const consentPolicySchema = z.object({
  requireConsent: z.boolean().default(false),
  consentText: z.string().max(8000).default(""),
  requireDataPrivacyAcceptance: z.boolean().default(true),
});
export type ConsentPolicy = z.infer<typeof consentPolicySchema>;

export const accessibilityPolicySchema = z.object({
  allowExtraTime: z.boolean().default(true),
  extraTimeMultiplier: z.number().min(1).max(4).default(1),
  screenReaderFriendly: z.boolean().default(true),
  keyboardOnlyFriendly: z.boolean().default(true),
});
export type AccessibilityPolicy = z.infer<typeof accessibilityPolicySchema>;
