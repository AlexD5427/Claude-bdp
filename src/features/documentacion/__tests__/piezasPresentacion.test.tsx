import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { AnilloProgreso } from "../ui/AnilloProgreso";
import {
  CampoNombreLibre,
  ContadorHojasRevelado,
  MAX_NOMBRE_LIBRE,
  SelectorPresentacion,
  modoDesdePresentacion,
  modoLlevaHojas,
  type ModoPresentacion,
} from "../ui/ContadorHojas";

/**
 * Las piezas nuevas del módulo, probadas por su comportamiento observable.
 *
 * Nada de fotogramas ni de píxeles: lo que se afirma aquí es lo que una persona
 * puede hacer con el control —y lo que un lector de pantalla anuncia—, que es lo
 * único que sobrevive a un cambio de diseño.
 */

describe("anillo de progreso", () => {
  it("es una barra de progreso con su valor, y acota lo imposible", () => {
    const { rerender } = render(<AnilloProgreso valor={40} etiqueta="Avance documental" />);
    const barra = screen.getByRole("progressbar");
    expect(barra).toHaveAttribute("aria-valuenow", "40");
    expect(barra).toHaveAttribute("aria-label", "Avance documental: 40 %");
    expect(barra.textContent).toContain("40%");

    /* Un backend que devuelva 120 no debe dibujar dos vueltas, y uno que
       devuelva −5 no debe dibujar hacia atrás. */
    rerender(<AnilloProgreso valor={120} etiqueta="Avance documental" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    rerender(<AnilloProgreso valor={-5} etiqueta="Avance documental" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    // Y un valor que no es número tampoco rompe el dibujo.
    rerender(<AnilloProgreso valor={Number.NaN} etiqueta="Avance documental" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("el dibujo entero queda oculto para el lector de pantalla", () => {
    render(<AnilloProgreso valor={70} etiqueta="Avance" />);
    const svg = document.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden");
    // Y el arco recorre la proporción pedida, no una fija.
    const arco = document.querySelector(".doc-anillo-arco") as SVGCircleElement;
    const perimetro = Number(arco.getAttribute("stroke-dasharray")!.split(" ")[0]);
    const desplazamiento = Number(arco.getAttribute("stroke-dashoffset"));
    expect(Math.round(((perimetro - desplazamiento) / perimetro) * 100)).toBe(70);
  });

  it("dos anillos en la misma pantalla no comparten el identificador del degradado", () => {
    render(
      <>
        <AnilloProgreso valor={10} etiqueta="Uno" />
        <AnilloProgreso valor={90} etiqueta="Dos" />
      </>,
    );
    const gradientes = [...document.querySelectorAll("linearGradient")].map((g) => g.id);
    expect(gradientes).toHaveLength(2);
    /* `useId` por instancia: con un identificador fijo, el segundo anillo
       redefine el degradado del primero y los dos se pintan igual. */
    expect(new Set(gradientes).size).toBe(2);
  });
});

describe("selector de presentación", () => {
  function Caja({ inicial = "AMBOS" as ModoPresentacion }) {
    const [modo, setModo] = useState<ModoPresentacion>(inicial);
    return (
      <div>
        <SelectorPresentacion valor={modo} onChange={setModo} nombreDocumento="Certificación" />
        <p data-testid="modo">{modo}</p>
      </div>
    );
  }

  it("es un radiogrupo con una sola opción marcada", () => {
    render(<Caja />);
    const grupo = screen.getByRole("radiogroup", { name: /Certificación/ });
    const opciones = within(grupo).getAllByRole("radio");
    expect(opciones.map((o) => o.textContent)).toEqual(["Físico", "Digital", "Ambos"]);
    expect(opciones.filter((o) => o.getAttribute("aria-checked") === "true")).toHaveLength(1);
  });

  it("solo la opción marcada es tabulable, y las flechas recorren las tres", async () => {
    const usuario = userEvent.setup();
    render(<Caja />);
    const grupo = screen.getByRole("radiogroup");
    const tabulables = within(grupo)
      .getAllByRole("radio")
      .filter((o) => o.getAttribute("tabindex") === "0");
    /* Patrón de radiogrupo: una sola parada de tabulador. Con tres botones
       tabulables, llegar al campo siguiente costaba tres pulsaciones por fila. */
    expect(tabulables).toHaveLength(1);

    tabulables[0].focus();
    await usuario.keyboard("{ArrowRight}");
    // De «Ambos» hacia la derecha se vuelve al principio.
    expect(screen.getByTestId("modo").textContent).toBe("FISICO");
    await usuario.keyboard("{ArrowLeft}");
    expect(screen.getByTestId("modo").textContent).toBe("AMBOS");
    await usuario.keyboard("{ArrowLeft}");
    expect(screen.getByTestId("modo").textContent).toBe("DIGITAL");
  });

  it("el indicador se desplaza con `transform`, no con propiedades de diseño", async () => {
    const usuario = userEvent.setup();
    render(<Caja inicial="FISICO" />);
    const indicador = document.querySelector(".doc-presentacion-indicador") as HTMLElement;
    expect(indicador.style.transform).toBe("translate3d(0%, 0, 0)");
    await usuario.click(screen.getByRole("radio", { name: "Ambos" }));
    /* Un tercio por opción, resuelto con aritmética: no hace falta medir el
       control ni animar `left`, que obligaría a recalcular el diseño en cada
       fotograma. */
    expect(indicador.style.transform).toBe("translate3d(200%, 0, 0)");
    expect(indicador.style.left).toBe("");
    expect(indicador.style.width).toBe("");
  });
});

describe("traducción entre los tres modos y el par de banderas del modelo", () => {
  it("cada combinación del modelo tiene exactamente un modo", () => {
    expect(modoDesdePresentacion("SI", "SI")).toBe("AMBOS");
    expect(modoDesdePresentacion("SI", "NO")).toBe("FISICO");
    expect(modoDesdePresentacion("NO", "SI")).toBe("DIGITAL");
    // `CONDICIONAL` es una forma de presencia física: el «SÍ*» de la lista.
    expect(modoDesdePresentacion("CONDICIONAL", "SI")).toBe("AMBOS");
    expect(modoDesdePresentacion("CONDICIONAL", "NO")).toBe("FISICO");
    /* Ni físico ni digital no es representable en la pantalla, y el backend lo
       rechaza: se resuelve a digital, que es la entrega por defecto. */
    expect(modoDesdePresentacion("NO", "NO")).toBe("DIGITAL");
  });

  it("el conteo de hojas se deriva del modo, no se declara aparte", () => {
    expect(modoLlevaHojas("FISICO")).toBe(true);
    expect(modoLlevaHojas("AMBOS")).toBe(true);
    /* Es lo que hace que el estado imposible —solo digital con contador— no se
       pueda ni construir en la interfaz. */
    expect(modoLlevaHojas("DIGITAL")).toBe(false);
  });
});

describe("revelado del contador de hojas", () => {
  it("desmonta el campo al ocultarlo, no solo lo esconde", async () => {
    const usuario = userEvent.setup();
    function Caja() {
      const [visible, setVisible] = useState(true);
      return (
        <div>
          <button onClick={() => setVisible((v) => !v)}>alternar</button>
          <ContadorHojasRevelado visible={visible}>
            <input aria-label="hojas" />
          </ContadorHojasRevelado>
        </div>
      );
    }
    render(<Caja />);
    expect(screen.getByLabelText("hojas")).toBeInTheDocument();
    await usuario.click(screen.getByText("alternar"));
    /* Un campo de formulario invisible sigue siendo tabulable y sigue
       leyéndose con un lector de pantalla: esconderlo con ancho cero no basta. */
    await vi.waitFor(() => expect(screen.queryByLabelText("hojas")).toBeNull());
    await usuario.click(screen.getByText("alternar"));
    expect(await screen.findByLabelText("hojas")).toBeInTheDocument();
  });
});

describe("campo de nombre libre", () => {
  it("no admite más caracteres de los que acepta el backend", async () => {
    const usuario = userEvent.setup();
    function Caja() {
      const [v, setV] = useState("");
      return <CampoNombreLibre valor={v} onChange={setV} />;
    }
    render(<Caja />);
    const campo = screen.getByLabelText("Nombre del documento") as HTMLInputElement;
    expect(campo.maxLength).toBe(MAX_NOMBRE_LIBRE);
    /* El tope es el del backend (`MAX_NOMBRE_PERSONALIZADO`). Aplicarlo en el
       campo evita una espera de red para decir algo que el navegador sabía. */
    await usuario.type(campo, "x".repeat(MAX_NOMBRE_LIBRE + 20));
    expect(campo.value).toHaveLength(MAX_NOMBRE_LIBRE);
  });
});
