import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, UserPlus, ArrowLeft, ShieldCheck, ShieldAlert } from "lucide-react";
import { useTalentData } from "../context/TalentDataContext";
import { Avatar } from "../components/Avatar";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { RegistrationForm } from "./RegistrationForm";
import { extractProceso } from "../lib/candidates";
import type { Candidate } from "../types";

export function ListaPostulantes() {
  const { candidatos, loading, error, refetch } = useTalentData();
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);

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

  if (showForm) {
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => setShowForm(false)}
          className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-slate-100 ring-1 ring-white/20 transition-all duration-300 hover:bg-white/15 active:scale-95"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a la lista
        </button>
        <RegistrationForm onSaved={() => setShowForm(false)} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="glass flex min-w-[16rem] flex-1 items-center gap-2 rounded-2xl px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-cyan-300/70">
          <Search className="h-4 w-4 text-slate-300" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, identificador o cargo…"
            className="w-full bg-transparent text-sm text-white placeholder:text-slate-400 outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-5 py-2.5 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all duration-500 ease-spring hover:-translate-y-1 hover:scale-[1.03] active:scale-95"
        >
          <UserPlus className="h-4 w-4" />
          Nuevo Postulante
        </button>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : filtered.length === 0 ? (
        <EmptyState message="No hay postulantes que coincidan con la búsqueda." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c, i) => (
            <CandidateCard key={c.id} candidate={c} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function CandidateCard({
  candidate,
  index,
}: {
  candidate: Candidate;
  index: number;
}) {
  const confiable = (candidate.nivel_general_confiabilidad ?? "")
    .toLowerCase()
    .includes("confiable")
    && !(candidate.nivel_general_confiabilidad ?? "")
      .toLowerCase()
      .includes("no confiable");

  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: "spring",
        stiffness: 240,
        damping: 22,
        delay: Math.min(index * 0.04, 0.4),
      }}
      className="glass liquid-streak magnetic rounded-3xl p-4"
    >
      <div className="flex items-center gap-3">
        <Avatar name={candidate.fullName} seed={candidate.id} size="md" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold text-white drop-shadow-md">
            {candidate.fullName}
          </h3>
          <p className="truncate text-xs text-slate-200/70">
            {candidate.cargo_bdp || "Cargo no especificado"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.7rem]">
        <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-semibold text-slate-100 ring-1 ring-white/15">
          Proceso {extractProceso(candidate.identificador)}
        </span>
        <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-semibold text-slate-100 ring-1 ring-white/15">
          {candidate.competenciasList.length} comp.
        </span>
        <span
          className={[
            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-bold ring-1",
            confiable
              ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30"
              : "bg-rose-500/15 text-rose-200 ring-rose-400/30",
          ].join(" ")}
        >
          {confiable ? (
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
    </motion.div>
  );
}

function Stat({ label, value }: { label: string; value?: number | string }) {
  return (
    <div className="rounded-xl bg-white/5 px-2 py-1.5 text-center ring-1 ring-white/10">
      <div className="text-base font-black leading-none text-white drop-shadow-md">
        {value ?? "—"}
      </div>
      <div className="mt-0.5 text-[0.6rem] uppercase tracking-wide text-slate-300/70">
        {label}
      </div>
    </div>
  );
}
