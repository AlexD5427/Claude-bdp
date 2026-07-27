/**
 * AppsScriptAssessmentService — el proveedor real de Evaluaciones.
 *
 * Implementa `AssessmentRepository` contra la API normalizada de
 * `apps-script/evaluations/` (ver docs/evaluations/API_CONTRACT.md). Sustituye al
 * antiguo adaptador que hablaba el protocolo heredado `type:"evaluacion"` sobre
 * la hoja `Evaluaciones` con columnas JSON.
 *
 * Responsabilidades:
 *  · Traducir dominio ↔ DTO (a través de `api/mapper.ts`).
 *  · Generar un `requestId` por intención del usuario para que el servidor pueda
 *    descartar duplicados.
 *  · Resolver la repetición idempotente: si el servidor avisa de que la escritura
 *    ya se había aplicado, se relee la entidad en lugar de repetir el efecto.
 *
 * No hay llamadas `fetch` aquí: el transporte vive en `api/transport.ts`.
 */

import { appError, err, ok, type Result } from "../../../shared/result";
import type {
  AssessmentRepository,
  ListQuery,
  ListResult,
} from "../../repositories/contracts";
import type {
  AssessmentDefinition,
  AssessmentSummary,
} from "../../../features/assessments/domain/assessment";
import {
  attemptSchema,
  attemptAnswerSchema,
  type AssessmentResults,
  type Attempt,
  type AttemptDetail,
} from "../../../features/assessments/domain/attempts";
import {
  createAssessment as apiCreate,
  duplicateAssessment as apiDuplicate,
  getAdminAssessment,
  getAttemptDetail as apiAttemptDetail,
  listAdminAssessments,
  listAssessmentResults,
  publishAssessment as apiPublish,
  rollbackAssessment as apiRollback,
  transitionAssessment,
  updateAssessment as apiUpdate,
  type TransitionAction,
  type WriteResult,
} from "../../../features/assessments/api/adminApi";
import { newRequestId } from "../../../features/assessments/api/contract";
import {
  toAssessmentDefinition,
  toAssessmentSummaryFromDTO,
  toUpdatePayload,
} from "../../../features/assessments/api/mapper";
import type { AttemptSummaryDTO } from "../../../features/assessments/api/dto";

/**
 * Resuelve el resultado de una escritura: bundle directo, o relectura cuando el
 * servidor detectó una repetición idempotente.
 */
async function resolveWrite(
  result: Result<WriteResult>,
  fallbackId: string,
): Promise<Result<AssessmentDefinition>> {
  if (!result.ok) return err(result.error);
  if ("bundle" in result.value) return ok(toAssessmentDefinition(result.value.bundle));
  const reference = result.value.replay.reference || fallbackId;
  if (!reference) {
    return err(appError("provider", "La operación ya se había procesado y no se pudo releer."));
  }
  const reread = await getAdminAssessment(reference);
  if (!reread.ok) return err(reread.error);
  return ok(toAssessmentDefinition(reread.value));
}

function toAttempt(dto: AttemptSummaryDTO & { assessmentId?: string }): Attempt {
  return attemptSchema.parse({
    id: dto.attemptId,
    assessmentId: dto.assessmentId ?? "",
    assessmentVersion: Math.max(1, dto.assessmentVersion),
    versionId: dto.versionId,
    participantName: dto.participantName,
    participantEmail: dto.participantEmail,
    participantDocument: dto.participantDocument,
    status: dto.status,
    gradingStatus: dto.gradingStatus,
    score: dto.score,
    autoScore: dto.autoScore,
    correctAnswers: dto.correctAnswers,
    totalQuestions: dto.totalQuestions,
    gradableQuestions: dto.gradableQuestions,
    manualPendingCount: dto.manualPendingCount,
    passed: dto.passed,
    startedAt: dto.startedAt,
    submittedAt: dto.submittedAt,
    durationSeconds: dto.durationSeconds,
  });
}

