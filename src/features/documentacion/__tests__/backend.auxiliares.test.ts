import { describe, expect, it } from "vitest";
import { crearExpediente, loadInstalledBackend, type DocHarness } from "../../../../scripts/documentacion-backend.mjs";

/**
 * Catálogos auxiliares: lectura por cabecera y campo «Cargo».
 *
 * ── Qué fallo vigilan estas pruebas ─────────────────────────────────────────
 * El área reportó que los desplegables de Agencia y Gerencia «no absorben todo
 * lo que hay en la columna». La causa era doble y las dos partes están cubiertas
 * aquí:
 *
 * 1. **La cabecera se comparaba literalmente.** `String(cabecera).trim() === 'agencia_bdp'`
 *    falla con `Agencia_BDP`, con un espacio doble interior o con un espacio
 *    irrompible pegado al copiar de otra hoja. Cuando la comparación falla, la
 *    lectura devuelve la lista VACÍA y el desplegable aparece sin opciones con la
 *    hoja llena de valores.
 * 2. **La escritura calculaba la fila con el recuento DEDUPLICADO.** Si la
 *    columna tenía un duplicado o un hueco, el valor nuevo caía sobre uno
 *    existente y lo pisaba: exactamente lo contrario de la regla «de esta hoja
 *    nunca se quita un valor».
 *
 * Y además se comprueba el campo «Cargo», que hasta ahora no tenía fuente de
 * datos: cada persona escribía el cargo a su manera y los reportes por cargo no
 * agrupaban nada.
 */

/** Escribe valores en la hoja `Auxiliar` por posición, como lo haría el área. */
function escribirEnAuxiliar(h: DocHarness, celdas: { fila: number; columna: number; valor: string }[]) {
  const hoja = h.spreadsheet.getSheetByName("Auxiliar")!;
  for (const celda of celdas) {
    hoja.getRange(celda.fila, celda.columna, 1, 1).setValues([[celda.valor]]);
  }
  // La caché de la petición anterior no puede sobrevivir a una edición manual.
  h.call("doc2CacheInvalidar_", h.read("[DOC2_CACHE.AUXILIAR, DOC2_CACHE.CATALOGO]"));
  h.call("doc2Reset_");
}

/** Índice (1-based) de una cabecera de `Auxiliar`. */
function columnaDe(h: DocHarness, cabecera: string): number {
  const hoja = h.spreadsheet.getSheetByName("Auxiliar")!;
  const fila = hoja.getRange(1, 1, 1, Math.max(hoja.getLastColumn(), 1)).getValues()[0];
  return fila.findIndex((c) => String(c ?? "").trim() === cabecera) + 1;
}

