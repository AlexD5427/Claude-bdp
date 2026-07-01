import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Search,
  FolderPlus,
  Settings2,
  Printer,
  Mail,
  ChevronRight,
  FolderOpen,
  CalendarClock,
  BellRing,
  FileStack,
} from "lucide-react";
import { EmptyState } from "../components/States";
import { Avatar } from "../components/Avatar";
import { DocIntakeForm } from "../components/doc/DocIntakeForm";
import { DocSettingsModal } from "../components/doc/DocSettingsModal";
import { DocDossierDetail } from "../components/doc/DocDossierDetail";
import { DocEmailComposer } from "../components/doc/DocEmailComposer";
import { printModule } from "../lib/print";
import { useDocStore, type Dossier } from "../lib/docStore";
import { dossierReport } from "../lib/docReport";
import { useConfig, activeTemplateFor } from "../lib/configStore";

/**
 * MÓDULO — Documentación.
 *
 * Tracks the incoming documentation of newly-hired people. Each person gets an
 * editable dossier (opened from the live candidate database), a completion
 * status, an intelligent analysis and a reminder-email panel. The list surfaces
 * the reminders due today so the auxiliar can review and send them.
 */
export function Documentacion() {
  const { dossiers, settings } = useDocStore();
  const config = useConfig();

  // The active "Documentación" email format (managed in Configuración) drives
  // the subject/body of the reminders; the cadence & accounts stay local.
  const settingsWithFormat = useMemo(() => {
    const tpl = activeTemplateFor(config.emailTemplates, "documentacion");
    if (!tpl) return settings;
    return { ...settings, subjectTemplate: tpl.subject, bodyTemplate: tpl.body };
  }, [settings, config.emailTemplates]);

  const [query, setQuery] = useState("");
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [compose, setCompose] = useState<{ id: string; kind: "manual" | "auto" } | null>(null);

  const list = useMemo(() => Object.values(dossiers), [dossiers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const arr = q
      ? list.filter(
          (d) =>
            d.nombre.toLowerCase().includes(q) ||
            d.identificador.toLowerCase().includes(q) ||
            (d.cargo ?? "").toLowerCase().includes(q),
        )
      : list;
    // Most-recently opened first.
    return [...arr].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [list, query]);

  // Reminders due today (or overdue) among dossiers that still owe documents.
  const dueToday = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return list.filter((d) => {
      const r = dossierReport(d, settings.intervalDays);
      return r.faltantes.length > 0 && r.nextReminder !== null && r.nextReminder <= today;
    });
  }, [list, settings.intervalDays]);

  const autoDossier = compose ? dossiers[compose.id] : null;
  const autoReport = autoDossier ? dossierReport(autoDossier, settings.intervalDays) : null;

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="glass flex min-w-[16rem] flex-1 items-center gap-2 rounded-2xl px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-cyan-400/70">
          <Search className="h-4 w-4 text-ink-soft" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar expediente por nombre, identificador o cargo…"
            className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => printModule("Expedientes de Documentación")}
          className="inline-flex items-center gap-2 rounded-full fill-softer px-4 py-2.5 text-sm font-bold text-ink ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-95"
        >
          <Printer className="h-4 w-4" />
          <span className="hidden sm:inline">Imprimir</span>
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="inline-flex items-center gap-2 rounded-full fill-softer px-4 py-2.5 text-sm font-bold text-ink ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-95"
        >
          <Settings2 className="h-4 w-4" />
          <span className="hidden sm:inline">Avisos</span>
        </button>
        <button
          type="button"
          onClick={() => setIntakeOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-5 py-2.5 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all duration-500 ease-spring hover:-translate-y-1 hover:scale-[1.03] active:scale-95"
        >
          <FolderPlus className="h-4 w-4" />
          Registrar documentación
        </button>
      </div>

      {/* Reminders due today */}
      {settings.autoSendEnabled && dueToday.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-3 rounded-3xl bg-gradient-to-r from-[#00b0d8]/15 to-[#005baa]/15 px-4 py-3 ring-1 ring-cyan-400/30 no-print"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white shadow-glass ring-1 ring-white/30">
            <BellRing className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink">
              {dueToday.length} aviso(s) programado(s) para hoy
            </p>
            <p className="truncate text-xs text-ink-soft">
              {settings.requireConfirmation
                ? "Revise la vista previa y confirme el envío de cada recordatorio."
                : "Se enviarán recordatorios de documentación pendiente."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCompose({ id: dueToday[0].identificador, kind: "auto" })}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-4 py-2 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all hover:-translate-y-0.5 active:scale-95"
          >
            <Mail className="h-4 w-4" />
            Revisar y enviar
          </button>
        </motion.div>
      )}

      {list.length === 0 ? (
        <EmptyState
          title="Sin expedientes de documentación"
          message="Registre la documentación de una persona contratada para iniciar el seguimiento automatizado."
        />
      ) : filtered.length === 0 ? (
        <EmptyState message="No hay expedientes que coincidan con la búsqueda." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((d, i) => (
            <DossierCard
              key={d.identificador}
              dossier={d}
              intervalDays={settings.intervalDays}
              index={i}
              onOpen={() => setDetailId(d.identificador)}
              onCompose={() => setCompose({ id: d.identificador, kind: "manual" })}
            />
          ))}
        </div>
      )}

      <DocIntakeForm
        open={intakeOpen}
        onClose={() => setIntakeOpen(false)}
        onCreated={(id) => setDetailId(id)}
      />
      <DocSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings} />
      <DocDossierDetail identificador={detailId} settings={settings} onClose={() => setDetailId(null)} />
      <DocEmailComposer
        open={compose !== null}
        onClose={() => setCompose(null)}
        dossier={autoDossier}
        report={autoReport}
        settings={settingsWithFormat}
        kind={compose?.kind ?? "manual"}
      />
    </div>
  );
}

