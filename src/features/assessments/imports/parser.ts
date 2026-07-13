import { unzipSync, strFromU8 } from "fflate";
import { appError } from "../../../shared/errors";

/**
 * Safe spreadsheet parsing.
 *
 * SECURITY: we deliberately avoid heavyweight parsers with known advisories.
 * Instead we parse only what we need — the cached cell *values* — and never
 * evaluate formulas or execute anything:
 *   · CSV / TSV  → a small, quote-aware tokenizer.
 *   · XLSX / ODS → unzipped with `fflate` and read via the browser's DOMParser,
 *     pulling shared strings + cell values. Formula cells contribute only their
 *     last cached value (`<v>` / `office:value`), never the formula text.
 *
 * Limits (rows, size) are enforced by the caller before parsing.
 */

export interface ParsedSheet {
  name: string;
  rows: string[][];
}

export interface ParsedWorkbook {
  sheets: ParsedSheet[];
}

export type SupportedExtension = "xlsx" | "csv" | "ods" | "tsv";

export function detectExtension(filename: string): SupportedExtension | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx")) return "xlsx";
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".ods")) return "ods";
  if (lower.endsWith(".tsv")) return "tsv";
  return null;
}

/* ---- CSV / TSV --------------------------------------------------- */

/** Quote-aware delimited parser (handles quoted fields, escaped quotes, CRLF). */
export function parseDelimited(text: string, delimiter: string): string[][] {
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
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // handled by the \n branch; skip lone CR
    } else {
      field += ch;
    }
  }
  // Flush the trailing field/row.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/* ---- XLSX -------------------------------------------------------- */

function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, "application/xml");
}

function columnToIndex(ref: string): number {
  // "B3" → column index 1. Parse the leading letters.
  const letters = ref.replace(/[0-9]/g, "");
  let index = 0;
  for (const ch of letters) index = index * 26 + (ch.charCodeAt(0) - 64);
  return index - 1;
}

function parseXlsx(data: Uint8Array): ParsedWorkbook {
  const files = unzipSync(data);

  // Shared strings.
  const sharedStrings: string[] = [];
  const sst = files["xl/sharedStrings.xml"];
  if (sst) {
    const doc = parseXml(strFromU8(sst));
    for (const si of Array.from(doc.getElementsByTagName("si"))) {
      // Concatenate all <t> descendants (handles rich text runs).
      const texts = Array.from(si.getElementsByTagName("t")).map((t) => t.textContent ?? "");
      sharedStrings.push(texts.join(""));
    }
  }

  // Sheet name → path map from the workbook + rels.
  const sheetPaths: { name: string; path: string }[] = [];
  const workbook = files["xl/workbook.xml"];
  const rels = files["xl/_rels/workbook.xml.rels"];
  if (workbook && rels) {
    const wbDoc = parseXml(strFromU8(workbook));
    const relDoc = parseXml(strFromU8(rels));
    const relMap = new Map<string, string>();
    for (const r of Array.from(relDoc.getElementsByTagName("Relationship"))) {
      relMap.set(r.getAttribute("Id") ?? "", r.getAttribute("Target") ?? "");
    }
    for (const sheet of Array.from(wbDoc.getElementsByTagName("sheet"))) {
      const name = sheet.getAttribute("name") ?? "Hoja";
      const rid = sheet.getAttribute("r:id") ?? sheet.getAttribute("id") ?? "";
      let target = relMap.get(rid) ?? "";
      if (target && !target.startsWith("xl/")) target = `xl/${target.replace(/^\//, "")}`;
      if (target) sheetPaths.push({ name, path: target });
    }
  }
  // Fallback: any sheet under xl/worksheets.
  if (sheetPaths.length === 0) {
    Object.keys(files)
      .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
      .forEach((path, i) => sheetPaths.push({ name: `Hoja ${i + 1}`, path }));
  }

  const sheets: ParsedSheet[] = [];
  for (const { name, path } of sheetPaths) {
    const raw = files[path];
    if (!raw) continue;
    const doc = parseXml(strFromU8(raw));
    const rows: string[][] = [];
    for (const rowEl of Array.from(doc.getElementsByTagName("row"))) {
      const cells: string[] = [];
      for (const c of Array.from(rowEl.getElementsByTagName("c"))) {
        const ref = c.getAttribute("r") ?? "";
        const colIdx = ref ? columnToIndex(ref) : cells.length;
        const type = c.getAttribute("t");
        let value = "";
        if (type === "inlineStr") {
          value = Array.from(c.getElementsByTagName("t")).map((t) => t.textContent ?? "").join("");
        } else {
          // <v> is the cached value even for formula cells; we never read <f>.
          const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
          value = type === "s" ? (sharedStrings[Number(v)] ?? "") : v;
        }
        cells[colIdx] = value;
      }
      // Normalise holes to empty strings.
      for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = "";
      if (cells.some((c) => c.trim() !== "")) rows.push(cells);
    }
    sheets.push({ name, rows });
  }
  return { sheets };
}

/* ---- ODS --------------------------------------------------------- */

function parseOds(data: Uint8Array): ParsedWorkbook {
  const files = unzipSync(data);
  const content = files["content.xml"];
  if (!content) throw appError("parse", "ODS sin content.xml");
  const doc = parseXml(strFromU8(content));
  const sheets: ParsedSheet[] = [];

  const tables = Array.from(doc.getElementsByTagName("table:table"));
  for (const table of tables) {
    const name = table.getAttribute("table:name") ?? "Hoja";
    const rows: string[][] = [];
    for (const rowEl of Array.from(table.getElementsByTagName("table:table-row"))) {
      const cells: string[] = [];
      for (const cell of Array.from(rowEl.getElementsByTagName("table:table-cell"))) {
        const repeat = Number(cell.getAttribute("table:number-columns-repeated") ?? "1");
        // Prefer the typed office:value; else the paragraph text.
        const officeValue = cell.getAttribute("office:value");
        const text = Array.from(cell.getElementsByTagName("text:p")).map((p) => p.textContent ?? "").join(" ");
        const value = officeValue != null && text === "" ? officeValue : text;
        for (let r = 0; r < Math.min(repeat, 1024); r++) cells.push(value);
      }
      if (cells.some((c) => c.trim() !== "")) rows.push(cells);
    }
    sheets.push({ name, rows });
  }
  return { sheets };
}

/* ---- public API -------------------------------------------------- */

export function parseWorkbook(ext: SupportedExtension, data: ArrayBuffer, text?: string): ParsedWorkbook {
  try {
    if (ext === "csv") return { sheets: [{ name: "CSV", rows: parseDelimited(text ?? "", ",") }] };
    if (ext === "tsv") return { sheets: [{ name: "TSV", rows: parseDelimited(text ?? "", "\t") }] };
    const bytes = new Uint8Array(data);
    if (ext === "xlsx") return parseXlsx(bytes);
    if (ext === "ods") return parseOds(bytes);
    throw appError("unsupported");
  } catch (err) {
    if (err && typeof err === "object" && "code" in err) throw err;
    throw appError("parse", err instanceof Error ? err.message : undefined);
  }
}
