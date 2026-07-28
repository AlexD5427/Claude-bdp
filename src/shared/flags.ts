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

/** Is this an absolute `http(s)://…` URL? */
function isAbsoluteHttpUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

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
 *
 * A value that is NOT an absolute URL is rejected instead of used. The mistake
 * is easy to make and was made in production: the deployment had
 * `VITE_EVALUATIONS_API_URL=/api/evaluations/admin`, i.e. the admin proxy path
 * pasted into the public endpoint variable. Falling back to `SCRIPT_URL` in that
 * case would silently query the OTHER spreadsheet's backend — the one that knows
 * nothing about assessments — and the module would report a generic server
 * error. Rejecting it lets the transport say exactly which variable is wrong.
 */
export const ASSESSMENTS_API_URL_OVERRIDE: string | null = (() => {
  const raw = env("VITE_EVALUATIONS_API_URL")?.trim();
  if (!raw) return null;
  return isAbsoluteHttpUrl(raw) ? raw : null;
})();

/**
 * Name of the misconfigured public-endpoint variable, or `null` when the
 * configuration is coherent. The transport turns this into a precise, actionable
 * message instead of «el servidor no está disponible».
 */
export const ASSESSMENTS_API_URL_MISCONFIGURED: string | null = (() => {
  const raw = env("VITE_EVALUATIONS_API_URL")?.trim();
  return raw && !isAbsoluteHttpUrl(raw) ? "VITE_EVALUATIONS_API_URL" : null;
})();

/** Default endpoint of the intermediate backend that signs admin operations. */
export const DEFAULT_ADMIN_PROXY_URL = "/api/evaluations/admin";

/**
 * Endpoint for ADMIN operations.
 *
 * Admin operations cannot be authorized from the browser: the credential must be
 * signed with a server secret, and no secret may ever live in this bundle. They
 * therefore go through the intermediate backend (`api/evaluations/admin.ts`),
 * which holds the secret and signs each call.
 *
 *   unset            → the default `/api/evaluations/admin` when the Apps Script
 *                      provider is active (the real ATS architecture).
 *   a URL            → that endpoint (useful when the functions live elsewhere).
 *   "direct"         → no proxy: calls go straight to Apps Script. Only valid
 *                      for deployments whose backend runs in `google_identity`
 *                      mode, where Google itself authenticates the recruiter.
 *
 * `null` means "call Apps Script directly".
 */
export const ASSESSMENTS_ADMIN_API_URL: string | null = (() => {
  const raw = env("VITE_EVALUATIONS_ADMIN_API_URL")?.trim();
  if (raw === "direct") return null;
  // An Apps Script URL here is the mirror image of the mistake described above:
  // admin operations sent straight to the Web App carry no signature and are
  // rejected. The explicit way to bypass the proxy is the literal "direct", so
  // this value is ignored in favour of the proxy rather than obeyed.
  if (raw && !/^https:\/\/script\.google(usercontent)?\.com\//.test(raw)) return raw;
  const provider = providerName(env("VITE_ASSESSMENTS_PROVIDER"), dataProvider);
  return provider === "google-apps-script" ? DEFAULT_ADMIN_PROXY_URL : null;
})();

/**
 * Endpoint of the admin session gate. Derived from the admin endpoint so a
 * single environment variable configures both.
 */
export const ASSESSMENTS_ADMIN_SESSION_URL: string | null = ASSESSMENTS_ADMIN_API_URL
  ? ASSESSMENTS_ADMIN_API_URL.replace(/\/admin$/, "/session")
  : null;
