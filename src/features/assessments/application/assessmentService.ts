/**
 * Assessment application service — orchestrates UI commands → repository, with
 * validation, versioning rules, and audit logging.
 */

import {
  getAssessmentProviderName,
  getAssessmentRepository,
} from "../../../infrastructure/providers";
import { syncState } from "../../../infrastructure/synchronization/syncState";
import { assessmentDefinitionSchema, type AssessmentDefinition } from "../domain/assessment";
import { createAssessment } from "../domain/factory";
import type { AssessmentCategory } from "../domain/categories";
import { logAudit } from "../audit/auditLog";
import type { ListQuery } from "../../../infrastructure/repositories/contracts";
import type { Result } from "../../../shared/result";
import { L } from "../../../content/locale";
import type { AssessmentResults, AttemptDetail } from "../domain/attempts";

function repo() {
  return getAssessmentRepository();
}

/** Origen de datos activo del módulo, para mostrarlo en la interfaz. */
export function assessmentSource(): { name: string; label: string; isMock: boolean } {
  const name = getAssessmentProviderName();
  const label =
    name === "google-apps-script"
      ? L.sync.providerAppsScript
      : name === "supabase"
        ? "Supabase (no implementado)"
        : L.sync.providerMock;
  return { name, label, isMock: name === "mock" };
}

export async function listAssessments(query?: ListQuery) {
  syncState.beginSync();
  const res = await repo().list(query);
  syncState.endSync(res.ok ? res.value.syncedAt : undefined, res.ok ? null : res.error.message);
  return res;
}

export async function getAssessment(id: string) {
  return repo().get(id);
}

export async function createAssessmentCommand(
  name: string,
  category: AssessmentCategory,
  by: string,
): Promise<Result<AssessmentDefinition>> {
  const draft = createAssessment({ name, category, createdBy: by });
  const res = await repo().create(draft);
  if (res.ok) logAudit("assessment", res.value.id, "create", by, `Creó la evaluación "${name}"`);
  return res;
}

/** Persist an already-built assessment (e.g. from an import). */
export async function createAssessmentEntity(
  assessment: AssessmentDefinition,
  by: string,
): Promise<Result<AssessmentDefinition>> {
  const res = await repo().create(assessment);
  if (res.ok) logAudit("assessment", res.value.id, "import", by, "Creó evaluación desde importación");
  return res;
}

export async function saveAssessmentDraft(
  assessment: AssessmentDefinition,
  by: string,
): Promise<Result<AssessmentDefinition>> {
  const parsed = assessmentDefinitionSchema.parse({ ...assessment, updatedBy: by });
  const res = await repo().updateDraft(parsed, parsed.entityVersion);
  if (res.ok) logAudit("assessment", parsed.id, "edit", by, "Guardó cambios de la evaluación");
  return res;
}

export async function publishAssessment(id: string, by: string, notes?: string) {
  const res = await repo().publish(id, by, notes);
  if (res.ok) {
    const last = res.value.publishedVersions[res.value.publishedVersions.length - 1];
    logAudit("assessment", id, "publish", by, `Publicó v${last?.major}.${last?.minor}`);
  }
  return res;
}

export async function pauseAssessment(id: string, by: string) {
  const res = await repo().pause(id, by);
  if (res.ok) logAudit("assessment", id, "pause", by, "Pausó la evaluación");
  return res;
}

export async function closeAssessment(id: string, by: string) {
  const res = await repo().close(id, by);
  if (res.ok) logAudit("assessment", id, "close", by, "Cerró la evaluación");
  return res;
}

export async function archiveAssessment(id: string, by: string) {
  const res = await repo().archive(id, by);
  if (res.ok) logAudit("assessment", id, "archive", by, "Archivó la evaluación");
  return res;
}

/** Restaura una evaluación archivada a borrador editable. */
export async function restoreAssessment(id: string, by: string) {
  const res = await repo().restore(id, by);
  if (res.ok) logAudit("assessment", id, "edit", by, "Restauró la evaluación archivada");
  return res;
}

export async function duplicateAssessmentCommand(id: string, by: string) {
  const res = await repo().duplicate(id, by);
  if (res.ok) logAudit("assessment", res.value.id, "duplicate", by, "Duplicó la evaluación");
  return res;
}

export async function rollbackAssessment(id: string, versionId: string, by: string) {
  const res = await repo().rollback(id, versionId, by);
  if (res.ok) logAudit("assessment", id, "rollback", by, "Revirtió asignaciones futuras");
  return res;
}

/**
 * Resultados de una evaluación. Las notas las calcula el servidor; el frontend
 * solo las lee.
 */
export async function listAssessmentResults(id: string): Promise<Result<AssessmentResults>> {
  return repo().listResults(id);
}

export async function getAttemptDetail(attemptId: string): Promise<Result<AttemptDetail>> {
  return repo().getAttemptDetail(attemptId);
}
