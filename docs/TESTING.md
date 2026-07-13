# Testing

Run:

```
npm run typecheck   # tsc -b --noEmit
npm test            # vitest run
npm run build       # tsc -b && vite build (production)
```

## Unit tests

- **Processes** (`features/processes/__tests__`): schema defaults + required
  title, status transitions, publication mapping, `Procesos` row round-trip,
  filters (accent-insensitive search, with/without assessments, sorting).
- **Assessments** (`features/assessments/__tests__/assessments.test.ts`):
  factory + registry (unknown-type fallback), edit classification
  (structural vs non-structural), version bumping, structural signature
  ignoring labels, scoring (exact, partial credit, manual review, totals,
  correct-value exposure), validation (required, numeric bounds, config
  inspection), logic (missing-reference detection), public DTO answer-key
  exclusion, `Evaluaciones` row round-trip.
- **Import** (`import.test.ts`): quoted CSV parsing, escaped quotes, header
  detection (English + Spanish aliases), validation (correct-answer-not-in-
  options), row→sections conversion, template generation.
- **Shared** (`shared/__tests__`): device profile memoisation, id/slug helpers,
  error normalisation, es-BO formatting, heavy-overlay ref counting.

## Component tests

`design-system/components/__tests__`: Segmented (selection, click, arrow keys)
and StatusChip (text-not-colour-only).

## Manual QA smoke test

1. Open **Procesos**; filter; switch Table/Cards/Kanban/By-process/Analytics.
2. Create a draft process; edit details; assign an assessment; save.
3. Move a card in Kanban (drag or the "Mover a…" menu).
4. Open **Evaluaciones**; create from a template; add sections/questions;
   configure scoring; preview (desktop/tablet/mobile, high contrast); publish.
5. Import the standard template; map columns; resolve validation; save as draft.
6. Verify Spanish UI, keyboard navigation and reduced-motion.
7. `npm run build` passes.

## Environmental note

The sandbox intercepts TLS to `script.google.com`, so live Apps Script calls
fail there and both modules exercise the resilient mock fallback. Screenshots in
the explanatory doc were captured against the mock provider.
