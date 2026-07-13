/**
 * Normalised error handling.
 *
 * Data providers (Apps Script, mock, future Supabase) fail in many shapes:
 * network aborts, HTTP errors, malformed JSON, schema-validation failures,
 * business-rule violations. The UI should never see a raw stack trace. Every
 * failure is normalised into a small `AppError` with a machine-readable `code`
 * and a Spanish, user-safe `message`.
 */

export type AppErrorCode =
  | "network"
  | "timeout"
  | "aborted"
  | "http"
  | "parse"
  | "validation"
  | "not_found"
  | "conflict"
  | "unsupported"
  | "permission"
  | "unknown";

export interface AppErrorShape {
  code: AppErrorCode;
  /** User-facing, Spanish, never containing secrets or stack traces. */
  message: string;
  /** Optional technical detail for logs (not shown in production UI). */
  detail?: string;
  /** Correlates a failure with a backend request when available. */
  requestId?: string;
}

export class AppError extends Error implements AppErrorShape {
  code: AppErrorCode;
  detail?: string;
  requestId?: string;

  constructor(shape: AppErrorShape) {
    super(shape.message);
    this.name = "AppError";
    this.code = shape.code;
    this.detail = shape.detail;
    this.requestId = shape.requestId;
  }
}

const SPANISH_BY_CODE: Record<AppErrorCode, string> = {
  network: "No se pudo conectar con el servidor. Verifica tu conexión.",
  timeout: "La solicitud tardó demasiado. Inténtalo de nuevo.",
  aborted: "La solicitud se canceló.",
  http: "El servidor respondió con un error.",
  parse: "La respuesta del servidor no tenía el formato esperado.",
  validation: "Los datos no superaron la validación.",
  not_found: "No se encontró el recurso solicitado.",
  conflict: "Los datos cambiaron en el servidor. Vuelve a cargar.",
  unsupported: "Operación no soportada.",
  permission: "No tienes permiso para realizar esta acción.",
  unknown: "Ocurrió un error inesperado.",
};

/** Coerce any thrown value into an `AppError` with a Spanish message. */
export function toAppError(err: unknown, fallbackCode: AppErrorCode = "unknown"): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof DOMException && err.name === "AbortError") {
    return new AppError({ code: "aborted", message: SPANISH_BY_CODE.aborted });
  }
  if (err instanceof Error) {
    const code: AppErrorCode = /timeout/i.test(err.message)
      ? "timeout"
      : /network|failed to fetch/i.test(err.message)
        ? "network"
        : fallbackCode;
    return new AppError({ code, message: SPANISH_BY_CODE[code], detail: err.message });
  }
  return new AppError({ code: fallbackCode, message: SPANISH_BY_CODE[fallbackCode] });
}

/** Build an `AppError` for a specific code with an optional detail. */
export function appError(code: AppErrorCode, detail?: string, requestId?: string): AppError {
  return new AppError({ code, message: SPANISH_BY_CODE[code], detail, requestId });
}
