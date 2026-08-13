import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  X,
  Pencil,
  Trash2,
  GraduationCap,
  Briefcase,
  BookOpen,
  HeartHandshake,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Building2,
  CalendarDays,
  Sparkles,
} from "lucide-react";
import type { PerfilCargo } from "../../lib/perfilCargo";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";

/**
 * The read-only, full-screen presentation of a job profile — a large Liquid
 * Glass card that nearly fills the viewport. It's built from scratch (not the
 * form): an immersive gradient hero, an animated image gallery and staggered
 * sections that reveal each requirement as its own bullet. Edit/Delete live in
 * the top-right; Escape or a backdrop click closes it.
 */
export function PerfilCargoViewer({
  perfil,
  onClose,
  onEdit,
  onDelete,
}: {
  perfil: PerfilCargo | null;
  onClose: () => void;
  onEdit: (p: PerfilCargo) => void;
  onDelete: (p: PerfilCargo) => void;
}) {
  return createPortal(
    <AnimatePresence>
      {perfil && (
        <Viewer key={perfil.id} perfil={perfil} onClose={onClose} onEdit={onEdit} onDelete={onDelete} />
      )}
    </AnimatePresence>,
    document.body,
  );
}

function Viewer({
  perfil: p,
  onClose,
  onEdit,
  onDelete,
}: {
  perfil: PerfilCargo;
  onClose: () => void;
  onEdit: (p: PerfilCargo) => void;
  onDelete: (p: PerfilCargo) => void;
}) {
  useBodyScrollLock(true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-[112] overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      role="dialog"
      aria-modal="true"
      aria-label={`Perfil de cargo: ${p.puestoBdp}`}
    >
      <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-md" onClick={onClose} />

      <motion.div
        className="relative z-10 mx-auto my-4 w-full max-w-6xl px-3 sm:px-5"
        initial={{ opacity: 0, y: 30, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 230, damping: 26 }}
      >
        <div className="glass-heavy overflow-hidden rounded-[2rem] shadow-glass-lg">
          <Hero p={p} onClose={onClose} onEdit={onEdit} onDelete={onDelete} />

          <div className="max-h-[calc(100vh-14rem)] overflow-y-auto px-4 py-6 sm:px-7">
            {p.imagenes.length > 0 && (
              <div className="mb-6">
                <Gallery images={p.imagenes} />
              </div>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              <BulletSection
                icon={GraduationCap}
                tint="from-sky-400 to-blue-600"
                title="Formación Mínima Requerida"
                groups={[
                  { label: "Formación Principal", items: p.formacionPrincipal },
                  { label: "Formación Complementaria", items: p.formacionComplementaria },
                ]}
              />
              <BulletSection
                icon={Briefcase}
                tint="from-indigo-400 to-violet-600"
                title="Experiencia Mínima Requerida"
                groups={[
                  { label: "Experiencia General", items: p.experienciaGeneral },
                  { label: "Experiencia Específica", items: p.experienciaEspecifica },
                ]}
              />
              <BulletSection
                icon={BookOpen}
                tint="from-cyan-400 to-teal-600"
                title="Conocimientos Mínimos Complementarios"
                groups={[
                  { label: "Conocimientos Técnicos", items: p.conocimientosTecnicos },
                  { label: "Conocimientos Genéricos", items: p.conocimientosGenericos },
                ]}
              />
              <BulletSection
                icon={HeartHandshake}
                tint="from-fuchsia-400 to-purple-600"
                title="Conductas y Competencias Requeridas"
                groups={[
                  { label: "Conductas Requeridas", items: p.conductasRequeridas },
                  { label: "Competencias Requeridas", items: p.competenciasRequeridas },
                ]}
              />
            </div>

            {p.linkEvaluar && (
              <motion.a
                href={p.linkEvaluar}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 px-5 py-2.5 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all hover:-translate-y-0.5 active:scale-95"
              >
                <ExternalLink className="h-4 w-4" />
                Ver convocatoria en Evaluar.com
              </motion.a>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Hero({
  p,
  onClose,
  onEdit,
  onDelete,
}: {
  p: PerfilCargo;
  onClose: () => void;
  onEdit: (p: PerfilCargo) => void;
  onDelete: (p: PerfilCargo) => void;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-[#004a8f] via-[#005baa] to-[#00b0d8] px-5 py-7 sm:px-8">
      {!reduce && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-12 h-56 w-56 rounded-full bg-white/10 blur-3xl"
          animate={{ x: [0, 22, 0], y: [0, 16, 0] }}
          transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent" />

      <div className="relative mb-4 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[0.7rem] font-bold uppercase tracking-[0.18em] text-white ring-1 ring-white/25 backdrop-blur">
          <Sparkles className="h-3.5 w-3.5" /> Perfil de cargo
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onEdit(p)}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-2 text-sm font-bold text-white ring-1 ring-white/30 backdrop-blur transition-all hover:bg-white/25 active:scale-95"
          >
            <Pencil className="h-4 w-4" /> Modificar
          </button>
          <button
            type="button"
            onClick={() => onDelete(p)}
            className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/80 px-3.5 py-2 text-sm font-bold text-white ring-1 ring-white/30 backdrop-blur transition-all hover:bg-rose-500 active:scale-95"
          >
            <Trash2 className="h-4 w-4" /> Eliminar
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/30 backdrop-blur transition-all hover:bg-white/25 hover:rotate-90 active:scale-90"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <motion.h2
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative text-3xl font-black uppercase leading-tight tracking-tight text-white drop-shadow sm:text-4xl"
      >
        {p.puestoBdp || "Perfil de cargo"}
      </motion.h2>
      <div className="relative mt-3 flex flex-wrap items-center gap-2">
        {p.areaCargo && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white ring-1 ring-white/25 backdrop-blur">
            <Building2 className="h-3.5 w-3.5" /> {p.areaCargo}
          </span>
        )}
        {p.gestionBdp && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white ring-1 ring-white/25 backdrop-blur">
            <CalendarDays className="h-3.5 w-3.5" /> Gestión {p.gestionBdp}
          </span>
        )}
      </div>
    </div>
  );
}

/** A large, auto-advancing image gallery with manual controls. */
function Gallery({ images }: { images: string[] }) {
  const [i, setI] = useState(0);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
    if (images.length <= 1) return;
    const t = window.setInterval(() => setI((v) => (v + 1) % images.length), 4200);
    return () => window.clearInterval(t);
  }, [images.length, i]);
  const go = (delta: number) => setI((v) => (v + delta + images.length) % images.length);

  return (
    <div className="relative overflow-hidden rounded-3xl bg-black/40 ring-1 ring-white/10">
      <div className="relative flex aspect-[16/7] items-center justify-center">
        <AnimatePresence mode="popLayout">
          {broken ? (
            <motion.div key="broken" className="flex flex-col items-center gap-2 text-white/60">
              <ImageOff className="h-8 w-8" />
              <span className="text-xs">No se pudo cargar la imagen</span>
            </motion.div>
          ) : (
            <motion.img
              key={`${images[i]}-${i}`}
              src={images[i]}
              alt={`Imagen ${i + 1}`}
              onError={() => setBroken(true)}
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
        </AnimatePresence>
      </div>
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Imagen anterior"
            className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white ring-1 ring-white/20 backdrop-blur transition-all hover:bg-black/65 active:scale-90"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Imagen siguiente"
            className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white ring-1 ring-white/20 backdrop-blur transition-all hover:bg-black/65 active:scale-90"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
            {images.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setI(idx)}
                aria-label={`Ver imagen ${idx + 1}`}
                className={`h-1.5 rounded-full transition-all ${idx === i ? "w-6 bg-cyan-300" : "w-1.5 bg-white/50"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BulletSection({
  icon: Icon,
  tint,
  title,
  groups,
}: {
  icon: typeof GraduationCap;
  tint: string;
  title: string;
  groups: { label: string; items: string[] }[];
}) {
  const hasAny = groups.some((g) => g.items.length);
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="glass rounded-3xl p-5"
    >
      <div className="mb-4 flex items-center gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${tint} text-white shadow-glass ring-1 ring-white/30`}>
          <Icon className="h-5 w-5" />
        </span>
        <h3 className="text-base font-black tracking-tight text-ink">{title}</h3>
      </div>
      {hasAny ? (
        <div className="space-y-4">
          {groups.map((g) =>
            g.items.length ? (
              <div key={g.label}>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-soft">{g.label}</p>
                <ul className="space-y-1.5">
                  {g.items.map((item, idx) => (
                    <Bullet key={idx} index={idx}>{item}</Bullet>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-faint">Sin información registrada.</p>
      )}
    </motion.section>
  );
}

function Bullet({ children, index }: { children: ReactNode; index: number }) {
  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(0.3, index * 0.04), duration: 0.3 }}
      className="flex items-start gap-2.5 text-sm text-ink-soft"
    >
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa]" />
      <span className="leading-relaxed">{children}</span>
    </motion.li>
  );
}
