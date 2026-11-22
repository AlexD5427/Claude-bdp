import { flushSync } from "react-dom";

/** Lo mínimo de la View Transitions API que se usa aquí. */
interface TransicionDeVista {
  ready: Promise<void>;
  finished: Promise<void>;
}

/** Duración del revelado circular del tema, en milisegundos. */
const DURACION_REVELADO = 700;

/**
 * Cambia el tema con un revelado circular que nace en `origen` (el centro del
 * botón pulsado), usando la View Transitions API.
 *
 * Cómo funciona: el navegador fotografía la página con el tema actual, se
 * aplica el tema nuevo de forma síncrona (`flushSync`, para que React lo pinte
 * dentro de la transición) y la captura nueva se descubre con un `clip-path`
 * circular que crece hasta cubrir la pantalla.
 *
 * Sin la API (Firefox antiguo, Safari < 18), con «Reducir movimiento» o con
 * `prefers-reduced-motion`, el tema cambia al instante como siempre. Cualquier
 * fallo de la API cae también al cambio directo: nunca deja el tema a medias.
 */
export function cambiarTemaConRevelado(origen: { x: number; y: number }, cambiar: () => void): void {
  const raiz = document.documentElement;
  const api = document as unknown as {
    startViewTransition?: (actualizar: () => void) => TransicionDeVista;
  };

  const prefiereCalma =
    raiz.classList.contains("reduce-motion") ||
    (typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  if (typeof api.startViewTransition !== "function" || prefiereCalma) {
    cambiar();
    return;
  }

  const { x, y } = origen;
  const radio = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );

  // Mientras dura el revelado, sin transiciones CSS: el círculo descubre el
  // tema ya terminado, no colores a mitad de camino.
  raiz.classList.add("theme-vt");
  const limpiar = () => raiz.classList.remove("theme-vt");

  let transicion: TransicionDeVista;
  try {
    transicion = api.startViewTransition(() => {
      flushSync(cambiar);
    });
  } catch {
    limpiar();
    cambiar();
    return;
  }

  transicion.ready
    .then(() => {
      raiz.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${radio}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: DURACION_REVELADO,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    })
    .catch(() => {
      /* La transición se omitió (otra empezó encima): el tema ya cambió. */
    });

  transicion.finished.then(limpiar, limpiar);
}
