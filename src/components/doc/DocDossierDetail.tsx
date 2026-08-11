import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Copy as CopyIcon,
  FileText,
  History,
  Info,
  Mail,
  MessageSquarePlus,
  Plus,
  Printer,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { RadialProgress } from "../charts";
import { ConfirmDialog } from "../ConfirmDialog";
import { DocEmailComposer } from "./DocEmailComposer";
import { printModule } from "../../lib/print";
import { DOC_GROUP_LABELS, DOC_GROUP_ORDER, type DocGroup } from "../../lib/docTemplate";
import {
  DOC_STATUS_LABELS,
  addItem,
  removeDossier,
  removeItem,
  updateDossierMeta,
  updateItem,
  useDocStore,
  type DocItem,
  type DocSettings,
  type DocStatus,
} from "../../lib/docStore";
import { dossierInsights, dossierReport } from "../../lib/docReport";
import DocSyncIndicator from "./DocSyncIndicator";
import { CountUp, useDocMotion } from "./DocMotion";

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

const STATUS_BORDE: Record<DocStatus, string> = {
  presentado: "border-l-emerald-500/70",
  pendiente: "border-l-slate-400/50",
  observado: "border-l-amber-500/70",
  no_aplica: "border-l-slate-300/30",
};

const HEALTH_COLOR: Record<string, string> = {
  completo: "#10b981",
  al_dia: "#00b0d8",
  en_proceso: "#f59e0b",
  atrasado: "#f43f5e",
};

type Filtro = "todos" | "faltantes" | "observados" | "presentados";

const FILTROS: { id: Filtro; etiqueta: string }[] = [
  { id: "todos", etiqueta: "Todos" },
  { id: "faltantes", etiqueta: "Faltantes" },
  { id: "observados", etiqueta: "Con obs." },
  { id: "presentados", etiqueta: "Listos" },
];

/**
 * Expediente completo de una persona, a pantalla completa.
 *
 * -- Qué cambió y por qué ---------------------------------------------------
 * El nombre del documento estaba en un `<input>` de una línea. Con títulos como
 * «Declaración Jurada de Bienes y Rentas recepcionada por la Contraloría General
 * del Estado» se veía un tercio y había que arrastrar el cursor para leer el
 * resto. Ahora es un área que crece con el texto: el nombre completo siempre
 * visible.
 *
 * El espacio se reparte en tres zonas —índice, documentos y resumen— y se añaden
 * filtros y búsqueda, porque con treinta y un documentos la lista plana obligaba
 * a recorrerla entera para encontrar los cuatro que faltan.
 */
