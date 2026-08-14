import { describe, it, expect } from "vitest";
import {
  crearExpediente,
  loadBackend,
  loadInstalledBackend,
} from "../../../../scripts/documentacion-backend.mjs";

/**
 * Regresión: todo lo que funcionaba antes tiene que seguir funcionando.
 *
 * El módulo anterior está en producción. Su frontend llama a veintiocho acciones,
 * su menú del libro ejecuta once funciones y su formato visual es lo que el área
 * reconoce. Esta suite es el contrato: si algo de esto se rompe, el cambio no se
 * puede desplegar, por buena que sea la arquitectura nueva.
 */

describe("regresión · acciones heredadas del enrutador", () => {
  it("las veintiocho acciones antiguas siguen declaradas", () => {
    const h = loadBackend();
    const heredadas = h.read<string[]>("docActionList_()");
    expect(heredadas.length).toBe(28);
    for (const accion of ["estado", "diagnostico", "instalar", "expedientes.listar", "expediente.guardar", "expediente.obtener", "expedientes.exportar", "auditoria.consultar", "mantenimiento.respaldar"]) {
      expect(heredadas).toContain(accion);
    }
  });

  it("`estado` responde con la forma antigua", () => {
    const h = loadBackend();
    const res = h.pedir("estado");
    expect(res.ok).toBe(true);
    // El frontend anterior lee `datos.backend` y `datos.instalado`.
    expect(res.datos.backend).toBeTruthy();
    expect(typeof res.datos.instalado).toBe("boolean");
    expect(res.datos.anioActual).toBeGreaterThan(2000);
    // Y la meta antigua sigue completa.
    expect(res.meta.traza).toBeTruthy();
    expect(res.meta.esquema).toBeTruthy();
    expect(res.meta.contadores).toBeTruthy();
  });

  it("`instalar` crea el libro heredado con sus ocho hojas de sistema", () => {
    const h = loadBackend();
    const res = h.pedir("instalar", {});
    expect(res.ok).toBe(true);
    for (const hoja of ["AUDITORIA", "ENTREGA COM+SEGUROS", "_CATALOGO", "_CONFIG", "_RESPALDOS", "_DIARIO", "_SOLICITUDES", "_META"]) {
      expect(h.spreadsheet.getSheetByName(hoja), `falta ${hoja}`).not.toBeNull();
    }
    // Y la pestaña anual del año en curso.
    const anio = new Date().getFullYear();
    expect(h.spreadsheet.getSheetByName(`CONTROL INGRESOS ${anio}`)).not.toBeNull();
  });

  it("`expediente.guardar` y `expediente.obtener` conservan su contrato", () => {
    const h = loadBackend();
    h.pedir("instalar", {});
    const anio = new Date().getFullYear();

    const expediente = {
      identificador: "CI-LEG-2026",
      nombre: "Contrato Heredado",
      cargo: "Analista",
      agencia: "LA PAZ",
      gerencia: "GERENCIA DE RIESGOS",
      correo: "heredado@bdp.com",
      fechaIngreso: `${anio}-03-01`,
      items: [
        { id: "foto-4x4", label: "Fotografía digital 4x4", group: "personal", status: "presentado", pages: 1 },
        { id: "cv", label: "Currículum Vitae", group: "personal", status: "pendiente", pages: 0 },
        { id: "cert-trabajo", label: "Certificados de trabajo", group: "personal", status: "pendiente", pages: 0, prorroga: `${anio + 1}-01-31`, allowProrroga: true },
      ],
      emailLog: [],
    };

    const guardado = h.pedir("expediente.guardar", { expediente });
    expect(guardado.ok).toBe(true);
    expect(guardado.datos.creado).toBe(true);
    expect(guardado.datos.resumen.avance).toBe(33);
    expect(guardado.datos.resumen.proceso).toBe("FALTA");

    const abierto = h.pedir("expediente.obtener", { identificador: "CI-LEG-2026" });
    expect(abierto.ok).toBe(true);
    expect(abierto.datos.nombre).toBe("Contrato Heredado");
    expect(abierto.datos.items.length).toBe(3);
    expect(abierto.datos.resumen.avance).toBe(33);
    expect(abierto.datos.columnas).toBeTruthy();
  });

  it("`expedientes.listar` y `expedientes.exportar` siguen respondiendo", () => {
    const h = loadBackend();
    h.pedir("instalar", {});
    const anio = new Date().getFullYear();
    h.pedir("expediente.guardar", {
      expediente: {
        identificador: "CI-LEG2-2026",
        nombre: "Persona Lista",
        fechaIngreso: `${anio}-04-01`,
        items: [{ id: "cv", label: "CV", group: "personal", status: "presentado", pages: 2 }],
      },
    });

    const listado = h.pedir("expedientes.listar", { todos: true, detalle: true });
    expect(listado.ok).toBe(true);
    expect(listado.datos.total).toBe(1);
    expect(listado.datos.expedientes[0].identificador).toBe("CI-LEG2-2026");

    const exportado = h.pedir("expedientes.exportar", {});
    expect(exportado.ok).toBe(true);
    expect(exportado.datos.total).toBe(1);
    expect(exportado.datos.version).toBeTruthy();
  });

  it("las funciones de mantenimiento heredadas siguen operativas", () => {
    const h = loadBackend();
    h.pedir("instalar", {});
    const anio = new Date().getFullYear();
    h.pedir("expediente.guardar", {
      expediente: {
        identificador: "CI-LEG3-2026",
        nombre: "Para Mantenimiento",
        fechaIngreso: `${anio}-05-01`,
        items: [{ id: "cv", label: "CV", group: "personal", status: "presentado", pages: 1 }],
      },
    });

    const respaldo = h.pedir("mantenimiento.respaldar", { motivo: "prueba de regresión" });
    expect(respaldo.ok).toBe(true);
    expect(respaldo.datos.expedientes).toBe(1);

    const respaldos = h.pedir("mantenimiento.respaldos", {});
    expect(respaldos.datos.respaldos.length).toBe(1);

    const recalculo = h.pedir("mantenimiento.recalcular", {});
    expect(recalculo.ok).toBe(true);
    expect(recalculo.datos.actualizadas).toBe(1);

    const recolor = h.pedir("mantenimiento.recolorear", {});
    expect(recolor.ok).toBe(true);

    const duplicados = h.pedir("mantenimiento.deduplicar", { aplicar: false });
    expect(duplicados.ok).toBe(true);
    expect(duplicados.datos.aplicado).toBe(false);

    const compactar = h.pedir("mantenimiento.compactar", {});
    expect(compactar.ok).toBe(true);

    const diagnostico = h.pedir("diagnostico");
    expect(diagnostico.ok).toBe(true);
    expect(diagnostico.datos.resumen.expedientes).toBe(1);

    const autoreparar = h.pedir("mantenimiento.autoreparar", {});
    expect(autoreparar.ok).toBe(true);
  });

  it("la auditoría heredada sigue registrando y consultándose", () => {
    const h = loadBackend();
    h.pedir("instalar", {});
    const anio = new Date().getFullYear();
    h.pedir("expediente.guardar", {
      expediente: {
        identificador: "CI-AUD-2026",
        nombre: "Auditada",
        fechaIngreso: `${anio}-06-01`,
        items: [{ id: "cv", label: "CV", group: "personal", status: "presentado", pages: 1 }],
      },
    });
    const consulta = h.pedir("auditoria.consultar", { limite: 50 });
    expect(consulta.ok).toBe(true);
    expect(consulta.datos.eventos.length).toBeGreaterThan(0);
    expect(consulta.datos.eventos[0].accion).toBeTruthy();

    const metricas = h.pedir("auditoria.metricas", { dias: 30 });
    expect(metricas.ok).toBe(true);
    expect(metricas.datos.eventos).toBeGreaterThan(0);
  });

  it("una acción inexistente enumera las heredadas y las nuevas", () => {
    const h = loadBackend();
    const res = h.pedir("accion.que.no.existe");
    expect(res.ok).toBe(false);
    expect(res.error.codigo).toBe("ACCION_NO_SOPORTADA");
    expect(res.error.hint).toContain("expediente.guardar");
    expect(res.error.hint).toContain("documentacion.expediente.crear");
  });

  it("el error heredado conserva `codigo`, `mensaje` y `pista`", () => {
    const h = loadBackend();
    const res = h.pedir("expediente.obtener", { identificador: "no-existe" });
    expect(res.ok).toBe(false);
    expect(res.error.codigo).toBe("LIBRO_NO_INSTALADO");
    expect(res.error.mensaje).toBeTruthy();
    expect(res.error.pista).toBeTruthy();
    // Y ahora también los nombres nuevos.
    expect(res.error.code).toBe(res.error.codigo);
    expect(res.error.message).toBe(res.error.mensaje);
  });
});

