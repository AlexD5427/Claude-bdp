import { uid, slugCode, slugify } from "../../shared/id";
import type {
  EmploymentType,
  ExperienceLevel,
  ProcessStatus,
  PublicationStatus,
  RecruitmentProcess,
  Visibility,
  WorkMode,
} from "./types";

/**
 * Seed processes for the mock provider — realistic, Spanish (es-BO), banking
 * flavoured, and clearly demonstration data. They give the redesigned module a
 * populated first-run experience without any backend dependency.
 */

interface Seed {
  title: string;
  code: string;
  area: string;
  department: string;
  city: string;
  branch: string;
  vacancies: number;
  status: ProcessStatus;
  publicationStatus: PublicationStatus;
  visibility: Visibility;
  workMode: WorkMode;
  employmentType: EmploymentType;
  experienceLevel: ExperienceLevel;
  shortDescription: string;
  daysAgoOpened: number;
  daysUntilClose: number | null;
}

const SEEDS: Seed[] = [
  {
    title: "Oficial de Créditos 2026",
    code: "OFICIAL-CREDITOS-2026",
    area: "Negocios",
    department: "Créditos",
    city: "La Paz",
    branch: "Agencia Central",
    vacancies: 4,
    status: "recepcion_activa",
    publicationStatus: "publicado",
    visibility: "ambos",
    workMode: "presencial",
    employmentType: "tiempo_completo",
    experienceLevel: "junior",
    shortDescription:
      "Colocación y seguimiento de cartera de créditos productivos para micro y pequeña empresa.",
    daysAgoOpened: 12,
    daysUntilClose: 18,
  },
  {
    title: "Jefe de Agencia La Paz",
    code: "JEFE-AGENCIA-LP",
    area: "Red de Agencias",
    department: "Operaciones",
    city: "La Paz",
    branch: "Agencia Miraflores",
    vacancies: 1,
    status: "publicado",
    publicationStatus: "publicado",
    visibility: "interno",
    workMode: "presencial",
    employmentType: "tiempo_completo",
    experienceLevel: "jefatura",
    shortDescription: "Liderazgo comercial y operativo de la agencia, con metas de cartera y servicio.",
    daysAgoOpened: 6,
    daysUntilClose: 9,
  },
  {
    title: "Analista de Riesgos",
    code: "ANALISTA-RIESGOS",
    area: "Riesgos",
    department: "Riesgo Crediticio",
    city: "Santa Cruz",
    branch: "Oficina Regional",
    vacancies: 2,
    status: "aprobado",
    publicationStatus: "no_publicado",
    visibility: "externo",
    workMode: "hibrido",
    employmentType: "tiempo_completo",
    experienceLevel: "semi_senior",
    shortDescription: "Evaluación de riesgo de cartera, modelos de scoring y reportería regulatoria.",
    daysAgoOpened: 3,
    daysUntilClose: null,
  },
  {
    title: "Programa Trainee 2026",
    code: "TRAINEE-2026",
    area: "Talento Humano",
    department: "Desarrollo",
    city: "Cochabamba",
    branch: "Oficina Nacional",
    vacancies: 10,
    status: "en_configuracion",
    publicationStatus: "no_publicado",
    visibility: "externo",
    workMode: "presencial",
    employmentType: "temporal",
    experienceLevel: "sin_experiencia",
    shortDescription: "Programa de formación acelerada para recién egresados en banca de desarrollo.",
    daysAgoOpened: 1,
    daysUntilClose: 40,
  },
  {
    title: "Cajero Bancario",
    code: "CAJERO-BANCARIO",
    area: "Operaciones",
    department: "Caja y Servicios",
    city: "El Alto",
    branch: "Agencia 16 de Julio",
    vacancies: 3,
    status: "recepcion_activa",
    publicationStatus: "publicado",
    visibility: "ambos",
    workMode: "presencial",
    employmentType: "tiempo_completo",
    experienceLevel: "junior",
    shortDescription: "Atención en ventanilla, manejo de efectivo y conciliación de operaciones.",
    daysAgoOpened: 20,
    daysUntilClose: 5,
  },
  {
    title: "Asistente de Operaciones",
    code: "ASISTENTE-OPERACIONES",
    area: "Operaciones",
    department: "Back Office",
    city: "La Paz",
    branch: "Oficina Nacional",
    vacancies: 2,
    status: "pausado",
    publicationStatus: "pausado",
    visibility: "interno",
    workMode: "presencial",
    employmentType: "tiempo_completo",
    experienceLevel: "junior",
    shortDescription: "Soporte a procesos operativos, conciliaciones y archivo documental.",
    daysAgoOpened: 30,
    daysUntilClose: null,
  },
  {
    title: "Convocatoria Interna · Coordinador Comercial",
    code: "INTERNA-COORD-COMERCIAL",
    area: "Negocios",
    department: "Comercial",
    city: "Tarija",
    branch: "Oficina Regional",
    vacancies: 1,
    status: "cerrado",
    publicationStatus: "cerrado",
    visibility: "interno",
    workMode: "presencial",
    employmentType: "tiempo_completo",
    experienceLevel: "senior",
    shortDescription: "Coordinación de la fuerza comercial regional y cumplimiento de metas.",
    daysAgoOpened: 60,
    daysUntilClose: -10,
  },
  {
    title: "Especialista en Cumplimiento",
    code: "ESPECIALISTA-CUMPLIMIENTO",
    area: "Cumplimiento",
    department: "Prevención LGI/FT",
    city: "La Paz",
    branch: "Oficina Nacional",
    vacancies: 1,
    status: "borrador",
    publicationStatus: "no_publicado",
    visibility: "externo",
    workMode: "hibrido",
    employmentType: "tiempo_completo",
    experienceLevel: "senior",
    shortDescription: "Monitoreo de operaciones, análisis de alertas y reportería de cumplimiento.",
    daysAgoOpened: 0,
    daysUntilClose: null,
  },
];

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function seedProcesses(): RecruitmentProcess[] {
  const now = new Date().toISOString();
  return SEEDS.map((s, i) => {
    const openedAt = isoDaysFromNow(-s.daysAgoOpened);
    const isPublished = s.publicationStatus === "publicado";
    return {
      id: uid("proc"),
      externalReference: `REQ-${1000 + i}`,
      code: s.code || slugCode(s.title),
      title: s.title,
      slug: slugify(s.title),
      description: `${s.shortDescription} Este proceso forma parte del plan anual de reclutamiento y selección del Banco de Desarrollo Productivo.`,
      shortDescription: s.shortDescription,
      mission:
        "Contribuir al desarrollo productivo del país brindando servicios financieros responsables y de calidad.",
      area: s.area,
      department: s.department,
      businessUnit: "Banca de Desarrollo",
      region: s.city,
      city: s.city,
      branch: s.branch,
      location: `${s.branch} · ${s.city}`,
      workMode: s.workMode,
      employmentType: s.employmentType,
      experienceLevel: s.experienceLevel,
      vacancies: s.vacancies,
      recruiterIds: [],
      hiringManagerIds: [],
      ownerId: "",
      status: s.status,
      publicationStatus: s.publicationStatus,
      visibility: s.visibility,
      applicationFormId: null,
      assessmentIds: [],
      openingDate: openedAt,
      closingDate: s.daysUntilClose === null ? null : isoDaysFromNow(s.daysUntilClose),
      publishedAt: isPublished ? openedAt : null,
      closedAt: s.status === "cerrado" ? isoDaysFromNow(s.daysUntilClose ?? 0) : null,
      archivedAt: null,
      createdAt: openedAt,
      createdBy: "Sistema (demostración)",
      updatedAt: now,
      updatedBy: "Sistema (demostración)",
      schemaVersion: 1,
      sourceProvider: "mock" as const,
      synchronizationStatus: "local" as const,
      configuration: {
        headcount: s.vacancies,
        salaryMin: null,
        salaryMax: null,
        applicationEnabled: isPublished,
        internalNotes: "",
        requisitionRef: `REQ-${1000 + i}`,
      },
      publicContentBlocks: [
        { id: uid("blk"), type: "summary", title: "Resumen del cargo", body: s.shortDescription },
        {
          id: uid("blk"),
          type: "responsibilities",
          title: "Responsabilidades",
          items: [
            "Cumplir con los objetivos y metas del área.",
            "Aplicar las políticas y procedimientos institucionales.",
            "Brindar atención de calidad a clientes internos y externos.",
          ],
        },
        {
          id: uid("blk"),
          type: "requirements",
          title: "Requisitos",
          items: [
            "Formación acorde al cargo.",
            "Experiencia según el nivel solicitado.",
            "Disponibilidad inmediata.",
          ],
        },
      ],
      internalMetadata: { demo: true },
      auditTrail: [
        {
          id: uid("aud"),
          action: "created",
          actorId: "system",
          actorName: "Sistema (demostración)",
          timestamp: openedAt,
          summary: `Proceso creado: ${s.title}`,
        },
      ],
    } satisfies RecruitmentProcess;
  });
}
