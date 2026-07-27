# Contrato de API — Evaluaciones

Un solo Web App de Google Apps Script (`apps-script/evaluations/`) atiende dos
superficies: la **administrativa** (constructor del reclutador) y la **pública**
(futuro portal de candidatos).

## Transporte

| Aspecto | Valor |
| --- | --- |
| Escrituras | `POST` con `Content-Type: text/plain;charset=utf-8` y cuerpo JSON. Es obligatorio: el despliegue por omisión de Apps Script no responde al *preflight* de CORS que dispararía `application/json`. |
| Lecturas públicas | `GET ?action=<acción>&payload=<JSON codificado en URL>`; también admite `POST`. |
| Redirecciones | Toda petición debe usar `redirect: "follow"`. Google responde `302`; sin seguirlo la app falla con `404` en producción (regla ya vigente en este repositorio). |
| Tiempo de espera | 15 000 ms en el cliente, con `AbortController`. |
| Reintentos | Solo lecturas idempotentes (`GET`), con retroceso exponencial 600/1200 ms. **Las escrituras nunca se reintentan automáticamente**; el `requestId` permite reintentar a mano sin duplicar efectos. |

## Envoltorio

### Solicitud

```json
{
  "action": "createAssessment",
  "requestId": "req_1f0b6f2e-8f7b-4f36-9a0f-1c2d3e4f5a6b",
  "payload": { }
}
```

`requestId` es obligatorio en toda escritura. El cliente lo genera con
`crypto.randomUUID()` y lo reutiliza si reintenta la misma operación.

### Éxito

```json
{
  "ok": true,
  "requestId": "req_1f0b…",
  "data": { },
  "error": null,
  "warnings": []
}
```

### Error

```json
{
  "ok": false,
  "requestId": "req_1f0b…",
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "La evaluación no puede publicarse todavía.",
    "details": { "issues": [ { "code": "MISSING_TITLE", "path": "title" } ] }
  }
}
```

`message` siempre es un texto seguro para mostrar (es-MX) y nunca incluye rastros
de pila, rutas internas ni contenido de otras entidades.

### Códigos de error

| Código | HTTP equivalente | Significado |
| --- | --- | --- |
| `VALIDATION_ERROR` | 422 | La carga no cumple el esquema o las reglas de publicación. `details.issues[]`. |
| `NOT_FOUND` | 404 | La entidad no existe o no es visible para el llamador. |
| `CONFLICT` | 409 | `expectedEntityVersion` desactualizado, o transición de estado no permitida. |
| `FORBIDDEN` | 403 | Autorización insuficiente. |
| `SCHEMA_ERROR` | 500 | Falta un encabezado obligatorio en la hoja. Ejecuta `verifySchema`. |
| `LOCK_TIMEOUT` | 503 | No se pudo obtener el bloqueo de escritura en 25 s. |
| `UNSUPPORTED_ACTION` | 400 | Acción desconocida. |
| `BAD_REQUEST` | 400 | JSON inválido o falta `action` / `requestId`. |
| `INTERNAL_ERROR` | 500 | Error inesperado (registrado en la auditoría). |

### Advertencias

`warnings` es un arreglo de códigos, nunca bloqueante:

- `IDEMPOTENT_REPLAY` — el `requestId` ya se había procesado; no se repitió el efecto.
- `INSECURE_ADMIN_MODE` — el servidor está en modo administrativo abierto.
- `LEGACY_ANSWER_KEY_SOURCE` — se calificó leyendo `Options` porque la versión
  anclada no tiene snapshot.

---

## Acciones administrativas

Todas exigen autorización (`Auth.gs`). Ninguna devuelve datos de otra evaluación.

### `listAdminAssessments`

```jsonc
// payload
{ "search": "riesgo", "status": ["draft","published"], "includeArchived": false }
// data
{
  "items": [{
    "assessmentId": "asm_…", "publicCode": "EVL-PRES-4F2A",
    "title": "Preselección · Analista de Riesgo", "status": "published",
    "lifecycleStatus": "published", "publicationStatus": "published",
    "category": "pre_screening", "versionLabel": "v1.0",
    "questionCount": 12, "durationMinutes": 25, "passingScore": 70,
    "updatedAt": "2026-07-27T…", "updatedBy": "Reclutamiento",
    "entityVersion": 7, "tags": [], "linkedProcessCount": 1
  }],
  "total": 1,
  "syncedAt": "2026-07-27T…"
}
```

### `getAdminAssessment`

`payload: { "assessmentId": "asm_…" }` → la evaluación completa, **con** claves de
respuesta (`isCorrect`), retroalimentación e instrucciones internas.

