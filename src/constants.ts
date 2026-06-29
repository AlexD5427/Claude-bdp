import {
  LayoutDashboard,
  Users,
  GitCompareArrows,
  Workflow,
  ListChecks,
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

/** Navigation modules — icons only, labels surface as tooltips. */
export const DOCK_ITEMS: DockItem[] = [
  { id: "tablero", label: "Tablero", icon: LayoutDashboard },
  { id: "cara-a-cara", label: "Cara a Cara", icon: Users },
  { id: "comparador", label: "Nuevo Comparador", icon: GitCompareArrows },
  { id: "procesos", label: "Procesos", icon: Workflow },
  { id: "postulantes", label: "Lista de Postulantes", icon: ListChecks },
];

/** Estado civil options — "Separado/a" is intentionally excluded. */
export const ESTADO_CIVIL_OPTIONS = [
  "Soltero/a",
  "Casado/a",
  "Divorciado/a",
  "Viudo/a",
  "Unión libre",
] as const;

/** Maximum competencies a candidate can be configured with in the form. */
export const MAX_COMPETENCIAS = 7;

export const NIVEL_ACADEMICO_OPTIONS = [
  "Bachiller",
  "Técnico",
  "Egresado",
  "Licenciatura",
  "Diplomado",
  "Maestría",
  "Doctorado",
] as const;
