import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { localRead, localWrite } from "../lib/safeStorage";

export type Theme = "dark" | "light";

interface ThemeValue {
  theme: Theme;
  /**
   * Alterna el tema. Acepta, opcionalmente, el evento del clic (o el elemento)
   * que lo pide: el tema nuevo se revela en un círculo que nace de ahí. Sin
   * origen, el círculo nace en el centro de la parte superior.
   */
  toggle: (origen?: unknown) => void;
  setTheme: (t: Theme) => void;
}

/** Firma mínima de `document.startViewTransition` (API de transiciones de vista). */
type IniciarTransicion = (actualizar: () => void) => { finished?: Promise<unknown> };

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

/** Aplica el tema a `<html>`: clase, esquema de color y color de la barra del navegador. */
function aplicarTema(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  root.style.colorScheme = theme;
  root.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#04122a" : "#eaf1fb");
}

/** «Reducir movimiento», del sistema o de Configuración. */
function movimientoReducido(): boolean {
  if (document.documentElement.classList.contains("reduce-motion")) return true;
  try {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}

/** Punto de la pantalla donde nace el revelado: el centro del botón pulsado. */
function puntoDeOrigen(origen: unknown): { x: number; y: number } {
  const porDefecto = { x: window.innerWidth / 2, y: 0 };
  if (!origen || typeof origen !== "object") return porDefecto;
  const datos = origen as { currentTarget?: unknown; clientX?: unknown; clientY?: unknown };
  const elemento =
    datos.currentTarget instanceof Element
      ? datos.currentTarget
      : origen instanceof Element
        ? origen
        : null;
  if (elemento) {
    const r = elemento.getBoundingClientRect();
    if (r.width > 0 || r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  if (typeof datos.clientX === "number" && typeof datos.clientY === "number") {
    return { x: datos.clientX, y: datos.clientY };
  }
  return porDefecto;
}

/**
 * Drives the dual ("Midnight" / "Daylight") theme. The selected theme is
 * applied as a class on <html>, which flips every CSS custom property in the
 * design system, and is persisted to localStorage so it survives reloads.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);
  // El tema vigente, al alcance de `toggle` sin tener que recrearlo.
  const themeRef = useRef(theme);
  // Identifica la última transición, para no descongelar a destiempo.
  const transicionRef = useRef(0);

  useEffect(() => {
    themeRef.current = theme;
    aplicarTema(theme);
    localWrite(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);

  /**
   * Cambio de tema con revelado circular (Liquid Glass 2).
   *
   * Donde el navegador ofrece transiciones de vista y no se ha pedido menos
   * movimiento, el tema nuevo se descubre en un círculo que crece desde el
   * botón pulsado (la animación está en `index.css`). En el resto de casos —y
   * en las pruebas, que corren en jsdom— el cambio es el de siempre. Cualquier
   * fallo de la API cae también al cambio de siempre: el tema SIEMPRE cambia.
   */
  const toggle = useCallback((origen?: unknown) => {
    const next: Theme = themeRef.current === "dark" ? "light" : "dark";
    themeRef.current = next;

    const doc = document as unknown as { startViewTransition?: IniciarTransicion };
    if (typeof doc.startViewTransition !== "function" || movimientoReducido()) {
      setThemeState(next);
      return;
    }

    const root = document.documentElement;
    try {
      const { x, y } = puntoDeOrigen(origen);
      const radio = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y),
      );
      root.style.setProperty("--lg-vt-x", `${Math.round(x)}px`);
      root.style.setProperty("--lg-vt-y", `${Math.round(y)}px`);
      root.style.setProperty("--lg-vt-r", `${Math.ceil(radio)}px`);

      // Sin transiciones CSS mientras dura: el círculo muestra ya los colores
      // finales y no un fundido a medias.
      const id = ++transicionRef.current;
      root.classList.add("lg-vt");
      const descongelar = () => {
        if (transicionRef.current === id) root.classList.remove("lg-vt");
      };

      const transicion = doc.startViewTransition(() => {
        try {
          aplicarTema(next);
          flushSync(() => setThemeState(next));
        } catch {
          setThemeState(next);
        }
      });
      if (transicion?.finished) transicion.finished.then(descongelar, descongelar);
      else descongelar();
      // Red de seguridad: si el navegador nunca resolviera `finished`, las
      // transiciones no pueden quedarse congeladas para siempre.
      window.setTimeout(descongelar, 2000);
    } catch {
      root.classList.remove("lg-vt");
      setThemeState(next);
    }
  }, []);

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

/**
 * El tema, o `null` si no hay proveedor.
 *
 * ── Por qué existe además de `useTheme` ─────────────────────────────────────
 * `useTheme` lanza, y hace bien: un componente que pinta según el tema y se
 * monta sin proveedor está mal montado, y fallar pronto es lo correcto. Pero hay
 * un caso distinto: un CONTROL del tema, como el interruptor del panel de
 * preferencias de Documentación. Ese control es un extra dentro de una pantalla
 * cuyo trabajo principal es otro —autodiagnosticar el módulo—, y si el árbol no
 * trae proveedor, lo que debe pasar es que el interruptor no se ofrezca; no que
 * se caiga la pantalla entera a la que alguien acaba de llegar porque algo no
 * funcionaba.
 *
 * Esto no es una hipótesis: el módulo se monta suelto en `qa/documentacion.tsx`
 * para las sondas, y la sonda visual capturó justo esa caída.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useThemeOpcional(): ThemeValue | null {
  return useContext(ThemeContext);
}
