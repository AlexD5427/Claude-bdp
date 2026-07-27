/**
 * Mock data provider.
 *
 * A fully functional, localStorage-backed implementation of both repositories.
 * It lets every ProcessOS / AssessmentOS workflow run end-to-end without a
 * deployed backend, and doubles as the offline/demo fallback. Latency is
 * simulated so loading/optimistic states are visible during development.
 */

import { ok, err, appError } from "../../../shared/result";
import type { Result } from "../../../shared/result";
import { createStore } from "../../../shared/store";
import type {
  AssessmentRepository,
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
import {
  toAssessmentSummary,
  type AssessmentDefinition,
  type AssessmentSummary,
} from "../../../features/assessments/domain/assessment";
import { duplicateAssessment } from "../../../features/assessments/domain/factory";
import { publishDraft, rollbackToVersion } from "../../../features/assessments/versioning/operations";
import {
  emptyResultsSummary,
  type AssessmentResults,
  type AttemptDetail,
} from "../../../features/assessments/domain/attempts";
import { seedAssessments, seedProcesses } from "./seed";

const PROCESS_KEY = "bdp-mock-processes";
const ASSESSMENT_KEY = "bdp-mock-assessments";

const processStore = createStore<RecruitmentProcess[]>(seedProcesses(), {
  persistKey: PROCESS_KEY,
});
const assessmentStore = createStore<AssessmentDefinition[]>(seedAssessments(), {
  persistKey: ASSESSMENT_KEY,
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

/**
 * MockAssessmentService — la ÚNICA puerta a los datos de demostración.
 *
 * Los datos mock solo son alcanzables a través de este objeto y solo cuando la
 * configuración lo selecciona explícitamente (`VITE_ASSESSMENTS_PROVIDER=mock`,
 * que es el valor por omisión). El módulo muestra siempre el origen activo, así
 * que nunca hay una mezcla silenciosa entre demo y datos reales.
 *
 * Los intentos NO se simulan: `listResults` devuelve una lista vacía con
 * agregados en `null`, porque inventar métricas sería peor que no tenerlas.
 */
const assessmentRepo: AssessmentRepository = {
  async list(query) {
    await delay();
    const all = assessmentStore.get();
    const filtered = all.filter((a) => matches([a.code, a.name, a.category], query?.search));
    const { page, total } = paginate(filtered, query);
    const items: AssessmentSummary[] = page.map(toAssessmentSummary);
    return ok<ListResult<AssessmentSummary>>({
      items,
      total,
      syncedAt: new Date().toISOString(),
    });
  },

  async get(id) {
    await delay();
    const found = assessmentStore.get().find((a) => a.id === id);
    return found ? ok(found) : err(appError("not_found", "Evaluación no encontrada."));
  },

  async create(assessment) {
    await delay();
    assessmentStore.set((prev) => [{ ...assessment, synchronizationStatus: "synced" }, ...prev]);
    return ok(assessment);
  },

  async updateDraft(assessment, expectedEntityVersion) {
    await delay();
    const current = assessmentStore.get().find((a) => a.id === assessment.id);
    if (current && current.entityVersion > expectedEntityVersion) {
      return err(appError("conflict", "Otro usuario actualizó esta evaluación."));
    }
    const next: AssessmentDefinition = {
      ...assessment,
      entityVersion: assessment.entityVersion + 1,
      updatedAt: new Date().toISOString(),
      synchronizationStatus: "synced",
    };
    assessmentStore.set((prev) => prev.map((a) => (a.id === next.id ? next : a)));
    return ok(next);
  },

  async publish(id, by, notes) {
    await delay();
    const current = assessmentStore.get().find((a) => a.id === id);
    if (!current) return err(appError("not_found", "Evaluación no encontrada."));
    const next = { ...publishDraft(current, by, notes), synchronizationStatus: "synced" as const };
    assessmentStore.set((prev) => prev.map((a) => (a.id === id ? next : a)));
    return ok(next);
  },

  async pause(id, by) {
    return transitionAssessment(id, by, { lifecycle: "paused", publication: "paused" });
  },
  async close(id, by) {
    return transitionAssessment(id, by, { lifecycle: "closed", publication: "closed" });
  },
  async archive(id, by) {
    return transitionAssessment(id, by, { lifecycle: "archived", publication: "archived" });
  },

  async duplicate(id, by) {
    await delay();
    const source = assessmentStore.get().find((a) => a.id === id);
    if (!source) return err(appError("not_found", "Evaluación no encontrada."));
    const copy = duplicateAssessment(source, by);
    assessmentStore.set((prev) => [{ ...copy, synchronizationStatus: "synced" }, ...prev]);
    return ok(copy);
  },

  async rollback(id, versionId, by) {
    await delay();
    const current = assessmentStore.get().find((a) => a.id === id);
    if (!current) return err(appError("not_found", "Evaluación no encontrada."));
    const next = { ...rollbackToVersion(current, versionId, by), synchronizationStatus: "synced" as const };
    assessmentStore.set((prev) => prev.map((a) => (a.id === id ? next : a)));
    return ok(next);
  },

  async listResults(id): Promise<Result<AssessmentResults>> {
    await delay();
    const exists = assessmentStore.get().some((a) => a.id === id);
    if (!exists) return err(appError("not_found", "Evaluación no encontrada."));
    // Sin backend no hay intentos reales, y no se fabrican datos sintéticos.
    return ok({ attempts: [], summary: emptyResultsSummary() });
  },

  async getAttemptDetail(): Promise<Result<AttemptDetail>> {
    await delay();
    return err(
      appError(
        "not_found",
        "Los intentos de candidatos requieren el backend real de Apps Script.",
      ),
    );
  },
};

/** Alias explícito del servicio de evaluaciones de demostración. */
export const MockAssessmentService = assessmentRepo;

async function transitionAssessment(
  id: string,
  by: string,
  patch: Partial<AssessmentDefinition>,
): Promise<Result<AssessmentDefinition>> {
  await delay();
  const current = assessmentStore.get().find((a) => a.id === id);
  if (!current) return err(appError("not_found", "Evaluación no encontrada."));
  const next: AssessmentDefinition = {
    ...current,
    ...patch,
    entityVersion: current.entityVersion + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: by,
    synchronizationStatus: "synced",
  };
  assessmentStore.set((prev) => prev.map((a) => (a.id === id ? next : a)));
  return ok(next);
}

export const mockProvider: DataProvider = {
  name: "mock",
  processes: processRepo,
  assessments: assessmentRepo,
};

/** Test/utility hook: reset the mock stores to freshly seeded data. */
export function resetMockData(): void {
  processStore.set(seedProcesses());
  assessmentStore.set(seedAssessments());
}
