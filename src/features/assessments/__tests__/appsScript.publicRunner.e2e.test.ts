import { describe, it, expect } from "vitest";
import { loadInitializedAppsScript } from "../../../../scripts/run-apps-script.mjs";

/**
 * Recorrido completo del portal público sobre la evaluación que fallaba:
 * publicar → abrir por código → iniciar intento → responder → enviar → calificar
 * → comprobar filas en `Attempts` y `Answers` → pausar y cerrar el acceso.
 *
 * Cubre además las tres dudas que dejó la auditoría del Excel:
 *
 *   · una pregunta `q_multiple_choice` con dos opciones correctas se califica
 *     como conjunto exacto, no como opción única;
 *   · `score_value = 0` con `max_points = 5` no da siempre cero, porque el modo
 *     `exact` califica por `is_correct` y la nota final es
 *     aciertos / preguntas calificables × 100;
 *   · `policies_json.scoring.mode = "none"` es inerte: no cambia la nota.
 */

interface Envelope {
  ok: boolean;
  data: unknown;
  error: { code: string; message: string } | null;
  warnings: string[];
}

interface Bundle {
  assessment: { assessmentId: string; publicCode: string; entityVersion: number };
  sections: { sectionId: string }[];
}

interface PublicAssessment {
  title: string;
  questionCount: number;
  durationMinutes: number | null;
  sections: {
    questions: { questionId: string; questionType: string; options: { optionId: string }[] }[];
  }[];
}

type Harness = ReturnType<typeof loadInitializedAppsScript>;

const ACTOR = "reclutador@ejemplo.com";
/** Índice de la pregunta de selección múltiple dentro del cuestionario. */
const MULTIPLE_INDEX = 19;

/** Publica una evaluación de 20 preguntas equivalente a `EVL-NUEV-DB21`. */
function publishAuditedAssessment(): { harness: Harness; publicCode: string; correct: Map<string, string[]> } {
  const harness = loadInitializedAppsScript();
  const created = harness.request("createAssessment", {
    title: "EVALUACIÓN - AUDITOR OPERATIVO (PLAZO FIJO)",
    category: "knowledge",
    actor: ACTOR,
  }) as Envelope;
  const draft = created.data as Bundle;
  const sectionId = draft.sections[0].sectionId;

  const questions = [];
  const options = [];
  /** questionId → ids de las opciones correctas. */
  const correct = new Map<string, string[]>();

  for (let i = 0; i < 20; i += 1) {
    const questionId = `qst_e2e${String(i).padStart(4, "0")}`;
    const multiple = i === MULTIPLE_INDEX;
    questions.push({
      questionId,
      sectionId,
      questionType: multiple ? "q_multiple_choice" : "q_single_choice",
      questionText: `Pregunta ${i + 1} de auditoría operativa`,
      position: i,
      required: true,
      scoringMode: "exact",
      maxPoints: 5,
      weight: 5,
      active: true,
    });
    const correctIds: string[] = [];
    for (let o = 0; o < 4; o += 1) {
      const optionId = `opt_e2e${String(i).padStart(4, "0")}_${o}`;
      const isCorrect = multiple ? o < 2 : o === 0;
      if (isCorrect) correctIds.push(optionId);
      options.push({
        optionId,
        questionId,
        optionText: `Opción ${String.fromCharCode(65 + o)}`,
        optionValue: String.fromCharCode(97 + o),
        position: o,
        isCorrect,
        // Como en el libro auditado: todas las opciones valen 0.
        scoreValue: 0,
        active: true,
      });
    }
    correct.set(questionId, correctIds);
  }

  const saved = harness.request("updateAssessment", {
    assessmentId: draft.assessment.assessmentId,
    expectedEntityVersion: draft.assessment.entityVersion,
    actor: ACTOR,
    assessment: {
      title: "EVALUACIÓN - AUDITOR OPERATIVO (PLAZO FIJO)",
      instructions: "Lea cada pregunta con atención.",
      durationMinutes: 7,
      passingScore: 51,
      accessType: "public",
      category: "knowledge",
      policies: { scoring: { mode: "none" } },
    },
    sections: [{ sectionId, title: "Conocimientos generales", position: 0, active: true }],
    questions,
    options,
  }) as Envelope;
  expect(saved.ok).toBe(true);
  const bundle = saved.data as Bundle;

  const published = harness.request("publishAssessment", {
    assessmentId: bundle.assessment.assessmentId,
    expectedEntityVersion: bundle.assessment.entityVersion,
    actor: ACTOR,
  }) as Envelope;
  expect(published.error).toBeNull();

  return { harness, publicCode: bundle.assessment.publicCode, correct };
}

/** Filas de una hoja como objetos. */
function readSheet(harness: Harness, name: string): Record<string, unknown>[] {
  return harness.call("evalReadAll_", harness.spreadsheet, name) as Record<string, unknown>[];
}