export const appsScriptAssessmentService: AssessmentRepository = {
  async list(query?: ListQuery): Promise<Result<ListResult<AssessmentSummary>>> {
    const response = await listAdminAssessments({ search: query?.search });
    if (!response.ok) return err(response.error);
    const items = response.value.items.map(toAssessmentSummaryFromDTO);
    return ok({
      items,
      total: response.value.total,
      syncedAt: response.value.syncedAt || new Date().toISOString(),
    });
  },

  async get(id) {
    const response = await getAdminAssessment(id);
    if (!response.ok) return err(response.error);
    return ok(toAssessmentDefinition(response.value));
  },

  async create(assessment) {
    // El servidor genera la identidad y el código público; el borrador local se
    // guarda inmediatamente después con `updateDraft` si trae contenido.
    const created = await apiCreate(newRequestId(), {
      title: assessment.name,
      category: assessment.category,
      actor: assessment.createdBy,
    });
    const resolved = await resolveWrite(created, "");
    if (!resolved.ok) return resolved;
    const hasContent = assessment.draftVersion.content.sections.some(
      (section) => section.blocks.length > 0,
    );
    if (!hasContent) return resolved;
    // Reasignar el contenido local a los identificadores del servidor.
    const merged: AssessmentDefinition = {
      ...resolved.value,
      name: assessment.name,
      description: assessment.description,
      purpose: assessment.purpose,
      tags: assessment.tags,
      estimatedDurationMinutes: assessment.estimatedDurationMinutes,
      scoringPolicy: assessment.scoringPolicy,
      draftVersion: {
        ...resolved.value.draftVersion,
        content: assessment.draftVersion.content,
      },
    };
    return this.updateDraft(merged, merged.entityVersion);
  },

  async updateDraft(assessment, expectedEntityVersion) {
    const written = await apiUpdate(newRequestId(), {
      assessmentId: assessment.id,
      expectedEntityVersion,
      actor: assessment.updatedBy,
      payload: toUpdatePayload(assessment),
    });
    return resolveWrite(written, assessment.id);
  },

  async publish(id, by, notes) {
    const written = await apiPublish(newRequestId(), { assessmentId: id, notes, actor: by });
    return resolveWrite(written, id);
  },

  pause: (id, by) => runTransition("pauseAssessment", id, by),
  close: (id, by) => runTransition("closeAssessment", id, by),
  archive: (id, by) => runTransition("archiveAssessment", id, by),
  restore: (id, by) => runTransition("unarchiveAssessment", id, by),

  async duplicate(id, by) {
    const written = await apiDuplicate(newRequestId(), { assessmentId: id, actor: by });
    return resolveWrite(written, "");
  },

  async rollback(id, versionId, by) {
    const written = await apiRollback(newRequestId(), {
      assessmentId: id,
      versionId,
      actor: by,
    });
    return resolveWrite(written, id);
  },

  async listResults(id): Promise<Result<AssessmentResults>> {
    const response = await listAssessmentResults(id);
    if (!response.ok) return err(response.error);
    return ok({
      attempts: response.value.attempts.map((attempt) =>
        toAttempt({ ...attempt, assessmentId: id }),
      ),
      summary: response.value.summary,
    });
  },

  async getAttemptDetail(attemptId): Promise<Result<AttemptDetail>> {
    const response = await apiAttemptDetail(attemptId);
    if (!response.ok) return err(response.error);
    return ok({
      attempt: toAttempt(response.value.attempt),
      answers: response.value.answers.map((answer) =>
        attemptAnswerSchema.parse({
          id: answer.answerId,
          questionId: answer.questionId,
          questionType: answer.questionType,
          questionText: answer.questionText,
          selectedOptionId: answer.selectedOptionId,
          selectedOptionText: answer.selectedOptionText,
          value: answer.value,
          isCorrect: answer.isCorrect,
          pointsAwarded: answer.pointsAwarded,
          maxPoints: answer.maxPoints,
          requiresManualReview: answer.requiresManualReview,
          answeredAt: answer.answeredAt,
        }),
      ),
    });
  },
};

async function runTransition(
  action: TransitionAction,
  id: string,
  by: string,
): Promise<Result<AssessmentDefinition>> {
  const written = await transitionAssessment(action, newRequestId(), {
    assessmentId: id,
    actor: by,
  });
  return resolveWrite(written, id);
}
