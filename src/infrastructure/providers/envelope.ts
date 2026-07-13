import { z } from "zod";

/**
 * The canonical response envelope every data-provider operation returns.
 *
 * A single, validated shape lets the UI treat Apps Script, mock and future
 * Supabase responses identically, and gives every request a `requestId` for
 * correlation and a `schemaVersion` for forward-compatible migrations.
 */

export const ApiEnvelopeSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z
    .object({
      code: z.string().optional(),
      message: z.string(),
    })
    .optional(),
  requestId: z.string().optional(),
  timestamp: z.string().optional(),
  schemaVersion: z.number().optional(),
});

export type ApiEnvelope<T = unknown> = {
  success: boolean;
  data?: T;
  error?: { code?: string; message: string };
  requestId?: string;
  timestamp?: string;
  schemaVersion?: number;
};

/** Wrap a value into a success envelope (used by the mock provider). */
export function ok<T>(data: T, schemaVersion = 1): ApiEnvelope<T> {
  return {
    success: true,
    data,
    requestId: cryptoRequestId(),
    timestamp: new Date().toISOString(),
    schemaVersion,
  };
}

/** Build a failure envelope. */
export function fail(message: string, code = "error"): ApiEnvelope<never> {
  return {
    success: false,
    error: { code, message },
    requestId: cryptoRequestId(),
    timestamp: new Date().toISOString(),
  };
}

function cryptoRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
