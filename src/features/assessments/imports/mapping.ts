import { uid } from "../../../shared/id";
import { createQuestion, getPlugin } from "../question-types/registry";
import { emptySection } from "../factory";
import type { AssessmentOption, AssessmentQuestion, AssessmentSection } from "../types";

/**
 * Import mapping + validation + conversion.
 *
 * The standard template has documented English headers (for interoperability)
 * with a Spanish alias map. The mapping step lets the user override detected
 * columns. Validation classifies every issue (error/warning/info) with row,
 * column, original value, problem and suggested correction. Nothing invalid is
 * silently discarded — issues are surfaced in the report and rows can be
 * excluded explicitly.
 */

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

/** Spanish header aliases → canonical column. */
const HEADER_ALIASES: Record<string, StandardColumn> = {
  nombre_evaluacion: "evaluation_name",
  evaluacion: "evaluation_name",
  codigo_evaluacion: "evaluation_code",
  seccion: "section",
  orden_seccion: "section_order",
  codigo_pregunta: "question_code",
  pregunta: "question_text",
  texto_pregunta: "question_text",
  tipo: "question_type",
  tipo_pregunta: "question_type",
  orden: "question_order",
  orden_pregunta: "question_order",
  obligatoria: "required",
  requerida: "required",
  opciones: "options",
  respuesta_correcta: "correct_answer",
  correcta: "correct_answer",
  puntos: "points",
  peso: "weight",
  dificultad: "difficulty",
  competencia: "competency",
  ayuda: "help_text",
  texto_ayuda: "help_text",
  retroalimentacion: "feedback",
  tiempo_limite: "time_limit_seconds",
  etiquetas: "tags",
};

