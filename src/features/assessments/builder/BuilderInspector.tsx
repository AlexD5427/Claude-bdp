import { Plus, Trash2 } from "lucide-react";
import { L } from "../../../content/locale";
import { newId } from "../../../shared/ids";
import { Field, TextInput, TextArea, Select, NumberField, Switch } from "../../../design-system/liquid-glass/fields";
import { resolvePlugin } from "../question-types";
import type { AssessmentBlock, AssessmentOption } from "../domain/questions";

interface InspectorProps {
  block: AssessmentBlock | null;
  onPatch: (patch: Partial<AssessmentBlock>) => void;
}

const OPTION_TYPES = ["q_single_choice", "q_multiple_choice", "q_dropdown", "q_multiselect", "q_true_false", "q_yes_no_na", "q_ranking", "q_ordering", "q_image_choice"];
const SCORE_MODES = [
  { value: "none", label: "Sin puntaje" },
  { value: "exact", label: "Respuesta exacta" },
  { value: "partial", label: "Puntaje parcial" },
  { value: "per_option", label: "Puntos por opción" },
  { value: "weighted", label: "Puntaje ponderado" },
  { value: "manual", label: "Revisión manual" },
  { value: "rubric", label: "Rúbrica" },
];

/** The right-side inspector: edits label/help/options/score/etc. of a block. */
export function BuilderInspector({ block, onPatch }: InspectorProps) {
  if (!block) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-sm text-ink-faint">
        {L.builder.selectToEdit}
      </div>
    );
  }

  const plugin = resolvePlugin(block.type);
  const hasOptions = OPTION_TYPES.includes(block.type);
  const isContent = !plugin.isQuestion;

  const setOption = (id: string, patch: Partial<AssessmentOption>) =>
    onPatch({ options: block.options.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  const addOption = () =>
    onPatch({
      options: [
        ...block.options,
        { id: newId("opt"), label: `Opción ${block.options.length + 1}`, value: `opt${block.options.length + 1}`, score: 0, correct: false, feedback: "", mediaUrl: null },
      ],
    });
  const removeOption = (id: string) => onPatch({ options: block.options.filter((o) => o.id !== id) });

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="rounded-2xl fill-soft p-2.5 text-xs font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)]">
        {plugin.label}
        {plugin.status !== "stable" && (
          <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-[0.65rem] text-amber-200">
            {plugin.status === "contract" ? "contrato" : "beta"}
          </span>
        )}
      </div>

      <Field label={L.builder.inspectorFields.label}>
        <TextArea rows={2} value={block.label} onChange={(e) => onPatch({ label: e.target.value })} />
      </Field>

      {!isContent && (
        <Field label={L.builder.inspectorFields.helpText}>
          <TextInput value={block.helpText} onChange={(e) => onPatch({ helpText: e.target.value })} />
        </Field>
      )}

      <Field label={L.builder.inspectorFields.description}>
        <TextArea rows={2} value={block.description} onChange={(e) => onPatch({ description: e.target.value })} />
      </Field>

      {!isContent && (
        <Switch label={L.builder.inspectorFields.required} checked={block.required} onChange={(v) => onPatch({ required: v })} />
      )}

      {hasOptions && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-soft">{L.builder.inspectorFields.options}</span>
            <button type="button" onClick={addOption} className="inline-flex items-center gap-1 rounded-full fill-softer px-2.5 py-1 text-xs font-semibold text-ink ring-1 ring-[color:var(--hairline)] hover:fill-soft">
              <Plus className="h-3.5 w-3.5" /> {L.builder.inspectorFields.addOption}
            </button>
          </div>
          <ul className="flex flex-col gap-2">
            {block.options.map((o) => (
              <li key={o.id} className="rounded-2xl fill-soft p-2.5 ring-1 ring-[color:var(--hairline)]">
                <div className="flex items-center gap-2">
                  <TextInput value={o.label} onChange={(e) => setOption(o.id, { label: e.target.value, value: e.target.value })} className="flex-1" />
                  <button type="button" aria-label="Eliminar opción" onClick={() => removeOption(o.id)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-rose-500/70 hover:text-white">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
                    <input type="checkbox" checked={o.correct} onChange={(e) => setOption(o.id, { correct: e.target.checked })} className="h-3.5 w-3.5 accent-emerald-500" />
                    {L.builder.inspectorFields.correctAnswer}
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
                    {L.builder.inspectorFields.score}
                    <input type="number" value={o.score} onChange={(e) => setOption(o.id, { score: Number(e.target.value) })} className="w-16 rounded-lg fill-softer px-2 py-1 text-xs text-ink ring-1 ring-[color:var(--hairline)]" />
                  </label>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isContent && (
        <>
          <Field label={L.builder.inspectorFields.score}>
            <Select value={block.score.mode} onChange={(e) => onPatch({ score: { ...block.score, mode: e.target.value as AssessmentBlock["score"]["mode"] } })}>
              {SCORE_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </Select>
          </Field>
          {block.score.mode !== "none" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Puntos">
                <NumberField value={block.score.points} min={0} onChange={(v) => onPatch({ score: { ...block.score, points: v ?? 0 } })} />
              </Field>
              <Field label={L.builder.inspectorFields.weight}>
                <NumberField value={block.score.weight} min={0} onChange={(v) => onPatch({ score: { ...block.score, weight: v ?? 1 } })} />
              </Field>
            </div>
          )}
          <Field label="Competencia" hint="Dimensión evaluada (opcional).">
            <TextInput value={block.score.competency} onChange={(e) => onPatch({ score: { ...block.score, competency: e.target.value } })} />
          </Field>
        </>
      )}

      <Field label={L.builder.inspectorFields.accessibility} hint="Etiqueta para lectores de pantalla.">
        <TextInput value={block.accessibility.ariaLabel} onChange={(e) => onPatch({ accessibility: { ...block.accessibility, ariaLabel: e.target.value } })} />
      </Field>

      <Field label={L.builder.inspectorFields.tags} hint="Separadas por comas.">
        <TextInput value={block.tags.join(", ")} onChange={(e) => onPatch({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} />
      </Field>
    </div>
  );
}
