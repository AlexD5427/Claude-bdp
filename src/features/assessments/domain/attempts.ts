/**
 * Intentos y respuestas.
 *
 * Estos tipos describen lo que el SERVIDOR calcula. El frontend los lee, nunca
 * los produce: no existe ninguna función en el navegador que asigne `score`,
 * `passed`, `isCorrect` o `pointsAwarded` a un intento real.
 *
 * Estados de calificación:
 *  · `automatically_graded`   — todas las preguntas calificables eran objetivas
 *                               y ya tienen nota final.
 *  · `pending_manual_review`  — hay preguntas sin criterio objetivo. `score` y
 *                               `passed` quedan VACÍOS: no se otorga cero.
 *  · `fully_graded`           — un revisor cerró la calificación manual.
 */

import { z } from "zod";

export const ATTEMPT_STATUSES = ["in_progress", "submitted", "abandoned"] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export const GRADING_STATUSES = [
  "automatically_graded",
  "pending_manual_review",
  "fully_graded",
] as const;
export type GradingStatus = (typeof GRADING_STATUSES)[number];

export const GRADING_STATUS_META: Record<
  GradingStatus,
  { label: string; intent: "success" | "warning" | "info" }
> = {
  automatically_graded: { label: "Calificado automáticamente", intent: "success" },
  pending_manual_review: { label: "Pendiente de revisión", intent: "warning" },
  fully_graded: { label: "Calificación cerrada", intent: "info" },
};

export const attemptSchema = z.object({
  id: z.string(),
  assessmentId: z.string(),
  assessmentVersion: z.number().int().min(1),
  versionId: z.string().default(""),
  participantName: z.string().default(""),
  participantEmail: z.string().default(""),
  participantDocument: z.string().default(""),
  status: z.enum(ATTEMPT_STATUSES).default("submitted"),
  gradingStatus: z.enum(GRADING_STATUSES).default("automatically_graded"),
  /** Nota final oficial. `null` mientras haya revisión manual pendiente. */
  score: z.number().nullable().default(null),
  /** Nota de la parte objetiva (0..100). */
  autoScore: z.number().nullable().default(null),
  correctAnswers: z.number().int().min(0).default(0),
  totalQuestions: z.number().int().min(0).default(0),
  gradableQuestions: z.number().int().min(0).default(0),
  manualPendingCount: z.number().int().min(0).default(0),
  passed: z.boolean().nullable().default(null),
  startedAt: z.string().default(""),
  submittedAt: z.string().default(""),
  durationSeconds: z.number().nullable().default(null),
});
export type Attempt = z.infer<typeof attemptSchema>;

export const attemptAnswerSchema = z.object({
  id: z.string(),
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
});
export type AttemptAnswer = z.infer<typeof attemptAnswerSchema>;

/**
 * Resumen agregado de resultados. Todos los promedios son `null` cuando no hay
 * datos suficientes: el módulo NUNCA muestra una métrica inventada.
 */
export interface ResultsSummary {
  total: number;
  submitted: number;
  graded: number;
  pendingManualReview: number;
  averageScore: number | null;
  passRate: number | null;
}

export interface AssessmentResults {
  attempts: Attempt[];
  summary: ResultsSummary;
}

export interface AttemptDetail {
  attempt: Attempt;
  answers: AttemptAnswer[];
}

/** Resumen vacío usado cuando el proveedor no tiene intentos que reportar. */
export function emptyResultsSummary(): ResultsSummary {
  return {
    total: 0,
    submitted: 0,
    graded: 0,
    pendingManualReview: 0,
    averageScore: null,
    passRate: null,
  };
}
