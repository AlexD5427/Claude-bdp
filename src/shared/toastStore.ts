import { useSyncExternalStore } from "react";
import { uid } from "./id";

/**
 * Global toast notifications.
 *
 * A minimal, accessible notification queue used by the new modules to surface
 * success / error / info feedback (saved a draft, published a version, import
 * finished, synchronisation failed…). Messages are Spanish and short. The host
 * component renders them in an ARIA live region so screen readers announce them.
 */

export type ToastKind = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  /** Optional secondary line. */
  description?: string;
  /** Auto-dismiss delay in ms (0 keeps it until dismissed). */
  duration: number;
}

let toasts: Toast[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function pushToast(input: {
  kind?: ToastKind;
  message: string;
  description?: string;
  duration?: number;
}): string {
  const toast: Toast = {
    id: uid("toast"),
    kind: input.kind ?? "info",
    message: input.message,
    description: input.description,
    duration: input.duration ?? 4200,
  };
  toasts = [...toasts, toast];
  emit();
  if (toast.duration > 0 && typeof window !== "undefined") {
    window.setTimeout(() => dismissToast(toast.id), toast.duration);
  }
  return toast.id;
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    subscribe,
    () => toasts,
    () => toasts,
  );
}

/* Convenience helpers. */
export const toast = {
  success: (message: string, description?: string) =>
    pushToast({ kind: "success", message, description }),
  error: (message: string, description?: string) =>
    pushToast({ kind: "error", message, description, duration: 6000 }),
  info: (message: string, description?: string) =>
    pushToast({ kind: "info", message, description }),
  warning: (message: string, description?: string) =>
    pushToast({ kind: "warning", message, description }),
};