function DossierCard({
  dossier,
  intervalDays,
  index,
  onOpen,
  onCompose,
}: {
  dossier: Dossier;
  intervalDays: number;
  index: number;
  onOpen: () => void;
  onCompose: () => void;
}) {
  const r = dossierReport(dossier, intervalDays);
  const barColor =
    r.health === "completo"
      ? "from-emerald-500 to-green-600"
      : r.health === "al_dia"
        ? "from-[#00b0d8] to-[#005baa]"
        : r.health === "en_proceso"
          ? "from-amber-400 to-orange-500"
          : "from-rose-500 to-red-600";

  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 240, damping: 22, delay: Math.min(index * 0.04, 0.4) }}
      className="glass glow liquid-streak magnetic flex cursor-pointer flex-col rounded-3xl p-4 print-avoid-break"
      onClick={onOpen}
    >
      <div className="flex items-center gap-3">
        <Avatar name={dossier.nombre} seed={dossier.identificador} size="md" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold text-ink">{dossier.nombre}</h3>
          <p className="truncate text-xs text-ink-soft">{dossier.cargo || "Cargo no especificado"}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.7rem] font-black ring-1 ${r.healthTone}`}>
          {r.healthLabel}
        </span>
      </div>

      {/* Progress */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="font-semibold text-ink-soft">Avance de documentación</span>
          <span className="font-black text-ink">{r.completionPct}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full fill-soft">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${r.completionPct}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
            className={`h-full rounded-full bg-gradient-to-r ${barColor}`}
          />
        </div>
      </div>

      {/* Chips */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.7rem]">
        <span className="inline-flex items-center gap-1 rounded-full fill-softer px-2.5 py-0.5 font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)]">
          <FileStack className="h-3 w-3" />
          {r.presentados}/{r.applicable} docs
        </span>
        {r.faltantes.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 font-bold text-amber-500 ring-1 ring-amber-400/30">
            {r.faltantes.length} pendiente{r.faltantes.length === 1 ? "" : "s"}
          </span>
        )}
        {r.nextReminder && (
          <span className="inline-flex items-center gap-1 rounded-full fill-softer px-2.5 py-0.5 font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)]">
            <CalendarClock className="h-3 w-3" />
            {r.nextReminder.toLocaleDateString("es-BO", { day: "2-digit", month: "short" })}
          </span>
        )}
      </div>

      {/* Footer actions */}
      <div className="mt-4 flex items-center gap-2 no-print">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-4 py-2 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all hover:-translate-y-0.5 active:scale-95"
        >
          <FolderOpen className="h-4 w-4" />
          Ver expediente
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Enviar aviso"
          onClick={(e) => {
            e.stopPropagation();
            onCompose();
          }}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full fill-softer text-ink ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-95"
        >
          <Mail className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}
