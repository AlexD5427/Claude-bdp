import { useState } from "react";
import { motion } from "framer-motion";
import { GripVertical, MoveRight } from "lucide-react";
import { StatusChip } from "../../../design-system/components/StatusChip";
import { ActionMenu, type ActionItem } from "../../../design-system/components/ActionMenu";
import { allowedTransitions, canTransition, KANBAN_STATUSES, PROCESS_STATUS_META } from "../statuses";
import type { ProcessStatus, ProcessSummary } from "../types";

interface ProcessKanbanProps {
  rows: ProcessSummary[];
  onOpen: (id: string) => void;
  onMove: (id: string, status: ProcessStatus) => void;
  canMove: boolean;
}

/**
 * Status Kanban with drag-and-drop AND a keyboard-accessible alternative:
 * every card carries a "Mover a…" menu listing the valid target columns, so no
 * operation is drag-only (accessibility requirement). Invalid transitions are
 * rejected by `canTransition`. Moves are optimistic in the store, which rolls
 * back on synchronisation failure.
 */
export function ProcessKanban({ rows, onOpen, onMove, canMove }: ProcessKanbanProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<ProcessStatus | null>(null);

  const byStatus = (status: ProcessStatus) => rows.filter((r) => r.status === status);

  const handleDrop = (status: ProcessStatus) => {
    setOverCol(null);
    const id = dragId;
    setDragId(null);
    if (!id || !canMove) return;
    const row = rows.find((r) => r.id === id);
    if (!row || row.status === status) return;
    if (!canTransition(row.status, status)) return;
    onMove(id, status);
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {KANBAN_STATUSES.map((status) => {
        const items = byStatus(status);
        const meta = PROCESS_STATUS_META[status];
        return (
          <section
            key={status}
            aria-label={`Columna ${meta.label}`}
            onDragOver={(e) => {
              if (!canMove) return;
              e.preventDefault();
              setOverCol(status);
            }}
            onDragLeave={() => setOverCol((c) => (c === status ? null : c))}
            onDrop={() => handleDrop(status)}
            className={`flex w-72 shrink-0 flex-col rounded-3xl p-2 ring-1 transition-colors ${
              overCol === status
                ? "bg-cyan-500/10 ring-cyan-400/40"
                : "fill-soft ring-[color:var(--hairline)]"
            }`}
          >
            <header className="flex items-center justify-between px-2 py-2">
              <StatusChip meta={meta} />
              <span className="rounded-full fill-softer px-2 py-0.5 text-xs font-bold text-ink-soft">
                {items.length}
              </span>
            </header>

            <div className="flex min-h-[6rem] flex-1 flex-col gap-2 p-1">
              {items.length === 0 && (
                <p className="grid flex-1 place-items-center rounded-2xl border border-dashed border-[color:var(--hairline)] py-8 text-center text-xs text-ink-faint">
                  Sin procesos
                </p>
              )}
              {items.map((row) => {
                const targets: ActionItem[] = allowedTransitions(row.status)
                  .filter((s) => KANBAN_STATUSES.includes(s))
                  .map((s) => ({
                    key: s,
                    label: `Mover a “${PROCESS_STATUS_META[s].label}”`,
                    icon: MoveRight,
                    onSelect: () => onMove(row.id, s),
                    disabled: !canMove,
                  }));
                return (
                  <motion.div
                    layout
                    key={row.id}
                    draggable={canMove}
                    onDragStart={() => setDragId(row.id)}
                    onDragEnd={() => setDragId(null)}
                    onClick={() => onOpen(row.id)}
                    className={`glass group cursor-pointer rounded-2xl p-3 ${
                      dragId === row.id ? "opacity-50" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {canMove && (
                        <GripVertical className="mt-0.5 h-4 w-4 shrink-0 cursor-grab text-ink-faint" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-bold text-ink">{row.title}</p>
                        <p className="mt-0.5 truncate text-[0.7rem] text-ink-soft">
                          {row.area} · {row.location}
                        </p>
                        <p className="mt-1 text-[0.7rem] text-ink-faint">
                          {row.vacancies} vacantes · {row.assessmentCount} eval.
                        </p>
                      </div>
                      {targets.length > 0 && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <ActionMenu items={targets} label="Mover a otra columna" />
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
