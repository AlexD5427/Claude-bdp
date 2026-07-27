/**
 * Import column mapping + row conversion.
 *
 * Maps spreadsheet headers to the standard interoperable columns, validates
 * each row, reports actionable issues, and converts the valid rows into an
 * assessment draft. Import NEVER publishes — it always produces a reviewable
 * draft (see the service). Spanish header aliases are supported.
 */

import { newId } from "../../../shared/ids";
import { sanitizeText } from "../../../shared/sanitize";
import { assessmentContentSchema, type AssessmentContent } from "../domain/assessment";
import { createAssessment } from "../domain/factory";
import type { AssessmentDefinition } from "../domain/assessment";
import type { AssessmentBlock, AssessmentSection } from "../domain/questions";
import type { ImportIssue } from "../domain/entities";
import { getPlugin } from "../question-types";
import { makeOption } from "../question-types/helpers";

/** The standard interoperable columns. */
export const STANDARD_COLUMNS = [
  "evaluation_name",
  "evaluation_code",
  "section",
  "section_order",
  "question_code",
  "question_text",
  "question_type",
  "question_order",
  "required",
  "options",
  "correct_answer",
  "points",
  "weight",
  "difficulty",
  "competency",
  "help_text",
  "feedback",
  "time_limit_seconds",
  "tags",
] as const;

export type StandardColumn = (typeof STANDARD_COLUMNS)[number];

/** Spanish (and English) header aliases → standard column. */
const HEADER_ALIASES: Record<string, StandardColumn> = {
  // name
  evaluation_name: "evaluation_name",
  nombre_evaluacion: "evaluation_name",
  evaluacion: "evaluation_name",
  nombre: "evaluation_name",
  // code
  evaluation_code: "evaluation_code",
  codigo_evaluacion: "evaluation_code",
  codigo: "evaluation_code",
  // section
  section: "section",
  seccion: "section",
  section_order: "section_order",
  orden_seccion: "section_order",
  // question
  question_code: "question_code",
  codigo_pregunta: "question_code",
  question_text: "question_text",
  pregunta: "question_text",
  texto_pregunta: "question_text",
  question_type: "question_type",
  tipo: "question_type",
  tipo_pregunta: "question_type",
  question_order: "question_order",
  orden: "question_order",
  orden_pregunta: "question_order",
  required: "required",
  obligatorio: "required",
  requerido: "required",
  options: "options",
  opciones: "options",
  correct_answer: "correct_answer",
  respuesta_correcta: "correct_answer",
  correcta: "correct_answer",
  points: "points",
  puntos: "points",
  puntaje: "points",
  weight: "weight",
  peso: "weight",
  difficulty: "difficulty",
  dificultad: "difficulty",
  competency: "competency",
  competencia: "competency",
  help_text: "help_text",
  ayuda: "help_text",
  texto_ayuda: "help_text",
  feedback: "feedback",
  retroalimentacion: "feedback",
  time_limit_seconds: "time_limit_seconds",
  tiempo_limite: "time_limit_seconds",
  tiempo_limite_segundos: "time_limit_seconds",
  tags: "tags",
  etiquetas: "tags",
};

function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
}

/** Auto-map detected headers to standard columns. Returns header→column. */
export function autoMapColumns(headers: string[]): Record<number, StandardColumn | null> {
  const map: Record<number, StandardColumn | null> = {};
  headers.forEach((h, i) => {
    map[i] = HEADER_ALIASES[normalizeHeader(h)] ?? null;
  });
  return map;
}

/** Map a spreadsheet question_type token to a registered plugin type. */
const TYPE_ALIASES: Record<string, string> = {
  single_choice: "q_single_choice",
  opcion_unica: "q_single_choice",
  multiple_choice: "q_multiple_choice",
  opcion_multiple: "q_multiple_choice",
  dropdown: "q_dropdown",
  lista: "q_dropdown",
  true_false: "q_true_false",
  verdadero_falso: "q_true_false",
  short_text: "q_short_text",
  texto_corto: "q_short_text",
  long_text: "q_long_text",
  texto_largo: "q_long_text",
  integer: "q_integer",
  entero: "q_integer",
  decimal: "q_decimal",
  numero: "q_decimal",
  percentage: "q_percentage",
  porcentaje: "q_percentage",
  likert: "q_likert",
  numeric_scale: "q_numeric_scale",
  escala: "q_numeric_scale",
  date: "q_date",
  fecha: "q_date",
};

function resolveType(raw: string): string | null {
  const key = normalizeHeader(raw);
  return TYPE_ALIASES[key] ?? (getPlugin(key) ? key : getPlugin(`q_${key}`) ? `q_${key}` : null);
}

function parseBoolean(raw: string): boolean | null {
  const v = normalizeHeader(raw);
  if (["si", "sí", "true", "1", "verdadero", "x"].includes(v)) return true;
  if (["no", "false", "0", "falso", ""].includes(v)) return false;
  return null;
}

export interface MappedRow {
  index: number; // spreadsheet row number (1-based, including header)
  values: Partial<Record<StandardColumn, string>>;
}

export interface ConversionResult {
  draft: AssessmentDefinition | null;
  issues: ImportIssue[];
  validRowCount: number;
}

function issue(
  severity: ImportIssue["severity"],
  row: number,
  column: string,
  originalValue: string,
  problem: string,
  suggestion = "",
): ImportIssue {
  return { id: newId("iss"), severity, row, column, originalValue, problem, suggestion };
}

