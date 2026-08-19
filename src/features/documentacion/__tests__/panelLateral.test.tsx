import { describe, expect, it } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Lateral, Confirmacion } from "../ui/piezas";

/**
 * El panel lateral: escribir dentro NO puede perder el foco.
 *
 * ── El fallo que esta prueba clava ──────────────────────────────────────────
 * `Lateral` monta un efecto que atrapa el foco y escucha el teclado, y su
 * limpieza devuelve el foco al elemento que estaba enfocado antes de abrirse. Ese
 * efecto dependía de `intentarCerrar`, que depende de `onCerrar` —una función nueva
 * en cada renderizado del padre—, así que **se remontaba en cada renderizado**.
 *
 * Resultado medido en un navegador real antes del arreglo: al escribir una
 * observación entraba UNA letra; la limpieza sacaba el foco del área de texto y el
 * temporizador de 50 ms lo dejaba en el primer botón del panel. Para quien usa el
 * módulo, «el teclado dejó de funcionar» en la pantalla más importante.
 *
 * La prueba reproduce la condición exacta: un padre que crea `onCerrar` nuevo en
 * cada renderizado y un área de texto controlada (cada tecla ⇒ un renderizado).
 */

function PanelDePrueba({ confirmar }: { confirmar?: string }) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      {/* Abrir con un botón importa: ese botón queda como «el foco anterior», que
          es justo lo que la limpieza del efecto restauraba en cada tecla. */}
      <button type="button" onClick={() => setAbierto(true)}>
        Abrir panel
      </button>
      <Lateral
        abierto={abierto}
        // A propósito: función nueva en cada renderizado, como en la consola real.
        onCerrar={() => setAbierto(false)}
        titulo="Expediente de prueba"
        confirmarCierre={confirmar}
      >
        <label>
          Observaciones
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} />
        </label>
      </Lateral>
      <p data-testid="eco">{texto}</p>
      <p data-testid="cerrado">{abierto ? "no" : "sí"}</p>
    </>
  );
}

/** Abre el panel y espera a que termine el enfoque inicial (50 ms). */
async function abrirPanel(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.click(screen.getByRole("button", { name: "Abrir panel" }));
  await screen.findByRole("dialog");
  await new Promise((r) => setTimeout(r, 120));
}

describe("panel lateral · foco y cierre", () => {
  it("deja escribir una observación completa sin perder el foco", async () => {
    const usuario = userEvent.setup();
    render(<PanelDePrueba />);
    await abrirPanel(usuario);

    const area = screen.getByLabelText(/Observaciones/);
    await usuario.click(area);
    await usuario.type(area, "Falta la última página");

    expect(screen.getByTestId("eco").textContent).toBe("Falta la última página");
    expect(document.activeElement).toBe(area);
  });

  it("con cambios sin guardar pide confirmación en la interfaz y no cierra hasta confirmar", async () => {
    const usuario = userEvent.setup();
    render(<PanelDePrueba confirmar="Hay 3 cambios sin guardar." />);
    await abrirPanel(usuario);

    await usuario.click(screen.getByRole("button", { name: "Cerrar" }));
    // No se cierra: aparece la confirmación del módulo (no un `window.confirm`).
    expect(screen.getByTestId("cerrado").textContent).toBe("no");
    expect(screen.getByText("Hay 3 cambios sin guardar.")).toBeTruthy();

    await usuario.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByTestId("cerrado").textContent).toBe("no");

    await usuario.click(screen.getByRole("button", { name: "Cerrar" }));
    await usuario.click(screen.getByRole("button", { name: "Cerrar y descartar" }));
    expect(screen.getByTestId("cerrado").textContent).toBe("sí");
  });

  it("libera el candado de scroll al cerrarse", async () => {
    const usuario = userEvent.setup();
    render(<PanelDePrueba />);
    await abrirPanel(usuario);
    expect(document.body.style.overflow).toBe("hidden");
    await usuario.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(document.body.style.overflow).toBe("");
  });
});

/**
 * La confirmación tenía el mismo defecto de dependencias: su escuchador de teclado
 * se remontaba en cada renderizado del padre. No robaba el foco, pero sí generaba
 * trabajo inútil en cada tecla. Aquí se comprueba que sigue cancelando con Escape.
 */
describe("confirmación · teclado estable", () => {
  it("cancela con Escape", async () => {
    const usuario = userEvent.setup();
    function Envoltorio() {
      const [n, setN] = useState(0);
      const [cancelada, setCancelada] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setN(n + 1)}>
            renderizar {n}
          </button>
          <Confirmacion
            abierta={!cancelada}
            titulo="¿Archivar el expediente?"
            onConfirmar={() => {}}
            onCancelar={() => setCancelada(true)}
          />
          <p data-testid="estado">{cancelada ? "cancelada" : "abierta"}</p>
        </>
      );
    }
    render(<Envoltorio />);
    // Varios renderizados del padre antes de pulsar Escape.
    await usuario.click(screen.getByRole("button", { name: /renderizar/ }));
    await usuario.click(screen.getByRole("button", { name: /renderizar/ }));
    await usuario.keyboard("{Escape}");
    expect(screen.getByTestId("estado").textContent).toBe("cancelada");
  });
});
