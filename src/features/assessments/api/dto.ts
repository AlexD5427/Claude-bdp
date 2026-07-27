/**
 * DTO de la API de Evaluaciones (administrativo y público).
 *
 * Todo lo que llega del servidor se valida con estos esquemas antes de mapearse
 * al dominio. Los esquemas son tolerantes en la entrada (valores por omisión
 * explícitos) y estrictos en la forma: una respuesta con un tipo inesperado se
 * convierte en error de validación en lugar de propagarse a la UI.
 */

import { z } from "zod";

/* ------------------------------ Administrativo --------------------------- */

export const adminAssessmentSummarySchema = z.object({
  assessmentId: z.string(),
  publicCode: z.string().default(""),
  title: z.string().default(""),
  description: z.string().default(""),
  status: z.string().default("draft"),
  lifecycleStatus: z.string().default("draft"),
  publicationStatus: z.string().default("unpublished"),
  category: z.string().default("knowledge"),
  version: z.number().default(1),
  versionMinor: z.number().default(0),
  versionLabel: z.string().default("v1.0"),
  questionCount: z.number().default(0),
  durationMinutes: z.number().nullable().default(null),
  passingScore: z.number().nullable().default(null),
  accessType: z.string().default("public"),
  tags: z.array(z.string()).default([]),
  linkedProcessCount: z.number().default(0),
  createdAt: z.string().default(""),
  createdBy: z.string().default(""),
  updatedAt: z.string().default(""),
  updatedBy: z.string().default(""),
  publishedAt: z.string().default(""),
  archivedAt: z.string().default(""),
  entityVersion: z.number().default(1),
});
export type AdminAssessmentSummaryDTO = z.infer<typeof adminAssessmentSummarySchema>;

export const adminListSchema = z.object({
  items: z.array(adminAssessmentSummarySchema).default([]),
  total: z.number().default(0),
  syncedAt: z.string().default(""),
});
export type AdminListDTO = z.infer<typeof adminListSchema>;

export const adminAssessmentSchema = z.object({
  assessmentId: z.string(),
  publicCode: z.string().default(""),
  title: z.string().default(""),
  description: z.string().default(""),
  instructions: z.string().default(""),
  internalInstructions: z.string().default(""),
  status: z.string().default("draft"),
  durationMinutes: z.number().nullable().default(null),
  passingScore: z.number().nullable().default(null),
  accessType: z.string().default("public"),
  version: z.number().default(1),
  versionMinor: z.number().default(0),
  versionLabel: z.string().default("v1.0"),
  lifecycleStatus: z.string().default("draft"),
  publicationStatus: z.string().default("unpublished"),
  category: z.string().default("knowledge"),
  purpose: z.string().default(""),
  questionCount: z.number().default(0),
  tags: z.array(z.string()).default([]),
  linkedProcessIds: z.array(z.string()).default([]),
  policies: z.record(z.string(), z.unknown()).default({}),
  theme: z.record(z.string(), z.unknown()).default({}),
  rules: z.array(z.unknown()).default([]),
  rubrics: z.array(z.unknown()).default([]),
  currentPublishedVersionId: z.string().default(""),
  createdAt: z.string().default(""),
  createdBy: z.string().default(""),
  updatedAt: z.string().default(""),
  updatedBy: z.string().default(""),
  publishedAt: z.string().default(""),
  archivedAt: z.string().default(""),
  entityVersion: z.number().default(1),
  schemaVersion: z.number().default(1),
});
export type AdminAssessmentDTO = z.infer<typeof adminAssessmentSchema>;

export const adminSectionSchema = z.object({
  sectionId: z.string(),
  assessmentId: z.string().default(""),
  title: z.string().default(""),
  description: z.string().default(""),
  position: z.number().default(0),
  timeLimitSeconds: z.number().nullable().default(null),
  randomize: z.boolean().default(false),
  poolSize: z.number().nullable().default(null),
  weight: z.number().default(1),
  active: z.boolean().default(true),
});
export type AdminSectionDTO = z.infer<typeof adminSectionSchema>;

