/**
 * Provider-neutral repository contracts.
 *
 * The UI and application services depend ONLY on these interfaces — never on a
 * concrete provider (Apps Script today, Supabase later). Swapping the backend
 * means writing a new adapter that satisfies these contracts; no module change.
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
import type {
  AssessmentDefinition,
  AssessmentSummary,
} from "../../features/assessments/domain/assessment";
import type {
  AssessmentResults,
  AttemptDetail,
} from "../../features/assessments/domain/attempts";

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

export interface AssessmentRepository {
  list(query?: ListQuery): Promise<Result<ListResult<AssessmentSummary>>>;
  get(id: string): Promise<Result<AssessmentDefinition>>;
  create(assessment: AssessmentDefinition): Promise<Result<AssessmentDefinition>>;
  updateDraft(
    assessment: AssessmentDefinition,
    expectedEntityVersion: number,
  ): Promise<Result<AssessmentDefinition>>;
  publish(id: string, by: string, notes?: string): Promise<Result<AssessmentDefinition>>;
  pause(id: string, by: string): Promise<Result<AssessmentDefinition>>;
  close(id: string, by: string): Promise<Result<AssessmentDefinition>>;
  archive(id: string, by: string): Promise<Result<AssessmentDefinition>>;
  duplicate(id: string, by: string): Promise<Result<AssessmentDefinition>>;
  rollback(id: string, versionId: string, by: string): Promise<Result<AssessmentDefinition>>;
  /**
   * Attempts and grades for an assessment. The grades are ALWAYS computed
   * server-side; this repository only reads them.
   */
  listResults(id: string): Promise<Result<AssessmentResults>>;
  /** One attempt with its answers, including the reviewer-only answer key. */
  getAttemptDetail(attemptId: string): Promise<Result<AttemptDetail>>;
}

/** A provider bundles both repositories plus a small identity/health surface. */
export interface DataProvider {
  readonly name: "mock" | "google-apps-script" | "supabase";
  processes: ProcessRepository;
  assessments: AssessmentRepository;
}
