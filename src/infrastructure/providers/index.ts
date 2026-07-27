/**
 * Provider selection.
 *
 * The active `DataProvider` is chosen by the `dataProvider` feature flag. The
 * rest of the app depends only on `getProvider()` — swapping backends is a flag
 * change, not a code change.
 */

import { FLAGS, type ProviderName } from "../../shared/flags";
import type { AssessmentRepository, DataProvider } from "../repositories/contracts";
import { mockProvider } from "./mock";
import { appsScriptProvider } from "./google-apps-script";
import { supabaseProvider } from "./supabase";

let override: DataProvider | null = null;
let assessmentOverride: AssessmentRepository | null = null;

function byName(name: ProviderName): DataProvider {
  switch (name) {
    case "google-apps-script":
      return appsScriptProvider;
    case "supabase":
      return supabaseProvider;
    case "mock":
    default:
      return mockProvider;
  }
}

export function getProvider(): DataProvider {
  if (override) return override;
  return byName(FLAGS.dataProvider);
}

/**
 * The assessment repository.
 *
 * Evaluaciones can point at a different backend than the rest of the app
 * (`VITE_ASSESSMENTS_PROVIDER`) so the new Apps Script backend can be rolled out
 * in stages. When a test forces a whole provider, that wins.
 */
export function getAssessmentRepository(): AssessmentRepository {
  if (assessmentOverride) return assessmentOverride;
  if (override) return override.assessments;
  return byName(FLAGS.assessmentsProvider).assessments;
}

/** Human-readable label of the active assessment data source. */
export function getAssessmentProviderName(): ProviderName {
  if (assessmentOverride) return "mock";
  if (override) return override.name;
  return FLAGS.assessmentsProvider;
}

/** Test hook: force a provider regardless of the flag. */
export function __setProviderForTests(p: DataProvider | null): void {
  override = p;
}

/** Test hook: force only the assessment repository. */
export function __setAssessmentRepositoryForTests(repo: AssessmentRepository | null): void {
  assessmentOverride = repo;
}

export { mockProvider, appsScriptProvider, supabaseProvider };
