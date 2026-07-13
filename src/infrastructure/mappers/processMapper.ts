/**
 * Process row mapper.
 *
 * Translates between the `RecruitmentProcess` domain model and the flat
 * `Procesos` worksheet row (Spanish column headers, per the Apps Script
 * contract). Complex nested data is stored as validated JSON strings — a
 * documented transitional strategy until a relational backend exists.
 *
 * Components must NEVER read these row shapes directly: provider → schema →
 * mapper → domain model → UI.
 */

import { z } from "zod";
import { recruitmentProcessSchema, type RecruitmentProcess } from "../../features/processes/domain/models";
import { sanitizeText } from "../../shared/sanitize";

/** The exact `Procesos` worksheet row (all cells are strings/numbers). */
export interface ProcesoRow {
  ID: string;
  ReferenciaExterna: string;
  Codigo: string;
  Nombre: string;
  Slug: string;
  Descripcion: string;
  Area: string;
  Departamento: string;
  UnidadNegocio: string;
  Ubicacion: string;
  Modalidad: string;
  TipoContrato: string;
  NivelExperiencia: string;
  Vacantes: number | string;
  ReclutadoresJson: string;
  ResponsablesJson: string;
  GerentesJson: string;
  PropietarioId: string;
  Estado: string;
  EstadoPublicacion: string;
  Visibilidad: string;
  FechaApertura: string;
  FechaCierre: string;
  EvaluacionesJson: string;
  FormularioJson: string;
  ContenidoPublicoJson: string;
  ConfiguracionJson: string;
  VersionEsquema: number | string;
  VersionEntidad: number | string;
  CreadoPor: string;
  FechaCreacion: string;
  ActualizadoPor: string;
  FechaActualizacion: string;
  EstadoSincronizacion: string;
}

/** Ordered header list — the single source of truth for column order. */
export const PROCESO_HEADERS: (keyof ProcesoRow)[] = [
  "ID",
  "ReferenciaExterna",
  "Codigo",
  "Nombre",
  "Slug",
  "Descripcion",
  "Area",
  "Departamento",
  "UnidadNegocio",
  "Ubicacion",
  "Modalidad",
  "TipoContrato",
  "NivelExperiencia",
  "Vacantes",
  "ReclutadoresJson",
  "ResponsablesJson",
  "GerentesJson",
  "PropietarioId",
  "Estado",
  "EstadoPublicacion",
  "Visibilidad",
  "FechaApertura",
  "FechaCierre",
  "EvaluacionesJson",
  "FormularioJson",
  "ContenidoPublicoJson",
  "ConfiguracionJson",
  "VersionEsquema",
  "VersionEntidad",
  "CreadoPor",
  "FechaCreacion",
  "ActualizadoPor",
  "FechaActualizacion",
  "EstadoSincronizacion",
];

function parseJsonArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function num(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nullableDate(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s ? s : null;
}

/** Map a raw worksheet row → validated domain model. Throws via Zod on bad data. */
export function rowToProcess(row: Partial<ProcesoRow>): RecruitmentProcess {
  const candidate = {
    id: sanitizeText(row.ID, 80),
    externalReference: sanitizeText(row.ReferenciaExterna, 120),
    code: sanitizeText(row.Codigo, 60),
    title: sanitizeText(row.Nombre, 200),
    slug: sanitizeText(row.Slug, 120),
    description: sanitizeText(row.Descripcion, 8000),
    area: sanitizeText(row.Area, 160),
    department: sanitizeText(row.Departamento, 160),
    businessUnit: sanitizeText(row.UnidadNegocio, 160),
    location: sanitizeText(row.Ubicacion, 200),
    workMode: sanitizeText(row.Modalidad, 40) || "onsite",
    employmentType: sanitizeText(row.TipoContrato, 40) || "full_time",
    experienceLevel: sanitizeText(row.NivelExperiencia, 40) || "mid",
    vacancies: num(row.Vacantes, 1),
    recruiterIds: parseJsonArray(row.ReclutadoresJson).map(String),
    hiringManagerIds: parseJsonArray(row.GerentesJson).map(String),
    ownerId: sanitizeText(row.PropietarioId, 80),
    processStatus: sanitizeText(row.Estado, 40) || "draft",
    publicationStatus: sanitizeText(row.EstadoPublicacion, 40) || "unpublished",
    visibility: sanitizeText(row.Visibilidad, 40) || "internal",
    applicationFormId:
      (parseJsonObject(row.FormularioJson).id as string | undefined) ?? null,
    assessmentIds: parseJsonArray(row.EvaluacionesJson).map(String),
    openingDate: nullableDate(row.FechaApertura),
    closingDate: nullableDate(row.FechaCierre),
    publicContentBlocks: parseJsonArray(row.ContenidoPublicoJson),
    configuration: parseJsonObject(row.ConfiguracionJson),
    schemaVersion: num(row.VersionEsquema, 1),
    entityVersion: num(row.VersionEntidad, 1),
    createdAt: sanitizeText(row.FechaCreacion, 40) || new Date().toISOString(),
    createdBy: sanitizeText(row.CreadoPor, 120),
    updatedAt: sanitizeText(row.FechaActualizacion, 40) || new Date().toISOString(),
    updatedBy: sanitizeText(row.ActualizadoPor, 120),
    sourceProvider: "google-apps-script" as const,
    synchronizationStatus: sanitizeText(row.EstadoSincronizacion, 20) || "synced",
  };

  // `.safeParse` lets us fall back gracefully on partially-populated legacy rows
  // by coercing unknown enum values to their safe defaults.
  const result = recruitmentProcessSchema.safeParse(candidate);
  if (result.success) return result.data;
  // Coerce enum failures to defaults and retry once.
  return recruitmentProcessSchema.parse({
    ...candidate,
    workMode: "onsite",
    employmentType: "full_time",
    experienceLevel: "mid",
    processStatus: "draft",
    publicationStatus: "unpublished",
    visibility: "internal",
    // Re-validate nested public content/config through their own schemas.
    publicContentBlocks: [],
    configuration: {},
  });
}

/** Map a domain model → raw worksheet row for persistence. */
export function processToRow(p: RecruitmentProcess): ProcesoRow {
  return {
    ID: p.id,
    ReferenciaExterna: p.externalReference,
    Codigo: p.code,
    Nombre: p.title,
    Slug: p.slug,
    Descripcion: p.description,
    Area: p.area,
    Departamento: p.department,
    UnidadNegocio: p.businessUnit,
    Ubicacion: p.location,
    Modalidad: p.workMode,
    TipoContrato: p.employmentType,
    NivelExperiencia: p.experienceLevel,
    Vacantes: p.vacancies,
    ReclutadoresJson: JSON.stringify(p.recruiterIds),
    ResponsablesJson: JSON.stringify(p.recruiterIds),
    GerentesJson: JSON.stringify(p.hiringManagerIds),
    PropietarioId: p.ownerId,
    Estado: p.processStatus,
    EstadoPublicacion: p.publicationStatus,
    Visibilidad: p.visibility,
    FechaApertura: p.openingDate ?? "",
    FechaCierre: p.closingDate ?? "",
    EvaluacionesJson: JSON.stringify(p.assessmentIds),
    FormularioJson: JSON.stringify(p.applicationFormId ? { id: p.applicationFormId } : {}),
    ContenidoPublicoJson: JSON.stringify(p.publicContentBlocks),
    ConfiguracionJson: JSON.stringify(p.configuration),
    VersionEsquema: p.schemaVersion,
    VersionEntidad: p.entityVersion,
    CreadoPor: p.createdBy,
    FechaCreacion: p.createdAt,
    ActualizadoPor: p.updatedBy,
    FechaActualizacion: p.updatedAt,
    EstadoSincronizacion: p.synchronizationStatus,
  };
}

/** Zod schema used to validate an inbound row before mapping (defensive). */
export const procesoRowSchema = z.record(z.string(), z.union([z.string(), z.number()]));
