import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Database,
  Eye,
  Info,
  Link2,
  Settings2,
  Wrench,
} from "lucide-react";
import { Modal } from "../Modal";
import { TextField, SegmentedField } from "../form/Fields";
import { comprobarConexion, setSettings, useDocSync, type DocSettings } from "../../lib/docStore";
import {
  DOC_AGRUPACION_LABELS,
  DOC_ANIMACION_LABELS,
  DOC_COLOR_SIGNIFICADO,
  DOC_DENSIDAD_LABELS,
  DOC_ORDEN_LABELS,
  DOC_TABLE_COLUMNS,
  DOC_VISTA_LABELS,
  type DocAgrupacion,
  type DocAnimaciones,
  type DocDensidad,
  type DocOrden,
  type DocVista,
} from "../../lib/doc/docSchema";
import DocMaintenancePanel from "./DocMaintenancePanel";
import DocBackupPanel from "./DocBackupPanel";
import DocSyncIndicator from "./DocSyncIndicator";
import { useDocMotion } from "./DocMotion";

interface DocSettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: DocSettings;
}

const PLACEHOLDERS = [
  "{nombre}",
  "{cargo}",
  "{faltantes}",
  "{dias}",
  "{fecha_ingreso}",
  "{total}",
  "{presentados}",
  "{faltan}",
  "{avance}",
];

type Pestana = "avisos" | "vista" | "conexion" | "mantenimiento" | "datos";

const PESTANAS: { id: Pestana; etiqueta: string; icono: typeof Bell }[] = [
  { id: "avisos", etiqueta: "Avisos", icono: Bell },
  { id: "vista", etiqueta: "Visualización", icono: Eye },
  { id: "conexion", etiqueta: "Conexión", icono: Link2 },
  { id: "mantenimiento", etiqueta: "Mantenimiento", icono: Wrench },
  { id: "datos", etiqueta: "Datos", icono: Database },
];

/**
 * Configuración del módulo de Documentación.
 *
 * Antes era una sola columna dedicada a las plantillas de correo. Se reparte en
 * cinco asuntos que no tienen nada que ver entre sí, porque mezclarlos obligaba
 * a recorrer todo el formulario para cambiar el intervalo de un recordatorio.
 *
 * Aquí aterrizan también las dos piezas que antes exigían salir de la web: pegar
 * la URL del Apps Script y reparar el libro sin abrir el editor de Google.
 */
