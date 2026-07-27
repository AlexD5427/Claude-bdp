/**
 * Builder state.
 *
 * The visual builder keeps several concerns explicitly separated: the assessment
 * *document* (its metadata plus its content), the current UI *selection*, an
 * undo/redo *history*, and derived *validation*. This is a plain reducer over
 * immutable data so React re-renders only what changed and history is trivial
 * (snapshots of the document).
 *
 * Persistence, synchronization, preview, and publishing live outside this
 * reducer (in the service + module), keeping the builder pure and testable.
 *
 * Positions are normalized on every structural change, so `order` is always
 * `0..n-1` with no gaps — the invariant the publish checklist and the backend
 * both rely on.
 */

import { newId } from "../../../shared/ids";
import { capabilitiesOf, resolvePlugin } from "../question-types";
import { makeOption } from "../question-types/helpers";
import type { AssessmentCategory } from "../domain/categories";
import { assessmentContentSchema, type AssessmentContent } from "../domain/assessment";
import type { AssessmentBlock, AssessmentOption, AssessmentSection } from "../domain/questions";

/** Assessment-level fields the builder can edit (everything else is derived). */
export interface BuilderMeta {
  name: string;
  description: string;
  purpose: string;
  category: AssessmentCategory;
  tags: string[];
  /** Configured duration in minutes. 0 means "no time limit". */
  durationMinutes: number;
  /** Pass mark 0..100, or `null` for none. */
  passingScore: number | null;
}

export interface BuilderDocument {
  meta: BuilderMeta;
  content: AssessmentContent;
}

export interface BuilderState {
  meta: BuilderMeta;
  content: AssessmentContent;
  selectedBlockId: string | null;
  selectedSectionId: string | null;
  past: BuilderDocument[];
  future: BuilderDocument[];
}

export type BuilderAction =
  | { type: "select"; blockId: string | null; sectionId: string | null }
  | { type: "updateMeta"; patch: Partial<BuilderMeta> }
  | { type: "addSection" }
  | { type: "removeSection"; sectionId: string }
  | { type: "updateSection"; sectionId: string; patch: Partial<AssessmentSection> }
  | { type: "moveSection"; sectionId: string; dir: -1 | 1 }
  | { type: "addBlock"; sectionId: string; blockType: string; atIndex?: number }
  | { type: "updateBlock"; blockId: string; patch: Partial<AssessmentBlock> }
  | { type: "changeBlockType"; blockId: string; blockType: string }
  | { type: "removeBlock"; blockId: string }
  | { type: "duplicateBlock"; blockId: string }
  | { type: "moveBlock"; blockId: string; dir: -1 | 1 }
  | { type: "addOption"; blockId: string }
  | { type: "updateOption"; blockId: string; optionId: string; patch: Partial<AssessmentOption> }
  | { type: "removeOption"; blockId: string; optionId: string }
  | { type: "moveOption"; blockId: string; optionId: string; dir: -1 | 1 }
  | { type: "setCorrectOption"; blockId: string; optionId: string; correct: boolean }
  | { type: "resetFixedOptions"; blockId: string }
  | { type: "replaceContent"; content: AssessmentContent }
  | { type: "undo" }
  | { type: "redo" };

const HISTORY_LIMIT = 50;

export function defaultBuilderMeta(): BuilderMeta {
  return {
    name: "",
    description: "",
    purpose: "",
    category: "knowledge",
    tags: [],
    durationMinutes: 0,
    passingScore: null,
  };
}

export function initBuilder(content: AssessmentContent, meta?: BuilderMeta): BuilderState {
  return {
    meta: meta ?? defaultBuilderMeta(),
    content,
    selectedBlockId: null,
    selectedSectionId: null,
    past: [],
    future: [],
  };
}

/** Push a document change with history bookkeeping. */
function commit(
  state: BuilderState,
  next: { content?: AssessmentContent; meta?: BuilderMeta },
): BuilderState {
  return {
    ...state,
    content: next.content ?? state.content,
    meta: next.meta ?? state.meta,
    past: [...state.past, { content: state.content, meta: state.meta }].slice(-HISTORY_LIMIT),
    future: [],
  };
}

function reorderBlocks(section: AssessmentSection): AssessmentSection {
  return { ...section, blocks: section.blocks.map((b, i) => ({ ...b, order: i })) };
}

/** Map a single block, leaving everything else untouched. */
function mapBlock(
  content: AssessmentContent,
  blockId: string,
  fn: (block: AssessmentBlock) => AssessmentBlock,
): AssessmentContent {
  return {
    ...content,
    sections: content.sections.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) => (block.id === blockId ? fn(block) : block)),
    })),
  };
}

