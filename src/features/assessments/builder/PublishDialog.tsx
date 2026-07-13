import { useState } from "react";
import { GitBranch, Loader2 } from "lucide-react";
import { Modal } from "../../../components/Modal";
import { classifyEdit, nextVersion } from "../lifecycle";
import { analyzeRules } from "../logic";
import type { AssessmentDefinition } from "../types";

/**
 * The publish dialog. It classifies the pending edit relative to the last
 * published version (structural vs non-structural), previews the resulting
 * version number, blocks on logic errors, and captures version notes before
 * publishing. This is where the "live update" versioning policy is enforced in
 * the UI.
 */
export function PublishDialog({
  assessment,
  lastPublished,
  open,
  onClose,
  onConfirm,
}: {
  assessment: AssessmentDefinition;
  lastPublished: AssessmentDefinition | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (notes: string) => Promise<void>;
}) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const classification = lastPublished ? classifyEdit(lastPublished, assessment) : "structural";
  const current = assessment.currentVersion ?? "1.0";
  const targetVersion = lastPublished ? nextVersion(current, classification) : "1.0";
  const logicErrors = analyzeRules(assessment).filter((i) => i.severity === "error");

  const label =
    classification === "structural"
      ? "Cambio estructural → nueva versión mayor"
      : classification === "non_structural"
        ? "Cambio no estructural → revisión menor"
        : "Sin cambios respecto a la versión publicada";

  const run = async () => {
    setBusy(true);
    try {
      await onConfirm(notes);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onRequestClose={onClose} size="max-w-lg" ariaLabel="Publicar versión">
      <div className="space-y-4 p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 text-white ring-1 ring-white/30">
            <GitBranch className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-black text-ink">Publicar versión</h2>
            <p className="text-xs text-ink-soft">{assessment.name}</p>
          </div>
        </div>

        <div className="rounded-2xl fill-soft p-4 ring-1 ring-[color:var(--hairline)]">
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-soft">Versión resultante</span>
            <span className="font-black text-ink">{targetVersion}</span>
          </div>
          <p className="mt-1 text-xs text-ink-faint">{label}</p>
        </div>

        {logicErrors.length > 0 && (
          <div className="rounded-2xl bg-rose-500/10 p-3 text-xs text-rose-300 ring-1 ring-rose-400/30">
            <p className="font-bold">No se puede publicar: corrige los errores de lógica.</p>
            {logicErrors.slice(0, 4).map((e, i) => (
              <p key={i}>· {e.message}</p>
            ))}
          </div>
        )}

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-soft">Notas de la versión</span>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Describe brevemente los cambios de esta versión."
            className="w-full rounded-xl fill-soft px-3 py-2 text-sm text-ink ring-1 ring-[color:var(--hairline)]"
          />
        </label>

        <p className="text-[0.7rem] text-ink-faint">
          Los candidatos que ya iniciaron la evaluación permanecen en la versión con la que empezaron. Las
          nuevas asignaciones reciben la versión publicada.
        </p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)] hover:text-ink"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy || logicErrors.length > 0}
            onClick={run}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 px-5 py-2 text-sm font-bold text-white ring-1 ring-white/30 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Publicar {targetVersion}
          </button>
        </div>
      </div>
    </Modal>
  );
}
