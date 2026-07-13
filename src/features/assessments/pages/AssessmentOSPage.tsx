import { useMemo, useState, lazy, Suspense } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Search,
  FileUp,
  LayoutTemplate,
  Library,
  Table2,
  LayoutGrid,
  PieChart,
  Eye,
  Pencil,
  Copy,
  PauseCircle,
  Archive,
  Trash2,
  Clock,
  ListChecks,
  RefreshCw,
} from "lucide-react";
import { Segmented } from "../../../design-system/components/Segmented";
import { StatusChip } from "../../../design-system/components/StatusChip";
import { ActionMenu, type ActionItem } from "../../../design-system/components/ActionMenu";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { LoadingState, ErrorState, EmptyState } from "../../../components/States";
import { toast } from "../../../shared/toastStore";
import { toAppError } from "../../../shared/errors";
import { formatDuration, formatRelative } from "../../../shared/format";
import { env } from "../../../infrastructure/env";
import { locale } from "../../../content/locale/es-BO";
import { popIn } from "../../../design-system/motion";
import { useActor, useCapabilities } from "../../access";
import {
  createAssessment,
  duplicateAssessment,
  getAssessment,
  removeAssessment,
  transitionAssessment,
  useAssessmentOSData,
} from "../store";
import { ASSESSMENT_STATUS_META, ASSESSMENT_PUBLICATION_META } from "../lifecycle";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "../categories";
import { ASSESSMENT_TEMPLATES } from "../templates";
import type { AssessmentCategory, AssessmentStatus, AssessmentSummary } from "../types";
import { AssessmentPreview } from "../components/AssessmentPreview";
import type { AssessmentDefinition } from "../types";
import { Modal } from "../../../components/Modal";

// The builder and import wizard are heavy; load them only when opened so the
// Evaluaciones list stays light.
const AssessmentBuilder = lazy(() =>
  import("../builder/AssessmentBuilder").then((m) => ({ default: m.AssessmentBuilder })),
);
const ImportWizard = lazy(() =>
  import("../components/ImportWizard").then((m) => ({ default: m.ImportWizard })),
);

type View = "table" | "cards" | "analytics";

