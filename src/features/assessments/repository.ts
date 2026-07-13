import { env } from "../../infrastructure/env";
import { getJson, postJson } from "../../infrastructure/providers/appsScriptClient";
import { appError, toAppError } from "../../shared/errors";
import { createStore } from "../../shared/store";
import { uid } from "../../shared/id";
import { assessmentToRow, rowToAssessment, toAssessmentSummary, type EvaluacionesRow } from "./mappers";
import { safeParseAssessment } from "./schema";
import { seedAssessments } from "./sampleData";
import { withDerived, createAssessmentDefinition, type Actor, type NewAssessmentInput } from "./factory";
import { classifyEdit, nextVersion, snapshotVersion } from "./lifecycle";
import type {
  AssessmentAuditEntry,
  AssessmentDefinition,
  AssessmentStatus,
  AssessmentSummary,
} from "./types";

/**
 * Provider-neutral repository contract for AssessmentOS. Mirrors the process
 * repository: a fully-functional local `mock` provider and an `apps-script`
 * provider speaking the documented `Evaluaciones` operations. Published versions
 * are never overwritten — publishing snapshots the current draft into an
 * immutable version and sets it as the current one.
 */
export interface AssessmentRepository {
  readonly kind: "mock" | "apps-script";
  listSummaries(signal?: AbortSignal): Promise<AssessmentSummary[]>;
  get(id: string, signal?: AbortSignal): Promise<AssessmentDefinition | null>;
  create(input: NewAssessmentInput, actor: Actor): Promise<AssessmentDefinition>;
  save(assessment: AssessmentDefinition, actor: Actor): Promise<AssessmentDefinition>;
  publish(id: string, notes: string, actor: Actor): Promise<AssessmentDefinition>;
  transition(id: string, status: AssessmentStatus, actor: Actor): Promise<AssessmentDefinition>;
  duplicate(id: string, actor: Actor): Promise<AssessmentDefinition>;
  remove(id: string): Promise<void>;
}

function audit(
  action: AssessmentAuditEntry["action"],
  actor: Actor,
  summary: string,
  extra: Partial<AssessmentAuditEntry> = {},
): AssessmentAuditEntry {
  return {
    id: uid("aud"),
    action,
    actorId: actor.id,
    actorName: actor.name,
    timestamp: new Date().toISOString(),
    summary,
    ...extra,
  };
}

/* ---- mock provider ----------------------------------------------- */

interface MockDb {
  assessments: AssessmentDefinition[];
  seeded: boolean;
}

const mockStore = createStore<MockDb>(
  { assessments: [], seeded: false },
  {
    key: "bdp-assessments-mock",
    hydrate: (raw, initial) => {
      if (!raw || typeof raw !== "object") return initial;
      const db = raw as Partial<MockDb>;
      const assessments = Array.isArray(db.assessments)
        ? db.assessments.map((a) => safeParseAssessment(a)).filter((r) => r.success).map((r) => r.data)
        : [];
      return { assessments: assessments as AssessmentDefinition[], seeded: Boolean(db.seeded) };
    },
  },
);

export const assessmentMockStore = mockStore;

function ensureSeeded() {
  if (mockStore.get().seeded) return;
  mockStore.set({ assessments: seedAssessments(), seeded: true });
}

function publishInternal(a: AssessmentDefinition, notes: string, actor: Actor): AssessmentDefinition {
  const now = new Date().toISOString();
  const version = a.currentVersion ?? a.draftVersion ?? "1.0";
  const snapshot = snapshotVersion(a, version, actor, notes || "Publicación de versión.");
  return withDerived({
    ...a,
    status: "published",
    publicationStatus: "published",
    currentVersion: version,
    publishedAt: a.publishedAt ?? now,
    updatedAt: now,
    updatedBy: actor.name || actor.id,
    versions: [...a.versions, snapshot],
    auditTrail: [
      ...a.auditTrail,
      audit("version_published", actor, `Versión ${version} publicada.`, { versionAfter: version }),
    ],
  });
}

