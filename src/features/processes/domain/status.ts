/**
 * Process lifecycle catalogs.
 *
 * The internal `ProcessStatus` (where the process sits operationally) is kept
 * deliberately separate from the `PublicationStatus` (whether/where the opening
 * is visible to candidates). Each value carries an es-MX label and a semantic
 * intent for the design system — never color alone.
 */

import type { Intent } from "../../../design-system/tokens";

export const PROCESS_STATUSES = [
  "draft",
  "configuring",
  "pending_approval",
  "approved",
  "scheduled",
  "published",
  "receiving",
  "paused",
  "closed",
  "finished",
  "archived",
  "cancelled",
] as const;

export type ProcessStatus = (typeof PROCESS_STATUSES)[number];

export const PROCESS_STATUS_META: Record<
  ProcessStatus,
  { label: string; intent: Intent }
> = {
  draft: { label: "Borrador", intent: "neutral" },
  configuring: { label: "En configuración", intent: "info" },
  pending_approval: { label: "Pendiente de aprobación", intent: "warning" },
  approved: { label: "Aprobado", intent: "info" },
  scheduled: { label: "Programado", intent: "accent" },
  published: { label: "Publicado", intent: "success" },
  receiving: { label: "Recepción activa", intent: "success" },
  paused: { label: "Pausado", intent: "warning" },
  closed: { label: "Cerrado", intent: "neutral" },
  finished: { label: "Finalizado", intent: "neutral" },
  archived: { label: "Archivado", intent: "neutral" },
  cancelled: { label: "Cancelado", intent: "danger" },
};

export const PUBLICATION_STATUSES = [
  "unpublished",
  "scheduled",
  "published",
  "paused",
  "closed",
  "archived",
] as const;

export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const PUBLICATION_STATUS_META: Record<
  PublicationStatus,
  { label: string; intent: Intent }
> = {
  unpublished: { label: "No publicado", intent: "neutral" },
  scheduled: { label: "Programado", intent: "accent" },
  published: { label: "Publicado", intent: "success" },
  paused: { label: "Pausado", intent: "warning" },
  closed: { label: "Cerrado", intent: "neutral" },
  archived: { label: "Archivado", intent: "neutral" },
};

/** States considered "active" for the default list filter. */
export const ACTIVE_PROCESS_STATUSES: ProcessStatus[] = [
  "draft",
  "configuring",
  "pending_approval",
  "approved",
  "scheduled",
  "published",
  "receiving",
  "paused",
];
