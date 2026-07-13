import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { ProcesosModule } from "./ProcesosModule";
import { __setProviderForTests, mockProvider } from "../../../infrastructure/providers";
import { resetMockData } from "../../../infrastructure/providers/mock";
import { processListStore, emptyFilters, DEFAULT_COLUMNS } from "./listState";

// Force the mock provider and reset seeded data + list state for each test.
beforeEach(() => {
  __setProviderForTests(mockProvider);
  resetMockData();
  processListStore.set({
    search: "",
    filters: { ...emptyFilters(), lifecycle: "all" },
    view: "table",
    density: "comfortable",
    sort: { key: "updatedAt", dir: "desc" },
    visibleColumns: DEFAULT_COLUMNS,
    savedViews: [],
  });
});
afterEach(() => {
  cleanup();
  __setProviderForTests(null);
});

describe("ProcessOS module (component)", () => {
  it("loads and lists seeded recruitment processes", async () => {
    render(<ProcesosModule />);
    // A seeded process title should appear once the mock provider resolves.
    expect(await screen.findByText("Analista de Riesgo Crediticio")).toBeInTheDocument();
    expect(screen.getByText("Ejecutivo de Servicio al Cliente")).toBeInTheDocument();
  });

  it("renders the Spanish create action and search placeholder", async () => {
    render(<ProcesosModule />);
    await screen.findByText("Analista de Riesgo Crediticio");
    expect(screen.getByPlaceholderText(/Buscar por código/i)).toBeInTheDocument();
  });

  it("filters the list by search text", async () => {
    render(<ProcesosModule />);
    await screen.findByText("Cajero de Sucursal");
    const search = screen.getByPlaceholderText(/Buscar por código/i);
    fireEvent.change(search, { target: { value: "cajero" } });
    await waitFor(() => {
      expect(screen.queryByText("Analista de Riesgo Crediticio")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Cajero de Sucursal")).toBeInTheDocument();
  });
});
