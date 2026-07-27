/**
 * Lista de comprobación de publicación.
 *
 * Produce **hallazgos navegables**: cada uno sabe a qué sección de la interfaz,
 * a qué pregunta y a qué campo hay que llevar al usuario para corregirlo. El
 * panel de revisión los agrupa por severidad y los convierte en accesos directos.
 *
 * Estas reglas son el espejo de `evalValidatePublish_` en
 * `apps-script/evaluations/Validation.gs`. **Apps Script es la autoridad**: si
 * ambos discrepan, gana el servidor y su respuesta se muestra en el mismo panel
 * (los códigos coinciden a propósito).
 *
 * Un borrador PUEDE estar incompleto: estas reglas solo bloquean la publicación.
 */

import type { AssessmentContent, AssessmentDefinition } from "./assessment";
import type { AssessmentBlock, AssessmentSection } from "./questions";
import { capabilitiesOf, getPlugin, isAutoGradable, requiresManualReview } from "../question-types/registry";

export type FindingSeverity = "error" | "warning" | "info";

/** Zona de la interfaz a la que pertenece un hallazgo. */
export type FindingArea = "general" | "questions" | "settings";

export interface FindingTarget {
  area: FindingArea;
  sectionId?: string;
  questionId?: string;
  optionId?: string;
  /** Nombre del campo que debe recibir el foco. */
  field?: string;
}

export interface PublishFinding {
  id: string;
  severity: FindingSeverity;
  /** Código estable, compartido con el backend. */
  code: string;
  message: string;
  /** Cómo corregirlo, en una frase. */
  hint: string;
  target: FindingTarget;
}

export interface PublishChecklist {
  findings: PublishFinding[];
  errors: PublishFinding[];
  warnings: PublishFinding[];
  info: PublishFinding[];
  canPublish: boolean;
  /** Preguntas activas (bloques cuyo plugin recoge una respuesta). */
  questionCount: number;
  validQuestions: number;
  incompleteQuestions: number;
  /** Preguntas que el servidor podrá calificar automáticamente. */
  autoGradableQuestions: number;
  /** Preguntas que necesitarán revisión humana. */
  manualReviewQuestions: number;
  /** Tipos de pregunta utilizados, con su conteo. */
  typeUsage: { type: string; label: string; count: number }[];
  /** Progreso de configuración 0..100 (título, instrucciones, preguntas, validez). */
  completeness: number;
}

let sequence = 0;
function finding(
  severity: FindingSeverity,
  code: string,
  message: string,
  hint: string,
  target: FindingTarget,
): PublishFinding {
  sequence += 1;
  return { id: `${code}-${sequence}`, severity, code, message, hint, target };
}

function isQuestionBlock(block: AssessmentBlock): boolean {
  return capabilitiesOf(block.type).control !== "content";
}

function checkPositions(values: number[]): boolean {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted.every((value, index) => value === index);
}

