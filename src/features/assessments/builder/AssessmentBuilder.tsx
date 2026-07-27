import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { ChevronDown, ChevronUp, PanelLeftOpen, Plus, Trash2 } from "lucide-react";
import { L, formatRelative } from "../../../content/locale";
import { toast } from "../../../design-system/liquid-glass/toast";
import { GlassDialog } from "../../../design-system/liquid-glass/GlassDialog";
import { TextInput } from "../../../design-system/liquid-glass/fields";
import { useMediaQuery } from "../../../shared/hooks";
import { buildPublishChecklist } from "../domain/publish";
import type { PublishFinding } from "../domain/publish";
import { validateContent } from "../scoring/validateContent";
import { classifyContentChange } from "../versioning/classify";
import { ASSESSMENT_LIFECYCLE_META } from "../domain/lifecycle";
import type { AssessmentDefinition } from "../domain/assessment";
import type { ApiIssue } from "../api/contract";
import type { TalentPermissions } from "../../shared/permissions";
import { builderReducer, flattenBlocks, initBuilder, selectedBlock, sectionOfBlock, type BuilderMeta } from "./builderState";
import { BuilderHeader, type HeaderAction } from "./BuilderHeader";
import { BuilderNav, BUILDER_STEPS, type BuilderStep } from "./BuilderNav";
import { AssessmentDeliveryPanel, AssessmentGeneralPanel } from "./AssessmentSettingsPanel";
import { QuestionNavigator } from "./QuestionNavigator";
import { QuestionEditor } from "./QuestionEditor";
import { QuestionProperties } from "./QuestionProperties";
import { ReviewPanel } from "./ReviewPanel";
import { PublishDialog } from "./PublishDialog";
import { ComponentLibrary } from "./ComponentLibrary";
import { AssessmentPreview } from "../ui/AssessmentPreview";
import { useAssessmentDraft, type SaveOutcome } from "./useAssessmentDraft";

interface BuilderProps {
  assessment: AssessmentDefinition;
  permissions: TalentPermissions;
  onBack: () => void;
  onSave: (next: AssessmentDefinition) => Promise<SaveOutcome>;
  onPublish: (next: AssessmentDefinition, notes: string) => Promise<{ ok: boolean; issues: ApiIssue[] }>;
  onDuplicate?: () => void;
  onArchive?: () => void;
}

type PreviewDevice = "desktop" | "tablet" | "mobile";

function metaOf(assessment: AssessmentDefinition): BuilderMeta {
  return {
    name: assessment.name,
    description: assessment.description,
    purpose: assessment.purpose,
    category: assessment.category,
    tags: assessment.tags,
    durationMinutes: assessment.estimatedDurationMinutes,
    passingScore: assessment.scoringPolicy.passThreshold,
  };
}

/**
 * Cáscara del constructor de evaluaciones.
 *
 * Orquesta cuatro pasos navegables libremente (general, preguntas,
 * configuración, revisión), el estado de guardado, la recuperación de borradores
 * locales, la vista previa del candidato y la publicación. La lógica de dominio
 * vive fuera: el reducer maneja el documento y `buildPublishChecklist` decide qué
 * bloquea la publicación.
 */
