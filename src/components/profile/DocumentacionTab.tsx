import { motion } from "framer-motion";
import { FileStack, FolderOpen, CalendarClock } from "lucide-react";
import type { Candidate } from "../../types";
import { useDocStore, DOC_STATUS_LABELS, type DocItem, type DocStatus } from "../../lib/docStore";
import { DOC_GROUP_LABELS, DOC_GROUP_ORDER, type DocGroup } from "../../lib/docTemplate";
import { dossierReport } from "../../lib/docReport";
import { RadialProgress } from "../charts";
import { SectionCard } from "./parts";

const STATUS_STYLE: Record<DocStatus, string> = {
  presentado: "bg-emerald-500/15 text-emerald-500 ring-emerald-400/30",
  pendiente: "bg-amber-500/15 text-amber-500 ring-amber-400/30",
  observado: "bg-rose-500/15 text-rose-500 ring-rose-400/30",
  no_aplica: "fill-softer text-ink-faint ring-[color:var(--hairline)]",
};

/**
 * The "Documentación" tab — the person's onboarding file, shown as a visual flow
 * of documents grouped by area with status chips and a completion ring, instead
 * of a plain list. Reads the dossier managed by the Documentación module.
 */
export function DocumentacionTab({ candidate }: { candidate: Candidate }) {
  const { dossiers, settings } = useDocStore();
  const id = candidate.identificador ?? candidate.id;
  const dossier = dossiers[id];

  if (!dossier) {
    return (
      <SectionCard icon={<FileStack className="h-5 w-5" />} title="Documentación de incorporación">
        <div className="rounded-2xl border border-dashed border-[color:var(--hairline)] px-4 py-10 text-center">
          <FolderOpen className="mx-auto h-10 w-10 text-ink-faint" />
          <p className="mt-3 text-sm font-semibold text-ink">Sin expediente de documentación</p>
          <p className="mt-1 text-xs text-ink-soft">
            Aún no se ha registrado documentación para esta persona. Puede iniciarla desde el
            módulo de Documentación una vez contratada.
          </p>
        </div>
      </SectionCard>
    );
  }

  const report = dossierReport(dossier, settings.intervalDays);
  const byGroup = (g: DocGroup) => dossier.items.filter((it) => it.group === g);

  return (
    <div className="space-y-4">
      <SectionCard icon={<FileStack className="h-5 w-5" />} title="Avance de documentación" sub={dossier.cargo || "Expediente de incorporación"}>
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <RadialProgress value={report.completionPct} size={132} label="completado" color="#00b0d8" />
          <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Documentos" value={`${report.presentados}/${report.applicable}`} />
            <Stat label="Pendientes" value={String(report.faltantes.length)} />
            <Stat label="Estado" value={report.healthLabel} />
          </div>
        </div>
        {report.nextReminder && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full fill-softer px-3 py-1.5 text-xs font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)]">
            <CalendarClock className="h-3.5 w-3.5 text-cyan-400" />
            Próximo recordatorio: {report.nextReminder.toLocaleDateString("es-BO", { day: "2-digit", month: "long" })}
          </p>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {DOC_GROUP_ORDER.map((g) => {
          const items = byGroup(g);
          if (!items.length) return null;
          return (
            <SectionCard key={g} title={DOC_GROUP_LABELS[g]} sub={`${items.length} documento(s)`}>
              <ul className="space-y-2">
                {items.map((it, i) => (
                  <DocRow key={it.id} item={it} index={i} />
                ))}
              </ul>
            </SectionCard>
          );
        })}
      </div>
    </div>
  );
}

function DocRow({ item, index }: { item: DocItem; index: number }) {
  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4) }}
      className="flex items-center justify-between gap-2 rounded-2xl fill-soft px-3 py-2 ring-1 ring-[color:var(--hairline)]"
    >
      <span className="wrap-words min-w-0 flex-1 text-sm font-semibold text-ink">{item.label}</span>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-bold ring-1 ${STATUS_STYLE[item.status]}`}>
        {DOC_STATUS_LABELS[item.status]}
      </span>
    </motion.li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl fill-soft px-3 py-2 text-center ring-1 ring-[color:var(--hairline)]">
      <div className="wrap-words text-sm font-black text-ink">{value}</div>
      <div className="text-[0.6rem] uppercase tracking-wide text-ink-faint">{label}</div>
    </div>
  );
}
