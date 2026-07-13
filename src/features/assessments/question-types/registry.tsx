import type { ComponentType } from "react";
import {
  Heading1,
  Heading2,
  Pilcrow,
  Info,
  Minus,
  Type,
  AlignLeft,
  FileText,
  Hash,
  Percent,
  DollarSign,
  Calendar,
  Clock,
  CalendarClock,
  CircleDot,
  ListChecks,
  ChevronDownSquare,
  ToggleLeft,
  ListOrdered,
  Star,
  SlidersHorizontal,
  Grid3x3,
  MoveVertical,
  Image as ImageIcon,
  Upload,
  Landmark,
  Code2,
  Database,
  type LucideIcon,
} from "lucide-react";
import { uid } from "../../../shared/id";
import { env } from "../../../infrastructure/env";
import type { AssessmentOption, AssessmentQuestion, QuestionFamily } from "../types";

/**
 * Universal question plugin architecture.
 *
 * Every question/content type is a plugin registered here. The builder, preview,
 * validation, scoring and import layers all consult the registry instead of
 * using giant `switch` statements over the type string. Unknown types resolve
 * to a graceful "unsupported" fallback rather than crashing.
 *
 * A plugin declares its metadata and a factory for a default instance; capable
 * types also declare option/scoring/correct-answer support so the properties
 * panel can render the right controls. Advanced simulations are registered but
 * flagged `available: false` behind the `enableAdvancedSimulations` feature
 * flag — visible, clearly labelled as unavailable, and never faked as ready.
 */

export interface QuestionPluginCapabilities {
  options: boolean;
  scoring: boolean;
  correctAnswer: boolean;
  /** Drag-based interaction that must offer a keyboard alternative. */
  dragBased?: boolean;
}

export interface QuestionPlugin {
  type: string;
  label: string;
  family: QuestionFamily;
  icon: LucideIcon;
  description: string;
  capabilities: QuestionPluginCapabilities;
  /** Whether the plugin is production-ready (false → behind a feature flag). */
  available: boolean;
  createDefault: (id?: string) => AssessmentQuestion;
}

function opt(label: string, value = label): AssessmentOption {
  return { id: uid("opt"), label, value };
}

function base(
  type: string,
  family: QuestionFamily,
  label: string,
  overrides: Partial<AssessmentQuestion> = {},
): AssessmentQuestion {
  return {
    id: uid("q"),
    type,
    family,
    label,
    required: family !== "content",
    options: [],
    validation: {},
    scoring: { mode: "none", points: 0, weight: 1 },
    config: {},
    tags: [],
    configured: true,
    ...overrides,
  };
}

const REGISTRY = new Map<string, QuestionPlugin>();

function register(plugin: QuestionPlugin) {
  REGISTRY.set(plugin.type, plugin);
}

/* ---- content ----------------------------------------------------- */
register({ type: "title", label: "Título", family: "content", icon: Heading1, description: "Encabezado de sección.", available: true, capabilities: { options: false, scoring: false, correctAnswer: false }, createDefault: () => base("title", "content", "Título de sección", { required: false }) });
register({ type: "subtitle", label: "Subtítulo", family: "content", icon: Heading2, description: "Subtítulo.", available: true, capabilities: { options: false, scoring: false, correctAnswer: false }, createDefault: () => base("subtitle", "content", "Subtítulo", { required: false }) });
register({ type: "paragraph", label: "Párrafo", family: "content", icon: Pilcrow, description: "Texto explicativo.", available: true, capabilities: { options: false, scoring: false, correctAnswer: false }, createDefault: () => base("paragraph", "content", "Texto del párrafo…", { required: false }) });
register({ type: "instructions", label: "Instrucciones", family: "content", icon: Info, description: "Instrucciones para el candidato.", available: true, capabilities: { options: false, scoring: false, correctAnswer: false }, createDefault: () => base("instructions", "content", "Lee atentamente las siguientes instrucciones…", { required: false }) });
register({ type: "notice", label: "Aviso", family: "content", icon: Info, description: "Aviso destacado.", available: true, capabilities: { options: false, scoring: false, correctAnswer: false }, createDefault: () => base("notice", "content", "Aviso importante.", { required: false }) });
register({ type: "divider", label: "Separador", family: "content", icon: Minus, description: "Separador visual.", available: true, capabilities: { options: false, scoring: false, correctAnswer: false }, createDefault: () => base("divider", "content", "", { required: false }) });

