import { describe, it, expect } from "vitest";
import { loadInitializedAppsScript } from "../../../../scripts/run-apps-script.mjs";

/**
 * Calificación en el servidor.
 *
 * Estas pruebas ejercitan `ScoringService.gs` a través del enrutador público,
 * es decir por el mismo camino que usará el portal de candidatos.
 */

interface Envelope {
  ok: boolean;
  data: unknown;
  error: { code: string; message: string; details: Record<string, unknown> } | null;
  warnings: string[];
}

interface PublicQuestion {
  questionId: string;
  questionType: string;
  options: { optionId: string; optionValue: string; optionText: string }[];
}

interface PublicDTO {
  publicCode: string;
  sections: { questions: PublicQuestion[] }[];
}

/**
 * Crea y publica una evaluación con `count` preguntas de opción única (la
 * primera opción es siempre la correcta) y, opcionalmente, una pregunta abierta.
 */
function publishAssessment(options: { count: number; manual?: boolean; passingScore?: number | null }) {
  const harness = loadInitializedAppsScript();
  const created = harness.request("createAssessment", { title: "Prueba", category: "knowledge", actor: "u" })
    .data as { assessment: { assessmentId: string; entityVersion: number }; sections: { sectionId: string }[] };
  const sectionId = created.sections[0].sectionId;

  const questions = [];
  const optionRows = [];
  for (let i = 1; i <= options.count; i++) {
    questions.push({
      questionId: `qst_${i}`,
      sectionId,
      questionType: "q_single_choice",
      questionText: `Pregunta ${i}`,
      position: i - 1,
      required: true,
      scoringMode: "exact",
      maxPoints: 1,
      active: true,
    });
    optionRows.push({
      optionId: `opt_${i}a`,
      questionId: `qst_${i}`,
      optionText: "Correcta",
      optionValue: "a",
      position: 0,
      isCorrect: true,
      scoreValue: 1,
      active: true,
    });
    optionRows.push({
      optionId: `opt_${i}b`,
      questionId: `qst_${i}`,
      optionText: "Incorrecta",
      optionValue: "b",
      position: 1,
      isCorrect: false,
      active: true,
    });
  }
  if (options.manual) {
    questions.push({
      questionId: "qst_manual",
      sectionId,
      questionType: "q_long_text",
      questionText: "Explica tu razonamiento",
      position: options.count,
      required: false,
      scoringMode: "manual",
      maxPoints: 5,
      active: true,
    });
  }

  const saved = harness.request("updateAssessment", {
    assessmentId: created.assessment.assessmentId,
    expectedEntityVersion: created.assessment.entityVersion,
    actor: "u",
    assessment: {
      title: "Prueba",
      instructions: "Responde con atención.",
      durationMinutes: 15,
      passingScore: options.passingScore === undefined ? 70 : options.passingScore,
      accessType: "public",
      category: "knowledge",
    },
    sections: [{ sectionId, title: "Sección 1", position: 0, active: true }],
    questions,
    options: optionRows,
  }).data as { assessment: { entityVersion: number } };

  const published = harness.request("publishAssessment", {
    assessmentId: created.assessment.assessmentId,
    expectedEntityVersion: saved.assessment.entityVersion,
    actor: "u",
  }).data as { assessment: { publicCode: string; assessmentId: string } };

  const dto = harness.request("getPublicAssessment", { publicCode: published.assessment.publicCode })
    .data as PublicDTO;

  return { harness, assessmentId: published.assessment.assessmentId, publicCode: published.assessment.publicCode, dto };
}

function submit(
  harness: ReturnType<typeof loadInitializedAppsScript>,
  publicCode: string,
  answers: Record<string, unknown>[],
  requestId = `req_${Math.random().toString(36).slice(2)}`,
): Envelope {
  return harness.request(
    "submitAttempt",
    { publicCode, participant: { name: "Ana Pérez" }, answers, userAgent: "vitest" },
    requestId,
  ) as Envelope;
}

