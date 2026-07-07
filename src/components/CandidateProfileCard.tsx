import { MapPin, HeartHandshake, CalendarDays, X, Building2, UserPlus, Trophy, Medal } from "lucide-react";
import type { Candidate } from "../types";
import {
  academicParts,
  bdpRole,
  capScore,
  civilStatus,
  rankLabel,
  worksAtBdp,
} from "../lib/candidateDisplay";

/**
 * A rich candidate profile card painted with the corporate blue gradient.
 * Used inside the comparator's column headers. Text stays white because it
 * sits on a saturated gradient in both themes. An optional ✕ removes the
 * column straight from the header.
 *
 * The card is context-aware and fully fluid:
 *   · the initials avatar is gone — the name now owns the header and **wraps by
 *     word** so it is always shown in full, at any column width, without a
 *     marquee or letter-level clipping;
 *   · under it we render the academic profile ("Licenciatura en …");
 *   · a BDP staff member unfolds a gold "Personal BDP" strip with their current
 *     position; an external applicant gets a matching cyan "Candidato nuevo"
 *     strip instead, so the card never has an empty gap;
 *   · a CAP-ranking badge sits at the bottom-right — a special gold trophy for
 *     the highest Nota CAP (1st place) and a silver plate for everyone else —
 *     and tied CAP scores get a soft contrasting outline.
 */
export function CandidateProfileCard({
  candidate,
  onRemove,
  rank,
  tie = false,
  showRank = true,
}: {
  candidate: Candidate;
  onRemove?: () => void;
  /** 1-based position in the CAP ranking. */
  rank?: number;
  /** Whether this candidate ties on Nota CAP with a neighbour. */
  tie?: boolean;
  showRank?: boolean;
}) {
  const academico = academicParts(candidate.nivel_academico, candidate.carrera);
  const empleadoBdp = worksAtBdp(candidate.trabaja_bdp);
  const cargoBdp = bdpRole(candidate.cargo_bdp);
  const civil = civilStatus(candidate.estado_civil);
  const cap = capScore(candidate);

  return (
    <div
      className={[
        "relative flex h-full flex-col overflow-hidden rounded-3xl bg-gradient-to-br from-[#004a8f] via-[#005baa] to-[#00b0d8] p-4 shadow-glass ring-1 ring-white/30 print-avoid-break",
        tie ? "cmp-tie" : "",
      ].join(" ")}
    >
      {/* Specular highlight */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />

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

      {tie && (
        <span className="absolute left-3 top-2.5 z-10 rounded-full bg-white/20 px-2 py-0.5 text-[0.6rem] font-black uppercase tracking-wide text-white ring-1 ring-white/40 backdrop-blur-sm">
          Empate CAP
        </span>
      )}

      {/* Header — name owns the space now (no avatar). Wraps by word so the
          full name always shows, at any width. */}
      <div className={`relative pr-8 ${tie ? "mt-4" : ""}`}>
        <h3 className="wrap-words text-lg font-black leading-tight text-white drop-shadow-md">
          {candidate.fullName}
        </h3>
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

        {showRank && rank !== undefined && <CapRankBadge rank={rank} cap={cap} />}
      </div>

      <div className="relative mt-auto pt-3 text-[0.65rem] font-semibold text-white/70">
        <span className="wrap-words">Ref: {candidate.identificador || "Sin identificador"}</span>
      </div>
    </div>
  );
}

/**
 * The CAP-ranking badge shown at the bottom-right of each column. The highest
 * Nota CAP (1st place) gets a special gold trophy plate; every other position
 * gets a silver plate. The Nota CAP value rides along inside the badge.
 */
function CapRankBadge({ rank, cap }: { rank: number; cap: number | null }) {
  const first = rank === 1;
  const shell = first
    ? "from-amber-200 via-amber-300 to-amber-500 text-[#4a3200] ring-amber-100/80 shadow-[0_0_20px_rgba(251,191,36,0.65)]"
    : "from-slate-50 via-slate-200 to-slate-400 text-slate-700 ring-white/80 shadow-[0_3px_12px_rgba(148,163,184,0.55)]";
  const Icon = first ? Trophy : Medal;
  return (
    <div
      className={`flex w-[3.6rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl bg-gradient-to-br ${shell} px-1.5 py-2 text-center ring-1`}
      title={`${rankLabel(rank)}${cap !== null ? ` · Nota CAP ${cap}%` : ""}`}
      aria-label={`${rankLabel(rank)}${cap !== null ? `, Nota CAP ${cap} por ciento` : ""}`}
    >
      <Icon className="h-4 w-4" />
      <span className="text-sm font-black leading-none">{rank}.º</span>
      <span className="text-[0.5rem] font-bold uppercase leading-none opacity-80">lugar</span>
      {cap !== null && (
        <span className="mt-0.5 rounded-full bg-black/15 px-1.5 py-0.5 text-[0.6rem] font-black leading-none">
          CAP {cap}%
        </span>
      )}
    </div>
  );
}
