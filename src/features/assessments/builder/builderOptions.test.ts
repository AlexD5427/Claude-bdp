import { describe, it, expect, beforeAll } from "vitest";
import { bootstrapPlugins } from "../question-types";
import { assessmentContentSchema } from "../domain/assessment";
import { builderReducer, defaultBuilderMeta, flattenBlocks, initBuilder, type BuilderState } from "./builderState";

beforeAll(() => bootstrapPlugins());

function withQuestion(type: string): { state: BuilderState; blockId: string; sectionId: string } {
  let state = initBuilder(assessmentContentSchema.parse({}), defaultBuilderMeta());
  state = builderReducer(state, { type: "addSection" });
  const sectionId = state.content.sections[0].id;
  state = builderReducer(state, { type: "addBlock", sectionId, blockType: type });
  const blockId = state.content.sections[0].blocks[0].id;
  return { state, blockId, sectionId };
}

function options(state: BuilderState) {
  return state.content.sections[0].blocks[0].options;
}

describe("reducer del constructor · metadatos", () => {
  it("edita el título y lo incluye en el historial de deshacer", () => {
    let { state } = withQuestion("q_short_text");
    state = builderReducer(state, { type: "updateMeta", patch: { name: "Prueba técnica" } });
    expect(state.meta.name).toBe("Prueba técnica");
    state = builderReducer(state, { type: "undo" });
    expect(state.meta.name).toBe("");
    state = builderReducer(state, { type: "redo" });
    expect(state.meta.name).toBe("Prueba técnica");
  });

  it("permite dejar la duración y la nota mínima sin valor", () => {
    let { state } = withQuestion("q_short_text");
    state = builderReducer(state, { type: "updateMeta", patch: { durationMinutes: 0, passingScore: null } });
    expect(state.meta.durationMinutes).toBe(0);
    expect(state.meta.passingScore).toBeNull();
  });
});

describe("reducer del constructor · opciones", () => {
  it("selecciona la pregunta recién agregada", () => {
    const { state, blockId } = withQuestion("q_single_choice");
    expect(state.selectedBlockId).toBe(blockId);
  });

  it("marcar una correcta desmarca las demás en respuesta única", () => {
    let { state, blockId } = withQuestion("q_single_choice");
    const [first, second] = options(state);
    state = builderReducer(state, { type: "setCorrectOption", blockId, optionId: first.id, correct: true });
    state = builderReducer(state, { type: "setCorrectOption", blockId, optionId: second.id, correct: true });
    expect(options(state).filter((option) => option.correct).map((option) => option.id)).toEqual([second.id]);
  });

  it("permite varias correctas en opción múltiple", () => {
    let { state, blockId } = withQuestion("q_multiple_choice");
    const [first, second] = options(state);
    state = builderReducer(state, { type: "setCorrectOption", blockId, optionId: first.id, correct: true });
    state = builderReducer(state, { type: "setCorrectOption", blockId, optionId: second.id, correct: true });
    expect(options(state).filter((option) => option.correct)).toHaveLength(2);
  });

  it("no permite agregar ni quitar opciones fijas en verdadero/falso", () => {
    let { state, blockId } = withQuestion("q_true_false");
    expect(options(state).map((option) => option.value)).toEqual(["true", "false"]);
    state = builderReducer(state, { type: "addOption", blockId });
    expect(options(state)).toHaveLength(2);
    state = builderReducer(state, { type: "removeOption", blockId, optionId: options(state)[0].id });
    expect(options(state)).toHaveLength(2);
  });

  it("restaura las opciones fijas conservando cuál era la correcta", () => {
    let { state, blockId } = withQuestion("q_true_false");
    state = builderReducer(state, {
      type: "setCorrectOption",
      blockId,
      optionId: options(state)[1].id,
      correct: true,
    });
    state = builderReducer(state, {
      type: "updateOption",
      blockId,
      optionId: options(state)[0].id,
      patch: { label: "Texto manipulado" },
    });
    state = builderReducer(state, { type: "resetFixedOptions", blockId });
    expect(options(state).map((option) => option.label)).toEqual(["Verdadero", "Falso"]);
    expect(options(state).find((option) => option.correct)?.value).toBe("false");
  });

  it("respeta el máximo de opciones del tipo", () => {
    let { state, blockId } = withQuestion("q_single_choice");
    for (let i = 0; i < 3; i++) state = builderReducer(state, { type: "addOption", blockId });
    expect(options(state)).toHaveLength(5);
  });

  it("reordena opciones y mantiene el orden estable en los extremos", () => {
    let { state, blockId } = withQuestion("q_single_choice");
    const [first, second] = options(state);
    state = builderReducer(state, { type: "moveOption", blockId, optionId: second.id, dir: -1 });
    expect(options(state)[0].id).toBe(second.id);
    state = builderReducer(state, { type: "moveOption", blockId, optionId: second.id, dir: -1 });
    expect(options(state)[0].id).toBe(second.id);
    expect(options(state)[1].id).toBe(first.id);
  });

  it("guarda la clave de emparejamiento de los tipos de orden", () => {
    let { state, blockId } = withQuestion("q_ordering");
    state = builderReducer(state, {
      type: "updateOption",
      blockId,
      optionId: options(state)[0].id,
      patch: { matchingKey: "1" },
    });
    expect(options(state)[0].matchingKey).toBe("1");
  });
});

