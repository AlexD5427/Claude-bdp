import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Printer,
  FileText,
  Award,
  Wrench,
  BrainCircuit,
  ShieldCheck,
  Flag,
  RectangleHorizontal,
  RectangleVertical,
  Minimize2,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  GitCompareArrows,
  BarChart3,
  SlidersHorizontal,
  Eye,
  RotateCcw,
  Search,
  Trophy,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  Move,
} from "lucide-react";
import { useTalentData } from "../context/TalentDataContext";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { CandidateProfileCard } from "../components/CandidateProfileCard";
import { CandidateSearchSelect } from "../components/CandidateSearchSelect";
import { CompetencyChip } from "../components/CompetencyChip";
import { LevelBadge } from "../components/LevelBadge";
import { Avatar } from "../components/Avatar";
import { RankChip } from "../components/RankBadge";
import { MarqueeText } from "../components/MarqueeText";
import { openProfile } from "../lib/profileViewerStore";
import { DiscInfoButton } from "../components/DiscInfoButton";
import { CompetencyInfoButton } from "../components/CompetencyInfoButton";
import { Toggle } from "../components/form/Controls";
import { SegmentedField } from "../components/form/Fields";
import { ComparatorCharts } from "../components/comparator/ComparatorCharts";
import { discAccent } from "../lib/discAccent";
import { extractDiscCode } from "../lib/disc";
import { parseDecimal, ajusteBand } from "../lib/competency";
import { sortByCap, capScore, upperName } from "../lib/candidateDisplay";
import {
  useConfig,
  setConfig,
  type RankPlacement,
  type ComparatorOrder,
} from "../lib/configStore";
import { setDockOverride } from "../lib/dockOverrideStore";
import {
  useComparator,
  addComparator,
  removeComparator,
  clearComparator,
  setShowAjusteBrecha,
  setDense,
  toggleSectionVisible,
  setSectionCollapsed,
  resetComparatorView,
  COMPARATOR_SECTION_IDS,
  COMPARATOR_SECTION_LABELS,
  type ComparatorSectionId,
} from "../lib/comparatorStore";
import {
  proficiencyTone,
  reliabilityTone,
  riskTone,
  type Tone,
} from "../lib/levels";
import { printModule, type PaperSize, type PaperOrientation } from "../lib/print";
import type { Candidate, CompetencyScore, TechnicalKnowledge } from "../types";

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
  // "Nivel de Integridad" is a labelled risk scale ("Riesgo Bajo/Medio/Alto"),
  // so a lower risk reads as better — same semantics as the other risk rows.
  { key: "nivel_integridad", label: "Integridad", sub: "Riesgo asociado a la integridad del postulante", tone: riskTone },
  { key: "riesgo_robo", label: "Riesgo de robo", sub: "Probabilidad de cometer o justificar sustracciones", tone: riskTone },
  { key: "riesgo_mentira", label: "Riesgo de Mentira", sub: "Tendencia a exagerar o distorsionar la verdad", tone: riskTone },
];

type Tab = "comparativa" | "graficos" | "config";

/**
 * MÓDULO 2 — El Comparador (Talent Audit Grid).
 *
 * The comparison starts **empty** (with an inviting animated Liquid Glass
 * placeholder) and the operator builds it by searching and adding candidates.
 * All of that — the chosen candidates, their order and the per-session view
 * options — is persisted through {@link ../lib/comparatorStore}, so switching
 * modules and coming back restores everything intact.
 *
 * Three tabs organise the module: the frozen-header comparison grid, an
 * interactive chart generator, and a session settings panel where sections and
 * chip details can be shown or hidden.
 */
