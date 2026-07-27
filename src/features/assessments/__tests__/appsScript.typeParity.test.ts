import { describe, it, expect, beforeAll } from "vitest";
import { loadAppsScript } from "../../../../scripts/run-apps-script.mjs";
import { bootstrapPlugins, allPlugins } from "../question-types";
import { advancedContracts } from "../question-types/advancedContracts";
import { contentPlugins } from "../question-types/contentPlugins";
import { answerPlugins } from "../question-types/answerPlugins";

/**
 * Paridad entre el registro de tipos del frontend y el catálogo del servidor.
 *
 * El requisito «centraliza las capacidades para que agregar un tipo futuro no
 * exija modificar numerosos archivos» tiene una trampa: quedan DOS catálogos, uno
 * por lado. Esta prueba es lo que impide que se desincronicen. Si alguien agrega
 * un tipo solo en el frontend, el servidor lo rechazaría en tiempo de ejecución
 * con UNKNOWN_QUESTION_TYPE; aquí falla antes, en CI.
 */

interface ServerSpec {
  kind: "content" | "question";
  grading: "none" | "auto" | "manual" | "auto_if_configured";
  optionBased?: boolean;
  minOptions?: number;
  maxOptions?: number;
  exactlyOneCorrect?: boolean;
  multiSelect?: boolean;
  fixedOptions?: { value: string; text: string }[];
  expects?: "number" | "text" | "ordering" | "matching";
}

let serverTypes: Record<string, ServerSpec>;

beforeAll(() => {
  bootstrapPlugins();
  serverTypes = loadAppsScript().read("EVAL_QUESTION_TYPES") as Record<string, ServerSpec>;
});

/** Todos los tipos que el frontend puede llegar a registrar, incluidos los flags. */
function everyFrontendType(): string[] {
  return [
    ...contentPlugins.map((plugin) => plugin.type),
    ...answerPlugins.map((plugin) => plugin.type),
    ...advancedContracts.map((entry) => entry.plugin.type),
  ];
}

describe("paridad de tipos de pregunta frontend ↔ Apps Script", () => {
  it("el servidor conoce todos los tipos del frontend, incluidos los de bandera", () => {
    const missing = everyFrontendType().filter((type) => serverTypes[type] === undefined);
    expect(missing).toEqual([]);
  });

  it("el frontend conoce todos los tipos del servidor", () => {
    const known = new Set(everyFrontendType());
    const extra = Object.keys(serverTypes).filter((type) => !known.has(type));
    expect(extra).toEqual([]);
  });

  it("la estrategia de calificación coincide en ambos lados", () => {
    const mismatches: string[] = [];
    for (const plugin of [...contentPlugins, ...answerPlugins, ...advancedContracts.map((e) => e.plugin)]) {
      const server = serverTypes[plugin.type];
      if (!server) continue;
      if (server.grading !== plugin.capabilities.grading) {
        mismatches.push(`${plugin.type}: servidor=${server.grading} frontend=${plugin.capabilities.grading}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("las reglas de opciones coinciden en ambos lados", () => {
    const mismatches: string[] = [];
    for (const plugin of [...contentPlugins, ...answerPlugins, ...advancedContracts.map((e) => e.plugin)]) {
      const server = serverTypes[plugin.type];
      if (!server) continue;
      const caps = plugin.capabilities;
      if (!!server.optionBased !== caps.options) {
        mismatches.push(`${plugin.type}: optionBased`);
      }
      if (caps.options && (server.minOptions ?? 0) !== caps.minOptions) {
        mismatches.push(`${plugin.type}: minOptions ${server.minOptions} ≠ ${caps.minOptions}`);
      }
      if (caps.maxOptions !== null && server.maxOptions !== caps.maxOptions) {
        mismatches.push(`${plugin.type}: maxOptions`);
      }
      if (!!server.exactlyOneCorrect !== caps.exactlyOneCorrect) {
        mismatches.push(`${plugin.type}: exactlyOneCorrect`);
      }
      if (!!server.fixedOptions !== (caps.fixedOptions !== null)) {
        mismatches.push(`${plugin.type}: fixedOptions`);
      }
      if (server.expects !== caps.expects) {
        mismatches.push(`${plugin.type}: expects ${server.expects} ≠ ${caps.expects}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("el tipo de bloque (contenido o pregunta) coincide", () => {
    const mismatches: string[] = [];
    for (const plugin of [...contentPlugins, ...answerPlugins, ...advancedContracts.map((e) => e.plugin)]) {
      const server = serverTypes[plugin.type];
      if (!server) continue;
      const serverIsQuestion = server.kind === "question";
      if (serverIsQuestion !== plugin.isQuestion) mismatches.push(plugin.type);
    }
    expect(mismatches).toEqual([]);
  });

  it("todo plugin registrado declara sus capacidades", () => {
    for (const plugin of allPlugins()) {
      expect(plugin.capabilities, plugin.type).toBeDefined();
      expect(typeof plugin.capabilities.options).toBe("boolean");
      expect(plugin.capabilities.control).toBeTruthy();
    }
  });

  it("los tipos con opciones exigen al menos dos y los fijos declaran sus valores", () => {
    for (const plugin of answerPlugins) {
      const caps = plugin.capabilities;
      if (!caps.options) continue;
      expect(caps.minOptions, plugin.type).toBeGreaterThanOrEqual(2);
      if (caps.fixedOptions) {
        expect(caps.fixedOptions.length, plugin.type).toBeGreaterThanOrEqual(2);
        expect(caps.maxOptions, plugin.type).toBe(caps.fixedOptions.length);
      }
    }
  });

  it("QUESTION_TYPES.md documenta cada tipo del registro", async () => {
    const { readFileSync } = await import("node:fs");
    const doc = readFileSync("docs/evaluations/QUESTION_TYPES.md", "utf8");
    const missing = everyFrontendType().filter((type) => !doc.includes(`\`${type}\``));
    expect(missing).toEqual([]);
  });
});
