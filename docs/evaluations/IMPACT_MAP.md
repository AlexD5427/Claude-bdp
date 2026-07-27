# Mapa de impacto

Clasificación hecha **después** de buscar todas las referencias e importaciones
de cada archivo (`grep -rn` sobre `src/`).

## 1 · Archivos que deben modificarse

| Archivo | Motivo | Consumidores que hay que respetar |
| --- | --- | --- |
| `src/features/assessments/ui/EvaluacionesModule.tsx` | Filtros, ordenamiento, acciones de fila en tarjetas, confirmaciones, origen de datos visible, reanudar borradores. | `src/features/assessments/index.ts` → `src/App.tsx` (lazy). |
| `src/features/assessments/ui/AssessmentToolbar.tsx` | Añadir filtros/orden y el indicador de origen. | Solo `EvaluacionesModule`. |
| `src/features/assessments/ui/AssessmentCards.tsx` | Métricas reales, menú de acciones, estado, autor. | Solo `EvaluacionesModule`. |
| `src/features/assessments/ui/AssessmentTable.tsx` | Columnas de duración/preguntas/autor + orden por encabezado. | Solo `EvaluacionesModule`. |
| `src/features/assessments/ui/AssessmentRowMenu.tsx` | Acciones contextuales por estado (editar borrador / ver publicada / duplicar / archivar). | `EvaluacionesModule`, `AssessmentCards`. |
| `src/features/assessments/ui/listState.ts` | Añadir orden y conectar los filtros existentes. | `EvaluacionesModule`, `EvaluacionesModule.test.tsx`. |
| `src/features/assessments/ui/AssessmentPreview.tsx` | Vista previa que no publica un borrador real, aviso de «vista previa», viewport, modo administrador opcional. | `AssessmentBuilder`. |
| `src/features/assessments/builder/AssessmentBuilder.tsx` | Reescritura de la cáscara: encabezado, navegación, secciones, revisión, estado de guardado. | `EvaluacionesModule`. |
| `src/features/assessments/builder/BuilderInspector.tsx` | Delegar en el registro de capacidades; impedir dos respuestas correctas. | `AssessmentBuilder`. |
| `src/features/assessments/builder/BuilderCanvas.tsx` | Integración con el índice de preguntas y el enfoque de la pregunta activa. | `AssessmentBuilder`. |
| `src/features/assessments/builder/BlockRenderer.tsx` | Quitar las listas de tipos codificadas a mano y usar las capacidades del registro. | `BuilderCanvas`, `AssessmentPreview`. |
| `src/features/assessments/builder/builderState.ts` | Normalización de posiciones al reordenar/duplicar/eliminar, IDs nuevos en duplicados de opciones. | `AssessmentBuilder`, `builderState.test.ts`. |
| `src/features/assessments/question-types/registry.ts` | Añadir `capabilities` (opciones, exactamente una correcta, calificación automática/manual, claves públicas de configuración, esquema de configuración). | `helpers.ts`, `contentPlugins.ts`, `answerPlugins.ts`, `advancedContracts.ts`, `BlockRenderer`, `BuilderInspector`, `ComponentLibrary`, `engine.ts`, `validateContent.ts`, `builderState.ts`, y las pruebas de scoring/logic/imports. **Cambio de contrato compartido: se añade un campo obligatorio, así que hay que actualizar todos los constructores de plugins.** |
| `src/features/assessments/question-types/{helpers,contentPlugins,answerPlugins,advancedContracts}.ts` | Declarar las capacidades por tipo. | registro. |
| `src/features/assessments/scoring/validateContent.ts` | Devolver hallazgos estructurados con destino navegable, sin romper la forma actual (`errors`/`warnings` como `string[]`). | `AssessmentBuilder`, pruebas. |
| `src/features/assessments/application/assessmentService.ts` | Nuevas operaciones (`listResults`, `getAttemptDetail`), validación previa al guardado y a la publicación. | `EvaluacionesModule`, `processService.test.ts` (usa evaluaciones al vincular). |
| `src/infrastructure/repositories/contracts.ts` | Ampliar `AssessmentRepository` con `listResults` y `getAttemptDetail`. **Contrato compartido**: obliga a actualizar los tres proveedores. | `mock`, `google-apps-script`, `supabase`, `application/*`. |
| `src/infrastructure/providers/mock/index.ts` | Implementar los métodos nuevos; encapsular explícitamente como `MockAssessmentService`. | proveedores, pruebas. |
| `src/infrastructure/providers/google-apps-script/index.ts` | Reemplazar el adaptador de evaluaciones por el nuevo servicio normalizado (`AppsScriptAssessmentService`). **No tocar `processRepo`.** | proveedores. |
| `src/infrastructure/providers/supabase/index.ts` | Añadir los métodos nuevos con el mismo error «no implementado». | proveedores. |
| `src/infrastructure/providers/index.ts` | `getAssessmentRepository()` con posibilidad de fijar el proveedor de evaluaciones por separado. | `application/*`, `syncState`. |
| `src/shared/flags.ts` | Nuevas banderas: `assessmentsProvider`, `assessmentsApiUrl`, `assessmentsAutosave`. | `.env.example`, proveedores. |
| `src/content/locale/es-MX/catalog.ts` | Cadenas nuevas (revisión, publicación, estados de guardado, resultados). **Solo se añaden claves**, no se renombran ni se eliminan. | `locale.test.ts` comprueba que no haya cadenas vacías. |
| `.env.example` | Documentar las variables nuevas. | — |
| `package.json` | Añadir scripts `check` y `visual-qa` (sin dependencias nuevas). | — |
| `README.md` | Actualizar la sección de Evaluaciones y del backend. | — |

