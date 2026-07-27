import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssessmentBuilder } from "./AssessmentBuilder";
import { bootstrapPlugins } from "../question-types";
import { makeOption } from "../question-types/helpers";
import { assessmentContentSchema, type AssessmentDefinition } from "../domain/assessment";
import { assessmentBlockSchema, assessmentSectionSchema } from "../domain/questions";
import { createAssessment } from "../domain/factory";
import { permissionsForRole } from "../../shared/permissions";
import type { SaveOutcome } from "./useAssessmentDraft";

/**
 * Pruebas de interacción del constructor.
 *
 * Cubren lo que el usuario percibe: estados de guardado, navegación entre pasos,
 * el índice de preguntas, la corrección de errores desde la revisión, la vista
 * previa sin claves de respuesta, el teclado, ambos temas y `reduced motion`.
 *
 * `window.matchMedia` no existe en jsdom: se simula para poder controlar el tema
 * y la preferencia de movimiento reducido.
 */

const permissions = permissionsForRole("admin");
let consoleErrors: string[] = [];

function mockMatchMedia(reduceMotion = false) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: query.includes("prefers-reduced-motion") ? reduceMotion : false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}

beforeEach(() => {
  bootstrapPlugins();
  mockMatchMedia();
  window.localStorage.clear();
  consoleErrors = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    consoleErrors.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function assessmentWith(options: { questions: number; valid?: boolean; title?: string }): AssessmentDefinition {
  const blocks = [];
  for (let i = 1; i <= options.questions; i++) {
    blocks.push(
      assessmentBlockSchema.parse({
        id: `blk_${i}`,
        type: "q_single_choice",
        order: i - 1,
        label: `Pregunta ${i}`,
        required: true,
        options: [
          makeOption({ id: `opt_${i}a`, label: "Correcta", value: "a", correct: options.valid !== false }),
          makeOption({ id: `opt_${i}b`, label: "Otra", value: "b" }),
        ],
        score: { mode: "exact", points: 1 },
      }),
    );
  }
  const content = assessmentContentSchema.parse({
    sections: [assessmentSectionSchema.parse({ id: "sec_1", title: "Sección 1", order: 0, blocks })],
    publicInstructions: "Lee con atención.",
  });
  return createAssessment({
    name: options.title ?? "Evaluación de prueba",
    createdBy: "reclutador",
    content,
  });
}

function renderBuilder(
  assessment: AssessmentDefinition,
  handlers: {
    onSave?: (next: AssessmentDefinition) => Promise<SaveOutcome>;
    onPublish?: (next: AssessmentDefinition, notes: string) => Promise<{ ok: boolean; issues: [] }>;
    onBack?: () => void;
  } = {},
) {
  const onSave = handlers.onSave ?? vi.fn(async () => "saved" as SaveOutcome);
  const onPublish = handlers.onPublish ?? vi.fn(async () => ({ ok: true, issues: [] as [] }));
  const onBack = handlers.onBack ?? vi.fn();
  const result = render(
    <AssessmentBuilder
      assessment={assessment}
      permissions={permissions}
      onBack={onBack}
      onSave={onSave}
      onPublish={onPublish}
    />,
  );
  return { ...result, onSave, onPublish, onBack };
}

describe("constructor · encabezado y estado de guardado", () => {
  it("muestra el título, el código, la versión y el estado sin cambios pendientes", () => {
    renderBuilder(assessmentWith({ questions: 2 }));
    expect(screen.getByText("Evaluación de prueba")).toBeInTheDocument();
    expect(screen.getByText(/Sin cambios pendientes/)).toBeInTheDocument();
    expect(screen.getByText(/v1\.0/)).toBeInTheDocument();
  });

  it("pasa a «Cambios sin guardar» al editar y a «Guardado» tras guardar", async () => {
    const user = userEvent.setup();
    const { onSave } = renderBuilder(assessmentWith({ questions: 1 }));

    await user.click(screen.getByRole("button", { name: /Configuración general/ }));
    const title = screen.getByLabelText(/^Título/);
    await user.type(title, " ampliada");
    expect(await screen.findByText(/Cambios sin guardar/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Guardar borrador/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/^Guardado$/)).toBeInTheDocument();
  });

  it("el botón de guardar está deshabilitado sin cambios pendientes", () => {
    renderBuilder(assessmentWith({ questions: 1 }));
    expect(screen.getByRole("button", { name: /Guardar borrador/ })).toBeDisabled();
  });

  it("un guardado en conflicto se anuncia y ofrece reintentar", async () => {
    const user = userEvent.setup();
    renderBuilder(assessmentWith({ questions: 1 }), {
      onSave: vi.fn(async () => "conflict" as SaveOutcome),
    });
    await user.click(screen.getByRole("button", { name: /Configuración general/ }));
    await user.type(screen.getByLabelText(/^Título/), "x");
    await user.click(screen.getByRole("button", { name: /Guardar borrador/ }));
    expect(await screen.findByText(/Conflicto de versión/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reintentar guardado/ })).toBeInTheDocument();
  });

  it("el estado de guardado se anuncia a los lectores de pantalla", () => {
    renderBuilder(assessmentWith({ questions: 1 }));
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("pide confirmación antes de salir con cambios pendientes", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    renderBuilder(assessmentWith({ questions: 1 }), { onBack });

    await user.click(screen.getByRole("button", { name: /Volver/ }));
    expect(onBack).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /Configuración general/ }));
    await user.type(screen.getByLabelText(/^Título/), "x");
    await user.click(screen.getByRole("button", { name: /Volver/ }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/¿Salir sin guardar\?/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Salir sin guardar/ }));
    expect(onBack).toHaveBeenCalledTimes(2);
  });
});

