import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plus,
  Search,
  SlidersHorizontal,
  X,
  RefreshCw,
  Rows3,
  Rows4,
  Download,
  Eye,
  Pencil,
  Copy,
  Send,
  PauseCircle,
  XCircle,
  Archive,
  History,
  Trash2,
  Table2,
  LayoutGrid,
  Kanban,
  Users2,
  PieChart,
} from "lucide-react";
import { Segmented } from "../../../design-system/components/Segmented";
import { StatusChip } from "../../../design-system/components/StatusChip";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { LoadingState, ErrorState, EmptyState } from "../../../components/States";
import { toast } from "../../../shared/toastStore";
import { toAppError } from "../../../shared/errors";
import { formatRelative } from "../../../shared/format";
import { env } from "../../../infrastructure/env";
import { locale } from "../../../content/locale/es-BO";
import type { ActionItem } from "../../../design-system/components/ActionMenu";
import { useActor, useCapabilities } from "../../access";
import { useAssessmentLinkOptions } from "../../assessments/store";
import {
  duplicateProcess,
  removeProcess,
  transitionProcess,
  useProcessOSData,
} from "../store";
import { processPrefsStore, type ProcessView } from "../prefs";
import { activeFilterCount, applyFilters, facetOptions } from "../filters";
import { computeProcessAnalytics } from "../analytics";
import {
  PROCESS_STATUS_META,
  PUBLICATION_STATUS_META,
  VISIBILITY_LABELS,
} from "../statuses";
import type { ProcessStatus, ProcessSummary, PublicationStatus, Visibility } from "../types";
import { ProcessTable } from "../components/ProcessTable";
import { ProcessCards } from "../components/ProcessCards";
import { ProcessKanban } from "../components/ProcessKanban";
import { ByProcessView } from "../components/ByProcessView";
import { ProcessEditor } from "../components/ProcessEditor";

const VIEW_OPTIONS = [
  { value: "table" as const, label: locale.views.table, icon: Table2 },
  { value: "cards" as const, label: locale.views.cards, icon: LayoutGrid },
  { value: "kanban" as const, label: locale.views.kanban, icon: Kanban },
  { value: "byProcess" as const, label: locale.views.byProcess, icon: Users2 },
  { value: "analytics" as const, label: locale.views.analytics, icon: PieChart },
];