## 2 · Archivos que probablemente deban modificarse

| Archivo | Cuándo | Riesgo |
| --- | --- | --- |
| `src/infrastructure/mappers/assessmentMapper.ts` | Solo si se mantiene la ruta heredada de la hoja `Evaluaciones`. Se conserva **tal cual** para no romper `mappers.test.ts` ni la compatibilidad con la hoja existente; el nuevo backend usa mapeadores propios. | Bajo: se deja intacto. |
| `src/infrastructure/mappers/publicDto.ts` | Puede necesitar reenviar más claves de presentación por tipo. Se mantiene la lista blanca. | Medio: es código crítico de seguridad; se refuerza con pruebas. |
| `src/features/assessments/imports/convert.ts` | Si el registro cambia de forma. | Bajo: solo lee `resolvePlugin`. |
| `src/features/assessments/scoring/engine.ts` | Solo comentarios/aclaración de que es una **estimación de autoría** y no la nota oficial. | Bajo. |

## 3 · Archivos nuevos

### Backend Apps Script (`apps-script/evaluations/`)

`Code.gs`, `Config.gs`, `Router.gs`, `Response.gs`, `Auth.gs`, `Validation.gs`,
`SheetRepository.gs`, `AssessmentService.gs`, `PublicAssessmentService.gs`,
`AttemptService.gs`, `ScoringService.gs`, `IdService.gs`, `RequestService.gs`,
`AuditService.gs`, `Sanitize.gs`, `Setup.gs`, `Tests.gs`,
`appsscript.json.example`, `README.md`.

### Frontend

```
src/features/assessments/api/
  contract.ts                 tipos + esquemas del contrato { ok, requestId, data, error }
  transport.ts                transporte HTTP (timeout, cancelación, sin reintento en escrituras)
  adminApi.ts                 acciones administrativas
  publicApi.ts                acciones públicas
  dto.ts                      DTO administrativo y público (Zod)
  mapper.ts                   DTO ↔ AssessmentDefinition
src/features/assessments/domain/
  attempts.ts                 Attempt / Answer / estados de calificación
  publish.ts                  lista de comprobación de publicación con hallazgos navegables
src/features/assessments/builder/
  BuilderHeader.tsx  BuilderNav.tsx  AssessmentSettingsPanel.tsx
  QuestionNavigator.tsx  QuestionEditor.tsx  OptionEditor.tsx
  QuestionProperties.tsx  ReviewPanel.tsx  SaveStatus.tsx
  PublishDialog.tsx  AssessmentSummaryCard.tsx  useAssessmentDraft.ts
src/features/assessments/ui/
  AssessmentFilterPanel.tsx  ResultsPanel.tsx
scripts/
  check-evaluations.mjs       verificaciones estáticas sin dependencias
  visual-qa.mjs               guion reproducible de capturas (requiere navegador local)
  run-apps-script.mjs         cargador de los .gs para las pruebas
docs/evaluations/*.md         documentación
```

