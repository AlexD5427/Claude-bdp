/**
 * Proveedor de datos de demostración.
 *
 * Implementación completa del repositorio de Procesos sobre `localStorage`. Deja
 * que ProcessOS funcione de extremo a extremo sin backend desplegado y sirve de
 * respaldo sin conexión. La latencia se simula para que los estados de carga se
 * vean durante el desarrollo.
 *
 * Evaluaciones ya NO pasa por aquí: tiene su propio backend y su propio
 * simulador en memoria (`features/evaluaciones/backend`).
 */

import { ok, err, appError } from "../../../shared/result";
import type { Result } from "../../../shared/result";
import { createStore } from "../../../shared/store";
import type {
  DataProvider,
  ListQuery,
  ListResult,
  ProcessRepository,
} from "../../repositories/contracts";
import {
  toProcessSummary,
  type ProcessSummary,
  type RecruitmentProcess,
} from "../../../features/processes/domain/models";
import { duplicateProcess } from "../../../features/processes/domain/factory";
import { seedProcesses } from "./seed";

const PROCESS_KEY = "bdp-mock-processes";

const processStore = createStore<RecruitmentProcess[]>(seedProcesses(), {
  persistKey: PROCESS_KEY,
});
const delay = (ms = 180) => new Promise((r) => setTimeout(r, ms));

function matches(haystack: string[], search?: string): boolean {
  if (!search) return true;
  const q = search.toLowerCase().trim();
  return haystack.some((h) => h.toLowerCase().includes(q));
}

function paginate<T>(items: T[], query?: ListQuery): { page: T[]; total: number } {
  const total = items.length;
  const page = query?.page ?? 1;
  const size = query?.pageSize ?? total;
  const start = (page - 1) * size;
  return { page: items.slice(start, start + size), total };
}

const processRepo: ProcessRepository = {
  async list(query) {
    await delay();
    const all = processStore.get();
    const filtered = all.filter((p) =>
      matches([p.code, p.title, p.area, p.location, p.department], query?.search),
    );
    const { page, total } = paginate(filtered, query);
    const items: ProcessSummary[] = page.map((p, i) =>
      // Deterministic-ish fake application counts for demo density.
      toProcessSummary(p, (p.id.charCodeAt(4) % 40) + i),
    );
    return ok<ListResult<ProcessSummary>>({ items, total, syncedAt: new Date().toISOString() });
  },

  async get(id) {
    await delay();
    const found = processStore.get().find((p) => p.id === id);
    return found ? ok(found) : err(appError("not_found", "Proceso no encontrado."));
  },

  async create(process) {
    await delay();
    processStore.set((prev) => [{ ...process, synchronizationStatus: "synced" }, ...prev]);
    return ok(process);
  },

  async updateDraft(process, expectedEntityVersion) {
    await delay();
    const current = processStore.get().find((p) => p.id === process.id);
    if (current && current.entityVersion > expectedEntityVersion) {
      return err(appError("conflict", "Otro usuario actualizó este proceso."));
    }
    const next: RecruitmentProcess = {
      ...process,
      entityVersion: process.entityVersion + 1,
      updatedAt: new Date().toISOString(),
      synchronizationStatus: "synced",
    };
    processStore.set((prev) => prev.map((p) => (p.id === next.id ? next : p)));
    return ok(next);
  },

  async publish(id, by) {
    return transitionProcess(id, by, { processStatus: "published", publicationStatus: "published" });
  },
  async pause(id, by) {
    return transitionProcess(id, by, { processStatus: "paused", publicationStatus: "paused" });
  },
  async close(id, by) {
    return transitionProcess(id, by, { processStatus: "closed", publicationStatus: "closed" });
  },
  async archive(id, by) {
    return transitionProcess(id, by, { processStatus: "archived", publicationStatus: "archived" });
  },

  async duplicate(id, by) {
    await delay();
    const source = processStore.get().find((p) => p.id === id);
    if (!source) return err(appError("not_found", "Proceso no encontrado."));
    const copy = duplicateProcess(source, by);
    processStore.set((prev) => [{ ...copy, synchronizationStatus: "synced" }, ...prev]);
    return ok(copy);
  },
};

async function transitionProcess(
  id: string,
  by: string,
  patch: Partial<RecruitmentProcess>,
): Promise<Result<RecruitmentProcess>> {
  await delay();
  const current = processStore.get().find((p) => p.id === id);
  if (!current) return err(appError("not_found", "Proceso no encontrado."));
  const next: RecruitmentProcess = {
    ...current,
    ...patch,
    entityVersion: current.entityVersion + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: by,
    synchronizationStatus: "synced",
  };
  processStore.set((prev) => prev.map((p) => (p.id === id ? next : p)));
  return ok(next);
}

export const mockProvider: DataProvider = {
  name: "mock",
  processes: processRepo,
};

/** Utilidad de pruebas: restablece los datos sembrados. */
export function resetMockData(): void {
  processStore.set(seedProcesses());
}
