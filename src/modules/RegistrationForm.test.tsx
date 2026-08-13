import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RegistrationForm } from "./RegistrationForm";
import { normaliseCandidate } from "../lib/candidates";
import type { Candidate, RawCandidate } from "../types";

/**
 * Regresión del cuestionario de registro.
 *
 * El fallo que motivó estas pruebas: pulsar Intro mientras se llenaba la sección
 * «A · Conocimientos, Herramientas y Competencias» enviaba el formulario (envío
 * implícito de HTML), la ficha se guardaba a medio llenar y el cuestionario se
 * vaciaba. Y en modo edición, el refresco periódico de la base sobreescribía lo
 * que el analista estaba escribiendo. Las dos cosas se comprueban aquí.
 */

const submitCandidate = vi.fn(async (_candidate: RawCandidate) => ({ ok: true, message: "ok" }));
const updateCandidate = vi.fn(async (_candidate: RawCandidate) => ({ ok: true, message: "ok" }));
/** Base visible para el formulario (se rellena en las pruebas que la necesitan). */
let baseCandidatos: Candidate[] = [];

vi.mock("../context/TalentDataContext", () => ({
  useTalentData: () => ({
    candidatos: baseCandidatos,
    duplicados: [],
    competencias: ["Trabajo en Equipo,Sí,Sí,Sí,\"Colabora\""],
    arquetipos: [{ code: "D", label: "Impulsor (D)", description: "Acción" }],
    auxiliares: {
      cargos_bdp: ["Analista de Riesgo Crediticio"],
      gerencias_bdp: [],
      agencias_bdp: [],
      modalidad_reclutamiento: [],
      estado_proceso: [],
    },
    perfiles: [],
    perfilesCargo: [],
    espejoBase: [],
    espejoUltimo: [],
    status: "success",
    loading: false,
    syncing: false,
    lastSyncedAt: null,
    error: null,
    refetch: vi.fn(),
    submitCandidate,
    updateCandidate,
    submitPerfilCargo: vi.fn(),
    updatePerfilCargo: vi.fn(),
    deletePerfilCargo: vi.fn(),
  }),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  window.localStorage.clear();
  baseCandidatos = [];
  submitCandidate.mockClear();
  submitCandidate.mockResolvedValue({ ok: true, message: "ok" });
  updateCandidate.mockClear();
  updateCandidate.mockResolvedValue({ ok: true, message: "ok" });
  globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
});

afterEach(() => {
  window.localStorage.clear();
});

function candidate(partial: RawCandidate): Candidate {
  return normaliseCandidate(partial, 0);
}

async function fillIdentificador(user: ReturnType<typeof userEvent.setup>, value: string) {
  const field = screen.getByLabelText(/Identificador Único/i);
  await user.click(field);
  await user.type(field, value);
  return field;
}

describe("RegistrationForm · envío accidental", () => {
  it("no registra al postulante al pulsar Intro en un campo de texto", async () => {
    const user = userEvent.setup();
    render(<RegistrationForm open onClose={vi.fn()} />);

    await fillIdentificador(user, "5033853-163-2026");
    const nombres = screen.getByLabelText(/^Nombres$/i);
    await user.click(nombres);
    await user.type(nombres, "María Fernanda{Enter}");

    expect(submitCandidate).not.toHaveBeenCalled();
    // Y sobre todo: el avance sigue ahí.
    expect(nombres).toHaveValue("María Fernanda");
    expect(screen.getByLabelText(/Identificador Único/i)).toHaveValue("5033853-163-2026");
  });

  it("no registra al pulsar Intro dentro de un conocimiento técnico", async () => {
    const user = userEvent.setup();
    render(<RegistrationForm open onClose={vi.fn()} />);

    await fillIdentificador(user, "7712004-163-2026");
    await user.click(screen.getAllByRole("button", { name: /Agregar/i })[0]);

    const nombre = screen.getByPlaceholderText(/Nombre del Conocimiento Técnico/i);
    await user.type(nombre, "Auditoría interna{Enter}");
    // El nivel es un <select>: pulsar Intro ahí también enviaba el formulario.
    const fila = nombre.closest("div") as HTMLElement;
    const nivel = fila.querySelector("select") as HTMLSelectElement;
    await user.selectOptions(nivel, "Alto");
    await user.click(nivel);
    await user.keyboard("{Enter}");

    expect(submitCandidate).not.toHaveBeenCalled();
    expect(nombre).toHaveValue("Auditoría interna");
  });

  it("registra cuando se pulsa el botón «Registrar Postulante»", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RegistrationForm open onClose={onClose} />);

    await fillIdentificador(user, "9120487-163-2026");
    await user.click(screen.getByRole("button", { name: /Registrar Postulante/i }));

    await waitFor(() => expect(submitCandidate).toHaveBeenCalledTimes(1));
    expect(submitCandidate.mock.calls[0][0]).toMatchObject({
      identificador: "9120487-163-2026",
    });
  });

  it("registra con el atajo Ctrl+Intro", async () => {
    const user = userEvent.setup();
    render(<RegistrationForm open onClose={vi.fn()} />);

    const field = await fillIdentificador(user, "4488210-163-2026");
    await user.click(field);
    await user.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => expect(submitCandidate).toHaveBeenCalledTimes(1));
  });

  it("avisa cuando falta el identificador y no llama al backend", async () => {
    const user = userEvent.setup();
    render(<RegistrationForm open onClose={vi.fn()} />);

    const nombres = screen.getByLabelText(/^Nombres$/i);
    await user.type(nombres, "Sin identificador");
    await user.click(screen.getByRole("button", { name: /Registrar Postulante/i }));

    expect(submitCandidate).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/El Identificador Único es el único campo obligatorio/i),
    ).toBeInTheDocument();
  });
});