describe("catálogos auxiliares · lectura por cabecera", () => {
  it("la instalación crea las tres columnas, incluida cargo_bdp", () => {
    const h = loadInstalledBackend();
    const hoja = h.spreadsheet.getSheetByName("Auxiliar")!;
    const cabeceras = hoja
      .getRange(1, 1, 1, Math.max(hoja.getLastColumn(), 1))
      .getValues()[0]
      .map((c) => String(c ?? "").trim());
    expect(cabeceras).toContain("agencia_bdp");
    expect(cabeceras).toContain("gerencia_bdp");
    expect(cabeceras).toContain("cargo_bdp");

    const auxiliares = h.ok("documentacion.auxiliares").auxiliares;
    expect(Array.isArray(auxiliares.cargo_bdp)).toBe(true);
  });

  it("localiza la columna aunque la cabecera esté escrita de otra forma", () => {
    const h = loadInstalledBackend();
    const columna = columnaDe(h, "agencia_bdp");
    // El área renombra la cabecera al reorganizar la hoja: mayúsculas, espacios
    // de sobra y un espacio irrompible del copiar y pegar.
    escribirEnAuxiliar(h, [{ fila: 1, columna, valor: "  Agencia_BDP\u00a0 " }]);
    escribirEnAuxiliar(h, [
      { fila: 2, columna, valor: "LA PAZ" },
      { fila: 3, columna, valor: "EL ALTO" },
    ]);

    const auxiliares = h.ok("documentacion.auxiliares").auxiliares;
    expect(auxiliares.agencia_bdp).toContain("LA PAZ");
    expect(auxiliares.agencia_bdp).toContain("EL ALTO");
  });

  it("lee la columna entera aunque tenga huecos y sea más larga que las demás", () => {
    const h = loadInstalledBackend();
    const columna = columnaDe(h, "cargo_bdp");
    // Columna con un hueco en medio: detenerse en la primera celda vacía perdía
    // todo lo que venía después, que es el fallo reportado.
    escribirEnAuxiliar(h, [
      { fila: 2, columna, valor: "OFICIAL DE NEGOCIOS" },
      { fila: 3, columna, valor: "" },
      { fila: 4, columna, valor: "CAJERO" },
      { fila: 9, columna, valor: "JEFE DE AGENCIA" },
    ]);

    const cargos = h.ok("documentacion.auxiliares").auxiliares.cargo_bdp;
    expect(cargos).toContain("OFICIAL DE NEGOCIOS");
    expect(cargos).toContain("CAJERO");
    expect(cargos).toContain("JEFE DE AGENCIA");
  });

  it("deduplica sin distinguir mayúsculas ni acentos y conserva el texto escrito", () => {
    const h = loadInstalledBackend();
    const columna = columnaDe(h, "gerencia_bdp");
    escribirEnAuxiliar(h, [
      { fila: 30, columna, valor: "Gerencia de Auditoría" },
      { fila: 31, columna, valor: "GERENCIA DE AUDITORIA" },
      { fila: 32, columna, valor: "  gerencia   de auditoria  " },
    ]);

    const gerencias: string[] = h.ok("documentacion.auxiliares").auxiliares.gerencia_bdp;
    const clave = (v: string) =>
      v
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");
    const coincidencias = gerencias.filter((g) => clave(g) === "GERENCIA DE AUDITORIA");
    // Una sola entrada, y con el texto tal como lo escribió la primera persona.
    expect(coincidencias).toEqual(["Gerencia de Auditoría"]);
  });

  it("ordena alfabéticamente en español, con las tildes en su sitio", () => {
    const h = loadInstalledBackend();
    const columna = columnaDe(h, "cargo_bdp");
    escribirEnAuxiliar(h, [
      { fila: 40, columna, valor: "ZONAL" },
      { fila: 41, columna, valor: "ÁNALISTA" },
      { fila: 42, columna, valor: "MENSAJERO" },
    ]);
    const cargos: string[] = h.ok("documentacion.auxiliares").auxiliares.cargo_bdp;
    const posicion = (v: string) => cargos.findIndex((c) => c === v);
    expect(posicion("ÁNALISTA")).toBeLessThan(posicion("MENSAJERO"));
    expect(posicion("MENSAJERO")).toBeLessThan(posicion("ZONAL"));
  });

  it("no hay tope: trescientos valores llegan los trescientos", () => {
    const h = loadInstalledBackend();
    const valores = Array.from({ length: 300 }, (_, i) => `AGENCIA ${String(i + 1).padStart(3, "0")}`);
    h.ok("documentacion.auxiliares.agregar", { columna: "agencia_bdp", valores });
    h.call("doc2Reset_");
    const agencias: string[] = h.ok("documentacion.auxiliares").auxiliares.agencia_bdp;
    expect(agencias.filter((a) => a.startsWith("AGENCIA "))).toHaveLength(300);
  });
});

