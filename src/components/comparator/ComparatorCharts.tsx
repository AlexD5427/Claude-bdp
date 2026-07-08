import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  BarChartHorizontal,
  LineChart as LineChartIcon,
  Radar,
  PieChart,
  Table2,
  Sparkles,
} from "lucide-react";
import { Avatar } from "../Avatar";
import {
  GroupedBarChart,
  HorizontalBars,
  LineChart,
  RadarChart,
  DonutChart,
  SERIES_PALETTE,
  type Series,
} from "../charts";
import { parseDecimal } from "../../lib/competency";
import type { Candidate } from "../../types";

/**
 * Interactive analytics for the comparator. The operator picks *which*
 * candidates and *which* metrics to plot, and the panel renders an animated,
 * dependency-free chart (grouped bars, horizontal bars, a line comparison, a
 * radial radar or a donut) plus a live data table — all built from the
 * candidates already in the comparison.
 */

type ChartType = "barras" | "barrasH" | "linea" | "radar" | "dona";

interface Metric {
  id: string;
  label: string;
  group: string;
  get: (c: Candidate) => number | null;
}

const BASE_METRICS: Metric[] = [
  { id: "cap", label: "Nota CAP", group: "Notas", get: (c) => parseDecimal(c.nota_cap as never) },
  { id: "curriculum", label: "Currículum", group: "Notas", get: (c) => parseDecimal(c.nota_curriculum as never) },
  { id: "conocimiento", label: "Conocimientos", group: "Notas", get: (c) => parseDecimal(c.nota_conocimiento as never) },
  { id: "competencias", label: "Competencias", group: "Notas", get: (c) => parseDecimal(c.nota_competencias as never) },
];

const CHART_TYPES: { id: ChartType; label: string; icon: typeof BarChart3 }[] = [
  { id: "barras", label: "Barras", icon: BarChart3 },
  { id: "barrasH", label: "Barras H.", icon: BarChartHorizontal },
  { id: "linea", label: "Líneas", icon: LineChartIcon },
  { id: "radar", label: "Radar", icon: Radar },
  { id: "dona", label: "Dona", icon: PieChart },
];

