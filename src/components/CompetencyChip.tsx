import { motion } from "framer-motion";
import type { CompetencyScore } from "../types";
import { AjusteBadge } from "./AjusteBadge";

/**
 * A single Liquid Glass competency chip — the atomic cell of the audit grid.
 *
 *   Line 1: competency name (bold, clipped if too long)
 *   Line 2: Esperado / Obtenido (tiny)
 *   Line 3: Ajuste badge + Brecha
 */
export function CompetencyChip({ score }: { score: CompetencyScore }) {
  const { name, esperado, obtenido, brecha, ajuste } = score;

  const brechaColor =
    brecha === null
      ? "text-slate-300"
      : brecha < 0
        ? "text-red-400"
        : "text-slate-400";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className="glass liquid-streak magnetic rounded-2xl p-3"
    >
      <h4
        className="truncate text-sm font-bold text-white drop-shadow-md"
        title={name}
      >
        {name}
      </h4>

      <p className="mt-1 text-[0.7rem] font-medium text-slate-200/70">
        Esperado: <span className="text-slate-100">{fmt(esperado)}</span>
        <span className="mx-1 text-slate-400">|</span>
        Obtenido: <span className="text-slate-100">{fmt(obtenido)}</span>
      </p>

      <div className="mt-2 flex items-center justify-between gap-2">
        <AjusteBadge ajuste={ajuste} />
        <span className={`text-xs font-bold ${brechaColor}`}>
          Brecha: {brecha === null ? "—" : fmt(brecha)}
        </span>
      </div>
    </motion.div>
  );
}

function fmt(value: number | null): string {
  if (value === null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
