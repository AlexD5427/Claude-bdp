import { z } from "zod";

/**
 * Zod schemas for AssessmentOS. These validate provider responses, imported
 * data and builder state. The `type` field of a question is an open string
 * (resolved by the plugin registry), so unknown types fail gracefully rather
 * than crashing the parser.
 */

export const AssessmentOptionSchema = z.object({
  id: z.string(),
  label: z.string().default(""),
  value: z.string().default(""),
  points: z.number().optional(),
  correct: z.boolean().optional(),
  feedback: z.string().optional(),
});

export const QuestionValidationSchema = z.object({
  required: z.boolean().optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  exactLength: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  decimalPlaces: z.number().optional(),
  pattern: z.string().optional(),
  minSelected: z.number().optional(),
  maxSelected: z.number().optional(),
  fileTypes: z.array(z.string()).optional(),
  maxFileSizeMb: z.number().optional(),
  maxFiles: z.number().optional(),
});

export const QuestionScoringSchema = z.object({
  mode: z
    .enum(["none", "exact", "partial", "weighted", "per_option", "manual", "rubric"])
    .default("none"),
  points: z.number().default(0),
  weight: z.number().default(1),
  allowNegative: z.boolean().optional(),
  rubricId: z.string().optional(),
  expectedValue: z.union([z.string(), z.number()]).optional(),
  competency: z.string().optional(),
});

export const AssessmentQuestionSchema = z.object({
  id: z.string(),
  type: z.string(),
  family: z
    .enum([
      "content",
      "text",
      "numeric",
      "datetime",
      "choice",
      "scale",
      "matrix",
      "ordering",
      "media",
      "file",
      "scenario",
      "technical",
      "banking",
    ])
    .default("content"),
  code: z.string().optional(),
  label: z.string().default(""),
  description: z.string().optional(),
  helpText: z.string().optional(),
  required: z.boolean().default(false),
  options: z.array(AssessmentOptionSchema).default([]),
  validation: QuestionValidationSchema.default({}),
  scoring: QuestionScoringSchema.default({ mode: "none", points: 0, weight: 1 }),
  config: z.record(z.unknown()).default({}),
  feedback: z.string().optional(),
  tags: z.array(z.string()).default([]),
  configured: z.boolean().default(true),
});

// Recursive condition group.
type ConditionGroupType = {
  kind: "group";
  combinator: "and" | "or";
  not?: boolean;
  children: unknown[];
};
export const ConditionSchema = z.object({
  kind: z.literal("condition"),
  source: z.string(),
  operator: z.enum([
    "equals",
    "not_equals",
    "contains",
    "greater_than",
    "less_than",
    "is_answered",
    "is_empty",
  ]),
  value: z.union([z.string(), z.number()]).optional(),
});
export const ConditionGroupSchema: z.ZodType<ConditionGroupType> = z.lazy(() =>
  z.object({
    kind: z.literal("group"),
    combinator: z.enum(["and", "or"]),
    not: z.boolean().optional(),
    children: z.array(z.union([ConditionSchema, ConditionGroupSchema])),
  }),
);

export const RuleActionSchema = z.object({
  type: z.enum([
    "show_question",
    "hide_question",
    "show_section",
    "skip_section",
    "go_to_section",
    "require_question",
    "make_optional",
    "end_assessment",
    "display_message",
  ]),
  target: z.string(),
  message: z.string().optional(),
});

export const AssessmentRuleSchema = z.object({
  id: z.string(),
  name: z.string().default(""),
  when: ConditionGroupSchema,
  actions: z.array(RuleActionSchema).default([]),
  enabled: z.boolean().default(true),
});

export const AssessmentSectionSchema = z.object({
  id: z.string(),
  title: z.string().default(""),
  description: z.string().optional(),
  order: z.number().default(0),
  questions: z.array(AssessmentQuestionSchema).default([]),
  randomize: z.boolean().optional(),
  drawCount: z.number().optional(),
});

const AttemptPolicySchema = z.object({ maxAttempts: z.number().default(1), allowReopen: z.boolean().default(false) });
const TimingPolicySchema = z.object({
  mode: z.enum(["untimed", "total", "section", "question"]).default("untimed"),
  totalSeconds: z.number().optional(),
  gracePeriodSeconds: z.number().optional(),
  autoSubmit: z.boolean().default(false),
  warningThresholdSeconds: z.number().optional(),
});
const NavigationPolicySchema = z.object({
  allowBack: z.boolean().default(true),
  showProgress: z.boolean().default(true),
  onePerPage: z.boolean().default(false),
});
const ResumePolicySchema = z.object({ allowSaveAndResume: z.boolean().default(true) });
const RandomizationPolicySchema = z.object({
  shuffleQuestions: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  shuffleSections: z.boolean().default(false),
  seedPerAttempt: z.boolean().default(true),
});
const ScoringPolicySchema = z.object({
  enabled: z.boolean().default(false),
  passThreshold: z.number().optional(),
  showScoreToCandidate: z.boolean().default(false),
  normalize: z.boolean().default(true),
});
const ResultVisibilityPolicySchema = z.object({
  showResultsImmediately: z.boolean().default(false),
  showCorrectAnswers: z.boolean().default(false),
});
const MonitoringPolicySchema = z.object({
  requireFullScreen: z.boolean().default(false),
  logFocusLoss: z.boolean().default(false),
});
const ConsentPolicySchema = z.object({ requireConsent: z.boolean().default(false), consentText: z.string().optional() });
const AccessibilityPolicySchema = z.object({
  allowExtraTime: z.boolean().default(false),
  extraTimeMultiplier: z.number().default(1.25),
  reducedMotionHint: z.boolean().default(true),
});