describe("regresión · formato y colores del libro anual", () => {
  it("la pestaña anual conserva sus 39 columnas con los encabezados exactos", () => {
    const h = loadBackend();
    h.pedir("instalar", {});
    const anio = new Date().getFullYear();
    const hoja = h.spreadsheet.getSheetByName(`CONTROL INGRESOS ${anio}`)!;
    const cabecera = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(String);

    expect(cabecera.length).toBe(39);
    // Las rarezas del libro original se conservan a propósito.
    expect(cabecera).toContain("Tipo de Empleado ");
    expect(cabecera).toContain("CORREO CARTA DE PRORROGA ");
    expect(cabecera).toContain("CONSENTIMIENTO DE USO DE IMAGEN\n(ESCANEAR)");
    // «CONTRATO DE FIANZA» aparece DOS veces.
    expect(cabecera.filter((c) => c === "CONTRATO DE FIANZA").length).toBe(2);
    // Y el bloque del módulo empieza en la X.
    expect(cabecera[23]).toBe("ID EXPEDIENTE");
    expect(cabecera).toContain("DETALLE JSON");
  });

  it("las filas se pintan con la semántica de colores del libro", () => {
    const h = loadBackend();
    h.pedir("instalar", {});
    const anio = new Date().getFullYear();

    // Expediente completo → verde.
    h.pedir("expediente.guardar", {
      expediente: {
        identificador: "CI-COL1-2026",
        nombre: "Completa",
        fechaIngreso: `${anio}-01-05`,
        items: [{ id: "cv", label: "CV", group: "personal", status: "presentado", pages: 1 }],
      },
    });
    // Expediente recién abierto y sin documentos → celeste. La fecha es de hoy: un
    // ingreso antiguo sin documentos se pinta como atrasado, que es justo lo que la
    // convención del libro quiere distinguir.
    const hoy = new Date().toISOString().slice(0, 10);
    h.pedir("expediente.guardar", {
      expediente: {
        identificador: "CI-COL2-2026",
        nombre: "Nueva",
        fechaIngreso: hoy,
        items: [{ id: "cv", label: "CV", group: "personal", status: "pendiente", pages: 0 }],
      },
    });

    const hoja = h.spreadsheet.getSheetByName(`CONTROL INGRESOS ${anio}`)!;
    const colores = h.read<Record<string, string>>("DOC_COLOR");
    expect(hoja.getRange(2, 1, 1, 1).getBackground()).toBe(colores.FILA_COMPLETA);
    expect(hoja.getRange(3, 1, 1, 1).getBackground()).toBe(colores.FILA_NUEVA);
  });

  it("el estilo se puede volver a aplicar sin perder datos", () => {
    const h = loadBackend();
    h.pedir("instalar", {});
    const anio = new Date().getFullYear();
    h.pedir("expediente.guardar", {
      expediente: {
        identificador: "CI-STY-2026",
        nombre: "Con Estilo",
        fechaIngreso: `${anio}-02-02`,
        items: [{ id: "cv", label: "CV", group: "personal", status: "presentado", pages: 1 }],
      },
    });
    const antes = h.rowsOf(`CONTROL INGRESOS ${anio}`);
    h.pedir("mantenimiento.recolorear", {});
    expect(h.rowsOf(`CONTROL INGRESOS ${anio}`)).toEqual(antes);
  });
});

