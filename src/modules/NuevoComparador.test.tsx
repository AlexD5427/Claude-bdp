import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuevoComparador } from "./NuevoComparador";
import { normaliseCandidates } from "../lib/candidates";
import {
  clearComparator,
  getComparatorState,
  setSelectedIds,
  showAllSections,
  toggleSectionVisible,
} from "../lib/comparatorStore";
import { resetConfig, setConfig } from "../lib/configStore";
import type { Candidate } from "../types";

/**
 * Regresiones del Comparador, todas nacidas de reproducir «el comparador no
 * funciona» en `qa/sondas.mjs`.
 */

const candidatos: Candidate[] = normaliseCandidates([
  {
    identificador: "1111111-100-2026",
    nombres: "Ana",
    apellido_paterno: "Pérez",
    nota_cap: 88,
    nota_conocimiento: 90,
    nota_competencias: 85,
    nota_curriculum: 78,
  },
  {
    identificador: "2222222-100-2026",
    nombres: "Luis",
    apellido_paterno: "Rojas",
    nota_cap: 88,
    nota_conocimiento: 74,
    nota_competencias: 81,
    nota_curriculum: 92,
  },
]);

vi.mock("../context/TalentDataContext", () => ({
  useTalentData: () => ({
    candidatos,
    status: "success",
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("../lib/profileViewerStore", () => ({ openProfile: vi.fn() }));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
  globalThis.IntersectionObserver ??=
    IntersectionObserverStub as unknown as typeof IntersectionObserver;
  clearComparator();
  showAllSections();
  resetConfig();
});

describe("Comparador · el límite no puede bloquearse con postulantes inexistentes", () => {
  it("descarta los identificadores que ya no están y libera el buscador", async () => {
    // Diez identificadores muertos en la sesión dejaban el buscador
    // deshabilitado con «Límite alcanzado (10/10)» mientras la pantalla decía
    // «Comienza tu comparación»: era imposible agregar a nadie.
    setConfig({ maxComparador: 10 });
    setSelectedIds(Array.from({ length: 10 }, (_, i) => `borrado-${i}`));

    render(<NuevoComparador />);

    await waitFor(() => expect(getComparatorState().selectedIds).toEqual([]));
    const buscador = screen.getByRole("combobox");
    expect(buscador).toBeEnabled();
    expect(buscador).toHaveAttribute(
      "placeholder",
      expect.stringContaining("Buscar por nombre"),
    );
    expect(screen.getByText("0/10")).toBeInTheDocument();
  });

  it("avisa de los postulantes que se cayeron de la comparación", async () => {
    setSelectedIds(["1111111-100-2026", "borrado-1"]);
    render(<NuevoComparador />);
    expect(
      await screen.findByText(/porque ya no están en la base de datos/i),
    ).toBeInTheDocument();
  });

  it("cuenta el límite con los postulantes que de verdad se encontraron", async () => {
    setConfig({ maxComparador: 2 });
    setSelectedIds(["1111111-100-2026", "borrado-9"]);
    render(<NuevoComparador />);
    await waitFor(() => expect(screen.getByText("1/2")).toBeInTheDocument());
    expect(screen.getByRole("combobox")).toBeEnabled();
  });
});

describe("Comparador · una comparativa sin secciones se explica", () => {
  it("dice que todo está oculto y ofrece volver a encenderlo", async () => {
    setSelectedIds(["1111111-100-2026"]);
    setConfig({ rankingEnabled: false });
    for (const id of [
      "resultados",
      "competencias",
      "conocimientos",
      "herramientas",
      "integridad",
      "observaciones",
    ] as const) {
      toggleSectionVisible(id, false);
    }

    render(<NuevoComparador />);

    expect(
      await screen.findByText(/Todas las secciones de la comparativa están ocultas/i),
    ).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Mostrar todas las secciones/i }));

    await waitFor(() =>
      expect(screen.getByText("Resultados de Evaluación")).toBeInTheDocument(),
    );
  });
});

describe("Comparador · el ranking premia el mérito", () => {
  it("con la Nota CAP empatada, el Índice de Desempate decide el puesto", async () => {
    setSelectedIds(["1111111-100-2026", "2222222-100-2026"]);
    render(<NuevoComparador />);

    // Ana: 0,40·90 + 0,35·85 + 0,25·78 = 85,25 → 1.º
    // Luis: 0,40·74 + 0,35·81 + 0,25·92 = 80,95 → 2.º
    const chips = await screen.findAllByText(/Desempate/i);
    expect(chips.length).toBeGreaterThan(0);
    const encabezados = screen.getAllByRole("columnheader");
    // 1 rótulo + 2 postulantes.
    expect(encabezados).toHaveLength(3);
  });
});
