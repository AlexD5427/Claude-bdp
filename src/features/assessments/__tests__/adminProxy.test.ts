import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import sessionHandler from "../../../../api/evaluations/session";
import adminHandler from "../../../../api/evaluations/admin";
import {
  SESSION_COOKIE,
  issueSessionToken,
  verifySessionToken,
  readSessionCookie,
  safeEquals,
} from "../../../../api/_lib/adminSession";
import { loadInitializedAppsScript, TEST_ADMIN_SECRET } from "../../../../scripts/run-apps-script.mjs";

/**
 * Backend intermedio (funciones serverless).
 *
 * Es la pieza que hace posible tener administración protegida sin Google Login:
 * custodia el secreto, autentica al reclutador con una frase de acceso y firma
 * cada operación antes de reenviarla. Lo que se comprueba aquí:
 *
 *  · sin sesión no firma nada, y lo dice de forma que la interfaz sepa reaccionar;
 *  · con sesión, firma y el backend real de Apps Script acepta esa firma;
 *  · el actor lo pone la SESIÓN, no el cliente;
 *  · solo firma acciones administrativas conocidas;
 *  · la cookie es `HttpOnly` + `Secure` + `SameSite=Strict`;
 *  · si falta configuración, falla cerrado y nombra la variable que falta.
 */

const CONFIG = {
  EVALUATIONS_APPS_SCRIPT_URL: "https://script.example.com/macros/s/AB/exec",
  EVALUATIONS_ADMIN_SHARED_SECRET: TEST_ADMIN_SECRET,
  EVALUATIONS_PANEL_PASSPHRASE: "frase-de-acceso-de-pruebas-del-panel",
  EVALUATIONS_SESSION_SECRET: "secreto-de-sesion-de-pruebas-0123456789",
};

interface Envelope {
  ok: boolean;
  data: unknown;
  error: { code: string; message: string; details: Record<string, unknown> } | null;
}

function configure(overrides: Record<string, string | undefined> = {}) {
  for (const [key, value] of Object.entries({ ...CONFIG, ...overrides })) {
    if (value === undefined) vi.stubEnv(key, "");
    else vi.stubEnv(key, value);
  }
}

