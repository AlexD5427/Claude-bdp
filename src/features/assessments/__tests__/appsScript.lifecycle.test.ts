import { describe, it, expect } from "vitest";
import { loadInitializedAppsScript } from "../../../../scripts/run-apps-script.mjs";

/**
 * Ciclo de vida administrativo: crear, guardar borradores incompletos, publicar,
 * conflictos de versión, idempotencia, bloqueo, duplicar, archivar y restaurar.
 */

interface Envelope {
  ok: boolean;
  requestId: string;
  data: unknown;
  error: { code: string; message: string; details: Record<string, unknown> } | null;
  warnings: string[];
}

interface Bundle {
  assessment: Record<string, unknown> & { assessmentId: string; entityVersion: number };
  sections: { sectionId: string }[];
  questions: { questionId: string; position: number; active: boolean }[];
  options: { optionId: string; questionId: string; position: number; isCorrect: boolean }[];
  versions: { versionId: string; versionLabel: string; state: string; gradableQuestionCount: number }[];
}

function setup() {
  const harness = loadInitializedAppsScript();
  const created = harness.request("createAssessment", {
    title: "Riesgo crediticio",
    category: "knowledge",
    actor: "reclutador@ejemplo.com",
  }) as Envelope;
  expect(created.ok).toBe(true);
  const bundle = created.data as Bundle;
  return { harness, bundle };
}

function fullPayload(bundle: Bundle) {
  const sectionId = bundle.sections[0].sectionId;
  return {
    assessmentId: bundle.assessment.assessmentId,
    expectedEntityVersion: bundle.assessment.entityVersion,
    actor: "reclutador@ejemplo.com",
    assessment: {
      title: "Riesgo crediticio",
      description: "Evaluación de conocimientos",
      instructions: "Lee con atención.",
      durationMinutes: 20,
      passingScore: 70,
      accessType: "public",
      category: "knowledge",
    },
    sections: [{ sectionId, title: "Conocimientos", position: 0, active: true }],
    questions: [
      {
        questionId: "qst_a",
        sectionId,
        questionType: "q_single_choice",
        questionText: "¿Qué mide la morosidad?",
        position: 0,
        required: true,
        scoringMode: "exact",
        maxPoints: 1,
        active: true,
      },
    ],
    options: [
      { optionId: "opt_a1", questionId: "qst_a", optionText: "Atrasos", optionValue: "a", position: 0, isCorrect: true, active: true },
      { optionId: "opt_a2", questionId: "qst_a", optionText: "Utilidad", optionValue: "b", position: 1, isCorrect: false, active: true },
    ],
  };
}

