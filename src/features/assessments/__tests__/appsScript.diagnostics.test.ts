import { describe, it, expect } from "vitest";
import { loadInitializedAppsScript } from "../../../../scripts/run-apps-script.mjs";

/**
 * Diagnóstico del libro y reparación no destructiva.
 *
 * Estas pruebas reconstruyen el estado exportado en `EVALUACIONES BDP.xlsx` (una
 * evaluación en borrador y tres filas de `Versions` que dicen `published` pero no
 * tienen snapshot) y comprueban que la herramienta explica exactamente por qué
 * el portal responde NOT_FOUND, sin que nadie tenga que leer nueve hojas a mano.
 */

interface Envelope {
  ok: boolean;
  data: unknown;
  error: { code: string } | null;
}

interface Bundle {
  assessment: { assessmentId: string; publicCode: string; entityVersion: number };
  sections: { sectionId: string }[];
}

interface Diagnosis {
  schema: { ok: boolean };
  assessments: {
    publicCode: string;
    publiclyServable: boolean;
    reason: string;
    activeQuestions: number;
    sections: number;
    activeSections: number;
  }[];
  invalidVersions: {
    versionId: string;
    versionLabel: string;
    state: string;
    pointedTo: boolean;
    problems: string[];
  }[];
  questionCorrectnessIssues: { questionType: string; correctOptions: number; expected: string }[];
  scoringContradictions: { kind: string; detail: string }[];
  recommendations: string[];
}

type Harness = ReturnType<typeof loadInitializedAppsScript>;

