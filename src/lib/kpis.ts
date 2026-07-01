import type { Candidate } from "../types";
import { parseDecimal } from "./competency";
import { countActiveProcesos, extractProceso, groupByProceso } from "./candidates";
import type { HiringMap } from "./hiringStore";
import type { ModuleId } from "../types";

/** Average of a numeric list, rounded; `null` when empty. */
function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

const DAY = 1000 * 60 * 60 * 24;

/* --------------------------------------------------------------- */
/* Hiring-derived metrics                                          */
/* --------------------------------------------------------------- */

export function timeToHireDays(hiring: HiringMap): number | null {
  const spans: number[] = [];
  for (const r of Object.values(hiring)) {
    if (r.status === "contratado" && r.contratadoAt && r.firstSeenAt) {
      const d = (new Date(r.contratadoAt).getTime() - new Date(r.firstSeenAt).getTime()) / DAY;
      if (Number.isFinite(d) && d >= 0) spans.push(d);
    }
  }
  return avg(spans);
}

export function turnoverRate(hiring: HiringMap): number | null {
  const contratados = Object.values(hiring).filter(
    (r) => r.status === "contratado" || r.status === "baja",
  );
  if (!contratados.length) return null;
  // Bajas that occurred within ~90 days of being hired.
  const early = contratados.filter(
    (r) =>
      r.status === "baja" &&
      r.bajaAt &&
      r.contratadoAt &&
      (new Date(r.bajaAt).getTime() - new Date(r.contratadoAt).getTime()) / DAY <= 92,
  ).length;
  return Math.round((early / contratados.length) * 100);
}

export function hiringCounts(hiring: HiringMap) {
  let contratados = 0;
  let bajas = 0;
  let enProceso = 0;
  for (const r of Object.values(hiring)) {
    if (r.status === "contratado") contratados++;
    else if (r.status === "baja") bajas++;
    else enProceso++;
  }
  return { contratados, bajas, enProceso };
}

/* --------------------------------------------------------------- */
/* Demographics & recency                                          */
/* --------------------------------------------------------------- */

export interface Slice {
  label: string;
  value: number;
}

/**
 * Demografía por Gerencia. The sheet has no `gerencia` column yet, so we read
 * an optional `gerencia` field and fall back to `cargo_bdp`. Documented as a
 * recommended new column.
 */
export function demographicsByGerencia(candidates: Candidate[]): Slice[] {
  const map = new Map<string, number>();
  for (const c of candidates) {
    const key =
      (typeof c.gerencia === "string" && c.gerencia.trim()) ||
      (c.cargo_bdp && c.cargo_bdp.trim()) ||
      "Sin asignar";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
}

/** Most-recently added candidates (newest first). */
export function recentAdditions(candidates: Candidate[], n = 5): Candidate[] {
  // Prefer a real timestamp column if the backend provides one.
  const withDate = candidates.filter((c) => dateOf(c) !== null);
  if (withDate.length) {
    return [...candidates]
      .sort((a, b) => (dateOf(b) ?? 0) - (dateOf(a) ?? 0))
      .slice(0, n);
  }
  // Otherwise rely on row order (new rows append at the end of the sheet).
  return candidates.slice(-n).reverse();
}

function dateOf(c: Candidate): number | null {
  const raw =
    (c as Record<string, unknown>).fecha_registro ??
    (c as Record<string, unknown>).created ??
    (c as Record<string, unknown>).timestamp;
  if (!raw) return null;
  const t = new Date(String(raw)).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Hires per calendar month (last `months`), from the hiring store. */
export function hiresOverTime(hiring: HiringMap, months: number): { label: string; value: number }[] {
  const now = new Date();
  const buckets: { key: string; label: string; value: number }[] = [];
  const fmt = new Intl.DateTimeFormat("es-BO", { month: "short" });
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: fmt.format(d), value: 0 });
  }
  const index = new Map(buckets.map((b, i) => [b.key, i]));
  for (const r of Object.values(hiring)) {
    if (r.status !== "contratado" && r.status !== "baja") continue;
    if (!r.contratadoAt) continue;
    const d = new Date(r.contratadoAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const i = index.get(key);
    if (i !== undefined) buckets[i].value++;
  }
  return buckets.map((b) => ({ label: b.label, value: b.value }));
}

/* --------------------------------------------------------------- */
/* The flat value map that gets snapshotted every month            */
/* --------------------------------------------------------------- */

