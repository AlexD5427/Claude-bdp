/**
 * AssessmentOS domain model.
 *
 * An `AssessmentDefinition` is a versioned, provider-neutral description of an
 * assessment: its sections, questions (blocks), scoring, logic/branching rules,
 * delivery policies and publication state. Question *types* are open-ended and
 * resolved through the plugin registry (`question-types/registry`), so new types
 * can be added without touching the core model.
 */

export type AssessmentCategory =
  | "questionnaire"
  | "prescreen"
  | "knowledge"
  | "technical"
  | "numerical"
  | "situational"
  | "competency"
  | "interview"
  | "caseStudy"
  | "simulation"
  | "feedback"
  | "scorecard";

export type AssessmentStatus =
  | "draft"
  | "under_review"
  | "approved"
  | "scheduled"
  | "published"
  | "paused"
  | "closed"
  | "archived";

export type AssessmentPublicationStatus =
  | "unpublished"
  | "scheduled"
  | "published"
  | "paused"
  | "closed"
  | "archived";

/** The family a question type belongs to (drives the builder's grouping). */
export type QuestionFamily =
  | "content"
  | "text"
  | "numeric"
  | "datetime"
  | "choice"
  | "scale"
  | "matrix"
  | "ordering"
  | "media"
  | "file"
  | "scenario"
  | "technical"
  | "banking";

/** A selectable option for choice-style questions. */
export interface AssessmentOption {
  id: string;
  label: string;
  value: string;
  /** Points awarded when this option is chosen (per-option scoring). */
  points?: number;
  /** Marks the option as a correct answer (never sent to the public portal). */
  correct?: boolean;
  /** Optional per-option feedback. */
  feedback?: string;
}

/** Per-question validation constraints (see `validation.ts`). */
export interface QuestionValidation {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  exactLength?: number;
  min?: number;
  max?: number;
  decimalPlaces?: number;
  pattern?: string;
  minSelected?: number;
  maxSelected?: number;
  fileTypes?: string[];
  maxFileSizeMb?: number;
  maxFiles?: number;
}

/** Per-question scoring configuration (see `scoring.ts`). */
export interface QuestionScoring {
  mode: "none" | "exact" | "partial" | "weighted" | "per_option" | "manual" | "rubric";
  points: number;
  weight: number;
  /** Enables negative scoring for wrong answers (only when explicitly on). */
  allowNegative?: boolean;
  /** Reference to a rubric id for manual/rubric scoring. */
  rubricId?: string;
  /** For text/numeric exact answers. */
  expectedValue?: string | number;
  /** Competency dimension this question contributes to. */
  competency?: string;
}

/** A question or content block on the canvas. */
export interface AssessmentQuestion {
  id: string;
  type: string; // resolved via the plugin registry
  family: QuestionFamily;
  code?: string;
  label: string;
  description?: string;
  helpText?: string;
  required: boolean;
  options: AssessmentOption[];
  validation: QuestionValidation;
  scoring: QuestionScoring;
  /** Type-specific configuration (scale ranges, matrix rows/cols, media, …). */
  config: Record<string, unknown>;
  feedback?: string;
  tags: string[];
  /** Whether the block is fully configured (drives builder warnings). */
  configured: boolean;
}

/** A logic/branching rule (see `logic.ts`). */
export interface AssessmentRule {
  id: string;
  name: string;
  /** Root condition group. */
  when: ConditionGroup;
  actions: RuleAction[];
  enabled: boolean;
}

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "greater_than"
  | "less_than"
  | "is_answered"
  | "is_empty";

export interface Condition {
  kind: "condition";
  /** questionId or a virtual field like "score" / "section_score". */
  source: string;
  operator: ConditionOperator;
  value?: string | number;
}

export interface ConditionGroup {
  kind: "group";
  combinator: "and" | "or";
  not?: boolean;
  children: (Condition | ConditionGroup)[];
}

export type RuleActionType =
  | "show_question"
  | "hide_question"
  | "show_section"
  | "skip_section"
  | "go_to_section"
  | "require_question"
  | "make_optional"
  | "end_assessment"
  | "display_message";

export interface RuleAction {
  type: RuleActionType;
  /** Target question or section id (or a message for display_message). */
  target: string;
  message?: string;
}

export interface AssessmentSection {
  id: string;
  title: string;
  description?: string;
  order: number;
  questions: AssessmentQuestion[];
  /** Shuffle the questions within this section per attempt. */
  randomize?: boolean;
  /** Draw N from a pool (0 = use all). */
  drawCount?: number;
}

/* ---- delivery / governance policies ------------------------------ */

