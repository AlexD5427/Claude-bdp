/**
 * Logic validation.
 *
 * Before an assessment can be published its branching rules must be coherent.
 * This validator inspects the rule graph and reports, in es-MX:
 *   · invalid references (a condition/action pointing at a missing block/section)
 *   · missing action targets
 *   · unreachable sections (hidden by a rule with no path to show them)
 *   · circular branches (navigate actions that form a cycle)
 *   · contradictory rules (a rule that both shows and hides the same target)
 *
 * The functions are pure so they are unit-tested directly.
 */

import type { AssessmentContent } from "../domain/assessment";
import type { AssessmentRule } from "../domain/rules";

export interface LogicIssue {
  severity: "error" | "warning";
  ruleId: string | null;
  message: string;
}

function collectIds(content: AssessmentContent): {
  sectionIds: Set<string>;
  blockIds: Set<string>;
} {
  const sectionIds = new Set<string>();
  const blockIds = new Set<string>();
  for (const s of content.sections) {
    sectionIds.add(s.id);
    for (const b of s.blocks) blockIds.add(b.id);
  }
  return { sectionIds, blockIds };
}

function isKnownRef(id: string, sectionIds: Set<string>, blockIds: Set<string>): boolean {
  return sectionIds.has(id) || blockIds.has(id);
}

/** Detect a cycle among `navigate` actions using DFS over the target graph. */
function hasNavigationCycle(rules: AssessmentRule[]): boolean {
  const graph = new Map<string, string[]>();
  for (const rule of rules) {
    for (const cond of rule.conditions) {
      const from = cond.source.ref;
      if (!from) continue;
      const targets = rule.thenActions
        .filter((a) => a.type === "navigate" && a.targetId)
        .map((a) => a.targetId);
      if (targets.length) {
        graph.set(from, [...(graph.get(from) ?? []), ...targets]);
      }
    }
  }

  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  const dfs = (node: string): boolean => {
    color.set(node, GRAY);
    for (const next of graph.get(node) ?? []) {
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) return true;
      if (c === WHITE && dfs(next)) return true;
    }
    color.set(node, BLACK);
    return false;
  };

  for (const node of graph.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE && dfs(node)) return true;
  }
  return false;
}

export function validateLogic(content: AssessmentContent): LogicIssue[] {
  const issues: LogicIssue[] = [];
  const { sectionIds, blockIds } = collectIds(content);
  const rules = content.rules.filter((r) => r.enabled);

  for (const rule of rules) {
    // Rule must have at least one condition and one action.
    if (rule.conditions.length === 0) {
      issues.push({ severity: "warning", ruleId: rule.id, message: `La regla "${rule.name || rule.id}" no tiene condiciones.` });
    }
    if (rule.thenActions.length === 0 && rule.elseActions.length === 0) {
      issues.push({ severity: "warning", ruleId: rule.id, message: `La regla "${rule.name || rule.id}" no tiene acciones.` });
    }

    // Condition references must exist (assessment-level sources have no ref).
    for (const cond of rule.conditions) {
      const needsRef = cond.source.kind === "answer" || cond.source.kind === "score" || cond.source.kind.startsWith("section");
      if (needsRef && cond.source.ref && !isKnownRef(cond.source.ref, sectionIds, blockIds)) {
        issues.push({ severity: "error", ruleId: rule.id, message: `La regla "${rule.name || rule.id}" referencia un elemento inexistente.` });
      }
    }

    // Action targets must exist for structural actions.
    const structural = new Set(["show", "hide", "require", "optional", "skip", "navigate"]);
    for (const action of [...rule.thenActions, ...rule.elseActions]) {
      if (structural.has(action.type)) {
        if (!action.targetId) {
          issues.push({ severity: "error", ruleId: rule.id, message: `Una acción de la regla "${rule.name || rule.id}" no tiene destino.` });
        } else if (!isKnownRef(action.targetId, sectionIds, blockIds)) {
          issues.push({ severity: "error", ruleId: rule.id, message: `Una acción de la regla "${rule.name || rule.id}" apunta a un destino inexistente.` });
        }
      }
    }

    // Contradiction: a single rule both shows and hides the same target.
    const shows = new Set(rule.thenActions.filter((a) => a.type === "show").map((a) => a.targetId));
    for (const a of rule.thenActions) {
      if (a.type === "hide" && shows.has(a.targetId)) {
        issues.push({ severity: "error", ruleId: rule.id, message: `La regla "${rule.name || rule.id}" muestra y oculta el mismo elemento.` });
      }
    }
  }

  // Unreachable sections: a section hidden by some rule and never shown by any.
  const hidden = new Set<string>();
  const shown = new Set<string>();
  for (const rule of rules) {
    for (const a of [...rule.thenActions, ...rule.elseActions]) {
      if (a.type === "hide" && sectionIds.has(a.targetId)) hidden.add(a.targetId);
      if (a.type === "show" && sectionIds.has(a.targetId)) shown.add(a.targetId);
    }
  }
  for (const id of hidden) {
    if (!shown.has(id)) {
      const title = content.sections.find((s) => s.id === id)?.title || id;
      issues.push({ severity: "warning", ruleId: null, message: `La sección "${title}" podría quedar inaccesible.` });
    }
  }

  // Circular navigation.
  if (hasNavigationCycle(rules)) {
    issues.push({ severity: "error", ruleId: null, message: "Se detectó una ramificación circular en la navegación." });
  }

  return issues;
}
