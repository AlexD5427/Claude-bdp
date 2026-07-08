import { useSyncExternalStore } from "react";

/**
 * Global "candidate profile viewer" signal.
 *
 * The full-profile panel (see {@link ../components/profile/CandidateProfileViewer})
 * is mounted once at the app root, but it can be opened from *anywhere* a person
 * with an identificador appears — a comparator column, a process list, a
 * dossier card, the applicant grid… Rather than thread a callback through every
 * module, each surface just calls {@link openProfile} with the candidate id and
 * this tiny in-memory store flips the panel open.
 *
 * It is deliberately not persisted: reopening the app should start clean.
 */

let openId: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Open the full-profile panel for a candidate id (its stable `Candidate.id`). */
export function openProfile(id: string): void {
  if (openId === id) return;
  openId = id;
  emit();
}

/** Close the full-profile panel. */
export function closeProfile(): void {
  if (openId === null) return;
  openId = null;
  emit();
}

export function getOpenProfileId(): string | null {
  return openId;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** React binding — the open candidate id (or null). */
export function useProfileViewer(): string | null {
  return useSyncExternalStore(subscribe, getOpenProfileId, getOpenProfileId);
}
