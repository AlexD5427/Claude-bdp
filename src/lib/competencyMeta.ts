/**
 * Competency catalogue metadata.
 *
 * The "Auxiliar" sheet's competency column (`competencias_lista`) now carries
 * richer entries than a bare name. Each row follows the shape:
 *
 *     Competencia,Bajo,Medio,Alto,"Descripción…"
 *
 * where:
 *   · `Competencia` is the competency name (kept working exactly as before, so
 *     the autocomplete still searches by it);
 *   · `Bajo` / `Medio` / `Alto` are `1`/`0` flags marking the seniority levels
 *     ("cargos") the competency is best associated with — a quick visual cue for
 *     analysts to confirm they are using the right competency for a process;
 *   · the trailing quoted text is a human description shown in an info pop-up.
 *
 * This module parses that format defensively (a plain name with no extras keeps
 * working) and exposes a small catalogue lookup keyed by the (lower-cased) name,
 * so any module — the intake form, the comparator — can resolve a competency's
 * levels and description from just its name.
 */

export interface CompetencyLevels {
  /** `null` when the flag is absent (legacy plain-name rows). */
  bajo: boolean | null;
  medio: boolean | null;
  alto: boolean | null;
}

export interface CompetencyMeta {
  /** Clean competency name (what the autocomplete adds and candidates store). */
  name: string;
  levels: CompetencyLevels;
  /** True when at least one Bajo/Medio/Alto flag was provided. */
  hasLevels: boolean;
  /** Description without its surrounding quotes, or null when absent. */
  description: string | null;
  /** The original catalogue string, untouched. */
  raw: string;
}

/** Strip emoji / pictographs so names render as clean text only. */
export function stripEmoji(text: string): string {
  return text
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\uFE0F\u200D]/gu,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function toFlag(value: string | undefined): boolean | null {
  if (value === undefined) return null;
  const v = value.trim();
  if (v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "sí" || v.toLowerCase() === "si")
    return true;
  if (v === "0" || v.toLowerCase() === "false" || v.toLowerCase() === "no") return false;
  return null;
}

/**
 * Parse one catalogue entry into structured metadata.
 *
 *   parseCompetencyMeta('Liderazgo,0,1,1,"Guía y motiva equipos"')
 *   → { name:"Liderazgo", levels:{bajo:false,medio:true,alto:true},
 *       hasLevels:true, description:"Guía y motiva equipos", raw:"…" }
 *
 *   parseCompetencyMeta('Trabajo en equipo')  // legacy plain name
 *   → { name:"Trabajo en equipo", levels:{…null}, hasLevels:false,
 *       description:null, … }
 */
export function parseCompetencyMeta(raw: unknown): CompetencyMeta {
  const str = String(raw ?? "").trim();

  // Pull the quoted description out first (it may itself contain commas).
  let description: string | null = null;
  let head = str;
  const firstQuote = str.indexOf('"');
  if (firstQuote >= 0) {
    const lastQuote = str.lastIndexOf('"');
    if (lastQuote > firstQuote) {
      description = str.slice(firstQuote + 1, lastQuote).trim() || null;
      head = str.slice(0, firstQuote);
    }
  }

  const parts = head.split(",").map((p) => p.trim());
  const name = stripEmoji(parts[0] ?? "");
  const bajo = toFlag(parts[1]);
  const medio = toFlag(parts[2]);
  const alto = toFlag(parts[3]);
  const hasLevels = [bajo, medio, alto].some((x) => x !== null);

  return { name, levels: { bajo, medio, alto }, hasLevels, description, raw: str };
}

/** A catalogue keyed by lower-cased competency name for O(1) lookups. */
export type CompetencyCatalog = Map<string, CompetencyMeta>;

/** Build a lookup catalogue from the raw `competencias` array. */
export function buildCompetencyCatalog(options: string[]): CompetencyCatalog {
  const map: CompetencyCatalog = new Map();
  for (const opt of options) {
    const meta = parseCompetencyMeta(opt);
    if (!meta.name) continue;
    const key = meta.name.toLowerCase();
    // First occurrence wins (preserves the catalogue's own ordering/priority).
    if (!map.has(key)) map.set(key, meta);
  }
  return map;
}

/** Resolve a competency's metadata from a (possibly messy) name. */
export function lookupCompetency(
  catalog: CompetencyCatalog,
  name: string,
): CompetencyMeta | undefined {
  return catalog.get(stripEmoji(name).toLowerCase());
}
