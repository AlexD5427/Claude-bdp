import { motion } from "framer-motion";
import { Users, Workflow, Gauge, Layers } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTalentData } from "../context/TalentDataContext";
import { usePointerGlow } from "../hooks/usePointerGlow";
import { countActiveProcesos } from "../lib/candidates";
import { parseDecimal } from "../lib/competency";

interface Kpi {
  label: string;
  value: string;
  icon: LucideIcon;
  accent: string;
}

/**
 * A sleek horizontal row of floating Liquid Glass "widgets" that surface the
 * core metrics. They stagger into view on mount with a spring.
 */
export function KpiBar() {
  const { candidatos, competencias, loading } = useTalentData();

  const notas = candidatos
    .map((c) => parseDecimal(c.nota_competencias))
    .filter((n): n is number => n !== null);
  const avgNota =
    notas.length > 0
      ? Math.round(notas.reduce((a, b) => a + b, 0) / notas.length)
      : 0;

  const kpis: Kpi[] = [
    {
      label: "Número de Candidatos",
      value: loading ? "—" : String(candidatos.length),
      icon: Users,
      accent: "from-[#00b0d8] to-[#005baa]",
    },
    {
      label: "Procesos Activos",
      value: loading ? "—" : String(countActiveProcesos(candidatos)),
      icon: Workflow,
      accent: "from-[#005baa] to-[#004a8f]",
    },
    {
      label: "Promedio Competencias",
      value: loading ? "—" : `${avgNota}`,
      icon: Gauge,
      accent: "from-[#0090c5] to-[#00b0d8]",
    },
    {
      label: "Competencias Catalogadas",
      value: loading ? "—" : String(competencias.length),
      icon: Layers,
      accent: "from-[#004a8f] to-[#0077c2]",
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-wrap items-stretch justify-center gap-3 sm:gap-4">
      {kpis.map((kpi, i) => (
        <KpiWidget key={kpi.label} kpi={kpi} index={i} />
      ))}
    </div>
  );
}

function KpiWidget({ kpi, index }: { kpi: Kpi; index: number }) {
  const Icon = kpi.icon;
  const { onMouseMove } = usePointerGlow();
  return (
    <motion.div
      onMouseMove={onMouseMove}
      initial={{ y: 24, opacity: 0, scale: 0.92 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 240, damping: 20, delay: 0.25 + index * 0.08 }}
      className="glass glow liquid-streak magnetic flex min-w-[9.5rem] flex-1 items-center gap-3 rounded-3xl px-4 py-3"
    >
      <div
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${kpi.accent} shadow-glass ring-1 ring-white/30`}
      >
        <Icon className="h-5 w-5 text-white drop-shadow-md" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-black leading-none tracking-tight text-ink">
          {kpi.value}
        </div>
        <div className="mt-1 truncate text-[0.7rem] font-medium uppercase tracking-wide text-ink-soft">
          {kpi.label}
        </div>
      </div>
    </motion.div>
  );
}
