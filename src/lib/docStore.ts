import { useSyncExternalStore } from "react";
import { SCRIPT_URL } from "../constants";
import { DOC_TEMPLATE, type DocGroup } from "./docTemplate";

/**
 * Documentation dossier store.
 *
 * Once a candidate is hired, the recruitment team must collect a long list of
 * physical/scanned documents. The Google Sheet doesn't model this yet, so — just
 * like {@link ./hiringStore} — we keep a resilient store in `localStorage` that
 * records, per person identificador, a full editable dossier: every document,
 * its status, page count, observation and optional extension date, plus the log
 * of reminder emails. Global email-automation settings live here too.
 *
 * Every mutation is also POSTed best-effort to the backend (envelope
 * `type:"documentacion"`), so once the Apps Script side (see docs/backend) is
 * deployed the same data persists to a "Documentación" sheet and the daily
 * trigger can send the 3-day reminders. Failures are swallowed — the local store
 * is the source of truth until the backend catches up.
 */

export type DocStatus = "pendiente" | "presentado" | "observado" | "no_aplica";

export const DOC_STATUS_LABELS: Record<DocStatus, string> = {
  pendiente: "Pendiente",
  presentado: "Presentado",
  observado: "Con observación",
  no_aplica: "No aplica",
};

export interface DocItem {
  /** Stable local id (from the template, or generated for custom docs). */
  id: string;
  label: string;
  group: DocGroup;
  status: DocStatus;
  /** Number of physical pages received for this document. */
  pages: number;
  observation: string;
  /** ISO date (yyyy-mm-dd) — extension granted to deliver the document. */
  prorroga?: string;
  /** Whether the document supports an extension date field. */
  allowProrroga?: boolean;
}

export interface EmailEvent {
  id: string;
  at: string; // ISO
  to: string;
  cc: string;
  subject: string;
  kind: "manual" | "auto";
  missingCount: number;
}

export interface Dossier {
  identificador: string;
  /** Snapshot of the person's data at dossier creation (editable). */
  nombre: string;
  cargo: string;
  agencia: string;
  gerencia: string;
  /** Recipient email for reminders (auto-filled if known, else manual). */
  correo: string;
  /** ISO date (yyyy-mm-dd) the person joined — drives the reminder cadence. */
  fechaIngreso: string;
  createdAt: string;
  items: DocItem[];
  emailLog: EmailEvent[];
}

export interface DocSettings {
  provider: "gmail" | "outlook";
  /** The sending account (shown as the remitente; the compose link opens it). */
  fromAccount: string;
  /** Address kept in copy (CC) on every reminder — the auxiliar a cargo. */
  ccEmail: string;
  /** Reminder cadence, in days (default 3). */
  intervalDays: number;
  /** Whether the system auto-drafts reminders on the cadence. */
  autoSendEnabled: boolean;
  /** Whether an auto reminder shows a preview + confirmation before sending. */
  requireConfirmation: boolean;
  subjectTemplate: string;
  bodyTemplate: string;
}

export interface DocState {
  dossiers: Record<string, Dossier>;
  settings: DocSettings;
}

const KEY = "bdp-documentacion";

