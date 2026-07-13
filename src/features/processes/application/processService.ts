/**
 * Process application service.
 *
 * The thin orchestration layer between UI commands and the repository. It owns
 * the write pipeline (validate → domain command → repository → sync bookkeeping)
 * and keeps the UI free of provider details. Reads flow list/get through the
 * repository and surface sync timing.
 */

import { getProvider } from "../../../infrastructure/providers";
import { syncState } from "../../../infrastructure/synchronization/syncState";
import { recruitmentProcessSchema, type RecruitmentProcess } from "../domain/models";
import { createProcess } from "../domain/factory";
import { logAudit } from "../../assessments/audit/auditLog";
import type { ListQuery } from "../../../infrastructure/repositories/contracts";
import type { Result } from "../../../shared/result";

function repo() {
  return getProvider().processes;
}

export async function listProcesses(query?: ListQuery) {
  syncState.beginSync();
  const res = await repo().list(query);
  syncState.endSync(res.ok ? res.value.syncedAt : undefined, res.ok ? null : res.error.message);
  return res;
}

export async function getProcess(id: string) {
  return repo().get(id);
}

export async function createProcessCommand(
  title: string,
  by: string,
): Promise<Result<RecruitmentProcess>> {
  const draft = createProcess({ title, createdBy: by });
  const res = await repo().create(draft);
  if (res.ok) logAudit("process", res.value.id, "create", by, `Creó el proceso "${title}"`);
  return res;
}

export async function saveProcessDraft(
  process: RecruitmentProcess,
  by: string,
): Promise<Result<RecruitmentProcess>> {
  // Validate the full entity before it leaves the UI.
  const parsed = recruitmentProcessSchema.parse({ ...process, updatedBy: by });
  const res = await repo().updateDraft(parsed, parsed.entityVersion);
  if (res.ok) logAudit("process", parsed.id, "edit", by, "Guardó cambios del proceso");
  return res;
}

export async function publishProcess(id: string, by: string) {
  const res = await repo().publish(id, by);
  if (res.ok) logAudit("process", id, "publish", by, "Publicó el proceso");
  return res;
}

export async function pauseProcess(id: string, by: string) {
  const res = await repo().pause(id, by);
  if (res.ok) logAudit("process", id, "pause", by, "Pausó el proceso");
  return res;
}

export async function closeProcess(id: string, by: string) {
  const res = await repo().close(id, by);
  if (res.ok) logAudit("process", id, "close", by, "Cerró el proceso");
  return res;
}

export async function archiveProcess(id: string, by: string) {
  const res = await repo().archive(id, by);
  if (res.ok) logAudit("process", id, "archive", by, "Archivó el proceso");
  return res;
}

export async function duplicateProcessCommand(id: string, by: string) {
  const res = await repo().duplicate(id, by);
  if (res.ok) logAudit("process", res.value.id, "duplicate", by, "Duplicó el proceso");
  return res;
}

/** Link/unlink an assessment to a process (updates the draft). */
export async function setProcessAssessments(
  process: RecruitmentProcess,
  assessmentIds: string[],
  by: string,
) {
  const res = await saveProcessDraft({ ...process, assessmentIds }, by);
  if (res.ok) logAudit("process", process.id, "link", by, "Actualizó evaluaciones asignadas");
  return res;
}
