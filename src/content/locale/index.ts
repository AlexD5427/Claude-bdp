/**
 * Locale registry.
 *
 * The app currently ships a single active locale (`es-MX`) but everything is
 * routed through this module so additional catalogs can be registered later
 * without touching call sites. There is intentionally no language selector yet.
 *
 * Usage:
 *   import { L, fmt } from "@/content/locale";
 *   <h2>{L.processes.moduleTitle}</h2>
 *   <p>{fmt("Se importaron {n} filas", { n: 12 })}</p>
 */

import { catalogEsMX, type CatalogEsMX } from "./es-MX/catalog";

export type LocaleCode = "es-MX";

export const ACTIVE_LOCALE: LocaleCode = "es-MX";

/** The active string catalog. */
export const L: CatalogEsMX = catalogEsMX;

/**
 * Interpolate `{token}` placeholders in a template with the provided values.
 * Missing tokens are left as-is so gaps are visible during development rather
 * than silently dropped.
 */
export function fmt(
  template: string,
  vars: Record<string, string | number> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

export * from "./es-MX/format";