export function AssessmentBuilder({
  assessment,
  permissions,
  onBack,
  onSave,
  onPublish,
  onDuplicate,
  onArchive,
}: BuilderProps) {
  const [state, dispatch] = useReducer(
    builderReducer,
    undefined,
    () => initBuilder(assessment.draftVersion.content, metaOf(assessment)),
  );
  const [step, setStep] = useState<BuilderStep>("questions");
  const [focusField, setFocusField] = useState<string | null>(null);
  const [navigatorOpen, setNavigatorOpen] = useState(true);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [serverIssues, setServerIssues] = useState<ApiIssue[]>([]);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const isCompact = useMediaQuery("(max-width: 1023px)");

  const baseline = useMemo(
    () => ({ meta: metaOf(assessment), content: assessment.draftVersion.content }),
    [assessment],
  );
  const document = useMemo(() => ({ meta: state.meta, content: state.content }), [state.meta, state.content]);

  const withUpdates = useCallback(
    (): AssessmentDefinition => ({
      ...assessment,
      name: state.meta.name,
      description: state.meta.description,
      purpose: state.meta.purpose,
      category: state.meta.category,
      tags: state.meta.tags,
      estimatedDurationMinutes: state.meta.durationMinutes,
      scoringPolicy: { ...assessment.scoringPolicy, passThreshold: state.meta.passingScore },
      draftVersion: { ...assessment.draftVersion, content: state.content },
    }),
    [assessment, state.meta, state.content],
  );

  const draft = useAssessmentDraft({
    assessmentId: assessment.id,
    entityVersion: assessment.entityVersion,
    document,
    baseline,
    onSave: useCallback(() => onSave(withUpdates()), [onSave, withUpdates]),
  });

  const checklist = useMemo(
    () => buildPublishChecklist(withUpdates(), state.content),
    [withUpdates, state.content],
  );
  const contentValidation = useMemo(() => validateContent(state.content), [state.content]);

  const lastPublished = assessment.publishedVersions[assessment.publishedVersions.length - 1] ?? null;
  const changeClass = useMemo(() => {
    if (!lastPublished) return null;
    // Las versiones publicadas viajan sin snapshot desde la API; en ese caso la
    // clasificación definitiva la hace el servidor al publicar.
    if (lastPublished.content.sections.length === 0) return null;
    return classifyContentChange(lastPublished.content, state.content).classification;
  }, [lastPublished, state.content]);

  const selected = selectedBlock(state);
  const selectedSection = selected ? sectionOfBlock(state, selected.id) : null;
  const flat = useMemo(() => flattenBlocks(state.content), [state.content]);
  const selectedNumber = selected ? flat.find((item) => item.block.id === selected.id)?.number ?? null : null;

  const findingsForSelected = useMemo(
    () => checklist.findings.filter((item) => item.target.questionId === selected?.id),
    [checklist.findings, selected?.id],
  );
  const generalFindings = useMemo(
    () => checklist.findings.filter((item) => item.target.area === "general"),
    [checklist.findings],
  );
  const settingsFindings = useMemo(
    () => checklist.findings.filter((item) => item.target.area === "settings"),
    [checklist.findings],
  );

  const errorsByStep = useMemo(() => {
    const counters: Record<BuilderStep, number> = { general: 0, questions: 0, settings: 0, review: 0 };
    for (const item of checklist.errors) {
      if (item.target.area === "general") counters.general += 1;
      else if (item.target.area === "settings") counters.settings += 1;
      else counters.questions += 1;
    }
    counters.review = checklist.errors.length;
    return counters;
  }, [checklist.errors]);

  const requiredQuestions = useMemo(
    () => flat.filter((item) => item.number !== null && item.block.required).length,
    [flat],
  );

  // Al cambiar de paso el campo enfocado deja de tener sentido.
  useEffect(() => {
    setFocusField(null);
  }, [step]);

  const goToFinding = useCallback(
    (finding: PublishFinding) => {
      const target = BUILDER_STEPS.includes(finding.target.area as BuilderStep)
        ? (finding.target.area as BuilderStep)
        : "questions";
      setStep(target);
      if (finding.target.questionId && finding.target.sectionId) {
        dispatch({
          type: "select",
          blockId: finding.target.questionId,
          sectionId: finding.target.sectionId,
        });
        setNavigatorOpen(true);
      }
      setFocusField(finding.target.field ?? null);
    },
    [dispatch],
  );

  const handleBack = useCallback(() => {
    if (draft.dirty) {
      setConfirmLeave(true);
      return;
    }
    onBack();
  }, [draft.dirty, onBack]);

  const handlePublish = useCallback(async () => {
    setServerIssues([]);
    if (!checklist.canPublish) {
      setStep("review");
      toast.warning(L.builder.publish.blocked);
      return;
    }
    setConfirmPublish(true);
  }, [checklist.canPublish]);

  const confirmPublishNow = useCallback(
    async (notes: string) => {
      setPublishing(true);
      const result = await onPublish(withUpdates(), notes);
      setPublishing(false);
      setConfirmPublish(false);
      if (result.ok) {
        draft.clearDraft();
        return;
      }
      setServerIssues(result.issues);
      setStep("review");
    },
    [onPublish, withUpdates, draft],
  );

  const extraActions = useMemo(() => {
    const actions: HeaderAction[] = [];
    if (onDuplicate && permissions.create) {
      actions.push({ id: "duplicate", label: L.common.duplicate, onSelect: onDuplicate });
    }
    if (onArchive && permissions.archive) {
      actions.push({ id: "archive", label: L.common.archive, onSelect: onArchive, danger: true });
    }
    return actions;
  }, [onDuplicate, onArchive, permissions]);

  return (
    <div className="flex flex-col">
      <BuilderHeader
        assessment={assessment}
        title={state.meta.name}
        permissions={permissions}
        saveState={draft.saveState}
        lastSavedAt={draft.lastSavedAt}
        autosave={draft.autosaveEnabled}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        canPublish={checklist.canPublish}
        blockingErrors={checklist.errors.length}
        onBack={handleBack}
        onUndo={() => dispatch({ type: "undo" })}
        onRedo={() => dispatch({ type: "redo" })}
        onSave={() => void draft.save()}
        onRetrySave={() => void draft.save()}
        onPreview={() => setPreviewDevice("desktop")}
        onReview={() => setStep("review")}
        onPublish={() => void handlePublish()}
        extraActions={extraActions}
      />

      {draft.recovered && (
        <div
          role="alert"
          className="glass mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-2.5 ring-1 ring-amber-400/30"
        >
          <p className="text-xs text-amber-200">
            {L.builder.save.draftRecovered}
            {draft.recoveredAt && ` (${formatRelative(new Date(draft.recoveredAt).toISOString())})`}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                const recoveredDocument = draft.acceptRecovered();
                if (!recoveredDocument) return;
                dispatch({ type: "updateMeta", patch: recoveredDocument.meta });
                dispatch({ type: "replaceContent", content: recoveredDocument.content });
                toast.success(L.builder.save.draftRecoveredAction);
              }}
              className="rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-3 py-1 text-xs font-bold text-white ring-1 ring-white/30"
            >
              {L.builder.save.draftRecoveredAction}
            </button>
            <button
              type="button"
              onClick={draft.discardRecovered}
              className="rounded-full fill-softer px-3 py-1 text-xs font-semibold text-ink ring-1 ring-[color:var(--hairline)]"
            >
              {L.builder.save.draftDiscardAction}
            </button>
          </div>
        </div>
      )}

      <BuilderNav
        step={step}
        onStep={setStep}
        errorsByStep={errorsByStep}
        questionCount={checklist.questionCount}
        completeness={checklist.completeness}
      />

      {step === "general" && (
        <AssessmentGeneralPanel
          assessment={assessment}
          meta={state.meta}
          onMeta={(patch) => dispatch({ type: "updateMeta", patch })}
          instructions={state.content.publicInstructions}
          onInstructions={(value) =>
            dispatch({ type: "replaceContent", content: { ...state.content, publicInstructions: value } })
          }
          internalInstructions={state.content.internalInstructions}
          onInternalInstructions={(value) =>
            dispatch({ type: "replaceContent", content: { ...state.content, internalInstructions: value } })
          }
          findings={generalFindings}
          focusField={focusField}
        />
      )}

      {step === "settings" && (
        <AssessmentDeliveryPanel
          assessment={assessment}
          meta={state.meta}
          onMeta={(patch) => dispatch({ type: "updateMeta", patch })}
          instructions={state.content.publicInstructions}
          onInstructions={(value) =>
            dispatch({ type: "replaceContent", content: { ...state.content, publicInstructions: value } })
          }
          internalInstructions={state.content.internalInstructions}
          onInternalInstructions={(value) =>
            dispatch({ type: "replaceContent", content: { ...state.content, internalInstructions: value } })
          }
          findings={settingsFindings}
          focusField={focusField}
          estimatedMinutes={contentValidation.estimatedMinutes}
        />
      )}

      {step === "questions" && (
        <div
          className={`grid min-h-[28rem] gap-3 ${
            navigatorOpen && !isCompact
              ? "lg:grid-cols-[16rem_minmax(0,1fr)_18rem]"
              : "lg:grid-cols-[minmax(0,1fr)_18rem]"
          }`}
        >
          {navigatorOpen && (
            <aside className="glass max-h-[70vh] overflow-hidden rounded-3xl">
              <QuestionNavigator
                content={state.content}
                checklist={checklist}
                selectedBlockId={state.selectedBlockId}
                onSelect={(blockId, sectionId) => {
                  dispatch({ type: "select", blockId, sectionId });
                  setFocusField(null);
                }}
                onMove={(blockId, dir) => dispatch({ type: "moveBlock", blockId, dir })}
                onAdd={(sectionId) => setAddingTo(sectionId)}
                onCollapse={() => setNavigatorOpen(false)}
              />
            </aside>
          )}

          <main className="glass min-w-0 rounded-3xl p-4">
            {!navigatorOpen && (
              <button
                type="button"
                onClick={() => setNavigatorOpen(true)}
                className="mb-3 inline-flex items-center gap-1.5 rounded-full fill-softer px-3 py-1.5 text-xs font-semibold text-ink ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-soft focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                <PanelLeftOpen className="h-3.5 w-3.5" /> {L.builder.navigator.expand}
              </button>
            )}
            {selected && selectedSection ? (
              <QuestionEditor
                block={selected}
                section={selectedSection}
                number={selectedNumber}
                dispatch={dispatch}
                findings={findingsForSelected}
                focusField={focusField}
              />
            ) : (
              <SectionManager
                content={state.content}
                dispatch={dispatch}
                onAdd={(sectionId) => setAddingTo(sectionId)}
              />
            )}
          </main>

          <aside className="glass hidden max-h-[70vh] overflow-y-auto rounded-3xl lg:block">
            <QuestionProperties block={selected} dispatch={dispatch} />
          </aside>
        </div>
      )}

      {step === "review" && (
        <ReviewPanel
          checklist={checklist}
          meta={state.meta}
          publicCode={assessment.code}
          versionLabel={`v${assessment.draftVersion.major}.${assessment.draftVersion.minor}`}
          lifecycleLabel={ASSESSMENT_LIFECYCLE_META[assessment.lifecycle].label}
          requiredQuestions={requiredQuestions}
          instructions={state.content.publicInstructions}
          serverIssues={serverIssues}
          onGoTo={goToFinding}
        />
      )}

      {addingTo && (
        <GlassDialog
          open
          onCancel={() => setAddingTo(null)}
          onConfirm={() => setAddingTo(null)}
          title={L.builder.addBlock}
          confirmLabel={L.common.close}
          cancelLabel={L.common.cancel}
          description={
            <div className="mt-2 max-h-72 overflow-y-auto">
              <ComponentLibrary
                onAdd={(type) => {
                  dispatch({ type: "addBlock", sectionId: addingTo, blockType: type });
                  setAddingTo(null);
                  setStep("questions");
                }}
              />
            </div>
          }
        />
      )}

      {previewDevice && (
        <AssessmentPreview
          assessment={withUpdates()}
          device={previewDevice}
          onDevice={setPreviewDevice}
          onClose={() => setPreviewDevice(null)}
        />
      )}

      <PublishDialog
        open={confirmPublish}
        busy={publishing}
        checklist={checklist}
        meta={state.meta}
        hasPublishedVersion={assessment.publishedVersions.length > 0}
        changeClass={changeClass}
        onCancel={() => setConfirmPublish(false)}
        onConfirm={(notes) => void confirmPublishNow(notes)}
      />

      <GlassDialog
        open={confirmLeave}
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => {
          setConfirmLeave(false);
          onBack();
        }}
        title={L.builder.save.leaveTitle}
        description={L.builder.save.leaveMessage}
        confirmLabel={L.builder.save.leaveConfirm}
        cancelLabel={L.builder.save.leaveCancel}
        destructive
      />
    </div>
  );
}

