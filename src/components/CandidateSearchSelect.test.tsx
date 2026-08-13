import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CandidateSearchSelect } from "./CandidateSearchSelect";
import { normaliseCandidates } from "../lib/candidates";

/**
 * Regresión del buscador del Comparador.
 *
 * ## El fallo
 *
 * Al agregar a alguien, el desplegable se cierra (para dejar la comparativa a la
 * vista) y el foco se queda en el campo, de modo que teclear el nombre siguiente
 * vuelve a abrir la lista. Pero el gesto natural para agregar al segundo
 * postulante es **volver a hacer clic en el buscador**, y ese clic no producía
 * ningún evento de foco —el foco ya estaba dentro—, así que la lista no se abría
 * y no ocurría nada. Quien agregaba con el teclado no lo notaba nunca; quien
 * usaba el ratón concluía que el comparador no funcionaba.
 *
 * ## Lo que se fija aquí
 *
 * 1. Un clic en el campo abre la lista **siempre**, incluso justo después de
 *    haber agregado a alguien.
 * 2. Dos filas con el mismo identificador siguen siendo dos personas
 *    seleccionables por separado (ver `lib/candidates`).
 */

const CANDIDATOS = normaliseCandidates([
  { identificador: "8456872-105-2026", nombres: "Jorge", apellido_paterno: "Mamani" },
  { identificador: "7712345-105-2026", nombres: "Andrea", apellido_paterno: "Villarroel" },
  { identificador: "5555555-106-2026", nombres: "Duplicado", apellido_paterno: "Uno" },
  { identificador: "5555555-106-2026", nombres: "Duplicado", apellido_paterno: "Dos" },
]);

const PLACEHOLDER = /Buscar por nombre o identificador/i;

function setup(selectedIds: string[] = []) {
  const onAdd = vi.fn();
  const onRemove = vi.fn();
  const view = render(
    <CandidateSearchSelect
      candidates={CANDIDATOS}
      selectedIds={selectedIds}
      onAdd={onAdd}
      onRemove={onRemove}
      max={10}
    />,
  );
  return { onAdd, onRemove, view };
}

/** El botón real de una sugerencia (el `<li>` sólo aporta el rol de opción). */
function optionButton(index: number): HTMLElement {
  return within(screen.getAllByRole("option")[index]).getByRole("button");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CandidateSearchSelect", () => {
  it("abre la lista al hacer clic en el campo", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByPlaceholderText(PLACEHOLDER));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(4);
  });

  it("vuelve a abrir la lista al hacer clic tras agregar a alguien", async () => {
    const user = userEvent.setup();
    const { onAdd } = setup();
    const input = screen.getByPlaceholderText(PLACEHOLDER);

    await user.click(input);
    await user.click(optionButton(0));
    expect(onAdd).toHaveBeenCalledWith("8456872-105-2026");
    // Al agregar, la lista se cierra a propósito.
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    // El foco sigue en el campo: este clic no genera evento de foco, y era el
    // que antes no hacía absolutamente nada.
    await user.click(input);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("sigue permitiendo agregar escribiendo el nombre", async () => {
    const user = userEvent.setup();
    const { onAdd } = setup();
    const input = screen.getByPlaceholderText(PLACEHOLDER);
    await user.click(input);
    await user.type(input, "andrea");
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    await user.click(optionButton(0));
    expect(onAdd).toHaveBeenCalledWith("7712345-105-2026");
  });

  it("deja elegir a las dos personas que comparten identificador", async () => {
    const user = userEvent.setup();
    // Con la primera ya seleccionada, la segunda debe seguir ofreciéndose.
    const { onAdd } = setup(["5555555-106-2026"]);
    const input = screen.getByPlaceholderText(PLACEHOLDER);
    await user.click(input);
    await user.type(input, "duplicado");
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Duplicado Dos");
    // Y se avisa de que la hoja tiene la clave repetida.
    expect(options[0]).toHaveTextContent(/identificador repetido/i);
    await user.click(optionButton(0));
    expect(onAdd).toHaveBeenCalledWith("5555555-106-2026#2");
  });

  it("no ofrece nada cuando se alcanzó el límite de columnas", async () => {
    const user = userEvent.setup();
    render(
      <CandidateSearchSelect
        candidates={CANDIDATOS}
        selectedIds={["8456872-105-2026", "7712345-105-2026"]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        max={2}
      />,
    );
    const input = screen.getByPlaceholderText(/Límite alcanzado/i);
    expect(input).toBeDisabled();
    await user.click(input);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
