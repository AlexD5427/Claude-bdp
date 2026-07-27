# Plan de implementación

Fases pequeñas y verificables. Cada fase termina con `npx tsc -b --noEmit` y
`npx vitest run` en verde antes de continuar. El plan se ejecuta completo sin
esperar aprobación intermedia.

## Fase 0 — Auditoría (completada)

- [x] Inventario del repositorio, herramientas y línea base de verificación.
- [x] `CURRENT_STATE.md`, `IMPACT_MAP.md`, `IMPLEMENTATION_PLAN.md`,
      `DECISIONS.md`, `PROGRESS.md`.
- [x] Línea base: `tsc` limpio, 89/89 pruebas en verde.

**Verificación:** los documentos citan archivos y líneas reales.

## Fase 1 — Modelo de datos y contrato de API

- [ ] `docs/evaluations/DATA_MODEL.md`: hojas `Assessments`, `Sections`,
      `Questions`, `Options`, `Versions`, `Attempts`, `Answers`,
      `ProcessedRequests`, `AuditLog` con encabezados exactos.
- [ ] `docs/evaluations/API_CONTRACT.md`: acciones administrativas y públicas con
      ejemplos de solicitud/respuesta y códigos de error.
- [ ] `src/features/assessments/domain/attempts.ts`: `Attempt`, `Answer`,
      estados `automatically_graded | pending_manual_review | fully_graded`.

**Verificación:** `tsc` limpio; los encabezados del documento coinciden byte a
byte con las constantes de `Config.gs` (comprobado por prueba automatizada).

## Fase 2 — Backend Apps Script

- [ ] `Config.gs` (nombres de hojas, encabezados, propiedades de script).
- [ ] `Response.gs` (envoltorio uniforme), `IdService.gs` (prefijos `asm_`,
      `qst_`, `opt_`, `sec_`, `ver_`, `att_`, `ans_`, `req_`, `aud_`).
- [ ] `SheetRepository.gs`: lectura **por nombre de encabezado**, escritura por
      lotes, verificación de esquema, sin usar números de fila como identidad.
- [ ] `Validation.gs`: validación de carga para guardar y para publicar, catálogo
      de tipos de pregunta con sus capacidades.
- [ ] `Sanitize.gs`: proyección pública explícita.
- [ ] `Auth.gs`: interfaz de autorización (identidad de Google Workspace o modo
      abierto con advertencia explícita).
- [ ] `RequestService.gs` (idempotencia), `AuditService.gs`.
- [ ] `AssessmentService.gs` (CRUD, duplicar, publicar, archivar, resultados).
- [ ] `PublicAssessmentService.gs` (listado y detalle saneados, solo publicadas).
- [ ] `AttemptService.gs` + `ScoringService.gs` (calificación en servidor).
- [ ] `Router.gs`, `Code.gs` (`doGet`/`doPost`), `Setup.gs`, `Tests.gs`.
- [ ] `appsscript.json.example`.

**Verificación:** arnés `scripts/run-apps-script.mjs` que carga los `.gs` en Node
con `SpreadsheetApp`, `LockService`, `PropertiesService` y `Utilities`
simulados; suite `apps-script.test.ts` que ejercita idempotencia, bloqueo,
saneamiento, calificación 100 / 0 / 66.67, opción ajena, pregunta ajena, datos de
puntaje manipulados y verificación de encabezados.

## Fase 3 — Capa de servicios del frontend

- [ ] `api/contract.ts`, `api/transport.ts`, `api/dto.ts`, `api/adminApi.ts`,
      `api/publicApi.ts`, `api/mapper.ts`.
- [ ] Ampliar `AssessmentRepository` con `listResults` / `getAttemptDetail`.
- [ ] `MockAssessmentService` (encapsula el mock existente) y
      `AppsScriptAssessmentService` (API normalizada nueva).
- [ ] `getAssessmentRepository()` con bandera propia del módulo.
- [ ] Banderas y `.env.example`.

