import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  Plus,
  Building2,
  Link2,
  Images,
  FileStack,
  FilePen,
  X,
} from "lucide-react";
import { useTalentData } from "../context/TalentDataContext";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { GlassDialog } from "../design-system/liquid-glass/GlassDialog";
import { PerfilCargoCard } from "../components/perfiles/PerfilCargoCard";
import { PerfilCargoForm } from "../components/perfiles/PerfilCargoForm";
import { PerfilCargoViewer } from "../components/perfiles/PerfilCargoViewer";
import { PerfilCargoIcon } from "../components/icons/CustomIcons";
import { logActivity } from "../lib/profilesStore";
import {
  emptyForm,
  formHasContent,
  normalisePerfilCargo,
  toForm,
  isValidEvaluarUrl,
  type PerfilCargo,
  type PerfilCargoForm as FormShape,
} from "../lib/perfilCargo";

const DRAFT_KEY = "bdp-perfil-cargo-draft";

/** Peek at the locally-saved draft (if any) so the module can surface it. */
function readDraft(): FormShape | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { form?: FormShape } };
    const form = parsed?.state?.form;
    return form && formHasContent(form) ? form : null;
  } catch {
    return null;
  }
}

type FormMode =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; perfil: PerfilCargo };

/**
 * MÓDULO — Perfiles de Cargo.
 *
 * Creates, edits, views and deletes the job profiles stored in the
 * `perfil_cargo_bdp` sheet, with live metrics, a searchable/filterable grid and
 * the full Liquid Glass authoring + viewing experiences. It reads from the same
 * single source of truth (the backend payload) and writes through the talent
 * data context, so a second read-only frontend always sees the latest rows.
 */
