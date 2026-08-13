import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { almacenLocal } from "../shared/storage";

export type Theme = "dark" | "light";

interface ThemeValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const STORAGE_KEY = "bdp-theme";
const ThemeContext = createContext<ThemeValue | null>(null);

/**
 * Read the persisted theme, falling back to the OS preference, then dark.
 *
 * La lectura pasa por `almacenLocal` y no por `window.localStorage` porque, con
 * el almacenamiento del sitio bloqueado (política corporativa de cookies, modo
 * privado), acceder a esa propiedad **lanza**. Y como esto se ejecuta al crear el
 * proveedor de tema —por encima de cualquier `ErrorBoundary`— el resultado era
 * una pantalla en blanco en ese equipo y sólo en ese equipo.
 */
function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = almacenLocal.get(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  let prefersLight = false;
  try {
    prefersLight = Boolean(
      window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches,
    );
  } catch {
    /* matchMedia puede no existir en navegadores muy antiguos */
  }
  return prefersLight ? "light" : "dark";
}

/**
 * Drives the dual ("Midnight" / "Daylight") theme. The selected theme is
 * applied as a class on <html>, which flips every CSS custom property in the
 * design system, and is persisted to localStorage so it survives reloads.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    root.style.colorScheme = theme;
    root.setAttribute("data-theme", theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#04122a" : "#eaf1fb");
    almacenLocal.set(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggle = useCallback(
    () => setThemeState((t) => (t === "dark" ? "light" : "dark")),
    [],
  );

  const value = useMemo<ThemeValue>(
    () => ({ theme, toggle, setTheme }),
    [theme, toggle, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme debe usarse dentro de <ThemeProvider>.");
  return ctx;
}
