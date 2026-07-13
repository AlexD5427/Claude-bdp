/**
 * Seed data for the mock provider.
 *
 * Realistic es-MX demonstration processes and assessments so the modules are
 * fully explorable without a deployed backend. This is clearly demo data — the
 * mock provider labels itself accordingly in the sync indicator.
 */

import { createProcess } from "../../../features/processes/domain/factory";
import { recruitmentProcessSchema, type RecruitmentProcess } from "../../../features/processes/domain/models";
import { createAssessment } from "../../../features/assessments/domain/factory";
import { publishDraft } from "../../../features/assessments/versioning/operations";
import { assessmentContentSchema, type AssessmentDefinition } from "../../../features/assessments/domain/assessment";
import { newId } from "../../../shared/ids";

export function seedProcesses(): RecruitmentProcess[] {
  const defs: Array<Partial<RecruitmentProcess> & { title: string }> = [
    {
      title: "Analista de Riesgo Crediticio",
      area: "Riesgos",
      department: "Riesgo de Crédito",
      location: "Ciudad de México",
      workMode: "hybrid",
      experienceLevel: "mid",
      vacancies: 2,
      processStatus: "receiving",
      publicationStatus: "published",
      visibility: "both",
    },
    {
      title: "Ejecutivo de Servicio al Cliente",
      area: "Operaciones",
      department: "Atención a Clientes",
      location: "Guadalajara",
      workMode: "onsite",
      experienceLevel: "junior",
      vacancies: 5,
      processStatus: "published",
      publicationStatus: "published",
      visibility: "external",
    },
    {
      title: "Cajero de Sucursal",
      area: "Operaciones",
      department: "Red de Sucursales",
      location: "Monterrey",
      workMode: "onsite",
      experienceLevel: "entry",
      vacancies: 8,
      processStatus: "configuring",
      publicationStatus: "unpublished",
      visibility: "internal",
    },
    {
      title: "Líder de Desarrollo de Software",
      area: "Tecnología",
      department: "Ingeniería",
      location: "Remoto",
      workMode: "remote",
      experienceLevel: "lead",
      vacancies: 1,
      processStatus: "pending_approval",
      publicationStatus: "unpublished",
      visibility: "both",
    },
    {
      title: "Coordinador Comercial Regional",
      area: "Comercial",
      department: "Ventas",
      location: "Puebla",
      workMode: "hybrid",
      experienceLevel: "senior",
      vacancies: 1,
      processStatus: "paused",
      publicationStatus: "paused",
      visibility: "external",
    },
    {
      title: "Especialista en Cumplimiento Normativo",
      area: "Legal y Cumplimiento",
      department: "Compliance",
      location: "Ciudad de México",
      workMode: "onsite",
      experienceLevel: "mid",
      vacancies: 1,
      processStatus: "closed",
      publicationStatus: "closed",
      visibility: "internal",
    },
  ];

  return defs.map((d, i) => {
    const base = createProcess({ title: d.title, createdBy: "Reclutamiento", area: d.area });
    const openingDate = new Date(Date.now() - (i + 1) * 5 * 86400000).toISOString();
    const closingDate = new Date(Date.now() + (30 - i * 3) * 86400000).toISOString();
    return recruitmentProcessSchema.parse({
      ...base,
      ...d,
      openingDate,
      closingDate,
      sourceProvider: "mock",
      synchronizationStatus: "synced",
    });
  });
}

function knowledgeContent() {
  return assessmentContentSchema.parse({
    sections: [
      {
        id: newId("sec"),
        title: "Conocimientos generales",
        order: 0,
        blocks: [
          {
            id: newId("blk"),
            type: "q_single_choice",
            order: 0,
            label: "¿Qué mide la tasa de morosidad de una cartera de crédito?",
            required: true,
            options: [
              { id: newId("opt"), label: "El porcentaje de créditos con atraso", value: "a", score: 1, correct: true },
              { id: newId("opt"), label: "El total de créditos otorgados", value: "b", score: 0, correct: false },
              { id: newId("opt"), label: "La utilidad neta del periodo", value: "c", score: 0, correct: false },
            ],
            score: { mode: "exact", points: 1 },
          },
          {
            id: newId("blk"),
            type: "q_integer",
            order: 1,
            label: "Si una cartera tiene 200 créditos y 15 con atraso, ¿cuál es la morosidad en %?",
            required: true,
            config: { min: 0, max: 100 },
            validation: { min: 0, max: 100 },
            score: { mode: "exact", points: 2 },
          },
        ],
      },
    ],
    publicInstructions: "Responde con base en tu experiencia. Tiempo estimado: 15 minutos.",
  });
}

export function seedAssessments(): AssessmentDefinition[] {
  const a1 = createAssessment({
    name: "Preselección · Analista de Riesgo",
    category: "pre_screening",
    createdBy: "Reclutamiento",
    content: knowledgeContent(),
  });
  // Publish the first one so there is a served version to demonstrate versioning.
  const published = publishDraft(a1, "Reclutamiento", "Versión inicial de preselección");

  const a2 = createAssessment({
    name: "Prueba técnica · Servicio al Cliente",
    category: "situational",
    createdBy: "Reclutamiento",
    content: assessmentContentSchema.parse({
      sections: [
        {
          id: newId("sec"),
          title: "Juicio situacional",
          order: 0,
          blocks: [
            {
              id: newId("blk"),
              type: "q_likert",
              order: 0,
              label: "Un cliente molesto eleva la voz. ¿Qué tan de acuerdo estás con escuchar sin interrumpir?",
              required: true,
              config: { scaleMin: 1, scaleMax: 5 },
              score: { mode: "weighted", points: 5, weight: 1, competency: "Orientación al cliente" },
            },
          ],
        },
      ],
    }),
  });

  const a3 = createAssessment({
    name: "Competencias de Liderazgo",
    category: "competency",
    createdBy: "Reclutamiento",
  });

  return [published, a2, a3];
}
