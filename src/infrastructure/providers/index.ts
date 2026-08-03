/**
 * Selección del proveedor de datos del ATS.
 *
 * El `DataProvider` activo lo elige la bandera `dataProvider`. El resto de la
 * aplicación depende solo de `getProvider()`: cambiar de backend es un cambio de
 * configuración, no de código.
 *
 * El módulo de Evaluaciones NO se selecciona aquí. Tiene su propio backend, su
 * propio libro de cálculo y su propio selector (`features/evaluaciones/api`),
 * precisamente para que la disponibilidad de uno no dependa del otro.
 */

import { FLAGS, type ProviderName } from "../../shared/flags";
import type { DataProvider } from "../repositories/contracts";
import { mockProvider } from "./mock";
import { appsScriptProvider } from "./google-apps-script";
import { supabaseProvider } from "./supabase";

let override: DataProvider | null = null;

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

/** Utilidad de pruebas: fuerza un proveedor sin importar la bandera. */
export function __setProviderForTests(p: DataProvider | null): void {
  override = p;
}

export { mockProvider, appsScriptProvider, supabaseProvider };
