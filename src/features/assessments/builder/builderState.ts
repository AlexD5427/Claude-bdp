/**
 * Builder state.
 *
 * The visual builder keeps several concerns explicitly separated (per the
 * brief): the assessment *document*, the current UI *selection*, an undo/redo
 * *history*, and derived *validation*. This is a plain reducer over an
 * immutable content object so React can re-render only what changed and history
 * is trivial (snapshots of content).
 *
 * Persistence, synchronization, preview, and publishing live outside this
 * reducer (in the service + module), keeping the builder pure and testable.
 */

import { newId } from "../../../shared/ids";
import { resolvePlugin } from "../question-types";
import type { AssessmentContent } from "../domain/assessment";
import type { AssessmentBlock, AssessmentSection } from "../domain/questions";

export interface BuilderState {
  content: AssessmentContent;
  selectedBlockId: string | null;
  selectedSectionId: string | null;
  past: AssessmentContent[];
  future: AssessmentContent[];
}

export type BuilderAction =
  | { type: "select"; blockId: string | null; sectionId: string | null }
  | { type: "addSection" }
  | { type: "removeSection"; sectionId: string }
  | { type: "updateSection"; sectionId: string; patch: Partial<AssessmentSection> }
  | { type: "moveSection"; sectionId: string; dir: -1 | 1 }
  | { type: "addBlock"; sectionId: string; blockType: string; atIndex?: number }
  | { type: "updateBlock"; blockId: string; patch: Partial<AssessmentBlock> }
  | { type: "removeBlock"; blockId: string }
  | { type: "duplicateBlock"; blockId: string }
  | { type: "moveBlock"; blockId: string; dir: -1 | 1 }
  | { type: "replaceContent"; content: AssessmentContent }
  | { type: "undo" }
  | { type: "redo" };

const HISTORY_LIMIT = 50;

export function initBuilder(content: AssessmentContent): BuilderState {
  return { content, selectedBlockId: null, selectedSectionId: null, past: [], future: [] };
}

/** Push a content change with history bookkeeping. */
function commit(state: BuilderState, content: AssessmentContent): BuilderState {
  return {
    ...state,
    content,
    past: [...state.past, state.content].slice(-HISTORY_LIMIT),
    future: [],
  };
}

function reorderBlocks(section: AssessmentSection): AssessmentSection {
  return { ...section, blocks: section.blocks.map((b, i) => ({ ...b, order: i })) };
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case "select":
      return { ...state, selectedBlockId: action.blockId, selectedSectionId: action.sectionId };

    case "addSection": {
      const section: AssessmentSection = {
        id: newId("sec"),
        title: `Sección ${state.content.sections.length + 1}`,
        description: "",
        order: state.content.sections.length,
        blocks: [],
        config: { timeLimitSeconds: null, randomizeBlocks: false, poolSize: null, weight: 1 },
      };
      return commit(state, { ...state.content, sections: [...state.content.sections, section] });
    }

    case "removeSection":
      return commit(state, {
        ...state.content,
        sections: state.content.sections.filter((s) => s.id !== action.sectionId).map((s, i) => ({ ...s, order: i })),
      });

    case "updateSection":
      return commit(state, {
        ...state.content,
        sections: state.content.sections.map((s) =>
          s.id === action.sectionId ? { ...s, ...action.patch } : s,
        ),
      });

    case "moveSection": {
      const idx = state.content.sections.findIndex((s) => s.id === action.sectionId);
      const target = idx + action.dir;
      if (idx < 0 || target < 0 || target >= state.content.sections.length) return state;
      const sections = [...state.content.sections];
      [sections[idx], sections[target]] = [sections[target], sections[idx]];
      return commit(state, { ...state.content, sections: sections.map((s, i) => ({ ...s, order: i })) });
    }

    case "addBlock": {
      const plugin = resolvePlugin(action.blockType);
      const block = plugin.createDefault(newId("blk"));
      return commit(state, {
        ...state.content,
        sections: state.content.sections.map((s) => {
          if (s.id !== action.sectionId) return s;
          const blocks = [...s.blocks];
          const at = action.atIndex ?? blocks.length;
          blocks.splice(at, 0, block);
          return reorderBlocks({ ...s, blocks });
        }),
      });
    }

    case "updateBlock":
      return commit(state, {
        ...state.content,
        sections: state.content.sections.map((s) => ({
          ...s,
          blocks: s.blocks.map((b) => (b.id === action.blockId ? { ...b, ...action.patch } : b)),
        })),
      });

    case "removeBlock":
      return commit(state, {
        ...state.content,
        sections: state.content.sections.map((s) => reorderBlocks({ ...s, blocks: s.blocks.filter((b) => b.id !== action.blockId) })),
      });

    case "duplicateBlock": {
      return commit(state, {
        ...state.content,
        sections: state.content.sections.map((s) => {
          const idx = s.blocks.findIndex((b) => b.id === action.blockId);
          if (idx < 0) return s;
          const copy = { ...structuredClone(s.blocks[idx]), id: newId("blk") };
          const blocks = [...s.blocks];
          blocks.splice(idx + 1, 0, copy);
          return reorderBlocks({ ...s, blocks });
        }),
      });
    }

    case "moveBlock": {
      return commit(state, {
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
      });
    }

    case "replaceContent":
      return commit(state, action.content);

    case "undo": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        ...state,
        content: previous,
        past: state.past.slice(0, -1),
        future: [state.content, ...state.future].slice(0, HISTORY_LIMIT),
      };
    }

    case "redo": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        ...state,
        content: next,
        past: [...state.past, state.content].slice(-HISTORY_LIMIT),
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
