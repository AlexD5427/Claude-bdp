import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Plus, X, Users, AlertTriangle } from "lucide-react";
import { Avatar } from "./Avatar";
import { PortalDropdown } from "./PortalDropdown";
import { extractProceso } from "../lib/candidates";
import { openProfile } from "../lib/profileViewerStore";
import { usePrefersReducedMotion } from "../shared/hooks";
import type { Candidate } from "../types";

interface CandidateSearchSelectProps {
  candidates: Candidate[];
  selectedIds: string[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  max: number;
}

/**
 * A live, type-ahead candidate picker for the comparator. Built for catalogues
 * of *hundreds of thousands* of profiles: instead of scrolling a giant list,
 * the operator types a name or identifier and gets a ranked dropdown (name +
 * identificador) to add columns one by one. Already-selected candidates appear
 * as removable chips and are excluded from the suggestions.
 *
 * ## El bug que dejaba el comparador «sin funcionar»
 *
 * Al agregar a alguien la lista se cierra a propósito (para dejar la comparativa
 * a la vista) y el foco vuelve al campo para poder escribir el nombre siguiente.
 * Para que ese foco no reabriera la lista al instante, había una bandera de un
 * solo uso, `skipOpenOnFocus`. Fallaba por dos motivos encadenados:
 *
 *  1. Hacer clic en una sugerencia —un `<button>` dentro del portal— ya había
 *     **quitado** el foco del campo. El `focus()` que sigue a `onAdd` lo
 *     devuelve y dispara `onFocus` de inmediato, que se **come** la bandera.
 *  2. A partir de ahí el campo se queda enfocado. Y un clic sobre un campo que
 *     ya tiene el foco **no emite ningún evento `focus`**: `setOpen(true)` no se
 *     ejecutaba nunca más y la lista no volvía a abrirse.
 *
 * Resultado: quien agrega postulantes **escribiendo** el nombre no nota nada
 * (`onChange` abre la lista), pero quien los agrega **haciendo clic y eligiendo
 * de la lista** —lo natural con una base de pocas decenas— se queda con un solo
 * candidato y concluye, con razón, que «el comparador no funciona». Eso explica
 * por qué el fallo sólo lo reportaba una parte del equipo.
 *
 * La corrección tiene dos partes:
 *   · la lista se abre desde `pointerdown`, `click`, `focus` y las teclas de
 *     navegación (todas idempotentes), así que ninguna de esas vías puede
 *     quedarse sin efecto;
 *   · la bandera de supresión **sólo se arma cuando el `focus()` programático va
 *     a producir de verdad un evento** (es decir, cuando el campo había perdido
 *     el foco al pulsar la sugerencia) y cualquier gesto posterior la limpia. Ya
 *     no puede quedarse pegada, y no hay ninguna ventana de tiempo muerta.
 */
export function CandidateSearchSelect({
  candidates,
  selectedIds,
  onAdd,
  onRemove,
  max,
}: CandidateSearchSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Se arma justo antes de devolver el foco al campo tras agregar, y sólo si ese
  // `focus()` va a emitir un evento. El primer `onFocus` la consume.
  const ignoreNextFocus = useRef(false);
  const reduceMotion = usePrefersReducedMotion();

  const full = selectedIds.length >= max;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const selected = useMemo(
    () =>
      selectedIds
        .map((id) => candidates.find((c) => c.id === id))
        .filter(Boolean) as Candidate[],
    [selectedIds, candidates],
  );

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = candidates.filter((c) => !selectedSet.has(c.id));
    const matches = q
      ? pool.filter(
          (c) =>
            c.fullName.toLowerCase().includes(q) ||
            (c.identificador ?? "").toLowerCase().includes(q) ||
            (c.cargo_bdp ?? "").toLowerCase().includes(q),
        )
      : pool;
    return matches.slice(0, 12);
  }, [candidates, query, selectedSet]);

  useEffect(() => setActive(0), [query, open]);

  /**
   * Abre la lista por una acción deliberada del analista (clic, toque o tecla).
   * Desarma la bandera: llegados aquí, la intención es inequívoca.
   */
  const openList = useCallback(() => {
    ignoreNextFocus.current = false;
    setOpen(true);
  }, []);

  /** El foco puede llegar solo (tras agregar); ahí sí hay que discriminar. */
  const onFocus = useCallback(() => {
    if (ignoreNextFocus.current) {
      ignoreNextFocus.current = false;
      return;
    }
    setOpen(true);
  }, []);

  function choose(c: Candidate) {
    if (full) return;
    onAdd(c.id);
    setQuery("");
    setActive(0);
    // Cerrar el desplegable al agregar: la comparativa queda a la vista al
    // instante. El foco vuelve al campo, así que escribir otro nombre reabre la
    // lista sin tocar el ratón.
    setOpen(false);
    const input = inputRef.current;
    if (input && document.activeElement !== input) ignoreNextFocus.current = true;
    input?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      openList();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions[active]) choose(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="glass rounded-3xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <Users className="h-5 w-5 text-cyan-400" />
        <h3 className="text-sm font-bold text-ink">Candidatos a comparar</h3>
        <motion.span
          key={selectedIds.length}
          initial={reduceMotion ? undefined : { scale: 0.8, opacity: 0.4 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 26 }}
          className="ml-auto text-xs font-semibold text-ink-soft"
        >
          {selectedIds.length}/{max}
        </motion.span>
      </div>

      <div ref={wrapRef} className="relative">
        <div className="glass flex items-center gap-2 rounded-2xl px-3.5 py-2.5 transition-shadow duration-300 focus-within:ring-2 focus-within:ring-cyan-400/70">
          <motion.span
            animate={open && !full ? { scale: 1.12, rotate: -8 } : { scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}
            className="shrink-0 text-ink-soft"
          >
            <Search className="h-4 w-4" />
          </motion.span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            // Tres vías redundantes a propósito: `pointerdown` cubre el clic
            // sobre un campo que ya tiene el foco (que no emite `focus`),
            // `focus` cubre la llegada por teclado y `click` cubre los teclados
            // en pantalla que no emiten eventos de puntero.
            onPointerDown={openList}
            onClick={openList}
            onFocus={onFocus}
            onKeyDown={onKeyDown}
            placeholder={
              full
                ? `Límite de ${max} columnas alcanzado`
                : "Buscar por nombre o identificador… (datos en vivo)"
            }
            className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none"
            role="combobox"
            aria-expanded={open}
            aria-controls="candidate-listbox"
            autoComplete="off"
          />
        </div>

        {/* Al llegar al máximo el campo NO se desactiva: se explica qué pasa y
            cómo seguir. Antes quedaba muerto y sin mensaje visible, y eso se
            leía como «el buscador dejó de funcionar». */}
        <PortalDropdown
          open={open && full}
          anchorRef={wrapRef}
          onClose={() => setOpen(false)}
        >
          <div className="glass-heavy w-full rounded-2xl px-4 py-3 text-sm text-ink-soft">
            Ya hay <strong className="text-ink">{max}</strong> postulantes en la
            comparación, el máximo configurado. Quite a alguien con su ✕ o amplíe
            el límite en <strong className="text-ink">Configuración → Evaluación y
            comparador</strong>.
          </div>
        </PortalDropdown>

        <PortalDropdown
          open={open && !full && suggestions.length > 0}
          anchorRef={wrapRef}
          onClose={() => setOpen(false)}
          maxHeight={320}
        >
          <motion.ul
            id="candidate-listbox"
            role="listbox"
            className="glass-heavy w-full rounded-2xl p-1.5"
            initial="hidden"
            animate="show"
            variants={
              reduceMotion
                ? undefined
                : { hidden: {}, show: { transition: { staggerChildren: 0.028 } } }
            }
          >
            {suggestions.map((c, i) => (
              <motion.li
                key={c.id}
                role="option"
                aria-selected={i === active}
                variants={
                  reduceMotion
                    ? undefined
                    : {
                        hidden: { opacity: 0, x: -10 },
                        show: {
                          opacity: 1,
                          x: 0,
                          transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] },
                        },
                      }
                }
              >
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(c)}
                  className={[
                    "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-all duration-200",
                    i === active
                      ? "bg-gradient-to-br from-[#00b0d8]/30 to-[#005baa]/30 translate-x-0.5"
                      : "hover:fill-soft",
                  ].join(" ")}
                >
                  <Avatar name={c.fullName} seed={c.id} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink">
                      {c.fullName}
                    </div>
                    <div className="flex min-w-0 items-center gap-1.5 truncate text-xs text-ink-faint">
                      <span className="truncate">
                        {c.identificador || "Sin ID"} · Proceso{" "}
                        {extractProceso(c.identificador)}
                      </span>
                      {/* Dos registros con el mismo identificador se distinguen
                          aquí; antes eran indistinguibles y sólo se podía
                          comparar al primero. */}
                      {c.duplicado && (
                        <span
                          title="Otro registro de la hoja usa este mismo identificador."
                          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-400/20 px-1.5 py-0.5 font-bold text-amber-500"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          ID repetido
                        </span>
                      )}
                    </div>
                  </div>
                  <motion.span
                    animate={i === active ? { scale: 1.15, rotate: 90 } : { scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 420, damping: 22 }}
                    className="shrink-0 text-cyan-400"
                  >
                    <Plus className="h-4 w-4" />
                  </motion.span>
                </button>
              </motion.li>
            ))}
          </motion.ul>
        </PortalDropdown>
        <PortalDropdown
          open={open && !full && query.trim() !== "" && suggestions.length === 0}
          anchorRef={wrapRef}
          onClose={() => setOpen(false)}
        >
          <div className="glass-heavy w-full rounded-2xl px-4 py-3 text-sm text-ink-soft">
            Sin coincidencias para “{query.trim()}”.
          </div>
        </PortalDropdown>
      </div>

      <AnimatePresence initial={false}>
        {selected.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="mt-3 flex flex-wrap gap-2">
              <AnimatePresence initial={false} mode="popLayout">
                {selected.map((c) => (
                  <motion.span
                    key={c.id}
                    layout
                    initial={{ opacity: 0, scale: 0.8, y: 6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8, y: -6 }}
                    transition={{ type: "spring", stiffness: 420, damping: 28 }}
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] py-1 pl-1 pr-2.5 text-sm font-semibold text-white ring-1 ring-white/40 shadow-glow-cyan"
                  >
                    <Avatar name={c.fullName} seed={c.id} size="sm" />
                    <button
                      type="button"
                      onClick={() => openProfile(c.id)}
                      title={`Ver perfil de ${c.fullName}`}
                      className="max-w-[12rem] truncate outline-none hover:underline"
                    >
                      {c.fullName}
                    </button>
                    <button
                      type="button"
                      aria-label={`Quitar ${c.fullName}`}
                      onClick={() => onRemove(c.id)}
                      className="grid h-5 w-5 place-items-center rounded-full bg-white/20 transition-all duration-200 hover:bg-rose-500/80 hover:scale-110 active:scale-90"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
