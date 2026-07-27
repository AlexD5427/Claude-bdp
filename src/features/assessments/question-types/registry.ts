/**
 * Question plugin registry.
 *
 * AssessmentOS avoids a single giant switch statement over question types.
 * Instead each type is a self-contained plugin that declares its schema,
 * defaults, editor/preview contracts, validator, scorer, (de)serializer,
 * importer/exporter, analytics adapter, accessibility metadata, and a migration
 * strategy. New types register here without touching existing code.
 *
 * Unknown types fail gracefully: `resolvePlugin` returns a fallback descriptor
 * that renders a safe "unsupported type" placeholder instead of crashing.
 */

import type { ComponentType } from "react";
import type { z } from "zod";
import type { AssessmentBlock, AssessmentOption } from "../domain/questions";

export type PluginCategory =
  | "content"
  | "answer"
  | "media"
  | "logic"
  | "layout"
  | "scorecard"
  | "simulation";

/** A candidate's raw answer to a block. Shape depends on the plugin. */
export type AnswerValue = string | number | boolean | string[] | Record<string, unknown> | null;

export interface ValidationResult {
  valid: boolean;
  /** es-MX message shown to the candidate/author when invalid. */
  message?: string;
}

export interface ScoreResult {
  /** Raw points earned. */
  raw: number;
  /** Maximum achievable points for this block. */
  max: number;
  /** Whether manual review is required before the score is final. */
  needsReview: boolean;
}

/** Props passed to a plugin's inspector editor. */
export interface EditorProps {
  block: AssessmentBlock;
  onChange: (patch: Partial<AssessmentBlock>) => void;
}

/** Props passed to a plugin's canvas/candidate preview. */
export interface PreviewProps {
  block: AssessmentBlock;
  /** When true, render as the candidate would see it (no answer keys). */
  candidateMode?: boolean;
  value?: AnswerValue;
  onValueChange?: (value: AnswerValue) => void;
  disabled?: boolean;
}

/**
 * Which generic control renders this type. Centralizing this here is what let us
 * delete the hardcoded `["q_single_choice", "q_true_false", …]` arrays that used
 * to live in the renderer, the inspector and the validator.
 */
export type PluginControl =
  | "content"
  | "radio"
  | "checkbox"
  | "select"
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "time"
  | "datetime"
  | "matrix"
  | "ordering"
  | "upload"
  /** Editor/renderer not implemented yet (feature-flagged contracts, betas). */
  | "pending";

/**
 * How an answer to this type can be graded.
 *
 * `auto_if_configured` means the type CAN be graded objectively, but only when
 * the author supplied the objective key (an expected value, or a `matchingKey`
 * on every option). Otherwise it falls back to manual review — the platform
 * never fakes automatic grading. Mirrored by `EVAL_QUESTION_TYPES` in
 * apps-script/evaluations/Validation.gs (a parity test enforces it).
 */
export type PluginGrading = "none" | "auto" | "manual" | "auto_if_configured";

/** What objective key a non-option type compares against. */
export type PluginExpects = "number" | "text" | "ordering" | "matching";

export interface PluginCapabilities {
  /** Does this type hold an option list? */
  options: boolean;
  /** Minimum active options required to publish. */
  minOptions: number;
  /** Hard maximum, or `null` for unbounded. */
  maxOptions: number | null;
  /** Exactly one option may be marked correct (single-answer families). */
  exactlyOneCorrect: boolean;
  /** Options are fixed: they cannot be added, removed, or relabelled. */
  fixedOptions: { value: string; label: string }[] | null;
  grading: PluginGrading;
  control: PluginControl;
  expects?: PluginExpects;
}

export interface QuestionPlugin {
  type: string;
  label: string;
  category: PluginCategory;
  /** Lucide icon name (resolved by the library UI). */
  icon: string;
  /** True when this block collects a candidate answer (vs. pure content). */
  isQuestion: boolean;
  /** Whether this plugin is production-ready or a feature-flagged contract. */
  status: "stable" | "beta" | "contract";
  /**
   * Declarative capabilities. Adding a new question type means adding a plugin
   * with its capabilities — no other file needs to change.
   */
  capabilities: PluginCapabilities;
  /**
   * Optional schema for `block.config`. When present it is used to parse the
   * stored configuration with explicit defaults, so an old or malformed
   * configuration degrades instead of crashing.
   */
  configSchema?: z.ZodType<Record<string, unknown>>;
  /** Build a fresh block of this type (id supplied by caller). */
  createDefault: (id: string) => AssessmentBlock;
  /** Optional inspector editor (falls back to the generic editor if absent). */
  Editor?: ComponentType<EditorProps>;
  /** Optional preview/renderer (falls back to a generic renderer if absent). */
  Preview?: ComponentType<PreviewProps>;
  /** Validate a candidate answer against the block's rules. */
  validate: (block: AssessmentBlock, value: AnswerValue) => ValidationResult;
  /** Score a candidate answer. Content blocks return zero/zero. */
  score: (block: AssessmentBlock, value: AnswerValue) => ScoreResult;
  /** Accessibility metadata used to build labels/roles. */
  a11y: { role: string; needsGroup: boolean };
  /** Migrate a block authored under an older schema to the current shape. */
  migrate?: (block: AssessmentBlock) => AssessmentBlock;
}