/** Respuestas del candidato: `howManyCorrect` aciertos y el resto fallos. */
function buildAnswers(
  publicView: PublicAssessment,
  correct: Map<string, string[]>,
  howManyCorrect: number,
): { questionId: string; selectedOptionId?: string; selectedOptionIds?: string[] }[] {
  const served = publicView.sections.flatMap((section) => section.questions);
  return served.map((question, index) => {
    const correctIds = correct.get(question.questionId) ?? [];
    const good = index < howManyCorrect;
    if (question.questionType === "q_multiple_choice") {
      // Acierto = el conjunto exacto. Fallo = un subconjunto incompleto.
      return {
        questionId: question.questionId,
        selectedOptionIds: good ? correctIds : [correctIds[0]],
      };
    }
    const wrongId = question.options.map((o) => o.optionId).find((id) => !correctIds.includes(id));
    return {
      questionId: question.questionId,
      selectedOptionId: good ? correctIds[0] : wrongId,
    };
  });
}

describe("apps-script · recorrido público de extremo a extremo", () => {
  it("el candidato abre por código, responde, envía y queda calificado en el servidor", () => {
    const { harness, publicCode, correct } = publishAuditedAssessment();

    const opened = harness.request("getPublicAssessment", { publicCode }) as Envelope;
    expect(opened.ok).toBe(true);
    const publicView = opened.data as PublicAssessment;
    expect(publicView.questionCount).toBe(20);
    expect(publicView.durationMinutes).toBe(7);

    const started = harness.request("startAttempt", {
      publicCode,
      participant: { name: "Candidata de prueba", email: "candidata@ejemplo.com" },
    }) as Envelope;
    expect(started.ok).toBe(true);
    const attemptId = (started.data as { attemptId: string }).attemptId;
    expect(attemptId).toBeTruthy();

    // 20 de 20 correctas.
    const submitted = harness.request("submitAttempt", {
      publicCode,
      attemptId,
      answers: buildAnswers(publicView, correct, 20),
    }) as Envelope;
    expect(submitted.error).toBeNull();
    expect(submitted.ok).toBe(true);

    const receipt = submitted.data as { status: string; gradingStatus: string };
    expect(receipt.status).toBe("submitted");
    expect(receipt.gradingStatus).toBe("automatically_graded");

    // Filas persistidas.
    const attempts = readSheet(harness, "Attempts");
    expect(attempts).toHaveLength(1);
    expect(String(attempts[0].status)).toBe("submitted");
    expect(Number(attempts[0].score)).toBe(100);
    expect(Number(attempts[0].correct_answers)).toBe(20);
    expect(Number(attempts[0].gradable_questions)).toBe(20);
    expect(String(attempts[0].passed)).toBe("TRUE");
    // El intento queda anclado a la versión publicada.
    expect(String(attempts[0].version_id)).not.toBe("");

    const answers = readSheet(harness, "Answers");
    expect(answers).toHaveLength(20);
    for (const answer of answers) {
      expect(String(answer.attempt_id)).toBe(attemptId);
      expect(String(answer.is_correct)).toBe("TRUE");
    }
  });

  it("califica por is_correct aunque todas las opciones valgan score_value = 0", () => {
    const { harness, publicCode, correct } = publishAuditedAssessment();
    const publicView = (harness.request("getPublicAssessment", { publicCode }) as Envelope)
      .data as PublicAssessment;
    const attemptId = (
      (harness.request("startAttempt", { publicCode, participant: {} }) as Envelope).data as {
        attemptId: string;
      }
    ).attemptId;

    // 11 aciertos de 20 = 55 %, por encima de la nota mínima de 51.
    harness.request("submitAttempt", {
      publicCode,
      attemptId,
      answers: buildAnswers(publicView, correct, 11),
    });

    const attempt = readSheet(harness, "Attempts")[0];
    expect(Number(attempt.score)).toBe(55);
    expect(Number(attempt.correct_answers)).toBe(11);
    expect(String(attempt.passed)).toBe("TRUE");
  });

  it("la pregunta de selección múltiple exige el conjunto exacto de correctas", () => {
    const { harness, publicCode, correct } = publishAuditedAssessment();
    const publicView = (harness.request("getPublicAssessment", { publicCode }) as Envelope)
      .data as PublicAssessment;
    const served = publicView.sections.flatMap((section) => section.questions);
    const multiple = served[MULTIPLE_INDEX];
    expect(multiple.questionType).toBe("q_multiple_choice");
    const correctIds = correct.get(multiple.questionId) as string[];
    expect(correctIds).toHaveLength(2);

    /** Envía un intento respondiendo SOLO la pregunta múltiple. */
    const gradeMultiple = (selectedOptionIds: string[]): string => {
      const attemptId = (
        (harness.request("startAttempt", { publicCode, participant: {} }) as Envelope).data as {
          attemptId: string;
        }
      ).attemptId;
      harness.request("submitAttempt", {
        publicCode,
        attemptId,
        answers: [{ questionId: multiple.questionId, selectedOptionIds }],
      });
      const answers = readSheet(harness, "Answers").filter(
        (row) => String(row.attempt_id) === attemptId,
      );
      return String(answers[0].is_correct);
    };

    // Conjunto exacto: correcto.
    expect(gradeMultiple(correctIds)).toBe("TRUE");
    // Solo una de las dos correctas: incorrecto (no es opción única).
    expect(gradeMultiple([correctIds[0]])).toBe("FALSE");
    // Las dos correctas más una incorrecta: incorrecto.
    const wrongId = multiple.options.map((o) => o.optionId).find((id) => !correctIds.includes(id));
    expect(gradeMultiple([...correctIds, wrongId as string])).toBe("FALSE");
  });

  it("pausar cierra el acceso por código y reanudar lo devuelve", () => {
    const { harness, publicCode } = publishAuditedAssessment();
    const assessmentId = (
      (harness.request("listAdminAssessments", {}) as Envelope).data as {
        items: { assessmentId: string; entityVersion: number }[];
      }
    ).items[0].assessmentId;

    const currentVersion = (): number =>
      (
        (harness.request("getAdminAssessment", { assessmentId }) as Envelope).data as {
          assessment: { entityVersion: number };
        }
      ).assessment.entityVersion;

    const paused = harness.request("pauseAssessment", {
      assessmentId,
      expectedEntityVersion: currentVersion(),
      actor: ACTOR,
    }) as Envelope;
    expect(paused.error).toBeNull();
    expect((harness.request("getPublicAssessment", { publicCode }) as Envelope).error?.code).toBe(
      "NOT_FOUND",
    );

    const resumed = harness.request("resumeAssessment", {
      assessmentId,
      expectedEntityVersion: currentVersion(),
      actor: ACTOR,
    }) as Envelope;
    expect(resumed.error).toBeNull();
    expect((harness.request("getPublicAssessment", { publicCode }) as Envelope).ok).toBe(true);

    const closed = harness.request("closeAssessment", {
      assessmentId,
      expectedEntityVersion: currentVersion(),
      actor: ACTOR,
    }) as Envelope;
    expect(closed.error).toBeNull();
    expect((harness.request("getPublicAssessment", { publicCode }) as Envelope).error?.code).toBe(
      "NOT_FOUND",
    );
  });

  it("el ATS muestra el resultado del intento y el detalle no filtra el snapshot comprimido", () => {
    const { harness, publicCode, correct } = publishAuditedAssessment();
    const publicView = (harness.request("getPublicAssessment", { publicCode }) as Envelope)
      .data as PublicAssessment;
    const attemptId = (
      (harness.request("startAttempt", { publicCode, participant: { name: "Candidata" } }) as Envelope)
        .data as { attemptId: string }
    ).attemptId;
    harness.request("submitAttempt", {
      publicCode,
      attemptId,
      answers: buildAnswers(publicView, correct, 20),
    });

    const assessmentId = String(readSheet(harness, "Attempts")[0].assessment_id);
    const results = harness.request("listAssessmentResults", { assessmentId }) as Envelope;
    expect(results.ok).toBe(true);
    const { attempts, summary } = results.data as {
      attempts: { attemptId: string; score: number }[];
      summary: { submitted: number; graded: number; averageScore: number | null; passRate: number | null };
    };
    expect(attempts).toHaveLength(1);
    expect(attempts[0].score).toBe(100);
    expect(summary.submitted).toBe(1);
    expect(summary.graded).toBe(1);
    expect(summary.averageScore).toBe(100);
    expect(summary.passRate).toBe(100);

    const detail = harness.request("getAttemptDetail", { attemptId }) as Envelope;
    expect(detail.ok).toBe(true);
    // El marcador del snapshot comprimido nunca sale en una respuesta.
    expect(JSON.stringify(detail.data)).not.toContain("EVALGZ1:");
  });

  it("el snapshot comprimido no viaja nunca al candidato", () => {
    const { harness, publicCode } = publishAuditedAssessment();
    const version = readSheet(harness, "Versions")[0];
    // Confirmación de que este caso SÍ está comprimido.
    expect(String(version.snapshot_json)).toContain("EVALGZ1:");

    const opened = harness.request("getPublicAssessment", { publicCode }) as Envelope;
    const serialized = JSON.stringify(opened.data);
    expect(serialized).not.toContain("EVALGZ1:");
    for (const forbidden of [
      "isCorrect",
      "scoreValue",
      "matchingKey",
      "passingScore",
      "answerKey",
      "createdBy",
      "updatedBy",
      "rubrics",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
