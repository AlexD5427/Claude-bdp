import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, X, Users } from "lucide-react";
import { Avatar } from "./Avatar";
import { PortalDropdown } from "./PortalDropdown";
import { extractProceso } from "../lib/candidates";
import type { Candidate } from "../types";

interface CandidateSearchSelectProps {
  candidates: Candidate[];
  selectedIds: string[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  max: number;
}

/**
 * A live, type-ahead candidate picker for the comparator. Built for catalogues
 * of *hundreds of thousands* of profiles: instead of scrolling a giant list,
 * the operator types a name or identifier and gets a ranked dropdown (name +
 * identificador) to add columns one by one. Already-selected candidates appear
 * as removable chips and are excluded from the suggestions.
 */
export function CandidateSearchSelect({
  candidates,
  selectedIds,
  onAdd,
  onRemove,
  max,
}: CandidateSearchSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const full = selectedIds.length >= max;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const selected = useMemo(
    () =>
      selectedIds
        .map((id) => candidates.find((c) => c.id === id))
        .filter(Boolean) as Candidate[],
    [selectedIds, candidates],
  );

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = candidates.filter((c) => !selectedSet.has(c.id));
    const matches = q
      ? pool.filter(
          (c) =>
            c.fullName.toLowerCase().includes(q) ||
            (c.identificador ?? "").toLowerCase().includes(q) ||
            (c.cargo_bdp ?? "").toLowerCase().includes(q),
        )
      : pool;
    return matches.slice(0, 12);
  }, [candidates, query, selectedSet]);

  useEffect(() => setActive(0), [query, open]);

  function choose(c: Candidate) {
    if (full) return;
    onAdd(c.id);
    setQuery("");
    setActive(0);
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
    <div className="glass rounded-3xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <Users className="h-5 w-5 text-cyan-400" />
        <h3 className="text-sm font-bold text-ink">Candidatos a comparar</h3>
        <span className="ml-auto text-xs font-semibold text-ink-soft">
          {selectedIds.length}/{max}
        </span>
      </div>

      <div ref={wrapRef} className="relative">
        <div className="glass flex items-center gap-2 rounded-2xl px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-cyan-400/70">
          <Search className="h-4 w-4 shrink-0 text-ink-soft" />
          <input
            value={query}
            disabled={full}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={
              full
                ? `Límite alcanzado (${max}/${max})`
                : "Buscar por nombre o identificador… (datos en vivo)"
            }
            className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none disabled:cursor-not-allowed"
            role="combobox"
            aria-expanded={open}
            aria-controls="candidate-listbox"
            autoComplete="off"
          />
        </div>

        <PortalDropdown
          open={open && !full && suggestions.length > 0}
          anchorRef={wrapRef}
          onClose={() => setOpen(false)}
          maxHeight={320}
        >
          <ul
            id="candidate-listbox"
            role="listbox"
            className="glass-heavy w-full rounded-2xl p-1.5"
          >
            {suggestions.map((c, i) => (
              <li key={c.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(c)}
                  className={[
                    "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors",
                    i === active
                      ? "bg-gradient-to-br from-[#00b0d8]/30 to-[#005baa]/30"
                      : "hover:fill-soft",
                  ].join(" ")}
                >
                  <Avatar name={c.fullName} seed={c.id} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink">
                      {c.fullName}
                    </div>
                    <div className="truncate text-xs text-ink-faint">
                      {c.identificador || "Sin ID"} · Proceso{" "}
                      {extractProceso(c.identificador)}
                    </div>
                  </div>
                  <Plus className="h-4 w-4 shrink-0 text-cyan-400" />
                </button>
              </li>
            ))}
          </ul>
        </PortalDropdown>
        <PortalDropdown
          open={open && !full && query.trim() !== "" && suggestions.length === 0}
          anchorRef={wrapRef}
          onClose={() => setOpen(false)}
        >
          <div className="glass-heavy w-full rounded-2xl px-4 py-3 text-sm text-ink-soft">
            Sin coincidencias para “{query.trim()}”.
          </div>
        </PortalDropdown>
      </div>

      {selected.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {selected.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] py-1 pl-1 pr-2.5 text-sm font-semibold text-white ring-1 ring-white/40 shadow-glow-cyan"
            >
              <Avatar name={c.fullName} seed={c.id} size="sm" />
              <span className="max-w-[12rem] truncate">{c.fullName}</span>
              <button
                type="button"
                aria-label={`Quitar ${c.fullName}`}
                onClick={() => onRemove(c.id)}
                className="grid h-5 w-5 place-items-center rounded-full bg-white/20 transition-colors hover:bg-rose-500/80"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
