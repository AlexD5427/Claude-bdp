import { describe, it, expect } from "vitest";
import { createProcess } from "../../features/processes/domain/factory";
import { processToRow, rowToProcess, PROCESO_HEADERS } from "./processMapper";
import { createAssessment } from "../../features/assessments/domain/factory";
import { assessmentContentSchema } from "../../features/assessments/domain/assessment";
import { publishDraft } from "../../features/assessments/versioning/operations";
import { assessmentToRow, rowToAssessment, EVALUACION_HEADERS } from "./assessmentMapper";
import { toPublicAssessmentDTO } from "./publicDto";
import { newId } from "../../shared/ids";

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

describe("assessment mapper", () => {
  it("round-trips a draft assessment through the Evaluaciones row shape", () => {
    const a = createAssessment({ name: "Prueba técnica", category: "technical", createdBy: "u1" });
    const row = assessmentToRow(a);
    const back = rowToAssessment(row);
    expect(back.name).toBe(a.name);
    expect(back.category).toBe(a.category);
    expect(back.draftVersion.major).toBe(a.draftVersion.major);
  });

  it("exposes a stable, complete header list", () => {
    const a = createAssessment({ name: "X", createdBy: "u1" });
    const row = assessmentToRow(a);
    for (const h of EVALUACION_HEADERS) {
      expect(row).toHaveProperty(h);
    }
  });
});

describe("public DTO (answer-key exclusion)", () => {
  function published() {
    const a = createAssessment({ name: "Con respuestas", category: "knowledge", createdBy: "u1" });
    a.draftVersion.content = assessmentContentSchema.parse({
      sections: [
        {
          id: newId("sec"),
          title: "S1",
          order: 0,
          blocks: [
            {
              id: newId("blk"),
              type: "q_single_choice",
              order: 0,
              label: "Pregunta",
              options: [
                { id: "o1", label: "Correcta", value: "a", score: 5, correct: true, feedback: "¡Bien!" },
                { id: "o2", label: "Incorrecta", value: "b", score: 0, correct: false },
              ],
              score: { mode: "exact", points: 5 },
            },
          ],
        },
      ],
      internalInstructions: "SECRETO interno",
    });
    return publishDraft(a, "u1");
  }

  it("returns null when there is no published version", () => {
    const a = createAssessment({ name: "Borrador", createdBy: "u1" });
    expect(toPublicAssessmentDTO(a)).toBeNull();
  });

  it("never exposes correct flags, per-option scores, or feedback", () => {
    const dto = toPublicAssessmentDTO(published());
    expect(dto).not.toBeNull();
    const serialized = JSON.stringify(dto);
    // Assert on JSON keys, not loose substrings (labels like "Incorrecta"
    // legitimately contain the letters "correct").
    expect(serialized).not.toContain('"correct"');
    expect(serialized).not.toContain('"feedback"');
    expect(serialized).not.toContain("SECRETO");
    const option = dto!.sections[0].blocks[0].options[0];
    expect(option).not.toHaveProperty("score");
    expect(option).not.toHaveProperty("correct");
    expect(option.label).toBe("Correcta");
  });

  it("does not expose internal instructions or scoring rules", () => {
    const dto = toPublicAssessmentDTO(published())!;
    expect(dto).not.toHaveProperty("internalInstructions");
    expect(dto.sections[0].blocks[0]).not.toHaveProperty("score");
  });
});
