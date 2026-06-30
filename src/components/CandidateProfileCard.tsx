import { MapPin, Briefcase, CalendarDays, X } from "lucide-react";
import type { Candidate } from "../types";
import { extractProceso } from "../lib/candidates";
import { Avatar } from "./Avatar";

/**
 * A rich candidate profile card painted with the corporate blue gradient.
 * Used inside the comparator's column headers. Text stays white because it
 * sits on a saturated gradient in both themes. An optional ✕ removes the
 * column straight from the header.
 */
export function CandidateProfileCard({
  candidate,
  onRemove,
}: {
  candidate: Candidate;
  onRemove?: () => void;
}) {
  const proceso = extractProceso(candidate.identificador);
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#004a8f] via-[#005baa] to-[#00b0d8] p-4 shadow-glass ring-1 ring-white/30 print-avoid-break">
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

      <div className="relative flex items-center gap-3 pr-8">
        <Avatar name={candidate.fullName} seed={candidate.id} size="md" />
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-white drop-shadow-md">
            {candidate.fullName}
          </h3>
          <p className="truncate text-xs font-medium text-white/80">
            {candidate.cargo_bdp || "Cargo no especificado"}
          </p>
        </div>
      </div>

      <div className="relative mt-2 truncate text-[0.7rem] font-semibold text-white/75">
        Ref: {candidate.identificador || "Sin identificador"}
      </div>

      <div className="relative mt-2 grid grid-cols-1 gap-1.5 text-xs text-white/90">
        <span className="inline-flex items-center gap-1.5">
          <Briefcase className="h-3.5 w-3.5 shrink-0 opacity-80" />
          Proceso&nbsp;<strong className="font-bold">{proceso}</strong>
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

      {/* Mini score row */}
      <div className="relative mt-3 flex gap-2">
        <ScorePill label="Currículum" value={candidate.nota_curriculum} />
        <ScorePill label="Conoc." value={candidate.nota_conocimiento} />
        <ScorePill label="Comp." value={candidate.nota_competencias} />
      </div>
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
