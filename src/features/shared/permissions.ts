/**
 * Talent Acquisition permission guards.
 *
 * Frontend guards for the ProcessOS / AssessmentOS actions. These map the app's
 * existing profile roles to the recruiter/coordinator/manager/etc. capabilities
 * described in the brief. They improve UX (hiding actions a user can't perform)
 * but DO NOT replace backend authorization, which must independently enforce
 * every write.
 */

import { useProfiles, type Role } from "../../lib/profilesStore";

export interface TalentPermissions {
  view: boolean;
  create: boolean;
  edit: boolean;
  publish: boolean;
  close: boolean;
  archive: boolean;
  import: boolean;
  manageBankTemplates: boolean;
  viewAnalytics: boolean;
}

const READ_ONLY: TalentPermissions = {
  view: true,
  create: false,
  edit: false,
  publish: false,
  close: false,
  archive: false,
  import: false,
  manageBankTemplates: false,
  viewAnalytics: false,
};

/** Compute the capability set for an app role. */
export function permissionsForRole(role: Role | null): TalentPermissions {
  switch (role) {
    case "admin":
    case "supervisor":
      return {
        view: true,
        create: true,
        edit: true,
        publish: true,
        close: true,
        archive: true,
        import: true,
        manageBankTemplates: true,
        viewAnalytics: true,
      };
    case "auxiliar":
      return {
        view: true,
        create: true,
        edit: true,
        publish: false,
        close: true,
        archive: false,
        import: true,
        manageBankTemplates: true,
        viewAnalytics: true,
      };
    case "analista":
      return {
        view: true,
        create: true,
        edit: true,
        publish: false,
        close: false,
        archive: false,
        import: true,
        manageBankTemplates: false,
        viewAnalytics: true,
      };
    case "pasante":
      return { ...READ_ONLY, viewAnalytics: true };
    default:
      return READ_ONLY;
  }
}

/** Hook: the current user's talent-acquisition permissions + display name. */
export function useTalentPermissions(): { permissions: TalentPermissions; userName: string } {
  const { current } = useProfiles();
  return {
    permissions: permissionsForRole(current?.role ?? null),
    userName: current?.nombre ?? "Sistema",
  };
}
