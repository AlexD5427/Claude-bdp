import { ROLE_LEVEL, useProfiles, type Perfil } from "../lib/profilesStore";
import type { Actor } from "./processes/repository";

/**
 * Capability guards for ProcessOS and AssessmentOS.
 *
 * The ATS already ships a role/permission system (admin, supervisor, auxiliar,
 * analista, pasante). Rather than inventing a parallel one, we derive the new
 * modules' capabilities from those role levels. These are UI guards only —
 * real authorisation must be enforced by the backend (documented in SECURITY).
 */

export interface ModuleCapabilities {
  viewProcesses: boolean;
  createProcesses: boolean;
  editProcesses: boolean;
  publishProcesses: boolean;
  closeProcesses: boolean;
  archiveProcesses: boolean;
  deleteProcesses: boolean;
  viewAssessments: boolean;
  createAssessments: boolean;
  editAssessments: boolean;
  publishAssessments: boolean;
  manageTemplates: boolean;
  manageQuestionBank: boolean;
  importAssessments: boolean;
  viewAnalytics: boolean;
}

function capabilitiesForLevel(level: number): ModuleCapabilities {
  const analistaPlus = level >= 50; // analista and up
  const supervisorPlus = level >= 80; // supervisor / admin
  return {
    viewProcesses: true,
    createProcesses: analistaPlus,
    editProcesses: analistaPlus,
    publishProcesses: supervisorPlus,
    closeProcesses: supervisorPlus,
    archiveProcesses: supervisorPlus,
    deleteProcesses: level >= 100, // admin only
    viewAssessments: true,
    createAssessments: analistaPlus,
    editAssessments: analistaPlus,
    publishAssessments: supervisorPlus,
    manageTemplates: analistaPlus,
    manageQuestionBank: analistaPlus,
    importAssessments: analistaPlus,
    viewAnalytics: true,
  };
}

/** Read-only capabilities for the current profile (defaults to read-only). */
export function useCapabilities(): ModuleCapabilities {
  const { current } = useProfiles();
  const level = current ? ROLE_LEVEL[current.role] : 0;
  return capabilitiesForLevel(level);
}

/** Build an audit `Actor` from a profile. */
export function actorFromProfile(profile: Perfil | null): Actor {
  return profile ? { id: profile.id, name: profile.nombre } : { id: "anon", name: "Invitado" };
}

/** Convenience hook returning the current actor. */
export function useActor(): Actor {
  const { current } = useProfiles();
  return actorFromProfile(current);
}
