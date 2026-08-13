import "@testing-library/jest-dom/vitest";

/**
 * jsdom no implementa `matchMedia` ni `ResizeObserver`, y varias piezas de la
 * interfaz los consultan en el primer dibujado (preferencia de movimiento
 * reducido, medición de celdas del comparador). Se rellenan aquí, una sola vez,
 * para que cada prueba de componente no tenga que repetir el andamiaje.
 */
if (typeof window !== "undefined") {
  if (typeof window.matchMedia !== "function") {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }

  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
}
