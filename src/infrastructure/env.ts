import { z } from "zod";
import { SCRIPT_URL } from "../constants";

/**
 * Environment + feature-flag validation.
 *
 * Vite exposes build-time variables on `import.meta.env` (only `VITE_`-prefixed
 * ones reach the client bundle — the equivalent of Next's `NEXT_PUBLIC_`). We
 * validate them once with Zod and expose a typed, defaulted object so the rest
 * of the code never touches `import.meta.env` directly or ships an undefined.
 *
 * SECURITY: only non-secret, client-safe values live here. There is no
 * server-side secret in this SPA; the Apps Script URL is a public web-app
 * endpoint (the same one the existing app already ships). Any future privileged
 * key MUST be kept server-side and never referenced from a `VITE_` variable.
 */

const boolFromString = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v == null ? fallback : v === "true" || v === "1"));

const DataModeSchema = z.enum(["apps-script", "mock"]).catch("apps-script");

const rawEnv =
  typeof import.meta !== "undefined" && import.meta.env
    ? (import.meta.env as Record<string, string | undefined>)
    : {};

const EnvSchema = z.object({
  dataMode: DataModeSchema,
  enableMocks: boolFromString(false),
  enableSupabase: boolFromString(false),
  enableAssessmentImport: boolFromString(true),
  enableAdvancedSimulations: boolFromString(false),
  enableAssessmentAnalytics: boolFromString(true),
  appsScriptUrl: z.string().url().catch(SCRIPT_URL),
});

const parsed = EnvSchema.parse({
  dataMode: rawEnv.VITE_DATA_MODE,
  enableMocks: rawEnv.VITE_ENABLE_MOCKS,
  enableSupabase: rawEnv.VITE_ENABLE_SUPABASE,
  enableAssessmentImport: rawEnv.VITE_ENABLE_ASSESSMENT_IMPORT,
  enableAdvancedSimulations: rawEnv.VITE_ENABLE_ADVANCED_SIMULATIONS,
  enableAssessmentAnalytics: rawEnv.VITE_ENABLE_ASSESSMENT_ANALYTICS,
  appsScriptUrl: rawEnv.VITE_APPS_SCRIPT_URL ?? SCRIPT_URL,
});

const isDev = Boolean(rawEnv.DEV) || rawEnv.MODE === "development";

export const env = {
  ...parsed,
  isDev,
  /**
   * When mocks are enabled OR the data mode is explicitly "mock", the new
   * modules persist through the local mock provider instead of Apps Script.
   * This keeps the ATS fully usable offline / during development and lets the
   * two new modules ship before the Sheets backend is redeployed.
   */
  useMockProvider: parsed.dataMode === "mock" || parsed.enableMocks,
} as const;

export type Env = typeof env;
