/**
 * Transporte HTTP del módulo Evaluaciones.
 *
 * Hay DOS destinos, y la diferencia es de autorización, no de estilo:
 *
 *   acciones públicas  →  Web App de Apps Script, sin credencial.
 *   acciones admin.    →  backend intermedio (`/api/evaluations/admin`), que
 *                         custodia el secreto y firma la llamada antes de
 *                         reenviarla a Apps Script.
 *
 * El navegador NUNCA firma nada: no conoce ningún secreto, ni siquiera de forma
 * ofuscada. Lo único que envía al backend intermedio es la cookie de sesión que
 * ese backend le dio tras validar la frase de acceso.
 *
 * Reglas que este archivo hace cumplir (heredadas del backend real):
 *  · `redirect: "follow"` siempre — Google responde 302 y sin seguirlo la app
 *    falla con 404 en producción.
 *  · Las llamadas directas a Apps Script se envían con
 *    `Content-Type: text/plain;charset=utf-8` para no disparar el preflight de
 *    CORS que el despliegue no puede contestar. Las que van al backend
 *    intermedio sí son `application/json`: es nuestro propio servidor.
 *  · Timeout con `AbortController`, cancelable desde el llamador.
 *  · Las lecturas se reintentan con retroceso exponencial; las ESCRITURAS NO se
 *    reintentan nunca de forma automática. El `requestId` permite reintentar a
 *    mano sin duplicar efectos.
 */

import { err, ok, appError, type Result } from "../../../shared/result";
import { SCRIPT_URL } from "../../../constants";
import {
  ASSESSMENTS_ADMIN_API_URL,
  ASSESSMENTS_ADMIN_SESSION_URL,
  ASSESSMENTS_API_URL_OVERRIDE,
} from "../../../shared/flags";
import { isAdminAction } from "./adminActions";
import { adminSessionState } from "./adminSessionState";
import { parseEnvelope, requiresAdminSession, toAppError, type ApiEnvelope } from "./contract";

const DEFAULT_TIMEOUT_MS = 15000;
const READ_RETRIES = 2;

/**
 * Endpoint público. Se resuelve aquí (y no en `flags.ts`) para que el módulo de
 * banderas siga siendo importable desde lógica pura sin arrastrar `constants.ts`.
 */
const PUBLIC_API_URL = ASSESSMENTS_API_URL_OVERRIDE ?? SCRIPT_URL;

/** ¿Las operaciones administrativas pasan por el backend intermedio? */
export const adminProxyEnabled = ASSESSMENTS_ADMIN_API_URL !== null;

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface ApiRequest {
  action: string;
  requestId: string;
  payload: Record<string, unknown>;
}

interface Endpoint {
  url: string;
  /** El backend intermedio necesita la cookie de sesión; Apps Script, no. */
  viaProxy: boolean;
}

/** Destino de una acción. Único punto donde se decide. */
function endpointFor(action: string): Endpoint {
  if (ASSESSMENTS_ADMIN_API_URL && isAdminAction(action)) {
    return { url: ASSESSMENTS_ADMIN_API_URL, viaProxy: true };
  }
  return { url: PUBLIC_API_URL, viaProxy: false };
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
  const endpoint = endpointFor(body.action);
  const { signal, cleanup } = withTimeout(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      redirect: "follow",
      headers: {
        "Content-Type": endpoint.viaProxy ? "application/json" : "text/plain;charset=utf-8",
      },
      // La cookie de sesión es `SameSite=Strict` y `HttpOnly`: el navegador la
      // adjunta, el JavaScript no la lee.
      ...(endpoint.viaProxy ? { credentials: "same-origin" as RequestCredentials } : {}),
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const envelope = parseEnvelope<unknown>(await response.json());
    // Si el backend intermedio dice que falta sesión, se avisa a la interfaz para
    // que pida la frase de acceso en lugar de mostrar un error sin salida.
    if (endpoint.viaProxy) adminSessionState.observe(envelope.ok ? "active" : requiresAdminSession(envelope) ? "required" : "unknown");
    return ok(envelope);
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

/* ------------------------ Sesión del panel administrativo ------------------ */

export interface AdminSessionInfo {
  active: boolean;
  actor: string;
  expiresAt: number;
}

async function sessionRequest(
  method: "GET" | "POST" | "DELETE",
  body?: Record<string, unknown>,
): Promise<Result<AdminSessionInfo>> {
  if (!ASSESSMENTS_ADMIN_SESSION_URL) {
    return err(appError("provider", "Este despliegue no usa sesión administrativa."));
  }
  try {
    const response = await fetch(ASSESSMENTS_ADMIN_SESSION_URL, {
      method,
      credentials: "same-origin",
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    const envelope = parseEnvelope<AdminSessionInfo>(await response.json());
    if (!envelope.ok) return err(toAppError(envelope));
    const data = envelope.data;
    return ok({
      active: data?.active === true,
      actor: typeof data?.actor === "string" ? data.actor : "",
      expiresAt: typeof data?.expiresAt === "number" ? data.expiresAt : 0,
    });
  } catch (error) {
    return err(normalizeTransportError(error, false));
  }
}

/** ¿Hay sesión administrativa vigente? */
export function adminSessionStatus(): Promise<Result<AdminSessionInfo>> {
  return sessionRequest("GET");
}

/**
 * Abre la sesión con la frase de acceso del panel.
 *
 * La frase viaja UNA vez a nuestro propio backend por HTTPS y no se guarda en
 * ningún sitio del navegador: lo que queda es una cookie `HttpOnly` que el
 * JavaScript no puede leer.
 */
export function openAdminSession(passphrase: string, actor: string): Promise<Result<AdminSessionInfo>> {
  return sessionRequest("POST", { passphrase, actor });
}

/** Cierra la sesión administrativa. */
export function closeAdminSession(): Promise<Result<AdminSessionInfo>> {
  return sessionRequest("DELETE");
}
