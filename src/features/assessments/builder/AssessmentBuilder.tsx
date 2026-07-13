import { useMemo, useReducer, useState } from "react";
import {
  ArrowLeft, Undo2, Redo2, Eye, Send, Save, Monitor, Tablet, Smartphone, AlertTriangle, CheckCircle2, Clock, Hash, ListChecks,
} from "lucide-react";
import { L, formatDuration } from "../../../content/locale";
import { toast } from "../../../design-system/liquid-glass/toast";
import { StatusPill } from "../../../design-system/liquid-glass/StatusPill";
import { GlassDialog } from "../../../design-system/liquid-glass/GlassDialog";
import { useUnsavedChangesWarning } from "../../../shared/hooks";
import { builderReducer, initBuilder, selectedBlock } from "./builderState";
import { validateContent } from "../scoring/validateContent";
import { classifyContentChange } from "../versioning/classify";
import { versionLabel, type AssessmentDefinition } from "../domain/assessment";
import { ASSESSMENT_LIFECYCLE_META } from "../domain/lifecycle";
import { ComponentLibrary } from "./ComponentLibrary";
import { BuilderCanvas } from "./BuilderCanvas";
import { BuilderInspector } from "./BuilderInspector";
import { AssessmentPreview } from "../ui/AssessmentPreview";
import type { TalentPermissions } from "../../shared/permissions";

interface BuilderProps {
  assessment: AssessmentDefinition;
  permissions: TalentPermissions;
  onBack: () => void;
  onSave: (next: AssessmentDefinition) => Promise<void>;
  onPublish: (next: AssessmentDefinition) => Promise<void>;
}

type Device = "desktop" | "tablet" | "mobile";

