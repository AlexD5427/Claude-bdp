import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../context/ThemeContext";
import { setConfig } from "../lib/configStore";
import { resetFilters } from "../lib/filtersStore";
import { closeTools } from "../lib/toolsStore";
import { FilterBar } from "./FilterBar";
import { FloatingDock } from "./FloatingDock";
import { LoginScreen } from "./login/LoginScreen";

const mocks = vi.hoisted(() => ({ attemptLogin: vi.fn() }));

vi.mock("../context/TalentDataContext", () => ({
  useTalentData: () => ({ candidatos: [], connection: "conectado", status: "success", syncing: false, lastSyncedAt: null }),
}));
vi.mock("../lib/profilesStore", () => ({
  useProfiles: () => ({ profiles: [{ id: "qa", nombre: "Perfil de prueba", cargo: "Selección", tienePassword: true }] }),
  attemptLogin: mocks.attemptLogin,
}));
vi.mock("./login/ProfileAvatar", () => ({ ProfileAvatar: () => null }));
vi.mock("./DockProfileChip", () => ({ DockProfileChip: () => <button type="button">Mi perfil</button> }));
vi.mock("./DrawIcon", () => ({ DrawIcon: () => null }));
vi.mock("../lib/useFilteredData", async () => {
  const { filtersActive, useFilters } = await import("../lib/filtersStore");
  return {
    useFilteredData: () => ({
      options: { gerencia: ["Operaciones"], agencia: [], modalidad: [], estado: [] },
      active: filtersActive(useFilters()),
    }),
  };
});

beforeEach(() => {
  setConfig({ reduceMotion: true, dockCollapsed: false, dockPosition: "top", dockSize: "md" });
  closeTools();
  resetFilters();
  mocks.attemptLogin.mockReset();
});
afterEach(cleanup);

describe("espacio BDP Prisma", () => {
  it("conserva el foco entre el selector de perfil y la contraseña", () => {
    render(<LoginScreen />);
    fireEvent.click(screen.getByRole("button", { name: /Perfil de prueba/ }));
    const password = screen.getByLabelText("Contraseña");
    expect(password).toHaveFocus();
    fireEvent.keyDown(password, { key: "Escape" });
    expect(screen.getByRole("button", { name: /Perfil de prueba/ })).toHaveFocus();
  });

  it("anuncia un rechazo de acceso sin cambiar el perfil elegido", async () => {
    mocks.attemptLogin.mockResolvedValue({ ok: false, error: "No se pudo iniciar sesión." });
    render(<LoginScreen />);
    fireEvent.click(screen.getByRole("button", { name: /Perfil de prueba/ }));
    const password = screen.getByLabelText("Contraseña");
    fireEvent.change(password, { target: { value: "clave-de-prueba" } });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo iniciar sesión.");
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(mocks.attemptLogin).toHaveBeenCalledOnce();
  });

  it("mantiene el estado y los controles al contraer y expandir el dock", () => {
    const select = vi.fn();
    render(<ThemeProvider><FloatingDock active="procesos" onSelect={select} synced={false} offline /></ThemeProvider>);
    const nav = within(screen.getByRole("navigation", { name: "Navegación de módulos" }));
    expect(nav.getByRole("button", { name: "Procesos" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(nav.getByRole("button", { name: "Herramientas" }));
    expect(nav.getByRole("button", { name: "Procesos" })).toBeDisabled();
    fireEvent.click(nav.getByRole("button", { name: "Herramientas" }));
    fireEvent.click(nav.getByRole("button", { name: "Postulantes" }));
    expect(select).toHaveBeenCalledWith("postulantes");
    fireEvent.click(nav.getByRole("button", { name: "Contraer accesos directos" }));
    const expand = nav.getByRole("button", { name: "Expandir accesos directos" });
    expect(expand).toHaveFocus();
    fireEvent.click(expand);
    expect(nav.getByRole("button", { name: "Contraer accesos directos" })).toHaveFocus();
    expect(nav.getByRole("button", { name: "Mi perfil" })).toBeInTheDocument();
  });

  it("etiqueta el rango y devuelve el foco al limpiar filtros", async () => {
    render(<FilterBar />);
    const all = screen.getByRole("button", { name: "Todo" });
    expect(all).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Rango" }));
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-03-01" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-03-31" } });
    fireEvent.change(screen.getByLabelText("Gerencia"), { target: { value: "Operaciones" } });
    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    await waitFor(() => expect(all).toHaveAttribute("aria-pressed", "true"));
    expect(all).toHaveFocus();
    expect(screen.queryByLabelText("Desde")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Gerencia")).toHaveValue("");
  });
});
