/**
 * The `RecruitmentProcess` domain model.
 *
 * This is the principal entity of ProcessOS: it represents the full recruitment
 * operation (team, publication, public content, assessments, dates, config,
 * audit), not merely a vacancy. Models are validated with Zod so every value
 * crossing the provider boundary is checked before the UI trusts it.
 */

import { z } from "zod";
import {
  EMPLOYMENT_TYPES,
  EXPERIENCE_LEVELS,
  VISIBILITIES,
  WORK_MODES,
} from "./enums";
import { PROCESS_STATUSES, PUBLICATION_STATUSES } from "./status";
import { publicContentBlockSchema } from "./publicContent";

export const CURRENT_PROCESS_SCHEMA_VERSION = 1;

export const SYNC_STATUSES = ["local", "pending", "synced", "conflict", "error"] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export const SOURCE_PROVIDERS = ["mock", "google-apps-script", "supabase"] as const;
export type SourceProvider = (typeof SOURCE_PROVIDERS)[number];

/** Loose ISO date string (validated leniently at the boundary). */
const isoDate = z.string().min(1);

/** Internal, non-public process configuration. */
export const processConfigurationSchema = z.object({
  tags: z.array(z.string().max(60)).max(30).default([]),
  confidential: z.boolean().default(false),
  requireApproval: z.boolean().default(false),
  autoCloseWhenFilled: z.boolean().default(false),
  notifyRecruitersOnApplication: z.boolean().default(true),
  allowReferrals: z.boolean().default(false),
  /** Free-form notes for the hiring team (internal only). */
  internalNotes: z.string().max(8000).default(""),
});
export type ProcessConfiguration = z.infer<typeof processConfigurationSchema>;

/** Reference to an application form (contract only for now). */
export const applicationFormRefSchema = z
  .object({
    id: z.string(),
    name: z.string().max(200).default(""),
  })
  .nullable();

export const recruitmentProcessSchema = z.object({
  id: z.string(),
  externalReference: z.string().max(120).default(""),
  code: z.string().max(60),
  title: z.string().min(1).max(200),
  slug: z.string().max(120).default(""),
  description: z.string().max(8000).default(""),

  area: z.string().max(160).default(""),
  department: z.string().max(160).default(""),
  businessUnit: z.string().max(160).default(""),
  location: z.string().max(200).default(""),
  workMode: z.enum(WORK_MODES).default("onsite"),
  employmentType: z.enum(EMPLOYMENT_TYPES).default("full_time"),
  experienceLevel: z.enum(EXPERIENCE_LEVELS).default("mid"),
  vacancies: z.number().int().min(0).max(100000).default(1),

  recruiterIds: z.array(z.string()).default([]),
  hiringManagerIds: z.array(z.string()).default([]),
  ownerId: z.string().default(""),

  processStatus: z.enum(PROCESS_STATUSES).default("draft"),
  publicationStatus: z.enum(PUBLICATION_STATUSES).default("unpublished"),
  visibility: z.enum(VISIBILITIES).default("internal"),

  applicationFormId: z.string().nullable().default(null),
  assessmentIds: z.array(z.string()).default([]),

  openingDate: isoDate.nullable().default(null),
  closingDate: isoDate.nullable().default(null),

  publicContentBlocks: z.array(publicContentBlockSchema).default([]),
  configuration: processConfigurationSchema,

  schemaVersion: z.number().int().default(CURRENT_PROCESS_SCHEMA_VERSION),
  entityVersion: z.number().int().default(1),

  createdAt: isoDate,
  createdBy: z.string().default(""),
  updatedAt: isoDate,
  updatedBy: z.string().default(""),

  sourceProvider: z.enum(SOURCE_PROVIDERS).default("mock"),
  synchronizationStatus: z.enum(SYNC_STATUSES).default("local"),
});

export type RecruitmentProcess = z.infer<typeof recruitmentProcessSchema>;

/**
 * A lightweight list projection. The list/table endpoints return summaries so
 * we never ship full public content + configuration to render a row.
 */
export interface ProcessSummary {
  id: string;
  code: string;
  title: string;
  area: string;
  location: string;
  vacancies: number;
  applications: number;
  assessmentCount: number;
  ownerId: string;
  processStatus: RecruitmentProcess["processStatus"];
  publicationStatus: RecruitmentProcess["publicationStatus"];
  visibility: RecruitmentProcess["visibility"];
  workMode: RecruitmentProcess["workMode"];
  employmentType: RecruitmentProcess["employmentType"];
  experienceLevel: RecruitmentProcess["experienceLevel"];
  department: string;
  businessUnit: string;
  openingDate: string | null;
  closingDate: string | null;
  updatedAt: string;
  synchronizationStatus: SyncStatus;
}

/** Project a full process to its list summary. */
export function toProcessSummary(
  p: RecruitmentProcess,
  applications = 0,
): ProcessSummary {
  return {
    id: p.id,
    code: p.code,
    title: p.title,
    area: p.area,
    location: p.location,
    vacancies: p.vacancies,
    applications,
    assessmentCount: p.assessmentIds.length,
    ownerId: p.ownerId,
    processStatus: p.processStatus,
    publicationStatus: p.publicationStatus,
    visibility: p.visibility,
    workMode: p.workMode,
    employmentType: p.employmentType,
    experienceLevel: p.experienceLevel,
    department: p.department,
    businessUnit: p.businessUnit,
    openingDate: p.openingDate,
    closingDate: p.closingDate,
    updatedAt: p.updatedAt,
    synchronizationStatus: p.synchronizationStatus,
  };
}
