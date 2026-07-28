/**
 * `/api/evaluations/session` — puerta del panel administrativo.
 *
 * Responsabilidades (y solo estas):
 *  · POST   comprueba la frase de acceso y emite la cookie de sesión.
 *  · GET    dice si la sesión sigue vigente (para pintar la interfaz).
 *  · DELETE la cierra.
 *
 * Lo que NO hace: hablar con Google Sheets, firmar operaciones ni conocer la
 * lógica de Evaluaciones. Eso es de `admin.ts` y del backend de Apps Script.
 *
 * La frase de acceso vive en la variable de entorno `EVALUATIONS_PANEL_PASSPHRASE`
 * del proyecto de Vercel. No se registra, no se devuelve y no llega al bundle.
 */

import {
  clearLoginAttempts,
  clearedSessionCookie,
  issueSessionToken,
  readSessionCookie,
  registerLoginAttempt,
  safeEquals,
  sessionCookie,
  SESSION_TTL_SECONDS,
  verifySessionToken,
} from "../_lib/adminSession";
import { configErrorMessage, readAdminProxyConfig } from "../_lib/config";
import { clientKey, failEnvelope, isAllowedOrigin, jsonResponse, okEnvelope, readJsonBody } from "../_lib/http";

/** Actor por omisión cuando el panel no envía uno. */
const DEFAULT_ACTOR = "panel";

function normalizeActor(raw: unknown): string {
  const actor = typeof raw === "string" ? raw.trim().slice(0, 120) : "";
  // Solo una etiqueta para la auditoría: sin saltos de línea ni comas.
  return actor.replace(/[\r\n,;]/g, " ").trim() || DEFAULT_ACTOR;
}

export default async function handler(request: Request): Promise<Response> {
  const configuration = readAdminProxyConfig();
  if (!configuration.ok) {
    return jsonResponse(
      failEnvelope("INTERNAL_ERROR", configErrorMessage(configuration), { adminSession: "unconfigured" }),
    );
  }
  const config = configuration.config;

  if (!isAllowedOrigin(request, config.allowedOrigins)) {
    return jsonResponse(failEnvelope("FORBIDDEN", "Origen no permitido."));
  }

  if (request.method === "GET") {
    const claims = verifySessionToken({
      secret: config.sessionSecret,
      token: readSessionCookie(request.headers.get("cookie")),
    });
    return jsonResponse(
      okEnvelope({ active: claims !== null, actor: claims?.actor ?? "", expiresAt: claims?.expiresAt ?? 0 }),
    );
  }

  if (request.method === "DELETE") {
    return jsonResponse(okEnvelope({ active: false }), {
      headers: { "Set-Cookie": clearedSessionCookie() },
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(failEnvelope("BAD_REQUEST", "Método no admitido."), { status: 405 });
  }

  const body = await readJsonBody(request);
  if (!body) return jsonResponse(failEnvelope("BAD_REQUEST", "El cuerpo debe ser JSON."));

  const throttle = registerLoginAttempt(clientKey(request));
  if (!throttle.allowed) {
    return jsonResponse(
      failEnvelope("FORBIDDEN", "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.", {
        retryAfterSeconds: throttle.retryAfterSeconds,
      }),
    );
  }

  const passphrase = typeof body.passphrase === "string" ? body.passphrase : "";
  if (!safeEquals(config.panelPassphrase, passphrase)) {
    // Mismo mensaje siempre: no se distingue «frase vacía» de «frase incorrecta».
    return jsonResponse(failEnvelope("FORBIDDEN", "La frase de acceso no es correcta."));
  }

  clearLoginAttempts(clientKey(request));
  const actor = normalizeActor(body.actor);
  const { token, claims } = issueSessionToken({ secret: config.sessionSecret, actor });
  return jsonResponse(okEnvelope({ active: true, actor: claims.actor, expiresAt: claims.expiresAt }), {
    headers: { "Set-Cookie": sessionCookie(token, SESSION_TTL_SECONDS) },
  });
}