## 4 · Dependencias

**No se instala ninguna dependencia nueva.** Justificación:

| Necesidad | Solución ya presente | Alternativa descartada |
| --- | --- | --- |
| Animación / microinteracciones | `framer-motion` (ya usado por todo el sistema, con `layout`, `AnimatePresence`, springs y `layoutId`) | **GSAP**: cubriría lo mismo; añadir un segundo motor de animación duplicaría peso y patrones. Ver `MOTION_SYSTEM.md`. |
| Profundidad visual / 3D | `three` ya existe y se usa **una sola vez** como fondo global (`ThreeBackground`), con carga diferida y respaldo CSS | **Nuevo canvas Three.js dentro del módulo**: descartado; el fondo global ya aporta la profundidad y un segundo canvas competiría por GPU. Ver `MOTION_SYSTEM.md`. |
| Validación | `zod` | — |
| Lectura de hojas de cálculo | `fflate` (importador existente) | — |
| Pruebas de navegador | no disponible en el entorno | **Playwright**: retirado a propósito del repositorio (`15f1d28`); no se reintroduce. |
| Lint | no existe en el repositorio | **ESLint**: instalarlo introduciría cientos de hallazgos en módulos fuera del alcance. Se añade un verificador propio sin dependencias (`scripts/check-evaluations.mjs`). |

## 5 · Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Ampliar `AssessmentRepository` rompe los tres proveedores y las pruebas. | Se añaden los métodos en los tres proveedores en el mismo cambio; `tsc` lo garantiza. |
| Añadir un campo obligatorio a `QuestionPlugin` rompe los 52 plugins. | Los plugins se construyen con tres funciones fábrica (`contentPlugin`, `answerPlugin`, `contract`); se actualizan esas tres y se aporta un valor por omisión seguro en `resolvePlugin`/`fallbackPlugin`. |
| El backend nuevo convive con la hoja `Evaluaciones` heredada. | Hojas nuevas con nombres nuevos; el handler heredado de `Code.gs` **no se toca**. Migración documentada en `GOOGLE_SHEETS_SETUP.md` y `ROLLBACK.md`. |
| Reescribir el constructor puede perder capacidades (undo/redo, biblioteca, importación). | Se conservan `builderState` (undo/redo), `ComponentLibrary` e `ImportWizard`; el nuevo diseño los reubica, no los sustituye. |
| Que el módulo Procesos vincule evaluaciones (`processService.test.ts`). | Ese flujo usa `listAssessments()`; la firma no cambia. Prueba de regresión existente lo cubre. |
| Fuga de respuestas correctas al portal público. | Saneamiento en dos capas (Apps Script `Sanitize.gs` + `publicDto.ts`), con pruebas en ambos lados y una comprobación estática en `scripts/check-evaluations.mjs`. |
| Rendimiento con cientos de preguntas. | Solo se monta el editor de la pregunta activa; el índice renderiza filas ligeras; validación memorizada. Prueba de humo con 150 preguntas. |

## 6 · Módulos que NO se deben tocar

`src/modules/*` (Dashboard, Tablero, Cara a Cara, Comparador, Postulantes,
Perfiles, Documentación, Configuración, RegistrationForm),
`src/features/processes/**`, `src/components/**` salvo lectura,
`src/context/**`, `src/lib/**`, `docs/backend/Code.gs`,
`src/infrastructure/mappers/processMapper.ts`,
`src/infrastructure/providers/google-apps-script/index.ts → processRepo`.

## 7 · Pruebas de regresión necesarias

1. `npx tsc -b --noEmit` sin errores (garantiza que ningún consumidor quedó roto).
2. `npx vitest run` con las 89 pruebas previas **en verde y sin modificar**.
3. `src/features/processes/**` (17 pruebas) intactas, incluida
   `processService.test.ts › links assessments to a process and persists them` y
   `› publishing an assessment produces a served public version`.
4. `src/infrastructure/mappers/mappers.test.ts` (8 pruebas) intacta: demuestra
   que el mapeador de la hoja heredada sigue funcionando.
5. `npm run build` correcto (compilación de todos los módulos).
6. Renderizado de cada módulo del dock: cubierto indirectamente por `tsc` +
   pruebas de `ProcesosModule` y `EvaluacionesModule`.
