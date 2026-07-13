# MIGRATION_NOTES

## Summary

The **Procesos** module was migrated (not duplicated) to ProcessOS, and a new
**Evaluaciones** module (AssessmentOS) was added. Existing modules (Dashboard,
Tablero, Cara a Cara, Comparador, Postulantes, Documentación, Configuración) are
untouched.

## Breaking / notable changes

- `src/modules/Procesos.tsx` was **removed**; navigation now renders
  `features/processes` (lazy-loaded).
- `ModuleId` gained `"evaluaciones"`; the dock has a new **Evaluaciones** item.
- The generic four-KPI bar is hidden for `procesos` and `evaluaciones` (both
  provide their own summaries), matching the comparator's existing treatment.
- A global `ToastViewport` is mounted in `AppShell`.

## Dependencies added

- `zod` — schema validation at every boundary.
- `fflate` — safe xlsx/ods unzipping for import.
- dev: `vitest`, `jsdom`, `@testing-library/*`, `@vitest/coverage-v8`,
  `@types/node`.

## Build/config

- `@/*` path alias added to `tsconfig.app.json` and Vite/Vitest.
- `vitest.config.ts` + `vitest.setup.ts` added; `test` / `test:watch` scripts.
- `.env.example` added documenting `VITE_DATA_PROVIDER` and feature flags.

## Data / backend

- Two new worksheets: **`Procesos`** and **`Evaluaciones`** (see
  GOOGLE_SHEETS_SCHEMA.md). Complex data is stored as validated JSON strings — a
  documented transitional strategy.
- `docs/backend/Code.gs` was extended non-destructively with routing and handlers
  for the new sheets (create/update with stale-update check, lifecycle
  transitions, duplicate, rollback). Redeploy the Apps Script to activate.
- The default provider is **mock** (localStorage, seeded), so the app is fully
  functional before the backend is redeployed. Set
  `VITE_DATA_PROVIDER=google-apps-script` to use the live backend.

## Feature-flagged / not production-ready

- Advanced question types (code/SQL, spreadsheet sim, interactive video,
  credit/risk/cashier/reconciliation/customer-service/operations sims, financial
  statements) ship as **typed contracts**, disabled by flags, requiring manual
  review, never executing untrusted code.
- Application-form builder, communications automation, and reports are
  foundations pending the Candidate Portal / communications engine.
- Supabase provider is a **contract-only** stub.

## Follow-ups

- Redeploy `Code.gs`; verify the two worksheets are created and round-trip.
- Add axe-based accessibility checks and end-to-end smoke tests.
- Consider `manualChunks` to further split the `three`/vendor bundles.
