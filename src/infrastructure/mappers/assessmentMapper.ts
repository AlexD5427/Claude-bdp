/**
 * Assessment row mapper.
 *
 * Translates between the `AssessmentDefinition` domain model and the flat
 * `Evaluaciones` worksheet row. Sections/rules/policies are stored as validated
 * JSON strings. Published versions carry an independent identity: the row keeps
 * the draft content plus a serialized array of published versions so history is
 * never lost, and `currentPublishedVersionId` records which version new
 * candidates receive.
 *
 * SECURITY: answer keys (`correct`, per-option scores) live in the stored JSON
 * but the public DTO layer strips them before anything reaches a candidate.
 */

import { assessmentDefinitionSchema, type AssessmentDefinition, versionLabel } from "../../features/assessments/domain/assessment";
import { sanitizeText } from "../../shared/sanitize";

export interface EvaluacionRow {
  ID: string;
  ReferenciaExterna: string;
  Codigo: string;
  Nombre: string;
  Categoria: string;
  Proposito: string;
  Version: string;
  VersionMayor: number | string;
  VersionMenor: number | string;
  Estado: string;
  EstadoPublicacion: string;
  ProcesosJson: string;
  DuracionEstimada: number | string;
  PoliticaIntentosJson: string;
  PoliticaTiempoJson: string;
  PoliticaNavegacionJson: string;
  PoliticaPuntuacionJson: string;
  PoliticaMonitoreoJson: string;
  PoliticaConsentimientoJson: string;
  SeccionesJson: string;
  ReglasJson: string;
  TemaJson: string;
  ConfiguracionJson: string;
  VersionesPublicadasJson: string;
  VersionPublicadaActual: string;
  VersionEsquema: number | string;
  VersionEntidad: number | string;
  CreadoPor: string;
  FechaCreacion: string;
  ActualizadoPor: string;
  FechaActualizacion: string;
  FechaPublicacion: string;
  EstadoSincronizacion: string;
}

export const EVALUACION_HEADERS: (keyof EvaluacionRow)[] = [
  "ID",
  "ReferenciaExterna",
  "Codigo",
  "Nombre",
  "Categoria",
  "Proposito",
  "Version",
  "VersionMayor",
  "VersionMenor",
  "Estado",
  "EstadoPublicacion",
  "ProcesosJson",
  "DuracionEstimada",
  "PoliticaIntentosJson",
  "PoliticaTiempoJson",
  "PoliticaNavegacionJson",
  "PoliticaPuntuacionJson",
  "PoliticaMonitoreoJson",
  "PoliticaConsentimientoJson",
  "SeccionesJson",
  "ReglasJson",
  "TemaJson",
  "ConfiguracionJson",
  "VersionesPublicadasJson",
  "VersionPublicadaActual",
  "VersionEsquema",
  "VersionEntidad",
  "CreadoPor",
  "FechaCreacion",
  "ActualizadoPor",
  "FechaActualizacion",
  "FechaPublicacion",
  "EstadoSincronizacion",
];

