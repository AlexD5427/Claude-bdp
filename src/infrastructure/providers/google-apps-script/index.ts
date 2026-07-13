/**
 * Apps Script data provider.
 *
 * Implements the repository contracts against the Google Apps Script backend
 * using the `Procesos` and `Evaluaciones` worksheets. It speaks the extended
 * `type`-routed POST protocol (see APPS_SCRIPT_INTEGRATION.md) and maps rows
 * through the dedicated mappers so the UI only ever sees domain models.
 *
 * The GET `action=list_procesos` / `action=list_evaluaciones` return arrays of
 * flat rows; writes send `{ type: "proceso" | "evaluacion", action, ... }`.
 */

import { ok, err, appError } from "../../../shared/result";
import type { Result } from "../../../shared/result";
import type {
  AssessmentRepository,
  DataProvider,
  ListQuery,
  ListResult,
  ProcessRepository,
} from "../../repositories/contracts";
import { toProcessSummary, type ProcessSummary, type RecruitmentProcess } from "../../../features/processes/domain/models";
import { toAssessmentSummary, type AssessmentDefinition, type AssessmentSummary } from "../../../features/assessments/domain/assessment";
import { processToRow, rowToProcess, type ProcesoRow } from "../../mappers/processMapper";
import { assessmentToRow, rowToAssessment, type EvaluacionRow } from "../../mappers/assessmentMapper";
import { apiGet, apiPost } from "./client";
import { newId } from "../../../shared/ids";

function filterRows<T extends Record<string, unknown>>(
  rows: T[],
  keys: string[],
  search?: string,
): T[] {
  if (!search) return rows;
  const q = search.toLowerCase().trim();
  return rows.filter((r) => keys.some((k) => String(r[k] ?? "").toLowerCase().includes(q)));
}

const processRepo: ProcessRepository = {
  async list(query?: ListQuery): Promise<Result<ListResult<ProcessSummary>>> {
    const res = await apiGet<{ rows: ProcesoRow[] }>({ action: "list_procesos" });
    if (!res.ok) return err(res.error);
    const rows = (res.value.data?.rows ?? []) as ProcesoRow[];
    const filtered = filterRows(rows as unknown as Record<string, unknown>[], ["Codigo", "Nombre", "Area", "Ubicacion"], query?.search);
    const items = filtered.map((r) => toProcessSummary(rowToProcess(r as Partial<ProcesoRow>)));
    return ok({ items, total: items.length, syncedAt: res.value.timestamp });
  },

  async get(id) {
    const res = await apiGet<{ row: ProcesoRow }>({ action: "get_proceso", id });
    if (!res.ok) return err(res.error);
    const row = res.value.data?.row;
    if (!row) return err(appError("not_found", "Proceso no encontrado."));
    return ok(rowToProcess(row));
  },

  async create(process) {
    const res = await apiPost<{ row: ProcesoRow }>({
      type: "proceso",
      action: "create",
      idempotencyKey: newId("idem"),
      row: processToRow(process),
    });
    if (!res.ok) return err(res.error);
    return ok(process);
  },

  async updateDraft(process, expectedEntityVersion) {
    const res = await apiPost<{ row: ProcesoRow }>({
      type: "proceso",
      action: "update",
      expectedEntityVersion,
      row: processToRow(process),
    });
    if (!res.ok) return err(res.error);
    const row = res.value.data?.row;
    return ok(row ? rowToProcess(row) : { ...process, entityVersion: process.entityVersion + 1 });
  },

  publish: (id, by) => transitionProcess("publish", id, by),
  pause: (id, by) => transitionProcess("pause", id, by),
  close: (id, by) => transitionProcess("close", id, by),
  archive: (id, by) => transitionProcess("archive", id, by),

  async duplicate(id, by) {
    const res = await apiPost<{ row: ProcesoRow }>({ type: "proceso", action: "duplicate", id, by });
    if (!res.ok) return err(res.error);
    const row = res.value.data?.row;
    if (!row) return err(appError("provider", "No se pudo duplicar el proceso."));
    return ok(rowToProcess(row));
  },
};

