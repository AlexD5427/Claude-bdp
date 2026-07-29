import { describe, it, expect } from "vitest";
import {
  loadInitializedAppsScript,
  SHEETS_CELL_CHARACTER_LIMIT,
} from "../../../../scripts/run-apps-script.mjs";

/**
 * Regresión del fallo de producción del 28 de julio de 2026.
 *
 * `EVL-NUEV-DB21` («EVALUACIÓN - AUDITOR OPERATIVO») tiene 20 preguntas con 4
 * opciones cada una. El snapshot serializado de ese borrador ocupa unos 51 300
 * caracteres, y Google Sheets rechaza cualquier celda con más de 50 000. La
 * escritura de `Versions.snapshot_json` reventaba con un `Error` genérico de
 * Sheets que el enrutador traducía a INTERNAL_ERROR, de modo que:
 *
 *   · la fila de `Versions` quedaba a medio escribir (las 7 primeras columnas
 *     grabadas y las 8 últimas vacías, incluido `snapshot_json`);
 *   · `Assessments` no recibía el puntero ni los estados publicados;
 *   · `ProcessedRequests` no registraba nada, porque el fallo ocurre antes;
 *   · el portal seguía devolviendo NOT_FOUND, correctamente, para un borrador.
 *
 * Estas pruebas fijan el contrato: publicar una evaluación de este tamaño (y
 * bastante mayores) debe funcionar, y ninguna escritura debe dejar filas
 * parcialmente grabadas.
 */

interface Envelope {
  ok: boolean;
  data: unknown;
  error: { code: string; message: string; details: Record<string, unknown> } | null;
  warnings: string[];
}

interface Bundle {
  assessment: {
    assessmentId: string;
    publicCode: string;
    entityVersion: number;
    status: string;
    lifecycleStatus: string;
    publicationStatus: string;
    currentPublishedVersionId: string;
  };
  sections: { sectionId: string }[];
  versions: { versionId: string; versionLabel: string; state: string; questionCount: number }[];
}

type Harness = ReturnType<typeof loadInitializedAppsScript>;

/** Id con la forma exacta de un UUID v4, estable entre ejecuciones. */
function uuidShaped(seed: string, index: number): string {
  const hex = (seed.charCodeAt(0).toString(16) + index.toString(16).padStart(7, "0")).slice(0, 8);
  return `${hex}-3333-4333-8333-${String(index).padStart(12, "0")}`;
}

/** Texto de longitud fija, para que el tamaño del snapshot sea reproducible. */
function pad(prefix: string, length: number): string {
  let text = prefix;
  const filler = " texto representativo de la evaluacion de auditor operativo";
  while (text.length < length) text += filler;
  return text.slice(0, length);
}

/**
 * Crea y guarda un borrador con `questionCount` preguntas de opción única y
 * cuatro opciones cada una. Devuelve el arnés y el bundle ya guardado.
 */
