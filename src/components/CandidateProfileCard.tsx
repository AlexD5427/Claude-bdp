import { motion } from "framer-motion";
import { MapPin, HeartHandshake, CalendarDays, X, Building2, UserPlus } from "lucide-react";
import type { Candidate } from "../types";
import {
  academicParts,
  bdpRole,
  capScore,
  civilStatus,
  upperName,
  worksAtBdp,
} from "../lib/candidateDisplay";
import { openProfile } from "../lib/profileViewerStore";
import { CandidateActions } from "./CandidateActions";
import { RankBadge } from "./RankBadge";

/**
 * A rich candidate profile card painted with the corporate blue gradient.
 * Used inside the comparator's column headers and the "Cara a Cara" duel.
 *
 *   · The name owns the header (no avatar), **always in UPPERCASE** so every
 *     column reads uniformly, and it doubles as a button that opens the full
 *     profile panel.
 *   · Under it we render the academic profile ("Licenciatura en …").
 *   · A BDP staff member unfolds a gold "Personal BDP" strip with their current
 *     position; an external applicant gets a matching cyan "Candidato nuevo"
 *     strip instead.
 *   · A CAP-ranking badge can sit at the bottom-right — a spectacular gold
 *     plate for 1st place and a silver plate for everyone else.
 *   · A discreet actions cluster (Ver perfil · Editar) is always available.
 */
export function CandidateProfileCard({
  candidate,
  onRemove,
  rank,
  showRankBadge = true,
}: {
  candidate: Candidate;
  onRemove?: () => void;
  /** 1-based position in the CAP ranking. */
  rank?: number;
  /** Whether to paint the ranking badge on this card. */
  showRankBadge?: boolean;
}) {
  const academico = academicParts(candidate.nivel_academico, candidate.carrera);
  const empleadoBdp = worksAtBdp(candidate.trabaja_bdp);
  const cargoBdp = bdpRole(candidate.cargo_bdp);
  const civil = civilStatus(candidate.estado_civil);
  const cap = capScore(candidate);
  const showBadge = showRankBadge && rank !== undefined;

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-3xl bg-gradient-to-br from-[#004a8f] via-[#005baa] to-[#00b0d8] p-4 shadow-glass ring-1 ring-white/30 print-avoid-break">
      {/* Specular highlight */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />

      {/* Actions (top-left) + remove (top-right) */}
      <div className="absolute left-2.5 top-2.5 z-10">
        <CandidateActions
          id={candidate.id}
          name={candidate.fullName}
          variant="onGradient"
        />
      </div>
      {onRemove && (
        <button
          type="button"
          aria-label={`Quitar ${candidate.fullName}`}
          onClick={onRemove}
          className="no-print absolute right-2.5 top-2.5 z-10 grid h-7 w-7 place-items-center rounded-full bg-white/20 text-white ring-1 ring-white/30 transition-all duration-300 hover:bg-rose-500/80 active:scale-90"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {/* Header — name owns the space (no avatar), always UPPERCASE, and opens
          the full profile on click. Wraps by word so it always shows in full. */}
      <div className="relative mt-9 pr-1">
        <button
          type="button"
          onClick={() => openProfile(candidate.id)}
          title={`Ver perfil completo de ${candidate.fullName}`}
          className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded-lg"
        >
          <h3 className="wrap-words text-lg font-black uppercase leading-tight tracking-tight text-white drop-shadow-md transition-colors hover:text-cyan-100">
            {upperName(candidate.fullName)}
          </h3>
        </button>
        {academico ? (
          <div className="mt-0.5 leading-snug">
            <p className="wrap-words text-xs font-medium text-white/85">{academico.top}</p>
            {academico.bottom && (
              <p className="wrap-words text-sm font-semibold text-white">{academico.bottom}</p>
            )}
          </div>
        ) : (
          <p className="mt-0.5 text-xs font-medium text-white/70">Formación no especificada</p>
        )}
      </div>

      {/* Employment strip — gold for BDP staff, cyan for external candidates. */}
      {empleadoBdp ? (
        <div className="relative mt-3 flex items-center gap-2.5 rounded-2xl bg-white/15 px-3 py-2 ring-1 ring-white/35 backdrop-blur-sm">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-500 text-[#004a8f] shadow ring-1 ring-white/50">
            <Building2 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="text-[0.7rem] font-black uppercase tracking-wide text-amber-200 drop-shadow">
              Personal BDP
            </div>
            <div className="wrap-words text-xs font-semibold text-white">
              {cargoBdp ?? "Cargo interno no especificado"}
            </div>
          </div>
        </div>
      ) : (
        <div className="relative mt-3 flex items-center gap-2.5 rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-cyan-200/40 backdrop-blur-sm">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-cyan-200 to-cyan-400 text-[#004a8f] shadow ring-1 ring-white/50">
            <UserPlus className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="text-[0.7rem] font-black uppercase tracking-wide text-cyan-100 drop-shadow">
              Candidato nuevo
            </div>
            <div className="wrap-words text-xs font-semibold text-white">Postulante Externo</div>
          </div>
        </div>
      )}

      {/* Info column (left) + CAP ranking badge (bottom-right) */}
      <div className="relative mt-3 flex items-end gap-2">
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-1.5 text-xs text-white/90">
          <span className="flex items-start gap-1.5">
            <HeartHandshake className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-80" />
            <span className="wrap-words">{civil ?? "Estado civil N/D"}</span>
          </span>
          <span className="flex items-start gap-1.5">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-80" />
            <span className="wrap-words">
              {candidate.localidad_residencia ||
                candidate.departamento_residencia ||
                "Sin ubicación"}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 opacity-80" />
            {candidate.edad ? `${candidate.edad} años` : "Edad N/D"}
          </span>
        </div>

        {showBadge && (
          <motion.div
            initial={{ opacity: 0, scale: 0.7, rotate: -8 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 18 }}
          >
            <RankBadge rank={rank} cap={cap} />
          </motion.div>
        )}
      </div>

      <div className="relative mt-auto pt-3 text-[0.65rem] font-semibold text-white/70">
        <span className="wrap-words">Ref: {candidate.identificador || "Sin identificador"}</span>
      </div>
    </div>
  );
}