export const adminQuestionSchema = z.object({
  questionId: z.string(),
  assessmentId: z.string().default(""),
  sectionId: z.string().default(""),
  questionText: z.string().default(""),
  questionType: z.string().default("q_short_text"),
  position: z.number().default(0),
  required: z.boolean().default(false),
  scoringMode: z.string().default("none"),
  maxPoints: z.number().default(0),
  weight: z.number().default(1),
  active: z.boolean().default(true),
  helpText: z.string().default(""),
  description: z.string().default(""),
  competency: z.string().default(""),
  code: z.string().default(""),
  configuration: z.record(z.string(), z.unknown()).default({}),
  validation: z.record(z.string(), z.unknown()).default({}),
  feedback: z.record(z.string(), z.unknown()).default({}),
  media: z
    .object({ kind: z.string().default("image"), url: z.string().default(""), alt: z.string().default("") })
    .nullable()
    .default(null),
  accessibility: z.record(z.string(), z.unknown()).default({}),
  tags: z.array(z.string()).default([]),
  configurationSchemaVersion: z.number().default(1),
});
export type AdminQuestionDTO = z.infer<typeof adminQuestionSchema>;

export const adminOptionSchema = z.object({
  optionId: z.string(),
  questionId: z.string(),
  assessmentId: z.string().default(""),
  optionText: z.string().default(""),
  optionValue: z.string().default(""),
  position: z.number().default(0),
  isCorrect: z.boolean().default(false),
  scoreValue: z.number().default(0),
  matchingKey: z.string().default(""),
  active: z.boolean().default(true),
  feedback: z.string().default(""),
  mediaUrl: z.string().default(""),
  configuration: z.record(z.string(), z.unknown()).default({}),
});
export type AdminOptionDTO = z.infer<typeof adminOptionSchema>;

export const adminVersionSchema = z.object({
  versionId: z.string(),
  version: z.number().default(1),
  versionMinor: z.number().default(0),
  versionLabel: z.string().default("v1.0"),
  state: z.string().default("published"),
  notes: z.string().default(""),
  questionCount: z.number().default(0),
  gradableQuestionCount: z.number().default(0),
  checksum: z.string().default(""),
  publishedAt: z.string().default(""),
  publishedBy: z.string().default(""),
});
export type AdminVersionDTO = z.infer<typeof adminVersionSchema>;

export const adminBundleSchema = z.object({
  assessment: adminAssessmentSchema,
  sections: z.array(adminSectionSchema).default([]),
  questions: z.array(adminQuestionSchema).default([]),
  options: z.array(adminOptionSchema).default([]),
  versions: z.array(adminVersionSchema).default([]),
});
export type AdminBundleDTO = z.infer<typeof adminBundleSchema>;

/* --------------------------------- Resultados ---------------------------- */

export const attemptSummarySchema = z.object({
  attemptId: z.string(),
  participantName: z.string().default(""),
  participantEmail: z.string().default(""),
  participantDocument: z.string().default(""),
  status: z.string().default("submitted"),
  gradingStatus: z.string().default("automatically_graded"),
  score: z.number().nullable().default(null),
  autoScore: z.number().nullable().default(null),
  correctAnswers: z.number().default(0),
  totalQuestions: z.number().default(0),
  gradableQuestions: z.number().default(0),
  manualPendingCount: z.number().default(0),
  passed: z.boolean().nullable().default(null),
  assessmentVersion: z.number().default(1),
  versionId: z.string().default(""),
  startedAt: z.string().default(""),
  submittedAt: z.string().default(""),
  durationSeconds: z.number().nullable().default(null),
});
export type AttemptSummaryDTO = z.infer<typeof attemptSummarySchema>;