/** Reproduce el libro auditado: borrador de 20 preguntas + 3 versiones inválidas. */
function seedAuditedBook(): { harness: Harness; bundle: Bundle } {
  const harness = loadInitializedAppsScript();
  const actor = "reclutador@ejemplo.com";
  const created = harness.request("createAssessment", {
    title: "EVALUACIÓN - AUDITOR OPERATIVO (PLAZO FIJO)",
    category: "knowledge",
    actor,
  }) as Envelope;
  const draft = created.data as Bundle;
  const sectionId = draft.sections[0].sectionId;

  const questions = [];
  const options = [];
  for (let i = 0; i < 20; i += 1) {
    const questionId = `qst_diag${String(i).padStart(4, "0")}`;
    // La última es de selección múltiple con dos correctas, como en el libro real.
    const multiple = i === 19;
    questions.push({
      questionId,
      sectionId,
      questionType: multiple ? "q_multiple_choice" : "q_single_choice",
      questionText: `Pregunta ${i + 1} de auditoría operativa`,
      position: i,
      required: true,
      scoringMode: "exact",
      maxPoints: 5,
      weight: 5,
      active: true,
    });
    for (let o = 0; o < 4; o += 1) {
      options.push({
        optionId: `opt_diag${String(i).padStart(4, "0")}_${o}`,
        questionId,
        optionText: `Opción ${String.fromCharCode(65 + o)}`,
        optionValue: String.fromCharCode(97 + o),
        position: o,
        isCorrect: multiple ? o < 2 : o === 0,
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
      instructions: "Lea con atención.",
      durationMinutes: 7,
      passingScore: 51,
      accessType: "public",
      category: "knowledge",
      // El libro real declara una política de puntuación que el motor no lee.
      policies: { scoring: { mode: "none" } },
    },
    sections: [{ sectionId, title: "Conocimientos generales", position: 0, active: true }],
    questions,
    options,
  }) as Envelope;
  expect(saved.ok).toBe(true);
  const bundle = saved.data as Bundle;

  // El libro real tiene DOS filas de sección con el mismo título y la misma
  // posición: una dada de baja y otra activa. Publicar debe seguir funcionando,
  // porque la validación de posiciones consecutivas solo mira las activas.
  harness.call("evalUpsertRows_", harness.spreadsheet, "Sections", "section_id", [
    {
      section_id: "sec_duplicada_inactiva",
      assessment_id: bundle.assessment.assessmentId,
      title: "Conocimientos generales",
      description: "",
      position: 0,
      time_limit_seconds: "",
      randomize: "FALSE",
      pool_size: "",
      weight: 1,
      active: "FALSE",
      created_at: "2026-07-28T19:00:00.000Z",
      updated_at: "2026-07-28T19:00:00.000Z",
    },
  ]);

  // Tres filas de Versions con state='published' y sin snapshot, tal como las
  // dejaron los tres intentos de publicación que fallaron el 28 de julio.
  harness.call(
    "evalUpsertRows_",
    harness.spreadsheet,
    "Versions",
    "version_id",
    [1, 2, 3].map((n) => ({
      version_id: `ver_residual_${n}`,
      assessment_id: bundle.assessment.assessmentId,
      version: n,
      version_minor: 0,
      version_label: `v${n}.0`,
      state: "published",
      notes: "",
      snapshot_json: "",
      snapshot_schema_version: "",
      question_count: "",
      gradable_question_count: "",
      checksum: "",
      published_at: "",
      published_by: "",
      created_at: "",
    })),
  );

  return { harness, bundle };
}

describe("apps-script · diagnóstico del libro", () => {
  it("explica por qué el portal responde NOT_FOUND para un borrador", () => {
    const { harness, bundle } = seedAuditedBook();
    const diagnosis = harness.call("evalDiagnose_", harness.spreadsheet) as Diagnosis;

    expect(diagnosis.schema.ok).toBe(true);
    expect(diagnosis.assessments).toHaveLength(1);
    const item = diagnosis.assessments[0];
    expect(item.publicCode).toBe(bundle.assessment.publicCode);
    expect(item.publiclyServable).toBe(false);
    expect(item.reason).toContain('status="draft"');
    expect(item.activeQuestions).toBe(20);
    // Hay dos filas de sección, pero solo una activa: la duplicada dada de baja
    // se conserva en la hoja y no cuenta.
    expect(item.sections).toBe(2);
    expect(item.activeSections).toBe(1);
  });

  it("señala las tres versiones sin snapshot sin proponer borrarlas", () => {
    const { harness } = seedAuditedBook();
    const diagnosis = harness.call("evalDiagnose_", harness.spreadsheet) as Diagnosis;

    expect(diagnosis.invalidVersions).toHaveLength(3);
    for (const bad of diagnosis.invalidVersions) {
      expect(bad.state).toBe("published");
      expect(bad.pointedTo).toBe(false);
      expect(bad.problems).toContain("snapshot_json vacío");
    }
    const advice = diagnosis.recommendations.join(" ");
    expect(advice).toContain("No se deben borrar");
  });

  it("avisa de que policies_json.scoring no lo lee el motor de calificación", () => {
    const { harness } = seedAuditedBook();
    const diagnosis = harness.call("evalDiagnose_", harness.spreadsheet) as Diagnosis;
    const policy = diagnosis.scoringContradictions.find((c) => c.kind === "POLICY_IGNORED");
    expect(policy).toBeDefined();
    expect(policy?.detail).toContain("no se lee");
  });

  it("no marca como defecto una pregunta múltiple con dos opciones correctas", () => {
    const { harness } = seedAuditedBook();
    const diagnosis = harness.call("evalDiagnose_", harness.spreadsheet) as Diagnosis;
    // 19 de opción única con una correcta y una múltiple con dos: todo válido.
    expect(diagnosis.questionCorrectnessIssues).toHaveLength(0);
  });

  it("detecta una pregunta de opción única con dos correctas", () => {
    const { harness, bundle } = seedAuditedBook();
    const rows = harness.call("evalReadAll_", harness.spreadsheet, "Options") as Record<string, unknown>[];
    const target = rows.find(
      (row) => String(row.question_id) === "qst_diag0000" && String(row.position) === "1",
    );
    harness.call("evalUpsertRows_", harness.spreadsheet, "Options", "option_id", [
      { ...target, is_correct: "TRUE" },
    ]);

    const diagnosis = harness.call("evalDiagnose_", harness.spreadsheet) as Diagnosis;
    const issue = diagnosis.questionCorrectnessIssues.find((i) => i.questionType === "q_single_choice");
    expect(issue).toBeDefined();
    expect(issue?.correctOptions).toBe(2);
    expect(issue?.expected).toBe("exactamente una");
    expect(bundle.assessment.publicCode).toBeTruthy();
  });

  it("la reparación es seca por omisión y no toca la hoja", () => {
    const { harness } = seedAuditedBook();
    const before = harness.call("evalReadAll_", harness.spreadsheet, "Versions") as Record<string, unknown>[];

    const dry = harness.call("repararEvaluaciones") as { dryRun: boolean; plan: unknown[]; applied: number };
    expect(dry.dryRun).toBe(true);
    expect(dry.plan).toHaveLength(3);
    expect(dry.applied).toBe(0);

    const after = harness.call("evalReadAll_", harness.spreadsheet, "Versions") as Record<string, unknown>[];
    expect(after).toEqual(before);
  });

  it("al aplicarla marca las versiones como superseded sin borrar ni vaciar nada", () => {
    const { harness } = seedAuditedBook();
    const applied = harness.call("repararEvaluaciones", { dryRun: false }) as { applied: number };
    expect(applied.applied).toBe(3);

    const rows = harness.call("evalReadAll_", harness.spreadsheet, "Versions") as Record<string, unknown>[];
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(String(row.state)).toBe("superseded");
      // Las filas siguen ahí, con sus identificadores intactos.
      expect(String(row.version_id)).toMatch(/^ver_residual_/);
      expect(String(row.version_label)).toMatch(/^v[123]\.0$/);
    }
  });

  it("tras publicar de verdad, el diagnóstico da la evaluación por servible", () => {
    const { harness, bundle } = seedAuditedBook();
    const fresh = harness.request("getAdminAssessment", {
      assessmentId: bundle.assessment.assessmentId,
    }) as Envelope;
    const entityVersion = (fresh.data as Bundle).assessment.entityVersion;

    const published = harness.request("publishAssessment", {
      assessmentId: bundle.assessment.assessmentId,
      expectedEntityVersion: entityVersion,
      actor: "reclutador@ejemplo.com",
    }) as Envelope;
    expect(published.error).toBeNull();

    const diagnosis = harness.call("evalDiagnose_", harness.spreadsheet) as Diagnosis;
    expect(diagnosis.assessments[0].publiclyServable).toBe(true);
    expect(diagnosis.assessments[0].reason).toBe("");

    // Las tres residuales se conservan; la nueva versión es válida y apuntada.
    const stillInvalid = diagnosis.invalidVersions.filter((v) => v.versionId.startsWith("ver_residual_"));
    expect(stillInvalid).toHaveLength(3);
    for (const bad of stillInvalid) expect(bad.pointedTo).toBe(false);
  });
});
