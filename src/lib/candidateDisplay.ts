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

  const connector = academicConnector(nivel);
  return `${nivel} ${connector} ${carrera}`;
}

/** The Spanish connector ("en" / "de") that best joins a level to a career. */
function academicConnector(nivel: string): string {
  const n = nivel.toLowerCase();
  const usesDe =
    n.includes("egresad") ||
    n.includes("carrera") ||
    n.includes("diplomad") ||
    n.includes("doctor");
  return usesDe ? "de" : "en";
}

/**
 * Two-line academic profile for the redesigned comparator chip: the level with
 * its grammatical connector on the first line ("Licenciatura en") and the
 * career on its own line below ("Administración de Empresas"). Splitting them
 * keeps long combinations from running off in a single cramped line.
 *
 * Returns `null` when neither part is present; when only one part exists it is
 * shown alone on the top line with no connector.
 */
export function academicParts(
  nivelRaw: unknown,
  carreraRaw: unknown,
): { top: string; bottom?: string } | null {
  const nivel = asText(nivelRaw);
  const carrera = asText(carreraRaw);
  const hasNivel = !isEmptyish(nivel);
  const hasCarrera = !isEmptyish(carrera);

  if (!hasNivel && !hasCarrera) return null;
  if (hasNivel && !hasCarrera) return { top: nivel };
  if (!hasNivel && hasCarrera) return { top: carrera };

  return { top: `${nivel} ${academicConnector(nivel)}`, bottom: carrera };
}

/**
 * Standardised, UPPERCASE rendering of a person's name. The comparator's
 * personal-data chip always shows names in caps so every column reads uniformly,
 * regardless of how the operator typed them into the intake form.
 */
export function upperName(name: string): string {
  return name.toLocaleUpperCase("es-BO");
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
 * Ordinal Spanish rank label: 1 → "1er lugar", 2 → "2do lugar", …
 *
 * El orden y el puesto de los postulantes viven en
 * {@link ./comparatorRanking}, que además resuelve los empates de Nota CAP.
 */
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
