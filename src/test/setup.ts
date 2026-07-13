import "@testing-library/jest-dom/vitest";

/**
 * Test setup. Registers jest-dom matchers and stubs a couple of browser APIs
 * that jsdom does not implement but the app touches on import.
 */

// `matchMedia` is used by the device profiler and reduced-motion checks.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// jsdom does not implement canvas contexts; the WebGL probe must degrade
// silently to "unavailable" rather than logging a not-implemented error.
if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}
