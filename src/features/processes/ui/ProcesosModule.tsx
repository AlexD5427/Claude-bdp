import { useCallback, useState } from "react";
import { L } from "../../../content/locale";
import { LoadingState, ErrorState, EmptyState } from "../../../components/States";
import { toast } from "../../../design-system/liquid-glass/toast";
import { useAsyncResult } from "../../../shared/useAsyncResult";
import { useDebouncedValue } from "../../../shared/hooks";
import { processListStore, applyProcessFilters, activeFilterCount, emptyFilters, type SortKey } from "./listState";
import {
  listProcesses, getProcess, createProcessCommand, saveProcessDraft,
  publishProcess, pauseProcess, closeProcess, archiveProcess, duplicateProcessCommand,
} from "../application/processService";
import { syncState } from "../../../infrastructure/synchronization/syncState";
import { useTalentPermissions } from "../../shared/permissions";
import { listLinkableAssessments, type LinkableAssessment } from "../../evaluaciones";
import type { RecruitmentProcess } from "../domain/models";
import type { ProcessStatus } from "../domain/status";
import { ProcessToolbar } from "./ProcessToolbar";
import { ProcessFilterPanel } from "./ProcessFilterPanel";
import { ProcessTable } from "./ProcessTable";
import { ProcessCards } from "./ProcessCards";
import { ProcessKanban } from "./ProcessKanban";
import { ProcessSummaryView } from "./ProcessSummaryView";
import { ProcessEditor } from "./ProcessEditor";
import { RowActionMenu } from "./RowActionMenu";

/**
 * ProcessOS — the rebuilt "Procesos" module. Manages RecruitmentProcess entities
 * (not merely a candidate grouping): search, filters, saved-view-ready state,
 * four views (table/cards/kanban/summary), editor, publication, and persistence
 * through the provider-neutral repository.
 */
export function ProcesosModule() {
  const state = processListStore.use();
  const { permissions, userName } = useTalentPermissions();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editing, setEditing] = useState<RecruitmentProcess | null>(null);
  const [menu, setMenu] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [assessments, setAssessments] = useState<LinkableAssessment[]>([]);

  const debouncedSearch = useDebouncedValue(state.search, 250);

  const { data, loading, error, reload } = useAsyncResult(
    () => listProcesses({ search: "" }),
    [debouncedSearch, editing === null],
  );

  // Catálogo de evaluaciones publicables, solo para la sección de vinculación.
  const loadAssessments = useCallback(async () => {
    const res = await listLinkableAssessments();
    if (res.ok) setAssessments(res.value);
  }, []);

  const openEditor = useCallback(
    async (id: string) => {
      await loadAssessments();
      const res = await getProcess(id);
      if (res.ok) setEditing(res.value);
      else toast.error(res.error.message);
    },
    [loadAssessments],
  );

  const create = async () => {
    const res = await createProcessCommand("Nuevo proceso", userName);
    if (res.ok) {
      toast.success("Proceso creado.");
      await loadAssessments();
      setEditing(res.value);
      reload();
    } else toast.error(res.error.message);
  };

  const save = async (next: RecruitmentProcess) => {
    const res = await saveProcessDraft(next, userName);
    if (res.ok) {
      toast.success(L.common.saved);
      setEditing(res.value);
      reload();
    } else if (res.error.code === "conflict") {
      toast.error(L.sync.conflictMessage);
    } else {
      toast.error(res.error.message);
    }
  };

  const transition = async (
    action: "publish" | "pause" | "close" | "archive" | "duplicate",
    id: string,
  ) => {
    const fn = {
      publish: publishProcess,
      pause: pauseProcess,
      close: closeProcess,
      archive: archiveProcess,
      duplicate: duplicateProcessCommand,
    }[action];
    const res = await fn(id, userName);
    if (res.ok) {
      toast.success(
        action === "publish" ? "Proceso publicado."
        : action === "duplicate" ? "Proceso duplicado."
        : L.common.saved,
      );
      if (action === "duplicate") setEditing(res.value);
      else if (editing?.id === id) setEditing(res.value);
      reload();
    } else toast.error(res.error.message);
  };

  const kanbanMove = async (id: string, to: ProcessStatus) => {
    // Optimistic: fetch, patch status, save; roll back on failure via reload.
    const res = await getProcess(id);
    if (!res.ok) return;
    const saved = await saveProcessDraft({ ...res.value, processStatus: to }, userName);
    if (saved.ok) {
      toast.success(L.common.saved);
      reload();
    } else {
      toast.error(saved.error.message);
      reload();
    }
  };

  const allItems = data?.items ?? [];
  const items = applyProcessFilters(allItems, { ...state, search: debouncedSearch });
  const sync = syncState.use();

  return (
    <div>
      <ProcessToolbar
        search={state.search}
        onSearch={(search) => processListStore.set((s) => ({ ...s, search }))}
        view={state.view}
        onView={(view) => processListStore.set((s) => ({ ...s, view }))}
        onOpenFilters={() => setFiltersOpen(true)}
        activeFilters={activeFilterCount(state.filters)}
        onRefresh={reload}
        onCreate={create}
        canCreate={permissions.create}
        syncing={sync.inFlight > 0}
      />

      {loading && !data ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <EmptyState message={allItems.length === 0 ? L.processes.empty : "Ningún proceso coincide con los filtros."} />
      ) : state.view === "table" ? (
        <ProcessTable
          items={items}
          density={state.density}
          sort={state.sort}
          onSort={(key: SortKey) =>
            processListStore.set((s) => ({
              ...s,
              sort: { key, dir: s.sort.key === key && s.sort.dir === "asc" ? "desc" : "asc" },
            }))
          }
          onOpen={openEditor}
          onRowMenu={(id, anchor) => setMenu({ id, anchor })}
        />
      ) : state.view === "cards" ? (
        <ProcessCards items={items} onOpen={openEditor} />
      ) : state.view === "kanban" ? (
        <ProcessKanban items={items} onOpen={openEditor} onMove={kanbanMove} />
      ) : (
        <ProcessSummaryView items={items} />
      )}

      <ProcessFilterPanel
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={state.filters}
        onChange={(filters) => processListStore.set((s) => ({ ...s, filters }))}
        onClear={() => processListStore.set((s) => ({ ...s, filters: emptyFilters() }))}
        items={allItems}
      />

      {editing && (
        <ProcessEditor
          process={editing}
          assessments={assessments}
          permissions={permissions}
          onClose={() => setEditing(null)}
          onSave={save}
          onTransition={(action) => transition(action, editing.id)}
        />
      )}

      {menu && (
        <RowActionMenu
          anchor={menu.anchor}
          permissions={permissions}
          onClose={() => setMenu(null)}
          onOpen={() => {
            openEditor(menu.id);
            setMenu(null);
          }}
          onAction={(action) => {
            transition(action, menu.id);
            setMenu(null);
          }}
        />
      )}
    </div>
  );
}
