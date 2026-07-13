import { useId } from "react";
import type { AssessmentBlock } from "../domain/questions";
import { resolvePlugin, type AnswerValue } from "../question-types";

interface RendererProps {
  block: AssessmentBlock;
  candidateMode?: boolean;
  value?: AnswerValue;
  onValueChange?: (value: AnswerValue) => void;
  disabled?: boolean;
}

/**
 * Generic block renderer used by the canvas preview and the candidate-facing
 * preview. It never renders backend HTML — text is plain and React-escaped.
 * A plugin may supply its own `Preview`; otherwise this covers the MVP types by
 * kind. Every interactive control is keyboard-accessible.
 */
export function BlockRenderer({ block, candidateMode = false, value, onValueChange, disabled }: RendererProps) {
  const plugin = resolvePlugin(block.type);
  if (plugin.Preview) {
    return <plugin.Preview block={block} candidateMode={candidateMode} value={value} onValueChange={onValueChange} disabled={disabled} />;
  }
  return (
    <GenericBlock block={block} candidateMode={candidateMode} value={value} onValueChange={onValueChange} disabled={disabled} />
  );
}

function Label({ block }: { block: AssessmentBlock }) {
  if (!block.label) return null;
  return (
    <p className="text-sm font-semibold text-ink">
      {block.label}
      {block.required && <span className="ml-1 text-rose-400">*</span>}
    </p>
  );
}

function Help({ block }: { block: AssessmentBlock }) {
  if (!block.helpText) return null;
  return <p className="mt-1 text-xs text-ink-faint">{block.helpText}</p>;
}

function GenericBlock({ block, candidateMode, value, onValueChange, disabled }: RendererProps) {
  const groupId = useId();
  const type = block.type;
  const set = (v: AnswerValue) => onValueChange?.(v);
  const inputClass =
    "w-full rounded-2xl fill-soft px-3 py-2 text-sm text-ink outline-none ring-1 ring-[color:var(--hairline)] focus-visible:ring-2 focus-visible:ring-cyan-300";

  // Content blocks.
  if (type === "c_title") return <h3 className="text-xl font-black text-ink">{block.label || "Título"}</h3>;
  if (type === "c_subtitle") return <h4 className="text-base font-bold text-ink-soft">{block.label || "Subtítulo"}</h4>;
  if (type === "c_paragraph" || type === "c_rich_text" || type === "c_instructions" || type === "c_callout")
    return <p className="text-sm text-ink-soft">{block.description || block.label || "Texto"}</p>;
  if (type === "c_divider") return <hr className="border-[color:var(--hairline)]" />;
  if (type === "c_page_break") return <div className="rounded-xl border border-dashed border-[color:var(--hairline)] py-2 text-center text-xs text-ink-faint">Salto de página</div>;
  if (type === "c_image" || type === "c_video" || type === "c_audio" || type === "c_resource")
    return (
      <div className="rounded-2xl fill-soft p-4 text-center text-xs text-ink-faint ring-1 ring-[color:var(--hairline)]">
        {block.media?.url ? block.media.url : `Multimedia (${type})`}
        {block.media?.alt && <p className="mt-1 text-ink-soft">{block.media.alt}</p>}
      </div>
    );

  // Choice families.
  const isRadio = ["q_single_choice", "q_true_false", "q_yes_no_na", "q_likert", "q_image_choice", "q_stars"].includes(type);
  const isCheckbox = ["q_multiple_choice", "q_multiselect"].includes(type);
  if (isRadio || isCheckbox) {
    const selected = new Set(Array.isArray(value) ? value.map(String) : value != null ? [String(value)] : []);
    return (
      <fieldset className="border-0 p-0" disabled={disabled}>
        <legend className="mb-1">
          <Label block={block} />
        </legend>
        <Help block={block} />
        <div role={isRadio ? "radiogroup" : "group"} className="mt-2 flex flex-col gap-1.5">
          {block.options.map((o) => {
            const key = o.value || o.id;
            const checked = selected.has(key);
            return (
              <label key={o.id} className="flex items-center gap-2.5 rounded-xl fill-soft px-3 py-2 text-sm text-ink ring-1 ring-[color:var(--hairline)]">
                <input
                  type={isRadio ? "radio" : "checkbox"}
                  name={groupId}
                  checked={checked}
                  onChange={() => {
                    if (isRadio) set(key);
                    else {
                      const next = new Set(selected);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      set([...next]);
                    }
                  }}
                  className="h-4 w-4 accent-cyan-500"
                />
                {o.label}
                {/* Correct-answer markers only show OUTSIDE candidate mode. */}
                {!candidateMode && o.correct && <span className="ml-auto text-xs font-bold text-emerald-400">correcta</span>}
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  }

  if (type === "q_dropdown") {
    return (
      <div>
        <Label block={block} />
        <Help block={block} />
        <select disabled={disabled} className={`${inputClass} mt-2`} value={String(value ?? "")} onChange={(e) => set(e.target.value)}>
          <option value="">Selecciona…</option>
          {block.options.map((o) => <option key={o.id} value={o.value || o.id}>{o.label}</option>)}
        </select>
      </div>
    );
  }

  const numeric = ["q_integer", "q_decimal", "q_percentage", "q_currency", "q_numeric_scale"].includes(type);
  const dateType = type === "q_date" ? "date" : type === "q_time" ? "time" : type === "q_datetime" ? "datetime-local" : null;
  return (
    <div>
      <Label block={block} />
      <Help block={block} />
      {type === "q_long_text" ? (
        <textarea disabled={disabled} rows={4} className={`${inputClass} mt-2 resize-y`} value={String(value ?? "")} onChange={(e) => set(e.target.value)} />
      ) : (
        <input
          disabled={disabled}
          type={dateType ?? (numeric ? "number" : "text")}
          className={`${inputClass} mt-2`}
          value={value == null ? "" : String(value)}
          onChange={(e) => set(numeric ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)}
        />
      )}
    </div>
  );
}
