import { useSyncExternalStore } from "react";

/**
 * Dashboard layout store.
 *
 * The executive Dashboard is now a customizable "bento" board: the operator can
 * add or remove indicators, resize each block (1–4 columns) and drag them into
 * a new order. That arrangement is what this store persists (per browser) so it
 * survives reloads. It only stores the *layout* — which widgets, in what order,
 * at what size — while the widgets themselves stay data-driven from the live
 * talent + hiring stores.
 */

export type WidgetSize = 1 | 2 | 3 | 4;
export type WidgetKind = "kpi" | "panel";

/** A widget placed on the board. */
export interface DashWidget {
  id: string;
  size: WidgetSize;
}

/** Catalogue definition for a widget the user can add. */
export interface WidgetDef {
  id: string;
  title: string;
  kind: WidgetKind;
  defaultSize: WidgetSize;
  /** Grouping shown in the "add indicator" picker. */
  group: string;
  /** For KPI widgets: the value key + display metadata. */
  valueKey?: string;
  unit?: string;
  goodWhenUp?: boolean;
  help?: string;
  /** For panel widgets: which panel to render. */
  panel?: "demografia" | "estado" | "nuevas" | "historico";
  /** Icon key resolved to a Lucide icon in the module. */
  icon?: string;
}

/**
 * The full catalogue of dashboard blocks. Hero KPIs render with rich visuals;
 * the compact KPIs are single-value tiles; panels are the charts/lists.
 */
export const WIDGET_CATALOG: WidgetDef[] = [
  // — Hero recruitment KPIs —
  { id: "kpi_calidad", title: "Calidad de Contratación", kind: "kpi", defaultSize: 1, group: "KPIs ejecutivos", valueKey: "calidad_contratacion", unit: "%", goodWhenUp: true, icon: "Award", help: "Desempeño, integración y productividad del nuevo empleado. Aún no conectado a la base de evaluaciones." },
  { id: "kpi_tiempo", title: "Tiempo de Contratación", kind: "kpi", defaultSize: 1, group: "KPIs ejecutivos", valueKey: "tiempo_contratacion", unit: " días", goodWhenUp: false, icon: "Timer", help: "Promedio de días entre el ingreso del postulante y su contratación." },
  { id: "kpi_costo", title: "Costo por Contratación", kind: "kpi", defaultSize: 1, group: "KPIs ejecutivos", valueKey: "costo_contratacion", unit: "", goodWhenUp: false, icon: "DollarSign", help: "Costo total promedio de cubrir una vacante (base externa)." },
  { id: "kpi_rotacion", title: "Tasa de Rotación", kind: "kpi", defaultSize: 1, group: "KPIs ejecutivos", valueKey: "tasa_rotacion", unit: "%", goodWhenUp: false, icon: "RefreshCcw", help: "Contratados que causan baja antes de los 3 meses." },

  // — Compact operational KPIs —
  { id: "kpi_contratados", title: "Contratados", kind: "kpi", defaultSize: 1, group: "Indicadores operativos", valueKey: "contratados", unit: "", goodWhenUp: true, icon: "UserCheck", help: "Personas marcadas como contratadas." },
  { id: "kpi_en_proceso", title: "En Proceso", kind: "kpi", defaultSize: 1, group: "Indicadores operativos", valueKey: "en_proceso", unit: "", goodWhenUp: true, icon: "Workflow", help: "Postulantes actualmente en algún proceso." },
  { id: "kpi_bajas", title: "Bajas", kind: "kpi", defaultSize: 1, group: "Indicadores operativos", valueKey: "bajas", unit: "", goodWhenUp: false, icon: "UserMinus", help: "Personas dadas de baja." },
  { id: "kpi_num_candidatos", title: "Número de Candidatos", kind: "kpi", defaultSize: 1, group: "Indicadores operativos", valueKey: "num_candidatos", unit: "", goodWhenUp: true, icon: "Users2", help: "Total de postulantes en la base." },
  { id: "kpi_procesos", title: "Procesos Activos", kind: "kpi", defaultSize: 1, group: "Indicadores operativos", valueKey: "procesos_activos", unit: "", goodWhenUp: true, icon: "Workflow", help: "Procesos de reclutamiento distintos en curso." },
  { id: "kpi_prom_comp", title: "Promedio Competencias", kind: "kpi", defaultSize: 1, group: "Indicadores operativos", valueKey: "prom_competencias", unit: "%", goodWhenUp: true, icon: "TrendingUp", help: "Media de la Nota Competencias." },
  { id: "kpi_confiables", title: "% Confiables", kind: "kpi", defaultSize: 1, group: "Indicadores operativos", valueKey: "pct_confiables", unit: "%", goodWhenUp: true, icon: "ShieldCheck", help: "Porcentaje de postulantes con confiabilidad 'Confiable'." },

  // — Panels —
  { id: "panel_demografia", title: "Demografía de Empleados", kind: "panel", defaultSize: 2, group: "Paneles", panel: "demografia", icon: "Users2" },
  { id: "panel_estado", title: "Estado de Contratación", kind: "panel", defaultSize: 2, group: "Paneles", panel: "estado", icon: "TrendingUp" },
  { id: "panel_nuevas", title: "Nuevas Adiciones", kind: "panel", defaultSize: 2, group: "Paneles", panel: "nuevas", icon: "UserPlus" },
  { id: "panel_historico", title: "Histórico de Contrataciones", kind: "panel", defaultSize: 2, group: "Paneles", panel: "historico", icon: "TrendingUp" },
];