describe("catálogos auxiliares · escritura sin pisar nada", () => {
  it("añade debajo de todo lo escrito, aunque la columna tenga duplicados", () => {
    const h = loadInstalledBackend();
    const columna = columnaDe(h, "cargo_bdp");
    /* Duplicado deliberado: con el recuento deduplicado, la fila calculada caía
       sobre «CAJERO» y lo borraba. */
    escribirEnAuxiliar(h, [
      { fila: 2, columna, valor: "AUXILIAR" },
      { fila: 3, columna, valor: "auxiliar" },
      { fila: 4, columna, valor: "CAJERO" },
    ]);

    h.ok("documentacion.auxiliares.agregar", { columna: "cargo_bdp", valores: ["SUPERVISOR"] });
    h.call("doc2Reset_");

    const hoja = h.spreadsheet.getSheetByName("Auxiliar")!;
    const leidos = hoja
      .getRange(2, columna, 10, 1)
      .getValues()
      .map((f) => String(f[0] ?? "").trim())
      .filter(Boolean);
    // Nada se perdió y el valor nuevo quedó al final.
    expect(leidos).toContain("CAJERO");
    expect(leidos).toContain("AUXILIAR");
    expect(leidos[leidos.length - 1]).toBe("SUPERVISOR");
  });

  it("un valor que ya existe (con otras mayúsculas) no se duplica", () => {
    const h = loadInstalledBackend();
    h.ok("documentacion.auxiliares.agregar", { columna: "agencia_bdp", valores: ["TARIJA"] });
    h.call("doc2Reset_");
    const segundo = h.ok("documentacion.auxiliares.agregar", { columna: "agencia_bdp", valores: ["tarija "] });
    expect(segundo.agregados).toEqual([]);
  });

  it("una columna que no es catálogo auxiliar se rechaza con la lista de válidas", () => {
    const h = loadInstalledBackend();
    const res = h.pedir("documentacion.auxiliares.agregar", { columna: "sueldo_bdp", valores: ["X"] });
    expect(res.ok).toBe(false);
    expect(res.error.detalle.columnasValidas).toContain("cargo_bdp");
  });
});

describe("catálogo cargo_bdp · de punta a punta", () => {
  it("el cargo de un expediente nuevo entra al catálogo sin borrar nada", () => {
    const h = loadInstalledBackend();
    h.ok("documentacion.auxiliares.agregar", { columna: "cargo_bdp", valores: ["CAJERO"] });
    h.call("doc2Reset_");

    crearExpediente(h, { identificador: "8877665", nombre: "Nuevo Cargo", cargo: "OFICIAL DE MICROCRÉDITO" });
    h.call("doc2Reset_");

    const cargos: string[] = h.ok("documentacion.auxiliares").auxiliares.cargo_bdp;
    expect(cargos).toContain("OFICIAL DE MICROCRÉDITO");
    expect(cargos).toContain("CAJERO");
  });

  it("el diagnóstico avisa de la columna sin cabecera y de la vacía, y no bloquea", () => {
    const h = loadInstalledBackend();
    const columna = columnaDe(h, "cargo_bdp");
    // Se borra la cabecera a mano, como si alguien reorganizara la hoja.
    escribirEnAuxiliar(h, [{ fila: 1, columna, valor: "" }]);

    const revision = h.ok("documentacion.auxiliares").revision;
    expect(revision.sinCabecera).toContain("cargo_bdp");

    // Y aun así se puede registrar un expediente con su cargo: un catálogo sin
    // poblar nunca puede detener el trabajo real.
    const creado = crearExpediente(h, { identificador: "5544332", nombre: "Sin Catálogo", cargo: "PASANTE" });
    expect(creado.expediente.cargo).toBe("PASANTE");
  });

  it("el cargo fuera de catálogo es un aviso del diagnóstico, nunca un bloqueo", () => {
    const h = loadInstalledBackend();
    h.ok("documentacion.auxiliares.agregar", { columna: "cargo_bdp", valores: ["CAJERO", "AUXILIAR"] });
    h.call("doc2Reset_");

    // Se escribe directamente en la hoja para saltarse el aprendizaje automático
    // del catálogo que hace el alta.
    const creado = crearExpediente(h, { identificador: "1122334", nombre: "Cargo Raro", cargo: "CAJERO" });
    h.call("doc2Update_", "Expedientes", creado.expedienteId, { cargo: "INVENTADO DEL MES" }, h.ctx());
    h.call("docCommit_");
    h.call("doc2Reset_");

    const hallazgos = h.ok("documentacion.inconsistencias").hallazgos as { codigo: string; severidad: string }[];
    const cargo = hallazgos.find((x) => x.codigo === "cargo-fuera-catalogo");
    expect(cargo).toBeTruthy();
    expect(cargo!.severidad).toBe("ADVERTENCIA");
  });
});