/* ---- text -------------------------------------------------------- */
register({ type: "short_text", label: "Texto corto", family: "text", icon: Type, description: "Respuesta de una línea.", available: true, capabilities: { options: false, scoring: true, correctAnswer: true }, createDefault: () => base("short_text", "text", "Pregunta de texto corto") });
register({ type: "long_text", label: "Texto largo", family: "text", icon: AlignLeft, description: "Respuesta de varias líneas.", available: true, capabilities: { options: false, scoring: true, correctAnswer: false }, createDefault: () => base("long_text", "text", "Pregunta de texto largo") });
register({ type: "essay", label: "Ensayo", family: "text", icon: FileText, description: "Respuesta extensa con revisión manual.", available: true, capabilities: { options: false, scoring: true, correctAnswer: false }, createDefault: () => base("essay", "text", "Consigna del ensayo", { scoring: { mode: "manual", points: 10, weight: 1 } }) });

/* ---- numeric ----------------------------------------------------- */
register({ type: "integer", label: "Entero", family: "numeric", icon: Hash, description: "Número entero.", available: true, capabilities: { options: false, scoring: true, correctAnswer: true }, createDefault: () => base("integer", "numeric", "Pregunta numérica (entero)", { config: { step: 1 } }) });
register({ type: "decimal", label: "Decimal", family: "numeric", icon: Hash, description: "Número decimal.", available: true, capabilities: { options: false, scoring: true, correctAnswer: true }, createDefault: () => base("decimal", "numeric", "Pregunta numérica (decimal)", { validation: { decimalPlaces: 2 } }) });
register({ type: "percentage", label: "Porcentaje", family: "numeric", icon: Percent, description: "Valor porcentual 0–100.", available: true, capabilities: { options: false, scoring: true, correctAnswer: true }, createDefault: () => base("percentage", "numeric", "Pregunta de porcentaje", { validation: { min: 0, max: 100 } }) });
register({ type: "currency", label: "Moneda (Bs)", family: "numeric", icon: DollarSign, description: "Importe en bolivianos.", available: true, capabilities: { options: false, scoring: true, correctAnswer: true }, createDefault: () => base("currency", "numeric", "Pregunta de importe", { config: { currency: "BOB" } }) });

/* ---- datetime ---------------------------------------------------- */
register({ type: "date", label: "Fecha", family: "datetime", icon: Calendar, description: "Selección de fecha.", available: true, capabilities: { options: false, scoring: false, correctAnswer: false }, createDefault: () => base("date", "datetime", "Pregunta de fecha") });
register({ type: "time", label: "Hora", family: "datetime", icon: Clock, description: "Selección de hora.", available: true, capabilities: { options: false, scoring: false, correctAnswer: false }, createDefault: () => base("time", "datetime", "Pregunta de hora") });
register({ type: "datetime", label: "Fecha y hora", family: "datetime", icon: CalendarClock, description: "Fecha y hora.", available: true, capabilities: { options: false, scoring: false, correctAnswer: false }, createDefault: () => base("datetime", "datetime", "Pregunta de fecha y hora") });

/* ---- choice ------------------------------------------------------ */
register({ type: "single_choice", label: "Opción única", family: "choice", icon: CircleDot, description: "Selecciona una opción.", available: true, capabilities: { options: true, scoring: true, correctAnswer: true }, createDefault: () => base("single_choice", "choice", "Pregunta de opción única", { options: [opt("Opción A"), opt("Opción B"), opt("Opción C")], scoring: { mode: "exact", points: 1, weight: 1 } }) });
register({ type: "multiple_choice", label: "Selección múltiple", family: "choice", icon: ListChecks, description: "Selecciona varias opciones.", available: true, capabilities: { options: true, scoring: true, correctAnswer: true }, createDefault: () => base("multiple_choice", "choice", "Pregunta de selección múltiple", { options: [opt("Opción A"), opt("Opción B"), opt("Opción C")], scoring: { mode: "partial", points: 1, weight: 1 } }) });
register({ type: "dropdown", label: "Lista desplegable", family: "choice", icon: ChevronDownSquare, description: "Selección en lista.", available: true, capabilities: { options: true, scoring: true, correctAnswer: true }, createDefault: () => base("dropdown", "choice", "Pregunta de lista desplegable", { options: [opt("Opción A"), opt("Opción B")], scoring: { mode: "exact", points: 1, weight: 1 } }) });
register({ type: "true_false", label: "Verdadero/Falso", family: "choice", icon: ToggleLeft, description: "Verdadero o falso.", available: true, capabilities: { options: true, scoring: true, correctAnswer: true }, createDefault: () => base("true_false", "choice", "Afirmación verdadero/falso", { options: [opt("Verdadero"), opt("Falso")], scoring: { mode: "exact", points: 1, weight: 1 } }) });
register({ type: "yes_no_na", label: "Sí/No/N. A.", family: "choice", icon: ToggleLeft, description: "Sí, No o No aplica.", available: true, capabilities: { options: true, scoring: true, correctAnswer: true }, createDefault: () => base("yes_no_na", "choice", "Pregunta Sí/No/No aplica", { options: [opt("Sí"), opt("No"), opt("No aplica")] }) });

