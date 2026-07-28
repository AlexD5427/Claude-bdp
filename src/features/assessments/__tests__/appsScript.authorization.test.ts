import { describe, it, expect } from "vitest";
import {
  loadInitializedAppsScript,
  signCredential,
  canonicalString,
  TEST_ADMIN_SECRET,
} from "../../../../scripts/run-apps-script.mjs";
import { signAdminCredential, ADMIN_CREDENTIAL_SCHEME } from "../../../../api/_lib/appsScriptSignature";

/**
 * Capa de autorización del backend real.
 *
 * Se ejercita el mismo código `.gs` que se copia a Apps Script, con el proveedor
 * por omisión (`server_secret`) y con los alternativos. Lo que se comprueba:
 *
 *  · una operación administrativa sin firma se rechaza;
 *  · una firma válida la autoriza y queda auditada como `proxy:<actor>`;
 *  · una firma ajena, caducada, repetida o de otra acción se rechaza;
 *  · la API pública sigue siendo anónima;
 *  · `google_identity` y `open_admin` conservan su comportamiento;
 *  · el firmante del backend intermedio y el verificador de Apps Script
 *    coinciden byte a byte.
 */

interface Envelope {
  ok: boolean;
  requestId: string;
  data: unknown;
  error: { code: string; message: string; details: Record<string, unknown> } | null;
  warnings: string[];
}

interface AuditRow {
  action: string;
  actor: string;
  status: string;
  metadata_json: string;
}

function auditRows(harness: ReturnType<typeof loadInitializedAppsScript>): AuditRow[] {
  return (harness.call("evalReadAll_", harness.spreadsheet, "AuditLog") as AuditRow[]) ?? [];
}

