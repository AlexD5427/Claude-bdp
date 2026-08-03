/**
 * Contratos de repositorio independientes del proveedor.
 *
 * La interfaz y los servicios de aplicación dependen SOLO de estas interfaces,
 * nunca de un proveedor concreto (Apps Script hoy, Supabase mañana). Cambiar de
 * backend es escribir un adaptador nuevo, no tocar los módulos.
 *
 * Every method returns a `Result` so failures are values the UI can branch on,
 * and writes carry an `entityVersion` for optimistic-concurrency / stale-update
 * detection at the repository boundary.
 */

import type { Result } from "../../shared/result";
import type {
  ProcessSummary,
  RecruitmentProcess,
} from "../../features/processes/domain/models";

export interface ListQuery {
  /** Free-text search across code/title/etc. */
  search?: string;
  /** Cursor/offset pagination. */
  page?: number;
  pageSize?: number;
}

export interface ListResult<T> {
  items: T[];
  total: number;
  /** ISO timestamp of the server snapshot this page came from. */
  syncedAt: string;
}

export interface ProcessRepository {
  list(query?: ListQuery): Promise<Result<ListResult<ProcessSummary>>>;
  get(id: string): Promise<Result<RecruitmentProcess>>;
  create(process: RecruitmentProcess): Promise<Result<RecruitmentProcess>>;
  /**
   * Update a draft. `expectedEntityVersion` guards against overwriting a record
   * another user changed since it was read (stale-update detection).
   */
  updateDraft(
    process: RecruitmentProcess,
    expectedEntityVersion: number,
  ): Promise<Result<RecruitmentProcess>>;
  publish(id: string, by: string): Promise<Result<RecruitmentProcess>>;
  pause(id: string, by: string): Promise<Result<RecruitmentProcess>>;
  close(id: string, by: string): Promise<Result<RecruitmentProcess>>;
  archive(id: string, by: string): Promise<Result<RecruitmentProcess>>;
  duplicate(id: string, by: string): Promise<Result<RecruitmentProcess>>;
}

/** Un proveedor agrupa los repositorios del ATS y su etiqueta de origen. */
export interface DataProvider {
  readonly name: "mock" | "google-apps-script" | "supabase";
  processes: ProcessRepository;
}
