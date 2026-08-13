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
 * La comprobación es `typeof window.matchMedia === "function"` y no
 * `"matchMedia" in window`: hay entornos —jsdom entre ellos, y algún navegador
 * embebido antiguo— donde la propiedad existe pero no es invocable, y ahí el
 * `in` daba luz verde para acabar en «window.matchMedia is not a function».
 * Es la clase de detalle que tumba la aplicación entera en un solo equipo.
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
    // Safari < 14 sólo tiene la API antigua (`addListener`).
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
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
