# ASSESSMENT_OS

AssessmentOS is the new **Evaluaciones** module: a universal assessment-authoring
platform, not a simple form builder. It supports pre-screening, knowledge and
technical tests, numerical tests, situational judgment, competency evaluations,
structured interview guides, scorecards, case studies, operational simulations,
assessment centers, and (future) performance evaluations.

> **Not a validated instrument.** The UI shows a persistent disclaimer: these are
> support tools for selection, not clinical or validated psychometric tests.

## Aggregate

`AssessmentDefinition` (`domain/assessment.ts`) is the stable identity across
time. Its content lives in `AssessmentVersion`s: a working `draftVersion` plus
immutable `publishedVersions`, with `currentPublishedVersionId` marking the
version served to new candidates. The definition also holds metadata, category,
purpose, linked processes, owners/authors, tags, estimated duration, and ten
policy objects (attempt, timing, navigation, resume, randomization, scoring,
result visibility, monitoring, consent, accessibility).

Content (`AssessmentContent`) is `sections[] → blocks[]` plus `rules[]`,
`rubrics[]`, `theme`, and public/internal instructions.

## Dashboard

`EvaluacionesModule` provides search, category/lifecycle/publication filters,
three views (cards/table/summary), lifecycle actions (publish/pause/close/
archive/duplicate) and entry points to create, import from Excel, and open the
builder.

## Lifecycle

Borrador → En revisión → Aprobado → Programado → Publicado → Pausado → Cerrado →
Archivado. Publication status is tracked separately. **Published versions are
never destructively overwritten** — see VERSIONING.md.

## Builder

The visual builder (`builder/AssessmentBuilder.tsx`) has a top toolbar (name,
save state, version, lifecycle, undo/redo, preview with device frames, publish),
a left component library, a center canvas (sections/blocks with select, reorder,
duplicate, delete, keyboard reordering), a right inspector, and a status area
(errors, warnings, estimated duration, question count, total points, version
change class). See ASSESSMENT_BUILDER.md.

## Question plugins

Question types are registry-based plugins (no giant switch). See
QUESTION_PLUGIN_ARCHITECTURE.md. Unknown types fail gracefully.

## Scoring, logic, import

- Scoring and rubrics: SCORING_AND_LOGIC.md.
- Branching logic + validation: SCORING_AND_LOGIC.md.
- Spreadsheet import: SPREADSHEET_IMPORT.md.

## Persistence

`application/assessmentService.ts` → repository → provider. The Apps Script
adapter maps to the `Evaluaciones` worksheet (GOOGLE_SHEETS_SCHEMA.md).
