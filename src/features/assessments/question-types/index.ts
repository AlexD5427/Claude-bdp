/**
 * Registry bootstrap.
 *
 * Registers the stable MVP content + answer plugins unconditionally, and the
 * advanced simulation contracts only when their feature flags are enabled.
 * Import this module once (side effect) before the builder/renderer runs.
 */

import { registerPlugins, registerPlugin } from "./registry";
import { contentPlugins } from "./contentPlugins";
import { answerPlugins } from "./answerPlugins";
import { advancedContracts } from "./advancedContracts";

let bootstrapped = false;

export function bootstrapPlugins(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  registerPlugins(contentPlugins);
  registerPlugins(answerPlugins);
  for (const { plugin, enabled } of advancedContracts) {
    if (enabled) registerPlugin(plugin);
  }
}

export * from "./registry";
export { bootstrapPlugins as default };