/** Map spreadsheet types (English or Spanish) → registry question types. */
const TYPE_ALIASES: Record<string, string> = {
  short_text: "short_text",
  texto_corto: "short_text",
  long_text: "long_text",
  texto_largo: "long_text",
  essay: "essay",
  ensayo: "essay",
  single_choice: "single_choice",
  opcion_unica: "single_choice",
  multiple_choice: "multiple_choice",
  seleccion_multiple: "multiple_choice",
  dropdown: "dropdown",
  lista: "dropdown",
  true_false: "true_false",
  verdadero_falso: "true_false",
  likert: "likert",
  numeric_scale: "numeric_scale",
  escala: "numeric_scale",
  integer: "integer",
  entero: "integer",
  decimal: "decimal",
  percentage: "percentage",
  porcentaje: "percentage",
  date: "date",
  fecha: "date",
  scenario_case: "scenario_case",
  caso: "scenario_case",
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

/** Auto-detect the column mapping from a header row. */
export function detectMapping(headers: string[]): Record<StandardColumn, number> {
  const mapping = {} as Record<StandardColumn, number>;
  for (const col of STANDARD_COLUMNS) mapping[col] = -1;
  headers.forEach((raw, index) => {
    const key = norm(raw);
    if ((STANDARD_COLUMNS as readonly string[]).includes(key)) {
      mapping[key as StandardColumn] = index;
    } else if (HEADER_ALIASES[key]) {
      mapping[HEADER_ALIASES[key]] = index;
    }
  });
  return mapping;
}

export type IssueSeverity = "error" | "warning" | "info";

export interface ImportIssue {
  row: number; // 1-based data row
  column: string;
  value: string;
  severity: IssueSeverity;
  problem: string;
  suggestion?: string;
}

export interface ImportRowData {
  index: number;
  cells: Record<StandardColumn, string>;
  excluded: boolean;
}

export interface ImportReport {
  issues: ImportIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

function cell(row: string[], idx: number): string {
  return idx >= 0 ? (row[idx] ?? "").trim() : "";
}

/** Build structured rows from the data (after the header row). */
export function buildRows(dataRows: string[][], mapping: Record<StandardColumn, number>): ImportRowData[] {
  return dataRows.map((row, i) => {
    const cells = {} as Record<StandardColumn, string>;
    for (const col of STANDARD_COLUMNS) cells[col] = cell(row, mapping[col]);
    return { index: i, cells, excluded: false };
  });
}

const BOOL_TRUE = new Set(["si", "sí", "true", "1", "x", "yes", "verdadero"]);
const BOOL_FALSE = new Set(["no", "false", "0", "", "falso"]);

function parseBool(value: string): boolean | null {
  const v = norm(value);
  if (BOOL_TRUE.has(v)) return true;
  if (BOOL_FALSE.has(v)) return false;
  return null;
}

function parseOptions(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw.split("|").map((o) => o.trim()).filter(Boolean);
}

/** Validate every row and produce a classified report. */
export function validateRows(rows: ImportRowData[]): ImportReport {
  const issues: ImportIssue[] = [];
  const seenCodes = new Set<string>();
  const push = (i: Omit<ImportIssue, "row"> & { row: number }) => issues.push(i);

  rows.forEach((r) => {
    const rowNum = r.index + 1;
    const c = r.cells;

    if (!c.question_text && !c.section) {
      push({ row: rowNum, column: "question_text", value: "", severity: "error", problem: "Falta el texto de la pregunta." });
    }

    // Question type.
    if (c.question_type) {
      const type = TYPE_ALIASES[norm(c.question_type)];
      if (!type) {
        push({
          row: rowNum,
          column: "question_type",
          value: c.question_type,
          severity: "error",
          problem: "Tipo de pregunta no soportado.",
          suggestion: "Usa: opcion_unica, seleccion_multiple, texto_corto, likert, escala, entero…",
        });
      }
    } else if (c.question_text) {
      push({ row: rowNum, column: "question_type", value: "", severity: "warning", problem: "Sin tipo; se asume texto corto.", suggestion: "texto_corto" });
    }

    // Duplicate question code.
    if (c.question_code) {
      if (seenCodes.has(c.question_code)) {
        push({ row: rowNum, column: "question_code", value: c.question_code, severity: "warning", problem: "Código de pregunta duplicado." });
      }
      seenCodes.add(c.question_code);
    }

    // Options + correct answer.
    const type = TYPE_ALIASES[norm(c.question_type)] ?? "";
    const needsOptions = ["single_choice", "multiple_choice", "dropdown", "likert", "scenario_case"].includes(type);
    const options = parseOptions(c.options);
    if (needsOptions && options.length < 2) {
      push({ row: rowNum, column: "options", value: c.options, severity: "error", problem: "Se requieren al menos dos opciones separadas por “|”." });
    }
    if (c.correct_answer && options.length > 0) {
      const answers = c.correct_answer.split("|").map((a) => a.trim());
      for (const ans of answers) {
        if (!options.includes(ans)) {
          push({
            row: rowNum,
            column: "correct_answer",
            value: ans,
            severity: "error",
            problem: "La respuesta correcta no está entre las opciones.",
          });
        }
      }
    }

    // Numbers.
    for (const [col, label] of [["points", "puntos"], ["weight", "peso"], ["time_limit_seconds", "tiempo"]] as [StandardColumn, string][]) {
      if (c[col] && Number.isNaN(Number(c[col]))) {
        push({ row: rowNum, column: col, value: c[col], severity: "error", problem: `Valor de ${label} inválido.` });
      }
    }

    // Boolean.
    if (c.required && parseBool(c.required) === null) {
      push({ row: rowNum, column: "required", value: c.required, severity: "warning", problem: "Valor booleano no reconocido; se asume “No”.", suggestion: "Sí / No" });
    }

    // Difficulty.
    if (c.difficulty && !["baja", "media", "alta"].includes(norm(c.difficulty))) {
      push({ row: rowNum, column: "difficulty", value: c.difficulty, severity: "info", problem: "Dificultad no estándar (baja/media/alta)." });
    }
  });

  return {
    issues,
    errorCount: issues.filter((i) => i.severity === "error").length,
    warningCount: issues.filter((i) => i.severity === "warning").length,
    infoCount: issues.filter((i) => i.severity === "info").length,
  };
}

/** Convert validated, non-excluded rows into assessment sections + name. */
export function rowsToSections(rows: ImportRowData[]): { name: string; code: string; sections: AssessmentSection[] } {
  const active = rows.filter((r) => !r.excluded && r.cells.question_text);
  const name = active.find((r) => r.cells.evaluation_name)?.cells.evaluation_name || "Evaluación importada";
  const code = active.find((r) => r.cells.evaluation_code)?.cells.evaluation_code || "";

  const sectionMap = new Map<string, AssessmentSection>();
  const order = (v: string) => Number(v) || 0;

  for (const r of active) {
    const c = r.cells;
    const sectionName = c.section || "Sección 1";
    let section = sectionMap.get(sectionName);
    if (!section) {
      section = { ...emptySection(sectionName, order(c.section_order)), id: uid("sec") };
      sectionMap.set(sectionName, section);
    }

    const type = TYPE_ALIASES[norm(c.question_type)] ?? "short_text";
    const question = buildQuestion(type, c);
    section.questions.push(question);
  }

  const sections = [...sectionMap.values()].sort((a, b) => a.order - b.order);
  // Sort questions within a section by their order column when present.
  for (const s of sections) {
    s.questions.sort((a, b) => Number(a.config.__order ?? 0) - Number(b.config.__order ?? 0));
    for (const q of s.questions) delete (q.config as Record<string, unknown>).__order;
  }

  return { name, code, sections };
}

function buildQuestion(type: string, c: Record<StandardColumn, string>): AssessmentQuestion {
  const base = createQuestion(type);
  const plugin = getPlugin(type);
  const options: AssessmentOption[] = parseOptions(c.options).map((label) => ({
    id: uid("opt"),
    label,
    value: label,
    correct: c.correct_answer
      ? c.correct_answer.split("|").map((a) => a.trim()).includes(label)
      : undefined,
  }));

  const points = Number(c.points) || 0;
  const weight = Number(c.weight) || 1;
  const scored = points > 0 && plugin?.capabilities.scoring;

  return {
    ...base,
    code: c.question_code || undefined,
    label: c.question_text || base.label,
    helpText: c.help_text || undefined,
    feedback: c.feedback || undefined,
    required: parseBool(c.required) ?? false,
    options: options.length ? options : base.options,
    scoring: scored
      ? {
          mode: type === "multiple_choice" ? "partial" : "exact",
          points,
          weight,
          competency: c.competency || undefined,
        }
      : base.scoring,
    tags: c.tags ? c.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    config: { ...base.config, __order: Number(c.question_order) || 0 },
    configured: true,
  };
}

/** Build the downloadable standard template as CSV text. */
export function standardTemplateCsv(): string {
  const header = STANDARD_COLUMNS.join(",");
  const example = [
    "Evaluación comercial,COM-2026,Orientación al cliente,1,Q1,¿Cómo actúas ante un cliente molesto?,opcion_unica,1,Sí,Escuchar|Explicar|Derivar,Escuchar,2,1,media,servicio,,Retroalimentación de ejemplo,60,servicio|ventas",
    "Evaluación comercial,COM-2026,Orientación al cliente,1,Q2,Describe un logro comercial.,ensayo,2,No,,,10,1,alta,logro,,,180,logro",
  ];
  return [header, ...example].join("\n");
}
