import { motion, type Variants } from "framer-motion";

/*
 * Coreografía de entrada de la cabecera: la placa del logo aparece con un
 * pequeño giro y rebote, el halo se enciende detrás y el nombre y el lema
 * llegan en cascada. Todo son variantes: el `header` dirige el escalonado y
 * cada pieza hereda «oculto»/«visible» sin repetir `initial`/`animate`.
 */
const cabecera: Variants = {
  oculto: { opacity: 0, y: -12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 200,
      damping: 24,
      staggerChildren: 0.08,
      delayChildren: 0.05,
    },
  },
};

const placa: Variants = {
  oculto: { opacity: 0, scale: 0.6, rotate: -8 },
  visible: {
    opacity: 1,
    scale: 1,
    rotate: 0,
    transition: { type: "spring", stiffness: 260, damping: 16 },
  },
};

const halo: Variants = {
  oculto: { opacity: 0, scale: 0.7 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.25 },
  },
};

const elemento: Variants = {
  oculto: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 240, damping: 24 },
  },
};

const linea: Variants = {
  oculto: { scaleX: 0 },
  visible: { scaleX: 1, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};

/**
 * Institutional brand lockup: the reconstructed BDP isotype + wordmark on a
 * crisp plate (so the corporate blues read in both themes), the full bank name
 * and the system tagline. Shown at the top of every screen and on printouts.
 *
 * La placa lleva detrás un halo cónico que gira despacio (solo CSS, en el
 * compositor; se detiene con movimiento reducido y no se imprime) y la sigla
 * del banco brilla con el degradado aurora de la interfaz.
 */
export function BrandHeader() {
  return (
    <motion.header
      variants={cabecera}
      initial="oculto"
      animate="visible"
      className="mx-auto mb-6 flex w-full max-w-6xl items-center gap-4"
    >
      <div className="relative shrink-0">
        <motion.span
          aria-hidden
          variants={halo}
          className="brand-halo-ring absolute -inset-1.5 rounded-[1.35rem]"
        />
        <motion.div
          variants={placa}
          className="relative grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white p-2.5 shadow-glass ring-1 ring-black/5 sm:h-[4.5rem] sm:w-[4.5rem]"
        >
          <img src="/logo-bdp.svg" alt="Logo BDP" className="h-full w-full object-contain" />
        </motion.div>
      </div>
      <div className="min-w-0">
        <motion.h1
          variants={elemento}
          className="text-lg font-black leading-tight tracking-tight text-ink sm:text-2xl"
        >
          Banco de Desarrollo Productivo{" "}
          <span className="aurora-text">BDP – S.A.M.</span>
        </motion.h1>
        <motion.p
          variants={elemento}
          className="mt-0.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft sm:text-sm"
        >
          <motion.span variants={linea} className="hidden h-px w-6 origin-left bg-cyan-400 sm:block" />
          Sistema de Selección y Reclutamiento
        </motion.p>
      </div>
    </motion.header>
  );
}