describe("regresión · las dos arquitecturas conviven", () => {
  it("un expediente guardado por la vía antigua se migra y aparece en la nueva", () => {
    const h = loadBackend();
    h.pedir("instalar", {});
    const anio = new Date().getFullYear();
    h.pedir("expediente.guardar", {
      expediente: {
        identificador: "CI-MIX-2026",
        nombre: "Mixta",
        cargo: "Analista",
        agencia: "LA PAZ",
        gerencia: "GERENCIA DE RIESGOS",
        fechaIngreso: `${anio}-07-01`,
        items: [
          { id: "cv", label: "CV", group: "personal", status: "presentado", pages: 1 },
          { id: "rejap", label: "REJAP", group: "personal", status: "pendiente", pages: 0 },
        ],
      },
    });

    h.pedir("documentacion.instalar", { conRespaldo: false });
    const listado = h.ok("documentacion.expedientes.listar", { filtros: { texto: "Mixta" } });
    expect(listado.total).toBe(1);
    const detalle = h.ok("documentacion.expediente.obtener", { identificador: "CI-MIX-2026" });
    const cv = detalle.requisitos.find((r: any) => r.codigo === "cv");
    expect(cv.estado).toBe("ENTREGADO");
    expect(detalle.expediente.agencia).toBe("LA PAZ");
  });

  it("un expediente creado por la vía nueva se lee por la vía antigua", () => {
    const h = loadBackend();
    h.pedir("instalar", {});
    h.pedir("documentacion.instalar", { conRespaldo: false });

    const creado = crearExpediente(h, {
      identificador: "CI-NEW-2026",
      nombre: "Creada En Nuevo",
      fechaIngreso: `${new Date().getFullYear()}-08-01`,
    });
    h.ok("documentacion.requisitos.guardar", {
      expedienteId: creado.expedienteId,
      cambios: [{ codigo: "cv", estado: "ENTREGADO" }],
    });

    // La acción antigua lo encuentra, con su checklist y su avance.
    const abierto = h.pedir("expediente.obtener", { identificador: "CI-NEW-2026" });
    expect(abierto.ok).toBe(true);
    expect(abierto.datos.nombre).toBe("Creada En Nuevo");
    const cv = abierto.datos.items.find((i: any) => i.id === "cv");
    expect(cv.status).toBe("presentado");
    expect(abierto.datos.resumen.presentados).toBe(1);
  });

  it("el catálogo heredado `_CATALOGO` sigue disponible para la configuración antigua", () => {
    const h = loadBackend();
    h.pedir("instalar", {});
    h.pedir("documentacion.instalar", { conRespaldo: false });
    const config = h.pedir("configuracion.obtener", {});
    expect(config.ok).toBe(true);
    expect(config.datos.catalogo.length).toBeGreaterThan(20);
    expect(config.datos.configuracion.cadencia_dias).toBeTruthy();
  });

  it("el menú del libro expone las funciones nuevas y las antiguas", () => {
    const h = loadBackend();
    // Las funciones del menú se ejecutan sin interfaz: devuelven su mensaje.
    const instalado = h.call<string>("docMenuInstalar");
    expect(instalado).toContain("AUDITORIA");

    const modelo = h.call<string>("docMenuInstalarModelo");
    expect(modelo).toMatch(/Hojas revisadas/);

    const simulacion = h.call<string>("docMenuSimularMigracion");
    expect(simulacion).toMatch(/Nada se escribio/);

    const diagnostico = h.call<string>("docMenuDiagnosticarModelo");
    expect(diagnostico).toMatch(/Expedientes:/);

    const reparacion = h.call<string>("docMenuRepararModelo");
    expect(reparacion).toMatch(/Criticos antes/);

    const diario = h.call<string>("docMenuProcesoDiario");
    expect(diario).toMatch(/Prorrogas vencidas/);
  });

  it("la tarea diaria ejecuta el mantenimiento antiguo y el proceso nuevo", () => {
    const h = loadBackend();
    h.pedir("instalar", {});
    h.pedir("documentacion.instalar", { conRespaldo: false });
    const pasos = h.call<string[]>("docTareaDiaria");
    expect(pasos.join(" | ")).toMatch(/modelo normalizado/);
    expect(pasos.join(" | ")).toMatch(/respaldo/);
  });

  it("instalar los disparadores no deja duplicados", () => {
    const h = loadBackend();
    h.call("docInstalarDisparadores");
    h.call("docInstalarDisparadores");
    const handlers = h.state.triggers.map((t) => t.getHandlerFunction());
    expect(handlers.filter((x) => x === "docTareaDiaria").length).toBe(1);
  });
});

