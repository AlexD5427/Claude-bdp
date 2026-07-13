# FUTURE_SUPABASE_MIGRATION

The provider boundary is designed so the backend can move from Google Apps
Script to Supabase (PostgreSQL) without rewriting the modules.

## What is ready

- **Repository contracts** (`infrastructure/repositories/contracts.ts`) are
  provider-neutral. Modules depend only on them.
- A **Supabase provider stub** exists (`providers/supabase/index.ts`) that
  satisfies the contracts and returns a normalized "not enabled" error. It is
  selected only when `VITE_DATA_PROVIDER=supabase` (and the code is behind the
  `VITE_FLAG_SUPABASE` flag).
- Domain models are already normalized and validated, so a relational schema can
  be derived directly from them (each JSON-string column becomes real columns or
  related tables).

## What is intentionally NOT done

Per the brief, **no real Supabase persistence is implemented without an approved
schema and credentials.** The stub does not open connections or read env secrets.

## Target design (for a future migration)

- **PostgreSQL** tables: `processes`, `assessments`, `assessment_versions`,
  `question_bank_items`, `templates`, `audit_entries`, `import_jobs`. The
  JSON-string columns in the Sheets schema become `jsonb` or normalized tables.
- **Supabase Auth** for identity; map current roles to Postgres roles/claims.
- **Row Level Security** enforcing the permission matrix server-side (the
  frontend guards in `features/shared/permissions.ts` are UX only).
- **Cloudflare R2** for candidate file responses and media, addressed by signed
  URLs. Storage secrets stay server-side; never `VITE_`-prefixed.
- **Candidate Portal** consumes the **public DTO** exclusively (no answer keys).
- **pgvector + AI/RAG** for question-bank semantic search and authoring assist,
  as an additive service.

## Migration steps (when approved)

1. Define and review the SQL schema from the domain models.
2. Implement `providers/supabase` against that schema behind the flag.
3. Write a one-time exporter from the `Procesos`/`Evaluaciones` sheets to the
   new tables (mappers already produce domain models).
4. Flip `VITE_DATA_PROVIDER=supabase` in the target environment.
5. Keep Apps Script available as a fallback until parity is verified.

No secrets are ever exposed to the browser during or after migration.