export const mockAssessmentRepository: AssessmentRepository = {
  kind: "mock",
  async listSummaries() {
    ensureSeeded();
    return mockStore.get().assessments.map(toAssessmentSummary);
  },
  async get(id) {
    ensureSeeded();
    return mockStore.get().assessments.find((a) => a.id === id) ?? null;
  },
  async create(input, actor) {
    ensureSeeded();
    const created = createAssessmentDefinition(input, actor, "mock");
    mockStore.set((db) => ({ ...db, assessments: [created, ...db.assessments] }));
    return created;
  },
  async save(assessment, actor) {
    ensureSeeded();
    const prev = mockStore.get().assessments.find((a) => a.id === assessment.id);
    // Bump the draft version when the current published version is edited
    // structurally, so a future publish creates a new version rather than
    // overwriting the published one.
    let draftVersion = assessment.draftVersion;
    if (prev && prev.currentVersion) {
      const classification = classifyEdit(prev, assessment);
      if (classification !== "none") draftVersion = nextVersion(prev.currentVersion, classification);
    }
    const updated = withDerived({
      ...assessment,
      draftVersion,
      updatedAt: new Date().toISOString(),
      updatedBy: actor.name || actor.id,
    });
    mockStore.set((db) => ({
      ...db,
      assessments: db.assessments.map((a) => (a.id === updated.id ? updated : a)),
    }));
    return updated;
  },
  async publish(id, notes, actor) {
    ensureSeeded();
    let result: AssessmentDefinition | null = null;
    mockStore.set((db) => ({
      ...db,
      assessments: db.assessments.map((a) => {
        if (a.id !== id) return a;
        result = publishInternal(a, notes, actor);
        return result;
      }),
    }));
    if (!result) throw appError("not_found");
    return result;
  },
  async transition(id, status, actor) {
    ensureSeeded();
    let result: AssessmentDefinition | null = null;
    mockStore.set((db) => ({
      ...db,
      assessments: db.assessments.map((a) => {
        if (a.id !== id) return a;
        result = {
          ...a,
          status,
          publicationStatus:
            status === "paused"
              ? "paused"
              : status === "archived"
                ? "archived"
                : status === "closed"
                  ? "closed"
                  : a.publicationStatus,
          archivedAt: status === "archived" ? new Date().toISOString() : a.archivedAt,
          updatedAt: new Date().toISOString(),
          updatedBy: actor.name || actor.id,
          auditTrail: [...a.auditTrail, audit("edited", actor, `Estado cambiado a “${status}”.`)],
        };
        return result;
      }),
    }));
    if (!result) throw appError("not_found");
    return result;
  },
  async duplicate(id, actor) {
    ensureSeeded();
    const src = mockStore.get().assessments.find((a) => a.id === id);
    if (!src) throw appError("not_found");
    const now = new Date().toISOString();
    const copy: AssessmentDefinition = {
      ...JSON.parse(JSON.stringify(src)),
      id: uid("asmt"),
      name: `${src.name} (copia)`,
      status: "draft",
      publicationStatus: "unpublished",
      currentVersion: null,
      draftVersion: "1.0",
      publishedAt: null,
      versions: [],
      createdAt: now,
      updatedAt: now,
      createdBy: actor.name || actor.id,
      updatedBy: actor.name || actor.id,
      auditTrail: [audit("duplicated", actor, `Duplicado de ${src.name}.`)],
    };
    mockStore.set((db) => ({ ...db, assessments: [copy, ...db.assessments] }));
    return copy;
  },
  async remove(id) {
    mockStore.set((db) => ({ ...db, assessments: db.assessments.filter((a) => a.id !== id) }));
  },
};

/* ---- apps-script provider ---------------------------------------- */

async function readAssessments(signal?: AbortSignal): Promise<AssessmentDefinition[]> {
  const res = await getJson<unknown>({ resource: "evaluaciones" }, { signal });
  if (!res.success) throw appError("http", res.error?.message);
  const container = res.data as { evaluaciones?: EvaluacionesRow[] } | EvaluacionesRow[] | undefined;
  const rows = Array.isArray(container) ? container : (container?.evaluaciones ?? []);
  return rows.map((r) => rowToAssessment(r)).filter((a): a is AssessmentDefinition => a != null);
}

export const appsScriptAssessmentRepository: AssessmentRepository = {
  kind: "apps-script",
  async listSummaries(signal) {
    return (await readAssessments(signal)).map(toAssessmentSummary);
  },
  async get(id, signal) {
    return (await readAssessments(signal)).find((a) => a.id === id) ?? null;
  },
  async create(input, actor) {
    const created = createAssessmentDefinition(input, actor, "apps-script");
    const res = await postJson({ type: "evaluacion", action: "create", idempotencyKey: created.id, row: assessmentToRow(created) });
    if (!res.success) throw appError("http", res.error?.message);
    return { ...created, synchronizationStatus: "synced" };
  },
  async save(assessment, actor) {
    const updated = withDerived({ ...assessment, updatedAt: new Date().toISOString(), updatedBy: actor.name || actor.id });
    const res = await postJson({ type: "evaluacion", action: "update", row: assessmentToRow(updated) });
    if (!res.success) throw appError("http", res.error?.message);
    return { ...updated, synchronizationStatus: "synced" };
  },
  async publish(id, notes, actor) {
    const current = await this.get(id);
    if (!current) throw appError("not_found");
    const published = publishInternal(current, notes, actor);
    // A new published version is written as its own row (composite ID+Version).
    const res = await postJson({
      type: "evaluacion",
      action: "publish_version",
      row: assessmentToRow(published),
      version: published.currentVersion,
    });
    if (!res.success) throw appError("http", res.error?.message);
    return { ...published, synchronizationStatus: "synced" };
  },
  async transition(id, status, actor) {
    const current = await this.get(id);
    if (!current) throw appError("not_found");
    const updated = { ...current, status, updatedAt: new Date().toISOString(), updatedBy: actor.name || actor.id };
    const res = await postJson({ type: "evaluacion", action: "update", row: assessmentToRow(updated) });
    if (!res.success) throw appError("http", res.error?.message);
    return { ...updated, synchronizationStatus: "synced" };
  },
  async duplicate(id, actor) {
    const src = await this.get(id);
    if (!src) throw appError("not_found");
    return this.create({ name: `${src.name} (copia)`, category: src.category, sections: src.sections, tags: src.tags }, actor);
  },
  async remove(id) {
    const res = await postJson({ type: "evaluacion", action: "delete", id });
    if (!res.success) throw toAppError(res.error?.message);
  },
};

export function resolveAssessmentRepository(): AssessmentRepository {
  return env.useMockProvider ? mockAssessmentRepository : appsScriptAssessmentRepository;
}
