import { describe, it, expect } from "vitest";
import { createProcess, duplicateProcess } from "../domain/factory";
import { recruitmentProcessSchema, toProcessSummary } from "../domain/models";
import { PROCESS_STATUS_META, PUBLICATION_STATUS_META } from "../domain/status";

describe("process domain", () => {
  it("creates a valid draft process from a title", () => {
    const p = createProcess({ title: "Analista de Riesgos", createdBy: "u1" });
    expect(() => recruitmentProcessSchema.parse(p)).not.toThrow();
    expect(p.processStatus).toBe("draft");
    expect(p.publicationStatus).toBe("unpublished");
    expect(p.code).toMatch(/^PRC-/);
    expect(p.slug).toBe("analista-de-riesgos");
    expect(p.ownerId).toBe("u1");
  });

  it("gives every status a label and intent", () => {
    for (const meta of Object.values(PROCESS_STATUS_META)) {
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.intent).toBeTruthy();
    }
    for (const meta of Object.values(PUBLICATION_STATUS_META)) {
      expect(meta.label.length).toBeGreaterThan(0);
    }
  });

  it("duplicates as a fresh unpublished draft with a new id/code", () => {
    const p = createProcess({ title: "Cajero", createdBy: "u1" });
    const published = recruitmentProcessSchema.parse({
      ...p,
      processStatus: "published",
      publicationStatus: "published",
    });
    const copy = duplicateProcess(published, "u2");
    expect(copy.id).not.toBe(published.id);
    expect(copy.code).not.toBe(published.code);
    expect(copy.title).toContain("(copia)");
    expect(copy.processStatus).toBe("draft");
    expect(copy.publicationStatus).toBe("unpublished");
    expect(copy.updatedBy).toBe("u2");
  });

  it("projects a summary without heavy content", () => {
    const p = createProcess({ title: "Ejecutivo", createdBy: "u1" });
    const summary = toProcessSummary(p, 12);
    expect(summary.applications).toBe(12);
    expect(summary.assessmentCount).toBe(0);
    expect(summary).not.toHaveProperty("publicContentBlocks");
  });
});