async function transitionProcess(
  action: string,
  id: string,
  by: string,
): Promise<Result<RecruitmentProcess>> {
  const res = await apiPost<{ row: ProcesoRow }>({ type: "proceso", action, id, by });
  if (!res.ok) return err(res.error);
  const row = res.value.data?.row;
  if (!row) return err(appError("provider", "No se pudo actualizar el proceso."));
  return ok(rowToProcess(row));
}

const assessmentRepo: AssessmentRepository = {
  async list(query?: ListQuery): Promise<Result<ListResult<AssessmentSummary>>> {
    const res = await apiGet<{ rows: EvaluacionRow[] }>({ action: "list_evaluaciones" });
    if (!res.ok) return err(res.error);
    const rows = (res.value.data?.rows ?? []) as EvaluacionRow[];
    const filtered = filterRows(rows as unknown as Record<string, unknown>[], ["Codigo", "Nombre", "Categoria"], query?.search);
    const items = filtered.map((r) => toAssessmentSummary(rowToAssessment(r as Partial<EvaluacionRow>)));
    return ok({ items, total: items.length, syncedAt: res.value.timestamp });
  },

  async get(id) {
    const res = await apiGet<{ row: EvaluacionRow }>({ action: "get_evaluacion", id });
    if (!res.ok) return err(res.error);
    const row = res.value.data?.row;
    if (!row) return err(appError("not_found", "Evaluación no encontrada."));
    return ok(rowToAssessment(row));
  },

  async create(assessment) {
    const res = await apiPost<{ row: EvaluacionRow }>({
      type: "evaluacion",
      action: "create",
      idempotencyKey: newId("idem"),
      row: assessmentToRow(assessment),
    });
    if (!res.ok) return err(res.error);
    return ok(assessment);
  },

  async updateDraft(assessment, expectedEntityVersion) {
    const res = await apiPost<{ row: EvaluacionRow }>({
      type: "evaluacion",
      action: "update",
      expectedEntityVersion,
      row: assessmentToRow(assessment),
    });
    if (!res.ok) return err(res.error);
    const row = res.value.data?.row;
    return ok(row ? rowToAssessment(row) : { ...assessment, entityVersion: assessment.entityVersion + 1 });
  },

  async publish(id, by, notes) {
    const res = await apiPost<{ row: EvaluacionRow }>({ type: "evaluacion", action: "publish", id, by, notes });
    if (!res.ok) return err(res.error);
    const row = res.value.data?.row;
    if (!row) return err(appError("provider", "No se pudo publicar la evaluación."));
    return ok(rowToAssessment(row));
  },

  pause: (id, by) => transitionAssessment("pause", id, by),
  close: (id, by) => transitionAssessment("close", id, by),
  archive: (id, by) => transitionAssessment("archive", id, by),

  async duplicate(id, by) {
    const res = await apiPost<{ row: EvaluacionRow }>({ type: "evaluacion", action: "duplicate", id, by });
    if (!res.ok) return err(res.error);
    const row = res.value.data?.row;
    if (!row) return err(appError("provider", "No se pudo duplicar la evaluación."));
    return ok(rowToAssessment(row));
  },

  async rollback(id, versionId, by) {
    const res = await apiPost<{ row: EvaluacionRow }>({
      type: "evaluacion",
      action: "rollback",
      id,
      versionId,
      by,
    });
    if (!res.ok) return err(res.error);
    const row = res.value.data?.row;
    if (!row) return err(appError("provider", "No se pudo revertir la evaluación."));
    return ok(rowToAssessment(row));
  },
};

async function transitionAssessment(
  action: string,
  id: string,
  by: string,
): Promise<Result<AssessmentDefinition>> {
  const res = await apiPost<{ row: EvaluacionRow }>({ type: "evaluacion", action, id, by });
  if (!res.ok) return err(res.error);
  const row = res.value.data?.row;
  if (!row) return err(appError("provider", "No se pudo actualizar la evaluación."));
  return ok(rowToAssessment(row));
}

export const appsScriptProvider: DataProvider = {
  name: "google-apps-script",
  processes: processRepo,
  assessments: assessmentRepo,
};