/* ---- scale ------------------------------------------------------- */
register({ type: "likert", label: "Escala Likert", family: "scale", icon: SlidersHorizontal, description: "Grado de acuerdo.", available: true, capabilities: { options: true, scoring: true, correctAnswer: false }, createDefault: () => base("likert", "scale", "Afirmación (escala Likert)", { options: [opt("Muy en desacuerdo"), opt("En desacuerdo"), opt("Neutral"), opt("De acuerdo"), opt("Muy de acuerdo")] }) });
register({ type: "numeric_scale", label: "Escala numérica", family: "scale", icon: SlidersHorizontal, description: "Escala 1–N.", available: true, capabilities: { options: false, scoring: true, correctAnswer: false }, createDefault: () => base("numeric_scale", "scale", "Pregunta de escala numérica", { config: { min: 1, max: 5 } }) });
register({ type: "star_rating", label: "Estrellas", family: "scale", icon: Star, description: "Calificación por estrellas.", available: true, capabilities: { options: false, scoring: true, correctAnswer: false }, createDefault: () => base("star_rating", "scale", "Pregunta de calificación", { config: { max: 5 } }) });
register({ type: "nps", label: "Escala NPS", family: "scale", icon: SlidersHorizontal, description: "Escala 0–10.", available: true, capabilities: { options: false, scoring: false, correctAnswer: false }, createDefault: () => base("nps", "scale", "¿Qué tan probable es que recomiendes…?", { config: { min: 0, max: 10 } }) });

/* ---- matrix / ordering ------------------------------------------- */
register({ type: "matrix_single", label: "Matriz (opción única)", family: "matrix", icon: Grid3x3, description: "Filas × columnas, una por fila.", available: true, capabilities: { options: true, scoring: true, correctAnswer: false }, createDefault: () => base("matrix_single", "matrix", "Pregunta de matriz", { config: { rows: ["Fila 1", "Fila 2"], columns: ["Columna 1", "Columna 2", "Columna 3"] } }) });
register({ type: "ranking", label: "Ranking / Ordenar", family: "ordering", icon: ListOrdered, description: "Ordena por prioridad (con alternativa por teclado).", available: true, capabilities: { options: true, scoring: true, correctAnswer: false, dragBased: true }, createDefault: () => base("ranking", "ordering", "Ordena los siguientes elementos", { options: [opt("Elemento 1"), opt("Elemento 2"), opt("Elemento 3")] }) });
register({ type: "drag_order", label: "Arrastrar y soltar", family: "ordering", icon: MoveVertical, description: "Secuencia mediante arrastre (con alternativa por teclado).", available: true, capabilities: { options: true, scoring: true, correctAnswer: true, dragBased: true }, createDefault: () => base("drag_order", "ordering", "Coloca los pasos en el orden correcto", { options: [opt("Paso 1"), opt("Paso 2"), opt("Paso 3")] }) });

/* ---- media / file ------------------------------------------------ */
register({ type: "image_content", label: "Imagen", family: "media", icon: ImageIcon, description: "Bloque de imagen.", available: true, capabilities: { options: false, scoring: false, correctAnswer: false }, createDefault: () => base("image_content", "media", "Descripción de la imagen", { required: false, config: { url: "" } }) });
register({ type: "file_upload", label: "Cargar archivo", family: "file", icon: Upload, description: "Carga de documento (contrato seguro).", available: true, capabilities: { options: false, scoring: false, correctAnswer: false }, createDefault: () => base("file_upload", "file", "Adjunta un documento", { validation: { fileTypes: [".pdf", ".jpg", ".png"], maxFileSizeMb: 10, maxFiles: 1 } }) });

