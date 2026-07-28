/**
 * `/api/evaluations/admin` — proxy firmante de las operaciones administrativas.
 *
 * Es el único componente que conoce el secreto compartido con Apps Script. El
 * reparto de responsabilidades es explícito:
 *
 *   React (Vercel)      qué se quiere hacer; NO custodia secretos.
 *   este proxy          ¿hay sesión?; ¿la acción es administrativa?; firma.
 *   Apps Script         verifica la firma, valida, bloquea, audita y escribe.
 *   Google Sheets       almacenamiento.
 *
 * Lo que este archivo NO hace: interpretar la carga, validar reglas de negocio ni
 * transformar la respuesta. La carga viaja tal cual y la respuesta se devuelve tal
 * cual, para que el contrato siga siendo el del backend (un solo envoltorio).
 *
 * Sobre la forma del módulo (exportaciones con nombre de método HTTP y sin
 * `export default`), ver la nota extensa en `session.ts`: es lo que hace que el
 * runtime Node.js de Vercel invoque este archivo con la API web.
 */

import { isAdminAction, isWriteAction } from "../_lib/adminActions.js";
import { readSessionCookie, verifySessionToken } from "../_lib/adminSession.js";
import { signAdminCredential } from "../_lib/appsScriptSignature.js";
import { configErrorMessage, readAdminProxyConfig } from "../_lib/config.js";
import { failEnvelope, isAllowedOrigin, jsonResponse, readJsonBody, type Envelope } from "../_lib/http.js";

/** Tiempo máximo que se espera a Apps Script. */
const UPSTREAM_TIMEOUT_MS = 25000;

/** Tamaño máximo admitido para la carga reenviada. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

async function handleAdmin(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse(failEnvelope("BAD_REQUEST", "Método no admitido."), { status: 405 });
  }

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

  const claims = verifySessionToken({
    secret: config.sessionSecret,
    token: readSessionCookie(request.headers.get("cookie")),
  });
  if (!claims) {
    // El cliente distingue este caso por `details.adminSession` y pide la frase
    // de acceso en lugar de mostrar un error genérico.
    return jsonResponse(
      failEnvelope("FORBIDDEN", "La sesión administrativa expiró o no se ha iniciado.", {
        adminSession: "required",
      }),
    );
  }

  const body = await readJsonBody(request);
  if (!body) return jsonResponse(failEnvelope("BAD_REQUEST", "El cuerpo debe ser JSON."));

  const action = body.action;
  if (!isAdminAction(action)) {
    // Las acciones públicas no pasan por aquí: el navegador las llama directamente
    // contra Apps Script y no necesitan credencial.
    return jsonResponse(
      failEnvelope("UNSUPPORTED_ACTION", "Esta acción no se firma desde el backend administrativo."),
    );
  }

  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  if (isWriteAction(action) && !requestId) {
    return jsonResponse(
      failEnvelope("BAD_REQUEST", 'Toda escritura debe incluir un "requestId" para garantizar la idempotencia.'),
    );
  }

  const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
  const upstreamBody = JSON.stringify({
    action,
    requestId,
    payload,
    auth: signAdminCredential({
      secret: config.adminSecret,
      action,
      requestId,
      // El actor lo afirma ESTA sesión, no el navegador: así el cliente no puede
      // suplantar a otro reclutador en la bitácora.
      actor: claims.actor,
    }),
  });

  if (upstreamBody.length > MAX_BODY_BYTES) {
    return jsonResponse(failEnvelope("BAD_REQUEST", "La solicitud es demasiado grande."));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(config.appsScriptUrl, {
      method: "POST",
      redirect: "follow",
      // Apps Script no puede contestar el preflight de CORS; `text/plain` evita
      // que se dispare. Aquí no hay navegador, pero el requisito es del endpoint.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: upstreamBody,
      signal: controller.signal,
    });
    const text = await upstream.text();
    let envelope: unknown;
    try {
      envelope = JSON.parse(text);
    } catch {
      return jsonResponse(
        failEnvelope("INTERNAL_ERROR", "El servidor de evaluaciones respondió con un formato inesperado.", {}, requestId),
      );
    }
    if (!envelope || typeof envelope !== "object" || typeof (envelope as Envelope).ok !== "boolean") {
      return jsonResponse(
        failEnvelope("INTERNAL_ERROR", "El servidor de evaluaciones respondió con un formato inesperado.", {}, requestId),
      );
    }
    // La respuesta se devuelve intacta: el contrato es el del backend.
    return jsonResponse(envelope as Envelope);
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return jsonResponse(
      failEnvelope(
        aborted ? "LOCK_TIMEOUT" : "INTERNAL_ERROR",
        aborted
          ? "El servidor de evaluaciones tardó demasiado en responder."
          : "No se pudo contactar con el servidor de evaluaciones.",
        {},
        requestId,
      ),
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Superficie que Vercel invoca.
 *
 * Solo `POST` firma y reenvía. `GET` y `DELETE` también se exportan para que un
 * cliente que se equivoque de método reciba el mismo envoltorio JSON con
 * `405` en lugar de una respuesta vacía del propio lanzador: el cliente valida
 * el envoltorio y una respuesta sin cuerpo se convertiría en un error genérico
 * de red, justo lo que este trabajo trata de eliminar.
 */
export const POST = handleAdmin;
export const GET = handleAdmin;
export const DELETE = handleAdmin;
