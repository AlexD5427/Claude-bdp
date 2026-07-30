/**
 * Seed data for the mock provider.
 *
 * Realistic es-MX demonstration processes so the module is
 * fully explorable without a deployed backend. This is clearly demo data — the
 * mock provider labels itself accordingly in the sync indicator.
 */

import { createProcess } from "../../../features/processes/domain/factory";
import { recruitmentProcessSchema, type RecruitmentProcess } from "../../../features/processes/domain/models";
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
