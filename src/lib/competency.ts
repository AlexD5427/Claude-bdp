import type { CompetencyScore, SavedCompetency } from "../types";

/**
 * Competency math — the heart of the evaluation logic.
 *
 * All parsing is resilient to the messy values the backend (and humans) can
 * produce: numbers encoded as strings, decimals written with "." or ",", and
 * empty fields.
 */

/**
 * Parse a number that may use a dot or comma as its decimal separator.
 * Returns `null` for empty / non-numeric input so callers can branch cleanly.
 *
 *   parseDecimal("7,5")  -> 7.5
 *   parseDecimal("12.3") -> 12.3
 *   parseDecimal("")     -> null
 */
export function parseDecimal(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  if (raw === "") return null;
  // Normalise the decimal separator to a dot, then strip stray characters.
  const normalised = raw.replace(/,/g, ".").replace(/[^0-9.\-]/g, "");
  if (normalised === "" || normalised === "-" || normalised === ".") return null;
  const parsed = Number.parseFloat(normalised);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Brecha (gap) = Valor Obtenido - Valor Esperado, rounded to 1 decimal.
 * Business rule: a positive result is forced to 0 — only negatives or zero are
 * meaningful (you can exceed expectations, but the "gap" is never positive).
 */
export function computeBrecha(
  esperado: number | null,
  obtenido: number | null,
): number | null {
  if (esperado === null || obtenido === null) return null;
  const raw = obtenido - esperado;
  const rounded = Math.round(raw * 10) / 10;
  return rounded > 0 ? 0 : rounded;
}

/**
 * Ajuste (fit) = round((obtenido / esperado) * 100), capped at 100.
 * Guards against division by zero.
 */
export function computeAjuste(
  esperado: number | null,
  obtenido: number | null,
): number | null {
  if (esperado === null || obtenido === null || esperado === 0) return null;
  const pct = Math.round((obtenido / esperado) * 100);
  return Math.min(pct, 100);
}

/** Build the object persisted with a candidate. */
export function buildSavedCompetency(
  name: string,
  esperado: number | null,
  obtenido: number | null,
): SavedCompetency {
  return {
    name,
    esperado,
    obtenido,
    brecha: computeBrecha(esperado, obtenido),
    ajuste: computeAjuste(esperado, obtenido),
  };
}

/** Map an Ajuste percentage to its semantic colour band. */
export type AjusteBand = "red" | "yellow" | "green" | "muted";

export function ajusteBand(ajuste: number | null): AjusteBand {
  if (ajuste === null) return "muted";
  if (ajuste <= 50) return "red";
  if (ajuste <= 75) return "yellow";
  return "green";
}

/**
 * Normalise one raw competency entry into a `CompetencyScore`.
 * Handles both the modern shape ({ name, esperado, obtenido, brecha, ajuste })
 * and the legacy shape ({ nombre, competencia, porcentaje }).
 */
function normaliseEntry(entry: Record<string, unknown>): CompetencyScore | null {
  const name =
    (typeof entry.name === "string" && entry.name) ||
    (typeof entry.nombre === "string" && entry.nombre) ||
    (typeof entry.competencia === "string" && entry.competencia) ||
    "";
  if (!name) return null;

  const esperado = parseDecimal(entry.esperado);
  const obtenido = parseDecimal(entry.obtenido);

  // Ajuste may be stored as "85%", 85, or fall back to a legacy "porcentaje".
  let ajuste = parseDecimal(
    typeof entry.ajuste === "string"
      ? entry.ajuste.replace("%", "")
      : entry.ajuste,
  );
  if (ajuste === null) ajuste = parseDecimal(entry.porcentaje);
  if (ajuste === null) ajuste = computeAjuste(esperado, obtenido);
  if (ajuste !== null) ajuste = Math.min(Math.round(ajuste), 100);

  let brecha = parseDecimal(entry.brecha);
  if (brecha === null) brecha = computeBrecha(esperado, obtenido);
  if (brecha !== null) brecha = brecha > 0 ? 0 : Math.round(brecha * 10) / 10;

  return { name, esperado, obtenido, brecha, ajuste };
}

/**
 * Safely parse the `competencias` column, which is a JSON string (or empty).
 * Never throws — malformed data yields an empty list.
 */
export function parseCompetencias(raw: unknown): CompetencyScore[] {
  if (Array.isArray(raw)) {
    return raw
      .map((e) => normaliseEntry(e as Record<string, unknown>))
      .filter((e): e is CompetencyScore => e !== null);
  }
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((e) => normaliseEntry(e as Record<string, unknown>))
      .filter((e): e is CompetencyScore => e !== null);
  } catch {
    return [];
  }
}
