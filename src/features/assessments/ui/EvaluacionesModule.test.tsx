import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, within, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EvaluacionesModule } from "./EvaluacionesModule";
import {
  __setAssessmentRepositoryForTests,
  __setProviderForTests,
  mockProvider,
} from "../../../infrastructure/providers";
import { resetMockData } from "../../../infrastructure/providers/mock";
import { assessmentListStore, emptyAssessmentFilters } from "./listState";
import { bootstrapPlugins } from "../question-types";
import { __setTalentPermissionsForTests, permissionsForRole } from "../../shared/permissions";
import { appError, err, ok } from "../../../shared/result";
import { emptyResultsSummary } from "../domain/attempts";
import { adminSessionState } from "../api/adminSessionState";
import type { AssessmentRepository } from "../../../infrastructure/repositories/contracts";

function mockMatchMedia() {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: false,
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
  __setProviderForTests(mockProvider);
  __setAssessmentRepositoryForTests(null);
  resetMockData();
  __setTalentPermissionsForTests({
    permissions: permissionsForRole("admin"),
    userName: "Reclutamiento",
  });
  assessmentListStore.set({
    search: "",
    filters: emptyAssessmentFilters(),
    view: "cards",
    sort: "recent",
  });
});
afterEach(() => {
  cleanup();
  adminSessionState.observe("active"); // deja el store limpio entre casos
  __setProviderForTests(null);
  __setAssessmentRepositoryForTests(null);
  __setTalentPermissionsForTests(null);
  vi.unstubAllGlobals();
});

/** Repositorio de prueba que solo implementa lo que cada caso necesita. */
function stubRepository(overrides: Partial<AssessmentRepository>): AssessmentRepository {
  const notCalled = async () => err(appError("provider", "no debería llamarse"));
  return {
    list: notCalled,
    get: notCalled,
    create: notCalled,
    updateDraft: notCalled,
    publish: notCalled,
    pause: notCalled,
    close: notCalled,
    archive: notCalled,
    restore: notCalled,
    duplicate: notCalled,
    rollback: notCalled,
    listResults: notCalled,
    getAttemptDetail: notCalled,
    ...overrides,
  } as AssessmentRepository;
}

describe("AssessmentOS module (component)", () => {
  it("lists seeded assessments with the safety disclaimer", async () => {
    render(<EvaluacionesModule />);
    expect(await screen.findByText(/Preselección · Analista de Riesgo/)).toBeInTheDocument();
    // The non-clinical disclaimer must be visible.
    expect(screen.getByText(/no son pruebas clínicas ni psicométricas validadas/i)).toBeInTheDocument();
  });

  it("shows the search affordance in Spanish", async () => {
    render(<EvaluacionesModule />);
    await screen.findByText(/Preselección · Analista de Riesgo/);
    expect(screen.getByPlaceholderText(/Buscar por nombre/i)).toBeInTheDocument();
  });
});

