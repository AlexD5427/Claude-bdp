/**
 * Job/opening enumerations shared by the process editor, filters, and public
 * content. Values are code identifiers (English); labels are es-MX.
 */

export const WORK_MODES = ["onsite", "hybrid", "remote"] as const;
export type WorkMode = (typeof WORK_MODES)[number];
export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  onsite: "Presencial",
  hybrid: "Híbrido",
  remote: "Remoto",
};

export const EMPLOYMENT_TYPES = [
  "full_time",
  "part_time",
  "temporary",
  "contract",
  "internship",
  "apprenticeship",
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: "Tiempo completo",
  part_time: "Medio tiempo",
  temporary: "Temporal",
  contract: "Por contrato",
  internship: "Prácticas",
  apprenticeship: "Aprendizaje",
};

export const EXPERIENCE_LEVELS = [
  "entry",
  "junior",
  "mid",
  "senior",
  "lead",
  "manager",
  "director",
] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];
export const EXPERIENCE_LEVEL_LABELS: Record<ExperienceLevel, string> = {
  entry: "Sin experiencia",
  junior: "Junior",
  mid: "Intermedio",
  senior: "Senior",
  lead: "Líder técnico",
  manager: "Jefatura",
  director: "Dirección",
};

export const VISIBILITIES = ["internal", "external", "both"] as const;
export type Visibility = (typeof VISIBILITIES)[number];
export const VISIBILITY_LABELS: Record<Visibility, string> = {
  internal: "Interna",
  external: "Externa",
  both: "Interna y externa",
};

/** Utility: turn a label map into `{ value, label }[]` for select controls. */
export function toOptions<T extends string>(map: Record<T, string>): {
  value: T;
  label: string;
}[] {
  return (Object.keys(map) as T[]).map((value) => ({ value, label: map[value] }));
}
