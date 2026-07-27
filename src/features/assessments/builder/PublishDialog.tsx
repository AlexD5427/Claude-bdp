import { useState } from "react";
import { L, formatDuration } from "../../../content/locale";
import { GlassDialog } from "../../../design-system/liquid-glass/GlassDialog";
import type { PublishChecklist } from "../domain/publish";
import type { BuilderMeta } from "./builderState";

interface PublishDialogProps {
  open: boolean;
  busy: boolean;
  checklist: PublishChecklist;
  meta: BuilderMeta;
  hasPublishedVersion: boolean;
  /** Clasificación del cambio frente a la última versión publicada. */
  changeClass: "none" | "safe" | "structural" | null;
  onCancel: () => void;
  onConfirm: (notes: string) => void;
}

/**
 * Confirmación final de publicación.
 *
 * Resume lo que se va a publicar, avisa si el cambio creará una versión mayor y
 * permite dejar notas de versión. No se puede confirmar con errores bloqueantes:
 * el botón queda deshabilitado y se explica por qué.
 */
export function PublishDialog({
  open,
  busy,
  checklist,
  meta,
  hasPublishedVersion,
  changeClass,
  onCancel,
  onConfirm,
}: PublishDialogProps) {
  const [notes, setNotes] = useState("");
  const blocked = !checklist.canPublish;

  const title = blocked
    ? L.builder.publish.blocked
    : changeClass === "structural"
      ? L.versioning.structuralChangeTitle
      : L.builder.publish.title;

  const message = blocked
    ? `${checklist.errors.length} ${L.builder.status.errors}. ${L.builder.publish.blocked}`
    : changeClass === "structural"
      ? L.versioning.structuralChangeMessage
      : hasPublishedVersion
        ? L.versioning.safeChangeMessage
        : L.builder.publish.firstVersion;

  return (
    <GlassDialog
      open={open}
      busy={busy}
      onCancel={onCancel}
      onConfirm={() => {
        if (blocked) {
          onCancel();
          return;
        }
        onConfirm(notes.trim());
      }}
      title={title}
      confirmLabel={blocked ? L.common.close : busy ? L.builder.publish.publishing : L.builder.publish.confirm}
      cancelLabel={L.common.cancel}
      intent="success"
      description={
        <div className="flex flex-col gap-3">
          <p>{message}</p>
          {!blocked && (
            <>
              <ul className="flex flex-col gap-1 rounded-2xl fill-soft px-3 py-2 text-xs ring-1 ring-[color:var(--hairline)]">
                <li className="flex justify-between gap-3">
                  <span className="text-ink-faint">{L.builder.review.questionsTotal}</span>
                  <span className="font-bold text-ink">{checklist.questionCount}</span>
                </li>
                <li className="flex justify-between gap-3">
                  <span className="text-ink-faint">{L.builder.review.questionsAuto}</span>
                  <span className="font-bold text-ink">{checklist.autoGradableQuestions}</span>
                </li>
                <li className="flex justify-between gap-3">
                  <span className="text-ink-faint">{L.builder.review.questionsManual}</span>
                  <span className="font-bold text-ink">{checklist.manualReviewQuestions}</span>
                </li>
                <li className="flex justify-between gap-3">
                  <span className="text-ink-faint">{L.builder.settings.duration}</span>
                  <span className="font-bold text-ink">
                    {meta.durationMinutes > 0
                      ? formatDuration(meta.durationMinutes)
                      : L.builder.settings.noTimeLimit}
                  </span>
                </li>
                <li className="flex justify-between gap-3">
                  <span className="text-ink-faint">{L.builder.settings.passingScore}</span>
                  <span className="font-bold text-ink">
                    {meta.passingScore === null ? L.builder.settings.noPassingScore : meta.passingScore}
                  </span>
                </li>
              </ul>
              <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-soft">
                {L.builder.publish.notes}
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  maxLength={2000}
                  className="w-full rounded-2xl fill-soft px-3 py-2 text-sm font-normal normal-case tracking-normal text-ink outline-none ring-1 ring-[color:var(--hairline)] focus-visible:ring-2 focus-visible:ring-cyan-300"
                />
              </label>
            </>
          )}
        </div>
      }
    />
  );
}
