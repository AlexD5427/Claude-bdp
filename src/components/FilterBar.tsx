import { useRef } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { resetFilters, setFilters, useFilters, type PeriodMode } from "../lib/filtersStore";
import { useFilteredData, type FilterOptions } from "../lib/useFilteredData";

const PERIODS: { id: PeriodMode; label: string }[] = [
  { id: "all", label: "Todo" },
  { id: "anio", label: "Año" },
  { id: "mes", label: "Mes" },
  { id: "semana", label: "Semana" },
  { id: "rango", label: "Rango" },
];

const DIMENSIONS: { key: keyof FilterOptions; label: string }[] = [
  { key: "gerencia", label: "Gerencia" },
  { key: "agencia", label: "Agencia" },
  { key: "modalidad", label: "Modalidad" },
  { key: "estado", label: "Estado" },
];

export function FilterBar() {
  const filters = useFilters();
  const { options, active } = useFilteredData();
  const allPeriod = useRef<HTMLButtonElement>(null);
  const dimensions = DIMENSIONS.filter(({ key }) => options[key].length > 0);

  return (
    <div className="bdp-filterbar no-print" role="group" aria-label="Filtros globales">
      <span className="bdp-filterbar__label">
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Filtros
      </span>
      <div className="bdp-periods" role="group" aria-label="Periodo">
        {PERIODS.map(({ id, label }) => (
          <button
            key={id}
            ref={id === "all" ? allPeriod : undefined}
            type="button"
            aria-pressed={filters.periodMode === id}
            onClick={() => setFilters({ periodMode: id })}
          >
            {label}
          </button>
        ))}
      </div>

      {filters.periodMode === "rango" && (
        <div className="bdp-range" role="group" aria-label="Rango de fechas">
          <label className="flex min-w-0 flex-wrap items-center gap-1">
            Desde
            <input type="date" value={filters.from} onChange={(event) => setFilters({ from: event.target.value })} />
          </label>
          <label className="flex min-w-0 flex-wrap items-center gap-1">
            Hasta
            <input type="date" value={filters.to} onChange={(event) => setFilters({ to: event.target.value })} />
          </label>
        </div>
      )}

      {dimensions.map(({ key, label }) => (
        <label key={key} className="bdp-filter-select">
          <span className="sr-only">{label}</span>
          <select value={filters[key]} onChange={(event) => setFilters({ [key]: event.target.value })}>
            <option value="">{label}: Todas</option>
            {options[key].map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
      ))}

      {dimensions.length === 0 && <span className="text-xs text-ink-faint">Las dimensiones aparecen cuando hay datos en Auxiliar y Espejo.</span>}
      {active && (
        <button type="button" className="bdp-filter-clear" onClick={() => {
          resetFilters();
          allPeriod.current?.focus({ preventScroll: true });
        }}>
          <X className="h-3.5 w-3.5" aria-hidden="true" /> Limpiar filtros
        </button>
      )}
    </div>
  );
}
