import { describe, it, expect } from "vitest";
import { createAssessment } from "../domain/factory";
import { assessmentContentSchema } from "../domain/assessment";
import { classifyContentChange } from "./classify";
import { publishDraft, cloneVersionIntoDraft, rollbackToVersion, currentServedVersion } from "./operations";
import type { AssessmentContent } from "../domain/assessment";
import { newId } from "../../../shared/ids";

function baseContent(): AssessmentContent {
  return assessmentContentSchema.parse({
    sections: [
      {
        id: "s1",
        title: "Sección 1",
        order: 0,
        blocks: [
          {
            id: "b1",
            type: "q_single_choice",
            order: 0,
            label: "¿Capital de México?",
            options: [
              { id: "o1", label: "CDMX", value: "cdmx", score: 1, correct: true },
              { id: "o2", label: "Guadalajara", value: "gdl", score: 0, correct: false },
            ],
            score: { mode: "exact", points: 1 },
          },
        ],
      },
    ],
  });
}

describe("version change classification", () => {
  it("returns 'none' for identical content", () => {
    const a = baseContent();
    const b = baseContent();
    expect(classifyContentChange(a, b).classification).toBe("none");
  });

  it("classifies a help-text edit as safe (minor)", () => {
    const a = baseContent();
    const b = baseContent();
    b.sections[0].blocks[0].helpText = "Piensa en la capital federal.";
    const report = classifyContentChange(a, b);
    expect(report.classification).toBe("safe");
    expect(report.reasons.length).toBeGreaterThan(0);
  });

  it("classifies a correct-answer change as structural", () => {
    const a = baseContent();
    const b = baseContent();
    b.sections[0].blocks[0].options[0].correct = false;
    b.sections[0].blocks[0].options[1].correct = true;
    expect(classifyContentChange(a, b).classification).toBe("structural");
  });

  it("classifies adding a scored question as structural", () => {
    const a = baseContent();
    const b = baseContent();
    b.sections[0].blocks.push({
      ...a.sections[0].blocks[0],
      id: "b2",
      order: 1,
    });
    expect(classifyContentChange(a, b).classification).toBe("structural");
  });

  it("classifies a points change as structural", () => {
    const a = baseContent();
    const b = baseContent();
    b.sections[0].blocks[0].score.points = 5;
    expect(classifyContentChange(a, b).classification).toBe("structural");
  });

  it("classifies a branching-rule change as structural", () => {
    const a = baseContent();
    const b = baseContent();
    b.rules.push({
      id: newId("rule"),
      name: "Regla",
      enabled: true,
      combinator: "all",
      negate: false,
      conditions: [],
      thenActions: [],
      elseActions: [],
    });
    expect(classifyContentChange(a, b).classification).toBe("structural");
  });
});

describe("version operations (non-destructive)", () => {
  it("publishing a first version yields v1.0 and keeps an editable draft", () => {
    const def = createAssessment({ name: "Prueba", createdBy: "u1" });
    def.draftVersion.content = baseContent();
    const published = publishDraft(def, "u1");
    expect(published.publishedVersions).toHaveLength(1);
    expect(published.publishedVersions[0].major).toBe(1);
    expect(published.publishedVersions[0].minor).toBe(0);
    expect(published.publishedVersions[0].state).toBe("published");
    expect(published.draftVersion.state).toBe("draft");
    expect(currentServedVersion(published)?.id).toBe(published.publishedVersions[0].id);
  });

  it("a safe edit then publish bumps the minor version", () => {
    let def = createAssessment({ name: "Prueba", createdBy: "u1" });
    def.draftVersion.content = baseContent();
    def = publishDraft(def, "u1"); // v1.0
    def.draftVersion.content.sections[0].blocks[0].helpText = "ayuda";
    def = publishDraft(def, "u1");
    const last = def.publishedVersions[def.publishedVersions.length - 1];
    expect(last.major).toBe(1);
    expect(last.minor).toBe(1);
  });

  it("a structural edit then publish bumps the major version", () => {
    let def = createAssessment({ name: "Prueba", createdBy: "u1" });
    def.draftVersion.content = baseContent();
    def = publishDraft(def, "u1"); // v1.0
    def.draftVersion.content.sections[0].blocks[0].score.points = 10;
    def = publishDraft(def, "u1");
    const last = def.publishedVersions[def.publishedVersions.length - 1];
    expect(last.major).toBe(2);
    expect(last.minor).toBe(0);
  });

  it("never mutates historical published content", () => {
    let def = createAssessment({ name: "Prueba", createdBy: "u1" });
    def.draftVersion.content = baseContent();
    def = publishDraft(def, "u1");
    const firstLabel = def.publishedVersions[0].content.sections[0].blocks[0].label;
    def.draftVersion.content.sections[0].blocks[0].label = "Otra pregunta";
    def = publishDraft(def, "u1");
    // The first published snapshot must still hold the original label.
    expect(def.publishedVersions[0].content.sections[0].blocks[0].label).toBe(firstLabel);
  });

  it("rolls back future assignments without deleting newer versions", () => {
    let def = createAssessment({ name: "Prueba", createdBy: "u1" });
    def.draftVersion.content = baseContent();
    def = publishDraft(def, "u1"); // v1.0
    const firstId = def.publishedVersions[0].id;
    def.draftVersion.content.sections[0].blocks[0].score.points = 3;
    def = publishDraft(def, "u1"); // v2.0
    expect(def.publishedVersions).toHaveLength(2);
    def = rollbackToVersion(def, firstId, "u1");
    expect(def.currentPublishedVersionId).toBe(firstId);
    expect(def.publishedVersions).toHaveLength(2); // nothing deleted
  });

  it("clones a version's content into the draft without touching the source", () => {
    let def = createAssessment({ name: "Prueba", createdBy: "u1" });
    def.draftVersion.content = baseContent();
    def = publishDraft(def, "u1");
    const versionId = def.publishedVersions[0].id;
    def.draftVersion.content.sections = [];
    def = cloneVersionIntoDraft(def, versionId, "u1");
    expect(def.draftVersion.content.sections).toHaveLength(1);
    expect(def.publishedVersions[0].content.sections).toHaveLength(1);
  });
});
