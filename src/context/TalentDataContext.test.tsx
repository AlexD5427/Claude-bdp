import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TalentDataProvider, useTalentData } from "./TalentDataContext";

/**
 * Regresión del camino de escritura hacia Google Sheets.
 *
 * El módulo de Postulantes daba por registrada cualquier ficha en cuanto el
 * `fetch` se resolvía, sin leer la respuesta, e insertaba la fila en memoria
 * incluso cuando la petición fallaba. El resultado, desde la silla del analista,
 * era el mismo en los dos casos: «registré al postulante, dijo que todo bien y
 * no está en la hoja». Estas pruebas fijan el contrato nuevo:
 *
 *   · La hoja **confirma** o no hay alta.
 *   · Sin confirmación no se pinta ninguna fila fantasma.
 *   · El motivo llega a la interfaz para que se pueda actuar.
 */

const GET_PAYLOAD = {
  candidatos: [{ identificador: "1-105-2026", nombres: "Ana", apellido_paterno: "Torrez" }],
  competencias: [],
  arquetipos_disc: [],
  auxiliares: {},
  perfiles: [],
  perfiles_cargo: [],
  espejo_base: [],
  espejo_ultimo: [],
};

type Respuesta =
  | { tipo: "ok"; cuerpo?: string }
  | { tipo: "http"; status: number }
  | { tipo: "red" };

let respuestaPost: Respuesta = { tipo: "ok" };
let ultimoPost: unknown = null;

function fetchFalso(_url: string, init?: RequestInit): Promise<Response> {
  if (!init || (init.method ?? "GET") === "GET") {
    return Promise.resolve(
      new Response(JSON.stringify(GET_PAYLOAD), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }
  ultimoPost = JSON.parse(String(init.body));
  if (respuestaPost.tipo === "red") return Promise.reject(new TypeError("Failed to fetch"));
  if (respuestaPost.tipo === "http") {
    return Promise.resolve(new Response("", { status: respuestaPost.status }));
  }
  return Promise.resolve(
    new Response(respuestaPost.cuerpo ?? '{"status":"success"}', { status: 200 }),
  );
}

let resultado: { ok: boolean; message: string; pendiente?: boolean } | null = null;

/** Cuántas lecturas (GET) se han pedido hasta ahora. */
function getCount(): number {
  const calls = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit?][] } }).mock.calls;
  return calls.filter(([, init]) => !init || (init.method ?? "GET") === "GET").length;
}

function Sonda() {
  const { candidatos, submitCandidate, status } = useTalentData();
  return (
    <div>
      <span data-testid="estado">{status}</span>
      <span data-testid="total">{candidatos.length}</span>
      <button
        type="button"
        onClick={async () => {
          resultado = await submitCandidate({ identificador: "9-108-2026", nombres: "Nuevo" });
        }}
      >
        alta
      </button>
    </div>
  );
}

async function montar() {
  render(
    <TalentDataProvider>
      <Sonda />
    </TalentDataProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("estado").textContent).toBe("success"));
}

beforeEach(() => {
  window.localStorage.clear();
  resultado = null;
  ultimoPost = null;
  respuestaPost = { tipo: "ok" };
  vi.stubGlobal("fetch", vi.fn(fetchFalso));
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("TalentDataContext · alta de postulante", () => {
  it("registra y refleja la fila cuando la hoja confirma", async () => {
    await montar();
    expect(screen.getByTestId("total").textContent).toBe("1");

    const getsAntes = getCount();
    screen.getByRole("button", { name: "alta" }).click();
    await waitFor(() => expect(resultado?.ok).toBe(true));
    expect(ultimoPost).toMatchObject({ identificador: "9-108-2026" });
    // Tras confirmar, se vuelve a leer la hoja: la fuente de verdad es ella.
    await waitFor(() => expect(getCount()).toBeGreaterThan(getsAntes));
  });

  it("no registra —ni pinta la fila— si la hoja responde con error", async () => {
    respuestaPost = { tipo: "ok", cuerpo: '{"status":"error","message":"Identificador repetido"}' };
    await montar();

    screen.getByRole("button", { name: "alta" }).click();
    await waitFor(() => expect(resultado).not.toBeNull());
    expect(resultado?.ok).toBe(false);
    expect(resultado?.message).toMatch(/Identificador repetido/);
    expect(screen.getByTestId("total").textContent).toBe("1");
  });

  it("informa el código cuando el servidor devuelve un error HTTP", async () => {
    respuestaPost = { tipo: "http", status: 500 };
    await montar();

    screen.getByRole("button", { name: "alta" }).click();
    await waitFor(() => expect(resultado).not.toBeNull());
    expect(resultado?.ok).toBe(false);
    expect(resultado?.message).toMatch(/500/);
    expect(screen.getByTestId("total").textContent).toBe("1");
  });

  it("marca el alta como pendiente (y no inventa la fila) si la red falla", async () => {
    respuestaPost = { tipo: "red" };
    await montar();

    screen.getByRole("button", { name: "alta" }).click();
    await waitFor(() => expect(resultado).not.toBeNull());
    expect(resultado?.ok).toBe(false);
    expect(resultado?.pendiente).toBe(true);
    expect(resultado?.message).toMatch(/conexión|antivirus|proxy/i);
    expect(screen.getByTestId("total").textContent).toBe("1");
  });

  it("acepta un despliegue antiguo que responde 200 sin cuerpo JSON", async () => {
    respuestaPost = { tipo: "ok", cuerpo: "" };
    await montar();

    screen.getByRole("button", { name: "alta" }).click();
    await waitFor(() => expect(resultado?.ok).toBe(true));
  });
});
