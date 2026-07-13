# ARCHITECTURE

This document describes the architecture introduced by the ProcessOS +
AssessmentOS rebuild. It complements the existing app (dashboard, comparator,
candidates, documentation) rather than replacing it.

## Stack

- **Vite 5 + React 18 + TypeScript (strict)**, Tailwind CSS, Framer Motion.
- **Zod** for schema validation at every boundary.
- **fflate** for safe spreadsheet (xlsx/ods) unzipping.
- **Vitest + Testing Library** for unit and component tests.
- Backend: **Google Apps Script** web app over Google Sheets (unchanged
  protocol, extended with two new worksheets).

## Feature-oriented layout

```
src/
  features/
    processes/            ProcessOS
      domain/             models, enums, statuses, public content, factories
      application/        process application service
      ui/                 list, filters, table/cards/kanban/summary, editor
    assessments/          AssessmentOS
      domain/             AssessmentDefinition/Version, policies, questions, rules
      question-types/     plugin registry + content/answer/advanced plugins
      builder/            builder reducer + canvas/inspector/library shell
      versioning/         change classification + non-destructive operations
      scoring/            scoring engine + content validation
      logic/              branching-rule validation
      imports/            spreadsheet parse + convert
      audit/              local audit log
      application/        assessment application service
      ui/                 dashboard, preview, import wizard
    shared/               permissions
  infrastructure/
    providers/
      google-apps-script/ HTTP client + repository adapter
      mock/               localStorage-backed provider + seed data
      supabase/           contract-only stub (feature-flagged off)
    repositories/         provider-neutral contracts
    mappers/              row <-> domain, public DTO (answer-key exclusion)
    synchronization/      sync state + stale-update detection
  design-system/
    liquid-glass/         StatusPill, Chip, Segmented, Drawer, Dialog, toast, fields
    tokens.ts             semantic intents, z-index, radii, motion timings
    motion.ts             Framer Motion presets
  shared/                 Result, ids, envelope, sanitize, store, hooks, flags
  content/locale/es-MX/   string catalog + formatters
```

## Data flow

Reads and writes cross a provider boundary so the backend can be swapped later
(Apps Script → Supabase) without touching the modules:

```
Reads:  provider response → schema validation → mapper → domain model
        → application service → UI

Writes: UI command → validation → domain command → repository
        → Apps Script adapter → Google Sheets
```

Components never see Google Sheets row shapes. The mappers
(`infrastructure/mappers`) are the only code that knows about the flat
`Procesos` / `Evaluaciones` columns.

## Provider neutrality

`infrastructure/repositories/contracts.ts` defines `ProcessRepository`,
`AssessmentRepository`, and `DataProvider`. Three providers implement them:

- **mock** — default; fully functional, localStorage-backed, seeded es-MX data.
- **google-apps-script** — the live backend using the two new worksheets.
- **supabase** — contract-only stub returning "not enabled" (flagged off).

`getProvider()` selects one via the `VITE_DATA_PROVIDER` flag. Tests inject a
provider with `__setProviderForTests`.

## State management

No external state library. Reactive stores use `useSyncExternalStore` through a
small `createStore` factory (matching the app's existing `configStore` /
`hiringStore` pattern), with optional `localStorage` persistence. The builder
uses a pure `useReducer` so undo/redo is just content snapshots.

## Security boundaries

- The **public DTO mapper** strips answer keys, per-option scores, feedback, and
  internal instructions before anything could reach the Candidate Portal.
- All imported/rich content is **sanitized**; no backend HTML/CSS/JS is rendered.
- CSV exports are guarded against **formula injection**.
- Frontend permission guards improve UX but never replace backend authorization.
- No secrets are read or logged by the client; the Apps Script URL is the only
  configured endpoint.
