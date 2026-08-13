import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { safeLocal } from "../shared/safeStorage";

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
 * Pasa por {@link safeLocal} porque este es el primer código de la aplicación
 * que toca el almacenamiento: en un navegador con el almacenamiento del sitio
 * bloqueado, leerlo a pelo lanzaba `SecurityError` durante el primer dibujado de
 * `ThemeProvider` —por encima de toda frontera de error— y la aplicación se
 * quedaba en blanco. Ver `shared/safeStorage`.
 */
function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = safeLocal.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  const prefersLight =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: light)").matches;
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
    safeLocal.setItem(STORAGE_KEY, theme);
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
