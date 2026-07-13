import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Undo2,
  Redo2,
  Eye,
  Save,
  Send,
  Plus,
  Trash2,
  Copy,
  ChevronDown,
  ChevronUp,
  X,
  Loader2,
  Layers,
  AlertTriangle,
  CircleCheck,
} from "lucide-react";
import { createPortal } from "react-dom";
import { toast } from "../../../shared/toastStore";
import { toAppError } from "../../../shared/errors";
import { formatDuration } from "../../../shared/format";
import { uid } from "../../../shared/id";
import { pushHeavyOverlay } from "../../../shared/heavyOverlayStore";
import { locale } from "../../../content/locale/es-BO";
import { useActor, useCapabilities } from "../../access";
import { getAssessment, publishAssessment, saveAssessment } from "../store";
import { createQuestion, FAMILY_LABELS, pluginsByFamily } from "../question-types/registry";
import { withDerived, emptySection } from "../factory";
import { assessmentMaxPoints, scoredQuestionCount } from "../scoring";
import { inspectQuestion } from "../validation";
import { analyzeRules } from "../logic";
import { useHistoryState } from "./useHistoryState";
import { QuestionProperties } from "./QuestionProperties";
import { PublishDialog } from "./PublishDialog";
import { QuestionRenderer } from "../components/QuestionRenderer";
import { AssessmentPreview } from "../components/AssessmentPreview";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import type { AssessmentDefinition, AssessmentQuestion, QuestionFamily } from "../types";

/**
 * The visual assessment builder.
 *
 * Layout: a top toolbar (name, version, undo/redo, preview, save, publish), a
 * left component library grouped by family, a center canvas of sections and
 * blocks, and a right properties inspector for the selected block. State is
 * managed through a history hook (undo/redo) with separated document vs UI
 * selection state. It registers as a heavy overlay so the animated background
 * pauses while authoring.
 */
