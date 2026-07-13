import type {
  AssessmentDefinition,
  AssessmentOption,
  AssessmentQuestion,
  AssessmentSection,
} from "./types";

/**
 * Public (Candidate Portal) DTO builder.
 *
 * The ATS owns and manages assessment content; the Candidate Portal only
 * renders it. This projection strips everything the candidate must never see:
 * correct answers, per-option points, scoring configuration, internal
 * instructions, monitoring/consent internals and audit history. It is the single
 * gate through which assessment content may leave the admin boundary.
 */

export interface PublicOption {
  id: string;
  label: string;
  value: string;
}

export interface PublicQuestion {
  id: string;
  type: string;
  family: string;
  label: string;
  description?: string;
  helpText?: string;
  required: boolean;
  options: PublicOption[];
  /** Only presentation-relevant config is forwarded (e.g. scale ranges). */
  config: Record<string, unknown>;
}

export interface PublicSection {
  id: string;
  title: string;
  description?: string;
  questions: PublicQuestion[];
}

export interface PublicAssessment {
  id: string;
  name: string;
  category: string;
  version: string | null;
  estimatedDuration: number;
  publicInstructions: string;
  sections: PublicSection[];
  timing: { mode: string; totalSeconds?: number };
  navigation: { allowBack: boolean; showProgress: boolean; onePerPage: boolean };
  consent: { required: boolean; text?: string };
}

/** Config keys that are safe to expose (never answer keys). */
const SAFE_CONFIG_KEYS = new Set(["min", "max", "step", "rows", "columns", "currency", "language", "dialect", "scenario", "url"]);

function toPublicOption(o: AssessmentOption): PublicOption {
  return { id: o.id, label: o.label, value: o.value };
}

function sanitizeConfig(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    if (SAFE_CONFIG_KEYS.has(k)) out[k] = v;
  }
  return out;
}

function toPublicQuestion(q: AssessmentQuestion): PublicQuestion {
  return {
    id: q.id,
    type: q.type,
    family: q.family,
    label: q.label,
    description: q.description,
    helpText: q.helpText,
    required: q.required,
    // Strip `correct`, `points`, `feedback` from options.
    options: q.options.map(toPublicOption),
    config: sanitizeConfig(q.config),
  };
}

function toPublicSection(s: AssessmentSection): PublicSection {
  return {
    id: s.id,
    title: s.title,
    description: s.description,
    questions: s.questions.map(toPublicQuestion),
  };
}

/** Build the candidate-safe projection of an assessment (published version). */
export function toPublicAssessment(a: AssessmentDefinition): PublicAssessment {
  return {
    id: a.id,
    name: a.name,
    category: a.category,
    version: a.currentVersion,
    estimatedDuration: a.estimatedDuration,
    publicInstructions: a.publicInstructions,
    sections: a.sections.map(toPublicSection),
    timing: { mode: a.timingPolicy.mode, totalSeconds: a.timingPolicy.totalSeconds },
    navigation: {
      allowBack: a.navigationPolicy.allowBack,
      showProgress: a.navigationPolicy.showProgress,
      onePerPage: a.navigationPolicy.onePerPage,
    },
    consent: { required: a.consentPolicy.requireConsent, text: a.consentPolicy.consentText },
  };
}

/** Deep check that a public DTO contains no answer keys (used by tests). */
export function containsNoAnswerKeys(dto: PublicAssessment): boolean {
  const json = JSON.stringify(dto);
  return !/"correct"|"points"|"expectedValue"/.test(json);
}
