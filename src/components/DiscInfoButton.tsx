import { useState } from "react";
import { CircleAlert } from "lucide-react";
import { DiscInfoModal } from "./DiscInfoModal";
import { resolveDiscArchetype, type DiscArchetype } from "../lib/disc";
import { useTalentData } from "../context/TalentDataContext";

interface DiscInfoButtonProps {
  /** A candidate's stored perfil_disc, e.g. "Director (D)". */
  perfil?: string | null;
  /** Or pass a resolved archetype directly (skips the catalogue lookup). */
  archetype?: DiscArchetype | null;
  /** Small (table cells) or default. */
  size?: "sm" | "md";
  className?: string;
}

/**
 * A tiny "!" badge shown next to a DISC archetype. Clicking it opens a pop-up
 * explaining the archetype's meaning, resolved from the DISC catalogue (the
 * "Auxiliar" sheet, or the fallback). Renders nothing when there is no archetype
 * to explain (e.g. "N/A"), so it can be dropped in beside any DISC value safely.
 */
export function DiscInfoButton({
  perfil,
  archetype,
  size = "md",
  className = "",
}: DiscInfoButtonProps) {
  const { arquetipos } = useTalentData();
  const [open, setOpen] = useState(false);

  const resolved =
    archetype ?? resolveDiscArchetype(arquetipos, perfil ?? "");
  if (!resolved) return null;

  const dim = size === "sm" ? "h-5 w-5" : "h-6 w-6";
  const icon = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <>
      <button
        type="button"
        aria-label={`¿Qué significa ${resolved.label}?`}
        title={`¿Qué significa ${resolved.label}?`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={`grid ${dim} shrink-0 place-items-center rounded-full bg-cyan-500/15 text-cyan-500 ring-1 ring-cyan-400/40 transition-all duration-300 hover:scale-110 hover:bg-cyan-500/25 active:scale-90 ${className}`}
      >
        <CircleAlert className={icon} />
      </button>
      <DiscInfoModal open={open} onClose={() => setOpen(false)} archetype={resolved} />
    </>
  );
}
