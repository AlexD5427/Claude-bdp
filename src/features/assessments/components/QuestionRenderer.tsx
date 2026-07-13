import { useState } from "react";
import { ArrowDown, ArrowUp, Star, Upload } from "lucide-react";
import { formatDuration } from "../../../shared/format";
import { getPlugin } from "../question-types/registry";
import type { AssessmentQuestion } from "../types";

/**
 * Candidate-facing renderer for a single question, used by the preview and the
 * builder canvas. It renders an interactive representation for every supported
 * family. Drag-based question types (ranking / order) always include a
 * keyboard-accessible alternative (up/down buttons) so no interaction is
 * pointer-only. It never displays correct answers or scores.
 */
export function QuestionRenderer({ question }: { question: AssessmentQuestion }) {
  const plugin = getPlugin(question.type);

  if (!plugin) {
    return (
      <div className="rounded-2xl border border-dashed border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-300">
        Tipo de pregunta no soportado: <code>{question.type}</code>. Se omite en la vista del candidato.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {question.family !== "content" && (
        <div>
          <p className="text-sm font-semibold text-ink">
            {question.label || "Pregunta sin enunciado"}
            {question.required && <span className="ml-1 text-rose-400">*</span>}
          </p>
          {question.description && <p className="mt-0.5 text-xs text-ink-soft">{question.description}</p>}
        </div>
      )}
      <QuestionBody question={question} />
      {question.helpText && <p className="text-[0.7rem] text-ink-faint">{question.helpText}</p>}
    </div>
  );
}

function QuestionBody({ question }: { question: AssessmentQuestion }) {
  const cfg = question.config as Record<string, unknown>;

  switch (question.type) {
    /* content */
    case "title":
      return <h3 className="text-xl font-black text-ink">{question.label}</h3>;
    case "subtitle":
      return <h4 className="text-base font-bold text-ink">{question.label}</h4>;
    case "paragraph":
      return <p className="text-sm text-ink-soft">{question.label}</p>;
    case "instructions":
      return (
        <div className="rounded-2xl fill-soft p-3 text-sm text-ink-soft ring-1 ring-[color:var(--hairline)]">
          {question.label}
        </div>
      );
    case "notice":
      return (
        <div className="rounded-2xl bg-amber-500/10 p-3 text-sm text-amber-200 ring-1 ring-amber-400/30">
          {question.label}
        </div>
      );
    case "divider":
      return <hr className="border-[color:var(--hairline)]" />;
    case "image_content":
      return (
        <div className="grid h-32 place-items-center rounded-2xl fill-soft text-xs text-ink-faint ring-1 ring-[color:var(--hairline)]">
          {String(cfg.url || "Imagen (URL no configurada)")}
        </div>
      );

    /* text */
    case "short_text":
      return <TextField />;
    case "long_text":
    case "essay":
      return <TextArea />;
    case "code":
    case "sql":
      return <TextArea mono placeholder={question.type === "sql" ? "SELECT …" : "// código"} />;

    /* numeric */
    case "integer":
    case "decimal":
    case "percentage":
    case "currency":
      return (
        <div className="flex items-center gap-2">
          {question.type === "currency" && <span className="text-sm text-ink-soft">Bs</span>}
          <input
            type="number"
            className="w-40 rounded-xl fill-soft px-3 py-2 text-sm text-ink ring-1 ring-[color:var(--hairline)]"
            placeholder="0"
          />
          {question.type === "percentage" && <span className="text-sm text-ink-soft">%</span>}
        </div>
      );

    /* datetime */
    case "date":
      return <input type="date" className="rounded-xl fill-soft px-3 py-2 text-sm text-ink ring-1 ring-[color:var(--hairline)]" />;
    case "time":
      return <input type="time" className="rounded-xl fill-soft px-3 py-2 text-sm text-ink ring-1 ring-[color:var(--hairline)]" />;
    case "datetime":
      return <input type="datetime-local" className="rounded-xl fill-soft px-3 py-2 text-sm text-ink ring-1 ring-[color:var(--hairline)]" />;

    /* choice */
    case "single_choice":
    case "true_false":
    case "yes_no_na":
    case "scenario_case":
      return <ChoiceGroup question={question} multiple={false} scenario={question.type === "scenario_case"} />;
    case "multiple_choice":
      return <ChoiceGroup question={question} multiple />;
    case "dropdown":
      return (
        <select className="w-full max-w-sm rounded-xl fill-soft px-3 py-2 text-sm text-ink ring-1 ring-[color:var(--hairline)]">
          <option value="">Selecciona una opción…</option>
          {question.options.map((o) => (
            <option key={o.id} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );

    /* scale */
    case "likert":
      return <ChoiceGroup question={question} multiple={false} inline />;
    case "numeric_scale":
    case "nps":
      return <NumericScale min={Number(cfg.min ?? 1)} max={Number(cfg.max ?? 5)} />;
    case "star_rating":
      return <StarRating max={Number(cfg.max ?? 5)} />;

    /* matrix */
    case "matrix_single":
      return <MatrixSingle rows={(cfg.rows as string[]) ?? []} columns={(cfg.columns as string[]) ?? []} />;

    /* ordering */
    case "ranking":
    case "drag_order":
      return <OrderableList question={question} />;

    /* file */
    case "file_upload":
      return (
        <div className="flex items-center gap-2 rounded-2xl border border-dashed border-[color:var(--hairline)] p-4 text-sm text-ink-soft">
          <Upload className="h-4 w-4" /> Adjuntar archivo
          {question.validation.fileTypes && (
            <span className="text-[0.7rem] text-ink-faint">
              ({question.validation.fileTypes.join(", ")} · máx {question.validation.maxFileSizeMb ?? 10} MB)
            </span>
          )}
        </div>
      );

    /* banking sims */
    default:
      if (question.family === "banking") {
        return (
          <div className="rounded-2xl border border-dashed border-cyan-400/30 bg-cyan-500/5 p-4 text-sm text-ink-soft">
            Simulación bancaria avanzada (datos ficticios). Disponible detrás de una bandera de función.
          </div>
        );
      }
      return <TextField />;
  }
}

function TextField() {
  return (
    <input
      type="text"
      className="w-full max-w-md rounded-xl fill-soft px-3 py-2 text-sm text-ink ring-1 ring-[color:var(--hairline)]"
      placeholder="Tu respuesta"
    />
  );
}

function TextArea({ mono, placeholder }: { mono?: boolean; placeholder?: string }) {
  return (
    <textarea
      rows={mono ? 5 : 3}
      placeholder={placeholder ?? "Tu respuesta"}
      className={`w-full rounded-xl fill-soft px-3 py-2 text-sm text-ink ring-1 ring-[color:var(--hairline)] ${
        mono ? "font-mono" : ""
      }`}
    />
  );
}

function ChoiceGroup({
  question,
  multiple,
  inline,
  scenario,
}: {
  question: AssessmentQuestion;
  multiple: boolean;
  inline?: boolean;
  scenario?: boolean;
}) {
  const cfg = question.config as Record<string, unknown>;
  return (
    <div className="space-y-2">
      {scenario && cfg.scenario ? (
        <div className="rounded-2xl fill-soft p-3 text-sm text-ink-soft ring-1 ring-[color:var(--hairline)]">
          {String(cfg.scenario)}
        </div>
      ) : null}
      <div className={inline ? "flex flex-wrap gap-2" : "space-y-1.5"}>
        {question.options.map((o) => (
          <label
            key={o.id}
            className="flex items-center gap-2 rounded-xl fill-soft px-3 py-2 text-sm text-ink ring-1 ring-[color:var(--hairline)]"
          >
            <input type={multiple ? "checkbox" : "radio"} name={question.id} className="accent-cyan-500" />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function NumericScale({ min, max }: { min: number; max: number }) {
  const values = [];
  for (let i = min; i <= max; i++) values.push(i);
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          className="grid h-9 w-9 place-items-center rounded-xl fill-soft text-sm font-semibold text-ink ring-1 ring-[color:var(--hairline)] transition-colors hover:bg-cyan-500/15"
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function StarRating({ max }: { max: number }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {Array.from({ length: max }, (_, i) => i + 1).map((v) => (
        <button
          key={v}
          type="button"
          aria-label={`${v} de ${max}`}
          onMouseEnter={() => setHover(v)}
          onMouseLeave={() => setHover(0)}
          className="text-amber-300"
        >
          <Star className={`h-6 w-6 ${v <= hover ? "fill-amber-300" : "fill-transparent"}`} />
        </button>
      ))}
    </div>
  );
}

function MatrixSingle({ rows, columns }: { rows: string[]; columns: string[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-ink-soft">
            <th />
            {columns.map((c) => (
              <th key={c} className="px-2 py-1 text-center text-xs font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r} className="border-t border-[color:var(--hairline)]">
              <td className="py-2 pr-3 text-ink">{r}</td>
              {columns.map((c) => (
                <td key={c} className="text-center">
                  <input type="radio" name={`matrix-${ri}`} className="accent-cyan-500" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrderableList({ question }: { question: AssessmentQuestion }) {
  const [order, setOrder] = useState(question.options.map((o) => o.id));
  const move = (index: number, dir: -1 | 1) => {
    const next = [...order];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
  };
  const byId = new Map(question.options.map((o) => [o.id, o]));
  return (
    <ul className="space-y-1.5">
      {order.map((id, index) => {
        const o = byId.get(id);
        if (!o) return null;
        return (
          <li
            key={id}
            className="flex items-center gap-2 rounded-xl fill-soft px-3 py-2 text-sm text-ink ring-1 ring-[color:var(--hairline)]"
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-[color:var(--fill-2)] text-xs font-bold">
              {index + 1}
            </span>
            <span className="flex-1">{o.label}</span>
            <button
              type="button"
              aria-label="Subir"
              onClick={() => move(index, -1)}
              className="grid h-7 w-7 place-items-center rounded-lg text-ink-soft hover:bg-[color:var(--fill-2)]"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Bajar"
              onClick={() => move(index, 1)}
              className="grid h-7 w-7 place-items-center rounded-lg text-ink-soft hover:bg-[color:var(--fill-2)]"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Small helper the preview footer uses. */
export function readableDuration(seconds: number): string {
  return formatDuration(seconds);
}
