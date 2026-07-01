import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { PortalDropdown } from "./PortalDropdown";
import { DiscInfoButton } from "./DiscInfoButton";
import { discAccent } from "../lib/discAccent";
import { extractDiscCode, resolveDiscArchetype, type DiscArchetype } from "../lib/disc";

interface DiscSelectProps {
  label: string;
  hint?: string;
  /** Selected label, e.g. "Director (D)" or "N/A". */
  value: string;
  onChange: (value: string) => void;
  /** The DISC catalogue (labels + descriptions). */
  archetypes: DiscArchetype[];
}

const NA = "N/A";

/** A little colour dot following the classic DISC palette. */
function Dot({ code }: { code: string }) {
  const accent = discAccent(code);
  return (
    <span
      className={`h-2.5 w-2.5 shrink-0 rounded-full bg-gradient-to-br ${accent.gradient} ring-1 ring-white/40`}
    />
  );
}

/**
 * A premium DISC archetype picker. Instead of a plain dropdown it shows the
 * current selection as a colour-coded **chip** (D·red, I·amber, S·green,
 * C·blue), defaults to "N/A", and — once a real archetype is chosen — reveals a
 * small "!" button that opens a pop-up explaining what the archetype means. The
 * option list is drawn in a portal so it never gets clipped inside the modal.
 */
export function DiscSelect({
  label,
  hint,
  value,
  onChange,
  archetypes,
}: DiscSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => resolveDiscArchetype(archetypes, value),
    [archetypes, value],
  );
  const isNA = !value || value.toUpperCase() === NA || !selected;
  const chipAccent = discAccent(selected?.code ?? "");

  const options = useMemo(() => [NA, ...archetypes.map((a) => a.label)], [archetypes]);

  return (
    <div>
      <span className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
          {label}
        </span>
        {hint && <span className="text-[0.65rem] text-ink-faint">{hint}</span>}
      </span>

      <div className="flex items-center gap-2">
        <div ref={wrapRef} className="relative min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={open}
            className="glass flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left outline-none transition-all focus-within:ring-2 focus-within:ring-cyan-400/70"
          >
            {isNA ? (
              <span className="inline-flex items-center gap-1.5 rounded-full fill-softer px-2.5 py-1 text-xs font-bold text-ink-soft ring-1 ring-[color:var(--hairline)]">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-400/60" />
                N/A
              </span>
            ) : (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 shadow-glass ${chipAccent.chip}`}
              >
                {selected!.code && (
                  <span className="grid h-4 min-w-4 place-items-center rounded-full bg-white/25 px-1 text-[0.6rem] font-black">
                    {selected!.code}
                  </span>
                )}
                {selected!.label.replace(/\s*\([^)]*\)\s*/g, "").trim()}
              </span>
            )}
            <ChevronDown
              className={`ml-auto h-4 w-4 shrink-0 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>

          <PortalDropdown open={open} anchorRef={wrapRef} onClose={() => setOpen(false)}>
            <ul role="listbox" className="glass-heavy w-full rounded-2xl p-1.5">
              {options.map((opt) => {
                const active = (value || NA) === opt;
                const code = opt === NA ? "" : extractDiscCode(opt);
                return (
                  <li key={opt} role="option" aria-selected={active}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(opt);
                        setOpen(false);
                      }}
                      className={[
                        "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                        active
                          ? "bg-gradient-to-br from-[#00b0d8]/30 to-[#005baa]/30 text-ink"
                          : "text-ink-soft hover:fill-soft",
                      ].join(" ")}
                    >
                      {opt === NA ? (
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-400/60" />
                      ) : (
                        <Dot code={code} />
                      )}
                      <span className="truncate">{opt}</span>
                      {active && <Check className="ml-auto h-4 w-4 shrink-0 text-cyan-400" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </PortalDropdown>
        </div>

        {/* The "!" info button, only when a real archetype is selected. */}
        {!isNA && <DiscInfoButton archetype={selected} />}
      </div>
    </div>
  );
}
