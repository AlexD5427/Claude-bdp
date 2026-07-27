/**
 * Answer plugins — the scored/collected question types that make up the MVP.
 *
 * Each declares its schema-valid default, a validator, and a scorer. Text and
 * numeric types share the common validators; choice types share the choice
 * validator + scorer. Presentation config keys (min/max/scale/etc.) are those
 * forwarded by the public DTO mapper.
 */

import { makeBlock, makeOption, scoreChoice, scoreManualAware, validateChoice, validateNumeric, validateRequired, validateTextLength } from "./helpers";
import type { AssessmentBlock } from "../domain/questions";
import type { QuestionPlugin } from "./registry";

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
}

function answerPlugin(spec: AnswerSpec): QuestionPlugin {
  return {
    type: spec.type,
    label: spec.label,
    category: "answer",
    icon: spec.icon,
    isQuestion: true,
    status: spec.status ?? "stable",
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

export const answerPlugins: QuestionPlugin[] = [
  // --- Text ---
  answerPlugin({ type: "q_short_text", label: "Texto corto", icon: "Type", role: "textbox", validate: validateTextLength }),
  answerPlugin({ type: "q_long_text", label: "Texto largo", icon: "TextCursor", role: "textbox", validate: validateTextLength, defaults: { config: { rows: 5 } } }),

  // --- Numeric ---
  answerPlugin({ type: "q_integer", label: "Entero", icon: "Hash", role: "spinbutton", validate: validateNumeric }),
  answerPlugin({ type: "q_decimal", label: "Decimal", icon: "Hash", role: "spinbutton", validate: validateNumeric, defaults: { config: { decimals: 2 } } }),
  answerPlugin({ type: "q_percentage", label: "Porcentaje", icon: "Percent", role: "spinbutton", validate: validateNumeric, defaults: { config: { min: 0, max: 100 } } }),
  answerPlugin({ type: "q_currency", label: "Moneda", icon: "DollarSign", role: "spinbutton", validate: validateNumeric, defaults: { config: { decimals: 2 } } }),

  // --- Date/time ---
  answerPlugin({ type: "q_date", label: "Fecha", icon: "Calendar", role: "textbox" }),
  answerPlugin({ type: "q_time", label: "Hora", icon: "Clock", role: "textbox" }),
  answerPlugin({ type: "q_datetime", label: "Fecha y hora", icon: "CalendarClock", role: "textbox" }),

  // --- Choice ---
  answerPlugin({ type: "q_single_choice", label: "Opción única", icon: "CircleDot", role: "radiogroup", needsGroup: true, validate: validateChoice, score: scoreChoice, defaults: singleChoiceDefaults() }),
  answerPlugin({ type: "q_multiple_choice", label: "Opción múltiple", icon: "ListChecks", role: "group", needsGroup: true, validate: validateChoice, score: scoreChoice, defaults: singleChoiceDefaults() }),
  answerPlugin({ type: "q_dropdown", label: "Lista desplegable", icon: "ChevronDown", role: "listbox", validate: validateChoice, score: scoreChoice, defaults: singleChoiceDefaults() }),
  answerPlugin({ type: "q_multiselect", label: "Selección múltiple", icon: "ListPlus", role: "listbox", needsGroup: true, validate: validateChoice, score: scoreChoice, defaults: singleChoiceDefaults() }),
  answerPlugin({ type: "q_true_false", label: "Verdadero / Falso", icon: "ToggleLeft", role: "radiogroup", needsGroup: true, validate: validateChoice, score: scoreChoice, defaults: { options: [opt("Verdadero", "true"), opt("Falso", "false")], score: { mode: "exact", points: 1, weight: 1, rubricId: null, competency: "", normalize: false } } }),
  answerPlugin({ type: "q_yes_no_na", label: "Sí / No / N/A", icon: "CircleHelp", role: "radiogroup", needsGroup: true, validate: validateChoice, score: scoreChoice, defaults: { options: [opt("Sí", "yes"), opt("No", "no"), opt("N/A", "na")] } }),

  // --- Scales ---
  answerPlugin({ type: "q_likert", label: "Escala Likert", icon: "BarChart2", role: "radiogroup", needsGroup: true, validate: validateChoice, score: scoreChoice, defaults: { config: { scaleMin: 1, scaleMax: 5 } } }),
  answerPlugin({ type: "q_numeric_scale", label: "Escala numérica", icon: "Ruler", role: "slider", validate: validateNumeric, defaults: { config: { scaleMin: 0, scaleMax: 10, scaleStep: 1 } } }),
  answerPlugin({ type: "q_stars", label: "Estrellas / iconos", icon: "Star", role: "radiogroup", needsGroup: true, validate: validateRequired, defaults: { config: { starCount: 5 } } }),

  // --- Matrices / tables ---
  answerPlugin({ type: "q_matrix", label: "Matriz", icon: "Grid3x3", role: "grid", needsGroup: true, validate: validateRequired }),
  answerPlugin({ type: "q_likert_matrix", label: "Matriz Likert", icon: "Grid2x2", role: "grid", needsGroup: true, validate: validateRequired }),
  answerPlugin({ type: "q_editable_table", label: "Tabla editable", icon: "Table", role: "grid", needsGroup: true, validate: validateRequired }),

  // --- Ordering / matching ---
  answerPlugin({ type: "q_ranking", label: "Ranking", icon: "ArrowDownWideNarrow", role: "listbox", needsGroup: true, validate: validateRequired, defaults: singleChoiceDefaults() }),
  answerPlugin({ type: "q_ordering", label: "Ordenamiento", icon: "ListOrdered", role: "listbox", needsGroup: true, validate: validateRequired, defaults: singleChoiceDefaults() }),
  answerPlugin({ type: "q_matching", label: "Emparejamiento", icon: "Link2", role: "group", needsGroup: true, validate: validateRequired }),
  answerPlugin({ type: "q_categorization", label: "Categorización", icon: "FolderTree", role: "group", needsGroup: true, validate: validateRequired }),

  // --- Rich item types ---
  answerPlugin({ type: "q_image_choice", label: "Pregunta con imagen", icon: "ImagePlus", role: "radiogroup", needsGroup: true, validate: validateChoice, score: scoreChoice, defaults: singleChoiceDefaults() }),
  answerPlugin({ type: "q_hotspot", label: "Zona interactiva (base)", icon: "MousePointerClick", role: "group", needsGroup: true, status: "beta", validate: validateRequired }),
  answerPlugin({ type: "q_scenario", label: "Escenario", icon: "BookOpen", role: "group", validate: validateRequired }),
  answerPlugin({ type: "q_multi_step_case", label: "Caso multi-paso", icon: "Layers", role: "group", status: "beta", validate: validateRequired }),
  answerPlugin({ type: "q_chart_interpretation", label: "Interpretación de tabla/gráfico", icon: "LineChart", role: "group", validate: validateRequired }),
  answerPlugin({ type: "q_file_response", label: "Respuesta con archivo", icon: "Upload", role: "group", status: "beta", validate: validateRequired, score: (block) => ({ raw: 0, max: block.score.points, needsReview: true }) }),
];
