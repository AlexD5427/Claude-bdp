import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, Sparkles } from "lucide-react";
import type { DiscArchetype } from "../lib/disc";
import { discAccent } from "../lib/discAccent";

interface DiscInfoModalProps {
  open: boolean;
  onClose: () => void;
  archetype: DiscArchetype | null;
}

/**
 * A small, self-contained pop-up that explains what a DISC archetype means.
 * Rendered in its own portal at a very high z-index so it stacks cleanly above
 * the intake-form modal (which itself lives in a portal). The colour of the
 * header follows the classic DISC palette (D·red, I·amber, S·green, C·blue).
 */
export function DiscInfoModal({ open, onClose, archetype }: DiscInfoModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Consume the Escape in the capture phase so it closes *only* this pop-up
      // and never bubbles to a parent modal (e.g. the intake form), which would
      // otherwise fire its own exit-confirmation guard.
      e.stopImmediatePropagation();
      e.preventDefault();
      onClose();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  const accent = discAccent(archetype?.code ?? "");

  return createPortal(
    <AnimatePresence>
      {open && archetype && (
        <motion.div
          className="fixed inset-0 z-[140] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label={`Información del arquetipo ${archetype.label}`}
        >
          <div
            className="fixed inset-0 bg-slate-950/55 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div
            className="glass-heavy relative z-10 w-full max-w-md overflow-hidden rounded-3xl"
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
          >
            {/* Coloured header band */}
            <div
              className={`relative flex items-center gap-3 bg-gradient-to-br ${accent.gradient} px-5 py-4`}
            >
              <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
              <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/20 text-lg font-black text-white ring-1 ring-white/40">
                {archetype.code || <Sparkles className="h-5 w-5" />}
              </span>
              <div className="relative min-w-0">
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-white/80">
                  Arquetipo DISC
                </p>
                <h3 className="truncate text-lg font-black text-white drop-shadow-md">
                  {archetype.label}
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

            <div className="px-5 py-5">
              {archetype.description ? (
                <p className="text-sm leading-relaxed text-ink-soft">
                  {archetype.description}
                </p>
              ) : (
                <p className="text-sm italic leading-relaxed text-ink-faint">
                  Aún no hay una descripción registrada para este arquetipo en la
                  hoja «Auxiliar» (columna <code>arquetipo_disc</code>). Agréguela
                  con el formato «Nombre (Código), Descripción…».
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
