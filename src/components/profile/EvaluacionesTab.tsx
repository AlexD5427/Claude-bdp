import { motion } from "framer-motion";
import { Award, BrainCircuit, Gauge, Radar as RadarIcon, ShieldCheck, Wrench } from "lucide-react";
import type { Candidate } from "../../types";
import { profileScores } from "../../lib/profileData";
import { ajusteBand } from "../../lib/competency";
import { proficiencyTone, reliabilityTone, riskTone } from "../../lib/levels";
import { RadialProgress, RadarChart, type Series } from "../charts";
import { CompetencyChip } from "../CompetencyChip";
import { LevelBadge } from "../LevelBadge";
import { SectionCard } from "./parts";
import type { TechnicalKnowledge } from "../../types";

/** The "Evaluaciones" tab — scores, a competency radar and every rubric. */
export function EvaluacionesTab({ candidate }: { candidate: Candidate }) {
  const scores = profileScores(candidate);
  const comps = candidate.competenciasList;

  // A radar over the four headline scores (needs 3+ axes to draw).
  const scoreSeries: Series[] = [
    {
      label: candidate.fullName,
      color: "#00b0d8",
      values: scores.map((s) => s.value ?? 0),
    },
  ];

  const integrity = [
    { label: "Confiabilidad e Integridad", value: candidate.nivel_general_confiabilidad, tone: reliabilityTone },
    { label: "Integridad", value: candidate.nivel_integridad, tone: riskTone },
    { label: "Riesgo de robo", value: candidate.riesgo_robo, tone: riskTone },
    { label: "Riesgo de mentira", value: candidate.riesgo_mentira, tone: riskTone },
  ];

  return (
    <div className="space-y-4">
      {/* Headline scores as rings */}
      <SectionCard icon={<Gauge className="h-5 w-5" />} title="Resultados de evaluación" sub="Puntajes registrados en la base">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {scores.map((s, i) => {
            const band = ajusteBand(s.value);
            const color =
              band === "green" ? "#10b981" : band === "yellow" ? "#f59e0b" : band === "red" ? "#f43f5e" : "#64748b";
            return (
              <motion.div
                key={s.key}
                initial={{ opacity: 0, y: 12, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: i * 0.06, type: "spring", stiffness: 240, damping: 20 }}
                className="flex flex-col items-center gap-1 rounded-2xl fill-soft p-3 ring-1 ring-[color:var(--hairline)]"
              >
                <RadialProgress value={s.value} size={104} thickness={10} color={color} na={s.value === null} />
                <div className="text-center">
                  <div className="text-xs font-bold text-ink">{s.label}</div>
                  <div className="text-[0.65rem] text-ink-faint">{s.hint}</div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </SectionCard>

      {/* Radar of the headline scores */}
      <SectionCard icon={<RadarIcon className="h-5 w-5" />} title="Radar de puntajes" sub="Vista de fortalezas y brechas">
        <RadarChart axes={scores.map((s) => s.label)} series={scoreSeries} size={320} />
      </SectionCard>

      {/* Competencies */}
      <SectionCard icon={<Award className="h-5 w-5" />} title="Competencias evaluadas" sub={`${comps.length} competencia(s)`}>
        {comps.length === 0 ? (
          <Empty text="Este postulante no tiene competencias configuradas." />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {comps.map((s) => (
              <CompetencyChip key={s.name} score={s} />
            ))}
          </div>
        )}
      </SectionCard>

      {/* Knowledge + tools */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard icon={<BrainCircuit className="h-5 w-5" />} title="Conocimientos técnicos">
          <ItemList items={candidate.conocimientosList} withDetalle />
        </SectionCard>
        <SectionCard icon={<Wrench className="h-5 w-5" />} title="Manejo de herramientas">
          <ItemList items={candidate.herramientasList} />
        </SectionCard>
      </div>

      {/* Integrity */}
      <SectionCard icon={<ShieldCheck className="h-5 w-5" />} title="Integridad y confiabilidad" sub="Reporte de veracidad">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {integrity.map((it) => (
            <div
              key={it.label}
              className="flex items-center justify-between gap-2 rounded-2xl fill-soft px-3.5 py-2.5 ring-1 ring-[color:var(--hairline)]"
            >
              <span className="text-sm font-semibold text-ink">{it.label}</span>
              <LevelBadge value={it.value} tone={it.tone(it.value)} />
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function ItemList({ items, withDetalle = false }: { items: TechnicalKnowledge[]; withDetalle?: boolean }) {
  if (!items.length) return <Empty text="Sin registros." />;
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <li
          key={i}
          className="rounded-2xl fill-soft px-3 py-2 ring-1 ring-[color:var(--hairline)]"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="wrap-words text-sm font-bold text-ink">{it.nombre}</span>
            {it.nivel && <LevelBadge value={it.nivel} tone={proficiencyTone(it.nivel)} />}
          </div>
          {withDetalle && it.detalle && (
            <p className="mt-0.5 text-xs italic text-ink-faint">{it.detalle}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-[color:var(--hairline)] px-4 py-6 text-center text-sm text-ink-faint">
      {text}
    </p>
  );
}
