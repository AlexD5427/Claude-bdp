import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, X, TriangleAlert } from "lucide-react";
import { dismissToast, useToasts, type ToastKind } from "../../shared/toastStore";
import { SPRING } from "../motion";

/**
 * Global toast host. Renders the notification queue in an ARIA live region so
 * screen readers announce successes and errors. Mount once near the app root.
 */

const ICON: Record<ToastKind, typeof Info> = {
  success: CheckCircle2,
  error: TriangleAlert,
  info: Info,
  warning: AlertTriangle,
};

const ACCENT: Record<ToastKind, string> = {
  success: "from-emerald-500 to-green-600",
  error: "from-rose-500 to-red-600",
  info: "from-[#00b0d8] to-[#005baa]",
  warning: "from-amber-500 to-orange-600",
};

export function Toasts() {
  const toasts = useToasts();

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[200] flex flex-col items-center gap-2 px-4 no-print sm:bottom-6"
      role="region"
      aria-label="Notificaciones"
    >
      <div aria-live="polite" aria-atomic="false" className="flex w-full max-w-md flex-col items-stretch gap-2">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const Icon = ICON[toast.kind];
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: 24, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                transition={SPRING}
                className="glass-heavy pointer-events-auto flex items-start gap-3 rounded-2xl px-4 py-3 shadow-glass"
              >
                <span
                  className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${ACCENT[toast.kind]} text-white ring-1 ring-white/30`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink">{toast.message}</p>
                  {toast.description && (
                    <p className="mt-0.5 text-xs text-ink-soft">{toast.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  aria-label="Descartar notificación"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint transition-colors hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>,
    document.body,
  );
}
