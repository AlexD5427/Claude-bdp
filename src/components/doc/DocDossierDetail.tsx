import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Mail,
  Trash2,
  Printer,
  Plus,
  X,
  FileText,
  CalendarClock,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Info,
  History,
  Copy as CopyIcon,
} from "lucide-react";
import { RadialProgress } from "../charts";
import { ConfirmDialog } from "../ConfirmDialog";
import { DocEmailComposer } from "./DocEmailComposer";
import { printModule } from "../../lib/print";
import {
  DOC_GROUP_LABELS,
  DOC_GROUP_ORDER,
  type DocGroup,
} from "../../lib/docTemplate";
import {
  DOC_STATUS_LABELS,
  addItem,
  removeDossier,
  removeItem,
  updateDossierMeta,
  updateItem,
  useDocStore,
  type DocItem,
  type DocStatus,
  type DocSettings,
} from "../../lib/docStore";
import { dossierInsights, dossierReport } from "../../lib/docReport";

interface DocDossierDetailProps {
  identificador: string | null;
  settings: DocSettings;
  onClose: () => void;
}

const STATUS_ORDER: DocStatus[] = ["presentado", "pendiente", "observado", "no_aplica"];
const STATUS_TONE: Record<DocStatus, string> = {
  presentado: "bg-gradient-to-br from-emerald-500 to-green-600 text-white ring-white/40",
  pendiente: "bg-gradient-to-br from-slate-400 to-slate-500 text-white ring-white/30",
  observado: "bg-gradient-to-br from-amber-400 to-orange-500 text-white ring-white/40",
  no_aplica: "fill-soft text-ink-soft ring-[color:var(--hairline)]",
};
const STATUS_DOT: Record<DocStatus, string> = {
  presentado: "bg-emerald-500",
  pendiente: "bg-slate-400",
  observado: "bg-amber-500",
  no_aplica: "bg-slate-300/60",
};
const HEALTH_COLOR: Record<string, string> = {
  completo: "#10b981",
  al_dia: "#00b0d8",
  en_proceso: "#f59e0b",
  atrasado: "#f43f5e",
};

/**
 * Full-screen editable dossier: the whole document history for one person. Every
 * field is editable (document name, status, page count, observation and any
 * extension date), grouped by category, with a live completion ring, an
 * intelligent analysis and the reminder-email panel + history.
 */
