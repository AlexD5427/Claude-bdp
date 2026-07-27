import { describe, it, expect, beforeAll } from "vitest";
import { bootstrapPlugins } from "../question-types";
import { makeOption } from "../question-types/helpers";
import { assessmentContentSchema, type AssessmentContent } from "./assessment";
import { assessmentBlockSchema, assessmentSectionSchema } from "./questions";
import { createAssessment } from "./factory";
import { buildPublishChecklist, questionHasErrors } from "./publish";

beforeAll(() => bootstrapPlugins());

/** Evaluación mínima válida: un título propio y una pregunta bien formada. */
function validContent(): AssessmentContent {
  return assessmentContentSchema.parse({
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
            label: "¿Cuál es la capital?",
            required: true,
            options: [
              makeOption({ id: "opt_1", label: "Correcta", value: "a", correct: true }),
              makeOption({ id: "opt_2", label: "Incorrecta", value: "b" }),
            ],
            score: { mode: "exact", points: 1 },
          }),
        ],
      }),
    ],
    publicInstructions: "Lee con atención.",
  });
}

function definition(overrides: Partial<ReturnType<typeof createAssessment>> = {}) {
  return { ...createAssessment({ name: "Evaluación real", createdBy: "u" }), ...overrides };
}

function codes(content: AssessmentContent, overrides = {}) {
  return buildPublishChecklist(definition(overrides), content).errors.map((item) => item.code);
}

