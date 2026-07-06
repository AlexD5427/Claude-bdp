import { Filter, X, CalendarRange } from "lucide-react";
import {
  resetFilters,
  setFilters,
  useFilters,
  type PeriodMode,
} from "../lib/filtersStore";
import { useFilteredData } from "../lib/useFilteredData";

const PERIODS: { id: PeriodMode; label: string }[] = [
  { id: "all", label: "Todo" },
  { id: "anio", label: "Año" },
  { id: "mes", label: "Mes" },
  { id: "semana", label: "Semana" },
  { id: "rango", label: "Rango" },
];

/**
 * The universal KPI filter bar. Rendered once, above the KPI row, it drives the
 * workspace-wide {@link ../lib/filtersStore} so every KPI (Dashboard + each
 * module) narrows together. Temporal presets cover Año / Mes / Semana plus a
 * custom range; the four process dimensions (Gerencia, Agencia, Modalidad,
 * Estado) are populated from the Auxiliar catalogues and the Espejo sheets, and
 * only appear when there are options to choose from.
 */
export function FilterBar() {
  const f = useFilters();
  const { options, active } = useFilteredData();

  const dims: { key: "gerencia" | "agencia" | "modalidad" | "estado"; label: string; opts: string[] }[] = [
    { key: "gerencia", label: "Gerencia", opts: options.gerencia },
    { key: "agencia", label: "Agencia", opts: options.agencia },
    { key: "modalidad", label: "Modalidad", opts: options.modalidad },
    { key: "estado", label: "Estado", opts: options.estado },
  ];
  const anyDim = dims.some((d) => d.opts.length > 0);

  return (
    <div className="no-print mb-3 flex flex-wrap items-center gap-2 rounded-2xl glass px-3 py-2.5">
      <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-soft">
        <Filter className="h-3.5 w-3.5 text-cyan-400" />
        Filtros
      </span>

      {/* Temporal presets */}
      <div className="flex items-center gap-1 rounded-full fill-softer p-1">
        {PERIODS.map((p) => {
          const on = f.periodMode === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setFilters({ periodMode: p.id })}
              className={[
                "rounded-full px-2.5 py-1 text-xs font-semibold transition-all",
                on ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white shadow-glow-cyan" : "text-ink-soft hover:fill-soft",
              ].join(" ")}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {f.periodMode === "rango" && (
        <div className="flex items-center gap-1.5 rounded-full fill-softer px-2.5 py-1 text-xs text-ink-soft">
          <CalendarRange className="h-3.5 w-3.5 text-cyan-400" />
          <input
            type="date"
            value={f.from}
            onChange={(e) => setFilters({ from: e.target.value })}
            className="bg-transparent text-xs text-ink outline-none [color-scheme:light] dark:[color-scheme:dark]"
            aria-label="Desde"
          />
          <span>—</span>
          <input
            type="date"
            value={f.to}
            onChange={(e) => setFilters({ to: e.target.value })}
            className="bg-transparent text-xs text-ink outline-none [color-scheme:light] dark:[color-scheme:dark]"
            aria-label="Hasta"
          />
        </div>
      )}

      {/* Dimension selects */}
      {anyDim &&
        dims
          .filter((d) => d.opts.length > 0)
          .map((d) => (
            <div key={d.key} className="relative">
              <select
                value={f[d.key]}
                onChange={(e) => setFilters({ [d.key]: e.target.value })}
                className={[
                  "appearance-none rounded-full fill-softer py-1.5 pl-3 pr-7 text-xs font-semibold outline-none ring-1 ring-[color:var(--hairline)] transition-all focus:ring-2 focus:ring-cyan-400/70",
                  f[d.key] ? "text-ink" : "text-ink-soft",
                ].join(" ")}
              >
                <option value="">{d.label}: Todas</option>
                {d.opts.map((o) => (
                  <option key={o} value={o} className="bg-slate-900 text-white">
                    {o}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[0.6rem] text-ink-soft">
                ▾
              </span>
            </div>
          ))}

      {!anyDim && (
        <span className="text-[0.7rem] text-ink-faint">
          Los filtros por Gerencia/Agencia/Modalidad/Estado se activan al conectar las hojas Auxiliar y Espejo.
        </span>
      )}

      {active && (
        <button
          type="button"
          onClick={resetFilters}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-3 py-1.5 text-xs font-bold text-rose-500 ring-1 ring-rose-400/40 transition-all hover:bg-rose-500/25 active:scale-95"
        >
          <X className="h-3.5 w-3.5" />
          Limpiar
        </button>
      )}
    </div>
  );
}
