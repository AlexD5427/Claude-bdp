import { useMemo } from "react";
import { motion } from "framer-motion";
import { Workflow, Users } from "lucide-react";
import { useTalentData } from "../context/TalentDataContext";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { Avatar } from "../components/Avatar";
import { groupByProceso } from "../lib/candidates";

/**
 * "Procesos" — candidates grouped by their recruitment process (the middle
 * segment of the identificador). Each process is a Liquid Glass panel.
 */
export function Procesos() {
  const { candidatos, loading, error, refetch } = useTalentData();
  const grupos = useMemo(() => groupByProceso(candidatos), [candidatos]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (grupos.length === 0) {
    return <EmptyState message="No hay procesos para mostrar." />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {grupos.map((g, i) => (
        <motion.div
          key={g.proceso}
          initial={{ opacity: 0, y: 18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{
            type: "spring",
            stiffness: 240,
            damping: 22,
            delay: Math.min(i * 0.05, 0.4),
          }}
          className="glass liquid-streak rounded-3xl p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-[#005baa] to-[#004a8f] shadow-glass ring-1 ring-white/30">
                <Workflow className="h-5 w-5 text-white drop-shadow-md" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white drop-shadow-md">
                  Proceso {g.proceso}
                </h3>
                <p className="inline-flex items-center gap-1 text-xs text-slate-200/70">
                  <Users className="h-3.5 w-3.5" />
                  {g.candidatos.length} postulante
                  {g.candidatos.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            {g.avgCompetencias !== null && (
              <div className="rounded-2xl bg-white/10 px-3 py-1.5 text-center ring-1 ring-white/20">
                <div className="text-lg font-black leading-none text-white drop-shadow-md">
                  {g.avgCompetencias}
                </div>
                <div className="text-[0.6rem] uppercase tracking-wide text-slate-300/70">
                  Prom. comp.
                </div>
              </div>
            )}
          </div>

          <ul className="mt-4 space-y-2">
            {g.candidatos.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-2 ring-1 ring-white/10"
              >
                <Avatar name={c.fullName} seed={c.id} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                  {c.fullName}
                </span>
                <span className="shrink-0 text-xs text-slate-300">
                  {c.cargo_bdp || "—"}
                </span>
              </li>
            ))}
          </ul>
        </motion.div>
      ))}
    </div>
  );
}
