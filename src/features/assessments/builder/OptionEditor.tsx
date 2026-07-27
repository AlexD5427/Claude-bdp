import { useId } from "react";
import { ChevronDown, ChevronUp, Plus, RotateCcw, Trash2 } from "lucide-react";
import { L } from "../../../content/locale";
import { TextInput } from "../../../design-system/liquid-glass/fields";
import { capabilitiesOf } from "../question-types";
import type { AssessmentBlock, AssessmentOption } from "../domain/questions";
import type { BuilderAction } from "./builderState";

interface OptionEditorProps {
  block: AssessmentBlock;
  dispatch: (action: BuilderAction) => void;
  /** Resalta la lista cuando la revisión apunta a las opciones. */
  highlighted: boolean;
  error: string | null;
}

/**
 * Editor de opciones.
 *
 * Hace imposibles los estados imposibles:
 *  · En los tipos de respuesta única, marcar una opción como correcta desmarca
 *    automáticamente las demás (lo aplica el reducer, no este componente).
 *  · Verdadero/Falso usa opciones fijas: no se pueden agregar, quitar ni
 *    renombrar, solo elegir cuál es la correcta y restaurarlas si se dañaron.
 *  · El máximo de opciones del tipo se respeta deshabilitando el botón.
 *
 * El reordenamiento es accesible con botones «mover arriba / abajo»; no depende
 * de arrastrar y soltar.
 */
