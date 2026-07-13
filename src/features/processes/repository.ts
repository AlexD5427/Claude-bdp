import { env } from "../../infrastructure/env";
import { getJson, postJson } from "../../infrastructure/providers/appsScriptClient";
import { appError, toAppError } from "../../shared/errors";
import { createStore } from "../../shared/store";
import { uid, slugCode, slugify } from "../../shared/id";
import { processToRow, rowToProcess, toProcessSummary, type ProcesosRow } from "./mappers";
import { safeParseProcess } from "./schema";
import { publicationForStatus } from "./statuses";
import { seedProcesses } from "./sampleData";
import type {
  ProcessAuditEntry,
  ProcessDraftInput,
  ProcessStatus,
  ProcessSummary,
  RecruitmentProcess,
} from "./types";

/**
 * Provider-neutral repository contract for ProcessOS.
 *
 * The UI depends only on this interface, so swapping Google Sheets for Supabase
 * later requires no UI rewrite — only a new implementation. Two implementations
 * ship today: a local `mock` provider (fully functional, offline) and an
 * `apps-script` provider that speaks to the existing web-app endpoint using the
 * documented `Procesos` operations.
 */
export interface Actor {
  id: string;
  name?: string;
}

export interface ProcessRepository {
  readonly kind: "mock" | "apps-script";
  listSummaries(signal?: AbortSignal): Promise<ProcessSummary[]>;
  get(id: string, signal?: AbortSignal): Promise<RecruitmentProcess | null>;
  create(input: ProcessDraftInput, actor: Actor): Promise<RecruitmentProcess>;
  update(id: string, patch: Partial<ProcessDraftInput>, actor: Actor): Promise<RecruitmentProcess>;
  transition(id: string, status: ProcessStatus, actor: Actor): Promise<RecruitmentProcess>;
  duplicate(id: string, actor: Actor): Promise<RecruitmentProcess>;
  remove(id: string): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

function audit(action: ProcessAuditEntry["action"], actor: Actor, summary: string): ProcessAuditEntry {
  return {
    id: uid("aud"),
    action,
    actorId: actor.id,
    actorName: actor.name,
    timestamp: new Date().toISOString(),
    summary,
  };
}

/** Build a brand-new process from editor input. */
function buildProcess(
  input: ProcessDraftInput,
  actor: Actor,
  source: "mock" | "apps-script",
): RecruitmentProcess {
  const now = new Date().toISOString();
  const id = uid("proc");
  return {
    id,
    externalReference: "",
    code: input.code || slugCode(input.title),
    title: input.title,
    slug: slugify(input.title),
    description: input.description,
    shortDescription: input.shortDescription,
    mission: input.mission,
    area: input.area,
    department: input.department,
    businessUnit: input.businessUnit,
    region: input.region,
    city: input.city,
    branch: input.branch,
    location: input.location,
    workMode: input.workMode,
    employmentType: input.employmentType,
    experienceLevel: input.experienceLevel,
    vacancies: input.vacancies,
    recruiterIds: input.recruiterIds,
    hiringManagerIds: input.hiringManagerIds,
    ownerId: input.ownerId || actor.id,
    status: "borrador",
    publicationStatus: "no_publicado",
    visibility: input.visibility,
    applicationFormId: null,
    assessmentIds: input.assessmentIds,
    openingDate: input.openingDate,
    closingDate: input.closingDate,
    publishedAt: null,
    closedAt: null,
    archivedAt: null,
    createdAt: now,
    createdBy: actor.name || actor.id,
    updatedAt: now,
    updatedBy: actor.name || actor.id,
    schemaVersion: 1,
    sourceProvider: source,
    synchronizationStatus: source === "mock" ? "local" : "pending",
    configuration: input.configuration,
    publicContentBlocks: input.publicContentBlocks,
    internalMetadata: {},
    auditTrail: [audit("created", actor, `Proceso creado: ${input.title}`)],
  };
}

function applyTransition(p: RecruitmentProcess, status: ProcessStatus, actor: Actor): RecruitmentProcess {
  const now = new Date().toISOString();
  const pub = publicationForStatus(status);
  return {
    ...p,
    status,
    publicationStatus: pub ?? p.publicationStatus,
    publishedAt: status === "publicado" && !p.publishedAt ? now : p.publishedAt,
    closedAt: status === "cerrado" ? now : p.closedAt,
    archivedAt: status === "archivado" ? now : p.archivedAt,
    updatedAt: now,
    updatedBy: actor.name || actor.id,
    auditTrail: [
      ...p.auditTrail,
      audit(
        status === "publicado"
          ? "published"
          : status === "pausado"
            ? "paused"
            : status === "cerrado"
              ? "closed"
              : status === "archivado"
                ? "archived"
                : "edited",
        actor,
        `Estado cambiado a “${status}”.`,
      ),
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Mock provider — local, fully functional                            */
/* ------------------------------------------------------------------ */

interface MockDb {
  processes: RecruitmentProcess[];
  seeded: boolean;
}

const mockStore = createStore<MockDb>(
  { processes: [], seeded: false },
  {
    key: "bdp-processos-mock",
    hydrate: (raw, initial) => {
      if (!raw || typeof raw !== "object") return initial;
      const db = raw as Partial<MockDb>;
      const processes = Array.isArray(db.processes)
        ? db.processes.map((p) => safeParseProcess(p)).filter(Boolean)
        : [];
      return { processes: processes as RecruitmentProcess[], seeded: Boolean(db.seeded) };
    },
  },
);

function ensureSeeded() {
  const db = mockStore.get();
  if (db.seeded) return;
  mockStore.set({ processes: seedProcesses(), seeded: true });
}

/** Expose the mock store so the store layer can subscribe for reactivity. */
export const processMockStore = mockStore;

export const mockProcessRepository: ProcessRepository = {
  kind: "mock",
  async listSummaries() {
    ensureSeeded();
    return mockStore.get().processes.map((p) => toProcessSummary(p));
  },
  async get(id) {
    ensureSeeded();
    return mockStore.get().processes.find((p) => p.id === id) ?? null;
  },
  async create(input, actor) {
    ensureSeeded();
    const process = buildProcess(input, actor, "mock");
    mockStore.set((db) => ({ ...db, processes: [process, ...db.processes] }));
    return process;
  },
  async update(id, patch, actor) {
    ensureSeeded();
    let updated: RecruitmentProcess | null = null;
    mockStore.set((db) => ({
      ...db,
      processes: db.processes.map((p) => {
        if (p.id !== id) return p;
        updated = {
          ...p,
          ...patch,
          configuration: patch.configuration ?? p.configuration,
          publicContentBlocks: patch.publicContentBlocks ?? p.publicContentBlocks,
          updatedAt: new Date().toISOString(),
          updatedBy: actor.name || actor.id,
          auditTrail: [...p.auditTrail, audit("edited", actor, "Proceso editado.")],
        };
        return updated;
      }),
    }));
    if (!updated) throw appError("not_found");
    return updated;
  },
  async transition(id, status, actor) {
    ensureSeeded();
    let updated: RecruitmentProcess | null = null;
    mockStore.set((db) => ({
      ...db,
      processes: db.processes.map((p) => {
        if (p.id !== id) return p;
        updated = applyTransition(p, status, actor);
        return updated;
      }),
    }));
    if (!updated) throw appError("not_found");
    return updated;
  },
  async duplicate(id, actor) {
    ensureSeeded();
    const src = mockStore.get().processes.find((p) => p.id === id);
    if (!src) throw appError("not_found");
    const now = new Date().toISOString();
    const copy: RecruitmentProcess = {
      ...src,
      id: uid("proc"),
      title: `${src.title} (copia)`,
      code: slugCode(`${src.title} copia`),
      slug: slugify(`${src.title}-copia`),
      status: "borrador",
      publicationStatus: "no_publicado",
      publishedAt: null,
      closedAt: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      createdBy: actor.name || actor.id,
      updatedBy: actor.name || actor.id,
      auditTrail: [audit("duplicated", actor, `Duplicado de ${src.title}.`)],
    };
    mockStore.set((db) => ({ ...db, processes: [copy, ...db.processes] }));
    return copy;
  },
  async remove(id) {
    mockStore.set((db) => ({ ...db, processes: db.processes.filter((p) => p.id !== id) }));
  },
};

/* ------------------------------------------------------------------ */
/* Apps Script provider                                                */
/* ------------------------------------------------------------------ */

async function readProcessesFromBackend(signal?: AbortSignal): Promise<RecruitmentProcess[]> {
  const res = await getJson<unknown>({ resource: "procesos" }, { signal });
  if (!res.success) throw appError("http", res.error?.message);
  // The backend returns either { procesos: [...] } or a raw array.
  const container = res.data as { procesos?: ProcesosRow[] } | ProcesosRow[] | undefined;
  const rows = Array.isArray(container) ? container : (container?.procesos ?? []);
  return rows.map((r) => rowToProcess(r)).filter((p): p is RecruitmentProcess => p != null);
}

export const appsScriptProcessRepository: ProcessRepository = {
  kind: "apps-script",
  async listSummaries(signal) {
    const processes = await readProcessesFromBackend(signal);
    return processes.map((p) => toProcessSummary(p));
  },
  async get(id, signal) {
    const processes = await readProcessesFromBackend(signal);
    return processes.find((p) => p.id === id) ?? null;
  },
  async create(input, actor) {
    const process = buildProcess(input, actor, "apps-script");
    const res = await postJson({
      type: "proceso",
      action: "create",
      // Idempotency: the client-generated id lets the backend dedupe retries.
      idempotencyKey: process.id,
      row: processToRow(process),
    });
    if (!res.success) throw appError("http", res.error?.message);
    return { ...process, synchronizationStatus: "synced" };
  },
  async update(id, patch, actor) {
    const current = await this.get(id);
    if (!current) throw appError("not_found");
    const merged: RecruitmentProcess = {
      ...current,
      ...patch,
      configuration: patch.configuration ?? current.configuration,
      publicContentBlocks: patch.publicContentBlocks ?? current.publicContentBlocks,
      updatedAt: new Date().toISOString(),
      updatedBy: actor.name || actor.id,
      auditTrail: [...current.auditTrail, audit("edited", actor, "Proceso editado.")],
    };
    const res = await postJson({ type: "proceso", action: "update", row: processToRow(merged) });
    if (!res.success) throw appError("http", res.error?.message);
    return { ...merged, synchronizationStatus: "synced" };
  },
  async transition(id, status, actor) {
    const current = await this.get(id);
    if (!current) throw appError("not_found");
    const updated = applyTransition(current, status, actor);
    const res = await postJson({ type: "proceso", action: "update", row: processToRow(updated) });
    if (!res.success) throw appError("http", res.error?.message);
    return { ...updated, synchronizationStatus: "synced" };
  },
  async duplicate(id, actor) {
    const src = await this.get(id);
    if (!src) throw appError("not_found");
    const draft: ProcessDraftInput = {
      title: `${src.title} (copia)`,
      code: slugCode(`${src.title} copia`),
      description: src.description,
      shortDescription: src.shortDescription,
      mission: src.mission,
      area: src.area,
      department: src.department,
      businessUnit: src.businessUnit,
      region: src.region,
      city: src.city,
      branch: src.branch,
      location: src.location,
      workMode: src.workMode,
      employmentType: src.employmentType,
      experienceLevel: src.experienceLevel,
      vacancies: src.vacancies,
      recruiterIds: src.recruiterIds,
      hiringManagerIds: src.hiringManagerIds,
      ownerId: actor.id,
      visibility: src.visibility,
      assessmentIds: src.assessmentIds,
      openingDate: src.openingDate,
      closingDate: src.closingDate,
      configuration: src.configuration,
      publicContentBlocks: src.publicContentBlocks,
    };
    return this.create(draft, actor);
  },
  async remove(id) {
    const res = await postJson({ type: "proceso", action: "delete", id });
    if (!res.success) throw toAppError(res.error?.message);
  },
};

/** Resolve the configured provider for ProcessOS. */
export function resolveProcessRepository(): ProcessRepository {
  return env.useMockProvider ? mockProcessRepository : appsScriptProcessRepository;
}
