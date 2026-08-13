import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TalentDataProvider, useTalentData } from "./TalentDataContext";
import type { RawCandidate } from "../types";

/**
 * Contrato del proveedor de datos.
 *
 * Aquí se prueba la corrección más importante de este trabajo: **`submitCandidate`
 * ya no puede decir que sí cuando la hoja dijo que no**. La versión anterior
 * devolvía `{ ok: true }` sin mirar la respuesta y, además, añadía la ficha a la
 * lista local; el cuestionario mostraba el aviso verde, se cerraba, borraba el
 * borrador y el siguiente refresco hacía desaparecer la fila. Eso es lo que se
 * reportaba como «no puedo añadir postulantes».
 */

const PAYLOAD = {
  candidatos: [
    { identificador: "8456872-105-2026", nombres: "María", apellido_paterno: "Quispe" },
  ],
  competencias: [],
  arquetipos_disc: [],
  auxiliares: {},
  perfiles: [],
  perfiles_cargo: [],
  espejo_base: [],
  espejo_ultimo: [],
};

/** Sonda que expone el contexto y dispara el alta bajo demanda. */
function Sonda({ candidate }: { candidate: RawCandidate }) {
  const { candidatos, duplicados, submitCandidate, stale, syncError } = useTalentData();
  return (
    <div>
      <span data-testid="total">{candidatos.length}</span>
      <span data-testid="duplicados">{duplicados.join(",")}</span>
      <span data-testid="stale">{stale ? "si" : "no"}</span>
      <span data-testid="syncError">{syncError ?? ""}</span>
      <button
        type="button"
        onClick={async () => {
          const res = await submitCandidate(candidate);
          document.getElementById("resultado")!.textContent = `${res.ok}|${res.message}`;
        }}
      >
        registrar
      </button>
      <p id="resultado" />
    </div>
  );
}

const nuevo: RawCandidate = { identificador: "9999999-108-2026", nombres: "Ana" };

/** Responde al GET con el payload y al POST con lo que pida cada prueba. */
function stubFetch(respuestaPost: () => Promise<Response>) {
  const fn = vi.fn(async (_url: string, init?: RequestInit) => {
    if (!init || init.method !== "POST") {
      return new Response(JSON.stringify(PAYLOAD), { status: 200 });
    }
    return respuestaPost();
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

async function montar(candidate = nuevo) {
  render(
    <TalentDataProvider>
      <Sonda candidate={candidate} />
    </TalentDataProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("total").textContent).toBe("1"));
}

describe("submitCandidate", () => {
  it("informa del éxito y refleja la ficha cuando la hoja acepta", async () => {
    stubFetch(async () => new Response(JSON.stringify({ status: "success" }), { status: 200 }));
    await montar();
    screen.getByRole("button", { name: "registrar" }).click();
    await waitFor(() =>
      expect(document.getElementById("resultado")!.textContent).toMatch(/^true\|/),
    );
    expect(screen.getByTestId("total").textContent).toBe("2");
  });

  it("NO informa del éxito cuando la hoja rechaza, y no inventa la fila", async () => {
    stubFetch(
      async () =>
        new Response(JSON.stringify({ status: "error", message: "Identificador duplicado." }), {
          status: 200,
        }),
    );
    await montar();
    screen.getByRole("button", { name: "registrar" }).click();
    await waitFor(() =>
      expect(document.getElementById("resultado")!.textContent).toContain("false|"),
    );
    expect(document.getElementById("resultado")!.textContent).toContain("Identificador duplicado.");
    // La ficha fantasma era media parte del problema: parecía guardada y
    // desaparecía al refrescar.
    expect(screen.getByTestId("total").textContent).toBe("1");
  });

  it("NO informa del éxito cuando Google devuelve su página de error", async () => {
    stubFetch(
      async () =>
        new Response("<!DOCTYPE html><html><body>Se ha producido un error</body></html>", {
          status: 200,
        }),
    );
    await montar();
    screen.getByRole("button", { name: "registrar" }).click();
    await waitFor(() =>
      expect(document.getElementById("resultado")!.textContent).toContain("false|"),
    );
    expect(screen.getByTestId("total").textContent).toBe("1");
  });

  it("NO informa del éxito cuando la red no deja salir la petición", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    await montar();
    screen.getByRole("button", { name: "registrar" }).click();
    await waitFor(() =>
      expect(document.getElementById("resultado")!.textContent).toContain("false|"),
    );
    expect(document.getElementById("resultado")!.textContent).toMatch(/conexión|servidor/i);
    expect(screen.getByTestId("total").textContent).toBe("1");
  });
});

describe("frescura de los datos", () => {
  it("marca los datos como rancios cuando el refresco falla con caché en pantalla", async () => {
    // Primera vuelta: se llena la caché local.
    stubFetch(async () => new Response("{}", { status: 200 }));
    const { unmount } = render(
      <TalentDataProvider>
        <Sonda candidate={nuevo} />
      </TalentDataProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("total").textContent).toBe("1"));
    unmount();

    // Segunda vuelta: hay caché, pero el servidor ya no responde. Antes esto se
    // descartaba en silencio y el punto de estado seguía verde.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    render(
      <TalentDataProvider>
        <Sonda candidate={nuevo} />
      </TalentDataProvider>,
    );
    expect(screen.getByTestId("total").textContent).toBe("1"); // la caché se sigue viendo
    await waitFor(() => expect(screen.getByTestId("stale").textContent).toBe("si"), {
      timeout: 8000,
    });
    expect(screen.getByTestId("syncError").textContent).not.toBe("");
  }, 12000);
});

describe("integridad de la hoja", () => {
  it("expone los identificadores repetidos que llegan de la hoja", async () => {
    const conDuplicado = {
      ...PAYLOAD,
      candidatos: [
        ...PAYLOAD.candidatos,
        { identificador: "8456872-105-2026", nombres: "Rodrigo", apellido_paterno: "Ledezma" },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        !init || init.method !== "POST"
          ? new Response(JSON.stringify(conDuplicado), { status: 200 })
          : new Response("{}", { status: 200 }),
      ),
    );
    render(
      <TalentDataProvider>
        <Sonda candidate={nuevo} />
      </TalentDataProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("total").textContent).toBe("2"));
    expect(screen.getByTestId("duplicados").textContent).toBe("8456872-105-2026");
  });
});