/**
 * Validate + convert mapped rows into an assessment draft. `excluded` rows are
 * skipped. Rows with errors are reported and omitted from the draft.
 */
export function convertRows(
  rows: MappedRow[],
  by: string,
  excluded: Set<number> = new Set(),
): ConversionResult {
  const issues: ImportIssue[] = [];
  const sectionsMap = new Map<string, AssessmentSection>();
  const seenQuestionCodes = new Set<string>();
  let evaluationName = "Evaluación importada";
  let validRowCount = 0;

  for (const { index, values } of rows) {
    if (excluded.has(index)) continue;
    if (values.evaluation_name) evaluationName = sanitizeText(values.evaluation_name, 200);

    const text = sanitizeText(values.question_text ?? "", 4000);
    if (!text) {
      issues.push(issue("error", index, "question_text", values.question_text ?? "", "Falta el texto de la pregunta.", "Escribe el enunciado."));
      continue;
    }

    const type = resolveType(values.question_type ?? "");
    if (!type) {
      issues.push(issue("error", index, "question_type", values.question_type ?? "", "Tipo de pregunta no compatible.", "Usa single_choice, texto_corto, entero, etc."));
      continue;
    }

    const code = sanitizeText(values.question_code ?? "", 80);
    if (code && seenQuestionCodes.has(code)) {
      issues.push(issue("error", index, "question_code", code, "Código de pregunta duplicado.", "Usa un código único."));
      continue;
    }
    if (code) seenQuestionCodes.add(code);

    // Options.
    const optionLabels = (values.options ?? "")
      .split(/[|;]/)
      .map((s) => sanitizeText(s, 1000))
      .filter(Boolean);
    const correctRaw = sanitizeText(values.correct_answer ?? "", 1000);
    const correctSet = new Set(
      correctRaw.split(/[|;]/).map((s) => normalizeHeader(s)).filter(Boolean),
    );

    const isChoice = ["q_single_choice", "q_multiple_choice", "q_dropdown", "q_multiselect", "q_true_false"].includes(type);
    if (isChoice && optionLabels.length < 2) {
      issues.push(issue("error", index, "options", values.options ?? "", "Una pregunta de opción necesita al menos dos opciones.", "Separa las opciones con | o ;"));
      continue;
    }

    // Validate the correct answer exists among options.
    if (isChoice && correctRaw && ![...correctSet].every((c) => optionLabels.some((o) => normalizeHeader(o) === c))) {
      issues.push(issue("warning", index, "correct_answer", correctRaw, "La respuesta correcta no coincide con ninguna opción.", "Verifica el texto de la respuesta."));
    }

    // Numbers.
    const points = Number(values.points ?? "");
    if (values.points && !Number.isFinite(points)) {
      issues.push(issue("warning", index, "points", values.points, "Puntaje inválido; se usará 0."));
    }
    const weight = Number(values.weight ?? "");
    const timeLimit = Number(values.time_limit_seconds ?? "");
    const requiredParsed = parseBoolean(values.required ?? "");
    if (values.required && requiredParsed === null) {
      issues.push(issue("warning", index, "required", values.required, "Valor booleano inválido; se asume 'No'."));
    }

    // Section grouping.
    const sectionTitle = sanitizeText(values.section ?? "General", 300) || "General";
    const sectionOrder = Number(values.section_order ?? "");
    if (!sectionsMap.has(sectionTitle)) {
      sectionsMap.set(sectionTitle, {
        id: newId("sec"),
        title: sectionTitle,
        description: "",
        order: Number.isFinite(sectionOrder) ? sectionOrder : sectionsMap.size,
        blocks: [],
        config: { timeLimitSeconds: null, randomizeBlocks: false, poolSize: null, weight: 1 },
      });
    }
    const section = sectionsMap.get(sectionTitle)!;

    const options = optionLabels.map((label) =>
      makeOption({
        label,
        value: normalizeHeader(label),
        correct: correctSet.has(normalizeHeader(label)),
      }),
    );

    const block: AssessmentBlock = {
      id: newId("blk"),
      type,
      order: Number(values.question_order ?? section.blocks.length) || section.blocks.length,
      code,
      label: text,
      description: "",
      helpText: sanitizeText(values.help_text ?? "", 4000),
      required: requiredParsed ?? false,
      options,
      config: Number.isFinite(timeLimit) && timeLimit > 0 ? { timeLimitSeconds: timeLimit } : {},
      validation: {},
      score: {
        mode: isChoice && correctRaw ? "exact" : Number.isFinite(points) && points > 0 ? "manual" : "none",
        points: Number.isFinite(points) ? points : 0,
        weight: Number.isFinite(weight) ? weight : 1,
        rubricId: null,
        competency: sanitizeText(values.competency ?? "", 120),
        normalize: false,
      },
      feedback: { correct: "", incorrect: "", general: sanitizeText(values.feedback ?? "", 2000) },
      media: null,
      accessibility: { ariaLabel: "", longDescription: "" },
      tags: (values.tags ?? "").split(/[|;,]/).map((t) => sanitizeText(t, 60)).filter(Boolean),
      analyticsKey: "",
    };
    section.blocks.push(block);
    validRowCount += 1;
  }

  if (validRowCount === 0) {
    return { draft: null, issues, validRowCount };
  }

  const content: AssessmentContent = assessmentContentSchema.parse({
    sections: [...sectionsMap.values()].sort((a, b) => a.order - b.order),
  });

  const draft = createAssessment({
    name: evaluationName,
    category: "knowledge",
    createdBy: by,
    content,
  });

  return { draft, issues, validRowCount };
}
