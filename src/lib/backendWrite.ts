/**
 * Escrituras contra el backend de Google Apps Script.
 *
 * ## El fallo que estaba detrás de «no puedo añadir postulantes»
 *
 * El alta de un postulante era, literalmente, esto:
 *
 * ```ts
 * await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify(candidate) });
 * setRaw((prev) => [candidate, ...prev]);
 * return { ok: true, message: "Postulante registrado correctamente." };
 * ```
 *
 * `fetch` sólo rechaza cuando **la red** falla. Si la petición llega y el
 * servidor responde cualquier otra cosa —un 500, o el HTTP 200 con la página
 * HTML de «se requiere autorización» que devuelve un despliegue de Apps Script
 * al que se le caducaron los permisos— la promesa se resuelve con normalidad. El
 * código no miraba `res.ok`, no leía el cuerpo y no comprobaba ningún `status`:
 * daba el alta por buena, mostraba «Postulante registrado correctamente»,
 * cerraba el cuestionario y **añadía la fila a la lista en memoria**. El analista
 * veía su postulante en pantalla; la hoja de cálculo seguía sin él.
 *
 * Reproducido en `qa/sondas.mjs guardado-mentiroso`: el modal se cierra, la
 * tarjeta aparece y el backend recibe cero peticiones.
 *
 * Este módulo es la única puerta de escritura y aplica tres comprobaciones que
 * antes no existían:
 *
 *   1. **`res.ok`** — un 4xx/5xx es un fallo, no un éxito.
 *   2. **El cuerpo** — si llega HTML en lugar de JSON, el despliegue está
 *      pidiendo autorización o interponiendo un portal; se distingue del resto
 *      porque su remedio es distinto (volver a desplegar, no reintentar).
 *   3. **El sobre `{ status }`** — cuando el script responde JSON pero rechaza la
 *      operación, se propaga su mensaje tal cual.
 *
 * Cada fallo devuelve una causa y un texto que le dice al analista qué hacer, en
 * lugar del «se guardó localmente» que sonaba a que algo se había salvado.
 */

import { SCRIPT_URL } from "../constants";

/** Por qué falló una escritura. Determina el mensaje y el remedio. */
export type WriteFailure =
  | "red"
  | "permisos-backend"
  | "http"
  | "respuesta-invalida"
  | "rechazado"
  | "tiempo";

export interface WriteOk {
  ok: true;
  message: string;
  /** Cuerpo ya parseado, cuando el backend devolvió JSON. */
  data: Record<string, unknown> | null;
}

export interface WriteError {
  ok: false;
  message: string;
  cause: WriteFailure;
  /** Detalle técnico para el panel de diagnóstico y la consola. */
  detail: string;
}

export type WriteResult = WriteOk | WriteError;

/** Cuánto se espera a Apps Script antes de dar la escritura por perdida. */
const WRITE_TIMEOUT_MS = 25_000;

const MESSAGES: Record<WriteFailure, string> = {
  red: "No se pudo contactar con el servidor. Revise su conexión: si el resto de internet funciona, es probable que la red del banco esté bloqueando script.google.com.",
  "permisos-backend":
    "El servidor respondió con una página de autorización en lugar de datos. El despliegue de Google Apps Script necesita volver a publicarse con acceso «Cualquier persona».",
  http: "El servidor respondió con un error. Vuelva a intentarlo; si persiste, revise el registro de ejecuciones de Apps Script.",
  "respuesta-invalida":
    "El servidor respondió algo que no se pudo interpretar. Nada se guardó; vuelva a intentarlo.",
  rechazado: "El servidor rechazó la operación.",
  tiempo:
    "El servidor tardó demasiado en responder y no hay confirmación de que se haya guardado. Actualice la base antes de volver a intentarlo para no duplicar el registro.",
};

function fail(cause: WriteFailure, detail: string, message?: string): WriteError {
  return { ok: false, cause, detail, message: message ?? MESSAGES[cause] };
}

/**
 * Detecta la respuesta HTML de Apps Script.
 *
 * Apps Script no devuelve 401 cuando el despliegue pierde permisos: devuelve un
 * **200 con HTML**. Es el único caso en el que `fetch` «tiene éxito» y aun así no
 * se ejecutó una línea del script, así que merece su propio diagnóstico.
 */
function looksLikeHtml(contentType: string, body: string): boolean {
  if (contentType.includes("text/html")) return true;
  const head = body.trimStart().slice(0, 200).toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html");
}

/**
 * Envía un cuerpo JSON al script y valida la respuesta de verdad.
 *
 * El `Content-Type` es `text/plain` a propósito: es lo que evita la petición
 * `OPTIONS` de pre-vuelo que el despliegue por omisión de Apps Script no sabe
 * contestar. Y `redirect: "follow"` es imprescindible porque Google contesta con
 * un 302 hacia `script.googleusercontent.com`.
 */
export async function postToBackend(body: unknown): Promise<WriteResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WRITE_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(SCRIPT_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (controller.signal.aborted) return fail("tiempo", "AbortError tras 25 s");
    return fail("red", err instanceof Error ? `${err.name}: ${err.message}` : String(err));
  }
  clearTimeout(timer);

  let text: string;
  try {
    text = await response.text();
  } catch (err) {
    return fail(
      "respuesta-invalida",
      err instanceof Error ? err.message : "no se pudo leer el cuerpo",
    );
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (looksLikeHtml(contentType, text)) {
    return fail("permisos-backend", `HTTP ${response.status} · HTML (${text.length} bytes)`);
  }
  if (!response.ok) {
    return fail("http", `HTTP ${response.status} · ${text.slice(0, 200)}`);
  }

  // Apps Script puede contestar con un cuerpo vacío en un `doPost` sin `return`.
  // No es un error: la escritura ocurrió, simplemente no hay sobre que leer.
  if (text.trim() === "") return { ok: true, message: "", data: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail("respuesta-invalida", `cuerpo no JSON: ${text.slice(0, 200)}`);
  }

  const data = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
  const status = typeof data.status === "string" ? data.status : "";
  if (status && status !== "success" && status !== "ok") {
    const remote = typeof data.message === "string" ? data.message : "";
    return fail("rechazado", `status="${status}" ${remote}`, remote || MESSAGES.rechazado);
  }

  return { ok: true, message: typeof data.message === "string" ? data.message : "", data };
}
