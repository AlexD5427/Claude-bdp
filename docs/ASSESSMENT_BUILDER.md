# Assessment Builder

`features/assessments/builder/AssessmentBuilder.tsx` is the visual authoring
surface for an `AssessmentDefinition`.

## State architecture

State is deliberately separated rather than stuffed into one component:

- **Document state** — the `AssessmentDefinition` in a bounded undo/redo history
  (`useHistoryState.ts`): past/future stacks capped at 60 entries; committed
  edits push history, transient ones can skip it.
- **UI selection state** — the selected block id.
- **Preview / publish / persistence state** — local flags.

`Ctrl/Cmd+Z` / `Shift` redo are wired. Derived fields (estimated duration) are
recomputed via `withDerived` on every edit.

## Regions

- **Top toolbar** — editable name, version + save state, undo/redo, preview,
  save, publish.
- **Left library** — plugins grouped by family (`pluginsByFamily`); disabled,
  labelled entries for feature-flagged advanced types. Clicking inserts into the
  active section.
- **Center canvas** — sections with inline title editing; blocks rendered live
  by `QuestionRenderer`; hover controls to move up/down, duplicate, delete;
  "Agregar sección" / "Agregar pregunta".
- **Right properties** — `QuestionProperties` renders only the controls the
  selected plugin supports (options, per-option/points scoring, correct
  answers, validation, type-specific config).
- **Status bar** — question count, total points (and scored count), estimated
  duration, unconfigured blocks, logic-error count.

## Performance

The builder registers as a **heavy overlay** (`pushHeavyOverlay`) so the
animated WebGL background pauses while authoring, and it locks body scroll. It
is lazy-loaded (`React.lazy`) so its chunk is fetched only when opened.

## Persistence & publish

`Guardar` calls the store `saveAssessment` (draft). `Publicar` opens
`PublishDialog`, which classifies the edit, previews the resulting version and
blocks on logic errors before calling `publishAssessment` (snapshotting an
immutable version). See `ASSESSMENT_VERSIONING.md`.