function seedDraft(
  questionCount: number,
  { questionTextLength = 80, optionTextLength = 50 } = {},
): { harness: Harness; bundle: Bundle } {
  const harness = loadInitializedAppsScript();
  const actor = "reclutador@ejemplo.com";

  const created = harness.request("createAssessment", {
    title: "EVALUACIÓN - AUDITOR OPERATIVO (PLAZO FIJO)",
    category: "knowledge",
    actor,
  }) as Envelope;
  expect(created.ok).toBe(true);
  const draft = created.data as Bundle;
  const sectionId = draft.sections[0].sectionId;

  const questions = [];
  const options = [];
  for (let i = 0; i < questionCount; i += 1) {
    // Ids con la misma forma que los que genera el servidor (`qst_` + UUID):
    // su longitud pesa mucho en el tamaño del snapshot.
    const questionId = `qst_${uuidShaped("a", i)}`;
    questions.push({
      questionId,
      sectionId,
      questionType: "q_single_choice",
      questionText: pad(`P${i + 1}. Pregunta de auditoría número ${i + 1}:`, questionTextLength),
      position: i,
      required: true,
      scoringMode: "exact",
      maxPoints: 5,
      weight: 5,
      active: true,
    });
    for (let o = 0; o < 4; o += 1) {
      options.push({
        optionId: `opt_${uuidShaped("b", i * 4 + o)}`,
        questionId,
        optionText: pad(`Opción ${String.fromCharCode(65 + o)} de la pregunta ${i + 1}:`, optionTextLength),
        optionValue: String.fromCharCode(97 + o),
        position: o,
        isCorrect: o === 0,
        active: true,
      });
    }
  }

  const saved = harness.request("updateAssessment", {
    assessmentId: draft.assessment.assessmentId,
    expectedEntityVersion: draft.assessment.entityVersion,
    actor,
    assessment: {
      title: "EVALUACIÓN - AUDITOR OPERATIVO (PLAZO FIJO)",
      description: pad("Evaluación de conocimientos para auditor operativo.", 300),
      instructions: pad("Lea cada pregunta con atención y elija una respuesta.", 400),
      durationMinutes: 7,
      passingScore: 51,
      accessType: "public",
      category: "knowledge",
    },
    sections: [{ sectionId, title: "Conocimientos generales", position: 0, active: true }],
    questions,
    options,
  }) as Envelope;
  expect(saved.ok).toBe(true);

  return { harness, bundle: saved.data as Bundle };
}

/** Filas de una hoja como objetos, usando la fila 1 como encabezado. */
function readSheet(harness: Harness, name: string): Record<string, unknown>[] {
  const sheet = harness.spreadsheet.getSheetByName(name);
  if (!sheet) throw new Error(`La hoja ${name} no existe`);
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2) return [];
  const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  const headers = values[0].map((h: unknown) => String(h));
  return values.slice(1).map((row: unknown[]) => {
    const out: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      out[header] = row[index];
    });
    return out;
  });
}

