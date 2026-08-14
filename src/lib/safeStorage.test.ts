import { afterEach, describe, expect, it, vi } from "vitest";
import {
  localRead,
  localWrite,
  readCookie,
  readJsonItem,
  storageStatus,
  writeCookie,
  writeJsonItem,
} from "./safeStorage";

/**
 * `window.localStorage` lanza `SecurityError` al **acceder a la propiedad** en un
 * navegador con los datos del sitio bloqueados. La lectura sin protección que
 * había en `ThemeContext` se ejecuta como estado inicial del proveedor más
 * externo, así que en esos equipos la aplicación no mostraba «el comparador no
 * funciona»: mostraba una página completamente en blanco (reproducido en
 * `qa/sondas.mjs almacenamiento-bloqueado`).
 */

function blockStorage(kind: "localStorage" | "sessionStorage" = "localStorage") {
  Object.defineProperty(window, kind, {
    configurable: true,
    get() {
      throw new DOMException("Access is denied for this document.", "SecurityError");
    },
  });
}

const originalLocal = Object.getOwnPropertyDescriptor(window, "localStorage");

afterEach(() => {
  if (originalLocal) Object.defineProperty(window, "localStorage", originalLocal);
  vi.unstubAllGlobals();
});

describe("safeStorage", () => {
  it("lee y escribe con normalidad cuando el almacenamiento está disponible", () => {
    localWrite("bdp-prueba", "hola");
    expect(localRead("bdp-prueba")).toBe("hola");
    expect(storageStatus().local.availability).toBe("ok");
  });

  it("no lanza cuando el navegador bloquea el almacenamiento", () => {
    blockStorage();
    expect(() => localRead("bdp-tema")).not.toThrow();
    expect(() => localWrite("bdp-tema", "dark")).not.toThrow();
  });

  it("degrada a memoria: lo escrito se puede volver a leer en la misma pestaña", () => {
    blockStorage();
    localWrite("bdp-tema", "light");
    expect(localRead("bdp-tema")).toBe("light");
  });

  it("informa del bloqueo para que el diagnóstico pueda explicarlo", () => {
    blockStorage();
    localRead("cualquier-cosa");
    const status = storageStatus();
    expect(status.local.availability).toBe("bloqueado");
    expect(status.local.reason).toMatch(/SecurityError/);
  });

  it("devuelve el respaldo ante un JSON corrupto en lugar de lanzar", () => {
    localWrite("bdp-json", "{ esto no es json");
    expect(readJsonItem("local", "bdp-json", { ok: true })).toEqual({ ok: true });
  });

  it("hace ida y vuelta de un objeto", () => {
    writeJsonItem("local", "bdp-json2", { a: 1, b: ["x"] });
    expect(readJsonItem("local", "bdp-json2", null)).toEqual({ a: 1, b: ["x"] });
  });

  it("no lanza al escribir un valor con ciclos", () => {
    const ciclo: Record<string, unknown> = {};
    ciclo.self = ciclo;
    expect(() => writeJsonItem("local", "bdp-ciclo", ciclo)).not.toThrow();
  });

  it("las cookies también van protegidas", () => {
    expect(() => writeCookie("bdp_prueba", "1", 1)).not.toThrow();
    expect(() => readCookie("bdp_prueba")).not.toThrow();
  });
});
