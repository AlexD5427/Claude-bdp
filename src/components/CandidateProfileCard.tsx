import { MapPin, HeartHandshake, CalendarDays, X, Building2, Trophy, Medal } from "lucide-react";
import type { Candidate } from "../types";
import { Avatar } from "./Avatar";
import { ScrollingText } from "./ScrollingText";
import {
  academicLine,
  bdpRole,
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
 * The card is context-aware:
 *   · the name gently scrolls when it is longer than the visible space;
 *   · under it we render the academic profile ("Licenciatura en …");
 *   · a BDP staff member unfolds a highlighted "Personal BDP" strip with the
 *     current position, while an external applicant keeps the plain layout;
 *   · a ranking medal (1.º / 2.º / 3.º …) sits on the right, and tied CAP
 *     scores get a soft contrasting outline.
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
  const academico = academicLine(candidate.nivel_academico, candidate.carrera);
  const empleadoBdp = worksAtBdp(candidate.trabaja_bdp);
  const cargoBdp = bdpRole(candidate.cargo_bdp);
  const civil = civilStatus(candidate.estado_civil);

  return (
    <div
      className={[
        "relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#004a8f] via-[#005baa] to-[#00b0d8] p-4 shadow-glass ring-1 ring-white/30 print-avoid-break",
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

      <div className={`relative flex items-center gap-3 pr-8 ${tie ? "mt-4" : ""}`}>
        <Avatar name={candidate.fullName} seed={candidate.id} size="md" />
        <div className="min-w-0 flex-1">
          <ScrollingText
            text={candidate.fullName}
            className="text-base font-bold text-white drop-shadow-md"
          />
          {academico ? (
            <p className="truncate text-xs font-medium text-white/85" title={academico}>
              {academico}
            </p>
          ) : (
            <p className="truncate text-xs font-medium text-white/70">
              Formación no especificada
            </p>
          )}
        </div>
      </div>

      {/* Dynamic BDP-employee strip — only for current staff (trabaja_bdp = Sí). */}
      {empleadoBdp && (
        <div className="relative mt-3 flex items-center gap-2.5 rounded-2xl bg-white/15 px-3 py-2 ring-1 ring-white/35 backdrop-blur-sm">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-500 text-[#004a8f] shadow ring-1 ring-white/50">
            <Building2 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="text-[0.7rem] font-black uppercase tracking-wide text-amber-200 drop-shadow">
              Personal BDP
            </div>
            <div className="truncate text-xs font-semibold text-white" title={cargoBdp ?? undefined}>
              {cargoBdp ?? "Cargo interno no especificado"}
            </div>
          </div>
        </div>
      )}

      {/* Info column (left) + ranking medal (right) */}
      <div className="relative mt-3 flex items-stretch gap-2">
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-1.5 text-xs text-white/90">
          <span className="inline-flex items-center gap-1.5">
            <HeartHandshake className="h-3.5 w-3.5 shrink-0 opacity-80" />
            <span className="truncate">{civil ?? "Estado civil N/D"}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0 opacity-80" />
            <span className="truncate">
              {candidate.localidad_residencia ||
                candidate.departamento_residencia ||
                "Sin ubicación"}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 opacity-80" />
            {candidate.edad ? `${candidate.edad} años` : "Edad N/D"}
          </span>
        </div>

        {showRank && rank !== undefined && <RankMedal rank={rank} />}
      </div>

      {/* Mini score row */}
      <div className="relative mt-3 flex gap-2">
        <ScorePill label="Currículum" value={candidate.nota_curriculum} />
        <ScorePill label="Conoc." value={candidate.nota_conocimiento} />
        <ScorePill label="Comp." value={candidate.nota_competencias} />
      </div>

      <div className="relative mt-2 truncate text-[0.65rem] font-semibold text-white/70">
        Ref: {candidate.identificador || "Sin identificador"}
      </div>
    </div>
  );
}

/** A podium medal shown on the right of each column, coloured by position. */
function RankMedal({ rank }: { rank: number }) {
  const podium =
    rank === 1
      ? "from-amber-300 to-amber-500 text-[#4a3200]"
      : rank === 2
        ? "from-slate-100 to-slate-300 text-slate-700"
        : rank === 3
          ? "from-orange-300 to-orange-600 text-white"
          : "from-white/25 to-white/10 text-white";
  const Icon = rank <= 3 ? (rank === 1 ? Trophy : Medal) : undefined;
  return (
    <div
      className={`flex w-[3.4rem] shrink-0 flex-col items-center justify-center gap-1 rounded-2xl bg-gradient-to-br ${podium} px-1 py-2 text-center shadow ring-1 ring-white/40`}
      title={rankLabel(rank)}
      aria-label={rankLabel(rank)}
    >
      {Icon ? <Icon className="h-4 w-4" /> : null}
      <span className="text-sm font-black leading-none">{rank}.º</span>
      <span className="text-[0.55rem] font-bold uppercase leading-none opacity-80">
        lugar
      </span>
    </div>
  );
}

function ScorePill({
  label,
  value,
}: {
  label: string;
  value?: number | string;
}) {
  return (
    <div className="flex-1 rounded-xl bg-white/15 px-2 py-1.5 text-center ring-1 ring-white/25 backdrop-blur-sm">
      <div className="text-sm font-black leading-none text-white drop-shadow-md">
        {value ?? "—"}
      </div>
      <div className="mt-0.5 text-[0.6rem] font-medium uppercase tracking-wide text-white/70">
        {label}
      </div>
    </div>
  );
}
