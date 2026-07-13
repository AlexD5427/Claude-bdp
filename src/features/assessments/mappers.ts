import { safeParseAssessment } from "./schema";
import { scoredQuestionCount } from "./scoring";
import type { AssessmentDefinition, AssessmentSummary } from "./types";

/**
 * Mappers between the domain model and the `Evaluaciones` Google Sheets row.
 *
 * As with `Procesos`, the sheet is transitional: complex structures are stored
 * as validated JSON strings in `*Json` columns. Published versions must remain
 * independently identifiable and never be overwritten, so each row carries the
 * assessment ID plus the version numbers; the backend keys published rows by the
 * composite `ID + Version`. The column names follow the documented contract.
 */

export type EvaluacionesRow = Record<string, string | number>;

export const EVALUACIONES_COLUMNS = [
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
  "VersionEsquema",
  "CreadoPor",
  "FechaCreacion",
  "ActualizadoPor",
  "FechaActualizacion",
  "FechaPublicacion",
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
    return (JSON.parse(raw) as T) ?? fallback;
  } catch {
    return fallback;
  }
}

export function assessmentToRow(a: AssessmentDefinition): EvaluacionesRow {
  const [major, minor] = (a.currentVersion ?? a.draftVersion).split(".");
  return {
    ID: a.id,
    ReferenciaExterna: a.externalReference,
    Codigo: a.code,
    Nombre: a.name,
    Categoria: a.category,
    Proposito: a.purpose,
    Version: a.currentVersion ?? a.draftVersion,
    VersionMayor: Number(major) || 1,
    VersionMenor: Number(minor) || 0,
    Estado: a.status,
    EstadoPublicacion: a.publicationStatus,
    ProcesosJson: json(a.linkedProcessIds),
    DuracionEstimada: a.estimatedDuration,
    PoliticaIntentosJson: json(a.attemptPolicy),
    PoliticaTiempoJson: json(a.timingPolicy),
    PoliticaNavegacionJson: json(a.navigationPolicy),
    PoliticaPuntuacionJson: json(a.scoringPolicy),
    PoliticaMonitoreoJson: json(a.monitoringPolicy),
    PoliticaConsentimientoJson: json(a.consentPolicy),
    SeccionesJson: json(a.sections),
    ReglasJson: json(a.rules),
    TemaJson: json(a.theme),
    ConfiguracionJson: json({
      description: a.description,
      draftVersion: a.draftVersion,
      ownerId: a.ownerId,
      authorIds: a.authorIds,
      tags: a.tags,
      resumePolicy: a.resumePolicy,
      randomizationPolicy: a.randomizationPolicy,
      resultVisibilityPolicy: a.resultVisibilityPolicy,
      accessibilityPolicy: a.accessibilityPolicy,
      publicInstructions: a.publicInstructions,
      internalInstructions: a.internalInstructions,
      versions: a.versions,
      auditTrail: a.auditTrail,
      archivedAt: a.archivedAt,
    }),
    VersionEsquema: a.schemaVersion,
    CreadoPor: a.createdBy,
    FechaCreacion: a.createdAt,
    ActualizadoPor: a.updatedBy,
    FechaActualizacion: a.updatedAt,
    FechaPublicacion: a.publishedAt ?? "",
    SincronizacionEstado: a.synchronizationStatus,
  };
}

