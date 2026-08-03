/**
 * Banderas de funcionalidad del ATS.
 *
 * Se leen de variables de entorno de Vite (`VITE_*`) con valores por omisión
 * seguros, de modo que nada experimental se activa sin pedirlo explícitamente al
 * compilar.
 *
 * NOTA IMPORTANTE — el módulo de Evaluaciones no se configura aquí. Su versión
 * anterior dependía de cinco variables de entorno enredadas entre el navegador,
 * un proxy serverless y Apps Script; una sola mal escrita dejaba el módulo
 * inservible con un mensaje genérico. La reconstrucción se configura desde su
 * propio panel («Evaluaciones → Conexión»), que persiste la configuración en el
 * navegador y admite, opcionalmente, un valor por omisión de compilación. Ver
 * `src/features/evaluaciones/api/connection.ts`.
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

export const FLAGS = {
  /**
   * Origen de datos de ProcessOS. Por omisión el proveedor de demostración, así
   * que la aplicación es funcional sin conexión; con
   * `VITE_DATA_PROVIDER=google-apps-script` habla con el backend real.
   */
  dataProvider: providerName(env("VITE_DATA_PROVIDER"), "mock"),

  /** Backends futuros (no implementados sin esquema y credenciales aprobados). */
  supabase: envFlag("VITE_FLAG_SUPABASE", false),
} as const;

export type FeatureFlags = typeof FLAGS;
