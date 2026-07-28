import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  loadInitializedAppsScript,
  TEST_ADMIN_SECRET,
  type AppsScriptHarness,
} from "../../../../scripts/run-apps-script.mjs";
import * as sessionFunction from "../../../../api/evaluations/session";
import * as adminFunction from "../../../../api/evaluations/admin";
import { SESSION_COOKIE, readSessionCookie } from "../../../../api/_lib/adminSession";
import { invokeVercelFunction } from "./vercelFunction";

/**
 * Recorrido completo de la cadena real, sin red:
 *
 *   capa de API del navegador → funciones serverless → backend de Apps Script
 *
 * `fetch` se sustituye por un enrutador que entrega cada petición al handler que
 * le corresponde, con un tarro de cookies como el del navegador. Los handlers y
 * los `.gs` son los MISMOS archivos que se despliegan, así que esta prueba
 * responde a la pregunta que importa: **¿vuelve a funcionar la administración
 * sin Google Login, y sigue protegida?**
 */

const APPS_SCRIPT_URL = "https://script.example.com/macros/s/AB/exec";
const PASSPHRASE = "frase-de-acceso-de-pruebas-del-panel";
const SESSION_KEY = "secreto-de-sesion-de-pruebas-0123456789";

interface Envelope {
  ok: boolean;
  requestId: string;
  data: unknown;
  error: { code: string; message: string; details: Record<string, unknown> } | null;
  warnings: string[];
}

interface Bundle {
  assessment: {
    assessmentId: string;
    entityVersion: number;
    publicCode: string;
    status: string;
    publicationStatus: string;
    versionLabel: string;
  };
  sections: { sectionId: string }[];
  questions: { questionId: string }[];
  versions: { versionId: string; state: string }[];
}

let harness: AppsScriptHarness;
let cookies = new Map<string, string>();

/** Enrutador que sustituye a la red. Devuelve lo que devolvería cada capa. */
function installNetwork() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const headers = new Headers((init.headers as Record<string, string>) ?? {});
      const cookieHeader = [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
      if (cookieHeader) headers.set("cookie", cookieHeader);
      headers.set("host", "panel.example.com");

      // 1 · El navegador hablando con nuestras propias funciones.
      if (url === "/api/evaluations/session" || url === "/api/evaluations/admin") {
        const request = new Request(`https://panel.example.com${url}`, {
          method: init.method ?? "POST",
          headers,
          ...(init.body === undefined || init.method === "GET" ? {} : { body: String(init.body) }),
        });
        // Se invoca como lo hace Vercel (despacho por método HTTP sobre las
        // exportaciones con nombre), no llamando a un `export default`.
        const fn = url.endsWith("/session") ? sessionFunction : adminFunction;
        const response = await invokeVercelFunction(fn, request);
        const setCookie = response.headers.get("set-cookie");
        if (setCookie) {
          const token = readSessionCookie(setCookie.split(";")[0]);
          if (token && !setCookie.includes("Max-Age=0")) cookies.set(SESSION_COOKIE, token);
          else cookies.delete(SESSION_COOKIE);
        }
        const text = await response.text();
        return {
          ok: response.ok,
          status: response.status,
          json: async () => JSON.parse(text),
          text: async () => text,
        } as Response;
      }

      // 2 · Las funciones (o el navegador, en las acciones públicas) hablando con
      //     Apps Script. Aquí se ejecuta el backend real cargado en el arnés.
      if (url === APPS_SCRIPT_URL) {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        const envelope = harness.rawRequest(
          String(body.action ?? ""),
          (body.payload as Record<string, unknown>) ?? {},
          String(body.requestId ?? ""),
          (body.auth as Record<string, unknown>) ?? null,
        );
        return { ok: true, status: 200, json: async () => envelope, text: async () => JSON.stringify(envelope) } as Response;
      }

      throw new Error(`URL inesperada en la prueba: ${url}`);
    }),
  );
}

