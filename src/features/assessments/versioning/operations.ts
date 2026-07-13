/**
 * Version operations: publish, clone, minor revision, rollback.
 *
 * These pure functions take an `AssessmentDefinition` and return a new one,
 * enforcing the invariant that published versions are immutable and never
 * destructively overwritten. Historical attempts (held elsewhere) are untouched.
 */

import { newId } from "../../../shared/ids";
import {
  type AssessmentDefinition,
  type AssessmentVersion,
} from "../domain/assessment";
import { classifyContentChange } from "./classify";

/** Publish the current draft as an immutable version and start a new draft. */
export function publishDraft(
  def: AssessmentDefinition,
  by: string,
  notes = "",
): AssessmentDefinition {
  const now = new Date().toISOString();

  // Decide the version numbers for the published snapshot.
  const lastPublished = def.publishedVersions[def.publishedVersions.length - 1] ?? null;
  let major = 1;
  let minor = 0;
  if (lastPublished) {
    const report = classifyContentChange(lastPublished.content, def.draftVersion.content);
    if (report.classification === "structural") {
      major = lastPublished.major + 1;
      minor = 0;
    } else {
      major = lastPublished.major;
      minor = lastPublished.minor + 1;
    }
  }

  const published: AssessmentVersion = {
    ...def.draftVersion,
    id: newId("ver"),
    major,
    minor,
    state: "published",
    notes: notes || def.draftVersion.notes,
    // Deep-clone so the published snapshot is immutable: later draft edits must
    // never leak into historical versions (or the attempts pinned to them).
    content: structuredClone(def.draftVersion.content),
    publishedAt: now,
    publishedBy: by,
  };

  // The new working draft continues from the just-published content, also as an
  // independent copy so editing the draft can't mutate the published version.
  const nextDraft: AssessmentVersion = {
    ...def.draftVersion,
    id: newId("ver"),
    major,
    minor,
    state: "draft",
    notes: "",
    content: structuredClone(def.draftVersion.content),
    createdAt: now,
    createdBy: by,
    publishedAt: null,
    publishedBy: "",
  };

  return {
    ...def,
    lifecycle: "published",
    publication: "published",
    draftVersion: nextDraft,
    publishedVersions: [...def.publishedVersions, published],
    currentPublishedVersionId: published.id,
    entityVersion: def.entityVersion + 1,
    updatedAt: now,
    updatedBy: by,
    publishedAt: now,
  };
}

/** Clone any version's content into the working draft (non-destructive). */
export function cloneVersionIntoDraft(
  def: AssessmentDefinition,
  versionId: string,
  by: string,
): AssessmentDefinition {
  const source =
    def.publishedVersions.find((v) => v.id === versionId) ??
    (def.draftVersion.id === versionId ? def.draftVersion : null);
  if (!source) return def;
  const now = new Date().toISOString();
  return {
    ...def,
    draftVersion: {
      ...def.draftVersion,
      content: structuredClone(source.content),
      notes: `Clonado de v${source.major}.${source.minor}`,
    },
    updatedAt: now,
    updatedBy: by,
  };
}

/**
 * Roll back future assignments to a previously published version. This does not
 * delete newer versions; it only re-points `currentPublishedVersionId` so new
 * candidates receive the chosen version. In-flight attempts stay pinned.
 */
export function rollbackToVersion(
  def: AssessmentDefinition,
  versionId: string,
  by: string,
): AssessmentDefinition {
  const target = def.publishedVersions.find((v) => v.id === versionId);
  if (!target) return def;
  return {
    ...def,
    currentPublishedVersionId: versionId,
    updatedAt: new Date().toISOString(),
    updatedBy: by,
  };
}

/** The version currently served to new candidates, if any. */
export function currentServedVersion(def: AssessmentDefinition): AssessmentVersion | null {
  if (!def.currentPublishedVersionId) return null;
  return def.publishedVersions.find((v) => v.id === def.currentPublishedVersionId) ?? null;
}
