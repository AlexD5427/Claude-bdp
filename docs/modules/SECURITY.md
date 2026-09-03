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

## Local caches (Documentación)

The Documentación module keeps two local stores. Both hold personal data, so what
they contain and when they are erased is a security decision, not an
implementation detail.

**`state/cacheExpedientes.ts`** — up to 40 full `ExpedienteOperativo` payloads in
an in-memory LRU, persisted to IndexedDB (`bdp-documentacion-cache`) with a
`localStorage` fallback. That payload includes names, ID numbers, positions,
branches, observations and document history. Rules:

- **Two lifetimes.** 60 s "fresh" (shown without revalidating) and 24 h "useful"
  (still shown, marked with its age, when the backend is unreachable). Nothing
  older is served.
- **Erased on profile change and on sign-out.** `DocumentacionConsola` calls
  `vaciarCache()` when the active profile changes. Leaving one person's records
  readable to the next operator of the same browser would be a leak even though
  the UI would not show them.
- **Erased on schema bump.** `VERSION_CACHE` discards everything when the payload
  shape changes, so a stale entry can never be rendered as if it were current.
- **Erasable by hand.** Configuración › Esta pantalla › *Vaciar caché local*.

**`state/salida.ts`** — the outbound write queue in `localStorage`
(`bdp-documentacion-salida`). It stores only requirement changes (id, state,
observation, sheet count) plus a stable `solicitudId`, never a full record. Only
**unconfirmed** entries are persisted: what already reached the book is dropped, so
the key cannot grow without bound.

The *Descargar respaldo* button writes both stores to a local JSON file that the
operator chooses. Nothing is uploaded anywhere: it is a local export, meant for
carrying work before clearing anything or for attaching to a support request.

## Synchronization safety

Writes carry `expectedEntityVersion`; the backend rejects stale updates with a
`conflict` code and the UI surfaces the conflict instead of silently
overwriting.
