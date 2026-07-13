import { describe, it, expect } from "vitest";
import { applyProcessFilters, emptyFilters, activeFilterCount, DEFAULT_COLUMNS, type ProcessListState } from "./listState";
import { createProcess } from "../domain/factory";
import { recruitmentProcessSchema, toProcessSummary } from "../domain/models";

function summary(title: string, patch: Partial<ReturnType<typeof toProcessSummary>> = {}) {
  const p = recruitmentProcessSchema.parse({ ...createProcess({ title, createdBy: "u" }) });
  return { ...toProcessSummary(p, 0), ...patch };
}

function state(overrides: Partial<ProcessListState>): ProcessListState {
  return {
    search: "",
    filters: emptyFilters(),
    view: "table",
    density: "comfortable",
    sort: { key: "title", dir: "asc" },
    visibleColumns: DEFAULT_COLUMNS,
    savedViews: [],
    ...overrides,
  };
}

describe("process filters", () => {
  const items = [
    summary("Analista de Riesgos", { area: "Riesgos", processStatus: "published", location: "CDMX" }),
    summary("Cajero", { area: "Operaciones", processStatus: "closed", location: "Monterrey" }),
    summary("Ejecutivo", { area: "Comercial", processStatus: "archived", location: "Puebla" }),
  ];

  it("hides closed/archived under the default 'active' lifecycle", () => {
    const result = applyProcessFilters(items, state({}));
    expect(result.map((r) => r.title)).toEqual(["Analista de Riesgos"]);
  });

  it("filters by area with multiple values", () => {
    const result = applyProcessFilters(
      items,
      state({ filters: { ...emptyFilters(), lifecycle: "all", area: ["Riesgos", "Comercial"] } }),
    );
    expect(result).toHaveLength(2);
  });

  it("searches across code/title/area/location", () => {
    const result = applyProcessFilters(items, state({ search: "monterrey", filters: { ...emptyFilters(), lifecycle: "all" } }));
    expect(result.map((r) => r.title)).toEqual(["Cajero"]);
  });

  it("shows only closed processes under the 'closed' lifecycle", () => {
    const result = applyProcessFilters(items, state({ filters: { ...emptyFilters(), lifecycle: "closed" } }));
    expect(result.map((r) => r.title)).toEqual(["Cajero"]);
  });

  it("sorts descending by vacancies", () => {
    const withVac = [
      summary("A", { vacancies: 1, processStatus: "published" }),
      summary("B", { vacancies: 9, processStatus: "published" }),
    ];
    const result = applyProcessFilters(withVac, state({ sort: { key: "vacancies", dir: "desc" } }));
    expect(result.map((r) => r.title)).toEqual(["B", "A"]);
  });

  it("counts active filter facets", () => {
    expect(activeFilterCount(emptyFilters())).toBe(0);
    expect(activeFilterCount({ ...emptyFilters(), area: ["X"], lifecycle: "all" })).toBe(2);
  });
});
