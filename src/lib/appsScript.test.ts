import { afterEach, describe, expect, it, vi } from "vitest";
import { diagnosticoHtml, escribirEnHoja, leerDeHoja, pareceHtml } from "./appsScript";

/**
 * Escrituras contra Apps Script.
 *
 * El fallo que estas pruebas impiden que vuelva: la aplicación daba por bueno
 * *cualquier* final del `fetch`. Con eso, el cuestionario mostraba «Postulante
 * registrado correctamente», se cerraba y borraba el borrador aunque la hoja no
 * hubiera escrito nada. Cada caso de abajo es una forma real en la que Apps
 * Script dice «no»:
 *
 *   · `{status:"error"}`   — una regla de negocio del backend.
 *   · una página HTML      — el despliegue pide iniciar sesión o Google falló.
 *   · HTTP 500             — el script se rompió al ejecutarse.
 *   · el `fetch` rechaza   — la red del edificio no deja salir a Google.
 */

function responderCon(cuerpo: string, init: ResponseInit = {}) {
  return vi.fn(async () => new Response(cuerpo, { status: 200, ...init }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("escribirEnHoja", () => {
  it("acepta la confirmación explícita del backend", async () => {
    vi.stubGlobal("fetch", responderCon(JSON.stringify({ status: "success" })));
    const res = await escribirEnHoja({ identificador: "1-1-2026" });
    expect(res).toMatchObject({ ok: true, tipo: "ok", confirmado: true });
  });

  it("tolera los despliegues antiguos que contestan vacío", async () => {
    vi.stubGlobal("fetch", responderCon(""));
    const res = await escribirEnHoja({ identificador: "1-1-2026" });
    // Se acepta para no romper lo que hoy funciona, pero queda constancia de
    // que el servidor no confirmó nada (el panel de Diagnóstico lo distingue).
    expect(res.ok).toBe(true);
    expect(res.confirmado).toBe(false);
  });

  it("propaga el motivo cuando el backend rechaza la operación", async () => {
    vi.stubGlobal(
      "fetch",
      responderCon(
        JSON.stringify({ status: "error", message: "Identificador duplicado en la hoja." }),
      ),
    );
    const res = await escribirEnHoja({ identificador: "1-1-2026" });
    expect(res.ok).toBe(false);
    expect(res.tipo).toBe("rechazada");
    expect(res.message).toBe("Identificador duplicado en la hoja.");
  });

  it("también rechaza un `{ error: … }` sin campo `status`", async () => {
    vi.stubGlobal("fetch", responderCon(JSON.stringify({ error: "Falta la hoja «Base»." })));
    const res = await escribirEnHoja({ identificador: "1-1-2026" });
    expect(res.ok).toBe(false);
    expect(res.message).toBe("Falta la hoja «Base».");
  });

  it("no confunde la página de inicio de sesión de Google con un guardado", async () => {
    vi.stubGlobal(
      "fetch",
      responderCon(
        '<!DOCTYPE html><html><body>Para continuar, inicia sesión en accounts.google.com</body></html>',
      ),
    );
    const res = await escribirEnHoja({ identificador: "1-1-2026" });
    expect(res.ok).toBe(false);
    expect(res.tipo).toBe("respuesta_invalida");
    expect(res.message).toMatch(/Cualquier persona/);
  });

  it("trata un HTTP 500 como fallo, no como éxito", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    const res = await escribirEnHoja({ identificador: "1-1-2026" });
    expect(res.ok).toBe(false);
    expect(res.http).toBe(500);
  });

  it("explica la falta de red sin dejar dudas de que no se guardó", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    const res = await escribirEnHoja({ identificador: "1-1-2026" });
    expect(res.ok).toBe(false);
    expect(res.tipo).toBe("sin_red");
    expect(res.message).toMatch(/no se guardó/i);
  });

  it("envía el cuerpo como texto plano y siguiendo el redirect de Google", async () => {
    const fetchMock = responderCon(JSON.stringify({ status: "success" }));
    vi.stubGlobal("fetch", fetchMock);
    await escribirEnHoja({ identificador: "1-1-2026", nombres: "Ana" });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    // Sin esto, producción (Vercel) recibe un 404 tras el 302 de Google.
    expect(init.redirect).toBe("follow");
    // Con `application/json` el navegador dispara un preflight que Apps Script
    // no sabe responder.
    expect((init.headers as Record<string, string>)["Content-Type"]).toMatch(/text\/plain/);
    expect(JSON.parse(String(init.body))).toMatchObject({ nombres: "Ana" });
  });
});

describe("leerDeHoja", () => {
  it("devuelve los datos cuando el endpoint contesta JSON", async () => {
    vi.stubGlobal("fetch", responderCon(JSON.stringify({ candidatos: [{ identificador: "1" }] })));
    const res = await leerDeHoja<{ candidatos: unknown[] }>();
    expect(res.ok).toBe(true);
    expect(res.datos?.candidatos).toHaveLength(1);
  });

  it("distingue una página de Google de un problema de red", async () => {
    vi.stubGlobal("fetch", responderCon("<html><body>Se ha producido un error</body></html>"));
    const html = await leerDeHoja();
    expect(html.ok).toBe(false);
    expect(html.tipo).toBe("respuesta_invalida");

    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    const red = await leerDeHoja();
    expect(red.tipo).toBe("sin_red");
  });
});

describe("detección de HTML", () => {
  it("reconoce las páginas y no los datos", () => {
    expect(pareceHtml("  <!DOCTYPE html><html>")).toBe(true);
    expect(pareceHtml("<html lang=\"es\">")).toBe(true);
    expect(pareceHtml('{"status":"success"}')).toBe(false);
    expect(pareceHtml("")).toBe(false);
  });

  it("propone una acción concreta según la página recibida", () => {
    expect(diagnosticoHtml("iniciar sesión")).toMatch(/Cualquier persona/);
    expect(diagnosticoHtml("authorization required")).toMatch(/autoriz/i);
    expect(diagnosticoHtml("<html>otro</html>")).toMatch(/NO se guardó/);
  });
});