describe("reducer del constructor · estructura", () => {
  it("duplicar una pregunta genera identificadores nuevos para el bloque Y sus opciones", () => {
    let { state, blockId } = withQuestion("q_single_choice");
    const originalOptionIds = options(state).map((option) => option.id);
    state = builderReducer(state, { type: "duplicateBlock", blockId });
    const blocks = state.content.sections[0].blocks;
    expect(blocks).toHaveLength(2);
    expect(blocks[1].id).not.toBe(blockId);
    for (const option of blocks[1].options) {
      expect(originalOptionIds).not.toContain(option.id);
    }
    // La copia queda seleccionada para seguir editándola.
    expect(state.selectedBlockId).toBe(blocks[1].id);
  });

  it("normaliza las posiciones al eliminar y al reordenar", () => {
    let state = initBuilder(assessmentContentSchema.parse({}), defaultBuilderMeta());
    state = builderReducer(state, { type: "addSection" });
    const sectionId = state.content.sections[0].id;
    for (const type of ["q_short_text", "q_integer", "q_date"]) {
      state = builderReducer(state, { type: "addBlock", sectionId, blockType: type });
    }
    const middle = state.content.sections[0].blocks[1].id;
    state = builderReducer(state, { type: "removeBlock", blockId: middle });
    expect(state.content.sections[0].blocks.map((block) => block.order)).toEqual([0, 1]);
    state = builderReducer(state, {
      type: "moveBlock",
      blockId: state.content.sections[0].blocks[1].id,
      dir: -1,
    });
    expect(state.content.sections[0].blocks.map((block) => block.order)).toEqual([0, 1]);
  });

  it("al eliminar la pregunta seleccionada la selección se limpia", () => {
    let { state, blockId } = withQuestion("q_short_text");
    state = builderReducer(state, { type: "removeBlock", blockId });
    expect(state.selectedBlockId).toBeNull();
  });

  it("cambiar de tipo conserva el enunciado y aplica las opciones del tipo nuevo", () => {
    let { state, blockId } = withQuestion("q_single_choice");
    state = builderReducer(state, { type: "updateBlock", blockId, patch: { label: "Mi enunciado" } });
    state = builderReducer(state, { type: "changeBlockType", blockId, blockType: "q_true_false" });
    const block = state.content.sections[0].blocks[0];
    expect(block.label).toBe("Mi enunciado");
    expect(block.type).toBe("q_true_false");
    expect(block.options.map((option) => option.value)).toEqual(["true", "false"]);
  });

  it("cambiar a un tipo sin opciones descarta las opciones anteriores", () => {
    let { state, blockId } = withQuestion("q_single_choice");
    state = builderReducer(state, { type: "changeBlockType", blockId, blockType: "q_long_text" });
    expect(state.content.sections[0].blocks[0].options).toEqual([]);
  });

  it("numera las preguntas de forma continua e ignora los bloques de contenido", () => {
    let state = initBuilder(assessmentContentSchema.parse({}), defaultBuilderMeta());
    state = builderReducer(state, { type: "addSection" });
    const sectionId = state.content.sections[0].id;
    state = builderReducer(state, { type: "addBlock", sectionId, blockType: "c_title" });
    state = builderReducer(state, { type: "addBlock", sectionId, blockType: "q_short_text" });
    state = builderReducer(state, { type: "addBlock", sectionId, blockType: "c_divider" });
    state = builderReducer(state, { type: "addBlock", sectionId, blockType: "q_integer" });
    expect(flattenBlocks(state.content).map((item) => item.number)).toEqual([null, 1, null, 2]);
  });

  it("mantiene el historial acotado y no pierde el documento", () => {
    let state = initBuilder(assessmentContentSchema.parse({}), defaultBuilderMeta());
    for (let i = 0; i < 80; i++) {
      state = builderReducer(state, { type: "updateMeta", patch: { name: `v${i}` } });
    }
    expect(state.past.length).toBeLessThanOrEqual(50);
    expect(state.meta.name).toBe("v79");
  });
});