describe("listado de evaluaciones · estados", () => {
  it("muestra el origen de datos activo para no mezclar demo y real", async () => {
    render(<EvaluacionesModule />);
    await screen.findByText(/Preselección · Analista de Riesgo/);
    expect(screen.getByText(/Datos de demostración \(local\)/)).toBeInTheDocument();
    expect(screen.getByText(/Configura VITE_ASSESSMENTS_PROVIDER/)).toBeInTheDocument();
  });

  it("muestra estadísticas calculadas sobre datos reales", async () => {
    render(<EvaluacionesModule />);
    await screen.findByText(/Preselección · Analista de Riesgo/);
    const total = screen.getByText("Evaluaciones:").parentElement!;
    expect(within(total).getByText("3")).toBeInTheDocument();
  });

  it("muestra el estado vacío cuando no hay ninguna evaluación", async () => {
    __setAssessmentRepositoryForTests(
      stubRepository({
        list: async () => ok({ items: [], total: 0, syncedAt: new Date().toISOString() }),
      }),
    );
    render(<EvaluacionesModule />);
    expect(await screen.findByText(/Aún no hay evaluaciones/)).toBeInTheDocument();
  });

  it("muestra el error con reintento y vuelve a pedir los datos", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    __setAssessmentRepositoryForTests(
      stubRepository({
        list: async () => {
          attempts += 1;
          if (attempts === 1) return err(appError("network", "No se pudo conectar con el servidor."));
          return ok({ items: [], total: 0, syncedAt: new Date().toISOString() });
        },
      }),
    );
    render(<EvaluacionesModule />);
    expect(await screen.findByText(/No se pudo conectar con el servidor/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Reintentar/ }));
    expect(await screen.findByText(/Aún no hay evaluaciones/)).toBeInTheDocument();
    expect(attempts).toBeGreaterThanOrEqual(2);
  });

  it("filtra por búsqueda de nombre y de código público", async () => {
    const user = userEvent.setup();
    render(<EvaluacionesModule />);
    await screen.findByText(/Preselección · Analista de Riesgo/);
    await user.type(screen.getByPlaceholderText(/Buscar por nombre/i), "Liderazgo");
    await waitFor(() =>
      expect(screen.queryByText(/Preselección · Analista de Riesgo/)).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/Competencias de Liderazgo/)).toBeInTheDocument();
  });

  it("filtra por estado desde el panel de filtros", async () => {
    const user = userEvent.setup();
    render(<EvaluacionesModule />);
    await screen.findByText(/Preselección · Analista de Riesgo/);
    await user.click(screen.getByRole("button", { name: /^Filtros/ }));
    const panel = screen.getByRole("region", { name: /Filtros/ });
    const statusGroup = within(panel).getByRole("group", { name: "Estado" });
    await user.click(within(statusGroup).getByRole("button", { name: "Publicado" }));
    // Solo la evaluación publicada sigue visible.
    await waitFor(() =>
      expect(screen.queryByText(/Competencias de Liderazgo/)).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/Preselección · Analista de Riesgo/)).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: /Limpiar filtros/ }));
    expect(await screen.findByText(/Competencias de Liderazgo/)).toBeInTheDocument();
  });

  it("ordena por nombre", async () => {
    const user = userEvent.setup();
    render(<EvaluacionesModule />);
    await screen.findByText(/Preselección · Analista de Riesgo/);
    await user.selectOptions(screen.getByLabelText(/Orden/), "name");
    const titles = screen.getAllByRole("heading", { level: 3 }).map((node) => node.textContent);
    expect(titles).toEqual([...titles].sort((a, b) => String(a).localeCompare(String(b))));
  });

  it("cambia a la vista de tabla y muestra las columnas nuevas", async () => {
    const user = userEvent.setup();
    render(<EvaluacionesModule />);
    await screen.findByText(/Preselección · Analista de Riesgo/);
    await user.click(screen.getByRole("radio", { name: /Tabla/ }));
    const table = await screen.findByRole("table");
    expect(within(table).getByText("Preguntas")).toBeInTheDocument();
    expect(within(table).getByText("Duración")).toBeInTheDocument();
    expect(within(table).getByText("Última actualización")).toBeInTheDocument();
  });
});

