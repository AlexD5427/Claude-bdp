/**
 * Version change classification.
 *
 * When an author edits a published assessment we must decide whether the change
 * is a *safe non-structural revision* (spelling, help text, decorative media,
 * accessibility descriptions, instruction wording that doesn't change meaning or
 * scoring) or a *structural change* (add/remove/reorder scored questions, change
 * options, correct answers, points/weights, branching, required fields, timers,
 * randomization, pass thresholds/formulas).
 *
 *   Safe revision   → audited MINOR bump (v1.2 → v1.3) on the same version line.
 *   Structural      → a NEW version (v1.x → v2.0). Candidates on the old version
 *                     stay pinned; new assignments get the new version.
 *
 * Historical attempts are never mutated. This module is pure so it is trivially
 * unit-tested (see versioning.test.ts).
 */

import type { AssessmentContent } from "../domain/assessment";
import type { AssessmentBlock, AssessmentSection } from "../domain/questions";

export type ChangeClass = "none" | "safe" | "structural";

export interface ChangeReport {
  classification: ChangeClass;
  /** Human-readable, es-MX reasons that justify the classification. */
  reasons: string[];
}

/** The structural fingerprint of a single block — anything here changing is structural. */
interface BlockFingerprint {
  id: string;
  type: string;
  order: number;
  required: boolean;
  scoreMode: string;
  points: number;
  weight: number;
  optionKeys: string; // stable join of option value|score|correct
}

function blockFingerprint(b: AssessmentBlock): BlockFingerprint {
  const optionKeys = b.options
    .map((o) => `${o.value || o.label}~${o.score}~${o.correct ? 1 : 0}`)
    .join("||");
  return {
    id: b.id,
    type: b.type,
    order: b.order,
    required: b.required,
    scoreMode: b.score.mode,
    points: b.score.points,
    weight: b.score.weight,
    optionKeys,
  };
}

function allBlocks(content: AssessmentContent): AssessmentBlock[] {
  return content.sections.flatMap((s) => s.blocks);
}

function sectionTimers(content: AssessmentContent): string {
  return content.sections
    .map((s: AssessmentSection) => `${s.id}:${s.config.timeLimitSeconds ?? ""}:${s.config.randomizeBlocks ? 1 : 0}:${s.config.poolSize ?? ""}`)
    .join("||");
}

/**
 * Compare two content snapshots and classify the difference.
 */
export function classifyContentChange(
  previous: AssessmentContent,
  next: AssessmentContent,
): ChangeReport {
  const reasons: string[] = [];

  const prevBlocks = allBlocks(previous);
  const nextBlocks = allBlocks(next);
  const prevById = new Map(prevBlocks.map((b) => [b.id, b]));
  const nextById = new Map(nextBlocks.map((b) => [b.id, b]));

  // Added / removed blocks are structural.
  for (const id of nextById.keys()) {
    if (!prevById.has(id)) reasons.push("Se agregó una pregunta o bloque.");
  }
  for (const id of prevById.keys()) {
    if (!nextById.has(id)) reasons.push("Se eliminó una pregunta o bloque.");
  }

  // Field-level structural comparison for surviving blocks.
  for (const [id, nextBlock] of nextById) {
    const prevBlock = prevById.get(id);
    if (!prevBlock) continue;
    const a = blockFingerprint(prevBlock);
    const b = blockFingerprint(nextBlock);
    if (a.order !== b.order) reasons.push("Se reordenaron preguntas.");
    if (a.type !== b.type) reasons.push("Cambió el tipo de una pregunta.");
    if (a.required !== b.required) reasons.push("Cambió la obligatoriedad de un campo.");
    if (a.scoreMode !== b.scoreMode) reasons.push("Cambió el modo de puntuación.");
    if (a.points !== b.points) reasons.push("Cambiaron los puntos de una pregunta.");
    if (a.weight !== b.weight) reasons.push("Cambió el peso de una pregunta.");
    if (a.optionKeys !== b.optionKeys)
      reasons.push("Cambiaron las opciones, respuestas correctas o puntajes por opción.");
    // Validation shape change (min/max/etc.) is structural.
    if (JSON.stringify(prevBlock.validation) !== JSON.stringify(nextBlock.validation))
      reasons.push("Cambiaron las reglas de validación.");
  }

  // Section timers / randomization / pools are structural.
  if (sectionTimers(previous) !== sectionTimers(next))
    reasons.push("Cambiaron temporizadores, aleatorización o tamaño de pool de una sección.");

  // Branching rules are structural.
  if (JSON.stringify(previous.rules) !== JSON.stringify(next.rules))
    reasons.push("Cambió la lógica de ramificación.");

  if (reasons.length > 0) {
    // De-duplicate reasons while preserving order.
    return { classification: "structural", reasons: [...new Set(reasons)] };
  }

  // No structural difference. Detect safe (cosmetic) changes.
  const safeReasons: string[] = [];
  for (const [id, nextBlock] of nextById) {
    const prevBlock = prevById.get(id);
    if (!prevBlock) continue;
    if (prevBlock.label !== nextBlock.label) safeReasons.push("Se ajustó el texto de una pregunta.");
    if (prevBlock.helpText !== nextBlock.helpText) safeReasons.push("Se mejoró un texto de ayuda.");
    if (prevBlock.description !== nextBlock.description)
      safeReasons.push("Se ajustó una descripción.");
    if (JSON.stringify(prevBlock.accessibility) !== JSON.stringify(nextBlock.accessibility))
      safeReasons.push("Se actualizó una descripción de accesibilidad.");
    if (JSON.stringify(prevBlock.media) !== JSON.stringify(nextBlock.media))
      safeReasons.push("Se reemplazó contenido multimedia decorativo.");
  }
  if (
    previous.publicInstructions !== next.publicInstructions ||
    previous.internalInstructions !== next.internalInstructions
  ) {
    safeReasons.push("Se corrigieron instrucciones sin cambiar su significado.");
  }
  if (JSON.stringify(previous.theme) !== JSON.stringify(next.theme)) {
    safeReasons.push("Se ajustó el tema visual.");
  }

  if (safeReasons.length > 0) {
    return { classification: "safe", reasons: [...new Set(safeReasons)] };
  }

  return { classification: "none", reasons: [] };
}
