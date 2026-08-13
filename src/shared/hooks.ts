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
 * ## Por qué la comprobación es tan quisquillosa
 *
 * Este hook lo usan piezas centrales —el buscador del comparador, las celdas de
 * texto largo, el visor ampliado— a través de `usePrefersReducedMotion`. Si al
 * llamarlo se lanza una excepción, no falla una animación: **falla el módulo
 * entero**, porque el error sube por el árbol hasta el `ErrorBoundary`. Y hay
 * entornos donde `matchMedia` está declarado pero no es invocable (webviews
 * empotrados, navegadores muy antiguos, algunos entornos de prueba): comprobar
 * `"matchMedia" in window` no bastaba, hay que comprobar que sea una función.
 *
 * `addListener`/`removeListener` son la variante antigua de la API (Safari < 14
 * y varios WebView corporativos). Se usan como respaldo para que el hook no se
 * quede sin escuchar cambios en esos navegadores.
 */
export function useMediaQuery(query: string): boolean {
  const list = (): MediaQueryList | null => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return null;
    }
    try {
      return window.matchMedia(query);
    } catch {
      return null;
    }
  };

  const [matches, setMatches] = useState(() => list()?.matches ?? false);

  useEffect(() => {
    const mql = list();
    if (!mql) return;
    const onChange = () => setMatches(mql.matches);
    onChange();
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    // Variante antigua (Safari < 14, WebViews empotrados).
    const legacy = mql as MediaQueryList & {
      addListener?: (cb: () => void) => void;
      removeListener?: (cb: () => void) => void;
    };
    legacy.addListener?.(onChange);
    return () => legacy.removeListener?.(onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
