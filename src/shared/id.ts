/**
 * Identifier helpers.
 *
 * Domain entities (processes, assessments, sections, questions, versions…) need
 * stable, collision-resistant ids that are safe to generate on the client and
 * persist to Google Sheets. We prefer the platform `crypto.randomUUID()` and
 * fall back to a time-ordered pseudo-random id when it is unavailable.
 */

/** A RFC-4122 UUID when available, else a sortable time-prefixed fallback. */
export function uid(prefix = ""): string {
  let core: string;
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    core = crypto.randomUUID();
  } else {
    core = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
  return prefix ? `${prefix}_${core}` : core;
}

/**
 * A short, human-friendly code from a title, e.g. "Oficial de Créditos 2026" →
 * "OFICIAL-DE-CREDITOS-2026". Used to seed process/assessment codes.
 */
export function slugCode(input: string, max = 40): string {
  const base = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.slice(0, max) || "SIN-CODIGO";
}

/** A URL-safe slug, e.g. "Jefe de Agencia" → "jefe-de-agencia". */
export function slugify(input: string, max = 60): string {
  const base = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.slice(0, max) || "sin-slug";
}
