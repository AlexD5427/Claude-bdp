/**
 * Observadores del DOM que degradan en lugar de tumbar el módulo.
 *
 * ## Por qué importa aquí y no en cualquier otro sitio
 *
 * `ResizeObserver` e `IntersectionObserver` se usan en exactamente dos zonas de la
 * aplicación, y son justo las dos de las que se quejaba el usuario:
 *
 *   · **Comparador** — la barra congelada (`IntersectionObserver`), el ancho de la
 *     tira de nombres, la marquesina de cada rótulo de fila (`MarqueeText`, que
 *     aparece en *todas* las filas) y la medición del desborde de las celdas de
 *     texto largo.
 *   · **Postulantes** — la navegación por teclado asistida del cuestionario.
 *
 * `new ResizeObserver(...)` sobre un navegador que no lo trae lanza
 * `ResizeObserver is not defined`, y como esas llamadas viven dentro de efectos
 * de componentes que se dibujan siempre, el resultado no es «una animación menos»:
 * es que el `ErrorBoundary` se come el módulo completo. Un equipo con un navegador
 * antiguo o un WebView corporativo restringido ve el Comparador y el cuestionario
 * roídos mientras el resto de la aplicación funciona — que es, palabra por
 * palabra, el síntoma reportado.
 *
 * Estas dos funciones convierten esa clase de fallo en una degradación: sin
 * observador no hay marquesina ni barra congelada, y todo lo demás sigue en pie.
 */

/** Devuelve una función de limpieza; no hace nada si la API no existe. */
export function observeResize(
  targets: (Element | null | undefined)[],
  callback: () => void,
): () => void {
  if (typeof ResizeObserver === "undefined") {
    // Sin `ResizeObserver` el redimensionado de la ventana es la mejor
    // aproximación disponible, y cubre el caso que más se nota.
    window.addEventListener("resize", callback);
    return () => window.removeEventListener("resize", callback);
  }
  const observer = new ResizeObserver(callback);
  for (const target of targets) if (target) observer.observe(target);
  return () => observer.disconnect();
}

/**
 * Igual que arriba para `IntersectionObserver`. Cuando no existe se informa una
 * sola vez de que el elemento **sí** es visible: es el valor que deja la interfaz
 * en su estado por omisión en lugar de bloqueada.
 */
export function observeIntersection(
  target: Element | null | undefined,
  callback: (visible: boolean, rect: DOMRectReadOnly | null) => void,
  options?: IntersectionObserverInit,
): () => void {
  if (!target) return () => {};
  if (typeof IntersectionObserver === "undefined") {
    callback(true, null);
    return () => {};
  }
  const observer = new IntersectionObserver((entries) => {
    const entry = entries[0];
    if (entry) callback(entry.isIntersecting, entry.boundingClientRect);
  }, options);
  observer.observe(target);
  return () => observer.disconnect();
}
