import { Database, FileUp, Filter, LayoutGrid, PieChart, Plus, RefreshCw, Search, Table2 } from "lucide-react";
import { L, formatRelative } from "../../../content/locale";
import { Segmented, type SegmentedOption } from "../../../design-system/liquid-glass/Segmented";
import { Select } from "../../../design-system/liquid-glass/fields";
import { StatusPill } from "../../../design-system/liquid-glass/StatusPill";
import { syncState } from "../../../infrastructure/synchronization/syncState";
import type { AssessmentSort, AssessmentView } from "./listState";

interface ToolbarProps {
  search: string;
  onSearch: (value: string) => void;
  view: AssessmentView;
  onView: (view: AssessmentView) => void;
  sort: AssessmentSort;
  onSort: (sort: AssessmentSort) => void;
  filtersOpen: boolean;
  onToggleFilters: () => void;
  activeFilterCount: number;
  onRefresh: () => void;
  onCreate: () => void;
  onImport: () => void;
  canCreate: boolean;
  canImport: boolean;
  syncing: boolean;
  /** Origen de datos activo, mostrado siempre para evitar mezclas silenciosas. */
  source: { label: string; isMock: boolean };
}

const VIEW_OPTIONS: SegmentedOption<AssessmentView>[] = [
  { value: "cards", label: L.common.cards, icon: <LayoutGrid className="h-4 w-4" /> },
  { value: "table", label: L.common.table, icon: <Table2 className="h-4 w-4" /> },
  { value: "summary", label: L.common.summary, icon: <PieChart className="h-4 w-4" /> },
];

const SORT_OPTIONS: { value: AssessmentSort; label: string }[] = [
  { value: "recent", label: L.assessments.sort.recent },
  { value: "oldest", label: L.assessments.sort.oldest },
  { value: "name", label: L.assessments.sort.name },
  { value: "questions", label: L.assessments.sort.questions },
];

/** Barra de herramientas del listado de evaluaciones. */
export function AssessmentToolbar({
  search,
  onSearch,
  view,
  onView,
  sort,
  onSort,
  filtersOpen,
  onToggleFilters,
  activeFilterCount,
  onRefresh,
  onCreate,
  onImport,
  canCreate,
  canImport,
  syncing,
  source,
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
            onChange={(event) => onSearch(event.target.value)}
            placeholder={L.assessments.searchPlaceholder}
            aria-label={L.common.search}
            className="w-full rounded-full fill-soft py-2.5 pl-10 pr-4 text-sm text-ink outline-none ring-1 ring-[color:var(--hairline)] placeholder:text-ink-faint focus-visible:ring-2 focus-visible:ring-cyan-300"
          />
        </div>
        <button
          type="button"
          onClick={onToggleFilters}
          aria-expanded={filtersOpen}
          className="inline-flex items-center gap-2 rounded-full fill-soft px-4 py-2.5 text-sm font-semibold text-ink ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-softer focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <Filter className="h-4 w-4" />
          <span className="hidden sm:inline">{L.common.filters}</span>
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-cyan-500/25 px-1.5 text-xs font-bold text-cyan-100">
              {activeFilterCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onRefresh}
          aria-label={L.sync.refreshNow}
          className="inline-flex items-center gap-2 rounded-full fill-soft px-4 py-2.5 text-sm font-semibold text-ink ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-softer focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">{L.common.refresh}</span>
        </button>
        {canImport && (
          <button
            type="button"
            onClick={onImport}
            className="inline-flex items-center gap-2 rounded-full fill-soft px-4 py-2.5 text-sm font-semibold text-ink ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-softer focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <FileUp className="h-4 w-4" /> <span className="hidden sm:inline">{L.assessments.importFromExcel}</span>
          </button>
        )}
        {canCreate && (
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-4 py-2.5 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-[filter,box-shadow] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-cyan-200 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" /> {L.assessments.newAssessment}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented ariaLabel={L.common.view} value={view} options={VIEW_OPTIONS} onChange={onView} size="sm" />
          <label className="inline-flex items-center gap-1.5 text-xs text-ink-faint">
            <span className="hidden sm:inline">{L.assessments.sort.label}</span>
            <Select
              value={sort}
              onChange={(event) => onSort(event.target.value as AssessmentSort)}
              aria-label={L.assessments.sort.label}
              className="!w-auto !py-1.5 !text-xs"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill intent={source.isMock ? "warning" : "success"} icon={<Database className="h-3.5 w-3.5" />}>
            {source.label}
          </StatusPill>
          <p className="text-xs text-ink-faint">
            {L.sync.lastSynced}: {sync.lastSyncedAt ? formatRelative(sync.lastSyncedAt) : L.sync.never}
          </p>
        </div>
      </div>
    </div>
  );
}
