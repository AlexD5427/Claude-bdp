import { useCallback, useMemo, useState } from "react";
import { L } from "../../../content/locale";
import { LoadingState, ErrorState, EmptyState } from "../../../components/States";
import { toast } from "../../../design-system/liquid-glass/toast";
import { GlassDialog } from "../../../design-system/liquid-glass/GlassDialog";
import { StatusPill } from "../../../design-system/liquid-glass/StatusPill";
import { useAsyncResult } from "../../../shared/useAsyncResult";
import { useDebouncedValue } from "../../../shared/hooks";
import { syncState } from "../../../infrastructure/synchronization/syncState";
import { useTalentPermissions } from "../../shared/permissions";
import {
  archiveAssessment,
  assessmentSource,
  closeAssessment,
  createAssessmentCommand,
  createAssessmentEntity,
  duplicateAssessmentCommand,
  getAssessment,
  listAssessments,
  pauseAssessment,
  publishAssessment,
  restoreAssessment,
  saveAssessmentDraft,
} from "../application/assessmentService";
import {
  activeAssessmentFilterCount,
  applyAssessmentFilters,
  applyAssessmentSort,
  assessmentListStats,
  assessmentListStore,
} from "./listState";
import { issuesOf, type ApiIssue } from "../api/contract";
import { adminSessionState } from "../api/adminSessionState";
import { AdminSessionDialog } from "./AdminSessionDialog";
import type { AssessmentDefinition, AssessmentSummary } from "../domain/assessment";
import type { SaveOutcome } from "../builder/useAssessmentDraft";
import { AssessmentToolbar } from "./AssessmentToolbar";
import { AssessmentFilterPanel } from "./AssessmentFilterPanel";
import { AssessmentCards } from "./AssessmentCards";
import { AssessmentTable } from "./AssessmentTable";
import { AssessmentSummaryView } from "./AssessmentSummaryView";
import { AssessmentRowMenu, type AssessmentRowAction } from "./AssessmentRowMenu";
import { ResultsPanel } from "./ResultsPanel";
import { AssessmentBuilder } from "../builder/AssessmentBuilder";
import { ImportWizard } from "./ImportWizard";

/**
 * Módulo «Evaluaciones».
 *
 * Listado conectado a la capa de servicios (mock encapsulado o Apps Script según
 * la configuración, siempre visible en pantalla), acciones de ciclo de vida con
 * confirmación para las sensibles, importación desde hoja de cálculo y el
 * constructor completo.
 *
 * No hay ninguna llamada HTTP aquí: todo pasa por `application/assessmentService`.
 */
