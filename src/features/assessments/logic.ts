import type {
  AssessmentDefinition,
  AssessmentRule,
  Condition,
  ConditionGroup,
} from "./types";

/**
 * Logic / branching analysis.
 *
 * Rules can show/hide questions and sections, jump to sections or end the
 * assessment. Before a rule set is trusted it is checked for problems the author
 * must resolve: references to questions/sections that don't exist, jumps that
 * create unreachable sections, and circular "go_to_section" chains. This module
 * is pure so it can be unit-tested and reused by the builder and backend.
 */

export interface LogicIssue {
  ruleId: string;
  ruleName: string;
  severity: "error" | "warning";
  message: string;
}

function collectConditionSources(group: ConditionGroup, out: Set<string>) {
  for (const child of group.children) {
    if (child.kind === "condition") out.add((child as Condition).source);
    else collectConditionSources(child as ConditionGroup, out);
  }
}

export function analyzeRules(a: AssessmentDefinition): LogicIssue[] {
  const issues: LogicIssue[] = [];
  const questionIds = new Set<string>();
  const sectionIds = new Set<string>();
  for (const s of a.sections) {
    sectionIds.add(s.id);
    for (const q of s.questions) questionIds.add(q.id);
  }

  // Build a section jump graph for cycle detection.
  const jumpGraph = new Map<string, Set<string>>();

  for (const rule of a.rules) {
    if (!rule.enabled) continue;

    // Condition references.
    const sources = new Set<string>();
    collectConditionSources(rule.when, sources);
    for (const source of sources) {
      const virtual = source === "score" || source === "section_score" || source === "completion";
      if (!virtual && !questionIds.has(source)) {
        issues.push({
          ruleId: rule.id,
          ruleName: rule.name || rule.id,
          severity: "error",
          message: `La condición referencia una pregunta inexistente (${source}).`,
        });
      }
    }

    if (rule.when.children.length === 0) {
      issues.push({
        ruleId: rule.id,
        ruleName: rule.name || rule.id,
        severity: "warning",
        message: "La regla no tiene condiciones; se ejecutará siempre.",
      });
    }

    // Action targets.
    for (const action of rule.actions) {
      if (action.type === "go_to_section" || action.type === "show_section" || action.type === "skip_section") {
        if (!sectionIds.has(action.target)) {
          issues.push({
            ruleId: rule.id,
            ruleName: rule.name || rule.id,
            severity: "error",
            message: `La acción apunta a una sección inexistente (${action.target}).`,
          });
        } else if (action.type === "go_to_section") {
          // Record the jump from every section source referenced.
          for (const source of sources) {
            const sectionOfSource = sectionOf(a, source);
            if (sectionOfSource) {
              (jumpGraph.get(sectionOfSource) ?? jumpGraph.set(sectionOfSource, new Set()).get(sectionOfSource)!).add(
                action.target,
              );
            }
          }
        }
      }
      if ((action.type === "show_question" || action.type === "hide_question" || action.type === "require_question" || action.type === "make_optional") && !questionIds.has(action.target)) {
        issues.push({
          ruleId: rule.id,
          ruleName: rule.name || rule.id,
          severity: "error",
          message: `La acción apunta a una pregunta inexistente (${action.target}).`,
        });
      }
      if (action.type === "display_message" && !action.message?.trim()) {
        issues.push({
          ruleId: rule.id,
          ruleName: rule.name || rule.id,
          severity: "warning",
          message: "La acción de mensaje no tiene texto.",
        });
      }
    }
  }

  // Detect circular section jumps.
  if (hasCycle(jumpGraph)) {
    issues.push({
      ruleId: "__graph__",
      ruleName: "Flujo de secciones",
      severity: "error",
      message: "Se detectó un ciclo de saltos entre secciones (bucle infinito).",
    });
  }

  return issues;
}

function sectionOf(a: AssessmentDefinition, questionId: string): string | null {
  for (const s of a.sections) {
    if (s.questions.some((q) => q.id === questionId)) return s.id;
  }
  return null;
}

function hasCycle(graph: Map<string, Set<string>>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const dfs = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of graph.get(node) ?? []) {
      if (dfs(next)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  };

  for (const node of graph.keys()) {
    if (dfs(node)) return true;
  }
  return false;
}

/** Convenience: does the rule set have blocking errors? */
export function hasBlockingLogicErrors(a: AssessmentDefinition): boolean {
  return analyzeRules(a).some((i) => i.severity === "error");
}

/** Create an empty enabled rule with an "always" (empty) condition group. */
export function emptyRule(id: string): AssessmentRule {
  return {
    id,
    name: "Nueva regla",
    when: { kind: "group", combinator: "and", children: [] },
    actions: [],
    enabled: true,
  };
}
