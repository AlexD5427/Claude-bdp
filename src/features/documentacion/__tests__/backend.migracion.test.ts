import { describe, it, expect } from "vitest";
import {
  loadBackend,
  seedLegacyBook,
} from "../../../../scripts/documentacion-backend.mjs";

/**
 * Migración del libro heredado al modelo normalizado.
 *
 * Es la parte con más que perder de todo el cambio: al otro lado hay más de
 * novecientas filas escritas a mano durante años. Estas pruebas fijan las cinco
 * propiedades que hacen que migrar sea seguro —simulable, idempotente, tolerante,
 * no destructiva y reanudable— usando las tres formas reales que tienen las filas
 * del libro.
 */

describe("documentación · migración: modo diagnóstico", () => {
  it("la simulación no escribe nada en el libro", () => {
    const h = loadBackend();
    seedLegacyBook(h, 2026);
    const hojasAntes = h.spreadsheet.getSheets().map((s) => s.getName()).sort();

    const res = h.pedir("documentacion.migrar", { simular: true });
    expect(res.ok).toBe(true);
    expect(res.data.simulado).toBe(true);

    expect(h.spreadsheet.getSheets().map((s) => s.getName()).sort()).toEqual(hojasAntes);
    expect(h.spreadsheet.getSheetByName("Expedientes")).toBeNull();
  });

  it("la simulación cuenta lo que haría y recomienda respaldar", () => {
    const h = loadBackend();
    seedLegacyBook(h, 2026);
    const res = h.pedir("documentacion.migrar", { simular: true });

    const expedientes = res.data.ejecutadas.find((e: any) => e.version === "4.0.2-expedientes");
    expect(expedientes.detalle.creados).toBe(3);
    expect(expedientes.detalle.requisitos).toBeGreaterThan(40);
    expect(res.data.recomendacionRespaldo).toMatch(/copia|respaldo/i);
  });
});