export function rowToAssessment(row: EvaluacionesRow): AssessmentDefinition | null {
  const config = parseJson<Record<string, unknown>>(row.ConfiguracionJson, {});
  const candidate = {
    id: String(row.ID ?? ""),
    externalReference: String(row.ReferenciaExterna ?? ""),
    code: String(row.Codigo ?? ""),
    name: String(row.Nombre ?? ""),
    description: String(config.description ?? ""),
    category: row.Categoria || "questionnaire",
    purpose: String(row.Proposito ?? ""),
    status: row.Estado || "draft",
    publicationStatus: row.EstadoPublicacion || "unpublished",
    currentVersion: row.EstadoPublicacion === "published" ? String(row.Version ?? "1.0") : null,
    draftVersion: String(config.draftVersion ?? row.Version ?? "1.0"),
    linkedProcessIds: parseJson<string[]>(row.ProcesosJson, []),
    ownerId: String(config.ownerId ?? ""),
    authorIds: (config.authorIds as string[]) ?? [],
    tags: (config.tags as string[]) ?? [],
    estimatedDuration: Number(row.DuracionEstimada) || 0,
    attemptPolicy: parseJson(row.PoliticaIntentosJson, { maxAttempts: 1, allowReopen: false }),
    timingPolicy: parseJson(row.PoliticaTiempoJson, { mode: "untimed", autoSubmit: false }),
    navigationPolicy: parseJson(row.PoliticaNavegacionJson, {
      allowBack: true,
      showProgress: true,
      onePerPage: false,
    }),
    resumePolicy: config.resumePolicy ?? { allowSaveAndResume: true },
    randomizationPolicy:
      config.randomizationPolicy ?? {
        shuffleQuestions: false,
        shuffleOptions: false,
        shuffleSections: false,
        seedPerAttempt: true,
      },
    scoringPolicy: parseJson(row.PoliticaPuntuacionJson, {
      enabled: false,
      showScoreToCandidate: false,
      normalize: true,
    }),
    resultVisibilityPolicy:
      config.resultVisibilityPolicy ?? { showResultsImmediately: false, showCorrectAnswers: false },
    monitoringPolicy: parseJson(row.PoliticaMonitoreoJson, { requireFullScreen: false, logFocusLoss: false }),
    consentPolicy: parseJson(row.PoliticaConsentimientoJson, { requireConsent: false }),
    accessibilityPolicy:
      config.accessibilityPolicy ?? { allowExtraTime: false, extraTimeMultiplier: 1.25, reducedMotionHint: true },
    sections: parseJson(row.SeccionesJson, []),
    rules: parseJson(row.ReglasJson, []),
    theme: parseJson(row.TemaJson, { accent: "#00b0d8" }),
    publicInstructions: String(config.publicInstructions ?? ""),
    internalInstructions: String(config.internalInstructions ?? ""),
    createdAt: String(row.FechaCreacion ?? new Date().toISOString()),
    createdBy: String(row.CreadoPor ?? ""),
    updatedAt: String(row.FechaActualizacion ?? new Date().toISOString()),
    updatedBy: String(row.ActualizadoPor ?? ""),
    publishedAt: row.FechaPublicacion ? String(row.FechaPublicacion) : null,
    archivedAt: (config.archivedAt as string | null) ?? null,
    schemaVersion: Number(row.VersionEsquema) || 1,
    sourceProvider: "apps-script" as const,
    synchronizationStatus: row.SincronizacionEstado || "synced",
    versions: (config.versions as AssessmentDefinition["versions"]) ?? [],
    auditTrail: (config.auditTrail as AssessmentDefinition["auditTrail"]) ?? [],
  };
  const parsed = safeParseAssessment(candidate);
  return parsed.success ? (parsed.data as AssessmentDefinition) : null;
}

export function toAssessmentSummary(a: AssessmentDefinition): AssessmentSummary {
  let questionCount = 0;
  for (const s of a.sections) questionCount += s.questions.filter((q) => q.family !== "content").length;
  return {
    id: a.id,
    code: a.code,
    name: a.name,
    category: a.category,
    status: a.status,
    publicationStatus: a.publicationStatus,
    version: a.currentVersion ?? a.draftVersion,
    linkedProcessCount: a.linkedProcessIds.length,
    questionCount,
    estimatedDuration: a.estimatedDuration,
    tags: a.tags,
    ownerId: a.ownerId,
    updatedAt: a.updatedAt,
    synchronizationStatus: a.synchronizationStatus,
  };
}

/** Number of scored questions — re-exported for summaries/tests. */
export { scoredQuestionCount };
