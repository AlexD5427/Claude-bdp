import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  UserPlus,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Gauge,
  ShieldCheck,
  ClipboardList,
  Save,
  BadgeCheck,
} from "lucide-react";
import { Modal } from "../components/Modal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { TextField, SelectField, SegmentedField } from "../components/form/Fields";
import { DiscSelect } from "../components/DiscSelect";
import { TagInput } from "../components/form/TagInput";
import { GaugeInput } from "../components/form/GaugeInput";
import { ItemListBuilder } from "../components/form/ItemListBuilder";
import { CompetencyAutocomplete } from "../components/CompetencyAutocomplete";
import { CompetencyConfigCard } from "../components/CompetencyConfigCard";
import { useTalentData } from "../context/TalentDataContext";
import { useFormDraft } from "../hooks/useFormDraft";
import {
  CONFIABILIDAD_OPTIONS,
  DEPARTAMENTO_OPTIONS,
  ESTADO_CIVIL_OPTIONS,
  MAX_COMPETENCIAS,
  MAX_CONOCIMIENTOS,
  MAX_HERRAMIENTAS,
  NIVEL_ACADEMICO_OPTIONS,
  NIVEL_RIESGO_OPTIONS,
} from "../constants";
import { buildSavedCompetency, parseDecimal } from "../lib/competency";
import type { FormCompetency, FormItem, RawCandidate } from "../types";

function newUid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type Feedback = { kind: "ok" | "warn"; message: string } | null;

interface FormState {
  identificador: string;
  nombres: string;
  apellido_paterno: string;
  apellido_materno: string;
  edad: string;
  departamento_residencia: string;
  localidad_residencia: string;
  estado_civil: string;
  nivel_academico: string;
  carrera: string;
  trabaja_bdp: string;
  cargo_bdp: string;
  nota_cap: number | null;
  nota_curriculum: number | null;
  nota_conocimiento: number | null;
  nota_competencias: number | null;
  perfil_disc: string;
  conocimientos: FormItem[];
  herramientas: FormItem[];
  competencias: FormCompetency[];
  nivel_general_confiabilidad: string;
  nivel_integridad: string;
  riesgo_robo: string;
  riesgo_mentira: string;
  observaciones: string[];
}

const EMPTY: FormState = {
  identificador: "",
  nombres: "",
  apellido_paterno: "",
  apellido_materno: "",
  edad: "",
  departamento_residencia: "",
  localidad_residencia: "",
  estado_civil: "",
  nivel_academico: "",
  carrera: "",
  trabaja_bdp: "",
  cargo_bdp: "",
  nota_cap: null,
  nota_curriculum: null,
  nota_conocimiento: null,
  nota_competencias: null,
  perfil_disc: "N/A",
  conocimientos: [],
  herramientas: [],
  competencias: [],
  nivel_general_confiabilidad: "",
  nivel_integridad: "",
  riesgo_robo: "",
  riesgo_mentira: "",
  observaciones: [],
};

const DRAFT_KEY = "bdp-registro-borrador";

/** Detect whether the user has entered anything worth recovering. */
function hasContent(s: FormState): boolean {
  return (
    [
      s.identificador,
      s.nombres,
      s.apellido_paterno,
      s.apellido_materno,
      s.edad,
      s.departamento_residencia,
      s.localidad_residencia,
      s.estado_civil,
      s.nivel_academico,
      s.carrera,
      s.trabaja_bdp,
      s.cargo_bdp,
      // "N/A" is the default DISC value, so it doesn't count as content.
      s.perfil_disc === "N/A" ? "" : s.perfil_disc,
      s.nivel_general_confiabilidad,
      s.nivel_integridad,
      s.riesgo_robo,
      s.riesgo_mentira,
    ].some((v) => v.trim() !== "") ||
    [s.nota_cap, s.nota_curriculum, s.nota_conocimiento, s.nota_competencias].some(
      (v) => v !== null,
    ) ||
    s.conocimientos.length > 0 ||
    s.herramientas.length > 0 ||
    s.competencias.length > 0 ||
    s.observaciones.length > 0
  );
}

interface RegistrationFormProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

/**
 * MÓDULO 1 — "Cuestionario de Registro de Postulante".
 *
 * A full applicant-tracking intake form rendered as a guarded modal:
 *   · Personal data, speedometer evaluation dials and a DISC archetype.
 *   · A1 technical knowledge (0/7), A2 tools (0/5), A3 competencies (0/7).
 *   · Reliability scales and comma-separated observation tags.
 *   · Live local autosave + crash recovery, and an exit-confirmation guard.
 */
