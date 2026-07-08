import {
  CalendarDays,
  Fingerprint,
  Flag,
  GraduationCap,
  HeartHandshake,
  IdCard,
  MapPin,
  Workflow,
} from "lucide-react";
import type { Candidate } from "../../types";
import { academicLine, bdpRole, worksAtBdp } from "../../lib/candidateDisplay";
import { extractProceso } from "../../lib/candidates";
import { discAccent } from "../../lib/discAccent";
import { extractDiscCode } from "../../lib/disc";
import { DiscInfoButton } from "../DiscInfoButton";
import { InfoRow, SectionCard } from "./parts";

/** The "Resumen" tab — the person's identity, residency, DISC and observations. */
export function ResumenTab({ candidate: c }: { candidate: Candidate }) {
  const academico = academicLine(c.nivel_academico, c.carrera);
  const disc = String(c.perfil_disc || "").trim();
  const hasDisc = disc && disc.toUpperCase() !== "N/A";
  const accent = discAccent(extractDiscCode(disc));
  const observaciones = String(c.observaciones || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  return (
    <div className="space-y-4">
      <SectionCard icon={<IdCard className="h-5 w-5" />} title="Datos personales" sub="Identidad y residencia">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <InfoRow icon={<Fingerprint className="h-4 w-4" />} label="Identificador" value={c.identificador} />
          <InfoRow icon={<CalendarDays className="h-4 w-4" />} label="Edad" value={c.edad ? `${c.edad} años` : "N/D"} />
          <InfoRow icon={<HeartHandshake className="h-4 w-4" />} label="Estado civil" value={c.estado_civil} />
          <InfoRow
            icon={<MapPin className="h-4 w-4" />}
            label="Residencia"
            value={[c.localidad_residencia, c.departamento_residencia].filter(Boolean).join(", ")}
          />
          <InfoRow icon={<GraduationCap className="h-4 w-4" />} label="Formación" value={academico ?? "N/D"} />
          <InfoRow icon={<Workflow className="h-4 w-4" />} label="Proceso" value={extractProceso(c.identificador)} />
        </div>

        {worksAtBdp(c.trabaja_bdp) && (
          <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-gradient-to-br from-amber-400/15 to-orange-500/10 px-3.5 py-2.5 ring-1 ring-amber-400/30">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-500 text-[#4a3200]">
              <IdCard className="h-4 w-4" />
            </span>
            <div>
              <div className="text-[0.65rem] font-black uppercase tracking-wide text-amber-500">Personal BDP</div>
              <div className="text-sm font-semibold text-ink">{bdpRole(c.cargo_bdp) ?? "Cargo interno no especificado"}</div>
            </div>
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Arquetipo DISC" sub="Estilo de comportamiento">
          {hasDisc ? (
            <div className="flex items-center gap-3">
              <span
                className={`grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br ${accent.gradient} text-2xl font-black text-white shadow-glass ring-1 ring-white/30`}
              >
                {extractDiscCode(disc) || "?"}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="wrap-words text-sm font-bold text-ink">{disc}</span>
                  <DiscInfoButton perfil={disc} size="sm" />
                </div>
                <p className="text-xs text-ink-soft">Pulse el ícono para ver el significado del arquetipo.</p>
              </div>
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-[color:var(--hairline)] px-4 py-6 text-center text-sm text-ink-faint">
              Arquetipo DISC no registrado.
            </p>
          )}
        </SectionCard>

        <SectionCard icon={<Flag className="h-5 w-5" />} title="Observaciones" sub="Banderas y anotaciones">
          {observaciones.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[color:var(--hairline)] px-4 py-6 text-center text-sm text-ink-faint">
              Sin observaciones registradas.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {observaciones.map((t, i) => (
                <span
                  key={i}
                  className="rounded-full fill-softer px-2.5 py-1 text-xs font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)]"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
