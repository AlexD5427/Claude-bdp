import { Eye, Pencil } from "lucide-react";
import { openProfile } from "../lib/profileViewerStore";
import { openEdit } from "../lib/candidateEditStore";

/**
 * The two universal actions that must accompany a candidate anywhere they
 * appear across the app: **Ver perfil** (opens the full-profile panel) and
 * **Editar** (opens the global edit modal). Centralising them here guarantees
 * the exact same affordance — and the exact same wiring to
 * {@link ../lib/profileViewerStore} and {@link ../lib/candidateEditStore} — in
 * every module (comparador, procesos, postulantes, documentación, dashboard…).
 */

type Variant = "glass" | "onGradient";
type Size = "sm" | "md";

export function CandidateActions({
  id,
  name,
  variant = "glass",
  size = "sm",
  showLabels = false,
  className = "",
}: {
  /** The stable `Candidate.id` (its identificador). */
  id: string;
  /** Full name, for accessible labels. */
  name: string;
  /** `onGradient` styles the buttons for the blue profile card. */
  variant?: Variant;
  size?: Size;
  showLabels?: boolean;
  className?: string;
}) {
  const dim = size === "sm" ? "h-8 w-8" : "h-9 w-9";
  const icon = size === "sm" ? "h-4 w-4" : "h-4.5 w-4.5";
  const base =
    variant === "onGradient"
      ? "bg-white/20 text-white ring-white/30 hover:bg-white/30"
      : "fill-softer text-ink-soft ring-[color:var(--hairline)] hover:fill-soft hover:text-cyan-400";

  const btn = (extra: string) =>
    [
      "no-print inline-flex items-center justify-center gap-1.5 rounded-full ring-1 transition-all duration-300 active:scale-90",
      showLabels ? "px-3 py-1.5 text-xs font-bold" : dim,
      base,
      extra,
    ].join(" ");

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <button
        type="button"
        title={`Ver perfil completo de ${name}`}
        aria-label={`Ver perfil completo de ${name}`}
        onClick={(e) => {
          e.stopPropagation();
          openProfile(id);
        }}
        className={btn("")}
      >
        <Eye className={icon} />
        {showLabels && <span>Ver perfil</span>}
      </button>
      <button
        type="button"
        title={`Editar a ${name}`}
        aria-label={`Editar a ${name}`}
        onClick={(e) => {
          e.stopPropagation();
          openEdit(id);
        }}
        className={btn("")}
      >
        <Pencil className={icon} />
        {showLabels && <span>Editar</span>}
      </button>
    </div>
  );
}
