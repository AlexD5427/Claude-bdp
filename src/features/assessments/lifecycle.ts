import { locale } from "../../content/locale/es-BO";
import { uid } from "../../shared/id";
import type {
  AssessmentDefinition,
  AssessmentPublicationStatus,
  AssessmentStatus,
  AssessmentVersion,
} from "./types";

/**
 * Assessment lifecycle + versioning rules.
 *
 * A published assessment is never mutated destructively. Edits are classified as
 * either NON-structural (safe to apply as a minor revision, audited) or
 * STRUCTURAL (must create a new version). Candidates who started an attempt stay
 * pinned to the version they began; new candidates receive the newly published
 * version. This module encodes that classification and the version bookkeeping.
 */

export const ASSESSMENT_STATUS_META: Record<AssessmentStatus, { label: string; dot: string; chip: string }> = {
  draft: { label: locale.status.draft, dot: "bg-slate-400", chip: "bg-slate-500/15 text-slate-300 ring-slate-400/30" },
  under_review: { label: locale.status.underReview, dot: "bg-amber-400", chip: "bg-amber-500/15 text-amber-300 ring-amber-400/30" },
  approved: { label: locale.status.approved, dot: "bg-teal-400", chip: "bg-teal-500/15 text-teal-300 ring-teal-400/30" },
  scheduled: { label: locale.status.scheduled, dot: "bg-indigo-400", chip: "bg-indigo-500/15 text-indigo-300 ring-indigo-400/30" },
  published: { label: locale.status.published, dot: "bg-emerald-400", chip: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30" },
  paused: { label: locale.status.paused, dot: "bg-orange-400", chip: "bg-orange-500/15 text-orange-300 ring-orange-400/30" },
  closed: { label: locale.status.closed, dot: "bg-rose-400", chip: "bg-rose-500/15 text-rose-300 ring-rose-400/30" },
  archived: { label: locale.status.archived, dot: "bg-zinc-400", chip: "bg-zinc-500/15 text-zinc-300 ring-zinc-400/30" },
};

export const ASSESSMENT_PUBLICATION_META: Record<
  AssessmentPublicationStatus,
  { label: string; dot: string; chip: string }
> = {
  unpublished: { label: locale.publication.unpublished, dot: "bg-slate-400", chip: "bg-slate-500/15 text-slate-300 ring-slate-400/30" },
  scheduled: { label: locale.publication.scheduled, dot: "bg-indigo-400", chip: "bg-indigo-500/15 text-indigo-300 ring-indigo-400/30" },
  published: { label: locale.publication.published, dot: "bg-emerald-400", chip: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30" },
  paused: { label: locale.publication.paused, dot: "bg-orange-400", chip: "bg-orange-500/15 text-orange-300 ring-orange-400/30" },
  closed: { label: locale.publication.closed, dot: "bg-rose-400", chip: "bg-rose-500/15 text-rose-300 ring-rose-400/30" },
  archived: { label: locale.publication.archived, dot: "bg-zinc-400", chip: "bg-zinc-500/15 text-zinc-300 ring-zinc-400/30" },
};

export type EditClassification = "none" | "non_structural" | "structural";

/**
 * Classify the difference between two assessment states.
 *
 * STRUCTURAL (→ new version required): adding/removing/reordering scored
 * questions, changing correct answers, points, options, branching, required
 * flags, timing or randomisation.
 *
 * NON-STRUCTURAL (→ safe minor revision if allowed): wording, instructions,
 * help text, descriptions, decorative media, accessible descriptions.
 */
export function classifyEdit(before: AssessmentDefinition, after: AssessmentDefinition): EditClassification {
  const sig = (a: AssessmentDefinition) => structuralSignature(a);
  const beforeSig = JSON.stringify(sig(before));
  const afterSig = JSON.stringify(sig(after));
  if (beforeSig !== afterSig) return "structural";

  const soft = (a: AssessmentDefinition) => softSignature(a);
  if (JSON.stringify(soft(before)) !== JSON.stringify(soft(after))) return "non_structural";
  return "none";
}

/** The structural fingerprint that, when changed, forces a new version. */
export function structuralSignature(a: AssessmentDefinition) {
  return {
    timing: a.timingPolicy,
    randomization: a.randomizationPolicy,
    scoringEnabled: a.scoringPolicy.enabled,
    passThreshold: a.scoringPolicy.passThreshold,
    rules: a.rules.map((r) => ({ when: r.when, actions: r.actions, enabled: r.enabled })),
    sections: a.sections.map((s) => ({
      id: s.id,
      order: s.order,
      randomize: s.randomize,
      drawCount: s.drawCount,
      questions: s.questions.map((q) => ({
        id: q.id,
        type: q.type,
        required: q.required,
        scoring: q.scoring,
        options: q.options.map((o) => ({ id: o.id, value: o.value, points: o.points, correct: o.correct })),
        validation: q.validation,
      })),
    })),
  };
}

/** The soft fingerprint (wording etc.) that only warrants a minor revision. */
function softSignature(a: AssessmentDefinition) {
  return {
    name: a.name,
    description: a.description,
    publicInstructions: a.publicInstructions,
    labels: a.sections.map((s) => ({
      title: s.title,
      description: s.description,
      questions: s.questions.map((q) => ({
        label: q.label,
        description: q.description,
        helpText: q.helpText,
        feedback: q.feedback,
        optionLabels: q.options.map((o) => o.label),
      })),
    })),
  };
}

export function parseVersion(v: string): { major: number; minor: number } {
  const [major, minor] = v.split(".").map((n) => parseInt(n, 10) || 0);
  return { major: major || 1, minor: minor || 0 };
}

export function formatVersion(major: number, minor: number): string {
  return `${major}.${minor}`;
}

/** Compute the next version string for a classification. */
export function nextVersion(current: string, classification: EditClassification): string {
  const { major, minor } = parseVersion(current);
  if (classification === "structural") return formatVersion(major + 1, 0);
  if (classification === "non_structural") return formatVersion(major, minor + 1);
  return current;
}

/** Build a frozen version snapshot from the current definition. */
export function snapshotVersion(
  a: AssessmentDefinition,
  version: string,
  actor: { id: string; name?: string },
  notes: string,
): AssessmentVersion {
  const { major, minor } = parseVersion(version);
  return {
    id: uid("ver"),
    major,
    minor,
    status: "published",
    notes,
    createdAt: new Date().toISOString(),
    createdBy: actor.name || actor.id,
    publishedAt: new Date().toISOString(),
    // Deep clone so later drafts can't mutate a historical snapshot.
    sections: JSON.parse(JSON.stringify(a.sections)),
    rules: JSON.parse(JSON.stringify(a.rules)),
  };
}
