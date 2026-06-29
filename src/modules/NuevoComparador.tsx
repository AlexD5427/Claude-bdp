import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Printer, FileText, Award, Wrench, BrainCircuit, ShieldCheck, Flag } from "lucide-react";
import { useTalentData } from "../context/TalentDataContext";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { CandidateProfileCard } from "../components/CandidateProfileCard";
import { CandidateSearchSelect } from "../components/CandidateSearchSelect";
import { CompetencyChip } from "../components/CompetencyChip";
import { LevelBadge } from "../components/LevelBadge";
import { Avatar } from "../components/Avatar";
import { parseDecimal, ajusteBand } from "../lib/competency";
import {
  integrityTone,
  proficiencyTone,
  reliabilityTone,
  riskTone,
  type Tone,
} from "../lib/levels";
import { printModule, type PaperSize } from "../lib/print";
import type { Candidate, CompetencyScore, TechnicalKnowledge } from "../types";

const MAX_COLUMNS = 5;
/** Sticky offset that clears the floating dock (px). */
const STICKY_TOP = 84;

type EvalKind = "pct" | "text";
interface EvalRow {
  key: keyof Candidate;
  label: string;
  sub: string;
  kind: EvalKind;
}

const EVAL_ROWS: EvalRow[] = [
  { key: "nota_cap", label: "Nota CAP", sub: "Coeficiente de Adecuación al Puesto", kind: "pct" },
  { key: "perfil_disc", label: "Perfil DISC", sub: "Arquetipo de Comportamiento", kind: "text" },
  { key: "nota_curriculum", label: "Nota Currículum", sub: "Calificación de Hoja de Vida", kind: "pct" },
  { key: "nota_conocimiento", label: "Nota Conocimientos", sub: "Evaluación de Conocimientos Técnicos", kind: "pct" },
  { key: "nota_competencias", label: "Nota Competencias", sub: "Calificación de las competencias a nivel general", kind: "pct" },
];

interface ConfRow {
  key: keyof Candidate;
  label: string;
  sub: string;
  tone: (v?: string) => Tone;
}
const CONF_ROWS: ConfRow[] = [
  { key: "nivel_general_confiabilidad", label: "Confiabilidad e Integridad", sub: "Mide la honestidad y el compromiso con las normas", tone: reliabilityTone },
  { key: "nivel_integridad", label: "Nivel de Integridad", sub: "Firmeza de los principios morales del postulante", tone: integrityTone },
  { key: "riesgo_robo", label: "Nivel de Riesgo de Robo", sub: "Probabilidad de cometer o justificar sustracciones", tone: riskTone },
  { key: "riesgo_mentira", label: "Nivel de Riesgo de Mentira", sub: "Tendencia a exagerar o distorsionar la verdad", tone: riskTone },
];

/**
 * MÓDULO 2 — El Comparador (Talent Audit Grid).
 *
 * A frozen-header comparison where each column is a candidate and the rows are
 * grouped into institutional sections: evaluation results, competencies, the
 * technical detail and a reliability report. Candidates are added through a
 * live type-ahead search, and the whole audit prints to Letter / Legal paper.
 */
