/**
 * Small, dependency-free hooks shared across the Talent Acquisition modules.
 */

import { useEffect, useRef, useState } from "react";

/** Debounce a fast-changing value (e.g. a search box) by `delay` ms. */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/**
 * Track a CSS media query with SSR-safe defaults.
 *
 * Dos detalles de compatibilidad que no son teóricos:
 *
 *   · La comprobación era `"matchMedia" in window`, que es cierta en entornos que
 *     exponen la propiedad **sin la función** (jsdom según la versión, algunos
 *     WebView incrustados). Ahí el hook lanzaba `matchMedia is not a function` y,
 *     como lo usan el buscador del comparador y las celdas de texto largo, se
 *     llevaba por delante el módulo entero. `typeof … === "function"` sí lo cubre.
 *   · `addEventListener` sobre un `MediaQueryList` no existe antes de Safari 14 ni
 *     en versiones antiguas de iOS; en esos navegadores hay que usar el
 *     `addListener` obsoleto, que sigue funcionando.
 */
export function useMediaQuery(query: string): boolean {
  const supported = () =>
    typeof window !== "undefined" && typeof window.matchMedia === "function";

  const [matches, setMatches] = useState(() =>
    supported() ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    if (!supported()) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    // Safari < 14 / iOS antiguo.
    const legacy = mql as MediaQueryList & {
      addListener?: (cb: () => void) => void;
      removeListener?: (cb: () => void) => void;
    };
    legacy.addListener?.(onChange);
    return () => legacy.removeListener?.(onChange);
  }, [query]);

  return matches;
}

/** True when the user prefers reduced motion at the OS/browser level. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

/** True when the user prefers reduced transparency. */
export function usePrefersReducedTransparency(): boolean {
  return useMediaQuery("(prefers-reduced-transparency: reduce)");
}

/** Warn before unloading the tab while there are unsaved changes. */
export function useUnsavedChangesWarning(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}

/** Returns the previous value of a variable (one render behind). */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}
