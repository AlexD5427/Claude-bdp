import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TalentDataProvider, useTalentData } from "./TalentDataContext";
import type { RawCandidate, TalentPayload } from "../types";

/**
 * Regresión del guardado de postulantes.
 *
 * El fallo que motivó estas pruebas es el que el área reportaba como «registro
 * postulantes y no se guardan»: `submitCandidate` hacía `await fetch(...)` y
 * devolvía `ok: true` **sin mirar la respuesta**. Un rechazo del backend —un
 * `500`, una cuota agotada, un `302` a la pantalla de acceso de Google o el
 * propio `{status:"error"}` del script— acababa con el cartel «Postulante
 * registrado correctamente», el modal cerrándose y el borrador borrado. La ficha
 * no llegaba nunca a la hoja.
 */

const emptyPayload: TalentPayload = {
  candidatos: [],
  competencias: [],
  arquetipos_disc: [],
  auxiliares: {
    cargos_bdp: [],
    gerencias_bdp: [],
    agencias_bdp: [],
    modalidad_reclutamiento: [],
    estado_proceso: [],
  },
  perfiles: [],
  perfiles_cargo: [],
  espejo_base: [],
  espejo_ultimo: [],
};

const ficha: RawCandidate = { identificador: "9998887-120-2026", nombres: "Prueba" };

/** Respuestas que el POST devolverá, en orden; el GET siempre va bien. */
let postResponses: (() => Promise<Response> | Response)[] = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  window.localStorage.clear();
  postResponses = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const next = postResponses.shift();
        if (!next) return jsonResponse({ status: "success" });
        return next();
      }
      return jsonResponse(emptyPayload);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

/** Un botón que registra la ficha y muestra el resultado tal cual lo vería el analista. */
function Probe() {
  const { submitCandidate, updateCandidate } = useTalentData();
  return (
    <div>
      <button
        type="button"
        onClick={async () => {
          const r = await submitCandidate(ficha);
          document.title = `${r.ok ? "OK" : "FALLO"}::${r.message}`;
        }}
      >
        registrar
      </button>
      <button
        type="button"
        onClick={async () => {
          const r = await updateCandidate(ficha);
          document.title = `${r.ok ? "OK" : "FALLO"}::${r.message}`;
        }}
      >
        actualizar
      </button>
    </div>
  );
}

/** Muestra cuántos postulantes ve la aplicación en cada momento. */
function Espia() {
  const { candidatos } = useTalentData();
  return <span data-testid="total">{candidatos.length}</span>;
}

async function press(label: string) {
  const user = userEvent.setup();
  render(
    <TalentDataProvider>
      <Probe />
    </TalentDataProvider>,
  );
  document.title = "";
  await user.click(screen.getByRole("button", { name: label }));
  await waitFor(() => expect(document.title).not.toBe(""));
  const [estado, ...resto] = document.title.split("::");
  return { ok: estado === "OK", message: resto.join("::") };
}

describe("submitCandidate · el resultado refleja lo que hizo la hoja", () => {
  it("informa el fallo cuando el script responde {status:'error'}", async () => {
    postResponses = [
      () => jsonResponse({ status: "error", message: "El identificador ya existe en la hoja." }),
    ];
    const r = await press("registrar");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/El identificador ya existe en la hoja/);
  });

  it("informa el fallo cuando el servidor devuelve un error HTTP", async () => {
    postResponses = [() => jsonResponse({}, 500)];
    const r = await press("registrar");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/HTTP 500/);
  });

  it("informa el fallo cuando no hay red, y lo dice en términos útiles", async () => {
    postResponses = [
      () => {
        throw new TypeError("Failed to fetch");
      },
    ];
    const r = await press("registrar");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/no hay conexión con Google/i);
  });

  it("acepta un {status:'success'} explícito", async () => {
    postResponses = [() => jsonResponse({ status: "success", message: "ok" })];
    const r = await press("registrar");
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/registrado correctamente/i);
  });

  it("acepta una respuesta en texto plano (despliegues antiguos del script)", async () => {
    postResponses = [() => new Response("Fila agregada", { status: 200 })];
    const r = await press("registrar");
    expect(r.ok).toBe(true);
  });

  it("acepta una respuesta vacía", async () => {
    postResponses = [() => new Response("", { status: 200 })];
    const r = await press("registrar");
    expect(r.ok).toBe(true);
  });

  it("un alta fallida no deja una fila fantasma que bloquee el reintento", async () => {
    const user = userEvent.setup();
    postResponses = [
      () => jsonResponse({ status: "error", message: "Cuota agotada." }),
      () => jsonResponse({ status: "success" }),
    ];
    render(
      <TalentDataProvider>
        <Probe />
        <Espia />
      </TalentDataProvider>,
    );

    document.title = "";
    await user.click(screen.getByRole("button", { name: "registrar" }));
    await waitFor(() => expect(document.title).toMatch(/^FALLO/));
    // Insertarla en local creaba una fila que no existía en la hoja y que además
    // hacía chocar el reintento con la comprobación de identificador repetido.
    expect(screen.getByTestId("total").textContent).toBe("0");

    document.title = "";
    await user.click(screen.getByRole("button", { name: "registrar" }));
    await waitFor(() => expect(document.title).toMatch(/^OK/));
  });
});

describe("updateCandidate · misma verificación", () => {
  it("no dice «actualizado» cuando la hoja rechazó el cambio", async () => {
    postResponses = [
      () => jsonResponse({ status: "error", message: "No se encontró la fila." }),
    ];
    const r = await press("actualizar");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/No se encontró la fila/);
  });

  it("confirma cuando la hoja aceptó el cambio", async () => {
    postResponses = [() => jsonResponse({ status: "success" })];
    const r = await press("actualizar");
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/actualizado correctamente/i);
  });
});
