import { motion } from "framer-motion";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";
import { L, formatDate, formatRelative } from "../../../content/locale";
import { StatusPill } from "../../../design-system/liquid-glass/StatusPill";
import { PROCESS_STATUS_META, PUBLICATION_STATUS_META } from "../domain/status";
import { listContainer, listItem } from "../../../design-system/motion";
import type { ProcessSummary } from "../domain/models";
import type { Density, SortKey } from "./listState";

interface TableProps {
  items: ProcessSummary[];
  density: Density;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (key: SortKey) => void;
  onOpen: (id: string) => void;
  onRowMenu: (id: string, anchor: HTMLElement) => void;
}

const HEAD: { key: string; label: string; sortKey?: SortKey; align?: "right" }[] = [
  { key: "code", label: L.processes.columns.code, sortKey: "code" },
  { key: "title", label: L.processes.columns.title, sortKey: "title" },
  { key: "area", label: L.processes.columns.area, sortKey: "area" },
  { key: "location", label: L.processes.columns.location },
  { key: "vacancies", label: L.processes.columns.vacancies, sortKey: "vacancies", align: "right" },
  { key: "applications", label: L.processes.columns.applications, sortKey: "applications", align: "right" },
  { key: "assessments", label: L.processes.columns.assessments, align: "right" },
  { key: "status", label: L.processes.columns.status },
  { key: "publication", label: L.processes.columns.publication },
  { key: "opening", label: L.processes.columns.opening, sortKey: "openingDate" },
  { key: "closing", label: L.processes.columns.closing, sortKey: "closingDate" },
  { key: "updated", label: L.processes.columns.updated, sortKey: "updatedAt" },
  { key: "actions", label: L.processes.columns.actions },
];

/** The default ProcessOS table view: sticky header, sortable, responsive. */
export function ProcessTable({ items, density, sort, onSort, onOpen, onRowMenu }: TableProps) {
  const pad = density === "compact" ? "px-3 py-2" : "px-3.5 py-3";
  return (
    <div className="glass overflow-hidden rounded-3xl">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{L.processes.listTitle}</caption>
          <thead>
            <tr className="sticky top-0 z-10 bg-[color:var(--glass-bg-heavy)] backdrop-blur-xl">
              {HEAD.map((h) => (
                <th
                  key={h.key}
                  scope="col"
                  className={`${pad} text-left text-xs font-bold uppercase tracking-wide text-ink-soft ${h.align === "right" ? "text-right" : ""}`}
                >
                  {h.sortKey ? (
                    <button
                      type="button"
                      onClick={() => onSort(h.sortKey!)}
                      className="inline-flex items-center gap-1 hover:text-ink"
                      aria-label={`${L.a11y.sortColumn}: ${h.label}`}
                    >
                      {h.label}
                      <ArrowUpDown className={`h-3 w-3 ${sort.key === h.sortKey ? "text-cyan-400" : "opacity-40"}`} />
                    </button>
                  ) : (
                    h.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <motion.tbody variants={listContainer} initial="hidden" animate="show">
            {items.map((p) => (
              <motion.tr
                key={p.id}
                variants={listItem}
                className="border-t border-[color:var(--hairline)] transition-colors hover:bg-white/5"
              >
                <td className={`${pad} font-mono text-xs text-ink-soft`}>{p.code}</td>
                <td className={pad}>
                  <button
                    type="button"
                    onClick={() => onOpen(p.id)}
                    className="text-left font-semibold text-ink transition-colors hover:text-cyan-400"
                  >
                    {p.title}
                  </button>
                </td>
                <td className={`${pad} text-ink-soft`}>{p.area || "—"}</td>
                <td className={`${pad} text-ink-soft`}>{p.location || "—"}</td>
                <td className={`${pad} text-right tabular-nums text-ink`}>{p.vacancies}</td>
                <td className={`${pad} text-right tabular-nums text-ink`}>{p.applications}</td>
                <td className={`${pad} text-right tabular-nums text-ink-soft`}>{p.assessmentCount}</td>
                <td className={pad}>
                  <StatusPill intent={PROCESS_STATUS_META[p.processStatus].intent}>
                    {PROCESS_STATUS_META[p.processStatus].label}
                  </StatusPill>
                </td>
                <td className={pad}>
                  <StatusPill intent={PUBLICATION_STATUS_META[p.publicationStatus].intent}>
                    {PUBLICATION_STATUS_META[p.publicationStatus].label}
                  </StatusPill>
                </td>
                <td className={`${pad} whitespace-nowrap text-ink-soft`}>{formatDate(p.openingDate)}</td>
                <td className={`${pad} whitespace-nowrap text-ink-soft`}>{formatDate(p.closingDate)}</td>
                <td className={`${pad} whitespace-nowrap text-ink-faint`}>{formatRelative(p.updatedAt)}</td>
                <td className={pad}>
                  <button
                    type="button"
                    aria-label={L.common.moreActions}
                    onClick={(e) => onRowMenu(p.id, e.currentTarget)}
                    className="grid h-8 w-8 place-items-center rounded-full text-ink-soft transition-colors hover:fill-softer hover:text-ink"
                  >
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