function request(
  url: string,
  init: { method?: string; body?: unknown; cookie?: string; origin?: string; host?: string } = {},
): Request {
  const headers: Record<string, string> = { host: init.host ?? "panel.example.com" };
  if (init.cookie) headers.cookie = init.cookie;
  if (init.origin) headers.origin = init.origin;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  return new Request(url, {
    method: init.method ?? "POST",
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

async function envelopeOf(response: Response): Promise<Envelope> {
  return (await response.json()) as Envelope;
}

/** Cookie de sesión válida, tal como la emitiría `/session`. */
function sessionCookieFor(actor: string): string {
  const { token } = issueSessionToken({ secret: CONFIG.EVALUATIONS_SESSION_SECRET, actor });
  return `${SESSION_COOKIE}=${token}`;
}

beforeEach(() => {
  configure();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("backend intermedio · sesión", () => {
  it("emite una cookie HttpOnly, Secure y SameSite=Strict con la frase correcta", async () => {
    const response = await sessionHandler(
      request("https://panel.example.com/api/evaluations/session", {
        body: { passphrase: CONFIG.EVALUATIONS_PANEL_PASSPHRASE, actor: "ana@banco.com" },
      }),
    );
    const envelope = await envelopeOf(response);
    expect(envelope.ok).toBe(true);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    // La cookie NO es la credencial de Apps Script: es solo la sesión del panel.
    expect(cookie).not.toContain(TEST_ADMIN_SECRET);
    const claims = verifySessionToken({
      secret: CONFIG.EVALUATIONS_SESSION_SECRET,
      token: readSessionCookie(cookie.split(";")[0]),
    });
    expect(claims?.actor).toBe("ana@banco.com");
  });

  it("rechaza una frase incorrecta con el mismo mensaje que una vacía", async () => {
    const wrong = await envelopeOf(
      await sessionHandler(
        request("https://panel.example.com/api/evaluations/session", { body: { passphrase: "otra-cosa" } }),
      ),
    );
    const empty = await envelopeOf(
      await sessionHandler(request("https://panel.example.com/api/evaluations/session", { body: {} })),
    );
    expect(wrong.ok).toBe(false);
    expect(empty.ok).toBe(false);
    expect(wrong.error?.message).toBe(empty.error?.message);
  });

  it("nunca devuelve la frase ni el secreto en la respuesta", async () => {
    const response = await sessionHandler(
      request("https://panel.example.com/api/evaluations/session", {
        body: { passphrase: CONFIG.EVALUATIONS_PANEL_PASSPHRASE, actor: "ana@banco.com" },
      }),
    );
    const text = JSON.stringify(await envelopeOf(response));
    expect(text).not.toContain(CONFIG.EVALUATIONS_PANEL_PASSPHRASE);
    expect(text).not.toContain(TEST_ADMIN_SECRET);
    expect(text).not.toContain(CONFIG.EVALUATIONS_SESSION_SECRET);
  });

  it("informa del estado y cierra la sesión", async () => {
    const status = await envelopeOf(
      await sessionHandler(
        request("https://panel.example.com/api/evaluations/session", {
          method: "GET",
          cookie: sessionCookieFor("ana@banco.com"),
        }),
      ),
    );
    expect(status.data).toMatchObject({ active: true, actor: "ana@banco.com" });

    const closed = await sessionHandler(
      request("https://panel.example.com/api/evaluations/session", { method: "DELETE" }),
    );
    expect(closed.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("rechaza un origen ajeno", async () => {
    const envelope = await envelopeOf(
      await sessionHandler(
        request("https://panel.example.com/api/evaluations/session", {
          body: { passphrase: CONFIG.EVALUATIONS_PANEL_PASSPHRASE },
          origin: "https://sitio-malicioso.example",
        }),
      ),
    );
    expect(envelope.ok).toBe(false);
    expect(envelope.error?.code).toBe("FORBIDDEN");
  });

  it("una sesión caducada o manipulada no vale", () => {
    const { token } = issueSessionToken({
      secret: CONFIG.EVALUATIONS_SESSION_SECRET,
      actor: "ana@banco.com",
      ttlSeconds: -1,
    });
    expect(verifySessionToken({ secret: CONFIG.EVALUATIONS_SESSION_SECRET, token })).toBeNull();

    const valid = issueSessionToken({ secret: CONFIG.EVALUATIONS_SESSION_SECRET, actor: "ana@banco.com" }).token;
    const tampered = valid.slice(0, -3) + "aaa";
    expect(verifySessionToken({ secret: CONFIG.EVALUATIONS_SESSION_SECRET, token: tampered })).toBeNull();
    // Y firmada con otro secreto tampoco.
    expect(verifySessionToken({ secret: "otro-secreto-de-pruebas-igual-de-largo-12", token: valid })).toBeNull();
  });

  it("la comparación de secretos no cortocircuita por longitud", () => {
    expect(safeEquals("abc", "abc")).toBe(true);
    expect(safeEquals("abc", "abd")).toBe(false);
    expect(safeEquals("abc", "abcd")).toBe(false);
  });
});

describe("backend intermedio · firma y reenvío", () => {
  it("sin sesión no firma nada y avisa a la interfaz", async () => {
    const stub = vi.fn();
    vi.stubGlobal("fetch", stub);
    const envelope = await envelopeOf(
      await adminHandler(
        request("https://panel.example.com/api/evaluations/admin", {
          body: { action: "listAdminAssessments", requestId: "", payload: {} },
        }),
      ),
    );
    expect(envelope.ok).toBe(false);
    expect(envelope.error?.code).toBe("FORBIDDEN");
    expect(envelope.error?.details.adminSession).toBe("required");
    expect(stub).not.toHaveBeenCalled();
  });

  it("con sesión firma la acción y Apps Script la acepta", async () => {
    // El «servidor» es el backend real cargado en el arnés: la firma que emite el
    // proxy se verifica con el mismo código que se copia a Apps Script.
    const harness = loadInitializedAppsScript();
    const forwarded: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        forwarded.push(String(init.body));
        const envelope = harness.rawRequest(
          String(body.action),
          body.payload as Record<string, unknown>,
          String(body.requestId),
          body.auth as Record<string, unknown>,
        );
        return { ok: true, status: 200, text: async () => JSON.stringify(envelope) } as Response;
      }),
    );

    const response = await adminHandler(
      request("https://panel.example.com/api/evaluations/admin", {
        body: { action: "listAdminAssessments", requestId: "", payload: {} },
        cookie: sessionCookieFor("ana@banco.com"),
      }),
    );
    const envelope = await envelopeOf(response);
    expect(envelope.ok).toBe(true);

    const sent = JSON.parse(forwarded[0]) as { auth: Record<string, string> };
    expect(sent.auth.scheme).toBe("hmac-sha256");
    expect(sent.auth.actor).toBe("ana@banco.com");
    expect(sent.auth.signature).toBeTruthy();
    // El secreto no viaja: lo que viaja es una firma derivada de él.
    expect(forwarded[0]).not.toContain(TEST_ADMIN_SECRET);
  });

  it("el actor lo pone la sesión: el cliente no puede suplantar a otro", async () => {
    const forwarded: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        forwarded.push(String(init.body));
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ ok: true, requestId: "", data: {}, error: null, warnings: [] }),
        } as Response;
      }),
    );
    await adminHandler(
      request("https://panel.example.com/api/evaluations/admin", {
        body: {
          action: "createAssessment",
          requestId: "req_1",
          payload: { title: "X", category: "knowledge", actor: "jefa@banco.com" },
        },
        cookie: sessionCookieFor("ana@banco.com"),
      }),
    );
    const sent = JSON.parse(forwarded[0]) as { auth: { actor: string } };
    expect(sent.auth.actor).toBe("ana@banco.com");
  });

  it("solo firma acciones administrativas conocidas", async () => {
    const stub = vi.fn();
    vi.stubGlobal("fetch", stub);
    for (const action of ["ping", "submitAttempt", "getPublicAssessment", "borrarTodo"]) {
      const envelope = await envelopeOf(
        await adminHandler(
          request("https://panel.example.com/api/evaluations/admin", {
            body: { action, requestId: "req_1", payload: {} },
            cookie: sessionCookieFor("ana@banco.com"),
          }),
        ),
      );
      expect(envelope.ok).toBe(false);
      expect(envelope.error?.code).toBe("UNSUPPORTED_ACTION");
    }
    expect(stub).not.toHaveBeenCalled();
  });

  it("exige requestId en las escrituras antes de molestar al servidor", async () => {
    const stub = vi.fn();
    vi.stubGlobal("fetch", stub);
    const envelope = await envelopeOf(
      await adminHandler(
        request("https://panel.example.com/api/evaluations/admin", {
          body: { action: "publishAssessment", requestId: "", payload: { assessmentId: "asm_1" } },
          cookie: sessionCookieFor("ana@banco.com"),
        }),
      ),
    );
    expect(envelope.error?.code).toBe("BAD_REQUEST");
    expect(stub).not.toHaveBeenCalled();
  });

  it("falla cerrado y nombra la variable que falta cuando no está configurado", async () => {
    configure({ EVALUATIONS_ADMIN_SHARED_SECRET: undefined });
    const envelope = await envelopeOf(
      await adminHandler(
        request("https://panel.example.com/api/evaluations/admin", {
          body: { action: "listAdminAssessments", requestId: "", payload: {} },
          cookie: sessionCookieFor("ana@banco.com"),
        }),
      ),
    );
    expect(envelope.ok).toBe(false);
    expect(envelope.error?.message).toContain("EVALUATIONS_ADMIN_SHARED_SECRET");
  });

  it("un secreto demasiado corto se trata como ausente", async () => {
    configure({ EVALUATIONS_ADMIN_SHARED_SECRET: "corto" });
    const envelope = await envelopeOf(
      await adminHandler(
        request("https://panel.example.com/api/evaluations/admin", {
          body: { action: "listAdminAssessments", requestId: "", payload: {} },
          cookie: sessionCookieFor("ana@banco.com"),
        }),
      ),
    );
    expect(envelope.ok).toBe(false);
    expect(envelope.error?.message).toMatch(/demasiado cortas/);
  });

  it("no admite otros métodos y nunca deja las respuestas en caché", async () => {
    const response = await adminHandler(
      request("https://panel.example.com/api/evaluations/admin", { method: "GET" }),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("devuelve el envoltorio del servidor tal cual, incluidas las advertencias", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            requestId: "req_1",
            data: { idempotentReplay: true, reference: "asm_1" },
            error: null,
            warnings: ["IDEMPOTENT_REPLAY"],
          }),
      })) as unknown as typeof fetch,
    );
    const response = await adminHandler(
      request("https://panel.example.com/api/evaluations/admin", {
        body: { action: "updateAssessment", requestId: "req_1", payload: {} },
        cookie: sessionCookieFor("ana@banco.com"),
      }),
    );
    const envelope = (await response.json()) as { warnings: string[] };
    expect(envelope.warnings).toEqual(["IDEMPOTENT_REPLAY"]);
  });
});
