import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, X, XCircle } from "lucide-react";
import { createStore } from "../../shared/store";
import { newId } from "../../shared/ids";
import { Z } from "../tokens";

export type ToastIntent = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  intent: ToastIntent;
  message: string;
  /** Auto-dismiss after ms; 0 keeps it until dismissed. */
  duration: number;
}

const store = createStore<ToastItem[]>([]);

function push(intent: ToastIntent, message: string, duration = 4000): string {
  const id = newId("toast");
  store.set((prev) => [...prev, { id, intent, message, duration }]);
  if (duration > 0) window.setTimeout(() => dismiss(id), duration);
  return id;
}

export function dismiss(id: string): void {
  store.set((prev) => prev.filter((t) => t.id !== id));
}

/** Fire-and-forget toasts, callable from anywhere (services, handlers). */
export const toast = {
  success: (msg: string, duration?: number) => push("success", msg, duration),
  error: (msg: string, duration?: number) => push("error", msg, duration ?? 6000),
  info: (msg: string, duration?: number) => push("info", msg, duration),
  warning: (msg: string, duration?: number) => push("warning", msg, duration),
};

const ICON = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
} as const;

const TONE = {
  success: "text-emerald-300",
  error: "text-rose-300",
  info: "text-cyan-300",
  warning: "text-amber-300",
} as const;

/** Renders the live toast stack. Mount once near the app root. */
export function ToastViewport() {
  const items = store.use();
  return createPortal(
    <div
      className="fixed bottom-4 right-4 flex w-[min(92vw,26rem)] flex-col gap-2"
      style={{ zIndex: Z.toast }}
      role="region"
      aria-label="Notificaciones"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {items.map((t) => {
          const Icon = ICON[t.intent];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              className="glass-heavy flex items-start gap-3 rounded-2xl px-4 py-3"
            >
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${TONE[t.intent]}`} />
              <p className="flex-1 text-sm font-medium text-ink">{t.message}</p>
              <button
                type="button"
                aria-label="Descartar notificación"
                onClick={() => dismiss(t.id)}
                className="grid h-6 w-6 place-items-center rounded-full text-ink-faint transition-colors hover:bg-rose-500/70 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
