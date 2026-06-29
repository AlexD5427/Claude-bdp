import type {
  Candidate,
  RawCandidate,
  TechnicalKnowledge,
} from "../types";
import { parseCompetencias, parseDecimal } from "./competency";

/**
 * Coerce any backend value into a trimmed string. The endpoint is loose:
 * fields the UI treats as text can arrive as numbers (or be missing), so we
 * normalise defensively to avoid runtime crashes like `x.trim is not a function`.
 */
export function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/**
 * Build a candidate's display name with a graceful fallback, exactly as the
 * brief requires:
 *   `${nombres} ${apellido_paterno} ${apellido_materno}`.trim()
 *   || "Postulante Sin Nombre"
 */
export function buildFullName(c: RawCandidate): string {
  const full = `${asText(c.nombres)} ${asText(c.apellido_paterno)} ${asText(
    c.apellido_materno,
  )}`
    .replace(/\s+/g, " ")
    .trim();
  return full || "Postulante Sin Nombre";
}

/** Safely parse the JSON-encoded `conocimientos_tecnicos` column. */
function parseConocimientos(raw: unknown): TechnicalKnowledge[] {
  if (Array.isArray(raw)) return raw as TechnicalKnowledge[];
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e === "object")
      .map((e) => ({
        nombre: String((e as Record<string, unknown>).nombre ?? ""),
        nivel: (e as Record<string, unknown>).nivel
          ? String((e as Record<string, unknown>).nivel)
          : undefined,
        detalle: (e as Record<string, unknown>).detalle
          ? String((e as Record<string, unknown>).detalle)
          : undefined,
      }))
      .filter((e) => e.nombre);
  } catch {
    return [];
  }
}

/** Text fields the UI reads with string methods — coerced during normalisation. */
const TEXT_FIELDS = [
  "identificador",
  "nombres",
  "apellido_paterno",
  "apellido_materno",
  "departamento_residencia",
  "localidad_residencia",
  "estado_civil",
  "nivel_academico",
  "carrera",
  "trabaja_bdp",
  "cargo_bdp",
  "perfil_disc",
  "herramientas",
  "nivel_general_confiabilidad",
  "nivel_integridad",
  "riesgo_robo",
  "riesgo_mentira",
  "observaciones",
] as const;

/** Normalise a raw candidate into the UI-friendly `Candidate` shape. */
export function normaliseCandidate(c: RawCandidate, index: number): Candidate {
  const text: Record<string, string> = {};
  for (const field of TEXT_FIELDS) text[field] = asText(c[field]);

  const ident = text.identificador;
  return {
    ...c,
    ...text,
    id: ident || `cand-${index}`,
    fullName: buildFullName(c),
    competenciasList: parseCompetencias(c.competencias),
    conocimientosList: parseConocimientos(c.conocimientos_tecnicos),
  };
}

/**
 * Derive the "Nro Proceso" from an identificador shaped like
 * "CI - Nro Proceso - Año" (e.g. "8456872-105-2026" → "105"). Identificadores
 * that don't follow the convention are bucketed under "Sin proceso".
 */
export function extractProceso(identificador?: string | number): string {
  const id = asText(identificador);
  if (!id) return "Sin proceso";
  const parts = id.split("-").map((p) => p.trim());
  if (parts.length >= 2 && parts[1]) return parts[1];
  return "Sin proceso";
}

export interface ProcesoSummary {
  proceso: string;
  candidatos: Candidate[];
  avgCompetencias: number | null;
}

/** Group candidates by their process for the "Procesos" module. */
export function groupByProceso(candidates: Candidate[]): ProcesoSummary[] {
  const map = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const key = extractProceso(c.identificador);
    const bucket = map.get(key);
    if (bucket) bucket.push(c);
    else map.set(key, [c]);
  }
  const summaries: ProcesoSummary[] = [];
  for (const [proceso, list] of map) {
    const notas = list
      .map((c) => parseDecimal(c.nota_competencias))
      .filter((n): n is number => n !== null);
    const avg =
      notas.length > 0
        ? Math.round(notas.reduce((a, b) => a + b, 0) / notas.length)
        : null;
    summaries.push({ proceso, candidatos: list, avgCompetencias: avg });
  }
  // Stable, human-friendly ordering: most populated processes first.
  return summaries.sort((a, b) => b.candidatos.length - a.candidatos.length);
}

/** Count distinct, real processes (excludes the "Sin proceso" bucket). */
export function countActiveProcesos(candidates: Candidate[]): number {
  const set = new Set<string>();
  for (const c of candidates) {
    const p = extractProceso(c.identificador);
    if (p !== "Sin proceso") set.add(p);
  }
  return set.size;
}

/** A deterministic corporate gradient per candidate, for avatar backplates. */
export function avatarGradient(seed: string): string {
  const gradients = [
    "from-[#004a8f] via-[#005baa] to-[#00b0d8]",
    "from-[#00b0d8] via-[#005baa] to-[#004a8f]",
    "from-[#005baa] via-[#0077c2] to-[#00b0d8]",
    "from-[#013a70] via-[#004a8f] to-[#0090c5]",
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return gradients[hash % gradients.length];
}

/** Initials from a full name, for avatar fallbacks. */
export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
