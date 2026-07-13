import { uid, slugCode } from "../../shared/id";
import { estimateDuration } from "./scoring";
import type {
  AssessmentCategory,
  AssessmentDefinition,
  AssessmentQuestion,
  AssessmentSection,
} from "./types";

/** Actor shape shared with the process feature (kept structurally identical). */
export interface Actor {
  id: string;
  name?: string;
}

export interface NewAssessmentInput {
  name: string;
  category?: AssessmentCategory;
  purpose?: string;
  sections?: AssessmentSection[];
  tags?: string[];
  code?: string;
}

/** Build a blank, valid assessment definition from minimal input. */
export function createAssessmentDefinition(
  input: NewAssessmentInput,
  actor: Actor,
  source: "mock" | "apps-script" = "mock",
): AssessmentDefinition {
  const now = new Date().toISOString();
  const sections = input.sections ?? [emptySection("Sección 1")];
  return {
    id: uid("asmt"),
    externalReference: "",
    name: input.name,
    code: input.code || slugCode(input.name),
    description: "",
    category: input.category ?? "questionnaire",
    purpose: input.purpose ?? "",
    status: "draft",
    publicationStatus: "unpublished",
    currentVersion: null,
    draftVersion: "1.0",
    linkedProcessIds: [],
    ownerId: actor.id,
    authorIds: [actor.id],
    tags: input.tags ?? [],
    estimatedDuration: estimateDuration(sections),
    attemptPolicy: { maxAttempts: 1, allowReopen: false },
    timingPolicy: { mode: "untimed", autoSubmit: false },
    navigationPolicy: { allowBack: true, showProgress: true, onePerPage: false },
    resumePolicy: { allowSaveAndResume: true },
    randomizationPolicy: {
      shuffleQuestions: false,
      shuffleOptions: false,
      shuffleSections: false,
      seedPerAttempt: true,
    },
    scoringPolicy: { enabled: false, showScoreToCandidate: false, normalize: true },
    resultVisibilityPolicy: { showResultsImmediately: false, showCorrectAnswers: false },
    monitoringPolicy: { requireFullScreen: false, logFocusLoss: false },
    consentPolicy: { requireConsent: false },
    accessibilityPolicy: { allowExtraTime: false, extraTimeMultiplier: 1.25, reducedMotionHint: true },
    sections,
    rules: [],
    theme: { accent: "#00b0d8" },
    publicInstructions: "Lee cada pregunta con atención antes de responder.",
    internalInstructions: "",
    createdAt: now,
    createdBy: actor.name || actor.id,
    updatedAt: now,
    updatedBy: actor.name || actor.id,
    publishedAt: null,
    archivedAt: null,
    schemaVersion: 1,
    sourceProvider: source,
    synchronizationStatus: source === "mock" ? "local" : "pending",
    versions: [],
    auditTrail: [
      {
        id: uid("aud"),
        action: "created",
        actorId: actor.id,
        actorName: actor.name,
        timestamp: now,
        summary: `Evaluación creada: ${input.name}`,
      },
    ],
  };
}

export function emptySection(title: string, order = 0): AssessmentSection {
  return { id: uid("sec"), title, order, questions: [] };
}

/** Recompute derived fields (estimated duration) after a builder edit. */
export function withDerived(a: AssessmentDefinition): AssessmentDefinition {
  return { ...a, estimatedDuration: estimateDuration(a.sections) };
}

/** A tiny helper to append a question to a section immutably. */
export function addQuestionToSection(
  a: AssessmentDefinition,
  sectionId: string,
  question: AssessmentQuestion,
  index?: number,
): AssessmentDefinition {
  return withDerived({
    ...a,
    sections: a.sections.map((s) => {
      if (s.id !== sectionId) return s;
      const questions = [...s.questions];
      questions.splice(index ?? questions.length, 0, question);
      return { ...s, questions };
    }),
  });
}
