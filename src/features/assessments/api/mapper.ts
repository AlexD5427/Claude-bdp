/**
 * Mapeadores DTO ↔ dominio.
 *
 * La API normalizada devuelve `assessment / sections / questions / options`
 * planos; el dominio del frontend trabaja con el agregado
 * `AssessmentDefinition` (que anida el contenido en `draftVersion.content`).
 * Todo el trasvase ocurre aquí, así que ni la UI ni los servicios conocen la
 * forma de la hoja de cálculo.
 *
 * Los snapshots de las versiones publicadas NO viajan por la API (viven en el
 * servidor y pueden ser grandes): `publishedVersions` se rellena con sus
 * metadatos y contenido vacío. Es la única pérdida deliberada de información y
 * está documentada en docs/evaluations/ARCHITECTURE.md.
 */

import {
  assessmentContentSchema,
  assessmentDefinitionSchema,
  type AssessmentContent,
  type AssessmentDefinition,
  type AssessmentSummary,
  type SyncStatus,
} from "../domain/assessment";
import { assessmentBlockSchema, assessmentSectionSchema, type AssessmentBlock } from "../domain/questions";
import { ASSESSMENT_CATEGORIES, type AssessmentCategory } from "../domain/categories";
import {
  ASSESSMENT_LIFECYCLE,
  ASSESSMENT_PUBLICATION,
  type AssessmentLifecycle,
  type AssessmentPublication,
} from "../domain/lifecycle";
import type {
  AdminAssessmentSummaryDTO,
  AdminBundleDTO,
  AdminOptionDTO,
  AdminQuestionDTO,
  AdminSectionDTO,
} from "./dto";

