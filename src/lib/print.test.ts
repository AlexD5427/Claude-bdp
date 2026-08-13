import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { printModule } from "./print";

/**
 * Controlador de impresión.
 *
 * El fallo que motiva estas pruebas: la limpieza del ámbito colgaba **sólo** del
 * evento `afterprint`, que no todos los navegadores emiten al cancelar el
 * diálogo. Cuando no llegaba, la clase `bdp-scope-*` se quedaba pegada al
 * `<body>`; en pantalla no se nota (esas reglas viven dentro de `@media print`),
 * pero la impresión siguiente heredaba el ámbito equivocado: la Lista de
 * Postulantes salía sin encabezado institucional y con las reglas de la
 * cuadrícula del comparador.
 */
const scopes = () =>
  [...document.body.classList].filter(
    (c) => c === "bdp-print-scoped" || c.startsWith("bdp-scope-"),
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("print", vi.fn());
  document.body.className = "";
  document.head.innerHTML = "";
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.className = "";
});

describe("printModule", () => {
  it("aplica el ámbito y el encabezado del reporte", () => {
    printModule("Comparativa de Postulantes", "Letter", "landscape", {
      scope: "comparador",
    });
    expect(scopes().sort()).toEqual(["bdp-print-scoped", "bdp-scope-comparador"]);
    expect(document.getElementById("bdp-print-header")?.textContent).toContain(
      "Comparativa de Postulantes",
    );
    const style = document.getElementById("bdp-print-page-style");
    expect(style?.textContent).toContain("size: Letter landscape");
  });

  it("no hereda el ámbito de una impresión que nadie cerró", () => {
    // Primera impresión con ámbito; el navegador nunca emite `afterprint`
    // (diálogo cancelado, impresión intervenida por política…).
    printModule("Comparativa de Postulantes", "Letter", "landscape", {
      scope: "comparador",
    });
    expect(scopes()).toContain("bdp-scope-comparador");

    // Segunda impresión, sin ámbito: debe partir de cero.
    printModule("Lista de Postulantes");
    expect(scopes()).toEqual([]);
    expect(document.querySelectorAll("#bdp-print-header").length).toBe(1);
    expect(document.querySelectorAll("#bdp-print-page-style").length).toBe(1);
  });

  it("limpia todo cuando el navegador sí avisa", () => {
    printModule("Comparativa de Postulantes", "Legal", "portrait", {
      scope: "comparador",
    });
    window.dispatchEvent(new Event("afterprint"));
    expect(scopes()).toEqual([]);
    expect(document.getElementById("bdp-print-header")).toBeNull();
    expect(document.getElementById("bdp-print-page-style")).toBeNull();
  });

  it("escapa el título para que no pueda inyectar marcado", () => {
    printModule('<img src=x onerror="alert(1)">');
    const header = document.getElementById("bdp-print-header");
    expect(header?.querySelector("img")).toBeNull();
    expect(header?.textContent).toContain("<img src=x");
  });

  it("llama a imprimir una sola vez, tras dejar el banner en su sitio", () => {
    printModule("Lista de Postulantes");
    expect(window.print).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(window.print).toHaveBeenCalledTimes(1);
  });
});
