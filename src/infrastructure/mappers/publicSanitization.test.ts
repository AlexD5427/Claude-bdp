import { describe, it, expect, beforeAll } from "vitest";
import { bootstrapPlugins } from "../../features/assessments/question-types";
import { makeOption } from "../../features/assessments/question-types/helpers";
import { assessmentContentSchema } from "../../features/assessments/domain/assessment";
import { assessmentBlockSchema, assessmentSectionSchema } from "../../features/assessments/domain/questions";
import { createAssessment } from "../../features/assessments/domain/factory";
import { publishDraft } from "../../features/assessments/versioning/operations";
import { toPublicAssessmentDTO } from "./publicDto";

beforeAll(() => bootstrapPlugins());

/**
 * Saneamiento del DTO público en el FRONTEND.
 *
 * Esta capa es la que usa la vista previa del reclutador. Es la segunda barrera:
 * la primera es `Sanitize.gs` en el servidor. Ambas se prueban por separado a
 * propósito, porque un fallo en cualquiera de las dos filtraría datos.
 */

const SECRETS = {
  feedback: "SECRETO-RETROALIMENTACION",
  internal: "SECRETO-INSTRUCCIONES-INTERNAS",
};

function assessmentWithAnswerKey() {
  const content = assessmentContentSchema.parse({
    sections: [
      assessmentSectionSchema.parse({
        id: "sec_1",
        title: "Sección 1",
        order: 0,
        blocks: [
          assessmentBlockSchema.parse({
            id: "blk_1",
            type: "q_single_choice",
            order: 0,
            label: "¿Cuál es la correcta?",
            helpText: "Ayuda visible",
            required: true,
            options: [
              makeOption({ id: "opt_1", label: "Correcta", value: "a", correct: true, score: 5, feedback: SECRETS.feedback }),
              makeOption({ id: "opt_2", label: "Incorrecta", value: "b" }),
            ],
            config: { scaleMin: 1, expectedValue: "no-publicar", tolerance: 0.5 },
            validation: { min: 0, max: 10 },
            score: { mode: "exact", points: 5, competency: "Análisis" },
            feedback: { correct: SECRETS.feedback, incorrect: SECRETS.feedback, general: "" },
          }),
          assessmentBlockSchema.parse({
            id: "blk_2",
            type: "q_ordering",
            order: 1,
            label: "Ordena",
            options: [
              makeOption({ id: "opt_3", label: "Uno", value: "1", matchingKey: "1" }),
              makeOption({ id: "opt_4", label: "Dos", value: "2", matchingKey: "2" }),
            ],
            score: { mode: "exact", points: 2 },
          }),
        ],
      }),
    ],
    publicInstructions: "Instrucciones públicas.",
    internalInstructions: SECRETS.internal,
  });
  const base = createAssessment({ name: "Prueba pública", createdBy: "reclutadora@ejemplo.com", content });
  return publishDraft(base, "reclutadora@ejemplo.com");
}

/**
 * Se comprueban las CLAVES JSON, no palabras sueltas: el enunciado de una
 * pregunta puede contener legítimamente la palabra «correcta».
 */
const FORBIDDEN = [
  '"correct"',
  '"isCorrect"',
  '"answerKey"',
  '"score"',
  '"points"',
  '"feedback"',
  '"matchingKey"',
  '"competency"',
  '"internalInstructions"',
  '"expectedValue"',
  '"tolerance"',
  '"createdBy"',
  '"updatedBy"',
  '"entityVersion"',
  '"validation"',
];

describe("DTO público del frontend", () => {
  it("no contiene ningún término de la clave de respuestas", () => {
    const dto = toPublicAssessmentDTO(assessmentWithAnswerKey());
    expect(dto).not.toBeNull();
    const serialized = JSON.stringify(dto);
    for (const term of FORBIDDEN) {
      expect(serialized, `no debe contener ${term}`).not.toContain(term);
    }
    for (const secret of Object.values(SECRETS)) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("sí entrega lo que el candidato necesita", () => {
    const dto = toPublicAssessmentDTO(assessmentWithAnswerKey());
    expect(dto?.name).toBe("Prueba pública");
    expect(dto?.publicInstructions).toBe("Instrucciones públicas.");
    const block = dto!.sections[0].blocks[0];
    expect(block.label).toBe("¿Cuál es la correcta?");
    expect(block.helpText).toBe("Ayuda visible");
    expect(block.required).toBe(true);
    expect(block.options.map((option) => option.label)).toEqual(["Correcta", "Incorrecta"]);
    // Solo la configuración de presentación de la lista blanca.
    expect(block.config.scaleMin).toBe(1);
    expect(Object.keys(block.config)).not.toContain("expectedValue");
  });

  it("un borrador sin versión publicada no produce DTO", () => {
    const draft = createAssessment({ name: "Solo borrador", createdBy: "u" });
    expect(toPublicAssessmentDTO(draft)).toBeNull();
  });

  it("sirve la versión apuntada, no el borrador en edición", () => {
    const published = assessmentWithAnswerKey();
    published.draftVersion.content.sections[0].blocks[0].label = "Enunciado del borrador nuevo";
    const dto = toPublicAssessmentDTO(published);
    expect(dto?.sections[0].blocks[0].label).toBe("¿Cuál es la correcta?");
  });

  it("ordena secciones y bloques por posición", () => {
    const published = assessmentWithAnswerKey();
    const version = published.publishedVersions[0];
    version.content.sections[0].blocks[0].order = 5;
    version.content.sections[0].blocks[1].order = 1;
    const dto = toPublicAssessmentDTO(published);
    expect(dto?.sections[0].blocks.map((block) => block.id)).toEqual(["blk_2", "blk_1"]);
  });
});
