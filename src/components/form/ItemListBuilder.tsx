import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, X } from "lucide-react";
import type { FormItem } from "../../types";
import { NIVEL_ITEM_OPTIONS } from "../../constants";

interface ItemListBuilderProps {
  title: string;
  subtitle?: string;
  items: FormItem[];
  max: number;
  addLabel: string;
  /** Placeholder for the name input (e.g. "Nombre del Conocimiento Técnico"). */
  namePlaceholder?: string;
  /** Show the free-text "detalle" field (Conocimientos Técnicos). */
  withDetalle?: boolean;
  emptyHint: string;
  onAdd: () => void;
  onChange: (uid: string, patch: Partial<FormItem>) => void;
  onRemove: (uid: string) => void;
}

/**
 * A reusable "0/N" list builder used by both A1 (Conocimientos Técnicos, with
 * a detail field) and A2 (Manejo de Herramientas). Each row captures a name, a
 * level (Bajo / Medio / Alto) and — optionally — a free-text detail.
 *
 * Keyboard-first flow: while the list is empty the "Agregar" button sits in the
 * header; once there are items it relocates to the bottom-right (after the last
 * row), so a Tab from the last "Detalle" lands on it and another Tab jumps to
 * the next section's "Agregar". Adding a row auto-focuses its name field, and
 * the remove (✕) button is kept out of the tab order.
 */
export function ItemListBuilder({
  title,
  subtitle,
  items,
  max,
  addLabel,
  namePlaceholder = "Nombre",
  withDetalle = false,
  emptyHint,
  onAdd,
  onChange,
  onRemove,
}: ItemListBuilderProps) {
  const atLimit = items.length >= max;
  const nameRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const prevCount = useRef(items.length);

  // When a new row appears, move focus to its name field for uninterrupted
  // keyboard entry (pressing the Add button flows straight into typing).
  useEffect(() => {
    if (items.length > prevCount.current) {
      const last = items[items.length - 1];
      if (last) requestAnimationFrame(() => nameRefs.current[last.uid]?.focus());
    }
    prevCount.current = items.length;
  }, [items]);

  const AddButton = (
    <button
      type="button"
      onClick={onAdd}
      disabled={atLimit}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-3 py-1.5 text-xs font-bold text-white shadow-glass ring-1 ring-white/30 transition-all duration-300 hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Plus className="h-3.5 w-3.5" />
      {addLabel}
    </button>
  );

  return (
    <div className="rounded-2xl fill-soft p-4 ring-1 ring-[color:var(--hairline)]">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-ink">
            {title}{" "}
            <span className="text-ink-faint">
              ({items.length}/{max})
            </span>
          </h4>
          {subtitle && <p className="text-xs text-ink-faint">{subtitle}</p>}
        </div>
        {/* While empty, the Add button lives in the header. */}
        {items.length === 0 && AddButton}
      </header>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[color:var(--hairline)] px-3 py-4 text-center text-xs italic text-ink-faint">
          {emptyHint}
        </p>
      ) : (
        <div className="space-y-2.5">
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <motion.div
                key={item.uid}
                // Sin `layout`: framer-motion medía cada fila en cada
                // re-dibujado y, con siete filas, escribir el detalle de un
                // conocimiento se notaba lento en equipos modestos. La entrada y
                // la salida siguen animadas.
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 280, damping: 24 }}
                className="glass rounded-xl p-3"
              >
                <div className="flex items-center gap-2">
                  <input
                    ref={(el) => {
                      // Las filas eliminadas no deben dejar su nodo colgando en
                      // el mapa: React llama con `null` al desmontar.
                      if (el) nameRefs.current[item.uid] = el;
                      else delete nameRefs.current[item.uid];
                    }}
                    value={item.nombre}
                    onChange={(e) => onChange(item.uid, { nombre: e.target.value })}
                    placeholder={namePlaceholder}
                    className="min-w-0 flex-1 rounded-lg fill-softer px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint outline-none ring-1 ring-[color:var(--hairline)] focus:ring-2 focus:ring-cyan-400/70"
                  />
                  <div className="relative">
                    <select
                      value={item.nivel}
                      onChange={(e) => onChange(item.uid, { nivel: e.target.value })}
                      className={`appearance-none rounded-lg fill-softer py-1.5 pl-2.5 pr-7 text-xs font-semibold outline-none ring-1 ring-[color:var(--hairline)] focus:ring-2 focus:ring-cyan-400/70 ${item.nivel ? "text-ink" : "text-ink-faint"}`}
                    >
                      <option value="">Nivel…</option>
                      {NIVEL_ITEM_OPTIONS.map((n) => (
                        <option key={n} value={n} className="bg-slate-900 text-white">
                          {n}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[0.6rem] text-ink-soft">
                      ▾
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label="Quitar"
                    tabIndex={-1}
                    onClick={() => onRemove(item.uid)}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full fill-softer text-ink-soft ring-1 ring-[color:var(--hairline)] transition-all duration-300 hover:bg-rose-500/80 hover:text-white active:scale-90"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {withDetalle && (
                  <input
                    value={item.detalle ?? ""}
                    onChange={(e) => onChange(item.uid, { detalle: e.target.value })}
                    placeholder="Detalle (opcional)"
                    className="mt-2 w-full rounded-lg fill-softer px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint outline-none ring-1 ring-[color:var(--hairline)] focus:ring-2 focus:ring-cyan-400/70"
                  />
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Once there are rows, the Add button moves to the bottom-right so
              keyboard Tab order flows list → Agregar → next section. */}
          <div className="flex justify-end pt-0.5">{AddButton}</div>
        </div>
      )}
    </div>
  );
}