```jsonc
{
  "assessment": { /* campos de Assessments en camelCase */ },
  "sections":  [{ "sectionId":"sec_…", "title":"…", "position":0, … }],
  "questions": [{ "questionId":"qst_…", "sectionId":"sec_…", "questionText":"…",
                  "questionType":"q_single_choice", "position":0, "required":true,
                  "scoringMode":"exact", "maxPoints":1, "active":true,
                  "configuration":{}, "validation":{}, "feedback":{}, … }],
  "options":   [{ "optionId":"opt_…", "questionId":"qst_…", "optionText":"…",
                  "position":0, "isCorrect":true, "scoreValue":1, "active":true }],
  "versions":  [{ "versionId":"ver_…", "versionLabel":"v1.0", "publishedAt":"…",
                  "questionCount":12, "gradableQuestionCount":10 }]
}
```

### `createAssessment`

`payload: { "title": "…", "category": "knowledge", "actor": "…" }`
→ `{ "assessment": … , "sections": […] }` (crea la evaluación en `draft` con una
sección inicial). El servidor genera `assessment_id` y `public_code`.

### `updateAssessment`

Escritura completa e idempotente del borrador.

```jsonc
{
  "assessmentId": "asm_…",
  "expectedEntityVersion": 7,
  "assessment": { "title":"…", "description":"…", "instructions":"…",
                  "durationMinutes": 25, "passingScore": 70,
                  "accessType":"public", "category":"knowledge",
                  "tags":[], "policies":{…}, "theme":{…}, "rules":[], "rubrics":[],
                  "internalInstructions":"…" },
  "sections":  [ … ],
  "questions": [ … ],
  "options":   [ … ],
  "actor": "…"
}
```

- Un **borrador puede estar incompleto**: se valida la forma (tipos, ids únicos,
  referencias, posiciones), no la completitud de publicación.
- `expectedEntityVersion` distinto del servidor → `CONFLICT`.
- Si la evaluación está `published`, la escritura **solo** afecta al borrador; el
  snapshot publicado es inmutable.

### `duplicateAssessment`

`payload: { "assessmentId": "asm_…", "actor": "…" }` → copia en `draft` con
**ids nuevos** para evaluación, secciones, preguntas y opciones, `public_code`
nuevo, sin versiones publicadas, sin intentos.

### `publishAssessment`

`payload: { "assessmentId":"asm_…", "expectedEntityVersion":7, "notes":"…", "actor":"…" }`

Valida las reglas completas de publicación. Si pasan, escribe un snapshot en
`Versions`, apunta `current_published_version_id`, ajusta `status`,
`lifecycle_status`, `publication_status`, `published_at` y devuelve la evaluación.
Si falla → `VALIDATION_ERROR` con `details.issues[]` navegables:

```jsonc
{ "issues": [
  { "code":"QUESTION_WITHOUT_CORRECT_OPTION", "path":"questions[3].options",
    "questionId":"qst_…", "message":"…" }
]}
```

### `archiveAssessment` · `unarchiveAssessment` · `pauseAssessment` · `closeAssessment`

`payload: { "assessmentId":"asm_…", "actor":"…" }`. Transiciones validadas contra
una matriz explícita; una transición imposible responde `CONFLICT`.

### `listAssessmentResults`

`payload: { "assessmentId":"asm_…", "gradingStatus":["pending_manual_review"] }`

```jsonc
{
  "attempts": [{ "attemptId":"att_…", "participantName":"…", "status":"submitted",
                 "score":66.67, "autoScore":66.67, "gradingStatus":"fully_graded",
                 "correctAnswers":2, "gradableQuestions":3, "passed":false,
                 "assessmentVersion":1, "submittedAt":"…" }],
  "summary": { "total":1, "graded":1, "pendingManualReview":0,
               "averageScore":66.67, "passRate":0 }
}
```

`summary` se calcula sobre los intentos reales. Si no hay intentos, todos los
agregados son `null` — **nunca se inventan métricas**.

### `getAttemptDetail`

`payload: { "attemptId":"att_…" }` → intento + respuestas + enunciados de la
versión anclada + `isCorrect`/`pointsAwarded` (superficie administrativa).

### `verifySchema`

Sin carga. Devuelve, por hoja: si existe, encabezados faltantes, encabezados
sobrantes y número de filas. Es la comprobación que pide `APPS_SCRIPT_SETUP.md`.

---

## Acciones públicas (portal de candidatos)

**Nunca** exigen autorización de administrador y **nunca** devuelven claves de
respuesta. Solo alcanzan evaluaciones con `status="published"` **y**
`publication_status="published"`.

### `listPublicAssessments`

`payload: { "processId": "prc_…" }` (opcional)

```jsonc
{ "items": [{ "publicCode":"EVL-PRES-4F2A", "title":"…", "description":"…",
              "durationMinutes":25, "questionCount":12, "versionLabel":"v1.0" }] }
```

No incluye `assessmentId` interno, `passingScore`, `createdBy`, `updatedBy`,
etiquetas internas ni instrucciones internas.

### `getPublicAssessment`

