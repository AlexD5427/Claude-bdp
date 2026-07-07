import type { CompetencyLevels } from "../lib/competencyMeta";

/**
 * The "Cargo: Bajo · Medio · Alto" visual cue.
 *
 * Renders three little boxes — one per seniority level — each capped with its
 * label. A box is *filled* when the competency applies to that level (`1` in the
 * catalogue) and left hollow otherwise (`0`). It's a compact, at-a-glance way for
 * an analyst to confirm a competency fits the level of the position they are
 * screening for.
 *
 * Returns `null` when no level flags exist, so legacy plain-name competencies
 * render exactly as before.
 */
export function CompetencyLevelBoxes({
  levels,
  className = "",
  compact = false,
}: {
  levels: CompetencyLevels;
  className?: string;
  /** On-glass compact palette (uses ink tokens instead of white). */
  compact?: boolean;
}) {
  const items: { label: string; on: boolean | null }[] = [
    { label: "Bajo", on: levels.bajo },
    { label: "Medio", on: levels.medio },
    { label: "Alto", on: levels.alto },
  ];
  if (items.every((i) => i.on === null)) return null;

  const labelCls = compact ? "text-ink-faint" : "text-white/70";

  return (
    <div className={`flex items-end gap-1.5 ${className}`}>
      <span className={`pb-[3px] text-[0.55rem] font-black uppercase tracking-wider ${labelCls}`}>
        Cargo
      </span>
      {items.map(({ label, on }) => (
        <span key={label} className="flex flex-col items-center gap-0.5">
          <span className={`text-[0.5rem] font-bold uppercase leading-none ${labelCls}`}>
            {label}
          </span>
          <span
            aria-label={`${label}: ${on ? "aplica" : "no aplica"}`}
            title={`${label}: ${on ? "aplica" : "no aplica"}`}
            className={[
              "h-3.5 w-5 rounded-[4px] ring-1 transition-all",
              on
                ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] ring-white/50 shadow-[0_0_8px_rgba(0,176,216,0.55)]"
                : compact
                  ? "fill-softer ring-[color:var(--hairline)]"
                  : "bg-white/10 ring-white/25",
            ].join(" ")}
          />
        </span>
      ))}
    </div>
  );
}
