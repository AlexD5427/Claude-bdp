import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Building2,
  SlidersHorizontal,
  Palette,
  Plug,
  Mail,
  Plus,
  Copy,
  Pencil,
  Trash2,
  RefreshCcw,
  CheckCircle2,
  XCircle,
  Loader2,
  RotateCcw,
  Trophy,
  Gauge,
  Sparkles,
  Building,
} from "lucide-react";
import { usePointerGlow } from "../hooks/usePointerGlow";
import { TextField, SegmentedField, SelectField } from "../components/form/Fields";
import { Toggle, RangeField, StepperField } from "../components/form/Controls";
import { EmailTemplateEditor } from "../components/config/EmailTemplateEditor";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useTheme } from "../context/ThemeContext";
import { SCRIPT_URL } from "../constants";
import {
  useConfig,
  setConfig,
  resetConfig,
  createTemplate,
  duplicateTemplate,
  removeTemplate,
  toggleTemplateActive,
  EMAIL_CATEGORY_LABELS,
  EMAIL_CATEGORY_ORDER,
  type EmailCategory,
  type EmailTemplate,
  type ThreeQuality,
} from "../lib/configStore";

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = {
  hidden: { opacity: 0, y: 20, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 230, damping: 24 } },
};

/**
 * MÓDULO — Configuración.
 *
 * The control room for the whole system: institutional identity, the
 * evaluation / comparator rules, the visual engine (Liquid Glass + Three.js),
 * the live-data integration and the "Formatos de Correo Activos" library that
 * powers every automated message across the hiring lifecycle. Everything is
 * persisted locally through {@link ../lib/configStore} and applied instantly.
 */
