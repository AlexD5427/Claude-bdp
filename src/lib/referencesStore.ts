import { useSyncExternalStore } from "react";
import { SCRIPT_URL } from "../constants";
import { logActivity } from "./profilesStore";

/**
 * Labor references & comments store.
 *
 * Part of a candidate's full profile is a panel of **labor references** — the
 * people a recruiter phoned to vouch for the applicant — plus structured
 * comments. The Google Sheet doesn't model this yet, so (like
 * {@link ./hiringStore} and {@link ./docStore}) we keep a resilient store in
 * `localStorage`, keyed by the candidate identificador, and mirror every change
 * best-effort to the backend (`type: "referencia_laboral"`). Failures are
 * swallowed — the local store is the source of truth until the Apps Script side
 * (see docs/backend) catches up.
 */

/** Whether a reference recommends the candidate. */
export type Recommendation = "si" | "con_reservas" | "no" | "";

export const RECOMMENDATION_LABELS: Record<Exclude<Recommendation, "">, string> = {
  si: "Recomienda",
  con_reservas: "Con reservas",
  no: "No recomienda",
};

export interface LaborReference {
  id: string;
  /** ISO timestamp the reference was registered. */
  createdAt: string;
  /** The profile that captured it (recruiter name). */
  author: string;
  /** Name of the person called. */
  refereeName: string;
  /** Their role / position. */
  refereeRole: string;
  /** The company where they worked with the candidate. */
  company: string;
  /** Working relationship ("Jefe directo", "Colega"…). */
  relationship: string;
  /** Phone / email used to reach them. */
  contact: string;
  /** 1–5 star assessment. */
  rating: number;
  /** Whether the reference recommends the candidate. */
  recommends: Recommendation;
  /** Whether the reference was actually reached / verified. */
  verified: boolean;
  /** Free-form structured comment. */
  comment: string;
  /** Highlighted strengths (tags). */
  strengths: string[];
  /** Aspects to consider (tags). */
  concerns: string[];
}

export type ReferencesMap = Record<string, LaborReference[]>;

const KEY = "bdp-referencias";

function load(): ReferencesMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as ReferencesMap) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

let state: ReferencesMap = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / private mode */
  }
}

function emit() {
  persist();
  for (const l of listeners) l();
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `ref-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Fire-and-forget backend mirror (no-op until the Apps Script side exists). */
function syncBackend(identificador: string, action: "upsert" | "delete", ref?: LaborReference) {
  try {
    void fetch(SCRIPT_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ type: "referencia_laboral", action, identificador, referencia: ref }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

export function getReferences(identificador: string): LaborReference[] {
  return state[identificador] ?? [];
}

export type NewReference = Omit<LaborReference, "id" | "createdAt">;

export function addReference(identificador: string, input: NewReference): LaborReference {
  const ref: LaborReference = { ...input, id: uid(), createdAt: new Date().toISOString() };
  state = { ...state, [identificador]: [ref, ...(state[identificador] ?? [])] };
  emit();
  syncBackend(identificador, "upsert", ref);
  logActivity({
    modulo: "perfil",
    accion: "Registró referencia laboral",
    detalle: `${identificador} · ${ref.refereeName || "referencia"}`,
  });
  return ref;
}

export function updateReference(
  identificador: string,
  id: string,
  patch: Partial<NewReference>,
): void {
  const list = state[identificador] ?? [];
  const next = list.map((r) => (r.id === id ? { ...r, ...patch } : r));
  state = { ...state, [identificador]: next };
  emit();
  const updated = next.find((r) => r.id === id);
  if (updated) syncBackend(identificador, "upsert", updated);
}

export function removeReference(identificador: string, id: string): void {
  const list = state[identificador] ?? [];
  state = { ...state, [identificador]: list.filter((r) => r.id !== id) };
  emit();
  syncBackend(identificador, "delete", { id } as LaborReference);
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot(): ReferencesMap {
  return state;
}

/** React binding — the whole references map (re-renders on any change). */
export function useReferences(): ReferencesMap {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
