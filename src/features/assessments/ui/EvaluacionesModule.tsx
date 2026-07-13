import { useCallback, useState } from "react";
import { L } from "../../../content/locale";
import { LoadingState, ErrorState, EmptyState } from "../../../components/States";
import { toast } from "../../../design-system/liquid-glass/toast";
import { useAsyncResult } from "../../../shared/useAsyncResult";
import { useDebouncedValue } from "../../../shared/hooks";
import { syncState } from "../../../infrastructure/synchronization/syncState";
import { useTalentPermissions } from "../../shared/permissions";
import {
  listAssessments, getAssessment, createAssessmentCommand, createAssessmentEntity,
  saveAssessmentDraft, publishAssessment, pauseAssessment, closeAssessment,
  archiveAssessment, duplicateAssessmentCommand,
} from "../application/assessmentService";
import { assessmentListStore, applyAssessmentFilters } from "./listState";
import type { AssessmentDefinition } from "../domain/assessment";
import { AssessmentToolbar } from "./AssessmentToolbar";
import { AssessmentCards } from "./AssessmentCards";
import { AssessmentTable } from "./AssessmentTable";
import { AssessmentSummaryView } from "./AssessmentSummaryView";
import { AssessmentRowMenu } from "./AssessmentRowMenu";
import { AssessmentBuilder } from "../builder/AssessmentBuilder";
import { ImportWizard } from "./ImportWizard";

/**
 * AssessmentOS — the new "Evaluaciones" module. A universal assessment-authoring
 * platform: dashboard, lifecycle actions, spreadsheet import, and the visual
 * builder with controlled versioning. Persists through the provider-neutral
 * repository (mock by default, Apps Script when enabled).
 */
export function EvaluacionesModule() {
  const state = assessmentListStore.use();
  const { permissions, userName } = useTalentPermissions();
  const [editing, setEditing] = useState<AssessmentDefinition | null>(null);
  const [importing, setImporting] = useState(false);
  const [menu, setMenu] = useState<{ id: string; anchor: HTMLElement } | null>(null);

  const debouncedSearch = useDebouncedValue(state.search, 250);
  const { data, loading, error, reload } = useAsyncResult(
    () => listAssessments(),
    [debouncedSearch, editing === null, importing],
  );

  const open = useCallback(async (id: string) => {
    const res = await getAssessment(id);
    if (res.ok) setEditing(res.value);
    else toast.error(res.error.message);
  }, []);

  const create = async () => {
    const res = await createAssessmentCommand("Nueva evaluación", "knowledge", userName);
    if (res.ok) {
      toast.success("Evaluación creada.");
      setEditing(res.value);
      reload();
    } else toast.error(res.error.message);
  };

  const save = async (next: AssessmentDefinition) => {
    const res = await saveAssessmentDraft(next, userName);
    if (res.ok) {
      toast.success(L.common.saved);
      setEditing(res.value);
      reload();
    } else if (res.error.code === "conflict") {
      toast.error(L.sync.conflictMessage);
    } else toast.error(res.error.message);
  };

  const publish = async (next: AssessmentDefinition) => {
    // Persist the latest draft content first, then publish it as a version.
    const saved = await saveAssessmentDraft(next, userName);
    if (!saved.ok) {
      toast.error(saved.error.message);
      return;
    }
    const res = await publishAssessment(next.id, userName);
    if (res.ok) {
      toast.success("Evaluación publicada.");
      setEditing(res.value);
      reload();
    } else toast.error(res.error.message);
  };

  const transition = async (action: "publish" | "pause" | "close" | "archive" | "duplicate", id: string) => {
    const fn = { publish: publishAssessment, pause: pauseAssessment, close: closeAssessment, archive: archiveAssessment, duplicate: duplicateAssessmentCommand }[action];
    const res = await fn(id, userName);
    if (res.ok) {
      toast.success(action === "duplicate" ? "Evaluación duplicada." : L.common.saved);
      if (action === "duplicate") setEditing(res.value);
      reload();
    } else toast.error(res.error.message);
  };

  const onDraftReady = async (draft: AssessmentDefinition) => {
    const res = await createAssessmentEntity(draft, userName);
    setImporting(false);
    if (res.ok) {
      toast.success("Borrador creado desde la importación. Revísalo antes de publicar.");
      setEditing(res.value);
      reload();
    } else toast.error(res.error.message);
  };

  const allItems = data?.items ?? [];
  const items = applyAssessmentFilters(allItems, { ...state, search: debouncedSearch });
  const sync = syncState.use();

  if (editing) {
    return (
      <AssessmentBuilder
        assessment={editing}
        permissions={permissions}
        onBack={() => {
          setEditing(null);
          reload();
        }}
        onSave={save}
        onPublish={publish}
      />
    );
  }

  return (
    <div>
      <AssessmentToolbar
        search={state.search}
        onSearch={(search) => assessmentListStore.set((s) => ({ ...s, search }))}
        view={state.view}
        onView={(view) => assessmentListStore.set((s) => ({ ...s, view }))}
        onRefresh={reload}
        onCreate={create}
        onImport={() => setImporting(true)}
        canCreate={permissions.create}
        canImport={permissions.import}
        syncing={sync.inFlight > 0}
      />

      <p className="mb-3 rounded-2xl bg-amber-500/10 px-4 py-2 text-xs text-amber-200 ring-1 ring-amber-400/20">
        {L.assessments.disclaimer}
      </p>

      {loading && !data ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <EmptyState message={allItems.length === 0 ? L.assessments.empty : "Ninguna evaluación coincide con la búsqueda."} />
      ) : state.view === "cards" ? (
        <AssessmentCards items={items} onOpen={open} />
      ) : state.view === "table" ? (
        <AssessmentTable items={items} onOpen={open} onRowMenu={(id, anchor) => setMenu({ id, anchor })} />
      ) : (
        <AssessmentSummaryView items={items} />
      )}

      {importing && <ImportWizard by={userName} onClose={() => setImporting(false)} onDraftReady={onDraftReady} />}

      {menu && (
        <AssessmentRowMenu
          anchor={menu.anchor}
          permissions={permissions}
          onClose={() => setMenu(null)}
          onOpen={() => { open(menu.id); setMenu(null); }}
          onAction={(action) => { transition(action, menu.id); setMenu(null); }}
        />
      )}
    </div>
  );
}
