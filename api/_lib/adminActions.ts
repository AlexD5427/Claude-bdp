/**
 * Acciones que el backend intermedio acepta firmar.
 *
 * Es la misma lista que `EVAL_ADMIN_ACTIONS` en
 * `apps-script/evaluations/Auth.gs`, replicada aquí a propósito: el proxy es una
 * segunda puerta y debe poder rechazar por sí mismo cualquier acción que no
 * reconozca, sin depender de que el servidor la clasifique bien.
 *
 * Las acciones PÚBLICAS no están aquí y no deben pasar por el proxy: el navegador
 * las llama directamente contra Apps Script, sin credencial.
 */

export const ADMIN_ACTIONS = [
  "listAdminAssessments",
  "getAdminAssessment",
  "createAssessment",
  "updateAssessment",
  "duplicateAssessment",
  "publishAssessment",
  "archiveAssessment",
  "unarchiveAssessment",
  "pauseAssessment",
  "closeAssessment",
  "resumeAssessment",
  "rollbackAssessment",
  "listAssessmentResults",
  "getAttemptDetail",
  "verifySchema",
  "setupSchema",
] as const;

export type AdminAction = (typeof ADMIN_ACTIONS)[number];

/** ¿El proxy puede firmar esta acción? */
export function isAdminAction(action: unknown): action is AdminAction {
  return typeof action === "string" && (ADMIN_ACTIONS as readonly string[]).includes(action);
}

/** Acciones que exigen `requestId` porque escriben. */
const WRITE_ACTIONS = new Set<string>([
  "createAssessment",
  "updateAssessment",
  "duplicateAssessment",
  "publishAssessment",
  "archiveAssessment",
  "unarchiveAssessment",
  "pauseAssessment",
  "closeAssessment",
  "resumeAssessment",
  "rollbackAssessment",
  "setupSchema",
]);

export function isWriteAction(action: string): boolean {
  return WRITE_ACTIONS.has(action);
}
