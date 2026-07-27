/**
 * Answer plugins — the scored/collected question types.
 *
 * Each declares its schema-valid default, its capabilities (options, grading
 * strategy, control family), a validator, and a scorer. The capabilities are the
 * single source of truth used by the renderer, the option editor, the publish
 * checklist, and the docs table in QUESTION_TYPES.md — no other file hardcodes
 * a list of type keys.
 *
 * The scorers here compute the AUTHORING estimate shown in the builder. The
 * official grade of a real attempt is computed exclusively by
 * apps-script/evaluations/ScoringService.gs.
 */

import {
  makeBlock,
  makeOption,
  scoreChoice,
  scoreManualAware,
  validateChoice,
  validateNumeric,
  validateRequired,
  validateTextLength,
} from "./helpers";
import type { AssessmentBlock } from "../domain/questions";
import type { PluginCapabilities, PluginControl, PluginExpects, PluginGrading, QuestionPlugin } from "./registry";

function opt(label: string, value: string, correct = false, score = 0) {
  return makeOption({ label, value, correct, score });
}

interface AnswerSpec {
  type: string;
  label: string;
  icon: string;
  status?: QuestionPlugin["status"];
  role?: string;
  needsGroup?: boolean;
  defaults?: Parameters<typeof makeBlock>[2];
  validate?: QuestionPlugin["validate"];
  score?: QuestionPlugin["score"];
  /** Control family used by the generic renderer. */
  control: PluginControl;
  /** Grading strategy. */
  grading: PluginGrading;
  /** Objective key compared by the server for non-option types. */
  expects?: PluginExpects;
  /** Option rules. Absent means the type holds no options. */
  options?: {
    min?: number;
    max?: number | null;
    exactlyOneCorrect?: boolean;
    fixed?: { value: string; label: string }[];
  };
}

function capabilities(spec: AnswerSpec): PluginCapabilities {
  const options = spec.options;
  return {
    options: !!options,
    minOptions: options?.min ?? 0,
    maxOptions: options?.max ?? null,
    exactlyOneCorrect: options?.exactlyOneCorrect ?? false,
    fixedOptions: options?.fixed ?? null,
    grading: spec.grading,
    control: spec.control,
    ...(spec.expects ? { expects: spec.expects } : {}),
  };
}

function answerPlugin(spec: AnswerSpec): QuestionPlugin {
  return {
    type: spec.type,
    label: spec.label,
    category: "answer",
    icon: spec.icon,
    isQuestion: true,
    status: spec.status ?? "stable",
    capabilities: capabilities(spec),
    createDefault: (id) =>
      makeBlock(id, spec.type, {
        label: spec.label,
        required: false,
        ...spec.defaults,
      }),
    validate: spec.validate ?? validateRequired,
    score: spec.score ?? scoreManualAware,
    a11y: { role: spec.role ?? "group", needsGroup: spec.needsGroup ?? false },
  };
}

const singleChoiceDefaults = (): Partial<AssessmentBlock> => ({
  options: [opt("Opción A", "a"), opt("Opción B", "b")],
  score: { mode: "none", points: 1, weight: 1, rubricId: null, competency: "", normalize: false },
});

/** Two options, exactly one correct — the classic single-answer family. */
const SINGLE_ANSWER = { min: 2, exactlyOneCorrect: true } as const;
/** Two or more options, at least one correct. */
const MULTI_ANSWER = { min: 2, exactlyOneCorrect: false } as const;

