import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  Save,
  LogOut,
  IdCard,
  GraduationCap,
  Briefcase,
  BookOpen,
  HeartHandshake,
  LinkIcon,
  Images,
  Sparkles,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { TextAutocomplete } from "../form/TextAutocomplete";
import { MultiFieldList } from "./MultiFieldList";
import { EvaluarLinkField } from "./EvaluarLinkField";
import { ImageManager } from "./ImageManager";
import { YearField } from "./YearField";
import { GlassDialog } from "../../design-system/liquid-glass/GlassDialog";
import { toast } from "../../design-system/liquid-glass/toast";
import { useFormDraft } from "../../hooks/useFormDraft";
import {
  formHasContent,
  toRawPerfilCargo,
  validateForm,
  type PerfilCargoForm as FormShape,
} from "../../lib/perfilCargo";
import { useTalentData } from "../../context/TalentDataContext";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";

const DRAFT_KEY = "bdp-perfil-cargo-draft";

interface DraftState {
  form: FormShape;
  evaluarVerified: boolean;
}

export interface PerfilFormProps {
  open: boolean;
  mode: "create" | "edit";
  /** Seed values (blank for create; the profile's values for edit). */
  initial: FormShape;
  /** 1-based data row for edits. */
  fila?: number;
  /** Whether the seeded Evaluar link was already human-verified (edit). */
  initialVerified?: boolean;
  onClose: () => void;
}

/**
 * The perfil-de-cargo authoring form — a full-screen Liquid Glass overlay split
 * into labelled sections. It autosaves a local draft while creating (with crash
 * recovery), enforces the `" | "` storage rule through its list fields, verifies
 * the Evaluar link with a human step, and only writes to the sheet when the
 * operator confirms.
 */
export function PerfilCargoForm(props: PerfilFormProps) {
  return createPortal(
    <AnimatePresence>
      {props.open && <FormBody key={`${props.mode}-${props.fila ?? "new"}`} {...props} />}
    </AnimatePresence>,
    document.body,
  );
}