describe("apps-script · tamaño del snapshot publicado", () => {
  it("el snapshot sin comprimir del caso real ya no cabía en una celda de Sheets", () => {
    // Deja constancia numérica de la causa raíz: el JSON plano se pasa del
    // límite, así que guardarlo tal cual era imposible por diseño.
    const { harness, bundle } = seedDraft(20);
    const plain = harness.call(
      "evalBuildSnapshotJson_",
      harness.call("evalLoadBundle_", harness.spreadsheet, bundle.assessment.assessmentId),
      1,
      0,
      "v1.0",
    ) as string;
    expect(plain.length).toBeGreaterThan(SHEETS_CELL_CHARACTER_LIMIT);
  });

  it("publica la evaluación de 20 preguntas que fallaba en producción", () => {
    const { harness, bundle } = seedDraft(20);

    const published = harness.request("publishAssessment", {
      assessmentId: bundle.assessment.assessmentId,
      expectedEntityVersion: bundle.assessment.entityVersion,
      actor: "reclutador@ejemplo.com",
    }) as Envelope;

    expect(published.error).toBeNull();
    expect(published.ok).toBe(true);

    const result = published.data as Bundle;
    expect(result.assessment.status).toBe("published");
    expect(result.assessment.lifecycleStatus).toBe("published");
    expect(result.assessment.publicationStatus).toBe("published");
    expect(result.assessment.currentPublishedVersionId).not.toBe("");

    // La fila de Versions queda COMPLETA: es lo que no ocurría antes.
    const versions = readSheet(harness, "Versions");
    expect(versions).toHaveLength(1);
    const version = versions[0];
    expect(String(version.snapshot_json)).not.toBe("");
    expect(String(version.snapshot_json).length).toBeLessThanOrEqual(SHEETS_CELL_CHARACTER_LIMIT);
    expect(Number(version.question_count)).toBe(20);
    expect(Number(version.gradable_question_count)).toBe(20);
    expect(String(version.checksum)).not.toBe("");
    expect(String(version.published_at)).not.toBe("");
    expect(String(version.published_by)).not.toBe("");
    expect(String(version.created_at)).not.toBe("");
    expect(String(version.snapshot_schema_version)).not.toBe("");

    // La escritura idempotente sí se registra cuando la publicación termina.
    expect(readSheet(harness, "ProcessedRequests").length).toBeGreaterThan(0);
  });

  it("el código público abre la versión publicada y sirve las 20 preguntas", () => {
    const { harness, bundle } = seedDraft(20);
    harness.request("publishAssessment", {
      assessmentId: bundle.assessment.assessmentId,
      expectedEntityVersion: bundle.assessment.entityVersion,
      actor: "reclutador@ejemplo.com",
    });

    const publicView = harness.request("getPublicAssessment", {
      publicCode: bundle.assessment.publicCode,
    }) as Envelope;

    expect(publicView.ok).toBe(true);
    const data = publicView.data as {
      title: string;
      questionCount: number;
      sections: { questions: { questionId: string }[] }[];
    };
    expect(data.questionCount).toBe(20);
    const served = data.sections.reduce((total, section) => total + section.questions.length, 0);
    expect(served).toBe(20);

    // Ninguna clave de calificación viaja al candidato.
    const serialized = JSON.stringify(publicView.data);
    for (const forbidden of ["isCorrect", "scoreValue", "matchingKey", "passingScore", "answerKey"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("publica evaluaciones muy por encima del caso que fallaba (100 y 250 preguntas)", () => {
    for (const questionCount of [100, 250]) {
      const { harness, bundle } = seedDraft(questionCount);
      const published = harness.request("publishAssessment", {
        assessmentId: bundle.assessment.assessmentId,
        expectedEntityVersion: bundle.assessment.entityVersion,
        actor: "reclutador@ejemplo.com",
      }) as Envelope;
      expect(published.error, `fallo con ${questionCount} preguntas`).toBeNull();
      expect(published.ok).toBe(true);

      const versions = readSheet(harness, "Versions");
      expect(Number(versions[0].question_count)).toBe(questionCount);
      expect(String(versions[0].snapshot_json).length).toBeLessThanOrEqual(SHEETS_CELL_CHARACTER_LIMIT);
    }
  });

  it("una escritura que no cabe en una celda falla con error tipado y sin dejar filas a medias", () => {
    // Guardarraíl genérico de SheetRepository: cualquier celda que se pase del
    // límite debe detenerse ANTES de tocar la hoja, con un error tipado. Sin
    // esto, Sheets escribía las primeras columnas y abortaba en la que sobraba,
    // que es justo la corrupción observada en `Versions` (7 columnas llenas y 8
    // vacías).
    const { harness } = seedDraft(1);
    const before = readSheet(harness, "Versions");

    let code = "";
    let details: Record<string, unknown> = {};
    try {
      harness.call("evalUpsertRows_", harness.spreadsheet, "Versions", "version_id", [
        {
          version_id: "ver_demasiado_largo",
          assessment_id: "asm_x",
          version: 1,
          version_minor: 0,
          version_label: "v1.0",
          state: "published",
          notes: "N".repeat(SHEETS_CELL_CHARACTER_LIMIT + 10),
        },
      ]);
    } catch (error) {
      code = String((error as { evalCode?: string }).evalCode ?? "");
      details = ((error as { evalDetails?: Record<string, unknown> }).evalDetails ?? {}) as Record<string, unknown>;
    }

    // Lo importante: ya NO es un Error genérico que acabe en INTERNAL_ERROR.
    expect(code).toBe("VALIDATION_ERROR");
    expect(details).toMatchObject({ sheet: "Versions", column: "notes" });

    // Y la hoja queda exactamente como estaba: ninguna fila a medio escribir.
    expect(readSheet(harness, "Versions")).toEqual(before);
  });
});