export function Configuracion() {
  const config = useConfig();
  const { theme, setTheme } = useTheme();
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [filter, setFilter] = useState<EmailCategory | "all">("all");
  const [conn, setConn] = useState<"idle" | "testing" | "ok" | "fail">("idle");

  const templates = config.emailTemplates;
  const visibleTemplates = useMemo(
    () => (filter === "all" ? templates : templates.filter((t) => t.category === filter)),
    [templates, filter],
  );
  const activeCount = templates.filter((t) => t.active).length;

  function openEditor(t: EmailTemplate) {
    setEditing(t);
    setEditorOpen(true);
  }
  function addTemplate() {
    const cat: EmailCategory = filter === "all" ? "convocatoria" : filter;
    openEditor(createTemplate(cat));
  }

  async function testConnection() {
    setConn("testing");
    try {
      const res = await fetch(SCRIPT_URL, { method: "GET", redirect: "follow", headers: { Accept: "application/json" } });
      const data = await res.json();
      setConn(res.ok && data && Array.isArray(data.candidatos) ? "ok" : "fail");
    } catch {
      setConn("fail");
    }
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-5">
      {/* ── Institucional ─────────────────────────────────────────── */}
      <Section icon={<Building2 className="h-5 w-5 text-cyan-400" />} title="Identidad institucional" subtitle="Datos que encabezan reportes y firman los correos">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField label="Organización" value={config.orgName} onChange={(v) => setConfig({ orgName: v })} />
          <TextField label="Equipo / Unidad" value={config.teamName} onChange={(v) => setConfig({ teamName: v })} />
          <TextField
            label="Reclutador (firma)"
            hint="Aparece en {reclutador}"
            value={config.reclutador}
            onChange={(v) => setConfig({ reclutador: v })}
            placeholder="Nombre de quien firma los correos"
          />
        </div>
      </Section>

      {/* ── Evaluación y comparador ───────────────────────────────── */}
      <Section icon={<SlidersHorizontal className="h-5 w-5 text-cyan-400" />} title="Evaluación y comparador" subtitle="Reglas de puntaje, orden y ranking en la auditoría comparativa">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <RangeField
            label="Umbral de aprobación (Nota CAP)"
            hint="Puntaje mínimo considerado apto para el puesto."
            value={config.capApprovalThreshold}
            min={40}
            max={100}
            suffix="%"
            onChange={(v) => setConfig({ capApprovalThreshold: v })}
          />
          <RangeField
            label="Tolerancia de empate (CAP)"
            hint="Diferencia máxima de CAP para marcar empate con contorno."
            value={config.tieThreshold}
            min={0}
            max={10}
            step={0.5}
            suffix=" pts"
            onChange={(v) => setConfig({ tieThreshold: v })}
          />
          <StepperField
            label="Máx. candidatos a comparar"
            hint="Columnas simultáneas"
            value={config.maxComparador}
            min={2}
            max={8}
            onChange={(v) => setConfig({ maxComparador: v })}
          />
          <div className="space-y-2">
            <Toggle
              title="Ordenar por Nota CAP"
              subtitle="Mayor puntaje a la izquierda."
              icon={<Trophy className="h-4 w-4" />}
              checked={config.sortByCapDesc}
              onChange={(v) => setConfig({ sortByCapDesc: v })}
            />
            <Toggle
              title="Mostrar ranking"
              subtitle="Medalla 1.º / 2.º / 3.º en cada columna."
              icon={<Sparkles className="h-4 w-4" />}
              checked={config.rankingEnabled}
              onChange={(v) => setConfig({ rankingEnabled: v })}
            />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SegmentedField
            label="Tamaño de papel (impresión)"
            value={config.defaultPaper === "Letter" ? "Carta" : "Oficio"}
            onChange={(v) => setConfig({ defaultPaper: v === "Oficio" ? "Legal" : "Letter" })}
            options={["Carta", "Oficio"]}
          />
          <SegmentedField
            label="Orientación (impresión)"
            value={config.defaultOrientation === "portrait" ? "Vertical" : "Horizontal"}
            onChange={(v) => setConfig({ defaultOrientation: v === "Horizontal" ? "landscape" : "portrait" })}
            options={["Vertical", "Horizontal"]}
          />
        </div>
      </Section>

      {/* ── Apariencia y rendimiento ──────────────────────────────── */}
      <Section icon={<Palette className="h-5 w-5 text-cyan-400" />} title="Apariencia y rendimiento" subtitle="Tema, motor gráfico Liquid Glass 3D y accesibilidad">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SegmentedField
            label="Tema"
            value={theme === "dark" ? "Oscuro" : "Claro"}
            onChange={(v) => setTheme(v === "Oscuro" ? "dark" : "light")}
            options={["Claro", "Oscuro"]}
          />
          <SelectField
            label="Calidad del fondo 3D"
            value={QUALITY_LABELS[config.threeQuality]}
            onChange={(v) => setConfig({ threeQuality: LABEL_TO_QUALITY[v] ?? "auto" })}
            options={Object.values(QUALITY_LABELS)}
          />
          <div className="space-y-2 sm:col-span-2">
            <Toggle
              title="Fondo animado 3D (Three.js)"
              subtitle="Capa WebGL de vidrio líquido optimizada (~60 fps)."
              icon={<Gauge className="h-4 w-4" />}
              checked={config.enableThree}
              onChange={(v) => setConfig({ enableThree: v })}
            />
            <Toggle
              title="Reducir movimiento"
              subtitle="Minimiza animaciones para mayor comodidad y rendimiento."
              checked={config.reduceMotion}
              onChange={(v) => setConfig({ reduceMotion: v })}
            />
          </div>
        </div>
      </Section>

      {/* ── Integraciones ─────────────────────────────────────────── */}
      <Section icon={<Plug className="h-5 w-5 text-cyan-400" />} title="Integraciones" subtitle="Conexión con Evaluar.com y la base de datos en Google Sheets">
        <div className="grid grid-cols-1 gap-3">
          <TextField
            label="Plataforma de evaluación (Evaluar.com)"
            hint="Se inserta como {enlace_evaluar}"
            value={config.evaluarUrl}
            onChange={(v) => setConfig({ evaluarUrl: v })}
            placeholder="https://www.evaluar.com"
          />
          <div className="rounded-2xl fill-softer p-4 ring-1 ring-[color:var(--hairline)]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                Base de datos · Google Apps Script
              </span>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[0.65rem] font-bold text-emerald-500 ring-1 ring-emerald-400/30">
                Solo lectura
              </span>
            </div>
            <code className="block truncate rounded-lg bg-[color:var(--fill-2)] px-3 py-2 text-xs text-ink" title={SCRIPT_URL}>
              {SCRIPT_URL}
            </code>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={testConnection}
                disabled={conn === "testing"}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-4 py-2 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-60"
              >
                {conn === "testing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                Probar conexión
              </button>
              {conn === "ok" && (
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-500">
                  <CheckCircle2 className="h-4 w-4" /> Conexión exitosa
                </span>
              )}
              {conn === "fail" && (
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-rose-500">
                  <XCircle className="h-4 w-4" /> No se pudo conectar
                </span>
              )}
            </div>
          </div>
        </div>
      </Section>

      {/* ── Formatos de correo activos ────────────────────────────── */}
      <Section
        icon={<Mail className="h-5 w-5 text-cyan-400" />}
        title="Formatos de Correo Activos"
        subtitle={`${activeCount} activo(s) · plantillas para cada etapa del proceso`}
        action={
          <button
            type="button"
            onClick={addTemplate}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-4 py-2 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all hover:-translate-y-0.5 active:scale-95 no-print"
          >
            <Plus className="h-4 w-4" />
            Nuevo formato
          </button>
        }
      >
        {/* Category filter chips */}
        <div className="mb-4 flex flex-wrap gap-1.5 no-print">
          <FilterChip label="Todos" active={filter === "all"} onClick={() => setFilter("all")} />
          {EMAIL_CATEGORY_ORDER.map((c) => (
            <FilterChip
              key={c}
              label={EMAIL_CATEGORY_LABELS[c]}
              active={filter === c}
              onClick={() => setFilter(c)}
            />
          ))}
        </div>

        <div className="space-y-2">
          {visibleTemplates.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[color:var(--hairline)] px-4 py-6 text-center text-sm text-ink-faint">
              No hay formatos en esta etapa. Cree uno con “Nuevo formato”.
            </p>
          ) : (
            visibleTemplates.map((t) => (
              <TemplateRow
                key={t.id}
                template={t}
                onEdit={() => openEditor(t)}
                onDuplicate={() => duplicateTemplate(t.id)}
                onDelete={() => setDeleteId(t.id)}
                onToggle={(v) => toggleTemplateActive(t.id, v)}
              />
            ))
          )}
        </div>
      </Section>

      {/* ── Datos ─────────────────────────────────────────────────── */}
      <Section icon={<RotateCcw className="h-5 w-5 text-cyan-400" />} title="Restablecer" subtitle="Vuelve toda la configuración y los formatos a sus valores de fábrica">
        <button
          type="button"
          onClick={() => setResetOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-rose-500/15 px-4 py-2.5 text-sm font-bold text-rose-500 ring-1 ring-rose-400/40 transition-all hover:bg-rose-500/25 active:scale-95"
        >
          <RotateCcw className="h-4 w-4" />
          Restablecer configuración
        </button>
      </Section>

      <EmailTemplateEditor template={editing} open={editorOpen} onClose={() => setEditorOpen(false)} />

      <ConfirmDialog
        open={deleteId !== null}
        title="Eliminar formato"
        message="¿Seguro que desea eliminar este formato de correo? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        tone="danger"
        onConfirm={() => {
          if (deleteId) removeTemplate(deleteId);
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)}
      />
      <ConfirmDialog
        open={resetOpen}
        title="Restablecer configuración"
        message="Se restaurarán todos los ajustes y los formatos de correo a los valores por defecto."
        confirmLabel="Restablecer"
        tone="danger"
        onConfirm={() => {
          resetConfig();
          setResetOpen(false);
        }}
        onCancel={() => setResetOpen(false)}
      />
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */

const QUALITY_LABELS: Record<ThreeQuality, string> = {
  auto: "Automática",
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};
const LABEL_TO_QUALITY: Record<string, ThreeQuality> = Object.fromEntries(
  Object.entries(QUALITY_LABELS).map(([k, v]) => [v, k as ThreeQuality]),
) as Record<string, ThreeQuality>;

function Section({
  icon,
  title,
  subtitle,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { onMouseMove } = usePointerGlow();
  return (
    <motion.section variants={item} onMouseMove={onMouseMove} className="glass glow rounded-3xl p-5 print-avoid-break">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl fill-softer ring-1 ring-[color:var(--hairline)]">
            {icon}
          </span>
          <div>
            <h3 className="text-base font-black tracking-tight text-ink">{title}</h3>
            {subtitle && <p className="text-xs text-ink-soft">{subtitle}</p>}
          </div>
        </div>
        {action}
      </header>
      {children}
    </motion.section>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-all active:scale-95",
        active
          ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white ring-white/40 shadow-glow-cyan"
          : "fill-softer text-ink-soft ring-[color:var(--hairline)] hover:fill-soft",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function TemplateRow({
  template,
  onEdit,
  onDuplicate,
  onDelete,
  onToggle,
}: {
  template: EmailTemplate;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div className="glass flex items-center gap-3 rounded-2xl px-3.5 py-3">
      <span
        className={[
          "grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1",
          template.active
            ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white ring-white/30"
            : "fill-softer text-ink-faint ring-[color:var(--hairline)]",
        ].join(" ")}
      >
        <Building className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-bold text-ink">{template.name}</span>
          {template.system && (
            <span className="shrink-0 rounded-full fill-softer px-2 py-0.5 text-[0.6rem] font-bold text-ink-faint ring-1 ring-[color:var(--hairline)]">
              Sistema
            </span>
          )}
        </div>
        <div className="truncate text-xs text-ink-faint">
          {EMAIL_CATEGORY_LABELS[template.category]} · {template.subject || "Sin asunto"}
        </div>
      </div>

      {/* Active switch */}
      <button
        type="button"
        role="switch"
        aria-checked={template.active}
        aria-label={template.active ? "Desactivar formato" : "Activar formato"}
        onClick={() => onToggle(!template.active)}
        className={[
          "relative h-6 w-11 shrink-0 rounded-full transition-colors no-print",
          template.active ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa]" : "fill-soft ring-1 ring-[color:var(--hairline)]",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
            template.active ? "left-[1.4rem]" : "left-0.5",
          ].join(" ")}
        />
      </button>

      <div className="flex shrink-0 items-center gap-1 no-print">
        <IconBtn label="Editar" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </IconBtn>
        <IconBtn label="Duplicar" onClick={onDuplicate}>
          <Copy className="h-4 w-4" />
        </IconBtn>
        {!template.system && (
          <IconBtn label="Eliminar" danger onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </IconBtn>
        )}
      </div>
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  danger = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={[
        "grid h-9 w-9 place-items-center rounded-xl fill-softer ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-90",
        danger ? "text-rose-500 hover:bg-rose-500/15" : "text-ink-soft",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
