import { describe, it, expect, beforeAll } from "vitest";
import { assessmentContentSchema } from "../domain/assessment";
import { builderReducer, initBuilder, selectedBlock } from "./builderState";
import { bootstrapPlugins } from "../question-types";

beforeAll(() => bootstrapPlugins());

function empty() {
  return initBuilder(assessmentContentSchema.parse({}));
}

describe("builder reducer", () => {
  it("adds sections and blocks", () => {
    let s = empty();
    s = builderReducer(s, { type: "addSection" });
    const sectionId = s.content.sections[0].id;
    s = builderReducer(s, { type: "addBlock", sectionId, blockType: "q_single_choice" });
    expect(s.content.sections[0].blocks).toHaveLength(1);
    expect(s.content.sections[0].blocks[0].type).toBe("q_single_choice");
  });

  it("keeps block order contiguous after removal", () => {
    let s = empty();
    s = builderReducer(s, { type: "addSection" });
    const sectionId = s.content.sections[0].id;
    s = builderReducer(s, { type: "addBlock", sectionId, blockType: "q_short_text" });
    s = builderReducer(s, { type: "addBlock", sectionId, blockType: "q_integer" });
    s = builderReducer(s, { type: "addBlock", sectionId, blockType: "q_date" });
    const middle = s.content.sections[0].blocks[1].id;
    s = builderReducer(s, { type: "removeBlock", blockId: middle });
    expect(s.content.sections[0].blocks.map((b) => b.order)).toEqual([0, 1]);
  });

  it("duplicates a block right after the original with a new id", () => {
    let s = empty();
    s = builderReducer(s, { type: "addSection" });
    const sectionId = s.content.sections[0].id;
    s = builderReducer(s, { type: "addBlock", sectionId, blockType: "q_short_text" });
    const id = s.content.sections[0].blocks[0].id;
    s = builderReducer(s, { type: "duplicateBlock", blockId: id });
    expect(s.content.sections[0].blocks).toHaveLength(2);
    expect(s.content.sections[0].blocks[1].id).not.toBe(id);
  });

  it("moves a block up and down", () => {
    let s = empty();
    s = builderReducer(s, { type: "addSection" });
    const sectionId = s.content.sections[0].id;
    s = builderReducer(s, { type: "addBlock", sectionId, blockType: "q_short_text" });
    s = builderReducer(s, { type: "addBlock", sectionId, blockType: "q_integer" });
    const second = s.content.sections[0].blocks[1].id;
    s = builderReducer(s, { type: "moveBlock", blockId: second, dir: -1 });
    expect(s.content.sections[0].blocks[0].id).toBe(second);
  });

  it("supports undo and redo", () => {
    let s = empty();
    s = builderReducer(s, { type: "addSection" });
    s = builderReducer(s, { type: "addSection" });
    expect(s.content.sections).toHaveLength(2);
    s = builderReducer(s, { type: "undo" });
    expect(s.content.sections).toHaveLength(1);
    s = builderReducer(s, { type: "redo" });
    expect(s.content.sections).toHaveLength(2);
  });

  it("tracks the selected block", () => {
    let s = empty();
    s = builderReducer(s, { type: "addSection" });
    const sectionId = s.content.sections[0].id;
    s = builderReducer(s, { type: "addBlock", sectionId, blockType: "q_short_text" });
    const id = s.content.sections[0].blocks[0].id;
    s = builderReducer(s, { type: "select", blockId: id, sectionId });
    expect(selectedBlock(s)?.id).toBe(id);
  });
});
