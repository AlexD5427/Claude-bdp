import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  APPS_SCRIPT_DIR,
  GS_FILES,
  listUndeclaredGsFiles,
  loadAppsScript,
  loadInitializedAppsScript,
} from "../../../../scripts/run-apps-script.mjs";

/**
 * Esquema del backend de Apps Script.
 *
 * Estas pruebas ejecutan los archivos .gs REALES (los mismos que se copian al
 * proyecto de Apps Script) sobre una hoja de cálculo en memoria, así que no
 * pueden desincronizarse de lo que se despliega.
 */

const DATA_MODEL = readFileSync(
  join(APPS_SCRIPT_DIR, "..", "..", "docs", "evaluations", "DATA_MODEL.md"),
  "utf8",
);

describe("apps-script · esquema", () => {
  it("declara todos los archivos .gs del proyecto", () => {
    expect(listUndeclaredGsFiles()).toEqual([]);
    expect(GS_FILES.length).toBeGreaterThan(10);
  });

  it("define exactamente las nueve hojas del modelo de datos", () => {
    const { read } = loadAppsScript();
    const headers = read("EVAL_HEADERS") as Record<string, string[]>;
    expect(Object.keys(headers).sort()).toEqual(
      [
        "Answers",
        "Assessments",
        "AuditLog",
        "Attempts",
        "Options",
        "ProcessedRequests",
        "Questions",
        "Sections",
        "Versions",
      ].sort(),
    );
  });

  it("documenta cada encabezado en DATA_MODEL.md", () => {
    const { read } = loadAppsScript();
    const headers = read("EVAL_HEADERS") as Record<string, string[]>;
    const missing: string[] = [];
    for (const [sheet, columns] of Object.entries(headers)) {
      for (const column of columns) {
        // El documento escribe los encabezados en celdas de tabla con acentos
        // graves: `assessment_id`.
        if (!DATA_MODEL.includes(`\`${column}\``)) missing.push(`${sheet}.${column}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("crea las hojas con sus encabezados y verifica el esquema", () => {
    const { call, spreadsheet } = loadInitializedAppsScript();
    const report = call("evalVerifySchema_", spreadsheet) as {
      ok: boolean;
      sheets: { sheet: string; exists: boolean; missingHeaders: string[] }[];
    };
    expect(report.ok).toBe(true);
    expect(report.sheets.every((sheet) => sheet.exists)).toBe(true);
    expect(report.sheets.flatMap((sheet) => sheet.missingHeaders)).toEqual([]);
  });

  it("detecta un encabezado obligatorio ausente en lugar de escribir mal", () => {
    const harness = loadInitializedAppsScript();
    const sheet = harness.spreadsheet.getSheetByName("Options");
    expect(sheet).not.toBeNull();
    // Se borra el encabezado `is_correct` simulando una hoja manipulada.
    const headerRow = sheet!.getRange(1, 1, 1, sheet!.getLastColumn()).getValues()[0];
    const index = headerRow.indexOf("is_correct");
    expect(index).toBeGreaterThanOrEqual(0);
    sheet!.getRange(1, index + 1).setValue("");

    const report = harness.call("evalVerifySchema_", harness.spreadsheet) as { ok: boolean };
    expect(report.ok).toBe(false);

    const response = harness.request("getAdminAssessment", { assessmentId: "asm_x" });
    expect(response.ok).toBe(false);
  });

  it("añade encabezados que falten sin reordenar ni borrar datos", () => {
    const harness = loadInitializedAppsScript();
    const sheet = harness.spreadsheet.getSheetByName("Sections")!;
    const before = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    // Se elimina la última columna de encabezado y se vuelve a configurar.
    sheet.getRange(1, before.length).setValue("");
    harness.call("configurarEvaluaciones");
    const after = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    // Los encabezados previos siguen en su posición original.
    for (let i = 0; i < before.length - 1; i++) {
      expect(after[i]).toBe(before[i]);
    }
    const report = harness.call("evalVerifySchema_", harness.spreadsheet) as { ok: boolean };
    expect(report.ok).toBe(true);
  });
});
