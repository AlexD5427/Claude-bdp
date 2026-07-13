import { z } from "zod";

/**
 * Zod schemas for ProcessOS.
 *
 * These are the single source of truth for validation at every boundary:
 * provider responses (Apps Script / mock), the editor form, and imported data.
 * The inferred types are kept structurally compatible with `types.ts`.
 */

export const ProcessStatusSchema = z.enum([
  "borrador",
  "en_configuracion",
  "pendiente_aprobacion",
  "aprobado",
  "programado",
  "publicado",
  "recepcion_activa",
  "pausado",
  "cerrado",
  "finalizado",
  "archivado",
  "cancelado",
]);

export const PublicationStatusSchema = z.enum([
  "no_publicado",
  "programado",
  "publicado",
  "pausado",
  "cerrado",
  "archivado",
]);

export const VisibilitySchema = z.enum(["interno", "externo", "ambos"]);
export const WorkModeSchema = z.enum(["presencial", "hibrido", "remoto"]);
export const EmploymentTypeSchema = z.enum([
  "tiempo_completo",
  "medio_tiempo",
  "temporal",
  "pasantia",
  "consultoria",
]);
export const ExperienceLevelSchema = z.enum([
  "sin_experiencia",
  "junior",
  "semi_senior",
  "senior",
  "jefatura",
  "gerencia",
]);
export const SynchronizationStatusSchema = z.enum(["synced", "pending", "error", "local"]);

export const PublicContentBlockSchema = z.object({
  id: z.string(),
  type: z.enum([
    "hero",
    "summary",
    "responsibilities",
    "requirements",
    "benefits",
    "location",
    "faq",
    "instructions",
    "privacy",
    "assessment_info",
    "contact",
  ]),
  title: z.string().optional(),
  body: z.string().optional(),
  items: z.array(z.string()).optional(),
  faq: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
});

export const ProcessConfigurationSchema = z.object({
  headcount: z.number().int().nonnegative().default(1),
  salaryMin: z.number().nonnegative().nullable().optional(),
  salaryMax: z.number().nonnegative().nullable().optional(),
  applicationEnabled: z.boolean().default(true),
  internalNotes: z.string().optional(),
  requisitionRef: z.string().optional(),
});

export const ProcessAuditEntrySchema = z.object({
  id: z.string(),
  action: z.enum([
    "created",
    "edited",
    "published",
    "paused",
    "closed",
    "archived",
    "duplicated",
    "assessment_linked",
    "assessment_unlinked",
  ]),
  actorId: z.string(),
  actorName: z.string().optional(),
  timestamp: z.string(),
  summary: z.string(),
  requestId: z.string().optional(),
});

export const RecruitmentProcessSchema = z.object({
  id: z.string(),
  externalReference: z.string().default(""),
  code: z.string().default(""),
  title: z.string().min(1, "El nombre del proceso es obligatorio."),
  slug: z.string().default(""),
  description: z.string().default(""),
  shortDescription: z.string().default(""),
  mission: z.string().default(""),

  area: z.string().default(""),
  department: z.string().default(""),
  businessUnit: z.string().default(""),
  region: z.string().default(""),
  city: z.string().default(""),
  branch: z.string().default(""),
  location: z.string().default(""),

  workMode: WorkModeSchema.default("presencial"),
  employmentType: EmploymentTypeSchema.default("tiempo_completo"),
  experienceLevel: ExperienceLevelSchema.default("junior"),
  vacancies: z.number().int().nonnegative().default(1),

  recruiterIds: z.array(z.string()).default([]),
  hiringManagerIds: z.array(z.string()).default([]),
  ownerId: z.string().default(""),

  status: ProcessStatusSchema.default("borrador"),
  publicationStatus: PublicationStatusSchema.default("no_publicado"),
  visibility: VisibilitySchema.default("interno"),

  applicationFormId: z.string().nullable().default(null),
  assessmentIds: z.array(z.string()).default([]),

  openingDate: z.string().nullable().default(null),
  closingDate: z.string().nullable().default(null),
  publishedAt: z.string().nullable().default(null),
  closedAt: z.string().nullable().default(null),
  archivedAt: z.string().nullable().default(null),

  createdAt: z.string(),
  createdBy: z.string().default(""),
  updatedAt: z.string(),
  updatedBy: z.string().default(""),

  schemaVersion: z.number().default(1),
  sourceProvider: z.enum(["apps-script", "mock", "supabase"]).default("mock"),
  synchronizationStatus: SynchronizationStatusSchema.default("local"),

  configuration: ProcessConfigurationSchema.default({ headcount: 1, applicationEnabled: true }),
  publicContentBlocks: z.array(PublicContentBlockSchema).default([]),
  internalMetadata: z.record(z.unknown()).default({}),
  auditTrail: z.array(ProcessAuditEntrySchema).default([]),
});

export type RecruitmentProcessParsed = z.infer<typeof RecruitmentProcessSchema>;

/** The editor form schema (subset the user edits). */
export const ProcessDraftInputSchema = z.object({
  title: z.string().min(1, "El nombre del proceso es obligatorio."),
  code: z.string().optional().default(""),
  description: z.string().optional().default(""),
  shortDescription: z.string().max(280, "Máximo 280 caracteres.").optional().default(""),
  mission: z.string().optional().default(""),
  area: z.string().optional().default(""),
  department: z.string().optional().default(""),
  businessUnit: z.string().optional().default(""),
  region: z.string().optional().default(""),
  city: z.string().optional().default(""),
  branch: z.string().optional().default(""),
  location: z.string().optional().default(""),
  workMode: WorkModeSchema.default("presencial"),
  employmentType: EmploymentTypeSchema.default("tiempo_completo"),
  experienceLevel: ExperienceLevelSchema.default("junior"),
  vacancies: z.number().int().min(0, "No puede ser negativo.").default(1),
  recruiterIds: z.array(z.string()).default([]),
  hiringManagerIds: z.array(z.string()).default([]),
  ownerId: z.string().optional().default(""),
  visibility: VisibilitySchema.default("interno"),
  assessmentIds: z.array(z.string()).default([]),
  openingDate: z.string().nullable().default(null),
  closingDate: z.string().nullable().default(null),
  configuration: ProcessConfigurationSchema,
  publicContentBlocks: z.array(PublicContentBlockSchema).default([]),
});

/**
 * Parse a loose (provider) object into a valid process, filling defaults. Throws
 * a Zod error the caller normalises into an `AppError`.
 */
export function parseProcess(raw: unknown): RecruitmentProcessParsed {
  return RecruitmentProcessSchema.parse(raw);
}

/** Safe variant that returns null on failure (used when tolerating bad rows). */
export function safeParseProcess(raw: unknown): RecruitmentProcessParsed | null {
  const result = RecruitmentProcessSchema.safeParse(raw);
  return result.success ? result.data : null;
}