export function OptionEditor({ block, dispatch, highlighted, error }: OptionEditorProps) {
  const caps = capabilitiesOf(block.type);
  const groupId = useId();
  if (!caps.options) return null;

  const fixed = caps.fixedOptions !== null;
  const atMax = caps.maxOptions !== null && block.options.length >= caps.maxOptions;
  const correctHint = caps.exactlyOneCorrect
    ? L.builder.editor.correctAnswerSingle
    : L.builder.editor.correctAnswerMultiple;

  return (
    <section
      className={`rounded-2xl p-3 ring-1 transition-shadow ${
        highlighted ? "ring-2 ring-cyan-300" : "ring-[color:var(--hairline)]"
      } fill-soft`}
      aria-labelledby={`${groupId}-title`}
    >
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h4 id={`${groupId}-title`} className="text-xs font-bold uppercase tracking-wide text-ink-soft">
            {L.builder.editor.options}
          </h4>
          <p className="mt-0.5 text-[0.7rem] text-ink-faint">
            {fixed ? L.builder.editor.fixedOptions : correctHint}
          </p>
        </div>
        {fixed ? (
          <button
            type="button"
            onClick={() => dispatch({ type: "resetFixedOptions", blockId: block.id })}
            className="inline-flex items-center gap-1.5 rounded-full fill-softer px-2.5 py-1 text-xs font-semibold text-ink ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-soft focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <RotateCcw className="h-3.5 w-3.5" /> {L.builder.editor.restoreFixedOptions}
          </button>
        ) : (
          <button
            type="button"
            disabled={atMax}
            onClick={() => dispatch({ type: "addOption", blockId: block.id })}
            className="inline-flex items-center gap-1.5 rounded-full fill-softer px-2.5 py-1 text-xs font-semibold text-ink ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-soft focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-45"
          >
            <Plus className="h-3.5 w-3.5" /> {L.builder.editor.addOption}
          </button>
        )}
      </header>

      {error && (
        <p role="alert" className="mb-2 text-xs font-semibold text-rose-300">
          {error}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {block.options.map((option, index) => (
          <OptionRow
            key={option.id}
            block={block}
            option={option}
            index={index}
            total={block.options.length}
            fixed={fixed}
            exclusive={caps.exactlyOneCorrect}
            showMatchingKey={caps.expects === "ordering" || caps.expects === "matching"}
            groupId={groupId}
            dispatch={dispatch}
          />
        ))}
      </ul>
    </section>
  );
}

interface RowProps {
  block: AssessmentBlock;
  option: AssessmentOption;
  index: number;
  total: number;
  fixed: boolean;
  exclusive: boolean;
  showMatchingKey: boolean;
  groupId: string;
  dispatch: (action: BuilderAction) => void;
}

function OptionRow({
  block,
  option,
  index,
  total,
  fixed,
  exclusive,
  showMatchingKey,
  groupId,
  dispatch,
}: RowProps) {
  const scored = block.score.mode !== "none";
  const perOption = block.score.mode === "per_option" || block.score.mode === "partial";
  return (
    <li className="rounded-xl fill-softer p-2.5 ring-1 ring-[color:var(--hairline)]">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg fill-soft text-[0.65rem] font-bold tabular-nums text-ink-soft">
          {index + 1}
        </span>
        <TextInput
          value={option.label}
          readOnly={fixed}
          aria-label={`${L.builder.editor.optionText} ${index + 1}`}
          onChange={(event) =>
            dispatch({
              type: "updateOption",
              blockId: block.id,
              optionId: option.id,
              patch: { label: event.target.value },
            })
          }
          className={`flex-1 ${fixed ? "opacity-70" : ""}`}
          maxLength={1000}
        />
        <span className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            aria-label={`${L.builder.moveUp}: ${option.label}`}
            disabled={index === 0}
            onClick={() => dispatch({ type: "moveOption", blockId: block.id, optionId: option.id, dir: -1 })}
            className="grid h-7 w-7 place-items-center rounded-full text-ink-soft transition-colors hover:fill-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-30"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label={`${L.builder.moveDown}: ${option.label}`}
            disabled={index === total - 1}
            onClick={() => dispatch({ type: "moveOption", blockId: block.id, optionId: option.id, dir: 1 })}
            className="grid h-7 w-7 place-items-center rounded-full text-ink-soft transition-colors hover:fill-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-30"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {!fixed && (
            <button
              type="button"
              aria-label={`${L.builder.editor.removeOption}: ${option.label}`}
              onClick={() => dispatch({ type: "removeOption", blockId: block.id, optionId: option.id })}
              className="grid h-7 w-7 place-items-center rounded-full text-ink-soft transition-colors hover:bg-rose-500/70 hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-ink-soft">
          <input
            type={exclusive ? "radio" : "checkbox"}
            name={exclusive ? `${groupId}-correct` : undefined}
            checked={option.correct}
            onChange={(event) =>
              dispatch({
                type: "setCorrectOption",
                blockId: block.id,
                optionId: option.id,
                correct: exclusive ? true : event.target.checked,
              })
            }
            className="h-3.5 w-3.5 accent-emerald-500"
          />
          {L.builder.editor.correctAnswer}
        </label>

        {scored && perOption && (
          <label className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
            {L.builder.editor.optionScore}
            <input
              type="number"
              value={option.score}
              onChange={(event) =>
                dispatch({
                  type: "updateOption",
                  blockId: block.id,
                  optionId: option.id,
                  patch: { score: Number(event.target.value) || 0 },
                })
              }
              className="w-16 rounded-lg fill-soft px-2 py-1 text-xs text-ink outline-none ring-1 ring-[color:var(--hairline)] focus-visible:ring-2 focus-visible:ring-cyan-300"
            />
          </label>
        )}

        {showMatchingKey && (
          <label className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-xs text-ink-soft">
            <span className="shrink-0">{L.builder.editor.matchingKey}</span>
            <TextInput
              value={option.matchingKey}
              placeholder={L.builder.editor.matchingKeyHint}
              aria-label={`${L.builder.editor.matchingKey} ${index + 1}`}
              onChange={(event) =>
                dispatch({
                  type: "updateOption",
                  blockId: block.id,
                  optionId: option.id,
                  patch: { matchingKey: event.target.value },
                })
              }
              className="!py-1 !text-xs"
              maxLength={200}
            />
          </label>
        )}
      </div>
    </li>
  );
}
