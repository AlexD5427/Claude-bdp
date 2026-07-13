import { useMemo, useState } from "react";
import { Monitor, Tablet, Smartphone, ListTree, Contrast } from "lucide-react";
import { Modal } from "../../../components/Modal";
import { Segmented } from "../../../design-system/components/Segmented";
import { formatDuration } from "../../../shared/format";
import { toPublicAssessment } from "../publicDto";
import { QuestionRenderer } from "./QuestionRenderer";
import type { AssessmentDefinition } from "../types";

type Device = "desktop" | "tablet" | "mobile";

const DEVICE_WIDTH: Record<Device, string> = {
  desktop: "max-w-3xl",
  tablet: "max-w-xl",
  mobile: "max-w-sm",
};

/**
 * Multi-device candidate preview. Renders the assessment through the *public*
 * DTO (so it demonstrates that correct answers/scores are stripped) inside a
 * device frame, with high-contrast and screen-reader outline modes. Preview
 * attempts are never mixed with real submissions.
 */
export function AssessmentPreview({
  assessment,
  open,
  onClose,
}: {
  assessment: AssessmentDefinition;
  open: boolean;
  onClose: () => void;
}) {
  const [device, setDevice] = useState<Device>("desktop");
  const [outline, setOutline] = useState(false);
  const [highContrast, setHighContrast] = useState(false);

  const publicDto = useMemo(() => toPublicAssessment(assessment), [assessment]);

  return (
    <Modal open={open} onRequestClose={onClose} size="max-w-5xl" ariaLabel={`Vista previa de ${assessment.name}`}>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-ink">{assessment.name}</h2>
            <p className="text-xs text-ink-soft">
              Vista previa del candidato · duración estimada {formatDuration(assessment.estimatedDuration)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<Device>
              idBase="preview-device"
              ariaLabel="Dispositivo de vista previa"
              size="sm"
              value={device}
              onChange={setDevice}
              options={[
                { value: "desktop", label: "Escritorio", icon: Monitor },
                { value: "tablet", label: "Tableta", icon: Tablet },
                { value: "mobile", label: "Móvil", icon: Smartphone },
              ]}
            />
            <button
              type="button"
              onClick={() => setOutline((v) => !v)}
              aria-pressed={outline}
              title="Esquema para lector de pantalla"
              className={`grid h-8 w-8 place-items-center rounded-lg ring-1 transition-colors ${
                outline ? "bg-cyan-500/15 text-cyan-300 ring-cyan-400/30" : "fill-soft text-ink-soft ring-[color:var(--hairline)]"
              }`}
            >
              <ListTree className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setHighContrast((v) => !v)}
              aria-pressed={highContrast}
              title="Alto contraste"
              className={`grid h-8 w-8 place-items-center rounded-lg ring-1 transition-colors ${
                highContrast ? "bg-cyan-500/15 text-cyan-300 ring-cyan-400/30" : "fill-soft text-ink-soft ring-[color:var(--hairline)]"
              }`}
            >
              <Contrast className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto rounded-2xl fill-soft p-4 ring-1 ring-[color:var(--hairline)]">
          {outline ? (
            <ScreenReaderOutline assessment={assessment} />
          ) : (
            <div
              className={`mx-auto ${DEVICE_WIDTH[device]} space-y-5 rounded-2xl p-5 ${
                highContrast ? "bg-white text-black ring-2 ring-black" : "glass"
              }`}
            >
              {publicDto.publicInstructions && (
                <p className={`text-sm ${highContrast ? "text-black" : "text-ink-soft"}`}>{publicDto.publicInstructions}</p>
              )}
              {publicDto.sections.map((section) => (
                <section key={section.id} className="space-y-4">
                  <div>
                    <h3 className={`text-base font-black ${highContrast ? "text-black" : "text-ink"}`}>
                      {section.title}
                    </h3>
                    {section.description && (
                      <p className={`text-xs ${highContrast ? "text-black" : "text-ink-soft"}`}>{section.description}</p>
                    )}
                  </div>
                  {section.questions.map((pq) => {
                    // Reconstruct a minimal question for the renderer from the public DTO.
                    const full = assessment.sections
                      .flatMap((s) => s.questions)
                      .find((q) => q.id === pq.id);
                    if (!full) return null;
                    return (
                      <div key={pq.id} className="rounded-xl border border-[color:var(--hairline)] p-3">
                        <QuestionRenderer question={{ ...full, scoring: { ...full.scoring, expectedValue: undefined }, options: full.options.map((o) => ({ ...o, correct: undefined, points: undefined })) }} />
                      </div>
                    );
                  })}
                </section>
              ))}
              {publicDto.sections.length === 0 && (
                <p className="text-center text-sm text-ink-faint">La evaluación aún no tiene contenido.</p>
              )}
            </div>
          )}
        </div>
        <p className="text-center text-[0.7rem] text-ink-faint">
          Los intentos de vista previa nunca se mezclan con envíos reales. Las respuestas correctas no se
          exponen al candidato.
        </p>
      </div>
    </Modal>
  );
}

function ScreenReaderOutline({ assessment }: { assessment: AssessmentDefinition }) {
  return (
    <ol className="space-y-2 text-sm text-ink">
      {assessment.sections.map((s, si) => (
        <li key={s.id}>
          <p className="font-bold">
            {si + 1}. Sección: {s.title}
          </p>
          <ul className="ml-5 list-disc space-y-1 text-ink-soft">
            {s.questions.map((q) => (
              <li key={q.id}>
                [{q.family}] {q.label || "(sin enunciado)"} {q.required ? "· obligatorio" : ""}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
