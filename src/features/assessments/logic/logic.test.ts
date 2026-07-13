import { describe, it, expect } from "vitest";
import { assessmentContentSchema } from "../domain/assessment";
import { validateLogic } from "./validate";
import { newId } from "../../../shared/ids";
import type { AssessmentRule } from "../domain/rules";

function rule(partial: Partial<AssessmentRule>): AssessmentRule {
  return {
    id: newId("rule"),
    name: "Regla",
    enabled: true,
    combinator: "all",
    negate: false,
    conditions: [],
    thenActions: [],
    elseActions: [],
    ...partial,
  };
}

function content(rules: AssessmentRule[]) {
  return assessmentContentSchema.parse({
    sections: [
      { id: "s1", title: "S1", order: 0, blocks: [{ id: "b1", type: "q_single_choice", order: 0, label: "P1" }] },
      { id: "s2", title: "S2", order: 1, blocks: [{ id: "b2", type: "q_short_text", order: 0, label: "P2" }] },
    ],
    rules,
  });
}

describe("logic validation", () => {
  it("passes clean rules with valid references", () => {
    const rules = [
      rule({
        conditions: [{ id: newId("c"), source: { kind: "answer", ref: "b1" }, operator: "eq", value: "a" }],
        thenActions: [{ id: newId("a"), type: "show", targetId: "s2", message: "" }],
      }),
    ];
    expect(validateLogic(content(rules)).filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("flags an invalid reference", () => {
    const rules = [
      rule({
        conditions: [{ id: newId("c"), source: { kind: "answer", ref: "b_missing" }, operator: "eq", value: "a" }],
        thenActions: [{ id: newId("a"), type: "show", targetId: "s2", message: "" }],
      }),
    ];
    expect(validateLogic(content(rules)).some((i) => i.severity === "error")).toBe(true);
  });

  it("flags a missing action target", () => {
    const rules = [
      rule({
        conditions: [{ id: newId("c"), source: { kind: "answer", ref: "b1" }, operator: "eq", value: "a" }],
        thenActions: [{ id: newId("a"), type: "navigate", targetId: "", message: "" }],
      }),
    ];
    expect(validateLogic(content(rules)).some((i) => i.severity === "error")).toBe(true);
  });

  it("flags a contradictory show+hide of the same target", () => {
    const rules = [
      rule({
        conditions: [{ id: newId("c"), source: { kind: "answer", ref: "b1" }, operator: "eq", value: "a" }],
        thenActions: [
          { id: newId("a"), type: "show", targetId: "s2", message: "" },
          { id: newId("a"), type: "hide", targetId: "s2", message: "" },
        ],
      }),
    ];
    expect(validateLogic(content(rules)).some((i) => i.message.includes("muestra y oculta"))).toBe(true);
  });

  it("warns about an unreachable section", () => {
    const rules = [
      rule({
        conditions: [{ id: newId("c"), source: { kind: "answer", ref: "b1" }, operator: "eq", value: "a" }],
        thenActions: [{ id: newId("a"), type: "hide", targetId: "s2", message: "" }],
      }),
    ];
    expect(validateLogic(content(rules)).some((i) => i.message.includes("inaccesible"))).toBe(true);
  });

  it("detects a circular navigation branch", () => {
    const rules = [
      rule({
        conditions: [{ id: newId("c"), source: { kind: "answer", ref: "b1" }, operator: "eq", value: "a" }],
        thenActions: [{ id: newId("a"), type: "navigate", targetId: "b2", message: "" }],
      }),
      rule({
        conditions: [{ id: newId("c"), source: { kind: "answer", ref: "b2" }, operator: "eq", value: "x" }],
        thenActions: [{ id: newId("a"), type: "navigate", targetId: "b1", message: "" }],
      }),
    ];
    expect(validateLogic(content(rules)).some((i) => i.message.includes("circular"))).toBe(true);
  });
});