describe("apps-script · autorización · proveedor por omisión", () => {
  it("el modo por omisión es server_secret, no google_identity", () => {
    const harness = loadInitializedAppsScript();
    expect(harness.call("evalAuthMode_")).toBe("server_secret");
    const ping = harness.request("ping", {}) as Envelope;
    const data = ping.data as { authMode: string; adminAuth: Record<string, unknown> };
    expect(data.authMode).toBe("server_secret");
    expect(data.adminAuth).toMatchObject({ scheme: "hmac-sha256", configured: true, insecure: false });
  });

  it("ping funciona sin ninguna credencial", () => {
    const harness = loadInitializedAppsScript({ adminSecret: null });
    const ping = harness.rawRequest("ping", {}) as Envelope;
    expect(ping.ok).toBe(true);
    expect((ping.data as { adminAuth: { configured: boolean } }).adminAuth.configured).toBe(false);
  });

  it("una lectura administrativa sin firma se rechaza con FORBIDDEN", () => {
    const harness = loadInitializedAppsScript();
    const response = harness.rawRequest("listAdminAssessments", {}) as Envelope;
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe("FORBIDDEN");
    // El mensaje no dice QUÉ falló: no es un oráculo de firmas.
    expect(response.error?.message).not.toMatch(/nonce|timestamp|firma inválida/i);
  });

  it("una lectura administrativa firmada por el backend intermedio funciona", () => {
    const harness = loadInitializedAppsScript();
    const response = harness.request("listAdminAssessments", {}) as Envelope;
    expect(response.ok).toBe(true);
    expect(response.warnings).toEqual([]);
  });

  it("el ciclo administrativo completo funciona firmado: crear, editar, publicar, archivar", () => {
    const harness = loadInitializedAppsScript();

    const created = harness.request("createAssessment", {
      title: "Riesgo crediticio",
      category: "knowledge",
      actor: "reclutador@ejemplo.com",
    }) as Envelope;
    expect(created.ok).toBe(true);
    const bundle = created.data as {
      assessment: { assessmentId: string; entityVersion: number };
      sections: { sectionId: string }[];
    };

    const updated = harness.request("updateAssessment", {
      assessmentId: bundle.assessment.assessmentId,
      expectedEntityVersion: bundle.assessment.entityVersion,
      actor: "reclutador@ejemplo.com",
      assessment: {
        title: "Riesgo crediticio",
        instructions: "Lee con atención.",
        durationMinutes: 20,
        passingScore: 70,
        accessType: "public",
        category: "knowledge",
      },
      sections: [{ sectionId: bundle.sections[0].sectionId, title: "Conocimientos", position: 0, active: true }],
      questions: [
        {
          questionId: "qst_a",
          sectionId: bundle.sections[0].sectionId,
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
    }) as Envelope;
    expect(updated.ok).toBe(true);

    const published = harness.request("publishAssessment", {
      assessmentId: bundle.assessment.assessmentId,
      expectedEntityVersion: (updated.data as { assessment: { entityVersion: number } }).assessment.entityVersion,
      actor: "reclutador@ejemplo.com",
    }) as Envelope;
    expect(published.ok).toBe(true);

    const archived = harness.request("archiveAssessment", {
      assessmentId: bundle.assessment.assessmentId,
      actor: "reclutador@ejemplo.com",
    }) as Envelope;
    expect(archived.ok).toBe(true);

    // Y la auditoría registra al actor que afirmó el backend intermedio.
    const actors = auditRows(harness).map((row) => row.actor);
    expect(actors).toContain("proxy:reclutador@ejemplo.com");
  });

  it("sin secreto configurado, ninguna operación administrativa pasa (falla cerrado)", () => {
    const harness = loadInitializedAppsScript({ adminSecret: null });
    const response = harness.rawRequest(
      "listAdminAssessments",
      {},
      "req_1",
      signCredential({
        secret: TEST_ADMIN_SECRET,
        action: "listAdminAssessments",
        requestId: "req_1",
        actor: "reclutador@ejemplo.com",
      }),
    ) as Envelope;
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe("FORBIDDEN");
    expect(response.error?.message).toMatch(/EVALUATIONS_ADMIN_SHARED_SECRET/);
  });

  it("un secreto demasiado corto se trata como no configurado", () => {
    const harness = loadInitializedAppsScript({ adminSecret: "corto" });
    expect(harness.call("evalSignatureConfigured_")).toBe(false);
    const response = harness.rawRequest(
      "listAdminAssessments",
      {},
      "req_1",
      signCredential({ secret: "corto", action: "listAdminAssessments", requestId: "req_1", actor: "a@b.c" }),
    ) as Envelope;
    expect(response.error?.code).toBe("FORBIDDEN");
  });
});

describe("apps-script · autorización · robustez de la firma", () => {
  const REQUEST_ID = "req_firma_1";

  function attempt(harness: ReturnType<typeof loadInitializedAppsScript>, credential: unknown): Envelope {
    return harness.rawRequest(
      "listAdminAssessments",
      {},
      REQUEST_ID,
      credential as Record<string, unknown>,
    ) as Envelope;
  }

  it("rechaza una firma hecha con otro secreto", () => {
    const harness = loadInitializedAppsScript();
    const credential = signCredential({
      secret: "otro-secreto-de-pruebas-igual-de-largo-1",
      action: "listAdminAssessments",
      requestId: REQUEST_ID,
      actor: "reclutador@ejemplo.com",
    });
    expect(attempt(harness, credential).error?.code).toBe("FORBIDDEN");
  });

  it("rechaza una firma emitida para otra acción", () => {
    const harness = loadInitializedAppsScript();
    const credential = harness.sign("getAttemptDetail", REQUEST_ID);
    expect(attempt(harness, credential).error?.code).toBe("FORBIDDEN");
  });

  it("rechaza una firma emitida para otro requestId", () => {
    const harness = loadInitializedAppsScript();
    const credential = harness.sign("listAdminAssessments", "req_otro");
    expect(attempt(harness, credential).error?.code).toBe("FORBIDDEN");
  });

  it("rechaza una credencial caducada y una del futuro", () => {
    const harness = loadInitializedAppsScript();
    const stale = harness.sign("listAdminAssessments", REQUEST_ID, {
      timestamp: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    });
    expect(attempt(harness, stale).error?.code).toBe("FORBIDDEN");

    const future = harness.sign("listAdminAssessments", REQUEST_ID, {
      timestamp: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    });
    expect(attempt(harness, future).error?.code).toBe("FORBIDDEN");
  });

  it("rechaza la repetición de la misma credencial (nonce ya usado)", () => {
    const harness = loadInitializedAppsScript();
    const credential = harness.sign("listAdminAssessments", REQUEST_ID);
    expect(attempt(harness, credential).ok).toBe(true);
    expect(attempt(harness, credential).error?.code).toBe("FORBIDDEN");
  });

  it("rechaza esquemas desconocidos y credenciales incompletas", () => {
    const harness = loadInitializedAppsScript();
    const valid = harness.sign("listAdminAssessments", REQUEST_ID);
    expect(attempt(harness, { ...valid, scheme: "bearer" }).error?.code).toBe("FORBIDDEN");
    expect(attempt(harness, { ...valid, signature: "" }).error?.code).toBe("FORBIDDEN");
    expect(attempt(harness, { ...valid, nonce: "abc" }).error?.code).toBe("FORBIDDEN");
    expect(attempt(harness, { ...valid, timestamp: "ayer" }).error?.code).toBe("FORBIDDEN");
    expect(attempt(harness, "firma").error?.code).toBe("FORBIDDEN");
  });

  it("admite el secreto siguiente para poder rotar sin cortar el servicio", () => {
    const rotated = "secreto-de-pruebas-siguiente-rotacion-012";
    const harness = loadInitializedAppsScript({
      properties: { EVALUATIONS_ADMIN_SHARED_SECRET_NEXT: rotated },
    });
    const credential = signCredential({
      secret: rotated,
      action: "listAdminAssessments",
      requestId: REQUEST_ID,
      actor: "reclutador@ejemplo.com",
    });
    expect(attempt(harness, credential).ok).toBe(true);
    // Y el vigente sigue valiendo.
    expect(harness.request("listAdminAssessments", {}).ok).toBe(true);
  });

  it("respeta la lista blanca de actores incluso con firma válida", () => {
    const harness = loadInitializedAppsScript({
      properties: { EVALUATIONS_ADMIN_EMAILS: "jefa@ejemplo.com" },
      adminActor: "otro@ejemplo.com",
    });
    const response = harness.request("listAdminAssessments", {}) as Envelope;
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe("FORBIDDEN");

    const allowed = loadInitializedAppsScript({
      properties: { EVALUATIONS_ADMIN_EMAILS: "jefa@ejemplo.com" },
      adminActor: "jefa@ejemplo.com",
    });
    expect((allowed.request("listAdminAssessments", {}) as Envelope).ok).toBe(true);
  });

  it("audita el rechazo con el motivo interno, sin devolvérselo al cliente", () => {
    const harness = loadInitializedAppsScript();
    const response = harness.rawRequest("listAdminAssessments", {}) as Envelope;
    expect(response.error?.details).toEqual({});
    const denied = auditRows(harness).filter((row) => row.status === "denied");
    expect(denied.length).toBeGreaterThan(0);
    const metadata = JSON.parse(denied[denied.length - 1].metadata_json) as { reason?: string };
    expect(metadata.reason).toBe("missing_credential");
    expect(denied[denied.length - 1].actor).toBe("anonymous");
  });
});

describe("apps-script · autorización · otros proveedores", () => {
  it("google_identity sigue funcionando para quien tenga sesión de Workspace", () => {
    const harness = loadInitializedAppsScript({
      properties: { EVALUATIONS_AUTH_MODE: "google_identity" },
      activeEmail: "jefa@ejemplo.com",
    });
    const response = harness.rawRequest("listAdminAssessments", {}) as Envelope;
    expect(response.ok).toBe(true);
    // La identidad verificada se audita sin prefijo.
    harness.rawRequest("createAssessment", { title: "X", category: "knowledge" }, "req_g1");
    expect(auditRows(harness).map((row) => row.actor)).toContain("jefa@ejemplo.com");
  });

  it("google_identity rechaza cuando Google no expone identidad", () => {
    const harness = loadInitializedAppsScript({
      properties: { EVALUATIONS_AUTH_MODE: "google_identity" },
      activeEmail: "",
    });
    const response = harness.rawRequest("listAdminAssessments", {}) as Envelope;
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe("FORBIDDEN");
  });

  it("open_admin exige habilitación explícita y avisa en cada respuesta", () => {
    const denied = loadInitializedAppsScript({
      properties: { EVALUATIONS_AUTH_MODE: "open_admin" },
      activeEmail: "",
    });
    expect((denied.rawRequest("listAdminAssessments", {}) as Envelope).error?.code).toBe("FORBIDDEN");

    const allowed = loadInitializedAppsScript({
      properties: {
        EVALUATIONS_AUTH_MODE: "open_admin",
        EVALUATIONS_ALLOW_ANONYMOUS_ADMIN: "true",
      },
      activeEmail: "",
    });
    const response = allowed.rawRequest("listAdminAssessments", {}) as Envelope;
    expect(response.ok).toBe(true);
    expect(response.warnings).toContain("INSECURE_ADMIN_MODE");
  });

  it("un modo desconocido cae en el modo por omisión, no en administración abierta", () => {
    const harness = loadInitializedAppsScript({
      properties: { EVALUATIONS_AUTH_MODE: "lo_que_sea" },
    });
    expect(harness.call("evalAuthMode_")).toBe("server_secret");
    expect((harness.rawRequest("listAdminAssessments", {}) as Envelope).error?.code).toBe("FORBIDDEN");
  });

  it("local_execution NO es seleccionable por configuración", () => {
    const harness = loadInitializedAppsScript({
      properties: { EVALUATIONS_AUTH_MODE: "local_execution" },
    });
    expect(harness.call("evalAuthMode_")).toBe("server_secret");
    expect((harness.rawRequest("listAdminAssessments", {}) as Envelope).error?.code).toBe("FORBIDDEN");
  });

  it("una petición HTTP no puede fingir ser ejecución local", () => {
    const harness = loadInitializedAppsScript();
    // `trustedLocal` en el cuerpo o en la carga no llega a la autorización:
    // `doPost` copia solo action, requestId, payload y auth.
    const throughPost = harness.call("doPost", {
      postData: {
        contents: JSON.stringify({
          action: "listAdminAssessments",
          requestId: "req_1",
          trustedLocal: true,
          payload: { trustedLocal: true },
        }),
      },
    }) as { getContent: () => string };
    const envelope = JSON.parse(throughPost.getContent()) as Envelope;
    expect(envelope.ok).toBe(false);
    expect(envelope.error?.code).toBe("FORBIDDEN");
  });

  it("las funciones del editor sí pueden operar sin firma (ejecución local)", () => {
    const harness = loadInitializedAppsScript({ adminSecret: null, activeEmail: "dueña@ejemplo.com" });
    const created = harness.call("evalHandleTrustedRequest_", {
      action: "createAssessment",
      requestId: "req_local_1",
      payload: { title: "Desde el editor", category: "knowledge" },
    }) as Envelope;
    expect(created.ok).toBe(true);
    expect(auditRows(harness).map((row) => row.actor)).toContain("sin-verificar:dueña@ejemplo.com");
  });
});

describe("apps-script · autorización · superficie pública intacta", () => {
  it("las acciones públicas no exigen credencial en ningún modo", () => {
    for (const mode of ["server_secret", "google_identity", "open_admin"]) {
      const harness = loadInitializedAppsScript({
        properties: { EVALUATIONS_AUTH_MODE: mode },
        activeEmail: "",
        adminSecret: null,
      });
      expect((harness.rawRequest("ping", {}) as Envelope).ok).toBe(true);
      expect((harness.rawRequest("listPublicAssessments", {}) as Envelope).ok).toBe(true);
    }
  });

  it("una acción administrativa nunca es alcanzable como pública", () => {
    const harness = loadInitializedAppsScript();
    const classification = harness.call("evalClassifyActions_") as {
      duplicated: string[];
      unclassified: string[];
      orphan: string[];
    };
    expect(classification.duplicated).toEqual([]);
    expect(classification.unclassified).toEqual([]);
    expect(classification.orphan).toEqual([]);
  });

  it("un intento público sigue funcionando sin credencial", () => {
    const harness = loadInitializedAppsScript();
    const created = harness.request("createAssessment", { title: "Pública", category: "knowledge" }) as Envelope;
    const bundle = created.data as {
      assessment: { assessmentId: string; entityVersion: number; publicCode: string };
      sections: { sectionId: string }[];
    };
    const updated = harness.request("updateAssessment", {
      assessmentId: bundle.assessment.assessmentId,
      expectedEntityVersion: bundle.assessment.entityVersion,
      assessment: { title: "Pública", accessType: "public", category: "knowledge", passingScore: 50 },
      sections: [{ sectionId: bundle.sections[0].sectionId, title: "S", position: 0, active: true }],
      questions: [
        {
          questionId: "qst_p",
          sectionId: bundle.sections[0].sectionId,
          questionType: "q_true_false",
          questionText: "¿Verdadero?",
          position: 0,
          scoringMode: "exact",
          maxPoints: 1,
          active: true,
        },
      ],
      options: [
        { optionId: "opt_v", questionId: "qst_p", optionText: "Verdadero", optionValue: "true", position: 0, isCorrect: true, active: true },
        { optionId: "opt_f", questionId: "qst_p", optionText: "Falso", optionValue: "false", position: 1, isCorrect: false, active: true },
      ],
    }) as Envelope;
    harness.request("publishAssessment", {
      assessmentId: bundle.assessment.assessmentId,
      expectedEntityVersion: (updated.data as { assessment: { entityVersion: number } }).assessment.entityVersion,
    });

    const submitted = harness.rawRequest(
      "submitAttempt",
      {
        publicCode: bundle.assessment.publicCode,
        answers: [{ questionId: "qst_p", selectedOptionId: "opt_v" }],
      },
      "req_intento_publico",
    ) as Envelope;
    expect(submitted.ok).toBe(true);
  });
});

describe("apps-script · suite del editor", () => {
  it("`ejecutarPruebasEvaluaciones()` pasa por completo, incluida la autorización", () => {
    const harness = loadInitializedAppsScript();
    const report = String(harness.call("ejecutarPruebasEvaluaciones"));
    expect(report).not.toMatch(/FALLA/);
    expect(report).toMatch(/El modo de autorización por omisión es server_secret/);
    expect(report.split("\n").length).toBeGreaterThanOrEqual(15);
  });
});

describe("firmante del backend intermedio ↔ verificador de Apps Script", () => {
  it("las tres implementaciones producen la misma cadena canónica y la misma firma", () => {
    const parts = {
      action: "publishAssessment",
      requestId: "req_paridad",
      timestamp: "2026-07-28T07:00:00.000Z",
      nonce: "nonce_paridad_0001",
      actor: "reclutador@ejemplo.com",
    };

    const fromProxy = signAdminCredential({ secret: TEST_ADMIN_SECRET, ...parts });
    const fromHarness = signCredential({ secret: TEST_ADMIN_SECRET, ...parts });

    expect(fromProxy.scheme).toBe(ADMIN_CREDENTIAL_SCHEME);
    expect(fromProxy.signature).toBe(fromHarness.signature);

    const harness = loadInitializedAppsScript();
    expect(harness.call("evalCanonicalString_", parts)).toBe(canonicalString(parts));
    // Y Apps Script acepta la credencial del proxy (con timestamp vigente).
    const live = signAdminCredential({
      secret: TEST_ADMIN_SECRET,
      action: "listAdminAssessments",
      requestId: "req_desde_proxy",
      actor: "reclutador@ejemplo.com",
    });
    const response = harness.rawRequest("listAdminAssessments", {}, "req_desde_proxy", live) as Envelope;
    expect(response.ok).toBe(true);
  });
});
