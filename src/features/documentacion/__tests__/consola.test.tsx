import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DocumentacionConsola } from "../ui/DocumentacionConsola";
import { __reiniciarClienteParaPruebas, configurarCliente } from "../api/client";
import { irASeccion, limpiarFiltros } from "../state/consola";
import { crearExpediente, loadInstalledBackend, type DocHarness } from "../../../../scripts/documentacion-backend.mjs";

/**
 * La consola, contra el backend de verdad.
 *
 * ── Qué hace esta prueba y por qué importa ──────────────────────────────────
 * Monta el módulo entero y redirige su `fetch` al `doPost` del backend cargado en
 * memoria. No hay dobles de datos: la pantalla pide al backend real, el backend
 * real lee su libro simulado y devuelve lo que haya. Es lo que permite afirmar que
 * el frontend y el backend hablan el mismo idioma, que era exactamente el punto
 * ciego de la versión anterior.
 *
 * Se comprueba lo que un usuario ve y hace: que el panel muestre las cifras del
 * libro, que la lista traiga los expedientes, que el buscador filtre en el
 * servidor, que el menú oculte lo que el rol no puede y que abrir un expediente
 * cargue sus requisitos.
 */

const URL_PRUEBAS = "https://script.google.com/macros/s/pruebas/exec";

/**
 * La tabla adaptable pinta la misma información dos veces —tabla para escritorio y
 * tarjetas para móvil— y el CSS esconde una. jsdom no aplica CSS, así que las
 * consultas se acotan a la tabla para no encontrar duplicados.
 */
async function enLaTabla() {
  return within(await screen.findByRole("table", {}, { timeout: 12000 }));
}

function enchufar(harness: DocHarness) {
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const cuerpo = JSON.parse(String(init.body));
    const salida = harness.call<{ getContent(): string }>("doPost", { postData: { contents: JSON.stringify(cuerpo) } });
    const texto = salida.getContent();
    return { ok: true, status: 200, text: async () => texto } as unknown as Response;
  });
}