/** Normalize option positions and enforce single-answer exclusivity. */
function normalizeOptions(block: AssessmentBlock, options: AssessmentOption[]): AssessmentBlock {
  const caps = capabilitiesOf(block.type);
  let next = options;
  if (caps.exactlyOneCorrect) {
    const firstCorrect = next.findIndex((option) => option.correct);
    next = next.map((option, index) => ({ ...option, correct: index === firstCorrect }));
  }
  return { ...block, options: next };
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case "select":
      return { ...state, selectedBlockId: action.blockId, selectedSectionId: action.sectionId };

    case "updateMeta":
      return commit(state, { meta: { ...state.meta, ...action.patch } });

    case "addSection": {
      const section: AssessmentSection = {
        id: newId("sec"),
        title: `Sección ${state.content.sections.length + 1}`,
        description: "",
        order: state.content.sections.length,
        blocks: [],
        config: { timeLimitSeconds: null, randomizeBlocks: false, poolSize: null, weight: 1 },
      };
      return commit(state, {
        content: { ...state.content, sections: [...state.content.sections, section] },
      });
    }

    case "removeSection":
      return commit(state, {
        content: {
          ...state.content,
          sections: state.content.sections
            .filter((s) => s.id !== action.sectionId)
            .map((s, i) => ({ ...s, order: i })),
        },
      });

    case "updateSection":
      return commit(state, {
        content: {
          ...state.content,
          sections: state.content.sections.map((s) =>
            s.id === action.sectionId ? { ...s, ...action.patch } : s,
          ),
        },
      });

    case "moveSection": {
      const idx = state.content.sections.findIndex((s) => s.id === action.sectionId);
      const target = idx + action.dir;
      if (idx < 0 || target < 0 || target >= state.content.sections.length) return state;
      const sections = [...state.content.sections];
      [sections[idx], sections[target]] = [sections[target], sections[idx]];
      return commit(state, {
        content: { ...state.content, sections: sections.map((s, i) => ({ ...s, order: i })) },
      });
    }

    case "addBlock": {
      const plugin = resolvePlugin(action.blockType);
      const block = plugin.createDefault(newId("blk"));
      return {
        ...commit(state, {
          content: {
            ...state.content,
            sections: state.content.sections.map((s) => {
              if (s.id !== action.sectionId) return s;
              const blocks = [...s.blocks];
              const at = action.atIndex ?? blocks.length;
              blocks.splice(at, 0, block);
              return reorderBlocks({ ...s, blocks });
            }),
          },
        }),
        // Adding a question focuses it: the user's next action is editing it.
        selectedBlockId: block.id,
        selectedSectionId: action.sectionId,
      };
    }

    case "updateBlock":
      return commit(state, {
        content: mapBlock(state.content, action.blockId, (block) => ({ ...block, ...action.patch })),
      });

    case "changeBlockType": {
      const plugin = resolvePlugin(action.blockType);
      return commit(state, {
        content: mapBlock(state.content, action.blockId, (block) => {
          const fresh = plugin.createDefault(block.id);
          const caps = capabilitiesOf(action.blockType);
          const previousCaps = capabilitiesOf(block.type);
          // The wording the author already typed is preserved; type-specific
          // configuration is replaced by the new type's defaults. Options only
          // survive when both types use a compatible option list.
          const keepOptions =
            caps.options && previousCaps.options && !caps.fixedOptions && block.options.length > 0;
          return normalizeOptions(
            {
              ...fresh,
              order: block.order,
              label: block.label,
              description: block.description,
              helpText: block.helpText,
              required: block.required,
              code: block.code,
              tags: block.tags,
              accessibility: block.accessibility,
              media: block.media,
              score: { ...fresh.score, competency: block.score.competency },
            },
            keepOptions ? block.options : fresh.options,
          );
        }),
      });
    }

    case "removeBlock":
      return {
        ...commit(state, {
          content: {
            ...state.content,
            sections: state.content.sections.map((s) =>
              reorderBlocks({ ...s, blocks: s.blocks.filter((b) => b.id !== action.blockId) }),
            ),
          },
        }),
        selectedBlockId: state.selectedBlockId === action.blockId ? null : state.selectedBlockId,
      };

    case "duplicateBlock": {
      const copyId = newId("blk");
      return {
        ...commit(state, {
          content: {
            ...state.content,
            sections: state.content.sections.map((s) => {
              const idx = s.blocks.findIndex((b) => b.id === action.blockId);
              if (idx < 0) return s;
              const source = structuredClone(s.blocks[idx]);
              // Fresh ids for the block AND every option: duplicating must never
              // share identity with the original (the backend would reject it).
              const copy: AssessmentBlock = {
                ...source,
                id: copyId,
                options: source.options.map((option) => ({ ...option, id: newId("opt") })),
              };
              const blocks = [...s.blocks];
              blocks.splice(idx + 1, 0, copy);
              return reorderBlocks({ ...s, blocks });
            }),
          },
        }),
        selectedBlockId: copyId,
      };
    }

    case "moveBlock":
      return commit(state, {
        content: {
          ...state.content,
          sections: state.content.sections.map((s) => {
            const idx = s.blocks.findIndex((b) => b.id === action.blockId);
            if (idx < 0) return s;
            const target = idx + action.dir;
            if (target < 0 || target >= s.blocks.length) return s;
            const blocks = [...s.blocks];
            [blocks[idx], blocks[target]] = [blocks[target], blocks[idx]];
            return reorderBlocks({ ...s, blocks });
          }),
        },
      });

    case "addOption":
      return commit(state, {
        content: mapBlock(state.content, action.blockId, (block) => {
          const caps = capabilitiesOf(block.type);
          if (!caps.options) return block;
          if (caps.maxOptions !== null && block.options.length >= caps.maxOptions) return block;
          if (caps.fixedOptions) return block;
          const index = block.options.length + 1;
          return normalizeOptions(block, [
            ...block.options,
            makeOption({ label: `Opción ${index}`, value: `opt${index}` }),
          ]);
        }),
      });

    case "updateOption":
      return commit(state, {
        content: mapBlock(state.content, action.blockId, (block) =>
          normalizeOptions(
            block,
            block.options.map((option) =>
              option.id === action.optionId ? { ...option, ...action.patch } : option,
            ),
          ),
        ),
      });

    case "removeOption":
      return commit(state, {
        content: mapBlock(state.content, action.blockId, (block) => {
          const caps = capabilitiesOf(block.type);
          if (caps.fixedOptions) return block;
          return normalizeOptions(
            block,
            block.options.filter((option) => option.id !== action.optionId),
          );
        }),
      });

    case "moveOption":
      return commit(state, {
        content: mapBlock(state.content, action.blockId, (block) => {
          const idx = block.options.findIndex((option) => option.id === action.optionId);
          const target = idx + action.dir;
          if (idx < 0 || target < 0 || target >= block.options.length) return block;
          const options = [...block.options];
          [options[idx], options[target]] = [options[target], options[idx]];
          return normalizeOptions(block, options);
        }),
      });

    case "setCorrectOption":
      return commit(state, {
        content: mapBlock(state.content, action.blockId, (block) => {
          const caps = capabilitiesOf(block.type);
          if (caps.exactlyOneCorrect) {
            // Impossible states are unreachable by construction: marking one
            // option correct unmarks the rest.
            return {
              ...block,
              options: block.options.map((option) => ({
                ...option,
                correct: option.id === action.optionId ? action.correct : false,
              })),
            };
          }
          return {
            ...block,
            options: block.options.map((option) =>
              option.id === action.optionId ? { ...option, correct: action.correct } : option,
            ),
          };
        }),
      });

    case "resetFixedOptions":
      return commit(state, {
        content: mapBlock(state.content, action.blockId, (block) => {
          const caps = capabilitiesOf(block.type);
          if (!caps.fixedOptions) return block;
          const previousCorrect = block.options.find((option) => option.correct)?.value ?? "";
          return normalizeOptions(
            block,
            caps.fixedOptions.map((fixed) =>
              makeOption({
                label: fixed.label,
                value: fixed.value,
                correct: fixed.value === previousCorrect,
              }),
            ),
          );
        }),
      });

    case "replaceContent":
      return commit(state, { content: assessmentContentSchema.parse(action.content) });

    case "undo": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        ...state,
        content: previous.content,
        meta: previous.meta,
        past: state.past.slice(0, -1),
        future: [{ content: state.content, meta: state.meta }, ...state.future].slice(0, HISTORY_LIMIT),
      };
    }

    case "redo": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        ...state,
        content: next.content,
        meta: next.meta,
        past: [...state.past, { content: state.content, meta: state.meta }].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
      };
    }

    default:
      return state;
  }
}

/** Find the currently selected block, if any. */
export function selectedBlock(state: BuilderState): AssessmentBlock | null {
  if (!state.selectedBlockId) return null;
  for (const s of state.content.sections) {
    const b = s.blocks.find((x) => x.id === state.selectedBlockId);
    if (b) return b;
  }
  return null;
}

/** The section that owns a block. */
export function sectionOfBlock(state: BuilderState, blockId: string): AssessmentSection | null {
  return state.content.sections.find((s) => s.blocks.some((b) => b.id === blockId)) ?? null;
}

/** Flat, ordered list of every block with its section and 1-based number. */
export interface FlatBlock {
  block: AssessmentBlock;
  section: AssessmentSection;
  /** 1-based number across the whole assessment, counting question blocks only. */
  number: number | null;
}

export function flattenBlocks(content: AssessmentContent): FlatBlock[] {
  const out: FlatBlock[] = [];
  let counter = 0;
  for (const section of content.sections) {
    for (const block of section.blocks) {
      const isQuestion = capabilitiesOf(block.type).control !== "content";
      if (isQuestion) counter += 1;
      out.push({ block, section, number: isQuestion ? counter : null });
    }
  }
  return out;
}
