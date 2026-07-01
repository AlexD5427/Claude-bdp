import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Award,
  Timer,
  DollarSign,
  RefreshCcw,
  Users2,
  UserPlus,
  UserCheck,
  UserMinus,
  Workflow,
  ShieldCheck,
  TrendingUp,
  Printer,
  ChevronRight,
  Maximize2,
  Pencil,
  Check,
  Plus,
  Trash2,
  GripVertical,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import { useTalentData } from "../context/TalentDataContext";
import { ensureSeen, useHiring } from "../lib/hiringStore";
import { usePointerGlow } from "../hooks/usePointerGlow";
import {
  computeAllKpiValues,
  demographicsByGerencia,
  hiresOverTime,
  hiringCounts,
  recentAdditions,
  type Slice,
} from "../lib/kpis";
import { deltaVsPrev, history, useKpiRecorder } from "../lib/kpiHistory";
import { printModule } from "../lib/print";
import {
  AreaChart,
  DonutChart,
  RadialProgress,
  Sparkline,
  TrendBadge,
  CHART_PALETTE,
} from "../components/charts";
import { KpiDetailModal } from "../components/KpiDetailModal";
import { Modal } from "../components/Modal";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { Avatar } from "../components/Avatar";
import { extractProceso } from "../lib/candidates";
import {
  useDashboard,
  addWidget,
  removeWidget,
  setWidgetSize,
  moveWidget,
  resetLayout,
  widgetDef,
  WIDGET_CATALOG,
  type WidgetSize,
} from "../lib/dashboardStore";

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = {
  hidden: { opacity: 0, y: 22, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 240, damping: 24 },
  },
};

const ICONS: Record<string, LucideIcon> = {
  Award,
  Timer,
  DollarSign,
  RefreshCcw,
  Users2,
  UserPlus,
  UserCheck,
  UserMinus,
  Workflow,
  ShieldCheck,
  TrendingUp,
};

/** Column-span classes per size (mobile = full, sm = 2-col, lg = 4-col grid). */
const SPAN: Record<WidgetSize, string> = {
  1: "col-span-1 sm:col-span-1 lg:col-span-1",
  2: "col-span-1 sm:col-span-2 lg:col-span-2",
  3: "col-span-1 sm:col-span-2 lg:col-span-3",
  4: "col-span-1 sm:col-span-2 lg:col-span-4",
};

interface DashCtx {
  values: Record<string, number | null>;
  demografia: Slice[];
  recientes: ReturnType<typeof recentAdditions>;
  counts: ReturnType<typeof hiringCounts>;
  serie: { label: string; value: number }[];
  months: number;
  setMonths: (m: number) => void;
  total: number;
}

/**
 * MÓDULO — Dashboard (landing). A fully customizable executive board: the
 * operator can add / remove indicators, resize each block (1–4 columns) and
 * drag them into any order. The arrangement persists per browser through
 * {@link ../lib/dashboardStore}. Widgets stay data-driven from the live talent
 * and hiring stores, so customizing the layout never touches the numbers.
 */