export function widgetDef(id: string): WidgetDef | undefined {
  return WIDGET_CATALOG.find((w) => w.id === id);
}

/** The default board — mirrors the classic executive Dashboard layout. */
export const DEFAULT_LAYOUT: DashWidget[] = [
  { id: "kpi_calidad", size: 1 },
  { id: "kpi_tiempo", size: 1 },
  { id: "kpi_costo", size: 1 },
  { id: "kpi_rotacion", size: 1 },
  { id: "panel_demografia", size: 2 },
  { id: "panel_estado", size: 2 },
  { id: "panel_nuevas", size: 2 },
  { id: "panel_historico", size: 2 },
];

export interface DashState {
  widgets: DashWidget[];
}

const KEY = "bdp-dashboard-layout";

function load(): DashState {
  if (typeof window === "undefined") return { widgets: [...DEFAULT_LAYOUT] };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { widgets: [...DEFAULT_LAYOUT] };
    const parsed = JSON.parse(raw) as Partial<DashState>;
    const widgets = Array.isArray(parsed.widgets) ? parsed.widgets : null;
    // Keep only widgets that still exist in the catalogue.
    const valid = widgets?.filter((w) => widgetDef(w.id)) ?? [];
    return { widgets: valid.length ? valid : [...DEFAULT_LAYOUT] };
  } catch {
    return { widgets: [...DEFAULT_LAYOUT] };
  }
}

let state: DashState = load();
const listeners = new Set<() => void>();

function emit() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  for (const l of listeners) l();
}

export function addWidget(id: string): void {
  if (state.widgets.some((w) => w.id === id)) return;
  const def = widgetDef(id);
  if (!def) return;
  state = { widgets: [...state.widgets, { id, size: def.defaultSize }] };
  emit();
}

export function removeWidget(id: string): void {
  state = { widgets: state.widgets.filter((w) => w.id !== id) };
  emit();
}

export function setWidgetSize(id: string, size: WidgetSize): void {
  state = { widgets: state.widgets.map((w) => (w.id === id ? { ...w, size } : w)) };
  emit();
}

/** Move the widget at `from` to `to` (reorder by index). */
export function moveWidget(from: number, to: number): void {
  if (from === to || from < 0 || to < 0) return;
  const next = [...state.widgets];
  if (from >= next.length || to >= next.length) return;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  state = { widgets: next };
  emit();
}

export function resetLayout(): void {
  state = { widgets: [...DEFAULT_LAYOUT] };
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot(): DashState {
  return state;
}

export function useDashboard(): DashState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