describe("lista de comprobación de publicación", () => {
  it("acepta una evaluación válida", () => {
    const checklist = buildPublishChecklist(definition(), validContent());
    expect(checklist.errors).toEqual([]);
    expect(checklist.canPublish).toBe(true);
    expect(checklist.questionCount).toBe(1);
    expect(checklist.validQuestions).toBe(1);
    expect(checklist.autoGradableQuestions).toBe(1);
    expect(checklist.manualReviewQuestions).toBe(0);
  });

  it("rechaza sin título propio", () => {
    expect(codes(validContent(), { name: "" })).toContain("MISSING_TITLE");
    // El título por omisión tampoco cuenta como título.
    expect(codes(validContent(), { name: "Nueva evaluación" })).toContain("MISSING_TITLE");
  });

  it("rechaza sin preguntas", () => {
    const content = assessmentContentSchema.parse({
      sections: [assessmentSectionSchema.parse({ id: "sec_1", order: 0, blocks: [] })],
    });
    expect(codes(content)).toContain("NO_ACTIVE_QUESTIONS");
  });

  it("rechaza una pregunta sin enunciado", () => {
    const content = validContent();
    content.sections[0].blocks[0].label = "   ";
    expect(codes(content)).toContain("MISSING_QUESTION_TEXT");
  });

  it("rechaza un tipo desconocido", () => {
    const content = validContent();
    content.sections[0].blocks[0].type = "q_inexistente";
    expect(codes(content)).toContain("UNKNOWN_QUESTION_TYPE");
  });

  it("rechaza con menos de dos opciones", () => {
    const content = validContent();
    content.sections[0].blocks[0].options = [content.sections[0].blocks[0].options[0]];
    expect(codes(content)).toContain("NOT_ENOUGH_OPTIONS");
  });

  it("rechaza una opción sin texto", () => {
    const content = validContent();
    content.sections[0].blocks[0].options[1].label = "";
    expect(codes(content)).toContain("MISSING_OPTION_TEXT");
  });

  it("rechaza sin respuesta correcta", () => {
    const content = validContent();
    content.sections[0].blocks[0].options.forEach((option) => {
      option.correct = false;
    });
    expect(codes(content)).toContain("NO_CORRECT_OPTION");
  });

  it("rechaza con dos respuestas correctas en un tipo de respuesta única", () => {
    const content = validContent();
    content.sections[0].blocks[0].options.forEach((option) => {
      option.correct = true;
    });
    expect(codes(content)).toContain("MULTIPLE_CORRECT_OPTIONS");
  });

  it("acepta varias correctas en opción múltiple", () => {
    const content = validContent();
    content.sections[0].blocks[0].type = "q_multiple_choice";
    content.sections[0].blocks[0].options.forEach((option) => {
      option.correct = true;
    });
    expect(codes(content)).not.toContain("MULTIPLE_CORRECT_OPTIONS");
  });

  it("rechaza opciones inconsistentes en verdadero/falso", () => {
    const content = validContent();
    content.sections[0].blocks[0].type = "q_true_false";
    expect(codes(content)).toContain("INVALID_FIXED_OPTIONS");
  });

  it("rechaza opciones en un tipo que no las admite", () => {
    const content = validContent();
    content.sections[0].blocks[0].type = "q_long_text";
    expect(codes(content)).toContain("UNEXPECTED_OPTIONS");
  });

  it("rechaza una duración inválida", () => {
    expect(codes(validContent(), { estimatedDurationMinutes: -5 })).toContain("INVALID_DURATION");
    expect(codes(validContent(), { estimatedDurationMinutes: 0 })).not.toContain("INVALID_DURATION");
    expect(codes(validContent(), { estimatedDurationMinutes: 30 })).not.toContain("INVALID_DURATION");
  });

  it("rechaza una nota mínima fuera de 0–100", () => {
    const base = createAssessment({ name: "Evaluación real", createdBy: "u" });
    const withScore = (value: number | null) =>
      buildPublishChecklist(
        { ...base, scoringPolicy: { ...base.scoringPolicy, passThreshold: value } },
        validContent(),
      ).errors.map((item) => item.code);
    expect(withScore(120)).toContain("INVALID_PASSING_SCORE");
    expect(withScore(-1)).toContain("INVALID_PASSING_SCORE");
    expect(withScore(70)).not.toContain("INVALID_PASSING_SCORE");
    expect(withScore(null)).not.toContain("INVALID_PASSING_SCORE");
  });

  it("rechaza identificadores de pregunta y de opción duplicados", () => {
    const content = validContent();
    const clone = structuredClone(content.sections[0].blocks[0]);
    content.sections[0].blocks.push(clone);
    const found = codes(content);
    expect(found).toContain("DUPLICATE_QUESTION_ID");
    expect(found).toContain("DUPLICATE_OPTION_ID");
  });

  it("rechaza códigos de pregunta duplicados", () => {
    const content = validContent();
    content.sections[0].blocks[0].code = "P1";
    const clone = structuredClone(content.sections[0].blocks[0]);
    clone.id = "blk_2";
    clone.options = clone.options.map((option, index) => ({ ...option, id: `opt_c${index}` }));
    content.sections[0].blocks.push(clone);
    expect(codes(content)).toContain("DUPLICATE_QUESTION_CODE");
  });

  it("rechaza publicar una evaluación archivada", () => {
    expect(codes(validContent(), { lifecycle: "archived" })).toContain("INVALID_STATUS");
  });

  it("avisa (sin bloquear) de secciones vacías y de multimedia sin descripción", () => {
    const content = validContent();
    content.sections.push(assessmentSectionSchema.parse({ id: "sec_2", order: 1, blocks: [] }));
    content.sections[0].blocks[0].media = { kind: "image", url: "https://x/y.png", alt: "" };
    const checklist = buildPublishChecklist(definition(), content);
    const warnings = checklist.warnings.map((item) => item.code);
    expect(warnings).toContain("EMPTY_SECTION");
    expect(warnings).toContain("MISSING_MEDIA_ALT");
    expect(checklist.canPublish).toBe(true);
  });

  it("marca como revisión manual una pregunta abierta con puntaje", () => {
    const content = validContent();
    content.sections[0].blocks.push(
      assessmentBlockSchema.parse({
        id: "blk_manual",
        type: "q_long_text",
        order: 1,
        label: "Explica tu razonamiento",
        score: { mode: "manual", points: 5 },
      }),
    );
    const checklist = buildPublishChecklist(definition(), content);
    expect(checklist.canPublish).toBe(true);
    expect(checklist.manualReviewQuestions).toBe(1);
    expect(checklist.info.map((item) => item.code)).toContain("MANUAL_REVIEW_REQUIRED");
  });

  it("cada hallazgo sabe a qué campo llevar al usuario", () => {
    const content = validContent();
    content.sections[0].blocks[0].label = "";
    content.sections[0].blocks[0].options = [];
    const checklist = buildPublishChecklist(definition({ name: "" }), content);
    const title = checklist.errors.find((item) => item.code === "MISSING_TITLE");
    expect(title?.target).toEqual({ area: "general", field: "name" });
    const text = checklist.errors.find((item) => item.code === "MISSING_QUESTION_TEXT");
    expect(text?.target.area).toBe("questions");
    expect(text?.target.questionId).toBe("blk_1");
    expect(text?.target.field).toBe("label");
    expect(questionHasErrors(checklist, "blk_1")).toBe(true);
    for (const finding of checklist.findings) {
      expect(finding.hint.length).toBeGreaterThan(5);
      expect(finding.message.length).toBeGreaterThan(5);
    }
  });

  it("calcula el progreso de configuración", () => {
    const empty = assessmentContentSchema.parse({});
    expect(buildPublishChecklist(definition({ name: "" }), empty).completeness).toBe(0);
    expect(buildPublishChecklist(definition(), validContent()).completeness).toBe(100);
  });

  it("cuenta los tipos utilizados", () => {
    const content = validContent();
    content.sections[0].blocks.push(
      assessmentBlockSchema.parse({ id: "blk_2", type: "q_short_text", order: 1, label: "Nombre" }),
    );
    const checklist = buildPublishChecklist(definition(), content);
    expect(checklist.typeUsage.map((item) => item.type).sort()).toEqual([
      "q_short_text",
      "q_single_choice",
    ]);
  });
});
