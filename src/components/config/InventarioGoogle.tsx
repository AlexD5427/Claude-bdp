/**
 * Inventario de la cuenta de Google, para mirarlo desde la aplicación.
 *
 * ── Por qué una pantalla y no solo un archivo ───────────────────────────────
 * Migrar el sistema a otra cuenta de Google es mover archivos y volver a
 * publicar; la parte difícil no es hacerlo, es **comprobar que no quedó nada
 * apuntando a la cuenta antigua**. Y eso, hasta ahora, solo se podía comprobar
 * leyendo el código o abriendo las herramientas del navegador, que es justo lo
 * que la persona que hace la migración no va a hacer.
 *
 * Aquí se ven las direcciones efectivas, de dónde salió cada una (de una
 * variable del despliegue o del repositorio) y qué se rompe si esa concreta se
 * quedó atrás. Es solo lectura: nada se puede cambiar desde esta pantalla, igual
 * que el endpoint que ya se mostraba encima.
 *
 * El detalle de cada paso está en `docs/migracion/MIGRACION_CUENTA_GOOGLE.md`.
 */

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ChevronDown, Cloud } from "lucide-react";
import { avisosDeConfiguracion, inventarioGoogle, type OrigenRecurso } from "../../config/google";

const ETIQUETA_ORIGEN: Record<OrigenRecurso, string> = {
  variable: "variable del despliegue",
  repositorio: "repositorio",
  "sin-configurar": "sin configurar",
};

const COLOR_ORIGEN: Record<OrigenRecurso, string> = {
  variable: "bg-cyan-500/15 text-cyan-500 ring-cyan-400/30",
  repositorio: "bg-slate-500/15 text-ink-soft ring-[color:var(--hairline)]",
  "sin-configurar": "bg-amber-500/15 text-amber-500 ring-amber-400/30",
};

export function InventarioGoogle() {
  const [abierto, setAbierto] = useState(false);
  const recursos = inventarioGoogle();
  const avisos = avisosDeConfiguracion();
  const sinConfigurar = recursos.filter((r) => r.origen === "sin-configurar").length;

  return (
    <div className="rounded-2xl fill-softer p-4 ring-1 ring-[color:var(--hairline)]">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2">
          <Cloud className="h-4 w-4 text-cyan-400" />
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Recursos en la cuenta de Google
          </span>
          <span className="rounded-full bg-[color:var(--fill-2)] px-2 py-0.5 text-[0.65rem] font-bold text-ink-soft">
            {recursos.length}
          </span>
          {sinConfigurar > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.65rem] font-bold text-amber-500 ring-1 ring-amber-400/30">
              {sinConfigurar} sin configurar
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-ink-soft transition-transform duration-300 ${abierto ? "rotate-180" : ""}`}
        />
      </button>

      <p className="mt-2 text-xs text-ink-soft">
        Todo lo que vive en la cuenta de Google que sostiene el sistema. Al cambiar de cuenta, cada
        línea tiene que apuntar a la nueva.
      </p>

      {avisos.length > 0 && (
        <ul className="mt-3 space-y-2">
          {avisos.map((aviso) => (
            <li
              key={aviso}
              className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-600 ring-1 ring-amber-400/30 dark:text-amber-300"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{aviso}</span>
            </li>
          ))}
        </ul>
      )}

      <AnimatePresence initial={false}>
        {abierto && (
          <motion.ul
            key="lista"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="mt-3 space-y-2 overflow-hidden"
          >
            {recursos.map((r) => (
              <li key={r.clave} className="rounded-xl bg-[color:var(--fill-2)] px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-ink">{r.etiqueta}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide ring-1 ${COLOR_ORIGEN[r.origen]}`}
                  >
                    {ETIQUETA_ORIGEN[r.origen]}
                  </span>
                  {r.variable && (
                    <code className="text-[0.6rem] text-ink-soft">{r.variable}</code>
                  )}
                </div>
                {r.url ? (
                  <code className="mt-1 block truncate text-[0.65rem] text-ink-soft" title={r.url}>
                    {r.url}
                  </code>
                ) : (
                  <p className="mt-1 text-[0.65rem] text-ink-soft">
                    Sin dirección. {r.impacto}
                  </p>
                )}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
