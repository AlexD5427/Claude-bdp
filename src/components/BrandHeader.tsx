import { motion } from "framer-motion";

/**
 * Institutional brand lockup: the reconstructed BDP isotype + wordmark on a
 * crisp plate (so the corporate blues read in both themes), the full bank name
 * and the system tagline. Shown at the top of every screen and on printouts.
 */
export function BrandHeader() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 24 }}
      className="mx-auto mb-6 flex w-full max-w-6xl items-center gap-4"
    >
      <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white p-2.5 shadow-glass ring-1 ring-black/5 sm:h-[4.5rem] sm:w-[4.5rem]">
        <img src="/logo-bdp.svg" alt="Logo BDP" className="h-full w-full object-contain" />
      </div>
      <div className="min-w-0">
        <h1 className="text-lg font-black leading-tight tracking-tight text-ink sm:text-2xl">
          Banco de Desarrollo Productivo{" "}
          <span className="text-cyan-500">BDP – S.A.M.</span>
        </h1>
        <p className="mt-0.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft sm:text-sm">
          <span className="hidden h-px w-6 bg-cyan-400 sm:block" />
          Sistema de Selección y Reclutamiento
        </p>
      </div>
    </motion.header>
  );
}
