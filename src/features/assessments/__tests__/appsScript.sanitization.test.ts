import { describe, it, expect } from "vitest";
import { loadInitializedAppsScript } from "../../../../scripts/run-apps-script.mjs";

/**
 * Saneamiento del endpoint público.
 *
 * Es la prueba que respalda la afirmación «la API pública no expone respuestas
 * correctas». Se comprueba sobre la respuesta serializada completa, no campo a
 * campo, así que una columna nueva que se filtrara haría fallar la prueba.
 */

interface Envelope {
  ok: boolean;
  data: unknown;
  error: { code: string } | null;
}

/** Términos que NUNCA pueden aparecer en una respuesta pública. */
const FORBIDDEN = [
  "isCorrect",
  "is_correct",
  '"correct"',
  "correctAnswer",
  "answerKey",
  "scoreValue",
  "score_value",
  "pointsAwarded",
  "points_awarded",
  "maxPoints",
  "max_points",
  "scoringMode",
  "scoring_mode",
  "feedback",
  "createdBy",
  "created_by",
  "updatedBy",
  "updated_by",
  "internalInstructions",
  "internal_instructions",
  "passingScore",
  "passing_score",
  "entityVersion",
  "entity_version",
  "matchingKey",
  "matching_key",
  "auditLog",
  "assessmentId",
];

/** Valores sensibles concretos que se siembran para comprobar que no salen. */
const SECRETS = {
  internalInstructions: "SECRETO-INTERNO-NO-PUBLICAR",
  feedback: "SECRETO-RETROALIMENTACION",
  actor: "reclutadora.privada@ejemplo.com",
};

function seedAssessment(publish: boolean) {
  const harness = loadInitializedAppsScript({ activeEmail: SECRETS.actor });
  const created = harness.request("createAssessment", {
    title: "Conocimientos de riesgo",
    category: "knowledge",
    actor: SECRETS.actor,
  }).data as { assessment: { assessmentId: string; entityVersion: number }; sections: { sectionId: string }[] };
  const sectionId = created.sections[0].sectionId;

  const saved = harness.request("updateAssessment", {
    assessmentId: created.assessment.assessmentId,
    expectedEntityVersion: created.assessment.entityVersion,
    actor: SECRETS.actor,
    assessment: {
      title: "Conocimientos de riesgo",
      description: "Descripción visible",
      instructions: "Instrucciones públicas visibles.",
      internalInstructions: SECRETS.internalInstructions,
      durationMinutes: 20,
      passingScore: 80,
      accessType: "public",
      category: "knowledge",
      tags: ["interno", "confidencial"],
    },
    sections: [{ sectionId, title: "Sección 1", position: 0, active: true }],
    questions: [
      {
        questionId: "qst_1",
        sectionId,
        questionType: "q_single_choice",
        questionText: "¿Qué mide la morosidad?",
        helpText: "Piensa en atrasos.",
        position: 0,
        required: true,
        scoringMode: "exact",
        maxPoints: 3,
        active: true,
        configuration: { scaleMin: 1, scaleMax: 5, expectedValue: "no-publicar" },
        feedback: { correct: SECRETS.feedback, incorrect: SECRETS.feedback, general: "" },
      },
      {
        questionId: "qst_2",
        sectionId,
        questionType: "q_ordering",
        questionText: "Ordena los pasos",
        position: 1,
        scoringMode: "exact",
        maxPoints: 2,
        active: true,
      },
    ],
    options: [
      {
        optionId: "opt_1a",
        questionId: "qst_1",
        optionText: "El porcentaje de créditos con atraso",
        optionValue: "a",
        position: 0,
        isCorrect: true,
        scoreValue: 3,
        feedback: SECRETS.feedback,
        active: true,
      },
      {
        optionId: "opt_1b",
        questionId: "qst_1",
        optionText: "La utilidad del periodo",
        optionValue: "b",
        position: 1,
        isCorrect: false,
        active: true,
      },
      {
        optionId: "opt_2a",
        questionId: "qst_2",
        optionText: "Primer paso",
        optionValue: "p1",
        position: 0,
        matchingKey: "1",
        active: true,
      },
      {
        optionId: "opt_2b",
        questionId: "qst_2",
        optionText: "Segundo paso",
        optionValue: "p2",
        position: 1,
        matchingKey: "2",
        active: true,
      },
    ],
  }).data as { assessment: { entityVersion: number; publicCode: string } };

  if (!publish) {
    return { harness, publicCode: saved.assessment.publicCode, assessmentId: created.assessment.assessmentId };
  }
  const published = harness.request("publishAssessment", {
    assessmentId: created.assessment.assessmentId,
    expectedEntityVersion: saved.assessment.entityVersion,
    actor: SECRETS.actor,
  }).data as { assessment: { publicCode: string } };
  return {
    harness,
    publicCode: published.assessment.publicCode,
    assessmentId: created.assessment.assessmentId,
  };
}

