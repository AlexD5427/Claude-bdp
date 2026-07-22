import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { newId } from "../../shared/ids";
import { useMemo, useRef } from "react";

/**
 * A dynamic list of free-text entries — the workhorse of the perfil-de-cargo
 * form. Every entry becomes one bullet in the read-only frontend (segments are
 * joined by `" | "` on save), so the UI lets the operator add as many as they
 * need while always keeping at least one row present.
 *
 * The value is a plain `string[]`; a private id map keeps React keys stable so
 * focus never jumps while typing or reordering.
 */
export function MultiFieldList({
  values,
  onChange,
  addLabel,
  placeholder,
  minRows = 1,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  addLabel: string;
  placeholder?: string;
  /** Always keep at least this many rows on screen. */
  minRows?: number;
}) {
  // Stable ids per row index (regenerated only when the length changes).
  const idsRef = useRef<string[]>([]);
  const rows = useMemo(() => {
    const filled = values.length ? values : Array.from({ length: minRows }, () => "");
    while (idsRef.current.length < filled.length) idsRef.current.push(newId("row"));
    idsRef.current.length = filled.length;
    return filled.map((text, i) => ({ id: idsRef.current[i], text }));
  }, [values, minRows]);

  const setAt = (i: number, text: string) => {
    const next = rows.map((r) => r.text);
    next[i] = text;
    onChange(next);
  };
  const removeAt = (i: number) => {
    if (rows.length <= minRows) {
      setAt(i, "");
      return;
    }
    idsRef.current.splice(i, 1);
    onChange(rows.filter((_, idx) => idx !== i).map((r) => r.text));
  };
  const add = () => {
    idsRef.current.push(newId("row"));
    onChange([...rows.map((r) => r.text), ""]);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <AnimatePresence initial={false}>
        {rows.map((row, i) => (
          <motion.div
            key={row.id}
            layout
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -6, height: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="group relative flex items-start gap-2"
          >
            <span className="mt-3 hidden text-ink-faint sm:block" aria-hidden>
              <GripVertical className="h-4 w-4" />
            </span>
            <span className="mt-2.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#00b0d8]/25 to-[#005baa]/25 text-[0.7rem] font-bold text-cyan-300 ring-1 ring-cyan-400/30">
              {i + 1}
            </span>
            <textarea
              value={row.text}
              onChange={(e) => setAt(i, e.target.value)}
              placeholder={placeholder}
              rows={1}
              className="min-h-[2.75rem] w-full resize-y rounded-2xl fill-soft px-3.5 py-2.5 text-sm text-ink outline-none ring-1 ring-[color:var(--hairline)] transition-shadow placeholder:text-ink-faint focus-visible:ring-2 focus-visible:ring-cyan-300"
            />
            <button
              type="button"
              onClick={() => removeAt(i)}
              aria-label={`Quitar elemento ${i + 1}`}
              className="mt-1.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-faint opacity-60 transition-all hover:bg-rose-500/80 hover:text-white hover:opacity-100 active:scale-90"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
      <div>
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1.5 rounded-full fill-softer px-3.5 py-2 text-xs font-bold text-ink ring-1 ring-[color:var(--hairline)] transition-all duration-300 hover:-translate-y-0.5 hover:fill-soft active:scale-95"
        >
          <Plus className="h-3.5 w-3.5 text-cyan-400" />
          {addLabel}
        </button>
      </div>
    </div>
  );
}
