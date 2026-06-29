import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { UserPlus, Sparkles, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { GlassCard } from "../components/GlassCard";
import { TextField, SelectField, FormSection } from "../components/form/Fields";
import { CompetencyAutocomplete } from "../components/CompetencyAutocomplete";
import { CompetencyConfigCard } from "../components/CompetencyConfigCard";
import { useTalentData } from "../context/TalentDataContext";
import {
  ESTADO_CIVIL_OPTIONS,
  MAX_COMPETENCIAS,
  NIVEL_ACADEMICO_OPTIONS,
} from "../constants";
import { buildSavedCompetency, parseDecimal } from "../lib/competency";
import type { FormCompetency, RawCandidate } from "../types";

function newUid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type Feedback = { kind: "ok" | "warn"; message: string } | null;

interface RegistrationFormProps {
  onSaved?: () => void;
}

const EMPTY = {
  nombres: "",
  apellido_paterno: "",
  apellido_materno: "",
  identificador: "",
  edad: "",
  departamento_residencia: "",
  localidad_residencia: "",
  estado_civil: "",
  nivel_academico: "",
  carrera: "",
  trabaja_bdp: "",
  cargo_bdp: "",
  observaciones: "",
};

/**
 * MÓDULO 1 — Formulario inteligente de registro de postulantes.
 * Name splitting, an empty identificador with the required placeholder, an
 * Estado Civil dropdown without "Separado/a", and the 0/7 competency builder
 * with live Brecha / Ajuste maths.
 */
export function RegistrationForm({ onSaved }: RegistrationFormProps) {
  const { competencias, submitCandidate } = useTalentData();
  const [form, setForm] = useState({ ...EMPTY });
  const [comps, setComps] = useState<FormCompetency[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const selectedNames = useMemo(() => comps.map((c) => c.name), [comps]);
  const atLimit = comps.length >= MAX_COMPETENCIAS;

  function setField(key: keyof typeof EMPTY, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function addCompetency(name: string) {
    if (atLimit) return;
    setComps((prev) => [
      ...prev,
      { uid: newUid(), name, esperadoText: "", obtenidoText: "" },
    ]);
  }

  function updateCompetency(uid: string, patch: Partial<FormCompetency>) {
    setComps((prev) => prev.map((c) => (c.uid === uid ? { ...c, ...patch } : c)));
  }

  function removeCompetency(uid: string) {
    setComps((prev) => prev.filter((c) => c.uid !== uid));
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

    const savedComps = comps.map((c) =>
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
      departamento_residencia: form.departamento_residencia.trim(),
      localidad_residencia: form.localidad_residencia.trim(),
      estado_civil: form.estado_civil,
      nivel_academico: form.nivel_academico,
      carrera: form.carrera.trim(),
      trabaja_bdp: form.trabaja_bdp,
      cargo_bdp: form.cargo_bdp.trim(),
      observaciones: form.observaciones.trim(),
      competencias: JSON.stringify(savedComps),
    };

    setSubmitting(true);
    setFeedback(null);
    const result = await submitCandidate(candidate);
    setSubmitting(false);
    setFeedback({ kind: result.ok ? "ok" : "warn", message: result.message });
    if (result.ok) {
      setForm({ ...EMPTY });
      setComps([]);
      onSaved?.();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <GlassCard
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
        className="rounded-3xl p-5 sm:p-7"
      >
        <header className="mb-6 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#00b0d8] to-[#005baa] shadow-glass ring-1 ring-white/30">
            <UserPlus className="h-6 w-6 text-white drop-shadow-md" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight text-white drop-shadow-md">
              Registro de Postulante
            </h2>
            <p className="text-sm text-slate-200/70">
              Complete los datos y configure hasta {MAX_COMPETENCIAS} competencias.
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Identidad */}
          <FormSection title="Identidad">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
            </div>
            <TextField
              label="Identificador"
              hint="CI - Nro Proceso - Año"
              value={form.identificador}
              onChange={(v) => setField("identificador", v)}
              placeholder="CI - Nro Proceso - Año"
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            </div>
          </FormSection>

          {/* Perfil */}
          <FormSection title="Perfil y residencia">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField
                label="Departamento"
                value={form.departamento_residencia}
                onChange={(v) => setField("departamento_residencia", v)}
                placeholder="Departamento"
              />
              <TextField
                label="Localidad"
                value={form.localidad_residencia}
                onChange={(v) => setField("localidad_residencia", v)}
                placeholder="Localidad"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <SelectField
                label="Nivel Académico"
                value={form.nivel_academico}
                onChange={(v) => setField("nivel_academico", v)}
                options={NIVEL_ACADEMICO_OPTIONS}
              />
              <TextField
                label="Carrera"
                value={form.carrera}
                onChange={(v) => setField("carrera", v)}
                placeholder="Carrera"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <SelectField
                label="¿Trabaja en BDP?"
                value={form.trabaja_bdp}
                onChange={(v) => setField("trabaja_bdp", v)}
                options={["Sí", "No"]}
              />
              <TextField
                label="Cargo en BDP"
                value={form.cargo_bdp}
                onChange={(v) => setField("cargo_bdp", v)}
                placeholder="Cargo"
              />
            </div>
          </FormSection>
        </div>
      </GlassCard>

      {/* Competencias 0/7 */}
      <GlassCard
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 22, delay: 0.05 }}
        className="rounded-3xl p-5 sm:p-7"
      >
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-[#005baa] to-[#004a8f] shadow-glass ring-1 ring-white/30">
              <Sparkles className="h-5 w-5 text-white drop-shadow-md" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight text-white drop-shadow-md">
                Competencias o Habilidades
              </h3>
              <p className="text-sm text-slate-200/70">
                Seleccione del catálogo y configure los valores.
              </p>
            </div>
          </div>
          <span
            className={[
              "rounded-full px-3 py-1 text-sm font-black ring-1 ring-white/30 shadow-glass",
              atLimit
                ? "bg-gradient-to-br from-amber-400 to-yellow-500 text-white"
                : "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white",
            ].join(" ")}
          >
            {comps.length}/{MAX_COMPETENCIAS}
          </span>
        </header>

        <CompetencyAutocomplete
          options={competencias}
          selected={selectedNames}
          onAdd={addCompetency}
          disabled={atLimit}
        />

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <AnimatePresence mode="popLayout">
            {comps.map((c, i) => (
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

        {comps.length === 0 && (
          <p className="mt-4 rounded-2xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-slate-300/70">
            Aún no se han agregado competencias. Use el buscador para añadir hasta{" "}
            {MAX_COMPETENCIAS}.
          </p>
        )}
      </GlassCard>

      {/* Observaciones + submit */}
      <GlassCard className="rounded-3xl p-5 sm:p-7">
        <TextField
          label="Observaciones"
          value={form.observaciones}
          onChange={(v) => setField("observaciones", v)}
          placeholder="Notas adicionales del postulante"
        />

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <AnimatePresence>
            {feedback && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className={[
                  "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ring-1",
                  feedback.kind === "ok"
                    ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30"
                    : "bg-amber-500/15 text-amber-200 ring-amber-400/30",
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

          <button
            type="submit"
            disabled={submitting}
            className="ml-auto inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-6 py-3 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all duration-500 ease-spring hover:-translate-y-1 hover:scale-[1.03] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Guardando…
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" />
                Registrar Postulante
              </>
            )}
          </button>
        </div>
      </GlassCard>
    </form>
  );
}
