import { motion } from "framer-motion";
import { Briefcase, Building2, GraduationCap, Sparkles, UserPlus } from "lucide-react";
import type { Candidate } from "../../types";
import { NIVEL_ACADEMICO_OPTIONS } from "../../constants";
import { bdpRole, worksAtBdp } from "../../lib/candidateDisplay";
import { asText } from "../../lib/candidates";
import { SectionCard } from "./parts";

/**
 * The "Trayectoria" tab — academic and work history, shown visually. The base
 * carries the candidate's academic level + career and their current BDP link;
 * this renders them as a progression ladder and employment cards, and is built
 * to absorb richer history (previous employers, degrees) as it gets wired in.
 */
export function TrayectoriaTab({ candidate: c }: { candidate: Candidate }) {
  const nivel = asText(c.nivel_academico);
  const nivelIdx = NIVEL_ACADEMICO_OPTIONS.findIndex(
    (n) => n.toLowerCase() === nivel.toLowerCase(),
  );
  const empleadoBdp = worksAtBdp(c.trabaja_bdp);

  return (
    <div className="space-y-4">
      {/* Academic ladder */}
      <SectionCard
        icon={<GraduationCap className="h-5 w-5" />}
        title="Historial académico"
        sub={c.carrera ? asText(c.carrera) : "Formación del postulante"}
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {NIVEL_ACADEMICO_OPTIONS.map((lvl, i) => {
            const reached = nivelIdx >= 0 && i <= nivelIdx;
            const current = i === nivelIdx;
            return (
              <motion.div
                key={lvl}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, type: "spring", stiffness: 240, damping: 22 }}
                className={[
                  "flex items-center gap-2.5 rounded-2xl px-3 py-2.5 ring-1 transition-colors",
                  current
                    ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white ring-white/30 shadow-glow-cyan"
                    : reached
                      ? "fill-softer text-ink ring-[color:var(--hairline)]"
                      : "fill-soft text-ink-faint ring-[color:var(--hairline)] opacity-60",
                ].join(" ")}
              >
                <span
                  className={[
                    "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black ring-1",
                    current ? "bg-white/20 text-white ring-white/40" : "fill-soft text-ink-soft ring-[color:var(--hairline)]",
                  ].join(" ")}
                >
                  {i + 1}
                </span>
                <span className="wrap-words text-sm font-semibold">{lvl}</span>
              </motion.div>
            );
          })}
        </div>
        {nivelIdx < 0 && (
          <p className="mt-3 text-center text-xs text-ink-faint">Nivel académico no especificado.</p>
        )}
      </SectionCard>

      {/* Employment */}
      <SectionCard icon={<Briefcase className="h-5 w-5" />} title="Vínculo laboral" sub="Situación registrada">
        {empleadoBdp ? (
          <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-amber-400/15 to-orange-500/10 p-4 ring-1 ring-amber-400/30">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-amber-500 text-[#4a3200] shadow ring-1 ring-white/50">
              <Building2 className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <div className="text-[0.65rem] font-black uppercase tracking-wide text-amber-500">Personal BDP · actual</div>
              <div className="wrap-words text-base font-bold text-ink">
                {bdpRole(c.cargo_bdp) ?? "Cargo interno no especificado"}
              </div>
              <p className="text-xs text-ink-soft">Banco de Desarrollo Productivo</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl fill-soft p-4 ring-1 ring-[color:var(--hairline)]">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white shadow ring-1 ring-white/30">
              <UserPlus className="h-6 w-6" />
            </span>
            <div>
              <div className="text-[0.65rem] font-black uppercase tracking-wide text-cyan-400">Candidato externo</div>
              <div className="text-base font-bold text-ink">Postulante sin vínculo BDP</div>
            </div>
          </div>
        )}

        <p className="mt-3 flex items-center gap-1.5 rounded-2xl border border-dashed border-[color:var(--hairline)] px-3 py-2.5 text-xs text-ink-faint">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
          El historial laboral y académico detallado se enriquecerá a medida que se
          enlacen más fuentes de datos a este perfil.
        </p>
      </SectionCard>
    </div>
  );
}
