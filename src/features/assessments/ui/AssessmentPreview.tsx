import { useMemo } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, Monitor, Tablet, Smartphone } from "lucide-react";
import { L, formatDuration } from "../../../content/locale";
import { Z } from "../../../design-system/tokens";
import { publishDraft } from "../versioning/operations";
import { toPublicAssessmentDTO } from "../../../infrastructure/mappers/publicDto";
import { BlockRenderer } from "../builder/BlockRenderer";
import { assessmentBlockSchema } from "../domain/questions";
import type { AssessmentDefinition } from "../domain/assessment";

type Device = "desktop" | "tablet" | "mobile";

interface PreviewProps {
  assessment: AssessmentDefinition;
  device: Device;
  onDevice: (d: Device) => void;
  onClose: () => void;
}

const DEVICE_WIDTH: Record<Device, string> = {
  desktop: "max-w-3xl",
  tablet: "max-w-xl",
  mobile: "max-w-sm",
};

/**
 * Candidate-facing preview.
 *
 * SECURITY: the preview renders through the SAME public DTO the Candidate Portal
 * would receive, so answer keys and scoring never appear here. We synthesize a
 * throwaway published version from the draft to build that DTO.
 */
export function AssessmentPreview({ assessment, device, onDevice, onClose }: PreviewProps) {
  const dto = useMemo(() => {
    // Publish the draft into a scratch copy so the public DTO has a served version.
    const scratch = publishDraft(assessment, "preview");
    return toPublicAssessmentDTO(scratch);
  }, [assessment]);

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 flex items-start justify-center overflow-y-auto p-4"
        style={{ zIndex: Z.dialog }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label={L.common.preview}
      >
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md" onClick={onClose} />
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          className={`glass-heavy relative z-10 my-6 w-full ${DEVICE_WIDTH[device]} rounded-3xl`}
        >
          <header className="flex items-center justify-between gap-2 border-b border-[color:var(--hairline)] px-4 py-3">
            <div className="flex items-center gap-1.5">
              {(["desktop", "tablet", "mobile"] as Device[]).map((d) => {
                const Icon = d === "desktop" ? Monitor : d === "tablet" ? Tablet : Smartphone;
                return (
                  <button key={d} type="button" aria-label={L.builder.device[d]} aria-pressed={device === d} onClick={() => onDevice(d)} className={`grid h-8 w-8 place-items-center rounded-full ring-1 ring-[color:var(--hairline)] ${device === d ? "bg-cyan-500/20 text-cyan-100" : "fill-softer text-ink-soft"}`}>
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
            <button type="button" aria-label={L.common.close} onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full fill-softer text-ink hover:bg-rose-500/70 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="max-h-[70vh] overflow-y-auto p-5">
            {!dto ? (
              <p className="py-12 text-center text-sm text-ink-faint">Agrega preguntas para previsualizar la evaluación.</p>
            ) : (
              <div className="flex flex-col gap-5">
                <div>
                  <h2 className="text-xl font-black text-ink">{dto.name}</h2>
                  {dto.estimatedDurationMinutes > 0 && (
                    <p className="mt-1 text-xs text-ink-faint">Duración estimada: {formatDuration(dto.estimatedDurationMinutes)}</p>
                  )}
                  {dto.publicInstructions && <p className="mt-2 text-sm text-ink-soft">{dto.publicInstructions}</p>}
                </div>
                {dto.sections.map((section) => (
                  <section key={section.id} className="rounded-2xl fill-soft p-4 ring-1 ring-[color:var(--hairline)]">
                    <h3 className="mb-3 text-base font-black text-ink">{section.title}</h3>
                    <div className="flex flex-col gap-4">
                      {section.blocks.map((block) => (
                        <BlockRenderer
                          key={block.id}
                          candidateMode
                          // Re-parse the public block into a full block shape for the renderer.
                          block={assessmentBlockSchema.parse({ ...block, score: { mode: "none" } })}
                        />
                      ))}
                    </div>
                  </section>
                ))}
                <p className="text-center text-xs text-ink-faint">{L.assessments.disclaimer}</p>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
