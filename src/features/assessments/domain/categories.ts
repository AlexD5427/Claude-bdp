/**
 * Assessment categories.
 *
 * These describe the *purpose* of an assessment. They are intentionally broad:
 * AssessmentOS is a universal authoring platform, not a single kind of test.
 *
 * IMPORTANT: none of these categories claim to be a validated clinical,
 * psychological, or psychometric instrument. The UI surfaces a disclaimer to
 * that effect (see locale `assessments.disclaimer`).
 */

import type { Intent } from "../../../design-system/tokens";

export const ASSESSMENT_CATEGORIES = [
  "pre_screening",
  "knowledge",
  "technical",
  "numerical",
  "situational",
  "competency",
  "interview_guide",
  "scorecard",
  "case_study",
  "simulation",
  "assessment_center",
  "performance",
] as const;

export type AssessmentCategory = (typeof ASSESSMENT_CATEGORIES)[number];

export const ASSESSMENT_CATEGORY_META: Record<
  AssessmentCategory,
  { label: string; intent: Intent }
> = {
  pre_screening: { label: "Preselección", intent: "info" },
  knowledge: { label: "Conocimientos", intent: "accent" },
  technical: { label: "Prueba técnica", intent: "accent" },
  numerical: { label: "Prueba numérica", intent: "accent" },
  situational: { label: "Juicio situacional", intent: "info" },
  competency: { label: "Competencias", intent: "success" },
  interview_guide: { label: "Guía de entrevista", intent: "neutral" },
  scorecard: { label: "Scorecard", intent: "neutral" },
  case_study: { label: "Caso práctico", intent: "warning" },
  simulation: { label: "Simulación operativa", intent: "warning" },
  assessment_center: { label: "Assessment center", intent: "warning" },
  performance: { label: "Desempeño", intent: "neutral" },
};