describe("regresión · los 18 documentos generales y las ramas", () => {
  it("el catálogo heredado y el nuevo describen los mismos documentos", () => {
    const h = loadBackend();
    h.pedir("instalar", {});
    h.pedir("documentacion.instalar", { conRespaldo: false });

    const heredado = h.read<any[]>("DOC_CATALOGO_SEMILLA").map((d) => d.id).sort();
    const nuevo = h.ok("documentacion.catalogo").documentos.map((d: any) => d.codigo).sort();
    expect(nuevo).toEqual(heredado);
    expect(nuevo.length).toBe(31);
  });

  it("cada rama produce el número de requisitos esperado", () => {
    const h = loadInstalledBackend();
    const casos: [string, string, number][] = [
      ["GENERAL", "NINGUNA", 18],
      ["COMERCIAL", "COMERCIAL_1", 22],
      ["COMERCIAL", "COMERCIAL_2", 22],
      ["COMERCIAL", "COMERCIAL_3", 22],
      ["AUDITORIA", "NINGUNA", 20],
      ["CUMPLIMIENTO", "NINGUNA", 20],
    ];
    let n = 0;
    for (const [funcionario, garantia, esperado] of casos) {
      const creado = crearExpediente(h, {
        identificador: `CI-RAMA${n++}-2026`,
        tipoFuncionario: funcionario,
        tipoGarantia: garantia,
      });
      expect(creado.requisitos.length, `${funcionario}/${garantia}`).toBe(esperado);
    }
  });

  it("las prórrogas de certificados y título siguen siendo las únicas del proceso general", () => {
    const h = loadInstalledBackend();
    const { requisitos } = crearExpediente(h);
    const conProrroga = requisitos.filter((r: any) => r.permiteProrroga).map((r: any) => r.codigo).sort();
    expect(conProrroga).toEqual(["cert-trabajo", "titulo-legalizado"]);
  });
});

