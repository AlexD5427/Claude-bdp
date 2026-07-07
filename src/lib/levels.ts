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

/**
 * High-contrast pill styles for categorical levels. The colour is carried by a
 * solid gradient with white, drop-shadowed text so "Riesgo Bajo/Medio/Alto"
 * reads clearly on the comparator's saturated glass in either theme (the old
 * translucent tint washed out on busy backgrounds).
 */
export const TONE_CLASS: Record<Tone, string> = {
  green:
    "bg-gradient-to-br from-emerald-500 to-green-600 text-white ring-white/40 shadow-[0_2px_10px_rgba(16,185,129,0.45)] [text-shadow:0_1px_1px_rgba(0,0,0,0.25)]",
  amber:
    "bg-gradient-to-br from-amber-400 to-orange-500 text-white ring-white/40 shadow-[0_2px_10px_rgba(245,158,11,0.45)] [text-shadow:0_1px_1px_rgba(0,0,0,0.25)]",
  red:
    "bg-gradient-to-br from-rose-500 to-red-600 text-white ring-white/40 shadow-[0_2px_10px_rgba(244,63,94,0.45)] [text-shadow:0_1px_1px_rgba(0,0,0,0.25)]",
  muted: "fill-softer text-ink-soft ring-[color:var(--hairline)]",
};