export function Dashboard() {
  const { candidatos, competencias, loading, error, refetch } = useTalentData();
  const hiring = useHiring();
  const layout = useDashboard();

  useEffect(() => {
    ensureSeen(candidatos.map((c) => c.id));
  }, [candidatos]);

  const values = useMemo(
    () => computeAllKpiValues(candidatos, competencias, hiring),
    [candidatos, competencias, hiring],
  );
  useKpiRecorder(values);

  const [months, setMonths] = useState(6);
  const demografia = useMemo(() => demographicsByGerencia(candidatos), [candidatos]);
  const recientes = useMemo(() => recentAdditions(candidatos, 5), [candidatos]);
  const counts = useMemo(() => hiringCounts(hiring), [hiring]);
  const serie = useMemo(() => hiresOverTime(hiring, months), [hiring, months]);

  const [editMode, setEditMode] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (candidatos.length === 0) {
    return <EmptyState message="Aún no hay datos para construir el panel." />;
  }

  const ctx: DashCtx = {
    values,
    demografia,
    recientes,
    counts,
    serie,
    months,
    setMonths,
    total: candidatos.length,
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <p className="text-sm text-ink-soft">
          {editMode
            ? "Arrastre los bloques para reordenar, ajuste su tamaño o quítelos."
            : "Indicadores clave de selección y reclutamiento."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {editMode && (
            <>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-4 py-2.5 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all hover:-translate-y-0.5 active:scale-95"
              >
                <Plus className="h-4 w-4" />
                Añadir indicador
              </button>
              <button
                type="button"
                onClick={resetLayout}
                title="Restaurar disposición por defecto"
                className="inline-flex items-center gap-2 rounded-full fill-softer px-4 py-2.5 text-sm font-bold text-ink ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-95"
              >
                <RotateCcw className="h-4 w-4" />
                <span className="hidden sm:inline">Restaurar</span>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setEditMode((v) => !v)}
            aria-pressed={editMode}
            className={[
              "inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold ring-1 transition-all active:scale-95",
              editMode
                ? "bg-gradient-to-br from-emerald-500 to-green-600 text-white ring-white/30 shadow-glass"
                : "fill-softer text-ink ring-[color:var(--hairline)] hover:fill-soft",
            ].join(" ")}
          >
            {editMode ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            {editMode ? "Listo" : "Personalizar"}
          </button>
          <button
            type="button"
            onClick={() => printModule("Dashboard de Reclutamiento")}
            className="inline-flex items-center gap-2 rounded-full fill-softer px-4 py-2.5 text-sm font-bold text-ink ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-95"
          >
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Imprimir</span>
          </button>
        </div>
      </div>

      {/* The board */}
      {layout.widgets.length === 0 ? (
        <EmptyState
          title="Panel vacío"
          message="Agregue indicadores para construir su tablero ejecutivo."
        />
      ) : (
        <div className="grid grid-flow-dense grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {layout.widgets.map((w, i) => (
            <motion.div
              key={w.id}
              variants={item}
              draggable={editMode}
              onDragStart={() => {
                dragIndex.current = i;
              }}
              onDragEnter={() => {
                if (dragIndex.current !== null && dragIndex.current !== i) setOverIndex(i);
              }}
              onDragOver={(e) => editMode && e.preventDefault()}
              onDrop={() => {
                if (dragIndex.current !== null) moveWidget(dragIndex.current, i);
                dragIndex.current = null;
                setOverIndex(null);
              }}
              onDragEnd={() => {
                dragIndex.current = null;
                setOverIndex(null);
              }}
              className={[
                SPAN[w.size],
                "relative rounded-3xl",
                editMode ? "cursor-grab" : "",
                overIndex === i ? "ring-2 ring-cyan-400 ring-offset-2 ring-offset-transparent" : "",
              ].join(" ")}
            >
              {editMode && (
                <EditToolbar
                  size={w.size}
                  onSize={(s) => setWidgetSize(w.id, s)}
                  onRemove={() => removeWidget(w.id)}
                />
              )}
              <div className={editMode ? "pointer-events-none select-none" : ""}>
                {renderWidget(w.id, ctx)}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <WidgetPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        enabledIds={layout.widgets.map((w) => w.id)}
      />
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Widget rendering                                                    */
/* ------------------------------------------------------------------ */

function renderWidget(id: string, ctx: DashCtx): React.ReactNode {
  const def = widgetDef(id);
  if (!def) return null;

  if (def.kind === "panel") {
    switch (def.panel) {
      case "demografia":
        return (
          <Panel icon={<Users2 className="h-5 w-5 text-cyan-400" />} title="Demografía de Empleados" subtitle="Distribución por Gerencia / área">
            <DonutChart data={ctx.demografia} centerValue={String(ctx.total)} centerLabel="Total" />
          </Panel>
        );
      case "estado":
        return (
          <Panel icon={<TrendingUp className="h-5 w-5 text-cyan-400" />} title="Estado de Contratación" subtitle="Pipeline actual">
            <DonutChart
              size={150}
              data={[
                { label: "En proceso", value: ctx.counts.enProceso, color: CHART_PALETTE[0] },
                { label: "Contratados", value: ctx.counts.contratados, color: "#10b981" },
                { label: "Bajas", value: ctx.counts.bajas, color: "#f43f5e" },
              ]}
              centerValue={String(ctx.counts.contratados)}
              centerLabel="Contratados"
            />
          </Panel>
        );
      case "nuevas":
        return (
          <Panel icon={<UserPlus className="h-5 w-5 text-cyan-400" />} title="Nuevas Adiciones al Banco" subtitle="Últimos 5 registros">
            <ul className="space-y-2">
              {ctx.recientes.map((c, i) => (
                <motion.li
                  key={c.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.06 }}
                  className="flex items-center gap-3 rounded-2xl fill-soft px-3 py-2 ring-1 ring-[color:var(--hairline)]"
                >
                  <Avatar name={c.fullName} seed={c.id} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink">{c.fullName}</div>
                    <div className="truncate text-[0.7rem] text-ink-faint">{c.identificador || "Sin ID"}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-2.5 py-0.5 text-[0.7rem] font-bold text-white">
                    Proc. {extractProceso(c.identificador)}
                  </span>
                </motion.li>
              ))}
            </ul>
          </Panel>
        );
      case "historico":
        return (
          <Panel
            icon={<TrendingUp className="h-5 w-5 text-cyan-400" />}
            title="Histórico de Contrataciones"
            subtitle="Contratados por mes"
            action={
              <div className="flex items-center gap-1 rounded-full fill-softer p-1 text-xs font-semibold text-ink-soft no-print">
                {[3, 6, 12].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => ctx.setMonths(m)}
                    className={[
                      "rounded-full px-2.5 py-1 transition-all",
                      ctx.months === m ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white shadow-glow-cyan" : "hover:fill-soft",
                    ].join(" ")}
                  >
                    {m}m
                  </button>
                ))}
              </div>
            }
          >
            <AreaChart data={ctx.serie} height={210} />
            {ctx.counts.contratados === 0 && (
              <p className="mt-2 text-center text-xs text-ink-faint">
                Aún no hay contrataciones registradas. Marca postulantes como «Contratado» en la Lista de Postulantes para alimentar este histórico.
              </p>
            )}
          </Panel>
        );
      default:
        return null;
    }
  }

  // KPI widgets
  const raw = def.valueKey ? ctx.values[def.valueKey] ?? null : null;
  switch (id) {
    case "kpi_calidad":
      return (
        <HeroKpi
          kpiKey="calidad_contratacion"
          title="Calidad de Contratación"
          subtitle="Desempeño, integración y productividad del nuevo empleado"
          raw={raw}
          unit="%"
          goodWhenUp
          help={def.help ?? ""}
          icon={<Award className="h-5 w-5" />}
          visual={<RadialProgress value={null} na label="Calidad" color="#00b0d8" />}
        />
      );
    case "kpi_tiempo":
      return (
        <HeroKpi
          kpiKey="tiempo_contratacion"
          title="Tiempo de Contratación"
          subtitle="Desde que el postulante entra al proceso hasta su contratación"
          raw={raw}
          unit=" días"
          goodWhenUp={false}
          help={def.help ?? ""}
          icon={<Timer className="h-5 w-5" />}
          visual={<BigNumber value={ctx.values.tiempo_contratacion} suffix=" d" kpiKey="tiempo_contratacion" />}
        />
      );
    case "kpi_costo":
      return (
        <HeroKpi
          kpiKey="costo_contratacion"
          title="Costo por Contratación"
          subtitle="Costo total promedio de cubrir una vacante"
          raw={raw}
          unit=""
          goodWhenUp={false}
          help={def.help ?? ""}
          icon={<DollarSign className="h-5 w-5" />}
          visual={<NaPlate hint="Base externa" />}
        />
      );
    case "kpi_rotacion":
      return (
        <HeroKpi
          kpiKey="tasa_rotacion"
          title="Tasa de Rotación"
          subtitle="Contratados que causan baja antes de los 3 meses"
          raw={raw}
          unit="%"
          goodWhenUp={false}
          help={def.help ?? ""}
          icon={<RefreshCcw className="h-5 w-5" />}
          visual={<RadialProgress value={ctx.values.tasa_rotacion} na={ctx.values.tasa_rotacion === null} label="Rotación" color="#f43f5e" />}
        />
      );
    default:
      return <MiniKpi id={id} raw={raw} />;
  }
}

/* ------------------------------------------------------------------ */
/* Edit-mode controls + picker                                         */
/* ------------------------------------------------------------------ */

function EditToolbar({
  size,
  onSize,
  onRemove,
}: {
  size: WidgetSize;
  onSize: (s: WidgetSize) => void;
  onRemove: () => void;
}) {
  return (
    <div className="absolute -top-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full bg-[color:var(--glass-bg-heavy)] px-1.5 py-1 shadow-glass ring-1 ring-[color:var(--hairline)] backdrop-blur-xl">
      <span className="grid h-6 w-6 place-items-center text-ink-faint" title="Arrastrar para mover">
        <GripVertical className="h-4 w-4" />
      </span>
      {( [1, 2, 3, 4] as WidgetSize[] ).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onSize(s)}
          aria-label={`Tamaño ${s}`}
          className={[
            "grid h-6 w-6 place-items-center rounded-full text-[0.65rem] font-black transition-all",
            size === s
              ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white shadow-glow-cyan"
              : "fill-softer text-ink-soft hover:fill-soft",
          ].join(" ")}
        >
          {s}
        </button>
      ))}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Quitar indicador"
        className="grid h-6 w-6 place-items-center rounded-full text-rose-500 transition-all hover:bg-rose-500/15"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function WidgetPicker({
  open,
  onClose,
  enabledIds,
}: {
  open: boolean;
  onClose: () => void;
  enabledIds: string[];
}) {
  const groups = useMemo(() => {
    const map = new Map<string, typeof WIDGET_CATALOG>();
    for (const def of WIDGET_CATALOG) {
      const arr = map.get(def.group) ?? [];
      arr.push(def);
      map.set(def.group, arr);
    }
    return [...map.entries()];
  }, []);

  return (
    <Modal open={open} onRequestClose={onClose} size="max-w-2xl" ariaLabel="Añadir indicador">
      <div className="flex items-center gap-3 rounded-t-3xl border-b border-[color:var(--hairline)] bg-[color:var(--glass-bg-heavy)] px-5 py-4 backdrop-blur-xl sm:px-7">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#00b0d8] to-[#005baa] shadow-glass ring-1 ring-white/30">
          <Plus className="h-6 w-6 text-white drop-shadow-md" />
        </div>
        <div className="min-w-0 flex-1 pr-10">
          <h2 className="text-lg font-black tracking-tight text-ink sm:text-xl">Añadir indicador</h2>
          <p className="text-xs text-ink-soft">Elija los bloques a mostrar en su tablero.</p>
        </div>
      </div>

      <div className="max-h-[calc(100vh-13rem)] space-y-5 overflow-y-auto px-5 py-6 sm:px-7">
        {groups.map(([group, defs]) => (
          <div key={group}>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-soft">{group}</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {defs.map((def) => {
                const added = enabledIds.includes(def.id);
                const Icon = def.icon ? ICONS[def.icon] : undefined;
                return (
                  <button
                    key={def.id}
                    type="button"
                    disabled={added}
                    onClick={() => addWidget(def.id)}
                    className={[
                      "flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left ring-1 transition-all",
                      added
                        ? "fill-soft text-ink-faint ring-[color:var(--hairline)] opacity-70"
                        : "fill-softer text-ink ring-[color:var(--hairline)] hover:fill-soft active:scale-[0.99]",
                    ].join(" ")}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white ring-1 ring-white/30">
                      {Icon ? <Icon className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{def.title}</span>
                      <span className="block text-[0.7rem] text-ink-faint">
                        {def.kind === "kpi" ? "Indicador" : "Panel"}
                      </span>
                    </span>
                    {added ? (
                      <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                    ) : (
                      <Plus className="h-4 w-4 shrink-0 text-cyan-400" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end gap-3 rounded-b-3xl border-t border-[color:var(--hairline)] bg-[color:var(--glass-bg-heavy)] px-5 py-4 backdrop-blur-xl sm:px-7">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-6 py-3 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all hover:-translate-y-0.5 active:scale-95"
        >
          Listo
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Building blocks (unchanged behaviour)                               */
/* ------------------------------------------------------------------ */

function Panel({
  icon,
  title,
  subtitle,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { onMouseMove } = usePointerGlow();
  return (
    <div onMouseMove={onMouseMove} className="glass glow h-full rounded-3xl p-5 print-avoid-break">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl fill-softer ring-1 ring-[color:var(--hairline)]">
            {icon}
          </span>
          <div>
            <h3 className="text-base font-black tracking-tight text-ink">{title}</h3>
            {subtitle && <p className="text-xs text-ink-soft">{subtitle}</p>}
          </div>
        </div>
        {action}
      </header>
      {children}
    </div>
  );
}

function HeroKpi({
  kpiKey,
  title,
  subtitle,
  raw,
  unit,
  goodWhenUp,
  help,
  icon,
  visual,
}: {
  kpiKey: string;
  title: string;
  subtitle: string;
  raw: number | null;
  unit?: string;
  goodWhenUp: boolean;
  help: string;
  icon: React.ReactNode;
  visual: React.ReactNode;
}) {
  const { onMouseMove } = usePointerGlow();
  const [open, setOpen] = useState(false);
  const delta = deltaVsPrev(kpiKey, raw);
  const display = raw === null ? "N/A" : `${raw}${unit ?? ""}`;

  return (
    <>
      <div onMouseMove={onMouseMove} className="glass glow magnetic flex h-full flex-col rounded-3xl p-5 print-avoid-break">
        <header className="mb-2 flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white shadow-glass ring-1 ring-white/30">
            {icon}
          </span>
          <h3 className="text-sm font-bold leading-tight text-ink">{title}</h3>
        </header>

        <div className="grid place-items-center py-2">{visual}</div>

        <p className="mb-3 text-[0.7rem] leading-snug text-ink-faint">{subtitle}</p>

        <div className="mt-auto flex items-center justify-between gap-2">
          <TrendBadge delta={delta} unit={unit} goodWhenUp={goodWhenUp} suffix="vs. mes ant." />
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="no-print inline-flex items-center gap-0.5 rounded-full fill-softer px-2.5 py-1 text-[0.7rem] font-bold text-ink-soft ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft"
          >
            Detalles <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      <KpiDetailModal
        open={open}
        onClose={() => setOpen(false)}
        kpiKey={kpiKey}
        title={title}
        value={display}
        unit={unit}
        raw={raw}
        help={help}
        goodWhenUp={goodWhenUp}
      />
    </>
  );
}

/** Compact single-value KPI tile for the operational indicators. */
function MiniKpi({ id, raw }: { id: string; raw: number | null }) {
  const def = widgetDef(id);
  const { onMouseMove } = usePointerGlow();
  const [open, setOpen] = useState(false);
  if (!def) return null;
  const key = def.valueKey ?? id;
  const delta = deltaVsPrev(key, raw);
  const display = raw === null ? "N/A" : `${raw}${def.unit ?? ""}`;
  const Icon = def.icon ? ICONS[def.icon] : Maximize2;

  return (
    <>
      <div onMouseMove={onMouseMove} className="glass glow magnetic flex h-full flex-col gap-2 rounded-3xl p-5 print-avoid-break">
        <header className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white shadow-glass ring-1 ring-white/30">
            <Icon className="h-5 w-5" />
          </span>
          <h3 className="text-sm font-bold leading-tight text-ink">{def.title}</h3>
        </header>
        <div className="text-4xl font-black leading-none text-ink">{display}</div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <TrendBadge delta={delta} unit={def.unit} goodWhenUp={def.goodWhenUp ?? true} suffix="vs. mes ant." />
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="no-print grid h-7 w-7 place-items-center rounded-full fill-softer text-ink-soft ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft"
            aria-label="Detalles"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <KpiDetailModal
        open={open}
        onClose={() => setOpen(false)}
        kpiKey={key}
        title={def.title}
        value={display}
        unit={def.unit}
        raw={raw}
        help={def.help ?? ""}
        goodWhenUp={def.goodWhenUp ?? true}
      />
    </>
  );
}

function BigNumber({ value, suffix, kpiKey }: { value: number | null; suffix: string; kpiKey: string }) {
  const series = history(kpiKey, value, 6).map((p) => p.value);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-5xl font-black leading-none text-ink">
        {value === null ? "N/A" : value}
        {value !== null && <span className="text-xl text-ink-soft">{suffix}</span>}
      </div>
      <Sparkline data={series} width={120} height={28} />
    </div>
  );
}

function NaPlate({ hint }: { hint: string }) {
  return (
    <div className="flex h-[132px] flex-col items-center justify-center gap-1">
      <div className="text-4xl font-black text-ink-faint">N/A</div>
      <span className="rounded-full fill-softer px-2.5 py-0.5 text-[0.65rem] font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)]">
        {hint}
      </span>
    </div>
  );
}
