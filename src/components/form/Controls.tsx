import type { ReactNode } from "react";

/**
 * Small, reusable glass form controls shared by the Configuración module and
 * the email-format editor: an on/off switch, a labelled range slider and a
 * numeric stepper. They intentionally mirror the look of the existing
 * `Fields.tsx` inputs so the whole system stays visually consistent.
 */

export function Toggle({
  title,
  subtitle,
  checked,
  onChange,
  icon,
}: {
  title: string;
  subtitle?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={[
        "flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left ring-1 transition-all active:scale-[0.99]",
        checked
          ? "bg-gradient-to-br from-[#00b0d8]/15 to-[#005baa]/15 ring-cyan-400/40"
          : "fill-softer ring-[color:var(--hairline)] hover:fill-soft",
      ].join(" ")}
    >
      {icon && (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl fill-softer text-cyan-400 ring-1 ring-[color:var(--hairline)]">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-ink">{title}</div>
        {subtitle && <div className="truncate text-xs text-ink-faint">{subtitle}</div>}
      </div>
      <span
        className={[
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked
            ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa]"
            : "fill-soft ring-1 ring-[color:var(--hairline)]",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-0.5 grid h-5 w-5 place-items-center rounded-full bg-white shadow transition-all",
            checked ? "left-[1.4rem]" : "left-0.5",
          ].join(" ")}
        />
      </span>
    </button>
  );
}

export function RangeField({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</span>
        <span className="rounded-full fill-softer px-2 py-0.5 text-xs font-black text-ink ring-1 ring-[color:var(--hairline)]">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="cfg-range w-full"
      />
      {hint && <span className="mt-1 block text-[0.65rem] text-ink-faint">{hint}</span>}
    </label>
  );
}

export function StepperField({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</span>
        {hint && <span className="text-[0.65rem] text-ink-faint">{hint}</span>}
      </span>
      <div className="glass flex items-center justify-between rounded-xl px-2 py-1.5">
        <button
          type="button"
          aria-label="Disminuir"
          onClick={() => onChange(clamp(value - step))}
          className="grid h-8 w-8 place-items-center rounded-lg fill-softer text-ink ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-90"
        >
          −
        </button>
        <span className="text-base font-black text-ink">{value}</span>
        <button
          type="button"
          aria-label="Aumentar"
          onClick={() => onChange(clamp(value + step))}
          className="grid h-8 w-8 place-items-center rounded-lg fill-softer text-ink ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-90"
        >
          +
        </button>
      </div>
    </label>
  );
}
