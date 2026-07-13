# Migration Notes

## What changed

- The old read-only `src/modules/Procesos.tsx` (candidates grouped by process)
  was **migrated intact** into ProcessOS as the "Postulantes por proceso" view
  (`features/processes/components/ByProcessView.tsx`) and the legacy file was
  removed. No candidate-grouping behaviour was lost.
- A new `evaluaciones` module id was added to the dock, app shell and locale.
- The app shell hides the generic FilterBar/KPI/module-title chrome for the two
  self-headed modules (they render their own headers/toolbars).

## Preserved behaviour

- The universal candidate data store, profile viewer, candidate actions and the
  existing modules are untouched.
- Apps Script conventions (`redirect: follow`, `text/plain` POST) are reused.

## Backend changes still required

Redeploy `docs/backend/Code.gs` (it now handles `Procesos`/`Evaluaciones`).
Until then, both modules run on the local mock provider automatically.

## Attempt storage (not built)

Candidate attempts/answers and version pinning are a backend responsibility. The
frontend defines the scoring/validation/public-DTO contracts and never mutates
historical submissions.

## Conflict resolution (prepared)

Domain models carry `updatedAt`, `schemaVersion` and audit `requestId`. When a
real backend arrives, use these to detect stale updates, show a Spanish conflict
message, and offer reload / review / save-as-copy. The store already exposes
pending/error/last-synced state and a manual refresh, and a bounded generation
guard prevents stale responses from clobbering newer ones.

## Requires legal / methodological review

Banking simulations and any "psychometric"/"validated instrument" framing must
not be presented as clinically validated without real validation, norms and
professional oversight. They ship disabled behind
`VITE_ENABLE_ADVANCED_SIMULATIONS` and are labelled demonstration/ficticio.
