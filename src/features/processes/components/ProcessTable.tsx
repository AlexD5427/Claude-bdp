import { Fragment } from "react";
import { motion } from "framer-motion";
import { ArrowUpDown } from "lucide-react";
import { ActionMenu, type ActionItem } from "../../../design-system/components/ActionMenu";
import { StatusChip } from "../../../design-system/components/StatusChip";
import { formatDate, formatRelative } from "../../../shared/format";
import { locale } from "../../../content/locale/es-BO";
import { PROCESS_STATUS_META, PUBLICATION_STATUS_META } from "../statuses";
import type { SortKey } from "../filters";
import type { ProcessSummary } from "../types";

interface ProcessTableProps {
  rows: ProcessSummary[];
  density: "comfortable" | "compact";
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (id: string) => void;
  buildActions: (row: ProcessSummary) => ActionItem[];
  sortKey: SortKey;
  onSort: (key: SortKey) => void;
}

const COLS = locale.processes.columns;

export function ProcessTable({
  rows,
  density,
  selected,
  onToggle,
  onToggleAll,
  onOpen,
  buildActions,
  sortKey,
  onSort,
}: ProcessTableProps) {
  const pad = density === "compact" ? "px-3 py-1.5" : "px-3 py-3";
  const text = density === "compact" ? "text-xs" : "text-sm";
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const SortableTh = ({ label, k }: { label: string; k: SortKey }) => (
    <th className={`${pad} text-left font-semibold`}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 transition-colors hover:text-ink ${
          sortKey === k ? "text-cyan-400" : ""
        }`}
      >
        {label}
        <ArrowUpDown className="h-3 w-3 opacity-60" />
      </button>
    </th>
  );

  return (
    <div className="glass overflow-hidden rounded-3xl">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] border-collapse">
          <thead>
            <tr className={`sticky top-0 z-10 bg-[color:var(--glass-bg-heavy)] text-[0.7rem] uppercase tracking-wide text-ink-soft backdrop-blur-xl`}>
              <th className={`${pad} w-10`}>
                <input
                  type="checkbox"
                  aria-label="Seleccionar todos"
                  checked={allSelected}
                  onChange={onToggleAll}
                  className="h-4 w-4 accent-cyan-500"
                />
              </th>
              <th className={`${pad} text-left font-semibold`}>{COLS.code}</th>
              <SortableTh label={COLS.name} k="title" />
              <th className={`${pad} text-left font-semibold`}>{COLS.area}</th>
              <th className={`${pad} text-left font-semibold`}>{COLS.location}</th>
              <SortableTh label={COLS.vacancies} k="vacancies" />
              <SortableTh label={COLS.applications} k="applications" />
              <th className={`${pad} text-left font-semibold`}>{COLS.assessments}</th>
              <th className={`${pad} text-left font-semibold`}>{COLS.status}</th>
              <th className={`${pad} text-left font-semibold`}>{COLS.publication}</th>
              <SortableTh label={COLS.closing} k="closing" />
              <SortableTh label={COLS.updated} k="updated" />
              <th className={`${pad} text-right font-semibold`}>{COLS.actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <Fragment key={row.id}>
                <motion.tr
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.015, 0.25) }}
                  onClick={() => onOpen(row.id)}
                  className={`cursor-pointer border-t border-[color:var(--hairline)] ${text} transition-colors hover:bg-[color:var(--fill-1)] ${
                    selected.has(row.id) ? "bg-cyan-500/10" : ""
                  }`}
                >
                  <td className={pad} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${row.title}`}
                      checked={selected.has(row.id)}
                      onChange={() => onToggle(row.id)}
                      className="h-4 w-4 accent-cyan-500"
                    />
                  </td>
                  <td className={`${pad} whitespace-nowrap font-mono text-[0.7rem] text-ink-soft`}>{row.code}</td>
                  <td className={`${pad} font-semibold text-ink`}>{row.title}</td>
                  <td className={`${pad} text-ink-soft`}>{row.area || "—"}</td>
                  <td className={`${pad} text-ink-soft`}>{row.location || "—"}</td>
                  <td className={`${pad} text-ink`}>{row.vacancies}</td>
                  <td className={`${pad} text-ink`}>{row.applications}</td>
                  <td className={`${pad} text-ink`}>{row.assessmentCount}</td>
                  <td className={pad}>
                    <StatusChip meta={PROCESS_STATUS_META[row.status]} />
                  </td>
                  <td className={pad}>
                    <StatusChip meta={PUBLICATION_STATUS_META[row.publicationStatus]} />
                  </td>
                  <td className={`${pad} whitespace-nowrap text-ink-soft`}>{formatDate(row.closingDate)}</td>
                  <td className={`${pad} whitespace-nowrap text-ink-faint`}>{formatRelative(row.updatedAt)}</td>
                  <td className={`${pad} text-right`} onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end">
                      <ActionMenu items={buildActions(row)} />
                    </div>
                  </td>
                </motion.tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
