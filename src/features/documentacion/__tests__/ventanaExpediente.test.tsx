/**
 * La ventana central del expediente.
 *
 * ── Los invariantes que esta prueba vigila ──────────────────────────────────
 * Son los mismos que costaron el «se congela» del área, ahora sobre la
 * superficie nueva. Cuando el expediente pasó de cajón lateral a ventana
 * central, el riesgo real era volver a introducirlos por la puerta de al lado:
 *
 *   1. **se puede ESCRIBIR una frase larga entera.** El fallo original entraba
 *      una sola letra porque la limpieza de un efecto con dependencias
 *      inestables movía el foco en cada tecla;
 *   2. **el candado de scroll se libera.** Con recuento de referencias, para que
 *      apilar una confirmación encima no deje la página trancada;
 *   3. **Escape cierra**, y con cambios sin guardar pregunta antes;
 *   4. **el foco vuelve** al elemento que abrió la ventana;
 *   5. **el conteo de hojas solo existe en los físicos**, y la rueda del ratón
 *      no lo cambia.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { ContadorHojas, Ventana } from "../ui/piezas";
import { __reiniciarColaParaPruebas } from "../state/colaSalida";

/* ------------------------------------------------------------------ */
/* Montaje                                                             */
/* ------------------------------------------------------------------ */

/**
 * Anfitrión de la ventana.
 *
 * Reproduce el patrón real: un padre que se renderiza en cada tecla —porque el
 * texto de la observación vive en su estado— y que pasa manejadores creados en
 * cada renderizado. Es exactamente la situación en la que la versión anterior
 * perdía el foco.
 */
function Anfitrion({ conCambios = false }: { conCambios?: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const [texto, setTexto] = useState("");
  const [contador, setContador] = useState(0);
  const disparador = useRef<HTMLButtonElement | null>(null);

  return (
    <div>
      <button ref={disparador} type="button" onClick={() => setAbierta(true)}>
        Abrir expediente
      </button>
      <span data-testid="renders">{contador}</span>
      <Ventana
        abierta={abierta}
        onCerrar={() => setAbierta(false)}
        titulo="Ana Quiroga Vargas"
        subtitulo="CI 1234567 LP · Analista"
        confirmarCierre={conCambios ? "Hay 2 cambio(s) sin guardar en este expediente." : undefined}
      >
        <label htmlFor="obs">Observaciones</label>
        <textarea
          id="obs"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            // Cada tecla provoca un renderizado del padre: si el efecto de la
            // ventana dependiera de algo inestable, aquí perdería el foco.
            setContador((n) => n + 1);
          }}
        />
        <button type="button">Guardar</button>
      </Ventana>
    </div>
  );
}

