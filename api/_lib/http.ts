/**
 * Utilidades HTTP del backend intermedio.
 *
 * El envoltorio de respuesta es EXACTAMENTE el del backend de Apps Script
 * (`{ ok, requestId, data, error, warnings }`), de modo que el cliente tenga un
 * solo contrato que validar sin importar quién respondió. Ver
 * docs/evaluations/API_CONTRACT.md.
 */

export interface Envelope {
  ok: boolean;
  requestId: string;
  data: unknown;
  error: { code: string; message: string; details: Record<string, unknown> } | null;
  warnings: string[];
}

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  // Las respuestas administrativas nunca deben quedar en cachés intermedias.
  "Cache-Control": "no-store",
};

export function jsonResponse(body: Envelope, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { ...JSON_HEADERS, ...(init.headers ?? {}) },
  });
}

export function okEnvelope(data: unknown, requestId = "", warnings: string[] = []): Envelope {
  return { ok: true, requestId, data, error: null, warnings };
}

export function failEnvelope(
  code: string,
  message: string,
  details: Record<string, unknown> = {},
  requestId = "",
): Envelope {
  return { ok: false, requestId, data: null, error: { code, message, details }, warnings: [] };
}

/**
 * ¿La petición viene del mismo sitio?
 *
 * La cookie ya es `SameSite=Strict`, así que un formulario de otro dominio no la
 * envía. Esta comprobación es la segunda barrera: si llega una cabecera `Origin`
 * ajena, se rechaza en lugar de confiar solo en el navegador.
 */
export function isAllowedOrigin(request: Request, allowedOrigins: string[]): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // Peticiones del mismo origen pueden omitirlo.
  if (allowedOrigins.includes(origin)) return true;
  try {
    return new URL(origin).host === (request.headers.get("host") ?? new URL(request.url).host);
  } catch {
    return false;
  }
}

/** Cuerpo JSON de la petición, o `null` si no es JSON válido. */
export async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text();
    if (!text) return {};
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Clave de limitación: la IP que reporta el proxy de Vercel. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0].trim() || "desconocido";
}