export function computeAllKpiValues(
  candidates: Candidate[],
  competencias: string[],
  hiring: HiringMap,
): Record<string, number | null> {
  const notas = (key: keyof Candidate) =>
    candidates.map((c) => parseDecimal(c[key] as never)).filter((n): n is number => n !== null);

  const allAjustes: number[] = [];
  const allBrechas: number[] = [];
  const compNames = new Set<string>();
  let withComp = 0;
  for (const c of candidates) {
    if (c.competenciasList.length) withComp++;
    for (const s of c.competenciasList) {
      compNames.add(s.name.toLowerCase());
      if (s.ajuste !== null) allAjustes.push(s.ajuste);
      if (s.brecha !== null) allBrechas.push(s.brecha);
    }
  }

  const grupos = groupByProceso(candidates);
  const realProc = grupos.filter((g) => g.proceso !== "Sin proceso");
  const biggest = realProc.reduce((m, g) => Math.max(m, g.candidatos.length), 0);
  const sinProceso = candidates.filter((c) => extractProceso(c.identificador) === "Sin proceso").length;

  const conf = candidates.filter((c) => {
    const v = (c.nivel_general_confiabilidad ?? "").toLowerCase();
    return v.includes("confiable") && !v.includes("no confiable");
  }).length;
  const riesgoAlto = candidates.filter((c) => (c.riesgo_robo ?? "") === "Alto").length;
  const integridadAlta = candidates.filter((c) => (c.nivel_integridad ?? "") === "Alto").length;

  const { contratados, bajas, enProceso } = hiringCounts(hiring);
  const total = candidates.length || 1;

  return {
    num_candidatos: candidates.length,
    procesos_activos: countActiveProcesos(candidates),
    prom_competencias: avg(notas("nota_competencias")),
    competencias_catalogadas: competencias.length,

    calidad_contratacion: null, // sin conectar (evaluaciones de desempeño)
    tiempo_contratacion: timeToHireDays(hiring),
    costo_contratacion: null, // base externa
    tasa_rotacion: turnoverRate(hiring),
    contratados,
    en_proceso: enProceso,
    bajas,

    ajuste_promedio: avg(allAjustes),
    brecha_promedio: allBrechas.length ? Math.round((allBrechas.reduce((a, b) => a + b, 0) / allBrechas.length) * 10) / 10 : null,
    competencias_evaluadas: compNames.size,
    postulantes_con_comp: withComp,

    nota_cap_prom: avg(notas("nota_cap")),
    nota_curriculum_prom: avg(notas("nota_curriculum")),
    nota_conocimiento_prom: avg(notas("nota_conocimiento")),

    prom_postulantes_proceso: realProc.length ? Math.round(candidates.length / realProc.length) : null,
    proceso_mas_grande: biggest || null,
    sin_proceso: sinProceso,

    pct_confiables: Math.round((conf / total) * 100),
    pct_riesgo_robo_alto: Math.round((riesgoAlto / total) * 100),
    pct_integridad_alta: Math.round((integridadAlta / total) * 100),
  };
}

/* --------------------------------------------------------------- */
/* Per-module KPI display specs                                    */
/* --------------------------------------------------------------- */

export interface KpiSpec {
  key: string;
  label: string;
  value: string;
  unit?: string;
  accent: string;
  help: string;
  goodWhenUp: boolean;
}

const ACCENTS = [
  "from-[#00b0d8] to-[#005baa]",
  "from-[#005baa] to-[#004a8f]",
  "from-[#0090c5] to-[#00b0d8]",
  "from-[#004a8f] to-[#0077c2]",
];

function fmt(v: number | null, suffix = ""): string {
  return v === null ? "N/A" : `${v}${suffix}`;
}