export interface AttemptPolicy {
  maxAttempts: number; // 0 = unlimited
  allowReopen: boolean;
}
export interface TimingPolicy {
  mode: "untimed" | "total" | "section" | "question";
  totalSeconds?: number;
  gracePeriodSeconds?: number;
  autoSubmit: boolean;
  warningThresholdSeconds?: number;
}
export interface NavigationPolicy {
  allowBack: boolean;
  showProgress: boolean;
  onePerPage: boolean;
}
export interface ResumePolicy {
  allowSaveAndResume: boolean;
}
export interface RandomizationPolicy {
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  shuffleSections: boolean;
  seedPerAttempt: boolean;
}
export interface ScoringPolicy {
  enabled: boolean;
  passThreshold?: number; // percent
  showScoreToCandidate: boolean;
  normalize: boolean;
}
export interface ResultVisibilityPolicy {
  showResultsImmediately: boolean;
  showCorrectAnswers: boolean; // only for internal review, never public
}
export interface MonitoringPolicy {
  requireFullScreen: boolean;
  logFocusLoss: boolean;
}
export interface ConsentPolicy {
  requireConsent: boolean;
  consentText?: string;
}
export interface AccessibilityPolicy {
  allowExtraTime: boolean;
  extraTimeMultiplier: number;
  reducedMotionHint: boolean;
}

export interface AssessmentTheme {
  accent: string;
  logoUrl?: string;
}

/** A published (or draft) version snapshot. */
export interface AssessmentVersion {
  id: string;
  major: number;
  minor: number;
  status: "draft" | "published" | "retired";
  notes: string;
  createdAt: string;
  createdBy: string;
  publishedAt?: string;
  /** Frozen snapshot of the sections at publication (immutable). */
  sections: AssessmentSection[];
  rules: AssessmentRule[];
}

export interface AssessmentAuditEntry {
  id: string;
  action:
    | "created"
    | "edited"
    | "published"
    | "paused"
    | "closed"
    | "archived"
    | "duplicated"
    | "version_created"
    | "version_published"
    | "imported"
    | "linked_to_process"
    | "removed_from_process";
  actorId: string;
  actorName?: string;
  timestamp: string;
  summary: string;
  versionBefore?: string;
  versionAfter?: string;
  requestId?: string;
}

export interface AssessmentDefinition {
  id: string;
  externalReference: string;
  name: string;
  code: string;
  description: string;
  category: AssessmentCategory;
  purpose: string;
  status: AssessmentStatus;
  publicationStatus: AssessmentPublicationStatus;
  currentVersion: string | null;
  draftVersion: string;
  linkedProcessIds: string[];
  ownerId: string;
  authorIds: string[];
  tags: string[];
  estimatedDuration: number; // seconds

  attemptPolicy: AttemptPolicy;
  timingPolicy: TimingPolicy;
  navigationPolicy: NavigationPolicy;
  resumePolicy: ResumePolicy;
  randomizationPolicy: RandomizationPolicy;
  scoringPolicy: ScoringPolicy;
  resultVisibilityPolicy: ResultVisibilityPolicy;
  monitoringPolicy: MonitoringPolicy;
  consentPolicy: ConsentPolicy;
  accessibilityPolicy: AccessibilityPolicy;

  sections: AssessmentSection[];
  rules: AssessmentRule[];
  theme: AssessmentTheme;
  publicInstructions: string;
  internalInstructions: string;

  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  publishedAt: string | null;
  archivedAt: string | null;

  schemaVersion: number;
  sourceProvider: "apps-script" | "mock" | "supabase";
  synchronizationStatus: "synced" | "pending" | "error" | "local";

  versions: AssessmentVersion[];
  auditTrail: AssessmentAuditEntry[];
}

/** Cheap list projection — never carries full section/question JSON. */
export interface AssessmentSummary {
  id: string;
  code: string;
  name: string;
  category: AssessmentCategory;
  status: AssessmentStatus;
  publicationStatus: AssessmentPublicationStatus;
  version: string;
  linkedProcessCount: number;
  questionCount: number;
  estimatedDuration: number;
  tags: string[];
  ownerId: string;
  updatedAt: string;
  synchronizationStatus: AssessmentDefinition["synchronizationStatus"];
  isTemplate?: boolean;
}

/** A reusable question bank item. */
export interface QuestionBankItem {
  id: string;
  question: AssessmentQuestion;
  folder: string;
  competency: string;
  difficulty: "baja" | "media" | "alta";
  tags: string[];
  usageCount: number;
  favorite: boolean;
  archived: boolean;
  updatedAt: string;
}
