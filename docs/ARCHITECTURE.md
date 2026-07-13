# ProcessOS + AssessmentOS — Architecture

This document describes the architecture of the two administrative control
centres added to the BDP ATS: **ProcessOS** (the redesigned *Procesos* module)
and **AssessmentOS** (the new *Evaluaciones* module). It complements the
existing `README.md`.

## Stack

- **Vite 5 + React 18 + TypeScript** (SPA, no SSR).
- **Tailwind CSS** with a CSS-variable-driven Liquid Glass design system.
- **Framer Motion** for animation.
- **Zod** for schema validation at every boundary.
- **fflate** for safe spreadsheet (XLSX/ODS) unzipping during import.
- **Vitest + Testing Library** for unit and component tests.
- Persistence via the existing **Google Apps Script** web app (Google Sheets).

## Feature-oriented layout

```
src/
  features/
    processes/            # ProcessOS
      components/          # editor, table, cards, kanban, by-process view, fields
      pages/               # ProcessOSPage
      __tests__/
      types.ts schema.ts statuses.ts mappers.ts filters.ts
      analytics.ts prefs.ts repository.ts store.ts sampleData.ts
    assessments/          # AssessmentOS
      builder/             # AssessmentBuilder, QuestionProperties, PublishDialog, history hook
      components/          # QuestionRenderer, AssessmentPreview, ImportWizard
      question-types/      # plugin registry (the extensible core)
      imports/             # parser (fflate/CSV), mapping + validation
      pages/               # AssessmentOSPage
      __tests__/
      types.ts schema.ts lifecycle.ts scoring.ts validation.ts logic.ts
      publicDto.ts mappers.ts categories.ts templates.ts factory.ts
      repository.ts store.ts sampleData.ts
    access.ts              # capability guards derived from the existing roles
  design-system/
    components/            # Drawer, Segmented, StatusChip, ActionMenu, Toasts
    motion.ts              # shared spring/tween presets
  infrastructure/
    env.ts                 # validated feature flags / env
    providers/             # appsScriptClient, response envelope
  shared/                  # device, store, id, format, errors, toastStore, heavyOverlayStore
  content/locale/es-BO/    # centralised Spanish strings for the new modules
```

## Layering and data flow

Frontend components never touch Google Sheets row shapes. Reads flow:

```
Apps Script response → envelope validation → provider mapper → domain model
  → application store → UI
```

Writes flow:

```
UI command → form validation (zod) → domain command → repository
  → Apps Script adapter → Google Sheets
```

Each module has a **provider-neutral repository** (`repository.ts`) with two
implementations: a fully-functional local **mock** provider and an
**apps-script** provider. The **store** (`store.ts`) binds a repository to the
UI and, if the Apps Script endpoint has not yet been redeployed with the new
operations, transparently falls back to the mock provider for the session.

A **generation guard** in each store ensures a slow/flaky network response can
never overwrite a newer refresh's result.

## Separation of concerns

- **Presentation**: `components/`, `pages/`, `builder/`.
- **Domain models**: `types.ts` (provider-neutral).
- **Validation**: `schema.ts`, `validation.ts` (zod).
- **Persistence**: `repository.ts`, `mappers.ts`.
- **Application logic**: `store.ts`, `lifecycle.ts`, `scoring.ts`, `logic.ts`.
- **Publishing / versioning**: `lifecycle.ts`, `publicDto.ts`.
- **Import processing**: `imports/`.
- **Permissions**: `access.ts` (UI guards; real enforcement is backend).

## Future migration

The repository interfaces are the seam for a future Supabase/PostgreSQL backend,
Cloudflare R2 object storage, the public Candidate Portal and pgvector/RAG. See
`FUTURE_SUPABASE_MIGRATION.md`. No Supabase code is shipped — only boundaries.
