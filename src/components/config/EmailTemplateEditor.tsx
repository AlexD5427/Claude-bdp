import { useEffect, useMemo, useState } from "react";
import { Mail, Eye, Pencil, Info, Save } from "lucide-react";
import { Modal } from "../Modal";
import { TextField, SelectField } from "../form/Fields";
import { Toggle } from "../form/Controls";
import {
  EMAIL_CATEGORY_LABELS,
  EMAIL_CATEGORY_ORDER,
  EMAIL_PLACEHOLDERS,
  upsertTemplate,
  useConfig,
  type EmailCategory,
  type EmailTemplate,
} from "../../lib/configStore";

/** Turn the labels back into their category keys for the SelectField. */
const LABEL_TO_CATEGORY: Record<string, EmailCategory> = Object.fromEntries(
  EMAIL_CATEGORY_ORDER.map((c) => [EMAIL_CATEGORY_LABELS[c], c]),
) as Record<string, EmailCategory>;

/** Fill placeholders with representative sample data for the live preview. */
function fillPreview(text: string, sample: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => (k in sample ? sample[k] : `{${k}}`));
}

/**
 * A focused editor for a single email format. It edits the name, lifecycle
 * category, active state, subject and body, and offers a live preview rendered
 * with realistic sample data plus a placeholder cheat-sheet.
 */
export function EmailTemplateEditor({
  template,
  open,
  onClose,
}: {
  template: EmailTemplate | null;
  open: boolean;
  onClose: () => void;
}) {
  const config = useConfig();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<EmailCategory>("convocatoria");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [active, setActive] = useState(true);
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  useEffect(() => {
    if (!open || !template) return;
    setName(template.name);
    setCategory(template.category);
    setSubject(template.subject);
    setBody(template.body);
    setActive(template.active);
    setMode("edit");
  }, [open, template]);

  const sample = useMemo<Record<string, string>>(
    () => ({
      nombre: "María López Quispe",
      cargo: "Analista de Créditos",
      area: "Riesgos",
      gerencia: "Gerencia de Negocios",
      proceso: "105",
      reclutador: config.reclutador || "Equipo de Reclutamiento",
      enlace_evaluar: config.evaluarUrl,
      fecha: "15 de julio de 2026",
      fecha_ingreso: "01 de julio de 2026",
      dias: "6",
      faltantes: "• Fotografía 4x4\n• Curriculum Vitae actualizado",
      avance: "60%",
    }),
    [config.reclutador, config.evaluarUrl],
  );

  if (!template) return null;
  const disabled = !name.trim() || !subject.trim();

  function handleSave() {
    if (!template) return;
    upsertTemplate({ ...template, name, category, subject, body, active });
    onClose();
  }

  return (
    <Modal open={open} onRequestClose={onClose} size="max-w-2xl" ariaLabel="Editar formato de correo">
      <div className="flex items-center gap-3 rounded-t-3xl border-b border-[color:var(--hairline)] bg-[color:var(--glass-bg-heavy)] px-5 py-4 backdrop-blur-xl sm:px-7">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#00b0d8] to-[#005baa] shadow-glass ring-1 ring-white/30">
          <Mail className="h-6 w-6 text-white drop-shadow-md" />
        </div>
        <div className="min-w-0 flex-1 pr-10">
          <h2 className="truncate text-lg font-black tracking-tight text-ink sm:text-xl">
            {template.system ? "Formato del sistema" : "Formato de correo"}
          </h2>
          <p className="truncate text-xs text-ink-soft">
            Personalice asunto y cuerpo con variables dinámicas.
          </p>
        </div>
      </div>

      <div className="max-h-[calc(100vh-15rem)] space-y-4 overflow-y-auto px-5 py-5 sm:px-7">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField label="Nombre del formato" value={name} onChange={setName} placeholder="Invitación a evaluación" />
          <SelectField
            label="Etapa"
            value={EMAIL_CATEGORY_LABELS[category]}
            onChange={(v) => setCategory(LABEL_TO_CATEGORY[v] ?? "convocatoria")}
            options={EMAIL_CATEGORY_ORDER.map((c) => EMAIL_CATEGORY_LABELS[c])}
          />
        </div>

        <Toggle
          title="Formato activo"
          subtitle="Disponible para envíos y selección automática por etapa."
          checked={active}
          onChange={setActive}
        />

        {/* Mode switch */}
        <div className="glass inline-flex items-center gap-1 rounded-full p-1 text-xs font-semibold text-ink-soft">
          <button
            type="button"
            onClick={() => setMode("edit")}
            className={[
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-all",
              mode === "edit" ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white" : "hover:fill-soft",
            ].join(" ")}
          >
            <Pencil className="h-3.5 w-3.5" /> Editar
          </button>
          <button
            type="button"
            onClick={() => setMode("preview")}
            className={[
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-all",
              mode === "preview" ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white" : "hover:fill-soft",
            ].join(" ")}
          >
            <Eye className="h-3.5 w-3.5" /> Vista previa
          </button>
        </div>

        {mode === "edit" ? (
          <div className="space-y-3">
            <TextField label="Asunto" value={subject} onChange={setSubject} />
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
                Cuerpo del mensaje
              </span>
              <textarea
                value={body}
                rows={12}
                onChange={(e) => setBody(e.target.value)}
                className="glass w-full resize-y rounded-xl px-3.5 py-2.5 text-sm leading-relaxed text-ink outline-none focus-within:ring-2 focus-within:ring-cyan-400/70"
              />
            </label>
            <div className="flex flex-wrap items-start gap-2 rounded-2xl fill-soft px-4 py-3 text-xs text-ink-soft ring-1 ring-[color:var(--hairline)]">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
              <div>
                <span className="font-semibold text-ink">Variables disponibles:</span>{" "}
                {EMAIL_PLACEHOLDERS.map((p) => (
                  <code key={p} className="mx-0.5 rounded bg-[color:var(--fill-2)] px-1 py-0.5 text-[0.7rem] text-ink">
                    {p}
                  </code>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="glass rounded-2xl p-4">
            <div className="border-b border-[color:var(--hairline)] pb-3 text-sm">
              <span className="font-bold text-ink">Asunto:</span>{" "}
              <span className="text-ink-soft">{fillPreview(subject, sample) || "—"}</span>
            </div>
            <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink-soft">
              {fillPreview(body, sample)}
            </pre>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 rounded-b-3xl border-t border-[color:var(--hairline)] bg-[color:var(--glass-bg-heavy)] px-5 py-4 backdrop-blur-xl sm:px-7">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full fill-softer px-5 py-3 text-sm font-bold text-ink ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-95"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={handleSave}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-6 py-3 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all duration-500 ease-spring hover:-translate-y-1 hover:scale-[1.03] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          Guardar formato
        </button>
      </div>
    </Modal>
  );
}