function enumOr<T extends string>(values: readonly T[], raw: string, fallback: T): T {
  return (values as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

const category = (raw: string): AssessmentCategory =>
  enumOr(ASSESSMENT_CATEGORIES, raw, "knowledge");
const lifecycle = (raw: string): AssessmentLifecycle =>
  enumOr(ASSESSMENT_LIFECYCLE, raw, "draft");
const publication = (raw: string): AssessmentPublication =>
  enumOr(ASSESSMENT_PUBLICATION, raw, "unpublished");

/** Resumen de la API → proyección de listado del dominio. */
export function toAssessmentSummaryFromDTO(dto: AdminAssessmentSummaryDTO): AssessmentSummary {
  return {
    id: dto.assessmentId,
    code: dto.publicCode,
    name: dto.title,
    category: category(dto.category),
    lifecycle: lifecycle(dto.lifecycleStatus),
    publication: publication(dto.publicationStatus),
    versionLabel: dto.versionLabel || `v${dto.version}.${dto.versionMinor}`,
    questionCount: dto.questionCount,
    estimatedDurationMinutes: dto.durationMinutes ?? 0,
    ownerId: dto.createdBy,
    linkedProcessCount: dto.linkedProcessCount,
    tags: dto.tags,
    updatedAt: dto.updatedAt,
    synchronizationStatus: "synced" as SyncStatus,
  };
}

/** Pregunta + sus opciones → bloque del dominio. */
function toBlock(question: AdminQuestionDTO, options: AdminOptionDTO[]): AssessmentBlock {
  const config = { ...question.configuration };
  const rubricId = typeof config.rubricId === "string" ? config.rubricId : null;
  const normalize = config.normalizeScore === true;
  delete config.rubricId;
  delete config.normalizeScore;

  return assessmentBlockSchema.parse({
    id: question.questionId,
    type: question.questionType,
    order: question.position,
    code: question.code,
    label: question.questionText,
    description: question.description,
    helpText: question.helpText,
    required: question.required,
    options: options
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((option) => ({
        id: option.optionId,
        label: option.optionText,
        value: option.optionValue || option.optionId,
        score: option.scoreValue,
        correct: option.isCorrect,
        matchingKey: option.matchingKey,
        feedback: option.feedback,
        mediaUrl: option.mediaUrl || null,
      })),
    config,
    validation: question.validation,
    score: {
      mode: question.scoringMode,
      points: question.maxPoints,
      weight: question.weight,
      rubricId,
      competency: question.competency,
      normalize,
    },
    feedback: question.feedback,
    media: question.media && question.media.url ? question.media : null,
    accessibility: question.accessibility,
    tags: question.tags,
    analyticsKey: "",
  });
}

/** Secciones/preguntas/opciones planas → contenido anidado del dominio. */
export function toContent(
  sections: AdminSectionDTO[],
  questions: AdminQuestionDTO[],
  options: AdminOptionDTO[],
  extras: {
    rules: unknown[];
    rubrics: unknown[];
    theme: Record<string, unknown>;
    publicInstructions: string;
    internalInstructions: string;
  },
): AssessmentContent {
  const optionsByQuestion = new Map<string, AdminOptionDTO[]>();
  for (const option of options) {
    if (!option.active) continue;
    const list = optionsByQuestion.get(option.questionId) ?? [];
    list.push(option);
    optionsByQuestion.set(option.questionId, list);
  }

  const questionsBySection = new Map<string, AdminQuestionDTO[]>();
  for (const question of questions) {
    if (!question.active) continue;
    const list = questionsBySection.get(question.sectionId) ?? [];
    list.push(question);
    questionsBySection.set(question.sectionId, list);
  }

  return assessmentContentSchema.parse({
    sections: sections
      .filter((section) => section.active)
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((section, index) =>
        assessmentSectionSchema.parse({
          id: section.sectionId,
          title: section.title,
          description: section.description,
          order: index,
          blocks: (questionsBySection.get(section.sectionId) ?? [])
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((question, blockIndex) => ({
              ...toBlock(question, optionsByQuestion.get(question.questionId) ?? []),
              order: blockIndex,
            })),
          config: {
            timeLimitSeconds: section.timeLimitSeconds,
            randomizeBlocks: section.randomize,
            poolSize: section.poolSize,
            weight: section.weight,
          },
        }),
      ),
    rules: extras.rules,
    rubrics: extras.rubrics,
    theme: extras.theme,
    publicInstructions: extras.publicInstructions,
    internalInstructions: extras.internalInstructions,
  });
}

/** Bundle completo de la API → agregado del dominio. */
export function toAssessmentDefinition(bundle: AdminBundleDTO): AssessmentDefinition {
  const dto = bundle.assessment;
  const policies = dto.policies as Record<string, unknown>;
  const scoring = (policies.scoring ?? {}) as Record<string, unknown>;
  const content = toContent(bundle.sections, bundle.questions, bundle.options, {
    rules: dto.rules,
    rubrics: dto.rubrics,
    theme: dto.theme,
    publicInstructions: dto.instructions,
    internalInstructions: dto.internalInstructions,
  });
  const emptyContent = assessmentContentSchema.parse({});

  return assessmentDefinitionSchema.parse({
    id: dto.assessmentId,
    externalReference: "",
    code: dto.publicCode,
    name: dto.title,
    description: dto.description,
    category: category(dto.category),
    purpose: dto.purpose,
    lifecycle: lifecycle(dto.lifecycleStatus),
    publication: publication(dto.publicationStatus),
    linkedProcessIds: dto.linkedProcessIds,
    ownerId: dto.createdBy,
    authorIds: dto.createdBy ? [dto.createdBy] : [],
    tags: dto.tags,
    estimatedDurationMinutes: dto.durationMinutes ?? 0,
    availabilityStart: null,
    availabilityEnd: null,
    attemptPolicy: policies.attempt ?? {},
    timingPolicy: policies.timing ?? {},
    navigationPolicy: policies.navigation ?? {},
    resumePolicy: policies.resume ?? {},
    randomizationPolicy: policies.randomization ?? {},
    scoringPolicy: { ...scoring, passThreshold: dto.passingScore },
    resultVisibility: policies.resultVisibility ?? {},
    monitoringPolicy: policies.monitoring ?? {},
    consentPolicy: policies.consent ?? {},
    accessibilityPolicy: policies.accessibility ?? {},
    draftVersion: {
      id: `ver_draft_${dto.assessmentId}`,
      major: dto.version,
      minor: dto.versionMinor,
      state: "draft",
      notes: "",
      content,
      createdAt: dto.createdAt || new Date().toISOString(),
      createdBy: dto.createdBy,
      publishedAt: null,
      publishedBy: "",
    },
    publishedVersions: bundle.versions.map((version) => ({
      id: version.versionId,
      major: version.version,
      minor: version.versionMinor,
      state: "published",
      notes: version.notes,
      // El snapshot vive en el servidor; aquí solo viajan los metadatos.
      content: emptyContent,
      createdAt: version.publishedAt || dto.createdAt || new Date().toISOString(),
      createdBy: version.publishedBy,
      publishedAt: version.publishedAt || null,
      publishedBy: version.publishedBy,
    })),
    currentPublishedVersionId: dto.currentPublishedVersionId || null,
    schemaVersion: dto.schemaVersion,
    entityVersion: dto.entityVersion,
    createdAt: dto.createdAt || new Date().toISOString(),
    createdBy: dto.createdBy,
    updatedAt: dto.updatedAt || new Date().toISOString(),
    updatedBy: dto.updatedBy,
    publishedAt: dto.publishedAt || null,
    sourceProvider: "google-apps-script",
    synchronizationStatus: "synced",
  });
}

/** Carga de `updateAssessment` construida desde el agregado del dominio. */
export interface UpdatePayload {
  assessment: Record<string, unknown>;
  sections: Record<string, unknown>[];
  questions: Record<string, unknown>[];
  options: Record<string, unknown>[];
}

/** Agregado del dominio → carga plana para el servidor. */
export function toUpdatePayload(definition: AssessmentDefinition): UpdatePayload {
  const content = definition.draftVersion.content;
  const sections: Record<string, unknown>[] = [];
  const questions: Record<string, unknown>[] = [];
  const options: Record<string, unknown>[] = [];

  content.sections.forEach((section, sectionIndex) => {
    sections.push({
      sectionId: section.id,
      title: section.title,
      description: section.description,
      position: sectionIndex,
      timeLimitSeconds: section.config.timeLimitSeconds,
      randomize: section.config.randomizeBlocks,
      poolSize: section.config.poolSize,
      weight: section.config.weight,
      active: true,
    });
    section.blocks.forEach((block, blockIndex) => {
      questions.push({
        questionId: block.id,
        sectionId: section.id,
        questionText: block.label,
        questionType: block.type,
        position: blockIndex,
        required: block.required,
        scoringMode: block.score.mode,
        maxPoints: block.score.points,
        weight: block.score.weight,
        active: true,
        helpText: block.helpText,
        description: block.description,
        competency: block.score.competency,
        code: block.code,
        configuration: {
          ...block.config,
          ...(block.score.rubricId ? { rubricId: block.score.rubricId } : {}),
          ...(block.score.normalize ? { normalizeScore: true } : {}),
        },
        validation: block.validation,
        feedback: block.feedback,
        media: block.media,
        accessibility: block.accessibility,
        tags: block.tags,
        configurationSchemaVersion: 1,
      });
      block.options.forEach((option, optionIndex) => {
        options.push({
          optionId: option.id,
          questionId: block.id,
          optionText: option.label,
          optionValue: option.value || option.id,
          position: optionIndex,
          isCorrect: option.correct,
          scoreValue: option.score,
          matchingKey: option.matchingKey,
          active: true,
          feedback: option.feedback,
          mediaUrl: option.mediaUrl ?? "",
          configuration: {},
        });
      });
    });
  });

  return {
    assessment: {
      title: definition.name,
      description: definition.description,
      instructions: content.publicInstructions,
      internalInstructions: content.internalInstructions,
      durationMinutes: definition.estimatedDurationMinutes > 0 ? definition.estimatedDurationMinutes : null,
      passingScore: definition.scoringPolicy.passThreshold,
      accessType: "public",
      category: definition.category,
      purpose: definition.purpose,
      tags: definition.tags,
      linkedProcessIds: definition.linkedProcessIds,
      policies: {
        attempt: definition.attemptPolicy,
        timing: definition.timingPolicy,
        navigation: definition.navigationPolicy,
        resume: definition.resumePolicy,
        randomization: definition.randomizationPolicy,
        scoring: definition.scoringPolicy,
        resultVisibility: definition.resultVisibility,
        monitoring: definition.monitoringPolicy,
        consent: definition.consentPolicy,
        accessibility: definition.accessibilityPolicy,
      },
      theme: content.theme,
      rules: content.rules,
      rubrics: content.rubrics,
    },
    sections,
    questions,
    options,
  };
}