export const DEFAULT_SETTINGS: DocSettings = {
  provider: "gmail",
  fromAccount: "",
  ccEmail: "",
  intervalDays: 3,
  autoSendEnabled: true,
  requireConfirmation: true,
  subjectTemplate: "BDP · Documentación pendiente para su incorporación",
  bodyTemplate: [
    "Estimado/a {nombre}:",
    "",
    "Como parte de su proceso de incorporación al Banco de Desarrollo Productivo para el cargo de {cargo}, le recordamos que aún tenemos pendiente la recepción de la siguiente documentación:",
    "",
    "{faltantes}",
    "",
    "Han transcurrido {dias} día(s) desde su fecha de ingreso ({fecha_ingreso}). Le agradeceremos presentar la documentación faltante a la brevedad posible.",
    "",
    "Ante cualquier consulta, quedamos a su disposición.",
    "",
    "Saludos cordiales,",
    "Equipo de Reclutamiento y Selección · BDP",
  ].join("\n"),
};

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `d-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function load(): DocState {
  if (typeof window === "undefined") return { dossiers: {}, settings: { ...DEFAULT_SETTINGS } };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { dossiers: {}, settings: { ...DEFAULT_SETTINGS } };
    const parsed = JSON.parse(raw) as Partial<DocState>;
    return {
      dossiers: parsed.dossiers ?? {},
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
    };
  } catch {
    return { dossiers: {}, settings: { ...DEFAULT_SETTINGS } };
  }
}

let state: DocState = load();
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

/** Fire-and-forget backend sync (no-op until the Apps Script side exists). */
function syncBackend(payload: unknown) {
  try {
    void fetch(SCRIPT_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

function syncDossier(d: Dossier) {
  syncBackend({ type: "documentacion", action: "upsert", dossier: d });
}

/* ------------------------------------------------------------------ */
/* Seed helpers                                                        */
/* ------------------------------------------------------------------ */

export interface SeedOptions {
  includeGarantia: boolean;
  includeCumplimiento: boolean;
}

/** Build the initial document list for a new dossier. */
export function buildSeedItems(opts: SeedOptions): DocItem[] {
  return DOC_TEMPLATE.filter((def) => {
    if (def.group === "garantia") return opts.includeGarantia;
    if (def.group === "cumplimiento") return opts.includeCumplimiento;
    return true;
  }).map((def) => ({
    id: def.id,
    label: def.label,
    group: def.group,
    status: "pendiente" as DocStatus,
    pages: 0,
    observation: "",
    allowProrroga: def.prorroga ?? false,
    prorroga: undefined,
  }));
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

export function createDossier(input: {
  identificador: string;
  nombre: string;
  cargo: string;
  agencia: string;
  gerencia: string;
  correo: string;
  fechaIngreso: string;
  seed: SeedOptions;
}): void {
  const now = new Date().toISOString();
  const dossier: Dossier = {
    identificador: input.identificador,
    nombre: input.nombre,
    cargo: input.cargo,
    agencia: input.agencia,
    gerencia: input.gerencia,
    correo: input.correo,
    fechaIngreso: input.fechaIngreso,
    createdAt: now,
    items: buildSeedItems(input.seed),
    emailLog: [],
  };
  state = { ...state, dossiers: { ...state.dossiers, [input.identificador]: dossier } };
  emit();
  syncDossier(dossier);
}

function withDossier(id: string, fn: (d: Dossier) => Dossier): void {
  const current = state.dossiers[id];
  if (!current) return;
  const next = fn(current);
  state = { ...state, dossiers: { ...state.dossiers, [id]: next } };
  emit();
  syncDossier(next);
}

export function updateDossierMeta(id: string, patch: Partial<Dossier>): void {
  withDossier(id, (d) => ({ ...d, ...patch }));
}

export function updateItem(id: string, itemId: string, patch: Partial<DocItem>): void {
  withDossier(id, (d) => ({
    ...d,
    items: d.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
  }));
}

export function addItem(id: string, group: DocGroup, label = "Nuevo documento"): void {
  withDossier(id, (d) => ({
    ...d,
    items: [
      ...d.items,
      {
        id: uid(),
        label,
        group,
        status: "pendiente",
        pages: 0,
        observation: "",
        allowProrroga: true,
      },
    ],
  }));
}

export function removeItem(id: string, itemId: string): void {
  withDossier(id, (d) => ({ ...d, items: d.items.filter((it) => it.id !== itemId) }));
}

export function removeDossier(id: string): void {
  const next = { ...state.dossiers };
  delete next[id];
  state = { ...state, dossiers: next };
  emit();
  syncBackend({ type: "documentacion", action: "delete", identificador: id });
}

export function logEmail(id: string, event: Omit<EmailEvent, "id" | "at">): void {
  const full: EmailEvent = { ...event, id: uid(), at: new Date().toISOString() };
  withDossier(id, (d) => ({ ...d, emailLog: [full, ...d.emailLog] }));
  syncBackend({ type: "documentacion_email", identificador: id, ...full });
}

export function setSettings(patch: Partial<DocSettings>): void {
  state = { ...state, settings: { ...state.settings, ...patch } };
  emit();
}

/* ------------------------------------------------------------------ */
/* React bindings                                                      */
/* ------------------------------------------------------------------ */

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot(): DocState {
  return state;
}

export function useDocStore(): DocState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
