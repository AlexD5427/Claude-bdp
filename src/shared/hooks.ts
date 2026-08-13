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
 * La comprobación es `typeof … === "function"` y no `"matchMedia" in window`:
 * hay entornos —jsdom entre ellos— donde la propiedad existe pero no es
 * invocable, y con la comprobación antigua eso terminaba en un
 * `matchMedia is not a function` que tiraba el árbol de React entero.
 */
export function useMediaQuery(query: string): boolean {
  const supported =
    typeof window !== "undefined" && typeof window.matchMedia === "function";
  const [matches, setMatches] = useState(() =>
    supported ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    if (!supported) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    // Safari < 14 sólo tiene la API antigua `addListener`.
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, [query, supported]);
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
