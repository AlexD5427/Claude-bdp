import { forwardRef, useRef, type ReactNode } from "react";

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

export const TextField = forwardRef<
  HTMLInputElement,
  BaseProps & {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    type?: string;
    /** Read-only fields (e.g. the identificador while editing) can't be typed
     *  into but stay legible and copyable. */
    readOnly?: boolean;
  }
>(function TextField(
  { label, required, hint, value, onChange, placeholder, type = "text", readOnly = false },
  ref,
) {
  return (
    <label className="block">
      <Label label={label} required={required} hint={hint} />
      <input
        ref={ref}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        aria-readonly={readOnly}
        className={`${fieldClass} ${readOnly ? "cursor-not-allowed opacity-70" : ""}`}
      />
    </label>
  );
});

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

/** A native date picker styled to match the glass fields. */
export function DateField({
  label,
  required,
  hint,
  value,
  onChange,
}: BaseProps & {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <Label label={label} required={required} hint={hint} />
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${fieldClass} [color-scheme:light] dark:[color-scheme:dark]`}
      />
    </label>
  );
}

/** Semantic tones an option can carry (drives the active pill colour). */
export type SegmentTone = "green" | "amber" | "red";

const TONE_ACTIVE: Record<SegmentTone, string> = {
  green:
    "bg-gradient-to-br from-emerald-500 to-green-600 text-white ring-white/40 shadow-[0_0_16px_rgba(16,185,129,0.6)]",
  amber:
    "bg-gradient-to-br from-amber-400 to-yellow-500 text-white ring-white/40 shadow-[0_0_16px_rgba(245,158,11,0.6)]",
  red: "bg-gradient-to-br from-rose-500 to-red-600 text-white ring-white/40 shadow-[0_0_16px_rgba(244,63,94,0.6)]",
};

/**
 * A pill-style segmented control — friendlier than a dropdown for short option
 * sets (e.g. risk levels, reliability). Highlights the active option with the
 * corporate gradient, or with a semantic colour when `toneFor` is supplied.
 *
 * It behaves as an accessible radiogroup with **roving tabindex**: the control
 * is a single Tab stop and the ←/→/↑/↓ arrows move between options (selecting
 * as they go), so the whole form is navigable without a mouse.
 */
export function SegmentedField({
  label,
  required,
  hint,
  value,
  onChange,
  options,
  toneFor,
}: BaseProps & {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  /** Optional semantic colour per option. */
  toneFor?: (opt: string) => SegmentTone | undefined;
}) {
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // Which option owns the Tab stop: the selected one, else the first.
  const selectedIndex = Math.max(0, options.indexOf(value));

  function focusOption(i: number) {
    const idx = (i + options.length) % options.length;
    btnRefs.current[idx]?.focus();
    onChange(options[idx]);
  }

  function onKeyDown(e: React.KeyboardEvent, i: number) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      focusOption(i + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      focusOption(i - 1);
    }
  }

  return (
    <div>
      <Label label={label} required={required} hint={hint} />
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((opt, i) => {
          const active = value === opt;
          const tone = active ? toneFor?.(opt) : undefined;
          return (
            <button
              key={opt}
              ref={(el) => {
                btnRefs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={i === selectedIndex ? 0 : -1}
              onClick={() => onChange(active ? "" : opt)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={[
                "rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-all duration-300 ease-spring active:scale-95 focus-visible:ring-2 focus-visible:ring-cyan-300",
                active
                  ? tone
                    ? TONE_ACTIVE[tone]
                    : "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white ring-white/40 shadow-glow-cyan"
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
