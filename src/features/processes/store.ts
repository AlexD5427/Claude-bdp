import { useEffect } from "react";
import { createStore } from "../../shared/store";
import { toAppError } from "../../shared/errors";
import { toast } from "../../shared/toastStore";
import { env } from "../../infrastructure/env";
import {
  mockProcessRepository,
  processMockStore,
  resolveProcessRepository,
  type Actor,
  type ProcessRepository,
} from "./repository";
import type { ProcessDraftInput, ProcessStatus, ProcessSummary, RecruitmentProcess } from "./types";

/**
 * The ProcessOS UI store.
 *
 * It owns the list of summaries, the loading/error state and a small amount of
 * synchronisation metadata, and exposes imperative async actions that call the
 * configured repository. Reads are resilient: if the Apps Script backend has not
 * yet been redeployed with the `Procesos` operations, the first list attempt
 * fails gracefully and the store falls back to the fully-functional local mock
 * provider for the session, surfacing a discreet (dev-only) notice. Writes then
 * target the same fallback provider so nothing is silently lost.
 */

export type ListStatus = "idle" | "loading" | "ready" | "error";

interface ProcessListState {
  status: ListStatus;
  summaries: ProcessSummary[];
  error: string | null;
  provider: ProcessRepository["kind"];
  lastSyncedAt: string | null;
}

const store = createStore<ProcessListState>({
  status: "idle",
  summaries: [],
  error: null,
  provider: env.useMockProvider ? "mock" : "apps-script",
  lastSyncedAt: null,
});

let activeRepo: ProcessRepository = resolveProcessRepository();
let mockSubscribed = false;

/** Keep the list live when the mock store mutates (multi-tab / linked edits). */
function subscribeMockReactivity() {
  if (mockSubscribed) return;
  mockSubscribed = true;
  processMockStore.subscribe(() => {
    if (activeRepo.kind !== "mock") return;
    void refresh();
  });
}

/** (Re)load the list of process summaries. */
export async function refresh(signal?: AbortSignal): Promise<void> {
  const current = store.get();
  store.set({ ...current, status: current.summaries.length ? current.status : "loading", error: null });
  try {
    const summaries = await activeRepo.listSummaries(signal);
    store.set({
      status: "ready",
      summaries,
      error: null,
      provider: activeRepo.kind,
      lastSyncedAt: new Date().toISOString(),
    });
  } catch (err) {
    // Backend not ready (unknown operation) or offline → fall back to mock.
    if (activeRepo.kind === "apps-script") {
      activeRepo = mockProcessRepository;
      subscribeMockReactivity();
      if (env.isDev) {
        toast.info(
          "Procesos en modo local",
          "El backend aún no expone las operaciones de la hoja “Procesos”. Se usan datos locales.",
        );
      }
      try {
        const summaries = await activeRepo.listSummaries();
        store.set({
          status: "ready",
          summaries,
          error: null,
          provider: "mock",
          lastSyncedAt: new Date().toISOString(),
        });
        return;
      } catch (inner) {
        store.set({ ...store.get(), status: "error", error: toAppError(inner).message });
        return;
      }
    }
    store.set({ ...store.get(), status: "error", error: toAppError(err).message });
  }
}

export function getProcess(id: string): Promise<RecruitmentProcess | null> {
  return activeRepo.get(id);
}

export async function createProcess(input: ProcessDraftInput, actor: Actor): Promise<RecruitmentProcess> {
  const created = await activeRepo.create(input, actor);
  await refresh();
  return created;
}

export async function saveProcess(
  id: string,
  patch: Partial<ProcessDraftInput>,
  actor: Actor,
): Promise<RecruitmentProcess> {
  const updated = await activeRepo.update(id, patch, actor);
  await refresh();
  return updated;
}

export async function transitionProcess(
  id: string,
  status: ProcessStatus,
  actor: Actor,
): Promise<RecruitmentProcess> {
  // Optimistic list update for snappy Kanban / status changes.
  store.set((s) => ({
    ...s,
    summaries: s.summaries.map((p) => (p.id === id ? { ...p, status } : p)),
  }));
  try {
    const updated = await activeRepo.transition(id, status, actor);
    await refresh();
    return updated;
  } catch (err) {
    await refresh(); // rollback to server truth
    throw toAppError(err);
  }
}

export async function duplicateProcess(id: string, actor: Actor): Promise<RecruitmentProcess> {
  const copy = await activeRepo.duplicate(id, actor);
  await refresh();
  return copy;
}

export async function removeProcess(id: string): Promise<void> {
  store.set((s) => ({ ...s, summaries: s.summaries.filter((p) => p.id !== id) }));
  await activeRepo.remove(id);
  await refresh();
}

export function useProcessList(): ProcessListState {
  return store.use();
}

/** Mount-time loader for the ProcessOS page. */
export function useProcessOSData(): ProcessListState {
  const state = store.use();
  useEffect(() => {
    if (activeRepo.kind === "mock") subscribeMockReactivity();
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, []);
  return state;
}
