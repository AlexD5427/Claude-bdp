/**
 * Transporte HTTP del módulo Evaluaciones.
 *
 * Reglas que este archivo hace cumplir (todas heredadas del backend real):
 *  · `redirect: "follow"` siempre — Google responde 302 y sin seguirlo la app
 *    falla con 404 en producción.
 *  · Las escrituras se envían con `Content-Type: text/plain;charset=utf-8` para
 *    no disparar el preflight de CORS que el despliegue no puede contestar.
 *  · Timeout con `AbortController`, cancelable desde el llamador.
 *  · Las lecturas se reintentan con retroceso exponencial; las ESCRITURAS NO se
 *    reintentan nunca de forma automática. El `requestId` permite reintentar a
 *    mano sin duplicar efectos.
 *
 * No hay secretos aquí: la URL del Web App es pública por diseño.
 */

import { err, ok, appError, type Result } from "../../../shared/result";
import { ASSESSMENTS_API_URL } from "../../../shared/flags";
import { parseEnvelope, toAppError, type ApiEnvelope } from "./contract";

const DEFAULT_TIMEOUT_MS = 15000;
const READ_RETRIES = 2;

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface ApiRequest {
  action: string;
  requestId: string;
  payload: Record<string, unknown>;
}

function withTimeout(external: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return { signal: controller.signal, cleanup: () => clearTimeout(timer) };
}

function normalizeTransportError(error: unknown, aborted: boolean) {
  if (aborted) return appError("timeout", "La solicitud se canceló o tardó demasiado.");
  const message = error instanceof Error ? error.message : "";
  if (/HTTP 4\d\d/.test(message)) return appError("provider", "El servidor rechazó la solicitud.");
  if (/HTTP 5\d\d/.test(message)) return appError("provider", "El servidor no está disponible.");
  if (/abort/i.test(message)) return appError("timeout", "La solicitud tardó demasiado.");
  return appError("network", "No se pudo conectar con el servidor de evaluaciones.");
}

async function post(
  body: ApiRequest,
  options: RequestOptions,
): Promise<Result<ApiEnvelope<unknown>>> {
  const { signal, cleanup } = withTimeout(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(ASSESSMENTS_API_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return ok(parseEnvelope<unknown>(await response.json()));
  } catch (error) {
    return err(normalizeTransportError(error, options.signal?.aborted === true));
  } finally {
    cleanup();
  }
}

/**
 * Lectura idempotente. Se reintenta ante fallos transitorios de red.
 */
export async function apiRead<T>(
  action: string,
  payload: Record<string, unknown> = {},
  options: RequestOptions = {},
): Promise<Result<ApiEnvelope<T>>> {
  let lastError = appError("network", "No se pudo conectar con el servidor de evaluaciones.");
  for (let attempt = 0; attempt <= READ_RETRIES; attempt++) {
    const result = await post({ action, requestId: "", payload }, options);
    if (result.ok) {
      const envelope = result.value as ApiEnvelope<T>;
      if (envelope.ok) return ok(envelope);
      // Un error de negocio no se reintenta: es una respuesta válida.
      return err(toAppError(envelope));
    }
    lastError = result.error;
    if (lastError.code === "timeout" || options.signal?.aborted) break;
    if (attempt < READ_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
  return err(lastError);
}

/**
 * Escritura. NO se reintenta automáticamente. El `requestId` debe generarse una
 * sola vez por intención del usuario y reutilizarse si se reintenta a mano.
 */
export async function apiWrite<T>(
  action: string,
  requestId: string,
  payload: Record<string, unknown> = {},
  options: RequestOptions = {},
): Promise<Result<ApiEnvelope<T>>> {
  const result = await post({ action, requestId, payload }, options);
  if (!result.ok) return err(result.error);
  const envelope = result.value as ApiEnvelope<T>;
  if (!envelope.ok) return err(toAppError(envelope));
  return ok(envelope);
}
