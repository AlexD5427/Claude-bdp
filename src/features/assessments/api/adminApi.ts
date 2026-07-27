/**
 * API administrativa de Evaluaciones.
 *
 * Cada función devuelve un `Result` con el DTO ya validado, o el `AppError`
 * correspondiente. Ningún componente llama a estas funciones directamente: lo
 * hace el servicio `AppsScriptAssessmentService`.
 *
 * Las escrituras exigen un `requestId`. Quien lo genera es el llamador (una vez
 * por intención del usuario), de modo que un reintento manual no duplique el
 * efecto: el servidor lo detecta y responde con `IDEMPOTENT_REPLAY`.
 */

import { err, ok, appError, type Result } from "../../../shared/result";
import { apiRead, apiWrite, type RequestOptions } from "./transport";
import {
  adminBundleSchema,
  adminListSchema,
  attemptDetailSchema,
  resultsSchema,
  type AdminBundleDTO,
  type AdminListDTO,
  type AttemptDetailDTO,
  type ResultsDTO,
} from "./dto";
import type { ApiEnvelope } from "./contract";
import type { UpdatePayload } from "./mapper";
import type { z } from "zod";

/** Valida el `data` del envoltorio contra un esquema. */
function decode<S extends z.ZodType>(
  envelope: ApiEnvelope<unknown>,
  schema: S,
): Result<z.infer<S>> {
  const parsed = schema.safeParse(envelope.data);
  if (!parsed.success) {
    return err(
      appError(
        "provider",
        "El servidor devolvió datos con un formato inesperado.",
        parsed.error.issues.slice(0, 3).map((issue) => issue.path.join(".")).join(", "),
      ),
    );
  }
  return ok(parsed.data as z.infer<S>);
}

/** Repetición idempotente: el efecto ya se aplicó y no hay bundle en `data`. */
export interface ReplayMarker {
  idempotentReplay: true;
  reference: string;
}

function asReplay(envelope: ApiEnvelope<unknown>): ReplayMarker | null {
  if (!envelope.warnings.includes("IDEMPOTENT_REPLAY")) return null;
  const data = envelope.data as { reference?: unknown } | null;
  return { idempotentReplay: true, reference: typeof data?.reference === "string" ? data.reference : "" };
}

export type WriteResult = { bundle: AdminBundleDTO } | { replay: ReplayMarker };

function decodeWrite(envelope: ApiEnvelope<unknown>): Result<WriteResult> {
  const replay = asReplay(envelope);
  if (replay) return ok({ replay });
  const decoded = decode(envelope, adminBundleSchema);
  return decoded.ok ? ok({ bundle: decoded.value }) : err(decoded.error);
}

/* --------------------------------- Lecturas ------------------------------ */

export async function listAdminAssessments(
  params: { search?: string; status?: string[]; includeArchived?: boolean } = {},
  options?: RequestOptions,
): Promise<Result<AdminListDTO>> {
  const response = await apiRead<unknown>("listAdminAssessments", { ...params }, options);
  if (!response.ok) return err(response.error);
  return decode(response.value, adminListSchema);
}

export async function getAdminAssessment(
  assessmentId: string,
  options?: RequestOptions,
): Promise<Result<AdminBundleDTO>> {
  const response = await apiRead<unknown>("getAdminAssessment", { assessmentId }, options);
  if (!response.ok) return err(response.error);
  return decode(response.value, adminBundleSchema);
}

export async function listAssessmentResults(
  assessmentId: string,
  gradingStatus?: string[],
  options?: RequestOptions,
): Promise<Result<ResultsDTO>> {
  const response = await apiRead<unknown>(
    "listAssessmentResults",
    { assessmentId, ...(gradingStatus ? { gradingStatus } : {}) },
    options,
  );
  if (!response.ok) return err(response.error);
  return decode(response.value, resultsSchema);
}

export async function getAttemptDetail(
  attemptId: string,
  options?: RequestOptions,
): Promise<Result<AttemptDetailDTO>> {
  const response = await apiRead<unknown>("getAttemptDetail", { attemptId }, options);
  if (!response.ok) return err(response.error);
  return decode(response.value, attemptDetailSchema);
}

export interface SchemaReport {
  ok: boolean;
  sheets: {
    sheet: string;
    exists: boolean;
    missingHeaders: string[];
    extraHeaders: string[];
    dataRows: number;
  }[];
}

export async function verifySchema(options?: RequestOptions): Promise<Result<SchemaReport>> {
  const response = await apiRead<SchemaReport>("verifySchema", {}, options);
  if (!response.ok) return err(response.error);
  const data = response.value.data;
  if (!data || typeof data.ok !== "boolean") {
    return err(appError("provider", "No se pudo verificar el esquema de la hoja."));
  }
  return ok(data);
}

/* -------------------------------- Escrituras ----------------------------- */

export async function createAssessment(
  requestId: string,
  input: { title: string; category: string; actor: string },
  options?: RequestOptions,
): Promise<Result<WriteResult>> {
  const response = await apiWrite<unknown>("createAssessment", requestId, { ...input }, options);
  if (!response.ok) return err(response.error);
  return decodeWrite(response.value);
}

export async function updateAssessment(
  requestId: string,
  input: {
    assessmentId: string;
    expectedEntityVersion: number;
    actor: string;
    payload: UpdatePayload;
  },
  options?: RequestOptions,
): Promise<Result<WriteResult>> {
  const response = await apiWrite<unknown>(
    "updateAssessment",
    requestId,
    {
      assessmentId: input.assessmentId,
      expectedEntityVersion: input.expectedEntityVersion,
      actor: input.actor,
      assessment: input.payload.assessment,
      sections: input.payload.sections,
      questions: input.payload.questions,
      options: input.payload.options,
    },
    options,
  );
  if (!response.ok) return err(response.error);
  return decodeWrite(response.value);
}

export async function publishAssessment(
  requestId: string,
  input: { assessmentId: string; expectedEntityVersion?: number; notes?: string; actor: string },
  options?: RequestOptions,
): Promise<Result<WriteResult>> {
  const response = await apiWrite<unknown>("publishAssessment", requestId, { ...input }, options);
  if (!response.ok) return err(response.error);
  return decodeWrite(response.value);
}

export async function duplicateAssessment(
  requestId: string,
  input: { assessmentId: string; actor: string },
  options?: RequestOptions,
): Promise<Result<WriteResult>> {
  const response = await apiWrite<unknown>("duplicateAssessment", requestId, { ...input }, options);
  if (!response.ok) return err(response.error);
  return decodeWrite(response.value);
}

export type TransitionAction =
  | "archiveAssessment"
  | "unarchiveAssessment"
  | "pauseAssessment"
  | "closeAssessment"
  | "resumeAssessment";

export async function transitionAssessment(
  action: TransitionAction,
  requestId: string,
  input: { assessmentId: string; actor: string },
  options?: RequestOptions,
): Promise<Result<WriteResult>> {
  const response = await apiWrite<unknown>(action, requestId, { ...input }, options);
  if (!response.ok) return err(response.error);
  return decodeWrite(response.value);
}

export async function rollbackAssessment(
  requestId: string,
  input: { assessmentId: string; versionId: string; actor: string },
  options?: RequestOptions,
): Promise<Result<WriteResult>> {
  const response = await apiWrite<unknown>("rollbackAssessment", requestId, { ...input }, options);
  if (!response.ok) return err(response.error);
  return decodeWrite(response.value);
}
