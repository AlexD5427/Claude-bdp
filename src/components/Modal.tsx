import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  /** Fired when the user clicks the backdrop, the ✕, or presses Escape. */
  onRequestClose: () => void;
  children: ReactNode;
  /** Max-width tailwind class for the panel. */
  size?: string;
  ariaLabel?: string;
}

/**
 * A focus-friendly glass modal rendered in a portal. Clicking the dimmed
 * backdrop (the "white edges" around the panel) or pressing Escape funnels
 * through `onRequestClose`, where the caller can intercept with a confirmation.
 *
 * ## Dos efectos, no uno
 *
 * El bloqueo del desplazamiento y el atajo de Escape vivían en el mismo efecto,
 * con `onRequestClose` entre sus dependencias. Quien llama suele declarar ese
 * callback en el cuerpo del componente, así que **cambia de identidad en cada
 * dibujado**: escribir una letra en el cuestionario de registro desmontaba y
 * volvía a montar el escuchador de teclado y reescribía
 * `document.body.style.overflow`, forzando un recálculo de estilo por tecla sobre
 * un árbol de unos cuarenta campos. Separados, el bloqueo depende sólo de `open`
 * —una escritura al abrir y otra al cerrar— y el atajo lee el callback vigente
 * desde una referencia.
 */
export function Modal({
  open,
  onRequestClose,
  children,
  size = "max-w-5xl",
  ariaLabel,
}: ModalProps) {
  // Mantiene fresco el callback sin volver a armar los efectos.
  const closeRef = useRef(onRequestClose);
  closeRef.current = onRequestClose;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeRef.current();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto p-3 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          aria-modal="true"
          role="dialog"
          aria-label={ariaLabel}
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/55 backdrop-blur-md"
            onClick={onRequestClose}
          />

          <motion.div
            className={`glass-heavy relative z-10 my-2 w-full ${size} rounded-3xl`}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 240, damping: 26 }}
          >
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onRequestClose}
              className="absolute right-4 top-4 z-40 grid h-9 w-9 place-items-center rounded-full bg-[color:var(--glass-bg-heavy)] text-ink ring-1 ring-[color:var(--hairline)] backdrop-blur-xl transition-all duration-300 hover:bg-rose-500/80 hover:text-white active:scale-90"
            >
              <X className="h-5 w-5" />
            </button>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
