/**
 * Contrato de la API de Evaluaciones.
 *
 * El backend de Apps Script responde SIEMPRE con esta forma:
 *
 *   { ok, requestId, data, error: { code, message, details } | null, warnings }
 *
 * Este módulo define el esquema, valida la respuesta con Zod antes de tocarla y
 * traduce los códigos del servidor a los `AppErrorCode` que ya usa el resto de
 * la aplicación, de modo que la UI siga ramificando sobre un único vocabulario
 * de errores.
 *
 * El envoltorio heredado `{ status, message }` de `src/shared/envelope.ts` sigue
 * en uso para Procesos y no se toca (ver docs/evaluations/API_CONTRACT.md
 * §Correspondencia con el protocolo heredado).
 */

import { z } from "zod";
import { appError, type AppError, type AppErrorCode } from "../../../shared/result";

/** Códigos de error que puede devolver el backend de Evaluaciones. */
export const API_ERROR_CODES = [
  "BAD_REQUEST",
  "UNSUPPORTED_ACTION",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "CONFLICT",
  "FORBIDDEN",
  "SCHEMA_ERROR",
  "LOCK_TIMEOUT",
  "INTERNAL_ERROR",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Advertencias no bloqueantes. */
export const API_WARNINGS = [
  "IDEMPOTENT_REPLAY",
  "INSECURE_ADMIN_MODE",
  "LEGACY_ANSWER_KEY_SOURCE",
] as const;
export type ApiWarning = (typeof API_WARNINGS)[number];

/** Hallazgo de validación devuelto por el servidor, navegable en la UI. */
export const apiIssueSchema = z.object({
  code: z.string(),
  message: z.string(),
  path: z.string().optional(),
  questionId: z.string().optional(),
  optionId: z.string().optional(),
  sectionId: z.string().optional(),
});
export type ApiIssue = z.infer<typeof apiIssueSchema>;

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).default({}),
});

export const apiEnvelopeSchema = z.object({
  ok: z.boolean(),
  requestId: z.string().default(""),
  data: z.unknown().nullable().default(null),
  error: apiErrorSchema.nullable().default(null),
  warnings: z.array(z.string()).default([]),
});

export interface ApiEnvelope<T> {
  ok: boolean;
  requestId: string;
  data: T | null;
  error: { code: ApiErrorCode; message: string; details: Record<string, unknown> } | null;
  warnings: ApiWarning[];
}

/** Traducción de códigos del servidor al vocabulario de errores de la app. */
const CODE_MAP: Record<ApiErrorCode, AppErrorCode> = {
  BAD_REQUEST: "validation",
  UNSUPPORTED_ACTION: "provider",
  VALIDATION_ERROR: "validation",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  FORBIDDEN: "forbidden",
  SCHEMA_ERROR: "provider",
  LOCK_TIMEOUT: "provider",
  INTERNAL_ERROR: "provider",
};

function normalizeCode(raw: string): ApiErrorCode {
  return (API_ERROR_CODES as readonly string[]).includes(raw)
    ? (raw as ApiErrorCode)
    : "INTERNAL_ERROR";
}

function normalizeWarnings(raw: string[]): ApiWarning[] {
  return raw.filter((w): w is ApiWarning => (API_WARNINGS as readonly string[]).includes(w));
}

/**
 * Valida la respuesta cruda del servidor. Una respuesta con otra forma se trata
 * como error de proveedor: nunca se asume que el cuerpo tiene los campos
 * esperados.
 */
export function parseEnvelope<T>(raw: unknown): ApiEnvelope<T> {
  const parsed = apiEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      requestId: "",
      data: null,
      error: {
        code: "INTERNAL_ERROR",
        message: "El servidor devolvió una respuesta con un formato inesperado.",
        details: {},
      },
      warnings: [],
    };
  }
  const value = parsed.data;
  return {
    ok: value.ok,
    requestId: value.requestId,
    data: (value.data ?? null) as T | null,
    error: value.error
      ? {
          code: normalizeCode(value.error.code),
          message: value.error.message,
          details: value.error.details,
        }
      : null,
    warnings: normalizeWarnings(value.warnings),
  };
}

/**
 * Error de la aplicación enriquecido con los hallazgos de validación del
 * servidor. `AppError` es un contrato compartido con Procesos, así que en lugar
 * de modificarlo se adjunta `issues` como propiedad opcional y se lee con
 * `issuesOf`.
 */
export interface AssessmentAppError extends AppError {
  issues?: ApiIssue[];
  /** El backend intermedio pide abrir la sesión administrativa. */
  needsAdminSession?: boolean;
}

/** Convierte el error del envoltorio en el `AppError` de la aplicación. */
export function toAppError(envelope: ApiEnvelope<unknown>): AssessmentAppError {
  const code = envelope.error?.code ?? "INTERNAL_ERROR";
  const message = envelope.error?.message ?? "Ocurrió un error en el servidor.";
  const base = appError(CODE_MAP[code], message, code);
  const issues = extractIssues(envelope);
  const enriched: AssessmentAppError = issues.length > 0 ? { ...base, issues } : { ...base };
  if (requiresAdminSession(envelope)) enriched.needsAdminSession = true;
  return enriched;
}

/** Hallazgos de validación adjuntos a un error, si los hay. */
export function issuesOf(error: AppError): ApiIssue[] {
  const candidate = (error as AssessmentAppError).issues;
  return Array.isArray(candidate) ? candidate : [];
}

/** Extrae los hallazgos de validación de `error.details.issues`. */
export function extractIssues(envelope: ApiEnvelope<unknown>): ApiIssue[] {
  const raw = envelope.error?.details?.issues;
  if (!Array.isArray(raw)) return [];
  const issues: ApiIssue[] = [];
  for (const item of raw) {
    const parsed = apiIssueSchema.safeParse(item);
    if (parsed.success) issues.push(parsed.data);
  }
  return issues;
}

/**
 * ¿El backend intermedio pide que se abra (o se renueve) la sesión
 * administrativa?
 *
 * Es un caso distinto de «no tienes permiso»: la operación es legítima, lo que
 * falta es la puerta de acceso del panel. La interfaz lo usa para pedir la frase
 * de acceso en lugar de mostrar un error sin salida.
 */
export function requiresAdminSession(envelope: ApiEnvelope<unknown>): boolean {
  return envelope.error?.details?.adminSession === "required";
}

/** ¿La respuesta fue una repetición idempotente (el efecto no se repitió)? */
export function isIdempotentReplay(envelope: ApiEnvelope<unknown>): boolean {
  return envelope.warnings.includes("IDEMPOTENT_REPLAY");
}

/** Un `requestId` nuevo. Se reutiliza al reintentar la misma operación. */
export function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `req_${crypto.randomUUID()}`;
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
