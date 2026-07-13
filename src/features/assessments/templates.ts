import { uid } from "../../shared/id";
import { createQuestion } from "./question-types/registry";
import type { AssessmentOption, AssessmentQuestion, AssessmentSection } from "./types";
import type { NewAssessmentInput } from "./factory";
import { locale } from "../../content/locale/es-BO";

/**
 * Assessment template library.
 *
 * Original, structured-hiring-based starting points (not copied from any
 * commercial product). Each template returns a `NewAssessmentInput` the store
 * turns into a fresh draft, so users can create from, preview and customise it.
 */

function q(type: string, label: string, patch: Partial<AssessmentQuestion> = {}): AssessmentQuestion {
  const base = createQuestion(type);
  return { ...base, label, ...patch };
}

function options(labels: string[], correctIndex?: number): AssessmentOption[] {
  return labels.map((label, i) => ({
    id: uid("opt"),
    label,
    value: label,
    correct: correctIndex === i ? true : undefined,
  }));
}

function section(title: string, order: number, questions: AssessmentQuestion[]): AssessmentSection {
  return { id: uid("sec"), title, order, questions };
}

export interface AssessmentTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  build: () => NewAssessmentInput;
}

export const ASSESSMENT_TEMPLATES: AssessmentTemplate[] = [
  {
    id: "comercial",
    name: locale.assessments.categories.competency + " · Comercial",
    description: "Orientación al cliente, negociación y logro de metas.",
    icon: "🏦",
    build: () => ({
      name: "Evaluación comercial",
      category: "competency",
      tags: ["comercial", "ventas"],
      sections: [
        section("Orientación al cliente", 0, [
          q("instructions", "Responde con sinceridad según tu experiencia."),
          q("likert", "Disfruto identificar las necesidades de los clientes."),
          q("likert", "Hago seguimiento proactivo a mis prospectos."),
          q("single_choice", "Ante un cliente molesto, lo primero que haces es:", {
            options: options([
              "Escuchar activamente y validar su preocupación",
              "Explicar de inmediato la política",
              "Derivarlo a otra área",
            ], 0),
            scoring: { mode: "exact", points: 2, weight: 1 },
          }),
        ]),
        section("Logro de metas", 1, [
          q("numeric_scale", "Del 1 al 5, ¿cómo calificas tu cumplimiento de metas del último año?"),
          q("essay", "Describe un logro comercial del que te sientas orgulloso/a."),
        ]),
      ],
    }),
  },
  {
    id: "servicio",
    name: locale.assessments.categories.competency + " · Servicio al cliente",
    description: "Empatía, resolución y comunicación en atención.",
    icon: "🎧",
    build: () => ({
      name: "Evaluación de servicio al cliente",
      category: "competency",
      tags: ["servicio", "atención"],
      sections: [
        section("Escenarios de atención", 0, [
          q("scenario_case", "Un cliente reclama por una comisión que no reconoce.", {
            config: { scenario: "El cliente llega molesto a la agencia y eleva la voz." },
            options: options([
              "Mantener la calma, escuchar y revisar el detalle con el cliente",
              "Indicarle que revise su contrato",
              "Pedirle que regrese otro día",
            ], 0),
            scoring: { mode: "exact", points: 3, weight: 1 },
          }),
          q("likert", "Me resulta fácil mantener la calma bajo presión."),
        ]),
      ],
    }),
  },
  {
    id: "preseleccion",
    name: locale.assessments.categories.prescreen,
    description: "Filtro inicial de requisitos y disponibilidad.",
    icon: "✅",
    build: () => ({
      name: "Cuestionario de preselección",
      category: "prescreen",
      tags: ["preselección"],
      sections: [
        section("Requisitos", 0, [
          q("yes_no_na", "¿Cuentas con experiencia en el sector financiero?"),
          q("single_choice", "Nivel académico alcanzado:", {
            options: options(["Bachiller", "Técnico", "Licenciatura", "Posgrado"]),
          }),
          q("short_text", "¿Cuál es tu expectativa salarial (Bs)?"),
          q("date", "¿A partir de qué fecha tendrías disponibilidad?"),
        ]),
      ],
    }),
  },
  {
    id: "entrevista",
    name: locale.assessments.categories.interview,
    description: "Guía estructurada con criterios de evaluación.",
    icon: "🗣️",
    build: () => ({
      name: "Entrevista estructurada",
      category: "interview",
      tags: ["entrevista"],
      sections: [
        section("Preguntas conductuales", 0, [
          q("instructions", "Registra la respuesta del candidato y califica con la escala."),
          q("essay", "Cuéntame sobre una situación difícil con un compañero y cómo la resolviste."),
          q("numeric_scale", "Calificación del entrevistador (trabajo en equipo)", { config: { min: 1, max: 5 } }),
          q("essay", "Describe un objetivo ambicioso que hayas alcanzado."),
          q("numeric_scale", "Calificación del entrevistador (orientación a resultados)", { config: { min: 1, max: 5 } }),
        ]),
      ],
    }),
  },
  {
    id: "tecnica",
    name: locale.assessments.categories.technical,
    description: "Conocimientos técnicos y análisis.",
    icon: "🧮",
    build: () => ({
      name: "Evaluación técnica",
      category: "technical",
      tags: ["técnica"],
      sections: [
        section("Conocimientos", 0, [
          q("single_choice", "¿Qué indicador mide la rentabilidad sobre el patrimonio?", {
            options: options(["ROE", "ROA", "Margen bruto", "Liquidez corriente"], 0),
            scoring: { mode: "exact", points: 1, weight: 1 },
          }),
          q("integer", "Si una cartera crece de 100 a 125, ¿cuál es el crecimiento porcentual?", {
            scoring: { mode: "exact", points: 1, weight: 1, expectedValue: 25 },
            validation: { min: 0, max: 100 },
          }),
          q("sql", "Escribe una consulta que liste los créditos con saldo mayor a 10.000 Bs."),
        ]),
      ],
    }),
  },
  {
    id: "credito",
    name: locale.assessments.categories.knowledge + " · Análisis crediticio",
    description: "Fundamentos de evaluación de crédito (datos ficticios).",
    icon: "📊",
    build: () => ({
      name: "Evaluación de análisis crediticio",
      category: "knowledge",
      tags: ["crédito", "riesgo"],
      sections: [
        section("Fundamentos", 0, [
          q("single_choice", "¿Qué representa la capacidad de pago?", {
            options: options([
              "La posibilidad del cliente de cubrir sus obligaciones",
              "El valor de las garantías",
              "El historial en la central de riesgo",
            ], 0),
            scoring: { mode: "exact", points: 2, weight: 1 },
          }),
          q("multiple_choice", "¿Cuáles son las “5 C” del crédito?", {
            options: options(["Carácter", "Capacidad", "Capital", "Colateral", "Condiciones", "Cobranza"]),
          }),
        ]),
      ],
    }),
  },
];

export function getTemplate(id: string): AssessmentTemplate | undefined {
  return ASSESSMENT_TEMPLATES.find((t) => t.id === id);
}
