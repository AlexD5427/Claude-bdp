import { Search, RefreshCw, SlidersHorizontal, Plus, Table2, LayoutGrid, Columns3, PieChart } from "lucide-react";
import { L, formatRelative } from "../../../content/locale";
import { Segmented, type SegmentedOption } from "../../../design-system/liquid-glass/Segmented";
import { syncState } from "../../../infrastructure/synchronization/syncState";
import type { ProcessView } from "./listState";

interface ToolbarProps {
  search: string;
  onSearch: (value: string) => void;
  view: ProcessView;
  onView: (v: ProcessView) => void;
  onOpenFilters: () => void;
  activeFilters: number;
  onRefresh: () => void;
  onCreate: () => void;
  canCreate: boolean;
  syncing: boolean;
}

const VIEW_OPTIONS: SegmentedOption<ProcessView>[] = [
  { value: "table", label: L.common.table, icon: <Table2 className="h-4 w-4" /> },
  { value: "cards", label: L.common.cards, icon: <LayoutGrid className="h-4 w-4" /> },
  { value: "kanban", label: L.common.board, icon: <Columns3 className="h-4 w-4" /> },
  { value: "summary", label: L.common.summary, icon: <PieChart className="h-4 w-4" /> },
];

/** The ProcessOS list toolbar: search, view switch, filters, refresh, create. */
export function ProcessToolbar({
  search,
  onSearch,
  view,
  onView,
  onOpenFilters,
  activeFilters,
  onRefresh,
  onCreate,
  canCreate,
  syncing,
}: ToolbarProps) {
  const sync = syncState.use();
  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={L.processes.searchPlaceholder}
            aria-label={L.common.search}
            className="w-full rounded-full fill-soft py-2.5 pl-10 pr-4 text-sm text-ink outline-none ring-1 ring-[color:var(--hairline)] placeholder:text-ink-faint focus-visible:ring-2 focus-visible:ring-cyan-300"
          />
        </div>

        <button
          type="button"
          onClick={onOpenFilters}
          className="inline-flex items-center gap-2 rounded-full fill-soft px-4 py-2.5 text-sm font-semibold text-ink ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-softer"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {L.common.filters}
          {activeFilters > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-cyan-500/80 px-1 text-xs font-bold text-white">
              {activeFilters}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onRefresh}
          aria-label={L.sync.refreshNow}
          title={`${L.sync.lastSynced}: ${sync.lastSyncedAt ? formatRelative(sync.lastSyncedAt) : L.sync.never}`}
          className="inline-flex items-center gap-2 rounded-full fill-soft px-4 py-2.5 text-sm font-semibold text-ink ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-softer"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">{L.common.refresh}</span>
        </button>

        {canCreate && (
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-4 py-2.5 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all duration-300 hover:-translate-y-0.5 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            {L.processes.newProcess}
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Segmented ariaLabel={L.common.view} value={view} options={VIEW_OPTIONS} onChange={onView} size="sm" />
        <p className="text-xs text-ink-faint">
          {L.sync.lastSynced}:{" "}
          {sync.lastSyncedAt ? formatRelative(sync.lastSyncedAt) : L.sync.never}
        </p>
      </div>
    </div>
  );
}
