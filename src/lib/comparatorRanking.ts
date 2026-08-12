import { parseDecimal } from "./competency";
import type { Candidate } from "../types";
import type { ComparatorOrder } from "./configStore";

/**
 * Ranking del Comparador — mérito y desempate.
 *
 * ## El problema
 *
 * La comparativa ordenaba las columnas con un `sort` por **Nota CAP** y
 * asignaba el puesto según la posición resultante. Cuando dos postulantes
 * empataban en el CAP, `Array.prototype.sort` conservaba el orden previo, que
 * en la práctica era *el orden en que el analista los fue agregando*. Es decir:
 * el puesto lo decidía el azar de la sesión y no el expediente. Con tres
 * personas al 88 % de CAP —un caso corriente en procesos masivos— el 2.º lugar
 * podía quedar para quien tenía 74 % en conocimientos por delante de quien
 * tenía 90 %.
 *
 * ## La solución
 *
 * El criterio principal no cambia: **más CAP, mejor puesto**. Sólo cuando hay
 * empate exacto de CAP entra en juego el **Índice de Desempate (IDD)**, una
 * media ponderada de las tres notas de respaldo que el módulo de Postulantes ya
 * captura, todas expresadas sobre 100 %:
 *
 * | Campo                | Peso | Por qué                                        |
 * | -------------------- | ---- | ---------------------------------------------- |
 * | Nota Conocimientos   | 40 % | Evidencia técnica medida con prueba            |
 * | Nota Competencias    | 35 % | Conducta observada frente al perfil del cargo  |
 * | Nota Currículum      | 25 % | Trayectoria declarada y verificable            |
 *
 * Los pesos se **renormalizan sobre los campos presentes**: si a alguien le
 * falta la nota de currículum, su IDD se calcula con los otros dos pesos
 * reescalados a 100 % en lugar de castigarlo con un cero implícito, que sería
 * una penalización inventada por el software y no por el proceso.
 *
 * Cuando el IDD también empata, la decisión sigue una cascada explícita y
 * *independiente del orden de inserción*: conocimientos → competencias →
 * currículum → cobertura del expediente (cuántas notas tiene) → nombre. El
 * último criterio no es una valoración: es el desempate determinista que
 * garantiza que la misma comparación siempre se dibuje igual.
 *
 * @example
 * // CAP 88 los tres; el IDD ordena por evidencia y no por orden de llegada.
 * // Jorge      → 0.40·90 + 0.35·85 + 0.25·78 = 85.25  → 1.º del empate
 * // Andrea     → 0.40·90 + 0.35·79 + 0.25·78 = 83.15  → 2.º del empate
 * // María F.   → 0.40·74 + 0.35·81 + 0.25·92 = 80.95  → 3.º del empate
 */

/** Campos de respaldo y su peso dentro del Índice de Desempate. */
export const TIEBREAK_WEIGHTS = [
  { key: "nota_conocimiento", label: "Nota Conocimientos", weight: 0.4 },
  { key: "nota_competencias", label: "Nota Competencias", weight: 0.35 },
  { key: "nota_curriculum", label: "Nota Currículum", weight: 0.25 },
] as const satisfies ReadonlyArray<{
  key: keyof Candidate;
  label: string;
  weight: number;
}>;

/** Tolerancia de comparación: los puntajes vienen de una hoja de cálculo. */
const EPSILON = 1e-9;

export interface RankedCandidate {
  candidate: Candidate;
  /** Puesto en el ranking por mérito (1 = mejor), nunca por orden de llegada. */
  rank: number;
  /** Nota CAP normalizada (null cuando la hoja no la trae). */
  cap: number | null;
  /** Índice de Desempate ponderado, o null si no hay ninguna nota de respaldo. */
  idd: number | null;
  /** True cuando otro postulante de la comparación tiene el mismo CAP. */
  tied: boolean;
}

/** Nota CAP del postulante como número (null si falta). */
export function capOf(c: Candidate): number | null {
  return parseDecimal(c.nota_cap as never);
}

/**
 * Índice de Desempate: media ponderada de las notas de respaldo presentes.
 * Devuelve `null` cuando el expediente no tiene ninguna de las tres.
 */