describe("constructor · configuración editable", () => {
  it("permite editar título, duración y nota mínima (antes no era posible)", async () => {
    const user = userEvent.setup();
    renderBuilder(assessmentWith({ questions: 1 }));

    await user.click(screen.getByRole("button", { name: /Configuración general/ }));
    const title = screen.getByLabelText(/^Título/) as HTMLInputElement;
    await user.clear(title);
    await user.type(title, "Prueba técnica de riesgo");
    expect(title.value).toBe("Prueba técnica de riesgo");

    await user.click(screen.getByRole("button", { name: /Configuración de evaluación/ }));
    const duration = screen.getByLabelText(/Duración \(minutos\)/) as HTMLInputElement;
    await user.type(duration, "25");
    expect(duration.value).toBe("25");

    const passing = screen.getByLabelText(/Nota mínima/) as HTMLInputElement;
    await user.type(passing, "70");
    expect(passing.value).toBe("70");
  });

  it("ofrece usar la duración estimada por el sistema", async () => {
    const user = userEvent.setup();
    renderBuilder(assessmentWith({ questions: 3 }));
    await user.click(screen.getByRole("button", { name: /Configuración de evaluación/ }));
    const duration = screen.getByLabelText(/Duración \(minutos\)/) as HTMLInputElement;
    expect(duration.value).toBe("");
    await user.click(screen.getByRole("button", { name: /Usar la estimación/ }));
    expect(Number(duration.value)).toBeGreaterThan(0);
  });
});

