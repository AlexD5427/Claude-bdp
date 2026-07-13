/**
 * Assessment factory helpers.
 */

import { humanCode, newId, slugify } from "../../../shared/ids";
import type { AssessmentCategory } from "./categories";
import {
  assessmentContentSchema,
  assessmentDefinitionSchema,
  assessmentVersionSchema,
  type AssessmentContent,
  type AssessmentDefinition,
  type AssessmentVersion,
} from "./assessment";

function emptyContent(): AssessmentContent {
  return assessmentContentSchema.parse({});
}

/** Build a fresh draft version (major 1, minor 0). */
export function createDraftVersion(by: string, content?: AssessmentContent): AssessmentVersion {
  const now = new Date().toISOString();
  return assessmentVersionSchema.parse({
    id: newId("ver"),
    major: 1,
    minor: 0,
    state: "draft",
    notes: "",
    content: content ?? emptyContent(),
    createdAt: now,
    createdBy: by,
    publishedAt: null,
    publishedBy: "",
  });
}

interface CreateAssessmentInput {
  name: string;
  category?: AssessmentCategory;
  createdBy?: string;
  ownerId?: string;
  content?: AssessmentContent;
}

export function createAssessment(input: CreateAssessmentInput): AssessmentDefinition {
  const now = new Date().toISOString();
  const name = input.name.trim() || "Evaluación sin título";
  const by = input.createdBy ?? "";
  return assessmentDefinitionSchema.parse({
    id: newId("asm"),
    externalReference: "",
    code: humanCode(name, "EVL"),
    name,
    description: "",
    category: input.category ?? "knowledge",
    purpose: "",
    lifecycle: "draft",
    publication: "unpublished",
    linkedProcessIds: [],
    ownerId: input.ownerId ?? by,
    authorIds: by ? [by] : [],
    tags: [],
    estimatedDurationMinutes: 0,
    availabilityStart: null,
    availabilityEnd: null,
    draftVersion: createDraftVersion(by, input.content),
    publishedVersions: [],
    currentPublishedVersionId: null,
    schemaVersion: 1,
    entityVersion: 1,
    createdAt: now,
    createdBy: by,
    updatedAt: now,
    updatedBy: by,
    publishedAt: null,
    sourceProvider: "mock",
    synchronizationStatus: "local",
  });
}

/** slug helper re-exported for URL building in the builder route. */
export { slugify };

export function duplicateAssessment(
  source: AssessmentDefinition,
  by: string,
): AssessmentDefinition {
  const now = new Date().toISOString();
  const name = `${source.name} (copia)`;
  return assessmentDefinitionSchema.parse({
    ...source,
    id: newId("asm"),
    code: humanCode(name, "EVL"),
    name,
    lifecycle: "draft",
    publication: "unpublished",
    linkedProcessIds: [],
    // A copy starts fresh: the draft content is preserved, published history is not.
    draftVersion: {
      ...source.draftVersion,
      id: newId("ver"),
      major: 1,
      minor: 0,
      state: "draft",
      createdAt: now,
      createdBy: by,
      publishedAt: null,
      publishedBy: "",
    },
    publishedVersions: [],
    currentPublishedVersionId: null,
    entityVersion: 1,
    createdAt: now,
    createdBy: by,
    updatedAt: now,
    updatedBy: by,
    publishedAt: null,
    synchronizationStatus: "local",
  });
}