export function DocSettingsModal({ open, onClose, settings }: DocSettingsModalProps) {
  const [pestana, setPestana] = useState<Pestana>("avisos");
  const [urlBorrador, setUrlBorrador] = useState(settings.scriptUrl);
  const sync = useDocSync();
  const m = useDocMotion();

  const guardarUrl = () => {
    setSettings({ scriptUrl: urlBorrador.trim() });
    void comprobarConexion();
  };

  return (
    <Modal
      open={open}
      onRequestClose={onClose}
      size="max-w-3xl"
      ariaLabel="Configuración de Documentación"
    >
      {/* Cabecera */}
      <div className="flex items-center gap-3 rounded-t-3xl border-b border-[color:var(--hairline)] bg-[color:var(--glass-bg-heavy)] px-5 py-4 backdrop-blur-xl sm:px-7">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#00b0d8] to-[#005baa] shadow-glass ring-1 ring-white/30">
          <Settings2 className="h-6 w-6 text-white drop-shadow-md" />
        </div>
        <div className="min-w-0 flex-1 pr-10">
          <h2 className="truncate text-lg font-black tracking-tight text-ink sm:text-xl">
            Configuración de Documentación
          </h2>
          <p className="text-xs text-ink-soft">
            Avisos, apariencia, conexión con el libro y mantenimiento.
          </p>
        </div>
      </div>

      {/* Pestanas */}
      <div className="flex gap-1 overflow-x-auto border-b border-[color:var(--hairline)] bg-[color:var(--glass-bg-heavy)] px-3 backdrop-blur-xl sm:px-5">
        {PESTANAS.map((p) => {
          const activa = pestana === p.id;
          const Icono = p.icono;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPestana(p.id)}
              className={`relative shrink-0 px-3 py-2.5 text-xs font-bold transition-colors ${
                activa ? "text-ink" : "text-ink-faint hover:text-ink-soft"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Icono className="h-3.5 w-3.5" />
                {p.etiqueta}
              </span>
              {activa && (
                <motion.span
                  layoutId="doc-settings-tab"
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-[#00b0d8] to-[#005baa]"
                  transition={m.spring}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Cuerpo */}
      <div className="max-h-[calc(100vh-16rem)] overflow-y-auto px-5 py-6 sm:px-7">
        <AnimatePresence mode="wait">
          <motion.div
            key={pestana}
            initial={m.activo ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={m.activo ? { opacity: 0, y: -8 } : undefined}
            transition={m.suave}
          >
            {/* --------------------------------------------------- AVISOS */}
            {pestana === "avisos" && (
              <div className="space-y-5">
                <SegmentedField
                  label="Proveedor de correo"
                  value={settings.provider === "gmail" ? "Gmail" : "Outlook"}
                  onChange={(v) => setSettings({ provider: v === "Gmail" ? "gmail" : "outlook" })}
                  options={["Gmail", "Outlook"]}
                />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <TextField
                    label="Cuenta remitente"
                    hint="Desde qué cuenta se envía"
                    value={settings.fromAccount}
                    onChange={(v) => setSettings({ fromAccount: v })}
                    placeholder="reclutamiento@bdp.com"
                  />
                  <TextField
                    label="Correo en copia (CC)"
                    hint="Auxiliar a cargo"
                    value={settings.ccEmail}
                    onChange={(v) => setSettings({ ccEmail: v })}
                    placeholder="auxiliar@bdp.com"
                  />
                  <TextField
                    label="Cada cuántos días"
                    type="number"
                    hint="Cadencia de recordatorios"
                    value={String(settings.intervalDays)}
                    onChange={(v) => setSettings({ intervalDays: Math.max(1, Number(v) || 1) })}
                  />
                </div>

                <div className="space-y-2">
                  <Toggle
                    title="Avisos automáticos"
                    subtitle="El sistema propone recordatorios según la cadencia."
                    checked={settings.autoSendEnabled}
                    onChange={(v) => setSettings({ autoSendEnabled: v })}
                  />
                  <Toggle
                    title="Pedir confirmación antes de enviar"
                    subtitle="Muestra la vista previa y avisa antes de cada envío automático."
                    checked={settings.requireConfirmation}
                    onChange={(v) => setSettings({ requireConfirmation: v })}
                  />
                </div>

                <TextField
                  label="Asunto (plantilla)"
                  value={settings.subjectTemplate}
                  onChange={(v) => setSettings({ subjectTemplate: v })}
                />

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    Cuerpo (plantilla)
                  </span>
                  <textarea
                    value={settings.bodyTemplate}
                    rows={11}
                    onChange={(e) => setSettings({ bodyTemplate: e.target.value })}
                    className="glass w-full resize-y rounded-xl px-3.5 py-2.5 text-sm leading-relaxed text-ink outline-none focus-within:ring-2 focus-within:ring-cyan-400/70"
                  />
                </label>

                <div className="flex flex-wrap items-start gap-2 rounded-2xl fill-soft px-4 py-3 text-xs text-ink-soft ring-1 ring-[color:var(--hairline)]">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                  <div>
                    <span className="font-semibold text-ink">Variables disponibles:</span>{" "}
                    {PLACEHOLDERS.map((p) => (
                      <code
                        key={p}
                        className="mx-0.5 rounded bg-[color:var(--fill-2)] px-1 py-0.5 text-[0.7rem] text-ink"
                      >
                        {p}
                      </code>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ---------------------------------------------- VISUALIZACION */}
            {pestana === "vista" && (
              <div className="space-y-5">
                <Opciones
                  label="Vista predeterminada"
                  valor={settings.vista}
                  opciones={DOC_VISTA_LABELS}
                  onChange={(v) => setSettings({ vista: v as DocVista })}
                />
                <Opciones
                  label="Densidad"
                  valor={settings.densidad}
                  opciones={DOC_DENSIDAD_LABELS}
                  onChange={(v) => setSettings({ densidad: v as DocDensidad })}
                />
                <Opciones
                  label="Animaciones"
                  valor={settings.animaciones}
                  opciones={DOC_ANIMACION_LABELS}
                  onChange={(v) => setSettings({ animaciones: v as DocAnimaciones })}
                  ayuda="Si el sistema operativo pide reducir el movimiento, se respeta esa preferencia por encima de esta."
                />
                <Opciones
                  label="Agrupar por"
                  valor={settings.agruparPor}
                  opciones={DOC_AGRUPACION_LABELS}
                  onChange={(v) => setSettings({ agruparPor: v as DocAgrupacion })}
                />
                <Opciones
                  label="Ordenar por"
                  valor={settings.ordenarPor}
                  opciones={DOC_ORDEN_LABELS}
                  onChange={(v) => setSettings({ ordenarPor: v as DocOrden })}
                />

                <div className="space-y-2">
                  <Toggle
                    title="Scroll suave"
                    subtitle="Desplazamiento animado al navegar entre secciones."
                    checked={settings.scrollSuave}
                    onChange={(v) => setSettings({ scrollSuave: v })}
                  />
                  <Toggle
                    title="Efectos de fondo"
                    subtitle="Degradados y brillos. Desactivar mejora el rendimiento en equipos lentos."
                    checked={settings.efectosFondo}
                    onChange={(v) => setSettings({ efectosFondo: v })}
                  />
                  <Toggle
                    title="Mostrar filas históricas"
                    subtitle="Ingresos que vienen del Excel original y no tienen checklist detrás."
                    checked={settings.mostrarHeredados}
                    onChange={(v) => setSettings({ mostrarHeredados: v })}
                  />
                </div>

                {/* Columnas de la tabla */}
                <div>
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    Columnas en la vista de tabla
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {DOC_TABLE_COLUMNS.map((c) => {
                      const activa = settings.columnasVisibles.includes(c.clave);
                      return (
                        <button
                          key={c.clave}
                          type="button"
                          disabled={c.fijo}
                          onClick={() => {
                            const actual = settings.columnasVisibles;
                            setSettings({
                              columnasVisibles: activa
                                ? actual.filter((x) => x !== c.clave)
                                : [...actual, c.clave],
                            });
                          }}
                          className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition ${
                            activa
                              ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white ring-white/30"
                              : "fill-softer text-ink-soft ring-[color:var(--hairline)] hover:fill-soft"
                          } ${c.fijo ? "cursor-not-allowed opacity-70" : ""}`}
                        >
                          {c.etiqueta}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Leyenda de colores */}
                <div className="rounded-2xl fill-soft p-4 ring-1 ring-[color:var(--hairline)]">
                  <p className="text-xs font-bold text-ink">Colores del libro</p>
                  <p className="mt-0.5 text-[11px] text-ink-faint">
                    Los mismos que se aplican a cada fila en Google Sheets.
                  </p>
                  <ul className="mt-2.5 space-y-1.5">
                    {DOC_COLOR_SIGNIFICADO.map((c) => (
                      <li key={c.color} className="flex items-start gap-2">
                        <span
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded ring-1 ring-black/10"
                          style={{ backgroundColor: c.color }}
                        />
                        <span className="min-w-0">
                          <span className="block text-[11px] font-semibold text-ink">
                            {c.titulo}
                          </span>
                          <span className="block text-[11px] leading-relaxed text-ink-faint wrap-words">
                            {c.detalle}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* -------------------------------------------------- CONEXION */}
            {pestana === "conexion" && (
              <div className="space-y-5">
                <DocSyncIndicator />

                <div>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
                      URL de la aplicación web (Apps Script)
                    </span>
                    <input
                      value={urlBorrador}
                      onChange={(e) => setUrlBorrador(e.target.value)}
                      placeholder="https://script.google.com/macros/s/…/exec"
                      spellCheck={false}
                      className="glass w-full rounded-xl px-3.5 py-2.5 font-mono text-xs text-ink outline-none placeholder:text-ink-faint focus-within:ring-2 focus-within:ring-cyan-400/70"
                    />
                  </label>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={guardarUrl}
                      disabled={urlBorrador.trim() === settings.scriptUrl}
                      className="rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-4 py-2 text-xs font-bold text-white ring-1 ring-white/30 disabled:opacity-40"
                    >
                      Guardar y probar
                    </button>
                    <button
                      type="button"
                      onClick={() => void comprobarConexion()}
                      className="rounded-full fill-softer px-4 py-2 text-xs font-bold text-ink ring-1 ring-[color:var(--hairline)] transition hover:fill-soft"
                    >
                      Probar de nuevo
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                    Se obtiene al publicar el proyecto de Apps Script como aplicación web. Debe
                    terminar en <code className="text-ink">/exec</code>. Si la cambias, vuelve a
                    ejecutar «Instalar o reparar» desde Mantenimiento.
                  </p>
                </div>

                <div className="space-y-2">
                  <Toggle
                    title="Sincronizar con el libro"
                    subtitle="Al desactivarlo, todo queda solo en este equipo."
                    checked={settings.syncEnabled}
                    onChange={(v) => setSettings({ syncEnabled: v })}
                  />
                </div>

                <TextField
                  label="Comprobar conexión cada (minutos)"
                  type="number"
                  hint="Con qué frecuencia se reintenta enviar lo pendiente"
                  value={String(settings.syncIntervalMin)}
                  onChange={(v) => setSettings({ syncIntervalMin: Math.max(1, Number(v) || 5) })}
                />

                {sync.libro && (
                  <div className="rounded-2xl fill-soft px-4 py-3 text-xs ring-1 ring-[color:var(--hairline)]">
                    <p className="font-semibold text-ink">Libro conectado</p>
                    <p className="mt-0.5 text-ink-soft wrap-words">{sync.libro}</p>
                    {sync.anios.length > 0 && (
                      <p className="mt-1 text-ink-faint">Pestañas: {sync.anios.join(", ")}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* --------------------------------------------- MANTENIMIENTO */}
            {pestana === "mantenimiento" && <DocMaintenancePanel />}

            {/* ----------------------------------------------------- DATOS */}
            {pestana === "datos" && <DocBackupPanel />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Pie */}
      <div className="flex items-center justify-between gap-3 rounded-b-3xl border-t border-[color:var(--hairline)] bg-[color:var(--glass-bg-heavy)] px-5 py-4 backdrop-blur-xl sm:px-7">
        <p className="text-[11px] text-ink-faint">Los cambios se guardan al momento.</p>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-6 py-3 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all hover:-translate-y-0.5 active:scale-95"
        >
          Listo
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

/** Grupo de botones para elegir una opción de un diccionario clave/etiqueta. */
function Opciones({
  label,
  valor,
  opciones,
  onChange,
  ayuda,
}: {
  label: string;
  valor: string;
  opciones: Record<string, string>;
  onChange: (v: string) => void;
  ayuda?: string;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(opciones).map(([clave, etiqueta]) => {
          const activa = valor === clave;
          return (
            <button
              key={clave}
              type="button"
              onClick={() => onChange(clave)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold ring-1 transition ${
                activa
                  ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white ring-white/30"
                  : "fill-softer text-ink-soft ring-[color:var(--hairline)] hover:fill-soft"
              }`}
            >
              {etiqueta}
            </button>
          );
        })}
      </div>
      {ayuda && <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">{ayuda}</p>}
    </div>
  );
}

function Toggle({
  title,
  subtitle,
  checked,
  onChange,
}: {
  title: string;
  subtitle: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={[
        "flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left ring-1 transition-all active:scale-[0.99]",
        checked
          ? "bg-gradient-to-br from-[#00b0d8]/15 to-[#005baa]/15 ring-cyan-400/40"
          : "fill-softer ring-[color:var(--hairline)] hover:fill-soft",
      ].join(" ")}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-ink">{title}</div>
        <div className="text-xs text-ink-faint wrap-words">{subtitle}</div>
      </div>
      <span
        className={[
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked
            ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa]"
            : "fill-soft ring-1 ring-[color:var(--hairline)]",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-0.5 grid h-5 w-5 place-items-center rounded-full bg-white shadow transition-all",
            checked ? "left-[1.4rem]" : "left-0.5",
          ].join(" ")}
        />
      </span>
    </button>
  );
}
