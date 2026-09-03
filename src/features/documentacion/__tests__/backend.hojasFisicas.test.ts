import { describe, expect, it } from "vitest";
import { crearExpediente, loadBackend, loadInstalledBackend, seedLegacyBook } from "../../../../scripts/documentacion-backend.mjs";

/**
 * Conteo de hojas de los documentos físicos, de la validación al libro.
 *
 * ── Por qué existe este dato ────────────────────────────────────────────────
 * El legajo del banco se archiva en papel y para armarlo hay que saber cuántas
 * hojas trae cada documento físico. Ese número no existía en ninguna parte: la
 * columna `PAGINAS` del libro anual salía siempre en cero porque el campo
 * `pages` del formato heredado nunca se llenaba. Es uno de los cabos sueltos que
 * dejaron las fusiones sucesivas.
 *
 * ── Qué vigilan estas pruebas ───────────────────────────────────────────────
 * Que el contador solo exista donde el catálogo lo pide, que el backend rechace
 * un valor imposible con el campo marcado, que el número sobreviva a un cambio
 * de estado y que llegue al libro anual sin tocar las columnas A-W.
 */

describe("conteo de hojas · validación", () => {
  it("solo se acepta en los requisitos que el catálogo marca como físicos", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisitos } = crearExpediente(h, { identificador: "HOJAS-1" });

    const rejap = requisitos.find((r: { codigo: string }) => r.codigo === "rejap")!;
    const foto = requisitos.find((r: { codigo: string }) => r.codigo === "foto-4x4")!;
    expect(rejap.requiereConteoHojas).toBe(true);
    expect(foto.requiereConteoHojas).toBe(false);

    const bueno = h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: rejap.expedienteDocumentoId,
      cambios: { hojasFisicas: 4 },
    });
    expect(bueno.cambios).toBeGreaterThan(0);

    // Un escaneado no tiene hojas que contar: se rechaza señalando el campo.
    const malo = h.pedir("documentacion.requisito.actualizar", {
      expedienteDocumentoId: foto.expedienteDocumentoId,
      cambios: { hojasFisicas: 2 },
    });
    expect(malo.ok).toBe(false);
    expect(malo.error.fields.hojas_fisicas).toBeTruthy();

    const detalle = h.ok("documentacion.expediente.obtener", { expedienteId });
    expect(detalle.requisitos.find((r: { codigo: string }) => r.codigo === "rejap").hojasFisicas).toBe(4);
    expect(detalle.requisitos.find((r: { codigo: string }) => r.codigo === "foto-4x4").hojasFisicas).toBe(0);
  });

  it("rechaza decimales, negativos y cifras absurdas, con su mensaje", () => {
    const h = loadInstalledBackend();
    const { requisitos } = crearExpediente(h, { identificador: "HOJAS-2" });
    const titulo = requisitos.find((r: { codigo: string }) => r.codigo === "titulo-legalizado")!;

    for (const valor of ["2.5", "-3", "1500", "muchas"]) {
      const res = h.pedir("documentacion.requisito.actualizar", {
        expedienteDocumentoId: titulo.expedienteDocumentoId,
        cambios: { hojasFisicas: valor },
      });
      expect(res.ok, `valor ${valor}`).toBe(false);
      expect(res.error.fields.hojas_fisicas, `valor ${valor}`).toBeTruthy();
    }

    // El tope está en el vocabulario, no escondido en el código.
    expect(h.ok("documentacion.vocabulario").maxHojasFisicas).toBe(999);
  });

  it("cero significa «sin contar» y se puede volver a cero", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisitos } = crearExpediente(h, { identificador: "HOJAS-3" });
    const seguro = requisitos.find((r: { codigo: string }) => r.codigo === "seguro-vida")!;

    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: seguro.expedienteDocumentoId,
      cambios: { hojasFisicas: 7 },
    });
    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: seguro.expedienteDocumentoId,
      cambios: { hojasFisicas: 0 },
    });
    const detalle = h.ok("documentacion.expediente.obtener", { expedienteId });
    expect(detalle.requisitos.find((r: { codigo: string }) => r.codigo === "seguro-vida").hojasFisicas).toBe(0);
  });

  it("marcar «no aplica» conserva el conteo por si se revierte la decisión", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisitos } = crearExpediente(h, { identificador: "HOJAS-4" });
    const titulo = requisitos.find((r: { codigo: string }) => r.codigo === "titulo-legalizado")!;

    h.ok("documentacion.requisitos.guardar", {
      expedienteId,
      cambios: [{ expedienteDocumentoId: titulo.expedienteDocumentoId, hojasFisicas: 5, estado: "ENTREGADO" }],
    });
    h.ok("documentacion.requisitos.guardar", {
      expedienteId,
      cambios: [{ expedienteDocumentoId: titulo.expedienteDocumentoId, estado: "NO_APLICA" }],
    });

    const detalle = h.ok("documentacion.expediente.obtener", { expedienteId });
    const guardado = detalle.requisitos.find((r: { codigo: string }) => r.codigo === "titulo-legalizado");
    expect(guardado.estado).toBe("NO_APLICA");
    // El valor sigue ahí: revertir el «no aplica» no obliga a contar otra vez.
    expect(guardado.hojasFisicas).toBe(5);
  });

  it("el cambio de conteo queda en el historial como cualquier otro", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisitos } = crearExpediente(h, { identificador: "HOJAS-5" });
    const felcc = requisitos.find((r: { codigo: string }) => r.codigo === "antecedentes-felcc")!;

    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: felcc.expedienteDocumentoId,
      cambios: { hojasFisicas: 2 },
    });
    const historial = h.rowsOf("HistorialDocumentacion");
    expect(historial.some((f) => String(f.campo) === "hojas_fisicas" && String(f.valor_nuevo) === "2")).toBe(true);
    expect(h.ok("documentacion.expediente.obtener", { expedienteId }).historial.length).toBeGreaterThan(0);
  });
});

