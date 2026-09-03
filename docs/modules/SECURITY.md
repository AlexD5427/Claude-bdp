# SECURITY

## Answer-key protection

The Candidate Portal must never receive answer keys. `infrastructure/mappers/
publicDto.ts` projects a **published** assessment version into a candidate-safe
DTO, removing per-option `score`/`correct`/`feedback`, block `score`, scoring
rules, and internal instructions; only presentation config is forwarded. Drafts
are never public (the DTO returns `null` when there is no published version).
Covered by `mappers.test.ts`.

## Content sanitization

- No backend-provided HTML, CSS, or JavaScript is ever rendered. Rich content is
  stored as sanitized structured text and rendered by React (auto-escaped).
- Public-content URLs are constrained to `http(s)` (`publicContent.ts`
  `safeUrlSchema`).
- Untrusted SVG is not rendered inline.
- `shared/sanitize.ts` strips control chars, caps lengths, and can strip HTML.

## Spreadsheet import

- Parsers read **literal cell values only** — no formula/macro/HTML/script
  evaluation.
- File size, worksheet, row, and column limits guard against resource
  exhaustion.
- Future CSV exports are guarded against **formula injection** (`guardCsvCell`,
  `csvField`).

## Untrusted code

Advanced code/SQL/simulation types are **contracts only**; the browser never
evaluates candidate submissions. A real runtime must sandbox execution
server-side.

## Authorization

- Frontend permission guards (`features/shared/permissions.ts`) improve UX
  (hiding actions) but **do not replace backend authorization**, which must
  independently enforce every write.
- Roles map to view/create/edit/publish/close/archive/import/manage/analytics.

## Secrets

- No Apps Script secret is read, printed, or logged by the client; the endpoint
  URL is the only configuration.
- No service-role or R2 keys exist in the frontend; `.env.example` documents that
  privileged secrets must never be `VITE_`-prefixed.
- Errors shown to users are normalized, human messages — never stack traces.
- Answer keys and sensitive payloads are never logged (audit log stores only
  non-sensitive summaries/metadata).

## Personal data kept on the device (Documentación)

The module keeps a **local copy of expediente detail** so that opening a file is
instant and so that work can continue with no connection. That copy contains
third-party personal data — name, ID number, position, document status — so it is
bounded on purpose:

- **Where.** IndexedDB, falling back to `localStorage` only if IndexedDB is
  unavailable. In memory it is an LRU map capped at 120 files.
- **How long.** 30 minutes. Entries are also versioned, so a schema change
  discards the old dump instead of reading it.
- **Whose.** The cache belongs to a profile: `cambiarPerfilCache` **wipes it when
  the signed-in person changes**. There is no reason for one person's queries to
  stay on the device once another person is using it.
- **What it is not.** No credentials, no endpoint secrets and no audit trail are
  cached; the endpoint URL remains the only configuration.
- **How to clear it by hand.** `Configuración > ¿Algo va mal? > Vaciar la copia
  local`, which also drops the outbound queue after warning about pending
  changes.

The **outbound queue** (`state/colaSalida.ts`) persists changes that could not be
written because the network failed. It stores the change, not the whole file, and
survives a reload on purpose: the alternative is losing what somebody typed. It
is emptied when the connection returns, and the UI never reports something as
saved while it is still queued.

## Synchronization safety

Writes carry `expectedEntityVersion`; the backend rejects stale updates with a
`conflict` code and the UI surfaces the conflict instead of silently
overwriting.
