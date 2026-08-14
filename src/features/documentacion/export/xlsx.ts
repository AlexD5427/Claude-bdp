/**
 * Generador de libros de Excel (.xlsx) en el navegador.
 *
 * ── Por qué se escribe el XLSX aquí y no en el servidor ──────────────────────
 * Apps Script podría crear una hoja de cálculo nueva en Drive, pero eso significa
 * dejar archivos temporales con datos personales en la unidad de alguien, con su
 * propio ciclo de vida y sus propios permisos. Aquí el archivo se arma en la
 * memoria del navegador con los datos que el backend ya devolvió por lotes y se
 * descarga; no queda copia en ningún sitio.
 *
 * ── Formato ─────────────────────────────────────────────────────────────────
 * Un `.xlsx` es un ZIP con XML dentro. Se generan las cinco piezas mínimas que
 * Excel, LibreOffice y Google Sheets aceptan sin quejarse:
 *
 *   [Content_Types].xml     qué tipo es cada pieza
 *   _rels/.rels             la relación raíz hacia el libro
 *   xl/workbook.xml         las hojas y sus nombres
 *   xl/_rels/workbook…      la relación de cada hoja con su archivo
 *   xl/worksheets/sheetN     las celdas
 *
 * No se usan cadenas compartidas (`sharedStrings`): con `t="inlineStr"` cada celda
 * lleva su texto. El archivo pesa algo más y el generador es la mitad de código y
 * la mitad de sitios donde equivocarse.
 *
 * ── Protección contra fórmulas ──────────────────────────────────────────────
 * Todo texto que empieza por `=`, `+`, `-` o `@` se escribe con un apóstrofo
 * delante. El backend ya lo hace para lo que sale de sus hojas; aquí se repite
 * porque este archivo también recibe datos de la vista local y una exportación no
 * debería poder ejecutar nada al abrirse.
 */

import { zipSync, strToU8 } from "fflate";

export type Celda = string | number | boolean | null | undefined;
export type Hoja = Celda[][];
export type Libro = Record<string, Hoja>;

/** Escapa lo que XML no admite dentro de un nodo de texto. */
function escaparXml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // Los caracteres de control rompen el archivo y no aportan nada.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

/** Neutraliza fórmulas de hoja de cálculo. */
export function celdaSegura(valor: Celda): Celda {
  if (typeof valor !== "string") return valor;
  if (/^[=+\-@\t\r]/.test(valor)) return `'${valor}`;
  return valor;
}

/** Referencia A1 de una posición. La columna 27 es AA, no [. */
export function referencia(fila: number, columna: number): string {
  let n = columna;
  let letras = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    letras = String.fromCharCode(65 + resto) + letras;
    n = Math.floor((n - resto) / 26);
  }
  return `${letras}${fila}`;
}

/**
 * Nombre de hoja admisible para Excel.
 *
 * Excel rechaza `: \ / ? * [ ]` y más de 31 caracteres. Un nombre inválido no da
 * error al generar: da un archivo que no abre, que es mucho peor.
 */
export function nombreDeHoja(nombre: string, usados: Set<string>): string {
  let limpio = String(nombre || "Hoja").replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Hoja";
  let candidato = limpio;
  let sufijo = 2;
  while (usados.has(candidato.toLowerCase())) {
    const espacio = 31 - String(sufijo).length - 1;
    candidato = `${limpio.slice(0, espacio)} ${sufijo}`;
    sufijo += 1;
  }
  usados.add(candidato.toLowerCase());
  return candidato;
}

function celdaXml(fila: number, columna: number, valor: Celda): string {
  const ref = referencia(fila, columna);
  const seguro = celdaSegura(valor);
  if (seguro === null || seguro === undefined || seguro === "") return "";
  if (typeof seguro === "number" && Number.isFinite(seguro)) {
    return `<c r="${ref}"><v>${seguro}</v></c>`;
  }
  if (typeof seguro === "boolean") {
    return `<c r="${ref}" t="b"><v>${seguro ? 1 : 0}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escaparXml(String(seguro))}</t></is></c>`;
}

function hojaXml(filas: Hoja): string {
  const lineas: string[] = [];
  for (let f = 0; f < filas.length; f++) {
    const celdas = filas[f] ?? [];
    const xml = celdas.map((valor, indice) => celdaXml(f + 1, indice + 1, valor)).join("");
    lineas.push(`<row r="${f + 1}">${xml}</row>`);
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${lineas.join("")}</sheetData></worksheet>`;
}

/**
 * Construye el `.xlsx` como bytes.
 *
 * Se devuelve el `Uint8Array` en lugar de descargarlo directamente para que se
 * pueda probar sin un navegador: la prueba genera el archivo, lo descomprime y
 * comprueba que las celdas están donde deben.
 */
export function construirXlsx(libro: Libro): Uint8Array {
  const nombres = Object.keys(libro);
  if (!nombres.length) throw new Error("Un libro necesita al menos una hoja.");

  const usados = new Set<string>();
  const hojas = nombres.map((nombre, indice) => ({
    id: indice + 1,
    nombre: nombreDeHoja(nombre, usados),
    filas: libro[nombre] ?? [],
  }));

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${hojas
  .map(
    (h) =>
      `<Override PartName="/xl/worksheets/sheet${h.id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  )
  .join("\n")}
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${hojas.map((h) => `<sheet name="${escaparXml(h.nombre)}" sheetId="${h.id}" r:id="rId${h.id}"/>`).join("")}</sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${hojas
  .map(
    (h) =>
      `<Relationship Id="rId${h.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${h.id}.xml"/>`,
  )
  .join("\n")}
</Relationships>`;

  const archivos: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rels),
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRels),
  };
  for (const hoja of hojas) {
    archivos[`xl/worksheets/sheet${hoja.id}.xml`] = strToU8(hojaXml(hoja.filas));
  }

  return zipSync(archivos, { level: 6 });
}

/**
 * Descarga el libro con un nombre de archivo.
 *
 * Se revoca la URL temporal: sin eso, cada exportación deja los bytes del archivo
 * retenidos en memoria hasta que se recarga la página, y una sesión con veinte
 * exportaciones grandes se nota.
 */
export function descargarXlsx(libro: Libro, nombreArchivo: string): { bytes: number; nombre: string } {
  const datos = construirXlsx(libro);
  const nombre = nombreArchivo.toLowerCase().endsWith(".xlsx") ? nombreArchivo : `${nombreArchivo}.xlsx`;
  if (typeof document === "undefined") return { bytes: datos.length, nombre };

  const blob = new Blob([datos as unknown as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { bytes: datos.length, nombre };
}

/**
 * Une los lotes que devuelve el backend en un solo libro.
 *
 * El primer lote trae el encabezado de cada hoja y los siguientes solo filas. Unir
 * es concatenar respetando ese orden; si se mezclaran, el archivo tendría el
 * encabezado en medio de los datos.
 */
export function unirLotes(lotes: Record<string, Celda[][]>[]): Libro {
  const libro: Libro = {};
  for (const lote of lotes) {
    for (const [hoja, filas] of Object.entries(lote)) {
      if (!filas?.length) continue;
      libro[hoja] = (libro[hoja] ?? []).concat(filas);
    }
  }
  return libro;
}

/** Nombre de archivo con fecha, para que no se pisen dos descargas del mismo día. */
export function nombreConFecha(base: string): string {
  const d = new Date();
  const sello = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(
    d.getHours(),
  ).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
  return `${base}-${sello}.xlsx`;
}
