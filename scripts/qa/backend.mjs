/**
 * Backend simulado de Apps Script para el arnés de QA.
 *
 * Intercepta las llamadas a `script.google.com` desde el navegador y responde
 * como lo hace el libro real (`{status:"success"}` en las escrituras, el objeto
 * completo en las lecturas). Además permite reproducir a voluntad las averías
 * que en producción sólo se ven "en la computadora de una persona":
 *
 *   · `ok`            → la escritura se acepta y la fila aparece en el siguiente GET.
 *   · `stale:N`       → la escritura se acepta, pero los N GET siguientes
 *                       devuelven la base SIN la fila nueva (así se comporta la
 *                       caché de Apps Script / la propagación de la hoja).
 *   · `rejected`      → HTTP 200 con `{status:"error"}` (validación del backend).
 *   · `http500`       → el despliegue devuelve HTML de error.
 *   · `offline`       → la petición no sale (proxy corporativo, sin red).
 *   · `timeout`       → la petición se queda colgada para siempre.
 */

import { payload as basePayload } from "./fixtures.mjs";

const SCRIPT_HOST = /script\.google\.com/;

export function createBackend(options = {}) {
  const state = {
    /** Cuerpo que devuelve el GET. */
    payload: options.payload ? options.payload : basePayload(),
    /** Modo de escritura. */
    postMode: options.postMode ?? "ok",
    /** GET pendientes de servir "viejos" (modo stale). */
    staleGets: options.staleGets ?? 0,
    /** Todo lo que la aplicación intentó escribir. */
    posts: [],
    /** Cuántas lecturas hizo la aplicación. */
    gets: 0,
    /** Retardo artificial de la lectura, en ms. */
    getDelay: options.getDelay ?? 0,
    /** Filas aceptadas pero aún no visibles (modo stale). */
    pending: [],
    /** Mensaje de rechazo. */
    rejectMessage:
      options.rejectMessage ??
      "El identificador ya existe en la hoja. Verifique el registro.",
    /** `config_personal_perfil` que devuelve la hoja al iniciar sesión. */
    loginConfig: options.loginConfig ?? "",
  };

  async function handle(route) {
    const request = route.request();
    const method = request.method();

    if (state.postMode === "offline" && method === "POST") {
      state.posts.push(safeJson(request.postData()));
      return route.abort("connectionfailed");
    }
    if (state.postMode === "timeout" && method === "POST") {
      state.posts.push(safeJson(request.postData()));
      return; // ni cumple ni aborta: la promesa nunca se resuelve
    }

    if (method === "POST") {
      const body = safeJson(request.postData());
      state.posts.push(body);

      // Inicio de sesión con configuración personal guardada en la hoja: es la
      // vía por la que una preferencia corrupta viaja de un equipo a otro.
      if (body && body.type === "perfil_login") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            status: "success",
            perfil: { config_personal_perfil: state.loginConfig ?? "" },
          }),
        });
      }

      if (state.postMode === "rejected") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ status: "error", message: state.rejectMessage }),
        });
      }
      if (state.postMode === "http500") {
        return route.fulfill({
          status: 500,
          contentType: "text/html",
          body: "<html><body>Se ha producido un error en el script.</body></html>",
        });
      }

      applyWrite(state, body);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "success", message: "Registro guardado." }),
      });
    }

    // ---- lectura ----
    state.gets += 1;
    if (state.getDelay) await sleep(state.getDelay);

    if (state.staleGets > 0) {
      state.staleGets -= 1;
      const stale = {
        ...state.payload,
        candidatos: state.payload.candidatos.filter(
          (c) => !state.pending.includes(String(c.identificador ?? "")),
        ),
      };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(stale),
      });
    }
    state.pending = [];
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(state.payload),
    });
  }

  return {
    state,
    /** Conecta el backend a un contexto de Playwright. */
    async install(context) {
      await context.route(SCRIPT_HOST, handle);
    },
    /** Escrituras del tipo indicado (o todas). */
    writes(filter) {
      if (!filter) return state.posts;
      return state.posts.filter(filter);
    },
    /** Escrituras que son altas/ediciones de postulante (no bitácora ni config). */
    candidateWrites() {
      return state.posts.filter(
        (p) => p && typeof p === "object" && "identificador" in p,
      );
    },
    setMode(mode) {
      state.postMode = mode;
    },
    setStale(n) {
      state.staleGets = n;
    },
  };
}

function applyWrite(state, body) {
  if (!body || typeof body !== "object") return;
  const id = String(body.identificador ?? "").trim();
  if (!id) return;

  const rows = state.payload.candidatos;
  const index = rows.findIndex((c) => String(c.identificador ?? "").trim() === id);
  if (body.action === "update") {
    if (index >= 0) rows[index] = { ...rows[index], ...body };
    return;
  }
  // Alta: la hoja agrega al final.
  rows.push({ ...body });
  if (state.staleGets > 0) state.pending.push(id);
}

function safeJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { __raw: text };
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