export function DocDossierDetail({ identificador, settings, onClose }: DocDossierDetailProps) {
  const { dossiers } = useDocStore();
  const dossier = identificador ? dossiers[identificador] : undefined;
  const [composerOpen, setComposerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const report = useMemo(
    () => (dossier ? dossierReport(dossier, settings.intervalDays) : null),
    [dossier, settings.intervalDays],
  );
  const insights = useMemo(
    () => (dossier && report ? dossierInsights(report) : []),
    [dossier, report],
  );

  const grouped = useMemo(() => {
    const map = new Map<DocGroup, DocItem[]>();
    for (const g of DOC_GROUP_ORDER) map.set(g, []);
    if (dossier) {
      for (const it of dossier.items) {
        const bucket = map.get(it.group) ?? [];
        bucket.push(it);
        map.set(it.group, bucket);
      }
    }
    return map;
  }, [dossier]);

  const open = !!dossier;

  return createPortal(
    <AnimatePresence>
      {open && dossier && report && (
        <motion.div
          className="fixed inset-0 z-[110] overflow-y-auto bg-[color:var(--app-base)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop wash */}
          <div
            className="pointer-events-none fixed inset-0"
            style={{
              backgroundImage:
                "radial-gradient(120% 120% at 50% -10%, var(--app-wash-1) 0%, var(--app-wash-2) 35%, transparent 70%)",
            }}
          />

          <div className="relative mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
            {/* Header */}
            <motion.header
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-heavy sticky top-3 z-20 mb-5 flex flex-wrap items-center gap-3 rounded-3xl px-4 py-3 no-print sm:px-5"
            >
              <button
                type="button"
                onClick={onClose}
                aria-label="Volver"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl fill-softer text-ink ring-1 ring-[color:var(--hairline)] transition-all hover:-translate-x-0.5 hover:fill-soft active:scale-95"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-black tracking-tight text-ink sm:text-xl">
                  {dossier.nombre}
                </h2>
                <p className="truncate text-xs text-ink-soft">
                  {dossier.identificador}
                  {dossier.cargo ? ` · ${dossier.cargo}` : ""}
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black ring-1 ${report.healthTone}`}
              >
                {report.healthLabel} · {report.completionPct}%
              </span>
              <button
                type="button"
                onClick={() => printModule(`Expediente de Documentación · ${dossier.nombre}`)}
                className="inline-flex items-center gap-2 rounded-full fill-softer px-4 py-2.5 text-sm font-bold text-ink ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-95"
              >
                <Printer className="h-4 w-4" />
                <span className="hidden sm:inline">Imprimir</span>
              </button>
              <button
                type="button"
                onClick={() => setComposerOpen(true)}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-5 py-2.5 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all duration-500 ease-spring hover:-translate-y-1 hover:scale-[1.03] active:scale-95"
              >
                <Mail className="h-4 w-4" />
                Enviar aviso
              </button>
            </motion.header>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_22rem]">
              {/* Documents column */}
              <div className="space-y-5">
                {DOC_GROUP_ORDER.map((group) => {
                  const items = grouped.get(group) ?? [];
                  return (
                    <section key={group} className="glass rounded-3xl p-4 sm:p-5 print-avoid-break">
                      <header className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#005baa] to-[#004a8f] text-white shadow-glass ring-1 ring-white/30">
                            <FileText className="h-4 w-4" />
                          </span>
                          <div>
                            <h3 className="text-sm font-black text-ink">{DOC_GROUP_LABELS[group]}</h3>
                            <p className="text-xs text-ink-faint">
                              {items.filter((i) => i.status === "presentado").length}/{items.length} presentados
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => addItem(dossier.identificador, group)}
                          className="no-print inline-flex items-center gap-1.5 rounded-full fill-softer px-3 py-1.5 text-xs font-bold text-ink ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-95"
                        >
                          <Plus className="h-3.5 w-3.5" /> Agregar
                        </button>
                      </header>

                      {items.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-[color:var(--hairline)] px-4 py-4 text-center text-xs text-ink-faint">
                          Sin documentos en esta sección.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          <AnimatePresence initial={false}>
                            {items.map((item) => (
                              <ItemRow
                                key={item.id}
                                dossierId={dossier.identificador}
                                item={item}
                              />
                            ))}
                          </AnimatePresence>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>

              {/* Sidebar */}
              <div className="space-y-5 lg:sticky lg:top-24 lg:self-start">
                {/* Completion */}
                <section className="glass rounded-3xl p-5 print-avoid-break">
                  <div className="flex flex-col items-center">
                    <RadialProgress
                      value={report.completionPct}
                      color={HEALTH_COLOR[report.health]}
                      label="Avance"
                    />
                    <div className="mt-3 grid w-full grid-cols-2 gap-2 text-center">
                      <Stat label="Presentados" value={report.presentados} tone="text-emerald-500" />
                      <Stat label="Pendientes" value={report.pendientes} tone="text-ink" />
                      <Stat label="Con obs." value={report.observados} tone="text-amber-500" />
                      <Stat label="Páginas" value={report.totalPages} tone="text-ink" />
                    </div>
                  </div>
                </section>

                {/* Person data (editable) */}
                <section className="glass rounded-3xl p-5">
                  <h3 className="mb-3 text-sm font-black text-ink">Datos de la persona</h3>
                  <div className="space-y-2.5">
                    <MetaField label="Correo" value={dossier.correo} placeholder="persona@correo.com" onChange={(v) => updateDossierMeta(dossier.identificador, { correo: v })} />
                    <MetaField label="Cargo" value={dossier.cargo} placeholder="Cargo" onChange={(v) => updateDossierMeta(dossier.identificador, { cargo: v })} />
                    <MetaField label="Agencia" value={dossier.agencia} placeholder="Agencia" onChange={(v) => updateDossierMeta(dossier.identificador, { agencia: v })} />
                    <MetaField label="Gerencia" value={dossier.gerencia} placeholder="Gerencia" onChange={(v) => updateDossierMeta(dossier.identificador, { gerencia: v })} />
                    <label className="block">
                      <span className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">Fecha de ingreso</span>
                      <input
                        type="date"
                        value={dossier.fechaIngreso}
                        onChange={(e) => updateDossierMeta(dossier.identificador, { fechaIngreso: e.target.value })}
                        className="glass w-full rounded-xl px-3 py-2 text-sm text-ink outline-none focus-within:ring-2 focus-within:ring-cyan-400/70 [color-scheme:light] dark:[color-scheme:dark]"
                      />
                    </label>
                  </div>
                </section>

                {/* Intelligent analysis */}
                <section className="glass rounded-3xl p-5 print-avoid-break">
                  <div className="mb-3 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-cyan-400" />
                    <h3 className="text-sm font-black text-ink">Análisis</h3>
                  </div>
                  <ul className="space-y-2">
                    {insights.map((ins, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-ink-soft">
                        <InsightIcon tone={ins.tone} />
                        <span>{ins.text}</span>
                      </li>
                    ))}
                  </ul>
                  {report.nextReminder && (
                    <div className="mt-3 flex items-center gap-2 rounded-2xl fill-soft px-3 py-2 text-xs text-ink-soft ring-1 ring-[color:var(--hairline)]">
                      <CalendarClock className="h-4 w-4 text-cyan-400" />
                      Próxima alerta: {report.nextReminder.toLocaleDateString("es-BO", { weekday: "short", day: "2-digit", month: "long" })}
                    </div>
                  )}
                </section>

                {/* Email history */}
                <section className="glass rounded-3xl p-5 print-avoid-break">
                  <div className="mb-3 flex items-center gap-2">
                    <History className="h-4 w-4 text-cyan-400" />
                    <h3 className="text-sm font-black text-ink">Historial de avisos</h3>
                  </div>
                  {dossier.emailLog.length === 0 ? (
                    <p className="text-xs text-ink-faint">Aún no se han enviado avisos.</p>
                  ) : (
                    <ul className="space-y-2">
                      {dossier.emailLog.slice(0, 6).map((e) => (
                        <li key={e.id} className="rounded-2xl fill-soft px-3 py-2 text-xs ring-1 ring-[color:var(--hairline)]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-ink">
                              {new Date(e.at).toLocaleDateString("es-BO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <span className={`rounded-full px-2 py-0.5 text-[0.6rem] font-bold ring-1 ${e.kind === "auto" ? "bg-cyan-500/15 text-cyan-500 ring-cyan-400/30" : "fill-softer text-ink-soft ring-[color:var(--hairline)]"}`}>
                              {e.kind === "auto" ? "Automático" : "Manual"}
                            </span>
                          </div>
                          <div className="mt-0.5 truncate text-ink-faint">{e.to} · {e.missingCount} pend.</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="no-print inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-500 ring-1 ring-rose-400/30 transition-all hover:bg-rose-500/20 active:scale-95"
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar expediente
                </button>
              </div>
            </div>
          </div>

          <DocEmailComposer
            open={composerOpen}
            onClose={() => setComposerOpen(false)}
            dossier={dossier}
            report={report}
            settings={settings}
            kind="manual"
          />

          <ConfirmDialog
            open={confirmDelete}
            tone="danger"
            title="¿Eliminar expediente?"
            message={`Se eliminará todo el seguimiento de documentación de ${dossier.nombre}. Esta acción no se puede deshacer.`}
            confirmLabel="Eliminar"
            cancelLabel="Cancelar"
            onConfirm={() => {
              setConfirmDelete(false);
              removeDossier(dossier.identificador);
              onClose();
            }}
            onCancel={() => setConfirmDelete(false)}
          />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */

function ItemRow({ dossierId, item }: { dossierId: string; item: DocItem }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="rounded-2xl fill-soft p-3 ring-1 ring-[color:var(--hairline)] print-avoid-break"
    >
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[item.status]}`} />
        <input
          value={item.label}
          onChange={(e) => updateItem(dossierId, item.id, { label: e.target.value })}
          className="min-w-0 flex-1 rounded-lg bg-transparent px-1.5 py-1 text-sm font-semibold text-ink outline-none focus:bg-[color:var(--fill-2)] focus:ring-1 focus:ring-cyan-400/60"
        />
        <button
          type="button"
          aria-label="Quitar documento"
          onClick={() => removeItem(dossierId, item.id)}
          className="no-print grid h-7 w-7 shrink-0 place-items-center rounded-full fill-softer text-ink-soft ring-1 ring-[color:var(--hairline)] transition-all hover:bg-rose-500/80 hover:text-white active:scale-90"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {STATUS_ORDER.map((s) => {
            const active = item.status === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => updateItem(dossierId, item.id, { status: s })}
                className={[
                  "rounded-full px-2.5 py-1 text-[0.7rem] font-bold ring-1 transition-all active:scale-95",
                  active ? STATUS_TONE[s] : "fill-softer text-ink-soft ring-[color:var(--hairline)] hover:fill-soft",
                ].join(" ")}
              >
                {DOC_STATUS_LABELS[s]}
              </button>
            );
          })}
        </div>

        <label className="inline-flex items-center gap-1.5 rounded-full fill-softer px-2.5 py-1 text-[0.7rem] font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)]">
          <CopyIcon className="h-3 w-3" />
          <input
            type="number"
            min={0}
            value={item.pages || 0}
            onChange={(e) => updateItem(dossierId, item.id, { pages: Math.max(0, Number(e.target.value) || 0) })}
            className="w-10 bg-transparent text-center text-ink outline-none"
          />
          pág.
        </label>

        {item.allowProrroga && (
          <label className="inline-flex items-center gap-1.5 rounded-full fill-softer px-2.5 py-1 text-[0.7rem] font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)]">
            <CalendarClock className="h-3 w-3" />
            <input
              type="date"
              value={item.prorroga ?? ""}
              onChange={(e) => updateItem(dossierId, item.id, { prorroga: e.target.value || undefined })}
              className="bg-transparent text-ink outline-none [color-scheme:light] dark:[color-scheme:dark]"
            />
          </label>
        )}
      </div>

      <input
        value={item.observation}
        onChange={(e) => updateItem(dossierId, item.id, { observation: e.target.value })}
        placeholder="Observación…"
        className="mt-2 w-full rounded-lg bg-transparent px-1.5 py-1 text-xs italic text-ink-soft outline-none placeholder:text-ink-faint focus:bg-[color:var(--fill-2)] focus:ring-1 focus:ring-cyan-400/60"
      />
    </motion.div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl fill-soft px-2 py-1.5 ring-1 ring-[color:var(--hairline)]">
      <div className={`text-lg font-black leading-none ${tone}`}>{value}</div>
      <div className="mt-0.5 text-[0.55rem] uppercase tracking-wide text-ink-faint">{label}</div>
    </div>
  );
}

function MetaField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="glass w-full rounded-xl px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-faint focus-within:ring-2 focus-within:ring-cyan-400/70"
      />
    </label>
  );
}

function InsightIcon({ tone }: { tone: "ok" | "info" | "warn" | "danger" }) {
  const cls = "mt-0.5 h-3.5 w-3.5 shrink-0";
  if (tone === "ok") return <CheckCircle2 className={`${cls} text-emerald-500`} />;
  if (tone === "warn") return <AlertTriangle className={`${cls} text-amber-500`} />;
  if (tone === "danger") return <AlertTriangle className={`${cls} text-rose-500`} />;
  return <Info className={`${cls} text-cyan-400`} />;
}
