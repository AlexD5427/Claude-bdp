/**
 * Bitácora local de acciones de negocio.
 *
 * Es un registro append-only en `localStorage` de las acciones relevantes
 * (crear, editar, publicar, pausar, cerrar, archivar, duplicar, importar,
 * versionar, vincular). No sustituye a la auditoría del servidor: sirve para que
 * la interfaz pueda mostrar «quién hizo qué» sin una ida y vuelta a la red, y
 * para que el historial siga existiendo cuando el backend no está configurado.
 *
 * Vivía dentro del módulo de Evaluaciones, que lo compartía con Procesos. Al
 * reconstruir Evaluaciones desde cero se movió aquí, a `features/shared`, para
 * que ningún módulo dependa de las tripas de otro.
 *
 * Nunca se escriben datos sensibles: ni claves de respuesta, ni respuestas de
 * candidatos, ni datos personales.
 */

import { useMemo } from "react";
import { createStore } from "../../shared/store";
import { newId } from "../../shared/ids";
import { sanitizeText } from "../../shared/sanitize";

export const AUDIT_ACTIONS = [
  "create",
  "edit",
  "publish",
  "pause",
  "close",
  "archive",
  "restore",
  "duplicate",
  "import",
  "version",
  "link",
  "unlink",
  "rollback",
  "delete",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditEntityType = "process" | "assessment";

export interface AuditEntry {
  id: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  /** ISO-8601. */
  at: string;
  by: string;
  summary: string;
  /** Metadatos no sensibles (conteos, etiquetas, identificadores). */
  meta: Record<string, unknown>;
}

const KEY = "bdp-audit-log";
const MAX_ENTRIES = 500;

const store = createStore<AuditEntry[]>([], { persistKey: KEY });

export function logAudit(
  entityType: AuditEntityType,
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

/**
 * Entradas de una entidad, de la más reciente a la más antigua.
 *
 * El filtrado ocurre **fuera** del selector del store a propósito.
 * `useSyncExternalStore` compara la instantánea con `Object.is`, y un selector
 * que devuelve `all.filter(...)` produce un arreglo nuevo en cada lectura: React
 * lo interpreta como un cambio, vuelve a dibujar, vuelve a leer, y avisa de que
 * «el resultado de getSnapshot debería memorizarse para evitar un bucle
 * infinito». Suscribirse al arreglo completo (estable) y derivar con `useMemo`
 * mantiene la identidad entre dibujados.
 */
export function useAuditTrail(entityId: string): AuditEntry[] {
  const all = store.use();
  return useMemo(() => all.filter((e) => e.entityId === entityId), [all, entityId]);
}

export function getAuditTrail(entityId: string): AuditEntry[] {
  return store.get().filter((e) => e.entityId === entityId);
}
