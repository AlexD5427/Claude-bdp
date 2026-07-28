import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from "vitest";
import { bootstrapPlugins } from "../question-types";
import { listAdminAssessments, updateAssessment, publishAssessment, getAdminAssessment } from "./adminApi";
import { getPublicAssessment, submitAttempt } from "./publicApi";
import { issuesOf, newRequestId, parseEnvelope, toAppError } from "./contract";
import { toAssessmentDefinition, toUpdatePayload, toAssessmentSummaryFromDTO } from "./mapper";
import { adminBundleSchema } from "./dto";

/**
 * Capa de API del módulo.
 *
 * `fetch` se simula para verificar el CONTRATO, no la red: forma del cuerpo,
 * cabeceras exigidas por Apps Script, reintentos solo en lecturas, traducción de
 * errores y validación de la respuesta.
 */

interface Call {
  url: string;
  init: RequestInit;
}

let calls: Call[] = [];

function mockFetch(responses: unknown[] | (() => unknown), status = 200) {
  calls = [];
  let index = 0;
  const stub = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const body = typeof responses === "function" ? responses() : responses[Math.min(index++, responses.length - 1)];
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  });
  vi.stubGlobal("fetch", stub);
  return stub;
}

function okEnvelope(data: unknown, warnings: string[] = []) {
  return { ok: true, requestId: "req_1", data, error: null, warnings };
}

function failEnvelope(code: string, message: string, details: Record<string, unknown> = {}) {
  return { ok: false, requestId: "req_1", data: null, error: { code, message, details }, warnings: [] };
}

const BUNDLE = {
  assessment: {
    assessmentId: "asm_1",
    publicCode: "EVL-TEST-0001",
    title: "Prueba",
    description: "",
    instructions: "Instrucciones",
    internalInstructions: "internas",
    status: "draft",
    durationMinutes: 20,
    passingScore: 70,
    accessType: "public",
    version: 1,
    versionMinor: 0,
    versionLabel: "v1.0",
    lifecycleStatus: "draft",
    publicationStatus: "unpublished",
    category: "knowledge",
    purpose: "",
    questionCount: 1,
    tags: ["a"],
    linkedProcessIds: [],
    policies: { scoring: { mode: "sum" } },
    theme: {},
    rules: [],
    rubrics: [],
    currentPublishedVersionId: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "u",
    updatedAt: "2026-01-02T00:00:00.000Z",
    updatedBy: "u",
    publishedAt: "",
    archivedAt: "",
    entityVersion: 3,
    schemaVersion: 1,
  },
  sections: [
    {
      sectionId: "sec_1",
      assessmentId: "asm_1",
      title: "Sección 1",
      description: "",
      position: 0,
      timeLimitSeconds: null,
      randomize: false,
      poolSize: null,
      weight: 1,
      active: true,
    },
  ],
  questions: [
    {
      questionId: "qst_1",
      assessmentId: "asm_1",
      sectionId: "sec_1",
      questionText: "¿Capital?",
      questionType: "q_single_choice",
      position: 0,
      required: true,
      scoringMode: "exact",
      maxPoints: 1,
      weight: 1,
      active: true,
      helpText: "",
      description: "",
      competency: "",
      code: "",
      configuration: {},
      validation: {},
      feedback: {},
      media: null,
      accessibility: {},
      tags: [],
      configurationSchemaVersion: 1,
    },
  ],
  options: [
    {
      optionId: "opt_1",
      questionId: "qst_1",
      assessmentId: "asm_1",
      optionText: "Correcta",
      optionValue: "a",
      position: 0,
      isCorrect: true,
      scoreValue: 1,
      matchingKey: "",
      active: true,
      feedback: "",
      mediaUrl: "",
      configuration: {},
    },
    {
      optionId: "opt_2",
      questionId: "qst_1",
      assessmentId: "asm_1",
      optionText: "Incorrecta",
      optionValue: "b",
      position: 1,
      isCorrect: false,
      scoreValue: 0,
      matchingKey: "",
      active: true,
      feedback: "",
      mediaUrl: "",
      configuration: {},
    },
  ],
  versions: [],
};

