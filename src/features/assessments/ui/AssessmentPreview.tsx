import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, EyeOff, Info, Monitor, Smartphone, Tablet, X } from "lucide-react";
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
  onDevice: (device: Device) => void;
  onClose: () => void;
}

const DEVICE_WIDTH: Record<Device, string> = {
  desktop: "max-w-3xl",
  tablet: "max-w-xl",
  mobile: "max-w-sm",
};

/**
 * Vista previa del candidato.
 *
 * Propiedades que la hacen segura y honesta:
 *
 *  · **No publica nada.** Trabaja con el borrador local y construye una copia
 *    desechable en memoria; no escribe en el servidor ni crea un intento, y por
 *    tanto no guarda respuestas ni calcula una nota oficial.
 *  · **Pasa por el MISMO saneador que el portal de candidatos**
 *    (`toPublicAssessmentDTO`), así que si algo se filtrara aquí también se
 *    filtraría en producción — y las pruebas lo verifican en ambos lados.
 *  · El modo administrativo de «ver respuestas correctas» es una vista aparte que
 *    lee el contenido local, NUNCA el DTO público.
 */
export function AssessmentPreview({ assessment, device, onDevice, onClose }: PreviewProps) {
  const [showAnswerKey, setShowAnswerKey] = useState(false);

  const dto = useMemo(() => {
    // Copia desechable en memoria: `publishDraft` es una función pura y su
    // resultado no sale de este componente.
    const scratch = publishDraft(assessment, "preview");
    return toPublicAssessmentDTO(scratch);
  }, [assessment]);

  const localSections = assessment.draftVersion.content.sections;

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
        aria-label={L.builder.previewPanel.title}
      >
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md" onClick={onClose} />
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          className={`glass-heavy relative z-10 my-6 w-full ${DEVICE_WIDTH[device]} rounded-3xl`}
        >
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--hairline)] px-4 py-3">
            <div className="flex items-center gap-1.5">
              {(["desktop", "tablet", "mobile"] as Device[]).map((item) => {
                const Icon = item === "desktop" ? Monitor : item === "tablet" ? Tablet : Smartphone;
                return (
                  <button
                    key={item}
                    type="button"
                    aria-label={L.builder.device[item]}
                    aria-pressed={device === item}
                    onClick={() => onDevice(item)}
                    className={`grid h-8 w-8 place-items-center rounded-full ring-1 ring-[color:var(--hairline)] focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                      device === item ? "bg-cyan-500/20 text-cyan-100" : "fill-softer text-ink-soft"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-pressed={showAnswerKey}
                onClick={() => setShowAnswerKey((value) => !value)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                  showAnswerKey
                    ? "bg-emerald-500/20 text-emerald-100 ring-emerald-400/40"
                    : "fill-softer text-ink-soft ring-[color:var(--hairline)]"
                }`}
              >
                {showAnswerKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {L.builder.previewPanel.adminToggle}
              </button>
              <button
                type="button"
                aria-label={L.common.close}
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-full fill-softer text-ink transition-colors hover:bg-rose-500/70 hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <p className="flex items-start gap-2 border-b border-[color:var(--hairline)] bg-cyan-500/10 px-4 py-2 text-xs text-cyan-100">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {showAnswerKey ? L.builder.previewPanel.adminNotice : L.builder.previewPanel.notice}
            </span>
          </p>

          <div className="max-h-[70vh] overflow-y-auto p-5">
            {showAnswerKey ? (
              <div className="flex flex-col gap-5">
                {localSections.map((section) => (
                  <section
                    key={section.id}
                    className="rounded-2xl fill-soft p-4 ring-1 ring-[color:var(--hairline)]"
                  >
                    <h3 className="mb-3 text-base font-black text-ink">{section.title}</h3>
                    <div className="flex flex-col gap-4">
                      {section.blocks.map((block) => (
                        <BlockRenderer key={block.id} block={block} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : !dto ? (
              <p className="py-12 text-center text-sm text-ink-faint">
                {L.builder.previewPanel.empty}
              </p>
            ) : (
              <div className="flex flex-col gap-5">
                <div>
                  <h2 className="text-xl font-black text-ink">{dto.name}</h2>
                  {dto.estimatedDurationMinutes > 0 && (
                    <p className="mt-1 text-xs text-ink-faint">
                      {L.builder.settings.duration}: {formatDuration(dto.estimatedDurationMinutes)}
                    </p>
                  )}
                  {dto.publicInstructions && (
                    <p className="mt-2 text-sm text-ink-soft">{dto.publicInstructions}</p>
                  )}
                </div>
                {dto.sections.map((section) => (
                  <section
                    key={section.id}
                    className="rounded-2xl fill-soft p-4 ring-1 ring-[color:var(--hairline)]"
                  >
                    <h3 className="mb-3 text-base font-black text-ink">{section.title}</h3>
                    <div className="flex flex-col gap-4">
                      {section.blocks.map((block) => (
                        <BlockRenderer
                          key={block.id}
                          candidateMode
                          // El bloque público se reconstruye con la forma completa
                          // para el renderizador: sin puntajes ni claves.
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
