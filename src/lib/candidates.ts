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

/**
 * Normalise a raw candidate into the UI-friendly `Candidate` shape.
 *
 * Preferir {@link normaliseCandidates} para listas completas: sólo ahí se puede
 * garantizar que los identificadores repetidos no colisionen.
 */
export function normaliseCandidate(c: RawCandidate, index: number): Candidate {
  const text: Record<string, string> = {};
  for (const field of TEXT_FIELDS) text[field] = asText(c[field]);

  const ident = text.identificador;
  return {
    ...c,
    ...text,
    id: ident || fallbackId(c, index),
    fullName: buildFullName(c),
    competenciasList: parseCompetencias(c.competencias),
    conocimientosList: parseItemList(c.conocimientos_tecnicos),
    herramientasList: parseItemList(c.herramientas),
  };
}

/**
 * Identificador de emergencia para las filas de la hoja que llegan sin
 * `identificador`.
 *
 * Antes era `cand-<índice>`, y el índice es la posición en el arreglo. Eso lo
 * hacía **inestable**: al registrar a alguien nuevo la fila se inserta al
 * principio, todos los índices se corren uno y cada `cand-N` empieza a apuntar a
 * otra persona — con lo que una comparación guardada en la sesión pasaba a
 * mostrar expedientes ajenos sin avisar. Un resumen del contenido de la fila es
 * estable frente a reordenamientos, que es lo que necesita cualquier cosa que
 * guarde una referencia.
 */
function fallbackId(c: RawCandidate, index: number): string {
  const seed = [
    asText(c.nombres),
    asText(c.apellido_paterno),
    asText(c.apellido_materno),
    asText(c.edad),
    asText(c.cargo_bdp),
  ].join("|");
  if (seed.replace(/\|/g, "") === "") return `cand-${index}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return `sin-id-${hash.toString(36)}`;
}

/**
 * Normalise the whole sheet in one pass, guaranteeing **unique** `id`s.
 *
 * ## Por qué hace falta mirar la lista completa
 *
 * El `id` de un postulante es su identificador («CI - Nro Proceso - Año»), y la
 * hoja no impone que sea único: basta con que dos analistas registren a la misma
 * persona en el mismo proceso, o que alguien duplique una fila al copiarla. Con
 * el `id` repetido pasaban tres cosas, todas silenciosas:
 *
 *   1. React recibía dos hijos con la misma `key` y advertía por consola que
 *      «puede duplicar u omitir componentes»; en la lista de Postulantes las
 *      tarjetas se dibujaban mal.
 *   2. El buscador del Comparador excluye a los ya elegidos comparando el `id`,
 *      así que al agregar al primero **el segundo desaparecía de las
 *      sugerencias**: era imposible compararlo, y desde la silla del analista
 *      eso es «el comparador no me deja agregarlo».
 *   3. Cualquier `find(c => c.id === id)` devolvía siempre la primera fila, de
 *      modo que editar al duplicado editaba al original.
 *
 * La solución no es esconder las filas repetidas —son datos reales que alguien
 * debe corregir en la hoja— sino darles una identidad propia y **marcarlas**:
 * `duplicadoDe` lleva el identificador compartido y la interfaz lo advierte.
 */
export function normaliseCandidates(rows: RawCandidate[]): Candidate[] {
  const seen = new Map<string, number>();
  return rows.map((row, index) => {
    const candidate = normaliseCandidate(row, index);
    const previous = seen.get(candidate.id) ?? 0;
    seen.set(candidate.id, previous + 1);
    if (previous === 0) return candidate;
    return {
      ...candidate,
      id: `${candidate.id}#${previous + 1}`,
      duplicadoDe: candidate.identificador || candidate.id,
    };
  });
}

/** Identificadores que aparecen más de una vez en la base. */
export function duplicatedIdentificadores(candidates: Candidate[]): string[] {
  const set = new Set<string>();
  for (const c of candidates) if (c.duplicadoDe) set.add(c.duplicadoDe);
  return [...set];
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