/** The visual assessment builder shell: toolbar, library, canvas, inspector. */
export function AssessmentBuilder({ assessment, permissions, onBack, onSave, onPublish }: BuilderProps) {
  const [state, dispatch] = useReducer(builderReducer, assessment.draftVersion.content, initBuilder);
  const [previewDevice, setPreviewDevice] = useState<Device | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);

  const dirty = useMemo(
    () => JSON.stringify(state.content) !== JSON.stringify(assessment.draftVersion.content),
    [state.content, assessment.draftVersion.content],
  );
  useUnsavedChangesWarning(dirty);

  const validation = useMemo(() => validateContent(state.content), [state.content]);
  const selected = selectedBlock(state);

  // Classify the pending change against the last published version (if any).
  const lastPublished = assessment.publishedVersions[assessment.publishedVersions.length - 1] ?? null;
  const changeReport = useMemo(
    () => (lastPublished ? classifyContentChange(lastPublished.content, state.content) : null),
    [lastPublished, state.content],
  );

  const withUpdatedContent = (): AssessmentDefinition => ({
    ...assessment,
    draftVersion: { ...assessment.draftVersion, content: state.content },
    estimatedDurationMinutes: validation.estimatedMinutes,
  });

  const save = async () => {
    setSaving(true);
    await onSave(withUpdatedContent());
    setSaving(false);
  };

  const publish = async () => {
    if (!validation.canPublish) {
      toast.warning("Corrige los errores antes de publicar.");
      return;
    }
    setConfirmPublish(true);
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      {/* Top toolbar */}
      <div className="glass mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={onBack} aria-label={L.common.back} className="grid h-9 w-9 place-items-center rounded-full fill-softer text-ink ring-1 ring-[color:var(--hairline)] hover:fill-soft">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-ink">{assessment.name || L.builder.untitled}</p>
            <div className="flex items-center gap-2 text-xs text-ink-faint">
              <span>{versionLabel(assessment.draftVersion)}</span>
              <StatusPill intent={ASSESSMENT_LIFECYCLE_META[assessment.lifecycle].intent}>
                {ASSESSMENT_LIFECYCLE_META[assessment.lifecycle].label}
              </StatusPill>
              <span>{dirty ? L.common.unsavedChanges : L.common.saved}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <IconButton label={L.builder.undo} disabled={state.past.length === 0} onClick={() => dispatch({ type: "undo" })}><Undo2 className="h-4 w-4" /></IconButton>
          <IconButton label={L.builder.redo} disabled={state.future.length === 0} onClick={() => dispatch({ type: "redo" })}><Redo2 className="h-4 w-4" /></IconButton>
          <div className="mx-1 h-6 w-px bg-[color:var(--hairline)]" />
          <IconButton label={`${L.common.preview} · ${L.builder.device.desktop}`} onClick={() => setPreviewDevice("desktop")}><Monitor className="h-4 w-4" /></IconButton>
          <IconButton label={`${L.common.preview} · ${L.builder.device.tablet}`} onClick={() => setPreviewDevice("tablet")}><Tablet className="h-4 w-4" /></IconButton>
          <IconButton label={`${L.common.preview} · ${L.builder.device.mobile}`} onClick={() => setPreviewDevice("mobile")}><Smartphone className="h-4 w-4" /></IconButton>
          <IconButton label={L.common.preview} onClick={() => setPreviewDevice("desktop")}><Eye className="h-4 w-4" /></IconButton>
          <div className="mx-1 h-6 w-px bg-[color:var(--hairline)]" />
          {permissions.edit && (
            <button type="button" onClick={save} disabled={saving || !dirty} className="inline-flex items-center gap-1.5 rounded-full fill-softer px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-[color:var(--hairline)] hover:fill-soft disabled:opacity-50">
              <Save className="h-4 w-4" /> {saving ? L.common.saving : L.common.save}
            </button>
          )}
          {permissions.publish && (
            <button type="button" onClick={publish} className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 px-4 py-1.5 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 hover:-translate-y-0.5">
              <Send className="h-4 w-4" /> {L.common.publish}
            </button>
          )}
        </div>
      </div>

      {/* Three-pane layout */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[16rem_1fr_20rem]">
        <aside className="glass hidden overflow-hidden rounded-2xl lg:block">
          <ComponentLibrary onAdd={(type) => dispatch({ type: "addBlock", sectionId: firstOrSelectedSection(state), blockType: type })} />
        </aside>

        <main className="min-h-0 overflow-y-auto rounded-2xl">
          <BuilderCanvas
            content={state.content}
            selectedBlockId={state.selectedBlockId}
            dispatch={dispatch}
            onAddBlock={(sectionId) => setAddingTo(sectionId)}
          />
        </main>

        <aside className="glass hidden min-h-0 overflow-y-auto rounded-2xl lg:block">
          <BuilderInspector block={selected} onPatch={(patch) => selected && dispatch({ type: "updateBlock", blockId: selected.id, patch })} />
        </aside>
      </div>

      {/* Status area */}
      <div className="glass mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-2xl px-4 py-2 text-xs">
        <StatusStat icon={<ListChecks className="h-3.5 w-3.5" />} label={L.builder.status.questionCount} value={String(validation.questionCount)} />
        <StatusStat icon={<Hash className="h-3.5 w-3.5" />} label={L.builder.status.totalPoints} value={String(validation.totalPoints)} />
        <StatusStat icon={<Clock className="h-3.5 w-3.5" />} label={L.builder.status.estimatedDuration} value={formatDuration(validation.estimatedMinutes)} />
        {validation.errors.length > 0 ? (
          <span className="inline-flex items-center gap-1 font-semibold text-rose-300"><AlertTriangle className="h-3.5 w-3.5" /> {validation.errors.length} {L.builder.status.errors}</span>
        ) : (
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> {L.builder.status.valid}</span>
        )}
        {validation.warnings.length > 0 && (
          <span className="inline-flex items-center gap-1 text-amber-300"><AlertTriangle className="h-3.5 w-3.5" /> {validation.warnings.length} {L.builder.status.warnings}</span>
        )}
        {changeReport && changeReport.classification !== "none" && (
          <span className={`ml-auto inline-flex items-center gap-1 ${changeReport.classification === "structural" ? "text-amber-300" : "text-cyan-300"}`}>
            {changeReport.classification === "structural" ? L.versioning.newVersion : L.versioning.minorRevision}
          </span>
        )}
      </div>

      {/* Add-block picker for a specific section (mobile-friendly + explicit) */}
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
                }}
              />
            </div>
          }
        />
      )}

      {previewDevice && (
        <AssessmentPreview
          assessment={withUpdatedContent()}
          device={previewDevice}
          onDevice={setPreviewDevice}
          onClose={() => setPreviewDevice(null)}
        />
      )}

      <GlassDialog
        open={confirmPublish}
        onCancel={() => setConfirmPublish(false)}
        onConfirm={async () => {
          setConfirmPublish(false);
          await onPublish(withUpdatedContent());
        }}
        title={changeReport?.classification === "structural" ? L.versioning.structuralChangeTitle : "¿Publicar esta versión?"}
        description={
          changeReport?.classification === "structural"
            ? L.versioning.structuralChangeMessage
            : lastPublished
              ? L.versioning.safeChangeMessage
              : "Se creará la versión v1.0. Los intentos existentes no se modifican."
        }
        confirmLabel={L.common.publish}
        intent="success"
      />
    </div>
  );
}

function firstOrSelectedSection(state: ReturnType<typeof initBuilder>): string {
  return state.selectedSectionId ?? state.content.sections[0]?.id ?? "";
}

function IconButton({ children, label, onClick, disabled }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="grid h-9 w-9 place-items-center rounded-full fill-softer text-ink ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-soft disabled:opacity-40">
      {children}
    </button>
  );
}

function StatusStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-ink-soft">
      {icon}
      <span className="text-ink-faint">{label}:</span>
      <span className="font-bold text-ink">{value}</span>
    </span>
  );
}
