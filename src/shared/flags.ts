/**
 * Feature flags.
 *
 * Advanced/incomplete capabilities are gated here so they can ship as typed
 * contracts without being presented as production-ready. Flags read from Vite
 * env vars (`VITE_FLAG_*`) with safe defaults, so nothing experimental is
 * enabled unless explicitly turned on at build time.
 */

function env(key: string): string | undefined {
  return (import.meta.env as Record<string, string | undefined>)[key];
}

function envFlag(key: string, fallback: boolean): boolean {
  const raw = env(key);
  if (raw == null) return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

export type ProviderName = "mock" | "google-apps-script" | "supabase";

function providerName(raw: string | undefined, fallback: ProviderName): ProviderName {
  return raw === "mock" || raw === "google-apps-script" || raw === "supabase" ? raw : fallback;
}

const dataProvider = providerName(env("VITE_DATA_PROVIDER"), "mock");

export const FLAGS = {
  /**
   * Data source. Defaults to the mock provider so the app is fully functional
   * offline; set VITE_DATA_PROVIDER=google-apps-script to hit the live backend.
   */
  dataProvider,

  /**
   * Data source for the Evaluaciones module only. Lets the assessment backend be
   * rolled out independently from ProcessOS (staged rollout). Inherits
   * `dataProvider` when unset. The module always displays which source is
   * active, so mock and real data can never mix silently.
   */
  assessmentsProvider: providerName(env("VITE_ASSESSMENTS_PROVIDER"), dataProvider),

  /**
   * Optional debounced autosave in the assessment builder. OFF by default: the
   * manual "Guardar borrador" button is always the primary action and autosave
   * never publishes.
   */
  assessmentsAutosave: envFlag("VITE_FLAG_ASSESSMENTS_AUTOSAVE", false),

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

/**
 * Public URL of the Evaluaciones Apps Script Web App, when it is configured.
 *
 * This is a PUBLIC endpoint URL, not a secret: server-side secrets live in the
 * Apps Script project's Script Properties and never reach the browser.
 *
 * `null` means "not configured"; the transport falls back to the shared
 * `SCRIPT_URL`. The fallback is resolved THERE and not here on purpose: this
 * module is imported by pure logic (providers, domain helpers) and importing
 * `../constants` would drag the dock's icon components into every one of those
 * consumers.
 */
export const ASSESSMENTS_API_URL_OVERRIDE: string | null =
  env("VITE_EVALUATIONS_API_URL") ?? null;