describe("constructor · índice y edición de preguntas", () => {
  it("lista las preguntas numeradas con su tipo y validez", () => {
    renderBuilder(assessmentWith({ questions: 3 }));
    const navigator = screen.getByRole("searchbox", { name: /Buscar en las preguntas/ });
    expect(navigator).toBeInTheDocument();
    expect(screen.getAllByText("Opción única").length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByLabelText("Completa").length).toBeGreaterThanOrEqual(3);
  });

  it("marca como incompleta una pregunta sin respuesta correcta", () => {
    renderBuilder(assessmentWith({ questions: 2, valid: false }));
    expect(screen.getAllByLabelText("Incompleta").length).toBe(2);
  });

  it("filtra el índice con el buscador", async () => {
    const user = userEvent.setup();
    renderBuilder(assessmentWith({ questions: 12 }));
    const search = screen.getByRole("searchbox", { name: /Buscar en las preguntas/ });
    await user.type(search, "Pregunta 7");
    const items = screen.getAllByRole("button", { name: /Pregunta 7/ });
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole("button", { name: /^Pregunta 3/ })).not.toBeInTheDocument();
  });

  it("selecciona una pregunta y muestra su editor con opciones", async () => {
    const user = userEvent.setup();
    renderBuilder(assessmentWith({ questions: 3 }));
    await user.click(screen.getAllByRole("button", { name: /Pregunta 2/ })[0]);
    expect(screen.getByLabelText(/^Enunciado/)).toHaveValue("Pregunta 2");
    expect(screen.getByText(/Opciones de respuesta/)).toBeInTheDocument();
    expect(screen.getByText(/Marca exactamente una respuesta correcta/)).toBeInTheDocument();
  });

  it("marcar una opción correcta desmarca la otra (respuesta única)", async () => {
    const user = userEvent.setup();
    renderBuilder(assessmentWith({ questions: 1 }));
    await user.click(screen.getAllByRole("button", { name: /Pregunta 1/ })[0]);
    const radios = screen.getAllByRole("radio", { name: /Respuesta correcta/ });
    expect(radios).toHaveLength(2);
    expect(radios[0]).toBeChecked();
    await user.click(radios[1]);
    expect(radios[1]).toBeChecked();
    expect(radios[0]).not.toBeChecked();
  });

  it("reordena preguntas con los botones accesibles", async () => {
    const user = userEvent.setup();
    renderBuilder(assessmentWith({ questions: 3 }));
    await user.click(screen.getByRole("button", { name: /Mover abajo: Pregunta 1/ }));
    const navigatorButtons = screen.getAllByRole("button", { name: /Pregunta \d/ });
    // La primera entrada del índice ya no es «Pregunta 1».
    expect(navigatorButtons[0]).toHaveAccessibleName(/Pregunta 2/);
  });

  it("permite contraer y volver a mostrar el índice", async () => {
    const user = userEvent.setup();
    renderBuilder(assessmentWith({ questions: 2 }));
    await user.click(screen.getByRole("button", { name: /Contraer el índice/ }));
    expect(screen.queryByRole("searchbox", { name: /Buscar en las preguntas/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Mostrar el índice/ }));
    expect(screen.getByRole("searchbox", { name: /Buscar en las preguntas/ })).toBeInTheDocument();
  });

  it("es navegable con el teclado desde el encabezado hasta el índice", async () => {
    const user = userEvent.setup();
    renderBuilder(assessmentWith({ questions: 2 }));
    await user.tab();
    expect(document.activeElement).toHaveAccessibleName(/Volver/);
    // El resto de la cadena de tabulación llega a elementos enfocables reales.
    for (let i = 0; i < 8; i++) await user.tab();
    expect(document.activeElement).not.toBe(document.body);
  });
});

