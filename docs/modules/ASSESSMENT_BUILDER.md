# ASSESSMENT_BUILDER

The visual builder lets authors compose an assessment's draft version.

## State separation

`builder/builderState.ts` is a pure reducer over immutable `AssessmentContent`.
It separates the concerns the brief calls out:

- **Document** — `state.content` (the assessment being edited).
- **UI selection** — `selectedBlockId` / `selectedSectionId`.
- **Undo/redo history** — `past[]` / `future[]` (content snapshots, capped).
- **Validation** — derived on the fly (`scoring/validateContent.ts`), not stored.
- **Preview / persistence / synchronization / publishing** — handled outside the
  reducer (module + services), keeping it pure and testable.

Actions: `select`, `addSection`, `removeSection`, `updateSection`, `moveSection`,
`addBlock`, `updateBlock`, `removeBlock`, `duplicateBlock`, `moveBlock`,
`replaceContent`, `undo`, `redo`. Block orders are kept contiguous after every
structural change.

## Layout

- **Top toolbar** — name, save state, version label, lifecycle pill, undo/redo,
  preview (desktop/tablet/mobile), save, publish.
- **Left panel** — searchable component library grouped into Contenido,
  Preguntas, Multimedia, Simulaciones. Beta/contract plugins are badged.
- **Center canvas** — sections and blocks with selection, keyboard reordering
  (↑/↓ on the grab handle), duplicate, delete, and per-section add.
- **Right inspector** — label, help text, description, required, options
  (with correct/score per option), score mode/points/weight, competency,
  accessibility label, and tags.
- **Status area** — question count, total points, estimated duration, error and
  warning counts, and the pending version-change classification.

## Rendering

`builder/BlockRenderer.tsx` renders each block by kind. A plugin may supply its
own `Preview`; otherwise the generic renderer covers the MVP types. All
interactive controls are keyboard-accessible and choice groups use proper
`fieldset`/`radiogroup` semantics. Correct-answer markers only render outside
candidate mode.

## Preview

`ui/AssessmentPreview.tsx` renders through the **public DTO** — the exact shape
the Candidate Portal would receive — so answer keys never appear in preview.
Device frames (desktop/tablet/mobile) constrain the width.

## Performance

- The builder is lazy-loaded (route-level code splitting).
- The reducer produces new references only for changed branches.
- Validation is memoized on content.
- List cards use summaries; full definitions load only when opening the builder.
