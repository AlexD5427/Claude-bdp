import { describe, it, expect } from "vitest";
import { L, fmt, formatDate, formatNumber, formatDuration, LOCALE } from "../index";

describe("es-MX localization", () => {
  it("uses es-MX as the active locale", () => {
    expect(LOCALE).toBe("es-MX");
  });

  it("has Spanish (not English) copy for core visible strings", () => {
    expect(L.common.save).toBe("Guardar");
    expect(L.processes.newProcess).toBe("Crear proceso");
    expect(L.assessments.newAssessment).toBe("Nueva evaluación");
    expect(L.assessments.importFromExcel).toBe("Importar desde Excel");
    expect(L.builder.title).toContain("evaluaciones");
  });

  it("has no obviously-English leftover words in key labels", () => {
    const englishWords = /\b(Save|Cancel|Delete|Create|Search|Publish|Draft|Settings)\b/;
    const samples = [
      L.common.save, L.common.cancel, L.common.delete, L.common.create,
      L.common.search, L.common.publish, L.processes.moduleTitle,
      L.assessments.moduleTitle, L.builder.addSection,
    ];
    for (const s of samples) expect(s).not.toMatch(englishWords);
  });

  it("interpolates placeholders and leaves unknown tokens", () => {
    expect(fmt("Se importaron {n} filas", { n: 12 })).toBe("Se importaron 12 filas");
    expect(fmt("Falta {x}")).toBe("Falta {x}");
  });

  it("formats dates, numbers, and durations with es-MX", () => {
    expect(formatNumber(1240)).toBe("1,240");
    expect(formatDate("not-a-date")).toBe("—");
    expect(formatDuration(90)).toBe("1 h 30 min");
    expect(formatDuration(45)).toBe("45 min");
    // A real date renders a Spanish short month.
    expect(formatDate("2026-07-13")).toMatch(/2026/);
  });
});
