import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus } from "lucide-react";
import { PortalDropdown } from "./PortalDropdown";
import { CompetencyLevelBoxes } from "./CompetencyLevelBoxes";
import { parseCompetencyMeta, type CompetencyMeta } from "../lib/competencyMeta";

interface CompetencyAutocompleteProps {
  /** Raw catalogue rows ("Nombre,Bajo,Medio,Alto,\"Descripción\""). */
  options: string[];
  /** Names already chosen (excluded from suggestions). */
  selected: string[];
  onAdd: (name: string) => void;
  disabled?: boolean;
}

/**
 * Accessible autocomplete fed by the API's `competencias` array.
 *
 * Each catalogue row is parsed into {@link CompetencyMeta}: the search still
 * works purely by **name**, but every suggestion now also renders the
 * "Cargo: Bajo · Medio · Alto" applicability boxes so the analyst can tell at a
 * glance whether a competency suits the level of the position. Already-selected
 * items are excluded and keyboard navigation is fully supported. The suggestion
 * list is drawn in a portal (see {@link PortalDropdown}) so it floats above the
 * intake form's scrollable body instead of being clipped by it.
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

  // Parse once, de-duplicate by name, and drop already-selected competencies.
  const catalog = useMemo(() => {
    const seen = new Set<string>();
    const list: CompetencyMeta[] = [];
    for (const opt of options) {
      const meta = parseCompetencyMeta(opt);
      const key = meta.name.toLowerCase();
      if (!meta.name || seen.has(key)) continue;
      seen.add(key);
      list.push(meta);
    }
    return list;
  }, [options]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog
      .filter((m) => !selectedSet.has(m.name.toLowerCase()))
      .filter((m) => (q ? m.name.toLowerCase().includes(q) : true))
      .slice(0, 8);
  }, [catalog, query, selectedSet]);

  useEffect(() => setActive(0), [query, open]);

  function choose(meta: CompetencyMeta) {
    onAdd(meta.name);
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
          {suggestions.map((meta, i) => (
            <li key={meta.name} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(meta)}
                className={[
                  "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                  i === active
                    ? "bg-gradient-to-br from-[#00b0d8]/40 to-[#005baa]/40 text-ink"
                    : "text-ink-soft hover:fill-soft",
                ].join(" ")}
              >
                <span className="min-w-0 flex-1 truncate font-semibold">{meta.name}</span>
                {meta.hasLevels && <CompetencyLevelBoxes levels={meta.levels} compact />}
                <Plus className="h-4 w-4 shrink-0 opacity-70" />
              </button>
            </li>
          ))}
        </ul>
      </PortalDropdown>
    </div>
  );
}