let adminApi: typeof import("../api/adminApi");
let publicApi: typeof import("../api/publicApi");
let transport: typeof import("../api/transport");

beforeAll(async () => {
  harness = loadInitializedAppsScript();

  vi.stubEnv("VITE_ASSESSMENTS_PROVIDER", "google-apps-script");
  vi.stubEnv("VITE_EVALUATIONS_API_URL", APPS_SCRIPT_URL);
  vi.stubEnv("EVALUATIONS_APPS_SCRIPT_URL", APPS_SCRIPT_URL);
  vi.stubEnv("EVALUATIONS_ADMIN_SHARED_SECRET", TEST_ADMIN_SECRET);
  vi.stubEnv("EVALUATIONS_PANEL_PASSPHRASE", PASSPHRASE);
  vi.stubEnv("EVALUATIONS_SESSION_SECRET", SESSION_KEY);

  vi.resetModules();
  adminApi = await import("../api/adminApi");
  publicApi = await import("../api/publicApi");
  transport = await import("../api/transport");
  installNetwork();
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("cadena completa · navegador → funciones serverless → Apps Script", () => {
  let bundle: Bundle;

  it("ping sigue funcionando sin sesión ni credencial", async () => {
    const ping = harness.rawRequest("ping", {}) as Envelope;
    expect(ping.ok).toBe(true);
    const data = ping.data as { authMode: string; adminAuth: { configured: boolean } };
    expect(data.authMode).toBe("server_secret");
    expect(data.adminAuth.configured).toBe(true);
  });

  it("sin sesión, el listado administrativo se rechaza y pide la frase de acceso", async () => {
    cookies = new Map();
    const result = await adminApi.listAdminAssessments();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("forbidden");
      expect((result.error as { needsAdminSession?: boolean }).needsAdminSession).toBe(true);
    }
  });

  it("una frase incorrecta no abre la sesión", async () => {
    const denied = await transport.openAdminSession("no-es-la-frase", "ana@banco.com");
    expect(denied.ok).toBe(false);
    expect(cookies.has(SESSION_COOKIE)).toBe(false);
  });

  it("con la frase correcta se abre la sesión y el listado administrativo funciona", async () => {
    const opened = await transport.openAdminSession(PASSPHRASE, "ana@banco.com");
    expect(opened.ok).toBe(true);
    if (opened.ok) expect(opened.value.actor).toBe("ana@banco.com");

    const list = await adminApi.listAdminAssessments();
    expect(list.ok).toBe(true);
  });

  it("crear evaluación funciona", async () => {
    const created = await adminApi.createAssessment(`req_${Date.now()}_crear`, {
      title: "Riesgo crediticio",
      category: "knowledge",
      actor: "ana@banco.com",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect("bundle" in created.value).toBe(true);
    if ("bundle" in created.value) {
      bundle = created.value.bundle as unknown as Bundle;
      expect(bundle.assessment.status).toBe("draft");
    }
  });

  it("editar funciona y conserva la concurrencia optimista", async () => {
    const sectionId = bundle.sections[0].sectionId;
    const updated = await adminApi.updateAssessment(`req_${Date.now()}_editar`, {
      assessmentId: bundle.assessment.assessmentId,
      expectedEntityVersion: bundle.assessment.entityVersion,
      actor: "ana@banco.com",
      payload: {
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
            questionId: "qst_e2e",
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
          { optionId: "opt_e2e_a", questionId: "qst_e2e", optionText: "Atrasos", optionValue: "a", position: 0, isCorrect: true, active: true },
          { optionId: "opt_e2e_b", questionId: "qst_e2e", optionText: "Utilidad", optionValue: "b", position: 1, isCorrect: false, active: true },
        ],
      },
    });
    expect(updated.ok).toBe(true);
    if (updated.ok && "bundle" in updated.value) {
      bundle = updated.value.bundle as unknown as Bundle;
      expect(bundle.questions).toHaveLength(1);
    }

    // Con una versión desactualizada, el servidor responde CONFLICT (sin cambios).
    const stale = await adminApi.updateAssessment(`req_${Date.now()}_conflicto`, {
      assessmentId: bundle.assessment.assessmentId,
      expectedEntityVersion: 1,
      actor: "ana@banco.com",
      payload: { assessment: { title: "Otro" }, sections: [], questions: [], options: [] },
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe("conflict");
  });

  it("publicar funciona y genera la versión servida", async () => {
    const published = await adminApi.publishAssessment(`req_${Date.now()}_publicar`, {
      assessmentId: bundle.assessment.assessmentId,
      expectedEntityVersion: bundle.assessment.entityVersion,
      notes: "Primera versión",
      actor: "ana@banco.com",
    });
    expect(published.ok).toBe(true);
    if (published.ok && "bundle" in published.value) {
      bundle = published.value.bundle as unknown as Bundle;
      expect(bundle.assessment.publicationStatus).toBe("published");
      expect(bundle.versions.some((version) => version.state === "published")).toBe(true);
    }
  });

  it("la API pública devuelve la evaluación publicada, saneada", async () => {
    const listing = await publicApi.listPublicAssessments();
    expect(listing.ok).toBe(true);

    const detail = await publicApi.getPublicAssessment(bundle.assessment.publicCode);
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    const serialized = JSON.stringify(detail.value);
    for (const forbidden of [
      "isCorrect",
      "is_correct",
      "answerKey",
      "scoreValue",
      "pointsAwarded",
      "maxPoints",
      "scoringMode",
      "createdBy",
      "updatedBy",
      "passingScore",
      "internalInstructions",
      "entityVersion",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("la repetición de un requestId no duplica el efecto", async () => {
    const requestId = `req_${Date.now()}_idempotente`;
    const first = await adminApi.duplicateAssessment(requestId, {
      assessmentId: bundle.assessment.assessmentId,
      actor: "ana@banco.com",
    });
    expect(first.ok).toBe(true);
    const second = await adminApi.duplicateAssessment(requestId, {
      assessmentId: bundle.assessment.assessmentId,
      actor: "ana@banco.com",
    });
    expect(second.ok).toBe(true);
    if (second.ok) expect("replay" in second.value).toBe(true);
  });

  it("archivar y restaurar funcionan", async () => {
    const archived = await adminApi.transitionAssessment("archiveAssessment", `req_${Date.now()}_archivar`, {
      assessmentId: bundle.assessment.assessmentId,
      actor: "ana@banco.com",
    });
    expect(archived.ok).toBe(true);

    const restored = await adminApi.transitionAssessment("unarchiveAssessment", `req_${Date.now()}_restaurar`, {
      assessmentId: bundle.assessment.assessmentId,
      actor: "ana@banco.com",
    });
    expect(restored.ok).toBe(true);
  });

  it("la bitácora registra al actor de la sesión y no guarda datos sensibles", () => {
    const rows = harness.call("evalReadAll_", harness.spreadsheet, "AuditLog") as {
      actor: string;
      action: string;
      metadata_json: string;
    }[];
    const actors = new Set(rows.map((row) => row.actor));
    expect(actors).toContain("proxy:ana@banco.com");
    const metadata = rows.map((row) => row.metadata_json).join(" ");
    for (const forbidden of ["isCorrect", "answerKey", "participantEmail", "snapshot"]) {
      expect(metadata).not.toContain(forbidden);
    }
  });

  it("al cerrar la sesión, la administración vuelve a estar cerrada", async () => {
    const closed = await transport.closeAdminSession();
    expect(closed.ok).toBe(true);
    expect(cookies.has(SESSION_COOKIE)).toBe(false);
    const result = await adminApi.listAdminAssessments();
    expect(result.ok).toBe(false);
  });
});