describe("listado de evaluaciones · acciones", () => {
  it("crear abre el constructor con la evaluación nueva", async () => {
    const user = userEvent.setup();
    render(<EvaluacionesModule />);
    await screen.findByText(/Preselección · Analista de Riesgo/);
    await user.click(screen.getByRole("button", { name: /Nueva evaluación/ }));
    // El constructor sustituye al listado y ofrece guardar y publicar.
    expect(await screen.findByRole("button", { name: /Guardar borrador/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Configuración general/ })).toBeInTheDocument();
  });

  it("el menú de fila solo ofrece transiciones posibles para el estado", async () => {
    const user = userEvent.setup();
    render(<EvaluacionesModule />);
    await screen.findByText(/Preselección · Analista de Riesgo/);
    // Una evaluación publicada: puede pausarse y cerrarse, no volver a publicarse.
    await user.click(
      screen.getByRole("button", { name: /Más acciones: Preselección · Analista de Riesgo/ }),
    );
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /Ver evaluación publicada/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /^Pausar/ })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: /^Publicar/ })).not.toBeInTheDocument();
  });

  it("archivar pide confirmación explícita", async () => {
    const user = userEvent.setup();
    render(<EvaluacionesModule />);
    await screen.findByText(/Competencias de Liderazgo/);
    await user.click(screen.getByRole("button", { name: /Más acciones: Competencias de Liderazgo/ }));
    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: /^Archivar/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/¿Archivar esta evaluación\?/)).toBeInTheDocument();
    expect(within(dialog).getByText(/No se elimina ningún dato ni intento/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /^Archivar$/ }));
    // El efecto observable: la tarjeta pasa a estado «Archivado».
    expect((await screen.findAllByText("Archivado")).length).toBeGreaterThanOrEqual(1);
  });

  it("duplicar pide confirmación y abre la copia", async () => {
    const user = userEvent.setup();
    render(<EvaluacionesModule />);
    await screen.findByText(/Competencias de Liderazgo/);
    await user.click(screen.getByRole("button", { name: /Más acciones: Competencias de Liderazgo/ }));
    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: /^Duplicar/ }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: /^Duplicar$/ }));
    expect(await screen.findByText(/\(copia\)/)).toBeInTheDocument();
  });

  it("pide la frase de acceso cuando el servidor reclama sesión administrativa", async () => {
    const user = userEvent.setup();
    __setAssessmentRepositoryForTests(
      stubRepository({ list: async () => ok({ items: [seedSummary()], total: 1, syncedAt: "" }) }),
    );
    render(<EvaluacionesModule />);
    await screen.findByText(/Evaluación publicada de prueba/);

    // El transporte avisa de lo que respondió el backend intermedio.
    act(() => adminSessionState.observe("required"));

    const dialog = await screen.findByRole("dialog", {
      name: /Desbloquear la administración de evaluaciones/,
    });
    // El campo es de contraseña y no se guarda en ningún sitio del navegador.
    const passphrase = within(dialog).getByLabelText(/Frase de acceso del panel/);
    expect(passphrase).toHaveAttribute("type", "password");

    await user.click(within(dialog).getByRole("button", { name: /^Cancelar$/ }));
    expect(
      await screen.findByText(/La sesión administrativa expiró/),
    ).toBeInTheDocument();
  });

  it("el panel de resultados avisa cuando el proveedor no tiene intentos", async () => {
    const user = userEvent.setup();
    __setAssessmentRepositoryForTests(
      stubRepository({
        list: async () => ok({ items: [seedSummary()], total: 1, syncedAt: "" }),
        listResults: async () => ok({ attempts: [], summary: emptyResultsSummary() }),
      }),
    );
    render(<EvaluacionesModule />);
    await screen.findByText(/Evaluación publicada de prueba/);
    await user.click(screen.getByRole("button", { name: /Más acciones/ }));
    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: /Resultados/ }));
    expect(await screen.findByText(/Todavía no hay intentos registrados/)).toBeInTheDocument();
    expect(screen.getByText(/requieren el backend real de Apps Script/)).toBeInTheDocument();
  });
});

function seedSummary() {
  return {
    id: "asm_pub",
    code: "EVL-PUB-0001",
    name: "Evaluación publicada de prueba",
    category: "knowledge" as const,
    lifecycle: "published" as const,
    publication: "published" as const,
    versionLabel: "v1.0",
    questionCount: 4,
    estimatedDurationMinutes: 20,
    ownerId: "reclutador",
    linkedProcessCount: 0,
    tags: [],
    updatedAt: new Date().toISOString(),
    synchronizationStatus: "synced" as const,
  };
}
