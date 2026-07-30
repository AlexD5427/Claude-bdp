import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  FileText, Briefcase, Globe, ClipboardList, Users, Mail, Settings2, BarChart3, History, Layout,
  Save, Send, Copy, PauseCircle, XCircle, Archive, AlertTriangle,
} from "lucide-react";
import { L, formatDateTime } from "../../../content/locale";
import { GlassDrawer } from "../../../design-system/liquid-glass/GlassDrawer";
import { GlassDialog } from "../../../design-system/liquid-glass/GlassDialog";
import { StatusPill } from "../../../design-system/liquid-glass/StatusPill";
import { Field, TextInput, TextArea, Select, NumberField, Switch } from "../../../design-system/liquid-glass/fields";
import { toast } from "../../../design-system/liquid-glass/toast";
import { useUnsavedChangesWarning } from "../../../shared/hooks";
import { useAuditTrail } from "../../shared/auditTrail";
import {
  WORK_MODE_LABELS, EMPLOYMENT_TYPE_LABELS, EXPERIENCE_LEVEL_LABELS, VISIBILITY_LABELS, toOptions,
} from "../domain/enums";
import { PROCESS_STATUS_META, PUBLICATION_STATUS_META } from "../domain/status";
import type { RecruitmentProcess, PublicContentBlock } from "../domain";
import type { LinkableAssessment } from "../../evaluaciones";
import { PublicContentEditor } from "./PublicContentEditor";
import type { TalentPermissions } from "../../shared/permissions";

type SectionKey =
  | "summary" | "job" | "publication" | "applicationForm" | "assessments"
  | "team" | "communications" | "configuration" | "reports" | "history";

const SECTIONS: { key: SectionKey; label: string; icon: React.ReactNode }[] = [
  { key: "summary", label: L.processes.editor.sections.summary, icon: <FileText className="h-4 w-4" /> },
  { key: "job", label: L.processes.editor.sections.job, icon: <Briefcase className="h-4 w-4" /> },
  { key: "publication", label: L.processes.editor.sections.publication, icon: <Globe className="h-4 w-4" /> },
  { key: "applicationForm", label: L.processes.editor.sections.applicationForm, icon: <Layout className="h-4 w-4" /> },
  { key: "assessments", label: L.processes.editor.sections.assessments, icon: <ClipboardList className="h-4 w-4" /> },
  { key: "team", label: L.processes.editor.sections.team, icon: <Users className="h-4 w-4" /> },
  { key: "communications", label: L.processes.editor.sections.communications, icon: <Mail className="h-4 w-4" /> },
  { key: "configuration", label: L.processes.editor.sections.configuration, icon: <Settings2 className="h-4 w-4" /> },
  { key: "reports", label: L.processes.editor.sections.reports, icon: <BarChart3 className="h-4 w-4" /> },
  { key: "history", label: L.processes.editor.sections.history, icon: <History className="h-4 w-4" /> },
];

interface EditorProps {
  process: RecruitmentProcess;
  assessments: LinkableAssessment[];
  permissions: TalentPermissions;
  onClose: () => void;
  onSave: (next: RecruitmentProcess) => Promise<void>;
  onTransition: (action: "publish" | "pause" | "close" | "archive" | "duplicate") => Promise<void>;
}

