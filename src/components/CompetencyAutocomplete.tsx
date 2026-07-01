import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus } from "lucide-react";
import { PortalDropdown } from "./PortalDropdown";

/** Strip emoji / pictographs so suggestions render as clean text only. */
function stripEmoji(text: string): string {
  return text
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\uFE0F\u200D]/gu,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

interface CompetencyAutocompleteProps {
  options: string[];
  /** Names already chosen (excluded from suggestions). */
  selected: string[];
  onAdd: (name: string) => void;
  disabled?: boolean;
}

/**
 * Accessible autocomplete fed by the API's `competencias` array.
 * Renders suggestions as plain text (no emojis), excludes already-selected
 * items, and supports keyboard navigation. The suggestion list is drawn in a
 * portal (see {@link PortalDropdown}) so it floats above the intake form's
 * scrollable body instead of being clipped by it.
 */
export function CompetencyAutocomplete({
  options,
  selected,
  onAdd,
  disabled = false,
}: CompetencyAutocompleteProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selectedSet = useMemo(
    () => new Set(selected.map((s) => s.toLowerCase())),
    [selected],
  );

  const suggestions = useMemo(() => {
    const q = stripEmoji(query).toLowerCase();
    return options
      .map(stripEmoji)
      .filter((opt) => opt && !selectedSet.has(opt.toLowerCase()))
      .filter((opt) => (q ? opt.toLowerCase().includes(q) : true))
      .slice(0, 8);
  }, [options, query, selectedSet]);

  useEffect(() => setActive(0), [query, open]);

  function choose(name: string) {
    onAdd(name);
    setQuery("");
    setOpen(false);
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
      e.preventDefault();
      if (suggestions[active]) choose(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="glass flex items-center gap-2 rounded-2xl px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-cyan-300/70">
        <Search className="h-4 w-4 shrink-0 text-ink-soft" />
        <input
          type="text"
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={
            disabled ? "Límite alcanzado (7/7)" : "Buscar competencia o habilidad…"
          }
          className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none disabled:cursor-not-allowed"
          role="combobox"
          aria-expanded={open}
          aria-controls="competency-listbox"
          autoComplete="off"
        />
      </div>

      <PortalDropdown
        open={open && !disabled && suggestions.length > 0}
        anchorRef={wrapRef}
        onClose={() => setOpen(false)}
      >
        <ul
          id="competency-listbox"
          role="listbox"
          className="glass-heavy w-full rounded-2xl p-1.5"
        >
          {suggestions.map((opt, i) => (
            <li key={opt} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(opt)}
                className={[
                  "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                  i === active
                    ? "bg-gradient-to-br from-[#00b0d8]/40 to-[#005baa]/40 text-ink"
                    : "text-ink-soft hover:fill-soft",
                ].join(" ")}
              >
                <span className="truncate">{opt}</span>
                <Plus className="h-4 w-4 shrink-0 opacity-70" />
              </button>
            </li>
          ))}
        </ul>
      </PortalDropdown>
    </div>
  );
}
