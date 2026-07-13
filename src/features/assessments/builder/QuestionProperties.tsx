import { Plus, Trash2, Copy, GripVertical, Check } from "lucide-react";
import { uid } from "../../../shared/id";
import { getPlugin } from "../question-types/registry";
import { inspectQuestion } from "../validation";
import { Field, NumberInput, SelectInput, TextArea, TextInput } from "../../processes/components/fields";
import type { AssessmentOption, AssessmentQuestion, QuestionScoring } from "../types";

/**
 * The builder's right-hand properties inspector for the selected question. It
 * renders only the controls relevant to the question's plugin capabilities
 * (options, scoring, correct answers, validation) plus type-specific config.
 */
export function QuestionProperties({
  question,
  onChange,
  onDelete,
  onDuplicate,
}: {
  question: AssessmentQuestion;
  onChange: (q: AssessmentQuestion) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const plugin = getPlugin(question.type);
  const caps = plugin?.capabilities ?? { options: false, scoring: false, correctAnswer: false };
  const issues = inspectQuestion(question);

  const patch = (p: Partial<AssessmentQuestion>) => onChange({ ...question, ...p, configured: true });
  const patchConfig = (p: Record<string, unknown>) => patch({ config: { ...question.config, ...p } });
  const patchScoring = (p: Partial<QuestionScoring>) => patch({ scoring: { ...question.scoring, ...p } });
  const patchValidation = (p: Partial<AssessmentQuestion["validation"]>) =>
    patch({ validation: { ...question.validation, ...p } });

  const setOptions = (options: AssessmentOption[]) => patch({ options });
  const addOption = () =>
    setOptions([...question.options, { id: uid("opt"), label: `Opción ${question.options.length + 1}`, value: `Opción ${question.options.length + 1}` }]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full fill-soft px-2.5 py-1 text-[0.7rem] font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)]">
          {plugin?.label ?? question.type}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onDuplicate}
            title="Duplicar bloque"
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-soft hover:bg-[color:var(--fill-2)]"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Eliminar bloque"
            className="grid h-8 w-8 place-items-center rounded-lg text-rose-400 hover:bg-rose-500/15"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {issues.length > 0 && (
        <div className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-200 ring-1 ring-amber-400/30">
          {issues.map((i) => (
            <p key={i}>· {i}</p>
          ))}
        </div>
      )}

      <TextInput
        label={question.family === "content" ? "Contenido" : "Enunciado"}
        value={question.label}
        onChange={(v) => patch({ label: v })}
      />

      {question.family !== "content" && (
        <>
          <TextArea label="Descripción" value={question.description ?? ""} onChange={(v) => patch({ description: v })} rows={2} />
          <TextInput label="Texto de ayuda" value={question.helpText ?? ""} onChange={(v) => patch({ helpText: v })} />
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={question.required}
              onChange={(e) => patch({ required: e.target.checked })}
              className="h-4 w-4 accent-cyan-500"
            />
            Obligatoria
          </label>
        </>
      )}

      {/* Type-specific config */}
      <TypeConfig question={question} patchConfig={patchConfig} />

      {/* Options */}
      {caps.options && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-soft">Opciones</span>
            <button
              type="button"
              onClick={addOption}
              className="inline-flex items-center gap-1 rounded-full fill-soft px-2.5 py-1 text-xs font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)] hover:text-ink"
            >
              <Plus className="h-3.5 w-3.5" /> Agregar
            </button>
          </div>
          <ul className="space-y-1.5">
            {question.options.map((o, idx) => (
              <li key={o.id} className="flex items-center gap-2 rounded-xl fill-soft p-1.5 ring-1 ring-[color:var(--hairline)]">
                <GripVertical className="h-4 w-4 shrink-0 text-ink-faint" />
                <input
                  value={o.label}
                  onChange={(e) =>
                    setOptions(question.options.map((x) => (x.id === o.id ? { ...x, label: e.target.value, value: e.target.value } : x)))
                  }
                  className="min-w-0 flex-1 bg-transparent px-1 text-sm text-ink outline-none"
                  aria-label={`Opción ${idx + 1}`}
                />
                {caps.scoring && question.scoring.mode === "per_option" && (
                  <input
                    type="number"
                    value={o.points ?? 0}
                    onChange={(e) =>
                      setOptions(question.options.map((x) => (x.id === o.id ? { ...x, points: Number(e.target.value) } : x)))
                    }
                    title="Puntos de la opción"
                    className="w-14 rounded-lg fill-softer px-1.5 py-1 text-xs text-ink ring-1 ring-[color:var(--hairline)]"
                  />
                )}
                {caps.correctAnswer && (
                  <button
                    type="button"
                    onClick={() => setOptions(question.options.map((x) => (x.id === o.id ? { ...x, correct: !x.correct } : x)))}
                    title={o.correct ? "Respuesta correcta" : "Marcar como correcta"}
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ring-1 transition-colors ${
                      o.correct ? "bg-emerald-500/80 text-white ring-white/30" : "fill-softer text-ink-faint ring-[color:var(--hairline)]"
                    }`}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOptions(question.options.filter((x) => x.id !== o.id))}
                  aria-label="Eliminar opción"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-rose-400 hover:bg-rose-500/15"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Scoring */}
      {caps.scoring && (
        <div className="space-y-3 rounded-2xl fill-soft p-3 ring-1 ring-[color:var(--hairline)]">
          <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">Puntuación</span>
          <SelectInput
            label="Modo"
            value={question.scoring.mode}
            onChange={(v) => patchScoring({ mode: v })}
            options={[
              { value: "none", label: "Sin puntaje" },
              { value: "exact", label: "Respuesta exacta" },
              { value: "partial", label: "Puntaje parcial" },
              { value: "weighted", label: "Ponderado" },
              { value: "per_option", label: "Por opción" },
              { value: "manual", label: "Revisión manual" },
              { value: "rubric", label: "Rúbrica" },
            ]}
          />
          {question.scoring.mode !== "none" && question.scoring.mode !== "per_option" && (
            <div className="grid grid-cols-2 gap-2">
              <NumberInput label="Puntos" value={question.scoring.points} min={0} onChange={(v) => patchScoring({ points: v })} />
              <NumberInput label="Peso" value={question.scoring.weight} min={0} onChange={(v) => patchScoring({ weight: v })} />
            </div>
          )}
          {(question.scoring.mode === "exact" || question.scoring.mode === "weighted") &&
            (question.family === "text" || question.family === "numeric") && (
              <TextInput
                label="Respuesta esperada"
                value={String(question.scoring.expectedValue ?? "")}
                onChange={(v) => patchScoring({ expectedValue: v })}
              />
            )}
          {(question.scoring.mode === "exact" || question.scoring.mode === "partial") && (
            <label className="flex items-center gap-2 text-xs text-ink-soft">
              <input
                type="checkbox"
                checked={Boolean(question.scoring.allowNegative)}
                onChange={(e) => patchScoring({ allowNegative: e.target.checked })}
                className="h-4 w-4 accent-cyan-500"
              />
              Penalizar respuestas incorrectas (puntaje negativo)
            </label>
          )}
          <TextInput
            label="Competencia (opcional)"
            value={question.scoring.competency ?? ""}
            onChange={(v) => patchScoring({ competency: v })}
          />
        </div>
      )}

      {/* Validation */}
      {question.family !== "content" && (
        <div className="space-y-3 rounded-2xl fill-soft p-3 ring-1 ring-[color:var(--hairline)]">
          <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">Validación</span>
          {(question.family === "text") && (
            <div className="grid grid-cols-2 gap-2">
              <NumberInput label="Mín. caracteres" value={question.validation.minLength ?? 0} min={0} onChange={(v) => patchValidation({ minLength: v || undefined })} />
              <NumberInput label="Máx. caracteres" value={question.validation.maxLength ?? 0} min={0} onChange={(v) => patchValidation({ maxLength: v || undefined })} />
            </div>
          )}
          {question.family === "numeric" && (
            <div className="grid grid-cols-2 gap-2">
              <NumberInput label="Mínimo" value={question.validation.min ?? 0} onChange={(v) => patchValidation({ min: v })} />
              <NumberInput label="Máximo" value={question.validation.max ?? 0} onChange={(v) => patchValidation({ max: v })} />
            </div>
          )}
          {question.type === "multiple_choice" && (
            <div className="grid grid-cols-2 gap-2">
              <NumberInput label="Mín. selecciones" value={question.validation.minSelected ?? 0} min={0} onChange={(v) => patchValidation({ minSelected: v || undefined })} />
              <NumberInput label="Máx. selecciones" value={question.validation.maxSelected ?? 0} min={0} onChange={(v) => patchValidation({ maxSelected: v || undefined })} />
            </div>
          )}
          {question.family === "file" && (
            <NumberInput label="Tamaño máx. (MB)" value={question.validation.maxFileSizeMb ?? 10} min={1} onChange={(v) => patchValidation({ maxFileSizeMb: v })} />
          )}
        </div>
      )}
    </div>
  );
}

function TypeConfig({
  question,
  patchConfig,
}: {
  question: AssessmentQuestion;
  patchConfig: (p: Record<string, unknown>) => void;
}) {
  const cfg = question.config as Record<string, unknown>;
  if (question.type === "numeric_scale" || question.type === "nps") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <NumberInput label="Mínimo" value={Number(cfg.min ?? 1)} onChange={(v) => patchConfig({ min: v })} />
        <NumberInput label="Máximo" value={Number(cfg.max ?? 5)} onChange={(v) => patchConfig({ max: v })} />
      </div>
    );
  }
  if (question.type === "star_rating") {
    return <NumberInput label="Estrellas" value={Number(cfg.max ?? 5)} min={3} max={10} onChange={(v) => patchConfig({ max: v })} />;
  }
  if (question.type === "scenario_case") {
    return <TextArea label="Enunciado del caso" value={String(cfg.scenario ?? "")} onChange={(v) => patchConfig({ scenario: v })} rows={3} />;
  }
  if (question.type === "image_content") {
    return <TextInput label="URL de la imagen" value={String(cfg.url ?? "")} onChange={(v) => patchConfig({ url: v })} />;
  }
  if (question.type === "matrix_single") {
    return (
      <div className="space-y-2">
        <Field label="Filas (una por línea)">
          <textarea
            rows={3}
            value={((cfg.rows as string[]) ?? []).join("\n")}
            onChange={(e) => patchConfig({ rows: e.target.value.split("\n").filter(Boolean) })}
            className="w-full rounded-xl fill-soft px-3 py-2 text-sm text-ink ring-1 ring-[color:var(--hairline)]"
          />
        </Field>
        <Field label="Columnas (una por línea)">
          <textarea
            rows={3}
            value={((cfg.columns as string[]) ?? []).join("\n")}
            onChange={(e) => patchConfig({ columns: e.target.value.split("\n").filter(Boolean) })}
            className="w-full rounded-xl fill-soft px-3 py-2 text-sm text-ink ring-1 ring-[color:var(--hairline)]"
          />
        </Field>
      </div>
    );
  }
  return null;
}
