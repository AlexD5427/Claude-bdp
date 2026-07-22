import { motion } from "framer-motion";
import { Eye, Pencil, Trash2, Building2, CalendarDays, Images, Link2, ImageOff } from "lucide-react";
import { useState } from "react";
import type { PerfilCargo } from "../../lib/perfilCargo";

/**
 * A profile card for the module grid: a cover image (or a branded placeholder),
 * the position and area, a couple of at-a-glance chips, and the view/edit/delete
 * actions. Clicking the cover or title opens the full viewer.
 */
export function PerfilCargoCard({
  perfil: p,
  onOpen,
  onEdit,
  onDelete,
}: {
  perfil: PerfilCargo;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const cover = p.imagenes[0];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      whileHover={{ y: -6 }}
      className="glass glow group relative flex flex-col overflow-hidden rounded-3xl"
    >
      {/* Cover */}
      <button
        type="button"
        onClick={onOpen}
        className="relative block aspect-[16/9] w-full overflow-hidden"
        aria-label={`Ver perfil ${p.puestoBdp}`}
      >
        {cover && !broken ? (
          <img
            src={cover}
            alt=""
            onError={() => setBroken(true)}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-spring group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-[#004a8f] via-[#005baa] to-[#00b0d8]">
            {broken ? (
              <ImageOff className="h-8 w-8 text-white/70" />
            ) : (
              <span className="text-3xl font-black uppercase text-white/85 drop-shadow">
                {(p.puestoBdp || "?").slice(0, 2)}
              </span>
            )}
          </div>
        )}
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0" />
        <span className="absolute bottom-2 left-3 right-3 flex items-center gap-2">
          {p.gestionBdp && (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-0.5 text-[0.65rem] font-bold text-white ring-1 ring-white/20 backdrop-blur">
              <CalendarDays className="h-3 w-3" /> {p.gestionBdp}
            </span>
          )}
          {p.imagenes.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-0.5 text-[0.65rem] font-bold text-white ring-1 ring-white/20 backdrop-blur">
              <Images className="h-3 w-3" /> {p.imagenes.length}
            </span>
          )}
          {p.linkEvaluar && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/70 px-2.5 py-0.5 text-[0.65rem] font-bold text-white ring-1 ring-white/25 backdrop-blur">
              <Link2 className="h-3 w-3" /> Evaluar
            </span>
          )}
        </span>
      </button>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <button type="button" onClick={onOpen} className="text-left">
          <h3 className="line-clamp-2 text-base font-black leading-tight tracking-tight text-ink transition-colors group-hover:text-cyan-400">
            {p.puestoBdp || "Perfil de cargo"}
          </h3>
        </button>
        {p.areaCargo && (
          <p className="flex items-center gap-1.5 text-xs text-ink-soft">
            <Building2 className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
            <span className="line-clamp-1">{p.areaCargo}</span>
          </p>
        )}

        <div className="mt-auto flex items-center gap-1.5 pt-2">
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-3 py-2 text-xs font-bold text-white shadow-glass ring-1 ring-white/30 transition-all hover:-translate-y-0.5 active:scale-95"
          >
            <Eye className="h-3.5 w-3.5" /> Ver
          </button>
          <button
            type="button"
            onClick={onEdit}
            aria-label="Editar perfil"
            className="grid h-9 w-9 place-items-center rounded-full fill-softer text-ink ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-90"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Eliminar perfil"
            className="grid h-9 w-9 place-items-center rounded-full fill-softer text-ink-soft ring-1 ring-[color:var(--hairline)] transition-all hover:bg-rose-500/80 hover:text-white active:scale-90"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
