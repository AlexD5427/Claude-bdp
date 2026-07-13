/**
 * Supporting AssessmentOS entities: templates, question-bank items, import
 * jobs/issues, publishing records, and audit entries. These are separate
 * aggregates referenced by the assessment workflow.
 */

import { z } from "zod";
import { ASSESSMENT_CATEGORIES } from "./categories";
import { assessmentBlockSchema, assessmentSectionSchema } from "./questions";

const isoDate = z.string().min(1);

/* ------------------------------- Templates ------------------------------ */

export const assessmentTemplateSchema = z.object({
  id: z.string(),
  name: z.string().max(200),
  description: z.string().max(2000).default(""),
  category: z.enum(ASSESSMENT_CATEGORIES).default("knowledge"),
  /** Seeded system templates can be reset/duplicated but not deleted. */
  system: z.boolean().default(false),
  tags: z.array(z.string().max(60)).max(50).default([]),
  sections: z.array(assessmentSectionSchema).default([]),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type AssessmentTemplate = z.infer<typeof assessmentTemplateSchema>;

/* ----------------------------- Question Bank ---------------------------- */

export const questionBankItemSchema = z.object({
  id: z.string(),
  block: assessmentBlockSchema,
  folder: z.string().max(160).default(""),
  collection: z.string().max(160).default(""),
  tags: z.array(z.string().max(60)).max(50).default([]),
  competency: z.string().max(120).default(""),
  area: z.string().max(120).default(""),
  role: z.string().max(120).default(""),
  seniority: z.string().max(60).default(""),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  authorId: z.string().default(""),
  language: z.string().max(12).default("es-MX"),
  version: z.number().int().min(1).default(1),
  usageCount: z.number().int().min(0).default(0),
  favorite: z.boolean().default(false),
  archived: z.boolean().default(false),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type QuestionBankItem = z.infer<typeof questionBankItemSchema>;

/** How a bank item is added to an assessment. */
export const bankInsertModeSchema = z.enum(["linked", "copy", "snapshot"]);
export type BankInsertMode = z.infer<typeof bankInsertModeSchema>;

/* ------------------------------- Imports -------------------------------- */

export const importIssueSchema = z.object({
  id: z.string(),
  severity: z.enum(["error", "warning", "info"]),
  row: z.number().int().nullable().default(null),
  column: z.string().default(""),
  originalValue: z.string().default(""),
  problem: z.string(),
  suggestion: z.string().default(""),
});
export type ImportIssue = z.infer<typeof importIssueSchema>;

export const importJobSchema = z.object({
  id: z.string(),
  fileName: z.string().default(""),
  fileType: z.enum(["xlsx", "csv", "ods", "unknown"]).default("unknown"),
  worksheet: z.string().default(""),
  totalRows: z.number().int().default(0),
  validRows: z.number().int().default(0),
  excludedRows: z.array(z.number().int()).default([]),
  issues: z.array(importIssueSchema).default([]),
  createdAt: isoDate,
  status: z.enum(["parsing", "mapping", "reviewing", "converted", "failed"]).default("parsing"),
});
export type ImportJob = z.infer<typeof importJobSchema>;

/* ---------------------------- Publishing/Audit -------------------------- */

export const publishingRecordSchema = z.object({
  id: z.string(),
  assessmentId: z.string(),
  versionId: z.string(),
  versionLabel: z.string(),
  action: z.enum(["publish", "pause", "close", "archive", "rollback"]),
  at: isoDate,
  by: z.string().default(""),
  notes: z.string().max(2000).default(""),
});
export type PublishingRecord = z.infer<typeof publishingRecordSchema>;

export const AUDIT_ACTIONS = [
  "create",
  "edit",
  "publish",
  "pause",
  "close",
  "archive",
  "duplicate",
  "import",
  "version",
  "link",
  "unlink",
  "rollback",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const auditEntrySchema = z.object({
  id: z.string(),
  entityType: z.enum(["process", "assessment"]),
  entityId: z.string(),
  action: z.enum(AUDIT_ACTIONS),
  at: isoDate,
  by: z.string().default(""),
  summary: z.string().max(2000).default(""),
  /** Non-sensitive metadata (never answer keys). */
  meta: z.record(z.string(), z.unknown()).prefault({}),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;