/** The four KPI tiles shown for a given module (Dashboard has its own hero set). */
export function getModuleKpis(
  module: ModuleId,
  v: Record<string, number | null>,
): KpiSpec[] {
  const A = (i: number) => ACCENTS[i % ACCENTS.length];
  switch (module) {
    case "postulantes":
      return [
        { key: "num_candidatos", label: "Número de Candidatos", value: fmt(v.num_candidatos), accent: A(0), goodWhenUp: true, help: "Total de postulantes en la base de datos." },
        { key: "procesos_activos", label: "Procesos Activos", value: fmt(v.procesos_activos), accent: A(1), goodWhenUp: true, help: "Procesos distintos detectados en el identificador (CI-Proceso-Año)." },
        { key: "prom_competencias", label: "Promedio Competencias", value: fmt(v.prom_competencias), accent: A(2), goodWhenUp: true, help: "Media de la Nota Competencias de todos los postulantes." },
        { key: "competencias_catalogadas", label: "Competencias Catalogadas", value: fmt(v.competencias_catalogadas), accent: A(3), goodWhenUp: true, help: "Tamaño del catálogo de competencias del backend." },
      ];
    case "comparador":
      return [
        { key: "postulantes_con_comp", label: "Perfiles con Competencias", value: fmt(v.postulantes_con_comp), accent: A(0), goodWhenUp: true, help: "Postulantes que ya tienen competencias configuradas, comparables en la matriz." },
        { key: "ajuste_promedio", label: "Ajuste Promedio", value: fmt(v.ajuste_promedio, "%"), unit: "%", accent: A(1), goodWhenUp: true, help: "Media de Ajuste (obtenido/esperado) de todas las competencias evaluadas." },
        { key: "brecha_promedio", label: "Brecha Promedio", value: fmt(v.brecha_promedio), accent: A(2), goodWhenUp: true, help: "Media de la Brecha (obtenido − esperado); valores cercanos a 0 son mejores." },
        { key: "competencias_evaluadas", label: "Competencias Evaluadas", value: fmt(v.competencias_evaluadas), accent: A(3), goodWhenUp: true, help: "Cantidad de competencias distintas evaluadas en los perfiles." },
      ];
    case "cara-a-cara":
      return [
        { key: "nota_cap_prom", label: "Nota CAP Promedio", value: fmt(v.nota_cap_prom, "%"), unit: "%", accent: A(0), goodWhenUp: true, help: "Media del Coeficiente de Adecuación al Puesto." },
        { key: "nota_curriculum_prom", label: "Currículum Promedio", value: fmt(v.nota_curriculum_prom, "%"), unit: "%", accent: A(1), goodWhenUp: true, help: "Media de la calificación de hoja de vida." },
        { key: "nota_conocimiento_prom", label: "Conocimientos Promedio", value: fmt(v.nota_conocimiento_prom, "%"), unit: "%", accent: A(2), goodWhenUp: true, help: "Media de la evaluación de conocimientos técnicos." },
        { key: "prom_competencias", label: "Competencias Promedio", value: fmt(v.prom_competencias, "%"), unit: "%", accent: A(3), goodWhenUp: true, help: "Media de la Nota Competencias a nivel general." },
      ];
    case "procesos":
      return [
        { key: "procesos_activos", label: "Procesos Activos", value: fmt(v.procesos_activos), accent: A(0), goodWhenUp: true, help: "Procesos de reclutamiento distintos en curso." },
        { key: "prom_postulantes_proceso", label: "Postulantes / Proceso", value: fmt(v.prom_postulantes_proceso), accent: A(1), goodWhenUp: true, help: "Promedio de postulantes por proceso real (excluye 'Sin proceso')." },
        { key: "proceso_mas_grande", label: "Proceso Más Grande", value: fmt(v.proceso_mas_grande), accent: A(2), goodWhenUp: true, help: "Mayor cantidad de postulantes concentrada en un solo proceso." },
        { key: "sin_proceso", label: "Sin Proceso", value: fmt(v.sin_proceso), accent: A(3), goodWhenUp: false, help: "Postulantes cuyo identificador no sigue el formato CI-Proceso-Año." },
      ];
    case "tablero":
      return [
        { key: "pct_confiables", label: "% Confiables", value: fmt(v.pct_confiables, "%"), unit: "%", accent: A(0), goodWhenUp: true, help: "Porcentaje de postulantes con confiabilidad 'Confiable'." },
        { key: "pct_integridad_alta", label: "% Integridad Alta", value: fmt(v.pct_integridad_alta, "%"), unit: "%", accent: A(1), goodWhenUp: true, help: "Porcentaje con Nivel de Integridad 'Alto'." },
        { key: "pct_riesgo_robo_alto", label: "% Riesgo Robo Alto", value: fmt(v.pct_riesgo_robo_alto, "%"), unit: "%", accent: A(2), goodWhenUp: false, help: "Porcentaje con Riesgo de Robo 'Alto' (menos es mejor)." },
        { key: "prom_competencias", label: "Competencias Promedio", value: fmt(v.prom_competencias, "%"), unit: "%", accent: A(3), goodWhenUp: true, help: "Media de la Nota Competencias." },
      ];
    case "documentacion":
      return [
        { key: "doc_personas", label: "Personas en Trámite", value: fmt(v.doc_personas), accent: A(0), goodWhenUp: true, help: "Personas contratadas con un expediente de documentación abierto." },
        { key: "doc_avance", label: "Avance Promedio", value: fmt(v.doc_avance, "%"), unit: "%", accent: A(1), goodWhenUp: true, help: "Porcentaje promedio de documentación entregada entre todos los expedientes." },
        { key: "doc_pendientes", label: "Documentos Pendientes", value: fmt(v.doc_pendientes), accent: A(2), goodWhenUp: false, help: "Total de documentos aún no presentados en todos los expedientes (menos es mejor)." },
        { key: "doc_alertas", label: "Alertas Activas", value: fmt(v.doc_alertas), accent: A(3), goodWhenUp: false, help: "Expedientes atrasados o con prórrogas vencidas que requieren gestión (menos es mejor)." },
      ];
    default:
      return [];
  }
}
