import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { localRead, localWrite } from "../lib/safeStorage";

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
 * Todo lo que hay aquí puede lanzar en un navegador con los datos del sitio
 * bloqueados, y esta función es el **estado inicial del proveedor más externo**
 * de la aplicación: si lanza, React no monta nada y el analista se queda con una
 * página en blanco. Por eso el acceso pasa por `safeStorage` y `matchMedia` va
 * dentro de su propio `try`.
 */
function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localRead(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  try {
    if (window.matchMedia?.("(prefers-color-scheme: light)").matches) return "light";
  } catch {
    /* matchMedia no disponible: seguimos con el tema oscuro */
  }
  return "dark";
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
    localWrite(STORAGE_KEY, theme);
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
