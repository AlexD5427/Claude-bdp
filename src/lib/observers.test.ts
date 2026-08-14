import { afterEach, describe, expect, it, vi } from "vitest";
import { observeIntersection, observeResize } from "./observers";

/**
 * `ResizeObserver` e `IntersectionObserver` se usan sólo en el Comparador y en el
 * cuestionario de Postulantes. Antes se construían sin comprobar nada, así que en
 * un navegador que no los trae —un WebView corporativo antiguo, un equipo sin
 * actualizar— el `ErrorBoundary` se comía esos dos módulos y sólo esos dos:
 * exactamente el síntoma reportado. Estas pruebas fijan la degradación.
 */

const realResize = globalThis.ResizeObserver;
const realIntersection = globalThis.IntersectionObserver;

afterEach(() => {
  globalThis.ResizeObserver = realResize;
  globalThis.IntersectionObserver = realIntersection;
  vi.restoreAllMocks();
});

describe("observeResize", () => {
  it("observa cada objetivo cuando la API existe", () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    globalThis.ResizeObserver = class {
      observe = observe;
      unobserve = vi.fn();
      disconnect = disconnect;
    } as unknown as typeof ResizeObserver;

    const a = document.createElement("div");
    const b = document.createElement("div");
    const stop = observeResize([a, null, b], () => {});
    expect(observe).toHaveBeenCalledTimes(2);
    stop();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("no lanza cuando ResizeObserver no existe", () => {
    // @ts-expect-error se elimina a propósito para simular el navegador antiguo
    delete globalThis.ResizeObserver;
    const el = document.createElement("div");
    expect(() => observeResize([el], () => {})()).not.toThrow();
  });

  it("se apoya en el redimensionado de la ventana como aproximación", () => {
    // @ts-expect-error ídem
    delete globalThis.ResizeObserver;
    const cb = vi.fn();
    const stop = observeResize([document.createElement("div")], cb);
    window.dispatchEvent(new Event("resize"));
    expect(cb).toHaveBeenCalledTimes(1);
    stop();
    window.dispatchEvent(new Event("resize"));
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe("observeIntersection", () => {
  it("no lanza sin objetivo", () => {
    expect(() => observeIntersection(null, () => {})()).not.toThrow();
  });

  it("informa «visible» cuando la API no existe, dejando la interfaz en reposo", () => {
    // @ts-expect-error se elimina a propósito
    delete globalThis.IntersectionObserver;
    const cb = vi.fn();
    observeIntersection(document.createElement("div"), cb);
    expect(cb).toHaveBeenCalledWith(true, null);
  });
});
