# AssessmentOS — the new *Evaluaciones* module

AssessmentOS is a universal assessment-authoring platform, not a basic forms
page. It can author application questionnaires, pre-screening forms, knowledge
and technical tests, situational-judgement and competency assessments, structured
interview guides, case studies, reviewer scorecards and (behind a feature flag)
banking simulations.

## Domain model

`AssessmentDefinition` (`features/assessments/types.ts`) holds metadata,
delivery/governance policies (attempt, timing, navigation, resume,
randomization, scoring, result visibility, monitoring, consent, accessibility),
`sections → questions`, logic `rules`, a `theme`, immutable `versions` and an
`auditTrail`. A cheap `AssessmentSummary` powers the list.

Question *types* are open strings resolved through the plugin registry, so the
core model never enumerates them. See `QUESTION_PLUGIN_ARCHITECTURE.md`.

## Lifecycle & versioning

`draft → under_review → approved → scheduled → published → paused → closed →
archived`. A published assessment is never mutated destructively. Edits are
classified (`lifecycle.ts`):

- **Non-structural** (wording, help text, descriptions, decorative media) → may
  publish as a minor revision, audited.
- **Structural** (add/remove/reorder scored questions, change correct answers,
  points, options, branching, timing, randomisation, thresholds) → **new
  version**.

Publishing snapshots the current draft into an immutable `AssessmentVersion`.
Candidates who started an attempt stay pinned to their version; new candidates
receive the newly published one. See `ASSESSMENT_VERSIONING.md`.

## Builder

`builder/AssessmentBuilder.tsx` is the visual authoring surface:

- **Top toolbar** — name, version/draft status, undo/redo (Ctrl/Cmd+Z),
  preview, save, publish.
- **Left library** — question plugins grouped by family; unavailable
  (feature-flagged) types are shown disabled and clearly labelled "beta".
- **Center canvas** — sections and blocks with inline reordering (keyboard
  up/down), duplication and deletion; live interactive rendering.
- **Right properties** — label, description, help, required, options, scoring,
  correct answers, validation and type-specific config for the selected block.
- **Status bar** — question count, total points, estimated duration,
  unconfigured blocks and logic-error count.

Builder state uses a bounded undo/redo history hook (`useHistoryState`) and
registers as a "heavy overlay" so the animated background pauses while authoring.

## Preview

`components/AssessmentPreview.tsx` renders the candidate experience through the
**public DTO** (proving answer keys are stripped) with desktop/tablet/mobile,
high-contrast and screen-reader-outline modes. Preview attempts are never mixed
with real submissions.

## Import, templates, question bank

- **Import** — `.xlsx/.csv/.ods` via a safe parser; see `EXCEL_IMPORT.md`.
- **Templates** — original structured-hiring starting points (`templates.ts`).
- **Question bank** — a `QuestionBankItem` type is defined; the reusable-bank UI
  is prepared as an extension point.

## Persistence

`mappers.ts` maps to the `Evaluaciones` worksheet; published versions are
independently identifiable by composite `ID + Version`. See
`GOOGLE_SHEETS_SCHEMA.md`.