export const resultsSchema = z.object({
  attempts: z.array(attemptSummarySchema).default([]),
  summary: z.object({
    total: z.number().default(0),
    submitted: z.number().default(0),
    graded: z.number().default(0),
    pendingManualReview: z.number().default(0),
    averageScore: z.number().nullable().default(null),
    passRate: z.number().nullable().default(null),
  }),
});
export type ResultsDTO = z.infer<typeof resultsSchema>;

export const attemptDetailSchema = z.object({
  attempt: attemptSummarySchema.and(
    z.object({ assessmentId: z.string().default(""), userAgent: z.string().default("") }),
  ),
  answers: z
    .array(
      z.object({
        answerId: z.string(),
        questionId: z.string(),
        questionType: z.string().default(""),
        questionText: z.string().default(""),
        selectedOptionId: z.string().default(""),
        selectedOptionText: z.string().default(""),
        value: z.unknown().nullable().default(null),
        isCorrect: z.boolean().nullable().default(null),
        pointsAwarded: z.number().nullable().default(null),
        maxPoints: z.number().default(0),
        requiresManualReview: z.boolean().default(false),
        answeredAt: z.string().default(""),
      }),
    )
    .default([]),
});
export type AttemptDetailDTO = z.infer<typeof attemptDetailSchema>;

/* ----------------------------------- Público ----------------------------- */

export const publicOptionSchema = z.object({
  optionId: z.string(),
  optionValue: z.string().default(""),
  optionText: z.string().default(""),
  mediaUrl: z.string().nullable().default(null),
});

export const publicQuestionSchema = z.object({
  questionId: z.string(),
  questionType: z.string(),
  position: z.number().default(0),
  questionText: z.string().default(""),
  description: z.string().default(""),
  helpText: z.string().default(""),
  required: z.boolean().default(false),
  configuration: z.record(z.string(), z.unknown()).default({}),
  media: z
    .object({ kind: z.string(), url: z.string(), alt: z.string().default("") })
    .nullable()
    .default(null),
  accessibility: z
    .object({ ariaLabel: z.string().default(""), longDescription: z.string().default("") })
    .default({ ariaLabel: "", longDescription: "" }),
  options: z.array(publicOptionSchema).default([]),
});

export const publicAssessmentSchema = z.object({
  publicCode: z.string(),
  title: z.string().default(""),
  description: z.string().default(""),
  instructions: z.string().default(""),
  durationMinutes: z.number().nullable().default(null),
  versionLabel: z.string().default(""),
  assessmentVersion: z.number().default(1),
  questionCount: z.number().default(0),
  theme: z.record(z.string(), z.unknown()).default({}),
  navigation: z.record(z.string(), z.unknown()).default({}),
  consent: z.record(z.string(), z.unknown()).default({}),
  sections: z
    .array(
      z.object({
        sectionId: z.string(),
        title: z.string().default(""),
        description: z.string().default(""),
        position: z.number().default(0),
        timeLimitSeconds: z.number().nullable().default(null),
        questions: z.array(publicQuestionSchema).default([]),
      }),
    )
    .default([]),
});
export type PublicAssessmentDTO = z.infer<typeof publicAssessmentSchema>;

export const publicListSchema = z.object({
  items: z
    .array(
      z.object({
        publicCode: z.string(),
        title: z.string().default(""),
        description: z.string().default(""),
        instructions: z.string().default(""),
        durationMinutes: z.number().nullable().default(null),
        questionCount: z.number().default(0),
        versionLabel: z.string().default(""),
      }),
    )
    .default([]),
  total: z.number().default(0),
});
export type PublicListDTO = z.infer<typeof publicListSchema>;

export const submitResultSchema = z.object({
  attemptId: z.string(),
  status: z.string().default("submitted"),
  gradingStatus: z.string().default("automatically_graded"),
  received: z.number().default(0),
  score: z.number().nullable().optional(),
  passed: z.boolean().nullable().optional(),
});
export type SubmitResultDTO = z.infer<typeof submitResultSchema>;
