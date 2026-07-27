import { L } from "../../../content/locale";
import { Field, NumberField, Select, TextInput } from "../../../design-system/liquid-glass/fields";
import { StatusPill } from "../../../design-system/liquid-glass/StatusPill";
import { capabilitiesOf, isAutoGradable, requiresManualReview } from "../question-types";
import type { AssessmentBlock } from "../domain/questions";
import type { BuilderAction } from "./builderState";

const SCORE_MODES: { value: string; label: string }[] = [
  { value: "none", label: "Sin puntaje" },
  { value: "exact", label: "Respuesta exacta" },
  { value: "partial", label: "Puntaje parcial" },
  { value: "per_option", label: "Puntos por opción" },
  { value: "weighted", label: "Puntaje ponderado" },
  { value: "manual", label: "Revisión manual" },
  { value: "rubric", label: "Rúbrica" },
];

interface PropertiesProps {
  block: AssessmentBlock | null;
  dispatch: (action: BuilderAction) => void;
}

/**
 * Panel contextual de propiedades de la pregunta activa.
 *
 * Contiene lo que no forma parte del enunciado: puntuación, peso, competencia y
 * ayuda contextual sobre cómo se calificará. En pantallas pequeñas el panel se
 * oculta y su contenido queda accesible dentro de «Configuración avanzada» del
 * editor.
 */
export function QuestionProperties({ block, dispatch }: PropertiesProps) {
  if (!block) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-sm text-ink-faint">
        {L.builder.editor.selectQuestion}
      </div>
    );
  }

  const caps = capabilitiesOf(block.type);
  const auto = isAutoGradable(block);
  const manual = requiresManualReview(block);

  return (
    <div className="flex flex-col gap-4 p-4">
      <header>
        <h3 className="text-xs font-bold uppercase tracking-wide text-ink-soft">
          {L.builder.editor.properties}
        </h3>
      </header>

      {caps.control === "content" ? (
        <p className="rounded-2xl fill-soft px-3 py-2 text-xs text-ink-faint ring-1 ring-[color:var(--hairline)]">
          Este bloque presenta información y no recibe respuesta, así que no tiene
          puntuación.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h4 className="text-[0.7rem] font-bold uppercase tracking-wide text-ink-faint">
              {L.builder.editor.scoring}
            </h4>
            <Field label={L.builder.editor.scoreMode}>
              <Select
                value={block.score.mode}
                onChange={(event) =>
                  dispatch({
                    type: "updateBlock",
                    blockId: block.id,
                    patch: {
                      score: {
                        ...block.score,
                        mode: event.target.value as AssessmentBlock["score"]["mode"],
                      },
                    },
                  })
                }
              >
                {SCORE_MODES.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={L.builder.editor.points}>
                <NumberField
                  min={0}
                  value={block.score.points}
                  onChange={(value) =>
                    dispatch({
                      type: "updateBlock",
                      blockId: block.id,
                      patch: { score: { ...block.score, points: value ?? 0 } },
                    })
                  }
                />
              </Field>
              <Field label={L.builder.editor.weight}>
                <NumberField
                  min={0}
                  value={block.score.weight}
                  onChange={(value) =>
                    dispatch({
                      type: "updateBlock",
                      blockId: block.id,
                      patch: { score: { ...block.score, weight: value ?? 1 } },
                    })
                  }
                />
              </Field>
            </div>
            <Field label={L.builder.editor.competency}>
              <TextInput
                value={block.score.competency}
                onChange={(event) =>
                  dispatch({
                    type: "updateBlock",
                    blockId: block.id,
                    patch: { score: { ...block.score, competency: event.target.value } },
                  })
                }
                maxLength={120}
              />
            </Field>
          </section>

          <section className="rounded-2xl fill-soft p-3 ring-1 ring-[color:var(--hairline)]">
            <StatusPill intent={auto ? "success" : manual ? "warning" : "neutral"}>
              {auto
                ? L.builder.editor.autoGraded
                : manual
                  ? L.builder.editor.manualGraded
                  : L.builder.editor.notGraded}
            </StatusPill>
            <p className="mt-2 text-xs text-ink-soft">
              {auto
                ? "El servidor calificará esta pregunta comparando la respuesta con la clave configurada."
                : manual
                  ? "No hay criterio objetivo configurado, así que una persona cerrará la calificación. El intento quedará pendiente en lugar de recibir cero."
                  : "Esta pregunta no aporta a la nota."}
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <h4 className="text-[0.7rem] font-bold uppercase tracking-wide text-ink-faint">
              {L.builder.inspectorFields.tags}
            </h4>
            <Field label={L.builder.inspectorFields.label + " (código)"}>
              <TextInput
                value={block.code}
                placeholder="P-01"
                onChange={(event) =>
                  dispatch({ type: "updateBlock", blockId: block.id, patch: { code: event.target.value } })
                }
                maxLength={80}
              />
            </Field>
          </section>
        </>
      )}
    </div>
  );
}