export function RegistrationForm({ open, onClose, onSaved }: RegistrationFormProps) {
  const { competencias, arquetipos, submitCandidate } = useTalentData();
  const [form, setForm] = useState<FormState>({ ...EMPTY });
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [confirmExit, setConfirmExit] = useState(false);

  const { recoveredDraft, savedAt, clearDraft } = useFormDraft(
    DRAFT_KEY,
    form,
    hasContent,
  );
  const [showRecovery, setShowRecovery] = useState(recoveredDraft !== null);

  const dirty = useMemo(() => hasContent(form), [form]);

  // Warn the browser before an accidental tab close while editing. The draft is
  // already persisted, so even if they leave, recovery kicks in next time.
  useEffect(() => {
    if (!open || !dirty) return;
    function beforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [open, dirty]);
  const compsCount = form.competencias.length;
  const atCompLimit = compsCount >= MAX_COMPETENCIAS;
  const selectedComps = useMemo(
    () => form.competencias.map((c) => c.name),
    [form.competencias],
  );

  const setField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  // ---- competency builder -------------------------------------------------
  function addCompetency(name: string) {
    if (atCompLimit) return;
    setForm((f) => ({
      ...f,
      competencias: [
        ...f.competencias,
        { uid: newUid(), name, esperadoText: "", obtenidoText: "" },
      ],
    }));
  }
  function updateCompetency(uid: string, patch: Partial<FormCompetency>) {
    setForm((f) => ({
      ...f,
      competencias: f.competencias.map((c) =>
        c.uid === uid ? { ...c, ...patch } : c,
      ),
    }));
  }
  function removeCompetency(uid: string) {
    setForm((f) => ({
      ...f,
      competencias: f.competencias.filter((c) => c.uid !== uid),
    }));
  }

  // ---- generic list builders (conocimientos / herramientas) --------------
  function addItem(key: "conocimientos" | "herramientas") {
    setForm((f) => ({
      ...f,
      [key]: [...f[key], { uid: newUid(), nombre: "", nivel: "", detalle: "" }],
    }));
  }
  function updateItem(
    key: "conocimientos" | "herramientas",
    uid: string,
    patch: Partial<FormItem>,
  ) {
    setForm((f) => ({
      ...f,
      [key]: f[key].map((it) => (it.uid === uid ? { ...it, ...patch } : it)),
    }));
  }
  function removeItem(key: "conocimientos" | "herramientas", uid: string) {
    setForm((f) => ({ ...f, [key]: f[key].filter((it) => it.uid !== uid) }));
  }

  // ---- lifecycle ----------------------------------------------------------
  function resetForm() {
    setForm({ ...EMPTY });
    setFeedback(null);
  }

  function requestClose() {
    if (dirty) setConfirmExit(true);
    else onClose();
  }

  function recoverDraft() {
    if (recoveredDraft) setForm(recoveredDraft);
    setShowRecovery(false);
  }
  function discardDraft() {
    clearDraft();
    resetForm();
    setShowRecovery(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombres.trim() || !form.apellido_paterno.trim()) {
      setFeedback({
        kind: "warn",
        message: "Nombres y Apellido Paterno son obligatorios.",
      });
      return;
    }

    const savedComps = form.competencias.map((c) =>
      buildSavedCompetency(
        c.name,
        parseDecimal(c.esperadoText),
        parseDecimal(c.obtenidoText),
      ),
    );

    const candidate: RawCandidate = {
      identificador: form.identificador.trim(),
      nombres: form.nombres.trim(),
      apellido_paterno: form.apellido_paterno.trim(),
      apellido_materno: form.apellido_materno.trim(),
      edad: parseDecimal(form.edad) ?? "",
      departamento_residencia: form.departamento_residencia,
      localidad_residencia: form.localidad_residencia.trim(),
      estado_civil: form.estado_civil,
      nivel_academico: form.nivel_academico,
      carrera: form.carrera.trim(),
      trabaja_bdp: form.trabaja_bdp,
      cargo_bdp: form.trabaja_bdp === "Sí" ? form.cargo_bdp.trim() : "",
      nota_cap: form.nota_cap ?? "",
      nota_curriculum: form.nota_curriculum ?? "",
      nota_conocimiento: form.nota_conocimiento ?? "",
      nota_competencias: form.nota_competencias ?? "",
      perfil_disc: form.perfil_disc,
      conocimientos_tecnicos: JSON.stringify(
        form.conocimientos
          .filter((c) => c.nombre.trim())
          .map((c) => ({
            nombre: c.nombre.trim(),
            nivel: c.nivel || undefined,
            detalle: c.detalle?.trim() || undefined,
          })),
      ),
      herramientas: JSON.stringify(
        form.herramientas
          .filter((h) => h.nombre.trim())
          .map((h) => ({ nombre: h.nombre.trim(), nivel: h.nivel || undefined })),
      ),
      competencias: JSON.stringify(savedComps),
      nivel_general_confiabilidad: form.nivel_general_confiabilidad,
      nivel_integridad: form.nivel_integridad,
      riesgo_robo: form.riesgo_robo,
      riesgo_mentira: form.riesgo_mentira,
      observaciones: form.observaciones.join(", "),
    };

    setSubmitting(true);
    setFeedback(null);
    const result = await submitCandidate(candidate);
    setSubmitting(false);
    setFeedback({ kind: result.ok ? "ok" : "warn", message: result.message });
    if (result.ok) {
      clearDraft();
      resetForm();
      onSaved?.();
      onClose();
    }
  }

  return (
    <>
      <Modal
        open={open}
        onRequestClose={requestClose}
        ariaLabel="Cuestionario de Registro de Postulante"
      >
        <form onSubmit={handleSubmit}>
          {/* ---- Sticky header ---- */}
          <div className="sticky top-0 z-20 flex items-center gap-3 rounded-t-3xl border-b border-[color:var(--hairline)] bg-[color:var(--glass-bg-heavy)] px-5 py-4 backdrop-blur-xl sm:px-7">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#00b0d8] to-[#005baa] shadow-glass ring-1 ring-white/30">
              <UserPlus className="h-6 w-6 text-white drop-shadow-md" />
            </div>
            <div className="min-w-0 flex-1 pr-10">
              <h2 className="truncate text-lg font-black tracking-tight text-ink sm:text-xl">
                Cuestionario de Registro de Postulante
              </h2>
              <p className="flex items-center gap-1.5 text-xs text-ink-soft">
                <Save className="h-3 w-3" />
                {savedAt
                  ? `Borrador guardado localmente · ${new Date(savedAt).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })}`
                  : "El avance se guarda automáticamente en este equipo."}
              </p>
            </div>
          </div>

          <div className="max-h-[calc(100vh-13rem)] space-y-6 overflow-y-auto px-5 py-6 sm:px-7">
            {/* ===== DATOS PERSONALES ===== */}
            <Section
              icon={<ClipboardList className="h-5 w-5 text-white drop-shadow-md" />}
              title="Datos Personales"
              subtitle="Identidad y residencia del postulante."
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="sm:col-span-2 lg:col-span-2">
                  <TextField
                    label="Identificador Único"
                    hint="CI - Nro Proceso - Año"
                    value={form.identificador}
                    onChange={(v) => setField("identificador", v)}
                    placeholder="CI - Nro Proceso - Año"
                  />
                </div>
                <TextField
                  label="Edad"
                  type="number"
                  value={form.edad}
                  onChange={(v) => setField("edad", v)}
                  placeholder="Edad"
                />
                <SelectField
                  label="Estado Civil"
                  value={form.estado_civil}
                  onChange={(v) => setField("estado_civil", v)}
                  options={ESTADO_CIVIL_OPTIONS}
                />
                <TextField
                  label="Nombres"
                  required
                  value={form.nombres}
                  onChange={(v) => setField("nombres", v)}
                  placeholder="Nombres"
                />
                <TextField
                  label="Apellido Paterno"
                  required
                  value={form.apellido_paterno}
                  onChange={(v) => setField("apellido_paterno", v)}
                  placeholder="Apellido Paterno"
                />
                <TextField
                  label="Apellido Materno"
                  value={form.apellido_materno}
                  onChange={(v) => setField("apellido_materno", v)}
                  placeholder="Apellido Materno"
                />
                {/* Nivel Académico + Carrera share a paired cell so Carrera
                    always sits immediately to the right of Nivel Académico. */}
                <div className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-2">
                  <SelectField
                    label="Nivel Académico"
                    value={form.nivel_academico}
                    onChange={(v) => setField("nivel_academico", v)}
                    options={NIVEL_ACADEMICO_OPTIONS}
                  />
                  <TextField
                    label="Carrera"
                    hint="Formación / profesión"
                    value={form.carrera}
                    onChange={(v) => setField("carrera", v)}
                    placeholder="Ej. Ingeniería Comercial"
                  />
                </div>
                <SelectField
                  label="Departamento de Residencia"
                  value={form.departamento_residencia}
                  onChange={(v) => setField("departamento_residencia", v)}
                  options={DEPARTAMENTO_OPTIONS}
                />
                <TextField
                  label="Localidad de Residencia"
                  value={form.localidad_residencia}
                  onChange={(v) => setField("localidad_residencia", v)}
                  placeholder="Localidad"
                />
                <div className="sm:col-span-2">
                  <SegmentedField
                    label="¿El postulante trabaja actualmente en BDP?"
                    value={form.trabaja_bdp}
                    onChange={(v) => setField("trabaja_bdp", v)}
                    options={["No", "Sí"]}
                  />
                </div>
                <AnimatePresence initial={false}>
                  {form.trabaja_bdp === "Sí" && (
                    <motion.div
                      className="sm:col-span-2"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ type: "spring", stiffness: 260, damping: 26 }}
                    >
                      <TextField
                        label="Cargo actual del Postulante"
                        value={form.cargo_bdp}
                        onChange={(v) => setField("cargo_bdp", v)}
                        placeholder="Cargo que ocupa actualmente"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </Section>

            {/* ===== RESULTADOS DE EVALUACIÓN ===== */}
            <Section
              icon={<Gauge className="h-5 w-5 text-white drop-shadow-md" />}
              title="Resultados de Evaluación"
              subtitle="Use los deslizadores de velocímetro o haga clic en el número del centro para ingreso manual (0 % a 100 %)."
            >
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <GaugeInput
                  label="Nota CAP"
                  hint="Adecuación al puesto"
                  value={form.nota_cap}
                  onChange={(v) => setField("nota_cap", v)}
                />
                <GaugeInput
                  label="Nota Currículum"
                  hint="Hoja de vida"
                  value={form.nota_curriculum}
                  onChange={(v) => setField("nota_curriculum", v)}
                />
                <GaugeInput
                  label="Nota Conocimientos"
                  hint="Evaluación técnica"
                  value={form.nota_conocimiento}
                  onChange={(v) => setField("nota_conocimiento", v)}
                />
                <GaugeInput
                  label="Nota Competencias"
                  hint="Nivel general"
                  value={form.nota_competencias}
                  onChange={(v) => setField("nota_competencias", v)}
                />
              </div>
              <div className="mt-4 max-w-md">
                <DiscSelect
                  label="Arquetipo DISC"
                  hint="Arquetipo de comportamiento"
                  value={form.perfil_disc}
                  onChange={(v) => setField("perfil_disc", v)}
                  archetypes={arquetipos}
                />
              </div>
            </Section>

            {/* ===== A. CONOCIMIENTOS, HERRAMIENTAS Y COMPETENCIAS ===== */}
            <Section
              icon={<Sparkles className="h-5 w-5 text-white drop-shadow-md" />}
              title="A · Conocimientos, Herramientas y Competencias"
            >
              <div className="space-y-4">
                <ItemListBuilder
                  title="A1. Conocimientos Técnicos"
                  items={form.conocimientos}
                  max={MAX_CONOCIMIENTOS}
                  addLabel="Agregar"
                  withDetalle
                  emptyHint="No se agregaron conocimientos técnicos aún."
                  onAdd={() => addItem("conocimientos")}
                  onChange={(uid, patch) => updateItem("conocimientos", uid, patch)}
                  onRemove={(uid) => removeItem("conocimientos", uid)}
                />
                <ItemListBuilder
                  title="A2. Manejo de Herramientas u otros"
                  items={form.herramientas}
                  max={MAX_HERRAMIENTAS}
                  addLabel="Configurar"
                  emptyHint="No se agregaron herramientas aún."
                  onAdd={() => addItem("herramientas")}
                  onChange={(uid, patch) => updateItem("herramientas", uid, patch)}
                  onRemove={(uid) => removeItem("herramientas", uid)}
                />

                {/* A3 — Competencias o Habilidades */}
                <div className="rounded-2xl fill-soft p-4 ring-1 ring-[color:var(--hairline)]">
                  <header className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-ink">
                        A3. Competencias o Habilidades{" "}
                        <span className="text-ink-faint">
                          ({compsCount}/{MAX_COMPETENCIAS})
                        </span>
                      </h4>
                      <p className="text-xs text-ink-faint">
                        Inserte competencias evaluadas mediante el buscador inferior.
                      </p>
                    </div>
                    <span
                      className={[
                        "rounded-full px-3 py-1 text-xs font-black ring-1 ring-white/30 shadow-glass",
                        atCompLimit
                          ? "bg-gradient-to-br from-amber-400 to-yellow-500 text-white"
                          : "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white",
                      ].join(" ")}
                    >
                      {compsCount}/{MAX_COMPETENCIAS}
                    </span>
                  </header>

                  <CompetencyAutocomplete
                    options={competencias}
                    selected={selectedComps}
                    onAdd={addCompetency}
                    disabled={atCompLimit}
                  />

                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <AnimatePresence mode="popLayout">
                      {form.competencias.map((c, i) => (
                        <CompetencyConfigCard
                          key={c.uid}
                          competency={c}
                          index={i}
                          onChange={updateCompetency}
                          onRemove={removeCompetency}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </Section>

            {/* ===== B. CONFIABILIDAD DEL POSTULANTE ===== */}
            <Section
              icon={<ShieldCheck className="h-5 w-5 text-white drop-shadow-md" />}
              title="B · Confiabilidad del Postulante"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SegmentedField
                  label="Confiabilidad e Integridad"
                  value={form.nivel_general_confiabilidad}
                  onChange={(v) => setField("nivel_general_confiabilidad", v)}
                  options={CONFIABILIDAD_OPTIONS}
                />
                <SegmentedField
                  label="Nivel de Integridad"
                  value={form.nivel_integridad}
                  onChange={(v) => setField("nivel_integridad", v)}
                  options={NIVEL_RIESGO_OPTIONS}
                />
                <SegmentedField
                  label="Nivel de Robo (Riesgo)"
                  value={form.riesgo_robo}
                  onChange={(v) => setField("riesgo_robo", v)}
                  options={NIVEL_RIESGO_OPTIONS}
                />
                <SegmentedField
                  label="Nivel de Mentira (Riesgo)"
                  value={form.riesgo_mentira}
                  onChange={(v) => setField("riesgo_mentira", v)}
                  options={NIVEL_RIESGO_OPTIONS}
                />
              </div>
              <div className="mt-4">
                <TagInput
                  label="Observaciones"
                  hint="Separe por comas para generar etiquetas"
                  tags={form.observaciones}
                  onChange={(t) => setField("observaciones", t)}
                  placeholder="Escriba una observación y pulse Enter o coma…"
                />
              </div>
            </Section>
          </div>

          {/* ---- Sticky footer ---- */}
          <div className="sticky bottom-0 z-20 flex flex-wrap items-center gap-3 rounded-b-3xl border-t border-[color:var(--hairline)] bg-[color:var(--glass-bg-heavy)] px-5 py-4 backdrop-blur-xl sm:px-7">
            <AnimatePresence>
              {feedback && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className={[
                    "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ring-1",
                    feedback.kind === "ok"
                      ? "bg-emerald-500/15 text-emerald-500 ring-emerald-400/30"
                      : "bg-amber-500/15 text-amber-500 ring-amber-400/30",
                  ].join(" ")}
                >
                  {feedback.kind === "ok" ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                  {feedback.message}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="ml-auto flex items-center gap-3">
              <button
                type="button"
                onClick={requestClose}
                className="rounded-full fill-softer px-5 py-3 text-sm font-bold text-ink ring-1 ring-[color:var(--hairline)] transition-all duration-300 hover:fill-soft active:scale-95"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-6 py-3 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all duration-500 ease-spring hover:-translate-y-1 hover:scale-[1.03] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Guardando…
                  </>
                ) : (
                  <>
                    <BadgeCheck className="h-4 w-4" />
                    Registrar Postulante
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Exit guard */}
      <ConfirmDialog
        open={confirmExit}
        tone="danger"
        title="¿Salir del registro?"
        message="Tiene cambios sin enviar. Su avance queda guardado localmente y podrá recuperarlo, pero el postulante no se registrará."
        confirmLabel="Salir"
        cancelLabel="Seguir editando"
        onConfirm={() => {
          setConfirmExit(false);
          onClose();
        }}
        onCancel={() => setConfirmExit(false)}
      />

      {/* Draft recovery */}
      <ConfirmDialog
        open={open && showRecovery}
        tone="info"
        title="Registro encontrado"
        message="Detectamos un borrador sin terminar de un registro anterior. ¿Desea continuar donde lo dejó o descartarlo e iniciar de nuevo?"
        confirmLabel="Abrir avance"
        cancelLabel="Descartar"
        onConfirm={recoverDraft}
        onCancel={discardDraft}
      />
    </>
  );
}

/** A titled section block used to structure the long intake form. */
function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass rounded-3xl p-4 sm:p-5">
      <header className="mb-4 flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#005baa] to-[#004a8f] shadow-glass ring-1 ring-white/30">
          {icon}
        </div>
        <div>
          <h3 className="text-base font-black tracking-tight text-ink">{title}</h3>
          {subtitle && <p className="text-xs text-ink-soft">{subtitle}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}