export function Perfiles() {
  const { perfilesCargo, status, error, refetch, deletePerfilCargo } = useTalentData();

  const perfiles = useMemo(
    () => perfilesCargo.map((r, i) => normalisePerfilCargo(r, i)),
    [perfilesCargo],
  );

  const [query, setQuery] = useState("");
  const [gestion, setGestion] = useState("todas");
  const [area, setArea] = useState("todas");
  const [form, setForm] = useState<FormMode>({ kind: "closed" });
  const [viewing, setViewing] = useState<PerfilCargo | null>(null);
  const [toDelete, setToDelete] = useState<PerfilCargo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [draftTick, setDraftTick] = useState(0);

  const draft = useMemo(() => readDraft(), [draftTick, form]);

  const years = useMemo(
    () => [...new Set(perfiles.map((p) => p.gestionBdp).filter(Boolean))].sort().reverse(),
    [perfiles],
  );
  const areas = useMemo(
    () => [...new Set(perfiles.map((p) => p.areaCargo).filter(Boolean))].sort(),
    [perfiles],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return perfiles.filter((p) => {
      if (gestion !== "todas" && p.gestionBdp !== gestion) return false;
      if (area !== "todas" && p.areaCargo !== area) return false;
      if (!q) return true;
      return (
        p.puestoBdp.toLowerCase().includes(q) ||
        p.areaCargo.toLowerCase().includes(q) ||
        p.gestionBdp.toLowerCase().includes(q)
      );
    });
  }, [perfiles, query, gestion, area]);

  const metrics = useMemo(() => {
    const conEvaluar = perfiles.filter((p) => isValidEvaluarUrl(p.linkEvaluar)).length;
    const conImagenes = perfiles.filter((p) => p.imagenes.length > 0).length;
    return {
      total: perfiles.length,
      gerencias: new Set(perfiles.map((p) => p.areaCargo).filter(Boolean)).size,
      conEvaluar,
      conImagenes,
    };
  }, [perfiles]);

  const closeForm = () => {
    setForm({ kind: "closed" });
    setDraftTick((t) => t + 1);
  };

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    const res = await deletePerfilCargo(toDelete.fila);
    setDeleting(false);
    if (res.ok) {
      logActivity({ modulo: "perfiles", accion: "Eliminó perfil de cargo", detalle: toDelete.puestoBdp });
      if (viewing?.id === toDelete.id) setViewing(null);
      setToDelete(null);
    }
  }

  if (status === "loading") return <LoadingState label="Cargando perfiles de cargo…" />;
  if (status === "error" && perfiles.length === 0)
    return <ErrorState message={error ?? "No se pudo conectar con el servidor."} onRetry={refetch} />;

  return (
    <div className="space-y-5">
      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric icon={FileStack} label="Perfiles" value={metrics.total} tint="from-[#00b0d8] to-[#005baa]" />
        <Metric icon={Building2} label="Áreas" value={metrics.gerencias} tint="from-sky-400 to-blue-600" />
        <Metric icon={Link2} label="Con Evaluar" value={metrics.conEvaluar} tint="from-emerald-400 to-teal-600" />
        <Metric icon={Images} label="Con imágenes" value={metrics.conImagenes} tint="from-amber-400 to-orange-600" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 no-print">
        <div className="glass flex min-w-[15rem] flex-1 items-center gap-2 rounded-2xl px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-cyan-400/70">
          <Search className="h-4 w-4 text-ink-soft" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por puesto, área o gestión…"
            className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Limpiar búsqueda" className="text-ink-faint hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <select
          value={gestion}
          onChange={(e) => setGestion(e.target.value)}
          aria-label="Filtrar por gestión"
          className="rounded-2xl fill-softer px-3.5 py-2.5 text-sm font-semibold text-ink outline-none ring-1 ring-[color:var(--hairline)] focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <option value="todas">Todas las gestiones</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        <select
          value={area}
          onChange={(e) => setArea(e.target.value)}
          aria-label="Filtrar por área"
          className="max-w-[14rem] rounded-2xl fill-softer px-3.5 py-2.5 text-sm font-semibold text-ink outline-none ring-1 ring-[color:var(--hairline)] focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <option value="todas">Todas las áreas</option>
          {areas.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setForm({ kind: "create" })}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-5 py-2.5 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all duration-500 ease-spring hover:-translate-y-1 hover:scale-[1.03] active:scale-95"
        >
          <Plus className="h-4 w-4" />
          Crear perfil
        </button>
      </div>

      {/* Local draft nudge */}
      <AnimatePresence>
        {draft && form.kind === "closed" && (
          <motion.button
            type="button"
            onClick={() => setForm({ kind: "create" })}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex w-full items-center gap-3 rounded-2xl bg-amber-400/10 px-4 py-3 text-left ring-1 ring-amber-400/30 transition-colors hover:bg-amber-400/15"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 text-white ring-1 ring-white/30">
              <FilePen className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-bold text-amber-200">Tienes un borrador sin guardar</span>
              <span className="block text-xs text-amber-200/80">
                {draft.puestoBdp.trim() || "Perfil de cargo"} — haz clic para continuar donde lo dejaste.
              </span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Grid / empty */}
      {perfiles.length === 0 ? (
        <EmptyInvite onCreate={() => setForm({ kind: "create" })} />
      ) : filtered.length === 0 ? (
        <EmptyState title="Sin coincidencias" message="Ningún perfil coincide con la búsqueda o los filtros aplicados." />
      ) : (
        <motion.div layout className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <AnimatePresence>
            {filtered.map((p) => (
              <PerfilCargoCard
                key={p.id}
                perfil={p}
                onOpen={() => {
                  setViewing(p);
                  logActivity({ modulo: "perfiles", accion: "Abrió perfil de cargo", detalle: p.puestoBdp });
                }}
                onEdit={() => setForm({ kind: "edit", perfil: p })}
                onDelete={() => setToDelete(p)}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Overlays */}
      <PerfilCargoForm
        open={form.kind !== "closed"}
        mode={form.kind === "edit" ? "edit" : "create"}
        initial={form.kind === "edit" ? toForm(form.perfil) : emptyForm()}
        fila={form.kind === "edit" ? form.perfil.fila : undefined}
        initialVerified={form.kind === "edit" ? isValidEvaluarUrl(form.perfil.linkEvaluar) : false}
        onClose={closeForm}
      />

      <PerfilCargoViewer
        perfil={viewing}
        onClose={() => setViewing(null)}
        onEdit={(p) => {
          setViewing(null);
          setForm({ kind: "edit", perfil: p });
        }}
        onDelete={(p) => setToDelete(p)}
      />

      <GlassDialog
        open={Boolean(toDelete)}
        onCancel={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="¿Eliminar el perfil de cargo?"
        description={
          toDelete
            ? `Se eliminará por completo «${toDelete.puestoBdp || "Perfil de cargo"}» de la hoja y las filas siguientes se ajustarán hacia arriba. Esta acción no se puede deshacer.`
            : ""
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        destructive
        busy={deleting}
      />
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: typeof FileStack;
  label: string;
  value: number;
  tint: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass flex items-center gap-3 rounded-2xl p-3.5"
    >
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${tint} text-white shadow-glass ring-1 ring-white/30`}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <div className="text-2xl font-black leading-none text-ink">{value}</div>
        <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</div>
      </div>
    </motion.div>
  );
}

function EmptyInvite({ onCreate }: { onCreate: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass relative mx-auto flex max-w-xl flex-col items-center gap-4 overflow-hidden rounded-[2rem] px-8 py-14 text-center"
    >
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-cyan-400/15 blur-3xl"
        animate={{ x: [0, 20, 0], y: [0, 14, 0] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.span
        className="grid h-20 w-20 place-items-center rounded-[1.75rem] bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white shadow-glow-cyan ring-1 ring-white/30"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <PerfilCargoIcon className="h-10 w-10" strokeWidth={1.8} />
      </motion.span>
      <div className="relative">
        <h3 className="text-xl font-black tracking-tight text-ink">Aún no hay perfiles de cargo</h3>
        <p className="mt-1.5 text-sm text-ink-soft">
          Crea el primer perfil de cargo del banco. Se guardará en la hoja <code className="rounded bg-black/10 px-1.5 py-0.5 text-xs">perfil_cargo_bdp</code> y estará disponible para su visualización.
        </p>
      </div>
      <button
        type="button"
        onClick={onCreate}
        className="relative inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-6 py-3 text-sm font-black text-white shadow-glass ring-1 ring-white/30 transition-all duration-500 ease-spring hover:-translate-y-1 hover:scale-[1.03] active:scale-95"
      >
        <Plus className="h-4 w-4" />
        Crear el primer perfil
      </button>
    </motion.div>
  );
}
