import {
  LayoutDashboard,
  BarChart3,
  Users,
  GitCompareArrows,
  Workflow,
  ListChecks,
  FolderCheck,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { ModuleId } from "./types";

/**
 * Single source of truth — the Google Apps Script endpoint.
 * Every fetch to this URL MUST pass `{ redirect: "follow" }` so Google's 302
 * redirect is followed in production (Vercel), otherwise it 404s.
 */
export const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycby5iqFsfvuL6movHAfZ46CZZuND22M1J-R-D3BLv2mx-a8lmRa_AePbmV59jPRTA-hczQ/exec";

export interface DockItem {
  id: ModuleId;
  label: string;
  icon: LucideIcon;
}

/** Navigation modules — icon + short label, Dashboard leads as the home. */
export const DOCK_ITEMS: DockItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "tablero", label: "Tablero", icon: BarChart3 },
  { id: "cara-a-cara", label: "Cara a Cara", icon: Users },
  { id: "comparador", label: "Comparador", icon: GitCompareArrows },
  { id: "procesos", label: "Procesos", icon: Workflow },
  { id: "postulantes", label: "Postulantes", icon: ListChecks },
  { id: "documentacion", label: "Documentación", icon: FolderCheck },
  { id: "configuracion", label: "Configuración", icon: Settings },
];

/** Estado civil options. */
export const ESTADO_CIVIL_OPTIONS = [
  "Soltero/a",
  "Casado/a",
  "Conviviente / Unión Libre",
  "Divorciado/a",
  "Viudo/a",
] as const;

/** Academic level options. */
export const NIVEL_ACADEMICO_OPTIONS = [
  "Bachiller",
  "Técnico Medio",
  "Técnico Superior",
  "Licenciatura",
  "Carrera",
] as const;

/** Departments of residence (Bolivia) — "N/A" leads the list. */
export const DEPARTAMENTO_OPTIONS = [
  "N/A",
  "Beni",
  "Chuquisaca",
  "Cochabamba",
  "La Paz",
  "Oruro",
  "Pando",
  "Potosí",
  "Santa Cruz",
  "Tarija",
] as const;

/** DISC behavioural archetypes and their meanings now come from the backend
 * ("Auxiliar" sheet, `arquetipo_disc` column), parsed in `lib/disc.ts` with a
 * built-in fallback catalogue. See `DiscSelect` / `DiscInfoButton`. */

/** Reliability — "Confiabilidad e Integridad". */
export const CONFIABILIDAD_OPTIONS = [
  "N/A",
  "Confiable",
  "Confiabilidad Media",
  "No Confiable",
] as const;

/** Generic three-step risk / integrity scale. */
export const NIVEL_RIESGO_OPTIONS = ["N/A", "Bajo", "Medio", "Alto"] as const;

/** Level scale used by the knowledge / tools list builders. */
export const NIVEL_ITEM_OPTIONS = ["Bajo", "Medio", "Alto"] as const;

/** Capacity limits for the form's list builders. */
export const MAX_COMPETENCIAS = 7;
export const MAX_CONOCIMIENTOS = 7;
export const MAX_HERRAMIENTAS = 5;
