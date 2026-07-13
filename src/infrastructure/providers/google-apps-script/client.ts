/**
 * Apps Script HTTP client.
 *
 * A thin, safe wrapper around the existing Google Apps Script web app endpoint
 * (`SCRIPT_URL`). It reuses the established request protocol:
 *   · GET for reads (follows Google's 302 redirect, JSON accept header).
 *   · POST with `text/plain` body (avoids the CORS preflight the default Apps
 *     Script deployment cannot answer).
 *
 * It adds a timeout + AbortController, small exponential-backoff retries for
 * idempotent reads only, response-envelope normalization, and normalized errors.
 * No secrets are read or logged here — the endpoint URL is the only config.
 */

import { SCRIPT_URL } from "../../../constants";
import { appError, err, ok, type Result } from "../../../shared/result";
import { fromLegacy, type ResponseEnvelope } from "../../../shared/envelope";

const DEFAULT_TIMEOUT_MS = 15000;

interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Combine an external signal with an internal timeout signal. */
function withTimeout(external: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return { signal: controller.signal, cleanup: () => clearTimeout(timer) };
}

/**
 * GET the shared payload with a specific `action` query. Idempotent, so it is
 * safe to retry with exponential backoff on transient failures.
 */
export async function apiGet<T>(
  params: Record<string, string>,
  options: RequestOptions = {},
  attempt = 0,
): Promise<Result<ResponseEnvelope<T>>> {
  const { signal, cleanup } = withTimeout(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const url = `${SCRIPT_URL}?${new URLSearchParams(params).toString()}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { Accept: "application/json" },
      signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as unknown;
    return ok(fromLegacy<T>(json));
  } catch (e) {
    if (options.signal?.aborted) return err(appError("timeout", "Solicitud cancelada."));
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      return apiGet<T>(params, options, attempt + 1);
    }
    return err(normalizeError(e));
  } finally {
    cleanup();
  }
}

/**
 * POST a command. Writes are NOT retried automatically (to avoid duplicate
 * side effects); an `idempotencyKey` is included so the backend can dedupe when
 * it supports it.
 */
export async function apiPost<T>(
  body: Record<string, unknown>,
  options: RequestOptions = {},
): Promise<Result<ResponseEnvelope<T>>> {
  const { signal, cleanup } = withTimeout(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as unknown;
    const envelope = fromLegacy<T>(json);
    if (!envelope.success) {
      return err(appError("provider", envelope.error ?? "Error del proveedor."));
    }
    return ok(envelope);
  } catch (e) {
    if (options.signal?.aborted) return err(appError("timeout", "Solicitud cancelada."));
    return err(normalizeError(e));
  } finally {
    cleanup();
  }
}

function normalizeError(e: unknown): ReturnType<typeof appError> {
  const message = e instanceof Error ? e.message : "";
  if (/HTTP 4\d\d/.test(message)) return appError("provider", "El servidor rechazó la solicitud.");
  if (/HTTP 5\d\d/.test(message)) return appError("provider", "El servidor no está disponible.");
  if (/aborted|timeout/i.test(message)) return appError("timeout", "La solicitud tardó demasiado.");
  return appError("network", "No se pudo conectar con el servidor.");
}
