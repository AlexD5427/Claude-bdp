import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { HelpCircle, X, Sparkles } from "lucide-react";
import { useTalentData } from "../context/TalentDataContext";
import {
  buildCompetencyCatalog,
  lookupCompetency,
  type CompetencyMeta,
} from "../lib/competencyMeta";
import { CompetencyLevelBoxes } from "./CompetencyLevelBoxes";

interface CompetencyInfoButtonProps {
  /** Competency name; its metadata is resolved from the live catalogue. */
  name: string;
  /** Or pass resolved metadata directly (skips the catalogue lookup). */
  meta?: CompetencyMeta | null;
  size?: "sm" | "md";
  className?: string;
}

/**
 * A tiny circular "?" badge shown next to a competency. Clicking it (mouse only
 * — it is intentionally removed from the Tab order via `tabIndex={-1}`) opens a
 * pop-up with the competency's name, its level applicability and the description
 * authored in the "Auxiliar" sheet.
 *
 * It renders nothing when there is no description to show, so it can be dropped
 * in beside any competency safely (in the intake form and the comparator alike).
 */
export function CompetencyInfoButton({
  name,
  meta,
  size = "md",
  className = "",
}: CompetencyInfoButtonProps) {
  const { competencias } = useTalentData();
  const [open, setOpen] = useState(false);

  const catalog = useMemo(() => buildCompetencyCatalog(competencias), [competencias]);
  const resolved = meta ?? lookupCompetency(catalog, name) ?? null;

  // Nothing worth explaining? Then don't render the badge at all.
  if (!resolved || (!resolved.description && !resolved.hasLevels)) return null;

  const dim = size === "sm" ? "h-5 w-5" : "h-6 w-6";
  const icon = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <>
      <button
        type="button"
        // Mouse-only affordance: never reachable through keyboard Tab navigation.
        tabIndex={-1}
        aria-label={`¿Qué evalúa ${resolved.name}?`}
        title={`¿Qué evalúa ${resolved.name}?`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={`grid ${dim} shrink-0 place-items-center rounded-full bg-cyan-500/15 text-cyan-500 ring-1 ring-cyan-400/40 transition-all duration-300 hover:scale-110 hover:bg-cyan-500/25 active:scale-90 ${className}`}
      >
        <HelpCircle className={icon} />
      </button>
      <CompetencyInfoModal open={open} onClose={() => setOpen(false)} meta={resolved} />
    </>
  );
}

function CompetencyInfoModal({
  open,
  onClose,
  meta,
}: {
  open: boolean;
  onClose: () => void;
  meta: CompetencyMeta;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Consume Escape in the capture phase so it closes only this pop-up and
      // never bubbles to a parent modal (e.g. the intake form's exit guard).
      e.stopImmediatePropagation();
      e.preventDefault();
      onClose();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[160] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label={`Información de la competencia ${meta.name}`}
        >
          <div className="fixed inset-0 bg-slate-950/55 backdrop-blur-md" onClick={onClose} />
          <motion.div
            className="glass-heavy relative z-10 w-full max-w-md overflow-hidden rounded-3xl"
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
          >
            <div className="relative flex items-center gap-3 bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-5 py-4">
              <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
              <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/20 text-white ring-1 ring-white/40">
                <Sparkles className="h-5 w-5" />
              </span>
              <div className="relative min-w-0">
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-white/80">
                  Competencia
                </p>
                <h3 className="text-lg font-black leading-tight text-white drop-shadow-md">
                  {meta.name}
                </h3>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={onClose}
                className="relative ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/20 text-white ring-1 ring-white/30 transition-all hover:bg-white/30 active:scale-90"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              {meta.hasLevels && (
                <div className="flex items-center justify-between gap-3 rounded-2xl fill-softer px-4 py-3 ring-1 ring-[color:var(--hairline)]">
                  <span className="text-xs font-semibold text-ink-soft">
                    Asociación por nivel de cargo
                  </span>
                  <CompetencyLevelBoxes levels={meta.levels} compact />
                </div>
              )}
              {meta.description ? (
                <p className="text-sm leading-relaxed text-ink-soft">{meta.description}</p>
              ) : (
                <p className="text-sm italic leading-relaxed text-ink-faint">
                  Esta competencia aún no tiene una descripción registrada en la hoja
                  «Auxiliar». Agréguela con el formato «Nombre,Bajo,Medio,Alto,"Descripción"».
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
