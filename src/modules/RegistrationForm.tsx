import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
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
  Keyboard,
  Pencil,
} from "lucide-react";
import { Modal } from "../components/Modal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { TextField, SelectField, SegmentedField, type SegmentTone } from "../components/form/Fields";
import { TextAutocomplete } from "../components/form/TextAutocomplete";
import { DiscSelect } from "../components/DiscSelect";
import { TagInput } from "../components/form/TagInput";
import { GaugeInput } from "../components/form/GaugeInput";
import { ItemListBuilder } from "../components/form/ItemListBuilder";
import { CompetencyAutocomplete } from "../components/CompetencyAutocomplete";
import { CompetencyConfigCard } from "../components/CompetencyConfigCard";
import { useTalentData } from "../context/TalentDataContext";
import { useFormDraft } from "../hooks/useFormDraft";
import { useAssistedKeyboardGlow } from "../hooks/useAssistedKeyboardGlow";
import { logActivity } from "../lib/profilesStore";
import {
  CONFIABILIDAD_OPTIONS,
  DEPARTAMENTO_OPTIONS,
  ESTADO_CIVIL_OPTIONS,
  MAX_COMPETENCIAS,
  MAX_CONOCIMIENTOS,
  MAX_HERRAMIENTAS,
  NIVEL_ACADEMICO_OPTIONS,
  NIVEL_RIESGO_ETIQUETADO_OPTIONS,
} from "../constants";
import { buildSavedCompetency, parseDecimal } from "../lib/competency";
import { worksAtBdp } from "../lib/candidateDisplay";
import { asText } from "../lib/candidates";
import type { DiscArchetype } from "../lib/disc";
import type { Candidate, FormCompetency, FormItem, RawCandidate } from "../types";

/** Semantic colour for the labelled "Riesgo Bajo/Medio/Alto" options. */
function riesgoTone(opt: string): SegmentTone | undefined {
  const s = opt.toLowerCase();
  if (s.includes("medio")) return "amber";
  if (s.includes("bajo")) return "green";
  if (s.includes("alto")) return "red";
  return undefined;
}

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

type FormKey = keyof FormState;
type ChangedSet = ReadonlySet<FormKey>;

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
const NO_CHANGES: ChangedSet = new Set<FormKey>();

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
  /**
   * When provided, the form runs in EDIT mode for this candidate: it is
   * pre-filled with the candidate's data, the identificador is locked, the
   * modified fields are highlighted and the primary action becomes
   * "Guardar Cambios" (persisting the edit to Google Sheets).
   */
  editing?: Candidate | null;
}

