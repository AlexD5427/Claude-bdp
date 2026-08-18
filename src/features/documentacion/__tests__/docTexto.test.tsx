import { describe, expect, it } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Cifra, TextoRevelado } from "../ui/DocTexto";

/**
 * El movimiento del texto y de las cifras.
 *
 * Lo que hay que garantizar no es que se mueva, sino que **el contenido siga
 * siendo el contenido**: un título revelado palabra a palabra tiene que leerse
 * como una sola frase para un lector de pantalla, y un contador animado tiene que
 * anunciar su valor final aunque la interpolación esté a mitad de camino. Si se
 * rompe eso, la animación ha hecho más daño que bien.
 */

describe("texto revelado", () => {
  it("conserva la frase completa para lectores de pantalla", () => {
    render(<TextoRevelado como="h2" texto="Requisitos de la categoría" />);
    // El texto accesible es uno, no seis palabras sueltas.
    expect(screen.getByRole("heading", { name: "Requisitos de la categoría" })).toBeTruthy();
  });

  it("usa la etiqueta semántica que se le pide", () => {
    const { container } = render(<TextoRevelado como="p" texto="Solo los de su rama." className="x" />);
    expect(container.querySelector("p.x")).toBeTruthy();
  });

  it("un texto vacío no rompe nada", () => {
    const { container } = render(<TextoRevelado texto="" />);
    expect(container.textContent).toBe("");
  });
});

describe("cifra interpolada", () => {
  it("empieza mostrando su valor inicial", () => {
    render(<Cifra valor={18} />);
    expect(screen.getByText("18")).toBeTruthy();
  });

  it("recorre el camino hasta el valor nuevo y termina exacto", async () => {
    const usuario = userEvent.setup();
    function Contador() {
      const [n, setN] = useState(0);
      return (
        <>
          <button type="button" onClick={() => setN(18)}>
            subir
          </button>
          <Cifra valor={n} />
        </>
      );
    }
    render(<Contador />);
    await usuario.click(screen.getByRole("button", { name: "subir" }));
    // El valor final se anuncia de inmediato, aunque el dígito visible viaje.
    expect(screen.getByLabelText("18")).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText("18").textContent).toBe("18"), { timeout: 2000 });
  });

  it("admite un sufijo y lo incluye en la etiqueta accesible", () => {
    render(<Cifra valor={75} sufijo="%" />);
    expect(screen.getByLabelText("75%")).toBeTruthy();
  });
});
