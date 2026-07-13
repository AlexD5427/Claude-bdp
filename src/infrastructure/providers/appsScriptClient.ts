import { env } from "../env";
import { appError, toAppError } from "../../shared/errors";
import { ApiEnvelopeSchema, type ApiEnvelope } from "./envelope";

/**
 * A thin, safe client for the existing Google Apps Script web app.
 *
 * It reuses the ATS's proven fetch conventions:
 *   · `redirect: "follow"` so Google's 302 is followed in production (Vercel);
 *   · `text/plain` POST body to dodge the CORS preflight the default Apps Script
 *     deployment cannot answer.
 *
 * On top of that it adds a request timeout via `AbortController`, response
 * validation against the shared envelope, normalised `AppError`s, and a small
 * retry that is applied ONLY to idempotent reads (GET). Non-idempotent writes
 * are never retried automatically to avoid duplicate rows.
 */

const DEFAULT_TIMEOUT_MS = 20000;
const READ_RETRIES = 2;

interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Merge an external signal with an internal timeout signal. */
function withTimeout(external: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal;
  cancel: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("timeout", "AbortError")), timeoutMs);
  const onAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timer);
      external?.removeEventListener("abort", onAbort);
    },
  };
}

async function parseEnvelope(res: Response): Promise<ApiEnvelope> {
  if (!res.ok) throw appError("http", `HTTP ${res.status}`);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw appError("parse", "Respuesta no-JSON");
  }
  // The legacy backend returns `{ status: "success" | "error", ... }` for many
  // operations. Normalise both the new envelope and the legacy shape.
  if (json && typeof json === "object" && "status" in (json as Record<string, unknown>)) {
    const legacy = json as Record<string, unknown>;
    return {
      success: legacy.status === "success",
      data: legacy,
      error:
        legacy.status === "success"
          ? undefined
          : { message: String(legacy.message ?? "Error"), code: "legacy" },
    };
  }
  const result = ApiEnvelopeSchema.safeParse(json);
  if (!result.success) {
    // Not an envelope at all (e.g. the GET payload). Treat the raw JSON as data.
    return { success: true, data: json };
  }
  return result.data as ApiEnvelope;
}

/** Perform a GET (idempotent) with retry + timeout. */
export async function getJson<T = unknown>(
  query: Record<string, string> = {},
  options: RequestOptions = {},
): Promise<ApiEnvelope<T>> {
  const url = new URL(env.appsScriptUrl);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

  let lastErr: unknown;
  for (let attempt = 0; attempt <= READ_RETRIES; attempt++) {
    const { signal, cancel } = withTimeout(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      const res = await fetch(url.toString(), {
        method: "GET",
        redirect: "follow",
        headers: { Accept: "application/json" },
        signal,
      });
      return (await parseEnvelope(res)) as ApiEnvelope<T>;
    } catch (err) {
      lastErr = err;
      if (options.signal?.aborted) throw toAppError(err, "aborted");
      if (attempt < READ_RETRIES) {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        continue;
      }
    } finally {
      cancel();
    }
  }
  throw toAppError(lastErr, "network");
}

/**
 * Perform a POST (NON-idempotent) with timeout but WITHOUT automatic retry.
 * Callers that need at-most-once semantics should pass an idempotency key in the
 * body and let the backend deduplicate.
 */
export async function postJson<T = unknown>(
  body: Record<string, unknown>,
  options: RequestOptions = {},
): Promise<ApiEnvelope<T>> {
  const { signal, cancel } = withTimeout(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(env.appsScriptUrl, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      signal,
    });
    return (await parseEnvelope(res)) as ApiEnvelope<T>;
  } catch (err) {
    throw toAppError(err, "network");
  } finally {
    cancel();
  }
}
