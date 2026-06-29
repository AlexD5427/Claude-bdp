import type { ReactNode } from "react";

interface BaseProps {
  label: string;
  hint?: string;
  required?: boolean;
}

function Label({ label, required, hint }: BaseProps) {
  return (
    <span className="mb-1.5 flex items-center justify-between gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
        {label}
        {required && <span className="ml-1 text-cyan-400">*</span>}
      </span>
      {hint && <span className="text-[0.65rem] text-ink-faint">{hint}</span>}
    </span>
  );
}

const fieldClass =
  "glass w-full rounded-xl px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint outline-none focus-within:ring-2 focus-within:ring-cyan-400/70";

export function TextField({
  label,
  required,
  hint,
  value,
  onChange,
  placeholder,
  type = "text",
}: BaseProps & {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <Label label={label} required={required} hint={hint} />
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={fieldClass}
      />
    </label>
  );
}

export function TextAreaField({
  label,
  required,
  hint,
  value,
  onChange,
  placeholder,
  rows = 3,
}: BaseProps & {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block">
      <Label label={label} required={required} hint={hint} />
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${fieldClass} resize-y leading-relaxed`}
      />
    </label>
  );
}

export function SelectField({
  label,
  required,
  hint,
  value,
  onChange,
  options,
  placeholder = "Seleccione…",
}: BaseProps & {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder?: string;
}) {
  return (
    <label className="block">
      <Label label={label} required={required} hint={hint} />
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${fieldClass} appearance-none pr-9 ${value ? "" : "text-ink-faint"}`}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((opt) => (
            <option key={opt} value={opt} className="bg-slate-900 text-white">
              {opt}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft">
          ▾
        </span>
      </div>
    </label>
  );
}

/**
 * A pill-style segmented control — friendlier than a dropdown for short option
 * sets (e.g. risk levels, reliability). Highlights the active option with the
 * corporate gradient.
 */
export function SegmentedField({
  label,
  required,
  hint,
  value,
  onChange,
  options,
}: BaseProps & {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <div>
      <Label label={label} required={required} hint={hint} />
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = value === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(active ? "" : opt)}
              className={[
                "rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-all duration-300 ease-spring active:scale-95",
                active
                  ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white ring-white/40 shadow-glow-cyan"
                  : "fill-softer text-ink-soft ring-[color:var(--hairline)] hover:fill-soft",
              ].join(" ")}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A small section wrapper to group form fields under a heading. */
export function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-sm font-bold text-ink">{title}</legend>
      {children}
    </fieldset>
  );
}
