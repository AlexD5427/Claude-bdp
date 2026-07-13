# TESTING

## Commands

```bash
npm run typecheck   # tsc -b --noEmit (strict; noUnusedLocals/Parameters)
npm run test        # vitest run
npm run build       # tsc -b && vite build (production build)
```

> There is no ESLint configuration in this repository; the strict TypeScript
> compiler (with `noUnusedLocals` / `noUnusedParameters`) is the static-analysis
> gate. If ESLint is added later, wire it into an `npm run lint` script.

## Suites

Unit + component tests live next to the code they cover (Vitest + Testing
Library, jsdom):

- `features/processes/domain/process.test.ts` — process factory, statuses,
  duplication, summary projection.
- `features/processes/ui/listState.test.ts` — filters, lifecycle, search, sort,
  facet counts.
- `features/processes/ui/ProcesosModule.test.tsx` — module renders, lists seeded
  data, filters by search (mock provider).
- `features/processes/application/processService.test.ts` — create/edit/publish,
  process↔assessment linking, duplicate, and assessment publish→served version.
- `features/assessments/versioning/versioning.test.ts` — change classification
  (none/safe/structural), version numbering, immutability of published content,
  rollback, cloning.
- `features/assessments/scoring/scoring.test.ts` — plugin registry + graceful
  fallback, scoring modes, no-auto-reject, manual review, content validation.
- `features/assessments/logic/logic.test.ts` — invalid refs, missing targets,
  unreachable sections, contradictions, circular branches.
- `features/assessments/imports/imports.test.ts` — CSV parsing, Spanish header
  mapping, conversion to a draft (never published), issue detection, exclusion,
  CSV injection guard.
- `features/assessments/builder/builderState.test.ts` — add/remove/duplicate/
  move blocks, contiguous order, undo/redo, selection.
- `features/assessments/ui/EvaluacionesModule.test.tsx` — dashboard renders,
  disclaimer visible, Spanish affordances.
- `infrastructure/mappers/mappers.test.ts` — row round-trips, enum coercion,
  and **public DTO answer-key exclusion**.
- `content/locale/__tests__/locale.test.ts` — es-MX active, Spanish copy, no
  leftover English in key labels, formatters.

## Results

At delivery: **typecheck passes**, **all Vitest suites pass**, and the
**production build succeeds**. See the PR description for the exact counts from
the final run.

## Manual QA

1. Run `npm run dev`, log in, open **Procesos**.
2. Create a process; fill Resumen/Job/Publication; add public content; link an
   assessment; save; publish (confirm); watch the toast and status pill.
3. Switch views (table/cards/kanban/summary); drag a kanban card and move one
   with the keyboard; use filters and search.
4. Open **Evaluaciones**; create one; add sections/questions in the builder;
   set a correct answer + points; check the status area; preview (candidate mode
   shows no answer keys); publish (v1.0), edit help text, publish again (minor),
   change points, publish again (major).
5. Use **Importar desde Excel** with a small CSV; map columns; review issues;
   create a draft; confirm it opens unpublished in the builder.
