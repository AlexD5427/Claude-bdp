import { describe, it, expect, beforeAll } from "vitest";
import { bootstrapPlugins, resolvePlugin, getPlugin } from "../question-types";
import { assessmentContentSchema } from "../domain/assessment";
import { scoreAssessment } from "./engine";
import { scoringPolicySchema } from "../domain/policies";
import { validateContent } from "./validateContent";
import { newId } from "../../../shared/ids";

beforeAll(() => bootstrapPlugins());

function choiceContent(mode: string) {
  return assessmentContentSchema.parse({
    sections: [
      {
        id: "s1",
        title: "S",
        order: 0,
        blocks: [
          {
            id: "b1",
            type: "q_single_choice",
            order: 0,
            label: "P1",
            options: [
              { id: "o1", label: "A", value: "a", score: 3, correct: true },
              { id: "o2", label: "B", value: "b", score: 0, correct: false },
            ],
            score: { mode, points: 3, weight: 1 },
          },
        ],
      },
    ],
  });
}

describe("plugin registry", () => {
  it("resolves stable plugins and falls back gracefully for unknown types", () => {
    expect(getPlugin("q_single_choice")?.status).toBe("stable");
    const fallback = resolvePlugin("q_does_not_exist");
    expect(fallback.label).toContain("no compatible");
    expect(fallback.isQuestion).toBe(false);
  });

  it("does not register advanced contracts while their flags are off", () => {
    // Flags default off in tests, so code questions must be unregistered.
    expect(getPlugin("q_code")).toBeUndefined();
    // But they still resolve to a safe fallback (not a crash).
    expect(resolvePlugin("q_code").status).toBe("contract");
  });
});

describe("scoring engine", () => {
  it("scores an exact single choice all-or-nothing", () => {
    const content = choiceContent("exact");
    const policy = scoringPolicySchema.parse({ mode: "sum" });
    const correct = scoreAssessment(content, { b1: "a" }, policy);
    expect(correct.raw).toBe(3);
    expect(correct.normalized).toBe(100);
    const wrong = scoreAssessment(content, { b1: "b" }, policy);
    expect(wrong.raw).toBe(0);
    expect(wrong.normalized).toBe(0);
  });

  it("never marks a passing threshold as an auto-rejection", () => {
    const content = choiceContent("exact");
    const policy = scoringPolicySchema.parse({ mode: "sum", passThreshold: 80 });
    const result = scoreAssessment(content, { b1: "b" }, policy);
    expect(result.passed).toBe(false);
    // The engine only reports pass/fail; no rejection side effect exists.
    expect(policy.autoRejectBelowThreshold).toBe(false);
  });

  it("flags manual-review questions as needing review", () => {
    const content = assessmentContentSchema.parse({
      sections: [
        {
          id: "s1",
          title: "S",
          order: 0,
          blocks: [
            { id: "b1", type: "q_long_text", order: 0, label: "Ensayo", score: { mode: "manual", points: 10 } },
          ],
        },
      ],
    });
    const result = scoreAssessment(content, { b1: "respuesta" }, scoringPolicySchema.parse({ mode: "sum" }));
    expect(result.needsReview).toBe(true);
  });
});

describe("content validation", () => {
  it("requires a correct answer for scored choice questions", () => {
    const content = assessmentContentSchema.parse({
      sections: [
        {
          id: "s1",
          title: "S",
          order: 0,
          blocks: [
            {
              id: "b1",
              type: "q_single_choice",
              order: 0,
              label: "P",
              options: [
                { id: "o1", label: "A", value: "a", score: 0, correct: false },
                { id: "o2", label: "B", value: "b", score: 0, correct: false },
              ],
              score: { mode: "exact", points: 1 },
            },
          ],
        },
      ],
    });
    const v = validateContent(content);
    expect(v.canPublish).toBe(false);
    expect(v.errors.some((e) => e.includes("respuesta correcta"))).toBe(true);
  });

  it("detects duplicate question codes", () => {
    const content = assessmentContentSchema.parse({
      sections: [
        {
          id: "s1",
          title: "S",
          order: 0,
          blocks: [
            { id: "b1", type: "q_short_text", order: 0, label: "P1", code: "Q1" },
            { id: "b2", type: "q_short_text", order: 1, label: "P2", code: "Q1" },
          ],
        },
      ],
    });
    const v = validateContent(content);
    expect(v.errors.some((e) => e.toLowerCase().includes("duplicado"))).toBe(true);
  });

  it("counts questions and estimates a positive duration", () => {
    const content = choiceContent("exact");
    const v = validateContent(content);
    expect(v.questionCount).toBe(1);
    expect(v.estimatedMinutes).toBeGreaterThan(0);
    expect(v.totalPoints).toBe(3);
  });

  it("ignores content blocks in the question count", () => {
    const content = assessmentContentSchema.parse({
      sections: [
        {
          id: "s1",
          title: "S",
          order: 0,
          blocks: [
            { id: newId("b"), type: "c_title", order: 0, label: "Bienvenida" },
            { id: newId("b"), type: "c_paragraph", order: 1, description: "texto" },
          ],
        },
      ],
    });
    expect(validateContent(content).questionCount).toBe(0);
  });
});
