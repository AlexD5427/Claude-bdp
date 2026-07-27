import { useId } from "react";
import type { AssessmentBlock } from "../domain/questions";
import { capabilitiesOf, resolvePlugin, type AnswerValue } from "../question-types";

interface RendererProps {
  block: AssessmentBlock;
  candidateMode?: boolean;
  value?: AnswerValue;
  onValueChange?: (value: AnswerValue) => void;
  disabled?: boolean;
}

/**
 * Generic block renderer used by the builder canvas and the candidate preview.
 *
 * It never renders backend HTML — text is plain and React-escaped. A plugin may
 * supply its own `Preview`; otherwise the control is chosen from the plugin's
 * declared `capabilities.control`, so adding a question type never means editing
 * this file. Every interactive control is keyboard-accessible.
 *
 * `candidateMode` is what hides the answer key. It must be `true` anywhere a
 * candidate could see the output.
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

const INPUT_CLASS =
  "w-full rounded-2xl fill-soft px-3 py-2 text-sm text-ink outline-none ring-1 ring-[color:var(--hairline)] focus-visible:ring-2 focus-visible:ring-cyan-300";

function ContentBlock({ block }: { block: AssessmentBlock }) {
  const type = block.type;
  if (type === "c_title") return <h3 className="text-xl font-black text-ink">{block.label || "Título"}</h3>;
  if (type === "c_subtitle") return <h4 className="text-base font-bold text-ink-soft">{block.label || "Subtítulo"}</h4>;
  if (type === "c_divider") return <hr className="border-[color:var(--hairline)]" />;
  if (type === "c_page_break") {
    return (
      <div className="rounded-xl border border-dashed border-[color:var(--hairline)] py-2 text-center text-xs text-ink-faint">
        Salto de página
      </div>
    );
  }
  if (block.media) {
    return (
      <div className="rounded-2xl fill-soft p-4 text-center text-xs text-ink-faint ring-1 ring-[color:var(--hairline)]">
        {block.media.url ? block.media.url : `Multimedia (${type})`}
        {block.media.alt && <p className="mt-1 text-ink-soft">{block.media.alt}</p>}
      </div>
    );
  }
  return <p className="text-sm text-ink-soft">{block.description || block.label || "Texto"}</p>;
}

function GenericBlock({ block, candidateMode, value, onValueChange, disabled }: RendererProps) {
  const groupId = useId();
  const caps = capabilitiesOf(block.type);
  const set = (next: AnswerValue) => onValueChange?.(next);

  if (caps.control === "content") return <ContentBlock block={block} />;

  if (caps.control === "pending") {
    return (
      <div>
        <Label block={block} />
        <Help block={block} />
        <p className="mt-2 rounded-2xl border border-dashed border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Este tipo de pregunta aún no tiene un editor interactivo. Se guarda y se
          califica con revisión humana.
        </p>
      </div>
    );
  }

  if (caps.control === "radio" || caps.control === "checkbox") {
    const isRadio = caps.control === "radio";
    const selected = new Set(
      Array.isArray(value) ? value.map(String) : value != null ? [String(value)] : [],
    );
    return (
      <fieldset className="border-0 p-0" disabled={disabled}>
        <legend className="mb-1">
          <Label block={block} />
        </legend>
        <Help block={block} />
        <div role={isRadio ? "radiogroup" : "group"} className="mt-2 flex flex-col gap-1.5">
          {block.options.map((option) => {
            const key = option.value || option.id;
            const checked = selected.has(key);
            return (
              <label key={option.id} className="flex items-center gap-2.5 rounded-xl fill-soft px-3 py-2 text-sm text-ink ring-1 ring-[color:var(--hairline)]">
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
                {option.label}
                {/* Answer-key markers only ever render OUTSIDE candidate mode. */}
                {!candidateMode && option.correct && (
                  <span className="ml-auto text-xs font-bold text-emerald-400">correcta</span>
                )}
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  }

  if (caps.control === "select") {
    return (
      <div>
        <Label block={block} />
        <Help block={block} />
        <select
          disabled={disabled}
          className={`${INPUT_CLASS} mt-2`}
          value={String(value ?? "")}
          onChange={(e) => set(e.target.value)}
          aria-label={block.label || "Selecciona una opción"}
        >
          <option value="">Selecciona…</option>
          {block.options.map((option) => (
            <option key={option.id} value={option.value || option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (caps.control === "ordering") {
    const order = Array.isArray(value) ? value.map(String) : [];
    return (
      <div>
        <Label block={block} />
        <Help block={block} />
        <ol className="mt-2 flex flex-col gap-1.5">
          {block.options.map((option, index) => (
            <li
              key={option.id}
              className="flex items-center gap-2.5 rounded-xl fill-soft px-3 py-2 text-sm text-ink ring-1 ring-[color:var(--hairline)]"
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full fill-softer text-xs font-bold tabular-nums">
                {order.indexOf(option.value || option.id) >= 0
                  ? order.indexOf(option.value || option.id) + 1
                  : index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {!candidateMode && option.matchingKey && (
                <span className="shrink-0 text-xs font-bold text-emerald-400">→ {option.matchingKey}</span>
              )}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  if (caps.control === "matrix") {
    return (
      <div>
        <Label block={block} />
        <Help block={block} />
        <p className="mt-2 rounded-2xl fill-soft px-3 py-2 text-xs text-ink-faint ring-1 ring-[color:var(--hairline)]">
          Cuadrícula de respuesta. La califica una persona.
        </p>
      </div>
    );
  }

  if (caps.control === "upload") {
    return (
      <div>
        <Label block={block} />
        <Help block={block} />
        <p className="mt-2 rounded-2xl fill-soft px-3 py-2 text-xs text-ink-faint ring-1 ring-[color:var(--hairline)]">
          El candidato adjunta un archivo. La revisión es humana.
        </p>
      </div>
    );
  }

  const inputType =
    caps.control === "date"
      ? "date"
      : caps.control === "time"
        ? "time"
        : caps.control === "datetime"
          ? "datetime-local"
          : caps.control === "number"
            ? "number"
            : "text";

  return (
    <div>
      <Label block={block} />
      <Help block={block} />
      {caps.control === "textarea" ? (
        <textarea
          disabled={disabled}
          rows={Number(block.config.rows ?? 4)}
          className={`${INPUT_CLASS} mt-2 resize-y`}
          value={String(value ?? "")}
          onChange={(e) => set(e.target.value)}
          aria-label={block.label || "Respuesta"}
        />
      ) : (
        <input
          disabled={disabled}
          type={inputType}
          className={`${INPUT_CLASS} mt-2`}
          value={value == null ? "" : String(value)}
          onChange={(e) =>
            set(
              caps.control === "number"
                ? e.target.value === ""
                  ? null
                  : Number(e.target.value)
                : e.target.value,
            )
          }
          aria-label={block.label || "Respuesta"}
        />
      )}
    </div>
  );
}