/**
 * Gestor de secciones: se muestra cuando no hay ninguna pregunta seleccionada.
 * Conserva las capacidades del lienzo anterior (crear, renombrar, mover y
 * eliminar secciones) sin ocupar espacio permanente.
 */
function SectionManager({
  content,
  dispatch,
  onAdd,
}: {
  content: { sections: { id: string; title: string; blocks: unknown[] }[] };
  dispatch: (action: Parameters<typeof builderReducer>[1]) => void;
  onAdd: (sectionId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <header>
        <h3 className="text-sm font-black text-ink">{L.builder.nav.questions}</h3>
        <p className="mt-0.5 text-xs text-ink-faint">{L.builder.editor.selectQuestion}</p>
      </header>

      <ul className="flex flex-col gap-2">
        {content.sections.map((section, index) => (
          <li
            key={section.id}
            className="flex flex-wrap items-center gap-2 rounded-2xl fill-soft p-3 ring-1 ring-[color:var(--hairline)]"
          >
            <TextInput
              value={section.title}
              aria-label={`Título de la sección ${index + 1}`}
              onChange={(event) =>
                dispatch({ type: "updateSection", sectionId: section.id, patch: { title: event.target.value } })
              }
              className="min-w-[10rem] flex-1"
              maxLength={300}
            />
            <span className="shrink-0 text-xs text-ink-faint">
              {section.blocks.length} bloque(s)
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label={`${L.builder.moveUp}: ${section.title}`}
                disabled={index === 0}
                onClick={() => dispatch({ type: "moveSection", sectionId: section.id, dir: -1 })}
                className="grid h-8 w-8 place-items-center rounded-full text-ink-soft transition-colors hover:fill-softer hover:text-ink focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-30"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={`${L.builder.moveDown}: ${section.title}`}
                disabled={index === content.sections.length - 1}
                onClick={() => dispatch({ type: "moveSection", sectionId: section.id, dir: 1 })}
                className="grid h-8 w-8 place-items-center rounded-full text-ink-soft transition-colors hover:fill-softer hover:text-ink focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-30"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onAdd(section.id)}
                className="inline-flex items-center gap-1.5 rounded-full fill-softer px-3 py-1.5 text-xs font-semibold text-ink ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-soft focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                <Plus className="h-3.5 w-3.5" /> {L.builder.addBlock}
              </button>
              <button
                type="button"
                aria-label={`${L.common.delete}: ${section.title}`}
                onClick={() => dispatch({ type: "removeSection", sectionId: section.id })}
                className="grid h-8 w-8 place-items-center rounded-full text-ink-soft transition-colors hover:bg-rose-500/70 hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => dispatch({ type: "addSection" })}
        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[color:var(--hairline)] py-3 text-sm font-semibold text-ink-soft transition-colors hover:fill-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        <Plus className="h-4 w-4" /> {L.builder.addSection}
      </button>
    </div>
  );
}
