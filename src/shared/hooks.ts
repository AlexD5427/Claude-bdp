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
 * `MediaQueryList.addEventListener` es relativamente reciente: Safari sólo lo
 * expone desde la versión 14. En un equipo con Safari 13 —o con cualquier motor
 * antiguo— la versión anterior de este hook lanzaba un `TypeError` dentro del
 * efecto, y como lo usan el buscador del Comparador y sus celdas de texto largo,
 * el módulo entero caía en el `ErrorBoundary`: «a mí el comparador no funciona».
 * Ahora se prueba la API moderna, se recurre a `addListener` y, si nada existe,
 * el valor se queda en su lectura inicial en lugar de romper.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    try {
      return typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia(query).matches
        : false;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia(query);
    } catch {
      return;
    }
    const onChange = () => setMatches(mql.matches);
    onChange();
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    // Motores antiguos (Safari ≤ 13): API obsoleta pero equivalente.
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
