/**
 * Assessment content validation + estimation.
 *
 * Produces the errors/warnings and the estimated duration, question count, and
 * total points shown in the builder status area, and gates publishing.
 */

import type { AssessmentContent } from "../domain/assessment";
import { resolvePlugin } from "../question-types/registry";
import { validateLogic, type LogicIssue } from "../logic/validate";

export interface ContentValidation {
  errors: string[];
  warnings: string[];
  questionCount: number;
  totalPoints: number;
  estimatedMinutes: number;
  logicIssues: LogicIssue[];
  canPublish: boolean;
}

/** Rough per-type time estimate (seconds) used when a block has no timer. */
const TIME_ESTIMATE: Record<string, number> = {
  q_short_text: 30,
  q_long_text: 120,
  q_integer: 25,
  q_decimal: 25,
  q_percentage: 25,
  q_currency: 25,
  q_single_choice: 20,
  q_multiple_choice: 30,
  q_dropdown: 20,
  q_multiselect: 30,
  q_true_false: 15,
  q_yes_no_na: 15,
  q_likert: 20,
  q_numeric_scale: 20,
  q_stars: 15,
  q_matrix: 60,
  q_likert_matrix: 60,
  q_editable_table: 90,
  q_ranking: 45,
  q_ordering: 45,
  q_matching: 45,
  q_categorization: 45,
  q_scenario: 90,
  q_multi_step_case: 180,
  q_chart_interpretation: 90,
  q_file_response: 120,
};

export function validateContent(content: AssessmentContent): ContentValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  let questionCount = 0;
  let totalPoints = 0;
  let seconds = 0;

  if (content.sections.length === 0) {
    errors.push("La evaluación no tiene secciones.");
  }

  const seenCodes = new Set<string>();
  for (const section of content.sections) {
    if (section.blocks.length === 0) {
      warnings.push(`La sección "${section.title || "sin título"}" está vacía.`);
    }
    for (const block of section.blocks) {
      const plugin = resolvePlugin(block.type);
      if (plugin.isQuestion) {
        questionCount += 1;
        if (!block.label.trim()) {
          warnings.push("Hay una pregunta sin enunciado.");
        }
        // Choice questions with scoring must have options and a correct answer.
        if (
          ["q_single_choice", "q_multiple_choice", "q_dropdown", "q_multiselect", "q_true_false"].includes(block.type)
        ) {
          if (block.options.length < 2) {
            errors.push(`La pregunta "${block.label || block.code}" necesita al menos dos opciones.`);
          }
          if (block.score.mode !== "none" && block.score.mode !== "manual" && !block.options.some((o) => o.correct)) {
            errors.push(`La pregunta "${block.label || block.code}" no tiene respuesta correcta marcada.`);
          }
        }
        totalPoints += block.score.mode === "per_option"
          ? block.options.reduce((s, o) => s + Math.max(0, o.score), 0)
          : block.score.points;
      }
      if (block.code) {
        if (seenCodes.has(block.code)) errors.push(`Código de pregunta duplicado: ${block.code}.`);
        seenCodes.add(block.code);
      }
      seconds += TIME_ESTIMATE[block.type] ?? 30;
    }
  }

  const logicIssues = validateLogic(content);
  for (const issue of logicIssues) {
    if (issue.severity === "error") errors.push(issue.message);
    else warnings.push(issue.message);
  }

  return {
    errors,
    warnings,
    questionCount,
    totalPoints,
    estimatedMinutes: Math.max(1, Math.round(seconds / 60)),
    logicIssues,
    canPublish: errors.length === 0 && questionCount > 0,
  };
}
