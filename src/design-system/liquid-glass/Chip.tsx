import type { ReactNode } from "react";
import { X } from "lucide-react";

interface ChipProps {
  children: ReactNode;
  /** When provided, renders a remove (✕) affordance. */
  onRemove?: () => void;
  onClick?: () => void;
  active?: boolean;
  removeLabel?: string;
}

/** A small glass chip used for active filters and tags. */
export function Chip({ children, onRemove, onClick, active, removeLabel = "Quitar" }: ChipProps) {
  const base =
    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 transition-colors";
  const tone = active
    ? "bg-cyan-500/20 text-cyan-100 ring-cyan-400/40"
    : "fill-softer text-ink-soft ring-[color:var(--hairline)] hover:text-ink";
  return (
    <span className={`${base} ${tone}`}>
      {onClick ? (
        <button type="button" onClick={onClick} className="outline-none">
          {children}
        </button>
      ) : (
        children
      )}
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          className="grid h-4 w-4 place-items-center rounded-full text-ink-faint transition-colors hover:bg-rose-500/70 hover:text-white"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
