import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BellRing,
  CalendarClock,
  ChevronRight,
  FileStack,
  FolderOpen,
  FolderPlus,
  LayoutGrid,
  Mail,
  Printer,
  Rows3,
  Search,
  Settings2,
  SlidersHorizontal,
  Table2,
  X,
} from "lucide-react";
import { EmptyState } from "../../../components/States";
import { Avatar } from "../../../components/Avatar";
import { CandidateActions } from "../../../components/CandidateActions";
import { DocIntakeForm } from "../../../components/doc/DocIntakeForm";
import { DocSettingsModal } from "../../../components/doc/DocSettingsModal";
import { DocDossierDetail } from "../../../components/doc/DocDossierDetail";
import { DocEmailComposer } from "../../../components/doc/DocEmailComposer";
import DocSyncIndicator, { DocSyncAviso } from "../../../components/doc/DocSyncIndicator";
import { CountUp, Skeleton, useDocMotion } from "../../../components/doc/DocMotion";
import { printModule } from "../../../lib/print";
import { setSettings, useDocStore, type Dossier } from "../../../lib/docStore";
import { dossierReport } from "../../../lib/docReport";
import { dossierYear, DOC_ORDEN_LABELS, type DocOrden } from "../../../lib/doc/docSchema";
import { useConfig, activeTemplateFor } from "../../../lib/configStore";

type EstadoFiltro = "todos" | "completo" | "al_dia" | "en_proceso" | "atrasado";

const ESTADOS: { id: EstadoFiltro; etiqueta: string }[] = [
  { id: "todos", etiqueta: "Todos" },
  { id: "atrasado", etiqueta: "Atrasados" },
  { id: "en_proceso", etiqueta: "En proceso" },
  { id: "al_dia", etiqueta: "Al día" },
  { id: "completo", etiqueta: "Completos" },
];

/**
 * VISTA LOCAL — el módulo tal como funcionaba antes del modelo normalizado.
 *
 * ── Por qué sigue existiendo ─────────────────────────────────────────────────
 * Esta vista trabaja contra el almacén local (`lib/docStore`), que guarda los
 * expedientes en el propio equipo y los sincroniza con el libro cuando hay
 * backend. Sigue siendo la única forma de trabajar cuando el backend de
 * Documentación NO está desplegado: si la consola nueva fuera la única puerta,
 * quien todavía no lo tiene publicado se quedaría sin módulo.
 *
 * Está intacta a propósito —solo se movió de carpeta— para que la regresión sea
 * comprobable: las tres vistas, los filtros, el alta, el detalle, los avisos y la
 * impresión funcionan exactamente como antes. Cuando el libro esté migrado, la
 * consola cubre todo esto con datos del servidor y esta vista queda como red de
 * seguridad y como lector de lo que hubiera quedado sin sincronizar.
 *
 * ── Por qué hay tres vistas ─────────────────────────────────────────────────
 * La versión anterior a esta era una rejilla plana de tarjetas ordenada por fecha.
 * Con doscientos ingresos al año eso obliga a recorrerla entera para encontrar a
 * quien le faltan dos papeles. Las tarjetas siguen siendo la vista por defecto
 * porque muestran el avance de un vistazo, pero conviven con una tabla —que
 * reproduce las columnas del libro, para quien viene de Excel— y un tablero por
 * estado, útil para repartir el trabajo del día.
 */
