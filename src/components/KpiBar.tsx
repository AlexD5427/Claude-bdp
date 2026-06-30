import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Maximize2 } from "lucide-react";
import { useTalentData } from "../context/TalentDataContext";
import { useHiring } from "../lib/hiringStore";
import { usePointerGlow } from "../hooks/usePointerGlow";
import { computeAllKpiValues, getModuleKpis, type KpiSpec } from "../lib/kpis";
import { deltaVsPrev, history, useKpiRecorder } from "../lib/kpiHistory";
import { Sparkline, TrendBadge } from "./charts";
import { KpiDetailModal } from "./KpiDetailModal";
import type { ModuleId } from "../types";

/**
 * A module-aware row of KPI widgets. The classic four candidate metrics now
 * live only under "Lista de Postulantes"; every other module surfaces the
 * recruitment KPIs best suited to it. Each tile carries a sparkline + a
 * month-over-month trend, and opens a historical drill-down on click.
 * The Dashboard module renders its own hero KPIs, so the bar hides there.
 */
export function KpiBar({ module }: { module: ModuleId }) {
  const { candidatos, competencias } = useTalentData();
  const hiring = useHiring();

  const values = useMemo(
    () => computeAllKpiValues(candidatos, competencias, hiring),
    [candidatos, competencias, hiring],
  );
  useKpiRecorder(values);

  const specs = useMemo(() => getModuleKpis(module, values), [module, values]);

  if (module === "dashboard" || specs.length === 0) return null;

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {specs.map((spec, i) => (
        <KpiWidget key={spec.key} spec={spec} raw={values[spec.key]} index={i} />
      ))}
    </div>
  );
}

function KpiWidget({ spec, raw, index }: { spec: KpiSpec; raw: number | null; index: number }) {
  const { onMouseMove } = usePointerGlow();
  const [open, setOpen] = useState(false);
  const series = history(spec.key, raw, 6).map((p) => p.value);
  const delta = deltaVsPrev(spec.key, raw);

  return (
    <>
      <motion.button
        type="button"
        onMouseMove={onMouseMove}
        onClick={() => setOpen(true)}
        initial={{ y: 24, opacity: 0, scale: 0.92 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 20, delay: 0.05 + index * 0.07 }}
        className="glass glow liquid-streak magnetic group relative flex flex-col gap-2 rounded-3xl px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${spec.accent} shadow-glass ring-1 ring-white/30`}>
            <span className="text-sm font-black text-white drop-shadow-md">
              {spec.label.slice(0, 1)}
            </span>
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-black leading-none tracking-tight text-ink">
              {spec.value}
            </div>
            <div className="mt-1 truncate text-[0.7rem] font-medium uppercase tracking-wide text-ink-soft">
              {spec.label}
            </div>
          </div>
          <Maximize2 className="ml-auto h-4 w-4 shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <div className="flex items-center justify-between gap-2">
          <TrendBadge delta={delta} unit={spec.unit} goodWhenUp={spec.goodWhenUp} suffix="" />
          <Sparkline data={series} />
        </div>
      </motion.button>

      <KpiDetailModal
        open={open}
        onClose={() => setOpen(false)}
        kpiKey={spec.key}
        title={spec.label}
        value={spec.value}
        unit={spec.unit}
        raw={raw}
        help={spec.help}
        goodWhenUp={spec.goodWhenUp}
      />
    </>
  );
}
