import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { __setProviderForTests, mockProvider } from "../../../infrastructure/providers";
import { resetMockData } from "../../../infrastructure/providers/mock";
import {
  createProcessCommand, saveProcessDraft, publishProcess, duplicateProcessCommand, setProcessAssessments, getProcess,
} from "./processService";

beforeEach(() => {
  __setProviderForTests(mockProvider);
  resetMockData();
});
afterEach(() => __setProviderForTests(null));

describe("process application service + linking", () => {
  it("creates, edits, and publishes a process", async () => {
    const created = await createProcessCommand("Analista", "tester");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const edited = await saveProcessDraft({ ...created.value, vacancies: 3 }, "tester");
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.value.vacancies).toBe(3);
    // entityVersion advances so stale-update detection works.
    expect(edited.value.entityVersion).toBeGreaterThan(created.value.entityVersion);

    const published = await publishProcess(created.value.id, "tester");
    expect(published.ok).toBe(true);
    if (published.ok) {
      expect(published.value.processStatus).toBe("published");
      expect(published.value.publicationStatus).toBe("published");
    }
  });

  it("links assessments to a process and persists them", async () => {
    const process = await createProcessCommand("Cajero", "tester");
    expect(process.ok).toBe(true);
    if (!process.ok) return;

    // ProcessOS guarda identificadores OPACOS de evaluación. A propósito no
    // comprueba que existan: acoplar los dos módulos fue lo que hizo que un
    // problema en Evaluaciones arrastrara a Procesos. La vinculación se resuelve
    // al mostrarla, con `listLinkableAssessments()`.
    const linked = await setProcessAssessments(process.value, ["ev_prueba_1", "ev_prueba_2"], "tester");
    expect(linked.ok).toBe(true);

    const reloaded = await getProcess(process.value.id);
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) {
      expect(reloaded.value.assessmentIds).toEqual(["ev_prueba_1", "ev_prueba_2"]);
    }
  });

  it("duplicating a process yields a fresh unpublished draft", async () => {
    const process = await createProcessCommand("Ejecutivo", "tester");
    if (!process.ok) return;
    await publishProcess(process.value.id, "tester");
    const copy = await duplicateProcessCommand(process.value.id, "tester");
    expect(copy.ok).toBe(true);
    if (copy.ok) {
      expect(copy.value.id).not.toBe(process.value.id);
      expect(copy.value.processStatus).toBe("draft");
    }
  });

});
