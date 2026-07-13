import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { dialogPop } from "../motion";
import { Z } from "../tokens";
import type { Intent } from "../tokens";

interface GlassDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  intent?: Intent;
  /** Require confirmation for irreversible/destructive actions. */
  destructive?: boolean;
  busy?: boolean;
}

/**
 * A focused confirmation dialog for destructive or irreversible actions
 * (publish, close, archive, delete). Escape/backdrop cancel; the confirm button
 * receives initial focus for fast keyboard confirmation.
 */
export function GlassDialog({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  intent = "accent",
  destructive = false,
  busy = false,
}: GlassDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  const confirmTone = destructive
    ? "from-rose-500 to-red-600"
    : intent === "success"
      ? "from-emerald-500 to-teal-600"
      : "from-[#00b0d8] to-[#005baa]";

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: Z.dialog }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="alertdialog"
          aria-modal="true"
          aria-label={title}
        >
          <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-md" onClick={onCancel} />
          <motion.div
            className="glass-heavy relative z-10 w-full max-w-md rounded-3xl p-6"
            variants={dialogPop}
            initial="hidden"
            animate="show"
            exit="exit"
          >
            {destructive && (
              <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 ring-1 ring-white/30">
                <AlertTriangle className="h-5 w-5 text-white" />
              </div>
            )}
            <h3 className="text-lg font-black text-ink">{title}</h3>
            {description && <div className="mt-2 text-sm text-ink-soft">{description}</div>}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-full fill-softer px-4 py-2 text-sm font-semibold text-ink ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-soft"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                autoFocus
                disabled={busy}
                onClick={onConfirm}
                className={`rounded-full bg-gradient-to-br px-5 py-2 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all duration-300 hover:-translate-y-0.5 active:scale-95 disabled:opacity-60 ${confirmTone}`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
