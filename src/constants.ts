import {
  LayoutDashboard,
  BarChart3,
  Users,
  GitCompareArrows,
  Workflow,
  ClipboardList,
  ListChecks,
  FolderCheck,
  Settings,
} from "lucide-react";
import { PerfilCargoIcon } from "./components/icons/CustomIcons";
import type { DrawableIcon } from "./components/DrawIcon";
import type { ModuleId } from "./types";

/**
 * El endpoint de Apps Script ya no vive aquí: está en `src/config/google.ts`
 * junto al resto de lo que depende de la cuenta de Google (el backend de
 * Documentación, el despliegue de Evaluaciones y las seis utilidades del panel
 * de Herramientas). Se juntaron para poder migrar de cuenta cambiando un solo
 * archivo. Ver `docs/migracion/MIGRACION_CUENTA_GOOGLE.md`.
 */

export interface DockItem {
  id: ModuleId;
  label: string;
  icon: DrawableIcon;
}

/** Navigation modules — icon + short label, Dashboard leads as the home. */
export const DOCK_ITEMS: DockItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "tablero", label: "Tablero", icon: BarChart3 },
  { id: "cara-a-cara", label: "Cara a Cara", icon: Users },
  { id: "comparador", label: "Comparador", icon: GitCompareArrows },
  { id: "procesos", label: "Procesos", icon: Workflow },
  { id: "evaluaciones", label: "Evaluaciones", icon: ClipboardList },
  { id: "postulantes", label: "Postulantes", icon: ListChecks },
  { id: "perfiles", label: "Perfiles", icon: PerfilCargoIcon },
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
  "Egresado Técnico Medio",
  "Egresado Técnico Superior",
  "Licenciatura",
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

/**
 * Explicit, labelled risk scale shared by every "riesgo" field of the intake
 * form — Integridad, Robo and Mentira. The "Riesgo …" wording is what gets
 * stored in the database (per the brief), and each option carries a semantic
 * colour: verde = riesgo bajo, amarillo = riesgo medio, rojo = riesgo alto.
 * "N/A" is the only option without the "Riesgo" prefix.
 */
export const NIVEL_RIESGO_ETIQUETADO_OPTIONS = [
  "N/A",
  "Riesgo Bajo",
  "Riesgo Medio",
  "Riesgo Alto",
] as const;

/** Level scale used by the knowledge / tools list builders. */
export const NIVEL_ITEM_OPTIONS = ["Bajo", "Medio", "Alto"] as const;

/** Capacity limits for the form's list builders. */
export const MAX_COMPETENCIAS = 7;
export const MAX_CONOCIMIENTOS = 7;
export const MAX_HERRAMIENTAS = 5;