export const AssessmentVersionSchema = z.object({
  id: z.string(),
  major: z.number().default(1),
  minor: z.number().default(0),
  status: z.enum(["draft", "published", "retired"]).default("draft"),
  notes: z.string().default(""),
  createdAt: z.string(),
  createdBy: z.string().default(""),
  publishedAt: z.string().optional(),
  sections: z.array(AssessmentSectionSchema).default([]),
  rules: z.array(AssessmentRuleSchema).default([]),
});

export const AssessmentAuditEntrySchema = z.object({
  id: z.string(),
  action: z.string(),
  actorId: z.string(),
  actorName: z.string().optional(),
  timestamp: z.string(),
  summary: z.string(),
  versionBefore: z.string().optional(),
  versionAfter: z.string().optional(),
  requestId: z.string().optional(),
});

export const AssessmentDefinitionSchema = z.object({
  id: z.string(),
  externalReference: z.string().default(""),
  name: z.string().min(1, "El nombre de la evaluación es obligatorio."),
  code: z.string().default(""),
  description: z.string().default(""),
  category: z
    .enum([
      "questionnaire",
      "prescreen",
      "knowledge",
      "technical",
      "numerical",
      "situational",
      "competency",
      "interview",
      "caseStudy",
      "simulation",
      "feedback",
      "scorecard",
    ])
    .default("questionnaire"),
  purpose: z.string().default(""),
  status: z
    .enum(["draft", "under_review", "approved", "scheduled", "published", "paused", "closed", "archived"])
    .default("draft"),
  publicationStatus: z
    .enum(["unpublished", "scheduled", "published", "paused", "closed", "archived"])
    .default("unpublished"),
  currentVersion: z.string().nullable().default(null),
  draftVersion: z.string().default("1.0"),
  linkedProcessIds: z.array(z.string()).default([]),
  ownerId: z.string().default(""),
  authorIds: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  estimatedDuration: z.number().default(0),

  attemptPolicy: AttemptPolicySchema.default({ maxAttempts: 1, allowReopen: false }),
  timingPolicy: TimingPolicySchema.default({ mode: "untimed", autoSubmit: false }),
  navigationPolicy: NavigationPolicySchema.default({ allowBack: true, showProgress: true, onePerPage: false }),
  resumePolicy: ResumePolicySchema.default({ allowSaveAndResume: true }),
  randomizationPolicy: RandomizationPolicySchema.default({
    shuffleQuestions: false,
    shuffleOptions: false,
    shuffleSections: false,
    seedPerAttempt: true,
  }),
  scoringPolicy: ScoringPolicySchema.default({ enabled: false, showScoreToCandidate: false, normalize: true }),
  resultVisibilityPolicy: ResultVisibilityPolicySchema.default({
    showResultsImmediately: false,
    showCorrectAnswers: false,
  }),
  monitoringPolicy: MonitoringPolicySchema.default({ requireFullScreen: false, logFocusLoss: false }),
  consentPolicy: ConsentPolicySchema.default({ requireConsent: false }),
  accessibilityPolicy: AccessibilityPolicySchema.default({
    allowExtraTime: false,
    extraTimeMultiplier: 1.25,
    reducedMotionHint: true,
  }),

  sections: z.array(AssessmentSectionSchema).default([]),
  rules: z.array(AssessmentRuleSchema).default([]),
  theme: z.object({ accent: z.string().default("#00b0d8"), logoUrl: z.string().optional() }).default({
    accent: "#00b0d8",
  }),
  publicInstructions: z.string().default(""),
  internalInstructions: z.string().default(""),

  createdAt: z.string(),
  createdBy: z.string().default(""),
  updatedAt: z.string(),
  updatedBy: z.string().default(""),
  publishedAt: z.string().nullable().default(null),
  archivedAt: z.string().nullable().default(null),

  schemaVersion: z.number().default(1),
  sourceProvider: z.enum(["apps-script", "mock", "supabase"]).default("mock"),
  synchronizationStatus: z.enum(["synced", "pending", "error", "local"]).default("local"),

  versions: z.array(AssessmentVersionSchema).default([]),
  auditTrail: z.array(AssessmentAuditEntrySchema).default([]),
});

export type AssessmentDefinitionParsed = z.infer<typeof AssessmentDefinitionSchema>;

export function safeParseAssessment(raw: unknown) {
  return AssessmentDefinitionSchema.safeParse(raw);
}
