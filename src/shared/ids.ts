/**
 * Identifier, slug, and human-readable code helpers.
 *
 * IDs are provider-neutral: we generate stable UUID-like strings on the client
 * so records have an identity before the backend assigns one. Slugs and codes
 * are derived from titles for URLs and spreadsheet-friendly references.
 */

/** RFC-4122-ish v4 id, using crypto when available. */
export function newId(prefix = ""): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : fallbackUuid();
  return prefix ? `${prefix}_${uuid}` : uuid;
}

function fallbackUuid(): string {
  // Non-cryptographic fallback for environments without crypto.randomUUID.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** URL-safe slug from arbitrary text (accents folded, lowercase). */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * A short uppercase code, e.g. code("Analista de Riesgos", "PRC") → "PRC-ANAL-1A2B".
 * Deterministic-ish prefix from the title plus a random suffix for uniqueness.
 */
export function humanCode(title: string, prefix: string): string {
  const stub = slugify(title).replace(/-/g, "").slice(0, 4).toUpperCase() || "GEN";
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${stub}-${rand}`;
}
