import { useMemo } from "react";
import { motion } from "framer-motion";
import { Workflow, CheckCircle2, PauseCircle, Archive } from "lucide-react";
import { formatNumber } from "../../../content/locale";
import { PROCESS_STATUS_META, type ProcessStatus } from "../domain/status";
import { listContainer, listItem } from "../../../design-system/motion";
import type { ProcessSummary } from "../domain/models";


/** Analytics-summary view: counts, distributions, and pipeline health. */
export function ProcessSummaryView({ items }: { items: ProcessSummary[] }) {
  const stats = useMemo(() => {
    const total = items.length;
    const published = items.filter((p) => p.publicationStatus === "published").length;
    const paused = items.filter((p) => p.processStatus === "paused").length;
    const archived = items.filter((p) => p.processStatus === "archived").length;
    const vacancies = items.reduce((s, p) => s + p.vacancies, 0);
    const applications = items.reduce((s, p) => s + p.applications, 0);

    const byStatus = new Map<ProcessStatus, number>();
    for (const p of items) byStatus.set(p.processStatus, (byStatus.get(p.processStatus) ?? 0) + 1);

    const byArea = new Map<string, number>();
    for (const p of items) {
      const key = p.area || "Sin área";
      byArea.set(key, (byArea.get(key) ?? 0) + 1);
    }

    return {
      total,
      published,
      paused,
      archived,
      vacancies,
      applications,
      byStatus: [...byStatus.entries()].sort((a, b) => b[1] - a[1]),
      byArea: [...byArea.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
    };
  }, [items]);

  const maxStatus = Math.max(1, ...stats.byStatus.map(([, n]) => n));
  const maxArea = Math.max(1, ...stats.byArea.map(([, n]) => n));

  return (
    <motion.div variants={listContainer} initial="hidden" animate="show" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile icon={<Workflow className="h-5 w-5" />} label="Procesos" value={stats.total} accent="from-cyan-500 to-blue-600" />
        <KpiTile icon={<CheckCircle2 className="h-5 w-5" />} label="Publicados" value={stats.published} accent="from-emerald-500 to-teal-600" />
        <KpiTile icon={<PauseCircle className="h-5 w-5" />} label="Pausados" value={stats.paused} accent="from-amber-500 to-orange-600" />
        <KpiTile icon={<Archive className="h-5 w-5" />} label="Archivados" value={stats.archived} accent="from-slate-500 to-slate-600" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <motion.div variants={listItem} className="glass rounded-3xl p-5">
          <h3 className="mb-4 text-sm font-black text-ink">Distribución por estado</h3>
          <ul className="flex flex-col gap-2.5">
            {stats.byStatus.map(([status, n]) => (
              <li key={status} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-xs text-ink-soft">
                  {PROCESS_STATUS_META[status].label}
                </span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full fill-softer">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#00b0d8] to-[#005baa]"
                    style={{ width: `${(n / maxStatus) * 100}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-xs font-bold tabular-nums text-ink">{n}</span>
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div variants={listItem} className="glass rounded-3xl p-5">
          <h3 className="mb-4 text-sm font-black text-ink">Procesos por área</h3>
          <ul className="flex flex-col gap-2.5">
            {stats.byArea.map(([area, n]) => (
              <li key={area} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-xs text-ink-soft">{area}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full fill-softer">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-violet-600"
                    style={{ width: `${(n / maxArea) * 100}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-xs font-bold tabular-nums text-ink">{n}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <motion.div variants={listItem} className="glass rounded-3xl p-5 text-center">
          <div className="text-3xl font-black text-ink">{formatNumber(stats.vacancies)}</div>
          <div className="mt-1 text-xs uppercase tracking-wide text-ink-faint">Vacantes totales</div>
        </motion.div>
        <motion.div variants={listItem} className="glass rounded-3xl p-5 text-center">
          <div className="text-3xl font-black text-ink">{formatNumber(stats.applications)}</div>
          <div className="mt-1 text-xs uppercase tracking-wide text-ink-faint">Postulaciones totales</div>
        </motion.div>
      </div>
    </motion.div>
  );
}

function KpiTile({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent: string }) {
  return (
    <div className="glass rounded-3xl p-4">
      <div className={`grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br text-white ring-1 ring-white/30 ${accent}`}>
        {icon}
      </div>
      <div className="mt-3 text-2xl font-black text-ink">{formatNumber(value)}</div>
      <div className="text-xs uppercase tracking-wide text-ink-faint">{label}</div>
    </div>
  );
}
