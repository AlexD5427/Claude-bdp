import { Modal } from "../Modal";
import { Settings2, Info } from "lucide-react";
import { TextField, SegmentedField } from "../form/Fields";
import { setSettings, type DocSettings } from "../../lib/docStore";

interface DocSettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: DocSettings;
}

const PLACEHOLDERS = [
  "{nombre}",
  "{cargo}",
  "{faltantes}",
  "{dias}",
  "{fecha_ingreso}",
  "{total}",
  "{presentados}",
  "{faltan}",
  "{avance}",
];

/**
 * Configuration for the reminder-email automation: which account sends, who is
 * always kept in copy, the cadence (default every 3 days), whether the system
 * drafts reminders automatically and whether it asks for confirmation first, and
 * the subject/body templates (with placeholders).
 */
export function DocSettingsModal({ open, onClose, settings }: DocSettingsModalProps) {
  return (
    <Modal open={open} onRequestClose={onClose} size="max-w-2xl" ariaLabel="Configuración de avisos">
      <div className="flex items-center gap-3 rounded-t-3xl border-b border-[color:var(--hairline)] bg-[color:var(--glass-bg-heavy)] px-5 py-4 backdrop-blur-xl sm:px-7">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#00b0d8] to-[#005baa] shadow-glass ring-1 ring-white/30">
          <Settings2 className="h-6 w-6 text-white drop-shadow-md" />
        </div>
        <div className="min-w-0 flex-1 pr-10">
          <h2 className="truncate text-lg font-black tracking-tight text-ink sm:text-xl">
            Configuración de avisos automáticos
          </h2>
          <p className="text-xs text-ink-soft">
            Cuenta remitente, copia, cadencia y plantillas de los correos.
          </p>
        </div>
      </div>

      <div className="max-h-[calc(100vh-13rem)] space-y-5 overflow-y-auto px-5 py-6 sm:px-7">
        <SegmentedField
          label="Proveedor de correo"
          value={settings.provider === "gmail" ? "Gmail" : "Outlook"}
          onChange={(v) => setSettings({ provider: v === "Gmail" ? "gmail" : "outlook" })}
          options={["Gmail", "Outlook"]}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField
            label="Cuenta remitente"
            hint="Desde qué cuenta se envía"
            value={settings.fromAccount}
            onChange={(v) => setSettings({ fromAccount: v })}
            placeholder="reclutamiento@bdp.com"
          />
          <TextField
            label="Correo en copia (CC)"
            hint="Auxiliar a cargo"
            value={settings.ccEmail}
            onChange={(v) => setSettings({ ccEmail: v })}
            placeholder="auxiliar@bdp.com"
          />
          <TextField
            label="Cada cuántos días"
            type="number"
            hint="Cadencia de recordatorios"
            value={String(settings.intervalDays)}
            onChange={(v) => setSettings({ intervalDays: Math.max(1, Number(v) || 1) })}
          />
        </div>

        <div className="space-y-2">
          <Toggle
            title="Avisos automáticos"
            subtitle="El sistema propone recordatorios según la cadencia."
            checked={settings.autoSendEnabled}
            onChange={(v) => setSettings({ autoSendEnabled: v })}
          />
          <Toggle
            title="Pedir confirmación antes de enviar"
            subtitle="Muestra la vista previa y avisa antes de cada envío automático."
            checked={settings.requireConfirmation}
            onChange={(v) => setSettings({ requireConfirmation: v })}
          />
        </div>

        <TextField
          label="Asunto (plantilla)"
          value={settings.subjectTemplate}
          onChange={(v) => setSettings({ subjectTemplate: v })}
        />
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Cuerpo (plantilla)
          </span>
          <textarea
            value={settings.bodyTemplate}
            rows={12}
            onChange={(e) => setSettings({ bodyTemplate: e.target.value })}
            className="glass w-full resize-y rounded-xl px-3.5 py-2.5 text-sm leading-relaxed text-ink outline-none focus-within:ring-2 focus-within:ring-cyan-400/70"
          />
        </label>

        <div className="flex flex-wrap items-start gap-2 rounded-2xl fill-soft px-4 py-3 text-xs text-ink-soft ring-1 ring-[color:var(--hairline)]">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
          <div>
            <span className="font-semibold text-ink">Variables disponibles:</span>{" "}
            {PLACEHOLDERS.map((p) => (
              <code key={p} className="mx-0.5 rounded bg-[color:var(--fill-2)] px-1 py-0.5 text-[0.7rem] text-ink">
                {p}
              </code>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 rounded-b-3xl border-t border-[color:var(--hairline)] bg-[color:var(--glass-bg-heavy)] px-5 py-4 backdrop-blur-xl sm:px-7">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-6 py-3 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all hover:-translate-y-0.5 active:scale-95"
        >
          Listo
        </button>
      </div>
    </Modal>
  );
}

function Toggle({
  title,
  subtitle,
  checked,
  onChange,
}: {
  title: string;
  subtitle: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={[
        "flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left ring-1 transition-all active:scale-[0.99]",
        checked
          ? "bg-gradient-to-br from-[#00b0d8]/15 to-[#005baa]/15 ring-cyan-400/40"
          : "fill-softer ring-[color:var(--hairline)] hover:fill-soft",
      ].join(" ")}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-ink">{title}</div>
        <div className="truncate text-xs text-ink-faint">{subtitle}</div>
      </div>
      <span
        className={[
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa]" : "fill-soft ring-1 ring-[color:var(--hairline)]",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-0.5 grid h-5 w-5 place-items-center rounded-full bg-white shadow transition-all",
            checked ? "left-[1.4rem]" : "left-0.5",
          ].join(" ")}
        />
      </span>
    </button>
  );
}
