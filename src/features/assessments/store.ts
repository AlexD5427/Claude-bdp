import { useEffect, useMemo } from "react";
import { createStore } from "../../shared/store";
import { toAppError } from "../../shared/errors";
import { toast } from "../../shared/toastStore";
import { env } from "../../infrastructure/env";
import {
  assessmentMockStore,
  mockAssessmentRepository,
  resolveAssessmentRepository,
  type AssessmentRepository,
} from "./repository";
import type { Actor, NewAssessmentInput } from "./factory";
import type { AssessmentDefinition, AssessmentStatus, AssessmentSummary } from "./types";

/** The AssessmentOS list store — same resilient pattern as ProcessOS. */

export type ListStatus = "idle" | "loading" | "ready" | "error";

interface AssessmentListState {
  status: ListStatus;
  summaries: AssessmentSummary[];
  error: string | null;
  provider: AssessmentRepository["kind"];
  lastSyncedAt: string | null;
}

const store = createStore<AssessmentListState>({
  status: "idle",
  summaries: [],
  error: null,
  provider: env.useMockProvider ? "mock" : "apps-script",
  lastSyncedAt: null,
});

let activeRepo: AssessmentRepository = resolveAssessmentRepository();
let mockSubscribed = false;

function subscribeMockReactivity() {
  if (mockSubscribed) return;
  mockSubscribed = true;
  assessmentMockStore.subscribe(() => {
    if (activeRepo.kind !== "mock") return;
    void refresh();
  });
}

export async function refresh(signal?: AbortSignal): Promise<void> {
  const current = store.get();
  store.set({ ...current, status: current.summaries.length ? current.status : "loading", error: null });
  try {
    const summaries = await activeRepo.listSummaries(signal);
    store.set({ status: "ready", summaries, error: null, provider: activeRepo.kind, lastSyncedAt: new Date().toISOString() });
  } catch (err) {
    if (activeRepo.kind === "apps-script") {
      activeRepo = mockAssessmentRepository;
      subscribeMockReactivity();
      if (env.isDev) {
        toast.info(
          "Evaluaciones en modo local",
          "El backend aún no expone las operaciones de la hoja “Evaluaciones”. Se usan datos locales.",
        );
      }
      try {
        const summaries = await activeRepo.listSummaries();
        store.set({ status: "ready", summaries, error: null, provider: "mock", lastSyncedAt: new Date().toISOString() });
        return;
      } catch (inner) {
        store.set({ ...store.get(), status: "error", error: toAppError(inner).message });
        return;
      }
    }
    store.set({ ...store.get(), status: "error", error: toAppError(err).message });
  }
}

export function getAssessment(id: string): Promise<AssessmentDefinition | null> {
  return activeRepo.get(id);
}

export async function createAssessment(input: NewAssessmentInput, actor: Actor): Promise<AssessmentDefinition> {
  const created = await activeRepo.create(input, actor);
  await refresh();
  return created;
}

export async function saveAssessment(assessment: AssessmentDefinition, actor: Actor): Promise<AssessmentDefinition> {
  const saved = await activeRepo.save(assessment, actor);
  await refresh();
  return saved;
}

export async function publishAssessment(id: string, notes: string, actor: Actor): Promise<AssessmentDefinition> {
  const published = await activeRepo.publish(id, notes, actor);
  await refresh();
  return published;
}

export async function transitionAssessment(id: string, status: AssessmentStatus, actor: Actor): Promise<AssessmentDefinition> {
  const updated = await activeRepo.transition(id, status, actor);
  await refresh();
  return updated;
}

export async function duplicateAssessment(id: string, actor: Actor): Promise<AssessmentDefinition> {
  const copy = await activeRepo.duplicate(id, actor);
  await refresh();
  return copy;
}

export async function removeAssessment(id: string): Promise<void> {
  store.set((s) => ({ ...s, summaries: s.summaries.filter((a) => a.id !== id) }));
  await activeRepo.remove(id);
  await refresh();
}

export function useAssessmentList(): AssessmentListState {
  return store.use();
}

export function useAssessmentOSData(): AssessmentListState {
  const state = store.use();
  useEffect(() => {
    if (activeRepo.kind === "mock") subscribeMockReactivity();
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, []);
  return state;
}

/**
 * Link options for the process editor's "Evaluaciones" section. Loads the
 * summaries lazily on first use so ProcessOS can offer real assessments to link
 * without importing the whole module eagerly.
 */
export function useAssessmentLinkOptions(): { id: string; name: string }[] {
  const state = store.use();
  useEffect(() => {
    if (state.status === "idle") void refresh();
  }, [state.status]);
  return useMemo(() => state.summaries.map((s) => ({ id: s.id, name: s.name })), [state.summaries]);
}
