import { asText } from "./candidates";
import { parseDecimal } from "./competency";
import type { Candidate } from "../types";

/**
 * Presentation helpers for the candidate profile chips in the Comparador.
 *
 * These turn raw sheet columns (`nivel_academico`, `carrera`, `trabaja_bdp`,
 * `estado_civil`) into the human-friendly strings the redesigned cards show.
 */

/** Values that mean "empty" in the sheet even though they aren't blank. */
function isEmptyish(v: string): boolean {
  const s = v.trim().toLowerCase();
  return s === "" || s === "n/a" || s === "n/d" || s === "-" || s === "ninguno";
}

/**
 * Build the academic line "{nivel_academico} {conector} {carrera}" applying
 * Spanish connector rules:
 *   · "Licenciatura en Administración"
 *   · "Técnico Superior en Enfermería"
 *   · "Carrera de Derecho"  ("de" reads better than "en" here)
 *   · "Egresado de Psicología"
 *
 * Falls back gracefully when only one part (or neither) is present.
 */
export function academicLine(
  nivelRaw: unknown,
  carreraRaw: unknown,
): string | null {
  const nivel = asText(nivelRaw);
  const carrera = asText(carreraRaw);
  const hasNivel = !isEmptyish(nivel);
  const hasCarrera = !isEmptyish(carrera);

  if (!hasNivel && !hasCarrera) return null;
  if (hasNivel && !hasCarrera) return nivel;
  if (!hasNivel && hasCarrera) return carrera;

  const n = nivel.toLowerCase();
  // Levels that pair with "de" instead of "en".
  const usesDe =
    n.includes("egresad") ||
    n.includes("carrera") ||
    n.includes("diplomad") ||
    n.includes("doctor");
  const connector = usesDe ? "de" : "en";
  return `${nivel} ${connector} ${carrera}`;
}

/** Human civil-status label, or null when unknown. */
export function civilStatus(raw: unknown): string | null {
  const v = asText(raw);
  return isEmptyish(v) ? null : v;
}

/** Whether the candidate is currently a BDP employee (`trabaja_bdp` == "Sí"). */
export function worksAtBdp(raw: unknown): boolean {
  const v = asText(raw).toLowerCase();
  return v === "si" || v === "sí" || v === "true" || v === "1";
}

/** The BDP position (`cargo_bdp`), or null when unknown. */
export function bdpRole(raw: unknown): string | null {
  const v = asText(raw);
  return isEmptyish(v) ? null : v;
}

/** The candidate's Nota CAP as a number (null when missing). */
export function capScore(c: Candidate): number | null {
  return parseDecimal(c.nota_cap as never);
}

/**
 * Sort candidates by Nota CAP descending (highest first), keeping the ones
 * without a CAP score at the end in their original order. Returns a new array.
 */
export function sortByCapDesc(list: Candidate[]): Candidate[] {
  return [...list].sort((a, b) => {
    const ca = capScore(a);
    const cb = capScore(b);
    if (ca === null && cb === null) return 0;
    if (ca === null) return 1;
    if (cb === null) return -1;
    return cb - ca;
  });
}

/**
 * Assign a tie group id to each candidate whose Nota CAP is within `threshold`
 * of an adjacent (already CAP-sorted) candidate. Candidates sharing a group id
 * are considered "tied" and get the contrasting outline. Returns a map keyed by
 * candidate id → group id (only for candidates that are actually in a tie).
 */
export function tieGroups(
  sorted: Candidate[],
  threshold: number,
): Record<string, number> {
  const groups: Record<string, number> = {};
  let group = 0;
  let i = 0;
  while (i < sorted.length) {
    const base = capScore(sorted[i]);
    if (base === null) {
      i++;
      continue;
    }
    // Extend the run while consecutive CAP scores stay within the threshold.
    let j = i + 1;
    const members = [sorted[i]];
    while (j < sorted.length) {
      const next = capScore(sorted[j]);
      const prev = capScore(sorted[j - 1]);
      if (next === null || prev === null || Math.abs(prev - next) > threshold) break;
      members.push(sorted[j]);
      j++;
    }
    if (members.length > 1) {
      group += 1;
      for (const m of members) groups[m.id] = group;
    }
    i = j;
  }
  return groups;
}

/** Ordinal Spanish rank label: 1 → "1er lugar", 2 → "2do lugar", … */
export function rankLabel(rank: number): string {
  switch (rank) {
    case 1:
      return "1er lugar";
    case 2:
      return "2do lugar";
    case 3:
      return "3er lugar";
    default:
      return `${rank}.º lugar`;
  }
}
