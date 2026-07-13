/**
 * A tiny Result type used across repositories and application services so
 * failures are values (not thrown) and the UI can branch exhaustively.
 */

export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export interface AppError {
  /** Stable, machine-readable code (never shown raw to users). */
  code: AppErrorCode;
  /** Localized, user-safe message. */
  message: string;
  /** Optional non-sensitive detail for logs. */
  detail?: string;
}

export type AppErrorCode =
  | "network"
  | "timeout"
  | "validation"
  | "not_found"
  | "conflict"
  | "forbidden"
  | "provider"
  | "unknown";

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E = AppError>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function appError(
  code: AppErrorCode,
  message: string,
  detail?: string,
): AppError {
  return detail !== undefined ? { code, message, detail } : { code, message };
}
