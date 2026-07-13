/**
 * The AssessmentOS aggregate.
 *
 * `AssessmentDefinition` is the stable identity of an assessment across time.
 * Its content lives in `AssessmentVersion`s: a working `draft` plus zero or more
 * immutable `published` versions. Candidates who start a version stay pinned to
 * it; new assignments get the current published version. This split is what lets
 * us update assessments "live" without ever mutating historical attempts.
 */

import { z } from "zod";
import { ASSESSMENT_CATEGORIES } from "./categories";
import { ASSESSMENT_LIFECYCLE, ASSESSMENT_PUBLICATION } from "./lifecycle";
import { assessmentSectionSchema } from "./questions";
import { assessmentRuleSchema, rubricSchema } from "./rules";
import {
  accessibilityPolicySchema,
  attemptPolicySchema,
  consentPolicySchema,
  monitoringPolicySchema,
  navigationPolicySchema,
  randomizationPolicySchema,
  resultVisibilitySchema,
  resumePolicySchema,
  scoringPolicySchema,
  timingPolicySchema,
} from "./policies";

export const CURRENT_ASSESSMENT_SCHEMA_VERSION = 1;

export const SYNC_STATUSES = ["local", "pending", "synced", "conflict", "error"] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export const SOURCE_PROVIDERS = ["mock", "google-apps-script", "supabase"] as const;
export type SourceProvider = (typeof SOURCE_PROVIDERS)[number];

const isoDate = z.string().min(1);

/** Visual theme for the candidate-facing renderer (safe, token-based). */
export const assessmentThemeSchema = z.object({
  accent: z.enum(["cyan", "blue", "indigo", "emerald", "violet"]).default("cyan"),
  density: z.enum(["comfortable", "compact"]).default("comfortable"),
  showProgressBar: z.boolean().default(true),
});
export type AssessmentTheme = z.infer<typeof assessmentThemeSchema>;

/** The full editable content of one version. */
export const assessmentContentSchema = z.object({
  sections: z.array(assessmentSectionSchema).default([]),
  rules: z.array(assessmentRuleSchema).default([]),
  rubrics: z.array(rubricSchema).default([]),
  theme: assessmentThemeSchema.prefault({}),
  publicInstructions: z.string().max(8000).default(""),
  internalInstructions: z.string().max(8000).default(""),
});
export type AssessmentContent = z.infer<typeof assessmentContentSchema>;

export const assessmentVersionSchema = z.object({
  id: z.string(),
  /** Major.minor. Structural changes bump major; safe edits bump minor. */
  major: z.number().int().min(1).default(1),
  minor: z.number().int().min(0).default(0),
  state: z.enum(["draft", "published", "archived"]).default("draft"),
  notes: z.string().max(4000).default(""),
  content: assessmentContentSchema,
  createdAt: isoDate,
  createdBy: z.string().default(""),
  publishedAt: isoDate.nullable().default(null),
  publishedBy: z.string().default(""),
});
export type AssessmentVersion = z.infer<typeof assessmentVersionSchema>;

export const assessmentDefinitionSchema = z.object({
  id: z.string(),
  externalReference: z.string().max(120).default(""),
  code: z.string().max(60),
  name: z.string().min(1).max(200),
  description: z.string().max(8000).default(""),
  category: z.enum(ASSESSMENT_CATEGORIES).default("knowledge"),
  purpose: z.string().max(2000).default(""),

  lifecycle: z.enum(ASSESSMENT_LIFECYCLE).default("draft"),
  publication: z.enum(ASSESSMENT_PUBLICATION).default("unpublished"),

  linkedProcessIds: z.array(z.string()).default([]),
  ownerId: z.string().default(""),
  authorIds: z.array(z.string()).default([]),
  tags: z.array(z.string().max(60)).max(50).default([]),
  estimatedDurationMinutes: z.number().int().min(0).max(1440).default(0),

  availabilityStart: isoDate.nullable().default(null),
  availabilityEnd: isoDate.nullable().default(null),

  attemptPolicy: attemptPolicySchema.prefault({}),
  timingPolicy: timingPolicySchema.prefault({}),
  navigationPolicy: navigationPolicySchema.prefault({}),
  resumePolicy: resumePolicySchema.prefault({}),
  randomizationPolicy: randomizationPolicySchema.prefault({}),
  scoringPolicy: scoringPolicySchema.prefault({}),
  resultVisibility: resultVisibilitySchema.prefault({}),
  monitoringPolicy: monitoringPolicySchema.prefault({}),
  consentPolicy: consentPolicySchema.prefault({}),
  accessibilityPolicy: accessibilityPolicySchema.prefault({}),

  /** The working draft (always editable). */
  draftVersion: assessmentVersionSchema,
  /** Immutable published versions, newest last. */
  publishedVersions: z.array(assessmentVersionSchema).default([]),
  /** Id of the version currently assigned to new candidates (a published one). */
  currentPublishedVersionId: z.string().nullable().default(null),

  schemaVersion: z.number().int().default(CURRENT_ASSESSMENT_SCHEMA_VERSION),
  entityVersion: z.number().int().default(1),

  createdAt: isoDate,
  createdBy: z.string().default(""),
  updatedAt: isoDate,
  updatedBy: z.string().default(""),
  publishedAt: isoDate.nullable().default(null),

  sourceProvider: z.enum(SOURCE_PROVIDERS).default("mock"),
  synchronizationStatus: z.enum(SYNC_STATUSES).default("local"),
});
export type AssessmentDefinition = z.infer<typeof assessmentDefinitionSchema>;

/** Lightweight list projection — never ships full section content. */
export interface AssessmentSummary {
  id: string;
  code: string;
  name: string;
  category: AssessmentDefinition["category"];
  lifecycle: AssessmentDefinition["lifecycle"];
  publication: AssessmentDefinition["publication"];
  versionLabel: string;
  questionCount: number;
  estimatedDurationMinutes: number;
  ownerId: string;
  linkedProcessCount: number;
  tags: string[];
  updatedAt: string;
  synchronizationStatus: SyncStatus;
}

export function versionLabel(v: Pick<AssessmentVersion, "major" | "minor">): string {
  return `v${v.major}.${v.minor}`;
}

function countQuestions(content: AssessmentContent): number {
  return content.sections.reduce((n, s) => n + s.blocks.filter((b) => b.score.mode !== "none" || b.required || b.options.length > 0 || b.type.startsWith("q_")).length, 0);
}

export function toAssessmentSummary(a: AssessmentDefinition): AssessmentSummary {
  return {
    id: a.id,
    code: a.code,
    name: a.name,
    category: a.category,
    lifecycle: a.lifecycle,
    publication: a.publication,
    versionLabel: versionLabel(a.draftVersion),
    questionCount: countQuestions(a.draftVersion.content),
    estimatedDurationMinutes: a.estimatedDurationMinutes,
    ownerId: a.ownerId,
    linkedProcessCount: a.linkedProcessIds.length,
    tags: a.tags,
    updatedAt: a.updatedAt,
    synchronizationStatus: a.synchronizationStatus,
  };
}