export function ComparatorCharts({ candidates }: { candidates: Candidate[] }) {
  // Competency-fit metrics, unioned across every candidate in the comparison.
  const metrics = useMemo<Metric[]>(() => {
    const seen = new Set<string>();
    const compMetrics: Metric[] = [];
    for (const c of candidates) {
      for (const comp of c.competenciasList) {
        const key = comp.name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        compMetrics.push({
          id: `comp:${key}`,
          label: comp.name,
          group: "Competencias (ajuste %)",
          get: (cand) =>
            cand.competenciasList.find((s) => s.name.toLowerCase() === key)?.ajuste ?? null,
        });
      }
    }
    return [...BASE_METRICS, ...compMetrics];
  }, [candidates]);

  const [pickedCandidateIds, setPickedCandidateIds] = useState<string[] | null>(null);
  const [pickedMetricIds, setPickedMetricIds] = useState<string[] | null>(null);
  const [chartType, setChartType] = useState<ChartType>("barras");

  // Default selections track the comparison until the operator overrides them.
  const activeCandidateIds = pickedCandidateIds ?? candidates.map((c) => c.id);
  const activeMetricIds = pickedMetricIds ?? BASE_METRICS.map((m) => m.id);

  const pickedCandidates = candidates.filter((c) => activeCandidateIds.includes(c.id));
  const pickedMetrics = metrics.filter((m) => activeMetricIds.includes(m.id));

  // Stable, high-contrast colour per candidate (by position in the comparison).
  const colorFor = (id: string) =>
    SERIES_PALETTE[Math.max(0, candidates.findIndex((c) => c.id === id)) % SERIES_PALETTE.length];

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  const series: Series[] = pickedCandidates.map((c) => ({
    label: c.fullName,
    color: colorFor(c.id),
    values: pickedMetrics.map((m) => m.get(c) ?? 0),
  }));

  const canPlot = pickedCandidates.length > 0 && pickedMetrics.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 26 }}
      className="space-y-4"
    >
      {/* ── Controls ─────────────────────────────────────────── */}
      <div className="glass rounded-3xl p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-cyan-400" />
          <h3 className="text-sm font-bold text-ink">Generador de gráficos</h3>
          <span className="ml-auto text-xs text-ink-soft">
            {pickedCandidates.length} candidato(s) · {pickedMetrics.length} métrica(s)
          </span>
        </div>

        {/* Candidates */}
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">
          Postulantes
        </p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {candidates.map((c) => {
            const on = activeCandidateIds.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() =>
                  setPickedCandidateIds(toggle(activeCandidateIds, c.id))
                }
                className={[
                  "inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-xs font-semibold ring-1 transition-all active:scale-95",
                  on
                    ? "text-white ring-white/40 shadow-glow-cyan"
                    : "fill-softer text-ink-soft ring-[color:var(--hairline)] hover:fill-soft",
                ].join(" ")}
                style={on ? { background: colorFor(c.id) } : undefined}
              >
                <Avatar name={c.fullName} seed={c.id} size="sm" />
                <span className="max-w-[10rem] truncate">{c.fullName}</span>
              </button>
            );
          })}
        </div>

        {/* Metrics */}
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">
          Datos a graficar
        </p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {metrics.map((m) => {
            const on = activeMetricIds.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setPickedMetricIds(toggle(activeMetricIds, m.id))}
                title={m.group}
                className={[
                  "rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-all active:scale-95",
                  on
                    ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white ring-white/40 shadow-glow-cyan"
                    : "fill-softer text-ink-soft ring-[color:var(--hairline)] hover:fill-soft",
                ].join(" ")}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Chart type */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Tipo de gráfico
          </span>
          <div className="glass flex items-center gap-1 rounded-full p-1 text-xs font-semibold text-ink-soft">
            {CHART_TYPES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setChartType(id)}
                className={[
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-all",
                  chartType === id
                    ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white shadow-glow-cyan"
                    : "hover:fill-soft",
                ].join(" ")}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Chart ────────────────────────────────────────────── */}
      <div className="glass glow rounded-3xl p-4 sm:p-5 print-avoid-break">
        {!canPlot ? (
          <p className="rounded-2xl border border-dashed border-[color:var(--hairline)] px-4 py-10 text-center text-sm text-ink-faint">
            Seleccione al menos un postulante y una métrica para generar el gráfico.
          </p>
        ) : chartType === "barras" ? (
          <GroupedBarChart
            categories={pickedMetrics.map((m) => m.label)}
            series={series}
            height={280}
          />
        ) : chartType === "barrasH" ? (
          <HorizontalBars categories={pickedMetrics.map((m) => m.label)} series={series} />
        ) : chartType === "linea" ? (
          <LineChart categories={pickedMetrics.map((m) => m.label)} series={series} height={300} />
        ) : chartType === "radar" ? (
          <RadarChart axes={pickedMetrics.map((m) => m.label)} series={series} size={340} />
        ) : (
          <DonutChart
            data={pickedCandidates.map((c) => ({
              label: c.fullName,
              value: Math.max(0, pickedMetrics[0].get(c) ?? 0),
              color: colorFor(c.id),
            }))}
            centerLabel={pickedMetrics[0].label}
            size={200}
          />
        )}
        {chartType === "dona" && pickedMetrics.length > 1 && (
          <p className="mt-2 text-center text-[0.7rem] text-ink-faint">
            La dona compara una métrica; mostrando “{pickedMetrics[0].label}”.
          </p>
        )}
      </div>

      {/* ── Data table ───────────────────────────────────────── */}
      {canPlot && (
        <div className="glass rounded-3xl p-4 sm:p-5 print-avoid-break">
          <div className="mb-3 flex items-center gap-2">
            <Table2 className="h-5 w-5 text-cyan-400" />
            <h3 className="text-sm font-bold text-ink">Tabla de datos</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-[color:var(--glass-bg-heavy)] px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-ink-soft backdrop-blur">
                    Postulante
                  </th>
                  {pickedMetrics.map((m) => (
                    <th key={m.id} className="px-3 py-2 text-right text-xs font-bold uppercase tracking-wide text-ink-soft">
                      {m.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pickedCandidates.map((c) => (
                  <tr key={c.id} className="border-t border-[color:var(--hairline)]">
                    <td className="sticky left-0 z-10 bg-[color:var(--glass-bg-heavy)] px-3 py-2 backdrop-blur">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorFor(c.id) }} />
                        <span className="truncate font-semibold text-ink">{c.fullName}</span>
                      </span>
                    </td>
                    {pickedMetrics.map((m) => {
                      const v = m.get(c);
                      return (
                        <td key={m.id} className="px-3 py-2 text-right font-bold text-ink">
                          {v === null ? <span className="text-ink-faint">—</span> : v}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </motion.div>
  );
}
