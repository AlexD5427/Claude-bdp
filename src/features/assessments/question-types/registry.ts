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

/** A safe fallback used when a block references an unknown/disabled type. */
export function fallbackPlugin(type: string): QuestionPlugin {
  return {
    type,
    label: `Tipo no compatible (${type})`,
    category: "content",
    icon: "AlertTriangle",
    isQuestion: false,
    status: "contract",
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
