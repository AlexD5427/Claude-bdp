import { useMemo } from "react";
import { motion } from "framer-motion";
import { ClipboardList, CheckCircle2, PenLine, Archive } from "lucide-react";
import { formatNumber } from "../../../content/locale";
import { ASSESSMENT_CATEGORY_META, type AssessmentCategory } from "../domain/categories";
import { listContainer, listItem } from "../../../design-system/motion";
import type { AssessmentSummary } from "../domain/assessment";

/** Analytics-summary view for the assessment dashboard. */
export function AssessmentSummaryView({ items }: { items: AssessmentSummary[] }) {
  const stats = useMemo(() => {
    const total = items.length;
    const published = items.filter((a) => a.publication === "published").length;
    const drafts = items.filter((a) => a.lifecycle === "draft").length;
    const archived = items.filter((a) => a.lifecycle === "archived").length;
    const byCategory = new Map<AssessmentCategory, number>();
    for (const a of items) byCategory.set(a.category, (byCategory.get(a.category) ?? 0) + 1);
    return {
      total,
      published,
      drafts,
      archived,
      byCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [items]);

  const maxCat = Math.max(1, ...stats.byCategory.map(([, n]) => n));

  return (
    <motion.div variants={listContainer} initial="hidden" animate="show" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={<ClipboardList className="h-5 w-5" />} label="Evaluaciones" value={stats.total} accent="from-cyan-500 to-blue-600" />
        <Tile icon={<CheckCircle2 className="h-5 w-5" />} label="Publicadas" value={stats.published} accent="from-emerald-500 to-teal-600" />
        <Tile icon={<PenLine className="h-5 w-5" />} label="Borradores" value={stats.drafts} accent="from-amber-500 to-orange-600" />
        <Tile icon={<Archive className="h-5 w-5" />} label="Archivadas" value={stats.archived} accent="from-slate-500 to-slate-600" />
      </div>

      <motion.div variants={listItem} className="glass rounded-3xl p-5">
        <h3 className="mb-4 text-sm font-black text-ink">Distribución por categoría</h3>
        <ul className="flex flex-col gap-2.5">
          {stats.byCategory.map(([cat, n]) => (
            <li key={cat} className="flex items-center gap-3">
              <span className="w-44 shrink-0 truncate text-xs text-ink-soft">{ASSESSMENT_CATEGORY_META[cat].label}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full fill-softer">
                <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-violet-600" style={{ width: `${(n / maxCat) * 100}%` }} />
              </div>
              <span className="w-8 shrink-0 text-right text-xs font-bold tabular-nums text-ink">{n}</span>
            </li>
          ))}
        </ul>
      </motion.div>
    </motion.div>
  );
}

function Tile({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent: string }) {
  return (
    <div className="glass rounded-3xl p-4">
      <div className={`grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br text-white ring-1 ring-white/30 ${accent}`}>{icon}</div>
      <div className="mt-3 text-2xl font-black text-ink">{formatNumber(value)}</div>
      <div className="text-xs uppercase tracking-wide text-ink-faint">{label}</div>
    </div>
  );
}
