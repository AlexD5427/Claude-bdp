/**
 * Public DTO mapper.
 *
 * SECURITY-CRITICAL: the Candidate Portal must never receive answer keys. This
 * module projects an `AssessmentDefinition` (which internally holds `correct`
 * flags, per-option scores, scoring rules, feedback, and internal instructions)
 * into a candidate-safe DTO with all of that stripped.
 *
 * The published version (not the draft) is what candidates see, so the public
 * DTO is always built from `currentPublishedVersionId`.
 */

import type { AssessmentDefinition, AssessmentVersion } from "../../features/assessments/domain/assessment";

export interface PublicOption {
  id: string;
  label: string;
  value: string;
  mediaUrl: string | null;
}

export interface PublicBlock {
  id: string;
  type: string;
  order: number;
  label: string;
  description: string;
  helpText: string;
  required: boolean;
  options: PublicOption[];
  /** Only presentation-relevant config is forwarded (min/max/step/placeholder). */
  config: Record<string, unknown>;
  media: AssessmentVersion["content"]["sections"][number]["blocks"][number]["media"];
  accessibility: { ariaLabel: string; longDescription: string };
}

export interface PublicSection {
  id: string;
  title: string;
  description: string;
  order: number;
  blocks: PublicBlock[];
}

export interface PublicAssessmentDTO {
  id: string;
  code: string;
  name: string;
  category: string;
  versionLabel: string;
  estimatedDurationMinutes: number;
  publicInstructions: string;
  theme: AssessmentVersion["content"]["theme"];
  sections: PublicSection[];
  timing: AssessmentDefinition["timingPolicy"];
  navigation: AssessmentDefinition["navigationPolicy"];
  consent: { requireConsent: boolean; consentText: string; requireDataPrivacyAcceptance: boolean };
}

/** Only these config keys are safe to forward to the candidate renderer. */
const PRESENTATION_CONFIG_KEYS = new Set([
  "placeholder",
  "min",
  "max",
  "step",
  "rows",
  "maxLength",
  "minLength",
  "scaleMin",
  "scaleMax",
  "scaleStep",
  "columns",
  "rows_matrix",
  "currency",
  "decimals",
  "allowMultiple",
  "maxSelections",
  "icon",
  "starCount",
]);

function pickPresentationConfig(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(config)) {
    if (PRESENTATION_CONFIG_KEYS.has(key)) out[key] = config[key];
  }
  return out;
}

/**
 * Build the candidate-safe DTO from an assessment. Returns `null` when there is
 * no published version to serve (drafts are never public).
 */
export function toPublicAssessmentDTO(def: AssessmentDefinition): PublicAssessmentDTO | null {
  const version =
    def.publishedVersions.find((v) => v.id === def.currentPublishedVersionId) ?? null;
  if (!version) return null;

  const sections: PublicSection[] = version.content.sections
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      order: s.order,
      blocks: s.blocks
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((b) => ({
          id: b.id,
          type: b.type,
          order: b.order,
          label: b.label,
          description: b.description,
          helpText: b.helpText,
          required: b.required,
          // Strip `score`, `correct`, and `feedback` from every option.
          options: b.options.map((o) => ({
            id: o.id,
            label: o.label,
            value: o.value,
            mediaUrl: o.mediaUrl,
          })),
          config: pickPresentationConfig(b.config),
          media: b.media,
          accessibility: b.accessibility,
        })),
    }));

  return {
    id: def.id,
    code: def.code,
    name: def.name,
    category: def.category,
    versionLabel: `v${version.major}.${version.minor}`,
    estimatedDurationMinutes: def.estimatedDurationMinutes,
    publicInstructions: version.content.publicInstructions,
    theme: version.content.theme,
    sections,
    timing: def.timingPolicy,
    navigation: def.navigationPolicy,
    consent: {
      requireConsent: def.consentPolicy.requireConsent,
      consentText: def.consentPolicy.consentText,
      requireDataPrivacyAcceptance: def.consentPolicy.requireDataPrivacyAcceptance,
    },
  };
}