function attemptRow(harness: ReturnType<typeof loadInitializedAppsScript>) {
  const rows = harness.call("evalReadAll_", harness.spreadsheet, "Attempts") as Record<string, unknown>[];
  return rows[rows.length - 1];
}

describe("apps-script · calificación", () => {
  it("da 100 cuando todas las respuestas son correctas", () => {
    const { harness, publicCode, dto } = publishAssessment({ count: 3 });
    const questions = dto.sections[0].questions;
    const response = submit(
      harness,
      publicCode,
      questions.map((question) => ({
        questionId: question.questionId,
        selectedOptionId: question.options[0].optionId,
      })),
    );
    expect(response.ok).toBe(true);
    const row = attemptRow(harness);
    expect(Number(row.score)).toBe(100);
    expect(Number(row.auto_score)).toBe(100);
    expect(Number(row.correct_answers)).toBe(3);
    expect(String(row.grading_status)).toBe("automatically_graded");
    expect(String(row.passed)).toBe("TRUE");
  });

  it("da 0 cuando ninguna respuesta es correcta", () => {
    const { harness, publicCode, dto } = publishAssessment({ count: 3 });
    const questions = dto.sections[0].questions;
    submit(
      harness,
      publicCode,
      questions.map((question) => ({
        questionId: question.questionId,
        selectedOptionId: question.options[1].optionId,
      })),
    );
    const row = attemptRow(harness);
    expect(Number(row.score)).toBe(0);
    expect(Number(row.correct_answers)).toBe(0);
    expect(String(row.passed)).toBe("FALSE");
  });

  it("da 66.67 con dos de tres, redondeado a dos decimales", () => {
    const { harness, publicCode, dto } = publishAssessment({ count: 3 });
    const questions = dto.sections[0].questions;
    submit(harness, publicCode, [
      { questionId: questions[0].questionId, selectedOptionId: questions[0].options[0].optionId },
      { questionId: questions[1].questionId, selectedOptionId: questions[1].options[0].optionId },
      { questionId: questions[2].questionId, selectedOptionId: questions[2].options[1].optionId },
    ]);
    const row = attemptRow(harness);
    expect(Number(row.score)).toBe(66.67);
  });

  it("una pregunta sin responder cuenta como incorrecta, no rompe el cálculo", () => {
    const { harness, publicCode, dto } = publishAssessment({ count: 3 });
    const questions = dto.sections[0].questions;
    submit(harness, publicCode, [
      { questionId: questions[0].questionId, selectedOptionId: questions[0].options[0].optionId },
    ]);
    const row = attemptRow(harness);
    expect(Number(row.gradable_questions)).toBe(3);
    expect(Number(row.correct_answers)).toBe(1);
    expect(Number(row.score)).toBe(33.33);
  });

  it("rechaza una opción que pertenece a otra pregunta", () => {
    const { harness, publicCode, dto } = publishAssessment({ count: 3 });
    const questions = dto.sections[0].questions;
    const response = submit(harness, publicCode, [
      { questionId: questions[0].questionId, selectedOptionId: questions[1].options[0].optionId },
    ]);
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe("VALIDATION_ERROR");
    const issues = response.error?.details.issues as { code: string }[];
    expect(issues.map((issue) => issue.code)).toContain("FOREIGN_OPTION");
  });

  it("rechaza una pregunta que no pertenece a la versión anclada", () => {
    const { harness, publicCode } = publishAssessment({ count: 2 });
    const response = submit(harness, publicCode, [
      { questionId: "qst_de_otra_evaluacion", selectedOptionId: "" },
    ]);
    expect(response.ok).toBe(false);
    const issues = response.error?.details.issues as { code: string }[];
    expect(issues.map((issue) => issue.code)).toContain("FOREIGN_QUESTION");
  });

  it("rechaza respuestas duplicadas para la misma pregunta", () => {
    const { harness, publicCode, dto } = publishAssessment({ count: 2 });
    const questions = dto.sections[0].questions;
    const response = submit(harness, publicCode, [
      { questionId: questions[0].questionId, selectedOptionId: questions[0].options[0].optionId },
      { questionId: questions[0].questionId, selectedOptionId: questions[0].options[1].optionId },
    ]);
    expect(response.ok).toBe(false);
    const issues = response.error?.details.issues as { code: string }[];
    expect(issues.map((issue) => issue.code)).toContain("DUPLICATE_ANSWER");
  });

  it("IGNORA el puntaje, la corrección y el aprobado enviados por el cliente", () => {
    const { harness, publicCode, dto } = publishAssessment({ count: 2 });
    const questions = dto.sections[0].questions;
    const response = harness.request(
      "submitAttempt",
      {
        publicCode,
        participant: { name: "Tramposo" },
        // Todo esto debe descartarse: la respuesta elegida es la INCORRECTA.
        score: 100,
        passed: true,
        answers: [
          {
            questionId: questions[0].questionId,
            selectedOptionId: questions[0].options[1].optionId,
            isCorrect: true,
            pointsAwarded: 999,
          },
          {
            questionId: questions[1].questionId,
            selectedOptionId: questions[1].options[1].optionId,
            isCorrect: true,
            pointsAwarded: 999,
          },
        ],
      },
      "req_tramposo",
    ) as Envelope;
    expect(response.ok).toBe(true);
    const row = attemptRow(harness);
    expect(Number(row.score)).toBe(0);
    expect(String(row.passed)).toBe("FALSE");
    const answers = harness.call("evalReadAll_", harness.spreadsheet, "Answers") as Record<string, unknown>[];
    expect(answers.every((answer) => String(answer.is_correct) === "FALSE")).toBe(true);
    expect(answers.every((answer) => Number(answer.points_awarded) === 0)).toBe(true);
  });

  it("deja la nota PENDIENTE (no en cero) cuando hay preguntas de revisión manual", () => {
    const { harness, publicCode, dto } = publishAssessment({ count: 3, manual: true });
    const questions = dto.sections[0].questions;
    const answerable = questions.filter((question) => question.questionType === "q_single_choice");
    submit(harness, publicCode, [
      ...answerable.map((question) => ({
        questionId: question.questionId,
        selectedOptionId: question.options[0].optionId,
      })),
      { questionId: "qst_manual", value: "Mi razonamiento" },
    ]);
    const row = attemptRow(harness);
    expect(String(row.grading_status)).toBe("pending_manual_review");
    expect(row.score).toBe("");
    expect(Number(row.auto_score)).toBe(100);
    expect(row.passed).toBe("");
    expect(Number(row.manual_pending_count)).toBe(1);
  });

  it("no divide por cero cuando no hay preguntas calificables", () => {
    const harness = loadInitializedAppsScript();
    const created = harness.request("createAssessment", { title: "Solo abiertas", category: "knowledge", actor: "u" })
      .data as { assessment: { assessmentId: string; entityVersion: number }; sections: { sectionId: string }[] };
    const sectionId = created.sections[0].sectionId;
    const saved = harness.request("updateAssessment", {
      assessmentId: created.assessment.assessmentId,
      expectedEntityVersion: created.assessment.entityVersion,
      actor: "u",
      assessment: { title: "Solo abiertas", accessType: "public", passingScore: null, durationMinutes: null },
      sections: [{ sectionId, title: "S", position: 0, active: true }],
      questions: [
        {
          questionId: "qst_abierta",
          sectionId,
          questionType: "q_long_text",
          questionText: "Describe tu experiencia",
          position: 0,
          scoringMode: "manual",
          maxPoints: 10,
          active: true,
        },
      ],
      options: [],
    }).data as { assessment: { entityVersion: number } };
    const published = harness.request("publishAssessment", {
      assessmentId: created.assessment.assessmentId,
      expectedEntityVersion: saved.assessment.entityVersion,
      actor: "u",
    }).data as { assessment: { publicCode: string } };

    const response = submit(harness, published.assessment.publicCode, [
      { questionId: "qst_abierta", value: "Mucha experiencia" },
    ]);
    expect(response.ok).toBe(true);
    const row = attemptRow(harness);
    expect(Number(row.gradable_questions)).toBe(0);
    expect(Number(row.auto_score)).toBe(0);
    expect(String(row.grading_status)).toBe("pending_manual_review");
    expect(row.score).toBe("");
  });

  it("no procesa dos veces el mismo envío (idempotencia por requestId)", () => {
    const { harness, publicCode, dto } = publishAssessment({ count: 2 });
    const questions = dto.sections[0].questions;
    const answers = questions.map((question) => ({
      questionId: question.questionId,
      selectedOptionId: question.options[0].optionId,
    }));
    const first = submit(harness, publicCode, answers, "req_unico");
    const second = submit(harness, publicCode, answers, "req_unico");
    expect(first.ok).toBe(true);
    expect(second.warnings).toContain("IDEMPOTENT_REPLAY");
    const attempts = harness.call("evalReadAll_", harness.spreadsheet, "Attempts") as unknown[];
    expect(attempts).toHaveLength(1);
    const stored = harness.call("evalReadAll_", harness.spreadsheet, "Answers") as unknown[];
    expect(stored).toHaveLength(2);
  });

  it("rechaza reenviar un intento ya enviado", () => {
    const { harness, publicCode, dto } = publishAssessment({ count: 2 });
    const questions = dto.sections[0].questions;
    const started = harness.request(
      "startAttempt",
      { publicCode, participant: { name: "Ana" } },
      "req_start",
    ).data as { attemptId: string };
    const answers = questions.map((question) => ({
      questionId: question.questionId,
      selectedOptionId: question.options[0].optionId,
    }));
    const first = harness.request(
      "submitAttempt",
      { publicCode, attemptId: started.attemptId, answers },
      "req_envio_1",
    ) as Envelope;
    expect(first.ok).toBe(true);
    const second = harness.request(
      "submitAttempt",
      { publicCode, attemptId: started.attemptId, answers },
      "req_envio_2",
    ) as Envelope;
    expect(second.ok).toBe(false);
    expect(second.error?.code).toBe("CONFLICT");
  });

  it("ancla el intento a la versión publicada, no al borrador posterior", () => {
    const { harness, publicCode, dto, assessmentId } = publishAssessment({ count: 2 });
    const questions = dto.sections[0].questions;
    const started = harness.request("startAttempt", { publicCode }, "req_s").data as {
      attemptId: string;
      versionId: string;
      assessmentVersion: number;
    };

    // El reclutador cambia la respuesta correcta en el BORRADOR después de que el
    // candidato empezó.
    const current = harness.request("getAdminAssessment", { assessmentId }).data as {
      assessment: { entityVersion: number };
      sections: { sectionId: string }[];
      questions: Record<string, unknown>[];
      options: Record<string, unknown>[];
    };
    harness.request("updateAssessment", {
      assessmentId,
      expectedEntityVersion: current.assessment.entityVersion,
      actor: "u",
      assessment: { title: "Prueba", accessType: "public", passingScore: 70, durationMinutes: 15 },
      sections: [{ sectionId: current.sections[0].sectionId, title: "Sección 1", position: 0, active: true }],
      questions: current.questions,
      options: current.options.map((option) => ({ ...option, isCorrect: !option.isCorrect })),
    });

    const response = harness.request(
      "submitAttempt",
      {
        publicCode,
        attemptId: started.attemptId,
        answers: questions.map((question) => ({
          questionId: question.questionId,
          selectedOptionId: question.options[0].optionId,
        })),
      },
      "req_envio",
    ) as Envelope;
    expect(response.ok).toBe(true);
    const row = attemptRow(harness);
    // Se califica con el snapshot original: las respuestas siguen siendo correctas.
    expect(Number(row.score)).toBe(100);
    expect(String(row.version_id)).toBe(started.versionId);
  });

  it("califica valores numéricos con tolerancia cuando hay valor esperado", () => {
    const harness = loadInitializedAppsScript();
    const created = harness.request("createAssessment", { title: "Numérica", category: "numerical", actor: "u" })
      .data as { assessment: { assessmentId: string; entityVersion: number }; sections: { sectionId: string }[] };
    const sectionId = created.sections[0].sectionId;
    const saved = harness.request("updateAssessment", {
      assessmentId: created.assessment.assessmentId,
      expectedEntityVersion: created.assessment.entityVersion,
      actor: "u",
      assessment: { title: "Numérica", accessType: "public", passingScore: null, durationMinutes: null },
      sections: [{ sectionId, title: "S", position: 0, active: true }],
      questions: [
        {
          questionId: "qst_num",
          sectionId,
          questionType: "q_percentage",
          questionText: "Morosidad de 15/200 en %",
          position: 0,
          scoringMode: "exact",
          maxPoints: 1,
          active: true,
          configuration: { expectedValue: 7.5, tolerance: 0.1 },
        },
      ],
      options: [],
    }).data as { assessment: { entityVersion: number } };
    const published = harness.request("publishAssessment", {
      assessmentId: created.assessment.assessmentId,
      expectedEntityVersion: saved.assessment.entityVersion,
      actor: "u",
    }).data as { assessment: { publicCode: string } };

    submit(harness, published.assessment.publicCode, [{ questionId: "qst_num", value: 7.55 }], "req_1");
    expect(Number(attemptRow(harness).score)).toBe(100);

    submit(harness, published.assessment.publicCode, [{ questionId: "qst_num", value: 9 }], "req_2");
    expect(Number(attemptRow(harness).score)).toBe(0);
  });

  it("registra los resultados agregados sin inventar métricas", () => {
    const { harness, publicCode, dto, assessmentId } = publishAssessment({ count: 2 });
    const questions = dto.sections[0].questions;

    const emptyResults = harness.request("listAssessmentResults", { assessmentId }).data as {
      attempts: unknown[];
      summary: { total: number; averageScore: number | null; passRate: number | null };
    };
    expect(emptyResults.attempts).toHaveLength(0);
    expect(emptyResults.summary.averageScore).toBeNull();
    expect(emptyResults.summary.passRate).toBeNull();

    submit(harness, publicCode, [
      { questionId: questions[0].questionId, selectedOptionId: questions[0].options[0].optionId },
      { questionId: questions[1].questionId, selectedOptionId: questions[1].options[1].optionId },
    ]);
    const results = harness.request("listAssessmentResults", { assessmentId }).data as {
      attempts: { score: number | null }[];
      summary: { total: number; graded: number; averageScore: number | null; passRate: number | null };
    };
    expect(results.summary.total).toBe(1);
    expect(results.summary.graded).toBe(1);
    expect(results.summary.averageScore).toBe(50);
    expect(results.summary.passRate).toBe(0);
  });

  it("el detalle administrativo de un intento SÍ muestra la clave de respuestas", () => {
    const { harness, publicCode, dto } = publishAssessment({ count: 2 });
    const questions = dto.sections[0].questions;
    const response = submit(harness, publicCode, [
      { questionId: questions[0].questionId, selectedOptionId: questions[0].options[0].optionId },
    ]) as Envelope;
    const attemptId = (response.data as { attemptId: string }).attemptId;
    const detail = harness.request("getAttemptDetail", { attemptId }).data as {
      answers: { isCorrect: boolean | null; questionText: string; selectedOptionText: string }[];
    };
    expect(detail.answers[0].isCorrect).toBe(true);
    expect(detail.answers[0].questionText).toContain("Pregunta 1");
    expect(detail.answers[0].selectedOptionText).toBe("Correcta");
  });
});