describe("constructor · revisión y publicación", () => {
  it("cuenta los errores bloqueantes en la navegación", () => {
    renderBuilder(assessmentWith({ questions: 2, valid: false, title: "Nueva evaluación" }));
    const review = screen.getByRole("button", { name: /^Revisión/ });
    // Dos preguntas sin correcta + título por omisión.
    expect(within(review).getByText("3")).toBeInTheDocument();
  });

  it("lleva del hallazgo al campo exacto que hay que corregir", async () => {
    const user = userEvent.setup();
    renderBuilder(assessmentWith({ questions: 1, valid: false }));
    await user.click(screen.getByRole("button", { name: /^Revisión/ }));
    expect(screen.getByText(/Errores bloqueantes/)).toBeInTheDocument();
    const finding = screen.getByText(/no tiene una respuesta correcta marcada/);
    await user.click(finding);
    // Vuelve al paso de preguntas con la pregunta abierta y las opciones marcadas.
    expect(screen.getByLabelText(/^Enunciado/)).toHaveValue("Pregunta 1");
    expect(screen.getByText(/Opciones de respuesta/)).toBeInTheDocument();
  });

  it("no publica con errores: envía a la revisión", async () => {
    const user = userEvent.setup();
    const { onPublish } = renderBuilder(assessmentWith({ questions: 1, valid: false }));
    await user.click(screen.getByRole("button", { name: /^Publicar$/ }));
    expect(onPublish).not.toHaveBeenCalled();
    expect(await screen.findByText(/Errores bloqueantes/)).toBeInTheDocument();
  });

  it("publica una evaluación válida tras confirmar", async () => {
    const user = userEvent.setup();
    const { onPublish } = renderBuilder(assessmentWith({ questions: 2 }));
    await user.click(screen.getByRole("button", { name: /^Publicar$/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/Se creará la versión v1\.0/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /^Publicar$/ }));
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it("muestra los hallazgos que devuelve el servidor al rechazar la publicación", async () => {
    const user = userEvent.setup();
    renderBuilder(assessmentWith({ questions: 2 }), {
      onPublish: vi.fn(async () => ({
        ok: false,
        issues: [
          { code: "MISSING_TITLE", message: "El servidor exige un título." },
        ] as unknown as [],
      })),
    });
    await user.click(screen.getByRole("button", { name: /^Publicar$/ }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: /^Publicar$/ }));
    expect(await screen.findByText(/El servidor rechazó la publicación/)).toBeInTheDocument();
    expect(screen.getByText(/El servidor exige un título/)).toBeInTheDocument();
  });

  it("el resumen de revisión no inventa datos", async () => {
    const user = userEvent.setup();
    renderBuilder(assessmentWith({ questions: 3 }));
    await user.click(screen.getByRole("button", { name: /^Revisión/ }));
    const summary = screen.getByText(/Resumen de la evaluación/).closest("aside")!;
    expect(within(summary).getByText("Sin límite de tiempo")).toBeInTheDocument();
    expect(within(summary).getByText("Sin nota mínima")).toBeInTheDocument();
  });
});

describe("constructor · vista previa del candidato", () => {
  it("no revela las respuestas correctas en el modo candidato", async () => {
    const user = userEvent.setup();
    renderBuilder(assessmentWith({ questions: 2 }));
    await user.click(screen.getByRole("button", { name: /^Vista previa$/ }));
    const dialog = await screen.findByRole("dialog", { name: /Vista previa del candidato/ });
    expect(
      within(dialog).getByText(/No crea un intento ni guarda respuestas/),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText("correcta")).not.toBeInTheDocument();
  });

  it("el modo administrativo sí muestra la clave, avisando de que no es pública", async () => {
    const user = userEvent.setup();
    renderBuilder(assessmentWith({ questions: 1 }));
    await user.click(screen.getByRole("button", { name: /^Vista previa$/ }));
    const dialog = await screen.findByRole("dialog", { name: /Vista previa del candidato/ });
    await user.click(within(dialog).getByRole("button", { name: /Mostrar respuestas correctas/ }));
    expect(within(dialog).getByText(/nunca forman parte del DTO público/)).toBeInTheDocument();
    expect(within(dialog).getAllByText("correcta").length).toBeGreaterThanOrEqual(1);
  });

  it("permite simular escritorio, tableta y móvil", async () => {
    const user = userEvent.setup();
    renderBuilder(assessmentWith({ questions: 1 }));
    await user.click(screen.getByRole("button", { name: /^Vista previa$/ }));
    const dialog = await screen.findByRole("dialog", { name: /Vista previa del candidato/ });
    for (const device of ["Escritorio", "Tableta", "Móvil"]) {
      const button = within(dialog).getByRole("button", { name: device });
      await user.click(button);
      expect(button).toHaveAttribute("aria-pressed", "true");
    }
  });
});

describe("constructor · temas, movimiento y rendimiento", () => {
  it("renderiza en tema claro y en tema oscuro sin errores", () => {
    for (const theme of ["light", "dark"]) {
      document.documentElement.className = theme;
      const { unmount } = renderBuilder(assessmentWith({ questions: 2 }));
      expect(screen.getByText("Evaluación de prueba")).toBeInTheDocument();
      unmount();
    }
    document.documentElement.className = "";
    expect(consoleErrors).toEqual([]);
  });

  it("funciona con prefers-reduced-motion activo", async () => {
    mockMatchMedia(true);
    const user = userEvent.setup();
    renderBuilder(assessmentWith({ questions: 2 }));
    await user.click(screen.getByRole("button", { name: /^Revisión/ }));
    expect(screen.getByText(/Revisión previa a la publicación/)).toBeInTheDocument();
    expect(consoleErrors).toEqual([]);
  });

  it("abre una evaluación extensa sin montar todos los editores", () => {
    renderBuilder(assessmentWith({ questions: 150 }));
    // El índice lista las 150; el área de edición no monta ningún editor hasta
    // que se selecciona una pregunta.
    expect(screen.getAllByLabelText("Completa").length).toBe(150);
    expect(screen.queryByLabelText(/^Enunciado/)).not.toBeInTheDocument();
    expect(consoleErrors).toEqual([]);
  });

  it("no deja errores de consola en el flujo completo", async () => {
    const user = userEvent.setup();
    renderBuilder(assessmentWith({ questions: 3 }));
    await user.click(screen.getByRole("button", { name: /Configuración general/ }));
    await user.click(screen.getByRole("button", { name: /Preguntas/ }));
    await user.click(screen.getAllByRole("button", { name: /Pregunta 1/ })[0]);
    await user.click(screen.getByRole("button", { name: /Configuración de evaluación/ }));
    await user.click(screen.getByRole("button", { name: /^Revisión/ }));
    expect(consoleErrors).toEqual([]);
  });
});

describe("constructor · recuperación de borrador local", () => {
  it("ofrece recuperar un borrador guardado localmente y lo aplica", async () => {
    const assessment = assessmentWith({ questions: 1 });
    window.localStorage.setItem(
      `bdp-assessment-draft:${assessment.id}`,
      JSON.stringify({
        assessmentId: assessment.id,
        entityVersion: assessment.entityVersion,
        savedAt: Date.now(),
        meta: {
          name: "Título recuperado",
          description: "",
          purpose: "",
          category: "knowledge",
          tags: [],
          durationMinutes: 0,
          passingScore: null,
        },
        content: assessment.draftVersion.content,
      }),
    );
    const user = userEvent.setup();
    renderBuilder(assessment);
    expect(screen.getByText(/Se recuperó un borrador local sin guardar/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Recuperar$/ }));
    expect(await screen.findByText("Título recuperado")).toBeInTheDocument();
  });

  it("permite descartar el borrador recuperado", async () => {
    const assessment = assessmentWith({ questions: 1 });
    window.localStorage.setItem(
      `bdp-assessment-draft:${assessment.id}`,
      JSON.stringify({
        assessmentId: assessment.id,
        entityVersion: assessment.entityVersion,
        savedAt: Date.now(),
        meta: {
          name: "Descartable",
          description: "",
          purpose: "",
          category: "knowledge",
          tags: [],
          durationMinutes: 0,
          passingScore: null,
        },
        content: assessment.draftVersion.content,
      }),
    );
    const user = userEvent.setup();
    renderBuilder(assessment);
    await user.click(screen.getByRole("button", { name: /^Descartar$/ }));
    expect(screen.queryByText(/Se recuperó un borrador local/)).not.toBeInTheDocument();
    expect(window.localStorage.getItem(`bdp-assessment-draft:${assessment.id}`)).toBeNull();
  });
});