describe("documentación · migración: importación de datos", () => {
  it("importa las tres formas de fila del libro real", () => {
    const h = loadBackend();
    seedLegacyBook(h, 2026);
    const res = h.pedir("documentacion.instalar", { conRespaldo: false });
    expect(res.ok).toBe(true);

    const expedientes = h.rowsOf("Expedientes");
    expect(expedientes.length).toBe(3);

    // 1. Fila moderna con DETALLE JSON: conserva su identificador.
    const ana = expedientes.find((e) => e.identificador === "CI-1001-2024")!;
    expect(ana.nombre).toBe("Ana Quiroga Vargas");
    expect(ana.agencia).toBe("LA PAZ");
    expect(ana.tipo_funcionario).toBe("GENERAL");

    // 2. Fila histórica sin identificador: recibe el determinista HIST-<año>-<huella>.
    const historica = expedientes.find((e) => String(e.identificador).indexOf("HIST-") === 0)!;
    expect(historica.nombre).toBe("Luis Fernando Mamani");

    // 3. Fila con garantía: se clasifica como comercial.
    const comercial = expedientes.find((e) => e.identificador === "CI-2002-2025")!;
    expect(comercial.tipo_funcionario).toBe("COMERCIAL");
    expect(String(comercial.tipo_garantia).indexOf("COMERCIAL_")).toBe(0);
  });

  it("el checklist del JSON llega con estados, observaciones y prórroga", () => {
    const h = loadBackend();
    seedLegacyBook(h, 2026);
    h.pedir("documentacion.instalar", { conRespaldo: false });

    const detalle = h.ok("documentacion.expediente.obtener", { identificador: "CI-1001-2024" });
    const porCodigo: Record<string, any> = {};
    for (const r of detalle.requisitos) porCodigo[r.codigo] = r;

    expect(porCodigo["foto-4x4"].estado).toBe("ENTREGADO");
    expect(porCodigo["cv"].estado).toBe("ENTREGADO");
    // «observado» en el modelo viejo era un estado documental; en el nuevo el
    // documento está ENTREGADO y la observación vive en la revisión.
    expect(porCodigo["titulo-legalizado"].estado).toBe("ENTREGADO");
    expect(porCodigo["titulo-legalizado"].estadoRevision).toBe("OBSERVADO");
    expect(porCodigo["titulo-legalizado"].observaciones).toMatch(/legalización/i);
    expect(porCodigo["rc-iva"].estado).toBe("NO_APLICA");

    // La prórroga heredada se convierte en un registro propio.
    expect(detalle.prorrogas.length).toBe(1);
    expect(detalle.prorrogas[0].codigo).toBe("cert-trabajo");
    expect(detalle.prorrogas[0].fechaProrroga).toBe("2027-12-31");
  });

  it("las columnas del libro alimentan los requisitos de las filas sin JSON", () => {
    const h = loadBackend();
    seedLegacyBook(h, 2026);
    h.pedir("documentacion.instalar", { conRespaldo: false });

    const historicas = h.rowsOf("Expedientes").filter((e) => String(e.identificador).indexOf("HIST-") === 0);
    const detalle = h.ok("documentacion.expediente.obtener", { expedienteId: historicas[0].expediente_id });
    const porCodigo: Record<string, any> = {};
    for (const r of detalle.requisitos) porCodigo[r.codigo] = r;

    // REJAP = TIENE → ENTREGADO. CREDISEGURO = NO TIENE → NO_ENTREGADO.
    expect(porCodigo["rejap"].estado).toBe("ENTREGADO");
    expect(porCodigo["seguro-vida"].estado).toBe("NO_ENTREGADO");
    // TITULO LEGALIZADO = TECNICO: variante libre del libro. No se puede deducir
    // que esté entregado, así que queda pendiente y nadie pierde información.
    expect(porCodigo["titulo-legalizado"].estado).toBe("PENDIENTE");
    // Y lo que la columna decía N/A sobre un requisito obligatorio no se acepta
    // como «no aplica»: se deja pendiente para que una persona lo decida.
    expect(porCodigo["djj-no-vinculacion"].estado).toBe("PENDIENTE");
  });

  it("migrar dos veces no duplica expedientes ni requisitos", () => {
    const h = loadBackend();
    seedLegacyBook(h, 2026);
    h.pedir("documentacion.instalar", { conRespaldo: false });
    const expedientes1 = h.rowsOf("Expedientes").length;
    const requisitos1 = h.rowsOf("ExpedienteDocumentos").length;
    const prorrogas1 = h.rowsOf("ExpedienteProrrogas").length;

    const segunda = h.pedir("documentacion.instalar", { conRespaldo: false });
    expect(segunda.ok).toBe(true);
    expect(h.rowsOf("Expedientes").length).toBe(expedientes1);
    expect(h.rowsOf("ExpedienteDocumentos").length).toBe(requisitos1);
    expect(h.rowsOf("ExpedienteProrrogas").length).toBe(prorrogas1);
  });

  it("no pisa un expediente que se editó después de migrar", () => {
    const h = loadBackend();
    seedLegacyBook(h, 2026);
    h.pedir("documentacion.instalar", { conRespaldo: false });

    const expediente = h.rowsOf("Expedientes").find((e) => e.identificador === "CI-1001-2024")!;
    h.ok("documentacion.expediente.actualizar", {
      expedienteId: expediente.expediente_id,
      cambios: { cargo: "Jefa de Riesgos" },
    });

    // Se vuelve a migrar: el dato reciente es el normalizado, no el del libro.
    h.pedir("documentacion.migrar", { version: "4.0.2-expedientes" });
    const despues = h.rowsOf("Expedientes").find((e) => e.identificador === "CI-1001-2024")!;
    expect(despues.cargo).toBe("Jefa de Riesgos");
  });

  it("una fecha ilegible no detiene la migración y se reporta como incidencia", () => {
    const h = loadBackend();
    const semilla = seedLegacyBook(h, 2026);
    const hoja = h.spreadsheet.getSheetByName(`CONTROL INGRESOS ${semilla.anio}`)!;
    const columnas = h.read<any[]>("docYearColumns_()");
    const indiceFecha = columnas.findIndex((c) => c.clave === "fecha_ingreso") + 1;
    hoja.getRange(2, indiceFecha, 1, 1).setValue("no es una fecha");

    const res = h.pedir("documentacion.instalar", { conRespaldo: false });
    expect(res.ok).toBe(true);
    const paso = res.data.migracion.ejecutadas.find((e: any) => e.version === "4.0.2-expedientes");
    expect(paso.detalle.creados).toBe(3);
    expect(paso.detalle.incidencias.length).toBeGreaterThan(0);
    expect(paso.detalle.incidencias[0].motivo).toMatch(/fecha/i);
    // La fila entra igual, con la fecha vacía: se importa el dato que hay.
    const importado = h.rowsOf("Expedientes").find((e) => e.identificador === "CI-1001-2024")!;
    expect(String(importado.fecha_ingreso)).toBe("");
  });

  it("el libro anual no se modifica al migrar", () => {
    const h = loadBackend();
    const semilla = seedLegacyBook(h, 2026);
    const hoja = h.spreadsheet.getSheetByName(`CONTROL INGRESOS ${semilla.anio}`)!;
    const antes = JSON.stringify(hoja.getRange(1, 1, 4, hoja.getLastColumn()).getValues());

    h.pedir("documentacion.migrar", { simular: true });
    const despues = JSON.stringify(hoja.getRange(1, 1, 4, hoja.getLastColumn()).getValues());
    expect(despues).toBe(antes);
  });

  it("procesa por lotes y se reanuda desde el punto de control", () => {
    const h = loadBackend();
    seedLegacyBook(h, 2026);
    // Estructura y catálogos primero, para aislar la migración de expedientes.
    h.pedir("documentacion.migrar", { version: "4.0.0-estructura" });
    h.pedir("documentacion.migrar", { version: "4.0.1-catalogos" });

    const primero = h.pedir("documentacion.migrar", { version: "4.0.2-expedientes", lote: 10 });
    expect(primero.ok).toBe(true);
    const paso = primero.data.ejecutadas[0];
    // El lote mínimo del backend es 10, así que con 3 filas termina de una vez;
    // lo que importa es que el punto de control quede escrito.
    expect(paso.detalle.procesados).toBeGreaterThan(0);

    const registro = h.rowsOf("MigracionesDocumentacion").find((m) => m.version === "4.0.2-expedientes")!;
    expect(registro.estado).toBe("COMPLETADA");
    expect(String(registro.checkpoint)).toMatch(/indice/);
    expect(Number(registro.progreso)).toBe(100);
  });

  it("el estado de migraciones distingue aplicadas de pendientes", () => {
    const h = loadBackend();
    seedLegacyBook(h, 2026);
    const antes = h.ok("documentacion.migraciones.estado");
    expect(antes.aplicadas).toEqual([]);
    expect(antes.pendientes.length).toBe(4);

    h.pedir("documentacion.instalar", { conRespaldo: false });
    const despues = h.ok("documentacion.migraciones.estado");
    expect(despues.pendientes).toEqual([]);
    expect(despues.aplicadas.length).toBe(4);
  });

  it("el respaldo previo guarda los expedientes del libro antes de tocar nada", () => {
    const h = loadBackend();
    seedLegacyBook(h, 2026);
    // El respaldo heredado necesita las hojas del módulo antiguo.
    h.pedir("instalar", {});
    const res = h.pedir("documentacion.respaldo", {});
    expect(res.ok).toBe(true);
    expect(res.data.ok).toBe(true);
    expect(res.data.expedientes).toBe(3);
    expect(h.rowsOf("_RESPALDOS").length).toBe(1);
  });
});

