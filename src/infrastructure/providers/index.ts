/**
 * Provider selection.
 *
 * The active `DataProvider` is chosen by the `dataProvider` feature flag. The
 * rest of the app depends only on `getProvider()` — swapping backends is a flag
 * change, not a code change.
 */

import { FLAGS } from "../../shared/flags";
import type { DataProvider } from "../repositories/contracts";
import { mockProvider } from "./mock";
import { appsScriptProvider } from "./google-apps-script";
import { supabaseProvider } from "./supabase";

let override: DataProvider | null = null;

export function getProvider(): DataProvider {
  if (override) return override;
  switch (FLAGS.dataProvider) {
    case "google-apps-script":
      return appsScriptProvider;
    case "supabase":
      return supabaseProvider;
    case "mock":
    default:
      return mockProvider;
  }
}

/** Test hook: force a provider regardless of the flag. */
export function __setProviderForTests(p: DataProvider | null): void {
  override = p;
}

export { mockProvider, appsScriptProvider, supabaseProvider };
