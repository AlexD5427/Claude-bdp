import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Swords } from "lucide-react";
import { useTalentData } from "../context/TalentDataContext";
import { LoadingState, ErrorState, EmptyState } from "../components/States";
import { CandidateProfileCard } from "../components/CandidateProfileCard";
import { parseDecimal } from "../lib/competency";
import type { Candidate } from "../types";

interface Metric {
  key: keyof Candidate;
  label: string;
}

const METRICS: Metric[] = [
  { key: "nota_curriculum", label: "Currículum" },
  { key: "nota_conocimiento", label: "Conocimiento" },
  { key: "nota_competencias", label: "Competencias" },
  { key: "nota_cap", label: "CAP" },
];

/**
 * "Cara a Cara" — a focused 1-vs-1 duel between two candidates. Each metric is
 * rendered as opposing bars; the leader's value is highlighted.
 */
export function CaraACara() {
  const { candidatos, loading, error, refetch } = useTalentData();
  const [aId, setAId] = useState("");
  const [bId, setBId] = useState("");

  useEffect(() => {
    if (candidatos.length >= 2 && !aId && !bId) {
      setAId(candidatos[0].id);
      setBId(candidatos[1].id);
    }
  }, [candidatos, aId, bId]);

  const a = useMemo(() => candidatos.find((c) => c.id === aId), [candidatos, aId]);
  const b = useMemo(() => candidatos.find((c) => c.id === bId), [candidatos, bId]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (candidatos.length < 2) {
    return <EmptyState message="Se necesitan al menos dos postulantes para el duelo." />;
  }

  return (
    <div className="space-y-5">
      <div className="glass grid grid-cols-1 gap-3 rounded-3xl p-4 sm:grid-cols-2">
        <Picker label="Aspirante A" value={aId} onChange={setAId} candidates={candidatos} />
        <Picker label="Aspirante B" value={bId} onChange={setBId} candidates={candidatos} />
      </div>

      {a && b && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 22 }}
            >
              <CandidateProfileCard candidate={a} />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 22 }}
            >
              <CandidateProfileCard candidate={b} />
            </motion.div>
          </div>

          <div className="glass rounded-3xl p-5">
            <div className="mb-4 flex items-center gap-2">
              <Swords className="h-5 w-5 text-cyan-300" />
              <h3 className="text-sm font-bold text-white drop-shadow-md">
                Comparativa de notas
              </h3>
            </div>
            <div className="space-y-4">
              {METRICS.map((m) => (
                <MetricRow
                  key={String(m.key)}
                  label={m.label}
                  va={parseDecimal(a[m.key] as never)}
                  vb={parseDecimal(b[m.key] as never)}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Picker({
  label,
  value,
  onChange,
  candidates,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  candidates: Candidate[];
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-200/70">
        {label}
      </span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="glass w-full appearance-none rounded-xl px-3.5 py-2.5 pr-9 text-sm text-white outline-none focus-within:ring-2 focus-within:ring-cyan-300/70"
        >
          {candidates.map((c) => (
            <option key={c.id} value={c.id} className="bg-slate-900 text-white">
              {c.fullName}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-300">
          ▾
        </span>
      </div>
    </label>
  );
}

function MetricRow({
  label,
  va,
  vb,
}: {
  label: string;
  va: number | null;
  vb: number | null;
}) {
  const a = va ?? 0;
  const b = vb ?? 0;
  const max = Math.max(a, b, 100);
  const aLead = a > b;
  const bLead = b > a;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className={`font-black ${aLead ? "text-cyan-300" : "text-slate-300"}`}>
          {va ?? "—"}
        </span>
        <span className="font-semibold uppercase tracking-wide text-slate-200/70">
          {label}
        </span>
        <span className={`font-black ${bLead ? "text-cyan-300" : "text-slate-300"}`}>
          {vb ?? "—"}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="flex h-2.5 flex-1 justify-end overflow-hidden rounded-full bg-white/5">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(a / max) * 100}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
            className={`h-full rounded-full ${aLead ? "bg-gradient-to-l from-[#00b0d8] to-[#005baa]" : "bg-white/25"}`}
          />
        </div>
        <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(b / max) * 100}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
            className={`h-full rounded-full ${bLead ? "bg-gradient-to-r from-[#005baa] to-[#00b0d8]" : "bg-white/25"}`}
          />
        </div>
      </div>
    </div>
  );
}
