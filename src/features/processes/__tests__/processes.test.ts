import { describe, it, expect } from "vitest";
import { RecruitmentProcessSchema, ProcessDraftInputSchema } from "../schema";
import { canTransition, publicationForStatus } from "../statuses";
import { processToRow, rowToProcess } from "../mappers";
import { applyFilters, defaultFilters } from "../filters";
import type { ProcessSummary, RecruitmentProcess } from "../types";

function baseProcess(): RecruitmentProcess {
  return RecruitmentProcessSchema.parse({
    id: "proc_1",
    title: "Oficial de Créditos 2026",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }) as RecruitmentProcess;
}

describe("process schema", () => {
  it("fills defaults and requires a title", () => {
    const p = baseProcess();
    expect(p.status).toBe("borrador");
    expect(p.publicationStatus).toBe("no_publicado");
    expect(p.vacancies).toBe(1);
    expect(() => ProcessDraftInputSchema.parse({ configuration: { headcount: 1, applicationEnabled: true } })).toThrow();
  });

  it("validates a full draft input", () => {
    const result = ProcessDraftInputSchema.safeParse({
      title: "Analista de Riesgos",
      configuration: { headcount: 2, applicationEnabled: true },
    });
    expect(result.success).toBe(true);
  });
});

describe("status transitions", () => {
  it("allows valid transitions and rejects invalid ones", () => {
    expect(canTransition("borrador", "en_configuracion")).toBe(true);
    expect(canTransition("publicado", "recepcion_activa")).toBe(true);
    expect(canTransition("borrador", "publicado")).toBe(false);
    expect(canTransition("cerrado", "recepcion_activa")).toBe(false);
  });

  it("maps statuses to publication statuses", () => {
    expect(publicationForStatus("publicado")).toBe("publicado");
    expect(publicationForStatus("pausado")).toBe("pausado");
    expect(publicationForStatus("borrador")).toBeNull();
  });
});

describe("process sheet mappers", () => {
  it("round-trips a process through the Procesos row shape", () => {
    const p = { ...baseProcess(), assessmentIds: ["a1", "a2"], area: "Riesgos", city: "La Paz" };
    const row = processToRow(p);
    expect(row.Nombre).toBe(p.title);
    expect(row.EvaluacionesJson).toContain("a1");
    const back = rowToProcess(row);
    expect(back).not.toBeNull();
    expect(back?.title).toBe(p.title);
    expect(back?.assessmentIds).toEqual(["a1", "a2"]);
    expect(back?.area).toBe("Riesgos");
  });
});

describe("process filters", () => {
  const rows: ProcessSummary[] = [
    { id: "1", code: "A", title: "Oficial de Créditos", area: "Negocios", location: "La Paz", vacancies: 4, applications: 10, assessmentCount: 1, ownerId: "", status: "publicado", publicationStatus: "publicado", visibility: "ambos", openingDate: null, closingDate: null, updatedAt: "2026-01-02", synchronizationStatus: "local" },
    { id: "2", code: "B", title: "Cajero Bancario", area: "Operaciones", location: "El Alto", vacancies: 2, applications: 3, assessmentCount: 0, ownerId: "", status: "borrador", publicationStatus: "no_publicado", visibility: "interno", openingDate: null, closingDate: null, updatedAt: "2026-01-01", synchronizationStatus: "local" },
  ];

  it("filters by query (accent-insensitive)", () => {
    const f = { ...defaultFilters(), query: "creditos" };
    expect(applyFilters(rows, f).map((r) => r.id)).toEqual(["1"]);
  });

  it("filters by 'without assessments'", () => {
    const f = { ...defaultFilters(), assessments: "without" as const };
    expect(applyFilters(rows, f).map((r) => r.id)).toEqual(["2"]);
  });

  it("sorts by updated desc by default", () => {
    expect(applyFilters(rows, defaultFilters()).map((r) => r.id)).toEqual(["1", "2"]);
  });
});
