# Future Supabase / Backend Migration

The UI depends only on the provider-neutral repository interfaces
(`ProcessRepository`, `AssessmentRepository`). Swapping Google Sheets for a real
backend requires **no UI rewrite** — only a new implementation of those
interfaces.

## Seam

```
UI → store.ts → Repository interface → { mock | apps-script | supabase }
```

To add Supabase:

1. Implement `SupabaseProcessRepository` / `SupabaseAssessmentRepository` under
   `infrastructure/providers/supabase/` satisfying the same interfaces.
2. Extend `resolveProcessRepository()` / `resolveAssessmentRepository()` to
   return it when `env.enableSupabase` is true.
3. Map the domain models to normalised PostgreSQL tables (no more JSON-blob
   columns): `processes`, `assessments`, `assessment_versions`, `sections`,
   `questions`, `options`, `rules`, `audit_events`, `attempts`, `answers`.

## Prepared boundaries (not implemented)

- **Supabase Auth + Row Level Security** — replace the local role guards in
  `features/access.ts` with enforced policies.
- **Cloudflare R2** — the file-upload question type defines a secure upload
  *contract*; storage credentials must live server-side.
- **Candidate Portal** — consumes `publicDto.ts` projections (answer keys
  already stripped).
- **pgvector / RAG** — `internalMetadata` and question text are ready to embed.

## Concurrency

Domain models carry `updatedAt`, `schemaVersion` and audit `requestId`, ready
for optimistic-concurrency conflict detection. The store already surfaces
pending/error states and a manual refresh. See `MIGRATION_NOTES.md`.

Do **not** implement real Supabase persistence until credentials and an approved
schema exist.
