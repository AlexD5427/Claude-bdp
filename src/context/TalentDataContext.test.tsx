import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { TalentDataProvider, useTalentData } from "./TalentDataContext";
import type { RawCandidate, TalentPayload } from "../types";

/**
 * Contrato de escritura contra la hoja.
 *
 * Estas pruebas cubren el fallo más caro que tenía el sistema: la escritura era
 * un `fetch` sin comprobar nada, así que **cualquier** resultado se anunciaba
 * como «Postulante registrado correctamente». Un rechazo del backend
 * (identificador repetido, hoja bloqueada, despliegue caducado) cerraba el
 * cuestionario y el trabajo se perdía; un corte de red, en cambio, insertaba una
 * fila fantasma que desaparecía al siguiente refresco.
 *
 * También se cubre el caso contrario: cuando la escritura **sí** se confirma, la
 * fila debe sostenerse aunque la lectura siguiente todavía no la traiga (Apps
 * Script cachea el `doGet` y la hoja tarda en propagar).
 */

const PAYLOAD_VACIO: TalentPayload = {
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

const ficha: RawCandidate = {
  identificador: "5033853-163-2026",
  nombres: "Jorge",
  apellido_paterno: "Mamani",
};

type Escenario = {
  /** Respuesta de la lectura. */
  get?: () => Response;
  /** Respuesta de la escritura. */
  post?: () => Response | Promise<Response>;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function instalarFetch(escenario: Escenario) {
  const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (init?.method === "POST") {
      return escenario.post ? await escenario.post() : json({ status: "success" });
    }
    return escenario.get ? escenario.get() : json(PAYLOAD_VACIO);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/**
 * Las operaciones del contexto se invocan dentro de `act` porque actualizan
 * estado de React: sin eso la prueba pasa igual pero llena la salida de avisos,
 * y una batería que grita "lobo" deja de servir para vigilar nada.
 */
async function ejecutar<T>(op: () => Promise<T>): Promise<T> {
  let out!: T;
  await act(async () => {
    out = await op();
  });
  return out;
}

/** Sonda: expone las operaciones del contexto y la lista de postulantes. */
let api: ReturnType<typeof useTalentData> | null = null;
function Sonda() {
  api = useTalentData();
  return (
    <ul>
      {api.candidatos.map((c) => (
        <li key={c.id}>{c.fullName}</li>
      ))}
    </ul>
  );
}

function montar() {
  return render(
    <TalentDataProvider>
      <Sonda />
    </TalentDataProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  api = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("submitCandidate · el servidor rechaza", () => {
  it("informa el motivo y no inventa la fila", async () => {
    instalarFetch({
      post: () => json({ status: "error", message: "El identificador ya existe." }),
    });
    montar();
    await waitFor(() => expect(api?.status).toBe("success"));

    const res = await ejecutar(() => api!.submitCandidate(ficha));
    expect(res.ok).toBe(false);
    expect(res.message).toContain("El identificador ya existe.");
    await waitFor(() => expect(screen.queryByText("Jorge Mamani")).toBeNull());
  });

  it("trata un HTTP 500 como fallo", async () => {
    instalarFetch({ post: () => new Response("<html>error</html>", { status: 500 }) });
    montar();
    await waitFor(() => expect(api?.status).toBe("success"));

    const res = await ejecutar(() => api!.submitCandidate(ficha));
    expect(res.ok).toBe(false);
    expect(res.message).toContain("HTTP 500");
  });

  it("trata una respuesta que no es JSON como fallo", async () => {
    // Un despliegue mal publicado devuelve la página de error de Google con 200.
    instalarFetch({
      post: () =>
        new Response("<!doctype html><title>Error</title>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
    });
    montar();
    await waitFor(() => expect(api?.status).toBe("success"));

    const res = await ejecutar(() => api!.submitCandidate(ficha));
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/respuesta válida|despliegue/i);
  });

  it("no deja fila fantasma cuando no hay red", async () => {
    instalarFetch({
      post: () => Promise.reject(new TypeError("Failed to fetch")),
    });
    montar();
    await waitFor(() => expect(api?.status).toBe("success"));

    const res = await ejecutar(() => api!.submitCandidate(ficha));
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/conectar con el servidor/i);
    expect(screen.queryByText("Jorge Mamani")).toBeNull();
  });
});

describe("submitCandidate · el servidor confirma", () => {
  it("sostiene la fila mientras la hoja todavía no la devuelve", async () => {
    // La lectura siempre responde vacía: es el caso de la caché de Apps Script.
    instalarFetch({});
    montar();
    await waitFor(() => expect(api?.status).toBe("success"));

    const res = await ejecutar(() => api!.submitCandidate(ficha));
    expect(res.ok).toBe(true);
    expect(await screen.findByText("Jorge Mamani")).toBeInTheDocument();

    // Un refresco no debe hacerla desaparecer.
    await act(async () => api!.refetch());
    await waitFor(() => expect(screen.getByText("Jorge Mamani")).toBeInTheDocument());
  });

  it("la suelta en cuanto la hoja la incluye", async () => {
    let incluir = false;
    instalarFetch({
      get: () =>
        json({
          ...PAYLOAD_VACIO,
          candidatos: incluir ? [{ ...ficha, nombres: "Jorge Luis" }] : [],
        }),
    });
    montar();
    await waitFor(() => expect(api?.status).toBe("success"));
    await ejecutar(() => api!.submitCandidate(ficha));
    expect(await screen.findByText("Jorge Mamani")).toBeInTheDocument();

    incluir = true;
    await act(async () => api!.refetch());
    // Ahora manda la hoja: aparece el nombre tal como está guardado allí.
    expect(await screen.findByText("Jorge Luis Mamani")).toBeInTheDocument();
    expect(screen.queryByText("Jorge Mamani")).toBeNull();
    expect(window.localStorage.getItem("bdp-talent-pendientes")).toBeNull();
  });
});

describe("updateCandidate", () => {
  it("no aplica el cambio local si el servidor lo rechaza", async () => {
    instalarFetch({
      get: () => json({ ...PAYLOAD_VACIO, candidatos: [ficha] }),
      post: () => json({ status: "error", message: "Fila bloqueada." }),
    });
    montar();
    await waitFor(() => expect(api?.status).toBe("success"));
    expect(screen.getByText("Jorge Mamani")).toBeInTheDocument();

    const res = await ejecutar(() => api!.updateCandidate({ ...ficha, nombres: "Jorgito" }));
    expect(res.ok).toBe(false);
    expect(res.message).toContain("Fila bloqueada.");
    expect(screen.getByText("Jorge Mamani")).toBeInTheDocument();
  });

  it("aplica el cambio cuando el servidor confirma", async () => {
    instalarFetch({ get: () => json({ ...PAYLOAD_VACIO, candidatos: [ficha] }) });
    montar();
    await waitFor(() => expect(api?.status).toBe("success"));

    const res = await ejecutar(() => api!.updateCandidate({ ...ficha, nombres: "Jorge Luis" }));
    expect(res.ok).toBe(true);
  });

  it("se niega a editar cuando el identificador está repetido en la hoja", async () => {
    // El backend edita la primera fila que coincide: guardar desde la segunda
    // ficha sobrescribiría a la primera sin avisar a nadie.
    const fetchMock = instalarFetch({
      get: () => json({ ...PAYLOAD_VACIO, candidatos: [ficha, { ...ficha, nota_cap: 91 }] }),
    });
    montar();
    await waitFor(() => expect(api?.status).toBe("success"));
    expect(api?.candidatos.map((c) => c.id)).toEqual([
      "5033853-163-2026",
      "5033853-163-2026#2",
    ]);

    const escriturasAntes = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST",
    ).length;
    const res = await ejecutar(() => api!.updateCandidate({ ...ficha, nombres: "Jorgito" }));
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/2 filas con el identificador/);
    const escriturasDespues = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST",
    ).length;
    expect(escriturasDespues).toBe(escriturasAntes);
  });
});
