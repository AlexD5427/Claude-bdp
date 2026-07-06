import { useMemo } from "react";
import { useTalentData } from "../context/TalentDataContext";
import {
  filtersActive,
  periodRange,
  useFilters,
  type FilterState,
} from "./filtersStore";
import {
  candidateAttrs,
  indexEspejo,
  type EspejoIndex,
  type ProcesoAttrs,
} from "./procesos";
import type { Candidate } from "../types";

export interface FilterOptions {
  gerencia: string[];
  agencia: string[];
  modalidad: string[];
  estado: string[];
}

export interface FilteredData {
  /** Candidates after applying the universal filters. */
  candidatos: Candidate[];
  /** Process rows (from Espejo) after applying the filters. */
  procesos: ProcesoAttrs[];
  /** Ids of the surviving candidates (to subset the hiring store). */
  filteredIds: Set<string>;
  /** Dropdown options (Auxiliar ∪ Espejo distinct values). */
  options: FilterOptions;
  /** Whether any Espejo data is available to link processes. */
  hasEspejo: boolean;
  active: boolean;
}

function dateOf(c: Candidate): number | null {
  const raw =
    (c as Record<string, unknown>).fecha_registro ??
    (c as Record<string, unknown>).created ??
    (c as Record<string, unknown>)["Marca temporal"] ??
    (c as Record<string, unknown>).timestamp;
  if (!raw) return null;
  const t = new Date(String(raw)).getTime();
  return Number.isFinite(t) ? t : null;
}

const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function matchesDims(attrs: ProcesoAttrs | null, f: FilterState): boolean {
  const dim = (val: string, target: string) => {
    if (!target) return true; // no filter on this dimension
    if (!attrs) return false; // filter active but unclassifiable → exclude
    return eq(val, target);
  };
  return (
    dim(attrs?.gerencia ?? "", f.gerencia) &&
    dim(attrs?.agencia ?? "", f.agencia) &&
    dim(attrs?.modalidad ?? "", f.modalidad) &&
    dim(attrs?.estado ?? "", f.estado)
  );
}

function inPeriod(date: number | null, f: FilterState): boolean {
  const range = periodRange(f);
  if (!range) return true; // "all"
  if (date === null) return false; // temporal active but no date → exclude
  return date >= range.start && date <= range.end;
}

function distinct(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out.sort((a, b) => a.localeCompare(b, "es"));
}

/**
 * The heart of the universal filter: it links candidates to their process
 * (through Espejo), applies the active temporal + dimension filters, and also
 * returns the filtered process rows (for the process-distribution KPIs) plus the
 * dropdown option lists. When no filter is active it returns the data untouched.
 */
export function useFilteredData(): FilteredData {
  const { candidatos, auxiliares, espejoBase, espejoUltimo } = useTalentData();
  const f = useFilters();

  const index: EspejoIndex = useMemo(
    () => indexEspejo(espejoUltimo, espejoBase),
    [espejoUltimo, espejoBase],
  );

  const options = useMemo<FilterOptions>(
    () => ({
      gerencia: distinct([
        ...auxiliares.gerencias_bdp,
        ...index.rows.map((r) => r.gerencia),
      ]),
      agencia: distinct([
        ...auxiliares.agencias_bdp,
        ...index.rows.map((r) => r.agencia),
      ]),
      modalidad: distinct([
        ...auxiliares.modalidad_reclutamiento,
        ...index.rows.map((r) => r.modalidad),
      ]),
      estado: distinct([
        ...auxiliares.estado_proceso,
        ...index.rows.map((r) => r.estado),
      ]),
    }),
    [auxiliares, index],
  );

  const active = filtersActive(f);

  const { candidatosFiltrados, filteredIds } = useMemo(() => {
    if (!active) {
      return {
        candidatosFiltrados: candidatos,
        filteredIds: new Set(candidatos.map((c) => c.id)),
      };
    }
    const out = candidatos.filter((c) => {
      const attrs = candidateAttrs(c, index.byProceso);
      if (!matchesDims(attrs, f)) return false;
      const date = attrs?.fecha ?? dateOf(c);
      return inPeriod(date, f);
    });
    return { candidatosFiltrados: out, filteredIds: new Set(out.map((c) => c.id)) };
  }, [active, candidatos, index, f]);

  const procesos = useMemo(() => {
    if (!active) return index.rows;
    return index.rows.filter(
      (r) => matchesDims(r, f) && inPeriod(r.fecha, f),
    );
  }, [active, index, f]);

  return {
    candidatos: candidatosFiltrados,
    procesos,
    filteredIds,
    options,
    hasEspejo: index.rows.length > 0,
    active,
  };
}
