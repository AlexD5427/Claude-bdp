import { motion } from "framer-motion";
import { MapPin, Users, ClipboardList, CalendarClock } from "lucide-react";
import { ActionMenu, type ActionItem } from "../../../design-system/components/ActionMenu";
import { StatusChip } from "../../../design-system/components/StatusChip";
import { formatDate } from "../../../shared/format";
import { PROCESS_STATUS_META, PUBLICATION_STATUS_META, VISIBILITY_LABELS } from "../statuses";
import { popIn } from "../../../design-system/motion";
import type { ProcessSummary } from "../types";

interface ProcessCardsProps {
  rows: ProcessSummary[];
  onOpen: (id: string) => void;
  buildActions: (row: ProcessSummary) => ActionItem[];
}

export function ProcessCards({ rows, onOpen, buildActions }: ProcessCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row, i) => (
        <motion.article
          key={row.id}
          variants={popIn}
          initial="initial"
          animate="animate"
          transition={{ delay: Math.min(i * 0.03, 0.3) }}
          className="glass liquid-streak magnetic group flex cursor-pointer flex-col gap-3 rounded-3xl p-5"
          onClick={() => onOpen(row.id)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[0.65rem] uppercase tracking-wide text-ink-faint">{row.code}</p>
              <h3 className="mt-0.5 line-clamp-2 text-base font-black text-ink">{row.title}</h3>
            </div>
            <div onClick={(e) => e.stopPropagation()}>
              <ActionMenu items={buildActions(row)} />
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <StatusChip meta={PROCESS_STATUS_META[row.status]} />
            <StatusChip meta={PUBLICATION_STATUS_META[row.publicationStatus]} />
          </div>

          <dl className="mt-1 grid grid-cols-2 gap-y-2 text-xs text-ink-soft">
            <dd className="col-span-2 inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0" /> {row.location || row.area || "—"}
            </dd>
            <dd className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 shrink-0" /> {row.vacancies} vacante{row.vacancies === 1 ? "" : "s"}
            </dd>
            <dd className="inline-flex items-center gap-1.5">
              <ClipboardList className="h-3.5 w-3.5 shrink-0" /> {row.assessmentCount} eval.
            </dd>
            <dd className="col-span-2 inline-flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5 shrink-0" /> Cierre: {formatDate(row.closingDate)}
            </dd>
          </dl>

          <div className="mt-auto flex items-center justify-between border-t border-[color:var(--hairline)] pt-2 text-[0.7rem] text-ink-faint">
            <span>{VISIBILITY_LABELS[row.visibility]}</span>
            <span>{row.applications} postulaciones</span>
          </div>
        </motion.article>
      ))}
    </div>
  );
}
