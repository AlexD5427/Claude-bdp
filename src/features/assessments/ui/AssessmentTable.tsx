import { motion } from "framer-motion";
import { MoreHorizontal } from "lucide-react";
import { L, formatRelative, formatDuration } from "../../../content/locale";
import { StatusPill } from "../../../design-system/liquid-glass/StatusPill";
import { listContainer, listItem } from "../../../design-system/motion";
import { ASSESSMENT_CATEGORY_META } from "../domain/categories";
import { ASSESSMENT_LIFECYCLE_META, ASSESSMENT_PUBLICATION_META } from "../domain/lifecycle";
import type { AssessmentSummary } from "../domain/assessment";

interface TableProps {
  items: AssessmentSummary[];
  onOpen: (id: string) => void;
  onRowMenu: (id: string, anchor: HTMLElement) => void;
}

/** Assessment dashboard table view. */
export function AssessmentTable({ items, onOpen, onRowMenu }: TableProps) {
  const c = L.assessments.columns;
  return (
    <div className="glass overflow-hidden rounded-3xl">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{L.assessments.listTitle}</caption>
          <thead>
            <tr className="sticky top-0 z-10 bg-[color:var(--glass-bg-heavy)] backdrop-blur-xl text-left">
              {[c.code, c.name, c.category, c.version, c.questions, c.duration, c.status, c.publication, c.updated, c.actions].map((h) => (
                <th key={h} scope="col" className="px-3.5 py-3 text-xs font-bold uppercase tracking-wide text-ink-soft">{h}</th>
              ))}
            </tr>
          </thead>
          <motion.tbody variants={listContainer} initial="hidden" animate="show">
            {items.map((a) => (
              <motion.tr key={a.id} variants={listItem} className="border-t border-[color:var(--hairline)] hover:bg-white/5">
                <td className="px-3.5 py-3 font-mono text-xs text-ink-soft">{a.code}</td>
                <td className="px-3.5 py-3">
                  <button
                    type="button"
                    onClick={() => onOpen(a.id)}
                    className="text-left font-semibold text-ink outline-none transition-colors hover:text-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-300"
                  >
                    {a.name}
                  </button>
                  {a.ownerId && <p className="text-[0.65rem] text-ink-faint">{a.ownerId}</p>}
                </td>
                <td className="px-3.5 py-3">
                  <StatusPill intent={ASSESSMENT_CATEGORY_META[a.category].intent}>{ASSESSMENT_CATEGORY_META[a.category].label}</StatusPill>
                </td>
                <td className="px-3.5 py-3 text-ink-soft">{a.versionLabel}</td>
                <td className="px-3.5 py-3 text-right tabular-nums text-ink">{a.questionCount}</td>
                <td className="px-3.5 py-3 whitespace-nowrap text-ink-soft">{formatDuration(a.estimatedDurationMinutes)}</td>
                <td className="px-3.5 py-3"><StatusPill intent={ASSESSMENT_LIFECYCLE_META[a.lifecycle].intent}>{ASSESSMENT_LIFECYCLE_META[a.lifecycle].label}</StatusPill></td>
                <td className="px-3.5 py-3"><StatusPill intent={ASSESSMENT_PUBLICATION_META[a.publication].intent}>{ASSESSMENT_PUBLICATION_META[a.publication].label}</StatusPill></td>
                <td className="px-3.5 py-3 whitespace-nowrap text-ink-faint">{formatRelative(a.updatedAt)}</td>
                <td className="px-3.5 py-3">
                  <button type="button" aria-label={`${L.common.moreActions}: ${a.name}`} onClick={(e) => onRowMenu(a.id, e.currentTarget)} className="grid h-8 w-8 place-items-center rounded-full text-ink-soft transition-colors hover:fill-softer hover:text-ink focus-visible:ring-2 focus-visible:ring-cyan-300">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </td>
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
      </div>
    </div>
  );
}
