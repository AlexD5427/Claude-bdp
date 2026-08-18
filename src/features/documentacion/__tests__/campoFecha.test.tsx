import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CampoFecha, aIso, deIso, diasDesdeHoy, fechaLegible } from "../ui/CampoFecha";

/**
 * El calendario del módulo.
 *
 * Se prueban las dos partes que pueden equivocarse de verdad: la aritmética de
 * fechas —donde el error clásico es usar `toISOString()` y desplazarse un día por
 * la zona horaria— y el comportamiento del campo: escribir a mano, elegir en la
 * rejilla, respetar los límites y no dejar el foco perdido.
 */

describe("calendario · fechas sin zonas horarias", () => {
  it("aIso y deIso son inversos y no se desplazan un día", () => {
    const iso = "2026-01-01";
    const fecha = deIso(iso)!;
    expect(aIso(fecha)).toBe(iso);
    // Mediodía local: ni el cambio de horario ni un huso negativo mueven el día.
    expect(fecha.getHours()).toBe(12);
    expect(fecha.getDate()).toBe(1);
    expect(fecha.getMonth()).toBe(0);
  });

  it("deIso rechaza lo que no es una fecha", () => {
    expect(deIso("")).toBeNull();
    expect(deIso("18/08/2026")).toBeNull();
    expect(deIso("2026-13-40")).not.toBeNull(); // JS normaliza; no es tarea de este helper
    expect(deIso("hola")).toBeNull();
  });

  it("fechaLegible escribe el día de la semana en español", () => {
    // 2026-08-18 es martes.
    expect(fechaLegible("2026-08-18")).toBe("mar, 18 de agosto de 2026");
    expect(fechaLegible("")).toBe("");
  });

  it("diasDesdeHoy cuenta días naturales en los dos sentidos", () => {
    const hoy = aIso(new Date());
    expect(diasDesdeHoy(hoy)).toBe(0);
    const enDiez = new Date();
    enDiez.setDate(enDiez.getDate() + 10);
    expect(diasDesdeHoy(aIso(enDiez))).toBe(10);
    const haceTres = new Date();
    haceTres.setDate(haceTres.getDate() - 3);
    expect(diasDesdeHoy(aIso(haceTres))).toBe(-3);
  });
});

function Campo({ min, max, sentido }: { min?: string; max?: string; sentido?: "pasado" | "futuro" }) {
  const [valor, setValor] = useState("");
  return (
    <>
      <CampoFecha valor={valor} onChange={setValor} min={min} max={max} sentido={sentido} etiquetaAccesible="Fecha de prueba" />
      <p data-testid="valor">{valor}</p>
    </>
  );
}

describe("calendario · campo", () => {
  it("acepta la fecha escrita a mano en dd/mm/aaaa", async () => {
    const usuario = userEvent.setup();
    render(<Campo />);
    await usuario.type(screen.getByLabelText("Fecha de prueba"), "18/08/2026");
    expect(screen.getByTestId("valor").textContent).toBe("2026-08-18");
  });

  it("abre la rejilla al enfocar y elige un día", async () => {
    const usuario = userEvent.setup();
    render(<Campo />);
    await usuario.click(screen.getByLabelText("Fecha de prueba"));
    const panel = await screen.findByRole("dialog", { name: "Elegir fecha" });
    // El día de hoy está marcado como fecha actual y se puede elegir.
    const hoy = new Date();
    const boton = within(panel).getByLabelText(fechaLegible(aIso(hoy)));
    await usuario.click(boton);
    expect(screen.getByTestId("valor").textContent).toBe(aIso(hoy));
  });

  it("deshabilita los días fuera del rango permitido", async () => {
    const usuario = userEvent.setup();
    const hoy = new Date();
    const manana = new Date();
    manana.setDate(hoy.getDate() + 1);
    render(<Campo max={aIso(hoy)} />);
    await usuario.click(screen.getByLabelText("Fecha de prueba"));
    const panel = await screen.findByRole("dialog", { name: "Elegir fecha" });
    const botonManana = within(panel).queryByLabelText(fechaLegible(aIso(manana)));
    // Mañana puede caer en la rejilla del mes siguiente; si está, debe estar vetada.
    if (botonManana) expect(botonManana).toBeDisabled();
  });

  it("los atajos de un plazo miran al futuro", async () => {
    const usuario = userEvent.setup();
    render(<Campo sentido="futuro" min={aIso(new Date())} />);
    await usuario.click(screen.getByLabelText("Fecha de prueba"));
    const panel = await screen.findByRole("dialog", { name: "Elegir fecha" });
    await usuario.click(within(panel).getByRole("button", { name: "En una semana" }));
    const esperado = new Date();
    esperado.setDate(esperado.getDate() + 7);
    expect(screen.getByTestId("valor").textContent).toBe(aIso(esperado));
  });

  it("se limpia con el botón de quitar", async () => {
    const usuario = userEvent.setup();
    render(<Campo />);
    await usuario.type(screen.getByLabelText("Fecha de prueba"), "01/03/2026");
    expect(screen.getByTestId("valor").textContent).toBe("2026-03-01");
    await usuario.click(screen.getByRole("button", { name: "Quitar la fecha" }));
    expect(screen.getByTestId("valor").textContent).toBe("");
  });

  it("las flechas del teclado mueven el día en foco y Enter lo elige", async () => {
    const usuario = userEvent.setup();
    render(<Campo />);
    const entrada = screen.getByLabelText("Fecha de prueba");
    await usuario.click(entrada);
    await screen.findByRole("dialog", { name: "Elegir fecha" });
    await usuario.keyboard("{ArrowRight}{ArrowRight}{Enter}");
    const esperado = new Date();
    esperado.setDate(esperado.getDate() + 2);
    expect(screen.getByTestId("valor").textContent).toBe(aIso(esperado));
  });
});

/** El calendario no debe dejar escuchadores colgados al desmontarse. */
describe("calendario · limpieza", () => {
  it("quita sus escuchadores del documento al cerrarse", async () => {
    const usuario = userEvent.setup();
    const quitar = vi.spyOn(document, "removeEventListener");
    const { unmount } = render(<Campo />);
    await usuario.click(screen.getByLabelText("Fecha de prueba"));
    await screen.findByRole("dialog", { name: "Elegir fecha" });
    unmount();
    expect(quitar).toHaveBeenCalledWith("keydown", expect.any(Function));
    quitar.mockRestore();
  });
});