export const answerPlugins: QuestionPlugin[] = [
  // --- Text (subjective: a human closes the grade) ---
  answerPlugin({ type: "q_short_text", label: "Texto corto", icon: "Type", role: "textbox", control: "text", grading: "manual", validate: validateTextLength }),
  answerPlugin({ type: "q_long_text", label: "Texto largo", icon: "TextCursor", role: "textbox", control: "textarea", grading: "manual", validate: validateTextLength, defaults: { config: { rows: 5 } } }),

  // --- Numeric (objective when the author sets an expected value) ---
  answerPlugin({ type: "q_integer", label: "Entero", icon: "Hash", role: "spinbutton", control: "number", grading: "auto_if_configured", expects: "number", validate: validateNumeric }),
  answerPlugin({ type: "q_decimal", label: "Decimal", icon: "Hash", role: "spinbutton", control: "number", grading: "auto_if_configured", expects: "number", validate: validateNumeric, defaults: { config: { decimals: 2 } } }),
  answerPlugin({ type: "q_percentage", label: "Porcentaje", icon: "Percent", role: "spinbutton", control: "number", grading: "auto_if_configured", expects: "number", validate: validateNumeric, defaults: { config: { min: 0, max: 100 } } }),
  answerPlugin({ type: "q_currency", label: "Moneda", icon: "DollarSign", role: "spinbutton", control: "number", grading: "auto_if_configured", expects: "number", validate: validateNumeric, defaults: { config: { decimals: 2 } } }),

  // --- Date/time ---
  answerPlugin({ type: "q_date", label: "Fecha", icon: "Calendar", role: "textbox", control: "date", grading: "auto_if_configured", expects: "text" }),
  answerPlugin({ type: "q_time", label: "Hora", icon: "Clock", role: "textbox", control: "time", grading: "auto_if_configured", expects: "text" }),
  answerPlugin({ type: "q_datetime", label: "Fecha y hora", icon: "CalendarClock", role: "textbox", control: "datetime", grading: "auto_if_configured", expects: "text" }),

  // --- Choice ---
  answerPlugin({ type: "q_single_choice", label: "Opción única", icon: "CircleDot", role: "radiogroup", needsGroup: true, control: "radio", grading: "auto", options: SINGLE_ANSWER, validate: validateChoice, score: scoreChoice, defaults: singleChoiceDefaults() }),
  answerPlugin({ type: "q_multiple_choice", label: "Opción múltiple", icon: "ListChecks", role: "group", needsGroup: true, control: "checkbox", grading: "auto", options: MULTI_ANSWER, validate: validateChoice, score: scoreChoice, defaults: singleChoiceDefaults() }),
  answerPlugin({ type: "q_dropdown", label: "Lista desplegable", icon: "ChevronDown", role: "listbox", control: "select", grading: "auto", options: SINGLE_ANSWER, validate: validateChoice, score: scoreChoice, defaults: singleChoiceDefaults() }),
  answerPlugin({ type: "q_multiselect", label: "Selección múltiple", icon: "ListPlus", role: "listbox", needsGroup: true, control: "checkbox", grading: "auto", options: MULTI_ANSWER, validate: validateChoice, score: scoreChoice, defaults: singleChoiceDefaults() }),
  answerPlugin({
    type: "q_true_false", label: "Verdadero / Falso", icon: "ToggleLeft", role: "radiogroup",
    needsGroup: true, control: "radio", grading: "auto",
    options: {
      min: 2, max: 2, exactlyOneCorrect: true,
      fixed: [{ value: "true", label: "Verdadero" }, { value: "false", label: "Falso" }],
    },
    validate: validateChoice, score: scoreChoice,
    defaults: {
      options: [opt("Verdadero", "true"), opt("Falso", "false")],
      score: { mode: "exact", points: 1, weight: 1, rubricId: null, competency: "", normalize: false },
    },
  }),
  answerPlugin({ type: "q_yes_no_na", label: "Sí / No / N/A", icon: "CircleHelp", role: "radiogroup", needsGroup: true, control: "radio", grading: "auto", options: SINGLE_ANSWER, validate: validateChoice, score: scoreChoice, defaults: { options: [opt("Sí", "yes"), opt("No", "no"), opt("N/A", "na")] } }),

  // --- Scales ---
  answerPlugin({ type: "q_likert", label: "Escala Likert", icon: "BarChart2", role: "radiogroup", needsGroup: true, control: "radio", grading: "auto", options: SINGLE_ANSWER, validate: validateChoice, score: scoreChoice, defaults: { config: { scaleMin: 1, scaleMax: 5 }, options: [opt("Totalmente en desacuerdo", "1"), opt("En desacuerdo", "2"), opt("Neutral", "3"), opt("De acuerdo", "4"), opt("Totalmente de acuerdo", "5")] } }),
  answerPlugin({ type: "q_numeric_scale", label: "Escala numérica", icon: "Ruler", role: "slider", control: "number", grading: "manual", validate: validateNumeric, defaults: { config: { scaleMin: 0, scaleMax: 10, scaleStep: 1 } } }),
  answerPlugin({ type: "q_stars", label: "Estrellas / iconos", icon: "Star", role: "radiogroup", needsGroup: true, control: "number", grading: "manual", validate: validateRequired, defaults: { config: { starCount: 5 } } }),

  // --- Matrices / tables (subjective) ---
  answerPlugin({ type: "q_matrix", label: "Matriz", icon: "Grid3x3", role: "grid", needsGroup: true, control: "matrix", grading: "manual", validate: validateRequired }),
  answerPlugin({ type: "q_likert_matrix", label: "Matriz Likert", icon: "Grid2x2", role: "grid", needsGroup: true, control: "matrix", grading: "manual", validate: validateRequired }),
  answerPlugin({ type: "q_editable_table", label: "Tabla editable", icon: "Table", role: "grid", needsGroup: true, control: "matrix", grading: "manual", validate: validateRequired }),

  // --- Ordering / matching (objective when every option has a matching key) ---
  answerPlugin({ type: "q_ranking", label: "Ranking", icon: "ArrowDownWideNarrow", role: "listbox", needsGroup: true, control: "ordering", grading: "auto_if_configured", expects: "ordering", options: MULTI_ANSWER, validate: validateRequired, defaults: singleChoiceDefaults() }),
  answerPlugin({ type: "q_ordering", label: "Ordenamiento", icon: "ListOrdered", role: "listbox", needsGroup: true, control: "ordering", grading: "auto_if_configured", expects: "ordering", options: MULTI_ANSWER, validate: validateRequired, defaults: singleChoiceDefaults() }),
  answerPlugin({ type: "q_matching", label: "Emparejamiento", icon: "Link2", role: "group", needsGroup: true, control: "ordering", grading: "auto_if_configured", expects: "matching", options: MULTI_ANSWER, validate: validateRequired, defaults: singleChoiceDefaults() }),
  answerPlugin({ type: "q_categorization", label: "Categorización", icon: "FolderTree", role: "group", needsGroup: true, control: "ordering", grading: "auto_if_configured", expects: "matching", options: MULTI_ANSWER, validate: validateRequired, defaults: singleChoiceDefaults() }),

  // --- Rich item types ---
  answerPlugin({ type: "q_image_choice", label: "Pregunta con imagen", icon: "ImagePlus", role: "radiogroup", needsGroup: true, control: "radio", grading: "auto", options: SINGLE_ANSWER, validate: validateChoice, score: scoreChoice, defaults: singleChoiceDefaults() }),
  answerPlugin({ type: "q_hotspot", label: "Zona interactiva (base)", icon: "MousePointerClick", role: "group", needsGroup: true, control: "pending", grading: "manual", status: "beta", validate: validateRequired }),
  answerPlugin({ type: "q_scenario", label: "Escenario", icon: "BookOpen", role: "group", control: "textarea", grading: "manual", validate: validateRequired }),
  answerPlugin({ type: "q_multi_step_case", label: "Caso multi-paso", icon: "Layers", role: "group", control: "textarea", grading: "manual", status: "beta", validate: validateRequired }),
  answerPlugin({ type: "q_chart_interpretation", label: "Interpretación de tabla/gráfico", icon: "LineChart", role: "group", control: "textarea", grading: "manual", validate: validateRequired }),
  answerPlugin({
    type: "q_file_response", label: "Respuesta con archivo", icon: "Upload", role: "group",
    control: "upload", grading: "manual", status: "beta", validate: validateRequired,
    score: (block) => ({ raw: 0, max: block.score.points, needsReview: true }),
  }),
];
