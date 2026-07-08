import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Building2,
  CheckCircle2,
  MessageSquareQuote,
  Phone,
  Plus,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UserRound,
} from "lucide-react";
import type { Candidate } from "../../types";
import { TextField, TextAreaField, SegmentedField } from "../form/Fields";
import { TagInput } from "../form/TagInput";
import { ConfirmDialog } from "../ConfirmDialog";
import { useProfiles } from "../../lib/profilesStore";
import {
  addReference,
  removeReference,
  useReferences,
  RECOMMENDATION_LABELS,
  type LaborReference,
  type Recommendation,
} from "../../lib/referencesStore";
import { SectionCard, StarRating } from "./parts";

const EMPTY = {
  refereeName: "",
  refereeRole: "",
  company: "",
  relationship: "",
  contact: "",
  rating: 0,
  recommends: "" as Recommendation,
  verified: false,
  comment: "",
  strengths: [] as string[],
  concerns: [] as string[],
};

/**
 * The "Referencias" tab — a panel to capture the labor references a recruiter
 * phoned and their structured feedback, rendered as a beautiful, sortable feed.
 */
export function ReferenciasTab({ candidate }: { candidate: Candidate }) {
  const { current } = useProfiles();
  const refsMap = useReferences();
  const list = refsMap[candidate.identificador ?? candidate.id] ?? [];
  const [form, setForm] = useState({ ...EMPTY });
  const [open, setOpen] = useState(list.length === 0);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.refereeName.trim()) return;
    addReference(candidate.identificador ?? candidate.id, {
      ...form,
      author: current?.nombre ?? "Sistema",
    });
    setForm({ ...EMPTY });
    setOpen(false);
  }

  const avg =
    list.length > 0
      ? Math.round((list.reduce((a, r) => a + (r.rating || 0), 0) / list.length) * 10) / 10
      : null;
  const recommendCount = list.filter((r) => r.recommends === "si").length;

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      {list.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Metric label="Referencias" value={String(list.length)} />
          <Metric label="Calificación media" value={avg !== null ? `${avg} ★` : "—"} />
          <Metric label="Recomiendan" value={`${recommendCount}/${list.length}`} />
        </div>
      )}

      {/* Add form */}
      <SectionCard
        icon={<MessageSquareQuote className="h-5 w-5" />}
        title="Registrar referencia laboral"
        sub="Datos de la persona llamada y su valoración"
        action={
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="no-print inline-flex items-center gap-1.5 rounded-full fill-softer px-3 py-1.5 text-xs font-bold text-ink-soft ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-95"
          >
            <Plus className={`h-4 w-4 transition-transform ${open ? "rotate-45" : ""}`} />
            {open ? "Cerrar" : "Nueva"}
          </button>
        }
      >
        <AnimatePresence initial={false}>
          {open && (
            <motion.form
              onSubmit={submit}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextField label="Nombre de la referencia" value={form.refereeName} onChange={(v) => set("refereeName", v)} placeholder="Nombre completo" />
                <TextField label="Cargo" value={form.refereeRole} onChange={(v) => set("refereeRole", v)} placeholder="Ej. Jefe directo" />
                <TextField label="Empresa" value={form.company} onChange={(v) => set("company", v)} placeholder="Empresa / institución" />
                <TextField label="Relación laboral" value={form.relationship} onChange={(v) => set("relationship", v)} placeholder="Ej. Supervisor, colega" />
                <TextField label="Contacto" hint="Teléfono o correo" value={form.contact} onChange={(v) => set("contact", v)} placeholder="+591 …" />
                <SegmentedField
                  label="¿Recomienda?"
                  value={
                    form.recommends === "si"
                      ? "Sí"
                      : form.recommends === "con_reservas"
                        ? "Con reservas"
                        : form.recommends === "no"
                          ? "No"
                          : ""
                  }
                  onChange={(v) =>
                    set("recommends", v === "Sí" ? "si" : v === "Con reservas" ? "con_reservas" : v === "No" ? "no" : "")
                  }
                  options={["Sí", "Con reservas", "No"]}
                  toneFor={(o) => (o === "Sí" ? "green" : o === "Con reservas" ? "amber" : "red")}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-4">
                <div>
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-soft">Calificación</span>
                  <StarRating value={form.rating} onChange={(v) => set("rating", v)} size={24} />
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full fill-softer px-3 py-2 text-sm font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)]">
                  <input
                    type="checkbox"
                    checked={form.verified}
                    onChange={(e) => set("verified", e.target.checked)}
                    className="h-4 w-4 accent-cyan-500"
                  />
                  <ShieldCheck className="h-4 w-4 text-cyan-400" />
                  Contacto verificado
                </label>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TagInput label="Fortalezas" tags={form.strengths} onChange={(t) => set("strengths", t)} placeholder="Fortaleza y Enter…" />
                <TagInput label="Aspectos a considerar" tags={form.concerns} onChange={(t) => set("concerns", t)} placeholder="Aspecto y Enter…" />
              </div>

              <div className="mt-3">
                <TextAreaField label="Comentarios" value={form.comment} onChange={(v) => set("comment", v)} placeholder="Resumen de la conversación con la referencia…" rows={3} />
              </div>

              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setForm({ ...EMPTY })} className="rounded-full fill-softer px-4 py-2 text-sm font-bold text-ink-soft ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-95">
                  Limpiar
                </button>
                <button
                  type="submit"
                  disabled={!form.refereeName.trim()}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-5 py-2 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  Guardar referencia
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </SectionCard>

      {/* Feed */}
      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[color:var(--hairline)] px-4 py-10 text-center text-sm text-ink-faint">
          Aún no hay referencias registradas para esta persona.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <AnimatePresence initial={false}>
            {list.map((r) => (
              <ReferenceCard key={r.id} reference={r} onDelete={() => setDeleteId(r.id)} />
            ))}
          </AnimatePresence>
        </div>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        tone="danger"
        title="Eliminar referencia"
        message="¿Seguro que desea eliminar esta referencia laboral? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={() => {
          if (deleteId) removeReference(candidate.identificador ?? candidate.id, deleteId);
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-2xl p-3 text-center">
      <div className="text-xl font-black text-ink">{value}</div>
      <div className="text-[0.6rem] uppercase tracking-wide text-ink-faint">{label}</div>
    </div>
  );
}

