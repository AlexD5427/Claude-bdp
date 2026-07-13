/**
 * Assessment lifecycle + publication catalogs.
 *
 * Lifecycle tracks authoring/approval; publication tracks candidate-facing
 * availability. Published assessments are never destructively overwritten —
 * see the versioning module for the rules that enforce this.
 */

import type { Intent } from "../../../design-system/tokens";

export const ASSESSMENT_LIFECYCLE = [
  "draft",
  "in_review",
  "approved",
  "scheduled",
  "published",
  "paused",
  "closed",
  "archived",
] as const;

export type AssessmentLifecycle = (typeof ASSESSMENT_LIFECYCLE)[number];

export const ASSESSMENT_LIFECYCLE_META: Record<
  AssessmentLifecycle,
  { label: string; intent: Intent }
> = {
  draft: { label: "Borrador", intent: "neutral" },
  in_review: { label: "En revisión", intent: "warning" },
  approved: { label: "Aprobado", intent: "info" },
  scheduled: { label: "Programado", intent: "accent" },
  published: { label: "Publicado", intent: "success" },
  paused: { label: "Pausado", intent: "warning" },
  closed: { label: "Cerrado", intent: "neutral" },
  archived: { label: "Archivado", intent: "neutral" },
};

export const ASSESSMENT_PUBLICATION = [
  "unpublished",
  "scheduled",
  "published",
  "paused",
  "closed",
  "archived",
] as const;
export type AssessmentPublication = (typeof ASSESSMENT_PUBLICATION)[number];

export const ASSESSMENT_PUBLICATION_META: Record<
  AssessmentPublication,
  { label: string; intent: Intent }
> = {
  unpublished: { label: "No publicado", intent: "neutral" },
  scheduled: { label: "Programado", intent: "accent" },
  published: { label: "Publicado", intent: "success" },
  paused: { label: "Pausado", intent: "warning" },
  closed: { label: "Cerrado", intent: "neutral" },
  archived: { label: "Archivado", intent: "neutral" },
};
