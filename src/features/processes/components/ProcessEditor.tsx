import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Drawer } from "../../../design-system/components/Drawer";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { StatusChip } from "../../../design-system/components/StatusChip";
import { toast } from "../../../shared/toastStore";
import { toAppError } from "../../../shared/errors";
import { formatDateTime } from "../../../shared/format";
import { locale } from "../../../content/locale/es-BO";
import { useActor, useCapabilities } from "../../access";
import { createProcess, getProcess, saveProcess, transitionProcess } from "../store";
import { ProcessDraftInputSchema } from "../schema";
import {
  EMPLOYMENT_TYPE_LABELS,
  EXPERIENCE_LEVEL_LABELS,
  PROCESS_STATUS_META,
  PUBLICATION_STATUS_META,
  VISIBILITY_LABELS,
  WORK_MODE_LABELS,
} from "../statuses";
import type {
  EmploymentType,
  ExperienceLevel,
  ProcessDraftInput,
  RecruitmentProcess,
  Visibility,
  WorkMode,
} from "../types";
import { Field, NumberInput, SelectInput, TextArea, TextInput } from "./fields";

type SectionKey =
  | "summary"
  | "job"
  | "publication"
  | "assessments"
  | "team"
  | "settings"
  | "history";

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "summary", label: locale.processes.editor.sections.summary },
  { key: "job", label: locale.processes.editor.sections.job },
  { key: "publication", label: locale.processes.editor.sections.publication },
  { key: "assessments", label: locale.processes.editor.sections.assessments },
  { key: "team", label: locale.processes.editor.sections.team },
  { key: "settings", label: locale.processes.editor.sections.settings },
  { key: "history", label: locale.processes.editor.sections.history },
];

function emptyDraft(): ProcessDraftInput {
  return {
    title: "",
    code: "",
    description: "",
    shortDescription: "",
    mission: "",
    area: "",
    department: "",
    businessUnit: "",
    region: "",
    city: "",
    branch: "",
    location: "",
    workMode: "presencial",
    employmentType: "tiempo_completo",
    experienceLevel: "junior",
    vacancies: 1,
    recruiterIds: [],
    hiringManagerIds: [],
    ownerId: "",
    visibility: "interno",
    assessmentIds: [],
    openingDate: null,
    closingDate: null,
    configuration: { headcount: 1, applicationEnabled: true, internalNotes: "", requisitionRef: "" },
    publicContentBlocks: [],
  };
}

function processToDraft(p: RecruitmentProcess): ProcessDraftInput {
  return {
    title: p.title,
    code: p.code,
    description: p.description,
    shortDescription: p.shortDescription,
    mission: p.mission,
    area: p.area,
    department: p.department,
    businessUnit: p.businessUnit,
    region: p.region,
    city: p.city,
    branch: p.branch,
    location: p.location,
    workMode: p.workMode,
    employmentType: p.employmentType,
    experienceLevel: p.experienceLevel,
    vacancies: p.vacancies,
    recruiterIds: p.recruiterIds,
    hiringManagerIds: p.hiringManagerIds,
    ownerId: p.ownerId,
    visibility: p.visibility,
    assessmentIds: p.assessmentIds,
    openingDate: p.openingDate,
    closingDate: p.closingDate,
    configuration: p.configuration,
    publicContentBlocks: p.publicContentBlocks,
  };
}

interface ProcessEditorProps {
  open: boolean;
  mode: "create" | "edit";
  processId?: string | null;
  assessmentOptions?: { id: string; name: string }[];
  onClose: () => void;
  onSaved?: (process: RecruitmentProcess) => void;
}

