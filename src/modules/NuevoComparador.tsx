import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
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
  GitCompareArrows,
  BarChart3,
  SlidersHorizontal,
  Eye,
  RotateCcw,
  Search,
} from "lucide-react";
import { useTalentData } from "../context/TalentDataContext";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { CandidateProfileCard } from "../components/CandidateProfileCard";
import { CandidateSearchSelect } from "../components/CandidateSearchSelect";
import { CompetencyChip } from "../components/CompetencyChip";
import { LevelBadge } from "../components/LevelBadge";
import { Avatar } from "../components/Avatar";
import { DiscInfoButton } from "../components/DiscInfoButton";
import { Toggle } from "../components/form/Controls";
import { ComparatorCharts } from "../components/comparator/ComparatorCharts";
import { discAccent } from "../lib/discAccent";
import { extractDiscCode } from "../lib/disc";
import { parseDecimal, ajusteBand } from "../lib/competency";
import { sortByCapDesc, tieGroups } from "../lib/candidateDisplay";
import { useConfig } from "../lib/configStore";
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
  integrityTone,
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
  { key: "nivel_integridad", label: "Integridad", sub: "Firmeza de los principios morales del postulante", tone: integrityTone },
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

  // Columns are ordered by Nota CAP (highest → left) so the strongest candidate
  // leads the audit. Toggleable from Configuración; the added order is what we
  // persist, so turning the sort off restores the operator's own order.
  const ordered = useMemo(
    () => (config.sortByCapDesc ? sortByCapDesc(selected) : selected),
    [selected, config.sortByCapDesc],
  );

  const ties = useMemo(
    () => tieGroups(ordered, config.tieThreshold),
    [ordered, config.tieThreshold],
  );

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
  const columns = dense
    ? `minmax(122px, 0.6fr) repeat(${ordered.length}, minmax(128px, 1fr))`
    : `minmax(170px, 0.85fr) repeat(${ordered.length}, minmax(200px, 1fr))`;
  const printColumns = `minmax(88px, 0.5fr) repeat(${ordered.length}, minmax(0, 1fr))`;

  return (
    <div className="space-y-4">
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
              {/* Compact frozen strip — fades in once the big headers are gone. */}
              <div
                aria-hidden={!stuck}
                style={{ top: stickyTop }}
                className={[
                  "no-print sticky z-[80] flex items-center gap-2 overflow-x-auto rounded-2xl transition-all duration-300",
                  stuck
                    ? "pointer-events-auto opacity-100"
                    : "pointer-events-none -translate-y-2 opacity-0",
                ].join(" ")}
              >
                <span className="glass-heavy shrink-0 rounded-2xl px-3 py-2 text-xs font-bold uppercase tracking-wide text-ink-soft">
                  Comparativa
                </span>
                {ordered.map((c, idx) => (
                  <div
                    key={c.id}
                    className="glass-heavy flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2"
                  >
                    <Avatar name={c.fullName} seed={c.id} size="sm" />
                    <span className="max-w-[9rem] truncate text-sm font-bold text-ink">
                      {c.fullName}
                    </span>
                    {config.rankingEnabled && (
                      <span className="shrink-0 rounded-full fill-softer px-1.5 py-0.5 text-[0.65rem] font-black text-ink-soft ring-1 ring-[color:var(--hairline)]">
                        {idx + 1}.º
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Horizontal scroll wrapper — the comparison stays usable on
                  phones and tablets, and the label column freezes on the left. */}
              <div className="cmp-scroll -mx-1 overflow-x-auto px-1 pb-2">
                <div
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
                          tie={Boolean(ties[c.id])}
                          showRank={config.rankingEnabled}
                        />
                      </motion.div>
                    </div>
                  ))}

                  <div ref={sentinelRef} style={{ gridColumn: "1 / -1", height: 1 }} />

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
                        <RowFragment key={name} label={name}>
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
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 26 }}
      className="space-y-4"
    >
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
    <div
      style={{ gridColumn: "1 / -1" }}
      className="mt-2 flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-[#004a8f] to-[#005baa] px-4 py-2.5 text-white shadow-glass ring-1 ring-white/20 print-avoid-break"
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
