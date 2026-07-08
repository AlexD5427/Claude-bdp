import type { Candidate } from "../types";
import { asText, extractProceso } from "./candidates";
import { parseDecimal } from "./competency";
import type { HiringRecord } from "./hiringStore";
import type { Dossier } from "./docStore";
import type { LaborReference } from "./referencesStore";
import type { ProcesoAttrs } from "./procesos";

/**
 * Presentation-layer aggregation for the full candidate profile.
 *
 * The profile panel pulls a person's data from many places — the main
 * "Registro_Postulantes" record, the process mirror sheets, the local hiring
 * lifecycle, their documentation dossier and their labor references. These
 * helpers turn all of that into UI-ready shapes (scores, integrity signals and
 * a unified timeline) so each tab stays declarative and the whole thing scales
 * as more data sources are wired in.
 */

export interface ProfileScore {
  key: string;
  label: string;
  hint: string;
  value: number | null;
}

/** The four headline evaluation scores, ready for gauges and radars. */
export function profileScores(c: Candidate): ProfileScore[] {
  return [
    { key: "cap", label: "Nota CAP", hint: "Adecuación al puesto", value: parseDecimal(c.nota_cap) },
    { key: "curriculum", label: "Currículum", hint: "Hoja de vida", value: parseDecimal(c.nota_curriculum) },
    { key: "conocimiento", label: "Conocimientos", hint: "Evaluación técnica", value: parseDecimal(c.nota_conocimiento) },
    { key: "competencias", label: "Competencias", hint: "Nivel general", value: parseDecimal(c.nota_competencias) },
  ];
}

/** Average of the non-null headline scores (an overall "score" for the hero). */
export function overallScore(c: Candidate): number | null {
  const vals = profileScores(c)
    .map((s) => s.value)
    .filter((v): v is number => v !== null);
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export type TimelineTone = "cyan" | "green" | "amber" | "rose" | "violet" | "slate";
export type TimelineKind =
  | "proceso"
  | "ingreso"
  | "evaluacion"
  | "contratado"
  | "baja"
  | "documentacion"
  | "referencia";

export interface TimelineEvent {
  id: string;
  /** Epoch ms, or null when the source carries no date. */
  date: number | null;
  dateLabel: string;
  title: string;
  detail?: string;
  kind: TimelineKind;
  tone: TimelineTone;
}

function fmtDate(ms: number | null): string {
  if (ms === null) return "Sin fecha";
  try {
    return new Date(ms).toLocaleDateString("es-BO", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return "Sin fecha";
  }
}

function toMs(iso?: string): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Assemble every dated milestone we know about a candidate into one timeline,
 * newest first. Undated events sink to the bottom.
 */
export function buildTimeline(
  c: Candidate,
  opts: {
    hiring?: HiringRecord;
    proceso?: ProcesoAttrs | null;
    dossier?: Dossier;
    references?: LaborReference[];
  },
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const proc = extractProceso(c.identificador);

  if (opts.proceso?.fecha || proc !== "Sin proceso") {
    events.push({
      id: "proceso",
      date: opts.proceso?.fecha ?? null,
      dateLabel: fmtDate(opts.proceso?.fecha ?? null),
      title: proc === "Sin proceso" ? "Postulación registrada" : `Proceso ${proc}`,
      detail: opts.proceso
        ? [opts.proceso.gerencia, opts.proceso.agencia, opts.proceso.modalidad]
            .filter(Boolean)
            .join(" · ") || undefined
        : undefined,
      kind: "proceso",
      tone: "violet",
    });
  }

  const seen = toMs(opts.hiring?.firstSeenAt);
  if (seen) {
    events.push({
      id: "ingreso",
      date: seen,
      dateLabel: fmtDate(seen),
      title: "Ingreso al proceso",
      detail: "Primer registro del postulante en el sistema.",
      kind: "ingreso",
      tone: "cyan",
    });
  }

  const overall = overallScore(c);
  if (overall !== null) {
    events.push({
      id: "evaluacion",
      date: seen,
      dateLabel: seen ? fmtDate(seen) : "Evaluación registrada",
      title: "Evaluación consolidada",
      detail: `Puntaje general ${overall}% · CAP ${asText(c.nota_cap) || "N/D"}`,
      kind: "evaluacion",
      tone: "cyan",
    });
  }

  const contratado = toMs(opts.hiring?.contratadoAt);
  if (contratado) {
    events.push({
      id: "contratado",
      date: contratado,
      dateLabel: fmtDate(contratado),
      title: "Contratación",
      detail: c.cargo_bdp ? `Cargo: ${c.cargo_bdp}` : undefined,
      kind: "contratado",
      tone: "green",
    });
  }

  const baja = toMs(opts.hiring?.bajaAt);
  if (baja) {
    events.push({
      id: "baja",
      date: baja,
      dateLabel: fmtDate(baja),
      title: "Baja",
      detail: "El postulante dejó el cargo.",
      kind: "baja",
      tone: "rose",
    });
  }

  if (opts.dossier) {
    const created = toMs(opts.dossier.createdAt);
    events.push({
      id: "doc",
      date: created,
      dateLabel: fmtDate(created),
      title: "Expediente de documentación",
      detail: `${opts.dossier.items.length} documento(s) en seguimiento`,
      kind: "documentacion",
      tone: "amber",
    });
  }

  for (const ref of opts.references ?? []) {
    const created = toMs(ref.createdAt);
    events.push({
      id: `ref-${ref.id}`,
      date: created,
      dateLabel: fmtDate(created),
      title: `Referencia laboral · ${ref.refereeName || "Sin nombre"}`,
      detail: [ref.company, ref.relationship].filter(Boolean).join(" · "),
      kind: "referencia",
      tone: "slate",
    });
  }

  return events.sort((a, b) => {
    if (a.date === null && b.date === null) return 0;
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return b.date - a.date;
  });
}