function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw && typeof raw === "object") return raw as T;
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function num(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nullableStr(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s || null;
}

/** Map a raw worksheet row → validated domain model. */
export function rowToAssessment(row: Partial<EvaluacionRow>): AssessmentDefinition {
  const now = new Date().toISOString();
  const sections = parseJson<unknown[]>(row.SeccionesJson, []);
  const rules = parseJson<unknown[]>(row.ReglasJson, []);
  const theme = parseJson<Record<string, unknown>>(row.TemaJson, {});
  const config = parseJson<Record<string, unknown>>(row.ConfiguracionJson, {});
  const publishedVersions = parseJson<unknown[]>(row.VersionesPublicadasJson, []);

  const draftVersion = {
    id: `ver_draft_${row.ID ?? ""}`,
    major: num(row.VersionMayor, 1),
    minor: num(row.VersionMenor, 0),
    state: "draft" as const,
    notes: "",
    content: {
      sections,
      rules,
      rubrics: (config.rubrics as unknown[]) ?? [],
      theme,
      publicInstructions: (config.publicInstructions as string) ?? "",
      internalInstructions: (config.internalInstructions as string) ?? "",
    },
    createdAt: sanitizeText(row.FechaCreacion, 40) || now,
    createdBy: sanitizeText(row.CreadoPor, 120),
    publishedAt: null,
    publishedBy: "",
  };

  const candidate = {
    id: sanitizeText(row.ID, 80),
    externalReference: sanitizeText(row.ReferenciaExterna, 120),
    code: sanitizeText(row.Codigo, 60),
    name: sanitizeText(row.Nombre, 200),
    description: "",
    category: sanitizeText(row.Categoria, 40) || "knowledge",
    purpose: sanitizeText(row.Proposito, 2000),
    lifecycle: sanitizeText(row.Estado, 40) || "draft",
    publication: sanitizeText(row.EstadoPublicacion, 40) || "unpublished",
    linkedProcessIds: parseJson<string[]>(row.ProcesosJson, []).map(String),
    ownerId: sanitizeText(row.CreadoPor, 80),
    authorIds: [],
    tags: (config.tags as string[]) ?? [],
    estimatedDurationMinutes: num(row.DuracionEstimada, 0),
    availabilityStart: null,
    availabilityEnd: null,
    attemptPolicy: parseJson(row.PoliticaIntentosJson, {}),
    timingPolicy: parseJson(row.PoliticaTiempoJson, {}),
    navigationPolicy: parseJson(row.PoliticaNavegacionJson, {}),
    resumePolicy: (config.resumePolicy as object) ?? {},
    randomizationPolicy: (config.randomizationPolicy as object) ?? {},
    scoringPolicy: parseJson(row.PoliticaPuntuacionJson, {}),
    resultVisibility: (config.resultVisibility as object) ?? {},
    monitoringPolicy: parseJson(row.PoliticaMonitoreoJson, {}),
    consentPolicy: parseJson(row.PoliticaConsentimientoJson, {}),
    accessibilityPolicy: (config.accessibilityPolicy as object) ?? {},
    draftVersion,
    publishedVersions,
    currentPublishedVersionId: nullableStr(row.VersionPublicadaActual),
    schemaVersion: num(row.VersionEsquema, 1),
    entityVersion: num(row.VersionEntidad, 1),
    createdAt: sanitizeText(row.FechaCreacion, 40) || now,
    createdBy: sanitizeText(row.CreadoPor, 120),
    updatedAt: sanitizeText(row.FechaActualizacion, 40) || now,
    updatedBy: sanitizeText(row.ActualizadoPor, 120),
    publishedAt: nullableStr(row.FechaPublicacion),
    sourceProvider: "google-apps-script" as const,
    synchronizationStatus: sanitizeText(row.EstadoSincronizacion, 20) || "synced",
  };

  const result = assessmentDefinitionSchema.safeParse(candidate);
  if (result.success) return result.data;
  // Coerce enum failures to safe defaults and retry.
  return assessmentDefinitionSchema.parse({
    ...candidate,
    category: "knowledge",
    lifecycle: "draft",
    publication: "unpublished",
  });
}

/** Map a domain model → raw worksheet row for persistence. */
export function assessmentToRow(a: AssessmentDefinition): EvaluacionRow {
  const content = a.draftVersion.content;
  const config = {
    tags: a.tags,
    rubrics: content.rubrics,
    resumePolicy: a.resumePolicy,
    randomizationPolicy: a.randomizationPolicy,
    resultVisibility: a.resultVisibility,
    accessibilityPolicy: a.accessibilityPolicy,
    publicInstructions: content.publicInstructions,
    internalInstructions: content.internalInstructions,
  };
  return {
    ID: a.id,
    ReferenciaExterna: a.externalReference,
    Codigo: a.code,
    Nombre: a.name,
    Categoria: a.category,
    Proposito: a.purpose,
    Version: versionLabel(a.draftVersion),
    VersionMayor: a.draftVersion.major,
    VersionMenor: a.draftVersion.minor,
    Estado: a.lifecycle,
    EstadoPublicacion: a.publication,
    ProcesosJson: JSON.stringify(a.linkedProcessIds),
    DuracionEstimada: a.estimatedDurationMinutes,
    PoliticaIntentosJson: JSON.stringify(a.attemptPolicy),
    PoliticaTiempoJson: JSON.stringify(a.timingPolicy),
    PoliticaNavegacionJson: JSON.stringify(a.navigationPolicy),
    PoliticaPuntuacionJson: JSON.stringify(a.scoringPolicy),
    PoliticaMonitoreoJson: JSON.stringify(a.monitoringPolicy),
    PoliticaConsentimientoJson: JSON.stringify(a.consentPolicy),
    SeccionesJson: JSON.stringify(content.sections),
    ReglasJson: JSON.stringify(content.rules),
    TemaJson: JSON.stringify(content.theme),
    ConfiguracionJson: JSON.stringify(config),
    VersionesPublicadasJson: JSON.stringify(a.publishedVersions),
    VersionPublicadaActual: a.currentPublishedVersionId ?? "",
    VersionEsquema: a.schemaVersion,
    VersionEntidad: a.entityVersion,
    CreadoPor: a.createdBy,
    FechaCreacion: a.createdAt,
    ActualizadoPor: a.updatedBy,
    FechaActualizacion: a.updatedAt,
    FechaPublicacion: a.publishedAt ?? "",
    EstadoSincronizacion: a.synchronizationStatus,
  };
}
