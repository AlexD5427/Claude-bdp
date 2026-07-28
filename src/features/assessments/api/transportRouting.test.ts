import { describe, it, expect, vi, afterEach } from "vitest";
import { ADMIN_ACTIONS as CLIENT_ADMIN_ACTIONS } from "./adminActions";
import { ADMIN_ACTIONS as PROXY_ADMIN_ACTIONS } from "../../../../api/_lib/adminActions";
import { loadInitializedAppsScript } from "../../../../scripts/run-apps-script.mjs";

/**
 * Enrutado del transporte según el tipo de acción.
 *
 * La regla que se protege es la que hace posible esta arquitectura:
 *
 *   · las acciones PÚBLICAS salen directas al Web App de Apps Script, sin
 *     credencial y con `text/plain` (para no disparar el preflight de CORS);
 *   · las acciones ADMINISTRATIVAS salen al backend intermedio, que es quien
 *     custodia el secreto y firma; el navegador solo aporta su cookie de sesión.
 *
 * El módulo lee la configuración al importarse, así que cada caso fija las
 * variables de entorno y lo vuelve a importar.
 */

interface Call {
  url: string;
  init: RequestInit;
}

function stubFetch(): { calls: Call[] } {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, requestId: "", data: {}, error: null, warnings: [] }),
      } as Response;
    }),
  );
  return { calls };
}

async function loadApi(env: Record<string, string>) {
  vi.resetModules();
  vi.stubEnv("VITE_ASSESSMENTS_PROVIDER", "google-apps-script");
  vi.stubEnv("VITE_EVALUATIONS_API_URL", "https://script.example.com/macros/s/AB/exec");
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return {
    admin: await import("./adminApi"),
    publicApi: await import("./publicApi"),
    transport: await import("./transport"),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("transporte · enrutado por tipo de acción", () => {
  it("por omisión las acciones administrativas van al backend intermedio", async () => {
    const { admin, transport } = await loadApi({});
    const { calls } = stubFetch();
    expect(transport.adminProxyEnabled).toBe(true);

    await admin.listAdminAssessments();
    expect(calls[0].url).toBe("/api/evaluations/admin");
    expect((calls[0].init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(calls[0].init.credentials).toBe("same-origin");

    // Y el cuerpo no lleva ninguna credencial: el navegador no tiene secretos.
    const body = JSON.parse(String(calls[0].init.body)) as Record<string, unknown>;
    expect(body).toEqual({ action: "listAdminAssessments", requestId: "", payload: {} });
    expect(Object.keys(body)).not.toContain("auth");
  });

  it("las acciones públicas siguen saliendo directas a Apps Script", async () => {
    const { publicApi } = await loadApi({});
    const { calls } = stubFetch();
    await publicApi.listPublicAssessments();
    expect(calls[0].url).toBe("https://script.example.com/macros/s/AB/exec");
    expect((calls[0].init.headers as Record<string, string>)["Content-Type"]).toBe("text/plain;charset=utf-8");
    expect(calls[0].init.credentials).toBeUndefined();
  });

  it("un endpoint administrativo propio se respeta", async () => {
    const { admin } = await loadApi({ VITE_EVALUATIONS_ADMIN_API_URL: "https://panel.example.com/api/firmar" });
    const { calls } = stubFetch();
    await admin.getAdminAssessment("asm_1");
    expect(calls[0].url).toBe("https://panel.example.com/api/firmar");
  });

  it('con "direct" no hay proxy: las administrativas van a Apps Script (modo google_identity)', async () => {
    const { admin, transport } = await loadApi({ VITE_EVALUATIONS_ADMIN_API_URL: "direct" });
    const { calls } = stubFetch();
    expect(transport.adminProxyEnabled).toBe(false);
    await admin.listAdminAssessments();
    expect(calls[0].url).toBe("https://script.example.com/macros/s/AB/exec");
    expect((calls[0].init.headers as Record<string, string>)["Content-Type"]).toBe("text/plain;charset=utf-8");
  });

  it("con el proveedor mock no se llama a ningún endpoint administrativo", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_ASSESSMENTS_PROVIDER", "mock");
    vi.stubEnv("VITE_EVALUATIONS_ADMIN_API_URL", "");
    const transport = await import("./transport");
    expect(transport.adminProxyEnabled).toBe(false);
  });

  it("la sesión administrativa se pide al endpoint hermano del proxy", async () => {
    const { transport } = await loadApi({});
    const { calls } = stubFetch();
    await transport.adminSessionStatus();
    expect(calls[0].url).toBe("/api/evaluations/session");
    expect(calls[0].init.method).toBe("GET");
    await transport.openAdminSession("frase", "ana@banco.com");
    expect(calls[1].url).toBe("/api/evaluations/session");
    expect(calls[1].init.method).toBe("POST");
    // La frase viaja al backend propio y no se guarda en ningún sitio del cliente.
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ passphrase: "frase", actor: "ana@banco.com" });
  });

  it("el envoltorio de «falta sesión» se traduce a una señal para la interfaz", async () => {
    const { admin, transport } = await loadApi({});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          ok: false,
          requestId: "",
          data: null,
          error: {
            code: "FORBIDDEN",
            message: "La sesión administrativa expiró o no se ha iniciado.",
            details: { adminSession: "required" },
          },
          warnings: [],
        }),
      })) as unknown as typeof fetch,
    );
    const { adminSessionState } = await import("./adminSessionState");
    const result = await admin.listAdminAssessments();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("forbidden");
    expect(adminSessionState.get().status).toBe("required");
    expect(transport.adminProxyEnabled).toBe(true);
  });
});

describe("las tres listas de acciones administrativas coinciden", () => {
  it("cliente, backend intermedio y Auth.gs declaran exactamente las mismas", () => {
    const harness = loadInitializedAppsScript();
    const backend = Object.keys(harness.read("EVAL_ADMIN_ACTIONS") as Record<string, boolean>).sort();
    expect([...CLIENT_ADMIN_ACTIONS].sort()).toEqual(backend);
    expect([...PROXY_ADMIN_ACTIONS].sort()).toEqual(backend);
  });
});