describe("consola de Documentación · integración con el backend", () => {
  let harness: DocHarness;

  beforeEach(() => {
    window.localStorage.clear();
    // El estado de la consola vive en un módulo y sobrevive entre pruebas —igual
    // que sobrevive a un recargado de la página, que es lo que se quiere en
    // producción—. Aquí se reinicia para que cada prueba empiece limpia.
    limpiarFiltros();
    irASeccion("panel");
    __reiniciarClienteParaPruebas();
    harness = loadInstalledBackend();
    configurarCliente({ url: URL_PRUEBAS });
    enchufar(harness);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __reiniciarClienteParaPruebas();
    window.localStorage.clear();
  });

  it("se conecta al abrir y muestra el libro y el rol", async () => {
    render(<DocumentacionConsola />);
    // El indicador de conexión dice el nombre del libro cuando responde.
    await waitFor(() => expect(screen.getByText(/Conectado/)).toBeInTheDocument());
    expect(screen.getByRole("navigation", { name: /Secciones del módulo/i })).toBeInTheDocument();
  });

  it("el panel muestra las cifras que hay en el libro, no valores fijos", async () => {
    const uno = crearExpediente(harness, { identificador: "CI-UI1-2026", nombre: "Ana Panel", agencia: "LA PAZ" });
    harness.ok("documentacion.requisitos.guardar", {
      expedienteId: uno.expedienteId,
      cambios: uno.requisitos.map((r: { expedienteDocumentoId: string; obligatorio: boolean }) => ({
        expedienteDocumentoId: r.expedienteDocumentoId,
        estado: r.obligatorio ? "ENTREGADO" : "NO_APLICA",
      })),
    });
    crearExpediente(harness, { identificador: "CI-UI2-2026", nombre: "Bruno Panel", agencia: "EL ALTO" });

    render(<DocumentacionConsola />);

    await waitFor(() => expect(screen.getByText("Expedientes activos")).toBeInTheDocument());
    const activos = screen.getByText("Expedientes activos").closest("button")!;
    expect(within(activos).getByText("2")).toBeInTheDocument();

    const completos = screen.getByText("Completos").closest("button")!;
    expect(within(completos).getByText("1")).toBeInTheDocument();

    // El desglose por agencia sale de los expedientes reales.
    expect(screen.getByText("LA PAZ")).toBeInTheDocument();
    expect(screen.getByText("EL ALTO")).toBeInTheDocument();
  });

  it("la lista de expedientes trae los datos y el buscador filtra en el servidor", async () => {
    crearExpediente(harness, { identificador: "CI-BUS1-2026", nombre: "Iván Muñoz" });
    crearExpediente(harness, { identificador: "CI-BUS2-2026", nombre: "Ana Pérez" });

    render(<DocumentacionConsola />);
    await waitFor(() => expect(screen.getByText(/Conectado/)).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Expedientes" }));
    let tabla = await enLaTabla();
    await waitFor(() => expect(tabla.getByText("Iván Muñoz")).toBeInTheDocument());
    expect(tabla.getByText("Ana Pérez")).toBeInTheDocument();

    // Buscar sin tildes encuentra igual: la clave de búsqueda las normaliza en el
    // servidor, que es donde se filtra.
    await userEvent.type(screen.getByRole("searchbox"), "munoz");
    await waitFor(
      async () => {
        tabla = await enLaTabla();
        expect(tabla.queryByText("Ana Pérez")).not.toBeInTheDocument();
      },
      { timeout: 4000 },
    );
    expect((await enLaTabla()).getByText("Iván Muñoz")).toBeInTheDocument();
  });

  it("abrir un expediente carga sus requisitos y su resumen determinista", async () => {
    crearExpediente(harness, { identificador: "CI-DET-2026", nombre: "Carla Detalle", cargo: "Analista" });

    render(<DocumentacionConsola />);
    await waitFor(() => expect(screen.getByText(/Conectado/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Expedientes" }));
    const tabla = await enLaTabla();
    await waitFor(() => expect(tabla.getByText("Carla Detalle")).toBeInTheDocument());

    await userEvent.click(tabla.getByText("Carla Detalle"));

    const panel = await screen.findByRole("dialog", {}, { timeout: 12000 });
    // La cabecera trae el resumen textual que genera el backend.
    await waitFor(() => expect(within(panel).getByText(/Avance 0%/)).toBeInTheDocument());
    expect(within(panel).getByText("Documentos generales")).toBeInTheDocument();
    expect(within(panel).getByText("Currículum Vitae actualizado")).toBeInTheDocument();
    expect(within(panel).getByRole("tab", { name: /Requisitos\s*18/ })).toBeInTheDocument();
  }, 20000);

  it("marcar un requisito no escribe hasta guardar el bloque", async () => {
    const creado = crearExpediente(harness, { identificador: "CI-BLO-2026", nombre: "Bloque Guardado" });

    render(<DocumentacionConsola />);
    await waitFor(() => expect(screen.getByText(/Conectado/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Expedientes" }));
    const tabla = await enLaTabla();
    await waitFor(() => expect(tabla.getByText("Bloque Guardado")).toBeInTheDocument());
    await userEvent.click(tabla.getByText("Bloque Guardado"));

    const panel = await screen.findByRole("dialog", {}, { timeout: 12000 });
    const fila = (await within(panel).findByText("Fotografía digital 4x4")).closest("li")!;
    await userEvent.click(within(fila).getByRole("button", { name: "Entregado" }));

    // Aviso de cambios sin guardar y, sobre todo, NADA escrito todavía.
    await waitFor(() => expect(within(panel).getByText(/1 cambio\(s\) sin guardar/)).toBeInTheDocument());
    const antes = harness.rowsOf("ExpedienteDocumentos").filter((r) => r.estado_documental === "ENTREGADO");
    expect(antes.length).toBe(0);

    await userEvent.click(within(panel).getByRole("button", { name: /Guardar 1 cambio/ }));
    await waitFor(() => {
      const despues = harness.rowsOf("ExpedienteDocumentos").filter((r) => r.estado_documental === "ENTREGADO");
      expect(despues.length).toBe(1);
    });
    // Y el expediente refleja el avance nuevo.
    const expediente = harness.rowsOf("Expedientes").find((e) => e.identificador === "CI-BLO-2026")!;
    expect(Number(expediente.total_entregados)).toBe(1);
    expect(creado.expedienteId).toBeTruthy();
  }, 20000);

  it("el menú esconde lo que el rol no puede usar", async () => {
    // El rol se asigna a la cuenta efectiva: la consola manda como actor el perfil
    // de la aplicación, y sin sesión iniciada el backend cae en la cuenta de Google.
    harness.ok("documentacion.permisos.guardar", { roles: { "auxiliar@bdp.com": "pasante" } });

    render(<DocumentacionConsola />);
    await waitFor(() => expect(screen.getByText(/Conectado/)).toBeInTheDocument());

    // El pasante ve y comenta, así que tiene panel y expedientes…
    expect(screen.getByRole("button", { name: "Panel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expedientes" })).toBeInTheDocument();
    // …pero no exportaciones ni auditoría.
    expect(screen.queryByRole("button", { name: "Exportaciones" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Auditoría" })).not.toBeInTheDocument();
  });

  it("sin backend configurado ofrece configurar o trabajar en local, sin datos inventados", async () => {
    __reiniciarClienteParaPruebas();
    configurarCliente({ url: "ftp://sin-backend" });

    render(<DocumentacionConsola />);
    await waitFor(() => expect(screen.getByText(/no tiene un backend configurado/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Abrir la vista local/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Abrir configuración/i })).toBeInTheDocument();
    // No hay ninguna cifra de panel: no se simula nada.
    expect(screen.queryByText("Expedientes activos")).not.toBeInTheDocument();
  });

  it("un error del backend se muestra con su pista, no en silencio", async () => {
    // Se rompe la hoja de expedientes: la consulta fallará con ESQUEMA_INCOMPLETO.
    harness.spreadsheet.getSheetByName("Expedientes")!.getRange(1, 2, 1, 1).setValue("");

    render(<DocumentacionConsola />);
    await waitFor(() => expect(screen.getByText(/Conectado|Libro sin instalar/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Expedientes" }));

    await waitFor(() => expect(screen.getByText(/No se pudo cargar la lista/i)).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.getByRole("button", { name: /Reintentar/i })).toBeInTheDocument();
  });
});
