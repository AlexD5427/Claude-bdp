import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DocError,
  __reiniciarClienteParaPruebas,
  accionesDeclaradas,
  configurarCliente,
  consultarVigente,
  esEscritura,
  hayBackendConfigurado,
  llamar,
  mensajeDeError,
  nuevoRequestId,
  siguienteSecuencia,
} from "../api/client";
import { docApi } from "../api/acciones";
import { loadInstalledBackend } from "../../../../scripts/documentacion-backend.mjs";

/**
 * Cliente de Apps Script.
 *
 * Estas pruebas fijan el comportamiento que antes cada panel resolvía a su manera:
 * identificador de solicitud, unión de peticiones idénticas, reintento solo de lo
 * seguro, descarte de respuestas obsoletas y errores normalizados con su campo.
 *
 * La última parte conecta el cliente REAL con el backend REAL a través del arnés:
 * el `fetch` se redirige al `doPost` del backend cargado en memoria. Es una prueba
 * de integración completa sin red.
 */

const URL_PRUEBAS = "https://script.google.com/macros/s/pruebas/exec";

/** Respuesta mínima con la forma que el cliente espera de `fetch`. */
function respuesta(cuerpo: unknown, texto?: string) {
  return {
    ok: true,
    status: 200,
    text: async () => texto ?? JSON.stringify(cuerpo),
  } as unknown as Response;
}

function sobreOk(data: unknown, extra: Record<string, unknown> = {}) {
  return { ok: true, accion: "x", data, datos: data, error: null, avisos: [], meta: { requestId: "req_1" }, ...extra };
}

function sobreError(codigo: string, mensaje: string, campos: Record<string, string> = {}) {
  return {
    ok: false,
    accion: "x",
    data: null,
    error: { code: codigo, codigo, message: mensaje, mensaje, hint: "Pista útil", pista: "Pista útil", fields: campos, detalle: {} },
    avisos: [],
    meta: { requestId: "req_err" },
  };
}

