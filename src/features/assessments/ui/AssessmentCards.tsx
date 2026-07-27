import { motion } from "framer-motion";
import { ClipboardList, Clock, GitBranch, Link2, MoreHorizontal, User } from "lucide-react";
import { L, formatRelative, formatDuration } from "../../../content/locale";
import { StatusPill } from "../../../design-system/liquid-glass/StatusPill";
import { listContainer, listItem } from "../../../design-system/motion";
import { ASSESSMENT_CATEGORY_META } from "../domain/categories";
import { ASSESSMENT_LIFECYCLE_META, ASSESSMENT_PUBLICATION_META } from "../domain/lifecycle";
import type { AssessmentSummary } from "../domain/assessment";

interface CardsProps {
  items: AssessmentSummary[];
  onOpen: (id: string) => void;
  onRowMenu: (id: string, anchor: HTMLElement) => void;
}

/** Etiqueta de la acción primaria según el estado de la evaluación. */
function primaryActionLabel(item: AssessmentSummary): string {
  if (item.lifecycle === "archived") return L.common.details;
  if (item.publication === "published") return L.assessments.actions.openPublished;
  return item.questionCount > 0 ? L.assessments.actions.resumeDraft : L.assessments.actions.editDraft;
}

/**
 * Cuadrícula de tarjetas del listado.
 *
 * Cada tarjeta muestra únicamente datos reales de la evaluación (preguntas,
 * duración, versión, procesos vinculados, autor y última actualización) y expone
 * el menú de acciones que antes solo existía en la vista de tabla.
 */
export function AssessmentCards({ items, onOpen, onRowMenu }: CardsProps) {
  return (
    <motion.ul
      variants={listContainer}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      {items.map((a) => (
        <motion.li key={a.id} variants={listItem} className="glass liquid-streak relative rounded-3xl p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-xs text-ink-faint">{a.code}</p>
              <h3 className="mt-0.5 truncate text-base font-black text-ink">{a.name}</h3>
            </div>
            <button
              type="button"
              aria-label={`${L.common.moreActions}: ${a.name}`}
              onClick={(event) => onRowMenu(a.id, event.currentTarget)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:fill-softer hover:text-ink focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-2">
            <StatusPill intent={ASSESSMENT_CATEGORY_META[a.category].intent}>
              {ASSESSMENT_CATEGORY_META[a.category].label}
            </StatusPill>
          </div>

          <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-soft">
            <div className="inline-flex items-center gap-1">
              <ClipboardList className="h-3.5 w-3.5" />
              <dt className="sr-only">{L.assessments.columns.questions}</dt>
              <dd>{a.questionCount} preguntas</dd>
            </div>
            <div className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              <dt className="sr-only">{L.assessments.columns.duration}</dt>
              <dd>{formatDuration(a.estimatedDurationMinutes)}</dd>
            </div>
            <div className="inline-flex items-center gap-1">
              <GitBranch className="h-3.5 w-3.5" />
              <dt className="sr-only">{L.assessments.columns.version}</dt>
              <dd>{a.versionLabel}</dd>
            </div>
            {a.ownerId && (
              <div className="inline-flex min-w-0 items-center gap-1">
                <User className="h-3.5 w-3.5" />
                <dt className="sr-only">{L.assessments.columns.owner}</dt>
                <dd className="truncate">{a.ownerId}</dd>
              </div>
            )}
            {a.linkedProcessCount > 0 && (
              <div className="inline-flex items-center gap-1">
                <Link2 className="h-3.5 w-3.5" />
                <dt className="sr-only">{L.processes.columns.assessments}</dt>
                <dd>{a.linkedProcessCount} proceso(s)</dd>
              </div>
            )}
          </dl>

          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <StatusPill intent={ASSESSMENT_LIFECYCLE_META[a.lifecycle].intent}>
              {ASSESSMENT_LIFECYCLE_META[a.lifecycle].label}
            </StatusPill>
            <StatusPill intent={ASSESSMENT_PUBLICATION_META[a.publication].intent}>
              {ASSESSMENT_PUBLICATION_META[a.publication].label}
            </StatusPill>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onOpen(a.id)}
              className="inline-flex items-center gap-1.5 rounded-full fill-softer px-3.5 py-1.5 text-xs font-bold text-ink ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-soft focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              {primaryActionLabel(a)}
            </button>
            <p className="text-[0.65rem] text-ink-faint">
              {L.common.updatedAt}: {formatRelative(a.updatedAt)}
            </p>
          </div>
        </motion.li>
      ))}
    </motion.ul>
  );
}
