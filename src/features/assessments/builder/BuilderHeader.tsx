import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Eye, MoreHorizontal, Redo2, Save, Send, ShieldCheck, Undo2 } from "lucide-react";
import { L } from "../../../content/locale";
import { StatusPill } from "../../../design-system/liquid-glass/StatusPill";
import { Z } from "../../../design-system/tokens";
import { ASSESSMENT_LIFECYCLE_META } from "../domain/lifecycle";
import type { AssessmentDefinition } from "../domain/assessment";
import type { TalentPermissions } from "../../shared/permissions";
import { SaveStatus, type SaveState } from "./SaveStatus";

export interface HeaderAction {
  id: string;
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

interface BuilderHeaderProps {
  assessment: AssessmentDefinition;
  title: string;
  permissions: TalentPermissions;
  saveState: SaveState;
  lastSavedAt: string | null;
  autosave: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canPublish: boolean;
  blockingErrors: number;
  onBack: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onRetrySave: () => void;
  onPreview: () => void;
  onReview: () => void;
  onPublish: () => void;
  extraActions: HeaderAction[];
}

/**
 * Barra superior contextual y estable del constructor.
 *
 * Mantiene siempre visible dónde está el usuario (nombre, estado, versión), qué
 * está pasando con sus cambios (`SaveStatus`) y las tres acciones inequívocas:
 * guardar borrador, revisar y publicar. «Publicar» es visualmente distinto de
 * «Guardar borrador» a propósito, y no se mueve al pasar el cursor.
 */
export function BuilderHeader({
  assessment,
  title,
  permissions,
  saveState,
  lastSavedAt,
  autosave,
  canUndo,
  canRedo,
  canPublish,
  blockingErrors,
  onBack,
  onUndo,
  onRedo,
  onSave,
  onRetrySave,
  onPreview,
  onReview,
  onPublish,
  extraActions,
}: BuilderHeaderProps) {
  const lifecycle = ASSESSMENT_LIFECYCLE_META[assessment.lifecycle];
  return (
    <header className="glass sticky top-2 z-10 mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-3xl px-3 py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <button
          type="button"
          onClick={onBack}
          aria-label={L.common.back}
          title={L.common.back}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full fill-softer text-ink ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-soft focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-ink">{title || L.builder.untitled}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.7rem] text-ink-faint">
            <StatusPill intent={lifecycle.intent}>{lifecycle.label}</StatusPill>
            <span className="font-mono">{assessment.code}</span>
            <span>
              {L.builder.settings.version} v{assessment.draftVersion.major}.
              {assessment.draftVersion.minor}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <SaveStatus
          state={saveState}
          lastSavedAt={lastSavedAt}
          onRetry={onRetrySave}
          autosave={autosave}
        />
        <div className="mx-1 hidden h-6 w-px bg-[color:var(--hairline)] sm:block" />
        <IconButton label={L.builder.undo} disabled={!canUndo} onClick={onUndo}>
          <Undo2 className="h-4 w-4" />
        </IconButton>
        <IconButton label={L.builder.redo} disabled={!canRedo} onClick={onRedo}>
          <Redo2 className="h-4 w-4" />
        </IconButton>
        <IconButton label={L.common.preview} onClick={onPreview}>
          <Eye className="h-4 w-4" />
        </IconButton>
        <button
          type="button"
          onClick={onReview}
          className="inline-flex items-center gap-1.5 rounded-full fill-softer px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-soft focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <ShieldCheck className="h-4 w-4" />
          <span className="hidden sm:inline">{L.builder.review.openAction}</span>
          <span className="sr-only sm:hidden">{L.builder.review.openAction}</span>
          {blockingErrors > 0 && (
            <span className="rounded-full bg-rose-500/25 px-1.5 text-[0.7rem] font-bold text-rose-200">
              {blockingErrors}
            </span>
          )}
        </button>
        {permissions.edit && (
          <button
            type="button"
            onClick={onSave}
            disabled={saveState === "saving" || saveState === "idle" || saveState === "saved"}
            className="inline-flex items-center gap-1.5 rounded-full fill-softer px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-soft focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-45"
          >
            <Save className="h-4 w-4" />
            <span className="hidden sm:inline">{L.common.saveDraft}</span>
          </button>
        )}
        {permissions.publish && (
          <button
            type="button"
            onClick={onPublish}
            aria-describedby={canPublish ? undefined : "publish-blocked-hint"}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-[box-shadow,filter] focus-visible:ring-2 focus-visible:ring-cyan-200 ${
              canPublish
                ? "bg-gradient-to-br from-emerald-500 to-teal-600 hover:brightness-110"
                : "bg-gradient-to-br from-slate-500 to-slate-600 opacity-80"
            }`}
          >
            <Send className="h-4 w-4" /> {L.common.publish}
          </button>
        )}
        {!canPublish && (
          <span id="publish-blocked-hint" className="sr-only">
            {L.builder.publish.blocked}
          </span>
        )}
        {extraActions.length > 0 && <ActionMenu actions={extraActions} />}
      </div>
    </header>
  );
}

function IconButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-9 w-9 place-items-center rounded-full fill-softer text-ink ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-soft focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** Menú de acciones adicionales (duplicar, archivar, revertir…). */
function ActionMenu({ actions }: { actions: HeaderAction[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <IconButton label={L.common.moreActions} onClick={() => setOpen((value) => !value)}>
        <MoreHorizontal className="h-4 w-4" />
      </IconButton>
      {open && (
        <div
          role="menu"
          style={{ zIndex: Z.dropdown }}
          className="glass-heavy absolute right-0 top-11 w-56 rounded-2xl p-1.5"
        >
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                action.onSelect();
              }}
              className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-sm transition-colors hover:fill-softer ${
                action.danger ? "text-rose-300" : "text-ink"
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
