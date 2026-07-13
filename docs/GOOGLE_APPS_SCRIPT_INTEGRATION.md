# Google Apps Script Integration

The ATS already ships a single Apps Script web app (`docs/backend/Code.gs`)
deployed at the URL in `src/constants.ts` (`SCRIPT_URL`). ProcessOS and
AssessmentOS **reuse** it rather than introducing a new endpoint.

## Client

`src/infrastructure/providers/appsScriptClient.ts` wraps `fetch` with the ATS's
proven conventions and adds robustness:

- `redirect: "follow"` (Google returns a 302 that must be followed on Vercel).
- `text/plain` POST body to avoid the CORS preflight the default Apps Script
  deployment cannot answer.
- Timeout via `AbortController` (default 20 s).
- **Reads** (`getJson`, GET) retry up to twice with backoff (idempotent).
- **Writes** (`postJson`, POST) are **not** auto-retried; creates carry an
  `idempotencyKey` (the client-generated id) so the backend can dedupe.
- Response validation + normalisation into a common envelope; the legacy
  `{status:"success"|"error"}` shape is also normalised.

## Envelope

`providers/envelope.ts` defines `{ success, data?, error?, requestId?,
timestamp?, schemaVersion? }`. The client coerces both the new envelope and the
legacy shape into it.

## Operations

- Processes: `listProcesses` (GET `?resource=procesos`), `getProcess`,
  `createProcess`, `updateProcess`, `publish/pause/close/archive` (via
  `transition`), `duplicateProcess`, `remove`.
- Assessments: `listAssessments` (GET `?resource=evaluaciones`),
  `getAssessment`, `createAssessment`, `updateAssessmentDraft`,
  `publishAssessmentVersion`, `pause/archive` (via `transition`),
  `duplicateAssessment`, `remove`.

The POST body uses `{ type: "proceso" | "evaluacion", action, row, id, version,
idempotencyKey }`. See `docs/backend/Code.gs` (`handleProceso_`,
`handleEvaluacion_`).

## Resilient fallback

If the deployed script has not yet been updated with the new handlers, the first
list attempt fails and the store falls back to the **local mock provider** for
the session (a dev-only toast explains this). This keeps both modules fully
usable before the backend is redeployed.

## Deploying the backend update

Paste the full `docs/backend/Code.gs` into the Apps Script editor and redeploy:
*Implementar → Administrar implementaciones → Editar → Nueva versión*, keeping
"Cualquiera con el enlace". The handlers auto-create the `Procesos` and
`Evaluaciones` sheets and add any missing columns non-destructively.

## Secrets

The Apps Script URL is a public web-app endpoint (already shipped). There are no
privileged secrets in this SPA. Any future secret must stay server-side and
never be referenced from a `VITE_`-prefixed variable.
