import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ListaPostulantes } from "./ListaPostulantes";
import { normaliseCandidates } from "../lib/candidates";
import type { Candidate } from "../types";

/**
 * Dos comprobaciones que nacen de la investigación de «no puedo añadir
 * postulantes»:
 *
 *   1. La regla «sólo analista o superior registra postulantes» estaba escrita en
 *      `permisosDe` y **nunca se consultaba**. Un perfil de pasantía veía el
 *      botón, llenaba las cuatro secciones del cuestionario y sólo entonces se
 *      topaba con el rechazo. Ahora se dice antes y con el motivo, para que un rol
 *      mal asignado no vuelva a parecer un fallo del sistema.
 *   2. Un identificador repetido en la hoja rompe la identidad de las personas en
 *      todo el sistema. Se avisa en la lista, que es donde alguien puede ir a
 *      corregirlo.
 */

const candidatos: Candidate[] = normaliseCandidates([
  { identificador: "1111111-100-2026", nombres: "Ana", apellido_paterno: "Pérez" },
  { identificador: "1111111-100-2026", nombres: "Ana", apellido_paterno: "Pérez" },
  { identificador: "2222222-100-2026", nombres: "Luis", apellido_paterno: "Rojas" },
]);

let rol = "analista";

vi.mock("../context/TalentDataContext", () => ({
  useTalentData: () => ({
    candidatos,
    status: "success",
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("../lib/profilesStore", async () => {
  const actual = await vi.importActual<typeof import("../lib/profilesStore")>(
    "../lib/profilesStore",
  );
  return {
    ...actual,
    useProfiles: () => ({
      profiles: [],
      current: { id: "x", nombre: "Prueba", cargo: "—", role: rol, avatar: "estrellas", tienePassword: false, source: "seed" },
    }),
    logActivity: vi.fn(),
  };
});

vi.mock("./RegistrationForm", () => ({
  RegistrationForm: ({ open }: { open: boolean }) =>
    open ? <div data-testid="cuestionario" /> : null,
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
  window.localStorage.clear();
});

describe("ListaPostulantes · permiso de registro", () => {
  it("habilita «Nuevo Postulante» para un analista", () => {
    rol = "analista";
    render(<ListaPostulantes />);
    expect(screen.getByRole("button", { name: /Nuevo Postulante/i })).toBeEnabled();
  });

  it("lo deshabilita para un pasante y explica por qué", () => {
    rol = "pasante";
    render(<ListaPostulantes />);
    expect(screen.getByRole("button", { name: /Nuevo Postulante/i })).toBeDisabled();
    expect(screen.getByText(/no registrar postulantes/i)).toBeInTheDocument();
    expect(screen.queryByTestId("cuestionario")).not.toBeInTheDocument();
  });
});

describe("ListaPostulantes · identificadores repetidos", () => {
  it("avisa del identificador duplicado y marca la fila afectada", () => {
    rol = "analista";
    render(<ListaPostulantes />);
    expect(screen.getByText(/identificador\(es\) repetido\(s\)/i)).toBeInTheDocument();
    expect(screen.getByText("ID repetido")).toBeInTheDocument();
  });

  it("dibuja las tres filas, incluida la repetida", () => {
    rol = "analista";
    render(<ListaPostulantes />);
    expect(screen.getAllByText("Ana Pérez")).toHaveLength(2);
    expect(screen.getByText("Luis Rojas")).toBeInTheDocument();
  });
});
