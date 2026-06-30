import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Award,
  Timer,
  DollarSign,
  RefreshCcw,
  Users2,
  UserPlus,
  TrendingUp,
  Printer,
  ChevronRight,
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
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { Avatar } from "../components/Avatar";
import { extractProceso } from "../lib/candidates";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};
const item = {
  hidden: { opacity: 0, y: 22, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 240, damping: 24 },
  },
};

/**
 * MÓDULO — Dashboard (landing). Executive recruitment KPIs at a glance:
 * Calidad de Contratación, Tiempo de Contratación, Costo por Contratación and
 * Tasa de Rotación (each with a month-over-month trend and a historical
 * drill-down), employee demographics, the latest additions to the bank and a
 * filterable hiring history.
 */
export function Dashboard() {
  const { candidatos, competencias, loading, error, refetch } = useTalentData();
  const hiring = useHiring();

  // Track first-seen timestamps so Tiempo de Contratación can be measured.
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

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (candidatos.length === 0) {
    return <EmptyState message="Aún no hay datos para construir el panel." />;
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 no-print">
        <p className="text-sm text-ink-soft">
          Indicadores clave de selección y reclutamiento.
        </p>
        <button
          type="button"
          onClick={() => printModule("Dashboard de Reclutamiento")}
          className="inline-flex items-center gap-2 rounded-full fill-softer px-4 py-2.5 text-sm font-bold text-ink ring-1 ring-[color:var(--hairline)] transition-all duration-300 hover:fill-soft active:scale-95"
        >
          <Printer className="h-4 w-4" />
          Imprimir
        </button>
      </div>

      {/* Hero KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <HeroKpi
          kpiKey="calidad_contratacion"
          title="Calidad de Contratación"
          subtitle="Desempeño, integración y productividad del nuevo empleado"
          raw={values.calidad_contratacion}
          unit="%"
          goodWhenUp
          help="Porcentaje basado en las evaluaciones de desempeño de los primeros meses (desempeño + integración + productividad). Aún no está conectado a la base de evaluaciones, por eso figura como N/A."
          icon={<Award className="h-5 w-5" />}
          visual={<RadialProgress value={null} na label="Calidad" color="#00b0d8" />}
        />
        <HeroKpi
          kpiKey="tiempo_contratacion"
          title="Tiempo de Contratación"
          subtitle="Desde que el postulante entra al proceso hasta su contratación"
          raw={values.tiempo_contratacion}
          unit=" días"
          goodWhenUp={false}
          help="Promedio de días entre el ingreso del postulante a un proceso y el cambio de su etiqueta a 'Contratado'. Se mide automáticamente con los registros de estado."
          icon={<Timer className="h-5 w-5" />}
          visual={<BigNumber value={values.tiempo_contratacion} suffix=" d" kpiKey="tiempo_contratacion" />}
        />
        <HeroKpi
          kpiKey="costo_contratacion"
          title="Costo por Contratación"
          subtitle="Costo total promedio de cubrir una vacante"
          raw={values.costo_contratacion}
          unit=""
          goodWhenUp={false}
          help="Proviene de una base de datos externa de costos (publicación, horas-persona, etc.). Aún no conectada, por eso figura como N/A."
          icon={<DollarSign className="h-5 w-5" />}
          visual={<NaPlate hint="Base externa" />}
        />
        <HeroKpi
          kpiKey="tasa_rotacion"
          title="Tasa de Rotación"
          subtitle="Contratados que causan baja antes de los 3 meses"
          raw={values.tasa_rotacion}
          unit="%"
          goodWhenUp={false}
          help="De las personas con etiqueta 'Contratado', porcentaje que pasó a 'Baja' dentro de los primeros ~90 días. Cada baja confirmada pondera el indicador del mes."
          icon={<RefreshCcw className="h-5 w-5" />}
          visual={<RadialProgress value={values.tasa_rotacion} na={values.tasa_rotacion === null} label="Rotación" color="#f43f5e" />}
        />
      </div>

      {/* Demografía + Estado de contratación */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2" icon={<Users2 className="h-5 w-5 text-cyan-400" />} title="Demografía de Empleados" subtitle="Distribución por Gerencia / área">
          <DonutChart data={demografia} centerValue={String(candidatos.length)} centerLabel="Total" />
        </Panel>
        <Panel icon={<TrendingUp className="h-5 w-5 text-cyan-400" />} title="Estado de Contratación" subtitle="Pipeline actual">
          <DonutChart
            size={150}
            data={[
              { label: "En proceso", value: counts.enProceso, color: CHART_PALETTE[0] },
              { label: "Contratados", value: counts.contratados, color: "#10b981" },
              { label: "Bajas", value: counts.bajas, color: "#f43f5e" },
            ]}
            centerValue={String(counts.contratados)}
            centerLabel="Contratados"
          />
        </Panel>
      </div>

      {/* Nuevas adiciones + histórico */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel icon={<UserPlus className="h-5 w-5 text-cyan-400" />} title="Nuevas Adiciones al Banco" subtitle="Últimos 5 registros">
          <ul className="space-y-2">
            {recientes.map((c, i) => (
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
                  <div className="truncate text-[0.7rem] text-ink-faint">
                    {c.identificador || "Sin ID"}
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-2.5 py-0.5 text-[0.7rem] font-bold text-white">
                  Proc. {extractProceso(c.identificador)}
                </span>
              </motion.li>
            ))}
          </ul>
        </Panel>

        <Panel className="lg:col-span-2" icon={<TrendingUp className="h-5 w-5 text-cyan-400" />} title="Histórico de Contrataciones" subtitle="Contratados por mes"
          action={
            <div className="flex items-center gap-1 rounded-full fill-softer p-1 text-xs font-semibold text-ink-soft no-print">
              {[3, 6, 12].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonths(m)}
                  className={[
                    "rounded-full px-2.5 py-1 transition-all",
                    months === m ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white shadow-glow-cyan" : "hover:fill-soft",
                  ].join(" ")}
                >
                  {m}m
                </button>
              ))}
            </div>
          }
        >
          <AreaChart data={serie} height={210} />
          {counts.contratados === 0 && (
            <p className="mt-2 text-center text-xs text-ink-faint">
              Aún no hay contrataciones registradas. Marca postulantes como
              «Contratado» en la Lista de Postulantes para alimentar este histórico.
            </p>
          )}
        </Panel>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */

function Panel({
  icon,
  title,
  subtitle,
  action,
  className = "",
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const { onMouseMove } = usePointerGlow();
  return (
    <motion.section
      variants={item}
      onMouseMove={onMouseMove}
      className={`glass glow rounded-3xl p-5 print-avoid-break ${className}`}
    >
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
    </motion.section>
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
      <motion.div
        variants={item}
        onMouseMove={onMouseMove}
        className="glass glow magnetic flex flex-col rounded-3xl p-5 print-avoid-break"
      >
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
      </motion.div>

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