const registry = new Map<string, QuestionPlugin>();

export function registerPlugin(plugin: QuestionPlugin): void {
  registry.set(plugin.type, plugin);
}

export function registerPlugins(plugins: QuestionPlugin[]): void {
  plugins.forEach(registerPlugin);
}

export function getPlugin(type: string): QuestionPlugin | undefined {
  return registry.get(type);
}

export function allPlugins(): QuestionPlugin[] {
  return [...registry.values()];
}

export function pluginsByCategory(category: PluginCategory): QuestionPlugin[] {
  return allPlugins().filter((p) => p.category === category);
}

/** Capabilities of a block that carries no options and no grading. */
export const NO_OPTION_CAPABILITIES: PluginCapabilities = {
  options: false,
  minOptions: 0,
  maxOptions: null,
  exactlyOneCorrect: false,
  fixedOptions: null,
  grading: "none",
  control: "content",
};

/** A safe fallback used when a block references an unknown/disabled type. */
export function fallbackPlugin(type: string): QuestionPlugin {
  return {
    type,
    label: `Tipo no compatible (${type})`,
    category: "content",
    icon: "AlertTriangle",
    isQuestion: false,
    status: "contract",
    capabilities: { ...NO_OPTION_CAPABILITIES, control: "pending" },
    createDefault: (id) => ({
      id,
      type,
      order: 0,
      code: "",
      label: "",
      description: "",
      helpText: "",
      required: false,
      options: [],
      config: {},
      validation: {},
      score: { mode: "none", points: 0, weight: 1, rubricId: null, competency: "", normalize: false },
      feedback: { correct: "", incorrect: "", general: "" },
      media: null,
      accessibility: { ariaLabel: "", longDescription: "" },
      tags: [],
      analyticsKey: "",
    }),
    validate: () => ({ valid: true }),
    score: () => ({ raw: 0, max: 0, needsReview: false }),
    a11y: { role: "group", needsGroup: false },
  };
}

/** Always returns a plugin — the real one or a graceful fallback. */
export function resolvePlugin(type: string): QuestionPlugin {
  return registry.get(type) ?? fallbackPlugin(type);
}

/** Helper: does this block hold correct/scored options? */
export function hasCorrectOptions(options: AssessmentOption[]): boolean {
  return options.some((o) => o.correct || o.score !== 0);
}

/** Capabilities of a type, resolved through the graceful fallback. */
export function capabilitiesOf(type: string): PluginCapabilities {
  return resolvePlugin(type).capabilities;
}

/** Active options of a block (an option list has no `active` flag: all count). */
export function blockOptions(block: AssessmentBlock): AssessmentOption[] {
  return block.options;
}

/**
 * Can this block be graded automatically WITH ITS CURRENT CONFIGURATION?
 *
 * This is the frontend mirror of `evalIsAutoGradable_` in
 * apps-script/evaluations/Validation.gs. It is used for author feedback only:
 * the authoritative decision (and the resulting grade) is always the server's.
 */
export function isAutoGradable(block: AssessmentBlock): boolean {
  const caps = capabilitiesOf(block.type);
  if (caps.grading === "none") return false;
  if (block.score.mode === "none" || block.score.mode === "manual" || block.score.mode === "rubric") {
    return false;
  }
  if (caps.grading === "manual") return false;
  if (caps.grading === "auto") {
    return caps.options ? block.options.some((option) => option.correct) : true;
  }
  // auto_if_configured
  if (caps.expects === "ordering" || caps.expects === "matching") {
    return block.options.length > 0 && block.options.every((option) => option.matchingKey.trim() !== "");
  }
  const expected = block.config.expectedValue ?? block.validation.expectedValue;
  return expected !== undefined && expected !== null && expected !== "";
}

/** Does this block need a human to close its grade? */
export function requiresManualReview(block: AssessmentBlock): boolean {
  const caps = capabilitiesOf(block.type);
  if (caps.grading === "none") return false;
  if (block.score.mode === "none") return false;
  return !isAutoGradable(block);
}

/** Parse a block's config through the plugin schema when it declares one. */
export function parseBlockConfig(block: AssessmentBlock): Record<string, unknown> {
  const plugin = resolvePlugin(block.type);
  if (!plugin.configSchema) return block.config;
  const parsed = plugin.configSchema.safeParse(block.config);
  return parsed.success ? parsed.data : {};
}