describe("apps-script · saneamiento público", () => {
  it("el detalle público no contiene NINGÚN término de la clave de respuestas", () => {
    const { harness, publicCode } = seedAssessment(true);
    const response = harness.request("getPublicAssessment", { publicCode }) as Envelope;
    expect(response.ok).toBe(true);
    const serialized = JSON.stringify(response.data);
    for (const term of FORBIDDEN) {
      expect(serialized, `el DTO público no debe contener ${term}`).not.toContain(term);
    }
    for (const secret of Object.values(SECRETS)) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("sí entrega lo que el candidato necesita", () => {
    const { harness, publicCode } = seedAssessment(true);
    const dto = harness.request("getPublicAssessment", { publicCode }).data as {
      title: string;
      instructions: string;
      durationMinutes: number;
      questionCount: number;
      sections: {
        questions: {
          questionText: string;
          helpText: string;
          required: boolean;
          configuration: Record<string, unknown>;
          options: { optionId: string; optionText: string; optionValue: string }[];
        }[];
      }[];
    };
    expect(dto.title).toBe("Conocimientos de riesgo");
    expect(dto.instructions).toBe("Instrucciones públicas visibles.");
    expect(dto.durationMinutes).toBe(20);
    expect(dto.questionCount).toBe(2);
    const first = dto.sections[0].questions[0];
    expect(first.questionText).toContain("morosidad");
    expect(first.helpText).toBe("Piensa en atrasos.");
    expect(first.required).toBe(true);
    expect(first.options).toHaveLength(2);
    expect(first.options[0].optionText).toContain("atraso");
    // Solo pasa la configuración de presentación de la lista blanca.
    expect(first.configuration.scaleMin).toBe(1);
    expect(first.configuration.expectedValue).toBeUndefined();
  });

  it("un BORRADOR es invisible para el endpoint público", () => {
    const { harness, publicCode } = seedAssessment(false);
    const detail = harness.request("getPublicAssessment", { publicCode }) as Envelope;
    expect(detail.ok).toBe(false);
    expect(detail.error?.code).toBe("NOT_FOUND");
    const list = harness.request("listPublicAssessments", {}).data as { items: unknown[] };
    expect(list.items).toHaveLength(0);
  });

  it("una ARCHIVADA deja de servirse públicamente", () => {
    const { harness, publicCode, assessmentId } = seedAssessment(true);
    expect((harness.request("getPublicAssessment", { publicCode }) as Envelope).ok).toBe(true);
    harness.request("archiveAssessment", { assessmentId, actor: SECRETS.actor });
    const after = harness.request("getPublicAssessment", { publicCode }) as Envelope;
    expect(after.ok).toBe(false);
    expect(after.error?.code).toBe("NOT_FOUND");
  });

  it("una PAUSADA deja de servirse públicamente", () => {
    const { harness, publicCode, assessmentId } = seedAssessment(true);
    harness.request("pauseAssessment", { assessmentId, actor: SECRETS.actor });
    const after = harness.request("getPublicAssessment", { publicCode }) as Envelope;
    expect(after.ok).toBe(false);
  });

  it("el listado público tampoco filtra datos internos", () => {
    const { harness } = seedAssessment(true);
    const list = harness.request("listPublicAssessments", {}) as Envelope;
    const serialized = JSON.stringify(list.data);
    for (const term of FORBIDDEN) {
      expect(serialized).not.toContain(term);
    }
    expect(serialized).not.toContain("confidencial");
  });

  it("la respuesta al enviar un intento no revela la clave ni la nota por omisión", () => {
    const { harness, publicCode } = seedAssessment(true);
    const dto = harness.request("getPublicAssessment", { publicCode }).data as {
      sections: { questions: { questionId: string; options: { optionId: string }[] }[] }[];
    };
    const first = dto.sections[0].questions[0];
    const response = harness.request(
      "submitAttempt",
      {
        publicCode,
        answers: [{ questionId: first.questionId, selectedOptionId: first.options[0].optionId }],
      },
      "req_publico",
    ) as Envelope;
    expect(response.ok).toBe(true);
    const serialized = JSON.stringify(response.data);
    for (const term of FORBIDDEN) {
      expect(serialized).not.toContain(term);
    }
    // `resultVisibility.candidate` es "none" por omisión: ni la nota viaja.
    expect(serialized).not.toContain('"score"');
  });

  it("las acciones administrativas no están disponibles por GET", () => {
    const harness = loadInitializedAppsScript();
    const response = harness.call("doGet", {
      parameter: { action: "getAdminAssessment", assessmentId: "asm_1" },
    }) as { getContent: () => string };
    const body = JSON.parse(response.getContent()) as Envelope;
    // La lectura administrativa exige autorización; nunca se responde con datos
    // sin pasar por Auth.gs.
    expect(body.ok).toBe(false);
  });

  it("el GET público funciona con parámetros sueltos, como lo usará el portal", () => {
    const { harness, publicCode } = seedAssessment(true);
    const response = harness.call("doGet", {
      parameter: { action: "getPublicAssessment", publicCode },
    }) as { getContent: () => string };
    const body = JSON.parse(response.getContent()) as Envelope;
    expect(body.ok).toBe(true);
    const serialized = JSON.stringify(body.data);
    for (const term of FORBIDDEN) {
      expect(serialized).not.toContain(term);
    }
  });
});
