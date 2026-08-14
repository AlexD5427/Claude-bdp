import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { celdaSegura, construirXlsx, descargarXlsx, nombreConFecha, nombreDeHoja, referencia, unirLotes } from "../export/xlsx";

/**
 * Generador de libros de Excel.
 *
 * Un `.xlsx` mal formado no da error al generarse: da un archivo que no abre. Estas
 * pruebas descomprimen el resultado y comprueban las piezas y las celdas, que es la
 * única forma de saber que el archivo es válido sin abrir Excel.
 */

function abrir(bytes: Uint8Array): Record<string, string> {
  const zip = unzipSync(bytes);
  const salida: Record<string, string> = {};
  for (const [nombre, contenido] of Object.entries(zip)) salida[nombre] = strFromU8(contenido);
  return salida;
}

describe("exportación · referencias y nombres", () => {
  it("la referencia A1 pasa de Z a AA", () => {
    expect(referencia(1, 1)).toBe("A1");
    expect(referencia(3, 2)).toBe("B3");
    expect(referencia(1, 26)).toBe("Z1");
    expect(referencia(1, 27)).toBe("AA1");
    expect(referencia(10, 52)).toBe("AZ10");
  });

  it("los nombres de hoja se recortan, se limpian y no se repiten", () => {
    const usados = new Set<string>();
    expect(nombreDeHoja("Resumen", usados)).toBe("Resumen");
    // Excel rechaza estos caracteres: un nombre inválido produce un archivo que no abre.
    expect(nombreDeHoja("Datos/Generales:2026", usados)).toBe("Datos Generales 2026");
    expect(nombreDeHoja("Resumen", usados)).toBe("Resumen 2");
    expect(nombreDeHoja("x".repeat(60), usados).length).toBeLessThanOrEqual(31);
  });

  it("una celda que empieza por = se escribe como texto", () => {
    expect(celdaSegura("=IMPORTRANGE(\"otro\",\"A1\")")).toBe("'=IMPORTRANGE(\"otro\",\"A1\")");
    expect(celdaSegura("+1234")).toBe("'+1234");
    expect(celdaSegura("@usuario")).toBe("'@usuario");
    expect(celdaSegura("Texto normal")).toBe("Texto normal");
    expect(celdaSegura(42)).toBe(42);
  });
});

describe("exportación · estructura del archivo", () => {
  it("el libro trae las cinco piezas que Excel exige", () => {
    const bytes = construirXlsx({ Resumen: [["a", "b"], [1, 2]] });
    const piezas = abrir(bytes);
    expect(Object.keys(piezas).sort()).toEqual(
      ["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/workbook.xml", "xl/worksheets/sheet1.xml"].sort(),
    );
    expect(piezas["xl/workbook.xml"]).toContain('name="Resumen"');
  });

  it("una hoja por cada clave, en orden y con su relación", () => {
    const bytes = construirXlsx({ Resumen: [["a"]], Expedientes: [["b"]], Requisitos: [["c"]] });
    const piezas = abrir(bytes);
    expect(piezas["xl/worksheets/sheet1.xml"]).toContain("a");
    expect(piezas["xl/worksheets/sheet2.xml"]).toContain("b");
    expect(piezas["xl/worksheets/sheet3.xml"]).toContain("c");
    expect(piezas["xl/_rels/workbook.xml.rels"]).toContain("sheet3.xml");
  });

  it("los números van como números y los textos como cadena en línea", () => {
    const bytes = construirXlsx({ Hoja: [["Nombre", "Avance"], ["Ana", 87]] });
    const hoja = abrir(bytes)["xl/worksheets/sheet1.xml"];
    expect(hoja).toContain('<c r="B2"><v>87</v></c>');
    expect(hoja).toContain('t="inlineStr"');
    expect(hoja).toContain("Ana");
  });

  it("los caracteres especiales de XML se escapan", () => {
    const bytes = construirXlsx({ Hoja: [['Muñoz & <Cía> "S.A."']] });
    const hoja = abrir(bytes)["xl/worksheets/sheet1.xml"];
    expect(hoja).toContain("&amp;");
    expect(hoja).toContain("&lt;");
    expect(hoja).toContain("Muñoz");
  });

  it("las celdas vacías no se escriben, para no inflar el archivo", () => {
    const bytes = construirXlsx({ Hoja: [["a", "", null, "d"]] });
    const hoja = abrir(bytes)["xl/worksheets/sheet1.xml"];
    expect(hoja).toContain('r="A1"');
    expect(hoja).not.toContain('r="B1"');
    expect(hoja).toContain('r="D1"');
  });

  it("una fórmula exportada llega neutralizada", () => {
    const bytes = construirXlsx({ Hoja: [["=1+1"]] });
    const hoja = abrir(bytes)["xl/worksheets/sheet1.xml"];
    expect(hoja).toContain("&apos;=1+1");
  });

  it("un libro sin hojas se rechaza en lugar de producir un archivo roto", () => {
    expect(() => construirXlsx({})).toThrow(/al menos una hoja/i);
  });

  it("un libro con mil filas se genera y pesa lo razonable", () => {
    const filas = [["Identificador", "Nombre", "Avance"]];
    for (let i = 0; i < 1000; i += 1) filas.push([`CI-${i}-2026`, `Persona ${i}`, String(i % 101)]);
    const bytes = construirXlsx({ Expedientes: filas });
    expect(bytes.length).toBeGreaterThan(1000);
    // Comprimido, mil filas ocupan menos de 200 KB.
    expect(bytes.length).toBeLessThan(200_000);
    const hoja = abrir(bytes)["xl/worksheets/sheet1.xml"];
    expect(hoja).toContain('<row r="1001">');
  });
});

describe("exportación · unión de lotes", () => {
  it("el encabezado del primer lote queda arriba y los siguientes se añaden debajo", () => {
    const libro = unirLotes([
      { Expedientes: [["Identificador", "Nombre"], ["CI-1", "Ana"]], Requisitos: [["Codigo"], ["cv"]] },
      { Expedientes: [["CI-2", "Bruno"]], Requisitos: [["rejap"]] },
      { Expedientes: [["CI-3", "Clara"]] },
    ]);
    expect(libro.Expedientes.length).toBe(4);
    expect(libro.Expedientes[0]).toEqual(["Identificador", "Nombre"]);
    expect(libro.Expedientes[3]).toEqual(["CI-3", "Clara"]);
    // Requisitos: encabezado + una fila por lote (dos lotes lo traen).
    expect(libro.Requisitos.length).toBe(3);
    expect(libro.Requisitos[2]).toEqual(["rejap"]);
  });

  it("las hojas vacías no aparecen en el libro final", () => {
    const libro = unirLotes([{ Expedientes: [["a"]], Historial: [] }]);
    expect(Object.keys(libro)).toEqual(["Expedientes"]);
  });
});

describe("exportación · descarga", () => {
  it("descargar en jsdom devuelve el tamaño y el nombre con extensión", () => {
    const resultado = descargarXlsx({ Hoja: [["a"]] }, "prueba");
    expect(resultado.nombre).toBe("prueba.xlsx");
    expect(resultado.bytes).toBeGreaterThan(0);
  });

  it("el nombre lleva fecha y hora para que dos descargas no se pisen", () => {
    const nombre = nombreConFecha("documentacion-completo");
    expect(nombre).toMatch(/^documentacion-completo-\d{8}-\d{4}\.xlsx$/);
  });
});
