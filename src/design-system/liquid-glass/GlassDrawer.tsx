import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { drawerRight } from "../motion";
import { Z } from "../tokens";
import { bloquearScroll } from "../../lib/scrollLock";

interface GlassDrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Footer actions row (kept sticky at the bottom). */
  footer?: ReactNode;
  /** Tailwind width class for the panel. */
  widthClass?: string;
  ariaLabel?: string;
}

/**
 * A right-side glass drawer used by inspectors and secondary editors. Traps
 * Escape, locks body scroll, and slides with a spring. Backdrop click closes.
 */
export function GlassDrawer({
  open,
  onClose,
  title,
  children,
  footer,
  widthClass = "max-w-xl",
  ariaLabel,
}: GlassDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const liberarScroll = bloquearScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      liberarScroll();
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 flex justify-end"
          style={{ zIndex: Z.drawer }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
        >
          <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />
          <motion.aside
            className={`glass-heavy relative z-10 flex h-full w-full ${widthClass} flex-col`}
            variants={drawerRight}
            initial="hidden"
            animate="show"
            exit="exit"
          >
            <header className="flex items-center justify-between gap-3 border-b border-[color:var(--hairline)] px-5 py-4">
              <div className="min-w-0 text-lg font-black text-ink">{title}</div>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={onClose}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full fill-softer text-ink ring-1 ring-[color:var(--hairline)] transition-colors hover:bg-rose-500/80 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && (
              <footer className="border-t border-[color:var(--hairline)] px-5 py-3">
                {footer}
              </footer>
            )}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
