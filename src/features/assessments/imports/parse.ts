/**
 * Spreadsheet parsing.
 *
 * Reads .csv directly, and .xlsx/.ods by unzipping the OpenXML/ODF container
 * with `fflate` and extracting cell text from the sheet XML. We intentionally
 * do NOT evaluate formulas, macros, HTML, or scripts — only literal cell values
 * are read. Size, worksheet, and row limits guard against resource exhaustion.
 */

import { unzipSync, strFromU8 } from "fflate";

export interface ParsedWorksheet {
  name: string;
  /** First row is treated as headers by the wizard, but stored raw here. */
  rows: string[][];
}

export interface ParsedWorkbook {
  fileType: "xlsx" | "csv" | "ods";
  worksheets: ParsedWorksheet[];
}

export const IMPORT_LIMITS = {
  maxBytes: 10 * 1024 * 1024, // 10 MB
  maxWorksheets: 20,
  maxRows: 5000,
  maxCols: 100,
};

export class ImportError extends Error {}

/** Detect the file type from its name/extension. */
export function detectFileType(fileName: string): ParsedWorkbook["fileType"] | "unknown" {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "csv") return "csv";
  if (ext === "xlsx") return "xlsx";
  if (ext === "ods") return "ods";
  return "unknown";
}

/** Parse a CSV string into rows, honoring quoted fields and escaped quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Column letter (A, B, .., AA) → zero-based index. */
function colToIndex(col: string): number {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Extract shared strings from an xlsx workbook (sst). */
function readSharedStrings(files: Record<string, Uint8Array>): string[] {
  const raw = files["xl/sharedStrings.xml"];
  if (!raw) return [];
  const xml = strFromU8(raw);
  const strings: string[] = [];
  // Each <si> may contain multiple <t> runs; concatenate their text.
  const siMatches = xml.match(/<si>[\s\S]*?<\/si>/g) ?? [];
  for (const si of siMatches) {
    const texts = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1]));
    strings.push(texts.join(""));
  }
  return strings;
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

/** Parse one xlsx sheet XML into a dense row/col grid. */
function parseXlsxSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  const rowMatches = xml.match(/<row[^>]*>[\s\S]*?<\/row>/g) ?? [];
  for (const rowXml of rowMatches.slice(0, IMPORT_LIMITS.maxRows)) {
    const cells: string[] = [];
    const cellMatches = [...rowXml.matchAll(/<c r="([A-Z]+)\d+"(?:[^>]*?\st="([^"]+)")?[^>]*>([\s\S]*?)<\/c>/g)];
    for (const m of cellMatches) {
      const colIdx = colToIndex(m[1]);
      const type = m[2];
      const inner = m[3];
      const valueMatch = inner.match(/<v>([\s\S]*?)<\/v>/) ?? inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
      let value = valueMatch ? decodeXml(valueMatch[1]) : "";
      if (type === "s") value = shared[Number(value)] ?? "";
      cells[colIdx] = value;
    }
    // Densify (fill gaps with empty strings).
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = "";
    rows.push(cells.slice(0, IMPORT_LIMITS.maxCols));
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function parseXlsx(bytes: Uint8Array): ParsedWorksheet[] {
  const files = unzipSync(bytes);
  const shared = readSharedStrings(files);

  // Map sheet name → target file via workbook.xml + rels.
  const workbookXml = files["xl/workbook.xml"] ? strFromU8(files["xl/workbook.xml"]) : "";
  const relsXml = files["xl/_rels/workbook.xml.rels"]
    ? strFromU8(files["xl/_rels/workbook.xml.rels"])
    : "";
  const relMap = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/?>/g)) {
    relMap.set(m[1], m[2].replace(/^\/?xl\//, "").replace(/^\//, ""));
  }
  const sheetDefs = [...workbookXml.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/?>/g)];

  const worksheets: ParsedWorksheet[] = [];
  if (sheetDefs.length) {
    for (const [, name, rid] of sheetDefs.slice(0, IMPORT_LIMITS.maxWorksheets)) {
      const target = relMap.get(rid);
      const path = target ? `xl/${target}` : "";
      const raw = files[path];
      if (!raw) continue;
      worksheets.push({ name: decodeXml(name), rows: parseXlsxSheet(strFromU8(raw), shared) });
    }
  }
  // Fallback: any sheet files found directly.
  if (worksheets.length === 0) {
    const sheetPaths = Object.keys(files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f));
    sheetPaths.slice(0, IMPORT_LIMITS.maxWorksheets).forEach((p, i) => {
      worksheets.push({ name: `Hoja ${i + 1}`, rows: parseXlsxSheet(strFromU8(files[p]), shared) });
    });
  }
  return worksheets;
}

/** Parse an ODS spreadsheet (content.xml holds all tables). */
function parseOds(bytes: Uint8Array): ParsedWorksheet[] {
  const files = unzipSync(bytes);
  const content = files["content.xml"] ? strFromU8(files["content.xml"]) : "";
  const worksheets: ParsedWorksheet[] = [];
  const tableMatches = [...content.matchAll(/<table:table[^>]*table:name="([^"]+)"[^>]*>([\s\S]*?)<\/table:table>/g)];
  for (const [, name, body] of tableMatches.slice(0, IMPORT_LIMITS.maxWorksheets)) {
    const rows: string[][] = [];
    const rowMatches = [...body.matchAll(/<table:table-row[^>]*>([\s\S]*?)<\/table:table-row>/g)];
    for (const [, rowBody] of rowMatches.slice(0, IMPORT_LIMITS.maxRows)) {
      const cells: string[] = [];
      const cellMatches = [...rowBody.matchAll(/<table:table-cell[^>]*>([\s\S]*?)<\/table:table-cell>|<table:table-cell[^>]*\/>/g)];
      for (const m of cellMatches) {
        const inner = m[1] ?? "";
        const texts = [...inner.matchAll(/<text:p[^>]*>([\s\S]*?)<\/text:p>/g)].map((t) => decodeXml(t[1].replace(/<[^>]+>/g, "")));
        cells.push(texts.join(" ").trim());
      }
      if (cells.some((c) => c.trim() !== "")) rows.push(cells.slice(0, IMPORT_LIMITS.maxCols));
    }
    worksheets.push({ name: decodeXml(name), rows });
  }
  return worksheets;
}

/** Parse an uploaded file (as bytes + name) into a workbook. */
export async function parseWorkbook(fileName: string, bytes: Uint8Array): Promise<ParsedWorkbook> {
  if (bytes.byteLength > IMPORT_LIMITS.maxBytes) {
    throw new ImportError("El archivo supera el tamaño máximo permitido (10 MB).");
  }
  const fileType = detectFileType(fileName);
  if (fileType === "unknown") {
    throw new ImportError("Formato no compatible. Usa .xlsx, .csv o .ods.");
  }
  try {
    if (fileType === "csv") {
      return { fileType, worksheets: [{ name: "CSV", rows: parseCsv(strFromU8(bytes)) }] };
    }
    if (fileType === "xlsx") {
      return { fileType, worksheets: parseXlsx(bytes) };
    }
    return { fileType, worksheets: parseOds(bytes) };
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError("No se pudo leer el archivo. Verifica que no esté dañado.");
  }
}
