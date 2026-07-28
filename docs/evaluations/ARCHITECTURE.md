# Arquitectura del módulo Evaluaciones

## Vista de conjunto

```
┌───────────────────────── Navegador (panel del reclutador) ─────────────────────────┐
│                                                                                    │
│  ui/EvaluacionesModule ── builder/AssessmentBuilder ── ui/AssessmentPreview        │
│         │                        │                            │                    │
│         └────────────┬───────────┴────────────┬───────────────┘                    │
│                      ▼                        ▼                                    │
│        application/assessmentService    domain/publish · domain/attempts           │
│                      │                  question-types/registry (capacidades)      │
│                      ▼                                                             │
│         infrastructure/providers → getAssessmentRepository()                        │
│                      │                                                             │
│         ┌────────────┴─────────────┐                                               │
│         ▼                          ▼                                               │
│  MockAssessmentService    AppsScriptAssessmentService                               │
│  (localStorage, demo)       │  api/mapper  ·  api/adminApi  ·  api/transport        │
└─────────────────────────────┼──────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴────────────────┐
   acciones   │                                │  acciones administrativas
   públicas   │                                │  (cookie de sesión, sin secretos)
              │                                ▼
              │      ┌──── Backend intermedio (api/evaluations, Vercel) ────┐
              │      │  session.ts  frase de acceso → cookie HttpOnly        │
              │      │  admin.ts    ¿sesión? ¿acción admin? → firma HMAC     │
              │      │  _lib/appsScriptSignature.ts  ÚNICO lugar con secreto │
              │      └───────────────────────┬───────────────────────────────┘
              │                              │  POST text/plain + auth firmado
              ▼                              ▼
┌──────────────────── Google Apps Script (apps-script/evaluations) ──────────────────┐
│  Code.gs → Router.gs → Auth.gs ─→ AuthProviders.gs (server_secret │ google_identity │
│                          │           │                            │ open_admin)     │
│                          │           └→ Signature.gs (HMAC, frescura, anti-replay)  │
│                          ▼                                                          │
│                    RequestService.gs (Lock + idempotencia)                          │
│        ┌────────────────────────────┼───────────────────────────┐                  │
│        ▼                            ▼                           ▼                  │
│  AssessmentService          PublicAssessmentService        AttemptService           │
│  (CRUD, publicar)          (Sanitize.gs)                  ScoringService           │
│        └────────────┬───────────────┴───────────────┬──────────┘                   │
│                     ▼                               ▼                               │
│              SheetRepository.gs              AuditService.gs                        │
└─────────────────────┼───────────────────────────────────────────────────────────────┘
                      ▼
        Google Sheets: Assessments · Sections · Questions · Options · Versions
                       Attempts · Answers · ProcessedRequests · AuditLog
```

## Autenticación, autorización y negocio

Las tres capas están separadas a propósito, y la de negocio **no sabe** cómo se
autorizó la llamada:

```
Autenticación   ¿quién eres?      · backend intermedio: frase de acceso → sesión
                                  · o Google Workspace, si algún día hay login
       ↓
Autorización    ¿puedes hacerlo?  · Auth.gs clasifica la acción (admin / pública)
                                  · AuthProviders.gs comprueba con el proveedor activo
       ↓
Negocio         qué se hace       · AssessmentService, AttemptService, ScoringService
                                    reciben solo un `actor` (etiqueta de bitácora)
```

### Proveedores de autorización

Un proveedor es un objeto con esta interfaz (`AuthProviders.gs`):

```js
{
  id, label,
  identify(request)      → etiqueta NO privilegiada del actor
  authorizeAdmin(request) → { actor, trust, warnings }  ó lanza FORBIDDEN
  describe()             → diagnóstico seguro para `ping`
}
```

| Proveedor | Cuándo | Cómo comprueba |
| --- | --- | --- |
| `server_secret` **(por omisión)** | El ATS real: React en Vercel, sin Google Login. | Firma HMAC-SHA256 emitida por el backend intermedio, con ventana de frescura de 5 min y nonce de un solo uso. |
| `google_identity` | Despliegues con sesión de Google Workspace. | `Session.getActiveUser()` + lista blanca `EVALUATIONS_ADMIN_EMAILS`. |
| `open_admin` | Solo pruebas. | Nada; exige `ALLOW_ANONYMOUS_ADMIN=true` y marca cada respuesta con `INSECURE_ADMIN_MODE`. |
| `local_execution` | Funciones del editor (`Setup.gs`). | No es seleccionable por configuración; solo se alcanza desde `evalHandleTrustedRequest_()`. |