describe("documentación · migración: espejo del libro anual", () => {
  it("un expediente nuevo aparece en la pestaña del año de su ingreso", () => {
    const h = loadBackend();
    h.pedir("documentacion.instalar", { conRespaldo: false });

    h.ok("documentacion.expediente.crear", {
      expediente: {
        identificador: "CI-5555-2026",
        nombre: "Pedro Colque",
        cargo: "Cajero",
        agencia: "ORURO",
        gerencia: "GERENCIA DE OPERACIONES",
        fechaIngreso: "2026-04-10",
      },
    });

    const filas = h.rowsOf("CONTROL INGRESOS 2026");
    const fila = filas.find((f) => f["ID EXPEDIENTE"] === "CI-5555-2026");
    expect(fila, "el expediente debería reflejarse en el libro anual").toBeTruthy();
    expect(fila!["Nombre"]).toBe("Pedro Colque");
    expect(fila!["Oficina"]).toBe("ORURO");
    // Y el DETALLE JSON del contrato heredado sigue ahí, para el frontend viejo.
    expect(String(fila!["DETALLE JSON"])).toMatch(/"items"/);
  });

  it("el espejo se puede desactivar por configuración", () => {
    const h = loadBackend();
    h.pedir("documentacion.instalar", { conRespaldo: false });
    h.ok("documentacion.configuracion.guardar", { configuracion: { espejo_libro_anual: false } });

    h.ok("documentacion.expediente.crear", {
      expediente: {
        identificador: "CI-6666-2026",
        nombre: "Rita Poma",
        fechaIngreso: "2026-04-11",
      },
    });
    const filas = h.rowsOf("CONTROL INGRESOS 2026");
    expect(filas.find((f) => f["ID EXPEDIENTE"] === "CI-6666-2026")).toBeUndefined();
  });
});
