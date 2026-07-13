import { safeParseProcess } from "./schema";
import type { ProcessSummary, RecruitmentProcess } from "./types";

/**
 * Mappers between the domain model and the `Procesos` Google Sheets row.
 *
 * The sheet is a *transitional* persistence layer, so complex structures are
 * serialised as validated JSON strings in dedicated `*Json` columns. Frontend
 * components never see this shape — only the repository/provider does. The
 * column names follow the documented `Procesos` contract exactly.
 */

export type ProcesosRow = Record<string, string | number>;

/** Column headers of the `Procesos` worksheet (order documented in the .gs). */
export const PROCESOS_COLUMNS = [
  "ID",
  "ReferenciaExterna",
  "Codigo",
  "Nombre",
  "Slug",
  "Descripcion",
  "Area",
  "Departamento",
  "UnidadNegocio",
  "Region",
  "Ciudad",
  "Agencia",
  "Modalidad",
  "TipoContrato",
  "Vacantes",
  "ReclutadoresJson",
  "ResponsablesJson",
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
  "CreadoPor",
  "FechaCreacion",
  "ActualizadoPor",
  "FechaActualizacion",
  "SincronizacionEstado",
] as const;

function json(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return "null";
  }
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw == null || raw === "") return fallback;
  if (typeof raw !== "string") return (raw as T) ?? fallback;
  try {
    const parsed = JSON.parse(raw);
    return (parsed as T) ?? fallback;
  } catch {
    return fallback;
  }
}

/** Serialise a domain process into a `Procesos` sheet row. */
export function processToRow(p: RecruitmentProcess): ProcesosRow {
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
    Region: p.region,
    Ciudad: p.city,
    Agencia: p.branch,
    Modalidad: p.workMode,
    TipoContrato: p.employmentType,
    Vacantes: p.vacancies,
    ReclutadoresJson: json(p.recruiterIds),
    ResponsablesJson: json({ hiringManagerIds: p.hiringManagerIds, ownerId: p.ownerId }),
    Estado: p.status,
    EstadoPublicacion: p.publicationStatus,
    Visibilidad: p.visibility,
    FechaApertura: p.openingDate ?? "",
    FechaCierre: p.closingDate ?? "",
    EvaluacionesJson: json(p.assessmentIds),
    FormularioJson: json({ applicationFormId: p.applicationFormId }),
    ContenidoPublicoJson: json(p.publicContentBlocks),
    // Extra domain fields that have no dedicated column ride along in the
    // configuration JSON so nothing is lost in the transitional store.
    ConfiguracionJson: json({
      configuration: p.configuration,
      experienceLevel: p.experienceLevel,
      mission: p.mission,
      shortDescription: p.shortDescription,
      location: p.location,
      publishedAt: p.publishedAt,
      closedAt: p.closedAt,
      archivedAt: p.archivedAt,
      auditTrail: p.auditTrail,
      internalMetadata: p.internalMetadata,
    }),
    VersionEsquema: p.schemaVersion,
    CreadoPor: p.createdBy,
    FechaCreacion: p.createdAt,
    ActualizadoPor: p.updatedBy,
    FechaActualizacion: p.updatedAt,
    SincronizacionEstado: p.synchronizationStatus,
  };
}

/** Parse a `Procesos` sheet row back into a validated domain process, or null. */
export function rowToProcess(row: ProcesosRow): RecruitmentProcess | null {
  const responsables = parseJson<{ hiringManagerIds?: string[]; ownerId?: string }>(
    row.ResponsablesJson,
    {},
  );
  const config = parseJson<Record<string, unknown>>(row.ConfiguracionJson, {});
  const formulario = parseJson<{ applicationFormId?: string | null }>(row.FormularioJson, {});

  const candidate = {
    id: String(row.ID ?? ""),
    externalReference: String(row.ReferenciaExterna ?? ""),
    code: String(row.Codigo ?? ""),
    title: String(row.Nombre ?? ""),
    slug: String(row.Slug ?? ""),
    description: String(row.Descripcion ?? ""),
    shortDescription: String(config.shortDescription ?? ""),
    mission: String(config.mission ?? ""),
    area: String(row.Area ?? ""),
    department: String(row.Departamento ?? ""),
    businessUnit: String(row.UnidadNegocio ?? ""),
    region: String(row.Region ?? ""),
    city: String(row.Ciudad ?? ""),
    branch: String(row.Agencia ?? ""),
    location: String(config.location ?? ""),
    workMode: row.Modalidad || "presencial",
    employmentType: row.TipoContrato || "tiempo_completo",
    experienceLevel: config.experienceLevel || "junior",
    vacancies: Number(row.Vacantes) || 0,
    recruiterIds: parseJson<string[]>(row.ReclutadoresJson, []),
    hiringManagerIds: responsables.hiringManagerIds ?? [],
    ownerId: responsables.ownerId ?? "",
    status: row.Estado || "borrador",
    publicationStatus: row.EstadoPublicacion || "no_publicado",
    visibility: row.Visibilidad || "interno",
    applicationFormId: formulario.applicationFormId ?? null,
    assessmentIds: parseJson<string[]>(row.EvaluacionesJson, []),
    openingDate: row.FechaApertura ? String(row.FechaApertura) : null,
    closingDate: row.FechaCierre ? String(row.FechaCierre) : null,
    publishedAt: (config.publishedAt as string | null) ?? null,
    closedAt: (config.closedAt as string | null) ?? null,
    archivedAt: (config.archivedAt as string | null) ?? null,
    createdAt: String(row.FechaCreacion ?? new Date().toISOString()),
    createdBy: String(row.CreadoPor ?? ""),
    updatedAt: String(row.FechaActualizacion ?? new Date().toISOString()),
    updatedBy: String(row.ActualizadoPor ?? ""),
    schemaVersion: Number(row.VersionEsquema) || 1,
    sourceProvider: "apps-script" as const,
    synchronizationStatus: row.SincronizacionEstado || "synced",
    configuration: config.configuration ?? { headcount: 1, applicationEnabled: true },
    publicContentBlocks: parseJson(row.ContenidoPublicoJson, []),
    internalMetadata: (config.internalMetadata as Record<string, unknown>) ?? {},
    auditTrail: (config.auditTrail as RecruitmentProcess["auditTrail"]) ?? [],
  };

  return safeParseProcess(candidate) as RecruitmentProcess | null;
}

/** Project a full process to a cheap list summary. */
export function toProcessSummary(p: RecruitmentProcess, applications = 0): ProcessSummary {
  return {
    id: p.id,
    code: p.code,
    title: p.title,
    area: p.area,
    location: p.location || [p.city, p.branch].filter(Boolean).join(" · "),
    vacancies: p.vacancies,
    applications,
    assessmentCount: p.assessmentIds.length,
    ownerId: p.ownerId,
    status: p.status,
    publicationStatus: p.publicationStatus,
    visibility: p.visibility,
    openingDate: p.openingDate,
    closingDate: p.closingDate,
    updatedAt: p.updatedAt,
    synchronizationStatus: p.synchronizationStatus,
  };
}
