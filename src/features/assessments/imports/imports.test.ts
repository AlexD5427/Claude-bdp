import { describe, it, expect, beforeAll } from "vitest";
import { parseCsv } from "./parse";
import { autoMapColumns, convertRows, type MappedRow, STANDARD_COLUMNS } from "./convert";
import { bootstrapPlugins } from "../question-types";
import { csvField, guardCsvCell } from "../../../shared/sanitize";
import { toPublicAssessmentDTO } from "../../../infrastructure/mappers/publicDto";

beforeAll(() => bootstrapPlugins());

const HEADERS = [
  "nombre_evaluacion",
  "seccion",
  "codigo_pregunta",
  "texto_pregunta",
  "tipo",
  "obligatorio",
  "opciones",
  "respuesta_correcta",
  "puntos",
];

function rowsFromGrid(headers: string[], grid: string[][]): MappedRow[] {
  const map = autoMapColumns(headers);
  return grid.map((cells, r) => {
    const values: MappedRow["values"] = {};
    cells.forEach((c, i) => {
      const col = map[i];
      if (col) values[col] = c;
    });
    return { index: r + 2, values }; // +2: 1-based + header row
  });
}

describe("csv parsing", () => {
  it("parses quoted fields, escaped quotes, and skips blank rows", () => {
    const csv = 'a,b\n"hola, mundo","dice ""hola"""\n\n1,2\n';
    const rows = parseCsv(csv);
    expect(rows).toEqual([
      ["a", "b"],
      ["hola, mundo", 'dice "hola"'],
      ["1", "2"],
    ]);
  });
});

describe("column auto-mapping", () => {
  it("maps Spanish headers to standard columns", () => {
    const map = autoMapColumns(HEADERS);
    expect(map[0]).toBe("evaluation_name");
    expect(map[3]).toBe("question_text");
    expect(map[4]).toBe("question_type");
  });

  it("exposes the full standard column set", () => {
    expect(STANDARD_COLUMNS.length).toBeGreaterThan(15);
  });
});

describe("row conversion", () => {
  it("converts valid rows into a reviewable draft (never published)", () => {
    const grid = [
      ["Preselección", "Generales", "Q1", "¿Capital de México?", "opcion_unica", "si", "CDMX|Guadalajara", "CDMX", "1"],
    ];
    const { draft, issues, validRowCount } = convertRows(rowsFromGrid(HEADERS, grid), "u1");
    expect(validRowCount).toBe(1);
    expect(draft).not.toBeNull();
    expect(draft!.publication).toBe("unpublished");
    expect(draft!.lifecycle).toBe("draft");
    // The draft has no published version, so nothing is publicly served yet.
    expect(toPublicAssessmentDTO(draft!)).toBeNull();
    expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
    const block = draft!.draftVersion.content.sections[0].blocks[0];
    expect(block.options.find((o) => o.label === "CDMX")?.correct).toBe(true);
  });

  it("reports missing question text as an error and omits the row", () => {
    const grid = [["Eval", "S", "Q1", "", "texto_corto", "no", "", "", ""]];
    const { draft, issues } = convertRows(rowsFromGrid(HEADERS, grid), "u1");
    expect(draft).toBeNull();
    expect(issues.some((i) => i.column === "question_text" && i.severity === "error")).toBe(true);
  });

  it("reports an unsupported question type", () => {
    const grid = [["Eval", "S", "Q1", "Texto", "tipo_raro", "no", "", "", ""]];
    const { issues } = convertRows(rowsFromGrid(HEADERS, grid), "u1");
    expect(issues.some((i) => i.column === "question_type")).toBe(true);
  });

  it("reports duplicate question codes", () => {
    const grid = [
      ["Eval", "S", "Q1", "Uno", "texto_corto", "no", "", "", ""],
      ["Eval", "S", "Q1", "Dos", "texto_corto", "no", "", "", ""],
    ];
    const { issues } = convertRows(rowsFromGrid(HEADERS, grid), "u1");
    expect(issues.some((i) => i.problem.toLowerCase().includes("duplicado"))).toBe(true);
  });

  it("warns when the correct answer is absent from options", () => {
    const grid = [["Eval", "S", "Q1", "P", "opcion_unica", "si", "A|B", "Z", "1"]];
    const { issues } = convertRows(rowsFromGrid(HEADERS, grid), "u1");
    expect(issues.some((i) => i.column === "correct_answer" && i.severity === "warning")).toBe(true);
  });

  it("groups questions into named sections", () => {
    const grid = [
      ["Eval", "Parte A", "Q1", "P1", "texto_corto", "no", "", "", ""],
      ["Eval", "Parte B", "Q2", "P2", "texto_corto", "no", "", "", ""],
    ];
    const { draft } = convertRows(rowsFromGrid(HEADERS, grid), "u1");
    expect(draft!.draftVersion.content.sections).toHaveLength(2);
  });

  it("excludes rows the reviewer marked out", () => {
    const grid = [
      ["Eval", "S", "Q1", "P1", "texto_corto", "no", "", "", ""],
      ["Eval", "S", "Q2", "P2", "texto_corto", "no", "", "", ""],
    ];
    const rows = rowsFromGrid(HEADERS, grid);
    const { validRowCount } = convertRows(rows, "u1", new Set([rows[0].index]));
    expect(validRowCount).toBe(1);
  });
});

describe("csv export injection guard", () => {
  it("prefixes formula-like cells to prevent injection", () => {
    expect(guardCsvCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(guardCsvCell("+1")).toBe("'+1");
    expect(guardCsvCell("@cmd")).toBe("'@cmd");
    expect(guardCsvCell("hola")).toBe("hola");
  });

  it("quotes fields containing separators", () => {
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
  });
});
