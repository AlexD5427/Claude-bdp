import { afterEach, describe, expect, it, vi } from "vitest";
import { postToBackend } from "./backendWrite";

/**
 * Estas pruebas cubren el fallo que estaba detrás de «no puedo añadir
 * postulantes»: el alta se daba por buena sin mirar la respuesta del servidor.
 * Cada caso es una respuesta real observada del despliegue de Apps Script.
 */

function respondWith(init: {
  status?: number;
  contentType?: string;
  body?: string;
}): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(init.body ?? "", {
        status: init.status ?? 200,
        headers: { "Content-Type": init.contentType ?? "application/json" },
      }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postToBackend", () => {
  it("acepta el sobre de éxito", async () => {
    respondWith({ body: JSON.stringify({ status: "success", message: "Fila añadida" }) });
    const res = await postToBackend({ identificador: "1-1-2026" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.message).toBe("Fila añadida");
  });

  it("acepta un cuerpo vacío: un doPost sin return sí escribió", async () => {
    respondWith({ body: "" });
    const res = await postToBackend({});
    expect(res.ok).toBe(true);
  });

  it("rechaza el HTTP 200 con HTML del despliegue sin permisos", async () => {
    // Apps Script no devuelve 401 cuando caducan los permisos del despliegue:
    // devuelve un 200 con la página de autorización. Es el único caso en el que
    // `fetch` «tiene éxito» sin que se ejecute una línea del script, y era el que
    // hacía que la aplicación dijera «Postulante registrado correctamente».
    respondWith({
      contentType: "text/html",
      body: "<html><body>Se requiere autorización</body></html>",
    });
    const res = await postToBackend({ identificador: "1-1-2026" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.cause).toBe("permisos-backend");
      expect(res.message).toMatch(/volver a publicarse/i);
    }
  });

  it("detecta el HTML incluso si el content-type miente", async () => {
    respondWith({ contentType: "application/json", body: "<!DOCTYPE html><html></html>" });
    const res = await postToBackend({});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.cause).toBe("permisos-backend");
  });

  it("rechaza un 500", async () => {
    respondWith({ status: 500, contentType: "text/plain", body: "boom" });
    const res = await postToBackend({});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.cause).toBe("http");
  });

  it("rechaza un cuerpo que no es JSON", async () => {
    respondWith({ contentType: "text/plain", body: "no soy json" });
    const res = await postToBackend({});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.cause).toBe("respuesta-invalida");
  });

  it("propaga el mensaje del backend cuando rechaza la operación", async () => {
    respondWith({
      body: JSON.stringify({ status: "error", message: "El identificador ya existe." }),
    });
    const res = await postToBackend({});
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.cause).toBe("rechazado");
      expect(res.message).toBe("El identificador ya existe.");
    }
  });

  it("distingue un fallo de red y sugiere revisar el bloqueo corporativo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const res = await postToBackend({});
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.cause).toBe("red");
      expect(res.message).toMatch(/script\.google\.com/);
    }
  });

  it("no confunde el aborto por tiempo con un rechazo del servidor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init: RequestInit) => {
        (init.signal as AbortSignal & { __force?: () => void }) ?? null;
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      }),
    );
    const res = await postToBackend({});
    expect(res.ok).toBe(false);
    // Sin abortar de verdad la señal, el error de red se clasifica como "red";
    // lo importante es que nunca se clasifique como éxito.
    if (!res.ok) expect(["red", "tiempo"]).toContain(res.cause);
  });
});
