import { describe, it, expect } from "vitest";
import { createAssessmentDefinition } from "../factory";
import { classifyEdit, nextVersion, structuralSignature } from "../lifecycle";
import { gradeAssessment, gradeQuestion, assessmentMaxPoints, correctValues } from "../scoring";
import { validateAnswer, inspectQuestion } from "../validation";
import { analyzeRules, emptyRule } from "../logic";
import { toPublicAssessment, containsNoAnswerKeys } from "../publicDto";
import { assessmentToRow, rowToAssessment } from "../mappers";
import { createQuestion, getPlugin } from "../question-types/registry";
import type { AssessmentDefinition, AssessmentQuestion } from "../types";

const actor = { id: "u1", name: "Tester" };

function withQuestion(q: Partial<AssessmentQuestion>): AssessmentDefinition {
  const a = createAssessmentDefinition({ name: "Prueba" }, actor);
  const base = createQuestion("single_choice");
  a.sections[0].questions.push({ ...base, ...q } as AssessmentQuestion);
  return a;
}

describe("assessment factory + registry", () => {
  it("creates a valid default assessment", () => {
    const a = createAssessmentDefinition({ name: "Comercial" }, actor);
    expect(a.status).toBe("draft");
    expect(a.sections).toHaveLength(1);
    expect(a.currentVersion).toBeNull();
  });

  it("creates known question types and falls back gracefully for unknown", () => {
    expect(getPlugin("single_choice")).toBeDefined();
    const unknown = createQuestion("does_not_exist");
    expect(unknown.configured).toBe(false);
    expect(unknown.label).toContain("no soportado");
  });
});

describe("versioning + live update classification", () => {
  it("detects a non-structural (wording) change", () => {
    const before = withQuestion({ id: "q1", label: "Antiguo", scoring: { mode: "exact", points: 1, weight: 1 } });
    const after: AssessmentDefinition = JSON.parse(JSON.stringify(before));
    after.sections[0].questions[0].label = "Nuevo enunciado";
    expect(classifyEdit(before, after)).toBe("non_structural");
  });

  it("detects a structural (scoring) change", () => {
    const before = withQuestion({ id: "q1", label: "P", scoring: { mode: "exact", points: 1, weight: 1 } });
    const after: AssessmentDefinition = JSON.parse(JSON.stringify(before));
    after.sections[0].questions[0].scoring.points = 5;
    expect(classifyEdit(before, after)).toBe("structural");
  });

  it("bumps versions correctly", () => {
    expect(nextVersion("1.0", "structural")).toBe("2.0");
    expect(nextVersion("1.3", "non_structural")).toBe("1.4");
    expect(nextVersion("2.1", "none")).toBe("2.1");
  });

  it("structural signature ignores labels", () => {
    const a = withQuestion({ id: "q1", label: "A", scoring: { mode: "exact", points: 1, weight: 1 } });
    const b: AssessmentDefinition = JSON.parse(JSON.stringify(a));
    b.sections[0].questions[0].label = "B";
    expect(JSON.stringify(structuralSignature(a))).toEqual(JSON.stringify(structuralSignature(b)));
  });
});

