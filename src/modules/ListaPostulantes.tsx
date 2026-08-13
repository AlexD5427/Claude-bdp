import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, UserPlus, ShieldCheck, ShieldAlert, Printer, Copy, AlertTriangle } from "lucide-react";
import { useTalentData } from "../context/TalentDataContext";
import { Avatar } from "../components/Avatar";
import { CandidateActions } from "../components/CandidateActions";
import { openProfile } from "../lib/profileViewerStore";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { RegistrationForm } from "./RegistrationForm";
import { usePointerGlow } from "../hooks/usePointerGlow";
import { printModule } from "../lib/print";
import { ensureSeen, setStatus, useHiring, HIRING_LABELS, type HiringStatus } from "../lib/hiringStore";
import { extractProceso } from "../lib/candidates";
import { reliabilityTone, type Tone } from "../lib/levels";
import type { Candidate } from "../types";

/** Tinte suave de la píldora de confiabilidad dentro de la ficha. */
const CONFIABILIDAD_TONO: Record<Tone, string> = {
  green: "bg-emerald-500/15 text-emerald-500 ring-emerald-400/30",
  amber: "bg-amber-500/15 text-amber-500 ring-amber-400/40",
  red: "bg-rose-500/15 text-rose-500 ring-rose-400/30",
  muted: "fill-softer text-ink-soft ring-[color:var(--hairline)]",
};

export function ListaPostulantes() {
  const { candidatos, duplicados, loading, error, refetch } = useTalentData();
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);

  // Make sure every visible candidate has a first-seen timestamp recorded.
  useEffect(() => {
    if (candidatos.length) ensureSeen(candidatos.map((c) => c.id));
  }, [candidatos]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidatos;
    return candidatos.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) ||
        (c.identificador ?? "").toLowerCase().includes(q) ||
        (c.cargo_bdp ?? "").toLowerCase().includes(q),
    );
  }, [candidatos, query]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="glass flex min-w-[16rem] flex-1 items-center gap-2 rounded-2xl px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-cyan-400/70">
          <Search className="h-4 w-4 text-ink-soft" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, identificador o cargo…"
            className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => printModule("Lista de Postulantes")}
          className="inline-flex items-center gap-2 rounded-full fill-softer px-4 py-2.5 text-sm font-bold text-ink ring-1 ring-[color:var(--hairline)] transition-all duration-300 hover:fill-soft active:scale-95"
        >
          <Printer className="h-4 w-4" />
          Imprimir
        </button>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-5 py-2.5 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all duration-500 ease-spring hover:-translate-y-1 hover:scale-[1.03] active:scale-95"
        >
          <UserPlus className="h-4 w-4" />
          Nuevo Postulante
        </button>
      </div>

      {duplicados.length > 0 && <DuplicadosAviso identificadores={duplicados} />}

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : candidatos.length === 0 ? (
        // Distinto de «la búsqueda no encontró nada»: aquí no hay base que
        // buscar, y decirlo evita que se interprete como un filtro mal puesto.
        <EmptyState message="Aún no hay postulantes en la base de datos. Use «Nuevo Postulante» para registrar el primero." />
      ) : filtered.length === 0 ? (
        <EmptyState message={`Ningún postulante coincide con «${query.trim()}».`} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c, i) => (
            <CandidateCard key={c.id} candidate={c} index={i} />
          ))}
        </div>
      )}

      <RegistrationForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onSaved={refetch}
      />
    </div>
  );
}

/**
 * Aviso de integridad: identificadores repetidos en la hoja.
 *
 * El identificador es la clave de la fila, y con la clave repetida el sistema no
 * puede distinguir a dos personas: la segunda desaparecía del buscador del
 * Comparador y «Editar» abría siempre a la primera. Ahora cada ficha tiene una
 * clave interna única, pero la hoja sigue necesitando corrección humana, y esto
 * es lo que la pide señalando exactamente qué claves revisar.
 */
