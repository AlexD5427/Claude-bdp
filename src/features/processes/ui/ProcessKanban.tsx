import { useState } from "react";
import { motion } from "framer-motion";
import { GripVertical } from "lucide-react";
import { L, formatDate } from "../../../content/locale";
import { StatusPill } from "../../../design-system/liquid-glass/StatusPill";
import { PROCESS_STATUS_META, type ProcessStatus } from "../domain/status";
import type { ProcessSummary } from "../domain/models";

interface KanbanProps {
  items: ProcessSummary[];
  onOpen: (id: string) => void;
  /** Move a process to a new status (optimistic; caller persists + can roll back). */
  onMove: (id: string, to: ProcessStatus) => void;
}

/** The status columns shown on the board (a curated, ordered subset). */
const COLUMNS: ProcessStatus[] = [
  "draft",
  "configuring",
  "pending_approval",
  "approved",
  "scheduled",
  "published",
  "receiving",
  "paused",
  "closed",
];

/**
 * Kanban board with pointer drag-and-drop AND a keyboard-accessible alternative:
 * each card exposes a "grab" control; when grabbed, ← / → move it between
 * columns and Enter/Escape drop it. Status changes are announced via a live
 * region so screen-reader users get feedback.
 */
export function ProcessKanban({ items, onOpen, onMove }: KanbanProps) {
  const [grabbed, setGrabbed] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  const columnOf = (status: ProcessStatus): ProcessStatus =>
    COLUMNS.includes(status) ? status : "closed";

  const move = (id: string, current: ProcessStatus, dir: -1 | 1) => {
    const idx = COLUMNS.indexOf(columnOf(current));
    const nextIdx = Math.min(COLUMNS.length - 1, Math.max(0, idx + dir));
    const to = COLUMNS[nextIdx];
    if (to !== current) {
      onMove(id, to);
      setAnnounce(`Proceso movido a ${PROCESS_STATUS_META[to].label}.`);
    }
  };

  return (
    <div>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
      <div className="flex gap-3 overflow-x-auto pb-3">
        {COLUMNS.map((status) => {
          const columnItems = items.filter((p) => columnOf(p.processStatus) === status);
          return (
            <section
              key={status}
              aria-label={PROCESS_STATUS_META[status].label}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                if (id) {
                  onMove(id, status);
                  setAnnounce(`Proceso movido a ${PROCESS_STATUS_META[status].label}.`);
                }
              }}
              className="flex w-72 shrink-0 flex-col rounded-3xl fill-soft p-2 ring-1 ring-[color:var(--hairline)]"
            >
              <header className="flex items-center justify-between gap-2 px-2 py-2">
                <StatusPill intent={PROCESS_STATUS_META[status].intent}>
                  {PROCESS_STATUS_META[status].label}
                </StatusPill>
                <span className="text-xs font-bold tabular-nums text-ink-faint">{columnItems.length}</span>
              </header>

              <div className="flex flex-1 flex-col gap-2">
                {columnItems.map((p) => (
                  <motion.article
                    layout
                    key={p.id}
                    draggable
                    onDragStart={(e) => {
                      (e as unknown as DragEvent).dataTransfer?.setData("text/plain", p.id);
                    }}
                    className={`glass rounded-2xl p-3 ${grabbed === p.id ? "ring-2 ring-cyan-400" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        aria-label={
                          grabbed === p.id
                            ? "Soltar. Usa ← y → para cambiar de columna, Enter para confirmar."
                            : `${L.a11y.dragHandle}. ${L.a11y.moveWithKeyboard}`
                        }
                        aria-pressed={grabbed === p.id}
                        onClick={() => setGrabbed((g) => (g === p.id ? null : p.id))}
                        onKeyDown={(e) => {
                          if (grabbed !== p.id) return;
                          if (e.key === "ArrowLeft") {
                            e.preventDefault();
                            move(p.id, p.processStatus, -1);
                          } else if (e.key === "ArrowRight") {
                            e.preventDefault();
                            move(p.id, p.processStatus, 1);
                          } else if (e.key === "Enter" || e.key === "Escape") {
                            setGrabbed(null);
                          }
                        }}
                        className="mt-0.5 shrink-0 cursor-grab text-ink-faint hover:text-ink focus-visible:ring-2 focus-visible:ring-cyan-300"
                      >
                        <GripVertical className="h-4 w-4" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[0.65rem] text-ink-faint">{p.code}</p>
                        <button
                          type="button"
                          onClick={() => onOpen(p.id)}
                          className="block text-left text-sm font-bold text-ink transition-colors hover:text-cyan-400"
                        >
                          {p.title}
                        </button>
                        <p className="mt-1 text-xs text-ink-soft">{p.area || "—"}</p>
                        <p className="mt-1 text-[0.65rem] text-ink-faint">
                          {p.vacancies} {L.processes.columns.vacancies.toLowerCase()} ·{" "}
                          {formatDate(p.closingDate)}
                        </p>
                      </div>
                    </div>
                  </motion.article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
