import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Plus, X, Users } from "lucide-react";
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
 * Dos detalles de uso que antes estorbaban:
 *   · Al agregar a alguien, la lista de sugerencias **se cierra**. Antes seguía
 *     abierta tapando el comparador, y había que hacer clic fuera para verlo.
 *   · Cada sugerencia y cada ficha entra y sale con su propia animación, con un
 *     escalonado corto, en lugar de aparecer de golpe.
 *
 * ## Por qué «el comparador no funciona» para una sola persona
 *
 * La lista se abría **únicamente** en `onFocus`. Al agregar a alguien, `choose`
 * cierra la lista y devuelve el foco al campo (para poder escribir el nombre
 * siguiente). A partir de ese momento el campo **ya tiene el foco**, así que
 * volver a hacer clic en él no dispara ningún evento `focus` y la lista no se
 * abría nunca más: el analista quedaba atrapado con un solo candidato en la
 * comparación. Quien buscaba escribiendo no lo notaba —teclear sí abre la
 * lista—; quien navegaba a puro clic (o con el dedo, donde tocar un campo ya
 * enfocado tampoco emite `focus`) veía un comparador «roto».
 *
 * La apertura ahora cuelga del **gesto** (`pointerdown`) y no del cambio de
 * foco, que es la señal correcta: un clic o un toque sobre el campo siempre
 * significa «quiero ver la lista», tenga el foco donde lo tenga.
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
  // Al agregar devolvemos el foco al campo para poder escribir el nombre
  // siguiente, pero ese foco —que nadie pidió— no debe reabrir la lista que
  // acabamos de cerrar. Sólo se salta el `focus` programático inmediato.
  const skipOpenOnFocus = useRef(false);
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

  function choose(c: Candidate) {
    if (full) return;
    onAdd(c.id);
    setQuery("");
    setActive(0);
    // Cerrar el desplegable al agregar: la comparativa queda a la vista al
    // instante. El foco se queda en el campo, así que escribir otro nombre
    // vuelve a abrir la lista sin tocar el ratón.
    setOpen(false);
    skipOpenOnFocus.current = true;
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
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
            disabled={full}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              if (skipOpenOnFocus.current) {
                skipOpenOnFocus.current = false;
                return;
              }
              setOpen(true);
            }}
            // Un clic o un toque sobre el campo SIEMPRE muestra la lista, aunque
            // el campo ya tuviera el foco (que es lo que ocurre justo después de
            // agregar a alguien). Sin esto, el buscador se quedaba mudo.
            onPointerDown={() => {
              skipOpenOnFocus.current = false;
              setOpen(true);
            }}
            onKeyDown={onKeyDown}
            placeholder={
              full
                ? `Límite alcanzado (${max}/${max})`
                : "Buscar por nombre o identificador… (datos en vivo)"
            }
            className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none disabled:cursor-not-allowed"
            role="combobox"
            aria-expanded={open}
            aria-controls="candidate-listbox"
            autoComplete="off"
          />
        </div>

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
                    <div className="truncate text-xs text-ink-faint">
                      {c.identificador || "Sin ID"} · Proceso{" "}
                      {extractProceso(c.identificador)}
                      {c.identificadorDuplicado && (
                        <span
                          className="ml-1 font-bold text-amber-500"
                          title="Hay más de una fila en la hoja con este identificador"
                        >
                          · repetido
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
        {full && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mt-2 flex items-center gap-1.5 rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-500 ring-1 ring-amber-400/30"
          >
            <Users className="h-3.5 w-3.5 shrink-0" />
            Se alcanzó el máximo de {max} columnas. Quite a alguien de la lista para
            agregar a otra persona (el máximo se ajusta en Configuración).
          </motion.p>
        )}
      </AnimatePresence>

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
