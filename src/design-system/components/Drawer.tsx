import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { SPRING } from "../motion";
import { pushHeavyOverlay } from "../../shared/heavyOverlayStore";

interface DrawerProps {
  open: boolean;
  onRequestClose: () => void;
  title: ReactNode;
  /** Optional toolbar rendered on the right of the header. */
  headerActions?: ReactNode;
  /** Optional sticky footer (save/cancel bar). */
  footer?: ReactNode;
  children: ReactNode;
  /** Max width class of the panel. */
  widthClass?: string;
  ariaLabel?: string;
}

/**
 * A right-anchored glass drawer with focus trapping, focus restoration, Escape
 * to close and a scroll lock. It registers as a "heavy overlay" so the animated
 * background pauses while it is open (a real performance win on weak devices).
 * The editor and side panels build on this.
 */
export function Drawer({
  open,
  onRequestClose,
  title,
  headerActions,
  footer,
  children,
  widthClass = "max-w-3xl",
  ariaLabel,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const releaseOverlay = pushHeavyOverlay();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Move focus into the panel.
    const focusTimer = window.setTimeout(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        "[data-autofocus], button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
      );
      focusable?.focus();
    }, 40);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onRequestClose();
        return;
      }
      if (e.key !== "Tab") return;
      // Simple focus trap.
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      );
      if (!focusables || focusables.length === 0) return;
      const list = Array.from(focusables).filter((el) => el.offsetParent !== null);
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      releaseOverlay();
      previouslyFocused.current?.focus?.();
    };
  }, [open, onRequestClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] flex justify-end no-print"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
        >
          <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-md" onClick={onRequestClose} />
          <motion.div
            ref={panelRef}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={SPRING}
            className={`glass-heavy relative z-10 flex h-full w-full ${widthClass} flex-col rounded-l-3xl`}
          >
            <header className="flex items-center justify-between gap-3 border-b border-[color:var(--hairline)] px-5 py-4">
              <div className="min-w-0 flex-1 text-lg font-black text-ink">{title}</div>
              <div className="flex items-center gap-2">
                {headerActions}
                <button
                  type="button"
                  aria-label="Cerrar"
                  onClick={onRequestClose}
                  className="grid h-9 w-9 place-items-center rounded-full fill-softer text-ink ring-1 ring-[color:var(--hairline)] transition-all hover:bg-rose-500/80 hover:text-white active:scale-90"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

            {footer && (
              <footer className="border-t border-[color:var(--hairline)] px-5 py-3">{footer}</footer>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
