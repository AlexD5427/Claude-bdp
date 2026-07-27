/**
 * Apps Script data provider.
 *
 * ProcessOS keeps using the shared Web App and its `type`-routed POST protocol
 * over the `Procesos` worksheet (GET `action=list_procesos`, writes
 * `{ type:"proceso", action, row }`) — see APPS_SCRIPT_INTEGRATION.md. That part
 * is unchanged.
 *
 * Assessments now go through `AppsScriptAssessmentService`, which speaks the
 * normalized Evaluaciones API (`apps-script/evaluations/`) documented in
 * docs/evaluations/API_CONTRACT.md. The legacy single-row `type:"evaluacion"`
 * handler remains deployed server-side for backwards compatibility, but the
 * module no longer uses it.
 */

import { ok, err, appError } from "../../../shared/result";
import type { Result } from "../../../shared/result";
import type {
  DataProvider,
  ListQuery,
  ListResult,
  ProcessRepository,
} from "../../repositories/contracts";
import { toProcessSummary, type ProcessSummary, type RecruitmentProcess } from "../../../features/processes/domain/models";
import { processToRow, rowToProcess, type ProcesoRow } from "../../mappers/processMapper";
import { apiGet, apiPost } from "./client";
import { appsScriptAssessmentService } from "./assessmentService";
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

export const appsScriptProvider: DataProvider = {
  name: "google-apps-script",
  processes: processRepo,
  assessments: appsScriptAssessmentService,
};
