import { useSyncExternalStore } from "react";

/**
 * Global "edit candidate" signal.
 *
 * Editing a postulante must be reachable from every place a candidate is shown
 * (the applicant grid, the comparator, processes, the full profile…). Like
 * {@link ./profileViewerStore}, the edit modal is mounted once at the app root
 * and any surface opens it by calling {@link openEdit} with the candidate id.
 * The modal reuses the intake form (see {@link ../modules/RegistrationForm})
 * pre-filled with the candidate's data, highlighting the fields that change.
 */

let editingId: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/**
 * Open the edit modal for a candidate id (its stable `Candidate.id`).
 *
 * No hay atajo para «ya está abierto en ese id»: si el modal no llegó a abrirse
 * (por ejemplo porque la base aún no tenía esa fila), quedarse callado dejaba el
 * botón «Editar» muerto para siempre en ese registro. Volver a emitir es barato
 * y hace que el segundo clic siempre haga algo.
 */
export function openEdit(id: string): void {
  editingId = id;
  emit();
}

/** Close the edit modal. */
export function closeEdit(): void {
  if (editingId === null) return;
  editingId = null;
  emit();
}

export function getEditingId(): string | null {
  return editingId;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** React binding — the candidate id being edited (or null). */
export function useCandidateEdit(): string | null {
  return useSyncExternalStore(subscribe, getEditingId, getEditingId);
}