describe("regresión · las pruebas del editor de Apps Script", () => {
  /**
   * `10_Tests.gs` es lo único que una persona sin acceso al repositorio puede
   * ejecutar para saber si el libro está sano. Si esas comprobaciones se
   * desactualizan, quien administre el módulo se queda sin red. Así que aquí se
   * ejecutan también, en cada `git push`.
   */
  it("las comprobaciones puras del modelo pasan sin necesidad de libro", () => {
    const h = loadBackend();
    h.call("docTestReset_");
    h.call("docTestModelo_");
    const informe = h.read<{ pasadas: number; fallidas: number; resultados: { nombre: string; ok: boolean; detalle?: string }[] }>("DOC_TEST");
    const fallidas = informe.resultados.filter((r) => !r.ok).map((r) => `${r.nombre}: ${r.detalle ?? ""}`);
    expect(fallidas, fallidas.join(" | ")).toEqual([]);
    expect(informe.pasadas).toBeGreaterThanOrEqual(20);
  });

  it("la batería rápida completa del editor también pasa", () => {
    const h = loadBackend();
    const informe = h.call<{ pasadas: number; fallidas: number; resultados: { nombre: string; ok: boolean; detalle?: string }[] }>("docEjecutarPruebas", true);
    const fallidas = informe.resultados.filter((r) => !r.ok).map((r) => `${r.nombre}: ${r.detalle ?? ""}`);
    expect(fallidas, fallidas.join(" | ")).toEqual([]);
    expect(informe.fallidas).toBe(0);
  });
});