Añadir Google Login, OIDC u OAuth de candidatos en el futuro es **registrar otro
proveedor**. Ni el enrutador ni los servicios cambian.

### Reparto de responsabilidades del backend intermedio

| Componente | Sabe | No sabe |
| --- | --- | --- |
| React (bundle público) | qué operación quiere el usuario | ningún secreto, ninguna firma |
| `api/evaluations/session.ts` | la frase de acceso del panel, cómo firmar cookies | reglas de negocio |
| `api/evaluations/admin.ts` | el secreto compartido, qué acciones son administrativas | validaciones, hojas, calificación |
| Apps Script | todo lo anterior es irrelevante: verifica la firma y aplica el negocio | quién es el usuario más allá de la etiqueta `actor` |

## Reglas de dependencia

1. **Ningún componente hace HTTP.** El único `fetch` del módulo está en
   `api/transport.ts`. Lo verifica `scripts/check-evaluations.mjs`.
2. **La UI depende de servicios, no de proveedores.** `EvaluacionesModule` llama a
   `application/assessmentService`, que resuelve el repositorio con
   `getAssessmentRepository()`.
3. **El dominio no conoce la hoja de cálculo.** Los mapeadores (`api/mapper.ts`)
   son la única frontera entre el agregado `AssessmentDefinition` y el esquema
   plano de la API.
4. **Apps Script es la autoridad.** El frontend valida lo mismo para dar
   retroalimentación inmediata, pero el servidor vuelve a validar todo y su
   respuesta gana (los hallazgos del servidor aparecen en el mismo panel de
   revisión, con los mismos códigos).
5. **El navegador no custodia secretos.** `src/` no puede importar nada de
   `api/`, y `api/` no lee variables `VITE_`. Lo verifica
   `scripts/check-evaluations.mjs` (reglas `frontend-importa-backend` y
   `api-usa-variable-publica`).
6. **El transporte decide el destino, no el llamador.** `api/transport.ts` envía
   las acciones administrativas al backend intermedio y las públicas
   directamente a Apps Script, a partir de una única lista
   (`api/adminActions.ts`). Una prueba comprueba que esa lista coincide con la del
   proxy y con `EVAL_ADMIN_ACTIONS`.

## Selección de proveedor

```
VITE_ASSESSMENTS_PROVIDER ?? VITE_DATA_PROVIDER   →   mock | google-apps-script | supabase
```

`getAssessmentRepository()` resuelve el repositorio; `getAssessmentProviderName()`
alimenta el indicador que el módulo muestra en pantalla. Los datos de
demostración solo se alcanzan por `MockAssessmentService`, así que **no puede
haber una mezcla silenciosa** entre demo y datos reales.

## El agregado del dominio

`AssessmentDefinition` (ya existente, no se cambió su forma) tiene:

- Identidad y metadatos (`id`, `code`, `name`, `category`, `lifecycle`, …).
- Diez políticas independientes (`attemptPolicy`, `timingPolicy`, …).
- `draftVersion`: la versión de trabajo, siempre editable.
- `publishedVersions[]`: versiones inmutables ya publicadas.
- `currentPublishedVersionId`: la que reciben los candidatos nuevos.

**Pérdida deliberada de información:** la API no devuelve el contenido de los
snapshots publicados (pueden ser grandes y solo el servidor los necesita para
calificar). `publishedVersions` llega con sus metadatos y contenido vacío. Cuando
eso ocurre, la clasificación del cambio (menor vs. mayor) la hace el servidor al
publicar, y la interfaz no adelanta un veredicto que no puede calcular.

## Contenido: secciones, bloques y capacidades

El contenido de una versión es `sections[] → blocks[] → options[]`. Un *bloque*
es la unidad universal: los bloques de contenido y las preguntas comparten la
misma forma, y el plugin decide qué campos usa.

Cada tipo declara sus **capacidades** (`question-types/registry.ts`), y toda la
interfaz las consulta en lugar de contener listas de claves de tipo. Eso es lo
que permite que añadir un tipo no obligue a tocar el renderizador, el editor de
opciones ni el validador. El servidor tiene su catálogo equivalente en
`Validation.gs`, y una prueba de paridad impide que se separen.

## Flujo de una escritura

