import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Archive, ArchiveRestore, BarChart3, Copy, Eye, PauseCircle, Pencil, Send, XCircle } from "lucide-react";
import { L } from "../../../content/locale";
import { Z } from "../../../design-system/tokens";
import type { AssessmentSummary } from "../domain/assessment";
import type { TalentPermissions } from "../../shared/permissions";

export type AssessmentRowAction =
  | "open"
  | "publish"
  | "pause"
  | "close"
  | "archive"
  | "unarchive"
  | "duplicate"
  | "results";

interface MenuProps {
  anchor: HTMLElement;
  item: AssessmentSummary;
  permissions: TalentPermissions;
  onClose: () => void;
  onAction: (action: AssessmentRowAction) => void;
}

/**
 * Menú de acciones de una evaluación.
 *
 * Las acciones se filtran por permiso Y por estado: no se ofrece «pausar» a una
 * evaluación que no está publicada ni «publicar» a una archivada, de modo que la
 * interfaz no propone transiciones que el servidor va a rechazar.
 */
export function AssessmentRowMenu({ anchor, item, permissions, onClose, onAction }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    const rect = anchor.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, left: Math.max(8, rect.right - 224) });
  }, [anchor]);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const archived = item.lifecycle === "archived";
  const published = item.publication === "published";
  const paused = item.publication === "paused";

  const entries: { id: AssessmentRowAction; label: string; icon: typeof Pencil; show: boolean; danger?: boolean }[] = [
    {
      id: "open",
      label: published ? L.assessments.actions.openPublished : L.assessments.actions.editDraft,
      icon: published ? Eye : Pencil,
      show: true,
    },
    { id: "results", label: L.assessments.actions.results, icon: BarChart3, show: permissions.viewAnalytics && published },
    { id: "publish", label: L.common.publish, icon: Send, show: permissions.publish && !archived && !published },
    { id: "pause", label: L.common.pause, icon: PauseCircle, show: permissions.edit && published },
    { id: "close", label: L.common.close, icon: XCircle, show: permissions.close && (published || paused) },
    { id: "duplicate", label: L.common.duplicate, icon: Copy, show: permissions.create },
    { id: "unarchive", label: L.common.restore, icon: ArchiveRestore, show: permissions.archive && archived },
    { id: "archive", label: L.common.archive, icon: Archive, show: permissions.archive && !archived, danger: true },
  ];

  const itemClass =
    "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:fill-softer focus-visible:ring-2 focus-visible:ring-cyan-300";

  return createPortal(
    <motion.div
      ref={ref}
      role="menu"
      aria-label={`${L.common.actions}: ${item.name}`}
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.15 }}
      style={{ top: pos.top, left: pos.left, zIndex: Z.dropdown }}
      className="glass-heavy fixed w-56 rounded-2xl p-1.5"
    >
      {entries
        .filter((entry) => entry.show)
        .map((entry) => {
          const Icon = entry.icon;
          return (
            <button
              key={entry.id}
              type="button"
              role="menuitem"
              onClick={() => onAction(entry.id)}
              className={`${itemClass} ${entry.danger ? "text-rose-300" : "text-ink"}`}
            >
              <Icon className="h-4 w-4" /> {entry.label}
            </button>
          );
        })}
    </motion.div>,
    document.body,
  );
}