/** Recorre secciones y bloques generando los hallazgos de una pregunta. */
function checkQuestion(
  section: AssessmentSection,
  block: AssessmentBlock,
  seenCodes: Set<string>,
  out: PublishFinding[],
): boolean {
  const caps = capabilitiesOf(block.type);
  const known = getPlugin(block.type) !== undefined;
  let valid = true;

  if (!known) {
    out.push(
      finding(
        "error",
        "UNKNOWN_QUESTION_TYPE",
        `El tipo de pregunta "${block.type}" no está disponible en esta instalación.`,
        "Cambia el tipo de la pregunta o habilita la bandera que registra ese tipo.",
        { area: "questions", sectionId: section.id, questionId: block.id, field: "type" },
      ),
    );
    return false;
  }

  if (!block.label.trim()) {
    out.push(
      finding(
        "error",
        "MISSING_QUESTION_TEXT",
        "Hay una pregunta sin enunciado.",
        "Escribe el enunciado en el campo «Enunciado».",
        { area: "questions", sectionId: section.id, questionId: block.id, field: "label" },
      ),
    );
    valid = false;
  }

  if (block.code) {
    if (seenCodes.has(block.code)) {
      out.push(
        finding(
          "error",
          "DUPLICATE_QUESTION_CODE",
          `El código de pregunta "${block.code}" está repetido.`,
          "Los códigos deben ser únicos dentro de la evaluación.",
          { area: "questions", sectionId: section.id, questionId: block.id, field: "code" },
        ),
      );
      valid = false;
    }
    seenCodes.add(block.code);
  }

  const scored =
    block.score.mode !== "none" && block.score.mode !== "manual" && block.score.mode !== "rubric";

  if (caps.options) {
    const options = block.options;
    if (options.length < caps.minOptions) {
      out.push(
        finding(
          "error",
          "NOT_ENOUGH_OPTIONS",
          `La pregunta necesita al menos ${caps.minOptions} opciones.`,
          "Agrega opciones con el botón «Agregar opción».",
          { area: "questions", sectionId: section.id, questionId: block.id, field: "options" },
        ),
      );
      valid = false;
    }
    if (caps.maxOptions !== null && options.length > caps.maxOptions) {
      out.push(
        finding(
          "error",
          "TOO_MANY_OPTIONS",
          `La pregunta admite como máximo ${caps.maxOptions} opciones.`,
          "Elimina las opciones sobrantes.",
          { area: "questions", sectionId: section.id, questionId: block.id, field: "options" },
        ),
      );
      valid = false;
    }
    for (const option of options) {
      if (!option.label.trim()) {
        out.push(
          finding(
            "error",
            "MISSING_OPTION_TEXT",
            "Hay una opción sin texto.",
            "Escribe el texto de la opción o elimínala.",
            {
              area: "questions",
              sectionId: section.id,
              questionId: block.id,
              optionId: option.id,
              field: "options",
            },
          ),
        );
        valid = false;
      }
    }
    if (!checkPositions(options.map((_, index) => index))) {
      // Las posiciones se normalizan al editar; este caso solo puede venir de
      // datos importados.
      out.push(
        finding(
          "error",
          "NON_CONSECUTIVE_OPTION_POSITIONS",
          "Las posiciones de las opciones no son consecutivas.",
          "Reordena las opciones para normalizar sus posiciones.",
          { area: "questions", sectionId: section.id, questionId: block.id, field: "options" },
        ),
      );
      valid = false;
    }
    const correctCount = options.filter((option) => option.correct).length;
    if (scored && caps.exactlyOneCorrect && correctCount !== 1) {
      out.push(
        finding(
          "error",
          correctCount === 0 ? "NO_CORRECT_OPTION" : "MULTIPLE_CORRECT_OPTIONS",
          correctCount === 0
            ? "La pregunta no tiene una respuesta correcta marcada."
            : "La pregunta tiene más de una respuesta correcta y solo admite una.",
          "Marca exactamente una opción como correcta.",
          { area: "questions", sectionId: section.id, questionId: block.id, field: "options" },
        ),
      );
      valid = false;
    }
    if (scored && !caps.exactlyOneCorrect && correctCount === 0) {
      out.push(
        finding(
          "error",
          "NO_CORRECT_OPTION",
          "La pregunta no tiene ninguna respuesta correcta marcada.",
          "Marca al menos una opción como correcta.",
          { area: "questions", sectionId: section.id, questionId: block.id, field: "options" },
        ),
      );
      valid = false;
    }
    if (caps.fixedOptions) {
      const expected = caps.fixedOptions.map((option) => option.value).sort().join("|");
      const actual = options.map((option) => option.value.toLowerCase()).sort().join("|");
      if (expected !== actual) {
        out.push(
          finding(
            "error",
            "INVALID_FIXED_OPTIONS",
            `Las opciones de este tipo deben ser exactamente: ${caps.fixedOptions
              .map((option) => option.label)
              .join(" / ")}.`,
            "Restaura las opciones predeterminadas del tipo.",
            { area: "questions", sectionId: section.id, questionId: block.id, field: "options" },
          ),
        );
        valid = false;
      }
    }
  } else if (block.options.length > 0) {
    out.push(
      finding(
        "error",
        "UNEXPECTED_OPTIONS",
        "Este tipo de pregunta no admite opciones.",
        "Elimina las opciones o cambia el tipo de pregunta.",
        { area: "questions", sectionId: section.id, questionId: block.id, field: "options" },
      ),
    );
    valid = false;
  }

  if (block.media && block.media.url && !block.media.alt.trim()) {
    out.push(
      finding(
        "warning",
        "MISSING_MEDIA_ALT",
        "Hay contenido multimedia sin descripción alternativa.",
        "Escribe una descripción para lectores de pantalla.",
        { area: "questions", sectionId: section.id, questionId: block.id, field: "mediaAlt" },
      ),
    );
  }

  if (block.score.mode !== "none" && !isAutoGradable(block) && requiresManualReview(block)) {
    out.push(
      finding(
        "info",
        "MANUAL_REVIEW_REQUIRED",
        "Esta pregunta la calificará una persona.",
        "El resultado del intento quedará pendiente hasta la revisión manual.",
        { area: "questions", sectionId: section.id, questionId: block.id, field: "score" },
      ),
    );
  }

  return valid;
}

