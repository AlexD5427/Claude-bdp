import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DocCargando, LogoDocumentos } from "../ui/DocCargando";
import { HojaCentral } from "../ui/HojaCentral";
import { ContadorHojas, LeyendaCondicional, SelloPresentacion } from "../ui/ContadorHojas";
import { Z } from "../../../design-system/tokens";

/**
 * Superficies nuevas del módulo: pantalla de carga, hoja central y contador de
 * hojas.
 *
 * ── Qué vigilan estas pruebas, y por qué justo eso ──────────────────────────
 * Cada una corresponde a un fallo que este repositorio ya pagó:
 *
 * · **La pantalla de carga no bloquea.** Una cortina eterna es peor que un
 *   error: no dice nada y no deja hacer nada. Hay un tope duro y se comprueba.
 * · **La hoja central cumple los invariantes de las superposiciones**: candado
 *   de scroll con recuento, foco atrapado y devuelto, Escape, `aria-modal`,
 *   apilamiento por debajo de `Z.dialog` y confirmación propia (nunca
 *   `window.confirm`).
 * · **Se puede escribir una frase larga entera** en una observación sin perder
 *   el foco. Es EL fallo del módulo: un efecto con dependencias inestables cuya
 *   limpieza movía el foco hacía que entrara una sola letra.
 * · **El contador de hojas solo aparece donde toca** y no cambia de valor al
 *   hacer scroll con el puntero encima.
 */

