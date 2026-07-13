/**
 * Audit log.
 *
 * A local, append-only record of significant actions (create, edit, publish,
 * pause, close, archive, duplicate, import, version, link). It is the frontend
 * foundation for auditing; a backend can later persist these events durably.
 * Answer keys and other sensitive payloads are never written here.
 */

import { createStore } from "../../../shared/store";
import { newId } from "../../../shared/ids";
import { sanitizeText } from "../../../shared/sanitize";
import type { AuditAction, AuditEntry } from "../domain/entities";

const KEY = "bdp-audit-log";
const MAX_ENTRIES = 500;

const store = createStore<AuditEntry[]>([], { persistKey: KEY });

export function logAudit(
  entityType: AuditEntry["entityType"],
  entityId: string,
  action: AuditAction,
  by: string,
  summary: string,
  meta: Record<string, unknown> = {},
): void {
  const entry: AuditEntry = {
    id: newId("aud"),
    entityType,
    entityId,
    action,
    at: new Date().toISOString(),
    by,
    summary: sanitizeText(summary, 2000),
    meta,
  };
  store.set((prev) => {
    const next = [entry, ...prev];
    return next.length > MAX_ENTRIES ? next.slice(0, MAX_ENTRIES) : next;
  });
}

/** All audit entries for a given entity, newest first. */
export function useAuditTrail(entityId: string): AuditEntry[] {
  return store.use((all) => all.filter((e) => e.entityId === entityId));
}

export function getAuditTrail(entityId: string): AuditEntry[] {
  return store.get().filter((e) => e.entityId === entityId);
}
