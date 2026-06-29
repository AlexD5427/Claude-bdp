import { type Tone, TONE_CLASS } from "../lib/levels";

/** A small pill that colour-codes a categorical level (N/A, Bajo, Medio…). */
export function LevelBadge({
  value,
  tone,
  className = "",
}: {
  value?: string;
  tone: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${TONE_CLASS[tone]} ${className}`}
    >
      {value && value.trim() ? value : "N/A"}
    </span>
  );
}
