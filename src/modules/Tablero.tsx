import { useMemo } from "react";
import { motion } from "framer-motion";
import { Trophy, ShieldCheck, Activity } from "lucide-react";
import { useTalentData } from "../context/TalentDataContext";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { GlassCard } from "../components/GlassCard";
import { Avatar } from "../components/Avatar";
import { parseDecimal } from "../lib/competency";

export function Tablero() {
  const { candidatos, loading, error, refetch } = useTalentData();

  const topCandidates = useMemo(() => {
    return [...candidatos]
      .map((c) => ({ c, nota: parseDecimal(c.nota_competencias) ?? 0 }))
      .sort((x, y) => y.nota - x.nota)
      .slice(0, 5);
  }, [candidatos]);

  const confiabilidad = useMemo(() => {
    let confiable = 0;
    let noConfiable = 0;
    for (const c of candidatos) {
      const v = (c.nivel_general_confiabilidad ?? "").toLowerCase();
      if (v.includes("no confiable")) noConfiable++;
      else if (v.includes("confiable")) confiable++;
    }
    return { confiable, noConfiable };
  }, [candidatos]);

  const riesgo = useMemo(() => {
    const counts = { Bajo: 0, Medio: 0, Alto: 0 } as Record<string, number>;
    for (const c of candidatos) {
      const v = c.riesgo_robo ?? "";
      if (v in counts) counts[v]++;
    }
    return counts;
  }, [candidatos]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (candidatos.length === 0) {
    return <EmptyState message="Aún no hay postulantes registrados." />;
  }

  const totalConf = confiabilidad.confiable + confiabilidad.noConfiable || 1;
  const totalRiesgo = riesgo.Bajo + riesgo.Medio + riesgo.Alto || 1;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Top candidates */}
      <GlassCard
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
        className="rounded-3xl p-5 lg:col-span-2"
      >
        <div className="mb-4 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-300" />
          <h3 className="text-base font-bold text-ink">
            Top postulantes por competencias
          </h3>
        </div>
        <ul className="space-y-3">
          {topCandidates.map(({ c, nota }, idx) => (
            <li key={c.id} className="flex items-center gap-3">
              <span className="w-5 shrink-0 text-center text-sm font-black text-ink-faint">
                {idx + 1}
              </span>
              <Avatar name={c.fullName} seed={c.id} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-ink">
                    {c.fullName}
                  </span>
                  <span className="shrink-0 text-sm font-black text-cyan-300">
                    {nota}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full fill-soft">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(nota, 100)}%` }}
                    transition={{ type: "spring", stiffness: 120, damping: 20 }}
                    className="h-full rounded-full bg-gradient-to-r from-[#005baa] to-[#00b0d8]"
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </GlassCard>

      {/* Right column — confiabilidad + riesgo */}
      <div className="space-y-4">
        <GlassCard
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 22, delay: 0.05 }}
          className="rounded-3xl p-5"
        >
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-300" />
            <h3 className="text-base font-bold text-ink">
              Confiabilidad
            </h3>
          </div>
          <Bar
            label="Confiable"
            value={confiabilidad.confiable}
            pct={(confiabilidad.confiable / totalConf) * 100}
            tone="bg-gradient-to-r from-emerald-500 to-green-600"
          />
          <Bar
            label="No Confiable"
            value={confiabilidad.noConfiable}
            pct={(confiabilidad.noConfiable / totalConf) * 100}
            tone="bg-gradient-to-r from-rose-500 to-red-600"
          />
        </GlassCard>

        <GlassCard
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 22, delay: 0.1 }}
          className="rounded-3xl p-5"
        >
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-5 w-5 text-cyan-300" />
            <h3 className="text-base font-bold text-ink">
              Riesgo de robo
            </h3>
          </div>
          <Bar label="Bajo" value={riesgo.Bajo} pct={(riesgo.Bajo / totalRiesgo) * 100} tone="bg-gradient-to-r from-emerald-500 to-green-600" />
          <Bar label="Medio" value={riesgo.Medio} pct={(riesgo.Medio / totalRiesgo) * 100} tone="bg-gradient-to-r from-amber-400 to-yellow-500" />
          <Bar label="Alto" value={riesgo.Alto} pct={(riesgo.Alto / totalRiesgo) * 100} tone="bg-gradient-to-r from-rose-500 to-red-600" />
        </GlassCard>
      </div>
    </div>
  );
}

function Bar({
  label,
  value,
  pct,
  tone,
}: {
  label: string;
  value: number;
  pct: number;
  tone: string;
}) {
  return (
    <div className="mb-2.5 last:mb-0">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-semibold text-ink-soft">{label}</span>
        <span className="font-black text-ink">{value}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full fill-soft">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
          className={`h-full rounded-full ${tone}`}
        />
      </div>
    </div>
  );
}