export function VistaLocal() {
  const { dossiers, settings } = useDocStore();
  const config = useConfig();
  const m = useDocMotion();

  // El formato de correo activo (gestionado en Configuración general) manda
  // sobre asunto y cuerpo; la cadencia y las cuentas son locales al módulo.
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
  const [estado, setEstado] = useState<EstadoFiltro>("todos");
  const [anio, setAnio] = useState<number | null>(null);
  const [gerencia, setGerencia] = useState<string>("");
  const [verFiltros, setVerFiltros] = useState(false);
  const [cargando, setCargando] = useState(true);

  // Un respiro muy breve antes de pintar: evita el parpadeo de "sin
  // expedientes" mientras el almacenamiento local se lee.
  useEffect(() => {
    const t = setTimeout(() => setCargando(false), 220);
    return () => clearTimeout(t);
  }, []);

  const list = useMemo(() => Object.values(dossiers), [dossiers]);

  /** Informe por expediente, calculado una sola vez por render. */
  const informes = useMemo(() => {
    const map = new Map<string, ReturnType<typeof dossierReport>>();
    for (const d of list) map.set(d.identificador, dossierReport(d, settings.intervalDays));
    return map;
  }, [list, settings.intervalDays]);

  const anios = useMemo(() => {
    const set = new Set<number>();
    for (const d of list) set.add(dossierYear(d));
    return [...set].sort((a, b) => b - a);
  }, [list]);

  const gerencias = useMemo(() => {
    const set = new Set<string>();
    for (const d of list) if (d.gerencia) set.add(d.gerencia);
    return [...set].sort();
  }, [list]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    let arr = list.filter((d) => {
      if (!settings.mostrarHeredados && d.heredada) return false;
      if (anio !== null && dossierYear(d) !== anio) return false;
      if (gerencia && d.gerencia !== gerencia) return false;
      if (estado !== "todos" && informes.get(d.identificador)?.health !== estado) return false;
      if (
        q &&
        !d.nombre.toLowerCase().includes(q) &&
        !d.identificador.toLowerCase().includes(q) &&
        !(d.cargo ?? "").toLowerCase().includes(q) &&
        !(d.agencia ?? "").toLowerCase().includes(q)
      )
        return false;
      return true;
    });

    const av = (d: Dossier) => informes.get(d.identificador)?.completionPct ?? 0;
    const dias = (d: Dossier) => informes.get(d.identificador)?.daysSince ?? 0;

    arr = [...arr];
    switch (settings.ordenarPor as DocOrden) {
      case "antiguo":
        arr.sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
        break;
      case "nombre":
        arr.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
        break;
      case "avance_asc":
        arr.sort((a, b) => av(a) - av(b));
        break;
      case "avance_desc":
        arr.sort((a, b) => av(b) - av(a));
        break;
      case "atraso":
        arr.sort((a, b) => dias(b) - dias(a));
        break;
      default:
        arr.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    }
    return arr;
  }, [list, query, anio, gerencia, estado, informes, settings.ordenarPor, settings.mostrarHeredados]);

  /** Indicadores de la franja superior. */
  const kpis = useMemo(() => {
    let completos = 0;
    let pendientes = 0;
    let suma = 0;
    for (const d of filtered) {
      const r = informes.get(d.identificador);
      if (!r) continue;
      if (r.completionPct >= 100) completos++;
      pendientes += r.faltantes.length;
      suma += r.completionPct;
    }
    return {
      personas: filtered.length,
      completos,
      pendientes,
      avance: filtered.length ? Math.round(suma / filtered.length) : 0,
    };
  }, [filtered, informes]);

  /** Agrupación para la vista de tarjetas. */
  const grupos = useMemo(() => {
    if (settings.agruparPor === "ninguna") return [{ titulo: "", items: filtered }];

    const map = new Map<string, Dossier[]>();
    for (const d of filtered) {
      let clave = "Sin definir";
      if (settings.agruparPor === "estado")
        clave = informes.get(d.identificador)?.healthLabel ?? "Sin definir";
      else if (settings.agruparPor === "gerencia") clave = d.gerencia || "Sin gerencia";
      else if (settings.agruparPor === "agencia") clave = d.agencia || "Sin oficina";
      else if (settings.agruparPor === "mes") {
        const f = d.fechaIngreso || d.createdAt;
        clave = f
          ? new Date(f).toLocaleDateString("es-BO", { month: "long", year: "numeric" })
          : "Sin fecha";
      }
      const bucket = map.get(clave) ?? [];
      bucket.push(d);
      map.set(clave, bucket);
    }
    return [...map.entries()].map(([titulo, items]) => ({ titulo, items }));
  }, [filtered, settings.agruparPor, informes]);

  const dueToday = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return list.filter((d) => {
      const r = informes.get(d.identificador);
      return !!r && r.faltantes.length > 0 && r.nextReminder !== null && r.nextReminder <= today;
    });
  }, [list, informes]);

  const autoDossier = compose ? dossiers[compose.id] : null;
  const autoReport = autoDossier ? dossierReport(autoDossier, settings.intervalDays) : null;
  const hayFiltro = estado !== "todos" || anio !== null || !!gerencia || !!query;
  const compacta = settings.densidad === "compacta";

  return (
    <div
      className="space-y-5"
      style={{ scrollBehavior: settings.scrollSuave && m.activo ? "smooth" : "auto" }}
    >
      {/* Barra de herramientas ---------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="glass flex min-w-[14rem] flex-1 items-center gap-2 rounded-2xl px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-cyan-400/70">
          <Search className="h-4 w-4 shrink-0 text-ink-soft" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, cargo u oficina…"
            className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Limpiar búsqueda">
              <X className="h-3.5 w-3.5 text-ink-faint hover:text-ink" />
            </button>
          )}
        </div>

        {/* Selector de vista */}
        <div className="flex gap-0.5 rounded-full fill-soft p-1 ring-1 ring-[color:var(--hairline)]">
          {(
            [
              { id: "tarjetas", icono: LayoutGrid, titulo: "Tarjetas" },
              { id: "tabla", icono: Table2, titulo: "Tabla" },
              { id: "tablero", icono: Rows3, titulo: "Tablero" },
            ] as const
          ).map((v) => {
            const activa = settings.vista === v.id;
            const Icono = v.icono;
            return (
              <button
                key={v.id}
                type="button"
                title={v.titulo}
                aria-label={v.titulo}
                onClick={() => setSettings({ vista: v.id })}
                className={`relative grid h-8 w-9 place-items-center rounded-full transition-colors ${
                  activa ? "text-white" : "text-ink-soft hover:text-ink"
                }`}
              >
                {activa && (
                  <motion.span
                    layoutId="doc-vista-activa"
                    className="absolute inset-0 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa]"
                    transition={m.spring}
                  />
                )}
                <Icono className="relative h-4 w-4" />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setVerFiltros((v) => !v)}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold ring-1 transition-all active:scale-95 ${
            hayFiltro
              ? "bg-gradient-to-br from-[#00b0d8]/20 to-[#005baa]/20 text-ink ring-cyan-400/40"
              : "fill-softer text-ink ring-[color:var(--hairline)] hover:fill-soft"
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Filtros</span>
        </button>

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
          <span className="hidden sm:inline">Configuración</span>
        </button>

        <motion.button
          type="button"
          onClick={() => setIntakeOpen(true)}
          whileHover={m.activo ? { y: -3, scale: 1.03 } : undefined}
          whileTap={m.activo ? { scale: 0.96 } : undefined}
          transition={m.spring}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-5 py-2.5 text-sm font-bold text-white shadow-glass ring-1 ring-white/30"
        >
          <FolderPlus className="h-4 w-4" />
          Registrar documentación
        </motion.button>
      </div>

      {/* Estado de conexion + indicadores ------------------------------ */}
      <div className="grid gap-3 no-print sm:grid-cols-[1fr_auto]">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi etiqueta="Personas" valor={kpis.personas} />
          <Kpi etiqueta="Completos" valor={kpis.completos} tono="text-emerald-500" />
          <Kpi etiqueta="Docs. pendientes" valor={kpis.pendientes} tono="text-amber-500" />
          <Kpi etiqueta="Avance medio" valor={kpis.avance} sufijo="%" />
        </div>
        <DocSyncIndicator onAbrirMantenimiento={() => setSettingsOpen(true)} />
      </div>

      {/* Filtros -------------------------------------------------------- */}
      <AnimatePresence initial={false}>
        {verFiltros && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={m.suave}
            className="overflow-hidden no-print"
          >
            <div className="glass space-y-3 rounded-2xl p-3.5">
              <Fila titulo="Estado">
                {ESTADOS.map((e) => (
                  <Chip
                    key={e.id}
                    activo={estado === e.id}
                    onClick={() => setEstado(e.id)}
                    texto={e.etiqueta}
                  />
                ))}
              </Fila>

              {anios.length > 1 && (
                <Fila titulo="Año de ingreso">
                  <Chip activo={anio === null} onClick={() => setAnio(null)} texto="Todos" />
                  {anios.map((a) => (
                    <Chip
                      key={a}
                      activo={anio === a}
                      onClick={() => setAnio(a)}
                      texto={String(a)}
                    />
                  ))}
                </Fila>
              )}

              {gerencias.length > 1 && (
                <Fila titulo="Gerencia">
                  <Chip activo={!gerencia} onClick={() => setGerencia("")} texto="Todas" />
                  {gerencias.map((g) => (
                    <Chip
                      key={g}
                      activo={gerencia === g}
                      onClick={() => setGerencia(g)}
                      texto={g}
                    />
                  ))}
                </Fila>
              )}

              <Fila titulo="Ordenar por">
                {Object.entries(DOC_ORDEN_LABELS).map(([clave, etiqueta]) => (
                  <Chip
                    key={clave}
                    activo={settings.ordenarPor === clave}
                    onClick={() => setSettings({ ordenarPor: clave as DocOrden })}
                    texto={etiqueta}
                  />
                ))}
              </Fila>

              {hayFiltro && (
                <button
                  type="button"
                  onClick={() => {
                    setEstado("todos");
                    setAnio(null);
                    setGerencia("");
                    setQuery("");
                  }}
                  className="text-xs font-bold text-[#00b0d8] hover:underline"
                >
                  Quitar todos los filtros
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Avisos de hoy -------------------------------------------------- */}
      {settings.autoSendEnabled && dueToday.length > 0 && (
        <motion.div
          initial={m.activo ? { opacity: 0, y: -8 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={m.suave}
          className="flex flex-wrap items-center gap-3 rounded-3xl bg-gradient-to-r from-[#00b0d8]/15 to-[#005baa]/15 px-4 py-3 ring-1 ring-cyan-400/30 no-print"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white shadow-glass ring-1 ring-white/30">
            <BellRing className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink">
              {dueToday.length} aviso(s) programado(s) para hoy
            </p>
            <p className="text-xs text-ink-soft wrap-words">
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

      {/* Contenido ------------------------------------------------------ */}
      {cargando ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-52 rounded-3xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          title="Sin expedientes de documentación"
          message="Registre la documentación de una persona contratada para iniciar el seguimiento. Si ya tenía datos guardados en este navegador, recúpere los desde Configuración › Datos."
        />
      ) : filtered.length === 0 ? (
        <EmptyState message="No hay expedientes que coincidan con los filtros aplicados." />
      ) : settings.vista === "tabla" ? (
        <TablaExpedientes
          items={filtered}
          informes={informes}
          compacta={compacta}
          onOpen={setDetailId}
        />
      ) : settings.vista === "tablero" ? (
        <Tablero
          items={filtered}
          informes={informes}
          onOpen={setDetailId}
          onCompose={(id) => setCompose({ id, kind: "manual" })}
        />
      ) : (
        <div className="space-y-6">
          {grupos.map((g) => (
            <section key={g.titulo || "todos"}>
              {g.titulo && (
                <h3 className="mb-2.5 flex items-center gap-2 text-sm font-black text-ink">
                  {g.titulo}
                  <span className="rounded-full fill-soft px-2 py-0.5 text-[0.7rem] font-bold text-ink-soft">
                    {g.items.length}
                  </span>
                </h3>
              )}
              <div
                className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${
                  compacta ? "xl:grid-cols-4" : "xl:grid-cols-3"
                }`}
              >
                <AnimatePresence initial={false} mode="popLayout">
                  {g.items.map((d, i) => (
                    <DossierCard
                      key={d.identificador}
                      dossier={d}
                      report={informes.get(d.identificador)!}
                      index={i}
                      compacta={compacta}
                      onOpen={() => setDetailId(d.identificador)}
                      onCompose={() => setCompose({ id: d.identificador, kind: "manual" })}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          ))}
        </div>
      )}

      <DocSyncAviso />

      <DocIntakeForm
        open={intakeOpen}
        onClose={() => setIntakeOpen(false)}
        onCreated={(id) => setDetailId(id)}
      />
      <DocSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
      />
      <DocDossierDetail
        identificador={detailId}
        settings={settings}
        onClose={() => setDetailId(null)}
      />
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

/* ------------------------------------------------------------------ */
/* Piezas auxiliares                                                   */
/* ------------------------------------------------------------------ */

function Kpi({
  etiqueta,
  valor,
  tono = "text-ink",
  sufijo,
}: {
  etiqueta: string;
  valor: number;
  tono?: string;
  sufijo?: string;
}) {
  return (
    <div className="glass rounded-2xl px-3 py-2.5">
      <p className={`text-xl font-black leading-none ${tono}`}>
        <CountUp value={valor} sufijo={sufijo} />
      </p>
      <p className="mt-1 text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">
        {etiqueta}
      </p>
    </div>
  );
}

function Fila({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[0.65rem] font-bold uppercase tracking-wide text-ink-faint">
        {titulo}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  activo,
  onClick,
  texto,
}: {
  activo: boolean;
  onClick: () => void;
  texto: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition ${
        activo
          ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white ring-white/30"
          : "fill-softer text-ink-soft ring-[color:var(--hairline)] hover:fill-soft"
      }`}
    >
      {texto}
    </button>
  );
}

type Informe = ReturnType<typeof dossierReport>;

function DossierCard({
  dossier,
  report: r,
  index,
  compacta,
  onOpen,
  onCompose,
}: {
  dossier: Dossier;
  report: Informe;
  index: number;
  compacta: boolean;
  onOpen: () => void;
  onCompose: () => void;
}) {
  const m = useDocMotion();

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
      layout={m.activo}
      initial={m.activo ? { opacity: 0, y: 18, scale: 0.97 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ ...m.spring, delay: m.activo ? Math.min(index * 0.035, 0.35) : 0 }}
      whileHover={m.activo ? { y: -4 } : undefined}
      className={`glass glow liquid-streak flex cursor-pointer flex-col rounded-3xl print-avoid-break ${
        compacta ? "p-3" : "p-4"
      }`}
      onClick={onOpen}
    >
      <div className="flex items-center gap-3">
        <Avatar name={dossier.nombre} seed={dossier.identificador} size={compacta ? "sm" : "md"} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold text-ink">{dossier.nombre}</h3>
          <p className="truncate text-xs text-ink-soft">
            {dossier.cargo || "Cargo no especificado"}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[0.7rem] font-black ring-1 ${r.healthTone}`}
        >
          {r.healthLabel}
        </span>
      </div>

      {!compacta && (
        <div className="mt-2 flex justify-end no-print" onClick={(e) => e.stopPropagation()}>
          <CandidateActions id={dossier.identificador} name={dossier.nombre} />
        </div>
      )}

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="font-semibold text-ink-soft">Avance</span>
          <span className="font-black text-ink">
            <CountUp value={r.completionPct} sufijo="%" />
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full fill-soft">
          <motion.div
            initial={m.activo ? { width: 0 } : false}
            animate={{ width: `${r.completionPct}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
            className={`h-full rounded-full bg-gradient-to-r ${barColor}`}
          />
        </div>
      </div>

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

/**
 * Vista de tabla.
 *
 * Reproduce el orden de columnas del libro para que quien viene de Excel
 * reconozca de inmediato lo que está mirando.
 */
function TablaExpedientes({
  items,
  informes,
  compacta,
  onOpen,
}: {
  items: Dossier[];
  informes: Map<string, Informe>;
  compacta: boolean;
  onOpen: (id: string) => void;
}) {
  const m = useDocMotion();
  const alto = compacta ? "py-1.5" : "py-2.5";

  return (
    <div className="glass overflow-hidden rounded-3xl">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] text-left text-sm">
          <thead>
            <tr className="border-b border-[color:var(--hairline)] text-[0.7rem] uppercase tracking-wide text-ink-faint">
              <th className={`px-4 ${alto} font-bold`}>Nombre</th>
              <th className={`px-3 ${alto} font-bold`}>Cargo</th>
              <th className={`px-3 ${alto} font-bold`}>Oficina</th>
              <th className={`px-3 ${alto} font-bold`}>Ingreso</th>
              <th className={`px-3 ${alto} font-bold`}>Avance</th>
              <th className={`px-3 ${alto} font-bold`}>Estado</th>
              <th className={`px-3 ${alto} text-right font-bold`}>Pend.</th>
            </tr>
          </thead>
          <tbody>
            {items.map((d, i) => {
              const r = informes.get(d.identificador);
              if (!r) return null;
              return (
                <motion.tr
                  key={d.identificador}
                  initial={m.activo ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  transition={{ ...m.suave, delay: m.activo ? Math.min(i * 0.012, 0.3) : 0 }}
                  onClick={() => onOpen(d.identificador)}
                  className="cursor-pointer border-b border-[color:var(--hairline)] transition-colors last:border-0 hover:fill-soft"
                >
                  <td className={`px-4 ${alto} font-semibold text-ink`}>{d.nombre}</td>
                  <td className={`px-3 ${alto} text-ink-soft`}>{d.cargo || "—"}</td>
                  <td className={`px-3 ${alto} text-ink-soft`}>{d.agencia || "—"}</td>
                  <td className={`px-3 ${alto} text-ink-soft`}>{d.fechaIngreso || "—"}</td>
                  <td className={`px-3 ${alto}`}>
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-16 overflow-hidden rounded-full fill-soft">
                        <span
                          className="block h-full rounded-full bg-gradient-to-r from-[#00b0d8] to-[#005baa]"
                          style={{ width: `${r.completionPct}%` }}
                        />
                      </span>
                      <span className="text-xs font-bold text-ink">{r.completionPct}%</span>
                    </div>
                  </td>
                  <td className={`px-3 ${alto}`}>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.65rem] font-black ring-1 ${r.healthTone}`}
                    >
                      {r.healthLabel}
                    </span>
                  </td>
                  <td className={`px-3 ${alto} text-right font-bold text-ink`}>
                    {r.faltantes.length}
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Tablero por estado: útil para repartir el trabajo del día. */
function Tablero({
  items,
  informes,
  onOpen,
  onCompose,
}: {
  items: Dossier[];
  informes: Map<string, Informe>;
  onOpen: (id: string) => void;
  onCompose: (id: string) => void;
}) {
  const m = useDocMotion();

  const columnas = useMemo(() => {
    const orden: { id: string; titulo: string; tono: string }[] = [
      { id: "atrasado", titulo: "Atrasados", tono: "text-rose-500" },
      { id: "en_proceso", titulo: "En proceso", tono: "text-amber-500" },
      { id: "al_dia", titulo: "Al día", tono: "text-[#00b0d8]" },
      { id: "completo", titulo: "Completos", tono: "text-emerald-500" },
    ];
    return orden.map((c) => ({
      ...c,
      items: items.filter((d) => informes.get(d.identificador)?.health === c.id),
    }));
  }, [items, informes]);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {columnas.map((c) => (
        <div key={c.id} className="glass rounded-3xl p-3">
          <div className="mb-2.5 flex items-center justify-between">
            <h3 className={`text-sm font-black ${c.tono}`}>{c.titulo}</h3>
            <span className="rounded-full fill-soft px-2 py-0.5 text-[0.7rem] font-bold text-ink-soft">
              {c.items.length}
            </span>
          </div>

          <div className="space-y-2">
            {c.items.length === 0 && (
              <p className="rounded-2xl border border-dashed border-[color:var(--hairline)] px-3 py-4 text-center text-[0.7rem] text-ink-faint">
                Sin expedientes
              </p>
            )}

            {c.items.map((d, i) => {
              const r = informes.get(d.identificador);
              if (!r) return null;
              return (
                <motion.div
                  key={d.identificador}
                  layout={m.activo}
                  initial={m.activo ? { opacity: 0, y: 8 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...m.suave, delay: m.activo ? Math.min(i * 0.02, 0.25) : 0 }}
                  onClick={() => onOpen(d.identificador)}
                  className="cursor-pointer rounded-2xl fill-soft p-2.5 ring-1 ring-[color:var(--hairline)] transition hover:fill-softer"
                >
                  <div className="flex items-start gap-2">
                    <Avatar name={d.nombre} seed={d.identificador} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-ink">{d.nombre}</p>
                      <p className="truncate text-[0.65rem] text-ink-faint">{d.cargo || "—"}</p>
                    </div>
                    <button
                      type="button"
                      aria-label="Enviar aviso"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCompose(d.identificador);
                      }}
                      className="no-print grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-faint transition hover:text-ink"
                    >
                      <Mail className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full fill-softer">
                    <span
                      className="block h-full rounded-full bg-gradient-to-r from-[#00b0d8] to-[#005baa]"
                      style={{ width: `${r.completionPct}%` }}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