describe("apps-script · ciclo de vida", () => {
  it("crea una evaluación en borrador con su sección inicial y código público", () => {
    const { bundle } = setup();
    expect(bundle.assessment.status).toBe("draft");
    expect(bundle.assessment.publicCode).toMatch(/^EVL-[A-Z0-9]+-[A-Z0-9]{4}$/);
    expect(bundle.sections).toHaveLength(1);
    expect(bundle.questions).toHaveLength(0);
  });

  it("guarda un borrador INCOMPLETO (sin título ni opciones) sin quejarse", () => {
    const { harness, bundle } = setup();
    const response = harness.request("updateAssessment", {
      assessmentId: bundle.assessment.assessmentId,
      expectedEntityVersion: bundle.assessment.entityVersion,
      actor: "u",
      assessment: { title: "", durationMinutes: null, passingScore: null, accessType: "public" },
      sections: [{ sectionId: bundle.sections[0].sectionId, title: "", position: 0, active: true }],
      questions: [
        {
          questionId: "qst_incompleta",
          sectionId: bundle.sections[0].sectionId,
          questionType: "q_single_choice",
          questionText: "",
          position: 0,
          active: true,
        },
      ],
      options: [],
    }) as Envelope;
    expect(response.ok).toBe(true);
    expect((response.data as Bundle).questions).toHaveLength(1);
  });

  it("normaliza las posiciones y desactiva lo que ya no llega en lugar de borrarlo", () => {
    const { harness, bundle } = setup();
    const sectionId = bundle.sections[0].sectionId;
    const first = harness.request("updateAssessment", {
      ...fullPayload(bundle),
      questions: [
        { questionId: "qst_1", sectionId, questionType: "q_short_text", questionText: "Uno", position: 9, active: true },
        { questionId: "qst_2", sectionId, questionType: "q_short_text", questionText: "Dos", position: 4, active: true },
      ],
      options: [],
    }) as Envelope;
    const saved = first.data as Bundle;
    expect(saved.questions.map((q) => q.position)).toEqual([0, 1]);

    const second = harness.request("updateAssessment", {
      ...fullPayload(bundle),
      expectedEntityVersion: saved.assessment.entityVersion,
      questions: [
        { questionId: "qst_2", sectionId, questionType: "q_short_text", questionText: "Dos", position: 0, active: true },
      ],
      options: [],
    }) as Envelope;
    const after = second.data as Bundle;
    // `qst_1` sigue en la hoja pero desactivada: los intentos históricos podrán
    // resolver su referencia.
    const rows = harness.call("evalReadAll_", harness.spreadsheet, "Questions") as Record<string, unknown>[];
    const removed = rows.find((row) => row.question_id === "qst_1");
    expect(removed).toBeDefined();
    expect(String(removed!.active)).toBe("FALSE");
    expect(after.questions.map((q) => q.questionId)).toEqual(["qst_2"]);
  });

  it("rechaza una opción que apunta a una pregunta inexistente", () => {
    const { harness, bundle } = setup();
    const response = harness.request("updateAssessment", {
      ...fullPayload(bundle),
      options: [
        { optionId: "opt_x", questionId: "qst_inexistente", optionText: "X", position: 0, active: true },
      ],
    }) as Envelope;
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe("VALIDATION_ERROR");
    const issues = response.error?.details.issues as { code: string }[];
    expect(issues.map((issue) => issue.code)).toContain("ORPHAN_OPTION");
  });

  it("rechaza identificadores duplicados dentro de la misma carga", () => {
    const { harness, bundle } = setup();
    const sectionId = bundle.sections[0].sectionId;
    const response = harness.request("updateAssessment", {
      ...fullPayload(bundle),
      questions: [
        { questionId: "qst_dup", sectionId, questionType: "q_short_text", questionText: "A", position: 0, active: true },
        { questionId: "qst_dup", sectionId, questionType: "q_short_text", questionText: "B", position: 1, active: true },
      ],
      options: [],
    }) as Envelope;
    expect(response.ok).toBe(false);
    const issues = response.error?.details.issues as { code: string }[];
    expect(issues.map((issue) => issue.code)).toContain("DUPLICATE_QUESTION_ID");
  });

  it("detecta el conflicto de versión en lugar de sobrescribir", () => {
    const { harness, bundle } = setup();
    const first = harness.request("updateAssessment", fullPayload(bundle)) as Envelope;
    expect(first.ok).toBe(true);
    // Segunda escritura con la versión antigua: otro usuario ya guardó.
    const stale = harness.request("updateAssessment", fullPayload(bundle)) as Envelope;
    expect(stale.ok).toBe(false);
    expect(stale.error?.code).toBe("CONFLICT");
  });

  it("no repite el efecto cuando llega dos veces el mismo requestId", () => {
    const { harness, bundle } = setup();
    const requestId = "req_doble_clic";
    const first = harness.request("updateAssessment", fullPayload(bundle), requestId) as Envelope;
    expect(first.ok).toBe(true);
    const second = harness.request("updateAssessment", fullPayload(bundle), requestId) as Envelope;
    expect(second.ok).toBe(true);
    expect(second.warnings).toContain("IDEMPOTENT_REPLAY");
    // La versión de entidad NO avanzó una segunda vez.
    const detail = harness.request("getAdminAssessment", {
      assessmentId: bundle.assessment.assessmentId,
    }) as Envelope;
    expect((detail.data as Bundle).assessment.entityVersion).toBe(
      (first.data as Bundle).assessment.entityVersion,
    );
  });

  it("exige requestId en toda escritura", () => {
    const { harness, bundle } = setup();
    // La credencial se firma para ESTA solicitud (con `requestId` vacío), de modo
    // que lo que se comprueba sea la idempotencia y no la autorización.
    const response = harness.rawRequest(
      "updateAssessment",
      fullPayload(bundle),
      "",
      harness.sign("updateAssessment", ""),
    ) as Envelope;
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe("BAD_REQUEST");
  });

  it("toma y libera el ScriptLock en cada escritura", () => {
    const { harness, bundle } = setup();
    const before = harness.state.lockAcquisitions;
    harness.request("updateAssessment", fullPayload(bundle));
    expect(harness.state.lockAcquisitions).toBe(before + 1);
    expect(harness.state.lockReleases).toBe(harness.state.lockAcquisitions);
    expect(harness.state.lockHeld).toBe(false);
  });

  it("libera el bloqueo incluso cuando la escritura falla", () => {
    const { harness, bundle } = setup();
    harness.request("updateAssessment", {
      ...fullPayload(bundle),
      options: [{ optionId: "opt_x", questionId: "qst_ajena", optionText: "X", position: 0, active: true }],
    });
    expect(harness.state.lockHeld).toBe(false);
    expect(harness.state.lockReleases).toBe(harness.state.lockAcquisitions);
  });

  it("responde LOCK_TIMEOUT cuando no puede obtener el bloqueo", () => {
    const harness = loadInitializedAppsScript({ lockAvailable: false });
    const response = harness.request("createAssessment", { title: "X", category: "knowledge" }) as Envelope;
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe("LOCK_TIMEOUT");
  });

  it("publica una versión inmutable con snapshot, checksum y conteo calificable", () => {
    const { harness, bundle } = setup();
    const saved = (harness.request("updateAssessment", fullPayload(bundle)).data as Bundle).assessment;
    const published = harness.request("publishAssessment", {
      assessmentId: bundle.assessment.assessmentId,
      expectedEntityVersion: saved.entityVersion,
      notes: "Primera versión",
      actor: "u",
    }) as Envelope;
    expect(published.ok).toBe(true);
    const result = published.data as Bundle;
    expect(result.assessment.status).toBe("published");
    expect(result.versions).toHaveLength(1);
    expect(result.versions[0].versionLabel).toBe("v1.0");
    expect(result.versions[0].gradableQuestionCount).toBe(1);

    const rows = harness.call("evalReadAll_", harness.spreadsheet, "Versions") as Record<string, unknown>[];
    expect(String(rows[0].checksum)).toHaveLength(32);
    expect(String(rows[0].snapshot_json)).toContain("qst_a");
  });

  it("rechaza publicar sin título y devuelve hallazgos navegables", () => {
    const { harness, bundle } = setup();
    const payload = fullPayload(bundle);
    const saved = (
      harness.request("updateAssessment", { ...payload, assessment: { ...payload.assessment, title: "" } })
        .data as Bundle
    ).assessment;
    const response = harness.request("publishAssessment", {
      assessmentId: bundle.assessment.assessmentId,
      expectedEntityVersion: saved.entityVersion,
      actor: "u",
    }) as Envelope;
    expect(response.ok).toBe(false);
    const issues = response.error?.details.issues as { code: string; path?: string }[];
    expect(issues.map((issue) => issue.code)).toContain("MISSING_TITLE");
    expect(issues.find((issue) => issue.code === "MISSING_TITLE")?.path).toBe("title");
  });

  it("una publicada NO se edita destructivamente: el snapshot no cambia", () => {
    const { harness, bundle } = setup();
    const payload = fullPayload(bundle);
    const saved = (harness.request("updateAssessment", payload).data as Bundle).assessment;
    harness.request("publishAssessment", {
      assessmentId: bundle.assessment.assessmentId,
      expectedEntityVersion: saved.entityVersion,
      actor: "u",
    });
    const beforeRows = harness.call("evalReadAll_", harness.spreadsheet, "Versions") as Record<string, unknown>[];
    const snapshotBefore = String(beforeRows[0].snapshot_json);

    const current = harness.request("getAdminAssessment", {
      assessmentId: bundle.assessment.assessmentId,
    }).data as Bundle;
    harness.request("updateAssessment", {
      ...payload,
      expectedEntityVersion: current.assessment.entityVersion,
      questions: [
        {
          ...payload.questions[0],
          questionText: "Enunciado cambiado tras publicar",
        },
      ],
    });
    const afterRows = harness.call("evalReadAll_", harness.spreadsheet, "Versions") as Record<string, unknown>[];
    expect(String(afterRows[0].snapshot_json)).toBe(snapshotBefore);
  });

  it("un cambio estructural sube la versión mayor; uno cosmético, la menor", () => {
    const { harness, bundle } = setup();
    const payload = fullPayload(bundle);
    let current = harness.request("updateAssessment", payload).data as Bundle;
    harness.request("publishAssessment", {
      assessmentId: bundle.assessment.assessmentId,
      expectedEntityVersion: current.assessment.entityVersion,
      actor: "u",
    });

    // Cambio cosmético: solo el enunciado.
    current = harness.request("getAdminAssessment", { assessmentId: bundle.assessment.assessmentId })
      .data as Bundle;
    harness.request("updateAssessment", {
      ...payload,
      expectedEntityVersion: current.assessment.entityVersion,
      questions: [{ ...payload.questions[0], questionText: "Redacción mejorada" }],
    });
    current = harness.request("getAdminAssessment", { assessmentId: bundle.assessment.assessmentId })
      .data as Bundle;
    let published = harness.request("publishAssessment", {
      assessmentId: bundle.assessment.assessmentId,
      expectedEntityVersion: current.assessment.entityVersion,
      actor: "u",
    }).data as Bundle;
    expect(published.assessment.versionLabel).toBe("v1.1");

    // Cambio estructural: la respuesta correcta.
    current = harness.request("getAdminAssessment", { assessmentId: bundle.assessment.assessmentId })
      .data as Bundle;
    harness.request("updateAssessment", {
      ...payload,
      expectedEntityVersion: current.assessment.entityVersion,
      options: [
        { ...payload.options[0], isCorrect: false },
        { ...payload.options[1], isCorrect: true },
      ],
    });
    current = harness.request("getAdminAssessment", { assessmentId: bundle.assessment.assessmentId })
      .data as Bundle;
    published = harness.request("publishAssessment", {
      assessmentId: bundle.assessment.assessmentId,
      expectedEntityVersion: current.assessment.entityVersion,
      actor: "u",
    }).data as Bundle;
    expect(published.assessment.versionLabel).toBe("v2.0");
  });

  it("duplicar genera identificadores nuevos y no arrastra versiones ni intentos", () => {
    const { harness, bundle } = setup();
    const payload = fullPayload(bundle);
    const saved = (harness.request("updateAssessment", payload).data as Bundle).assessment;
    harness.request("publishAssessment", {
      assessmentId: bundle.assessment.assessmentId,
      expectedEntityVersion: saved.entityVersion,
      actor: "u",
    });
    const copy = harness.request("duplicateAssessment", {
      assessmentId: bundle.assessment.assessmentId,
      actor: "u",
    }).data as Bundle;

    expect(copy.assessment.assessmentId).not.toBe(bundle.assessment.assessmentId);
    expect(copy.assessment.publicCode).not.toBe(bundle.assessment.publicCode);
    expect(copy.assessment.status).toBe("draft");
    expect(copy.versions).toHaveLength(0);
    expect(copy.questions[0].questionId).not.toBe("qst_a");
    expect(copy.options[0].optionId).not.toBe("opt_a1");
    // La respuesta correcta se conserva en la copia.
    expect(copy.options.filter((option) => option.isCorrect)).toHaveLength(1);
  });

  it("archiva, bloquea la edición y restaura", () => {
    const { harness, bundle } = setup();
    harness.request("updateAssessment", fullPayload(bundle));
    const archived = harness.request("archiveAssessment", {
      assessmentId: bundle.assessment.assessmentId,
      actor: "u",
    }) as Envelope;
    expect(archived.ok).toBe(true);
    expect((archived.data as Bundle).assessment.status).toBe("archived");

    const current = (archived.data as Bundle).assessment;
    const blocked = harness.request("updateAssessment", {
      ...fullPayload(bundle),
      expectedEntityVersion: current.entityVersion,
    }) as Envelope;
    expect(blocked.ok).toBe(false);
    expect(blocked.error?.code).toBe("CONFLICT");

    const restored = harness.request("unarchiveAssessment", {
      assessmentId: bundle.assessment.assessmentId,
      actor: "u",
    }) as Envelope;
    expect(restored.ok).toBe(true);
    expect((restored.data as Bundle).assessment.status).toBe("draft");
  });

  it("rechaza transiciones imposibles con CONFLICT", () => {
    const { harness, bundle } = setup();
    const response = harness.request("pauseAssessment", {
      assessmentId: bundle.assessment.assessmentId,
      actor: "u",
    }) as Envelope;
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe("CONFLICT");
  });

  it("escribe la auditoría de cada operación sin datos sensibles", () => {
    const { harness, bundle } = setup();
    harness.request("updateAssessment", fullPayload(bundle));
    const rows = harness.call("evalReadAll_", harness.spreadsheet, "AuditLog") as Record<string, unknown>[];
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const text = JSON.stringify(rows);
    expect(text).not.toContain("isCorrect");
    expect(text).not.toContain("¿Qué mide la morosidad?");
    expect(rows.some((row) => row.action === "updateAssessment")).toBe(true);
  });

  it("responde NOT_FOUND para una evaluación inexistente", () => {
    const harness = loadInitializedAppsScript();
    const response = harness.request("getAdminAssessment", { assessmentId: "asm_nada" }) as Envelope;
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe("NOT_FOUND");
  });

  it("rechaza acciones desconocidas", () => {
    const harness = loadInitializedAppsScript();
    const response = harness.request("borrarTodo", {}) as Envelope;
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe("UNSUPPORTED_ACTION");
  });
});

/**
 * La autorización tiene su propia suite completa en
 * `appsScript.authorization.test.ts`: proveedores, firma, frescura, repetición y
 * etiquetado del actor.
 */