describe("cliente · configuración y contrato", () => {
  beforeEach(() => {
    __reiniciarClienteParaPruebas();
    configurarCliente({ url: URL_PRUEBAS, actor: "Rocío Casas", rol: "auxiliar" });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    __reiniciarClienteParaPruebas();
  });

  it("reconoce las escrituras y las lecturas", () => {
    expect(esEscritura("documentacion.expediente.crear")).toBe(true);
    expect(esEscritura("documentacion.expedientes.listar")).toBe(false);
    expect(accionesDeclaradas().length).toBeGreaterThan(40);
  });

  it("sabe si hay backend configurado", () => {
    expect(hayBackendConfigurado()).toBe(true);
    configurarCliente({ url: "http://localhost/api" });
    // Una URL que no es de Apps Script no vale: mejor decirlo que fallar por CORS.
    expect(hayBackendConfigurado()).toBe(false);
  });

  it("manda actor, rol, origen y solicitudId en el cuerpo", async () => {
    const espia = vi.fn(async (_url: string, init: RequestInit) => {
      void init;
      return respuesta(sobreOk({ hecho: true }));
    });
    vi.stubGlobal("fetch", espia);

    await llamar("documentacion.expediente.crear", { expediente: { nombre: "x" } }, { requestId: "req_fijo" });

    const [, init] = espia.mock.calls[0];
    const cuerpo = JSON.parse(String(init.body));
    expect(cuerpo.accion).toBe("documentacion.expediente.crear");
    expect(cuerpo.solicitudId).toBe("req_fijo");
    expect(cuerpo.actor).toBe("Rocío Casas");
    expect(cuerpo.rol).toBe("auxiliar");
    expect(cuerpo.origen).toBe("modulo-documentacion");
    // `text/plain` evita la petición OPTIONS que Apps Script no responde.
    expect((init.headers as Record<string, string>)["Content-Type"]).toMatch(/text\/plain/);
    expect(init.redirect).toBe("follow");
  });

  it("devuelve `data` directamente, no el sobre", async () => {
    vi.stubGlobal("fetch", async () => respuesta(sobreOk({ total: 7 })));
    const datos = await llamar<{ total: number }>("documentacion.expedientes.listar");
    expect(datos.total).toBe(7);
  });

  it("normaliza el error con código, pista y campos", async () => {
    vi.stubGlobal("fetch", async () => respuesta(sobreError("VALIDACION", "Faltan datos obligatorios.", { identificador: "Obligatorio" })));

    await expect(llamar("documentacion.expediente.crear", {}, { reintentos: 1 })).rejects.toBeInstanceOf(DocError);
    try {
      await llamar("documentacion.expediente.crear", {}, { reintentos: 1, requestId: "req_2" });
    } catch (error) {
      const fallo = error as DocError;
      expect(fallo.codigo).toBe("VALIDACION");
      expect(fallo.pista).toBe("Pista útil");
      expect(fallo.campos.identificador).toBe("Obligatorio");
      expect(fallo.red).toBe(false);
    }
  });

  it("no reintenta un error de validación", async () => {
    const espia = vi.fn(async () => respuesta(sobreError("VALIDACION", "No.")));
    vi.stubGlobal("fetch", espia);
    await expect(llamar("documentacion.expediente.crear", {})).rejects.toThrow();
    expect(espia).toHaveBeenCalledTimes(1);
  });

  it("reintenta cuando el libro está ocupado y conserva el solicitudId", async () => {
    let intentos = 0;
    const espia = vi.fn(async (_url: string, init: RequestInit) => {
      void init;
      intentos += 1;
      if (intentos < 3) return respuesta(sobreError("LIBRO_OCUPADO", "Ocupado."));
      return respuesta(sobreOk({ hecho: true }));
    });
    vi.stubGlobal("fetch", espia);

    const datos = await llamar<{ hecho: boolean }>("documentacion.expediente.crear", {}, { requestId: "req_reintento" });
    expect(datos.hecho).toBe(true);
    expect(espia).toHaveBeenCalledTimes(3);
    for (const llamada of espia.mock.calls) {
      const cuerpo = JSON.parse(String(llamada[1].body));
      expect(cuerpo.solicitudId).toBe("req_reintento");
    }
  });

  it("un fallo de red se reintenta y termina en un error marcado como de red", async () => {
    const espia = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", espia);

    try {
      await llamar("documentacion.expedientes.listar", {}, { reintentos: 2 });
      throw new Error("debería haber fallado");
    } catch (error) {
      const fallo = error as DocError;
      expect(fallo.red).toBe(true);
      expect(fallo.codigo).toBe("SIN_RED");
    }
    expect(espia).toHaveBeenCalledTimes(2);
  });

  it("dos lecturas idénticas simultáneas comparten una sola petición", async () => {
    const espia = vi.fn(async () => respuesta(sobreOk({ total: 1 })));
    vi.stubGlobal("fetch", espia);

    const [a, b] = await Promise.all([
      llamar("documentacion.expedientes.listar", { filtros: { texto: "ana" } }),
      llamar("documentacion.expedientes.listar", { filtros: { texto: "ana" } }),
    ]);
    expect(espia).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it("dos escrituras seguidas NO se unen: son dos intenciones distintas", async () => {
    const espia = vi.fn(async () => respuesta(sobreOk({ hecho: true })));
    vi.stubGlobal("fetch", espia);

    await Promise.all([
      llamar("documentacion.tarea.crear", { tarea: { titulo: "a" } }),
      llamar("documentacion.tarea.crear", { tarea: { titulo: "a" } }),
    ]);
    expect(espia).toHaveBeenCalledTimes(2);
  });

  it("descarta la respuesta que llega tarde", async () => {
    vi.stubGlobal("fetch", async () => respuesta(sobreOk({ total: 1 })));

    const primera = siguienteSecuencia();
    // Alguien pide otra cosa antes de que llegue la respuesta de la primera.
    siguienteSecuencia();
    const resultado = await consultarVigente("documentacion.expedientes.listar", { filtros: { texto: "a" } }, primera);
    expect(resultado).toBeNull();

    const vigente = siguienteSecuencia();
    const buena = await consultarVigente("documentacion.expedientes.listar", { filtros: { texto: "b" } }, vigente);
    expect(buena).toEqual({ total: 1 });
  });

  it("una respuesta que no es JSON se explica: casi siempre es la pantalla de Google", async () => {
    vi.stubGlobal("fetch", async () => respuesta(null, "<html>Iniciar sesión en accounts.google.com</html>"));
    try {
      await llamar("documentacion.estado", {}, { reintentos: 1 });
      throw new Error("debería haber fallado");
    } catch (error) {
      const fallo = error as DocError;
      expect(fallo.codigo).toBe("AUTENTICACION");
      expect(fallo.pista).toMatch(/Cualquier usuario/i);
    }
  });

  it("sin backend configurado no se intenta la llamada", async () => {
    __reiniciarClienteParaPruebas();
    configurarCliente({ url: "" });
    const espia = vi.fn();
    vi.stubGlobal("fetch", espia);
    // La URL por defecto sí es de Apps Script, así que se fuerza una inválida.
    configurarCliente({ url: "ftp://algo" });
    await expect(llamar("documentacion.estado")).rejects.toMatchObject({ codigo: "SIN_BACKEND" });
    expect(espia).not.toHaveBeenCalled();
  });

  it("el indicador de carga se enciende y se apaga incluso al fallar", async () => {
    vi.stubGlobal("fetch", async () => respuesta(sobreError("VALIDACION", "No.")));
    const eventos: boolean[] = [];
    await expect(
      llamar("documentacion.expediente.crear", {}, { reintentos: 1, onCarga: (v) => eventos.push(v) }),
    ).rejects.toThrow();
    expect(eventos).toEqual([true, false]);
  });

  it("los identificadores de solicitud no se repiten", () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 200; i += 1) vistos.add(nuevoRequestId());
    expect(vistos.size).toBe(200);
  });

  it("`mensajeDeError` entiende cualquier cosa que se haya lanzado", () => {
    expect(mensajeDeError(new DocError("x", { codigo: "A", pista: "B" }))).toEqual({ mensaje: "x", pista: "B", codigo: "A" });
    expect(mensajeDeError(new Error("plano")).codigo).toBe("ERROR");
    expect(mensajeDeError("texto suelto").mensaje).toBe("texto suelto");
  });
});

