/**
 * Configuración del backend intermedio.
 *
 * Todas las variables son de SERVIDOR: ninguna lleva el prefijo `VITE_`, así que
 * Vite no puede incluirlas en el bundle del navegador ni por accidente. Ver
 * docs/evaluations/SECURITY.md §Reparto de secretos.
 *
 * Los valores nunca se registran ni se devuelven en las respuestas: cuando falta
 * algo se informa el NOMBRE de la variable, jamás su contenido.
 */

import { MIN_SECRET_LENGTH } from "./adminSession.js";

export interface AdminProxyConfig {
  /** URL `/exec` del Web App de Evaluaciones. Pública por diseño. */
  appsScriptUrl: string;
  /** Secreto compartido con las Script Properties de Apps Script. */
  adminSecret: string;
  /** Frase de acceso del panel administrativo. */
  panelPassphrase: string;
  /** Secreto con el que se firma la cookie de sesión. */
  sessionSecret: string;
  /** Orígenes admitidos además del propio. Vacío = solo el propio. */
  allowedOrigins: string[];
}

export type ConfigResult =
  | { ok: true; config: AdminProxyConfig }
  | { ok: false; missing: string[]; weak: string[]; invalid: string[] };

function value(name: string): string {
  const raw = process.env[name];
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * ¿Es una URL absoluta `https://…` del Web App?
 *
 * Se comprueba porque la confusión más fácil de cometer al configurar el
 * proyecto es pegar aquí una ruta interna (`/api/evaluations/admin`) en lugar de
 * la URL `…/exec` de Apps Script. Sin esta comprobación, el `fetch` fallaría con
 * un error de red genérico y el operador no sabría qué variable mirar.
 */
function isAbsoluteHttpsUrl(raw: string): boolean {
  try {
    return new URL(raw).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Lee y valida la configuración. Un secreto corto se trata como ausente: es
 * mejor que el panel no arranque que darle una falsa sensación de seguridad.
 */
export function readAdminProxyConfig(): ConfigResult {
  const appsScriptUrl = value("EVALUATIONS_APPS_SCRIPT_URL");
  const adminSecret = value("EVALUATIONS_ADMIN_SHARED_SECRET");
  const panelPassphrase = value("EVALUATIONS_PANEL_PASSPHRASE");
  const sessionSecret = value("EVALUATIONS_SESSION_SECRET");

  const missing: string[] = [];
  const weak: string[] = [];
  const invalid: string[] = [];
  if (!appsScriptUrl) missing.push("EVALUATIONS_APPS_SCRIPT_URL");
  else if (!isAbsoluteHttpsUrl(appsScriptUrl)) invalid.push("EVALUATIONS_APPS_SCRIPT_URL");
  if (!adminSecret) missing.push("EVALUATIONS_ADMIN_SHARED_SECRET");
  else if (adminSecret.length < MIN_SECRET_LENGTH) weak.push("EVALUATIONS_ADMIN_SHARED_SECRET");
  if (!panelPassphrase) missing.push("EVALUATIONS_PANEL_PASSPHRASE");
  else if (panelPassphrase.length < 12) weak.push("EVALUATIONS_PANEL_PASSPHRASE");
  if (!sessionSecret) missing.push("EVALUATIONS_SESSION_SECRET");
  else if (sessionSecret.length < MIN_SECRET_LENGTH) weak.push("EVALUATIONS_SESSION_SECRET");

  if (missing.length > 0 || weak.length > 0 || invalid.length > 0) {
    return { ok: false, missing, weak, invalid };
  }

  return {
    ok: true,
    config: {
      appsScriptUrl,
      adminSecret,
      panelPassphrase,
      sessionSecret,
      allowedOrigins: value("EVALUATIONS_ALLOWED_ORIGINS")
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin !== ""),
    },
  };
}

/** Mensaje seguro para el operador cuando falta configuración. */
export function configErrorMessage(result: Extract<ConfigResult, { ok: false }>): string {
  const parts: string[] = [];
  if (result.missing.length > 0) parts.push(`faltan ${result.missing.join(", ")}`);
  if (result.weak.length > 0) parts.push(`son demasiado cortas ${result.weak.join(", ")}`);
  if (result.invalid.length > 0) {
    parts.push(
      `no son una URL https absoluta ${result.invalid.join(", ")} (debe ser la dirección …/exec del Web App de Apps Script)`,
    );
  }
  return `El backend administrativo no está configurado: ${parts.join("; ")}.`;
}
