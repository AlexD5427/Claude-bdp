export type Tone = "green" | "amber" | "red" | "muted";

const norm = (v?: string) => (v ?? "").trim().toLowerCase();

/** Confiabilidad e Integridad — higher trust is better. */
export function reliabilityTone(v?: string): Tone {
  const s = norm(v);
  if (s.includes("no confiable")) return "red";
  if (s.includes("media")) return "amber";
  if (s.includes("confiable")) return "green";
  return "muted";
}

/** Integridad — Alto good, Bajo bad. */
export function integrityTone(v?: string): Tone {
  const s = norm(v);
  if (s === "alto") return "green";
  if (s === "medio") return "amber";
  if (s === "bajo") return "red";
  return "muted";
}

/**
 * Riesgo (robo / mentira) — Bajo good, Alto bad. Uses substring matching so it
 * understands both the legacy wording ("Bajo") and the explicit one stored by
 * the intake form ("Riesgo Bajo"). Order matters: "medio" before "bajo"/"alto"
 * so a value like "Riesgo Medio" is never mis-read.
 */
export function riskTone(v?: string): Tone {
  const s = norm(v);
  if (!s || s === "n/a") return "muted";
  if (s.includes("medio")) return "amber";
  if (s.includes("bajo")) return "green";
  if (s.includes("alto")) return "red";
  return "muted";
}

/** Knowledge / tool proficiency — Alto good. */
export function proficiencyTone(v?: string): Tone {
  return integrityTone(v);
}

export const TONE_CLASS: Record<Tone, string> = {
  green: "bg-emerald-500/15 text-emerald-500 ring-emerald-400/40",
  amber: "bg-amber-500/15 text-amber-500 ring-amber-400/40",
  red: "bg-rose-500/15 text-rose-500 ring-rose-400/40",
  muted: "fill-softer text-ink-faint ring-[color:var(--hairline)]",
};
