/**
 * Sesión administrativa del backend intermedio.
 *
 * El panel de React no puede custodiar el secreto que firma las operaciones
 * administrativas, así que el reparto de responsabilidades es:
 *
 *   navegador  ──frase de acceso──►  este backend  ──firma HMAC──►  Apps Script
 *
 * El navegador se autentica UNA vez contra `/api/evaluations/session` y recibe
 * una cookie de sesión firmada, `HttpOnly` + `Secure` + `SameSite=Strict`. Esa
 * cookie no sirve para nada fuera de este backend: no es la credencial de Apps
 * Script, solo demuestra que quien llama pasó la puerta.
 *
 * Es una puerta deliberadamente sencilla y transitoria. Cuando el ATS incorpore
 * Google Login (o cualquier OIDC), solo cambia CÓMO se emite esta sesión: la
 * firma hacia Apps Script y la lógica de negocio quedan igual.
 */

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/** Nombre de la cookie de sesión. */
export const SESSION_COOKIE = "eval_admin_session";

/** Duración de la sesión. */
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

/** Longitud mínima de los secretos de este backend. */
export const MIN_SECRET_LENGTH = 32;

export interface SessionClaims {
  /** Etiqueta del actor que se auditará en Apps Script (correo del reclutador). */
  actor: string;
  /** Emisión y caducidad, en segundos epoch. */
  issuedAt: number;
  expiresAt: number;
  /** Identificador de la sesión, útil para trazas. */
  sessionId: string;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded + "=".repeat((4 - (padded.length % 4)) % 4), "base64");
}

function sign(secret: string, payload: string): string {
  return base64url(createHmac("sha256", secret).update(payload, "utf8").digest());
}

/** Comparación de tiempo constante entre dos cadenas. */
export function safeEquals(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(actual, "utf8");
  if (a.length !== b.length) {
    // `timingSafeEqual` exige la misma longitud; se compara contra sí mismo para
    // no cortar antes y aun así devolver `false`.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

/** Emite un token de sesión firmado. */
export function issueSessionToken(input: {
  secret: string;
  actor: string;
  now?: number;
  ttlSeconds?: number;
}): { token: string; claims: SessionClaims } {
  if (input.secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`El secreto de sesión debe tener al menos ${MIN_SECRET_LENGTH} caracteres.`);
  }
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const claims: SessionClaims = {
    actor: input.actor,
    issuedAt: now,
    expiresAt: now + (input.ttlSeconds ?? SESSION_TTL_SECONDS),
    sessionId: randomUUID(),
  };
  const payload = base64url(JSON.stringify(claims));
  return { token: `v1.${payload}.${sign(input.secret, payload)}`, claims };
}

/** Verifica un token de sesión. Devuelve las reclamaciones o `null`. */
export function verifySessionToken(input: {
  secret: string;
  token: string;
  now?: number;
}): SessionClaims | null {
  const parts = input.token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  if (!safeEquals(sign(input.secret, parts[1]), parts[2])) return null;
  let claims: SessionClaims;
  try {
    claims = JSON.parse(fromBase64url(parts[1]).toString("utf8")) as SessionClaims;
  } catch {
    return null;
  }
  if (typeof claims.actor !== "string" || typeof claims.expiresAt !== "number") return null;
  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (claims.expiresAt <= now) return null;
  return claims;
}

/** Cabecera `Set-Cookie` de la sesión. */
export function sessionCookie(token: string, maxAgeSeconds = SESSION_TTL_SECONDS): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/api/evaluations",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    `Max-Age=${maxAgeSeconds}`,
  ].join("; ");
}

/** Cabecera `Set-Cookie` que borra la sesión. */
export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/api/evaluations; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

/** Lee la cookie de sesión de la cabecera `Cookie`. */
export function readSessionCookie(header: string | null): string {
  if (!header) return "";
  for (const chunk of header.split(";")) {
    const [name, ...rest] = chunk.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=");
  }
  return "";
}

/**
 * Limitador de intentos de acceso, por instancia de función.
 *
 * Es defensa en profundidad, no una garantía: cada instancia serverless tiene su
 * propio contador y las instancias se reciclan. Frena el ensayo y error trivial
 * contra la frase de acceso; el límite real lo pone la longitud de la frase.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();

export const LOGIN_MAX_ATTEMPTS = 10;
export const LOGIN_WINDOW_MS = 10 * 60 * 1000;

export function registerLoginAttempt(key: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  current.count += 1;
  if (current.count > LOGIN_MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Reinicia el contador tras un acceso correcto. */
export function clearLoginAttempts(key: string): void {
  attempts.delete(key);
}
