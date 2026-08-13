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

/**
 * Safely parse a JSON-encoded list column (`conocimientos_tecnicos`,
 * `herramientas`). Accepts a JSON array of objects, a JSON array of strings,
 * or a plain comma-separated string. Never throws — malformed data yields [].
 */
function parseItemList(raw: unknown): TechnicalKnowledge[] {
  const fromObject = (e: Record<string, unknown>): TechnicalKnowledge => ({
    nombre: String(e.nombre ?? e.name ?? ""),
    nivel: e.nivel ? String(e.nivel) : undefined,
    detalle: e.detalle ? String(e.detalle) : undefined,
  });

  if (Array.isArray(raw)) {
    return raw
      .map((e) =>
        typeof e === "string"
          ? { nombre: e.trim() }
          : e && typeof e === "object"
            ? fromObject(e as Record<string, unknown>)
            : { nombre: "" },
      )
      .filter((e) => e.nombre);
  }
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((e) =>
          typeof e === "string"
            ? { nombre: e.trim() }
            : e && typeof e === "object"
              ? fromObject(e as Record<string, unknown>)
              : { nombre: "" },
        )
        .filter((e) => e.nombre);
    }
    return [];
  } catch {
    // Not JSON — treat as a comma-separated list of plain names.
    return raw
      .split(",")
      .map((s) => ({ nombre: s.trim() }))
      .filter((e) => e.nombre);
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
    conocimientosList: parseItemList(c.conocimientos_tecnicos),
    herramientasList: parseItemList(c.herramientas),
  };
}

/**
 * Normalise the whole sheet, guaranteeing **unique `id`s**.
 *
 * ## Por qué hace falta más que un `map`
 *
 * El `id` de un postulante es su identificador («CI - Nro Proceso - Año»), que
 * es la clave de negocio con la que la hoja se escribe y con la que el resto de
 * la aplicación pide un expediente. Pero la hoja **no impide repetirlo**: basta
 * que alguien registre dos veces a la misma persona para que haya dos filas con
 * el mismo identificador. Cuando eso pasaba, todo lo que indexa por `id` se
 * rompía en silencio:
 *
 *   · React recibía dos hijos con la misma `key` y avisaba por consola de que
 *     puede **omitir o duplicar** elementos: tarjetas que no aparecen en el
 *     listado o que aparecen dos veces.
 *   · El Comparador resolvía las dos columnas al **mismo** expediente
 *     (`candidatos.find`), así que agregar al segundo no hacía nada visible.
 *   · Abrir el perfil de cualquiera de los dos mostraba siempre el primero.
 *
 * Aquí las repeticiones reciben un sufijo (`8456872-105-2026#2`) para que cada
 * fila sea direccionable, y **todas** las filas implicadas quedan marcadas con
 * `identificadorDuplicado` para que la interfaz pueda avisarlo: el dato sigue
 * estando mal en la hoja y eso lo tiene que corregir una persona.
 */
export function normaliseCandidates(rows: RawCandidate[]): Candidate[] {
  const list = rows.map((row, i) => normaliseCandidate(row, i));
  const seen = new Map<string, number>();
  const repeated = new Set<string>();

  for (const candidate of list) {
    const key = candidate.id;
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count > 1) {
      repeated.add(key);
      candidate.id = `${key}#${count}`;
    }
  }
  if (repeated.size === 0) return list;

  for (const candidate of list) {
    // El sufijo se compara contra la clave original: así se marca tanto la fila
    // que se quedó con el identificador limpio como todas sus repeticiones.
    const base = candidate.id.split("#")[0];
    if (repeated.has(base)) candidate.identificadorDuplicado = true;
  }
  return list;
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