**Verificación:** pruebas de `adminApi` con `fetch` simulado (envoltorio, error
tipado, `requestId`, sin reintento en escrituras) y de `mapper` (ida y vuelta).

## Fase 4 — Capacidades por tipo de pregunta

- [ ] `capabilities` en `QuestionPlugin` (opciones, mínimo, exactamente una
      correcta, opciones fijas, calificación automática/manual/ninguna, claves
      públicas de configuración, esquema de configuración con versión).
- [ ] Retirar las listas de tipos codificadas en `BlockRenderer`,
      `BuilderInspector` y `validateContent`.
- [ ] `QUESTION_TYPES.md` como fuente de verdad.
- [ ] Prueba de paridad: el catálogo de `Validation.gs` cubre todos los tipos del
      registro.

**Verificación:** `tsc` + prueba de paridad + pruebas de scoring existentes.

## Fase 5 — Validación de publicación navegable

- [ ] `domain/publish.ts`: hallazgos `{ id, severity, code, message, hint,
      target: { section, questionId, field } }`.
- [ ] `validateContent` sigue devolviendo `errors`/`warnings` (compatibilidad) y
      añade `findings`.
- [ ] Reglas: título, ≥1 pregunta activa, texto de pregunta, tipo permitido, ≥2
      opciones activas, opciones con texto, exactamente una correcta, posiciones
      consecutivas, IDs únicos, duración nula o > 0, nota mínima nula o 0–100.

**Verificación:** una prueba por regla de rechazo.

## Fase 6 — Rediseño del constructor

- [ ] `BuilderHeader`, `BuilderNav`, `SaveStatus`, `AssessmentSummaryCard`.
- [ ] `AssessmentSettingsPanel` (título, descripción, instrucciones, duración,
      nota mínima, acceso, código público, versión, metadatos).
- [ ] `QuestionNavigator` (número, resumen, tipo, validez, obligatoria, búsqueda,
      filtro, reordenar, contraer).
- [ ] `QuestionEditor` + `OptionEditor` + `QuestionProperties`.
- [ ] `ReviewPanel` con navegación al campo.
- [ ] `PublishDialog`.
- [ ] `useAssessmentDraft`: dirty, recuperación local, autoguardado opcional con
      debounce y anti-carrera, guardia de salida.
- [ ] Vista previa del candidato sin crear intentos.

**Verificación:** pruebas de render y de interacción con Testing Library en tema
claro y oscuro, `prefers-reduced-motion`, navegación por teclado y ausencia de
errores de consola.

## Fase 7 — Listado y resultados

- [ ] Filtros por estado/categoría, orden por actualización, acciones por fila y
      por tarjeta, confirmación de archivado, reanudar borrador, indicador de
      origen de datos.
- [ ] `ResultsPanel` de solo lectura (los datos vienen de la API; sin métricas
      inventadas cuando no hay intentos).

**Verificación:** pruebas de listado, vacío, error con reintento y filtros.

## Fase 8 — Documentación y verificación final

- [ ] Los quince documentos de `docs/evaluations/` + `QUESTION_TYPES.md`,
      `VISUAL_AUDIT.md`, `UX_ARCHITECTURE.md`, `MOTION_SYSTEM.md`,
      `VISUAL_QA.md`.
- [ ] `scripts/check-evaluations.mjs` y `scripts/visual-qa.mjs`.
- [ ] `npx tsc -b --noEmit`, `npm run build`, `npm test`, `npm run check`.
- [ ] Revisión del `git diff` completa: archivos inesperados, secretos, `TODO`,
      `any`, `fetch` en componentes, mocks en modo real.
- [ ] PR en borrador con enlace al documento explicativo.

## Continuidad

Si la sesión se acerca al límite de contexto, `PROGRESS.md` se actualiza antes de
continuar: contiene la fase activa, lo hecho, lo pendiente y los comandos de
verificación exactos para retomar.