const REC_STYLE: Record<Exclude<Recommendation, "">, { cls: string; icon: typeof ThumbsUp }> = {
  si: { cls: "bg-emerald-500/15 text-emerald-500 ring-emerald-400/30", icon: ThumbsUp },
  con_reservas: { cls: "bg-amber-500/15 text-amber-500 ring-amber-400/30", icon: ThumbsUp },
  no: { cls: "bg-rose-500/15 text-rose-500 ring-rose-400/30", icon: ThumbsDown },
};

function ReferenceCard({ reference: r, onDelete }: { reference: LaborReference; onDelete: () => void }) {
  const rec = r.recommends ? REC_STYLE[r.recommends] : null;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className="glass glow relative flex flex-col rounded-3xl p-4 print-avoid-break"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#005baa] to-[#004a8f] text-white shadow-glass ring-1 ring-white/30">
          <UserRound className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="wrap-words text-sm font-black text-ink">{r.refereeName || "Referencia"}</h4>
            {r.verified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 px-2 py-0.5 text-[0.6rem] font-bold text-cyan-400 ring-1 ring-cyan-400/30">
                <CheckCircle2 className="h-3 w-3" /> Verificada
              </span>
            )}
          </div>
          <p className="text-xs text-ink-soft">
            {[r.refereeRole, r.relationship].filter(Boolean).join(" · ") || "Sin cargo"}
          </p>
        </div>
        <button
          type="button"
          aria-label="Eliminar referencia"
          onClick={onDelete}
          className="no-print grid h-8 w-8 shrink-0 place-items-center rounded-full fill-softer text-ink-soft ring-1 ring-[color:var(--hairline)] transition-all hover:bg-rose-500/15 hover:text-rose-500 active:scale-90"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
        {r.company && (
          <span className="inline-flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5 text-cyan-400" /> {r.company}
          </span>
        )}
        {r.contact && (
          <span className="inline-flex items-center gap-1">
            <Phone className="h-3.5 w-3.5 text-cyan-400" /> {r.contact}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StarRating value={r.rating} />
        {rec && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold ring-1 ${rec.cls}`}>
            <rec.icon className="h-3 w-3" /> {RECOMMENDATION_LABELS[r.recommends as Exclude<Recommendation, "">]}
          </span>
        )}
      </div>

      {r.comment && (
        <p className="mt-2 wrap-words rounded-2xl fill-soft px-3 py-2 text-sm italic text-ink-soft ring-1 ring-[color:var(--hairline)]">
          “{r.comment}”
        </p>
      )}

      {(r.strengths.length > 0 || r.concerns.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {r.strengths.map((s, i) => (
            <span key={`s${i}`} className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[0.65rem] font-semibold text-emerald-500 ring-1 ring-emerald-400/30">
              + {s}
            </span>
          ))}
          {r.concerns.map((s, i) => (
            <span key={`c${i}`} className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-500 ring-1 ring-amber-400/30">
              ! {s}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-[0.65rem] text-ink-faint">
        <span>Por {r.author || "—"}</span>
        <span>{new Date(r.createdAt).toLocaleDateString("es-BO", { day: "2-digit", month: "short", year: "numeric" })}</span>
      </div>
    </motion.div>
  );
}