export function NuevoComparador() {
  const { candidatos, loading, error, refetch } = useTalentData();
  const config = useConfig();
  const cmp = useComparator();
  const MAX_COLUMNS = config.maxComparador;
  const selectedIds = cmp.selectedIds;

  const [paper, setPaper] = useState<PaperSize>(config.defaultPaper);
  const [orientation, setOrientation] = useState<PaperOrientation>(config.defaultOrientation);
  const [tab, setTab] = useState<Tab>("comparativa");

  // The compact frozen bar clears whatever chrome sits at the top. When the
  // dock lives on top we must clear it; otherwise a small offset suffices.
  const stickyTop = config.dockPosition === "top" ? 84 : 12;

  const selected = useMemo(
    () =>
      selectedIds
        .map((id) => candidatos.find((c) => c.id === id))
        .filter(Boolean) as Candidate[],
    [selectedIds, candidatos],
  );

  // Columns are ordered by Nota CAP so the strongest candidate leads the audit.
  // The direction (highest → left by default) is a quick filter in the toolbar
  // and defaults from Configuración; turning the sort off restores the added
  // order the operator chose.
  const ordered = useMemo(
    () => (config.sortByCapDesc ? sortByCap(selected, config.comparatorOrder) : selected),
    [selected, config.sortByCapDesc, config.comparatorOrder],
  );

  // Ranking visibility & placement (profile card / dedicated row / both).
  const rankingOn = config.rankingEnabled;
  const showRankCard = rankingOn && (config.rankPlacement === "tarjeta" || config.rankPlacement === "ambos");
  const showRankRow = rankingOn && (config.rankPlacement === "fila" || config.rankPlacement === "ambos");

  const competencyRows = useMemo(() => {
    const names: string[] = [];
    const seen = new Set<string>();
    for (const c of ordered) {
      for (const comp of c.competenciasList) {
        const key = comp.name.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          names.push(comp.name);
        }
      }
    }
    return names;
  }, [ordered]);

  // --- frozen-header logic: reveal the compact bar once the big header cards
  //     scroll past the top chrome (no trembling). ---
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || tab !== "comparativa") {
      setStuck(false);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        setStuck(!entry.isIntersecting && entry.boundingClientRect.top < stickyTop);
      },
      { rootMargin: `-${stickyTop}px 0px 0px 0px`, threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [selected.length, tab, stickyTop]);

  // When the sticky candidate strip appears (the operator has scrolled into the
  // grid) and the dock lives on top/bottom, ask it to glide to the left edge so
  // it clears the top for the strip. We also nudge the grid right so the moved
  // dock never sits over the frozen label column. Everything reverts on the way
  // back up, on tab change and on unmount.
  const moveDock =
    stuck &&
    tab === "comparativa" &&
    (config.dockPosition === "top" || config.dockPosition === "bottom");
  useEffect(() => {
    setDockOverride(moveDock ? "left" : null);
    return () => setDockOverride(null);
  }, [moveDock]);

  // --- horizontal navigation + column-aligned sticky strip ---
  // The comparison scrolls sideways when there are many candidates. We mirror
  // the table's horizontal scroll onto the compact strip (so its chips stay
  // perfectly under their columns) and expose an on-screen slider + arrows for
  // a smooth, mouse-friendly way to pan across the columns.
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const stripScrollRef = useRef<HTMLDivElement>(null);
  const stripGridRef = useRef<HTMLDivElement>(null);
  const [scrollNav, setScrollNav] = useState({ left: 0, max: 0 });

  const syncStrip = useCallback(() => {
    const sc = scrollRef.current;
    if (sc) {
      const max = Math.max(0, sc.scrollWidth - sc.clientWidth);
      setScrollNav((prev) =>
        prev.left === sc.scrollLeft && prev.max === max
          ? prev
          : { left: sc.scrollLeft, max },
      );
      if (stripScrollRef.current) stripScrollRef.current.scrollLeft = sc.scrollLeft;
    }
    if (gridRef.current && stripGridRef.current) {
      // Match the strip's inner grid to the table's exact rendered width so the
      // fractional columns resolve identically and every chip lines up.
      stripGridRef.current.style.width = `${gridRef.current.offsetWidth}px`;
    }
  }, []);

  useEffect(() => {
    if (tab !== "comparativa") return;
    syncStrip();
    const sc = scrollRef.current;
    const grid = gridRef.current;
    const ro = new ResizeObserver(() => syncStrip());
    if (grid) ro.observe(grid);
    if (sc) ro.observe(sc);
    window.addEventListener("resize", syncStrip);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncStrip);
    };
  }, [tab, selected.length, cmp.dense, syncStrip]);

  const panBy = useCallback((dir: 1 | -1) => {
    const sc = scrollRef.current;
    if (!sc) return;
    sc.scrollBy({ left: dir * Math.max(260, sc.clientWidth * 0.7), behavior: "smooth" });
  }, []);

  function add(id: string) {
    addComparator(id, MAX_COLUMNS);
  }
  function remove(id: string) {
    removeComparator(id);
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (candidatos.length === 0) {
    return <EmptyState message="Aún no hay postulantes en la base de datos." />;
  }

  const dense = cmp.dense;
  // Candidate columns are a touch wider by default so the personal-data chip has
  // more breathing room (names wrap by word, ranking badge fits comfortably).
  const columns = dense
    ? `minmax(130px, 0.6fr) repeat(${ordered.length}, minmax(150px, 1fr))`
    : `minmax(184px, 0.8fr) repeat(${ordered.length}, minmax(238px, 1fr))`;
  const printColumns = `minmax(88px, 0.5fr) repeat(${ordered.length}, minmax(0, 1fr))`;

  return (
    <div className={`cmp-shifted space-y-4 ${moveDock ? "is-shifted" : ""}`}>
      <TabBar tab={tab} onTab={setTab} count={selected.length} />

      {/* Shared candidate picker for both the grid and the charts. */}
      {tab !== "config" && (
        <div className="no-print">
          <CandidateSearchSelect
            candidates={candidatos}
            selectedIds={selectedIds}
            onAdd={add}
            onRemove={remove}
            max={MAX_COLUMNS}
          />
        </div>
      )}

      {tab === "comparativa" && (
        <>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5 no-print">
            <button
              type="button"
              onClick={() => setDense(!dense)}
              aria-pressed={dense}
              title="Compactar la información para ajustar todos los candidatos"
              className={[
                "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-bold ring-1 transition-all active:scale-95",
                dense
                  ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white ring-white/30 shadow-glow-cyan"
                  : "fill-softer text-ink-soft ring-[color:var(--hairline)] hover:fill-soft",
              ].join(" ")}
            >
              <Minimize2 className="h-4 w-4" />
              Compacto
            </button>

            {/* Order filter — highest CAP left (desc) by default. */}
            <button
              type="button"
              onClick={() =>
                setConfig({ comparatorOrder: config.comparatorOrder === "desc" ? "asc" : "desc" })
              }
              disabled={!config.sortByCapDesc}
              title={
                config.sortByCapDesc
                  ? config.comparatorOrder === "desc"
                    ? "Orden: mayor CAP a la izquierda (clic para invertir)"
                    : "Orden: menor CAP a la izquierda (clic para invertir)"
                  : "Active «Ordenar por Nota CAP» en Configuración para ordenar"
              }
              className={[
                "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-bold ring-1 transition-all active:scale-95",
                config.sortByCapDesc
                  ? "fill-softer text-ink-soft ring-[color:var(--hairline)] hover:fill-soft"
                  : "fill-softer text-ink-faint ring-[color:var(--hairline)] opacity-60",
              ].join(" ")}
            >
              {config.comparatorOrder === "desc" ? (
                <ArrowDownWideNarrow className="h-4 w-4" />
              ) : (
                <ArrowUpWideNarrow className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">
                {config.comparatorOrder === "desc" ? "Mayor → menor" : "Menor → mayor"}
              </span>
            </button>

            <div className="flex-1" />

            <div className="glass flex items-center gap-1 rounded-full p-1 text-xs font-semibold text-ink-soft">
              <button
                type="button"
                onClick={() => setOrientation("portrait")}
                title="Vertical"
                className={[
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-all",
                  orientation === "portrait"
                    ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white shadow-glow-cyan"
                    : "hover:fill-soft",
                ].join(" ")}
              >
                <RectangleVertical className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Vertical</span>
              </button>
              <button
                type="button"
                onClick={() => setOrientation("landscape")}
                title="Horizontal"
                className={[
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-all",
                  orientation === "landscape"
                    ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white shadow-glow-cyan"
                    : "hover:fill-soft",
                ].join(" ")}
              >
                <RectangleHorizontal className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Horizontal</span>
              </button>
            </div>

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
              onClick={() =>
                printModule("Comparativa de Postulantes", paper, orientation, {
                  scope: "comparador",
                })
              }
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-5 py-2.5 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all duration-500 ease-spring hover:-translate-y-1 hover:scale-[1.03] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              <span className="hidden sm:inline">Imprimir comparativa</span>
              <span className="sm:hidden">Imprimir</span>
            </button>
          </div>

          {selected.length === 0 ? (
            <EmptyComparator />
          ) : (
            <div className={`relative ${dense ? "cmp-dense" : ""}`}>
              {/* Compact frozen strip — fades in once the big headers are gone.
                  It shares the table's grid template and mirrors its horizontal
                  scroll, so every chip stays exactly above its column. */}
              <div
                aria-hidden={!stuck}
                style={{ top: stickyTop }}
                className={[
                  "no-print sticky z-[80] transition-all duration-300 ease-spring",
                  stuck
                    ? "pointer-events-auto translate-y-0 opacity-100"
                    : "pointer-events-none -translate-y-3 opacity-0",
                ].join(" ")}
              >
                <div
                  ref={stripScrollRef}
                  className="cmp-strip-scroll overflow-x-hidden px-1"
                >
                  <div
                    ref={stripGridRef}
                    className={dense ? "grid gap-1.5" : "grid gap-3"}
                    style={{ gridTemplateColumns: columns } as React.CSSProperties}
                  >
                    <div className="cmp-freeze sticky left-0 z-[2] rounded-2xl">
                      <span className="glass-heavy block truncate rounded-2xl px-3 py-2 text-xs font-bold uppercase tracking-wide text-ink-soft">
                        Comparativa
                      </span>
                    </div>
                    <AnimatePresence initial={false} mode="popLayout">
                      {ordered.map((c, idx) => (
                        <StripChip
                          key={c.id}
                          candidate={c}
                          rank={idx + 1}
                          showRank={rankingOn}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              {/* On-screen horizontal navigator — a fluid slider + arrows to pan
                  across the columns when the comparison is wider than the view. */}
              {scrollNav.max > 4 && (
                <div className="no-print mb-1 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => panBy(-1)}
                    disabled={scrollNav.left <= 1}
                    aria-label="Desplazar a la izquierda"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full fill-softer text-ink-soft ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-90 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={Math.round(scrollNav.max)}
                    value={Math.round(scrollNav.left)}
                    onChange={(e) => {
                      const sc = scrollRef.current;
                      if (sc) sc.scrollLeft = Number(e.target.value);
                    }}
                    aria-label="Desplazar la tabla comparativa horizontalmente"
                    className="cfg-range flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => panBy(1)}
                    disabled={scrollNav.left >= scrollNav.max - 1}
                    aria-label="Desplazar a la derecha"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full fill-softer text-ink-soft ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-90 disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Horizontal scroll wrapper — the comparison stays usable on
                  phones and tablets, and the label column freezes on the left. */}
              <div
                ref={scrollRef}
                onScroll={syncStrip}
                className="cmp-scroll -mx-1 overflow-x-auto px-1 pb-2"
              >
                <div
                  ref={gridRef}
                  data-cols={ordered.length}
                  className={dense ? "cmp-grid grid gap-1.5" : "cmp-grid grid gap-3"}
                  style={
                    { gridTemplateColumns: columns, "--print-cols": printColumns } as React.CSSProperties
                  }
                  role="table"
                  aria-label="Cuadrícula de auditoría de talento"
                >
                  {/* ---- Header row ---- */}
                  <div className="flex items-end" role="columnheader">
                    <span className="rounded-2xl fill-softer px-3 py-2 text-xs font-bold uppercase tracking-wide text-ink-soft ring-1 ring-[color:var(--hairline)]">
                      Postulante
                    </span>
                  </div>
                  {ordered.map((c, idx) => (
                    <div key={c.id} role="columnheader">
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 26 }}
                      >
                        <CandidateProfileCard
                          candidate={c}
                          onRemove={() => remove(c.id)}
                          rank={idx + 1}
                          showRankBadge={showRankCard}
                        />
                      </motion.div>
                    </div>
                  ))}

                  <div ref={sentinelRef} style={{ gridColumn: "1 / -1", height: 1 }} />

                  {/* ===== Ranking row (dedicated placement) ===== */}
                  {showRankRow && (
                    <RowFragment label="Ranking" sub="Posición por Nota CAP">
                      {ordered.map((c, idx) => (
                        <Cell key={c.id + "-rank"}>
                          <div className="flex min-h-[64px] items-center justify-center rounded-2xl fill-softer ring-1 ring-[color:var(--hairline)]">
                            <RankChip rank={idx + 1} cap={capScore(c)} />
                          </div>
                        </Cell>
                      ))}
                    </RowFragment>
                  )}

                  {/* ===== Resultados de Evaluación ===== */}
                  <Section id="resultados" cmp={cmp} icon={<Award className="h-4 w-4" />}>
                    {EVAL_ROWS.map((row) => (
                      <RowFragment key={String(row.key)} label={row.label} sub={row.sub}>
                        {ordered.map((c) => (
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
                  </Section>

                  {/* ===== Competencias o Habilidades ===== */}
                  <Section
                    id="competencias"
                    cmp={cmp}
                    icon={<FileText className="h-4 w-4" />}
                    sub="Listado de competencias y habilidades evaluadas"
                  >
                    {competencyRows.length === 0 ? (
                      <div
                        style={{ gridColumn: "1 / -1" }}
                        className="rounded-2xl border border-dashed border-[color:var(--hairline)] px-4 py-5 text-center text-sm text-ink-faint"
                      >
                        Los postulantes seleccionados no tienen competencias configuradas.
                      </div>
                    ) : (
                      competencyRows.map((name) => (
                        <RowFragment
                          key={name}
                          label={name}
                          info={
                            <span className="no-print">
                              <CompetencyInfoButton name={name} size="sm" />
                            </span>
                          }
                        >
                          {ordered.map((c) => {
                            const score = findScore(c.competenciasList, name);
                            return (
                              <Cell key={c.id + name}>
                                {score ? (
                                  <CompetencyChip score={score} showAjusteBrecha={cmp.showAjusteBrecha} />
                                ) : (
                                  <Dash />
                                )}
                              </Cell>
                            );
                          })}
                        </RowFragment>
                      ))
                    )}
                  </Section>

                  {/* ===== Conocimientos Técnicos ===== */}
                  <Section
                    id="conocimientos"
                    cmp={cmp}
                    icon={<BrainCircuit className="h-4 w-4" />}
                    sub="Nivel de conocimientos técnicos"
                  >
                    <RowFragment label="Conocimientos" sub="Detalle técnico declarado">
                      {ordered.map((c) => (
                        <Cell key={c.id + "-con"}>
                          <ItemList items={c.conocimientosList} withDetalle />
                        </Cell>
                      ))}
                    </RowFragment>
                  </Section>

                  {/* ===== Manejo de Herramientas ===== */}
                  <Section
                    id="herramientas"
                    cmp={cmp}
                    icon={<Wrench className="h-4 w-4" />}
                    sub="Nivel de manejo de herramientas"
                  >
                    <RowFragment label="Herramientas" sub="Instrumentos y software">
                      {ordered.map((c) => (
                        <Cell key={c.id + "-herr"}>
                          <ItemList items={c.herramientasList} />
                        </Cell>
                      ))}
                    </RowFragment>
                  </Section>

                  {/* ===== Integridad y Confiabilidad ===== */}
                  <Section
                    id="integridad"
                    cmp={cmp}
                    icon={<ShieldCheck className="h-4 w-4" />}
                    sub="Reporte de veracidad"
                  >
                    {CONF_ROWS.map((row) => (
                      <RowFragment key={String(row.key)} label={row.label} sub={row.sub}>
                        {ordered.map((c) => {
                          const value = (c[row.key] as string) || "";
                          return (
                            <Cell key={c.id + String(row.key)}>
                              <LevelBadge value={value} tone={row.tone(value)} />
                            </Cell>
                          );
                        })}
                      </RowFragment>
                    ))}
                  </Section>

                  {/* ===== Observaciones ===== */}
                  <Section
                    id="observaciones"
                    cmp={cmp}
                    icon={<Flag className="h-4 w-4" />}
                    sub="Banderas y alertas a considerar en la selección"
                  >
                    <RowFragment label="Observaciones" sub="Anotaciones de selección">
                      {ordered.map((c) => (
                        <Cell key={c.id + "-obs"}>
                          <Observations text={(c.observaciones as string) || ""} />
                        </Cell>
                      ))}
                    </RowFragment>
                  </Section>
                </div>
              </div>
            </div>
          )}

          {/* Fixed navigation helper — appears once the comparison grows past a
              handful of candidates, so panning across (and down) the audit stays
              effortless. Toggleable from the comparator's Configuración tab. */}
          {config.comparatorNavHelper && selected.length > 4 && (
            <ComparatorNavHelper
              onPan={panBy}
              canLeft={scrollNav.left > 1}
              canRight={scrollNav.left < scrollNav.max - 1}
              horizontal={scrollNav.max > 4}
            />
          )}
        </>
      )}

      {tab === "graficos" &&
        (selected.length === 0 ? (
          <EmptyComparator charts />
        ) : (
          <ComparatorCharts candidates={ordered} />
        ))}

      {tab === "config" && <ComparatorSettings cmp={cmp} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Compact frozen strip chip                                           */
/* ------------------------------------------------------------------ */

/**
 * A single chip in the compact frozen strip. It lives inside a grid cell that
 * matches its column, so it can fill the column width. The name font shrinks
 * with length and wraps to two lines, so long names are shown in full instead
 * of being clipped.
 */
function StripChip({
  candidate,
  rank,
  showRank,
}: {
  candidate: Candidate;
  rank: number;
  showRank: boolean;
}) {
  const upper = upperName(candidate.fullName);
  const len = upper.length;
  const nameSize =
    len > 30 ? "text-[0.6rem]" : len > 20 ? "text-[0.7rem]" : "text-sm";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -12, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 340, damping: 26 }}
      className="glass-heavy flex min-w-0 items-center gap-2 rounded-2xl px-2.5 py-1.5"
    >
      <button
        type="button"
        onClick={() => openProfile(candidate.id)}
        title={`Ver perfil de ${candidate.fullName}`}
        className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none"
      >
        <Avatar name={candidate.fullName} seed={candidate.id} size="sm" />
        <span
          className={`wrap-words min-w-0 flex-1 font-bold uppercase leading-tight text-ink line-clamp-3 ${nameSize}`}
          title={candidate.fullName}
        >
          {upper}
        </span>
      </button>
      {showRank && <RankChip rank={rank} cap={capScore(candidate)} className="shrink-0" />}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Fixed navigation helper (d-pad)                                     */
/* ------------------------------------------------------------------ */

/**
 * A discreet, fixed d-pad that pans the audit grid horizontally and scrolls the
 * page vertically. It floats at the right edge, out of the way, and only mounts
 * when the comparison has enough candidates to warrant it. Buttons for the axis
 * that can't move any further dim out.
 */
function ComparatorNavHelper({
  onPan,
  canLeft,
  canRight,
  horizontal,
}: {
  onPan: (dir: 1 | -1) => void;
  canLeft: boolean;
  canRight: boolean;
  horizontal: boolean;
}) {
  const scrollV = (dir: 1 | -1) =>
    window.scrollBy({ top: dir * window.innerHeight * 0.8, behavior: "smooth" });

  const cell =
    "grid h-9 w-9 place-items-center rounded-xl fill-softer text-ink-soft ring-1 ring-[color:var(--hairline)] transition-all duration-300 hover:fill-soft hover:text-cyan-400 active:scale-90 disabled:opacity-30 disabled:hover:text-ink-soft";

  return (
    <motion.div
      initial={{ opacity: 0, x: 24, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className="no-print fixed right-3 top-1/2 z-[85] hidden -translate-y-1/2 sm:block"
    >
      <div className="glass-heavy grid grid-cols-3 gap-1 rounded-2xl p-1.5 shadow-glass ring-1 ring-white/20">
        <span className="col-start-2 grid place-items-center">
          <button type="button" aria-label="Subir" onClick={() => scrollV(-1)} className={cell}>
            <ChevronUp className="h-4 w-4" />
          </button>
        </span>
        <button
          type="button"
          aria-label="Desplazar a la izquierda"
          onClick={() => onPan(-1)}
          disabled={!horizontal || !canLeft}
          className={`col-start-1 row-start-2 ${cell}`}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="col-start-2 row-start-2 grid place-items-center text-ink-faint">
          <Move className="h-3.5 w-3.5" />
        </span>
        <button
          type="button"
          aria-label="Desplazar a la derecha"
          onClick={() => onPan(1)}
          disabled={!horizontal || !canRight}
          className={`col-start-3 row-start-2 ${cell}`}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="col-start-2 row-start-3 grid place-items-center">
          <button type="button" aria-label="Bajar" onClick={() => scrollV(1)} className={cell}>
            <ChevronDown className="h-4 w-4" />
          </button>
        </span>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

function TabBar({
  tab,
  onTab,
  count,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  count: number;
}) {
  const tabs: { id: Tab; label: string; icon: typeof GitCompareArrows }[] = [
    { id: "comparativa", label: "Comparativa", icon: GitCompareArrows },
    { id: "graficos", label: "Gráficos", icon: BarChart3 },
    { id: "config", label: "Configuración", icon: SlidersHorizontal },
  ];
  return (
    <div className="no-print flex items-center gap-2 overflow-x-auto">
      <div className="glass flex items-center gap-1 rounded-full p-1">
        {tabs.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onTab(id)}
              className="relative inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition-colors sm:text-sm"
            >
              {active && (
                <motion.span
                  layoutId="cmp-tab-pill"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  className="absolute inset-0 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] shadow-glow-cyan"
                />
              )}
              <span className={`relative ${active ? "text-white" : "text-ink-soft"}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className={`relative ${active ? "text-white" : "text-ink-soft"}`}>{label}</span>
            </button>
          );
        })}
      </div>
      {count > 0 && (
        <span className="shrink-0 rounded-full fill-softer px-3 py-1.5 text-xs font-bold text-ink-soft ring-1 ring-[color:var(--hairline)]">
          {count} en comparación
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Animated empty state                                                */
/* ------------------------------------------------------------------ */

/** A lively Liquid Glass placeholder shown when no candidate has been added. */
function EmptyComparator({ charts = false }: { charts?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 24 }}
      className="glass glow relative overflow-hidden rounded-3xl px-6 py-14 text-center sm:py-20"
    >
      {/* Floating orbs */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -left-10 top-6 h-40 w-40 rounded-full bg-[#00b0d8]/20 blur-3xl"
        animate={{ x: [0, 30, 0], y: [0, 20, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -right-10 bottom-6 h-48 w-48 rounded-full bg-[#005baa]/20 blur-3xl"
        animate={{ x: [0, -26, 0], y: [0, -18, 0] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative mx-auto grid h-20 w-20 place-items-center">
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full bg-cyan-400/25"
          animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeOut" }}
        />
        <motion.div
          className="relative grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white shadow-glass ring-1 ring-white/30"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
        >
          {charts ? <BarChart3 className="h-8 w-8" /> : <GitCompareArrows className="h-8 w-8" />}
        </motion.div>
      </div>

      <h3 className="relative mt-6 text-lg font-black tracking-tight text-ink sm:text-xl">
        {charts ? "Aún no hay datos para graficar" : "Comienza tu comparación"}
      </h3>
      <p className="relative mx-auto mt-2 max-w-md text-sm text-ink-soft">
        {charts
          ? "Agrega postulantes con el buscador de arriba y vuelve a esta pestaña para crear gráficos y tablas interactivas."
          : "El comparador inicia vacío. Usa el buscador de arriba para agregar los postulantes que quieras auditar lado a lado."}
      </p>

      <motion.div
        className="relative mx-auto mt-6 inline-flex items-center gap-2 rounded-full fill-softer px-4 py-2 text-xs font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)]"
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <Search className="h-4 w-4 text-cyan-400" />
        Busca por nombre o identificador
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Session settings panel                                              */
/* ------------------------------------------------------------------ */

function ComparatorSettings({ cmp }: { cmp: ReturnType<typeof useComparator> }) {
  const config = useConfig();
  const RANK_LABELS: Record<RankPlacement, string> = {
    tarjeta: "Tarjeta",
    fila: "Fila",
    ambos: "Ambos",
  };
  const labelToRank: Record<string, RankPlacement> = {
    Tarjeta: "tarjeta",
    Fila: "fila",
    Ambos: "ambos",
  };
  const orderLabel = (o: ComparatorOrder) => (o === "desc" ? "Mayor → menor" : "Menor → mayor");
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 26 }}
      className="space-y-4"
    >
      {/* Ranking & navigation */}
      <div className="glass glow rounded-3xl p-5">
        <header className="mb-4 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl fill-softer text-cyan-400 ring-1 ring-[color:var(--hairline)]">
            <Trophy className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-black tracking-tight text-ink">Ranking y navegación</h3>
            <p className="text-xs text-ink-soft">
              Chapa de lugar (dorada al 1.º, plateada al resto) y ayudas de desplazamiento.
            </p>
          </div>
        </header>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Toggle
            title="Ordenar por Nota CAP"
            subtitle="Ordena las columnas por el puntaje CAP."
            checked={config.sortByCapDesc}
            onChange={(v) => setConfig({ sortByCapDesc: v })}
          />
          <Toggle
            title="Mostrar ranking"
            subtitle="Muestra la chapa de posición en el comparador."
            checked={config.rankingEnabled}
            onChange={(v) => setConfig({ rankingEnabled: v })}
          />
          <Toggle
            title="Ayudante de navegación"
            subtitle="D-pad flotante al comparar muchos candidatos."
            icon={<Move className="h-4 w-4" />}
            checked={config.comparatorNavHelper}
            onChange={(v) => setConfig({ comparatorNavHelper: v })}
          />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SegmentedField
            label="Ubicación del ranking"
            hint="Dónde aparece la chapa de lugar"
            value={RANK_LABELS[config.rankPlacement]}
            onChange={(v) => setConfig({ rankPlacement: labelToRank[v] ?? "ambos" })}
            options={["Tarjeta", "Fila", "Ambos"]}
          />
          <SegmentedField
            label="Orden por Nota CAP"
            hint="Dirección por defecto de las columnas"
            value={orderLabel(config.comparatorOrder)}
            onChange={(v) =>
              setConfig({ comparatorOrder: v === "Menor → mayor" ? "asc" : "desc" })
            }
            options={["Mayor → menor", "Menor → mayor"]}
          />
        </div>
      </div>

      <div className="glass glow rounded-3xl p-5">
        <header className="mb-4 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl fill-softer text-cyan-400 ring-1 ring-[color:var(--hairline)]">
            <Eye className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-black tracking-tight text-ink">Datos de la tabla comparativa</h3>
            <p className="text-xs text-ink-soft">Estos ajustes duran solo la sesión actual.</p>
          </div>
        </header>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Toggle
            title="Mostrar «Ajuste y Brecha»"
            subtitle="Fila inferior de cada chip de competencia."
            checked={cmp.showAjusteBrecha}
            onChange={setShowAjusteBrecha}
          />
          <Toggle
            title="Modo compacto"
            subtitle="Densifica la cuadrícula para ver más candidatos."
            icon={<Minimize2 className="h-4 w-4" />}
            checked={cmp.dense}
            onChange={setDense}
          />
        </div>
      </div>

      <div className="glass glow rounded-3xl p-5">
        <header className="mb-4 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl fill-softer text-cyan-400 ring-1 ring-[color:var(--hairline)]">
            <SlidersHorizontal className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-black tracking-tight text-ink">Secciones visibles</h3>
            <p className="text-xs text-ink-soft">
              Oculta secciones enteras o contráelas desde su encabezado en la comparativa.
            </p>
          </div>
        </header>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {COMPARATOR_SECTION_IDS.map((id) => (
            <Toggle
              key={id}
              title={COMPARATOR_SECTION_LABELS[id]}
              checked={cmp.sectionVisible[id]}
              onChange={(v) => toggleSectionVisible(id, v)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={resetComparatorView}
          className="inline-flex items-center gap-2 rounded-full fill-softer px-4 py-2.5 text-sm font-bold text-ink ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-95"
        >
          <RotateCcw className="h-4 w-4" />
          Restablecer vista
        </button>
        <button
          type="button"
          disabled={cmp.selectedIds.length === 0}
          onClick={clearComparator}
          className="inline-flex items-center gap-2 rounded-full bg-rose-500/15 px-4 py-2.5 text-sm font-bold text-rose-500 ring-1 ring-rose-400/40 transition-all hover:bg-rose-500/25 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" />
          Vaciar comparación
        </button>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

/**
 * A collapsible report section. Renders its full-width band (with a collapse
 * chevron on the right) and, unless folded, its rows. Hidden entirely when the
 * section is toggled off in the settings panel.
 */
function Section({
  id,
  cmp,
  icon,
  sub,
  children,
}: {
  id: ComparatorSectionId;
  cmp: ReturnType<typeof useComparator>;
  icon: React.ReactNode;
  sub?: string;
  children: React.ReactNode;
}) {
  if (!cmp.sectionVisible[id]) return null;
  const collapsed = cmp.sectionCollapsed[id];
  return (
    <>
      <SectionBand
        icon={icon}
        title={COMPARATOR_SECTION_LABELS[id]}
        sub={sub}
        collapsed={collapsed}
        onToggle={() => setSectionCollapsed(id, !collapsed)}
      />
      {!collapsed && children}
    </>
  );
}

/** Full-width section banner spanning every column, with a collapse toggle. */
function SectionBand({
  icon,
  title,
  sub,
  collapsed,
  onToggle,
}: {
  icon: React.ReactNode;
  title: string;
  sub?: string;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  return (
    <motion.div
      style={{ gridColumn: "1 / -1" }}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className="liquid-streak mt-2 flex items-center gap-2.5 overflow-hidden rounded-2xl bg-gradient-to-r from-[#004a8f] to-[#005baa] px-4 py-2.5 text-white shadow-glass ring-1 ring-white/20 print-avoid-break"
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/15 ring-1 ring-white/25">
        {icon}
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-black leading-tight drop-shadow-md">{title}</h3>
        {sub && <p className="truncate text-[0.7rem] text-white/75">{sub}</p>}
      </div>
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Desplegar ${title}` : `Contraer ${title}`}
          title={collapsed ? "Desplegar sección" : "Contraer sección"}
          className="no-print ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/30 transition-all duration-300 hover:bg-white/25 active:scale-90"
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-300 ${collapsed ? "-rotate-90" : ""}`}
          />
        </button>
      )}
    </motion.div>
  );
}

/** A row: a sticky-left label cell followed by caller-provided value cells. */
function RowFragment({
  label,
  sub,
  info,
  children,
}: {
  label: string;
  sub?: string;
  /** Optional trailing element (e.g. a competency "?" info button). */
  info?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="cmp-freeze sticky left-0 z-[40] flex items-center rounded-xl" role="rowheader">
        <span
          className="glass flex w-full items-center gap-1.5 rounded-xl px-3 py-2 print-avoid-break"
          title={label}
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <MarqueeText text={label} className="text-xs font-bold text-ink" />
            {sub && <span className="truncate text-[0.65rem] text-ink-faint">{sub}</span>}
          </span>
          {info}
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
  const accent = discAccent(extractDiscCode(value));
  return (
    <div className="glass flex min-h-[64px] items-center gap-1.5 rounded-2xl p-3 print-avoid-break">
      <span
        className={`rounded-full px-3 py-1 text-xs font-bold ring-1 shadow-glass bg-gradient-to-br ${accent.gradient} text-white ring-white/30`}
      >
        {value}
      </span>
      <span className="no-print">
        <DiscInfoButton perfil={value} size="sm" />
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
