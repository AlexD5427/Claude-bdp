import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CandidateSearchSelect } from "./CandidateSearchSelect";
import { normaliseCandidates } from "../lib/candidates";
import type { RawCandidate } from "../types";

/**
 * Regresión del buscador del Comparador.
 *
 * El fallo que motivó estas pruebas es el que el área reportaba como «el
 * comparador no funciona»: tras agregar al primer postulante, **volver a hacer
 * clic en el buscador no reabría la lista**, así que no se podía agregar a nadie
 * más. La causa está documentada en el propio componente; el resumen es que la
 * lista sólo se abría desde `onFocus`, y un clic sobre un campo que ya tiene el
 * foco no emite ningún evento `focus`.
 *
 * Quien agregaba postulantes **escribiendo** el nombre no lo notaba (el
 * `onChange` sí abría la lista): de ahí que el fallo pareciera «cosa del equipo
 * de una sola persona».
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
});

const rows: RawCandidate[] = [
  { identificador: "8456872-105-2026", nombres: "Jorge", apellido_paterno: "Mamani" },
  { identificador: "7712345-105-2026", nombres: "Andrea", apellido_paterno: "Villarroel" },
  { identificador: "6698741-105-2026", nombres: "María", apellido_paterno: "Rojas" },
  // Dos personas distintas con el MISMO identificador (el caso real de la hoja).
  { identificador: "9001122-107-2026", nombres: "Carlos", apellido_paterno: "Terán" },
  { identificador: "9001122-107-2026", nombres: "Rodrigo", apellido_paterno: "Salazar" },
];

function setup({ max = 10, selected = [] as string[] } = {}) {
  const candidates = normaliseCandidates(rows);
  const onAdd = vi.fn();
  const onRemove = vi.fn();
  const view = render(
    <CandidateSearchSelect
      candidates={candidates}
      selectedIds={selected}
      onAdd={onAdd}
      onRemove={onRemove}
      max={max}
    />,
  );
  const input = screen.getByRole("combobox");
  return { candidates, onAdd, onRemove, input, view };
}

const options = () => screen.queryAllByRole("option");
/**
 * jsdom no hace hit-testing: hacer clic en el `<li role="option">` no activa el
 * `<button>` que lleva dentro (en un navegador real, sí). Se pulsa el botón.
 */
const pickOption = (index = 0) =>
  within(options()[index]).getByRole("button");

describe("CandidateSearchSelect · la lista se puede volver a abrir", () => {
  it("abre la lista al hacer clic en el buscador", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("combobox"));
    expect(options().length).toBe(5);
  });

  it("vuelve a abrirse al hacer clic tras agregar a alguien (el bug reportado)", async () => {
    const user = userEvent.setup();
    const { onAdd, input } = setup();

    await user.click(input);
    await user.click(pickOption());
    expect(onAdd).toHaveBeenCalledTimes(1);
    // Se cierra a propósito para dejar la comparativa a la vista.
    expect(options()).toHaveLength(0);
    // El foco vuelve al campo, así que el clic siguiente NO emite `focus`.
    expect(document.activeElement).toBe(input);

    await user.click(input);
    expect(options().length).toBeGreaterThan(0);
  });

  it("también se reabre con la flecha abajo y al escribir", async () => {
    const user = userEvent.setup();
    const { input } = setup();

    await user.click(input);
    await user.click(pickOption());
    expect(options()).toHaveLength(0);

    await user.keyboard("{ArrowDown}");
    expect(options().length).toBeGreaterThan(0);

    await user.keyboard("{Escape}");
    expect(options()).toHaveLength(0);
    await user.type(input, "Andrea");
    expect(options().length).toBe(1);
  });

  it("permite agregar varios postulantes seguidos sólo con el ratón", async () => {
    const user = userEvent.setup();
    const candidates = normaliseCandidates(rows);
    const onAdd = vi.fn();
    let selected: string[] = [];

    const { rerender } = render(
      <CandidateSearchSelect
        candidates={candidates}
        selectedIds={selected}
        onAdd={(id) => {
          onAdd(id);
          selected = [...selected, id];
        }}
        onRemove={vi.fn()}
        max={10}
      />,
    );

    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole("combobox"));
      expect(
        options().length,
        `iteración ${i + 1}: la lista debería estar abierta`,
      ).toBeGreaterThan(0);
      await user.click(pickOption());
      rerender(
        <CandidateSearchSelect
          candidates={candidates}
          selectedIds={selected}
          onAdd={(id) => {
            onAdd(id);
            selected = [...selected, id];
          }}
          onRemove={vi.fn()}
          max={10}
        />,
      );
    }
    expect(onAdd).toHaveBeenCalledTimes(4);
    expect(new Set(selected).size).toBe(4);
  });
});

describe("CandidateSearchSelect · identificadores repetidos", () => {
  it("ofrece a las dos personas que comparten identificador", async () => {
    const user = userEvent.setup();
    const { candidates } = setup({ selected: [] });
    await user.click(screen.getByRole("combobox"));
    const textos = options().map((o) => o.textContent ?? "");
    expect(textos.some((t) => t.includes("Carlos"))).toBe(true);
    expect(textos.some((t) => t.includes("Rodrigo"))).toBe(true);
    expect(candidates[4].id).not.toBe(candidates[3].id);
  });

  it("al elegir a una, la otra sigue disponible", async () => {
    const user = userEvent.setup();
    const candidates = normaliseCandidates(rows);
    const carlos = candidates[3];
    render(
      <CandidateSearchSelect
        candidates={candidates}
        selectedIds={[carlos.id]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        max={10}
      />,
    );
    await user.click(screen.getByRole("combobox"));
    const textos = options().map((o) => o.textContent ?? "");
    expect(textos.some((t) => t.includes("Rodrigo"))).toBe(true);
    expect(textos.some((t) => t.includes("Carlos"))).toBe(false);
  });

  it("avisa en la sugerencia de que el identificador está repetido", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("combobox"));
    expect(screen.getAllByText(/ID repetido/i).length).toBeGreaterThan(0);
  });
});

describe("CandidateSearchSelect · límite de columnas", () => {
  it("explica el límite en vez de dejar el campo muerto", async () => {
    const user = userEvent.setup();
    const candidates = normaliseCandidates(rows);
    render(
      <CandidateSearchSelect
        candidates={candidates}
        selectedIds={[candidates[0].id, candidates[1].id]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        max={2}
      />,
    );
    const input = screen.getByRole("combobox");
    // El campo sigue vivo: antes se desactivaba y el aviso quedaba en un
    // placeholder atenuado que nadie leía.
    expect(input).toBeEnabled();
    await user.click(input);
    expect(
      screen.getByText(/máximo configurado/i),
    ).toBeInTheDocument();
    expect(options()).toHaveLength(0);
  });
});
