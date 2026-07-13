import { locale } from "../../content/locale/es-BO";
import type {
  EmploymentType,
  ExperienceLevel,
  ProcessStatus,
  PublicationStatus,
  Visibility,
  WorkMode,
} from "./types";

/**
 * Status metadata: Spanish labels, semantic colours (Tailwind class fragments
 * that read on the Liquid Glass surfaces) and the allowed state transitions.
 * Separating internal status from public publication status is deliberate:
 * closing a publication never deletes or "closes" the process itself.
 */

export interface StatusMeta {
  label: string;
  /** Dot / chip colour tokens. */
  dot: string;
  chip: string;
  /** Kanban grouping order. */
  order: number;
}

export const PROCESS_STATUS_META: Record<ProcessStatus, StatusMeta> = {
  borrador: { label: locale.status.draft, dot: "bg-slate-400", chip: "bg-slate-500/15 text-slate-300 ring-slate-400/30", order: 0 },
  en_configuracion: { label: locale.status.configuring, dot: "bg-sky-400", chip: "bg-sky-500/15 text-sky-300 ring-sky-400/30", order: 1 },
  pendiente_aprobacion: { label: locale.status.pendingApproval, dot: "bg-amber-400", chip: "bg-amber-500/15 text-amber-300 ring-amber-400/30", order: 2 },
  aprobado: { label: locale.status.approved, dot: "bg-teal-400", chip: "bg-teal-500/15 text-teal-300 ring-teal-400/30", order: 3 },
  programado: { label: locale.status.scheduled, dot: "bg-indigo-400", chip: "bg-indigo-500/15 text-indigo-300 ring-indigo-400/30", order: 4 },
  publicado: { label: locale.status.published, dot: "bg-emerald-400", chip: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30", order: 5 },
  recepcion_activa: { label: locale.status.receiving, dot: "bg-green-400", chip: "bg-green-500/15 text-green-300 ring-green-400/30", order: 6 },
  pausado: { label: locale.status.paused, dot: "bg-orange-400", chip: "bg-orange-500/15 text-orange-300 ring-orange-400/30", order: 7 },
  cerrado: { label: locale.status.closed, dot: "bg-rose-400", chip: "bg-rose-500/15 text-rose-300 ring-rose-400/30", order: 8 },
  finalizado: { label: locale.status.finished, dot: "bg-violet-400", chip: "bg-violet-500/15 text-violet-300 ring-violet-400/30", order: 9 },
  archivado: { label: locale.status.archived, dot: "bg-zinc-400", chip: "bg-zinc-500/15 text-zinc-300 ring-zinc-400/30", order: 10 },
  cancelado: { label: locale.status.cancelled, dot: "bg-red-500", chip: "bg-red-500/15 text-red-300 ring-red-400/30", order: 11 },
};

export const PUBLICATION_STATUS_META: Record<PublicationStatus, StatusMeta> = {
  no_publicado: { label: locale.publication.unpublished, dot: "bg-slate-400", chip: "bg-slate-500/15 text-slate-300 ring-slate-400/30", order: 0 },
  programado: { label: locale.publication.scheduled, dot: "bg-indigo-400", chip: "bg-indigo-500/15 text-indigo-300 ring-indigo-400/30", order: 1 },
  publicado: { label: locale.publication.published, dot: "bg-emerald-400", chip: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30", order: 2 },
  pausado: { label: locale.publication.paused, dot: "bg-orange-400", chip: "bg-orange-500/15 text-orange-300 ring-orange-400/30", order: 3 },
  cerrado: { label: locale.publication.closed, dot: "bg-rose-400", chip: "bg-rose-500/15 text-rose-300 ring-rose-400/30", order: 4 },
  archivado: { label: locale.publication.archived, dot: "bg-zinc-400", chip: "bg-zinc-500/15 text-zinc-300 ring-zinc-400/30", order: 5 },
};

/** The default Kanban columns, in order. */
export const KANBAN_STATUSES: ProcessStatus[] = [
  "borrador",
  "en_configuracion",
  "aprobado",
  "publicado",
  "recepcion_activa",
  "pausado",
  "cerrado",
  "archivado",
];

/**
 * Allowed status transitions. Empty array = terminal-ish (still archivable).
 * The Kanban and editor consult this to prevent invalid moves.
 */
const TRANSITIONS: Record<ProcessStatus, ProcessStatus[]> = {
  borrador: ["en_configuracion", "cancelado", "archivado"],
  en_configuracion: ["pendiente_aprobacion", "aprobado", "borrador", "cancelado", "archivado"],
  pendiente_aprobacion: ["aprobado", "en_configuracion", "cancelado"],
  aprobado: ["programado", "publicado", "en_configuracion", "cancelado", "archivado"],
  programado: ["publicado", "aprobado", "cancelado"],
  publicado: ["recepcion_activa", "pausado", "cerrado"],
  recepcion_activa: ["pausado", "cerrado"],
  pausado: ["publicado", "recepcion_activa", "cerrado"],
  cerrado: ["finalizado", "publicado", "archivado"],
  finalizado: ["archivado"],
  archivado: ["borrador"],
  cancelado: ["archivado", "borrador"],
};

export function canTransition(from: ProcessStatus, to: ProcessStatus): boolean {
  if (from === to) return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedTransitions(from: ProcessStatus): ProcessStatus[] {
  return TRANSITIONS[from] ?? [];
}

/** Derive the publication status implied by a status change (best-effort). */
export function publicationForStatus(status: ProcessStatus): PublicationStatus | null {
  switch (status) {
    case "programado":
      return "programado";
    case "publicado":
    case "recepcion_activa":
      return "publicado";
    case "pausado":
      return "pausado";
    case "cerrado":
    case "finalizado":
      return "cerrado";
    case "archivado":
      return "archivado";
    default:
      return null;
  }
}

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  interno: locale.visibility.internal,
  externo: locale.visibility.external,
  ambos: locale.visibility.both,
};

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  presencial: "Presencial",
  hibrido: "Híbrido",
  remoto: "Remoto",
};

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  tiempo_completo: "Tiempo completo",
  medio_tiempo: "Medio tiempo",
  temporal: "Temporal",
  pasantia: "Pasantía",
  consultoria: "Consultoría",
};

export const EXPERIENCE_LEVEL_LABELS: Record<ExperienceLevel, string> = {
  sin_experiencia: "Sin experiencia",
  junior: "Junior",
  semi_senior: "Semi-senior",
  senior: "Senior",
  jefatura: "Jefatura",
  gerencia: "Gerencia",
};
