import { ajusteBand } from "../lib/competency";

/**
 * The "Ajuste" badge. Background colour is dynamic by band:
 *   <= 50%  → red, 51-75% → yellow, >= 76% → green.
 * The text stays white/bold/drop-shadow regardless of background, for contrast.
 */
export function AjusteBadge({
  ajuste,
  className = "",
}: {
  ajuste: number | null;
  className?: string;
}) {
  const band = ajusteBand(ajuste);
  const bg =
    band === "green"
      ? "bg-gradient-to-br from-emerald-500 to-green-600"
      : band === "yellow"
        ? "bg-gradient-to-br from-amber-400 to-yellow-500"
        : band === "red"
          ? "bg-gradient-to-br from-rose-500 to-red-600"
          : "bg-slate-500/70";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.7rem] leading-tight ring-1 ring-white/30 shadow-glass ${bg} ${className}`}
    >
      <span className="text-white font-bold drop-shadow-md">
        Ajuste: {ajuste === null ? "—" : `${ajuste}%`}
      </span>
    </span>
  );
}
