import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, GitCompareArrows } from "lucide-react";
import { useTalentData } from "../context/TalentDataContext";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { CandidateProfileCard } from "../components/CandidateProfileCard";
import { CompetencyChip } from "../components/CompetencyChip";
import { Avatar } from "../components/Avatar";
import type { Candidate, CompetencyScore } from "../types";

const MAX_COLUMNS = 5;

/**
 * MÓDULO 2 — El Nuevo Comparador (Talent Audit Grid).
 *
 * A matrix where columns are candidates (rich profile-card headers that stay
 * pinned and collapse into a "lite chip" on scroll) and rows are the union of
 * their competencies. Every intersection is a Liquid Glass competency chip.
 */
export function NuevoComparador() {
  const { candidatos, loading, error, refetch } = useTalentData();

  // Candidates that actually carry competency data make the grid meaningful.
  const withComps = useMemo(
    () => candidatos.filter((c) => c.competenciasList.length > 0),
    [candidatos],
  );

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Default selection: the first few candidates that have competencies.
  useEffect(() => {
    if (selectedIds.length === 0 && withComps.length > 0) {
      setSelectedIds(withComps.slice(0, Math.min(3, withComps.length)).map((c) => c.id));
    }
  }, [withComps, selectedIds.length]);

  // Collapse the big headers into lite chips once the user scrolls down.
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    function onScroll() {
      setCompact(window.scrollY > 260);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_COLUMNS) return prev;
      return [...prev, id];
    });
  }

  const selected = useMemo(
    () => selectedIds.map((id) => withComps.find((c) => c.id === id)).filter(Boolean) as Candidate[],
    [selectedIds, withComps],
  );

  // Union of competency names across the selected candidates (row order).
  const rows = useMemo(() => {
    const names: string[] = [];
    const seen = new Set<string>();
    for (const c of selected) {
      for (const comp of c.competenciasList) {
        const key = comp.name.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          names.push(comp.name);
        }
      }
    }
    return names;
  }, [selected]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (withComps.length === 0) {
    return (
      <EmptyState message="Ningún postulante tiene competencias configuradas todavía." />
    );
  }

  const columns = `minmax(140px, 0.75fr) repeat(${selected.length}, minmax(190px, 1fr))`;

  return (
    <div className="space-y-5">
      {/* Candidate selector */}
      <CandidateSelector
        candidates={withComps}
        selectedIds={selectedIds}
        onToggle={toggle}
      />

      {selected.length === 0 ? (
        <EmptyState
          title="Seleccione candidatos"
          message="Elija al menos un postulante para comenzar la auditoría comparativa."
        />
      ) : (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: columns }}
          role="table"
          aria-label="Cuadrícula de auditoría de talento"
        >
          {/* ---- Header row (sticky) ---- */}
          {/* Corner cell */}
          <div className="sticky left-0 top-24 z-[91] flex items-end" role="columnheader">
            <span className="rounded-2xl bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-300 ring-1 ring-white/10 backdrop-blur-md">
              Competencia
            </span>
          </div>

          {selected.map((c) => (
            <div key={c.id} className="sticky top-24 z-[90]" role="columnheader">
              <AnimatePresence initial={false} mode="wait">
                {compact ? (
                  <motion.div
                    key="lite"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ type: "spring", stiffness: 320, damping: 26 }}
                    className="glass-heavy flex items-center gap-2 rounded-2xl px-3 py-2"
                  >
                    <Avatar name={c.fullName} seed={c.id} size="sm" />
                    <span className="truncate text-sm font-bold text-white drop-shadow-md">
                      {c.fullName}
                    </span>
                  </motion.div>
                ) : (
                  <motion.div
                    key="full"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ type: "spring", stiffness: 320, damping: 26 }}
                  >
                    <CandidateProfileCard candidate={c} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}

          {/* ---- Body rows ---- */}
          {rows.map((name) => (
            <RowFragment key={name} name={name} selected={selected} />
          ))}
        </div>
      )}
    </div>
  );
}

/** One competency row: a sticky label plus a chip (or placeholder) per column. */
function RowFragment({
  name,
  selected,
}: {
  name: string;
  selected: Candidate[];
}) {
  return (
    <>
      <div className="sticky left-0 z-[40] flex items-center" role="rowheader">
        <span
          className="glass truncate rounded-xl px-3 py-2 text-xs font-bold text-white drop-shadow-md"
          title={name}
        >
          {name}
        </span>
      </div>
      {selected.map((c) => {
        const score = findScore(c.competenciasList, name);
        return (
          <div key={c.id + name} role="cell">
            {score ? (
              <CompetencyChip score={score} />
            ) : (
              <div className="flex h-full min-h-[88px] items-center justify-center rounded-2xl border border-dashed border-white/10 text-sm text-slate-500">
                —
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function findScore(
  list: CompetencyScore[],
  name: string,
): CompetencyScore | undefined {
  const key = name.toLowerCase();
  return list.find((s) => s.name.toLowerCase() === key);
}

function CandidateSelector({
  candidates,
  selectedIds,
  onToggle,
}: {
  candidates: Candidate[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const full = selectedIds.length >= MAX_COLUMNS;
  return (
    <div className="glass rounded-3xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <GitCompareArrows className="h-5 w-5 text-cyan-300" />
        <h3 className="text-sm font-bold text-white drop-shadow-md">
          Candidatos a comparar
        </h3>
        <span className="ml-auto text-xs font-semibold text-slate-300">
          {selectedIds.length}/{MAX_COLUMNS}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {candidates.map((c) => {
          const active = selectedIds.includes(c.id);
          const disabled = !active && full;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onToggle(c.id)}
              disabled={disabled}
              className={[
                "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ring-1 transition-all duration-300 ease-spring active:scale-95",
                active
                  ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white ring-white/40 shadow-glow-cyan"
                  : "bg-white/10 text-slate-200 ring-white/15 hover:bg-white/15",
                disabled ? "cursor-not-allowed opacity-40" : "",
              ].join(" ")}
            >
              {active && <Check className="h-3.5 w-3.5" />}
              <span className="max-w-[12rem] truncate">{c.fullName}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
