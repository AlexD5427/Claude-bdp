import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DocError,
  __reiniciarClienteParaPruebas,
  saludBackend,
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
    expect(estado.esquema).toBe(6);
    expect(estado.capacidades.ver).toBe(true);
  });

  it("el catálogo llega con los 43 documentos y los tres catálogos auxiliares", async () => {
    const catalogo = await docApi.catalogo();
    expect(catalogo.documentos.length).toBe(43);
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
    expect(detalle.requisitos.length).toBe(20);

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

/* ================================================================== */
/* Resistencia: topes progresivos, reintentos y salud                  */
/* ================================================================== */

describe("cliente · resistencia al backend lento", () => {
  beforeEach(() => {
    __reiniciarClienteParaPruebas();
    configurarCliente({ url: URL_PRUEBAS });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * El tope de espera CRECE con el intento.
   *
   * ── El fallo que esto corrige ─────────────────────────────────────────────
   * Con un tope único de 30 s y tres intentos, una llamada en frío que iba a
   * contestar en el segundo 32 se abortaba tres veces: noventa segundos de
   * espera para acabar diciendo «el backend tardó demasiado», cuando el backend
   * estaba contestando. Y cada aborto dejaba su ejecución en curso en el
   * servidor, así que el reintento competía con su propio antecesor.
   */
  it("el primer intento es corto y los siguientes dan aire al arranque en frío", async () => {
    const topes: number[] = [];
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
      /* El tope se observa por el `AbortSignal`: se mide cuánto tarda en
         abortarse en lugar de espiar una variable interna del cliente. */
      return new Promise<Response>((_resolver, rechazar) => {
        const inicio = Date.now();
        init.signal?.addEventListener("abort", () => {
          topes.push(Date.now() - inicio);
          const error = new Error("The operation was aborted");
          error.name = "AbortError";
          rechazar(error);
        });
      });
    });

    vi.useFakeTimers();
    const promesa = llamar("documentacion.panel", {}, { reintentos: 3 }).catch((e) => e);
    // Primer intento: 20 s.
    await vi.advanceTimersByTimeAsync(20_000);
    await vi.advanceTimersByTimeAsync(2_000); // la espera entre intentos
    // Segundo: 45 s.
    await vi.advanceTimersByTimeAsync(45_000);
    await vi.advanceTimersByTimeAsync(4_000);
    // Tercero: 70 s.
    await vi.advanceTimersByTimeAsync(70_000);
    const error = (await promesa) as DocError;
    vi.useRealTimers();

    expect(topes.length).toBe(3);
    /* Los topes son crecientes: es la propiedad que importa, no el valor
       exacto. Con temporizadores falsos la medición es determinista. */
    expect(topes[1]).toBeGreaterThan(topes[0]);
    expect(topes[2]).toBeGreaterThan(topes[1]);
    expect(error).toBeInstanceOf(DocError);
    expect(error.codigo).toBe("TIMEOUT");
    // Y el mensaje dice cuántos intentos y cuánto se esperó.
    expect(error.message).toMatch(/3 intentos/);
    expect(error.pista).toMatch(/puede haberse completado/i);
  }, 20_000);

  /**
   * El error original no se descarta.
   *
   * Antes «No se pudo contactar con el backend» era todo lo que llegaba: un
   * fallo de CORS, un DNS caído y una implementación sin publicar producían el
   * mismo mensaje, y el texto de `fetch` es lo único que los distingue.
   */
  it("un fallo de red conserva la causa original en el detalle", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    const error = (await llamar("documentacion.panel", {}, { reintentos: 1 }).catch((e) => e)) as DocError;
    expect(error.codigo).toBe("SIN_RED");
    expect(String(error.detalle.causa)).toContain("Failed to fetch");
    expect(error.detalle.accion).toBe("documentacion.panel");
    expect(typeof error.detalle.ms).toBe("number");
  });

  it("una cancelación externa no se reintenta ni cuenta contra la salud", async () => {
    let llamadas = 0;
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
      llamadas += 1;
      return new Promise<Response>((_r, rechazar) => {
        init.signal?.addEventListener("abort", () => {
          const error = new Error("abortada");
          error.name = "AbortError";
          rechazar(error);
        });
      });
    });

    const controlador = new AbortController();
    const promesa = llamar("documentacion.panel", {}, { signal: controlador.signal, reintentos: 3 }).catch((e) => e);
    controlador.abort();
    await promesa;
    /* Navegar a otra pantalla cancela lo que estaba en vuelo. Reintentarlo tres
       veces sería pedir tres veces algo que ya no se va a mostrar, y contarlo
       como fallo del backend haría que el diagnóstico acusara a quien no fue. */
    expect(llamadas).toBe(1);
    expect(saludBackend().fallos).toBe(0);
  });

  it("la salud distingue «contestó y rechazó» de «no contestó»", async () => {
    // Un rechazo de validación: el backend contestó. No es un fallo de red.
    vi.stubGlobal("fetch", async () => respuesta(sobreError("VALIDACION", "Falta el nombre.", { nombre: "Requerido" })));
    await llamar("documentacion.expediente.crear", {}, { reintentos: 1 }).catch(() => {});
    let salud = saludBackend();
    expect(salud.muestras).toBe(1);
    expect(salud.fallos).toBe(0);
    expect(salud.fallosSeguidos).toBe(0);

    // Y ahora una respuesta que no es JSON: el servidor devolvió otra cosa.
    vi.stubGlobal("fetch", async () => respuesta(null, "<html>accounts.google.com</html>"));
    await llamar("documentacion.panel", {}, { reintentos: 1 }).catch(() => {});
    salud = saludBackend();
    expect(salud.muestras).toBe(2);
    expect(salud.fallos).toBe(1);
    expect(salud.fallosSeguidos).toBe(1);

    // Un éxito reinicia la racha, que es lo que hace que el aviso desaparezca.
    vi.stubGlobal("fetch", async () => respuesta(sobreOk({ ok: true })));
    await llamar("documentacion.panel", {}, { reintentos: 1 });
    expect(saludBackend().fallosSeguidos).toBe(0);
    expect(saludBackend().muestras).toBe(3);
  });

  it("un error de validación se mide UNA vez, no dos", async () => {
    vi.stubGlobal("fetch", async () => respuesta(sobreError("VALIDACION", "Mal.", {})));
    await llamar("documentacion.expediente.crear", {}, { reintentos: 1 }).catch(() => {});
    /* El camino del rechazo pasa dos veces por el mismo punto: se mide antes de
       lanzar el error y ese error reaparece en el `catch`. Sin la marca, cada
       validación entraba dos veces en la ventana de veinte muestras. */
    expect(saludBackend().muestras).toBe(1);
  });

  it("la ventana de salud no crece sin límite", async () => {
    vi.stubGlobal("fetch", async () => respuesta(sobreOk({})));
    for (let i = 0; i < 30; i++) {
      await llamar("documentacion.panel", { i }, { reintentos: 1 });
    }
    // Veinte muestras: describe cómo va AHORA, no el promedio histórico.
    expect(saludBackend().muestras).toBe(20);
  });
});
