import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { L } from "../../content/locale";

const baseField =
  "w-full rounded-2xl fill-soft px-3.5 py-2.5 text-sm text-ink outline-none ring-1 ring-[color:var(--hairline)] transition-shadow placeholder:text-ink-faint focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-60";

/** A labelled field wrapper with hint + error + required marker. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className = "",
}: {
  label?: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={htmlFor} className="text-xs font-bold uppercase tracking-wide text-ink-soft">
          {label}
          {required && (
            <span className="ml-1 text-rose-400" aria-label={L.a11y.requiredField}>
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs font-semibold text-rose-300">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className = "", ...rest }, ref) {
    return <input ref={ref} className={`${baseField} ${className}`} {...rest} />;
  },
);

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className = "", rows = 4, ...rest }, ref) {
    return <textarea ref={ref} rows={rows} className={`${baseField} resize-y ${className}`} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = "", children, ...rest }, ref) {
    return (
      <select ref={ref} className={`${baseField} ${className}`} {...rest}>
        {children}
      </select>
    );
  },
);

/** Number field that reports parsed numeric values (null when empty). */
export function NumberField({
  value,
  onChange,
  className = "",
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      className={`${baseField} ${className}`}
      value={value ?? ""}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(raw === "" ? null : Number(raw));
      }}
      {...rest}
    />
  );
}

/** An accessible glass switch. */
export function Switch({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  id?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <label htmlFor={inputId} className="inline-flex cursor-pointer items-center gap-2.5">
      <span className="relative inline-flex">
        <input
          id={inputId}
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className="h-6 w-11 rounded-full fill-softer ring-1 ring-[color:var(--hairline)] transition-colors peer-checked:bg-gradient-to-br peer-checked:from-[#00b0d8] peer-checked:to-[#005baa] peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-300" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
      <span className="text-sm font-medium text-ink">{label}</span>
    </label>
  );
}
