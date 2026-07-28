/**
 * Acciones administrativas, desde el punto de vista del cliente.
 *
 * El transporte necesita saber si una acción es administrativa para decidir a
 * QUÉ endpoint la envía: las administrativas van al backend intermedio (que las
 * firma con un secreto que el navegador no conoce) y las públicas van
 * directamente al Web App de Apps Script.
 *
 * La lista se declara aquí y NO se importa de `api/_lib/`: nada del backend
 * intermedio debe poder entrar en el bundle del navegador, ni siquiera una
 * constante inocua, para que la frontera siga siendo evidente y verificable.
 * Una prueba comprueba que las tres listas (cliente, proxy y `Auth.gs`)
 * coinciden.
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

/** ¿Esta acción exige autorización administrativa? */
export function isAdminAction(action: string): action is AdminAction {
  return (ADMIN_ACTIONS as readonly string[]).includes(action);
}