/* ---- scenario / technical --------------------------------------- */
register({ type: "scenario_case", label: "Caso situacional", family: "scenario", icon: FileText, description: "Caso con enunciado y pregunta.", available: true, capabilities: { options: true, scoring: true, correctAnswer: true }, createDefault: () => base("scenario_case", "scenario", "Enunciado del caso situacional", { options: [opt("Respuesta A"), opt("Respuesta B"), opt("Respuesta C")], config: { scenario: "" }, scoring: { mode: "exact", points: 2, weight: 1 } }) });
register({ type: "code", label: "Código", family: "technical", icon: Code2, description: "Respuesta de código (sin ejecución).", available: true, capabilities: { options: false, scoring: true, correctAnswer: false }, createDefault: () => base("code", "technical", "Escribe el código solicitado", { config: { language: "javascript" }, scoring: { mode: "manual", points: 5, weight: 1 } }) });
register({ type: "sql", label: "Consulta SQL", family: "technical", icon: Database, description: "Consulta SQL (sin ejecución).", available: true, capabilities: { options: false, scoring: true, correctAnswer: false }, createDefault: () => base("sql", "technical", "Escribe la consulta SQL", { config: { dialect: "postgresql" }, scoring: { mode: "manual", points: 5, weight: 1 } }) });

/* ---- banking simulations (advanced, feature-flagged) ------------- */
const BANKING_SIMS: { type: string; label: string }[] = [
  { type: "sim_credit_analysis", label: "Simulación de análisis crediticio" },
  { type: "sim_risk", label: "Simulación de riesgo" },
  { type: "sim_cash", label: "Simulación de caja" },
  { type: "sim_reconciliation", label: "Simulación de conciliación" },
  { type: "sim_customer_service", label: "Simulación de atención al cliente" },
  { type: "sim_operations", label: "Simulación de operaciones" },
];
for (const sim of BANKING_SIMS) {
  register({
    type: sim.type,
    label: sim.label,
    family: "banking",
    icon: Landmark,
    description: "Simulación bancaria avanzada (datos ficticios).",
    available: env.enableAdvancedSimulations,
    capabilities: { options: false, scoring: true, correctAnswer: false },
    createDefault: () =>
      base(sim.type, "banking", sim.label, {
        required: false,
        config: { simulation: sim.type, note: "Simulación de demostración con datos ficticios." },
        configured: false,
      }),
  });
}

/* ---- public API -------------------------------------------------- */

export function getPlugin(type: string): QuestionPlugin | undefined {
  return REGISTRY.get(type);
}

export function listPlugins(): QuestionPlugin[] {
  return [...REGISTRY.values()];
}

export function pluginsByFamily(): Record<QuestionFamily, QuestionPlugin[]> {
  const grouped = {} as Record<QuestionFamily, QuestionPlugin[]>;
  for (const plugin of REGISTRY.values()) {
    (grouped[plugin.family] ??= []).push(plugin);
  }
  return grouped;
}

/** Human labels for the family groups in the builder sidebar. */
export const FAMILY_LABELS: Record<QuestionFamily, string> = {
  content: "Contenido",
  text: "Respuestas de texto",
  numeric: "Respuestas numéricas",
  datetime: "Fecha y hora",
  choice: "Preguntas de opción",
  scale: "Escalas y valoración",
  matrix: "Matriz",
  ordering: "Ordenar y relacionar",
  media: "Multimedia",
  file: "Carga de archivos",
  scenario: "Casos situacionales",
  technical: "Preguntas técnicas",
  banking: "Simulaciones bancarias",
};

/** Create a default question for a type, or a graceful "unsupported" block. */
export function createQuestion(type: string): AssessmentQuestion {
  const plugin = getPlugin(type);
  if (!plugin) {
    return base(type, "content", `Tipo no soportado: ${type}`, { required: false, configured: false });
  }
  return plugin.createDefault();
}

/** Renderer components are resolved lazily by the preview (kept out of core). */
export type CandidateRenderer = ComponentType<{ question: AssessmentQuestion }>;
