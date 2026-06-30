import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Save } from "lucide-react";

type Tone = "danger" | "info";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A compact, high-z confirmation sheet. Doubles as the "exit without saving"
 * guard and the "draft recovered" prompt. Sits above the form modal so it can
 * gate the modal's own dismissal.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const Icon = tone === "danger" ? AlertTriangle : Save;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[140] grid place-items-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="alertdialog"
          aria-label={title}
        >
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={onCancel}
          />
          <motion.div
            className="glass-heavy relative z-10 w-full max-w-sm rounded-3xl p-6 text-center"
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 280, damping: 24 }}
          >
            <div
              className={[
                "mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl shadow-glass ring-1 ring-white/30",
                tone === "danger"
                  ? "bg-gradient-to-br from-rose-500 to-red-600"
                  : "bg-gradient-to-br from-[#00b0d8] to-[#005baa]",
              ].join(" ")}
            >
              <Icon className="h-7 w-7 text-white drop-shadow-md" />
            </div>
            <h3 className="text-lg font-black text-ink">{title}</h3>
            <p className="mt-1.5 text-sm text-ink-soft">{message}</p>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 rounded-full fill-softer px-4 py-2.5 text-sm font-bold text-ink ring-1 ring-[color:var(--hairline)] transition-all duration-300 hover:fill-soft active:scale-95"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={[
                  "flex-1 rounded-full px-4 py-2.5 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all duration-300 hover:-translate-y-0.5 active:scale-95",
                  tone === "danger"
                    ? "bg-gradient-to-br from-rose-500 to-red-600"
                    : "bg-gradient-to-br from-[#00b0d8] to-[#005baa]",
                ].join(" ")}
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
