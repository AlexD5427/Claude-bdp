import { createAssessmentDefinition } from "./factory";
import { ASSESSMENT_TEMPLATES } from "./templates";
import { snapshotVersion } from "./lifecycle";
import { estimateDuration } from "./scoring";
import type { AssessmentDefinition } from "./types";

/**
 * Seed assessments for the mock provider — Spanish, banking-flavoured, clearly
 * demonstration data. Includes a published assessment (with a frozen version),
 * a draft and an under-review item so the lifecycle is visible on first run.
 */
export function seedAssessments(): AssessmentDefinition[] {
  const actor = { id: "system", name: "Sistema (demostración)" };
  const out: AssessmentDefinition[] = [];

  const findTemplate = (id: string) => ASSESSMENT_TEMPLATES.find((t) => t.id === id)!;

  // 1) Published commercial competency assessment (with a version snapshot).
  const comercial = createAssessmentDefinition(findTemplate("comercial").build(), actor);
  comercial.scoringPolicy = { enabled: true, passThreshold: 60, showScoreToCandidate: false, normalize: true };
  comercial.estimatedDuration = estimateDuration(comercial.sections);
  comercial.status = "published";
  comercial.publicationStatus = "published";
  comercial.currentVersion = "1.0";
  comercial.publishedAt = new Date(Date.now() - 5 * 86400000).toISOString();
  comercial.versions = [snapshotVersion(comercial, "1.0", actor, "Versión inicial publicada.")];
  comercial.auditTrail.push({
    id: `aud-${comercial.id}-pub`,
    action: "version_published",
    actorId: actor.id,
    actorName: actor.name,
    timestamp: comercial.publishedAt,
    summary: "Versión 1.0 publicada.",
    versionAfter: "1.0",
  });
  out.push(comercial);

  // 2) Draft pre-screen questionnaire.
  const preseleccion = createAssessmentDefinition(findTemplate("preseleccion").build(), actor);
  out.push(preseleccion);

  // 3) Under-review technical test.
  const tecnica = createAssessmentDefinition(findTemplate("tecnica").build(), actor);
  tecnica.status = "under_review";
  tecnica.scoringPolicy = { enabled: true, passThreshold: 70, showScoreToCandidate: false, normalize: true };
  out.push(tecnica);

  // 4) Draft credit-analysis knowledge test.
  const credito = createAssessmentDefinition(findTemplate("credito").build(), actor);
  credito.scoringPolicy = { enabled: true, passThreshold: 65, showScoreToCandidate: false, normalize: true };
  out.push(credito);

  return out;
}
