import type { ReactNode } from "react";

interface BaseProps {
  label: string;
  hint?: string;
  required?: boolean;
}

function Label({ label, required, hint }: BaseProps) {
  return (
    <span className="mb-1.5 flex items-center justify-between">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-200/70">
        {label}
        {required && <span className="ml-1 text-cyan-300">*</span>}
      </span>
      {hint && <span className="text-[0.65rem] text-slate-400">{hint}</span>}
    </span>
  );
}

const fieldClass =
  "glass w-full rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-400 outline-none focus-within:ring-2 focus-within:ring-cyan-300/70";

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
          className={`${fieldClass} appearance-none pr-9 ${value ? "" : "text-slate-400"}`}
        >
          <option value="" disabled className="bg-slate-900 text-slate-400">
            {placeholder}
          </option>
          {options.map((opt) => (
            <option key={opt} value={opt} className="bg-slate-900 text-white">
              {opt}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-300">
          ▾
        </span>
      </div>
    </label>
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
      <legend className="mb-1 text-sm font-bold text-white drop-shadow-md">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}
