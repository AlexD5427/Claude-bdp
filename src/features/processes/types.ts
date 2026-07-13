/**
 * ProcessOS domain model.
 *
 * `RecruitmentProcess` represents an entire recruitment operation (not a single
 * vacancy): its job information, publication, application form, linked
 * assessments, responsible team, dates and audit trail. The model is
 * provider-neutral — nothing here knows about Google Sheets row shapes. Data
 * providers map to/from this model through `mappers.ts`.
 */

export type ProcessStatus =
  | "borrador"
  | "en_configuracion"
  | "pendiente_aprobacion"
  | "aprobado"
  | "programado"
  | "publicado"
  | "recepcion_activa"
  | "pausado"
  | "cerrado"
  | "finalizado"
  | "archivado"
  | "cancelado";

export type PublicationStatus =
  | "no_publicado"
  | "programado"
  | "publicado"
  | "pausado"
  | "cerrado"
  | "archivado";

export type Visibility = "interno" | "externo" | "ambos";
export type WorkMode = "presencial" | "hibrido" | "remoto";
export type EmploymentType =
  | "tiempo_completo"
  | "medio_tiempo"
  | "temporal"
  | "pasantia"
  | "consultoria";
export type ExperienceLevel =
  | "sin_experiencia"
  | "junior"
  | "semi_senior"
  | "senior"
  | "jefatura"
  | "gerencia";

export type SynchronizationStatus = "synced" | "pending" | "error" | "local";

/** A validated public content block rendered by the future Candidate Portal. */
export interface PublicContentBlock {
  id: string;
  type:
    | "hero"
    | "summary"
    | "responsibilities"
    | "requirements"
    | "benefits"
    | "location"
    | "faq"
    | "instructions"
    | "privacy"
    | "assessment_info"
    | "contact";
  /** Optional heading. */
  title?: string;
  /** Restricted, sanitised text (no HTML/scripts). */
  body?: string;
  /** For list-style blocks (responsibilities, requirements, benefits). */
  items?: string[];
  /** For FAQ blocks. */
  faq?: { question: string; answer: string }[];
}

/** Non-public operational configuration. */
export interface ProcessConfiguration {
  /** Total openings; may differ from displayed vacancies. */
  headcount: number;
  /** Salary range in BOB (optional, internal). */
  salaryMin?: number | null;
  salaryMax?: number | null;
  /** Whether the public application form is enabled. */
  applicationEnabled: boolean;
  /** Free-form internal notes (never published). */
  internalNotes?: string;
  /** Requisition / requirement reference. */
  requisitionRef?: string;
}

/** Audit event recorded against a process (foundations for full auditing). */
export interface ProcessAuditEntry {
  id: string;
  action:
    | "created"
    | "edited"
    | "published"
    | "paused"
    | "closed"
    | "archived"
    | "duplicated"
    | "assessment_linked"
    | "assessment_unlinked";
  actorId: string;
  actorName?: string;
  timestamp: string;
  summary: string;
  requestId?: string;
}

export interface RecruitmentProcess {
  id: string;
  externalReference: string;
  code: string;
  title: string;
  slug: string;
  description: string;
  shortDescription: string;
  mission: string;

  area: string;
  department: string;
  businessUnit: string;
  region: string;
  city: string;
  branch: string;
  location: string;

  workMode: WorkMode;
  employmentType: EmploymentType;
  experienceLevel: ExperienceLevel;
  vacancies: number;

  recruiterIds: string[];
  hiringManagerIds: string[];
  ownerId: string;

  status: ProcessStatus;
  publicationStatus: PublicationStatus;
  visibility: Visibility;

  applicationFormId: string | null;
  assessmentIds: string[];

  openingDate: string | null;
  closingDate: string | null;
  publishedAt: string | null;
  closedAt: string | null;
  archivedAt: string | null;

  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;

  schemaVersion: number;
  sourceProvider: "apps-script" | "mock" | "supabase";
  synchronizationStatus: SynchronizationStatus;

  configuration: ProcessConfiguration;
  publicContentBlocks: PublicContentBlock[];
  /** Internal metadata — never exposed to the Candidate Portal. */
  internalMetadata: Record<string, unknown>;

  auditTrail: ProcessAuditEntry[];
}

/**
 * A lightweight list-summary projection. The list/table/kanban views load these
 * (cheap) rows; the full `RecruitmentProcess` is only fetched when a process is
 * opened. This keeps large lists fast (see the performance requirements).
 */
export interface ProcessSummary {
  id: string;
  code: string;
  title: string;
  area: string;
  location: string;
  vacancies: number;
  applications: number;
  assessmentCount: number;
  ownerId: string;
  status: ProcessStatus;
  publicationStatus: PublicationStatus;
  visibility: Visibility;
  openingDate: string | null;
  closingDate: string | null;
  updatedAt: string;
  synchronizationStatus: SynchronizationStatus;
}

/** Fields the editor can create/update (everything else is derived/managed). */
export type ProcessDraftInput = Pick<
  RecruitmentProcess,
  | "title"
  | "code"
  | "description"
  | "shortDescription"
  | "mission"
  | "area"
  | "department"
  | "businessUnit"
  | "region"
  | "city"
  | "branch"
  | "location"
  | "workMode"
  | "employmentType"
  | "experienceLevel"
  | "vacancies"
  | "recruiterIds"
  | "hiringManagerIds"
  | "ownerId"
  | "visibility"
  | "assessmentIds"
  | "openingDate"
  | "closingDate"
  | "configuration"
  | "publicContentBlocks"
>;