export function AssessmentOSPage() {
  const state = useAssessmentOSData();
  const caps = useCapabilities();
  const actor = useActor();

  const [view, setView] = useState<View>("cards");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<AssessmentCategory | "all">("all");
  const [statusFilter, setStatusFilter] = useState<AssessmentStatus | "all">("all");
  const [builderId, setBuilderId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [previewOf, setPreviewOf] = useState<AssessmentDefinition | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return state.summaries.filter((a) => {
      if (category !== "all" && a.category !== category) return false;
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (q) {
        const hay = `${a.name} ${a.code} ${CATEGORY_LABELS[a.category]}`
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [state.summaries, query, category, statusFilter]);

  const openBuilderFor = async (input: Parameters<typeof createAssessment>[0]) => {
    try {
      const created = await createAssessment(input, actor);
      toast.success(locale.feedback.assessmentCreated);
      setBuilderId(created.id);
    } catch (err) {
      toast.error(toAppError(err).message);
    }
  };

  const runTransition = async (id: string, status: AssessmentStatus, message: string) => {
    try {
      await transitionAssessment(id, status, actor);
      toast.success(message);
    } catch (err) {
      toast.error(toAppError(err).message);
    }
  };

  const buildActions = (a: AssessmentSummary): ActionItem[] => {
    const items: ActionItem[] = [
      { key: "edit", label: locale.common.edit, icon: Pencil, disabled: !caps.editAssessments, onSelect: () => setBuilderId(a.id) },
      {
        key: "preview",
        label: locale.common.preview,
        icon: Eye,
        onSelect: async () => {
          const full = await getAssessment(a.id);
          if (full) setPreviewOf(full);
        },
      },
      {
        key: "duplicate",
        label: locale.common.duplicate,
        icon: Copy,
        disabled: !caps.createAssessments,
        onSelect: async () => {
          try {
            await duplicateAssessment(a.id, actor);
            toast.success(locale.feedback.assessmentDuplicated);
          } catch (err) {
            toast.error(toAppError(err).message);
          }
        },
      },
      {
        key: "pause",
        label: locale.common.pause,
        icon: PauseCircle,
        divider: true,
        disabled: !caps.publishAssessments,
        onSelect: () => runTransition(a.id, "paused", locale.feedback.assessmentPaused),
      },
      {
        key: "archive",
        label: locale.common.archive,
        icon: Archive,
        disabled: !caps.publishAssessments,
        onSelect: () => runTransition(a.id, "archived", locale.feedback.assessmentArchived),
      },
    ];
    if (caps.deleteProcesses) {
      items.push({ key: "delete", label: locale.common.delete, icon: Trash2, tone: "danger", onSelect: () => setConfirmDelete(a.id) });
    }
    return items;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">{locale.assessments.title}</h2>
          <p className="mt-1 text-sm text-ink-soft">{locale.assessments.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {env.isDev && (
            <span className="rounded-full fill-soft px-3 py-1 text-[0.7rem] font-semibold text-ink-faint ring-1 ring-[color:var(--hairline)]">
              {locale.common.dataSourceDev}: {state.provider}
            </span>
          )}
          <button
            type="button"
            onClick={() => setTemplatesOpen(true)}
            disabled={!caps.createAssessments}
            className="inline-flex items-center gap-2 rounded-full fill-soft px-3.5 py-2.5 text-sm font-semibold text-ink ring-1 ring-[color:var(--hairline)] hover:text-ink disabled:opacity-50"
          >
            <LayoutTemplate className="h-4 w-4" /> {locale.assessments.useTemplate}
          </button>
          {env.enableAssessmentImport && (
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              disabled={!caps.importAssessments}
              className="inline-flex items-center gap-2 rounded-full fill-soft px-3.5 py-2.5 text-sm font-semibold text-ink ring-1 ring-[color:var(--hairline)] hover:text-ink disabled:opacity-50"
            >
              <FileUp className="h-4 w-4" /> {locale.assessments.importExcel}
            </button>
          )}
          <button
            type="button"
            onClick={() => openBuilderFor({ name: "Evaluación sin título", category: "questionnaire" })}
            disabled={!caps.createAssessments}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-4 py-2.5 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> {locale.assessments.create}
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="glass flex flex-wrap items-center gap-2 rounded-2xl p-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={locale.assessments.searchPlaceholder}
            aria-label={locale.common.search}
            className="w-full rounded-xl fill-soft py-2 pl-9 pr-3 text-sm text-ink outline-none ring-1 ring-[color:var(--hairline)] focus:ring-2 focus:ring-cyan-300"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as AssessmentCategory | "all")}
          className="rounded-xl fill-soft px-3 py-2 text-sm text-ink ring-1 ring-[color:var(--hairline)]"
          aria-label="Categoría"
        >
          <option value="all">Todas las categorías</option>
          {CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as AssessmentStatus | "all")}
          className="rounded-xl fill-soft px-3 py-2 text-sm text-ink ring-1 ring-[color:var(--hairline)]"
          aria-label="Estado"
        >
          <option value="all">Todos los estados</option>
          {(Object.keys(ASSESSMENT_STATUS_META) as AssessmentStatus[]).map((s) => (
            <option key={s} value={s}>
              {ASSESSMENT_STATUS_META[s].label}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1 text-[0.7rem] text-ink-faint sm:inline-flex">
            <RefreshCw className={`h-3 w-3 ${state.status === "loading" ? "animate-spin" : ""}`} />
            {state.lastSyncedAt ? formatRelative(state.lastSyncedAt) : locale.common.synchronizing}
          </span>
          <Segmented<View>
            idBase="asmt-view"
            ariaLabel={locale.common.view}
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: "cards", label: locale.views.cards, icon: LayoutGrid },
              { value: "table", label: locale.views.table, icon: Table2 },
              { value: "analytics", label: locale.views.analytics, icon: PieChart },
            ]}
          />
        </div>
      </div>

      {/* Content */}
      {state.status === "loading" && state.summaries.length === 0 ? (
        <LoadingState label="Cargando evaluaciones…" />
      ) : state.status === "error" ? (
        <ErrorState message={state.error ?? "Error"} onRetry={() => location.reload()} />
      ) : filtered.length === 0 ? (
        <EmptyState message={locale.assessments.empty} />
      ) : view === "analytics" ? (
        <AnalyticsView summaries={state.summaries} />
      ) : view === "table" ? (
        <AssessmentTable rows={filtered} onOpen={setBuilderId} buildActions={buildActions} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((a, i) => (
            <motion.article
              key={a.id}
              variants={popIn}
              initial="initial"
              animate="animate"
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
              onClick={() => setBuilderId(a.id)}
              className="glass liquid-streak magnetic group flex cursor-pointer flex-col gap-3 rounded-3xl p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[0.65rem] uppercase tracking-wide text-ink-faint">{CATEGORY_LABELS[a.category]}</p>
                  <h3 className="mt-0.5 line-clamp-2 text-base font-black text-ink">{a.name}</h3>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <ActionMenu items={buildActions(a)} />
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <StatusChip meta={ASSESSMENT_STATUS_META[a.status]} />
                <StatusChip meta={ASSESSMENT_PUBLICATION_META[a.publicationStatus]} />
              </div>
              <dl className="grid grid-cols-2 gap-y-2 text-xs text-ink-soft">
                <dd className="inline-flex items-center gap-1.5">
                  <ListChecks className="h-3.5 w-3.5" /> {a.questionCount} preguntas
                </dd>
                <dd className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> {formatDuration(a.estimatedDuration)}
                </dd>
              </dl>
              <div className="mt-auto flex items-center justify-between border-t border-[color:var(--hairline)] pt-2 text-[0.7rem] text-ink-faint">
                <span>v{a.version}</span>
                <span>{a.linkedProcessCount} proceso(s)</span>
              </div>
            </motion.article>
          ))}
        </div>
      )}

      {/* Overlays */}
      {builderId && (
        <Suspense fallback={null}>
          <AssessmentBuilder assessmentId={builderId} onClose={() => setBuilderId(null)} />
        </Suspense>
      )}
      {env.enableAssessmentImport && importOpen && (
        <Suspense fallback={null}>
          <ImportWizard open={importOpen} onClose={() => setImportOpen(false)} onImported={(id) => setBuilderId(id)} />
        </Suspense>
      )}
      {previewOf && <AssessmentPreview assessment={previewOf} open onClose={() => setPreviewOf(null)} />}

      <TemplatesModal
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        onPick={(id) => {
          const tpl = ASSESSMENT_TEMPLATES.find((t) => t.id === id);
          if (tpl) {
            setTemplatesOpen(false);
            void openBuilderFor(tpl.build());
          }
        }}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Eliminar evaluación"
        message="Esta acción no se puede deshacer. ¿Deseas eliminar la evaluación definitivamente?"
        confirmLabel={locale.common.delete}
        onConfirm={async () => {
          if (!confirmDelete) return;
          try {
            await removeAssessment(confirmDelete);
            toast.success("Evaluación eliminada.");
          } catch (err) {
            toast.error(toAppError(err).message);
          }
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function AssessmentTable({
  rows,
  onOpen,
  buildActions,
}: {
  rows: AssessmentSummary[];
  onOpen: (id: string) => void;
  buildActions: (a: AssessmentSummary) => ActionItem[];
}) {
  return (
    <div className="glass overflow-hidden rounded-3xl">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead>
            <tr className="text-[0.7rem] uppercase tracking-wide text-ink-soft">
              <th className="px-3 py-3 text-left font-semibold">Nombre</th>
              <th className="px-3 py-3 text-left font-semibold">Categoría</th>
              <th className="px-3 py-3 text-left font-semibold">Estado</th>
              <th className="px-3 py-3 text-left font-semibold">Publicación</th>
              <th className="px-3 py-3 text-left font-semibold">Versión</th>
              <th className="px-3 py-3 text-left font-semibold">Preguntas</th>
              <th className="px-3 py-3 text-left font-semibold">Procesos</th>
              <th className="px-3 py-3 text-right font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr
                key={a.id}
                onClick={() => onOpen(a.id)}
                className="cursor-pointer border-t border-[color:var(--hairline)] text-sm transition-colors hover:bg-[color:var(--fill-1)]"
              >
                <td className="px-3 py-3 font-semibold text-ink">{a.name}</td>
                <td className="px-3 py-3 text-ink-soft">{CATEGORY_LABELS[a.category]}</td>
                <td className="px-3 py-3">
                  <StatusChip meta={ASSESSMENT_STATUS_META[a.status]} />
                </td>
                <td className="px-3 py-3">
                  <StatusChip meta={ASSESSMENT_PUBLICATION_META[a.publicationStatus]} />
                </td>
                <td className="px-3 py-3 text-ink-soft">v{a.version}</td>
                <td className="px-3 py-3 text-ink">{a.questionCount}</td>
                <td className="px-3 py-3 text-ink">{a.linkedProcessCount}</td>
                <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end">
                    <ActionMenu items={buildActions(a)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AnalyticsView({ summaries }: { summaries: AssessmentSummary[] }) {
  const published = summaries.filter((s) => s.publicationStatus === "published").length;
  const drafts = summaries.filter((s) => s.status === "draft").length;
  const assigned = summaries.filter((s) => s.linkedProcessCount > 0).length;
  const tiles = [
    { label: "Evaluaciones totales", value: summaries.length },
    { label: "Publicadas", value: published },
    { label: "Borradores", value: drafts },
    { label: "Asignadas a procesos", value: assigned },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="glass rounded-2xl p-4">
            <div className="text-2xl font-black text-ink">{t.value}</div>
            <div className="mt-1 text-[0.7rem] uppercase tracking-wide text-ink-soft">{t.label}</div>
          </div>
        ))}
      </div>
      <div className="glass rounded-3xl p-5">
        <p className="text-sm text-ink-soft">
          Las tasas de finalización, duración media y abandono se habilitarán cuando el backend registre
          los intentos de los candidatos. Se evitan métricas ficticias intencionalmente.
        </p>
      </div>
    </div>
  );
}

function TemplatesModal({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (id: string) => void }) {
  return (
    <Modal open={open} onRequestClose={onClose} size="max-w-3xl" ariaLabel={locale.assessments.templates}>
      <div className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <Library className="h-5 w-5 text-ink-soft" />
          <h2 className="text-lg font-black text-ink">{locale.assessments.templates}</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ASSESSMENT_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onPick(t.id)}
              className="flex items-start gap-3 rounded-2xl fill-soft p-4 text-left ring-1 ring-[color:var(--hairline)] transition-colors hover:ring-cyan-400/40"
            >
              <span className="text-2xl">{t.icon}</span>
              <div>
                <p className="text-sm font-bold text-ink">{t.name}</p>
                <p className="mt-0.5 text-xs text-ink-soft">{t.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
