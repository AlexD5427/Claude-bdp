import { motion } from "framer-motion";
import { ClipboardList, Clock, GitBranch, Link2 } from "lucide-react";
import { L, formatRelative, formatDuration } from "../../../content/locale";
import { StatusPill } from "../../../design-system/liquid-glass/StatusPill";
import { listContainer, listItem } from "../../../design-system/motion";
import { ASSESSMENT_CATEGORY_META } from "../domain/categories";
import { ASSESSMENT_LIFECYCLE_META, ASSESSMENT_PUBLICATION_META } from "../domain/lifecycle";
import type { AssessmentSummary } from "../domain/assessment";

interface CardsProps {
  items: AssessmentSummary[];
  onOpen: (id: string) => void;
}

/** Assessment card grid — the default dashboard view. */
export function AssessmentCards({ items, onOpen }: CardsProps) {
  return (
    <motion.div variants={listContainer} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((a) => (
        <motion.button
          key={a.id}
          variants={listItem}
          type="button"
          onClick={() => onOpen(a.id)}
          className="glass liquid-streak magnetic rounded-3xl p-5 text-left"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-xs text-ink-faint">{a.code}</p>
              <h3 className="mt-0.5 truncate text-base font-black text-ink">{a.name}</h3>
            </div>
            <StatusPill intent={ASSESSMENT_CATEGORY_META[a.category].intent}>
              {ASSESSMENT_CATEGORY_META[a.category].label}
            </StatusPill>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-soft">
            <span className="inline-flex items-center gap-1"><ClipboardList className="h-3.5 w-3.5" /> {a.questionCount} preguntas</span>
            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {formatDuration(a.estimatedDurationMinutes)}</span>
            <span className="inline-flex items-center gap-1"><GitBranch className="h-3.5 w-3.5" /> {a.versionLabel}</span>
            {a.linkedProcessCount > 0 && (
              <span className="inline-flex items-center gap-1"><Link2 className="h-3.5 w-3.5" /> {a.linkedProcessCount} proceso(s)</span>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="flex gap-1.5">
              <StatusPill intent={ASSESSMENT_LIFECYCLE_META[a.lifecycle].intent}>{ASSESSMENT_LIFECYCLE_META[a.lifecycle].label}</StatusPill>
              <StatusPill intent={ASSESSMENT_PUBLICATION_META[a.publication].intent}>{ASSESSMENT_PUBLICATION_META[a.publication].label}</StatusPill>
            </div>
          </div>
          <p className="mt-2 text-right text-[0.65rem] text-ink-faint">{L.common.updatedAt}: {formatRelative(a.updatedAt)}</p>
        </motion.button>
      ))}
    </motion.div>
  );
}
