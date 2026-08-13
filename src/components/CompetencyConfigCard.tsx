import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import type { FormCompetency } from "../types";
import { computeAjuste, computeBrecha, parseDecimal } from "../lib/competency";
import { buildCompetencyCatalog, lookupCompetency } from "../lib/competencyMeta";
import { AjusteBadge } from "./AjusteBadge";
import { CompetencyInfoButton } from "./CompetencyInfoButton";
import { CompetencyLevelBoxes } from "./CompetencyLevelBoxes";

interface CompetencyConfigCardProps {
  competency: FormCompetency;
  index: number;
  /**
   * Catálogo de competencias de la hoja. Llega por props y no del contexto: con
   * el contexto, cada refresco de la base en segundo plano volvía a dibujar las
   * siete tarjetas aunque nada de ellas hubiera cambiado.
   */
  catalogo: string[];
  onChange: (uid: string, patch: Partial<FormCompetency>) => void;
  onRemove: (uid: string) => void;
}

/**
 * The Liquid Glass card revealed when a competency is selected. It exposes two
 * numeric inputs (Valor Esperado with a static ≥ prefix, Valor Obtenido) and
 * renders the live Brecha and Ajuste calculations beside them.
 */
export const CompetencyConfigCard = memo(function CompetencyConfigCard({
  competency,
  index,
  catalogo,
  onChange,
  onRemove,
}: CompetencyConfigCardProps) {
  const meta = useMemo(
    () => lookupCompetency(buildCompetencyCatalog(catalogo), competency.name) ?? null,
    [catalogo, competency.name],
  );

  const esperado = parseDecimal(competency.esperadoText);
  const obtenido = parseDecimal(competency.obtenidoText);
  const brecha = computeBrecha(esperado, obtenido);
  const ajuste = computeAjuste(esperado, obtenido);

  // Let users type a comma as a decimal separator even on type=number inputs.
  //
  // Antes esto escribía `input.value = value + "."` directamente en el DOM. Dos
  // problemas: React desconocía el cambio (el estado se quedaba atrás) y, sobre
  // todo, en un `input[type=number]` el navegador **rechaza** un valor como
  // "3." porque no es un número válido y lo deja en blanco: teclear la coma
  // borraba el número que ya estaba escrito. Ahora la coma se traduce a punto en
  // el propio estado, que es la única fuente de verdad del campo.
  function commaToDot(
    e: React.KeyboardEvent<HTMLInputElement>,
    field: "esperadoText" | "obtenidoText",
    current: string,
  ) {
    if (e.key !== ",") return;
    e.preventDefault();
    if (current.includes(".")) return;
    onChange(competency.uid, { [field]: `${current}.` } as Partial<FormCompetency>);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className="glass rounded-2xl p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-xs font-black text-white ring-1 ring-white/30">
            {index + 1}
          </span>
          <h4 className="min-w-0 flex-1 text-sm font-bold text-ink [overflow-wrap:normal] [word-break:keep-all]" title={competency.name}>
            {competency.name}
          </h4>
          {/* Mouse-only "?" — explains the competency (not in the Tab order). */}
          <CompetencyInfoButton name={competency.name} meta={meta} size="sm" />
        </div>
        <button
          type="button"
          aria-label={`Quitar ${competency.name}`}
          onClick={() => onRemove(competency.uid)}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full fill-softer text-ink-soft ring-1 ring-[color:var(--hairline)] transition-all duration-300 hover:bg-rose-500/80 hover:text-white active:scale-90"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Level applicability cue (Cargo: Bajo · Medio · Alto). */}
      {meta?.hasLevels && (
        <div className="mt-2">
          <CompetencyLevelBoxes levels={meta.levels} compact />
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Valor Esperado — with static ≥ prefix inside the wrapper */}
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Valor Esperado
          </span>
          <div className="glass flex items-center gap-1.5 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-cyan-300/70">
            <span className="select-none text-base font-black text-cyan-300 drop-shadow-md">
              ≥
            </span>
            <input
              type="number"
              step="any"
              inputMode="decimal"
              value={competency.esperadoText}
              onKeyDown={(e) => commaToDot(e, "esperadoText", competency.esperadoText)}
              onChange={(e) =>
                onChange(competency.uid, { esperadoText: e.target.value })
              }
              placeholder="Introduzca el valor"
              className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>
        </label>

        {/* Valor Obtenido */}
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Valor Obtenido
          </span>
          <div className="glass flex items-center gap-1.5 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-cyan-300/70">
            <input
              type="number"
              step="any"
              inputMode="decimal"
              value={competency.obtenidoText}
              onKeyDown={(e) => commaToDot(e, "obtenidoText", competency.obtenidoText)}
              onChange={(e) =>
                onChange(competency.uid, { obtenidoText: e.target.value })
              }
              placeholder="Introduzca el valor"
              className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>
        </label>
      </div>

      {/* Live calculations */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <AjusteBadge ajuste={ajuste} />
        <span
          className={[
            "rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-[color:var(--hairline)]",
            brecha === null
              ? "fill-softer text-ink-soft"
              : brecha < 0
                ? "bg-rose-500/20 text-rose-500"
                : "fill-softer text-ink-soft",
          ].join(" ")}
        >
          Brecha: {brecha === null ? "—" : brecha.toFixed(1)}
        </span>
      </div>
    </motion.div>
  );
});