function DuplicadosAviso({ identificadores }: { identificadores: string[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      role="alert"
      className="no-print flex flex-wrap items-start gap-3 rounded-2xl bg-rose-500/12 px-4 py-3 ring-1 ring-rose-400/40"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-rose-400/20 text-rose-500">
        <Copy className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-rose-500">
          {identificadores.length === 1
            ? "Hay un identificador repetido en la hoja."
            : `Hay ${identificadores.length} identificadores repetidos en la hoja.`}
        </p>
        <p className="mt-0.5 text-xs text-ink-soft">
          El identificador es la clave de cada ficha: mientras esté duplicado, la edición no
          puede saber a qué fila escribir. Corrija en la hoja:{" "}
          <span className="font-semibold text-ink">{identificadores.join(" · ")}</span>
        </p>
      </div>
    </motion.div>
  );
}

function CandidateCard({
  candidate,
  index,
}: {
  candidate: Candidate;
  index: number;
}) {
  const { onMouseMove } = usePointerGlow();
  // Misma escala semántica que el Comparador (verde / ámbar / rojo). La ficha
  // usaba un sí-o-no, así que «Confiabilidad Media» se pintaba de rojo, igual
  // que «No Confiable»: dos cosas distintas con el mismo color.
  const tonoConfiabilidad = reliabilityTone(candidate.nivel_general_confiabilidad);

  return (
    <motion.div
      onMouseMove={onMouseMove}
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: "spring",
        stiffness: 240,
        damping: 22,
        delay: Math.min(index * 0.04, 0.4),
      }}
      className="glass glow liquid-streak magnetic rounded-3xl p-4 print-avoid-break"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => openProfile(candidate.id)}
          title={`Ver perfil de ${candidate.fullName}`}
          className="group flex min-w-0 flex-1 items-center gap-3 text-left outline-none"
        >
          <Avatar name={candidate.fullName} seed={candidate.id} size="md" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-bold text-ink transition-colors group-hover:text-cyan-400">
              {candidate.fullName}
            </h3>
            <p className="truncate text-xs text-ink-soft">
              {candidate.cargo_bdp || "Cargo no especificado"}
            </p>
          </div>
        </button>
        <CandidateActions id={candidate.id} name={candidate.fullName} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.7rem]">
        <span className="rounded-full fill-softer px-2.5 py-0.5 font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)]">
          Proceso {extractProceso(candidate.identificador)}
        </span>
        <span className="rounded-full fill-softer px-2.5 py-0.5 font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)]">
          {candidate.competenciasList.length} comp.
        </span>
        {candidate.identificadorDuplicado && (
          <span
            title={`El identificador ${candidate.identificador} aparece más de una vez en la hoja.`}
            className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-0.5 font-bold text-rose-500 ring-1 ring-rose-400/40"
          >
            <AlertTriangle className="h-3 w-3" />
            ID duplicado
          </span>
        )}
        <span
          className={[
            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-bold ring-1",
            CONFIABILIDAD_TONO[tonoConfiabilidad],
          ].join(" ")}
        >
          {tonoConfiabilidad === "green" ? (
            <ShieldCheck className="h-3 w-3" />
          ) : (
            <ShieldAlert className="h-3 w-3" />
          )}
          {candidate.nivel_general_confiabilidad || "N/D"}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Currículum" value={candidate.nota_curriculum} />
        <Stat label="Conocim." value={candidate.nota_conocimiento} />
        <Stat label="Compet." value={candidate.nota_competencias} />
      </div>

      <HiringControl id={candidate.id} />
    </motion.div>
  );
}

const STATUS_TONE: Record<HiringStatus, string> = {
  en_proceso: "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white ring-white/40",
  contratado: "bg-gradient-to-br from-emerald-500 to-green-600 text-white ring-white/40",
  baja: "bg-gradient-to-br from-rose-500 to-red-600 text-white ring-white/40",
};

/** Manual hiring-status switch — drives Tiempo de Contratación & Tasa de Rotación. */
function HiringControl({ id }: { id: string }) {
  const hiring = useHiring();
  const current = hiring[id]?.status ?? "en_proceso";
  return (
    <div className="mt-3 no-print">
      <span className="mb-1 block text-[0.6rem] font-semibold uppercase tracking-wide text-ink-faint">
        Estado de contratación
      </span>
      <div className="flex gap-1.5">
        {(Object.keys(HIRING_LABELS) as HiringStatus[]).map((s) => {
          const active = current === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(id, s)}
              className={[
                "flex-1 rounded-full px-2 py-1 text-[0.7rem] font-bold ring-1 transition-all duration-300 active:scale-95",
                active
                  ? STATUS_TONE[s]
                  : "fill-softer text-ink-soft ring-[color:var(--hairline)] hover:fill-soft",
              ].join(" ")}
            >
              {HIRING_LABELS[s]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: number | string }) {
  return (
    <div className="rounded-xl fill-soft px-2 py-1.5 text-center ring-1 ring-[color:var(--hairline)]">
      <div className="text-base font-black leading-none text-ink">
        {value ?? "—"}
      </div>
      <div className="mt-0.5 text-[0.6rem] uppercase tracking-wide text-ink-faint">
        {label}
      </div>
    </div>
  );
}
