/**
 * Feature flags.
 *
 * Advanced/incomplete capabilities are gated here so they can ship as typed
 * contracts without being presented as production-ready. Flags read from Vite
 * env vars (`VITE_FLAG_*`) with safe defaults, so nothing experimental is
 * enabled unless explicitly turned on at build time.
 */

function envFlag(key: string, fallback: boolean): boolean {
  const raw = (import.meta.env as Record<string, string | undefined>)[key];
  if (raw == null) return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

export const FLAGS = {
  /**
   * Data source. Defaults to the mock provider so the app is fully functional
   * offline; set VITE_DATA_PROVIDER=google-apps-script to hit the live backend.
   */
  dataProvider: ((import.meta.env as Record<string, string | undefined>).VITE_DATA_PROVIDER ??
    "mock") as "mock" | "google-apps-script" | "supabase",

  // Advanced question types — contracts exist, editors/renderers are not
  // production-ready. Kept OFF by default.
  advancedSimulations: envFlag("VITE_FLAG_ADVANCED_SIMULATIONS", false),
  codeQuestions: envFlag("VITE_FLAG_CODE_QUESTIONS", false),
  spreadsheetSimulation: envFlag("VITE_FLAG_SPREADSHEET_SIM", false),
  interactiveVideo: envFlag("VITE_FLAG_INTERACTIVE_VIDEO", false),

  // Future backends (not implemented without an approved schema + credentials).
  supabase: envFlag("VITE_FLAG_SUPABASE", false),
  candidatePortal: envFlag("VITE_FLAG_CANDIDATE_PORTAL", false),
} as const;

export type FeatureFlags = typeof FLAGS;