function FormBody({ mode, initial, fila, initialVerified, onClose }: PerfilFormProps) {
  const { submitPerfilCargo, updatePerfilCargo, auxiliares } = useTalentData();
  const [form, setForm] = useState<FormShape>(initial);
  const [verified, setVerified] = useState<boolean>(initialVerified ?? false);
  const [previewMode, setPreviewMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const isCreate = mode === "create";

  // Local draft (create only) — live autosave + one-time recovery prompt.
  const draftState: DraftState = useMemo(() => ({ form, evaluarVerified: verified }), [form, verified]);
  const { recoveredDraft, savedAt, clearDraft } = useFormDraft<DraftState>(
    DRAFT_KEY,
    draftState,
    (s) => formHasContent(s.form),
    isCreate,
  );
  const [showRecovery, setShowRecovery] = useState<boolean>(Boolean(recoveredDraft));

  // Escape asks to exit; the page scroll stays frozen while the form is open.
  useBodyScrollLock(true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") attemptExit();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof FormShape>(key: K, value: FormShape[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function attemptExit() {
    if (previewMode) {
      setPreviewMode(false);
      return;
    }
    if (formHasContent(form)) setConfirmExit(true);
    else discardAndClose();
  }

  function discardAndClose() {
    if (isCreate) clearDraft();
    onClose();
  }

  async function handleSave() {
    const errs = validateForm(form);
    if (form.linkEvaluar.trim() && !verified) {
      errs.push("Verifica el enlace de Evaluar (usa «Visitar enlace» y confirma que funciona).");
    }
    setErrors(errs);
    if (errs.length) {
      toast.error("Revisa los campos marcados antes de guardar.");
      return;
    }
    setSaving(true);
    const row = toRawPerfilCargo(form);
    const res =
      isCreate || fila == null
        ? await submitPerfilCargo(row)
        : await updatePerfilCargo(fila, row);
    setSaving(false);
    if (res.ok) {
      if (isCreate) clearDraft();
      toast.success(res.message);
      onClose();
    } else {
      toast.error(res.message);
    }
  }

  const frozen = previewMode; // the preview switch freezes the rest of the form

  return (
    <motion.div
      className="fixed inset-0 z-[115] overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      role="dialog"
      aria-modal="true"
      aria-label={isCreate ? "Nuevo perfil de cargo" : "Editar perfil de cargo"}
    >
      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md" onClick={attemptExit} />

      <motion.div
        className="relative z-10 mx-auto my-4 w-full max-w-4xl px-3 sm:px-5"
        initial={{ opacity: 0, y: 30, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 240, damping: 26 }}
      >
        <div className="glass-heavy overflow-hidden rounded-[2rem] shadow-glass-lg">
          {/* Hero header */}
          <div className="relative overflow-hidden bg-gradient-to-br from-[#004a8f] via-[#005baa] to-[#00b0d8] px-5 py-6 sm:px-7">
            <motion.span
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-3xl"
              animate={{ x: [0, 18, 0], y: [0, 14, 0] }}
              transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
            />
            <div className="relative flex items-center justify-between gap-3">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[0.7rem] font-bold uppercase tracking-[0.18em] text-white ring-1 ring-white/25 backdrop-blur">
                  <Sparkles className="h-3.5 w-3.5" />
                  {isCreate ? "Nuevo perfil de cargo" : "Editar perfil de cargo"}
                </span>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-white drop-shadow sm:text-3xl">
                  {form.puestoBdp.trim() || "Perfil de cargo"}
                </h2>
                <p className="mt-0.5 text-sm text-white/80">
                  {form.areaCargo.trim() ? `${form.areaCargo} · ` : ""}Gestión {form.gestionBdp || "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={attemptExit}
                aria-label="Cerrar formulario"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/30 backdrop-blur transition-all duration-300 hover:bg-white/25 hover:rotate-90 active:scale-90"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Recovery banner */}
          <AnimatePresence>
            {showRecovery && recoveredDraft && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--hairline)] bg-amber-400/10 px-5 py-3"
              >
                <p className="text-sm font-semibold text-amber-200">
                  Se encontró un borrador guardado localmente
                  {savedAt ? ` (${new Date(savedAt).toLocaleString("es-BO")})` : ""}. ¿Continuar donde lo dejaste?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setForm(recoveredDraft.form);
                      setVerified(recoveredDraft.evaluarVerified);
                      setShowRecovery(false);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-4 py-1.5 text-xs font-bold text-white shadow-glass ring-1 ring-white/30 transition-all hover:-translate-y-0.5 active:scale-95"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Continuar borrador
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      clearDraft();
                      setShowRecovery(false);
                    }}
                    className="rounded-full fill-softer px-4 py-1.5 text-xs font-semibold text-ink ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-soft"
                  >
                    Descartar
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Body */}
          <div className="max-h-[calc(100vh-15rem)] space-y-5 overflow-y-auto px-4 py-6 sm:px-7">
            <fieldset className={frozen ? "pointer-events-none opacity-50 transition-opacity" : "transition-opacity"} disabled={frozen}>
              <div className="space-y-5">
                <Section icon={IdCard} title="Datos Generales del Perfil" tint="from-[#00b0d8] to-[#005baa]">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextAutocomplete
                      label="Área del Perfil"
                      required
                      value={form.areaCargo}
                      onChange={(v) => set("areaCargo", v)}
                      options={auxiliares.gerencias_bdp}
                      placeholder="Ej. Gerencia de Auditoría Interna"
                      hint="Sugerencias de gerencias_bdp"
                    />
                    <TextAutocomplete
                      label="Puesto del Perfil"
                      required
                      value={form.puestoBdp}
                      onChange={(v) => set("puestoBdp", v)}
                      options={auxiliares.cargos_bdp}
                      placeholder="Ej. Auditor Operativo"
                      hint="Sugerencias de cargos_bdp"
                    />
                  </div>
                  <div className="mt-4">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-soft">Gestión</span>
                    <YearField value={form.gestionBdp} onChange={(v) => set("gestionBdp", v)} />
                  </div>
                </Section>

                <Section icon={GraduationCap} title="Formación Mínima Requerida" tint="from-sky-400 to-blue-600">
                  <FieldBlock label="Formación Principal" required>
                    <MultiFieldList
                      values={form.formacionPrincipal}
                      onChange={(v) => set("formacionPrincipal", v)}
                      addLabel="Agregar formación"
                      placeholder="Ej. Licenciatura en Auditoría, Contaduría Pública o ramas afines."
                    />
                  </FieldBlock>
                  <FieldBlock label="Formación Complementaria">
                    <MultiFieldList
                      values={form.formacionComplementaria}
                      onChange={(v) => set("formacionComplementaria", v)}
                      addLabel="Agregar formación"
                      placeholder="Ej. Diplomado en Normas Internacionales de Auditoría."
                    />
                  </FieldBlock>
                </Section>

                <Section icon={Briefcase} title="Experiencia Mínima Requerida" tint="from-indigo-400 to-violet-600">
                  <FieldBlock label="Experiencia General" required>
                    <MultiFieldList
                      values={form.experienciaGeneral}
                      onChange={(v) => set("experienciaGeneral", v)}
                      addLabel="Agregar experiencia"
                      placeholder="Ej. 3 años de experiencia general en el sistema financiero."
                    />
                  </FieldBlock>
                  <FieldBlock label="Experiencia Específica">
                    <MultiFieldList
                      values={form.experienciaEspecifica}
                      onChange={(v) => set("experienciaEspecifica", v)}
                      addLabel="Agregar experiencia"
                      placeholder="Ej. 2 años en auditoría de entidades financieras reguladas."
                    />
                  </FieldBlock>
                </Section>

                <Section icon={BookOpen} title="Conocimientos Mínimos Complementarios" tint="from-cyan-400 to-teal-600">
                  <FieldBlock label="Conocimientos Técnicos">
                    <MultiFieldList
                      values={form.conocimientosTecnicos}
                      onChange={(v) => set("conocimientosTecnicos", v)}
                      addLabel="Agregar conocimiento"
                      placeholder="Ej. Conocimientos sólidos en Normas contables, bancarias y tributarias."
                    />
                  </FieldBlock>
                  <FieldBlock label="Conocimientos Genéricos">
                    <MultiFieldList
                      values={form.conocimientosGenericos}
                      onChange={(v) => set("conocimientosGenericos", v)}
                      addLabel="Agregar conocimiento"
                      placeholder="Ej. Manejo de herramientas ofimáticas."
                    />
                  </FieldBlock>
                </Section>

                <Section icon={HeartHandshake} title="Conductas y Competencias Requeridas" tint="from-fuchsia-400 to-purple-600">
                  <FieldBlock label="Conductas Requeridas">
                    <MultiFieldList
                      values={form.conductasRequeridas}
                      onChange={(v) => set("conductasRequeridas", v)}
                      addLabel="Agregar conducta"
                      placeholder="Ej. Integridad y comportamiento ético."
                    />
                  </FieldBlock>
                  <FieldBlock label="Competencias Requeridas">
                    <MultiFieldList
                      values={form.competenciasRequeridas}
                      onChange={(v) => set("competenciasRequeridas", v)}
                      addLabel="Agregar competencia"
                      placeholder="Ej. Orientación a resultados."
                    />
                  </FieldBlock>
                </Section>

                <Section icon={LinkIcon} title="Postulación en Evaluar" tint="from-emerald-400 to-teal-600">
                  <FieldBlock label="Link Evaluar.com de la convocatoria">
                    <EvaluarLinkField
                      value={form.linkEvaluar}
                      onChange={(v) => set("linkEvaluar", v)}
                      verified={verified}
                      onVerifiedChange={setVerified}
                    />
                  </FieldBlock>
                </Section>
              </div>
            </fieldset>

            {/* Images (stays interactive even when preview freezes the rest) */}
            <Section icon={Images} title="Imágenes del Perfil de Cargo" tint="from-amber-400 to-orange-600">
              <ImageManager
                images={form.imagenes}
                onChange={(v) => set("imagenes", v)}
                previewMode={previewMode}
                onPreviewModeChange={setPreviewMode}
              />
            </Section>

            {errors.length > 0 && (
              <div className="rounded-2xl bg-rose-500/10 p-4 ring-1 ring-rose-400/30">
                <p className="mb-1 text-sm font-bold text-rose-200">Corrige lo siguiente:</p>
                <ul className="list-inside list-disc text-sm text-rose-200/90">
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="flex flex-col-reverse gap-2 border-t border-[color:var(--hairline)] bg-[color:var(--glass-bg-heavy)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <button
              type="button"
              onClick={attemptExit}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-full fill-softer px-5 py-2.5 text-sm font-bold text-ink ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-95 disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" />
              Salir sin guardar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || frozen}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 px-6 py-2.5 text-sm font-black text-white shadow-glass ring-1 ring-white/30 transition-all duration-500 ease-spring hover:-translate-y-1 hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Confirmar y guardar perfil
            </button>
          </div>
        </div>
      </motion.div>

      <GlassDialog
        open={confirmExit}
        onCancel={() => setConfirmExit(false)}
        onConfirm={() => {
          setConfirmExit(false);
          discardAndClose();
        }}
        title="¿Salir sin guardar?"
        description="Se descartará el perfil en curso y no se enviará nada a la base de datos."
        confirmLabel="Descartar y salir"
        cancelLabel="Seguir editando"
        destructive
      />
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Layout helpers                                                      */
/* ------------------------------------------------------------------ */

function Section({
  icon: Icon,
  title,
  tint,
  children,
}: {
  icon: typeof IdCard;
  title: string;
  tint: string;
  children: ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="glass rounded-3xl p-5"
    >
      <div className="mb-4 flex items-center gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${tint} text-white shadow-glass ring-1 ring-white/30`}>
          <Icon className="h-5 w-5" />
        </span>
        <h3 className="text-base font-black tracking-tight text-ink sm:text-lg">{title}</h3>
      </div>
      <div className="space-y-4">{children}</div>
    </motion.section>
  );
}

function FieldBlock({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl fill-soft p-3.5 ring-1 ring-[color:var(--hairline)]">
      <p className="mb-2.5 text-xs font-bold uppercase tracking-wide text-ink-soft">
        {label}
        {required && <span className="ml-1 text-cyan-400">*</span>}
      </p>
      {children}
    </div>
  );
}