export function DocDossierDetail({ identificador, settings, onClose }: DocDossierDetailProps) {
  const { dossiers } = useDocStore();
  const m = useDocMotion();
  const dossier = identificador ? dossiers[identificador] : undefined;

  const [composerOpen, setComposerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [grupoActivo, setGrupoActivo] = useState<DocGroup | null>(null);

  const contenedorRef = useRef<HTMLDivElement>(null);
  const seccionesRef = useRef<Partial<Record<DocGroup, HTMLElement | null>>>({});

  // Cerrar con Escape: en un panel a pantalla completa es el gesto esperado.
  useEffect(() => {
    if (!dossier) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !composerOpen && !confirmDelete) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dossier, composerOpen, confirmDelete, onClose]);

  // Bloquear el scroll del fondo mientras el panel esta abierto.
  useEffect(() => {
    if (!dossier) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, [dossier]);

  const report = useMemo(
    () => (dossier ? dossierReport(dossier, settings.intervalDays) : null),
    [dossier, settings.intervalDays],
  );

  const insights = useMemo(
    () => (dossier && report ? dossierInsights(report) : []),
    [dossier, report],
  );

  /** Documentos por grupo, ya filtrados y buscados. */
  const grouped = useMemo(() => {
    const map = new Map<DocGroup, DocItem[]>();
    for (const g of DOC_GROUP_ORDER) map.set(g, []);
    if (!dossier) return map;

    const q = busqueda.trim().toLowerCase();

    for (const it of dossier.items) {
      if (filtro === "faltantes" && it.status !== "pendiente") continue;
      if (filtro === "observados" && it.status !== "observado") continue;
      if (filtro === "presentados" && it.status !== "presentado") continue;
      if (q && !it.label.toLowerCase().includes(q) && !it.observation.toLowerCase().includes(q))
        continue;

      const bucket = map.get(it.group) ?? [];
      bucket.push(it);
      map.set(it.group, bucket);
    }
    return map;
  }, [dossier, filtro, busqueda]);

  /** Totales sin filtrar, para el índice lateral. */
  const totales = useMemo(() => {
    const map = new Map<DocGroup, { total: number; listos: number }>();
    for (const g of DOC_GROUP_ORDER) map.set(g, { total: 0, listos: 0 });
    if (!dossier) return map;
    for (const it of dossier.items) {
      const t = map.get(it.group);
      if (!t) continue;
      t.total++;
      if (it.status === "presentado") t.listos++;
    }
    return map;
  }, [dossier]);

  const visibles = useMemo(
    () => DOC_GROUP_ORDER.reduce((n, g) => n + (grouped.get(g)?.length ?? 0), 0),
    [grouped],
  );

  const irAGrupo = (g: DocGroup) => {
    setGrupoActivo(g);
    const el = seccionesRef.current[g];
    if (el) el.scrollIntoView({ behavior: m.activo ? "smooth" : "auto", block: "start" });
  };

  const open = !!dossier;

  return createPortal(
    <AnimatePresence>
      {open && dossier && report && (
        <motion.div
          ref={contenedorRef}
          className="fixed inset-0 z-[110] overflow-y-auto bg-[color:var(--app-base)]"
          style={{ scrollBehavior: m.activo && settings.scrollSuave ? "smooth" : "auto" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: m.activo ? 0.2 : 0 }}
        >
          {/* Fondo */}
          {settings.efectosFondo && (
            <div
              className="pointer-events-none fixed inset-0"
              style={{
                backgroundImage:
                  "radial-gradient(120% 120% at 50% -10%, var(--app-wash-1) 0%, var(--app-wash-2) 35%, transparent 70%)",
              }}
            />
          )}

          <div className="relative mx-auto w-full max-w-[92rem] px-4 py-6 sm:px-6">
            {/* Cabecera --------------------------------------------------- */}
            <motion.header
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={m.spring}
              className="glass-heavy sticky top-3 z-30 mb-5 rounded-3xl px-4 py-3 no-print sm:px-5"
            >
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Volver"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl fill-softer text-ink ring-1 ring-[color:var(--hairline)] transition-all hover:-translate-x-0.5 hover:fill-soft active:scale-95"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>

                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-black leading-tight tracking-tight text-ink wrap-words sm:text-xl">
                    {dossier.nombre}
                  </h2>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-soft">
                    <span className="font-mono">{dossier.identificador}</span>
                    {dossier.cargo && <span>· {dossier.cargo}</span>}
                    <DocSyncIndicator compacto />
                  </p>
                </div>

                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black ring-1 ${report.healthTone}`}
                >
                  {report.healthLabel} · <CountUp value={report.completionPct} sufijo="%" />
                </span>

                <button
                  type="button"
                  onClick={() => printModule(`Expediente de Documentación · ${dossier.nombre}`)}
                  className="inline-flex items-center gap-2 rounded-full fill-softer px-4 py-2.5 text-sm font-bold text-ink ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-95"
                >
                  <Printer className="h-4 w-4" />
                  <span className="hidden sm:inline">Imprimir</span>
                </button>

                <motion.button
                  type="button"
                  onClick={() => setComposerOpen(true)}
                  whileHover={m.activo ? { y: -2, scale: 1.02 } : undefined}
                  whileTap={m.activo ? { scale: 0.96 } : undefined}
                  transition={m.spring}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-5 py-2.5 text-sm font-bold text-white shadow-glass ring-1 ring-white/30"
                >
                  <Mail className="h-4 w-4" />
                  Enviar aviso
                </motion.button>
              </div>

              {/* Barra de avance continua */}
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full fill-soft">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: HEALTH_COLOR[report.health] }}
                  initial={false}
                  animate={{ width: `${report.completionPct}%` }}
                  transition={m.suave}
                />
              </div>
            </motion.header>

            {/* Filtros ---------------------------------------------------- */}
            <div className="mb-4 flex flex-wrap items-center gap-2 no-print">
              <div className="flex flex-wrap gap-1 rounded-full fill-soft p-1 ring-1 ring-[color:var(--hairline)]">
                {FILTROS.map((f) => {
                  const activo = filtro === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFiltro(f.id)}
                      className={`relative rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                        activo ? "text-white" : "text-ink-soft hover:text-ink"
                      }`}
                    >
                      {activo && (
                        <motion.span
                          layoutId="doc-filtro-activo"
                          className="absolute inset-0 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa]"
                          transition={m.spring}
                        />
                      )}
                      <span className="relative">{f.etiqueta}</span>
                    </button>
                  );
                })}
              </div>

              <label className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-full fill-soft px-3 py-2 ring-1 ring-[color:var(--hairline)] focus-within:ring-2 focus-within:ring-cyan-400/60 sm:max-w-xs">
                <Search className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar documento…"
                  className="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-ink-faint"
                />
                {busqueda && (
                  <button type="button" onClick={() => setBusqueda("")} aria-label="Limpiar">
                    <X className="h-3.5 w-3.5 text-ink-faint hover:text-ink" />
                  </button>
                )}
              </label>

              {(filtro !== "todos" || busqueda) && (
                <span className="text-xs text-ink-faint">
                  {visibles} de {dossier.items.length}
                </span>
              )}
            </div>

            {/* Cuerpo ----------------------------------------------------- */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[11rem_1fr] xl:grid-cols-[11rem_1fr_21rem]">
              {/* Indice */}
              <nav className="hidden lg:block">
                <div className="sticky top-32 space-y-1">
                  {DOC_GROUP_ORDER.map((g) => {
                    const t = totales.get(g) ?? { total: 0, listos: 0 };
                    const activo = grupoActivo === g;
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => irAGrupo(g)}
                        className={`block w-full rounded-xl px-3 py-2 text-left transition ${
                          activo ? "fill-soft" : "hover:fill-soft"
                        }`}
                      >
                        <span className="block text-[11px] font-bold leading-tight text-ink wrap-words">
                          {DOC_GROUP_LABELS[g]}
                        </span>
                        <span className="mt-1 block text-[10px] text-ink-faint">
                          {t.listos}/{t.total}
                        </span>
                        <span className="mt-1 block h-1 overflow-hidden rounded-full fill-softer">
                          <motion.span
                            className="block h-full rounded-full bg-gradient-to-r from-[#00b0d8] to-[#005baa]"
                            initial={false}
                            animate={{ width: t.total ? `${(t.listos / t.total) * 100}%` : "0%" }}
                            transition={m.suave}
                          />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </nav>

              {/* Documentos */}
              <div className="min-w-0 space-y-5">
                {DOC_GROUP_ORDER.map((group) => {
                  const items = grouped.get(group) ?? [];
                  const t = totales.get(group) ?? { total: 0, listos: 0 };
                  const oculto = (filtro !== "todos" || busqueda) && items.length === 0;
                  if (oculto) return null;

                  return (
                    <section
                      key={group}
                      ref={(el) => {
                        seccionesRef.current[group] = el;
                      }}
                      className="glass scroll-mt-32 rounded-3xl p-4 print-avoid-break sm:p-5"
                    >
                      <header className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#005baa] to-[#004a8f] text-white shadow-glass ring-1 ring-white/30">
                            <FileText className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <h3 className="text-sm font-black text-ink wrap-words">
                              {DOC_GROUP_LABELS[group]}
                            </h3>
                            <p className="text-xs text-ink-faint">
                              {t.listos}/{t.total} presentados
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => addItem(dossier.identificador, group)}
                          className="no-print inline-flex shrink-0 items-center gap-1.5 rounded-full fill-softer px-3 py-1.5 text-xs font-bold text-ink ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-95"
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
                          <AnimatePresence initial={false} mode="popLayout">
                            {items.map((item, i) => (
                              <ItemRow
                                key={item.id}
                                dossierId={dossier.identificador}
                                item={item}
                                indice={i}
                              />
                            ))}
                          </AnimatePresence>
                        </div>
                      )}
                    </section>
                  );
                })}

                {visibles === 0 && (
                  <div className="glass rounded-3xl px-4 py-10 text-center">
                    <Search className="mx-auto h-6 w-6 text-ink-faint" />
                    <p className="mt-2 text-sm font-bold text-ink">Sin resultados</p>
                    <p className="mt-1 text-xs text-ink-soft">
                      Ningún documento coincide con el filtro actual.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setFiltro("todos");
                        setBusqueda("");
                      }}
                      className="mt-3 rounded-full fill-soft px-4 py-2 text-xs font-bold text-ink ring-1 ring-[color:var(--hairline)]"
                    >
                      Ver todos
                    </button>
                  </div>
                )}
              </div>

              {/* Resumen */}
              <div className="space-y-5 xl:sticky xl:top-32 xl:self-start">
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

                <section className="glass rounded-3xl p-5">
                  <h3 className="mb-3 text-sm font-black text-ink">Datos de la persona</h3>
                  <div className="space-y-2.5">
                    <MetaField
                      label="Correo"
                      value={dossier.correo}
                      placeholder="persona@correo.com"
                      onChange={(v) => updateDossierMeta(dossier.identificador, { correo: v })}
                    />
                    <MetaField
                      label="Cargo"
                      value={dossier.cargo}
                      placeholder="Cargo"
                      onChange={(v) => updateDossierMeta(dossier.identificador, { cargo: v })}
                    />
                    <MetaField
                      label="Agencia"
                      value={dossier.agencia}
                      placeholder="Agencia"
                      onChange={(v) => updateDossierMeta(dossier.identificador, { agencia: v })}
                    />
                    <MetaField
                      label="Gerencia"
                      value={dossier.gerencia}
                      placeholder="Gerencia"
                      onChange={(v) => updateDossierMeta(dossier.identificador, { gerencia: v })}
                    />
                    <label className="block">
                      <span className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">
                        Fecha de ingreso
                      </span>
                      <input
                        type="date"
                        value={dossier.fechaIngreso}
                        onChange={(e) =>
                          updateDossierMeta(dossier.identificador, { fechaIngreso: e.target.value })
                        }
                        className="glass w-full rounded-xl px-3 py-2 text-sm text-ink outline-none focus-within:ring-2 focus-within:ring-cyan-400/70 [color-scheme:light] dark:[color-scheme:dark]"
                      />
                    </label>
                  </div>
                </section>

                <section className="glass rounded-3xl p-5 print-avoid-break">
                  <div className="mb-3 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-cyan-400" />
                    <h3 className="text-sm font-black text-ink">Análisis</h3>
                  </div>
                  <ul className="space-y-2">
                    {insights.map((ins, i) => (
                      <motion.li
                        key={i}
                        initial={m.activo ? { opacity: 0, x: -6 } : false}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ ...m.suave, delay: m.activo ? i * 0.05 : 0 }}
                        className="flex items-start gap-2 text-xs text-ink-soft"
                      >
                        <InsightIcon tone={ins.tone} />
                        <span className="wrap-words">{ins.text}</span>
                      </motion.li>
                    ))}
                  </ul>
                  {report.nextReminder && (
                    <div className="mt-3 flex items-center gap-2 rounded-2xl fill-soft px-3 py-2 text-xs text-ink-soft ring-1 ring-[color:var(--hairline)]">
                      <CalendarClock className="h-4 w-4 shrink-0 text-cyan-400" />
                      <span className="wrap-words">
                        Próxima alerta:{" "}
                        {report.nextReminder.toLocaleDateString("es-BO", {
                          weekday: "short",
                          day: "2-digit",
                          month: "long",
                        })}
                      </span>
                    </div>
                  )}
                </section>

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
                        <li
                          key={e.id}
                          className="rounded-2xl fill-soft px-3 py-2 text-xs ring-1 ring-[color:var(--hairline)]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-ink">
                              {new Date(e.at).toLocaleDateString("es-BO", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-bold ring-1 ${
                                e.kind === "auto"
                                  ? "bg-cyan-500/15 text-cyan-500 ring-cyan-400/30"
                                  : "fill-softer text-ink-soft ring-[color:var(--hairline)]"
                              }`}
                            >
                              {e.kind === "auto" ? "Automático" : "Manual"}
                            </span>
                          </div>
                          <div className="mt-0.5 text-ink-faint wrap-words">
                            {e.to} · {e.missingCount} pend.
                          </div>
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
/* Fila de documento                                                   */
/* ------------------------------------------------------------------ */

/**
 * Campo de texto que crece con su contenido.
 *
 * Es la pieza que resuelve el problema de los nombres largos: en lugar de
 * recortar el título a una línea, el campo se ajusta y muestra el nombre entero.
 * La altura se recalcula en `useLayoutEffect` —antes de pintar— para que no se
 * vea un salto al abrir el expediente.
 */
function AutoTextarea({
  value,
  onChange,
  className = "",
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`resize-none overflow-hidden ${className}`}
    />
  );
}

function ItemRow({
  dossierId,
  item,
  indice,
}: {
  dossierId: string;
  item: DocItem;
  indice: number;
}) {
  const m = useDocMotion();
  // La observacion solo ocupa sitio cuando aporta algo.
  const [verObs, setVerObs] = useState(!!item.observation);

  return (
    <motion.div
      layout={m.activo}
      initial={m.activo ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ ...m.suave, delay: m.activo ? Math.min(indice * 0.02, 0.2) : 0 }}
      className={`rounded-2xl fill-soft p-3 ring-1 ring-[color:var(--hairline)] print-avoid-break border-l-[3px] ${STATUS_BORDE[item.status]}`}
    >
      {/* Nombre completo, sin truncar */}
      <div className="flex items-start gap-2">
        <span
          className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[item.status]}`}
          aria-hidden="true"
        />
        <AutoTextarea
          value={item.label}
          ariaLabel="Nombre del documento"
          onChange={(v) => updateItem(dossierId, item.id, { label: v })}
          className="min-w-0 flex-1 rounded-lg bg-transparent px-1.5 py-1 text-sm font-semibold leading-snug text-ink outline-none focus:bg-[color:var(--fill-2)] focus:ring-1 focus:ring-cyan-400/60"
        />
        <button
          type="button"
          aria-label="Quitar documento"
          onClick={() => removeItem(dossierId, item.id)}
          className="no-print mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full fill-softer text-ink-soft ring-1 ring-[color:var(--hairline)] transition-all hover:bg-rose-500/80 hover:text-white active:scale-90"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {STATUS_ORDER.map((s) => {
            const active = item.status === s;
            return (
              <motion.button
                key={s}
                type="button"
                onClick={() => updateItem(dossierId, item.id, { status: s })}
                whileTap={m.activo ? { scale: 0.94 } : undefined}
                transition={m.spring}
                className={[
                  "rounded-full px-2.5 py-1 text-[0.7rem] font-bold ring-1 transition-colors",
                  active
                    ? STATUS_TONE[s]
                    : "fill-softer text-ink-soft ring-[color:var(--hairline)] hover:fill-soft",
                ].join(" ")}
              >
                {DOC_STATUS_LABELS[s]}
              </motion.button>
            );
          })}
        </div>

        <label className="inline-flex items-center gap-1.5 rounded-full fill-softer px-2.5 py-1 text-[0.7rem] font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)]">
          <CopyIcon className="h-3 w-3" />
          <input
            type="number"
            min={0}
            aria-label="Páginas"
            value={item.pages || 0}
            onChange={(e) =>
              updateItem(dossierId, item.id, { pages: Math.max(0, Number(e.target.value) || 0) })
            }
            className="w-10 bg-transparent text-center text-ink outline-none"
          />
          pág.
        </label>

        {item.allowProrroga && (
          <label className="inline-flex items-center gap-1.5 rounded-full fill-softer px-2.5 py-1 text-[0.7rem] font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)]">
            <CalendarClock className="h-3 w-3" />
            <input
              type="date"
              aria-label="Prórroga"
              value={item.prorroga ?? ""}
              onChange={(e) =>
                updateItem(dossierId, item.id, { prorroga: e.target.value || undefined })
              }
              className="bg-transparent text-ink outline-none [color-scheme:light] dark:[color-scheme:dark]"
            />
          </label>
        )}

        {!verObs && (
          <button
            type="button"
            onClick={() => setVerObs(true)}
            className="no-print inline-flex items-center gap-1 rounded-full px-2 py-1 text-[0.7rem] font-semibold text-ink-faint transition hover:text-ink"
          >
            <MessageSquarePlus className="h-3 w-3" /> Observación
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {verObs && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={m.suave}
            className="overflow-hidden"
          >
            <AutoTextarea
              value={item.observation}
              ariaLabel="Observación"
              placeholder="Observación…"
              onChange={(v) => updateItem(dossierId, item.id, { observation: v })}
              className="mt-2 w-full rounded-lg bg-transparent px-1.5 py-1 text-xs italic leading-relaxed text-ink-soft outline-none placeholder:text-ink-faint focus:bg-[color:var(--fill-2)] focus:ring-1 focus:ring-cyan-400/60"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl fill-soft px-2 py-1.5 ring-1 ring-[color:var(--hairline)]">
      <div className={`text-lg font-black leading-none ${tone}`}>
        <CountUp value={value} />
      </div>
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
      <span className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </span>
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
