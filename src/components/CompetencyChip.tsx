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
      ? "text-ink-faint"
      : brecha < 0
        ? "text-rose-500"
        : "text-ink-faint";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className="glass liquid-streak magnetic rounded-2xl p-3 print-avoid-break"
    >
      <h4 className="truncate text-sm font-bold text-ink" title={name}>
        {name}
      </h4>

      <p className="mt-1 text-[0.7rem] font-medium text-ink-soft">
        Esperado: <span className="text-ink">{fmt(esperado)}</span>
        <span className="mx-1 text-ink-faint">|</span>
        Obtenido: <span className="text-ink">{fmt(obtenido)}</span>
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