export function NuevoComparador() {
  const { candidatos, loading, error, refetch } = useTalentData();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [paper, setPaper] = useState<PaperSize>("Letter");

  // Seed with the first candidates that actually carry competencies.
  useEffect(() => {
    if (selectedIds.length === 0 && candidatos.length > 0) {
      const seed = candidatos
        .filter((c) => c.competenciasList.length > 0)
        .slice(0, 3)
        .map((c) => c.id);
      if (seed.length) setSelectedIds(seed);
    }
  }, [candidatos, selectedIds.length]);

  const selected = useMemo(
    () =>
      selectedIds
        .map((id) => candidatos.find((c) => c.id === id))
        .filter(Boolean) as Candidate[],
    [selectedIds, candidatos],
  );

  // Union of competency names across the selected candidates (row order).
  const competencyRows = useMemo(() => {
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

  // --- frozen-header logic: show the compact bar only once the big headers
  //     have scrolled completely past the dock line (no trembling). ---
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        setCompact(!entry.isIntersecting && entry.boundingClientRect.top < STICKY_TOP);
      },
      { rootMargin: `-${STICKY_TOP}px 0px 0px 0px`, threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [selected.length]);

  function add(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) || prev.length >= MAX_COLUMNS ? prev : [...prev, id],
    );
  }
  function remove(id: string) {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (candidatos.length === 0) {
    return <EmptyState message="Aún no hay postulantes en la base de datos." />;
  }

  const columns = `minmax(190px, 0.85fr) repeat(${selected.length}, minmax(210px, 1fr))`;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 no-print">
        <div className="flex-1" />
        <div className="glass flex items-center gap-1 rounded-full p-1 text-xs font-semibold text-ink-soft">
          {(["Letter", "Legal"] as PaperSize[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPaper(p)}
              className={[
                "rounded-full px-3 py-1.5 transition-all",
                paper === p
                  ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white shadow-glow-cyan"
                  : "hover:fill-soft",
              ].join(" ")}
            >
              {p === "Letter" ? "Carta" : "Oficio"}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={selected.length === 0}
          onClick={() => printModule("Comparativa de Postulantes", paper)}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-5 py-2.5 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all duration-500 ease-spring hover:-translate-y-1 hover:scale-[1.03] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Printer className="h-4 w-4" />
          Imprimir comparativa
        </button>
      </div>

      {/* Live search picker */}
      <div className="no-print">
        <CandidateSearchSelect
          candidates={candidatos}
          selectedIds={selectedIds}
          onAdd={add}
          onRemove={remove}
          max={MAX_COLUMNS}
        />
      </div>

      {selected.length === 0 ? (
        <EmptyState
          title="Seleccione candidatos"
          message="Busque y agregue al menos un postulante para iniciar la auditoría comparativa."
        />
      ) : (
        <div className="relative">
          {/* Compact frozen bar — fades in only when the big headers are gone */}
          <div
            aria-hidden={!compact}
            className={[
              "no-print sticky z-[80] grid gap-3 transition-all duration-300",
              compact
                ? "pointer-events-auto opacity-100"
                : "pointer-events-none -translate-y-2 opacity-0",
            ].join(" ")}
            style={{ top: STICKY_TOP, gridTemplateColumns: columns }}
          >
            <div className="glass-heavy flex items-center rounded-2xl px-3 py-2 text-xs font-bold uppercase tracking-wide text-ink-soft">
              Comparativa
            </div>
            {selected.map((c) => (
              <div
                key={c.id}
                className="glass-heavy flex items-center gap-2 rounded-2xl px-3 py-2"
              >
                <Avatar name={c.fullName} seed={c.id} size="sm" />
                <span className="truncate text-sm font-bold text-ink">
                  {c.fullName}
                </span>
              </div>
            ))}
          </div>

          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: columns }}
            role="table"
            aria-label="Cuadrícula de auditoría de talento"
          >
            {/* ---- Header row (scrolls away naturally) ---- */}
            <div className="flex items-end" role="columnheader">
              <span className="rounded-2xl fill-softer px-3 py-2 text-xs font-bold uppercase tracking-wide text-ink-soft ring-1 ring-[color:var(--hairline)]">
                Postulante
              </span>
            </div>
            {selected.map((c) => (
              <div key={c.id} role="columnheader">
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 26 }}
                >
                  <CandidateProfileCard candidate={c} onRemove={() => remove(c.id)} />
                </motion.div>
              </div>
            ))}

            {/* Sentinel — drives the compact bar toggle. */}
            <div ref={sentinelRef} style={{ gridColumn: "1 / -1", height: 1 }} />

            {/* ===== Resultados de Evaluación ===== */}
            <SectionBand icon={<Award className="h-4 w-4" />} title="Resultados de Evaluación" />
            {EVAL_ROWS.map((row) => (
              <RowFragment key={String(row.key)} label={row.label} sub={row.sub}>
                {selected.map((c) => (
                  <Cell key={c.id + String(row.key)}>
                    {row.kind === "pct" ? (
                      <PctValue value={parseDecimal(c[row.key] as never)} />
                    ) : (
                      <DiscValue value={(c[row.key] as string) || ""} />
                    )}
                  </Cell>
                ))}
              </RowFragment>
            ))}

            {/* ===== Competencias o Habilidades ===== */}
            <SectionBand
              icon={<FileText className="h-4 w-4" />}
              title="Competencias o Habilidades"
              sub="Listado de competencias y habilidades evaluadas"
            />
            {competencyRows.length === 0 ? (
              <div
                style={{ gridColumn: "1 / -1" }}
                className="rounded-2xl border border-dashed border-[color:var(--hairline)] px-4 py-5 text-center text-sm text-ink-faint"
              >
                Los postulantes seleccionados no tienen competencias configuradas.
              </div>
            ) : (
              competencyRows.map((name) => (
                <RowFragment key={name} label={name}>
                  {selected.map((c) => {
                    const score = findScore(c.competenciasList, name);
                    return (
                      <Cell key={c.id + name}>
                        {score ? <CompetencyChip score={score} /> : <Dash />}
                      </Cell>
                    );
                  })}
                </RowFragment>
              ))
            )}

            {/* ===== Conocimientos Técnicos ===== */}
            <SectionBand
              icon={<BrainCircuit className="h-4 w-4" />}
              title="Conocimientos Técnicos"
              sub="Nivel de conocimientos técnicos"
            />
            <RowFragment label="Conocimientos" sub="Detalle técnico declarado">
              {selected.map((c) => (
                <Cell key={c.id + "-con"}>
                  <ItemList items={c.conocimientosList} withDetalle />
                </Cell>
              ))}
            </RowFragment>

            {/* ===== Manejo de Herramientas ===== */}
            <SectionBand
              icon={<Wrench className="h-4 w-4" />}
              title="Manejo de Herramientas u otros"
              sub="Nivel de manejo de herramientas"
            />
            <RowFragment label="Herramientas" sub="Instrumentos y software">
              {selected.map((c) => (
                <Cell key={c.id + "-herr"}>
                  <ItemList items={c.herramientasList} />
                </Cell>
              ))}
            </RowFragment>

            {/* ===== Integridad y Confiabilidad ===== */}
            <SectionBand
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Integridad y Confiabilidad"
              sub="Reporte de veracidad"
            />
            {CONF_ROWS.map((row) => (
              <RowFragment key={String(row.key)} label={row.label} sub={row.sub}>
                {selected.map((c) => {
                  const value = (c[row.key] as string) || "";
                  return (
                    <Cell key={c.id + String(row.key)}>
                      <LevelBadge value={value} tone={row.tone(value)} />
                    </Cell>
                  );
                })}
              </RowFragment>
            ))}

            {/* ===== Observaciones ===== */}
            <SectionBand
              icon={<Flag className="h-4 w-4" />}
              title="Observaciones Recientes"
              sub="Banderas y alertas a considerar en la selección"
            />
            <RowFragment label="Observaciones" sub="Anotaciones de selección">
              {selected.map((c) => (
                <Cell key={c.id + "-obs"}>
                  <Observations text={(c.observaciones as string) || ""} />
                </Cell>
              ))}
            </RowFragment>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

/** Full-width section banner spanning every column. */
function SectionBand({
  icon,
  title,
  sub,
}: {
  icon: React.ReactNode;
  title: string;
  sub?: string;
}) {
  return (
    <div
      style={{ gridColumn: "1 / -1" }}
      className="mt-2 flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-[#004a8f] to-[#005baa] px-4 py-2.5 text-white shadow-glass ring-1 ring-white/20 print-avoid-break"
    >
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/15 ring-1 ring-white/25">
        {icon}
      </span>
      <div>
        <h3 className="text-sm font-black leading-tight drop-shadow-md">{title}</h3>
        {sub && <p className="text-[0.7rem] text-white/75">{sub}</p>}
      </div>
    </div>
  );
}

/** A row: a sticky-left label cell followed by caller-provided value cells. */
function RowFragment({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="sticky left-0 z-[40] flex items-center" role="rowheader">
        <span
          className="glass flex w-full flex-col rounded-xl px-3 py-2 print-avoid-break"
          title={label}
        >
          <span className="truncate text-xs font-bold text-ink">{label}</span>
          {sub && <span className="truncate text-[0.65rem] text-ink-faint">{sub}</span>}
        </span>
      </div>
      {children}
    </>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <div role="cell" className="print-avoid-break">
      {children}
    </div>
  );
}

function Dash() {
  return (
    <div className="flex h-full min-h-[64px] items-center justify-center rounded-2xl border border-dashed border-[color:var(--hairline)] text-sm text-ink-faint">
      —
    </div>
  );
}

/** A score percentage with a band-coloured progress bar. */
function PctValue({ value }: { value: number | null }) {
  if (value === null) return <Dash />;
  const band = ajusteBand(value);
  const color =
    band === "green"
      ? "from-emerald-500 to-green-600"
      : band === "yellow"
        ? "from-amber-400 to-yellow-500"
        : band === "red"
          ? "from-rose-500 to-red-600"
          : "from-slate-400 to-slate-500";
  return (
    <div className="glass rounded-2xl p-3 print-avoid-break">
      <div className="text-2xl font-black leading-none text-ink">{value}%</div>
      <div className="mt-2 h-2 overflow-hidden rounded-full fill-soft">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
          className={`h-full rounded-full bg-gradient-to-r ${color}`}
        />
      </div>
    </div>
  );
}

function DiscValue({ value }: { value: string }) {
  if (!value || value === "N/A") return <Dash />;
  return (
    <div className="glass flex min-h-[64px] items-center rounded-2xl p-3 print-avoid-break">
      <span className="rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-3 py-1 text-xs font-bold text-white ring-1 ring-white/30">
        {value}
      </span>
    </div>
  );
}

function ItemList({
  items,
  withDetalle = false,
}: {
  items: TechnicalKnowledge[];
  withDetalle?: boolean;
}) {
  if (!items.length) return <Dash />;
  return (
    <div className="glass space-y-2 rounded-2xl p-3 print-avoid-break">
      {items.map((it, i) => (
        <div key={i} className="border-b border-[color:var(--hairline)] pb-2 last:border-0 last:pb-0">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-bold text-ink">{it.nombre}</span>
            {it.nivel && (
              <LevelBadge value={it.nivel} tone={proficiencyTone(it.nivel)} />
            )}
          </div>
          {withDetalle && it.detalle && (
            <p className="mt-0.5 text-[0.65rem] italic text-ink-faint">{it.detalle}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function Observations({ text }: { text: string }) {
  const tags = text
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (!tags.length) return <Dash />;
  return (
    <div className="glass flex min-h-[64px] flex-wrap content-start gap-1.5 rounded-2xl p-3 print-avoid-break">
      {tags.map((t, i) => (
        <span
          key={i}
          className="rounded-full fill-softer px-2.5 py-0.5 text-[0.7rem] font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)]"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function findScore(
  list: CompetencyScore[],
  name: string,
): CompetencyScore | undefined {
  const key = name.toLowerCase();
  return list.find((s) => s.name.toLowerCase() === key);
}
