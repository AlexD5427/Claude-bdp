import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
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
 * A premium DISC archetype picker, now a **typeable combobox**: the operator
 * can Tab into it, type part of an archetype ("dir", "ana"…) to filter, move
 * through matches with ↑/↓ and select with Enter — all without a mouse. When it
 * isn't focused it collapses to a colour-coded chip (D·red, I·amber, S·green,
 * C·blue) and reveals a "!" button explaining the archetype. The option list is
 * drawn in a portal so it never gets clipped inside the modal.
 *
 * The `<input>` ref is forwarded so the intake form can drive focus order.
 */
export const DiscSelect = forwardRef<HTMLInputElement, DiscSelectProps>(
  function DiscSelect({ label, hint, value, onChange, archetypes }, ref) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [focused, setFocused] = useState(false);
    const [active, setActive] = useState(0);
    const wrapRef = useRef<HTMLDivElement>(null);

    const selected = useMemo(
      () => resolveDiscArchetype(archetypes, value),
      [archetypes, value],
    );
    const isNA = !value || value.toUpperCase() === NA || !selected;
    const chipAccent = discAccent(selected?.code ?? "");

    const options = useMemo(
      () => [NA, ...archetypes.map((a) => a.label)],
      [archetypes],
    );

    const suggestions = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return options;
      return options.filter((o) => o.toLowerCase().includes(q));
    }, [options, query]);

    useEffect(() => setActive(0), [query, open]);

    function choose(opt: string) {
      onChange(opt);
      setQuery("");
      setOpen(false);
      setFocused(false);
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
      if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
        setOpen(true);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, suggestions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      } else if (e.key === "Enter") {
        if (suggestions[active]) {
          e.preventDefault();
          choose(suggestions[active]);
        }
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }

    // When the field is focused the operator types freely; otherwise we show
    // the human-readable selected label (or an empty box for N/A).
    const display = focused
      ? query
      : isNA
        ? ""
        : selected!.label;

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
            <div className="glass flex items-center gap-2 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-cyan-400/70">
              {/* Colour dot reflecting the current selection. */}
              {isNA ? (
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-400/60" />
              ) : (
                <Dot code={selected!.code} />
              )}
              <input
                ref={ref}
                type="text"
                value={display}
                onFocus={() => {
                  setFocused(true);
                  setQuery("");
                  setOpen(true);
                }}
                onBlur={() => setFocused(false)}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                }}
                onKeyDown={onKeyDown}
                placeholder={isNA ? "N/A · escriba para buscar…" : "Buscar arquetipo…"}
                role="combobox"
                aria-expanded={open}
                aria-autocomplete="list"
                autoComplete="off"
                className="w-full bg-transparent text-sm font-semibold text-ink placeholder:font-normal placeholder:text-ink-faint outline-none"
              />
              <ChevronDown
                className={`ml-auto h-4 w-4 shrink-0 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`}
              />
            </div>

            <PortalDropdown open={open} anchorRef={wrapRef} onClose={() => setOpen(false)}>
              <ul role="listbox" className="glass-heavy w-full rounded-2xl p-1.5">
                {suggestions.length === 0 && (
                  <li className="px-3 py-2 text-sm text-ink-faint">Sin coincidencias.</li>
                )}
                {suggestions.map((opt, i) => {
                  const isActiveOpt = i === active;
                  const isSelected = (value || NA) === opt;
                  const code = opt === NA ? "" : extractDiscCode(opt);
                  return (
                    <li key={opt} role="option" aria-selected={isSelected}>
                      <button
                        type="button"
                        onMouseEnter={() => setActive(i)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          choose(opt);
                        }}
                        className={[
                          "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                          isActiveOpt
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
                        {isSelected && <Check className="ml-auto h-4 w-4 shrink-0 text-cyan-400" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </PortalDropdown>
          </div>

          {/* The "!" info button, only when a real archetype is selected. It is
              kept out of the keyboard tab order so Tab flows straight on. */}
          {!isNA && <DiscInfoButton archetype={selected} tabIndex={-1} />}

          {/* Preserve the coloured chip affordance beside the field. */}
          {!isNA && !focused && (
            <span
              className={`hidden shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ring-1 shadow-glass sm:inline-flex ${chipAccent.chip}`}
            >
              {selected!.code && (
                <span className="grid h-4 min-w-4 place-items-center rounded-full bg-white/25 px-1 text-[0.6rem] font-black">
                  {selected!.code}
                </span>
              )}
            </span>
          )}
        </div>
      </div>
    );
  },
);