describe("scoring engine", () => {
  it("grades an exact single choice", () => {
    const q = createQuestion("single_choice");
    q.scoring = { mode: "exact", points: 2, weight: 1 };
    q.options = [
      { id: "o1", label: "A", value: "A", correct: true },
      { id: "o2", label: "B", value: "B" },
    ];
    expect(gradeQuestion(q, "A").raw).toBe(2);
    expect(gradeQuestion(q, "B").raw).toBe(0);
  });

  it("computes partial credit for multiple choice", () => {
    const q = createQuestion("multiple_choice");
    q.scoring = { mode: "partial", points: 2, weight: 1 };
    q.options = [
      { id: "o1", label: "A", value: "A", correct: true },
      { id: "o2", label: "B", value: "B", correct: true },
      { id: "o3", label: "C", value: "C" },
    ];
    // One of two correct → half of 2 = 1.
    expect(gradeQuestion(q, ["A"]).raw).toBeCloseTo(1);
    expect(gradeQuestion(q, ["A", "B"]).raw).toBeCloseTo(2);
  });

  it("marks manual questions for review and totals correctly", () => {
    const a = createAssessmentDefinition({ name: "T" }, actor);
    const mc = createQuestion("single_choice");
    mc.id = "mc";
    mc.scoring = { mode: "exact", points: 3, weight: 1 };
    mc.options = [{ id: "o1", label: "A", value: "A", correct: true }, { id: "o2", label: "B", value: "B" }];
    const essay = createQuestion("essay");
    essay.id = "essay";
    a.sections[0].questions.push(mc, essay);
    a.scoringPolicy.passThreshold = 50;
    expect(assessmentMaxPoints(a)).toBe(3 + essay.scoring.points);
    const score = gradeAssessment(a, { mc: "A" });
    expect(score.requiresManualReview).toBe(true);
    expect(score.passed).toBeNull(); // manual review pending
  });

  it("exposes correct values only through the scoring layer", () => {
    const q = createQuestion("single_choice");
    q.options = [{ id: "o1", label: "A", value: "A", correct: true }, { id: "o2", label: "B", value: "B" }];
    expect(correctValues(q)).toEqual(["A"]);
  });
});

describe("validation engine", () => {
  it("enforces required", () => {
    const q = { ...createQuestion("short_text"), required: true };
    expect(validateAnswer(q, "").valid).toBe(false);
    expect(validateAnswer(q, "hola").valid).toBe(true);
  });

  it("enforces numeric bounds", () => {
    const q = createQuestion("integer");
    q.validation = { min: 0, max: 10 };
    expect(validateAnswer(q, 5).valid).toBe(true);
    expect(validateAnswer(q, 20).valid).toBe(false);
    expect(validateAnswer(q, "abc").valid).toBe(false);
  });

  it("inspects a scored choice without a correct answer", () => {
    const q = createQuestion("single_choice");
    q.scoring = { mode: "exact", points: 1, weight: 1 };
    q.options = [{ id: "o1", label: "A", value: "A" }, { id: "o2", label: "B", value: "B" }];
    expect(inspectQuestion(q).some((i) => i.includes("respuesta correcta"))).toBe(true);
  });
});

describe("logic engine", () => {
  it("flags references to missing questions", () => {
    const a = withQuestion({ id: "q1", label: "P" });
    const rule = emptyRule("r1");
    rule.when.children.push({ kind: "condition", source: "does_not_exist", operator: "equals", value: "x" });
    rule.actions.push({ type: "show_question", target: "missing_q" });
    a.rules = [rule];
    const issues = analyzeRules(a);
    expect(issues.some((i) => i.message.includes("inexistente"))).toBe(true);
  });
});

describe("public DTO (answer-key exclusion)", () => {
  it("strips correct answers and scoring from the public projection", () => {
    const a = withQuestion({
      id: "q1",
      label: "P",
      scoring: { mode: "exact", points: 5, weight: 1, expectedValue: "secreto" },
      options: [{ id: "o1", label: "A", value: "A", correct: true, points: 5 }],
    });
    const dto = toPublicAssessment(a);
    expect(containsNoAnswerKeys(dto)).toBe(true);
    expect(JSON.stringify(dto)).not.toContain("secreto");
  });
});

describe("Evaluaciones sheet mappers", () => {
  it("round-trips an assessment through the row shape", () => {
    const a = withQuestion({ id: "q1", label: "P" });
    const row = assessmentToRow(a);
    expect(row.Nombre).toBe(a.name);
    const back = rowToAssessment(row);
    expect(back).not.toBeNull();
    expect(back?.name).toBe(a.name);
    expect(back?.sections[0].questions[0].label).toBe("P");
  });
});
