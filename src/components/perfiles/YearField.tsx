import { Minus, Plus, CalendarDays } from "lucide-react";

/**
 * A year-only picker for `gestion_bdp`. Defaults to the current year and lets
 * the operator step or type another four-digit year — nothing else (no month,
 * day or time), exactly as the sheet stores it.
 */
export function YearField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const current = new Date().getFullYear();
  const num = /^\d{4}$/.test(value) ? Number(value) : current;
  const step = (delta: number) => onChange(String(Math.min(2100, Math.max(1980, num + delta))));

  return (
    <div className="inline-flex items-center gap-2">
      <span className="pointer-events-none grid h-10 w-10 place-items-center rounded-2xl fill-softer text-cyan-400 ring-1 ring-[color:var(--hairline)]">
        <CalendarDays className="h-4 w-4" />
      </span>
      <div className="inline-flex items-center overflow-hidden rounded-2xl fill-soft ring-1 ring-[color:var(--hairline)]">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Año anterior"
          className="grid h-10 w-10 place-items-center text-ink-soft transition-colors hover:fill-softer active:scale-90"
        >
          <Minus className="h-4 w-4" />
        </button>
        <input
          value={value}
          inputMode="numeric"
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
            onChange(digits);
          }}
          className="w-16 bg-transparent text-center text-base font-black tracking-wider text-ink outline-none"
          aria-label="Gestión (año)"
        />
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Año siguiente"
          className="grid h-10 w-10 place-items-center text-ink-soft transition-colors hover:fill-softer active:scale-90"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
