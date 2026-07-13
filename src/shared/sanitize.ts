/**
 * Sanitization helpers.
 *
 * We never render backend-provided HTML/SVG/CSS. Rich content is stored as
 * plain text (or a constrained inline markup) and rendered by React, which
 * escapes by default. These helpers enforce that boundary and also protect
 * future CSV exports from spreadsheet formula injection.
 */

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Trim, strip control characters, collapse whitespace, and cap length. */
export function sanitizeText(input: unknown, maxLength = 5000): string {
  const s = String(input ?? "")
    .replace(CONTROL_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > maxLength ? s.slice(0, maxLength) : s;
}

/** Like sanitizeText but preserves newlines for multi-line fields. */
export function sanitizeMultiline(input: unknown, maxLength = 20000): string {
  const s = String(input ?? "")
    .replace(CONTROL_CHARS, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s.length > maxLength ? s.slice(0, maxLength) : s;
}

/** Remove any HTML tags, leaving only their text content. */
export function stripHtml(input: unknown): string {
  return String(input ?? "").replace(/<[^>]*>/g, "");
}

/**
 * Guard a value destined for a CSV/spreadsheet cell against formula injection.
 * Cells starting with = + - @ (or leading control chars used in attacks) get a
 * leading apostrophe so spreadsheet apps treat them as text, not formulas.
 */
export function guardCsvCell(value: unknown): string {
  const s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) return `'${s}`;
  return s;
}

/** Escape a value for safe inclusion in a CSV field (quotes doubled). */
export function csvField(value: unknown): string {
  const guarded = guardCsvCell(value);
  if (/[",\n\r]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`;
  return guarded;
}
