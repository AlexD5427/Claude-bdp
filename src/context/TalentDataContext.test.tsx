import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { TalentDataProvider, useTalentData } from "./TalentDataContext";
import type { RawCandidate, TalentPayload } from "../types";

/**
 * Regresión de las escrituras a la hoja de cálculo.
 *
 * ## El fallo
 *
 * `fetch` sólo rechaza cuando la petición no llega a destino. Un `500`, la
 * pantalla de acceso de Google (despliegue sin «Cualquiera con el enlace») o un
 * `{"status":"error"}` del propio Apps Script resuelven la promesa con toda
 * normalidad. El código anterior hacía `await fetch(...)` y, si no lanzaba, daba
 * el alta por buena: el analista leía «Postulante registrado correctamente», el
 * cuestionario se cerraba y en la hoja no había nada. Encima, la ficha se
 * añadía a la copia local, así que durante un minuto —hasta el refresco
 * automático— parecía guardada y luego desaparecía. Visto desde la silla del
 * analista: «no puedo añadir postulantes».
 *
 * Estas pruebas fijan el contrato: **sólo se declara guardado lo que la hoja
 * confirmó**, y nada se refleja en local si la escritura no llegó.
 */

const PAYLOAD: TalentPayload = {
  candidatos: [
    { identificador: "8456872-105-2026", nombres: "Jorge", apellido_paterno: "Mamani" },
  ],
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

const NUEVO: RawCandidate = {
  identificador: "1234567-108-2026",
  nombres: "Carla",
  apellido_paterno: "Rojas",
};

type PostReply =
  | { kind: "success" }
  | { kind: "error"; message?: string }
  | { kind: "html" }
  | { kind: "http"; status: number }
  | { kind: "throw" };

let postReply: PostReply = { kind: "success" };
let posts = 0;
/** La hoja simulada: el GET refleja lo que un POST confirmado escribió. */
let hoja: RawCandidate[] = [];

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  posts = 0;
  postReply = { kind: "success" };
  hoja = PAYLOAD.candidatos.map((c) => ({ ...c }));
  window.localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "GET") {
        return jsonResponse({ ...PAYLOAD, candidatos: hoja });
      }
      posts += 1;
      const body = JSON.parse(String(init?.body ?? "{}")) as RawCandidate & { action?: string };
      switch (postReply.kind) {
        case "success": {
          // Se escribe en la hoja simulada igual que lo haría `handlePostulante_`.
          const id = String(body.identificador ?? "");
          const fila = hoja.find((c) => String(c.identificador) === id);
          if (body.action === "update" && fila) Object.assign(fila, body);
          else if (!body.action) hoja = [{ ...body }, ...hoja];
          return jsonResponse({ status: "success", message: "Agregado" });
        }
        case "error":
          return jsonResponse({ status: "error", message: postReply.message ?? "No encontrado" });
        case "html":
          return {
            ok: true,
            status: 200,
            json: async () => {
              throw new SyntaxError("Unexpected token < in JSON");
            },
          } as unknown as Response;
        case "http":
          return jsonResponse({}, postReply.status);
        case "throw":
          throw new TypeError("Failed to fetch");
      }
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

/** Expone el contexto para poder invocarlo desde la prueba. */
let api: ReturnType<typeof useTalentData>;
function Probe() {
  api = useTalentData();
  return (
    <ul>
      {api.candidatos.map((c) => (
        <li key={c.id}>{c.fullName}</li>
      ))}
    </ul>
  );
}

async function mount() {
  render(
    <TalentDataProvider>
      <Probe />
    </TalentDataProvider>,
  );
  await waitFor(() => expect(screen.getByText("Jorge Mamani")).toBeInTheDocument());
}

describe("submitCandidate", () => {
  it("confirma el alta cuando la hoja responde success", async () => {
    await mount();
    let res!: { ok: boolean; message: string };
    await act(async () => {
      res = await api.submitCandidate(NUEVO);
    });
    expect(posts).toBe(1);
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/registrado correctamente/i);
    expect(screen.getByText("Carla Rojas")).toBeInTheDocument();
  });

  it("no miente cuando la hoja rechaza la operación", async () => {
    await mount();
    postReply = { kind: "error", message: "No se encontró la hoja de postulantes" };
    let res!: { ok: boolean; message: string };
    await act(async () => {
      res = await api.submitCandidate(NUEVO);
    });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/rechazó la operación/i);
    expect(res.message).toMatch(/hoja de postulantes/i);
    // Y no aparece una ficha fantasma que se desvanecería al refrescar.
    expect(screen.queryByText("Carla Rojas")).not.toBeInTheDocument();
  });

  it("detecta la pantalla de acceso de Google (respuesta que no es JSON)", async () => {
    await mount();
    postReply = { kind: "html" };
    let res!: { ok: boolean; message: string };
    await act(async () => {
      res = await api.submitCandidate(NUEVO);
    });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/no pudimos confirmar el guardado/i);
    expect(screen.queryByText("Carla Rojas")).not.toBeInTheDocument();
  });

  it("informa del error HTTP y no da el alta por buena", async () => {
    await mount();
    postReply = { kind: "http", status: 500 };
    let res!: { ok: boolean; message: string };
    await act(async () => {
      res = await api.submitCandidate(NUEVO);
    });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/HTTP 500/);
    expect(screen.queryByText("Carla Rojas")).not.toBeInTheDocument();
  });

  it("explica el bloqueo de red sin perder el avance del analista", async () => {
    await mount();
    postReply = { kind: "throw" };
    let res!: { ok: boolean; message: string };
    await act(async () => {
      res = await api.submitCandidate(NUEVO);
    });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/script\.google\.com/);
    expect(screen.queryByText("Carla Rojas")).not.toBeInTheDocument();
  });
});

describe("updateCandidate", () => {
  it("aplica la edición sólo cuando la hoja confirma", async () => {
    await mount();
    await act(async () => {
      await api.updateCandidate({ ...PAYLOAD.candidatos[0], nombres: "Jorge Andrés" });
    });
    await waitFor(() => expect(screen.getByText("Jorge Andrés Mamani")).toBeInTheDocument());
  });

  it("no toca la copia local si la hoja rechaza la edición", async () => {
    await mount();
    postReply = { kind: "error", message: "No encontrado" };
    let res!: { ok: boolean; message: string };
    await act(async () => {
      res = await api.updateCandidate({ ...PAYLOAD.candidatos[0], nombres: "Jorge Andrés" });
    });
    expect(res.ok).toBe(false);
    expect(screen.getByText("Jorge Mamani")).toBeInTheDocument();
    expect(screen.queryByText("Jorge Andrés Mamani")).not.toBeInTheDocument();
  });
});