```
Usuario pulsa «Guardar borrador»
  → useAssessmentDraft.save()            (anti doble clic, token anti-carrera)
  → EvaluacionesModule.save()
  → saveAssessmentDraft()                (valida con Zod, registra auditoría local)
  → AppsScriptAssessmentService.updateDraft()
  → toUpdatePayload()                    (aplana y normaliza posiciones)
  → apiWrite("updateAssessment", requestId)   (sin reintento automático)
  → /api/evaluations/admin        (comprueba la sesión y FIRMA la operación)
  → Router.gs
      1. Autorización (verifica la firma; el negocio solo recibe `actor`)
      2. ScriptLock (25 s máx.)
      3. ¿requestId ya procesado? → responde la referencia anterior
      4. evalValidateSavePayload_        (forma, ids, referencias, rangos)
      5. Concurrencia optimista (entity_version)
      6. Escritura por lotes + bajas lógicas
      7. ProcessedRequests + AuditLog
      8. Liberación del bloqueo en finally
  → devuelve el bundle completo
  → toAssessmentDefinition()             (Zod valida la respuesta)
  → el constructor recibe el nuevo baseline y `dirty` vuelve a false
```

## Flujo de un intento (futuro portal de candidatos)

```
Portal → getPublicAssessment(publicCode)         (solo publicadas; DTO saneado)
Portal → startAttempt(requestId)                 (opcional; ancla la versión)
Portal → submitAttempt(requestId, answers)
           · descarta score/passed/isCorrect/pointsAwarded del cliente
           · verifica pertenencia de preguntas y opciones
           · lee la clave del SNAPSHOT de la versión anclada
           · ScoringService calcula la nota
           · guarda Attempt + Answers, audita, registra el requestId
Reclutador → listAssessmentResults / getAttemptDetail   (superficie administrativa)
```

## Estados de calificación

| Estado | Cuándo | `score` | `passed` |
| --- | --- | --- | --- |
| `automatically_graded` | Todas las preguntas calificables eran objetivas. | Calculado | Si hay nota mínima |
| `pending_manual_review` | Hay preguntas sin criterio objetivo. | **Vacío** | Vacío |
| `fully_graded` | Un revisor cerró la calificación manual. | Definitivo | Si hay nota mínima |

`auto_score` guarda siempre la nota de la parte objetiva, así que el pendiente no
pierde información.

## Componentes del constructor

| Componente | Responsabilidad |
| --- | --- |
| `AssessmentBuilder` | Cáscara: pasos, estado, diálogos, orquestación. |
| `BuilderHeader` | Volver, identidad, estado de guardado, guardar / revisar / publicar. |
| `BuilderNav` | Pasos con contador de errores y progreso. |
| `AssessmentSettingsPanel` | Identidad (general) y aplicación (configuración). |
| `QuestionNavigator` | Índice, búsqueda, filtros, reordenamiento, contracción. |
| `QuestionEditor` | Pregunta activa: enunciado, tipo, obligatoriedad, opciones, avanzado. |
| `OptionEditor` | Opciones: CRUD, orden, correcta exclusiva, opciones fijas. |
| `QuestionProperties` | Puntuación, peso, competencia, código, ayuda de calificación. |
| `ReviewPanel` | Hallazgos agrupados y navegables + resumen. |
| `PublishDialog` | Confirmación con resumen y notas de versión. |
| `SaveStatus` | Estado con etiqueta, icono y `aria-live`. |
| `useAssessmentDraft` | Cambios pendientes, borrador local, autoguardado, guardias. |
| `AssessmentPreview` | Vista previa del candidato + modo administrativo. |
| `ComponentLibrary` | Biblioteca de tipos (se conservó del diseño anterior). |
| `ImportWizard` | Importación de hojas de cálculo (se conservó). |

## Rendimiento

- Solo se monta el **editor de la pregunta activa**. El índice renderiza filas
  ligeras. Una prueba abre una evaluación de 150 preguntas y comprueba que no se
  monta ningún editor hasta seleccionar una.
- La validación completa se memoriza con `useMemo` sobre el contenido.
- La búsqueda del listado tiene debounce de 250 ms; el borrador local, 600 ms; el
  autoguardado opcional, 2,5 s.
- El módulo se carga con `React.lazy` desde `App.tsx` (ya era así).

## Preparación para el portal de candidatos

`api/publicApi.ts` implementa el contrato público completo y está probado desde
este repositorio, incluida la comprobación de que no expone claves de respuesta.
El portal solo necesita ese archivo (o su equivalente) y la URL del Web App. Ver
`PORTAL_CANDIDATES_HANDOFF.md`.