/**
 * Evalúa una evaluación completa contra las reglas de publicación.
 *
 * `definition` aporta título, duración y nota mínima; `content` es el contenido
 * en edición (que puede diferir del guardado).
 */
export function buildPublishChecklist(
  definition: Pick<
    AssessmentDefinition,
    "name" | "estimatedDurationMinutes" | "scoringPolicy" | "lifecycle" | "draftVersion"
  >,
  content: AssessmentContent,
): PublishChecklist {
  sequence = 0;
  const findings: PublishFinding[] = [];

  if (!definition.name.trim() || definition.name.trim() === "Nueva evaluación") {
    findings.push(
      finding(
        "error",
        "MISSING_TITLE",
        "La evaluación necesita un título propio antes de publicarse.",
        "Escribe el título en «Configuración general».",
        { area: "general", field: "name" },
      ),
    );
  }

  const duration = definition.estimatedDurationMinutes;
  if (duration !== 0 && !(duration > 0)) {
    findings.push(
      finding(
        "error",
        "INVALID_DURATION",
        "La duración debe quedar vacía o ser mayor que cero.",
        "Deja el campo vacío para no limitar el tiempo.",
        { area: "settings", field: "durationMinutes" },
      ),
    );
  }

  const passing = definition.scoringPolicy.passThreshold;
  if (passing !== null && (passing < 0 || passing > 100)) {
    findings.push(
      finding(
        "error",
        "INVALID_PASSING_SCORE",
        "La nota mínima debe estar entre 0 y 100.",
        "Corrige el valor o déjalo vacío.",
        { area: "settings", field: "passingScore" },
      ),
    );
  }

  if (definition.lifecycle === "archived") {
    findings.push(
      finding(
        "error",
        "INVALID_STATUS",
        "Una evaluación archivada no puede publicarse.",
        "Restaura la evaluación antes de publicarla.",
        { area: "general", field: "status" },
      ),
    );
  }

  if (!(definition.draftVersion.major >= 1)) {
    findings.push(
      finding(
        "error",
        "INVALID_VERSION",
        "La versión de la evaluación no es válida.",
        "Vuelve a cargar la evaluación desde el listado.",
        { area: "general", field: "version" },
      ),
    );
  }

  if (!checkPositions(content.sections.map((_, index) => index))) {
    findings.push(
      finding(
        "error",
        "NON_CONSECUTIVE_SECTION_POSITIONS",
        "Las posiciones de las secciones no son consecutivas.",
        "Reordena las secciones.",
        { area: "questions" },
      ),
    );
  }

  const seenSectionIds = new Set<string>();
  const seenQuestionIds = new Set<string>();
  const seenOptionIds = new Set<string>();
  const seenCodes = new Set<string>();
  const typeUsage = new Map<string, number>();

  let questionCount = 0;
  let validQuestions = 0;
  let autoGradable = 0;
  let manualReview = 0;

  for (const section of content.sections) {
    if (seenSectionIds.has(section.id)) {
      findings.push(
        finding(
          "error",
          "DUPLICATE_SECTION_ID",
          "Hay dos secciones con el mismo identificador.",
          "Duplica la sección de nuevo o elimina una de las dos.",
          { area: "questions", sectionId: section.id },
        ),
      );
    }
    seenSectionIds.add(section.id);

    const questions = section.blocks.filter(isQuestionBlock);
    if (questions.length === 0) {
      findings.push(
        finding(
          "warning",
          "EMPTY_SECTION",
          `La sección "${section.title || "sin título"}" no tiene preguntas.`,
          "Agrega al menos una pregunta o elimina la sección.",
          { area: "questions", sectionId: section.id },
        ),
      );
    }

    for (const block of section.blocks) {
      if (seenQuestionIds.has(block.id)) {
        findings.push(
          finding(
            "error",
            "DUPLICATE_QUESTION_ID",
            "Hay dos preguntas con el mismo identificador.",
            "Vuelve a duplicar la pregunta para que reciba un identificador nuevo.",
            { area: "questions", sectionId: section.id, questionId: block.id },
          ),
        );
      }
      seenQuestionIds.add(block.id);

      for (const option of block.options) {
        if (seenOptionIds.has(option.id)) {
          findings.push(
            finding(
              "error",
              "DUPLICATE_OPTION_ID",
              "Hay dos opciones con el mismo identificador.",
              "Vuelve a crear la opción duplicada.",
              {
                area: "questions",
                sectionId: section.id,
                questionId: block.id,
                optionId: option.id,
                field: "options",
              },
            ),
          );
        }
        seenOptionIds.add(option.id);
      }

      if (!isQuestionBlock(block)) continue;
      questionCount += 1;
      typeUsage.set(block.type, (typeUsage.get(block.type) ?? 0) + 1);
      if (checkQuestion(section, block, seenCodes, findings)) validQuestions += 1;
      if (isAutoGradable(block)) autoGradable += 1;
      else if (requiresManualReview(block)) manualReview += 1;
    }
  }

  if (questionCount === 0) {
    findings.push(
      finding(
        "error",
        "NO_ACTIVE_QUESTIONS",
        "La evaluación necesita al menos una pregunta.",
        "Agrega una pregunta desde la biblioteca de componentes.",
        { area: "questions" },
      ),
    );
  }

  if (passing === null) {
    findings.push(
      finding(
        "info",
        "NO_PASSING_SCORE",
        "No hay nota mínima configurada.",
        "Sin nota mínima el sistema no marca aprobado ni reprobado.",
        { area: "settings", field: "passingScore" },
      ),
    );
  }
  if (duration === 0) {
    findings.push(
      finding(
        "info",
        "NO_DURATION",
        "La evaluación no tiene duración límite.",
        "Puedes usar la estimación calculada si quieres limitar el tiempo.",
        { area: "settings", field: "durationMinutes" },
      ),
    );
  }

  const errors = findings.filter((item) => item.severity === "error");
  const warnings = findings.filter((item) => item.severity === "warning");
  const info = findings.filter((item) => item.severity === "info");

  const completenessParts = [
    definition.name.trim() !== "" && definition.name.trim() !== "Nueva evaluación",
    content.publicInstructions.trim() !== "",
    questionCount > 0,
    questionCount > 0 && validQuestions === questionCount,
  ];
  const completeness = Math.round(
    (completenessParts.filter(Boolean).length / completenessParts.length) * 100,
  );

  return {
    findings,
    errors,
    warnings,
    info,
    canPublish: errors.length === 0 && questionCount > 0,
    questionCount,
    validQuestions,
    incompleteQuestions: questionCount - validQuestions,
    autoGradableQuestions: autoGradable,
    manualReviewQuestions: manualReview,
    typeUsage: [...typeUsage.entries()]
      .map(([type, count]) => ({
        type,
        label: getPlugin(type)?.label ?? type,
        count,
      }))
      .sort((a, b) => b.count - a.count),
    completeness,
  };
}

/** ¿Esta pregunta tiene algún error bloqueante? */
export function questionHasErrors(checklist: PublishChecklist, questionId: string): boolean {
  return checklist.errors.some((item) => item.target.questionId === questionId);
}
