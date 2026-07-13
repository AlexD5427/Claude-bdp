import type { AssessmentQuestion } from "./types";

/**
 * Validation engine.
 *
 * A single implementation validates a candidate answer against a question's
 * constraints, used consistently by the builder preview, the import checker and
 * (contractually) the future public portal and backend. It returns Spanish
 * messages and never throws.
 */

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

const OK: ValidationResult = { valid: true };

function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function validateAnswer(q: AssessmentQuestion, value: unknown): ValidationResult {
  const v = q.validation;
  const required = q.required || v.required;

  if (isEmpty(value)) {
    return required ? { valid: false, message: "Esta pregunta es obligatoria." } : OK;
  }

  // Text families.
  if (q.family === "text" || q.type === "short_text" || q.type === "long_text" || q.type === "essay") {
    const s = String(value);
    if (v.minLength != null && s.length < v.minLength)
      return { valid: false, message: `Mínimo ${v.minLength} caracteres.` };
    if (v.maxLength != null && s.length > v.maxLength)
      return { valid: false, message: `Máximo ${v.maxLength} caracteres.` };
    if (v.exactLength != null && s.length !== v.exactLength)
      return { valid: false, message: `Debe tener exactamente ${v.exactLength} caracteres.` };
    if (v.pattern) {
      try {
        if (!new RegExp(v.pattern).test(s)) return { valid: false, message: "El formato no es válido." };
      } catch {
        /* invalid author-provided pattern → ignore */
      }
    }
    return OK;
  }

  // Numeric families.
  if (q.family === "numeric") {
    const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
    if (Number.isNaN(n)) return { valid: false, message: "Ingresa un número válido." };
    if (v.min != null && n < v.min) return { valid: false, message: `El mínimo es ${v.min}.` };
    if (v.max != null && n > v.max) return { valid: false, message: `El máximo es ${v.max}.` };
    if (v.decimalPlaces != null) {
      const decimals = String(n).split(".")[1]?.length ?? 0;
      if (decimals > v.decimalPlaces)
        return { valid: false, message: `Máximo ${v.decimalPlaces} decimales.` };
    }
    return OK;
  }

  // Multi-select constraints.
  if (Array.isArray(value)) {
    if (v.minSelected != null && value.length < v.minSelected)
      return { valid: false, message: `Selecciona al menos ${v.minSelected} opción(es).` };
    if (v.maxSelected != null && value.length > v.maxSelected)
      return { valid: false, message: `Selecciona como máximo ${v.maxSelected} opción(es).` };
  }

  return OK;
}

/**
 * Build-time integrity check for a question definition (as opposed to a
 * candidate answer). Surfaces configuration problems the builder must warn on.
 */
export function inspectQuestion(q: AssessmentQuestion): string[] {
  const issues: string[] = [];
  if (q.family !== "content" && !q.label.trim()) issues.push("Falta el enunciado de la pregunta.");

  const needsOptions = ["single_choice", "multiple_choice", "dropdown", "likert", "ranking", "drag_order", "matrix_single", "scenario_case"];
  if (needsOptions.includes(q.type) && q.options.length < 2) {
    issues.push("Se requieren al menos dos opciones.");
  }

  const scorable = q.scoring.mode === "exact" || q.scoring.mode === "weighted" || q.scoring.mode === "partial";
  if (scorable) {
    const hasCorrect = q.options.some((o) => o.correct) || q.scoring.expectedValue != null;
    if (["single_choice", "multiple_choice", "dropdown", "true_false", "scenario_case"].includes(q.type) && !hasCorrect) {
      issues.push("La pregunta puntuable no tiene respuesta correcta marcada.");
    }
  }
  return issues;
}