describe("RegistrationForm · edición", () => {
  const base = candidate({
    identificador: "5033853-163-2026",
    nombres: "María Fernanda",
    apellido_paterno: "Quispe",
    nota_cap: 88,
  });

  it("no pierde lo editado cuando la base se refresca en segundo plano", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <RegistrationForm open onClose={vi.fn()} editing={base} />,
    );

    const carrera = screen.getByLabelText(/Carrera/i);
    await user.type(carrera, "Ingeniería Comercial");
    expect(carrera).toHaveValue("Ingeniería Comercial");

    // Un refresco de la base produce un objeto nuevo con los mismos datos: es
    // exactamente lo que borraba el trabajo del analista cada 60 segundos.
    rerender(
      <RegistrationForm
        open
        onClose={vi.fn()}
        editing={candidate({
          identificador: "5033853-163-2026",
          nombres: "María Fernanda",
          apellido_paterno: "Quispe",
          nota_cap: 88,
        })}
      />,
    );

    expect(screen.getByLabelText(/Carrera/i)).toHaveValue("Ingeniería Comercial");
  });

  it("sí recarga el formulario cuando se pasa a editar otro postulante", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <RegistrationForm open onClose={vi.fn()} editing={base} />,
    );

    await user.type(screen.getByLabelText(/Carrera/i), "Ingeniería Comercial");

    rerender(
      <RegistrationForm
        open
        onClose={vi.fn()}
        editing={candidate({
          identificador: "7712004-163-2026",
          nombres: "Jorge Luis",
          apellido_paterno: "Mamani",
          carrera: "Auditoría Financiera",
        })}
      />,
    );

    expect(screen.getByLabelText(/Carrera/i)).toHaveValue("Auditoría Financiera");
    expect(screen.getByLabelText(/Identificador Único/i)).toHaveValue("7712004-163-2026");
  });

  it("no deja guardar mientras no haya cambios y guarda en cuanto los hay", async () => {
    const user = userEvent.setup();
    render(<RegistrationForm open onClose={vi.fn()} editing={base} />);

    const guardar = screen.getByRole("button", { name: /Guardar Cambios/i });
    expect(guardar).toBeDisabled();

    await user.type(screen.getByLabelText(/Localidad de Residencia/i), "El Alto");
    expect(guardar).toBeEnabled();

    await user.click(guardar);
    await waitFor(() => expect(updateCandidate).toHaveBeenCalledTimes(1));
    expect(updateCandidate.mock.calls[0][0]).toMatchObject({
      identificador: "5033853-163-2026",
      localidad_residencia: "El Alto",
    });
  });
});

/**
 * Guardado honesto.
 *
 * Dos caras del mismo fallo: el identificador es la clave de la fila en la hoja,
 * así que registrar uno existente no crea nada (o crea una fila gemela que rompe
 * la identidad de la ficha); y cuando el servidor rechaza, el cuestionario tiene
 * que quedarse abierto con todo lo escrito en lugar de cerrarse cantando éxito.
 */
describe("RegistrationForm · guardado honesto", () => {
  it("no envía nada si el identificador ya está en la base", async () => {
    baseCandidatos = [
      candidate({
        identificador: "5033853-163-2026",
        nombres: "María Fernanda",
        apellido_paterno: "Quispe",
      }),
    ];
    const user = userEvent.setup();
    render(<RegistrationForm open onClose={vi.fn()} />);

    await fillIdentificador(user, "5033853-163-2026");
    await user.click(screen.getByRole("button", { name: /Registrar Postulante/i }));

    expect(submitCandidate).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Editar/i);
  });

  it("mantiene el cuestionario abierto y con los datos cuando el servidor rechaza", async () => {
    submitCandidate.mockResolvedValue({
      ok: false,
      message: "El servidor rechazó la operación. El registro no se guardó.",
    });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<RegistrationForm open onClose={onClose} />);

    await fillIdentificador(user, "9120487-163-2026");
    const nombres = screen.getByLabelText(/^Nombres$/i);
    await user.type(nombres, "Ana Lucía");
    await user.click(screen.getByRole("button", { name: /Registrar Postulante/i }));

    await waitFor(() => expect(submitCandidate).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/no se guardó/i);
    // Lo escrito sigue en pantalla: se puede reintentar sin volver a teclear.
    expect(screen.getByLabelText(/^Nombres$/i)).toHaveValue("Ana Lucía");
    expect(screen.getByLabelText(/Identificador Único/i)).toHaveValue("9120487-163-2026");
  });

  it("se niega a editar una ficha cuyo identificador está duplicado en la hoja", async () => {
    const duplicada = candidate({
      identificador: "5033853-163-2026",
      nombres: "María Fernanda",
      apellido_paterno: "Quispe",
    });
    duplicada.identificadorDuplicado = true;
    const user = userEvent.setup();
    render(<RegistrationForm open onClose={vi.fn()} editing={duplicada} />);

    await user.type(screen.getByLabelText(/Carrera/i), "Ingeniería Comercial");
    await user.click(screen.getByRole("button", { name: /Guardar Cambios/i }));

    expect(updateCandidate).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/más de una vez/i);
  });
});
