# APPS_SCRIPT_INTEGRATION

ProcessOS and AssessmentOS reuse the existing Google Apps Script web app
(`SCRIPT_URL` in `src/constants.ts`) and its established request conventions.

## Request conventions (unchanged)

- **GET** for reads: `redirect: "follow"` (Google issues a 302), `Accept:
  application/json`.
- **POST** with `Content-Type: text/plain;charset=utf-8` to avoid the CORS
  preflight the default Apps Script deployment cannot answer. Body is JSON.

## Client

`infrastructure/providers/google-apps-script/client.ts` wraps fetch with:

- a timeout via `AbortController` (composed with any external signal),
- small exponential-backoff retries **for idempotent GET reads only** (writes are
  not auto-retried to avoid duplicate side effects),
- response-envelope normalization (`shared/envelope.ts#fromLegacy` maps the
  legacy `{ status, message, ... }` shape to a typed envelope),
- normalized errors (`network | timeout | provider | ...`),
- an `idempotencyKey` on writes so the backend can dedupe when supported.

## Endpoints

Reads (GET query `action`):

| action | response `data` |
| --- | --- |
| `list_procesos` | `{ rows: ProcesoRow[] }` |
| `get_proceso&id=` | `{ row: ProcesoRow }` |
| `list_evaluaciones` | `{ rows: EvaluacionRow[] }` |
| `get_evaluacion&id=` | `{ row: EvaluacionRow }` |

Writes (POST body):

| body | action |
| --- | --- |
| `{ type:"proceso", action:"create", row }` | append row |
| `{ type:"proceso", action:"update", row, expectedEntityVersion }` | upsert with stale-update check |
| `{ type:"proceso", action:"publish"\|"pause"\|"close"\|"archive", id, by }` | lifecycle transition |
| `{ type:"proceso", action:"duplicate", id, by }` | clone as fresh draft |

`type:"evaluacion"` mirrors these, plus `action:"rollback"` (re-point the served
version) and `publish` which stamps `FechaPublicacion`.

## Response envelope

The backend answers `{ status: "success" | "error", ...data }` (legacy) or a
full envelope `{ success, data, error, requestId, timestamp, schemaVersion }`.
`fromLegacy` normalizes both. On `action:"update"`, a stale row yields
`{ status:"error", code:"conflict" }`, which the UI surfaces as a conflict rather
than overwriting.

## Backend module

`docs/backend/Code.gs` was extended (non-destructively) with:

- routing in `doGet` (before the heavy payload) and `doPost` (`type` switch),
- `handleTalentGet_`, `handleProceso_`, `handleEvaluacion_`, and shared
  `taHandleEntity_` logic that creates the `Procesos` / `Evaluaciones` sheets on
  demand, upserts by `ID`, enforces the `VersionEntidad` stale-update check, and
  handles lifecycle transitions and duplication.

Paste the updated `Code.gs` into the Apps Script editor and redeploy (Implementar
→ Administrar implementaciones → Editar → Nueva versión, "Cualquiera con el
enlace"). No secrets are stored or transmitted by the client.

## Mock provider

Until the backend is redeployed, `VITE_DATA_PROVIDER=mock` (the default) runs the
whole flow against seeded, localStorage-backed data so the modules are fully
usable offline.