export function ProcessEditor({
  open,
  mode,
  processId,
  assessmentOptions = [],
  onClose,
  onSaved,
}: ProcessEditorProps) {
  const actor = useActor();
  const caps = useCapabilities();
  const [section, setSection] = useState<SectionKey>("summary");
  const [draft, setDraft] = useState<ProcessDraftInput>(emptyDraft);
  const [loaded, setLoaded] = useState<RecruitmentProcess | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingProcess, setLoadingProcess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSection("summary");
    setErrors({});
    setDirty(false);
    if (mode === "create" || !processId) {
      setDraft(emptyDraft());
      setLoaded(null);
      return;
    }
    setLoadingProcess(true);
    let cancelled = false;
    void getProcess(processId)
      .then((p) => {
        if (cancelled) return;
        if (p) {
          setLoaded(p);
          setDraft(processToDraft(p));
        }
      })
      .catch(() => toast.error("No se pudo cargar el proceso."))
      .finally(() => !cancelled && setLoadingProcess(false));
    return () => {
      cancelled = true;
    };
  }, [open, mode, processId]);

  const patch = (p: Partial<ProcessDraftInput>) => {
    setDraft((d) => ({ ...d, ...p }));
    setDirty(true);
  };

  const validation = useMemo(() => ProcessDraftInputSchema.safeParse(draft), [draft]);

  const requestClose = () => {
    if (dirty) setConfirmClose(true);
    else onClose();
  };

  const runSave = async () => {
    const parsed = ProcessDraftInputSchema.safeParse(draft);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message;
      setErrors(next);
      setSection("summary");
      toast.error("Revisa los campos obligatorios.");
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const result =
        mode === "create" || !loaded
          ? await createProcess(parsed.data, actor)
          : await saveProcess(loaded.id, parsed.data, actor);
      toast.success(mode === "create" ? locale.feedback.processCreated : locale.feedback.processSaved);
      setDirty(false);
      onSaved?.(result);
      onClose();
    } catch (err) {
      toast.error(toAppError(err).message);
    } finally {
      setSaving(false);
    }
  };

  const lifecycle = async (status: RecruitmentProcess["status"], message: string) => {
    if (!loaded) return;
    setSaving(true);
    try {
      await transitionProcess(loaded.id, status, actor);
      toast.success(message);
      onClose();
    } catch (err) {
      toast.error(toAppError(err).message);
    } finally {
      setSaving(false);
    }
  };

  const title = mode === "create" ? locale.processes.editor.newTitle : draft.title || "Editar proceso";

  return (
    <>
      <Drawer
        open={open}
        onRequestClose={requestClose}
        ariaLabel={title}
        widthClass="max-w-4xl"
        title={
          <div className="flex items-center gap-3">
            <span className="truncate">{title}</span>
            {loaded && <StatusChip meta={PROCESS_STATUS_META[loaded.status]} />}
          </div>
        }
        footer={
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs">
              {validation.success ? (
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" /> Listo para guardar
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-400">
                  <AlertCircle className="h-4 w-4" /> {validation.error.issues.length} campo(s) por completar
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={requestClose}
                className="rounded-full px-4 py-2 text-sm font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)] transition-colors hover:text-ink"
              >
                {locale.common.cancel}
              </button>
              <button
                type="button"
                onClick={runSave}
                disabled={saving || !caps.editProcesses}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-5 py-2 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === "create" ? locale.common.saveDraft : locale.common.saveChanges}
              </button>
            </div>
          </div>
        }
      >
        {/* Section tabs */}
        <div className="mb-5 flex flex-wrap gap-1.5">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSection(s.key)}
              aria-current={section === s.key}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                section === s.key
                  ? "bg-[color:var(--fill-2)] text-ink ring-1 ring-[color:var(--hairline)]"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {loadingProcess ? (
          <div className="grid place-items-center py-16 text-ink-soft">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-300" />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {section === "summary" && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextInput
                      label="Nombre del proceso"
                      value={draft.title}
                      onChange={(v) => patch({ title: v })}
                      placeholder="Ej. Oficial de Créditos 2026"
                      required
                      error={errors.title}
                    />
                    <TextInput
                      label="Código"
                      value={draft.code}
                      onChange={(v) => patch({ code: v })}
                      placeholder="Se genera automáticamente"
                      hint="Déjalo vacío para generarlo del nombre."
                    />
                  </div>
                  <TextInput
                    label="Descripción breve"
                    value={draft.shortDescription}
                    onChange={(v) => patch({ shortDescription: v })}
                    placeholder="Resumen de una línea (máx. 280)"
                    error={errors.shortDescription}
                  />
                  <TextArea
                    label="Descripción"
                    value={draft.description}
                    onChange={(v) => patch({ description: v })}
                    rows={4}
                  />
                  <TextArea
                    label="Misión del cargo"
                    value={draft.mission}
                    onChange={(v) => patch({ mission: v })}
                    rows={2}
                  />
                </>
              )}

              {section === "job" && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextInput label="Área" value={draft.area} onChange={(v) => patch({ area: v })} />
                    <TextInput
                      label="Departamento"
                      value={draft.department}
                      onChange={(v) => patch({ department: v })}
                    />
                    <TextInput
                      label="Unidad de negocio"
                      value={draft.businessUnit}
                      onChange={(v) => patch({ businessUnit: v })}
                    />
                    <TextInput label="Región" value={draft.region} onChange={(v) => patch({ region: v })} />
                    <TextInput label="Ciudad" value={draft.city} onChange={(v) => patch({ city: v })} />
                    <TextInput label="Agencia" value={draft.branch} onChange={(v) => patch({ branch: v })} />
                  </div>
                  <TextInput
                    label="Ubicación (para publicación)"
                    value={draft.location}
                    onChange={(v) => patch({ location: v })}
                    placeholder="Ej. Agencia Central · La Paz"
                  />
                  <div className="grid gap-4 sm:grid-cols-3">
                    <SelectInput<WorkMode>
                      label="Modalidad"
                      value={draft.workMode}
                      onChange={(v) => patch({ workMode: v })}
                      options={Object.entries(WORK_MODE_LABELS).map(([value, label]) => ({
                        value: value as WorkMode,
                        label,
                      }))}
                    />
                    <SelectInput<EmploymentType>
                      label="Tipo de contrato"
                      value={draft.employmentType}
                      onChange={(v) => patch({ employmentType: v })}
                      options={Object.entries(EMPLOYMENT_TYPE_LABELS).map(([value, label]) => ({
                        value: value as EmploymentType,
                        label,
                      }))}
                    />
                    <SelectInput<ExperienceLevel>
                      label="Nivel de experiencia"
                      value={draft.experienceLevel}
                      onChange={(v) => patch({ experienceLevel: v })}
                      options={Object.entries(EXPERIENCE_LEVEL_LABELS).map(([value, label]) => ({
                        value: value as ExperienceLevel,
                        label,
                      }))}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <NumberInput
                      label="Vacantes"
                      value={draft.vacancies}
                      min={0}
                      onChange={(v) => patch({ vacancies: v, configuration: { ...draft.configuration, headcount: v } })}
                    />
                    <NumberInput
                      label="Salario mínimo (Bs)"
                      value={draft.configuration.salaryMin ?? 0}
                      min={0}
                      onChange={(v) =>
                        patch({ configuration: { ...draft.configuration, salaryMin: v || null } })
                      }
                    />
                    <NumberInput
                      label="Salario máximo (Bs)"
                      value={draft.configuration.salaryMax ?? 0}
                      min={0}
                      onChange={(v) =>
                        patch({ configuration: { ...draft.configuration, salaryMax: v || null } })
                      }
                    />
                  </div>
                </>
              )}

              {section === "publication" && (
                <>
                  <SelectInput<Visibility>
                    label="Visibilidad"
                    value={draft.visibility}
                    onChange={(v) => patch({ visibility: v })}
                    options={Object.entries(VISIBILITY_LABELS).map(([value, label]) => ({
                      value: value as Visibility,
                      label,
                    }))}
                    hint="Interno: solo colaboradores. Externo: portal público de candidatos."
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Fecha de apertura" htmlFor="proc-open">
                      <input
                        id="proc-open"
                        type="date"
                        value={draft.openingDate ? draft.openingDate.slice(0, 10) : ""}
                        onChange={(e) =>
                          patch({ openingDate: e.target.value ? new Date(e.target.value).toISOString() : null })
                        }
                        className="w-full rounded-xl fill-soft px-3 py-2 text-sm text-ink outline-none ring-1 ring-[color:var(--hairline)] focus:ring-2 focus:ring-cyan-300"
                      />
                    </Field>
                    <Field label="Fecha de cierre" htmlFor="proc-close">
                      <input
                        id="proc-close"
                        type="date"
                        value={draft.closingDate ? draft.closingDate.slice(0, 10) : ""}
                        onChange={(e) =>
                          patch({ closingDate: e.target.value ? new Date(e.target.value).toISOString() : null })
                        }
                        className="w-full rounded-xl fill-soft px-3 py-2 text-sm text-ink outline-none ring-1 ring-[color:var(--hairline)] focus:ring-2 focus:ring-cyan-300"
                      />
                    </Field>
                  </div>

                  {loaded && (
                    <div className="rounded-2xl fill-soft p-4 ring-1 ring-[color:var(--hairline)]">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                          {locale.processes.columns.publication}
                        </span>
                        <StatusChip meta={PUBLICATION_STATUS_META[loaded.publicationStatus]} />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={!caps.publishProcesses || saving}
                          onClick={() => lifecycle("publicado", locale.feedback.processPublished)}
                          className="rounded-full bg-emerald-500/90 px-4 py-1.5 text-xs font-bold text-white ring-1 ring-white/30 transition-colors hover:bg-emerald-500 disabled:opacity-40"
                        >
                          {locale.common.publish}
                        </button>
                        <button
                          type="button"
                          disabled={!caps.publishProcesses || saving}
                          onClick={() => lifecycle("pausado", locale.feedback.processPaused)}
                          className="rounded-full bg-orange-500/90 px-4 py-1.5 text-xs font-bold text-white ring-1 ring-white/30 transition-colors hover:bg-orange-500 disabled:opacity-40"
                        >
                          {locale.common.pause}
                        </button>
                        <button
                          type="button"
                          disabled={!caps.closeProcesses || saving}
                          onClick={() => lifecycle("cerrado", locale.feedback.processClosed)}
                          className="rounded-full bg-rose-500/90 px-4 py-1.5 text-xs font-bold text-white ring-1 ring-white/30 transition-colors hover:bg-rose-500 disabled:opacity-40"
                        >
                          {locale.common.close} proceso
                        </button>
                        <button
                          type="button"
                          disabled={!caps.archiveProcesses || saving}
                          onClick={() => lifecycle("archivado", locale.feedback.processArchived)}
                          className="rounded-full fill-softer px-4 py-1.5 text-xs font-bold text-ink ring-1 ring-[color:var(--hairline)] transition-colors hover:text-ink disabled:opacity-40"
                        >
                          {locale.common.archive}
                        </button>
                      </div>
                      <p className="mt-3 text-[0.7rem] text-ink-faint">
                        Cerrar la publicación nunca elimina el proceso: solo cambia su estado público.
                      </p>
                    </div>
                  )}
                </>
              )}

              {section === "assessments" && (
                <AssessmentLinker
                  options={assessmentOptions}
                  selected={draft.assessmentIds}
                  onChange={(ids) => patch({ assessmentIds: ids })}
                />
              )}

              {section === "team" && (
                <>
                  <TextInput
                    label="Responsable (owner)"
                    value={draft.ownerId}
                    onChange={(v) => patch({ ownerId: v })}
                    placeholder="Nombre del responsable del proceso"
                  />
                  <TagListField
                    label="Reclutadores"
                    values={draft.recruiterIds}
                    onChange={(vals) => patch({ recruiterIds: vals })}
                    placeholder="Agrega un reclutador y presiona Enter"
                  />
                  <TagListField
                    label="Jefaturas solicitantes"
                    values={draft.hiringManagerIds}
                    onChange={(vals) => patch({ hiringManagerIds: vals })}
                    placeholder="Agrega una jefatura y presiona Enter"
                  />
                </>
              )}

              {section === "settings" && (
                <>
                  <label className="flex items-center gap-3 rounded-2xl fill-soft p-4 ring-1 ring-[color:var(--hairline)]">
                    <input
                      type="checkbox"
                      checked={draft.configuration.applicationEnabled}
                      onChange={(e) =>
                        patch({
                          configuration: { ...draft.configuration, applicationEnabled: e.target.checked },
                        })
                      }
                      className="h-4 w-4 accent-cyan-500"
                    />
                    <span className="text-sm text-ink">Formulario de postulación habilitado</span>
                  </label>
                  <TextInput
                    label="Referencia de requisición"
                    value={draft.configuration.requisitionRef ?? ""}
                    onChange={(v) => patch({ configuration: { ...draft.configuration, requisitionRef: v } })}
                  />
                  <TextArea
                    label="Notas internas (no se publican)"
                    value={draft.configuration.internalNotes ?? ""}
                    onChange={(v) => patch({ configuration: { ...draft.configuration, internalNotes: v } })}
                    rows={3}
                  />
                </>
              )}

              {section === "history" && (
                <div className="space-y-2">
                  {loaded && loaded.auditTrail.length > 0 ? (
                    [...loaded.auditTrail].reverse().map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-start gap-3 rounded-2xl fill-soft px-4 py-3 ring-1 ring-[color:var(--hairline)]"
                      >
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-cyan-400" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink">{entry.summary}</p>
                          <p className="text-[0.7rem] text-ink-faint">
                            {entry.actorName || entry.actorId} · {formatDateTime(entry.timestamp)}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-ink-soft">Aún no hay eventos registrados.</p>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmClose}
        title="Cambios sin guardar"
        message="Tienes cambios sin guardar. ¿Deseas descartarlos y cerrar?"
        confirmLabel="Descartar"
        cancelLabel="Seguir editando"
        onConfirm={() => {
          setConfirmClose(false);
          setDirty(false);
          onClose();
        }}
        onCancel={() => setConfirmClose(false)}
      />
    </>
  );
}

/* ---- small inline helpers ---------------------------------------- */

function AssessmentLinker({
  options,
  selected,
  onChange,
}: {
  options: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  if (options.length === 0) {
    return (
      <p className="rounded-2xl fill-soft p-4 text-sm text-ink-soft ring-1 ring-[color:var(--hairline)]">
        Aún no hay evaluaciones disponibles. Crea una en el módulo <strong>Evaluaciones</strong> y vuelve
        aquí para vincularla a este proceso.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-soft">Selecciona las evaluaciones asignadas a este proceso.</p>
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <label
            key={o.id}
            className="flex items-center gap-3 rounded-2xl fill-soft px-4 py-3 ring-1 ring-[color:var(--hairline)]"
          >
            <input type="checkbox" checked={on} onChange={() => toggle(o.id)} className="h-4 w-4 accent-cyan-500" />
            <span className="text-sm text-ink">{o.name}</span>
          </label>
        );
      })}
    </div>
  );
}

function TagListField({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const add = () => {
    const v = text.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setText("");
  };
  return (
    <Field label={label}>
      <div className="flex flex-wrap gap-2 rounded-xl fill-soft p-2 ring-1 ring-[color:var(--hairline)]">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full bg-[color:var(--fill-2)] px-2.5 py-1 text-xs text-ink"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              aria-label={`Quitar ${v}`}
              className="text-ink-faint hover:text-rose-400"
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-sm text-ink outline-none placeholder:text-ink-faint"
        />
      </div>
    </Field>
  );
}