/* ------------------------------------------------------------------ */
/* Integración real: cliente + backend en memoria                      */
/* ------------------------------------------------------------------ */

describe("cliente · integración con el backend real", () => {
  let harness: ReturnType<typeof loadInstalledBackend>;

  beforeEach(() => {
    __reiniciarClienteParaPruebas();
    harness = loadInstalledBackend();
    configurarCliente({ url: URL_PRUEBAS, actor: "auxiliar@bdp.com", rol: "" });
    // El `fetch` del cliente se enchufa al `doPost` del backend cargado en el
    // arnés: mismo protocolo, mismo sobre, sin red.
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const cuerpo = JSON.parse(String(init.body));
      const salida = harness.call<{ getContent(): string }>("doPost", { postData: { contents: JSON.stringify(cuerpo) } });
      return respuesta(null, salida.getContent());
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __reiniciarClienteParaPruebas();
  });

  it("el estado llega con las capacidades del actor", async () => {
    const estado = await docApi.estado();
    expect(estado.instalado).toBe(true);
    expect(estado.esquema).toBe(4);
    expect(estado.capacidades.ver).toBe(true);
  });

  it("el catálogo llega con los 38 documentos y los catálogos auxiliares", async () => {
    const catalogo = await docApi.catalogo();
    expect(catalogo.documentos.length).toBe(38);
    expect(catalogo.auxiliares.gerencia_bdp.length).toBeGreaterThan(0);
    expect(catalogo.aplicabilidad.length).toBeGreaterThan(5);
  });

  it("crea un expediente, lo marca y lo lee de vuelta", async () => {
    const creado = await docApi.crearExpediente({
      identificador: "CI-CLI-2026",
      nombre: "Integración Cliente",
      agencia: "LA PAZ",
      fechaIngreso: "2026-02-01",
    });
    expect(creado.creado).toBe(true);

    const detalle = await docApi.obtenerExpediente(creado.expedienteId);
    expect(detalle.requisitos.length).toBe(18);

    const cv = detalle.requisitos.find((r) => r.codigo === "cv")!;
    const guardado = await docApi.guardarRequisitos(creado.expedienteId, [
      { expedienteDocumentoId: cv.expedienteDocumentoId, estado: "ENTREGADO", version: cv.version },
    ]);
    expect(guardado.aplicados).toBe(1);

    const listado = await docApi.listarExpedientes({ texto: "Integración" });
    expect(listado.total).toBe(1);
    expect(listado.expedientes[0].totales.entregados).toBe(1);
  });

  it("un error del backend llega con el campo que falla", async () => {
    try {
      await docApi.crearExpediente({ nombre: "Sin identificador" });
      throw new Error("debería haber fallado");
    } catch (error) {
      const fallo = error as DocError;
      expect(fallo.codigo).toBe("VALIDACION");
      expect(fallo.campos.identificador).toBeTruthy();
    }
  });

  it("el panel llega agregado y no trae la lista de expedientes", async () => {
    await docApi.crearExpediente({ identificador: "CI-P-2026", nombre: "Panel Persona", fechaIngreso: "2026-03-03" });
    const panel = await docApi.panel();
    expect(panel.expedientes).toBe(1);
    expect(JSON.stringify(panel)).not.toContain("Panel Persona");
  });
});
