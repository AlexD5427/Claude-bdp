/**
 * API pública de Evaluaciones.
 *
 * Es la superficie que consumirá el futuro **portal de candidatos**. Se
 * implementa aquí, en el repositorio del reclutador, por dos motivos:
 *
 *  1. Sirve de contrato ejecutable y probado para ese portal (ver
 *     docs/evaluations/PORTAL_CANDIDATES_HANDOFF.md).
 *  2. Permite comprobar con pruebas automatizadas, desde este repositorio, que
 *     el endpoint público NO expone claves de respuesta.
 *
 * El panel del reclutador NO usa estas funciones para su vista previa: la vista
 * previa trabaja con datos locales del borrador y no crea intentos.
 */

import { err, ok, type Result } from "../../../shared/result";
import { apiRead, apiWrite, type RequestOptions } from "./transport";
import {
  publicAssessmentSchema,
  publicListSchema,
  submitResultSchema,
  type PublicAssessmentDTO,
  type PublicListDTO,
  type SubmitResultDTO,
} from "./dto";

/** Evaluaciones publicadas visibles al candidato. */
export async function listPublicAssessments(
  params: { processId?: string } = {},
  options?: RequestOptions,
): Promise<Result<PublicListDTO>> {
  const response = await apiRead<unknown>("listPublicAssessments", { ...params }, options);
  if (!response.ok) return err(response.error);
  const parsed = publicListSchema.safeParse(response.value.data);
  if (!parsed.success) return err({ code: "provider", message: "Listado público inválido." });
  return ok(parsed.data);
}

/** Detalle saneado de una evaluación publicada, por su código público. */
export async function getPublicAssessment(
  publicCode: string,
  options?: RequestOptions,
): Promise<Result<PublicAssessmentDTO>> {
  const response = await apiRead<unknown>("getPublicAssessment", { publicCode }, options);
  if (!response.ok) return err(response.error);
  const parsed = publicAssessmentSchema.safeParse(response.value.data);
  if (!parsed.success) {
    return err({ code: "provider", message: "La evaluación pública llegó con un formato inesperado." });
  }
  return ok(parsed.data);
}

export interface PublicParticipant {
  name?: string;
  email?: string;
  document?: string;
}

/** Respuesta que el portal envía: nunca incluye datos de calificación. */
export interface PublicAnswerInput {
  questionId: string;
  selectedOptionId?: string;
  selectedOptionIds?: string[];
  value?: string | number | boolean | Record<string, unknown> | null;
}

/** Abre un intento anclado a la versión publicada vigente (opcional). */
export async function startAttempt(
  requestId: string,
  input: { publicCode: string; participant?: PublicParticipant; processId?: string; userAgent?: string },
  options?: RequestOptions,
): Promise<Result<{ attemptId: string; assessmentVersion: number; versionId: string; startedAt: string }>> {
  const response = await apiWrite<{
    attemptId: string;
    assessmentVersion: number;
    versionId: string;
    startedAt: string;
  }>("startAttempt", requestId, { ...input }, options);
  if (!response.ok) return err(response.error);
  const data = response.value.data;
  if (!data || typeof data.attemptId !== "string") {
    return err({ code: "provider", message: "No se pudo iniciar el intento." });
  }
  return ok(data);
}

/**
 * Envía un intento. La calificación la calcula exclusivamente el servidor: este
 * cliente no envía ni recibe la clave de respuestas.
 */
export async function submitAttempt(
  requestId: string,
  input: {
    publicCode: string;
    attemptId?: string;
    participant?: PublicParticipant;
    answers: PublicAnswerInput[];
    durationSeconds?: number;
    userAgent?: string;
    processId?: string;
  },
  options?: RequestOptions,
): Promise<Result<SubmitResultDTO>> {
  const response = await apiWrite<unknown>("submitAttempt", requestId, { ...input }, options);
  if (!response.ok) return err(response.error);
  const parsed = submitResultSchema.safeParse(response.value.data);
  if (!parsed.success) {
    return err({ code: "provider", message: "El servidor no confirmó el envío del intento." });
  }
  return ok(parsed.data);
}
