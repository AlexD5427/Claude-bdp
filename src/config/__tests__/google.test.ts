/**
 * El inventario de la cuenta de Google.
 *
 * Lo que se comprueba aquí es lo que hace posible una migración de cuenta sin
 * sorpresas:
 *
 *   1. que el inventario esté **completo** —si alguien añade una utilidad al
 *      panel y no al inventario, la migración la olvidará—;
 *   2. que una variable del despliegue **manda** sobre el valor del repositorio,
 *      que es lo que permite ensayar contra una cuenta y producir en otra;
 *   3. que una variable **mal escrita se ignore y se avise** en lugar de
 *      aceptarse. Aceptar una dirección inválida convierte un error de dedo en
 *      una pantalla que no arranca, y el aviso es lo que dice dónde mirar.
 *
 * Cada prueba que toca variables reimporta el módulo: el inventario se resuelve
 * una sola vez, al cargarse, y eso es deliberado —así ninguna pantalla puede
 * ver dos veces valores distintos en la misma sesión—.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { UTILIDADES, inventarioGoogle, avisosDeConfiguracion, SCRIPT_URL } from "../google";

const RE_EXEC = /^https:\/\/script\.google\.com\/(a\/macros\/[A-Za-z0-9.-]+\/s|macros\/s)\/[A-Za-z0-9_-]+\/exec$/;

/** Reimporta el módulo con las variables que haya en ese momento. */
async function recargar() {
  vi.resetModules();
  return import("../google");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("inventario de la cuenta de Google", () => {
  it("el endpoint del talento es una aplicación web publicada", () => {
    expect(SCRIPT_URL).toMatch(RE_EXEC);
  });

  it("lista el talento, Documentación, Evaluaciones y las seis utilidades", () => {
    const claves = inventarioGoogle().map((r) => r.clave);
    expect(claves).toContain("talento");
    expect(claves).toContain("documentacion");
    expect(claves).toContain("evaluaciones");
    expect(claves.filter((c) => c.startsWith("utilidad:"))).toHaveLength(UTILIDADES.length);
    expect(UTILIDADES).toHaveLength(6);
  });

  it("cada utilidad tiene una clave única y una dirección https", () => {
    const claves = UTILIDADES.map((u) => u.clave);
    expect(new Set(claves).size).toBe(claves.length);
    for (const u of UTILIDADES) {
      expect(u.url.startsWith("https://"), `${u.clave}: ${u.url}`).toBe(true);
      expect(u.etiqueta.length).toBeGreaterThan(0);
    }
  });

  it("todo recurso dice qué se rompe si se queda en la cuenta antigua", () => {
    for (const r of inventarioGoogle()) {
      expect(r.impacto.length, r.clave).toBeGreaterThan(20);
    }
  });

  it("sin variables, el talento viene del repositorio y Documentación queda sin configurar", () => {
    const porClave = new Map(inventarioGoogle().map((r) => [r.clave, r]));
    expect(porClave.get("talento")?.origen).toBe("repositorio");
    expect(porClave.get("documentacion")?.origen).toBe("sin-configurar");
    expect(avisosDeConfiguracion()).toEqual([]);
  });
});

describe("variables del despliegue", () => {
  it("una variable válida reemplaza la dirección del repositorio", async () => {
    const nueva = "https://script.google.com/macros/s/AKfycbCUENTA_NUEVA_0123456789/exec";
    vi.stubEnv("VITE_SCRIPT_URL", nueva);
    const modulo = await recargar();
    expect(modulo.SCRIPT_URL).toBe(nueva);
    const talento = modulo.inventarioGoogle().find((r) => r.clave === "talento");
    expect(talento?.origen).toBe("variable");
    expect(modulo.avisosDeConfiguracion()).toEqual([]);
  });

  it("acepta un despliegue de dominio de Workspace", async () => {
    const nueva = "https://script.google.com/a/macros/bdp.gob.bo/s/AKfycbCUENTA_NUEVA_0123456789/exec";
    vi.stubEnv("VITE_DOCUMENTACION_URL", nueva);
    const modulo = await recargar();
    expect(modulo.URL_DOCUMENTACION).toBe(nueva);
  });

  it("una dirección que no es de Apps Script se ignora y se avisa", async () => {
    vi.stubEnv("VITE_SCRIPT_URL", "/api/proxy");
    const modulo = await recargar();
    expect(modulo.SCRIPT_URL).toMatch(RE_EXEC);
    const avisos = modulo.avisosDeConfiguracion();
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("VITE_SCRIPT_URL");
    expect(avisos[0]).toContain("/api/proxy");
  });

  it("una URL del editor (acaba en /dev) también se rechaza", async () => {
    vi.stubEnv("VITE_DOCUMENTACION_URL", "https://script.google.com/macros/s/AKfycbAAAAAAAAAAAAAAAAAA/dev");
    const modulo = await recargar();
    expect(modulo.URL_DOCUMENTACION).toBe("");
    expect(modulo.avisosDeConfiguracion()[0]).toContain("VITE_DOCUMENTACION_URL");
  });

  it("el despliegue de Evaluaciones se pega sin URL alrededor", async () => {
    vi.stubEnv("VITE_EVALUACIONES_DESPLIEGUE", "AKfycbDESPLIEGUE_DE_EVALUACIONES_1234");
    const modulo = await recargar();
    const ev = modulo.inventarioGoogle().find((r) => r.clave === "evaluaciones");
    expect(ev?.url).toBe("https://script.google.com/macros/s/AKfycbDESPLIEGUE_DE_EVALUACIONES_1234/exec");
  });

  it("pegar la URL entera en el despliegue de Evaluaciones se rechaza con su motivo", async () => {
    vi.stubEnv("VITE_EVALUACIONES_DESPLIEGUE", "https://script.google.com/macros/s/AKfycbAAAAAAAAAAAAAAAAAA/exec");
    const modulo = await recargar();
    expect(modulo.DESPLIEGUE_EVALUACIONES).toBe("");
    expect(modulo.avisosDeConfiguracion()[0]).toContain("VITE_EVALUACIONES_DESPLIEGUE");
  });

  it("con dominio de Workspace, el despliegue de Evaluaciones se reconstruye con /a/macros", async () => {
    vi.stubEnv("VITE_EVALUACIONES_DESPLIEGUE", "AKfycbDESPLIEGUE_DE_EVALUACIONES_1234");
    vi.stubEnv("VITE_EVALUACIONES_DOMINIO", "bdp.gob.bo");
    const modulo = await recargar();
    const ev = modulo.inventarioGoogle().find((r) => r.clave === "evaluaciones");
    expect(ev?.url).toBe(
      "https://script.google.com/a/macros/bdp.gob.bo/s/AKfycbDESPLIEGUE_DE_EVALUACIONES_1234/exec",
    );
  });
});
