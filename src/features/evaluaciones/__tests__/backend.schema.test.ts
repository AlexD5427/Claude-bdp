import { describe, it, expect } from "vitest";
import {
  GS_FILES,
  listUndeclaredGsFiles,
  loadBackend,
  loadInstalledBackend,
} from "../../../../scripts/evaluaciones-backend.mjs";

/**
 * Esquema: instalación, verificación y reparación no destructiva.
 *
 * El módulo anterior obligaba a arreglar el libro a mano cuando el esquema
 * evolucionaba. Estas pruebas fijan la propiedad que lo sustituye: instalar es
 * idempotente, reparar añade lo que falta y NADA se pierde en el camino.
 */

describe("backend · esquema", () => {
  it("todos los archivos .gs del backend están declarados en el arnés", () => {
    expect(listUndeclaredGsFiles()).toEqual([]);
    expect(GS_FILES.length).toBeGreaterThan(20);
  });

  it("ping responde antes de instalar y dice que no está instalado", () => {
    const h = loadBackend();
    const res = h.admin("ping");
    expect(res.ok).toBe(true);
    expect(res.datos.instalado).toBe(false);
    expect(res.datos.servicio).toBe("evaluaciones");
    // El estado de autorización viaja desde la primera llamada: es lo que la
    // pantalla de conexión necesita para orientar al operador.
    expect(res.datos.autorizacion.modo).toBe("llave");
  });

  it("instalar crea todas las hojas del manifiesto y es idempotente", () => {
    const h = loadBackend();
    const primera = h.admin("install");
    expect(primera.ok).toBe(true);
    expect(primera.datos.informe.ok).toBe(true);
    expect(primera.datos.informe.missingSheets).toEqual([]);

    const creadas = primera.datos.acciones.filter((a: { action: string }) => a.action === "creada");
    const esperadas: string[] = h.read("EV_SHEET_ORDER");
    expect(creadas).toHaveLength(esperadas.length);

    const segunda = h.admin("install");
    expect(segunda.ok).toBe(true);
    for (const accion of segunda.datos.acciones) {
      expect(accion.action).toBe("sin cambios");
    }
  });

  it("cada hoja declarada tiene clave primaria y columnas con tipo conocido", () => {
    const h = loadBackend();
    const schema = h.read("EV_SCHEMA");
    const tipos = new Set(["id", "text", "long", "int", "num", "bool", "iso", "json"]);
    for (const [nombre, definicion] of Object.entries(schema) as [string, any][]) {
      expect(definicion.key, `${nombre} necesita clave`).toBeTruthy();
      expect(definicion.describe, `${nombre} necesita descripción`).toBeTruthy();
      const nombres = definicion.columns.map((c: { name: string }) => c.name);
      expect(nombres, `${nombre} debe incluir su clave`).toContain(definicion.key);
      expect(new Set(nombres).size, `${nombre} tiene columnas repetidas`).toBe(nombres.length);
      for (const columna of definicion.columns) {
        expect(tipos.has(columna.type), `${nombre}.${columna.name} usa el tipo ${columna.type}`).toBe(true);
      }
    }
  });

  it("una columna borrada a mano se detecta y se repara sin perder datos", () => {
    const h = loadInstalledBackend();
    const creada = h.admin("createEvaluation", { titulo: "Con datos" });
    expect(creada.ok).toBe(true);
    const id = creada.datos.evaluacion.id;

    // Simula que alguien renombró un encabezado en el libro.
    const hoja = h.spreadsheet.getSheetByName("Evaluaciones");
    const encabezados: string[] = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    const indice = encabezados.indexOf("notas_internas");
    expect(indice).toBeGreaterThanOrEqual(0);
    hoja.getRange(1, indice + 1).setValue("notas internas");

    const roto = h.admin("listEvaluations");
    expect(roto.ok).toBe(false);
    expect(roto.error.codigo).toBe("SCHEMA_ERROR");
    expect(roto.error.detalle.missingColumns).toContain("notas_internas");
    // El mensaje tiene que decir qué hacer, no solo que algo falló.
    expect(roto.error.pista).toMatch(/reparar/i);

    const reparado = h.admin("repair");
    expect(reparado.ok).toBe(true);
    const listado = h.admin("listEvaluations");
    expect(listado.ok).toBe(true);
    // La evaluación sigue ahí: reparar añade columnas, no reescribe filas.
    expect(listado.datos.items.map((i: { id: string }) => i.id)).toContain(id);
  });

  it("el diagnóstico distingue «no instalado» de «instalado a medias»", () => {
    const sinInstalar = loadBackend();
    const primero = sinInstalar.admin("diagnose");
    expect(primero.ok).toBe(true);
    expect(primero.datos.estado).toBe("critico");
    expect(primero.datos.hallazgos.map((h: { codigo: string }) => h.codigo)).toContain("NO_INSTALADO");

    const instalado = loadInstalledBackend();
    const segundo = instalado.admin("diagnose");
    expect(segundo.datos.hallazgos.map((h: { codigo: string }) => h.codigo)).not.toContain("NO_INSTALADO");
  });

  it("una acción sobre un libro sin instalar responde NOT_INSTALLED con su remedio", () => {
    const h = loadBackend();
    const res = h.admin("listEvaluations");
    expect(res.ok).toBe(false);
    expect(res.error.codigo).toBe("NOT_INSTALLED");
    expect(res.error.pista).toMatch(/Instalar o reparar/);
  });

  it("las columnas propias del usuario se respetan y solo se informan", () => {
    const h = loadInstalledBackend();
    const hoja = h.spreadsheet.getSheetByName("Evaluaciones");
    hoja.getRange(1, hoja.getLastColumn() + 1).setValue("mi_columna");

    const listado = h.admin("listEvaluations");
    expect(listado.ok).toBe(true);

    const diag = h.admin("diagnose");
    const extra = diag.datos.hallazgos.find((x: { codigo: string }) => x.codigo === "COLUMNAS_EXTRA");
    expect(extra).toBeTruthy();
    expect(extra.severidad).toBe("info");
    expect(extra.datos.columnasExtra).toContain("mi_columna");
  });
});