export function tiebreakIndex(c: Candidate): number | null {
  let sum = 0;
  let weight = 0;
  for (const field of TIEBREAK_WEIGHTS) {
    const value = parseDecimal(c[field.key] as never);
    if (value === null) continue;
    sum += value * field.weight;
    weight += field.weight;
  }
  if (weight === 0) return null;
  // Redondeo a dos decimales: evita que un 85.249999 y un 85.25 se lean como
  // distintos por el error de coma flotante al ponderar.
  return Math.round((sum / weight) * 100) / 100;
}

/** Cuántas de las notas de respaldo están registradas (0–3). */
function coverage(c: Candidate): number {
  return TIEBREAK_WEIGHTS.reduce(
    (n, f) => n + (parseDecimal(c[f.key] as never) === null ? 0 : 1),
    0,
  );
}

/** Compara dos valores "mayor es mejor" dejando los ausentes al final. */
function byHigher(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (Math.abs(a - b) <= EPSILON) return 0;
  return b - a;
}

/**
 * Comparador de mérito completo: CAP y, sólo en caso de empate, el IDD y su
 * cascada. El resultado es total y determinista, así que dos sesiones con los
 * mismos postulantes producen exactamente el mismo ranking.
 */
export function compareByMerit(a: Candidate, b: Candidate): number {
  const capDiff = byHigher(capOf(a), capOf(b));
  if (capDiff !== 0) return capDiff;

  const iddDiff = byHigher(tiebreakIndex(a), tiebreakIndex(b));
  if (iddDiff !== 0) return iddDiff;

  for (const field of TIEBREAK_WEIGHTS) {
    const diff = byHigher(
      parseDecimal(a[field.key] as never),
      parseDecimal(b[field.key] as never),
    );
    if (diff !== 0) return diff;
  }

  const cov = coverage(b) - coverage(a);
  if (cov !== 0) return cov;

  const byName = a.fullName.localeCompare(b.fullName, "es");
  if (byName !== 0) return byName;
  return String(a.identificador ?? "").localeCompare(
    String(b.identificador ?? ""),
    "es",
  );
}

/**
 * Ordena por mérito (mejor primero) y anota el puesto, el IDD y si el puesto
 * salió de un empate de CAP. El puesto es independiente de cómo se dibujen
 * después las columnas: invertir la vista no convierte al último en el primero.
 */
export function rankByMerit(list: Candidate[]): RankedCandidate[] {
  const sorted = [...list].sort(compareByMerit);
  return sorted.map((candidate, i) => {
    const cap = capOf(candidate);
    const sameCap = (other: Candidate | undefined) => {
      if (!other) return false;
      const otherCap = capOf(other);
      return (
        cap !== null && otherCap !== null && Math.abs(cap - otherCap) <= EPSILON
      );
    };
    return {
      candidate,
      rank: i + 1,
      cap,
      idd: tiebreakIndex(candidate),
      tied: sameCap(sorted[i - 1]) || sameCap(sorted[i + 1]),
    };
  });
}

/**
 * Orden de las columnas en pantalla. `"desc"` deja al mejor a la izquierda;
 * `"asc"` invierte la vista **sin tocar los puestos**, que siguen premiando la
 * mayor Nota CAP.
 */
export function orderForDisplay(
  ranked: RankedCandidate[],
  order: ComparatorOrder,
): RankedCandidate[] {
  return order === "asc" ? [...ranked].reverse() : ranked;
}

/** Texto del tooltip que explica un puesto resuelto por desempate. */
export function tiebreakExplanation(entry: RankedCandidate): string {
  if (!entry.tied) return "";
  if (entry.idd === null) {
    return "Empate en Nota CAP sin notas de respaldo registradas: el puesto se resuelve por orden alfabético.";
  }
  const parts = TIEBREAK_WEIGHTS.map((f) => {
    const value = parseDecimal(entry.candidate[f.key] as never);
    return `${f.label} ${value === null ? "—" : `${value}%`} (${Math.round(f.weight * 100)}%)`;
  });
  return `Empate en Nota CAP. Índice de Desempate ${entry.idd}: ${parts.join(" · ")}.`;
}
