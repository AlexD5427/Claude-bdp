/**
 * Movimiento del texto y de las cifras.
 *
 * ── Por qué el texto también se mueve ───────────────────────────────────────
 * Cuando una sección cambia, el bloque entero aparece a la vez y el ojo no sabe
 * por dónde empezar. Revelar el título por palabras —con un desenfoque mínimo que
 * se resuelve— crea una jerarquía temporal: primero se lee el título, luego el
 * resto. Es lo que hace que una interfaz se sienta *cuidada* en lugar de
 * *animada*.
 *
 * Tres reglas para que no se convierta en decoración:
 *
 * 1. **Solo una vez, al montar.** Un título que se revela cada vez que se
 *    renderiza el componente es un título que parpadea mientras se escribe.
 * 2. **Muy corto y escalonado poco** (28 ms entre palabras, 320 ms cada una): al
 *    terminar de mirar ya está completo. Nada que esperar.
 * 3. **Solo `opacity`, `transform` y `filter`.** Ninguna propiedad que provoque
 *    recálculo de diseño, así que el navegador lo resuelve en la GPU. Con
 *    `prefers-reduced-motion` —o el interruptor de la aplicación— no se mueve nada
 *    y el texto sale ya puesto.
 *
 * Las cifras se tratan al contrario: **no** se anima el dígito (un número que gira
 * no se puede leer), se interpola el valor. Un contador que pasa de 12 a 18
 * recorre 13, 14, 15… en 420 ms, y eso sí se lee.
 */

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CURVA, DURACION, useMovimientoReducido } from "./DocMotion";

/* ------------------------------------------------------------------ */
/* Texto revelado                                                      */
/* ------------------------------------------------------------------ */

export function TextoRevelado({
  texto,
  className,
  como: Como = "span",
  retardo = 0,
}: {
  texto: string;
  className?: string;
  /** Etiqueta semántica del contenedor: un título debe seguir siendo `h2`. */
  como?: "span" | "h1" | "h2" | "h3" | "p";
  retardo?: number;
}) {
  const reducido = useMovimientoReducido();
  const palabras = texto.split(/\s+/).filter(Boolean);

  if (reducido || palabras.length === 0) {
    return <Como className={className}>{texto}</Como>;
  }

  return (
    <Como className={className}>
      {/* El texto completo queda accesible para lectores de pantalla en una sola
          pieza; las palabras animadas se marcan como decorativas para que no se
          lean de una en una. */}
      <span className="sr-only">{texto}</span>
      <span aria-hidden>
        {palabras.map((palabra, i) => (
          <motion.span
            // La clave incluye el texto: al cambiar de sección, el título vuelve a
            // revelarse; al renderizar de nuevo con el mismo texto, no.
            key={`${texto}-${i}`}
            className="inline-block whitespace-pre"
            initial={{ opacity: 0, y: "0.28em", filter: "blur(3px)" }}
            animate={{ opacity: 1, y: "0em", filter: "blur(0px)" }}
            transition={{
              duration: 0.32,
              ease: CURVA.salidaExpo,
              delay: retardo + i * 0.028,
            }}
          >
            {palabra}
            {i < palabras.length - 1 ? " " : ""}
          </motion.span>
        ))}
      </span>
    </Como>
  );
}

/* ------------------------------------------------------------------ */
/* Cifra interpolada                                                   */
/* ------------------------------------------------------------------ */

/**
 * Cifra que recorre el camino hasta su valor nuevo.
 *
 * Se implementa con un `requestAnimationFrame` propio y no con `useSpring` de
 * Framer porque aquí no hace falta un resorte: una interpolación con salida
 * exponencial es más corta, más previsible y no arrastra un nodo de movimiento por
 * cada contador. Un panel de Documentación pinta más de veinte.
 */
export function Cifra({
  valor,
  sufijo = "",
  className,
  duracion = DURACION.lenta,
}: {
  valor: number;
  sufijo?: string;
  className?: string;
  duracion?: number;
}) {
  const reducido = useMovimientoReducido();
  const [mostrado, setMostrado] = useState(valor);
  const desde = useRef(valor);
  const cuadro = useRef(0);

  useEffect(() => {
    if (reducido) {
      setMostrado(valor);
      desde.current = valor;
      return;
    }
    const inicio = desde.current;
    if (inicio === valor) return;
    const t0 = performance.now();
    const ms = duracion * 1000;

    const paso = (ahora: number) => {
      const p = Math.min(1, (ahora - t0) / ms);
      // Salida exponencial: rápido al principio, se asienta al final.
      const suave = 1 - Math.pow(2, -10 * p);
      setMostrado(Math.round(inicio + (valor - inicio) * (p === 1 ? 1 : suave)));
      if (p < 1) cuadro.current = requestAnimationFrame(paso);
      else desde.current = valor;
    };
    cuadro.current = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro.current);
  }, [valor, reducido, duracion]);

  return (
    <span className={className} aria-label={`${valor}${sufijo}`}>
      {mostrado}
      {sufijo}
    </span>
  );
}
