import { useEffect, useMemo, useState } from "react";
import { Modal } from "../Modal";
import {
  Mail,
  Send,
  Eye,
  Pencil,
  Paperclip,
  Info,
  ExternalLink,
} from "lucide-react";
import { TextField } from "../form/Fields";
import { buildEmailDraft, composeUrl, mailtoUrl } from "../../lib/docEmail";
import { logEmail, type DocSettings, type Dossier } from "../../lib/docStore";
import type { DossierReport } from "../../lib/docReport";

interface DocEmailComposerProps {
  open: boolean;
  onClose: () => void;
  dossier: Dossier | null;
  report: DossierReport | null;
  settings: DocSettings;
  /** "auto" shows the automation banner (preview & confirm before sending). */
  kind?: "manual" | "auto";
}

/**
 * The email panel: a fully-editable reminder (recipient, CC, subject, body) with
 * a live preview. "Enviar" opens the configured webmail (Gmail/Outlook) with the
 * draft pre-filled so the operator sends from their own account, and logs the
 * event on the dossier. For automated reminders it shows a preview + explicit
 * confirmation, honouring the "avísame antes de enviar" setting.
 */
export function DocEmailComposer({
  open,
  onClose,
  dossier,
  report,
  settings,
  kind = "manual",
}: DocEmailComposerProps) {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  // Re-seed the draft whenever the panel opens for a (new) dossier.
  useEffect(() => {
    if (!open || !dossier || !report) return;
    const draft = buildEmailDraft(dossier, settings, report);
    setTo(draft.to);
    setCc(draft.cc);
    setSubject(draft.subject);
    setBody(draft.body);
    setMode(kind === "auto" ? "preview" : "edit");
  }, [open, dossier, report, settings, kind]);

  const providerName = settings.provider === "gmail" ? "Gmail" : "Outlook";

  const disabled = useMemo(() => !to.trim() || !subject.trim(), [to, subject]);

  function handleSend() {
    if (!dossier || !report) return;
    const draft = { to, cc, subject, body };
    const url = composeUrl(settings, draft);
    if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
    logEmail(dossier.identificador, {
      to,
      cc,
      subject,
      kind,
      missingCount: report.faltantes.length,
    });
    onClose();
  }

  if (!dossier || !report) return null;

  return (
    <Modal open={open} onRequestClose={onClose} size="max-w-2xl" ariaLabel="Redactar aviso de documentación">
      <div className="flex items-center gap-3 rounded-t-3xl border-b border-[color:var(--hairline)] bg-[color:var(--glass-bg-heavy)] px-5 py-4 backdrop-blur-xl sm:px-7">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#00b0d8] to-[#005baa] shadow-glass ring-1 ring-white/30">
          <Mail className="h-6 w-6 text-white drop-shadow-md" />
        </div>
        <div className="min-w-0 flex-1 pr-10">
          <h2 className="truncate text-lg font-black tracking-tight text-ink sm:text-xl">
            Aviso de documentación
          </h2>
          <p className="truncate text-xs text-ink-soft">
            Para {dossier.nombre} · vía {providerName}
          </p>
        </div>
      </div>

      <div className="max-h-[calc(100vh-15rem)] space-y-4 overflow-y-auto px-5 py-5 sm:px-7">
        {kind === "auto" && (
          <div className="flex items-start gap-2 rounded-2xl bg-cyan-500/10 px-4 py-3 text-sm text-ink-soft ring-1 ring-cyan-400/30">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
            <span>
              El sistema propone enviar este aviso automático. Revise la vista previa y confirme el envío.
            </span>
          </div>
        )}

        {/* Mode switch */}
        <div className="flex items-center justify-between gap-2">
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
          <span className="rounded-full fill-softer px-2.5 py-1 text-[0.7rem] font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)]">
            {report.faltantes.length} pendiente(s)
          </span>
        </div>

        {mode === "edit" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField label="Para" value={to} onChange={setTo} placeholder="persona@correo.com" />
              <TextField label="Copia (CC)" hint="Auxiliar a cargo" value={cc} onChange={setCc} placeholder="auxiliar@bdp.com" />
            </div>
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
          </div>
        ) : (
          <div className="glass rounded-2xl p-4">
            <div className="space-y-1 border-b border-[color:var(--hairline)] pb-3 text-sm">
              <div><span className="font-bold text-ink">Para:</span> <span className="text-ink-soft">{to || "—"}</span></div>
              {cc && <div><span className="font-bold text-ink">CC:</span> <span className="text-ink-soft">{cc}</span></div>}
              <div><span className="font-bold text-ink">Asunto:</span> <span className="text-ink-soft">{subject || "—"}</span></div>
            </div>
            <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink-soft">
              {body}
            </pre>
          </div>
        )}

        <a
          href={mailtoUrl({ to, cc, subject, body })}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-500 hover:underline"
        >
          <Paperclip className="h-3.5 w-3.5" />
          Abrir en el cliente de correo del sistema (mailto)
        </a>
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
          onClick={handleSend}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-6 py-3 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all duration-500 ease-spring hover:-translate-y-1 hover:scale-[1.03] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Send className="h-4 w-4" />
          {kind === "auto" ? "Confirmar y abrir" : "Enviar por"} {providerName}
          <ExternalLink className="h-3.5 w-3.5 opacity-80" />
        </button>
      </div>
    </Modal>
  );
}