`payload: { "publicCode": "EVL-PRES-4F2A" }`

```jsonc
{
  "publicCode":"EVL-PRES-4F2A", "title":"…", "instructions":"…",
  "durationMinutes":25, "versionLabel":"v1.0", "assessmentVersion":1,
  "theme": { "accent":"cyan", "density":"comfortable", "showProgressBar":true },
  "navigation": { "mode":"free", "allowBack":true, "showProgress":true },
  "consent": { "requireConsent":false, "consentText":"", "requireDataPrivacyAcceptance":true },
  "sections": [{
    "sectionId":"sec_…", "title":"…", "description":"…", "position":0,
    "questions": [{
      "questionId":"qst_…", "questionType":"q_single_choice", "position":0,
      "questionText":"…", "helpText":"…", "required":true,
      "configuration": { "scaleMin":1, "scaleMax":5 },
      "media": null, "accessibility": { "ariaLabel":"", "longDescription":"" },
      "options": [ { "optionId":"opt_…", "optionValue":"a", "optionText":"…", "mediaUrl":null } ]
    }]
  }]
}
```

Campos **garantizadamente ausentes** (probado en
`appsScript.sanitization.test.ts` y `publicSanitization.test.ts`):
`isCorrect`, `is_correct`, `correct`, `correctAnswer`, `answerKey`,
`scoreValue`, `score`, `pointsAwarded`, `maxPoints`, `scoringMode`, `feedback`,
`createdBy`, `updatedBy`, `internalInstructions`, `passingScore`, `entityVersion`,
`tags`, `rubrics`, `rules`, y cualquier columna de auditoría. La única
configuración que se reenvía es la lista blanca de presentación.

### `startAttempt`

`payload: { "publicCode":"…", "participant": { "name":"…", "email":"…", "document":"…" } }`
→ `{ "attemptId":"att_…", "assessmentVersion":1, "versionId":"ver_…", "startedAt":"…" }`

Crea la fila del intento en `in_progress` anclada al snapshot vigente. Es
opcional: `submitAttempt` funciona sin ella.

### `submitAttempt`

```jsonc
{
  "action":"submitAttempt",
  "requestId":"req_…",
  "payload": {
    "publicCode":"EVL-PRES-4F2A",
    "attemptId":"att_…",                       // opcional
    "participant": { "name":"…", "email":"…", "document":"…" },
    "answers": [
      { "questionId":"qst_1", "selectedOptionId":"opt_3" },
      { "questionId":"qst_2", "value": "texto libre" }
    ],
    "userAgent":"…", "durationSeconds": 640
  }
}
```

Respuesta (según `resultVisibility.candidate`, por omisión el mínimo):

```jsonc
{ "attemptId":"att_…", "status":"submitted",
  "gradingStatus":"pending_manual_review", "received": 12 }
```

Reglas obligatorias que aplica el servidor:

1. Verifica que la evaluación exista, esté publicada y tenga snapshot.
2. Verifica que cada `questionId` pertenezca a la versión anclada.
3. Verifica que cada `selectedOptionId` pertenezca a esa pregunta.
4. Rechaza `questionId` repetidos (`VALIDATION_ERROR`).
5. **Descarta** cualquier `isCorrect`, `pointsAwarded`, `score` o `passed`
   enviado por el cliente.
6. Calcula la nota con `ScoringService.gs`.
7. Evita el doble procesamiento por `requestId`.
8. Nunca devuelve la clave de respuestas, ni siquiera al terminar.

---

## Correspondencia con el protocolo heredado

El Web App existente (`docs/backend/Code.gs`) usa `{ status, message }` y
`POST { type:"evaluacion", action, row }`. Ese protocolo **sigue funcionando y no
se modifica**. Correspondencia:

| Heredado | Nuevo |
| --- | --- |
| `{ status:"success", …resto }` | `{ ok:true, data:{…} }` |
| `{ status:"error", message }` | `{ ok:false, error:{ code, message } }` |
| `{ status:"error", code:"conflict" }` | `error.code = "CONFLICT"` |
| `GET ?action=list_evaluaciones` | `listAdminAssessments` |
| `GET ?action=get_evaluacion&id=` | `getAdminAssessment` |
| `POST type:"evaluacion" action:"create"` | `createAssessment` |
| `POST … action:"update"` + `expectedEntityVersion` | `updateAssessment` |
| `POST … action:"duplicate"/"publish"/"archive"` | `duplicateAssessment` / `publishAssessment` / `archiveAssessment` |
| — (no existía) | `listPublicAssessments`, `getPublicAssessment`, `startAttempt`, `submitAttempt`, `listAssessmentResults`, `getAttemptDetail`, `verifySchema` |

`src/shared/envelope.ts → fromLegacy()` se conserva intacto para Procesos; el
módulo de Evaluaciones usa el envoltorio nuevo en
`src/features/assessments/api/contract.ts`.