/** Reverse the intake mapping: turn a stored candidate into editable form state. */
function candidateToForm(c: Candidate): FormState {
  const trabaja = worksAtBdp(c.trabaja_bdp)
    ? "Sí"
    : asText(c.trabaja_bdp)
      ? "No"
      : "";
  return {
    identificador: asText(c.identificador),
    nombres: asText(c.nombres),
    apellido_paterno: asText(c.apellido_paterno),
    apellido_materno: asText(c.apellido_materno),
    edad: asText(c.edad),
    departamento_residencia: asText(c.departamento_residencia),
    localidad_residencia: asText(c.localidad_residencia),
    estado_civil: asText(c.estado_civil),
    nivel_academico: asText(c.nivel_academico),
    carrera: asText(c.carrera),
    trabaja_bdp: trabaja,
    cargo_bdp: asText(c.cargo_bdp),
    nota_cap: parseDecimal(c.nota_cap),
    nota_curriculum: parseDecimal(c.nota_curriculum),
    nota_conocimiento: parseDecimal(c.nota_conocimiento),
    nota_competencias: parseDecimal(c.nota_competencias),
    perfil_disc: asText(c.perfil_disc) || "N/A",
    conocimientos: c.conocimientosList.map((it) => ({
      uid: newUid(),
      nombre: it.nombre ?? "",
      nivel: it.nivel ?? "",
      detalle: it.detalle ?? "",
    })),
    herramientas: c.herramientasList.map((it) => ({
      uid: newUid(),
      nombre: it.nombre ?? "",
      nivel: it.nivel ?? "",
      detalle: it.detalle ?? "",
    })),
    competencias: c.competenciasList.map((s) => ({
      uid: newUid(),
      name: s.name,
      esperadoText: s.esperado === null ? "" : String(s.esperado),
      obtenidoText: s.obtenido === null ? "" : String(s.obtenido),
    })),
    nivel_general_confiabilidad: asText(c.nivel_general_confiabilidad),
    nivel_integridad: asText(c.nivel_integridad),
    riesgo_robo: asText(c.riesgo_robo),
    riesgo_mentira: asText(c.riesgo_mentira),
    observaciones: asText(c.observaciones)
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

/**
 * Compare two form states field by field, returning the set of changed keys.
 *
 * Se compara elemento a elemento en lugar de serializar a JSON: esta función se
 * evalúa en cada pulsación de tecla mientras se edita una ficha, y serializar
 * tres listas completas por tecla era una de las razones por las que escribir
 * en el cuestionario se sentía pesado en equipos modestos.
 */
function changedKeys(a: FormState, b: FormState): Set<FormKey> {
  const set = new Set<FormKey>();
  for (const key of Object.keys(a) as FormKey[]) {
    if (!sameValue(a[key], b[key])) set.add(key);
  }
  return set;
}

/** Igualdad superficial que ignora el `uid` volátil de las listas. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => sameRecord(item, b[i]));
  }
  return false;
}

function sameRecord(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ra), ...Object.keys(rb)]);
  keys.delete("uid");
  for (const k of keys) {
    if ((ra[k] ?? "") !== (rb[k] ?? "")) return false;
  }
  return true;
}

/** Human labels for the activity log's change summary. */
const FIELD_LABELS: Partial<Record<FormKey, string>> = {
  nombres: "Nombres",
  apellido_paterno: "Apellido paterno",
  apellido_materno: "Apellido materno",
  edad: "Edad",
  departamento_residencia: "Departamento",
  localidad_residencia: "Localidad",
  estado_civil: "Estado civil",
  nivel_academico: "Nivel académico",
  carrera: "Carrera",
  trabaja_bdp: "Trabaja en BDP",
  cargo_bdp: "Cargo BDP",
  nota_cap: "Nota CAP",
  nota_curriculum: "Nota Currículum",
  nota_conocimiento: "Nota Conocimientos",
  nota_competencias: "Nota Competencias",
  perfil_disc: "Arquetipo DISC",
  conocimientos: "Conocimientos técnicos",
  herramientas: "Herramientas",
  competencias: "Competencias",
  nivel_general_confiabilidad: "Confiabilidad",
  nivel_integridad: "Integridad",
  riesgo_robo: "Riesgo de robo",
  riesgo_mentira: "Riesgo de mentira",
  observaciones: "Observaciones",
};

/**
 * Wraps a field in a breathing amber halo while editing, the moment its value
 * differs from the pristine baseline — so the operator always sees exactly what
 * they changed before saving.
 *
 * ## Un envoltorio que se quedaba, sí o sí
 *
 * Antes esto devolvía `<>{children}</>` cuando no había cambios y un
 * `motion.div` cuando sí los había. Al escribir la primera letra en un campo, el
 * envoltorio cambiaba de tipo y React **desmontaba y volvía a montar el input**:
 * el foco se perdía y el resto de lo que se teclaba no llegaba a ninguna parte.
 * En modo edición sólo se podía escribir una letra por campo.
 *
 * Ahora el envoltorio es siempre el mismo `<div>` y el halo es una clase con
 * transición CSS. Se arregla la pérdida de foco y, de paso, desaparecen los
 * veinticuatro componentes animados que el cuestionario creaba por dibujado.
 */
function EditHL({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl transition-shadow duration-300 ${on ? "edit-hl" : ""}`}>
      {children}
    </div>
  );
}

/**
 * MÓDULO 1 — "Cuestionario de Registro de Postulante".
 *
 * A full applicant-tracking intake form rendered as a guarded modal:
 *   · Personal data, speedometer evaluation dials and a DISC archetype.
 *   · A1 technical knowledge (0/7), A2 tools (0/5), A3 competencies (0/7).
 *   · Reliability scales and comma-separated observation tags.
 *   · Live local autosave + crash recovery, and an exit-confirmation guard.
 *
 * ## Por qué el avance se perdía «solo»
 *
 * El cuestionario era un `<form>` con un botón `type="submit"`. En HTML eso
 * habilita el **envío implícito**: pulsar Intro en cualquier campo de texto —o
 * en un `<select>`, como el de «Nivel…» de A1— envía el formulario como si se
 * hubiera pulsado «Registrar Postulante». Y como el único campo obligatorio es
 * el identificador (que se llena primero), el envío tenía éxito: la ficha se
 * guardaba a medio llenar en la hoja, `resetForm()` vaciaba el formulario y el
 * modal se cerraba. Desde la silla del analista eso es exactamente lo descrito:
 * «llenando conocimientos, de la nada el progreso se borra y se reinicia».
 *
 * Se cierra por tres sitios a la vez:
 *   1. La acción principal es un `<button type="button">`: el formulario ya no
 *      tiene botón de envío, así que no hay envío implícito que provocar.
 *   2. `onKeyDown` en el `<form>` anula la acción por omisión de Intro salvo en
 *      áreas de texto, y `Ctrl/⌘+Intro` queda como atajo explícito de guardado.
 *   3. `onSubmit` siempre llama a `preventDefault()`: si algún navegador
 *      inventara un envío, no llega a la red.
 *
 * En modo edición había un segundo camino de pérdida: el refresco en segundo
 * plano de la base (cada 60 s, y al volver a la pestaña) recreaba el objeto
 * `Candidate`, y el efecto de precarga volvía a escribir el formulario con los
 * datos de la hoja, borrando lo que se estaba escribiendo. Ahora la precarga
 * sólo ocurre cuando cambia **el registro** que se edita, no su identidad de
 * objeto.
 */
export function RegistrationForm({ open, onClose, onSaved, editing }: RegistrationFormProps) {
  const { competencias, arquetipos, auxiliares, submitCandidate, updateCandidate } =
    useTalentData();
  const isEdit = Boolean(editing);
  const [form, setForm] = useState<FormState>({ ...EMPTY });
  const [baseline, setBaseline] = useState<FormState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [assistedNav, setAssistedNav] = useState(false);

  // Pre-fill the form when the modal opens in edit mode, capturing the pristine
  // baseline so we can highlight exactly what the operator changes.
  //
  // La precarga se ancla al identificador del registro y NO al objeto: la base
  // se refresca en segundo plano y cada refresco produce un `Candidate` nuevo
  // con los mismos datos. Con la dependencia en el objeto, ese refresco pisaba
  // lo que el analista llevaba escrito.
  const editingId = editing?.id ?? null;
  const preloadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !editing) {
      preloadedFor.current = null;
      return;
    }
    if (preloadedFor.current === editing.id) return;
    preloadedFor.current = editing.id;
    const filled = candidateToForm(editing);
    setForm(filled);
    setBaseline(filled);
    setFeedback(null);
    // `editingId` entra como dependencia porque es la identidad real del
    // registro; `editing` se lee dentro pero no dispara la precarga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingId]);

  // The set of fields whose value differs from the pristine baseline (edit only).
  //
  // La firma (claves ordenadas) permite memorizar el conjunto: mientras el
  // *listado* de campos modificados no cambie, `changed` conserva su identidad y
  // las secciones memorizadas no se vuelven a dibujar en cada tecla.
  const changedSignature = useMemo(
    () =>
      isEdit && baseline ? [...changedKeys(baseline, form)].sort().join("|") : "",
    [isEdit, baseline, form],
  );
  const changed = useMemo<ChangedSet>(
    () =>
      changedSignature === ""
        ? NO_CHANGES
        : new Set(changedSignature.split("|") as FormKey[]),
    [changedSignature],
  );

  // Refs for keyboard-only navigation: the form scope (for the assisted glow)
  // and the identificador field (auto-focused + selected on open).
  const formRef = useRef<HTMLFormElement>(null);
  const identificadorRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);

  useAssistedKeyboardGlow(formRef, open && assistedNav);

  // On open, the identificador is immediately ready to receive text.
  //
  // El foco llega 260 ms después, cuando el resorte de entrada del modal se
  // asienta. Antes, además, se seleccionaba todo el contenido: si el analista
  // empezaba a escribir antes de ese instante, la siguiente tecla reemplazaba la
  // selección y se perdían las primeras letras del identificador. Ahora el foco
  // sólo se mueve si nadie se ha adelantado.
  useEffect(() => {
    if (!open || isEdit) return; // the identificador is locked while editing
    const t = window.setTimeout(() => {
      const el = identificadorRef.current;
      if (!el || el.value !== "") return;
      const active = document.activeElement;
      if (active && active !== document.body && active !== el) return;
      el.focus();
    }, 260);
    return () => window.clearTimeout(t);
  }, [open, isEdit]);

  const { recoveredDraft, savedAt, clearDraft } = useFormDraft(
    DRAFT_KEY,
    form,
    hasContent,
    !isEdit, // never autosave/recover a draft while editing an existing record
  );
  const [showRecovery, setShowRecovery] = useState(recoveredDraft !== null);

  // "Dirty" means there's something to lose on close: unsaved content when
  // creating, or at least one modified field when editing.
  const dirty = useMemo(
    () => (isEdit ? changed.size > 0 : hasContent(form)),
    [isEdit, changed, form],
  );

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

  const setField = useCallback(<K extends FormKey>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  // ---- competency builder -------------------------------------------------
  const addCompetency = useCallback((name: string) => {
    setForm((f) =>
      f.competencias.length >= MAX_COMPETENCIAS
        ? f
        : {
            ...f,
            competencias: [
              ...f.competencias,
              { uid: newUid(), name, esperadoText: "", obtenidoText: "" },
            ],
          },
    );
  }, []);
  const updateCompetency = useCallback((uid: string, patch: Partial<FormCompetency>) => {
    setForm((f) => ({
      ...f,
      competencias: f.competencias.map((c) => (c.uid === uid ? { ...c, ...patch } : c)),
    }));
  }, []);
  const removeCompetency = useCallback((uid: string) => {
    setForm((f) => ({
      ...f,
      competencias: f.competencias.filter((c) => c.uid !== uid),
    }));
  }, []);

  // ---- generic list builders (conocimientos / herramientas) --------------
  const addItem = useCallback((key: "conocimientos" | "herramientas") => {
    setForm((f) => ({
      ...f,
      [key]: [...f[key], { uid: newUid(), nombre: "", nivel: "", detalle: "" }],
    }));
  }, []);
  const updateItem = useCallback(
    (key: "conocimientos" | "herramientas", uid: string, patch: Partial<FormItem>) => {
      setForm((f) => ({
        ...f,
        [key]: f[key].map((it) => (it.uid === uid ? { ...it, ...patch } : it)),
      }));
    },
    [],
  );
  const removeItem = useCallback((key: "conocimientos" | "herramientas", uid: string) => {
    setForm((f) => ({ ...f, [key]: f[key].filter((it) => it.uid !== uid) }));
  }, []);

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

  /**
   * Guarda la ficha. Se invoca **sólo** desde el botón principal (o desde
   * `Ctrl/⌘+Intro`, que lo pulsa por nosotros): no hay ningún envío de
   * formulario detrás, así que ninguna tecla puede disparar un guardado.
   */
  async function save() {
    if (submitting) return;
    // Only the identificador is mandatory — every other field is optional.
    if (!form.identificador.trim()) {
      setFeedback({
        kind: "warn",
        message: "El Identificador Único es el único campo obligatorio.",
      });
      identificadorRef.current?.focus();
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

    if (isEdit) {
      const result = await updateCandidate(candidate);
      setSubmitting(false);
      setFeedback({ kind: result.ok ? "ok" : "warn", message: result.message });
      if (result.ok) {
        // Record who edited what, and how, in the per-profile activity log.
        const resumen = [...changed]
          .map((k) => FIELD_LABELS[k] ?? String(k))
          .join(", ");
        logActivity({
          modulo: "postulantes",
          accion: "Editó postulante",
          detalle: `${candidate.identificador} · Campos: ${resumen || "sin cambios"}`,
        });
        onSaved?.();
        onClose();
      }
      return;
    }

    const result = await submitCandidate(candidate);
    setSubmitting(false);
    setFeedback({ kind: result.ok ? "ok" : "warn", message: result.message });
    if (result.ok) {
      logActivity({
        modulo: "postulantes",
        accion: "Registró postulante",
        detalle: candidate.identificador ?? "",
      });
      clearDraft();
      resetForm();
      onSaved?.();
      onClose();
    }
  }

  /**
   * Corta la acción por omisión de Intro dentro del cuestionario.
   *
   * Es la segunda barrera contra el envío accidental: aunque el formulario ya no
   * tiene botón de envío, algunos navegadores envían por su cuenta cuando el
   * formulario tiene un único campo. Las áreas de texto conservan el salto de
   * línea y los botones su pulsación; `Ctrl/⌘+Intro` guarda a propósito.
   */
  const onFormKeyDown = useCallback((e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== "Enter") return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      saveRef.current?.click();
      return;
    }
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const tag = target.tagName.toLowerCase();
    if (tag === "textarea" || tag === "button" || tag === "a") return;
    e.preventDefault();
  }, []);

  return (
    <>
      <Modal
        open={open}
        onRequestClose={requestClose}
        ariaLabel={isEdit ? "Editar Postulante" : "Cuestionario de Registro de Postulante"}
      >
        {/*
          `glass-flat` apaga el desenfoque de las superficies internas: el panel
          del modal ya difumina la página que hay detrás, así que volver a
          desenfocar en cada uno de los ~40 campos costaba GPU sin aportar nada
          visible. Es el cambio que más se nota al escribir en equipos modestos.
        */}
        <form
          ref={formRef}
          className="glass-flat"
          // Nunca se envía: el guardado va por el botón. Si un navegador
          // inventara un envío, aquí se queda.
          onSubmit={(e) => e.preventDefault()}
          onKeyDown={onFormKeyDown}
        >
          {/* ---- Sticky header ---- */}
          <div className="sticky top-0 z-20 flex items-center gap-3 rounded-t-3xl border-b border-[color:var(--hairline)] bg-[color:var(--glass-bg-heavy)] px-5 py-4 backdrop-blur-xl sm:px-7">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#00b0d8] to-[#005baa] shadow-glass ring-1 ring-white/30">
              {isEdit ? (
                <Pencil className="h-6 w-6 text-white drop-shadow-md" />
              ) : (
                <UserPlus className="h-6 w-6 text-white drop-shadow-md" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-black tracking-tight text-ink sm:text-xl">
                {isEdit ? "Editar Postulante" : "Cuestionario de Registro de Postulante"}
              </h2>
              <p className="flex items-center gap-1.5 text-xs text-ink-soft">
                {isEdit ? (
                  <>
                    <Sparkles className="h-3 w-3 text-cyan-400" />
                    {changed.size > 0
                      ? `${changed.size} campo(s) modificado(s) · se resaltan en ámbar`
                      : "Modifique los campos necesarios; se resaltarán al cambiar."}
                  </>
                ) : (
                  <>
                    <Save className="h-3 w-3" />
                    {savedAt
                      ? `Borrador guardado localmente · ${new Date(savedAt).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })}`
                      : "El avance se guarda automáticamente en este equipo."}
                  </>
                )}
              </p>
            </div>
            {/* Assisted keyboard navigation switch — sits just left of the ✕. */}
            <button
              type="button"
              role="switch"
              aria-checked={assistedNav}
              onClick={() => setAssistedNav((v) => !v)}
              title="Rodea el campo actual con un glow azul giratorio y centra la selección en pantalla; el campo siguiente y el anterior se marcan con el mismo efecto más tenue."
              className={[
                "mr-11 hidden shrink-0 items-center gap-2 rounded-full px-3 py-2 text-xs font-bold ring-1 transition-all active:scale-95 sm:inline-flex",
                assistedNav
                  ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white ring-white/40 shadow-[0_0_16px_rgba(0,176,216,0.6)]"
                  : "fill-softer text-ink-soft ring-[color:var(--hairline)] hover:fill-soft",
              ].join(" ")}
            >
              <Keyboard className="h-4 w-4" />
              <span className="hidden lg:inline">Navegación por teclado asistida</span>
              <span className="lg:hidden">Nav. asistida</span>
            </button>
          </div>

          <div className="max-h-[calc(100vh-13rem)] space-y-6 overflow-y-auto px-5 py-6 sm:px-7">
            <PersonalSection
              form={form}
              changed={changed}
              isEdit={isEdit}
              setField={setField}
              cargos={auxiliares.cargos_bdp}
              identificadorRef={identificadorRef}
            />

            <ScoresSection
              notaCap={form.nota_cap}
              notaCurriculum={form.nota_curriculum}
              notaConocimiento={form.nota_conocimiento}
              notaCompetencias={form.nota_competencias}
              perfilDisc={form.perfil_disc}
              arquetipos={arquetipos}
              changed={changed}
              setField={setField}
            />

            <SkillsSection
              conocimientos={form.conocimientos}
              herramientas={form.herramientas}
              competencias={form.competencias}
              catalogo={competencias}
              changed={changed}
              compsCount={compsCount}
              onAddItem={addItem}
              onUpdateItem={updateItem}
              onRemoveItem={removeItem}
              onAddCompetency={addCompetency}
              onUpdateCompetency={updateCompetency}
              onRemoveCompetency={removeCompetency}
            />

            <ReliabilitySection
              confiabilidad={form.nivel_general_confiabilidad}
              integridad={form.nivel_integridad}
              riesgoRobo={form.riesgo_robo}
              riesgoMentira={form.riesgo_mentira}
              observaciones={form.observaciones}
              changed={changed}
              setField={setField}
            />
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
                ref={saveRef}
                // A propósito NO es `type="submit"`: sin botón de envío el
                // formulario no puede enviarse al pulsar Intro en un campo.
                type="button"
                onClick={save}
                disabled={submitting || (isEdit && changed.size === 0)}
                title={
                  isEdit
                    ? "Guardar los cambios (Ctrl+Intro)"
                    : "Registrar al postulante (Ctrl+Intro)"
                }
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-6 py-3 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all duration-500 ease-spring hover:-translate-y-1 hover:scale-[1.03] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Guardando…
                  </>
                ) : isEdit ? (
                  <>
                    <Save className="h-4 w-4" />
                    Guardar Cambios
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
        open={open && showRecovery && !isEdit}
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

/* ------------------------------------------------------------------ */
/* Secciones                                                           */
/* ------------------------------------------------------------------ */

/**
 * El cuestionario se divide en cuatro secciones memorizadas.
 *
 * Antes, cada tecla en «Nombres» redibujaba también los cuatro velocímetros
 * (SVG con marcas y aguja), los constructores de listas y hasta siete tarjetas
 * de competencia con su cálculo de ajuste: unas seiscientas comparaciones y
 * varios cientos de nodos por pulsación. Ahora cada sección recibe **sólo sus
 * datos**; con `memo`, escribir en una no toca a las otras tres.
 */

interface SectionProps {
  changed: ChangedSet;
  setField: <K extends FormKey>(key: K, value: FormState[K]) => void;
}

/**
 * Campos que dibuja la sección de datos personales.
 *
 * La comparación de `memo` mira sólo estas claves: así, arrastrar un velocímetro
 * (que produce muchas actualizaciones por segundo) no vuelve a dibujar los
 * catorce campos de texto de esta sección.
 */
const PERSONAL_KEYS = [
  "identificador",
  "nombres",
  "apellido_paterno",
  "apellido_materno",
  "edad",
  "departamento_residencia",
  "localidad_residencia",
  "estado_civil",
  "nivel_academico",
  "carrera",
  "trabaja_bdp",
  "cargo_bdp",
] as const;

const PersonalSection = memo(function PersonalSection({
  form,
  changed,
  isEdit,
  setField,
  cargos,
  identificadorRef,
}: SectionProps & {
  form: FormState;
  isEdit: boolean;
  cargos: string[];
  identificadorRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <Section
      icon={<ClipboardList className="h-5 w-5 text-white drop-shadow-md" />}
      title="Datos Personales"
      subtitle="Identidad y residencia del postulante."
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-2">
          <TextField
            ref={identificadorRef}
            label="Identificador Único"
            required
            hint={
              isEdit
                ? "Clave del registro · no editable"
                : "CI - Nro Proceso - Año · único obligatorio"
            }
            value={form.identificador}
            onChange={(v) => setField("identificador", v)}
            placeholder="CI - Nro Proceso - Año"
            readOnly={isEdit}
          />
        </div>
        <EditHL on={changed.has("edad")}>
          <TextField
            label="Edad"
            type="number"
            value={form.edad}
            onChange={(v) => setField("edad", v)}
            placeholder="Edad"
          />
        </EditHL>
        <EditHL on={changed.has("estado_civil")}>
          <SelectField
            label="Estado Civil"
            value={form.estado_civil}
            onChange={(v) => setField("estado_civil", v)}
            options={ESTADO_CIVIL_OPTIONS}
          />
        </EditHL>
        <EditHL on={changed.has("nombres")}>
          <TextField
            label="Nombres"
            value={form.nombres}
            onChange={(v) => setField("nombres", v)}
            placeholder="Nombres"
          />
        </EditHL>
        <EditHL on={changed.has("apellido_paterno")}>
          <TextField
            label="Apellido Paterno"
            value={form.apellido_paterno}
            onChange={(v) => setField("apellido_paterno", v)}
            placeholder="Apellido Paterno"
          />
        </EditHL>
        <EditHL on={changed.has("apellido_materno")}>
          <TextField
            label="Apellido Materno"
            value={form.apellido_materno}
            onChange={(v) => setField("apellido_materno", v)}
            placeholder="Apellido Materno"
          />
        </EditHL>
        {/* Nivel Académico + Carrera share a paired cell so Carrera
            always sits immediately to the right of Nivel Académico. */}
        <div className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-2">
          <EditHL on={changed.has("nivel_academico")}>
            <SelectField
              label="Nivel Académico"
              value={form.nivel_academico}
              onChange={(v) => setField("nivel_academico", v)}
              options={NIVEL_ACADEMICO_OPTIONS}
            />
          </EditHL>
          <EditHL on={changed.has("carrera")}>
            <TextField
              label="Carrera"
              hint="Formación / profesión"
              value={form.carrera}
              onChange={(v) => setField("carrera", v)}
              placeholder="Ej. Ingeniería Comercial"
            />
          </EditHL>
        </div>
        <EditHL on={changed.has("departamento_residencia")}>
          <SelectField
            label="Departamento de Residencia"
            value={form.departamento_residencia}
            onChange={(v) => setField("departamento_residencia", v)}
            options={DEPARTAMENTO_OPTIONS}
          />
        </EditHL>
        <EditHL on={changed.has("localidad_residencia")}>
          <TextField
            label="Localidad de Residencia"
            value={form.localidad_residencia}
            onChange={(v) => setField("localidad_residencia", v)}
            placeholder="Localidad"
          />
        </EditHL>
        <div className="sm:col-span-2">
          <EditHL on={changed.has("trabaja_bdp")}>
            <SegmentedField
              label="¿El postulante trabaja actualmente en BDP?"
              value={form.trabaja_bdp}
              onChange={(v) => setField("trabaja_bdp", v)}
              options={["No", "Sí"]}
            />
          </EditHL>
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
              <EditHL on={changed.has("cargo_bdp")}>
                <TextAutocomplete
                  label="Cargo actual del Postulante"
                  hint="Sugerencias en vivo de cargos_bdp · admite texto libre"
                  value={form.cargo_bdp}
                  onChange={(v) => setField("cargo_bdp", v)}
                  options={cargos}
                  placeholder="Escriba para buscar el cargo…"
                />
              </EditHL>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Section>
  );
},
(prev, next) =>
  prev.changed === next.changed &&
  prev.isEdit === next.isEdit &&
  prev.cargos === next.cargos &&
  prev.setField === next.setField &&
  PERSONAL_KEYS.every((k) => prev.form[k] === next.form[k]));

const ScoresSection = memo(function ScoresSection({
  notaCap,
  notaCurriculum,
  notaConocimiento,
  notaCompetencias,
  perfilDisc,
  arquetipos,
  changed,
  setField,
}: SectionProps & {
  notaCap: number | null;
  notaCurriculum: number | null;
  notaConocimiento: number | null;
  notaCompetencias: number | null;
  perfilDisc: string;
  arquetipos: DiscArchetype[];
}) {
  return (
    <Section
      icon={<Gauge className="h-5 w-5 text-white drop-shadow-md" />}
      title="Resultados de Evaluación"
      subtitle="Use los deslizadores de velocímetro o haga clic en el número del centro para ingreso manual (0 % a 100 %)."
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <EditHL on={changed.has("nota_cap")}>
          <GaugeInput
            label="Nota CAP"
            hint="Adecuación al puesto"
            value={notaCap}
            onChange={(v) => setField("nota_cap", v)}
          />
        </EditHL>
        <EditHL on={changed.has("nota_curriculum")}>
          <GaugeInput
            label="Nota Currículum"
            hint="Hoja de vida"
            value={notaCurriculum}
            onChange={(v) => setField("nota_curriculum", v)}
          />
        </EditHL>
        <EditHL on={changed.has("nota_conocimiento")}>
          <GaugeInput
            label="Nota Conocimientos"
            hint="Evaluación técnica"
            value={notaConocimiento}
            onChange={(v) => setField("nota_conocimiento", v)}
          />
        </EditHL>
        <EditHL on={changed.has("nota_competencias")}>
          <GaugeInput
            label="Nota Competencias"
            hint="Nivel general"
            value={notaCompetencias}
            onChange={(v) => setField("nota_competencias", v)}
          />
        </EditHL>
      </div>
      <div className="mt-4 max-w-md">
        <EditHL on={changed.has("perfil_disc")}>
          <DiscSelect
            label="Arquetipo DISC"
            hint="Arquetipo de comportamiento"
            value={perfilDisc}
            onChange={(v) => setField("perfil_disc", v)}
            archetypes={arquetipos}
          />
        </EditHL>
      </div>
    </Section>
  );
});

const SkillsSection = memo(function SkillsSection({
  conocimientos,
  herramientas,
  competencias,
  catalogo,
  changed,
  compsCount,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onAddCompetency,
  onUpdateCompetency,
  onRemoveCompetency,
}: {
  conocimientos: FormItem[];
  herramientas: FormItem[];
  competencias: FormCompetency[];
  /** Catálogo de competencias de la hoja (filas "Nombre,Bajo,Medio,Alto,…"). */
  catalogo: string[];
  changed: ChangedSet;
  compsCount: number;
  onAddItem: (key: "conocimientos" | "herramientas") => void;
  onUpdateItem: (
    key: "conocimientos" | "herramientas",
    uid: string,
    patch: Partial<FormItem>,
  ) => void;
  onRemoveItem: (key: "conocimientos" | "herramientas", uid: string) => void;
  onAddCompetency: (name: string) => void;
  onUpdateCompetency: (uid: string, patch: Partial<FormCompetency>) => void;
  onRemoveCompetency: (uid: string) => void;
}) {
  const atCompLimit = compsCount >= MAX_COMPETENCIAS;
  const selectedComps = useMemo(() => competencias.map((c) => c.name), [competencias]);

  return (
    <Section
      icon={<Sparkles className="h-5 w-5 text-white drop-shadow-md" />}
      title="A · Conocimientos, Herramientas y Competencias"
    >
      <div className="space-y-4">
        <EditHL on={changed.has("conocimientos")}>
          <ItemListBuilder
            title="A1. Conocimientos Técnicos"
            items={conocimientos}
            max={MAX_CONOCIMIENTOS}
            addLabel="Agregar"
            namePlaceholder="Nombre del Conocimiento Técnico"
            withDetalle
            emptyHint="No se agregaron conocimientos técnicos aún."
            onAdd={() => onAddItem("conocimientos")}
            onChange={(uid, patch) => onUpdateItem("conocimientos", uid, patch)}
            onRemove={(uid) => onRemoveItem("conocimientos", uid)}
          />
        </EditHL>
        <EditHL on={changed.has("herramientas")}>
          <ItemListBuilder
            title="A2. Manejo de Herramientas u otros"
            items={herramientas}
            max={MAX_HERRAMIENTAS}
            addLabel="Agregar"
            emptyHint="No se agregaron herramientas aún."
            onAdd={() => onAddItem("herramientas")}
            onChange={(uid, patch) => onUpdateItem("herramientas", uid, patch)}
            onRemove={(uid) => onRemoveItem("herramientas", uid)}
          />
        </EditHL>

        {/* A3 — Competencias o Habilidades */}
        <div
          className={[
            "rounded-2xl fill-soft p-4 ring-1 ring-[color:var(--hairline)]",
            changed.has("competencias")
              ? "ring-2 ring-amber-400/70 shadow-[0_0_18px_rgba(251,191,36,0.35)]"
              : "",
          ].join(" ")}
        >
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
            <motion.span
              key={compsCount}
              initial={{ scale: 0.82, opacity: 0.5 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 24 }}
              className={[
                "rounded-full px-3 py-1 text-xs font-black ring-1 ring-white/30 shadow-glass",
                atCompLimit
                  ? "bg-gradient-to-br from-amber-400 to-yellow-500 text-white"
                  : "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white",
              ].join(" ")}
            >
              {compsCount}/{MAX_COMPETENCIAS}
            </motion.span>
          </header>

          <CompetencyAutocomplete
            options={catalogo}
            selected={selectedComps}
            onAdd={onAddCompetency}
            disabled={atCompLimit}
          />

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <AnimatePresence initial={false}>
              {competencias.map((c, i) => (
                <CompetencyConfigCard
                  key={c.uid}
                  competency={c}
                  index={i}
                  catalogo={catalogo}
                  onChange={onUpdateCompetency}
                  onRemove={onRemoveCompetency}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </Section>
  );
});

const ReliabilitySection = memo(function ReliabilitySection({
  confiabilidad,
  integridad,
  riesgoRobo,
  riesgoMentira,
  observaciones,
  changed,
  setField,
}: SectionProps & {
  confiabilidad: string;
  integridad: string;
  riesgoRobo: string;
  riesgoMentira: string;
  observaciones: string[];
}) {
  return (
    <Section
      icon={<ShieldCheck className="h-5 w-5 text-white drop-shadow-md" />}
      title="B · Confiabilidad del Postulante"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <EditHL on={changed.has("nivel_general_confiabilidad")}>
          <SegmentedField
            label="Confiabilidad e Integridad"
            value={confiabilidad}
            onChange={(v) => setField("nivel_general_confiabilidad", v)}
            options={CONFIABILIDAD_OPTIONS}
          />
        </EditHL>
        <EditHL on={changed.has("nivel_integridad")}>
          <SegmentedField
            label="Nivel de Integridad"
            value={integridad}
            onChange={(v) => setField("nivel_integridad", v)}
            options={NIVEL_RIESGO_ETIQUETADO_OPTIONS}
            toneFor={riesgoTone}
          />
        </EditHL>
        <EditHL on={changed.has("riesgo_robo")}>
          <SegmentedField
            label="Nivel de Robo (Riesgo)"
            value={riesgoRobo}
            onChange={(v) => setField("riesgo_robo", v)}
            options={NIVEL_RIESGO_ETIQUETADO_OPTIONS}
            toneFor={riesgoTone}
          />
        </EditHL>
        <EditHL on={changed.has("riesgo_mentira")}>
          <SegmentedField
            label="Nivel de Mentira (Riesgo)"
            value={riesgoMentira}
            onChange={(v) => setField("riesgo_mentira", v)}
            options={NIVEL_RIESGO_ETIQUETADO_OPTIONS}
            toneFor={riesgoTone}
          />
        </EditHL>
      </div>
      <div className="mt-4">
        <EditHL on={changed.has("observaciones")}>
          <TagInput
            label="Observaciones"
            hint="Separe por comas para generar etiquetas"
            tags={observaciones}
            onChange={(t) => setField("observaciones", t)}
            placeholder="Escriba una observación y pulse Enter o coma…"
          />
        </EditHL>
      </div>
    </Section>
  );
});

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
