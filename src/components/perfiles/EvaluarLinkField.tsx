import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ExternalLink, Link2, AlertTriangle, ShieldQuestion } from "lucide-react";
import { isValidEvaluarUrl } from "../../lib/perfilCargo";
import { toast } from "../../design-system/liquid-glass/toast";

/**
 * The Evaluar.com convocatoria link, with a two-stage check:
 *   1. An automatic format filter (`isValidEvaluarUrl`).
 *   2. A human confirmation: once the operator visits the link in a new tab and
 *      returns, a blocking Liquid Glass pop-up asks whether it works. Only "El
 *      enlace funciona" marks it verified; "Cambiar el enlace" sends them back
 *      to enter a new one (re-using the same rejected URL warns them).
 */
export function EvaluarLinkField({
  value,
  onChange,
  verified,
  onVerifiedChange,
}: {
  value: string;
  onChange: (v: string) => void;
  verified: boolean;
  onVerifiedChange: (v: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const awaitingReturn = useRef(false);
  const rejected = useRef<Set<string>>(new Set());

  const trimmed = value.trim();
  const formatOk = isValidEvaluarUrl(trimmed);

  // Any edit invalidates a previous human verification.
  const handleChange = (v: string) => {
    if (verified) onVerifiedChange(false);
    onChange(v);
  };

  // When the operator returns to the tab after visiting, prompt for the verdict.
  useEffect(() => {
    const onFocus = () => {
      if (awaitingReturn.current) {
        awaitingReturn.current = false;
        setConfirmOpen(true);
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const visit = () => {
    if (!formatOk) return;
    if (rejected.current.has(trimmed)) {
      toast.warning("Es el mismo enlace que marcaste como no funcional. Si vuelve a fallar, ingresa uno distinto.");
    }
    awaitingReturn.current = true;
    window.open(trimmed, "_blank", "noopener,noreferrer");
  };

  const confirmWorks = () => {
    setConfirmOpen(false);
    rejected.current.delete(trimmed);
    onVerifiedChange(true);
    toast.success("Enlace de Evaluar verificado.");
  };

  const confirmChange = () => {
    setConfirmOpen(false);
    rejected.current.add(trimmed);
    onVerifiedChange(false);
    window.setTimeout(() => inputRef.current?.focus(), 120);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint">
          <Link2 className="h-4 w-4" />
        </span>
        <input
          ref={inputRef}
          type="url"
          inputMode="url"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="https://bdp.evaluar.com/trabajo/nombre-de-la-convocatoria/"
          className={[
            "w-full rounded-2xl fill-soft py-2.5 pl-10 pr-11 text-sm text-ink outline-none ring-1 transition-shadow placeholder:text-ink-faint focus-visible:ring-2 focus-visible:ring-cyan-300",
            trimmed && !formatOk ? "ring-rose-400/60" : "ring-[color:var(--hairline)]",
          ].join(" ")}
        />
        {verified && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={visit}
          disabled={!formatOk}
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-4 py-2 text-xs font-bold text-white shadow-glass ring-1 ring-white/30 transition-all duration-300 hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Visitar enlace
        </button>
        {trimmed && !formatOk && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            El formato no coincide con el patrón de Evaluar.
          </span>
        )}
        {formatOk && !verified && (
          <span className="text-xs text-ink-faint">Visítalo para confirmar que funciona.</span>
        )}
        {verified && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Verificado manualmente.
          </span>
        )}
      </div>

      {createPortal(
        <AnimatePresence>
          {confirmOpen && (
            <motion.div
              className="fixed inset-0 z-[130] flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              role="alertdialog"
              aria-modal="true"
              aria-label="Confirmación del enlace de Evaluar"
            >
              <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-md" />
              <motion.div
                className="glass-heavy relative z-10 w-full max-w-md rounded-3xl p-6 text-center"
                initial={{ opacity: 0, y: 22, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 14, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 260, damping: 24 }}
              >
                <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#00b0d8] to-[#005baa] shadow-glow-cyan ring-1 ring-white/30">
                  <ShieldQuestion className="h-7 w-7 text-white" />
                </div>
                <h3 className="text-lg font-black text-ink">¿La convocatoria abrió correctamente?</h3>
                <p className="mt-2 text-sm text-ink-soft">
                  Revisaste el enlace en la otra pestaña. Confirma si la página de Evaluar cargó bien
                  y corresponde a esta convocatoria, o vuelve para cambiarlo.
                </p>
                <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                  <button
                    type="button"
                    onClick={confirmChange}
                    className="rounded-full fill-softer px-4 py-2.5 text-sm font-semibold text-ink ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-soft"
                  >
                    Cambiar el enlace
                  </button>
                  <button
                    type="button"
                    autoFocus
                    onClick={confirmWorks}
                    className="rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 px-5 py-2.5 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all duration-300 hover:-translate-y-0.5 active:scale-95"
                  >
                    El enlace funciona
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
