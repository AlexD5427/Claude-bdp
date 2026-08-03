import { describe, it, expect } from "vitest";
import { createProcess } from "../../features/processes/domain/factory";
import { processToRow, rowToProcess, PROCESO_HEADERS } from "./processMapper";

describe("process mapper", () => {
  it("round-trips a process through the Procesos row shape", () => {
    const p = createProcess({ title: "Analista de Riesgos", createdBy: "u1", area: "Riesgos" });
    p.assessmentIds = ["asm_1", "asm_2"];
    p.recruiterIds = ["r1"];
    p.hiringManagerIds = ["m1"];
    const row = processToRow(p);
    const back = rowToProcess(row);
    expect(back.title).toBe(p.title);
    expect(back.area).toBe(p.area);
    expect(back.assessmentIds).toEqual(p.assessmentIds);
    expect(back.hiringManagerIds).toEqual(p.hiringManagerIds);
    expect(back.workMode).toBe(p.workMode);
    expect(back.sourceProvider).toBe("google-apps-script");
  });

  it("exposes a stable, complete header list", () => {
    const p = createProcess({ title: "X", createdBy: "u1" });
    const row = processToRow(p);
    for (const h of PROCESO_HEADERS) {
      expect(row).toHaveProperty(h);
    }
  });

  it("coerces unknown enum values to safe defaults", () => {
    const back = rowToProcess({
      ID: "prc_x",
      Nombre: "Legacy",
      Codigo: "PRC-X",
      Modalidad: "nonsense",
      Estado: "weird",
      FechaCreacion: new Date().toISOString(),
      FechaActualizacion: new Date().toISOString(),
    });
    expect(back.workMode).toBe("onsite");
    expect(back.processStatus).toBe("draft");
  });
});