export function ProcessOSPage() {
  const state = useProcessOSData();
  const prefs = processPrefsStore.use();
  const caps = useCapabilities();
  const actor = useActor();
  const assessmentOptions = useAssessmentLinkOptions();

  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<{ mode: "create" | "edit"; id: string | null } | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; kind: "delete" } | null>(null);

  const { view, density, filters } = prefs;
  const setPrefs = processPrefsStore.set;

  const options = useMemo(() => facetOptions(state.summaries), [state.summaries]);
  const filtered = useMemo(() => applyFilters(state.summaries, filters), [state.summaries, filters]);
  const analytics = useMemo(() => computeProcessAnalytics(state.summaries), [state.summaries]);
  const activeCount = activeFilterCount(filters);

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((r) => r.id))));

  const runTransition = async (id: string, status: ProcessStatus, message: string) => {
    try {
      await transitionProcess(id, status, actor);
      toast.success(message);
    } catch (err) {
      toast.error(toAppError(err).message);
    }
  };

  const buildActions = (row: ProcessSummary): ActionItem[] => {
    const items: ActionItem[] = [
      { key: "open", label: locale.common.open, icon: Eye, onSelect: () => setEditor({ mode: "edit", id: row.id }) },
      {
        key: "edit",
        label: locale.common.edit,
        icon: Pencil,
        disabled: !caps.editProcesses,
        onSelect: () => setEditor({ mode: "edit", id: row.id }),
      },
      {
        key: "duplicate",
        label: locale.common.duplicate,
        icon: Copy,
        disabled: !caps.createProcesses,
        onSelect: async () => {
          try {
            await duplicateProcess(row.id, actor);
            toast.success(locale.feedback.processDuplicated);
          } catch (err) {
            toast.error(toAppError(err).message);
          }
        },
      },
      {
        key: "publish",
        label: locale.common.publish,
        icon: Send,
        divider: true,
        disabled: !caps.publishProcesses,
        onSelect: () => runTransition(row.id, "publicado", locale.feedback.processPublished),
      },
      {
        key: "pause",
        label: locale.common.pause,
        icon: PauseCircle,
        disabled: !caps.publishProcesses,
        onSelect: () => runTransition(row.id, "pausado", locale.feedback.processPaused),
      },
      {
        key: "close",
        label: `${locale.common.close} proceso`,
        icon: XCircle,
        disabled: !caps.closeProcesses,
        onSelect: () => runTransition(row.id, "cerrado", locale.feedback.processClosed),
      },
      {
        key: "archive",
        label: locale.common.archive,
        icon: Archive,
        disabled: !caps.archiveProcesses,
        onSelect: () => runTransition(row.id, "archivado", locale.feedback.processArchived),
      },
      {
        key: "history",
        label: locale.common.history,
        icon: History,
        divider: true,
        onSelect: () => setEditor({ mode: "edit", id: row.id }),
      },
    ];
    if (caps.deleteProcesses) {
      items.push({
        key: "delete",
        label: locale.common.delete,
        icon: Trash2,
        tone: "danger",
        onSelect: () => setConfirm({ id: row.id, kind: "delete" }),
      });
    }
    return items;
  };

  const showChrome = state.status !== "loading" || state.summaries.length > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">{locale.processes.title}</h2>
          <p className="mt-1 text-sm text-ink-soft">{locale.processes.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {env.isDev && (
            <span className="rounded-full fill-soft px-3 py-1 text-[0.7rem] font-semibold text-ink-faint ring-1 ring-[color:var(--hairline)]">
              {locale.common.dataSourceDev}: {state.provider}
            </span>
          )}
          <button
            type="button"
            onClick={() => setEditor({ mode: "create", id: null })}
            disabled={!caps.createProcesses}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-4 py-2.5 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {locale.processes.create}
          </button>
        </div>
      </div>

      {/* Toolbar */}
      {showChrome && (
        <div className="glass flex flex-wrap items-center gap-2 rounded-2xl p-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              value={filters.query}
              onChange={(e) => setPrefs((p) => ({ ...p, filters: { ...p.filters, query: e.target.value } }))}
              placeholder={locale.processes.searchPlaceholder}
              aria-label={locale.common.search}
              className="w-full rounded-xl fill-soft py-2 pl-9 pr-3 text-sm text-ink outline-none ring-1 ring-[color:var(--hairline)] focus:ring-2 focus:ring-cyan-300"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold ring-1 transition-colors ${
              activeCount > 0
                ? "bg-cyan-500/15 text-cyan-300 ring-cyan-400/30"
                : "fill-soft text-ink-soft ring-[color:var(--hairline)] hover:text-ink"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {locale.common.filters}
            {activeCount > 0 && (
              <span className="grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-cyan-500 px-1 text-[0.65rem] font-bold text-white">
                {activeCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() =>
              setPrefs((p) => ({ ...p, density: p.density === "comfortable" ? "compact" : "comfortable" }))
            }
            title={density === "comfortable" ? "Vista compacta" : "Vista cómoda"}
            aria-label={locale.common.density}
            className="grid h-9 w-9 place-items-center rounded-xl fill-soft text-ink-soft ring-1 ring-[color:var(--hairline)] transition-colors hover:text-ink"
          >
            {density === "comfortable" ? <Rows4 className="h-4 w-4" /> : <Rows3 className="h-4 w-4" />}
          </button>

          <button
            type="button"
            disabled
            title="Exportar (próximamente)"
            className="grid h-9 w-9 cursor-not-allowed place-items-center rounded-xl fill-soft text-ink-faint ring-1 ring-[color:var(--hairline)] opacity-60"
          >
            <Download className="h-4 w-4" />
          </button>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-1 text-[0.7rem] text-ink-faint sm:inline-flex">
              <RefreshCw className={`h-3 w-3 ${state.status === "loading" ? "animate-spin" : ""}`} />
              {state.lastSyncedAt ? formatRelative(state.lastSyncedAt) : locale.common.synchronizing}
            </span>
            <Segmented<ProcessView>
              idBase="proc-view"
              ariaLabel={locale.common.view}
              size="sm"
              options={VIEW_OPTIONS}
              value={view}
              onChange={(v) => setPrefs((p) => ({ ...p, view: v }))}
            />
          </div>
        </div>
      )}

      {/* Filter panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="glass space-y-4 rounded-2xl p-4">
              <FacetGroup
                title={locale.processes.columns.status}
                values={Object.keys(PROCESS_STATUS_META) as ProcessStatus[]}
                labelFor={(v) => PROCESS_STATUS_META[v].label}
                selected={filters.status}
                onChange={(vals) => setPrefs((p) => ({ ...p, filters: { ...p.filters, status: vals } }))}
              />
              <FacetGroup
                title={locale.processes.columns.publication}
                values={Object.keys(PUBLICATION_STATUS_META) as PublicationStatus[]}
                labelFor={(v) => PUBLICATION_STATUS_META[v].label}
                selected={filters.publicationStatus}
                onChange={(vals) =>
                  setPrefs((p) => ({ ...p, filters: { ...p.filters, publicationStatus: vals } }))
                }
              />
              <FacetGroup
                title="Visibilidad"
                values={Object.keys(VISIBILITY_LABELS) as Visibility[]}
                labelFor={(v) => VISIBILITY_LABELS[v]}
                selected={filters.visibility}
                onChange={(vals) => setPrefs((p) => ({ ...p, filters: { ...p.filters, visibility: vals } }))}
              />
              {options.areas.length > 0 && (
                <FacetGroup
                  title={locale.processes.columns.area}
                  values={options.areas}
                  labelFor={(v) => v}
                  selected={filters.area}
                  onChange={(vals) => setPrefs((p) => ({ ...p, filters: { ...p.filters, area: vals } }))}
                />
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--hairline)] pt-3">
                <div className="flex items-center gap-2 text-xs text-ink-soft">
                  <span>{locale.processes.columns.assessments}:</span>
                  {(["all", "with", "without"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setPrefs((p) => ({ ...p, filters: { ...p.filters, assessments: v } }))}
                      className={`rounded-full px-2.5 py-1 font-semibold ring-1 transition-colors ${
                        filters.assessments === v
                          ? "bg-cyan-500/15 text-cyan-300 ring-cyan-400/30"
                          : "fill-soft ring-[color:var(--hairline)] hover:text-ink"
                      }`}
                    >
                      {v === "all" ? locale.common.all : v === "with" ? "Con evaluaciones" : "Sin evaluaciones"}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setPrefs((p) => ({ ...p, filters: { ...applyReset(p.filters) } }))}
                  className="inline-flex items-center gap-1.5 rounded-full fill-soft px-3 py-1.5 text-xs font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)] transition-colors hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" /> {locale.common.clearFilters}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      {state.status === "loading" && state.summaries.length === 0 ? (
        <LoadingState label="Cargando procesos…" />
      ) : state.status === "error" ? (
        <ErrorState message={state.error ?? "Error"} onRetry={() => location.reload()} />
      ) : view === "byProcess" ? (
        <ByProcessView />
      ) : view === "analytics" ? (
        <AnalyticsView analytics={analytics} />
      ) : filtered.length === 0 ? (
        <EmptyState
          message={activeCount > 0 ? locale.processes.emptyFiltered : locale.processes.empty}
        />
      ) : view === "table" ? (
        <ProcessTable
          rows={filtered}
          density={density}
          selected={selected}
          onToggle={toggleSelect}
          onToggleAll={toggleAll}
          onOpen={(id) => setEditor({ mode: "edit", id })}
          buildActions={buildActions}
          sortKey={filters.sortKey}
          onSort={(k) =>
            setPrefs((p) => ({
              ...p,
              filters: {
                ...p.filters,
                sortKey: k,
                sortDir: p.filters.sortKey === k && p.filters.sortDir === "desc" ? "asc" : "desc",
              },
            }))
          }
        />
      ) : view === "cards" ? (
        <ProcessCards rows={filtered} onOpen={(id) => setEditor({ mode: "edit", id })} buildActions={buildActions} />
      ) : (
        <ProcessKanban
          rows={filtered}
          canMove={caps.editProcesses}
          onOpen={(id) => setEditor({ mode: "edit", id })}
          onMove={(id, status) => runTransition(id, status, `Estado actualizado a “${PROCESS_STATUS_META[status].label}”.`)}
        />
      )}

      {/* Bulk action bar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="glass-heavy fixed bottom-24 left-1/2 z-[95] flex -translate-x-1/2 items-center gap-3 rounded-full px-4 py-2.5 shadow-glass no-print"
          >
            <span className="text-sm font-bold text-ink">{selected.size} seleccionados</span>
            <button
              type="button"
              disabled={!caps.archiveProcesses}
              onClick={async () => {
                for (const id of selected) await runTransition(id, "archivado", "");
                toast.success("Procesos archivados.");
                setSelected(new Set());
              }}
              className="inline-flex items-center gap-1.5 rounded-full fill-softer px-3 py-1.5 text-xs font-semibold text-ink ring-1 ring-[color:var(--hairline)] disabled:opacity-40"
            >
              <Archive className="h-3.5 w-3.5" /> {locale.common.archive}
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="grid h-7 w-7 place-items-center rounded-full text-ink-faint hover:text-ink"
              aria-label="Limpiar selección"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Editor */}
      {editor && (
        <ProcessEditor
          open
          mode={editor.mode}
          processId={editor.id}
          assessmentOptions={assessmentOptions}
          onClose={() => setEditor(null)}
        />
      )}

      {/* Destructive confirm */}
      <ConfirmDialog
        open={confirm !== null}
        title="Eliminar proceso"
        message="Esta acción no se puede deshacer. ¿Deseas eliminar el proceso definitivamente?"
        confirmLabel={locale.common.delete}
        onConfirm={async () => {
          if (!confirm) return;
          try {
            await removeProcess(confirm.id);
            toast.success("Proceso eliminado.");
          } catch (err) {
            toast.error(toAppError(err).message);
          }
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

/* ---- helpers ----------------------------------------------------- */

function applyReset(filters: ReturnType<typeof processPrefsStore.get>["filters"]) {
  return {
    ...filters,
    query: "",
    status: [],
    publicationStatus: [],
    visibility: [],
    area: [],
    location: [],
    assessments: "all" as const,
  };
}

function FacetGroup<T extends string>({
  title,
  values,
  labelFor,
  selected,
  onChange,
}: {
  title: string;
  values: T[];
  labelFor: (v: T) => string;
  selected: T[];
  onChange: (vals: T[]) => void;
}) {
  const toggle = (v: T) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div>
      <p className="mb-1.5 text-[0.7rem] font-bold uppercase tracking-wide text-ink-faint">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => {
          const on = selected.includes(v);
          return (
            <button
              key={v}
              type="button"
              onClick={() => toggle(v)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition-colors ${
                on
                  ? "bg-cyan-500/15 text-cyan-300 ring-cyan-400/30"
                  : "fill-soft text-ink-soft ring-[color:var(--hairline)] hover:text-ink"
              }`}
            >
              {labelFor(v)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AnalyticsView({ analytics }: { analytics: ReturnType<typeof computeProcessAnalytics> }) {
  const tiles = [
    { label: "Procesos totales", value: analytics.total },
    { label: "Activos", value: analytics.active },
    { label: "Publicados", value: analytics.published },
    { label: "Cierran pronto (7 días)", value: analytics.closingSoon },
    { label: "Sin evaluaciones", value: analytics.withoutAssessments },
  ];
  const maxArea = Math.max(1, ...analytics.byArea.map((a) => a.value));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.label} className="glass rounded-2xl p-4">
            <div className="text-2xl font-black text-ink">{t.value}</div>
            <div className="mt-1 text-[0.7rem] uppercase tracking-wide text-ink-soft">{t.label}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass rounded-3xl p-5">
          <h3 className="mb-3 text-sm font-bold text-ink">Procesos por área</h3>
          <div className="space-y-2">
            {analytics.byArea.map((a) => (
              <div key={a.label} className="flex items-center gap-2">
                <span className="w-32 shrink-0 truncate text-xs text-ink-soft">{a.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full fill-softer">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#00b0d8] to-[#005baa]"
                    style={{ width: `${(a.value / maxArea) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-right text-xs font-bold text-ink">{a.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="glass rounded-3xl p-5">
          <h3 className="mb-3 text-sm font-bold text-ink">Distribución por estado</h3>
          <div className="flex flex-wrap gap-2">
            {analytics.byStatus.map((s) => (
              <span key={s.label} className="inline-flex items-center gap-1.5 rounded-full fill-soft px-3 py-1.5 text-xs ring-1 ring-[color:var(--hairline)]">
                {PROCESS_STATUS_META[s.label as ProcessStatus] ? (
                  <StatusChip meta={PROCESS_STATUS_META[s.label as ProcessStatus]} />
                ) : (
                  <span className="text-ink-soft">{s.label}</span>
                )}
                <span className="font-bold text-ink">{s.value}</span>
              </span>
            ))}
          </div>
          <p className="mt-4 text-[0.7rem] text-ink-faint">
            Los indicadores de duración y tasas se habilitarán cuando el backend registre las marcas de
            tiempo correspondientes (datos de muestra evitados intencionalmente).
          </p>
        </div>
      </div>
    </div>
  );
}
