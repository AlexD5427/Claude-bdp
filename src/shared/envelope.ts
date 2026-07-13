/**
 * Provider response envelope.
 *
 * Every provider (Apps Script today, Supabase tomorrow) must answer with this
 * consistent shape so adapters can validate uniformly before mapping to domain
 * models. The Apps Script backend historically answered `{ status, message }`;
 * the adapter normalizes that legacy shape into this envelope.
 */

import { z } from "zod";

export interface ResponseEnvelope<T = unknown> {
  success: boolean;
  data: T | null;
  error: string | null;
  requestId: string;
  timestamp: string;
  schemaVersion: number;
}

export const CURRENT_SCHEMA_VERSION = 1;

export const envelopeSchema = z.object({
  success: z.boolean(),
  data: z.unknown().nullable(),
  error: z.string().nullable(),
  requestId: z.string(),
  timestamp: z.string(),
  schemaVersion: z.number(),
});

export function makeEnvelope<T>(
  partial: Partial<ResponseEnvelope<T>> & { success: boolean },
): ResponseEnvelope<T> {
  return {
    success: partial.success,
    data: partial.data ?? null,
    error: partial.error ?? null,
    requestId: partial.requestId ?? cryptoRequestId(),
    timestamp: partial.timestamp ?? new Date().toISOString(),
    schemaVersion: partial.schemaVersion ?? CURRENT_SCHEMA_VERSION,
  };
}

/**
 * Normalize the legacy `{ status: "success"|"error", message, ...rest }` shape
 * used by the current Apps Script backend into a typed envelope.
 */
export function fromLegacy<T>(raw: unknown): ResponseEnvelope<T> {
  const obj = (raw ?? {}) as Record<string, unknown>;
  if (typeof obj.success === "boolean") {
    // Already an envelope.
    return makeEnvelope<T>(obj as Partial<ResponseEnvelope<T>> & { success: boolean });
  }
  const status = String(obj.status ?? "").toLowerCase();
  const success = status === "success" || status === "ok";
  const { status: _s, message, ...rest } = obj;
  return makeEnvelope<T>({
    success,
    data: (success ? (rest as T) : null) ?? null,
    error: success ? null : String(message ?? "Error del proveedor"),
  });
}

export function cryptoRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