describe("pantalla de carga · nunca bloquea", () => {
  it("muestra el logo animado y el texto que el área espera leer", () => {
    render(<DocCargando visible detalle="Leyendo el catálogo de requisitos…" />);
    expect(screen.getByText("Cargando documentación")).toBeInTheDocument();
    expect(screen.getByText("Leyendo el catálogo de requisitos…")).toBeInTheDocument();
    // Se anuncia como estado, no como alerta: informa, no interrumpe.
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("avisa al agotarse el tope duro para que el módulo entre igual", async () => {
    vi.useFakeTimers();
    try {
      const agotado = vi.fn();
      render(<DocCargando visible topeMs={3000} onTiempoAgotado={agotado} />);
      expect(agotado).not.toHaveBeenCalled();
      await act(async () => {
        vi.advanceTimersByTime(3001);
      });
      /* Es la garantía de que un backend lento no deja a nadie mirando una
         animación: pasado el tope se entra con esqueletos y su diagnóstico. */
      expect(agotado).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("no monta nada cuando no está visible", () => {
    const { container } = render(<DocCargando visible={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("con movimiento reducido las hojas se quedan quietas y legibles", () => {
    const { container } = render(<LogoDocumentos quieto />);
    // Sin la clase de la animación: ni una hoja hojeando, ni el giro de tono.
    expect(container.querySelectorAll(".doc-cargando-hoja")).toHaveLength(0);
    expect(container.querySelector(".doc-cargando-color")).toBeNull();
    // Y el logo sigue ahí: se degrada a estático, no desaparece.
    expect(container.firstElementChild).toHaveClass("doc-cargando-logo");
  });

  it("animado, cada hoja lleva su clase y el color se mueve", () => {
    const { container } = render(<LogoDocumentos />);
    expect(container.querySelectorAll(".doc-cargando-hoja")).toHaveLength(3);
    expect(container.querySelector(".doc-cargando-color")).not.toBeNull();
  });
});

describe("hoja central · invariantes de las superposiciones", () => {
  /**
   * `arrancaAbierta` decide si la hoja ya está abierta al montar.
   *
   * Casi todas las pruebas la quieren abierta y les da igual quién la abrió. La
   * del foco NO: si la hoja se monta ya abierta, en ese momento nadie tiene el
   * foco y lo que la hoja captura como «quien la abrió» es el `body`. La versión
   * anterior de esa prueba montaba abierta y luego pulsaba el botón —que ya no
   * cambiaba nada— y después exigía que el foco volviera al botón; pasaba o
   * fallaba según si React remontaba el efecto, o sea a suertes.
   */
  function Anfitrion({ pide = false, arrancaAbierta = true }: { pide?: boolean; arrancaAbierta?: boolean }) {
    const [abierta, setAbierta] = useState(arrancaAbierta);
    const [confirmando, setConfirmando] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setAbierta(true)}>
          Abrir expediente
        </button>
        <HojaCentral
          abierta={abierta}
          onCerrar={() => setAbierta(false)}
          etiqueta="Expediente de prueba"
          ancho="ancha"
          pideConfirmacion={pide}
          onPedirConfirmacion={() => setConfirmando(true)}
          encabezado={<h2>Persona de prueba</h2>}
          pie={<button type="button">Guardar</button>}
        >
          <label>
            Observaciones
            <textarea aria-label="Observaciones del requisito" data-foco-inicial />
          </label>
          <button type="button">Revisar</button>
        </HojaCentral>
        {confirmando && <p role="alert">Hay cambios sin guardar</p>}
      </>
    );
  }

  it("es un diálogo modal con nombre accesible", () => {
    render(<Anfitrion />);
    const dialogo = screen.getByRole("dialog", { name: "Expediente de prueba" });
    expect(dialogo).toHaveAttribute("aria-modal", "true");
  });

  it("bloquea el scroll del fondo con el candado del módulo y lo libera al cerrar", async () => {
    const usuario = userEvent.setup();
    render(<Anfitrion />);
    // El candado de `lib/scrollLock` marca el `body`; nunca se toca
    // `document.body.style.overflow` a mano en una superficie nueva.
    expect(document.body.style.overflow).toBe("hidden");
    await usuario.keyboard("{Escape}");
    await waitFor(() => expect(document.body.style.overflow).toBe(""));
  });

  it("se cierra con Escape y devuelve el foco a quien la abrió", async () => {
    const usuario = userEvent.setup();
    // Cerrada al montar: la hoja se abre con el botón, que es quien tiene que
    // recuperar el foco. Ver el comentario de `Anfitrion`.
    render(<Anfitrion arrancaAbierta={false} />);
    const abrir = screen.getByRole("button", { name: "Abrir expediente" });
    await usuario.click(abrir);
    await screen.findByRole("dialog");

    await usuario.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    /* La devolución del foco ocurre en la limpieza del efecto, que con la
       animación de salida puede caer un fotograma después del desmontaje: se
       espera en lugar de asumir el orden. El plazo es generoso a propósito —con
       la suite entera en paralelo, «un fotograma» puede ser bastante más—. */
    await waitFor(() => expect(document.activeElement).toBe(abrir), { timeout: 6000 });
    /* El plazo de la prueba tiene que ser mayor que el de la espera: con 5 000 ms
       en los dos, quien saltaba primero era el temporizador de la prueba y el
       fallo se leía como «tiempo agotado» en lugar de «el foco no volvió». */
  }, 20000);

  it("el foco inicial va al campo marcado, no al botón de cerrar", async () => {
    render(<Anfitrion />);
    /* `querySelector` con una lista separada por comas devuelve el primer
       elemento en ORDEN DE DOCUMENTO, no el del primer selector: el botón de
       cerrar de la cabecera le robaba el foco al campo con `data-foco-inicial`.
       En un navegador real eso hacía perder los primeros caracteres. */
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Observaciones del requisito")), {
      timeout: 1000,
    });
  });

  it("con cambios sin guardar pide confirmación propia, no `window.confirm`", async () => {
    const usuario = userEvent.setup();
    const nativo = vi.spyOn(window, "confirm");
    render(<Anfitrion pide />);
    await usuario.keyboard("{Escape}");
    // La hoja sigue abierta y aparece la confirmación del módulo.
    expect(screen.getByRole("dialog", { name: "Expediente de prueba" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Hay cambios sin guardar");
    /* El diálogo nativo bloquea el hilo y el navegador permite silenciarlo; con
       eso silenciado, la superficie dejaba de poder cerrarse. */
    expect(nativo).not.toHaveBeenCalled();
  });

  it("no se cierra mientras hay una escritura en curso", async () => {
    const usuario = userEvent.setup();
    const cerrar = vi.fn();
    render(
      <HojaCentral abierta onCerrar={cerrar} etiqueta="Guardando" bloqueada encabezado={<h2>Guardando</h2>}>
        <p>contenido</p>
      </HojaCentral>,
    );
    await usuario.keyboard("{Escape}");
    expect(cerrar).not.toHaveBeenCalled();
    // Y el botón de cerrar está deshabilitado: cerrar a media escritura deja a
    // la persona sin saber si se guardó.
    expect(screen.getByRole("button", { name: "Cerrar" })).toBeDisabled();
  });

  it("se apila por debajo de la confirmación del sistema de diseño", () => {
    render(<Anfitrion />);
    const capa = screen.getByRole("dialog").parentElement!;
    const z = Number(/z-\[(\d+)\]/.exec(capa.className)?.[1] ?? "0");
    expect(z).toBeGreaterThan(Z.drawer);
    expect(z).toBeLessThan(Z.dialog);
  });

  it("se puede escribir una frase larga entera sin perder el foco", async () => {
    const usuario = userEvent.setup();
    render(<Anfitrion />);
    const campo = screen.getByLabelText("Observaciones del requisito");
    campo.focus();

    const frase =
      "El certificado llegó incompleto: falta el sello de la agencia y la firma del jefe, se solicitó de nuevo por correo el lunes.";
    await usuario.type(campo, frase);

    /* Es EL fallo del módulo: un efecto que dependía de una función creada en
       cada renderizado se remontaba en cada tecla, y su limpieza devolvía el
       foco al elemento anterior. Entraba UNA letra y el teclado parecía muerto. */
    expect((campo as HTMLTextAreaElement).value).toBe(frase);
    expect(document.activeElement).toBe(campo);
  });

  it("Tab cicla dentro de la hoja y no se escapa al fondo", async () => {
    const usuario = userEvent.setup();
    render(<Anfitrion />);
    const dialogo = screen.getByRole("dialog");
    const enfocables = dialogo.querySelectorAll<HTMLElement>("button, textarea");
    enfocables[enfocables.length - 1].focus();
    await usuario.tab();
    expect(dialogo.contains(document.activeElement)).toBe(true);
  });
});

describe("contador de hojas · solo donde el catálogo lo pide", () => {
  function Anfitrion({ inicial = 0, deshabilitado = false }: { inicial?: number; deshabilitado?: boolean }) {
    const [valor, setValor] = useState(inicial);
    return (
      <>
        <ContadorHojas valor={valor} onChange={setValor} nombreDocumento="REJAP" deshabilitado={deshabilitado} />
        <output data-testid="valor">{valor}</output>
      </>
    );
  }

  it("suma, resta y acepta escritura directa", async () => {
    const usuario = userEvent.setup();
    render(<Anfitrion />);
    const campo = screen.getByLabelText("Hojas del documento físico: REJAP");

    await usuario.click(screen.getByRole("button", { name: "Una hoja más en REJAP" }));
    expect(screen.getByTestId("valor").textContent).toBe("1");

    await usuario.clear(campo);
    await usuario.type(campo, "12");
    expect(screen.getByTestId("valor").textContent).toBe("12");

    await usuario.click(screen.getByRole("button", { name: "Una hoja menos en REJAP" }));
    expect(screen.getByTestId("valor").textContent).toBe("11");
  });

  it("las flechas mueven el valor y no baja de cero", async () => {
    const usuario = userEvent.setup();
    render(<Anfitrion inicial={1} />);
    const campo = screen.getByLabelText("Hojas del documento físico: REJAP");
    campo.focus();
    await usuario.keyboard("{ArrowUp}");
    expect(screen.getByTestId("valor").textContent).toBe("2");
    await usuario.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(screen.getByTestId("valor").textContent).toBe("0");
  });

  it("no es un control numérico nativo: la rueda no puede cambiar el valor", () => {
    render(<Anfitrion />);
    const campo = screen.getByLabelText("Hojas del documento físico: REJAP");
    /* `<input type="number">` cambia el valor al hacer scroll con el puntero
       encima: bajando por una lista de veinticinco requisitos, los conteos se
       modificaban por el camino sin que nadie lo pidiera. */
    expect(campo).toHaveAttribute("type", "text");
    expect(campo).toHaveAttribute("inputMode", "numeric");
  });

  it("descarta lo que no es una cifra antes de que salga del navegador", async () => {
    const usuario = userEvent.setup();
    render(<Anfitrion />);
    const campo = screen.getByLabelText("Hojas del documento físico: REJAP");
    await usuario.type(campo, "1a2-b");
    expect(screen.getByTestId("valor").textContent).toBe("12");
  });

  it("deshabilitado conserva el valor: revertir «no aplica» no obliga a contar otra vez", () => {
    render(<Anfitrion inicial={4} deshabilitado />);
    expect(screen.getByLabelText("Hojas del documento físico: REJAP")).toBeDisabled();
    expect(screen.getByTestId("valor").textContent).toBe("4");
  });

  it("el asterisco del área es un dato del catálogo, con su leyenda al pie", () => {
    const { container } = render(
      <>
        <SelloPresentacion fisica="CONDICIONAL" digital="SI" />
        <SelloPresentacion fisica="NO" digital="SI" />
        <LeyendaCondicional />
      </>,
    );
    // «SÍ*» de la lista del área = `presentacionFisica: 'CONDICIONAL'`. Aparece
    // dos veces: el sello del documento y el rótulo de la leyenda.
    expect(within(container).getAllByText("Física*")).toHaveLength(2);
    expect(within(container).getAllByText("Digital")).toHaveLength(2);
    // Un documento solo digital no muestra sello físico alguno.
    expect(within(container).queryByText("Física")).toBeNull();
    expect(container.textContent).toMatch(/el original en papel se pide solo/i);
  });
});
