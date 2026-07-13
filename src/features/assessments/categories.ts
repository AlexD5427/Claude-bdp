import { locale } from "../../content/locale/es-BO";
import type { AssessmentCategory } from "./types";

export const CATEGORY_LABELS: Record<AssessmentCategory, string> = {
  questionnaire: locale.assessments.categories.questionnaire,
  prescreen: locale.assessments.categories.prescreen,
  knowledge: locale.assessments.categories.knowledge,
  technical: locale.assessments.categories.technical,
  numerical: locale.assessments.categories.numerical,
  situational: locale.assessments.categories.situational,
  competency: locale.assessments.categories.competency,
  interview: locale.assessments.categories.interview,
  caseStudy: locale.assessments.categories.caseStudy,
  simulation: locale.assessments.categories.simulation,
  feedback: locale.assessments.categories.feedback,
  scorecard: locale.assessments.categories.scorecard,
};

export const CATEGORY_ORDER: AssessmentCategory[] = [
  "questionnaire",
  "prescreen",
  "knowledge",
  "technical",
  "competency",
  "situational",
  "interview",
  "caseStudy",
  "numerical",
  "simulation",
  "feedback",
  "scorecard",
];
