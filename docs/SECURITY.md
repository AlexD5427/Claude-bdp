# Security

- **No secrets in the client.** The Apps Script URL is a public web-app
  endpoint. No Supabase service-role or R2 credentials exist in this SPA; any
  future secret must stay server-side and never live in a `VITE_` variable.
- **Response validation.** All provider responses pass through Zod schemas /
  the shared envelope; failures normalise into Spanish `AppError`s without
  leaking stack traces to the UI.
- **Import safety.** Extension/size/row limits; XLSX/ODS unzipped with `fflate`
  and read via `DOMParser` — **formulas are never evaluated**; no imported HTML
  or script is executed; no `dangerouslySetInnerHTML` without sanitisation.
- **Answer keys.** Correct answers, per-option points and expected values are
  stripped by `publicDto.ts`; a test asserts the public projection contains no
  answer keys. The Candidate Portal only ever receives the public DTO.
- **Public content.** Process public content is validated JSON blocks; arbitrary
  backend-provided JavaScript/CSS is never accepted.
- **CSV injection.** The static template is safe; the future dynamic CSV export
  must quote fields beginning with `= + - @`.
- **Idempotency.** Creates carry a client-generated `idempotencyKey`; writes are
  never auto-retried.
- **Authorisation.** Frontend capability guards (`features/access.ts`) are UX
  only; real enforcement must be added on the backend.
- **No untrusted code execution.** Code/SQL question types capture text only;
  execution would require a sandboxed service (not built).
