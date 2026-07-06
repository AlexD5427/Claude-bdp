import type { Candidate, EspejoRow } from "../types";
import { extractProceso } from "./candidates";
import type { Slice } from "../components/charts";

/**
 * Linking layer for the "Espejo_Base" / "Espejo_Ultimo_Registro" sheets.
 *
 * Those sheets describe the recruitment *processes* (one row per process, with
 * its gerencia, agencia, modalidad de reclutamiento, estado and dates), while a
 * candidate only carries a "CI-Proceso-Año" identifier. This module bridges the
 * two: it indexes the mirror rows by process number so every candidate can be
 * classified by the process attributes, which is what the universal KPI filters
 * (Gerencia / Agencia / Modalidad / Estado / temporalidad) operate on.
 *
 * Sheet headers are messy (uppercase, slashes, accents), so lookups are done by
 * a normalised "contains" match and every getter is defensive.
 */

export interface ProcesoAttrs {
  proceso: string;
  gerencia: string;
  agencia: string;
  modalidad: string;
  estado: string;
  /** Epoch ms of the process's reference date, or null. */
  fecha: number | null;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Read a field from a row by trying several header aliases (contains match). */
function field(row: EspejoRow, aliases: string[]): string {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const a = norm(alias);
    const hit = keys.find((k) => norm(k) === a);
    if (hit && row[hit] != null && String(row[hit]).trim()) return String(row[hit]).trim();
  }
  // Fallback: partial contains.
  for (const alias of aliases) {
    const a = norm(alias);
    const hit = keys.find((k) => norm(k).includes(a));
    if (hit && row[hit] != null && String(row[hit]).trim()) return String(row[hit]).trim();
  }
  return "";
}

function parseDate(raw: string): number | null {
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Extract the normalised process attributes from a mirror row. */
export function procesoAttrs(row: EspejoRow): ProcesoAttrs {
  const procesoRaw =
    field(row, ["proceso", "Proceso N°", "Proceso N", "proceso_n"]) ||
    field(row, ["codigo", "COND LIST PROCESOS"]);
  // Keep only the numeric process token if it looks like "CI-105-2026".
  const proceso = /-/.test(procesoRaw) ? extractProceso(procesoRaw) : procesoRaw;
  return {
    proceso: String(proceso).trim(),
    gerencia: field(row, ["GERENCIA / JEFATURA / UNIDAD SOLICITANTE", "gerencia"]),
    agencia: field(row, ["AGENCIA", "REGIONAL/ OFICINA", "REGIONAL"]),
    modalidad: field(row, ["MODALIDAD DE RECLUTAMIENTO", "modalidad de reclutamiento"]),
    estado: field(row, ["ultimo estado", "ESTADOREDUCIDO", "ESTADO", "estado"]),
    fecha: parseDate(
      field(row, ["ultima fecha", "FECHA REQUERIMIENTO", "Marca temporal", "FECHA DE ACEFALIA"]),
    ),
  };
}

export interface EspejoIndex {
  /** process number → attributes (latest wins). */
  byProceso: Map<string, ProcesoAttrs>;
  /** All process rows as attributes (from the "latest" sheet when available). */
  rows: ProcesoAttrs[];
}

/** Build the process index, preferring the "último registro" mirror. */
export function indexEspejo(ultimo: EspejoRow[], base: EspejoRow[]): EspejoIndex {
  // Cache by array reference so the (potentially large) index is built once and
  // shared across every consumer (FilterBar, KpiBar, Dashboard) per data load.
  if (_cache && _cache.u === ultimo && _cache.b === base) return _cache.idx;

  const byProceso = new Map<string, ProcesoAttrs>();
  // Base first, then latest overrides.
  for (const r of base) {
    const a = procesoAttrs(r);
    if (a.proceso) byProceso.set(a.proceso, a);
  }
  const latest = ultimo.length ? ultimo : base;
  const rows: ProcesoAttrs[] = [];
  for (const r of latest) {
    const a = procesoAttrs(r);
    rows.push(a);
    if (a.proceso) byProceso.set(a.proceso, a);
  }
  const idx = { byProceso, rows };
  _cache = { u: ultimo, b: base, idx };
  return idx;
}

let _cache: { u: EspejoRow[]; b: EspejoRow[]; idx: EspejoIndex } | null = null;

/** Attributes for a candidate, resolved through its process number. */
export function candidateAttrs(
  c: Candidate,
  byProceso: Map<string, ProcesoAttrs>,
): ProcesoAttrs | null {
  const proc = extractProceso(c.identificador);
  if (proc === "Sin proceso") return byProceso.get(proc) ?? null;
  return byProceso.get(proc) ?? null;
}

/** A distribution (count per distinct value) for a bar chart. */
export function distributionBy(
  rows: ProcesoAttrs[],
  key: "estado" | "modalidad" | "gerencia" | "agencia",
  max = 8,
): Slice[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const v = (r[key] || "").trim() || "Sin dato";
    map.set(v, (map.get(v) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, max);
}