export function EvaluacionesModule() {
  const state = assessmentListStore.use();
  const { permissions, userName } = useTalentPermissions();
  const [editing, setEditing] = useState<AssessmentDefinition | null>(null);
  const [importing, setImporting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [menu, setMenu] = useState<{ item: AssessmentSummary; anchor: HTMLElement } | null>(null);
  const [results, setResults] = useState<AssessmentSummary | null>(null);
  const [confirm, setConfirm] = useState<
    { action: "archive" | "duplicate"; item: AssessmentSummary } | null
  >(null);
  const [busy, setBusy] = useState(false);
  const adminSession = adminSessionState.use();
  const [dismissedPrompt, setDismissedPrompt] = useState(0);
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const needsSession = adminSession.status === "required";
  const showSessionDialog = sessionDialogOpen || (needsSession && adminSession.promptCount > dismissedPrompt);

  const source = useMemo(() => assessmentSource(), []);
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
      toast.success("Evaluación creada. Empieza por el título en «Configuración general».");
      setEditing(res.value);
      reload();
    } else {
      toast.error(res.error.message);
    }
  };

  /** Guarda el borrador y devuelve el resultado real al constructor. */
  const save = async (next: AssessmentDefinition): Promise<SaveOutcome> => {
    const res = await saveAssessmentDraft(next, userName);
    if (res.ok) {
      setEditing(res.value);
      reload();
      return "saved";
    }
    if (res.error.code === "conflict") {
      toast.error(L.sync.conflictMessage);
      return "conflict";
    }
    toast.error(res.error.message);
    return "error";
  };

  /**
   * Publica. Guarda primero el borrador y, si el servidor rechaza la publicación,
   * devuelve sus hallazgos para que el panel de revisión los muestre junto a los
   * locales (el servidor es la autoridad).
   */
  const publish = async (
    next: AssessmentDefinition,
    notes: string,
  ): Promise<{ ok: boolean; issues: ApiIssue[] }> => {
    const saved = await saveAssessmentDraft(next, userName);
    if (!saved.ok) {
      if (saved.error.code === "conflict") toast.error(L.sync.conflictMessage);
      else toast.error(saved.error.message);
      return { ok: false, issues: [] };
    }
    const res = await publishAssessment(saved.value.id, userName, notes);
    if (res.ok) {
      toast.success(L.builder.publish.published);
      setEditing(res.value);
      reload();
      return { ok: true, issues: [] };
    }
    toast.error(res.error.message);
    return { ok: false, issues: issuesOf(res.error) };
  };

  const runAction = async (action: AssessmentRowAction, item: AssessmentSummary) => {
    if (action === "open") {
      await open(item.id);
      return;
    }
    if (action === "results") {
      setResults(item);
      return;
    }
    if (action === "archive" || action === "duplicate") {
      setConfirm({ action, item });
      return;
    }
    setBusy(true);
    const runner = {
      publish: () => publishAssessment(item.id, userName),
      pause: () => pauseAssessment(item.id, userName),
      close: () => closeAssessment(item.id, userName),
      unarchive: () => restoreAssessment(item.id, userName),
    }[action];
    const res = await runner();
    setBusy(false);
    if (res.ok) {
      toast.success(L.common.saved);
      reload();
      return;
    }
    // Publicar desde el listado no muestra el panel de revisión, así que si el
    // rechazo trae hallazgos se abre la evaluación para que el usuario los vea
    // en lugar de dejarle un mensaje sin salida.
    if (action === "publish" && issuesOf(res.error).length > 0) {
      toast.warning(L.builder.publish.blocked);
      await open(item.id);
      return;
    }
    toast.error(res.error.message);
  };

  const confirmAction = async () => {
    if (!confirm) return;
    setBusy(true);
    const res =
      confirm.action === "archive"
        ? await archiveAssessment(confirm.item.id, userName)
        : await duplicateAssessmentCommand(confirm.item.id, userName);
    setBusy(false);
    setConfirm(null);
    if (!res.ok) {
      toast.error(res.error.message);
      return;
    }
    toast.success(confirm.action === "archive" ? "Evaluación archivada." : "Evaluación duplicada.");
    if (confirm.action === "duplicate") setEditing(res.value);
    reload();
  };

  const onDraftReady = async (draft: AssessmentDefinition) => {
    const res = await createAssessmentEntity(draft, userName);
    setImporting(false);
    if (res.ok) {
      toast.success("Borrador creado desde la importación. Revísalo antes de publicar.");
      setEditing(res.value);
      reload();
    } else {
      toast.error(res.error.message);
    }
  };

  const allItems = data?.items ?? [];
  const items = useMemo(
    () =>
      applyAssessmentSort(
        applyAssessmentFilters(allItems, { search: debouncedSearch, filters: state.filters }),
        state.sort,
      ),
    [allItems, debouncedSearch, state.filters, state.sort],
  );
  const stats = useMemo(() => assessmentListStats(allItems), [allItems]);
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
        onDuplicate={
          permissions.create
            ? () => {
                const summary = allItems.find((candidate) => candidate.id === editing.id);
                if (summary) setConfirm({ action: "duplicate", item: summary });
              }
            : undefined
        }
        onArchive={
          permissions.archive
            ? () => {
                const summary = allItems.find((candidate) => candidate.id === editing.id);
                if (summary) setConfirm({ action: "archive", item: summary });
              }
            : undefined
        }
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
        sort={state.sort}
        onSort={(sort) => assessmentListStore.set((s) => ({ ...s, sort }))}
        filtersOpen={filtersOpen}
        onToggleFilters={() => setFiltersOpen((value) => !value)}
        activeFilterCount={activeAssessmentFilterCount(state.filters)}
        onRefresh={reload}
        onCreate={create}
        onImport={() => setImporting(true)}
        canCreate={permissions.create}
        canImport={permissions.import}
        syncing={sync.inFlight > 0 || busy}
        source={source}
      />

      {filtersOpen && (
        <AssessmentFilterPanel
          filters={state.filters}
          onChange={(filters) => assessmentListStore.set((s) => ({ ...s, filters }))}
          onClose={() => setFiltersOpen(false)}
        />
      )}

      {allItems.length > 0 && (
        <dl className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <Stat label={L.assessments.stats.total} value={stats.total} />
          <Stat label={L.assessments.stats.published} value={stats.published} intent="success" />
          <Stat label={L.assessments.stats.drafts} value={stats.drafts} intent="warning" />
          <Stat label={L.assessments.stats.archived} value={stats.archived} />
        </dl>
      )}

      <p className="mb-3 rounded-2xl bg-amber-500/10 px-4 py-2 text-xs text-amber-200 ring-1 ring-amber-400/20">
        {L.assessments.disclaimer}
      </p>

      {source.isMock && (
        <p className="mb-3 rounded-2xl fill-soft px-4 py-2 text-xs text-ink-soft ring-1 ring-[color:var(--hairline)]">
          {L.assessments.source.mockNotice}
        </p>
      )}

      {needsSession && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-cyan-500/10 px-4 py-2 text-xs text-cyan-100 ring-1 ring-cyan-400/20">
          <span>{L.assessments.adminSession.required}</span>
          <button
            type="button"
            className="rounded-xl bg-white/10 px-3 py-1 font-bold ring-1 ring-white/20"
            onClick={() => setSessionDialogOpen(true)}
          >
            {L.assessments.adminSession.submit}
          </button>
        </div>
      )}

      {loading && !data ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <EmptyState
          message={
            allItems.length === 0
              ? L.assessments.empty
              : "Ninguna evaluación coincide con la búsqueda o los filtros."
          }
        />
      ) : state.view === "cards" ? (
        <AssessmentCards
          items={items}
          onOpen={open}
          onRowMenu={(id, anchor) => {
            const item = items.find((candidate) => candidate.id === id);
            if (item) setMenu({ item, anchor });
          }}
        />
      ) : state.view === "table" ? (
        <AssessmentTable
          items={items}
          onOpen={open}
          onRowMenu={(id, anchor) => {
            const item = items.find((candidate) => candidate.id === id);
            if (item) setMenu({ item, anchor });
          }}
        />
      ) : (
        <AssessmentSummaryView items={items} />
      )}

      {importing && (
        <ImportWizard by={userName} onClose={() => setImporting(false)} onDraftReady={onDraftReady} />
      )}

      {menu && (
        <AssessmentRowMenu
          anchor={menu.anchor}
          item={menu.item}
          permissions={permissions}
          onClose={() => setMenu(null)}
          onAction={(action) => {
            const item = menu.item;
            setMenu(null);
            void runAction(action, item);
          }}
        />
      )}

      {results && (
        <ResultsPanel
          open
          assessmentId={results.id}
          assessmentName={results.name}
          onClose={() => setResults(null)}
        />
      )}

      <AdminSessionDialog
        open={showSessionDialog}
        onClose={() => {
          setSessionDialogOpen(false);
          setDismissedPrompt(adminSessionState.get().promptCount);
          if (adminSessionState.get().status === "active") {
            toast.success(L.assessments.adminSession.opened);
            reload();
          }
        }}
      />

      <GlassDialog
        open={confirm !== null}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void confirmAction()}
        title={
          confirm?.action === "archive"
            ? L.assessments.actions.archiveConfirmTitle
            : L.assessments.actions.duplicateConfirmTitle
        }
        description={
          confirm?.action === "archive"
            ? L.assessments.actions.archiveConfirmMessage
            : L.assessments.actions.duplicateConfirmMessage
        }
        confirmLabel={confirm?.action === "archive" ? L.common.archive : L.common.duplicate}
        destructive={confirm?.action === "archive"}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  intent = "neutral",
}: {
  label: string;
  value: number;
  intent?: "neutral" | "success" | "warning";
}) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <dt className="sr-only">{label}</dt>
      <dd>
        <StatusPill intent={intent}>
          {label}: <strong className="ml-1 tabular-nums">{value}</strong>
        </StatusPill>
      </dd>
    </div>
  );
}
