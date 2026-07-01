/**
 * DISC archetype catalogue.
 *
 * The behavioural archetypes (and the human-readable meaning of each) now come
 * from the backend's "Auxiliar" sheet, column `arquetipo_disc`, where every row
 * is stored as:
 *
 *     "Nombre del arquetipo (Código), Descripción en texto…"
 *
 * The text *before* the first comma feeds the dropdown; the text *after* it is
 * shown in the info pop-up. When the backend hasn't been redeployed yet (so the
 * column isn't in the payload), we fall back to {@link FALLBACK_DISC} so the
 * dropdown and the "¿qué significa?" pop-up keep working everywhere.
 */

export interface DiscArchetype {
  /** Full label shown in the dropdown, e.g. "Director (D)". */
  label: string;
  /** The code between parentheses, e.g. "D". Empty when none is present. */
  code: string;
  /** The meaning shown in the info pop-up. */
  description: string;
}

/** Pull the code out of a label like "Director (D)" → "D". */
export function extractDiscCode(label: string): string {
  const m = label.match(/\(([^)]+)\)/);
  return m ? m[1].trim() : "";
}

/**
 * Parse the raw `arquetipo_disc` rows into structured archetypes.
 * Splits on the FIRST comma only, so descriptions may contain commas.
 */
export function parseDiscArchetypes(raw: unknown): DiscArchetype[] {
  if (!Array.isArray(raw)) return [];
  const out: DiscArchetype[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const line = String(entry ?? "").trim();
    if (!line) continue;
    const comma = line.indexOf(",");
    const label = (comma === -1 ? line : line.slice(0, comma)).trim();
    const description = comma === -1 ? "" : line.slice(comma + 1).trim();
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push({ label, code: extractDiscCode(label), description });
  }
  return out;
}

/**
 * Given the catalogue and a candidate's stored `perfil_disc`, find the matching
 * archetype so we can show its meaning. Matches by exact label first, then by
 * DISC code (the part in parentheses), then by the plain name.
 */
export function resolveDiscArchetype(
  catalogue: DiscArchetype[],
  perfil: string | undefined | null,
): DiscArchetype | null {
  const value = (perfil ?? "").trim();
  if (!value || value.toUpperCase() === "N/A") return null;
  const lower = value.toLowerCase();
  const byLabel = catalogue.find((a) => a.label.toLowerCase() === lower);
  if (byLabel) return byLabel;

  const code = extractDiscCode(value).toLowerCase();
  if (code) {
    const byCode = catalogue.find((a) => a.code.toLowerCase() === code);
    if (byCode) return byCode;
  }
  // Match the plain name (label without the parenthetical code).
  const name = value.replace(/\s*\([^)]*\)\s*/g, "").trim().toLowerCase();
  const byName = catalogue.find(
    (a) => a.label.replace(/\s*\([^)]*\)\s*/g, "").trim().toLowerCase() === name,
  );
  return byName ?? null;
}

/**
 * Built-in fallback catalogue used until the "Auxiliar" sheet's
 * `arquetipo_disc` column is available in the payload. Descriptions are concise
 * summaries of each behavioural style.
 */
export const FALLBACK_DISC: DiscArchetype[] = [
  {
    label: "Director (D)",
    code: "D",
    description:
      "Directo, decidido y orientado a resultados. Asume el control, toma decisiones con rapidez y prospera bajo presión. Puede resultar exigente o impaciente con los detalles.",
  },
  {
    label: "Orientador (Di)",
    code: "Di",
    description:
      "Enérgico y persuasivo. Combina el empuje por lograr metas con la capacidad de movilizar a otros hacia una visión ambiciosa.",
  },
  {
    label: "Valiente (DI)",
    code: "DI",
    description:
      "Audaz y sociable. Busca desafíos, asume riesgos con seguridad y contagia entusiasmo, aunque a veces actúa antes de planificar.",
  },
  {
    label: "Carismático (Id)",
    code: "Id",
    description:
      "Extrovertido y motivador. Inspira con su energía y optimismo; disfruta influir y liderar desde el entusiasmo.",
  },
  {
    label: "Entusiasta (I)",
    code: "I",
    description:
      "Sociable, optimista y expresivo. Construye relaciones con facilidad y valora el reconocimiento; puede descuidar el seguimiento de detalles.",
  },
  {
    label: "Alentador (Is)",
    code: "Is",
    description:
      "Cálido y cercano. Combina la sociabilidad con el apoyo a los demás, fomentando un clima colaborador y positivo.",
  },
  {
    label: "Conciliador (IS)",
    code: "IS",
    description:
      "Amable y empático. Prioriza la armonía del grupo, escucha activamente y busca acuerdos que beneficien a todos.",
  },
  {
    label: "Colaborador (Si)",
    code: "Si",
    description:
      "Servicial y confiable. Apoya al equipo con constancia y trato amistoso, prefiriendo entornos estables y cordiales.",
  },
  {
    label: "Servicial (S)",
    code: "S",
    description:
      "Paciente, leal y estable. Valora la cooperación y la previsibilidad; ofrece apoyo constante y evita los conflictos.",
  },
  {
    label: "Organizador (Sc)",
    code: "Sc",
    description:
      "Metódico y sereno. Une la estabilidad con la atención al orden y los procedimientos, garantizando continuidad y calidad.",
  },
  {
    label: "Ejecutador (SC)",
    code: "SC",
    description:
      "Fiable y preciso. Ejecuta con disciplina siguiendo estándares definidos; prefiere planes claros y resultados verificables.",
  },
  {
    label: "Sistemático (Cs)",
    code: "Cs",
    description:
      "Analítico y ordenado. Se apoya en datos y procedimientos, cuidando la exactitud y la coherencia del trabajo.",
  },
  {
    label: "Analítico (C)",
    code: "C",
    description:
      "Preciso, prudente y orientado a la calidad. Se guía por hechos y estándares altos; puede ser crítico y reservado.",
  },
  {
    label: "Confirmador (Cd)",
    code: "Cd",
    description:
      "Riguroso y objetivo. Combina el análisis con la determinación por corregir y mejorar lo que no cumple los criterios.",
  },
  {
    label: "Progresista (CD)",
    code: "CD",
    description:
      "Exigente e innovador. Une el rigor técnico con el impulso por cambiar y superar el estándar actual.",
  },
  {
    label: "Táctico (SC')",
    code: "SC'",
    description:
      "Equilibrado entre estabilidad y precisión. Planifica con cuidado y actúa de forma prudente para minimizar riesgos.",
  },
  {
    label: "Competitivo (DS)",
    code: "DS",
    description:
      "Persistente y firme. Combina el empuje por lograr metas con constancia, manteniendo el rumbo pese a los obstáculos.",
  },
  {
    label: "Moderado (IC)",
    code: "IC",
    description:
      "Sociable y detallista a la vez. Alterna la cercanía con las personas y la atención a la exactitud según el contexto.",
  },
];
