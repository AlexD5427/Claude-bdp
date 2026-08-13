import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  Rows3,
  Scale,
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
import { LongCell } from "../components/comparator/LongTextCell";
import { openProfile } from "../lib/profileViewerStore";
import { DiscInfoButton } from "../components/DiscInfoButton";
import { CompetencyInfoButton } from "../components/CompetencyInfoButton";
import { Toggle } from "../components/form/Controls";
import { SegmentedField } from "../components/form/Fields";
import { ComparatorCharts } from "../components/comparator/ComparatorCharts";
import { discAccent } from "../lib/discAccent";
import { extractDiscCode } from "../lib/disc";
import { parseDecimal, ajusteBand } from "../lib/competency";
import { upperName } from "../lib/candidateDisplay";
import {
  orderForDisplay,
  rankByMerit,
  tiebreakExplanation,
  type RankedCandidate,
} from "../lib/comparatorRanking";
import {
  COMPARATOR_ROWS,
  competencyRowId,
  rowsOfSection,
  type ComparatorRowDef,
} from "../lib/comparatorRows";
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
  setRowHidden,
  showAllRows,
  resetComparatorView,
  COMPARATOR_SECTION_IDS,
  COMPARATOR_SECTION_LABELS,
  type ComparatorSectionId,
} from "../lib/comparatorStore";
import { proficiencyTone } from "../lib/levels";
import { printModule, type PaperSize, type PaperOrientation } from "../lib/print";
import type { Candidate, CompetencyScore } from "../types";
import "../components/comparator/comparator-motion.css";

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
 * interactive chart generator, and a session settings panel where sections,
 * individual rows and chip details can be shown or hidden.
 *
 * Dos piezas sostienen la comparativa y viven fuera de este archivo:
 *   · {@link ../lib/comparatorRanking} decide el puesto de cada postulante
 *     (mayor Nota CAP y, sólo al empatar, el Índice de Desempate ponderado).
 *   · {@link ../lib/comparatorRows} es el catálogo de filas: de él se dibuja la
 *     cuadrícula y de él se alimentan los interruptores de Configuración.
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

  // El puesto se calcula SIEMPRE por mérito (Nota CAP y, al empatar, el Índice
  // de Desempate). El interruptor de orden sólo decide cómo se dibujan las
  // columnas: invertir la vista no convierte al último en el primero.
  const ranked = useMemo(() => rankByMerit(selected), [selected]);
  const ordered = useMemo(() => {
    if (config.sortByCapDesc) return orderForDisplay(ranked, config.comparatorOrder);
    // Sin ordenamiento por CAP se respeta el orden en que se agregaron.
    const byId = new Map(ranked.map((r) => [r.candidate.id, r]));
    return selected.map((c) => byId.get(c.id)!).filter(Boolean);
  }, [ranked, selected, config.sortByCapDesc, config.comparatorOrder]);

  // Ranking visibility & placement (profile card / dedicated row / both).
  const rankingOn = config.rankingEnabled;
  const showRankCard = rankingOn && (config.rankPlacement === "tarjeta" || config.rankPlacement === "ambos");
  const showRankRow =
    rankingOn &&
    (config.rankPlacement === "fila" || config.rankPlacement === "ambos") &&
    !cmp.rowHidden.ranking;

  const competencyRows = useMemo(() => {
    const names: string[] = [];
    const seen = new Set<string>();
    for (const entry of ordered) {
      for (const comp of entry.candidate.competenciasList) {
        const key = comp.name.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          names.push(comp.name);
        }
      }
    }
    return names;
  }, [ordered]);

  const visibleRows = useCallback(
    (section: ComparatorSectionId) =>
      rowsOfSection(section).filter((row) => !cmp.rowHidden[row.id]),
    [cmp.rowHidden],
  );

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
  // La columna de rótulos tiene un **techo fijo**, no `0.8fr`. Con una fracción
  // se repartía el sobrante y, al comparar a una o dos personas, el rótulo
  // «Postulante» crecía hasta ~600 px y empujaba las tarjetas al borde derecho
  // de la pantalla, con medio informe en blanco. Con un máximo en píxeles la
  // columna se ve igual con dos candidatos que con diez.
  const columns = dense
    ? `minmax(130px, 168px) repeat(${ordered.length}, minmax(150px, 1fr))`
    : `minmax(184px, 224px) repeat(${ordered.length}, minmax(238px, 1fr))`;
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
            <motion.button
              type="button"
              onClick={() => setDense(!dense)}
              aria-pressed={dense}
              whileTap={{ scale: 0.94 }}
              transition={{ type: "spring", stiffness: 420, damping: 24 }}
              title="Compactar la información para ajustar todos los candidatos"
              className={[
                "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-bold ring-1 transition-all",
                dense
                  ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white ring-white/30 shadow-glow-cyan"
                  : "fill-softer text-ink-soft ring-[color:var(--hairline)] hover:fill-soft",
              ].join(" ")}
            >
              <Minimize2 className="h-4 w-4" />
              Compacto
            </motion.button>

            {/* Order filter — highest CAP left (desc) by default. */}
            <motion.button
              type="button"
              onClick={() =>
                setConfig({ comparatorOrder: config.comparatorOrder === "desc" ? "asc" : "desc" })
              }
              disabled={!config.sortByCapDesc}
              whileTap={config.sortByCapDesc ? { scale: 0.94 } : undefined}
              transition={{ type: "spring", stiffness: 420, damping: 24 }}
              title={
                config.sortByCapDesc
                  ? config.comparatorOrder === "desc"
                    ? "Orden: mayor CAP a la izquierda (clic para invertir)"
                    : "Orden: menor CAP a la izquierda (clic para invertir)"
                  : "Active «Ordenar por Nota CAP» en Configuración para ordenar"
              }
              className={[
                "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-bold ring-1 transition-all",
                config.sortByCapDesc
                  ? "fill-softer text-ink-soft ring-[color:var(--hairline)] hover:fill-soft"
                  : "fill-softer text-ink-faint ring-[color:var(--hairline)] opacity-60",
              ].join(" ")}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={config.comparatorOrder}
                  initial={{ opacity: 0, y: 6, rotate: -20 }}
                  animate={{ opacity: 1, y: 0, rotate: 0 }}
                  exit={{ opacity: 0, y: -6, rotate: 20 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="inline-flex"
                >
                  {config.comparatorOrder === "desc" ? (
                    <ArrowDownWideNarrow className="h-4 w-4" />
                  ) : (
                    <ArrowUpWideNarrow className="h-4 w-4" />
                  )}
                </motion.span>
              </AnimatePresence>
              <span className="hidden sm:inline">
                {config.comparatorOrder === "desc" ? "Mayor → menor" : "Menor → mayor"}
              </span>
            </motion.button>

            <div className="flex-1" />

            <div className="glass flex items-center gap-1 rounded-full p-1 text-xs font-semibold text-ink-soft">
              {(
                [
                  { id: "portrait", label: "Vertical", Icon: RectangleVertical },
                  { id: "landscape", label: "Horizontal", Icon: RectangleHorizontal },
                ] as const
              ).map(({ id, label, Icon }) => {
                const active = orientation === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setOrientation(id)}
                    title={label}
                    className="relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors"
                  >
                    {active && (
                      <motion.span
                        layoutId="cmp-orientation-pill"
                        transition={{ type: "spring", stiffness: 420, damping: 32 }}
                        className="absolute inset-0 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] shadow-glow-cyan"
                      />
                    )}
                    <Icon className={`relative h-3.5 w-3.5 ${active ? "text-white" : ""}`} />
                    <span className={`relative hidden sm:inline ${active ? "text-white" : ""}`}>
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="glass flex items-center gap-1 rounded-full p-1 text-xs font-semibold text-ink-soft">
              {(["Letter", "Legal"] as PaperSize[]).map((p) => {
                const active = paper === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPaper(p)}
                    className="relative rounded-full px-3 py-1.5 transition-colors"
                  >
                    {active && (
                      <motion.span
                        layoutId="cmp-paper-pill"
                        transition={{ type: "spring", stiffness: 420, damping: 32 }}
                        className="absolute inset-0 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] shadow-glow-cyan"
                      />
                    )}
                    <span className={`relative ${active ? "text-white" : ""}`}>
                      {p === "Letter" ? "Carta" : "Oficio"}
                    </span>
                  </button>
                );
              })}
            </div>
            <motion.button
              type="button"
              disabled={selected.length === 0}
              whileHover={selected.length ? { y: -3, scale: 1.03 } : undefined}
              whileTap={selected.length ? { scale: 0.95 } : undefined}
              transition={{ type: "spring", stiffness: 360, damping: 24 }}
              onClick={() =>
                printModule("Comparativa de Postulantes", paper, orientation, {
                  scope: "comparador",
                })
              }
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-5 py-2.5 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              <span className="hidden sm:inline">Imprimir comparativa</span>
              <span className="sm:hidden">Imprimir</span>
            </motion.button>
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
                      {ordered.map((entry) => (
                        <StripChip
                          key={entry.candidate.id}
                          candidate={entry.candidate}
                          rank={entry.rank}
                          cap={entry.cap}
                          showRank={rankingOn}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              {/* On-screen horizontal navigator — a fluid slider + arrows to pan
                  across the columns when the comparison is wider than the view. */}
              <AnimatePresence initial={false}>
                {scrollNav.max > 4 && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    className="no-print mb-1 flex items-center gap-2"
                  >
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
                  </motion.div>
                )}
              </AnimatePresence>

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
                  {ordered.map((entry) => (
                    <div key={entry.candidate.id} role="columnheader">
                      <motion.div
                        layout="position"
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 26 }}
                        className="h-full"
                      >
                        <CandidateProfileCard
                          candidate={entry.candidate}
                          onRemove={() => remove(entry.candidate.id)}
                          rank={entry.rank}
                          showRankBadge={showRankCard}
                        />
                      </motion.div>
                    </div>
                  ))}

                  <div ref={sentinelRef} style={{ gridColumn: "1 / -1", height: 1 }} />

                  {/* ===== Ranking row (dedicated placement) ===== */}
                  {showRankRow && (
                    <RowFragment row={RANKING_ROW} index={0}>
                      {ordered.map((entry) => (
                        <Cell key={entry.candidate.id + "-rank"}>
                          <RankingValue entry={entry} />
                        </Cell>
                      ))}
                    </RowFragment>
                  )}

                  {/* ===== Resultados de Evaluación ===== */}
                  <Section id="resultados" cmp={cmp} icon={<Award className="h-4 w-4" />}>
                    {visibleRows("resultados").map((row, i) => (
                      <RowFragment key={row.id} row={row} index={i}>
                        {ordered.map((entry) => (
                          <Cell key={entry.candidate.id + row.id}>
                            <RowValue row={row} candidate={entry.candidate} />
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
                      competencyRows
                        .filter((name) => !cmp.rowHidden[competencyRowId(name)])
                        .map((name, i) => (
                          <RowFragment
                            key={name}
                            row={{
                              id: competencyRowId(name),
                              section: "competencias",
                              label: name,
                              kind: "level",
                            }}
                            index={i}
                            info={
                              <span className="no-print">
                                <CompetencyInfoButton name={name} size="sm" />
                              </span>
                            }
                          >
                            {ordered.map((entry) => {
                              const score = findScore(entry.candidate.competenciasList, name);
                              return (
                                <Cell key={entry.candidate.id + name}>
                                  {score ? (
                                    <CompetencyChip
                                      score={score}
                                      showAjusteBrecha={cmp.showAjusteBrecha}
                                    />
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
                    {visibleRows("conocimientos").map((row, i) => (
                      <RowFragment key={row.id} row={row} index={i}>
                        {ordered.map((entry) => (
                          <Cell key={entry.candidate.id + row.id}>
                            <LongCell
                              kind="items"
                              items={entry.candidate.conocimientosList}
                              withDetalle
                              rowLabel={row.label}
                              rowSub={row.sub}
                              candidateName={entry.candidate.fullName}
                            />
                          </Cell>
                        ))}
                      </RowFragment>
                    ))}
                  </Section>

                  {/* ===== Manejo de Herramientas ===== */}
                  <Section
                    id="herramientas"
                    cmp={cmp}
                    icon={<Wrench className="h-4 w-4" />}
                    sub="Nivel de manejo de herramientas"
                  >
                    {visibleRows("herramientas").map((row, i) => (
                      <RowFragment key={row.id} row={row} index={i}>
                        {ordered.map((entry) => (
                          <Cell key={entry.candidate.id + row.id}>
                            <LongCell
                              kind="items"
                              items={entry.candidate.herramientasList}
                              rowLabel={row.label}
                              rowSub={row.sub}
                              candidateName={entry.candidate.fullName}
                            />
                          </Cell>
                        ))}
                      </RowFragment>
                    ))}
                  </Section>

                  {/* ===== Integridad y Confiabilidad ===== */}
                  <Section
                    id="integridad"
                    cmp={cmp}
                    icon={<ShieldCheck className="h-4 w-4" />}
                    sub="Reporte de veracidad"
                  >
                    {visibleRows("integridad").map((row, i) => (
                      <RowFragment key={row.id} row={row} index={i}>
                        {ordered.map((entry) => (
                          <Cell key={entry.candidate.id + row.id}>
                            <RowValue row={row} candidate={entry.candidate} />
                          </Cell>
                        ))}
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
                    {visibleRows("observaciones").map((row, i) => (
                      <RowFragment key={row.id} row={row} index={i}>
                        {ordered.map((entry) => (
                          <Cell key={entry.candidate.id + row.id}>
                            <LongCell
                              kind="tags"
                              tags={observationTags(entry.candidate.observaciones)}
                              rowLabel={row.label}
                              rowSub={row.sub}
                              candidateName={entry.candidate.fullName}
                            />
                          </Cell>
                        ))}
                      </RowFragment>
                    ))}
                  </Section>
                </div>
              </div>
            </div>
          )}

          {/* Fixed navigation helper — appears only when the comparison really
              overflows sideways, so it never floats over a grid that has nothing
              to pan. Toggleable from the comparator's Configuración tab. */}
          {config.comparatorNavHelper && selected.length > 4 && scrollNav.max > 4 && (
            <ComparatorNavHelper
              onPan={panBy}
              canLeft={scrollNav.left > 1}
              canRight={scrollNav.left < scrollNav.max - 1}
            />
          )}
        </>
      )}

      {tab === "graficos" &&
        (selected.length === 0 ? (
          <EmptyComparator charts />
        ) : (
          <ComparatorCharts candidates={ordered.map((entry) => entry.candidate)} />
        ))}

      {tab === "config" && <ComparatorSettings cmp={cmp} competencyRows={competencyRows} />}
    </div>
  );
}

/** La fila de ranking se dibuja aparte de las secciones, en la cabecera. */
const RANKING_ROW = COMPARATOR_ROWS.find((r) => r.id === "ranking")!;

/* ------------------------------------------------------------------ */
/* Compact frozen strip chip                                           */
/* ------------------------------------------------------------------ */

/**
 * A single chip in the compact frozen strip. It lives inside a grid cell that
 * matches its column, so it can fill the column width. The name font shrinks
 * with length and wraps to two lines, so long names are shown in full instead
 * of being clipped.
 *
 * Reenvía la `ref` porque `AnimatePresence mode="popLayout"` mide el hijo antes
 * de sacarlo del flujo; sin `forwardRef`, React avisa por consola y la salida
 * del chip se dibuja a saltos.
 */
const StripChip = forwardRef<
  HTMLDivElement,
  { candidate: Candidate; rank: number; cap: number | null; showRank: boolean }
>(function StripChip({ candidate, rank, cap, showRank }, ref) {
  const upper = upperName(candidate.fullName);
  const len = upper.length;
  const nameSize =
    len > 30 ? "text-[0.6rem]" : len > 20 ? "text-[0.7rem]" : "text-sm";
  return (
    <motion.div
      ref={ref}
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
      {showRank && <RankChip rank={rank} cap={cap} className="shrink-0" />}
    </motion.div>
  );
});

/* ------------------------------------------------------------------ */
/* Fixed navigation helper (d-pad)                                     */
/* ------------------------------------------------------------------ */

/**
 * A discreet, fixed d-pad that pans the audit grid horizontally and scrolls the
 * page vertically. It floats at the right edge, out of the way, and only mounts
 * when the comparison actually overflows sideways. Buttons for the axis that
 * can't move any further dim out.
 *
 * Dos correcciones de convivencia: el envoltorio no intercepta el puntero
 * (`pointer-events-none`, sólo los botones lo reciben), así que ya no roba los
 * clics del buscador de candidatos que quedaba justo debajo; y en reposo es
 * translúcido, de modo que no tapa la última columna de la comparativa.
 */
function ComparatorNavHelper({
  onPan,
  canLeft,
  canRight,
}: {
  onPan: (dir: 1 | -1) => void;
  canLeft: boolean;
  canRight: boolean;
}) {
  const scrollV = (dir: 1 | -1) =>
    window.scrollBy({ top: dir * window.innerHeight * 0.8, behavior: "smooth" });

  const cell =
    "pointer-events-auto grid h-9 w-9 place-items-center rounded-xl fill-softer text-ink-soft ring-1 ring-[color:var(--hairline)] transition-all duration-300 hover:fill-soft hover:text-cyan-400 active:scale-90 disabled:opacity-30 disabled:hover:text-ink-soft";

  return (
    <motion.div
      initial={{ opacity: 0, x: 24, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className="no-print pointer-events-none fixed right-3 top-1/2 z-[85] hidden -translate-y-1/2 opacity-35 transition-opacity duration-300 hover:opacity-100 focus-within:opacity-100 sm:block"
    >
      <div className="glass-heavy pointer-events-auto grid grid-cols-3 gap-1 rounded-2xl p-1.5 shadow-glass ring-1 ring-white/20">
        <span className="col-start-2 grid place-items-center">
          <button type="button" aria-label="Subir" onClick={() => scrollV(-1)} className={cell}>
            <ChevronUp className="h-4 w-4" />
          </button>
        </span>
        <button
          type="button"
          aria-label="Desplazar a la izquierda"
          onClick={() => onPan(-1)}
          disabled={!canLeft}
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
          disabled={!canRight}
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
      <AnimatePresence initial={false}>
        {count > 0 && (
          <motion.span
            initial={{ opacity: 0, scale: 0.85, x: -6 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.85, x: -6 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
            className="shrink-0 rounded-full fill-softer px-3 py-1.5 text-xs font-bold text-ink-soft ring-1 ring-[color:var(--hairline)]"
          >
            {count} en comparación
          </motion.span>
        )}
      </AnimatePresence>
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

function ComparatorSettings({
  cmp,
  competencyRows,
}: {
  cmp: ReturnType<typeof useComparator>;
  /** Competencias presentes en la comparación en curso (filas dinámicas). */
  competencyRows: string[];
}) {
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
  const hiddenCount = Object.keys(cmp.rowHidden).length;
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
        <p className="mt-4 flex items-start gap-2 rounded-2xl fill-softer px-3.5 py-3 text-xs text-ink-soft ring-1 ring-[color:var(--hairline)]">
          <Scale className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
          <span>
            El puesto lo decide la <strong className="text-ink">mayor Nota CAP</strong>. Ante un
            empate exacto entra el <strong className="text-ink">Índice de Desempate</strong>: media
            ponderada de Nota Conocimientos (40 %), Nota Competencias (35 %) y Nota Currículum
            (25 %), renormalizada si falta alguna. Invertir el orden cambia sólo la vista, nunca los
            puestos.
          </span>
        </p>
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

      <RowVisibilityPanel
        cmp={cmp}
        competencyRows={competencyRows}
        hiddenCount={hiddenCount}
      />

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

/**
 * Visibilidad fila por fila.
 *
 * Las filas fijas salen del catálogo (`lib/comparatorRows`) agrupadas por su
 * sección; las de competencias se listan a partir de la comparación en curso,
 * porque dependen de lo que traigan los postulantes. Todo empieza encendido: en
 * el estado sólo se guarda lo que el analista decidió ocultar.
 */
function RowVisibilityPanel({
  cmp,
  competencyRows,
  hiddenCount,
}: {
  cmp: ReturnType<typeof useComparator>;
  competencyRows: string[];
  hiddenCount: number;
}) {
  const groups: { title: string; rows: ComparatorRowDef[] }[] = [
    { title: "Cabecera", rows: rowsOfSection("ranking") },
    ...COMPARATOR_SECTION_IDS.map((id) => ({
      title: COMPARATOR_SECTION_LABELS[id],
      rows:
        id === "competencias"
          ? competencyRows.map<ComparatorRowDef>((name) => ({
              id: competencyRowId(name),
              section: "competencias",
              label: name,
              kind: "level",
            }))
          : rowsOfSection(id),
    })),
  ].filter((g) => g.rows.length > 0);

  return (
    <div className="glass glow rounded-3xl p-5">
      <header className="mb-4 flex flex-wrap items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl fill-softer text-cyan-400 ring-1 ring-[color:var(--hairline)]">
          <Rows3 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-black tracking-tight text-ink">Filas visibles</h3>
          <p className="text-xs text-ink-soft">
            Apaga cualquier fila para dejar la comparativa con lo justo. Todas empiezan encendidas.
          </p>
        </div>
        <AnimatePresence initial={false}>
          {hiddenCount > 0 && (
            <motion.button
              type="button"
              onClick={showAllRows}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 420, damping: 28 }}
              className="inline-flex items-center gap-2 rounded-full fill-softer px-3.5 py-2 text-xs font-bold text-ink ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-95"
            >
              <Eye className="h-4 w-4" />
              Mostrar las {hiddenCount} ocultas
            </motion.button>
          )}
        </AnimatePresence>
      </header>

      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.title}>
            <h4 className="mb-2 text-[0.7rem] font-bold uppercase tracking-[0.15em] text-ink-faint">
              {group.title}
            </h4>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {group.rows.map((row) => (
                <Toggle
                  key={row.id}
                  title={row.label}
                  subtitle={row.sub}
                  checked={!cmp.rowHidden[row.id]}
                  onChange={(v) => setRowHidden(row.id, !v)}
                />
              ))}
            </div>
          </div>
        ))}
        {competencyRows.length === 0 && (
          <p className="rounded-2xl border border-dashed border-[color:var(--hairline)] px-3.5 py-3 text-xs text-ink-faint">
            Las filas de competencias aparecen aquí en cuanto la comparación tenga postulantes con
            competencias evaluadas.
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

/**
 * Retardo de entrada de la fila en curso.
 *
 * Las celdas de una fila son hermanas dentro de la cuadrícula, así que no hay
 * ningún elemento común donde colgar el escalonado. Un contexto sí las alcanza
 * sin generar marcado: el `RowFragment` publica su retardo y cada `Cell` lo
 * aplica a su propia animación.
 */
const RowDelayContext = createContext(0);

/**
 * Mantiene el contenido montado mientras se reproduce su animación de salida.
 *
 * Contraer una sección tenía que ser instantáneo porque las filas son celdas
 * sueltas de la cuadrícula y no se pueden envolver para animar su alto. Con esto
 * las filas se despiden (se van desvaneciendo hacia arriba) y sólo entonces
 * desaparecen del flujo, que es exactamente cómo se pliega una lista en iOS.
 */
function useCollapseTransition(open: boolean, ms = 240) {
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (open) {
      setLeaving(false);
      setMounted(true);
      return;
    }
    if (!mounted) return;
    setLeaving(true);
    const timer = window.setTimeout(() => {
      setMounted(false);
      setLeaving(false);
    }, ms);
    return () => window.clearTimeout(timer);
  }, [open, mounted, ms]);

  return { mounted, leaving };
}

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
  const collapsed = cmp.sectionCollapsed[id];
  const { mounted, leaving } = useCollapseTransition(!collapsed);
  if (!cmp.sectionVisible[id]) return null;
  return (
    <>
      <SectionBand
        icon={icon}
        title={COMPARATOR_SECTION_LABELS[id]}
        sub={sub}
        collapsed={collapsed}
        onToggle={() => setSectionCollapsed(id, !collapsed)}
      />
      {mounted && (
        // `display: contents` deja que las celdas sigan siendo hijas de la
        // cuadrícula (nada de romper la alineación de columnas) y a la vez da un
        // ancla al selector que anima su entrada y su salida.
        <div
          style={{ display: "contents" }}
          className={leaving ? "cmp-rows-out" : "cmp-rows-in"}
        >
          {children}
        </div>
      )}
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
        <motion.button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Desplegar ${title}` : `Contraer ${title}`}
          title={collapsed ? "Desplegar sección" : "Contraer sección"}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.9 }}
          transition={{ type: "spring", stiffness: 420, damping: 24 }}
          className="no-print ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25"
        >
          <motion.span
            animate={{ rotate: collapsed ? -90 : 0 }}
            transition={{ type: "spring", stiffness: 340, damping: 24 }}
            className="grid place-items-center"
          >
            <ChevronDown className="h-4 w-4" />
          </motion.span>
        </motion.button>
      )}
    </motion.div>
  );
}

/**
 * A row: a sticky-left label cell followed by caller-provided value cells.
 *
 * La primera columna es **un solo bloque**. Antes había dos: el fondo opaco que
 * se estira con el alto de la fila y, dentro, una pastilla de vidrio del tamaño
 * del texto; con filas altas —las de competencias o conocimientos— se veía como
 * un recuadro flotando dentro de otro. Ahora el vidrio ocupa todo el alto
 * disponible (`h-full`), así que el bloque sigue adaptándose a la fila pero se
 * lee como uno.
 */
function RowFragment({
  row,
  index,
  info,
  children,
}: {
  row: ComparatorRowDef;
  /** Posición dentro de la sección: alimenta el escalonado de la entrada. */
  index: number;
  /** Optional trailing element (e.g. a competency "?" info button). */
  info?: React.ReactNode;
  children: React.ReactNode;
}) {
  const delay = Math.min(index * 30, 210);
  return (
    <RowDelayContext.Provider value={delay}>
      <div
        className="cmp-freeze sticky left-0 z-[40] flex rounded-xl"
        style={{ animationDelay: `${delay}ms` }}
        role="rowheader"
      >
        <span
          className="glass flex h-full w-full items-center gap-1.5 rounded-xl px-3 py-2 print-avoid-break"
          title={row.sub ? `${row.label} · ${row.sub}` : row.label}
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <MarqueeText text={row.label} className="text-xs font-bold text-ink" />
            {row.sub && <span className="truncate text-[0.65rem] text-ink-faint">{row.sub}</span>}
          </span>
          {info}
        </span>
      </div>
      {children}
    </RowDelayContext.Provider>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  const delay = useContext(RowDelayContext);
  return (
    <div role="cell" className="print-avoid-break" style={{ animationDelay: `${delay}ms` }}>
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

/** Dibuja el valor de una fila del catálogo para un postulante. */
function RowValue({ row, candidate }: { row: ComparatorRowDef; candidate: Candidate }) {
  if (!row.key) return <Dash />;
  if (row.kind === "pct") {
    return <PctValue value={parseDecimal(candidate[row.key] as never)} />;
  }
  if (row.kind === "disc") {
    return <DiscValue value={(candidate[row.key] as string) || ""} />;
  }
  const value = (candidate[row.key] as string) || "";
  return <LevelBadge value={value} tone={row.tone ? row.tone(value) : proficiencyTone(value)} />;
}

/**
 * Celda de la fila de Ranking: la chapa en grande, y un aviso cuando el puesto
 * salió de un desempate para que nadie tenga que adivinar por qué ese orden.
 */
function RankingValue({ entry }: { entry: RankedCandidate }) {
  const explanation = tiebreakExplanation(entry);
  return (
    <div className="flex h-full min-h-[64px] flex-col items-center justify-center gap-1 rounded-2xl fill-softer p-2 ring-1 ring-[color:var(--hairline)]">
      <motion.div
        initial={{ opacity: 0, scale: 0.82, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        <RankChip rank={entry.rank} cap={entry.cap} size="lg" title={explanation || undefined} />
      </motion.div>
      {entry.tied && (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-amber-500 ring-1 ring-amber-400/40"
          title={explanation}
        >
          <Scale className="h-3 w-3" />
          Desempate {entry.idd !== null ? entry.idd : "—"}
        </span>
      )}
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

/** Las observaciones llegan como un texto separado por comas. */
function observationTags(raw: unknown): string[] {
  return String(raw ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function findScore(
  list: CompetencyScore[],
  name: string,
): CompetencyScore | undefined {
  const key = name.toLowerCase();
  return list.find((s) => s.name.toLowerCase() === key);
}
