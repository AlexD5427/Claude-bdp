/**
 * Firma de las operaciones administrativas de Evaluaciones.
 *
 * Este módulo vive en el backend intermedio (funciones serverless). Es el ÚNICO
 * lugar del repositorio que toca el secreto compartido con Apps Script, y nunca
 * se importa desde `src/`: el bundle del navegador no puede contenerlo. Hay una
 * verificación estática que lo exige (`npm run check`).
 *
 * El verificador correspondiente es `apps-script/evaluations/Signature.gs`. La
 * canonicalización debe coincidir carácter a carácter; una prueba compara ambas
 * implementaciones (`appsScript.authorization.test.ts`).
 */

import { createHmac, randomUUID } from "node:crypto";

/** Esquema de credencial admitido por el backend. */
export const ADMIN_CREDENTIAL_SCHEME = "hmac-sha256";

/** Versión de la canonicalización. Debe ser la misma que en `Signature.gs`. */
const CANONICAL_VERSION = "v1";

/** Longitud mínima del secreto compartido, igual que en el servidor. */
export const MIN_SECRET_LENGTH = 32;

export interface CredentialParts {
  action: string;
  requestId: string;
  timestamp: string;
  nonce: string;
  actor: string;
}

/** Credencial que viaja en el campo `auth` de la solicitud a Apps Script. */
export interface AdminCredential {
  scheme: typeof ADMIN_CREDENTIAL_SCHEME;
  timestamp: string;
  nonce: string;
  actor: string;
  signature: string;
}

/**
 * Cadena canónica que se firma.
 *
 * No incluye el cuerpo de la solicitud: quien firma es este backend y el canal
 * es TLS, así que el navegador nunca ve una firma que pudiera reutilizar con
 * otro cuerpo. Incluir un resumen del cuerpo obligaría a que Apps Script
 * reserializase el JSON byte a byte igual, algo que su runtime no garantiza.
 */
export function canonicalString(parts: CredentialParts): string {
  return [CANONICAL_VERSION, parts.action, parts.requestId, parts.timestamp, parts.nonce, parts.actor].join("\n");
}

/**
 * Firma una operación administrativa.
 *
 * `timestamp` y `nonce` se generan aquí salvo en las pruebas de paridad, que los
 * fijan para comparar implementaciones.
 */
export function signAdminCredential(input: {
  secret: string;
  action: string;
  requestId: string;
  actor: string;
  timestamp?: string;
  nonce?: string;
}): AdminCredential {
  if (input.secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`El secreto administrativo debe tener al menos ${MIN_SECRET_LENGTH} caracteres.`);
  }
  const timestamp = input.timestamp ?? new Date().toISOString();
  const nonce = input.nonce ?? `nonce_${randomUUID()}`;
  const signature = createHmac("sha256", input.secret)
    .update(
      canonicalString({
        action: input.action,
        requestId: input.requestId,
        timestamp,
        nonce,
        actor: input.actor,
      }),
      "utf8",
    )
    .digest("base64");
  return { scheme: ADMIN_CREDENTIAL_SCHEME, timestamp, nonce, actor: input.actor, signature };
}
