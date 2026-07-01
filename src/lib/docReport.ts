import type { DocItem, Dossier } from "./docStore";

/**
 * Analytics for the Documentación module: per-dossier completion, the reminder
 * cadence and a small "intelligent analysis" that turns raw numbers into plain
 * guidance for the auxiliar.
 */

const DAY = 1000 * 60 * 60 * 24;

export type DocHealth = "completo" | "al_dia" | "en_proceso" | "atrasado";

export interface DossierReport {
  total: number;
  /** Documents that count toward completion (everything except "no aplica"). */
  applicable: number;
  presentados: number;
  pendientes: number;
  observados: number;
  noAplica: number;
  /** Documents still owed (pendiente or observado). */
  faltantes: DocItem[];
  completionPct: number;
  totalPages: number;
  daysSince: number | null;
  nextReminder: Date | null;
  overdueProrrogas: DocItem[];
  health: DocHealth;
  healthLabel: string;
  /** Tailwind tone classes for chips. */
  healthTone: string;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Days between the join date and today (null when no valid join date). */
export function daysSinceIngreso(fechaIngreso: string): number | null {
  if (!fechaIngreso) return null;
  const start = new Date(fechaIngreso);
  if (Number.isNaN(start.getTime())) return null;
  const diff = (startOfDay(new Date()).getTime() - startOfDay(start).getTime()) / DAY;
  return Math.max(0, Math.round(diff));
}

/**
 * The next reminder date: the first `fechaIngreso + k·interval` that is today or
 * in the future. Returns null when there's nothing left to remind about.
 */
export function nextReminderDate(
  fechaIngreso: string,
  intervalDays: number,
  hasFaltantes: boolean,
): Date | null {
  if (!hasFaltantes || !fechaIngreso || intervalDays <= 0) return null;
  const start = new Date(fechaIngreso);
  if (Number.isNaN(start.getTime())) return null;
  const today = startOfDay(new Date()).getTime();
  const base = startOfDay(start).getTime();
  const elapsed = Math.max(0, (today - base) / DAY);
  const k = Math.max(1, Math.ceil((elapsed + 0.0001) / intervalDays));
  return new Date(base + k * intervalDays * DAY);
}

const HEALTH_TONE: Record<DocHealth, string> = {
  completo: "bg-emerald-500/15 text-emerald-500 ring-emerald-400/40",
  al_dia: "bg-cyan-500/15 text-cyan-500 ring-cyan-400/40",
  en_proceso: "bg-amber-500/15 text-amber-500 ring-amber-400/40",
  atrasado: "bg-rose-500/15 text-rose-500 ring-rose-400/40",
};
const HEALTH_LABEL: Record<DocHealth, string> = {
  completo: "Completo",
  al_dia: "Al día",
  en_proceso: "En proceso",
  atrasado: "Atrasado",
};

export function dossierReport(d: Dossier, intervalDays: number): DossierReport {
  const total = d.items.length;
  const noAplica = d.items.filter((i) => i.status === "no_aplica").length;
  const applicable = total - noAplica;
  const presentados = d.items.filter((i) => i.status === "presentado").length;
  const observados = d.items.filter((i) => i.status === "observado").length;
  const pendientes = d.items.filter((i) => i.status === "pendiente").length;
  const faltantes = d.items.filter(
    (i) => i.status === "pendiente" || i.status === "observado",
  );
  const completionPct = applicable === 0 ? 100 : Math.round((presentados / applicable) * 100);
  const totalPages = d.items.reduce((a, i) => a + (Number(i.pages) || 0), 0);
  const daysSince = daysSinceIngreso(d.fechaIngreso);
  const today = startOfDay(new Date());
  const overdueProrrogas = d.items.filter(
    (i) =>
      i.status !== "presentado" &&
      i.status !== "no_aplica" &&
      i.prorroga &&
      !Number.isNaN(new Date(i.prorroga).getTime()) &&
      startOfDay(new Date(i.prorroga)).getTime() < today.getTime(),
  );

  let health: DocHealth;
  if (completionPct >= 100) health = "completo";
  else if (daysSince !== null && daysSince > intervalDays * 3) health = "atrasado";
  else if (daysSince !== null && daysSince <= intervalDays) health = "al_dia";
  else health = "en_proceso";
  if (overdueProrrogas.length > 0 && health !== "completo") health = "atrasado";

  return {
    total,
    applicable,
    presentados,
    pendientes,
    observados,
    noAplica,
    faltantes,
    completionPct,
    totalPages,
    daysSince,
    nextReminder: nextReminderDate(d.fechaIngreso, intervalDays, faltantes.length > 0),
    overdueProrrogas,
    health,
    healthLabel: HEALTH_LABEL[health],
    healthTone: HEALTH_TONE[health],
  };
}

export interface Insight {
  tone: "ok" | "info" | "warn" | "danger";
  text: string;
}

/** A short, human-readable analysis of the dossier's state. */
export function dossierInsights(r: DossierReport): Insight[] {
  const out: Insight[] = [];
  if (r.completionPct >= 100) {
    out.push({ tone: "ok", text: "Documentación completa. La persona está en regla para su incorporación." });
  } else {
    out.push({
      tone: r.health === "atrasado" ? "danger" : "info",
      text: `Avance del ${r.completionPct}% · ${r.presentados}/${r.applicable} documentos presentados. Faltan ${r.faltantes.length}.`,
    });
  }
  if (r.daysSince !== null) {
    out.push({
      tone: r.daysSince > 15 && r.completionPct < 100 ? "warn" : "info",
      text: `Han transcurrido ${r.daysSince} día(s) desde el ingreso${r.nextReminder ? ` · próxima alerta: ${r.nextReminder.toLocaleDateString("es-BO", { day: "2-digit", month: "long" })}` : ""}.`,
    });
  }
  if (r.observados > 0) {
    out.push({ tone: "warn", text: `${r.observados} documento(s) con observación que requieren corrección.` });
  }
  if (r.overdueProrrogas.length > 0) {
    out.push({
      tone: "danger",
      text: `${r.overdueProrrogas.length} prórroga(s) vencida(s): ${r.overdueProrrogas.map((i) => i.label).join(", ")}.`,
    });
  }
  if (r.faltantes.length > 0) {
    const nombres = r.faltantes.slice(0, 3).map((i) => i.label).join(", ");
    out.push({
      tone: "info",
      text: `Prioridad de gestión: ${nombres}${r.faltantes.length > 3 ? ` y ${r.faltantes.length - 3} más` : ""}.`,
    });
  }
  return out;
}

/* --------------------------------------------------------------- */
/* Module-level KPIs                                               */
/* --------------------------------------------------------------- */

export interface DocKpis {
  personas: number;
  completos: number;
  docs_pendientes: number;
  avance_promedio: number | null;
  alertas: number;
}

export function computeDocKpis(dossiers: Dossier[], intervalDays: number): DocKpis {
  if (dossiers.length === 0) {
    return { personas: 0, completos: 0, docs_pendientes: 0, avance_promedio: null, alertas: 0 };
  }
  let completos = 0;
  let pendientes = 0;
  let alertas = 0;
  let pctSum = 0;
  for (const d of dossiers) {
    const r = dossierReport(d, intervalDays);
    pctSum += r.completionPct;
    if (r.completionPct >= 100) completos++;
    pendientes += r.faltantes.length;
    if (r.health === "atrasado" || r.overdueProrrogas.length > 0) alertas++;
  }
  return {
    personas: dossiers.length,
    completos,
    docs_pendientes: pendientes,
    avance_promedio: Math.round(pctSum / dossiers.length),
    alertas,
  };
}