/** The full ProcessOS editor drawer with all ten sections. */
export function ProcessEditor({ process, assessments, permissions, onClose, onSave, onTransition }: EditorProps) {
  const [draft, setDraft] = useState<RecruitmentProcess>(process);
  const [section, setSection] = useState<SectionKey>("summary");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<null | "publish" | "pause" | "close" | "archive">(null);
  const audit = useAuditTrail(process.id);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(process), [draft, process]);
  useUnsavedChangesWarning(dirty);

  const patch = (p: Partial<RecruitmentProcess>) => setDraft((d) => ({ ...d, ...p }));

  const errors = useMemo(() => {
    const e: string[] = [];
    if (!draft.title.trim()) e.push("El título es obligatorio.");
    if (draft.vacancies < 0) e.push("Las vacantes no pueden ser negativas.");
    if (draft.openingDate && draft.closingDate && new Date(draft.closingDate) < new Date(draft.openingDate))
      e.push("La fecha de cierre no puede ser anterior a la de apertura.");
    return e;
  }, [draft]);

  const handleSave = async () => {
    if (errors.length) {
      toast.warning(L.common.validationSummary);
      return;
    }
    setSaving(true);
    await onSave(draft);
    setSaving(false);
  };

  const requestClose = () => {
    if (dirty && !window.confirm(L.common.unsavedLeave)) return;
    onClose();
  };

  return (
    <GlassDrawer
      open
      onClose={requestClose}
      widthClass="max-w-3xl"
      ariaLabel={L.processes.editor.editTitle}
      title={
        <div className="flex min-w-0 items-center gap-3">
          <span className="truncate">{draft.title || L.processes.editor.newTitle}</span>
          <StatusPill intent={PROCESS_STATUS_META[draft.processStatus].intent}>
            {PROCESS_STATUS_META[draft.processStatus].label}
          </StatusPill>
        </div>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {permissions.publish && (
              <button type="button" onClick={() => setConfirm("publish")} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/25">
                <Send className="h-3.5 w-3.5" /> {L.common.publish}
              </button>
            )}
            {permissions.edit && (
              <button type="button" onClick={() => setConfirm("pause")} className="inline-flex items-center gap-1.5 rounded-full fill-softer px-3 py-1.5 text-xs font-semibold text-ink ring-1 ring-[color:var(--hairline)] hover:fill-soft">
                <PauseCircle className="h-3.5 w-3.5" /> {L.common.pause}
              </button>
            )}
            {permissions.close && (
              <button type="button" onClick={() => setConfirm("close")} className="inline-flex items-center gap-1.5 rounded-full fill-softer px-3 py-1.5 text-xs font-semibold text-ink ring-1 ring-[color:var(--hairline)] hover:fill-soft">
                <XCircle className="h-3.5 w-3.5" /> {L.common.close}
              </button>
            )}
            {permissions.archive && (
              <button type="button" onClick={() => setConfirm("archive")} className="inline-flex items-center gap-1.5 rounded-full fill-softer px-3 py-1.5 text-xs font-semibold text-ink ring-1 ring-[color:var(--hairline)] hover:fill-soft">
                <Archive className="h-3.5 w-3.5" /> {L.common.archive}
              </button>
            )}
            {permissions.create && (
              <button type="button" onClick={() => onTransition("duplicate")} className="inline-flex items-center gap-1.5 rounded-full fill-softer px-3 py-1.5 text-xs font-semibold text-ink ring-1 ring-[color:var(--hairline)] hover:fill-soft">
                <Copy className="h-3.5 w-3.5" /> {L.common.duplicate}
              </button>
            )}
          </div>
          {permissions.edit && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-5 py-2 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {saving ? L.common.saving : L.common.save}
            </button>
          )}
        </div>
      }
    >
      {/* Section nav */}
      <nav aria-label="Secciones" className="mb-4 flex flex-wrap gap-1.5">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-current={section === s.key}
            onClick={() => setSection(s.key)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-colors ${
              section === s.key
                ? "bg-cyan-500/20 text-cyan-100 ring-cyan-400/40"
                : "fill-soft text-ink-soft ring-[color:var(--hairline)] hover:text-ink"
            }`}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </nav>

      {dirty && (
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5" /> {L.common.unsavedChanges}
        </p>
      )}
      {errors.length > 0 && (
        <div role="alert" className="mb-3 rounded-2xl bg-rose-500/10 p-3 text-xs text-rose-200 ring-1 ring-rose-400/30">
          <p className="font-bold">{L.common.validationSummary}</p>
          <ul className="mt-1 list-inside list-disc">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={section}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col gap-4"
        >
          {section === "summary" && <SummarySection draft={draft} patch={patch} />}
          {section === "job" && <JobSection draft={draft} patch={patch} />}
          {section === "publication" && <PublicationSection draft={draft} patch={patch} />}
          {section === "applicationForm" && <ApplicationFormSection />}
          {section === "assessments" && <AssessmentsSection draft={draft} patch={patch} assessments={assessments} />}
          {section === "team" && <TeamSection draft={draft} patch={patch} />}
          {section === "communications" && <CommunicationsSection />}
          {section === "configuration" && <ConfigurationSection draft={draft} patch={patch} />}
          {section === "reports" && <ReportsSection />}
          {section === "history" && <HistorySection audit={audit} draft={draft} />}
        </motion.div>
      </AnimatePresence>

      <GlassDialog
        open={confirm !== null}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          const action = confirm!;
          setConfirm(null);
          await onTransition(action);
        }}
        title={
          confirm === "publish" ? "¿Publicar este proceso?"
          : confirm === "pause" ? "¿Pausar este proceso?"
          : confirm === "close" ? "¿Cerrar este proceso?"
          : "¿Archivar este proceso?"
        }
        description={
          confirm === "publish"
            ? "El proceso quedará visible según su configuración de visibilidad."
            : "Podrás reactivarlo más adelante desde la lista."
        }
        confirmLabel={confirm === "publish" ? L.common.publish : L.common.confirm}
        destructive={confirm === "close" || confirm === "archive"}
        intent={confirm === "publish" ? "success" : "accent"}
      />
    </GlassDrawer>
  );
}

/* -------------------------------- Sections -------------------------------- */

function SummarySection({ draft, patch }: { draft: RecruitmentProcess; patch: (p: Partial<RecruitmentProcess>) => void }) {
  return (
    <>
      <Field label={L.processes.fields.title} required>
        <TextInput value={draft.title} onChange={(e) => patch({ title: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={L.processes.fields.code}>
          <TextInput value={draft.code} onChange={(e) => patch({ code: e.target.value })} />
        </Field>
        <Field label={L.processes.fields.externalReference}>
          <TextInput value={draft.externalReference} onChange={(e) => patch({ externalReference: e.target.value })} />
        </Field>
      </div>
      <Field label={L.processes.fields.description} hint="Resumen interno del proceso.">
        <TextArea value={draft.description} onChange={(e) => patch({ description: e.target.value })} />
      </Field>
    </>
  );
}

function JobSection({ draft, patch }: { draft: RecruitmentProcess; patch: (p: Partial<RecruitmentProcess>) => void }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label={L.processes.fields.area}><TextInput value={draft.area} onChange={(e) => patch({ area: e.target.value })} /></Field>
        <Field label={L.processes.fields.department}><TextInput value={draft.department} onChange={(e) => patch({ department: e.target.value })} /></Field>
        <Field label={L.processes.fields.businessUnit}><TextInput value={draft.businessUnit} onChange={(e) => patch({ businessUnit: e.target.value })} /></Field>
        <Field label={L.processes.fields.location}><TextInput value={draft.location} onChange={(e) => patch({ location: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={L.processes.fields.workMode}>
          <Select value={draft.workMode} onChange={(e) => patch({ workMode: e.target.value as RecruitmentProcess["workMode"] })}>
            {toOptions(WORK_MODE_LABELS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        <Field label={L.processes.fields.employmentType}>
          <Select value={draft.employmentType} onChange={(e) => patch({ employmentType: e.target.value as RecruitmentProcess["employmentType"] })}>
            {toOptions(EMPLOYMENT_TYPE_LABELS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        <Field label={L.processes.fields.experienceLevel}>
          <Select value={draft.experienceLevel} onChange={(e) => patch({ experienceLevel: e.target.value as RecruitmentProcess["experienceLevel"] })}>
            {toOptions(EXPERIENCE_LEVEL_LABELS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        <Field label={L.processes.fields.vacancies}>
          <NumberField value={draft.vacancies} min={0} onChange={(v) => patch({ vacancies: v ?? 0 })} />
        </Field>
      </div>
    </>
  );
}

function PublicationSection({ draft, patch }: { draft: RecruitmentProcess; patch: (p: Partial<RecruitmentProcess>) => void }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label={L.processes.fields.visibility}>
          <Select value={draft.visibility} onChange={(e) => patch({ visibility: e.target.value as RecruitmentProcess["visibility"] })}>
            {toOptions(VISIBILITY_LABELS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        <Field label={L.processes.columns.publication}>
          <div className="pt-2"><StatusPill intent={PUBLICATION_STATUS_META[draft.publicationStatus].intent}>{PUBLICATION_STATUS_META[draft.publicationStatus].label}</StatusPill></div>
        </Field>
        <Field label={L.processes.fields.openingDate}>
          <TextInput type="date" value={(draft.openingDate ?? "").slice(0, 10)} onChange={(e) => patch({ openingDate: e.target.value ? new Date(e.target.value).toISOString() : null })} />
        </Field>
        <Field label={L.processes.fields.closingDate}>
          <TextInput type="date" value={(draft.closingDate ?? "").slice(0, 10)} onChange={(e) => patch({ closingDate: e.target.value ? new Date(e.target.value).toISOString() : null })} />
        </Field>
      </div>
      <div>
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-soft">{L.processes.editor.publicContent}</h4>
        <PublicContentEditor
          blocks={draft.publicContentBlocks as PublicContentBlock[]}
          onChange={(blocks) => patch({ publicContentBlocks: blocks })}
        />
      </div>
    </>
  );
}

function ApplicationFormSection() {
  return (
    <div className="rounded-2xl fill-soft p-4 text-sm text-ink-soft ring-1 ring-[color:var(--hairline)]">
      La configuración del formulario de postulación se conecta con el Portal de Candidatos (pendiente).
      Por ahora se conserva la referencia del formulario asignado.
    </div>
  );
}

function AssessmentsSection({ draft, patch, assessments }: { draft: RecruitmentProcess; patch: (p: Partial<RecruitmentProcess>) => void; assessments: LinkableAssessment[] }) {
  const toggle = (id: string) => {
    const has = draft.assessmentIds.includes(id);
    patch({ assessmentIds: has ? draft.assessmentIds.filter((a) => a !== id) : [...draft.assessmentIds, id] });
  };
  return (
    <div>
      <p className="mb-3 text-sm text-ink-soft">{L.processes.editor.assignAssessments}</p>
      {assessments.length === 0 ? (
        <p className="text-sm text-ink-faint">No hay evaluaciones disponibles todavía.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {assessments.map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-2xl fill-soft px-3 py-2 ring-1 ring-[color:var(--hairline)]">
              <input
                type="checkbox"
                id={`asm-${a.id}`}
                checked={draft.assessmentIds.includes(a.id)}
                onChange={() => toggle(a.id)}
                className="h-4 w-4 accent-cyan-500"
              />
              <label htmlFor={`asm-${a.id}`} className="flex-1 cursor-pointer text-sm font-semibold text-ink">
                {a.name}
                <span className="ml-2 font-mono text-xs text-ink-faint">{a.code}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TeamSection({ draft, patch }: { draft: RecruitmentProcess; patch: (p: Partial<RecruitmentProcess>) => void }) {
  return (
    <>
      <Field label={L.processes.fields.owner}><TextInput value={draft.ownerId} onChange={(e) => patch({ ownerId: e.target.value })} /></Field>
      <Field label={L.processes.fields.recruiters} hint="Separa los nombres con comas.">
        <TextInput value={draft.recruiterIds.join(", ")} onChange={(e) => patch({ recruiterIds: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
      </Field>
      <Field label={L.processes.fields.hiringManagers} hint="Separa los nombres con comas.">
        <TextInput value={draft.hiringManagerIds.join(", ")} onChange={(e) => patch({ hiringManagerIds: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
      </Field>
    </>
  );
}

function CommunicationsSection() {
  return (
    <div className="rounded-2xl fill-soft p-4 text-sm text-ink-soft ring-1 ring-[color:var(--hairline)]">
      Las comunicaciones reutilizan los formatos de correo configurados en Configuración. La automatización por etapa se conecta con el motor de comunicaciones (pendiente).
    </div>
  );
}

function ConfigurationSection({ draft, patch }: { draft: RecruitmentProcess; patch: (p: Partial<RecruitmentProcess>) => void }) {
  const cfg = draft.configuration;
  const setCfg = (p: Partial<typeof cfg>) => patch({ configuration: { ...cfg, ...p } });
  return (
    <div className="flex flex-col gap-3">
      <Switch label="Proceso confidencial" checked={cfg.confidential} onChange={(v) => setCfg({ confidential: v })} />
      <Switch label="Requiere aprobación" checked={cfg.requireApproval} onChange={(v) => setCfg({ requireApproval: v })} />
      <Switch label="Cerrar automáticamente al cubrir vacantes" checked={cfg.autoCloseWhenFilled} onChange={(v) => setCfg({ autoCloseWhenFilled: v })} />
      <Switch label="Notificar a reclutadores por cada postulación" checked={cfg.notifyRecruitersOnApplication} onChange={(v) => setCfg({ notifyRecruitersOnApplication: v })} />
      <Switch label="Permitir referencias" checked={cfg.allowReferrals} onChange={(v) => setCfg({ allowReferrals: v })} />
      <Field label="Notas internas"><TextArea value={cfg.internalNotes} onChange={(e) => setCfg({ internalNotes: e.target.value })} /></Field>
    </div>
  );
}

function ReportsSection() {
  return (
    <div className="rounded-2xl fill-soft p-4 text-sm text-ink-soft ring-1 ring-[color:var(--hairline)]">
      Base para reportes del proceso (tiempo de cobertura, embudo por etapa, fuentes). Se alimentará de los KPIs y la base de contrataciones existentes.
    </div>
  );
}

function HistorySection({ audit, draft }: { audit: ReturnType<typeof useAuditTrail>; draft: RecruitmentProcess }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-2xl fill-soft p-3 ring-1 ring-[color:var(--hairline)]">
          <p className="text-ink-faint">{L.common.createdAt}</p>
          <p className="font-semibold text-ink">{formatDateTime(draft.createdAt)}</p>
          <p className="mt-1 text-ink-faint">{draft.createdBy || L.common.unknownUser}</p>
        </div>
        <div className="rounded-2xl fill-soft p-3 ring-1 ring-[color:var(--hairline)]">
          <p className="text-ink-faint">{L.common.updatedAt}</p>
          <p className="font-semibold text-ink">{formatDateTime(draft.updatedAt)}</p>
          <p className="mt-1 text-ink-faint">v{draft.entityVersion}</p>
        </div>
      </div>
      {audit.length === 0 ? (
        <p className="text-sm text-ink-faint">Aún no hay eventos registrados.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {audit.map((e) => (
            <li key={e.id} className="rounded-2xl fill-soft px-3 py-2 text-sm ring-1 ring-[color:var(--hairline)]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-ink">{e.summary}</span>
                <span className="text-xs text-ink-faint">{formatDateTime(e.at)}</span>
              </div>
              <span className="text-xs text-ink-faint">{e.by || L.common.unknownUser}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
