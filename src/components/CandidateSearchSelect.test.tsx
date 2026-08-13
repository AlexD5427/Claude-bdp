import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CandidateSearchSelect } from "./CandidateSearchSelect";
import { normaliseCandidates } from "../lib/candidates";

/**
 * Regresión del buscador del Comparador.
 *
 * ## El fallo
 *
 * La lista de sugerencias se abría **sólo** en `onFocus`. Al agregar a alguien,
 * el componente cierra la lista y devuelve el foco al campo para poder escribir
 * el nombre siguiente; desde ese momento el campo ya tenía el foco, así que
 * volver a hacer clic en él no emitía ningún `focus` y la lista no se abría
 * nunca más. El analista se quedaba con un solo candidato en la comparación y
 * la única salida —no evidente— era teclear una letra o pulsar la flecha abajo.
 *
 * Es el «a mí el comparador no me funciona» que no se reproducía en las pruebas:
 * quien busca escribiendo no lo nota; quien navega a puro clic, sí.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const candidatos = normaliseCandidates([
  { identificador: "1-105-2026", nombres: "Ana", apellido_paterno: "Torrez" },
  { identificador: "2-105-2026", nombres: "Beto", apellido_paterno: "Quispe" },
  { identificador: "3-105-2026", nombres: "Carla", apellido_paterno: "Mamani" },
]);

beforeEach(() => {
  globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
});

/** El botón real de una sugerencia (el `<li role="option">` sólo la envuelve). */
function opcion(i: number) {
  return screen.getAllByRole("option")[i].querySelector("button") as HTMLButtonElement;
}

function setup(selectedIds: string[] = [], max = 10) {
  const onAdd = vi.fn();
  const onRemove = vi.fn();
  const view = render(
    <CandidateSearchSelect
      candidates={candidatos}
      selectedIds={selectedIds}
      onAdd={onAdd}
      onRemove={onRemove}
      max={max}
    />,
  );
  const input = screen.getByRole("combobox");
  return { ...view, input, onAdd, onRemove };
}

describe("CandidateSearchSelect", () => {
  it("abre la lista al hacer clic en el campo", async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await user.click(input);
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("vuelve a abrir la lista al hacer clic aunque el campo ya tenga el foco", async () => {
    const user = userEvent.setup();
    const { input, onAdd } = setup();

    await user.click(input);
    await user.click(opcion(0));
    expect(onAdd).toHaveBeenCalledWith("1-105-2026");
    // Al agregar, la lista se cierra a propósito (deja ver la comparativa).
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(input).toHaveFocus();

    // Y este segundo clic —el que antes no hacía nada— la vuelve a abrir.
    await user.click(input);
    expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    expect(input).toHaveAttribute("aria-expanded", "true");
  });

  it("el foco programático posterior a agregar no reabre la lista por su cuenta", async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await user.click(input);
    await user.click(opcion(0));
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("excluye a quien ya está en la comparación", async () => {
    const user = userEvent.setup();
    const { input } = setup(["1-105-2026"]);
    await user.click(input);
    const textos = screen.getAllByRole("option").map((o) => o.textContent ?? "");
    expect(textos).toHaveLength(2);
    expect(textos.some((t) => t.includes("Ana"))).toBe(false);
  });

  it("filtra por nombre y por identificador", async () => {
    const user = userEvent.setup();
    const { input } = setup();
    await user.type(input, "mamani");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    await user.clear(input);
    await user.type(input, "2-105");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toHaveLength(1);
  });

  it("al alcanzar el máximo explica cómo seguir en lugar de quedarse mudo", () => {
    setup(["1-105-2026", "2-105-2026"], 2);
    const input = screen.getByRole("combobox");
    expect(input).toBeDisabled();
    expect(screen.getByText(/Quite a alguien de la lista/i)).toBeInTheDocument();
  });

  it("permite agregar por teclado (flecha abajo + Intro)", async () => {
    const user = userEvent.setup();
    const { input, onAdd } = setup();
    await user.click(input);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onAdd).toHaveBeenCalledWith("2-105-2026");
  });
});
