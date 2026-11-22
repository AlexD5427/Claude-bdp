import { Fragment, type CSSProperties } from "react";
import { motion, type Variants } from "framer-motion";
import { useCalmMotion } from "../hooks/useCalmMotion";

const contenedor: Variants = {
  oculto: {},
  visible: { transition: { staggerChildren: 0.03, delayChildren: 0.04 } },
};

const letra: Variants = {
  oculto: { opacity: 0, y: 16, rotateX: -75, filter: "blur(6px)" },
  visible: {
    opacity: 1,
    y: 0,
    rotateX: 0,
    filter: "blur(0px)",
    // Sin filtro en reposo: el texto vuelve a ser texto plano y nítido.
    transitionEnd: { filter: "none" },
    transition: { type: "spring", stiffness: 380, damping: 24, mass: 0.7 },
  },
};

type EstiloDestello = CSSProperties & Record<"--glint-delay", string>;

/** Las palabras del título, cada una como bloque que no se parte por dentro. */
function Palabras({ palabras, animadas }: { palabras: string[]; animadas: boolean }) {
  return (
    <>
      {palabras.map((palabra, i) => (
        <Fragment key={`${palabra}-${i}`}>
          {i > 0 ? " " : null}
          <span className="inline-block whitespace-nowrap [perspective:640px]">
            {Array.from(palabra).map((caracter, j) =>
              animadas ? (
                <motion.span key={j} variants={letra} className="inline-block origin-bottom">
                  {caracter}
                </motion.span>
              ) : (
                <span key={j} className="inline-block">
                  {caracter}
                </span>
              ),
            )}
          </span>
        </Fragment>
      ))}
    </>
  );
}

/**
 * Título que se materializa letra a letra: cada carácter cae girando desde
 * atrás, desenfocado, y se asienta con un resorte; al terminar, un destello de
 * luz recorre la palabra una sola vez.
 *
 * Accesibilidad: el texto real va en un `sr-only`; las letras sueltas y el
 * destello son decorativos (`aria-hidden`), así un lector de pantalla lee el
 * título de corrido y no carácter a carácter. Con movimiento reducido se pinta
 * el texto tal cual.
 *
 * Se usa con `key` = módulo activo, para que cada cambio de módulo lo vuelva a
 * montar y reproduzca la entrada.
 */
export function AnimatedTitle({ text }: { text: string }) {
  const calm = useCalmMotion();
  if (calm) return <>{text}</>;

  const palabras = text.split(/\s+/).filter(Boolean);
  const letras = palabras.reduce((total, p) => total + Array.from(p).length, 0);
  const estiloDestello: EstiloDestello = {
    "--glint-delay": `${(0.35 + letras * 0.03).toFixed(2)}s`,
  };

  return (
    <span className="relative inline-block">
      <span className="sr-only">{text}</span>
      <motion.span aria-hidden variants={contenedor} initial="oculto" animate="visible">
        <Palabras palabras={palabras} animadas />
      </motion.span>
      <span aria-hidden className="title-glint" style={estiloDestello}>
        <Palabras palabras={palabras} animadas={false} />
      </span>
    </span>
  );
}
