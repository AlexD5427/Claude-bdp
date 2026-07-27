import { AlertTriangle, Check, CircleDot, Loader2, RefreshCw, WifiOff } from "lucide-react";
import { L, formatRelative } from "../../../content/locale";
import { StatusPill } from "../../../design-system/liquid-glass/StatusPill";
import type { Intent } from "../../../design-system/tokens";

/**
 * Estado de guardado del constructor.
 *
 * `dirty` es lo que el usuario percibe como «tengo cambios pendientes» y es
 * también la condición que activa la guardia de salida. `conflict` aparece
 * cuando el servidor detecta que otra persona modificó la evaluación.
 */
export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict" | "offline";

interface SaveStatusProps {
  state: SaveState;
  lastSavedAt: string | null;
  onRetry?: () => void;
  autosave?: boolean;
}

const META: Record<SaveState, { label: string; intent: Intent }> = {
  idle: { label: L.builder.save.idle, intent: "neutral" },
  dirty: { label: L.builder.save.dirty, intent: "warning" },
  saving: { label: L.builder.save.saving, intent: "info" },
  saved: { label: L.builder.save.saved, intent: "success" },
  error: { label: L.builder.save.error, intent: "danger" },
  conflict: { label: L.builder.save.conflict, intent: "danger" },
  offline: { label: L.builder.save.offline, intent: "warning" },
};

function Icon({ state }: { state: SaveState }) {
  const className = "h-3.5 w-3.5";
  if (state === "saving") return <Loader2 className={`${className} animate-spin`} />;
  if (state === "saved") return <Check className={className} />;
  if (state === "error" || state === "conflict") return <AlertTriangle className={className} />;
  if (state === "offline") return <WifiOff className={className} />;
  return <CircleDot className={className} />;
}

/**
 * Indicador de guardado. Cumple dos requisitos de accesibilidad:
 *  · El estado nunca se comunica solo con color: siempre hay etiqueta e icono.
 *  · Los cambios se anuncian a los lectores de pantalla con `aria-live`.
 */
export function SaveStatus({ state, lastSavedAt, onRetry, autosave }: SaveStatusProps) {
  const meta = META[state];
  const showRetry = (state === "error" || state === "conflict") && onRetry;
  return (
    <div className="flex items-center gap-2">
      <span role="status" aria-live="polite" className="contents">
        <StatusPill intent={meta.intent} icon={<Icon state={state} />}>
          {meta.label}
        </StatusPill>
      </span>
      {lastSavedAt && (state === "saved" || state === "idle") && (
        <span className="hidden text-[0.7rem] text-ink-faint sm:inline">
          {L.builder.save.lastSaved}: {formatRelative(lastSavedAt)}
        </span>
      )}
      {autosave && state !== "saving" && (
        <span className="hidden text-[0.7rem] text-ink-faint lg:inline">{L.builder.save.autosaveOn}</span>
      )}
      {showRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 rounded-full fill-softer px-2.5 py-1 text-[0.7rem] font-semibold text-ink ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-soft"
        >
          <RefreshCw className="h-3 w-3" /> {L.builder.save.retry}
        </button>
      )}
    </div>
  );
}
