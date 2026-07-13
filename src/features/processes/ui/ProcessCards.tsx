import { motion } from "framer-motion";
import { MapPin, Users, ClipboardList, Briefcase } from "lucide-react";
import { L, formatDate, formatRelative } from "../../../content/locale";
import { StatusPill } from "../../../design-system/liquid-glass/StatusPill";
import { PROCESS_STATUS_META, PUBLICATION_STATUS_META } from "../domain/status";
import { WORK_MODE_LABELS } from "../domain/enums";
import { listContainer, listItem } from "../../../design-system/motion";
import type { ProcessSummary } from "../domain/models";

interface CardsProps {
  items: ProcessSummary[];
  onOpen: (id: string) => void;
}

/** Card grid view — a denser, more visual alternative to the table. */
export function ProcessCards({ items, onOpen }: CardsProps) {
  return (
    <motion.div
      variants={listContainer}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      {items.map((p) => (
        <motion.button
          key={p.id}
          variants={listItem}
          type="button"
          onClick={() => onOpen(p.id)}
          className="glass liquid-streak magnetic rounded-3xl p-5 text-left"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-xs text-ink-faint">{p.code}</p>
              <h3 className="mt-0.5 truncate text-base font-black text-ink">{p.title}</h3>
            </div>
            <StatusPill intent={PROCESS_STATUS_META[p.processStatus].intent}>
              {PROCESS_STATUS_META[p.processStatus].label}
            </StatusPill>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-soft">
            {p.area && (
              <span className="inline-flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5" />
                {p.area}
              </span>
            )}
            {p.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {p.location}
              </span>
            )}
            <span className="inline-flex items-center gap-1">{WORK_MODE_LABELS[p.workMode]}</span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <Metric icon={<Briefcase className="h-3.5 w-3.5" />} label={L.processes.columns.vacancies} value={p.vacancies} />
            <Metric icon={<Users className="h-3.5 w-3.5" />} label={L.processes.columns.applications} value={p.applications} />
            <Metric icon={<ClipboardList className="h-3.5 w-3.5" />} label={L.processes.columns.assessments} value={p.assessmentCount} />
          </div>

          <div className="mt-4 flex items-center justify-between gap-2 text-xs">
            <StatusPill intent={PUBLICATION_STATUS_META[p.publicationStatus].intent}>
              {PUBLICATION_STATUS_META[p.publicationStatus].label}
            </StatusPill>
            <span className="text-ink-faint">
              {L.processes.columns.closing}: {formatDate(p.closingDate)}
            </span>
          </div>
          <p className="mt-2 text-right text-[0.65rem] text-ink-faint">
            {L.common.updatedAt}: {formatRelative(p.updatedAt)}
          </p>
        </motion.button>
      ))}
    </motion.div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-2xl fill-soft px-2.5 py-2 text-center ring-1 ring-[color:var(--hairline)]">
      <div className="flex items-center justify-center gap-1 text-ink">
        {icon}
        <span className="text-base font-black tabular-nums">{value}</span>
      </div>
      <div className="mt-0.5 text-[0.6rem] uppercase tracking-wide text-ink-faint">{label}</div>
    </div>
  );
}
