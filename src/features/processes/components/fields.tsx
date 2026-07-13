import type { ReactNode } from "react";

/**
 * Lightweight, accessible form controls styled for the Liquid Glass surfaces.
 * Shared by the process editor and (re-exported) elsewhere. Labels are provided
 * by the caller in Spanish; every control wires `id`/`htmlFor` and an optional
 * error message with `aria-invalid` + `aria-describedby`.
 */

let autoId = 0;
function useFieldId(explicit?: string): string {
  // Deterministic-enough id without importing useId (keeps this a plain module).
  return explicit ?? `fld-${(autoId += 1)}`;
}

const inputBase =
  "w-full rounded-xl fill-soft px-3 py-2 text-sm text-ink outline-none ring-1 ring-[color:var(--hairline)] transition-all placeholder:text-ink-faint focus:ring-2 focus:ring-cyan-300";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="mb-1 flex items-center gap-1 text-xs font-semibold text-ink-soft">
        {label}
        {required && <span className="text-rose-400">*</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-[0.7rem] text-ink-faint">{hint}</span>}
      {error && (
        <span className="mt-1 block text-[0.7rem] font-semibold text-rose-400" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  error,
  hint,
  required,
  id,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  id?: string;
  type?: string;
}) {
  const fieldId = useFieldId(id);
  return (
    <Field label={label} htmlFor={fieldId} error={error} hint={hint} required={required}>
      <input
        id={fieldId}
        type={type}
        value={value}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        onChange={(e) => onChange(e.target.value)}
        className={inputBase}
      />
    </Field>
  );
}

export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  error,
  hint,
  id,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  error?: string;
  hint?: string;
  id?: string;
}) {
  const fieldId = useFieldId(id);
  return (
    <Field label={label} htmlFor={fieldId} error={error} hint={hint}>
      <input
        id={fieldId}
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        aria-invalid={Boolean(error)}
        onChange={(e) => onChange(Number(e.target.value))}
        className={inputBase}
      />
    </Field>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
  error,
  hint,
  id,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  error?: string;
  hint?: string;
  id?: string;
}) {
  const fieldId = useFieldId(id);
  return (
    <Field label={label} htmlFor={fieldId} error={error} hint={hint}>
      <textarea
        id={fieldId}
        rows={rows}
        value={value}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputBase} resize-y`}
      />
    </Field>
  );
}

export function SelectInput<T extends string>({
  label,
  value,
  onChange,
  options,
  error,
  hint,
  id,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  error?: string;
  hint?: string;
  id?: string;
}) {
  const fieldId = useFieldId(id);
  return (
    <Field label={label} htmlFor={fieldId} error={error} hint={hint}>
      <select
        id={fieldId}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={inputBase}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
