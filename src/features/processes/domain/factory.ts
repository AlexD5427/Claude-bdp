/**
 * Factory helpers that build valid domain entities with sensible defaults.
 * Centralizing construction keeps ids, timestamps, codes, and slugs consistent
 * and guarantees every new entity passes schema validation.
 */

import { humanCode, newId, slugify } from "../../../shared/ids";
import {
  processConfigurationSchema,
  recruitmentProcessSchema,
  type RecruitmentProcess,
} from "./models";

interface CreateProcessInput {
  title: string;
  createdBy?: string;
  ownerId?: string;
  area?: string;
}

/** Build a fresh draft process. */
export function createProcess(input: CreateProcessInput): RecruitmentProcess {
  const now = new Date().toISOString();
  const title = input.title.trim() || "Proceso sin título";
  const draft = {
    id: newId("prc"),
    externalReference: "",
    code: humanCode(title, "PRC"),
    title,
    slug: slugify(title),
    description: "",
    area: input.area ?? "",
    department: "",
    businessUnit: "",
    location: "",
    workMode: "onsite" as const,
    employmentType: "full_time" as const,
    experienceLevel: "mid" as const,
    vacancies: 1,
    recruiterIds: [],
    hiringManagerIds: [],
    ownerId: input.ownerId ?? input.createdBy ?? "",
    processStatus: "draft" as const,
    publicationStatus: "unpublished" as const,
    visibility: "internal" as const,
    applicationFormId: null,
    assessmentIds: [],
    openingDate: null,
    closingDate: null,
    publicContentBlocks: [],
    configuration: processConfigurationSchema.parse({}),
    schemaVersion: 1,
    entityVersion: 1,
    createdAt: now,
    createdBy: input.createdBy ?? "",
    updatedAt: now,
    updatedBy: input.createdBy ?? "",
    sourceProvider: "mock" as const,
    synchronizationStatus: "local" as const,
  };
  return recruitmentProcessSchema.parse(draft);
}

/** Clone a process into a new draft (used by "Duplicar proceso"). */
export function duplicateProcess(
  source: RecruitmentProcess,
  by: string,
): RecruitmentProcess {
  const now = new Date().toISOString();
  const title = `${source.title} (copia)`;
  return recruitmentProcessSchema.parse({
    ...source,
    id: newId("prc"),
    code: humanCode(title, "PRC"),
    title,
    slug: slugify(title),
    processStatus: "draft",
    publicationStatus: "unpublished",
    entityVersion: 1,
    createdAt: now,
    createdBy: by,
    updatedAt: now,
    updatedBy: by,
    synchronizationStatus: "local",
  });
}
