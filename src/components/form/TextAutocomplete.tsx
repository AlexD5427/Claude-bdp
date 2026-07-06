import { forwardRef, useMemo, useRef, useState } from "react";
import { PortalDropdown } from "../PortalDropdown";

interface TextAutocompleteProps {
  label: string;
  hint?: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  /** Suggestion catalogue (e.g. `cargos_bdp`). Free text is always allowed. */
  options: string[];
  placeholder?: string;
}

/**
 * A free-text field with **live type-ahead** against a catalogue. Unlike a
 * `<select>`, the operator can always keep whatever they type even if it isn't
 * on the list — suggestions merely accelerate common entries (e.g. every BDP
 * position from the `cargos_bdp` column). Suggestions are drawn in a portal so
 * they float above the intake form's scroll container, and the whole thing is
 * keyboard-navigable (↑/↓ to move, Enter to accept, Esc to dismiss).
 *
 * The underlying `<input>` ref is forwarded so parent forms can drive focus
 * order for keyboard-only navigation.
 */
export const TextAutocomplete = forwardRef<HTMLInputElement, TextAutocompleteProps>(
  function TextAutocomplete(
    { label, hint, required, value, onChange, options, placeholder },
    ref,
  ) {
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const wrapRef = useRef<HTMLDivElement>(null);

    const suggestions = useMemo(() => {
      const q = value.trim().toLowerCase();
      const pool = options.map((o) => o.trim()).filter(Boolean);
      const matches = q
        ? pool.filter((o) => o.toLowerCase().includes(q) && o.toLowerCase() !== q)
        : pool;
      // De-dupe while preserving order.
      return [...new Set(matches)].slice(0, 8);
    }, [options, value]);

    function choose(name: string) {
      onChange(name);
      setOpen(false);
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
      if (!open && e.key === "ArrowDown" && suggestions.length) {
        setOpen(true);
        return;
      }
      if (!open) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, suggestions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      } else if (e.key === "Enter") {
        // Only intercept Enter when actively choosing a suggestion.
        if (suggestions[active]) {
          e.preventDefault();
          choose(suggestions[active]);
        }
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }

    return (
      <label className="block">
        <span className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            {label}
            {required && <span className="ml-1 text-cyan-400">*</span>}
          </span>
          {hint && <span className="text-[0.65rem] text-ink-faint">{hint}</span>}
        </span>
        <div ref={wrapRef} className="relative">
          <input
            ref={ref}
            type="text"
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setActive(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            autoComplete="off"
            role="combobox"
            aria-expanded={open && suggestions.length > 0}
            aria-autocomplete="list"
            className="glass w-full rounded-xl px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint outline-none focus-within:ring-2 focus-within:ring-cyan-400/70"
          />
          <PortalDropdown
            open={open && suggestions.length > 0}
            anchorRef={wrapRef}
            onClose={() => setOpen(false)}
          >
            <ul role="listbox" className="glass-heavy w-full rounded-2xl p-1.5">
              {suggestions.map((opt, i) => (
                <li key={opt} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    // Use mousedown so the click lands before the input blur.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choose(opt);
                    }}
                    onMouseEnter={() => setActive(i)}
                    className={[
                      "flex w-full items-center rounded-xl px-3 py-2 text-left text-sm transition-colors",
                      i === active
                        ? "bg-gradient-to-br from-[#00b0d8]/40 to-[#005baa]/40 text-ink"
                        : "text-ink-soft hover:fill-soft",
                    ].join(" ")}
                  >
                    <span className="truncate">{opt}</span>
                  </button>
                </li>
              ))}
            </ul>
          </PortalDropdown>
        </div>
      </label>
    );
  },
);
