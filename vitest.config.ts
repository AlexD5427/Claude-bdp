import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Vitest configuration.
 *
 * `jsdom` gives the component tests a DOM; `setupFiles` wires jest-dom matchers.
 * The environment is opt-in per-file via the default `jsdom` here, which is fine
 * for both pure-logic and component tests.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