describe("conteo de hojas · libro anual", () => {
  it("el total llega a PAGINAS y el desglose a su columna de gestión", () => {
    const h = loadInstalledBackend();
    const anio = new Date().getFullYear();
    const { expedienteId, requisitos } = crearExpediente(h, {
      identificador: "HOJAS-LIBRO",
      nombre: "Persona Con Legajo",
      fechaIngreso: `${anio}-03-10`,
    });
    const rejap = requisitos.find((r: { codigo: string }) => r.codigo === "rejap")!;
    const seguro = requisitos.find((r: { codigo: string }) => r.codigo === "seguro-accidentes")!;

    h.ok("documentacion.requisitos.guardar", {
      expedienteId,
      cambios: [
        { expedienteDocumentoId: rejap.expedienteDocumentoId, hojasFisicas: 3, estado: "ENTREGADO" },
        { expedienteDocumentoId: seguro.expedienteDocumentoId, hojasFisicas: 2, estado: "ENTREGADO" },
      ],
    });

    const fila = h.rowsOf(`CONTROL INGRESOS ${anio}`).find((f) => String(f["ID EXPEDIENTE"]) === "HOJAS-LIBRO")!;
    expect(Number(fila.PAGINAS)).toBe(5);
    expect(String(fila["HOJAS POR DOCUMENTO"])).toContain("3");
    expect(String(fila["HOJAS POR DOCUMENTO"])).toContain("2");
  });

  it("las columnas A-W del Excel del área siguen intactas", () => {
    const h = loadInstalledBackend();
    const anio = new Date().getFullYear();
    crearExpediente(h, { identificador: "HOJAS-AW", fechaIngreso: `${anio}-04-01` });
    const hoja = h.spreadsheet.getSheetByName(`CONTROL INGRESOS ${anio}`)!;
    const cabecera = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(String);
    expect(cabecera[0]).toBe("Nombre");
    expect(cabecera[22]).toBe("CORREO CARTA DE PRORROGA ");
    expect(cabecera[23]).toBe("ID EXPEDIENTE");
    // Y la columna nueva está DESPUÉS del bloque de gestión, no en medio.
    expect(cabecera.indexOf("HOJAS POR DOCUMENTO")).toBeGreaterThan(23);
  });
});

describe("conteo de hojas · migración", () => {
  it("la migración crea la columna sin inventar ningún número", () => {
    const h = loadBackend();
    seedLegacyBook(h, 2026);

    const simulacion = h.ok("documentacion.migrar", { simular: true });
    const paso = simulacion.ejecutadas.find((e: { version: string }) => e.version === "4.1.0-hojas-fisicas")!;
    expect(paso).toBeTruthy();
    expect(paso.resumen).toMatch(/se inventa/i);

    h.ok("documentacion.instalar", { conRespaldo: false });
    h.call("doc2Reset_");

    const filas = h.rowsOf("ExpedienteDocumentos");
    expect(filas.length).toBeGreaterThan(0);
    // Todos en cero: «todavía no se contaron» es la verdad, y un número
    // inventado distorsionaría el total del libro sin que nadie lo note.
    expect(filas.every((f) => Number(f.hojas_fisicas || 0) === 0)).toBe(true);
    // Y la subsección quedó materializada en las filas que la tienen.
    expect(filas.some((f) => String(f.subseccion || "") !== "")).toBe(true);
  });

  it("es idempotente: aplicarla dos veces no cambia nada la segunda vez", () => {
    const h = loadBackend();
    seedLegacyBook(h, 2026);
    h.ok("documentacion.instalar", { conRespaldo: false });
    h.call("doc2Reset_");
    const antes = h.rowsOf("ExpedienteDocumentos").length;

    const segunda = h.ok("documentacion.migrar", {});
    expect(segunda.ejecutadas.length).toBe(0);
    expect(h.rowsOf("ExpedienteDocumentos").length).toBe(antes);
  });

  it("reinstalar no degrada un estado ya resuelto ni pierde un conteo", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisitos } = crearExpediente(h, { identificador: "HOJAS-REINST" });
    const rejap = requisitos.find((r: { codigo: string }) => r.codigo === "rejap")!;
    h.ok("documentacion.requisitos.guardar", {
      expedienteId,
      cambios: [{ expedienteDocumentoId: rejap.expedienteDocumentoId, estado: "ENTREGADO", hojasFisicas: 6 }],
    });

    h.ok("documentacion.instalar", { conRespaldo: false });
    h.call("doc2Reset_");

    const detalle = h.ok("documentacion.expediente.obtener", { expedienteId });
    const despues = detalle.requisitos.find((r: { codigo: string }) => r.codigo === "rejap");
    expect(despues.estado).toBe("ENTREGADO");
    expect(despues.hojasFisicas).toBe(6);
  });
});