beforeAll(() => bootstrapPlugins());
beforeEach(() => {
  vi.useRealTimers();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("transporte", () => {
  it("envía las acciones públicas por POST con text/plain y sigue el redirect de Google", async () => {
    // El contenido de la respuesta no importa aquí: lo que se verifica es cómo
    // sale la petición hacia el Web App de Apps Script.
    mockFetch([okEnvelope({})]);
    await getPublicAssessment("EVL-TEST-0001");
    expect(calls).toHaveLength(1);
    expect(calls[0].init.method).toBe("POST");
    expect((calls[0].init.headers as Record<string, string>)["Content-Type"]).toBe(
      "text/plain;charset=utf-8",
    );
    expect(calls[0].init.redirect).toBe("follow");
  });

  it("envía la acción y la carga en el cuerpo", async () => {
    mockFetch([okEnvelope({ items: [], total: 0, syncedAt: "" })]);
    await listAdminAssessments({ search: "riesgo" });
    const body = JSON.parse(String(calls[0].init.body)) as Record<string, unknown>;
    expect(body.action).toBe("listAdminAssessments");
    expect(body.payload).toEqual({ search: "riesgo" });
  });

  it("reintenta las LECTURAS ante un fallo de red", async () => {
    let attempt = 0;
    const stub = vi.fn(async () => {
      attempt += 1;
      if (attempt < 3) throw new Error("network down");
      return { ok: true, status: 200, json: async () => okEnvelope({ items: [], total: 0, syncedAt: "" }) } as Response;
    });
    vi.stubGlobal("fetch", stub);
    const result = await listAdminAssessments();
    expect(result.ok).toBe(true);
    expect(stub).toHaveBeenCalledTimes(3);
  }, 10000);

  it("NO reintenta las ESCRITURAS", async () => {
    const stub = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", stub);
    const result = await updateAssessment("req_x", {
      assessmentId: "asm_1",
      expectedEntityVersion: 1,
      actor: "u",
      payload: { assessment: {}, sections: [], questions: [], options: [] },
    });
    expect(result.ok).toBe(false);
    expect(stub).toHaveBeenCalledTimes(1);
  });

  it("propaga el requestId de la escritura", async () => {
    mockFetch([okEnvelope(BUNDLE)]);
    await publishAssessment("req_publicacion", { assessmentId: "asm_1", actor: "u" });
    const body = JSON.parse(String(calls[0].init.body)) as Record<string, unknown>;
    expect(body.requestId).toBe("req_publicacion");
  });

  it("genera requestId únicos con prefijo req_", () => {
    const first = newRequestId();
    const second = newRequestId();
    expect(first).toMatch(/^req_/);
    expect(first).not.toBe(second);
  });

  it("traduce un HTTP 500 a un error de proveedor legible", async () => {
    mockFetch([okEnvelope({})], 500);
    const result = await listAdminAssessments();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("provider");
      expect(result.error.message).toMatch(/no está disponible/i);
    }
  }, 10000);
});

describe("envoltorio y errores", () => {
  it("valida la forma del envoltorio y rechaza respuestas inesperadas", () => {
    const good = parseEnvelope<{ x: number }>(okEnvelope({ x: 1 }));
    expect(good.ok).toBe(true);
    expect(good.data).toEqual({ x: 1 });

    const bad = parseEnvelope(["no", "es", "un", "envoltorio"]);
    expect(bad.ok).toBe(false);
    expect(bad.error?.code).toBe("INTERNAL_ERROR");
  });

  it("traduce cada código del servidor al vocabulario de la aplicación", () => {
    const map: [string, string][] = [
      ["VALIDATION_ERROR", "validation"],
      ["NOT_FOUND", "not_found"],
      ["CONFLICT", "conflict"],
      ["FORBIDDEN", "forbidden"],
      ["LOCK_TIMEOUT", "provider"],
      ["SCHEMA_ERROR", "provider"],
      ["CODIGO_DESCONOCIDO", "provider"],
    ];
    for (const [serverCode, appCode] of map) {
      const error = toAppError(parseEnvelope(failEnvelope(serverCode, "mensaje")));
      expect(error.code, serverCode).toBe(appCode);
    }
  });

  it("adjunta los hallazgos de validación al error", async () => {
    mockFetch([
      failEnvelope("VALIDATION_ERROR", "No se puede publicar", {
        issues: [
          { code: "MISSING_TITLE", message: "Falta el título", path: "title" },
          { code: "NO_CORRECT_OPTION", message: "Sin correcta", questionId: "qst_1" },
        ],
      }),
    ]);
    const result = await publishAssessment("req_1", { assessmentId: "asm_1", actor: "u" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const issues = issuesOf(result.error);
      expect(issues.map((issue) => issue.code)).toEqual(["MISSING_TITLE", "NO_CORRECT_OPTION"]);
      expect(issues[0].path).toBe("title");
    }
  });

  it("una repetición idempotente no se confunde con un bundle", async () => {
    mockFetch([
      okEnvelope({ idempotentReplay: true, reference: "asm_1", processedAt: "", summary: {} }, [
        "IDEMPOTENT_REPLAY",
      ]),
    ]);
    const result = await publishAssessment("req_1", { assessmentId: "asm_1", actor: "u" });
    expect(result.ok).toBe(true);
    if (result.ok) expect("replay" in result.value).toBe(true);
  });

  it("rechaza un bundle con la forma equivocada en lugar de propagarlo", async () => {
    mockFetch([okEnvelope({ assessment: { title: 42 } })]);
    const result = await getAdminAssessment("asm_1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("provider");
  });
});

describe("mapeadores DTO ↔ dominio", () => {
  it("convierte el bundle en el agregado del dominio", () => {
    const bundle = adminBundleSchema.parse(BUNDLE);
    const definition = toAssessmentDefinition(bundle);
    expect(definition.id).toBe("asm_1");
    expect(definition.code).toBe("EVL-TEST-0001");
    expect(definition.name).toBe("Prueba");
    expect(definition.estimatedDurationMinutes).toBe(20);
    expect(definition.scoringPolicy.passThreshold).toBe(70);
    expect(definition.entityVersion).toBe(3);
    expect(definition.draftVersion.content.sections).toHaveLength(1);
    const block = definition.draftVersion.content.sections[0].blocks[0];
    expect(block.id).toBe("qst_1");
    expect(block.label).toBe("¿Capital?");
    expect(block.options.map((option) => option.correct)).toEqual([true, false]);
    expect(definition.draftVersion.content.publicInstructions).toBe("Instrucciones");
    expect(definition.draftVersion.content.internalInstructions).toBe("internas");
  });

  it("descarta secciones, preguntas y opciones inactivas", () => {
    const bundle = adminBundleSchema.parse({
      ...BUNDLE,
      questions: [{ ...BUNDLE.questions[0], active: false }],
    });
    const definition = toAssessmentDefinition(bundle);
    expect(definition.draftVersion.content.sections[0].blocks).toHaveLength(0);
  });

  it("hace un viaje de ida y vuelta sin perder el contenido", () => {
    const definition = toAssessmentDefinition(adminBundleSchema.parse(BUNDLE));
    const payload = toUpdatePayload(definition);
    expect(payload.assessment.title).toBe("Prueba");
    expect(payload.assessment.durationMinutes).toBe(20);
    expect(payload.assessment.passingScore).toBe(70);
    expect(payload.sections).toHaveLength(1);
    expect(payload.questions).toHaveLength(1);
    expect(payload.options).toHaveLength(2);
    expect(payload.questions[0]).toMatchObject({
      questionId: "qst_1",
      sectionId: "sec_1",
      questionType: "q_single_choice",
      position: 0,
      scoringMode: "exact",
    });
    expect(payload.options[0]).toMatchObject({ optionId: "opt_1", isCorrect: true, position: 0 });
  });

  it("normaliza las posiciones al construir la carga", () => {
    const definition = toAssessmentDefinition(adminBundleSchema.parse(BUNDLE));
    definition.draftVersion.content.sections[0].blocks[0].order = 42;
    const payload = toUpdatePayload(definition);
    expect(payload.questions[0].position).toBe(0);
  });

  it("una duración vacía viaja como null, no como cero", () => {
    const definition = toAssessmentDefinition(adminBundleSchema.parse(BUNDLE));
    definition.estimatedDurationMinutes = 0;
    expect(toUpdatePayload(definition).assessment.durationMinutes).toBeNull();
  });

  it("mapea el resumen del listado", () => {
    const summary = toAssessmentSummaryFromDTO({
      ...BUNDLE.assessment,
      linkedProcessCount: 2,
    } as never);
    expect(summary.id).toBe("asm_1");
    expect(summary.questionCount).toBe(1);
    expect(summary.estimatedDurationMinutes).toBe(20);
    expect(summary.linkedProcessCount).toBe(2);
    expect(summary.synchronizationStatus).toBe("synced");
  });

  it("cae en valores por omisión seguros ante enumeraciones desconocidas", () => {
    const summary = toAssessmentSummaryFromDTO({
      ...BUNDLE.assessment,
      category: "categoria_inventada",
      lifecycleStatus: "estado_raro",
      publicationStatus: "otro",
      linkedProcessCount: 0,
    } as never);
    expect(summary.category).toBe("knowledge");
    expect(summary.lifecycle).toBe("draft");
    expect(summary.publication).toBe("unpublished");
  });
});

describe("API pública", () => {
  it("valida el DTO público y no expone claves", async () => {
    mockFetch([
      okEnvelope({
        publicCode: "EVL-TEST-0001",
        title: "Prueba",
        description: "",
        instructions: "Lee",
        durationMinutes: 20,
        versionLabel: "v1.0",
        assessmentVersion: 1,
        questionCount: 1,
        theme: {},
        navigation: {},
        consent: {},
        sections: [
          {
            sectionId: "sec_1",
            title: "S",
            description: "",
            position: 0,
            timeLimitSeconds: null,
            questions: [
              {
                questionId: "qst_1",
                questionType: "q_single_choice",
                position: 0,
                questionText: "¿Capital?",
                description: "",
                helpText: "",
                required: true,
                configuration: {},
                media: null,
                accessibility: { ariaLabel: "", longDescription: "" },
                options: [{ optionId: "opt_1", optionValue: "a", optionText: "Correcta", mediaUrl: null }],
              },
            ],
          },
        ],
      }),
    ]);
    const result = await getPublicAssessment("EVL-TEST-0001");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const serialized = JSON.stringify(result.value);
      expect(serialized).not.toContain("isCorrect");
      expect(serialized).not.toContain("scoreValue");
      expect(result.value.sections[0].questions[0].options).toHaveLength(1);
    }
  });

  it("el envío del intento no manda ningún dato de calificación", async () => {
    mockFetch([
      okEnvelope({ attemptId: "att_1", status: "submitted", gradingStatus: "automatically_graded", received: 1 }),
    ]);
    await submitAttempt("req_envio", {
      publicCode: "EVL-TEST-0001",
      answers: [{ questionId: "qst_1", selectedOptionId: "opt_1" }],
    });
    const body = JSON.parse(String(calls[0].init.body)) as { payload: Record<string, unknown> };
    const serialized = JSON.stringify(body.payload);
    expect(serialized).not.toContain("isCorrect");
    expect(serialized).not.toContain("pointsAwarded");
    expect(serialized).not.toContain('"score"');
    expect(serialized).not.toContain('"passed"');
  });
});
