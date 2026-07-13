import { describe, it, expect } from "vitest";
import { parseDelimited } from "../imports/parser";
import { detectMapping, buildRows, validateRows, rowsToSections, standardTemplateCsv } from "../imports/mapping";

describe("delimited parser", () => {
  it("parses quoted CSV with embedded commas and newlines", () => {
    const csv = 'a,b,c\n"uno, dos","línea\nnueva",3\n';
    const rows = parseDelimited(csv, ",");
    expect(rows[0]).toEqual(["a", "b", "c"]);
    expect(rows[1]).toEqual(["uno, dos", "línea\nnueva", "3"]);
  });

  it("handles escaped quotes", () => {
    const rows = parseDelimited('name\n"He said ""hi"""', ",");
    expect(rows[1]).toEqual(['He said "hi"']);
  });
});

describe("import mapping", () => {
  const header = [
    "evaluation_name",
    "section",
    "question_text",
    "question_type",
    "options",
    "correct_answer",
    "points",
  ];

  it("detects standard and Spanish-alias headers", () => {
    const mapping = detectMapping(header);
    expect(mapping.question_text).toBe(2);
    const spanish = detectMapping(["pregunta", "tipo", "opciones"]);
    expect(spanish.question_text).toBe(0);
    expect(spanish.question_type).toBe(1);
    expect(spanish.options).toBe(2);
  });

  it("validates rows and flags a correct answer not in options", () => {
    const mapping = detectMapping(header);
    const data = [
      ["Comercial", "Sección 1", "¿2+2?", "opcion_unica", "3|4|5", "6", "1"],
    ];
    const rows = buildRows(data, mapping);
    const report = validateRows(rows);
    expect(report.errorCount).toBeGreaterThan(0);
    expect(report.issues.some((i) => i.column === "correct_answer")).toBe(true);
  });

  it("converts valid rows into sections with scored questions", () => {
    const mapping = detectMapping(header);
    const data = [
      ["Comercial", "Conocimiento", "¿2+2?", "opcion_unica", "3|4|5", "4", "2"],
      ["Comercial", "Conocimiento", "Explica", "ensayo", "", "", "0"],
    ];
    const rows = buildRows(data, mapping);
    const { name, sections } = rowsToSections(rows);
    expect(name).toBe("Comercial");
    expect(sections).toHaveLength(1);
    expect(sections[0].questions).toHaveLength(2);
    const scored = sections[0].questions[0];
    expect(scored.scoring.points).toBe(2);
    expect(scored.options.find((o) => o.value === "4")?.correct).toBe(true);
  });

  it("provides a downloadable standard template with all columns", () => {
    const csv = standardTemplateCsv();
    expect(csv.split("\n")[0]).toContain("question_type");
    expect(csv.split("\n").length).toBeGreaterThan(1);
  });
});
