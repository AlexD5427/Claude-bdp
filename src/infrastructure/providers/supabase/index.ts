/**
 * Supabase provider — CONTRACT ONLY (feature-flagged off).
 *
 * Real Supabase persistence must not be implemented without an approved schema
 * and credentials, and server/storage secrets must never reach the browser.
 * This stub satisfies the `DataProvider` contract so the wiring compiles and
 * documents the intended migration target (Postgres + RLS + Cloudflare R2).
 *
 * Every method returns a normalized "not implemented" error.
 */

import { err, appError } from "../../../shared/result";
import type { DataProvider, ProcessRepository } from "../../repositories/contracts";

const notImplemented = () =>
  err(appError("provider", "El proveedor Supabase aún no está habilitado."));

const processRepo: ProcessRepository = {
  list: async () => notImplemented(),
  get: async () => notImplemented(),
  create: async () => notImplemented(),
  updateDraft: async () => notImplemented(),
  publish: async () => notImplemented(),
  pause: async () => notImplemented(),
  close: async () => notImplemented(),
  archive: async () => notImplemented(),
  duplicate: async () => notImplemented(),
};

export const supabaseProvider: DataProvider = {
  name: "supabase",
  processes: processRepo,
};