describe("documentación · ventana central del expediente", () => {
  beforeEach(() => {
    __reiniciarColaParaPruebas();
    window.localStorage.clear();
    document.body.style.overflow = "";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("se puede escribir una frase larga entera sin perder el foco", async () => {
    const usuario = userEvent.setup();
    render(<Anfitrion />);
    await usuario.click(screen.getByRole("button", { name: "Abrir expediente" }));

    const dialogo = await screen.findByRole("dialog");
    const area = within(dialogo).getByLabelText("Observaciones");
    const frase = "Falta la ultima pagina del certificado de antecedentes y la firma del interesado";

    // Se espera a que la ventana coloque el foco inicial ANTES de escribir. La
    // superficie lo hace con un retardo corto, cuando la animación de entrada ya
    // terminó; escribir en ese hueco es una carrera que ninguna persona puede
    // ganar —la ventana aparece después de una llamada al backend— pero una
    // prueba sí, y entonces falla por el motivo equivocado.
    await waitFor(() => expect(dialogo.contains(document.activeElement)).toBe(true));

    await usuario.click(area);
    await usuario.type(area, frase);

    // Antes del arreglo aquí llegaba una sola letra.
    expect((area as HTMLTextAreaElement).value).toBe(frase);
    expect(document.activeElement).toBe(area);
  }, 20000);

  it("bloquea el scroll del fondo al abrir y lo libera al cerrar", async () => {
    const usuario = userEvent.setup();
    render(<Anfitrion />);
    expect(document.body.style.overflow).toBe("");

    await usuario.click(screen.getByRole("button", { name: "Abrir expediente" }));
    await screen.findByRole("dialog");
    expect(document.body.style.overflow).toBe("hidden");

    await usuario.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // El candado lleva recuento: si no se liberara, la página quedaría trancada
    // y eso es lo que el área describía como «se congela».
    expect(document.body.style.overflow).toBe("");
  }, 20000);

  it("Escape cierra y devuelve el foco a quien la abrió", async () => {
    const usuario = userEvent.setup();
    render(<Anfitrion />);
    const disparador = screen.getByRole("button", { name: "Abrir expediente" });
    await usuario.click(disparador);
    await screen.findByRole("dialog");

    await usuario.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(disparador));
  }, 20000);

  it("con cambios sin guardar, Escape pregunta en lugar de perder el trabajo", async () => {
    const usuario = userEvent.setup();
    render(<Anfitrion conCambios />);
    await usuario.click(screen.getByRole("button", { name: "Abrir expediente" }));
    await screen.findByRole("dialog");

    await usuario.keyboard("{Escape}");
    // Aparece la confirmación DEL MÓDULO, no un `window.confirm`: el nativo
    // bloquea el hilo y el navegador permite silenciarlo, con lo que la ventana
    // dejaba de poder cerrarse.
    const confirmacion = await screen.findByRole("alertdialog");
    expect(within(confirmacion).getByText(/2 cambio\(s\) sin guardar/)).toBeInTheDocument();
    // La ventana sigue abierta: nada se ha descartado todavía.
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await usuario.click(within(confirmacion).getByRole("button", { name: "Cerrar y descartar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.body.style.overflow).toBe("");
  }, 20000);

  it("atrapa el foco: con Tab no se sale por detrás de la ventana", async () => {
    const usuario = userEvent.setup();
    render(<Anfitrion />);
    await usuario.click(screen.getByRole("button", { name: "Abrir expediente" }));
    const dialogo = await screen.findByRole("dialog");

    // Se tabula más veces que elementos hay: el foco tiene que seguir dentro.
    for (let i = 0; i < 8; i++) await usuario.tab();
    expect(dialogo.contains(document.activeElement)).toBe(true);
  }, 20000);
});

/* ------------------------------------------------------------------ */
/* Contador de hojas                                                   */
/* ------------------------------------------------------------------ */

function AnfitrionContador({ inicial = 0, onChange }: { inicial?: number; onChange?: (n: number) => void }) {
  const [valor, setValor] = useState(inicial);
  return (
    <div>
      <ContadorHojas
        valor={valor}
        onChange={(n) => {
          setValor(n);
          onChange?.(n);
        }}
        etiqueta="REJAP"
      />
      <span data-testid="valor">{valor}</span>
    </div>
  );
}

describe("documentación · contador de hojas del documento físico", () => {
  it("sube y baja con los botones, y no baja de cero", async () => {
    const usuario = userEvent.setup();
    render(<AnfitrionContador />);
    await usuario.click(screen.getByRole("button", { name: "Una hoja más en REJAP" }));
    await usuario.click(screen.getByRole("button", { name: "Una hoja más en REJAP" }));
    expect(screen.getByTestId("valor").textContent).toBe("2");

    await usuario.click(screen.getByRole("button", { name: "Una hoja menos en REJAP" }));
    expect(screen.getByTestId("valor").textContent).toBe("1");

    await usuario.click(screen.getByRole("button", { name: "Una hoja menos en REJAP" }));
    expect(screen.getByTestId("valor").textContent).toBe("0");
    // A cero, el botón de bajar se deshabilita en lugar de dar números negativos.
    expect(screen.getByRole("button", { name: "Una hoja menos en REJAP" })).toBeDisabled();
  });

  it("se escribe directamente y se acota al soltar el campo, no al teclear", async () => {
    const usuario = userEvent.setup();
    render(<AnfitrionContador />);
    const campo = screen.getByLabelText(/Hojas del documento físico/);

    // Recortar mientras se escribe impediría llegar a «12» pasando por «1».
    await usuario.clear(campo);
    await usuario.type(campo, "12");
    expect((campo as HTMLInputElement).value).toBe("12");
    await usuario.tab();
    expect(screen.getByTestId("valor").textContent).toBe("12");
  });

  it("las flechas del teclado ajustan el valor", async () => {
    const usuario = userEvent.setup();
    render(<AnfitrionContador inicial={5} />);
    const campo = screen.getByLabelText(/Hojas del documento físico/);
    await usuario.click(campo);
    await usuario.keyboard("{ArrowUp}{ArrowUp}{ArrowDown}");
    expect(screen.getByTestId("valor").textContent).toBe("6");
  });

  it("no es un `type=number`: la rueda del ratón no puede cambiar el valor", () => {
    render(<AnfitrionContador inicial={3} />);
    const campo = screen.getByLabelText(/Hojas del documento físico/) as HTMLInputElement;
    // En un `type="number"` con foco, hacer scroll altera el valor. En una lista
    // de veinticinco requisitos eso significa alterar los conteos al bajar por
    // la pantalla, sin que nadie lo note.
    expect(campo.type).toBe("text");
    expect(campo.inputMode).toBe("numeric");
  });

  it("descarta lo que no son dígitos y respeta el tope", async () => {
    const usuario = userEvent.setup();
    render(<AnfitrionContador />);
    const campo = screen.getByLabelText(/Hojas del documento físico/);
    await usuario.clear(campo);
    await usuario.type(campo, "12a34");
    await usuario.tab();
    // Solo dígitos, y como máximo tres: 999 es el tope del backend.
    expect(Number(screen.getByTestId("valor").textContent)).toBeLessThanOrEqual(999);
  });
  it("pasar por encima con el tabulador NO cuenta como cambio", async () => {
    // El contador confirma su valor al perder el foco. Si ese aviso viajara
    // aunque el número fuera el mismo, recorrer los veinticinco requisitos con el
    // teclado marcaba el expediente como modificado y, al cerrarlo, preguntaba si
    // descartar unos cambios que nadie había hecho.
    const usuario = userEvent.setup();
    const avisos: number[] = [];
    render(<AnfitrionContador inicial={4} onChange={(n) => avisos.push(n)} />);
    const campo = screen.getByLabelText(/Hojas del documento físico/);
    await usuario.click(campo);
    await usuario.tab();
    expect(avisos).toEqual([]);

    // Y con un número distinto sí avisa, una sola vez.
    await usuario.click(campo);
    await usuario.clear(campo);
    await usuario.type(campo, "7");
    await usuario.tab();
    expect(avisos).toEqual([7]);
  });
});