export function AssessmentBuilder({
  assessmentId,
  onClose,
}: {
  assessmentId: string;
  onClose: () => void;
}) {
  const actor = useActor();
  const caps = useCapabilities();
  const history = useHistoryState<AssessmentDefinition | null>(null);
  const doc = history.state;

  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [lastPublished, setLastPublished] = useState<AssessmentDefinition | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(true);

  // Register as a heavy overlay (pauses background WebGL) + scroll lock.
  useEffect(() => {
    const release = pushHeavyOverlay();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      release();
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getAssessment(assessmentId)
      .then((a) => {
        if (cancelled || !a) return;
        history.reset(a);
        // Snapshot of the last published version (for edit classification).
        if (a.currentVersion) {
          const published = a.versions.find((v) => `${v.major}.${v.minor}` === a.currentVersion);
          if (published) {
            setLastPublished({ ...a, sections: published.sections, rules: published.rules });
          }
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId]);

  // Keyboard shortcuts: undo/redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history]);

  const update = (updater: (d: AssessmentDefinition) => AssessmentDefinition) => {
    history.set((prev) => (prev ? withDerived(updater(prev)) : prev));
    setDirty(true);
  };

  const selected = useMemo<AssessmentQuestion | null>(() => {
    if (!doc || !selectedId) return null;
    for (const s of doc.sections) {
      const q = s.questions.find((x) => x.id === selectedId);
      if (q) return q;
    }
    return null;
  }, [doc, selectedId]);

  const stats = useMemo(() => {
    if (!doc) return { questions: 0, points: 0, scored: 0, unconfigured: 0, issues: 0, logicErrors: 0 };
    let questions = 0;
    let unconfigured = 0;
    let issues = 0;
    for (const s of doc.sections) {
      for (const q of s.questions) {
        if (q.family !== "content") questions += 1;
        if (!q.configured) unconfigured += 1;
        issues += inspectQuestion(q).length;
      }
    }
    return {
      questions,
      points: assessmentMaxPoints(doc),
      scored: scoredQuestionCount(doc),
      unconfigured,
      issues,
      logicErrors: analyzeRules(doc).filter((i) => i.severity === "error").length,
    };
  }, [doc]);

  const addSection = () =>
    update((d) => ({ ...d, sections: [...d.sections, emptySection(`Sección ${d.sections.length + 1}`, d.sections.length)] }));

  const addQuestion = (sectionId: string, type: string) => {
    const q = createQuestion(type);
    update((d) => ({
      ...d,
      sections: d.sections.map((s) => (s.id === sectionId ? { ...s, questions: [...s.questions, q] } : s)),
    }));
    setSelectedId(q.id);
  };

  const updateQuestion = (q: AssessmentQuestion) =>
    update((d) => ({
      ...d,
      sections: d.sections.map((s) => ({ ...s, questions: s.questions.map((x) => (x.id === q.id ? q : x)) })),
    }));

  const deleteQuestion = (id: string) => {
    update((d) => ({ ...d, sections: d.sections.map((s) => ({ ...s, questions: s.questions.filter((q) => q.id !== id) })) }));
    if (selectedId === id) setSelectedId(null);
  };

  const duplicateQuestion = (id: string) => {
    update((d) => ({
      ...d,
      sections: d.sections.map((s) => {
        const idx = s.questions.findIndex((q) => q.id === id);
        if (idx < 0) return s;
        const copy = { ...JSON.parse(JSON.stringify(s.questions[idx])), id: uid("q") };
        const questions = [...s.questions];
        questions.splice(idx + 1, 0, copy);
        return { ...s, questions };
      }),
    }));
  };

  const moveQuestion = (sectionId: string, index: number, dir: -1 | 1) => {
    update((d) => ({
      ...d,
      sections: d.sections.map((s) => {
        if (s.id !== sectionId) return s;
        const target = index + dir;
        if (target < 0 || target >= s.questions.length) return s;
        const questions = [...s.questions];
        [questions[index], questions[target]] = [questions[target], questions[index]];
        return { ...s, questions };
      }),
    }));
  };

  const doSave = async () => {
    if (!doc) return;
    setSaving(true);
    try {
      const saved = await saveAssessment(doc, actor);
      history.set(saved, false);
      setDirty(false);
      toast.success(locale.feedback.assessmentSaved);
    } catch (err) {
      toast.error(toAppError(err).message);
    } finally {
      setSaving(false);
    }
  };

  const doPublish = async (notes: string) => {
    if (!doc) return;
    try {
      // Persist the latest draft first, then publish.
      if (dirty) await saveAssessment(doc, actor);
      const published = await publishAssessment(doc.id, notes, actor);
      history.reset(published);
      setLastPublished({ ...published });
      setDirty(false);
      setShowPublish(false);
      toast.success(locale.feedback.versionPublished);
    } catch (err) {
      toast.error(toAppError(err).message);
    }
  };

  const requestClose = () => {
    if (dirty) setConfirmClose(true);
    else onClose();
  };

  const grouped = useMemo(() => pluginsByFamily(), []);
  const insertSectionId = doc?.sections.find((s) => s.questions.some((q) => q.id === selectedId))?.id ?? doc?.sections[0]?.id;

  return createPortal(
    <div className="fixed inset-0 z-[130] flex flex-col bg-[color:var(--app-base)] no-print">
      {/* Top toolbar */}
      <header className="glass-heavy z-20 flex flex-wrap items-center gap-2 border-b border-[color:var(--hairline)] px-4 py-2.5">
        <button
          type="button"
          onClick={requestClose}
          aria-label="Cerrar constructor"
          className="grid h-9 w-9 place-items-center rounded-full fill-soft text-ink ring-1 ring-[color:var(--hairline)] hover:bg-rose-500/80 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <input
            value={doc?.name ?? ""}
            onChange={(e) => update((d) => ({ ...d, name: e.target.value }))}
            placeholder={locale.assessments.builder.untitled}
            className="w-full max-w-md bg-transparent text-base font-black text-ink outline-none"
            aria-label="Nombre de la evaluación"
          />
          {doc && (
            <p className="text-[0.7rem] text-ink-faint">
              {doc.currentVersion ? `Publicada v${doc.currentVersion} · borrador v${doc.draftVersion}` : `Borrador v${doc.draftVersion}`}
              {dirty ? " · cambios sin guardar" : " · guardado"}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1">
          <ToolbarButton icon={Undo2} label="Deshacer" disabled={!history.canUndo} onClick={history.undo} />
          <ToolbarButton icon={Redo2} label="Rehacer" disabled={!history.canRedo} onClick={history.redo} />
          <span className="mx-1 h-6 w-px bg-[color:var(--hairline)]" />
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="inline-flex items-center gap-1.5 rounded-full fill-soft px-3 py-1.5 text-sm font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)] hover:text-ink"
          >
            <Eye className="h-4 w-4" /> {locale.common.preview}
          </button>
          <button
            type="button"
            onClick={doSave}
            disabled={saving || !caps.editAssessments}
            className="inline-flex items-center gap-1.5 rounded-full fill-soft px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-[color:var(--hairline)] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {locale.common.save}
          </button>
          <button
            type="button"
            onClick={() => setShowPublish(true)}
            disabled={!caps.publishAssessments}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 px-4 py-1.5 text-sm font-bold text-white ring-1 ring-white/30 disabled:opacity-50"
          >
            <Send className="h-4 w-4" /> {locale.common.publish}
          </button>
        </div>
      </header>

      {loading || !doc ? (
        <div className="grid flex-1 place-items-center">
          <Loader2 className="h-10 w-10 animate-spin text-cyan-300" />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Left library */}
          <aside
            className={`glass-heavy z-10 flex shrink-0 flex-col border-r border-[color:var(--hairline)] transition-all ${
              libraryOpen ? "w-64" : "w-12"
            }`}
          >
            <button
              type="button"
              onClick={() => setLibraryOpen((v) => !v)}
              className="flex items-center gap-2 border-b border-[color:var(--hairline)] px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-ink-soft"
            >
              <Layers className="h-4 w-4" />
              {libraryOpen && locale.assessments.builder.library}
            </button>
            {libraryOpen && (
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2">
                {(Object.keys(grouped) as QuestionFamily[]).map((family) => (
                  <div key={family}>
                    <p className="px-1 pb-1 text-[0.65rem] font-bold uppercase tracking-wide text-ink-faint">
                      {FAMILY_LABELS[family]}
                    </p>
                    <div className="grid grid-cols-1 gap-1">
                      {grouped[family].map((plugin) => {
                        const Icon = plugin.icon;
                        return (
                          <button
                            key={plugin.type}
                            type="button"
                            disabled={!plugin.available || !insertSectionId}
                            onClick={() => insertSectionId && addQuestion(insertSectionId, plugin.type)}
                            title={plugin.available ? plugin.description : "Disponible detrás de una bandera de función"}
                            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-ink transition-colors hover:bg-[color:var(--fill-2)] disabled:opacity-40"
                          >
                            <Icon className="h-4 w-4 shrink-0 text-ink-soft" />
                            <span className="min-w-0 flex-1 truncate">{plugin.label}</span>
                            {!plugin.available && (
                              <span className="rounded bg-amber-500/15 px-1 text-[0.55rem] font-bold text-amber-300">
                                beta
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>

          {/* Center canvas */}
          <main className="min-w-0 flex-1 overflow-y-auto p-5">
            <div className="mx-auto max-w-2xl space-y-4">
              {doc.sections.map((section, si) => (
                <section key={section.id} className="glass rounded-3xl p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-[color:var(--fill-2)] text-xs font-bold text-ink">
                      {si + 1}
                    </span>
                    <input
                      value={section.title}
                      onChange={(e) =>
                        update((d) => ({
                          ...d,
                          sections: d.sections.map((s) => (s.id === section.id ? { ...s, title: e.target.value } : s)),
                        }))
                      }
                      className="min-w-0 flex-1 bg-transparent text-base font-black text-ink outline-none"
                      aria-label={`Título de la sección ${si + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        update((d) => ({ ...d, sections: d.sections.filter((s) => s.id !== section.id) }))
                      }
                      aria-label="Eliminar sección"
                      className="grid h-8 w-8 place-items-center rounded-lg text-rose-400 hover:bg-rose-500/15"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="space-y-2">
                    {section.questions.length === 0 && (
                      <p className="rounded-2xl border border-dashed border-[color:var(--hairline)] py-6 text-center text-xs text-ink-faint">
                        {locale.assessments.builder.emptyCanvas}
                      </p>
                    )}
                    {section.questions.map((q, qi) => (
                      <motion.div
                        layout
                        key={q.id}
                        onClick={() => setSelectedId(q.id)}
                        className={`group cursor-pointer rounded-2xl p-3 ring-1 transition-colors ${
                          selectedId === q.id
                            ? "bg-cyan-500/10 ring-cyan-400/40"
                            : "fill-soft ring-[color:var(--hairline)] hover:ring-cyan-400/30"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <QuestionRenderer question={q} />
                          </div>
                          <div className="flex shrink-0 flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button type="button" aria-label="Subir" onClick={(e) => { e.stopPropagation(); moveQuestion(section.id, qi, -1); }} className="grid h-6 w-6 place-items-center rounded text-ink-soft hover:bg-[color:var(--fill-2)]">
                              <ChevronUp className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" aria-label="Bajar" onClick={(e) => { e.stopPropagation(); moveQuestion(section.id, qi, 1); }} className="grid h-6 w-6 place-items-center rounded text-ink-soft hover:bg-[color:var(--fill-2)]">
                              <ChevronDown className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" aria-label="Duplicar" onClick={(e) => { e.stopPropagation(); duplicateQuestion(q.id); }} className="grid h-6 w-6 place-items-center rounded text-ink-soft hover:bg-[color:var(--fill-2)]">
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" aria-label="Eliminar" onClick={(e) => { e.stopPropagation(); deleteQuestion(q.id); }} className="grid h-6 w-6 place-items-center rounded text-rose-400 hover:bg-rose-500/15">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {insertSectionId === section.id && (
                    <button
                      type="button"
                      onClick={() => addQuestion(section.id, "short_text")}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-full fill-soft px-3 py-1.5 text-xs font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)] hover:text-ink"
                    >
                      <Plus className="h-3.5 w-3.5" /> {locale.assessments.builder.addQuestion}
                    </button>
                  )}
                </section>
              ))}

              <button
                type="button"
                onClick={addSection}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[color:var(--hairline)] py-3 text-sm font-semibold text-ink-soft transition-colors hover:border-cyan-400/40 hover:text-ink"
              >
                <Plus className="h-4 w-4" /> {locale.assessments.builder.addSection}
              </button>
            </div>
          </main>

          {/* Right properties */}
          <aside className="glass-heavy z-10 hidden w-80 shrink-0 flex-col border-l border-[color:var(--hairline)] lg:flex">
            <p className="border-b border-[color:var(--hairline)] px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-ink-soft">
              {locale.assessments.builder.properties}
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {selected ? (
                <QuestionProperties
                  question={selected}
                  onChange={updateQuestion}
                  onDelete={() => deleteQuestion(selected.id)}
                  onDuplicate={() => duplicateQuestion(selected.id)}
                />
              ) : (
                <p className="text-sm text-ink-soft">Selecciona un bloque en el lienzo para editar sus propiedades.</p>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Status bar */}
      {doc && (
        <footer className="glass-heavy z-20 flex flex-wrap items-center gap-4 border-t border-[color:var(--hairline)] px-4 py-2 text-xs text-ink-soft">
          <span>{locale.assessments.builder.questionCount}: <strong className="text-ink">{stats.questions}</strong></span>
          <span>{locale.assessments.builder.totalPoints}: <strong className="text-ink">{stats.points}</strong> ({stats.scored} con puntaje)</span>
          <span>{locale.assessments.builder.estimatedDuration}: <strong className="text-ink">{formatDuration(doc.estimatedDuration)}</strong></span>
          {stats.unconfigured > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" /> {stats.unconfigured} {locale.assessments.builder.unconfigured}
            </span>
          )}
          {stats.logicErrors > 0 ? (
            <span className="inline-flex items-center gap-1 text-rose-300">
              <AlertTriangle className="h-3.5 w-3.5" /> {stats.logicErrors} error(es) de lógica
            </span>
          ) : (
            <span className="ml-auto inline-flex items-center gap-1 text-emerald-300">
              <CircleCheck className="h-3.5 w-3.5" /> Sin errores de lógica
            </span>
          )}
        </footer>
      )}

      {/* Overlays */}
      {doc && showPreview && (
        <AssessmentPreview assessment={doc} open={showPreview} onClose={() => setShowPreview(false)} />
      )}
      {doc && (
        <PublishDialog
          assessment={doc}
          lastPublished={lastPublished}
          open={showPublish}
          onClose={() => setShowPublish(false)}
          onConfirm={doPublish}
        />
      )}
      <ConfirmDialog
        open={confirmClose}
        title="Cambios sin guardar"
        message="Tienes cambios sin guardar en el constructor. ¿Deseas descartarlos y salir?"
        confirmLabel="Descartar"
        cancelLabel="Seguir editando"
        onConfirm={() => {
          setConfirmClose(false);
          setDirty(false);
          onClose();
        }}
        onCancel={() => setConfirmClose(false)}
      />
    </div>,
    document.body,
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof Undo2;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-[color:var(--fill-2)] hover:text-ink disabled:opacity-30"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
