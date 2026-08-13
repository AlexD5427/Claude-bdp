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

/**
 * Huella estable de una fila sin identificador.
 *
 * La clave de un postulante es su identificador; cuando la hoja lo trae vacío
 * hay que inventar una, y esa clave **no puede depender de la posición de la
 * fila**: la base se relee cada minuto y basta con que alguien inserte un
 * registro más arriba para que todas las posiciones se corran. Con una clave
 * posicional, la comparación en curso terminaba apuntando a otra persona.
 * El contenido de la fila sí es estable, así que se resume con un djb2 corto.
 */
function rowFingerprint(c: RawCandidate): string {
  const parts = Object.keys(c)
    .sort()
    .map((k) => `${k}=${String(c[k] ?? "")}`)
    .join("|");
  let hash = 5381;
  for (let i = 0; i < parts.length; i++) {
    hash = ((hash << 5) + hash + parts.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
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

/** Identidad calculada para una fila (ver {@link normaliseCandidates}). */
interface RowIdentity {
  /** Clave única dentro de la base, incluso si el identificador se repite. */
  id: string;
  /** True cuando otra fila comparte el mismo identificador. */
  identificadorDuplicado: boolean;
}

/**
 * Normalise a raw candidate into the UI-friendly `Candidate` shape.
 *
 * `identity` la calcula {@link normaliseCandidates}, que es quien ve la base
 * completa y por tanto lo único capaz de saber si una clave está repetida.
 * Cuando se omite (pruebas, usos sueltos) se deriva de la propia fila.
 */
export function normaliseCandidate(
  c: RawCandidate,
  identity?: RowIdentity,
): Candidate {
  const text: Record<string, string> = {};
  for (const field of TEXT_FIELDS) text[field] = asText(c[field]);

  const ident = text.identificador;
  return {
    ...c,
    ...text,
    id: identity?.id ?? (ident || `sin-id-${rowFingerprint(c)}`),
    identificadorDuplicado: identity?.identificadorDuplicado ?? false,
    fullName: buildFullName(c),
    competenciasList: parseCompetencias(c.competencias),
    conocimientosList: parseItemList(c.conocimientos_tecnicos),
    herramientasList: parseItemList(c.herramientas),
  };
}

/**
 * Normalise the whole database, guaranteeing a **unique and stable** `id`.
 *
 * ## Por qué esto importa tanto
 *
 * Todo el sistema direcciona a una persona por `Candidate.id`: el comparador
 * guarda esos ids en la sesión, «Ver perfil» y «Editar» buscan por id, y React
 * los usa como clave de lista. Antes el id era, sin más, el identificador de la
 * hoja, y la hoja es un documento que llenan personas: se repiten claves (la
 * misma cédula cargada dos veces en un proceso) y a veces la columna queda
 * vacía. Las consecuencias eran silenciosas y graves:
 *
 *   · **No se podía comparar a las dos personas** con la clave repetida: al
 *     agregar la primera, la segunda desaparecía del buscador porque el filtro
 *     de «ya seleccionados» la daba por elegida. El analista veía «Sin
 *     coincidencias» y concluía, con razón, que el comparador no funcionaba.
 *   · **«Editar» abría la ficha equivocada**: `find` devuelve la primera
 *     coincidencia, así que editar al segundo homónimo sobrescribía al primero.
 *   · React recibía dos hijos con la misma clave y omitía o duplicaba tarjetas.
 *
 * Ahora el identificador sigue siendo la clave de negocio (es lo que viaja al
 * backend), pero el id de la interfaz se desambigua con un sufijo `#2`, `#3`…
 * y las filas implicadas quedan marcadas con `identificadorDuplicado` para que
 * la interfaz pueda advertirlo en lugar de esconderlo.
 */
export function normaliseCandidates(rows: RawCandidate[]): Candidate[] {
  if (!Array.isArray(rows)) return [];
  // Primera pasada: cuántas filas comparten cada identificador.
  const count = new Map<string, number>();
  for (const row of rows) {
    const ident = asText(row.identificador);
    if (ident) count.set(ident, (count.get(ident) ?? 0) + 1);
  }
  // Segunda pasada: id único y estable por fila.
  const used = new Map<string, number>();
  return rows.map((row) => {
    const ident = asText(row.identificador);
    const base = ident || `sin-id-${rowFingerprint(row)}`;
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    return normaliseCandidate(row, {
      id: seen === 0 ? base : `${base}#${seen + 1}`,
      identificadorDuplicado: Boolean(ident) && (count.get(ident) ?? 0) > 1,
    });
  });
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
