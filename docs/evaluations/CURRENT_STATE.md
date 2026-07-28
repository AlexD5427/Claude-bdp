# Estado actual del módulo Evaluaciones (auditoría)

> Este documento registra **hechos verificados** leyendo el repositorio en el
> commit base `fffd817` (rama `main`). No contiene suposiciones; cuando algo no
> pudo comprobarse se indica explícitamente.

> [!NOTE]
> **Actualización de julio de 2026.** Tras el despliegue del backend intermedio,
> el módulo quedó inoperativo en producción por dos fallos de formato en las
> funciones de Vercel y una variable de entorno con el valor de otra. El
> diagnóstico completo, con la evidencia medida y la guía de puesta en marcha,
> está en [`REPARACION_2026-07.md`](./REPARACION_2026-07.md).

## 1 · Repositorio y herramientas

| Hecho | Valor verificado | Evidencia |
| --- | --- | --- |
| Tipo de repositorio | Aplicación única (no monorepo) | raíz con un solo `package.json` |
| Nombre del paquete | `bdp-talent-dashboard` v1.0.0 | `package.json` |
| Framework | React 18.3.1 + TypeScript 5.6.3 | `package.json` |
| Bundler | Vite 5.4.11 | `vite.config.ts` |
| Gestor de paquetes | npm (existe `package-lock.json`, no hay `pnpm-lock.yaml` ni `yarn.lock`) | raíz |
| Scripts disponibles | `dev`, `build` (`tsc -b && vite build`), `preview`, `typecheck`, `test`, `test:watch` | `package.json` |
| TypeScript estricto | `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports` | `tsconfig.app.json` |
| Estilos | Tailwind CSS 3.4.15 + CSS custom properties («Liquid Glass») | `tailwind.config.js`, `src/index.css` |
| Animación | **framer-motion 11.11.17** (instalado y usado) | `package.json`, `src/design-system/motion.ts` |
| 3D | **three 0.170.0** (instalado y usado por `ThreeBackground`) | `src/components/ThreeBackground.tsx` |
| GSAP | **NO está instalado** | ausencia en `package.json` |
| Iconos | `lucide-react` 0.460.0 | `package.json` |
| Validación | `zod` 4.4.3 | esquemas del dominio |
| Pruebas | Vitest 4.1.10 + jsdom + Testing Library | `vitest.config.ts`, `vitest.setup.ts` |
| **Lint** | **No existe ESLint ni Prettier en el repositorio**: no hay `eslint.config.*`, `.eslintrc*`, `.prettierrc*` ni script `lint`. Los comentarios `// eslint-disable-next-line` presentes son residuales y hoy no los procesa ninguna herramienta. | búsqueda en la raíz y en `package.json` |
| CI/CD | **No existe** `.github/workflows` ni configuración de CI | raíz |
| `CLAUDE.md` / `AGENTS.md` / `CONTRIBUTING.md` | **No existen** | raíz |
| Enrutado | **No hay router.** `src/App.tsx` conmuta módulos con `useState<ModuleId>` y renderizado condicional | `src/App.tsx` |
| Estado global | Context API (`TalentDataContext`, `ThemeContext`) + `createStore` propio sobre `useSyncExternalStore` | `src/shared/store.ts` |
| Formularios | Componentes controlados propios (`design-system/liquid-glass/fields.tsx`); no hay react-hook-form ni formik | — |
| Cliente HTTP | `fetch` envuelto en `src/infrastructure/providers/google-apps-script/client.ts` (timeout, AbortController, reintentos solo en GET) | — |
| Notificaciones | `design-system/liquid-glass/toast.tsx` | — |
| Diálogos | `GlassDialog`, `GlassDrawer`, `Modal` | — |
| Tablas / paginación | Tablas HTML propias. **No hay paginación en la interfaz de Evaluaciones** (el contrato `ListQuery` la soporta y el mock la implementa, pero la UI no la usa) | `AssessmentTable.tsx`, `contracts.ts` |
| Variables de entorno | Solo `VITE_*` documentadas en `.env.example`; el endpoint de Apps Script es una constante de compilación en `src/constants.ts` (`SCRIPT_URL`) | `.env.example`, `src/constants.ts` |
| Permisos | `src/features/shared/permissions.ts` mapea roles del perfil a capacidades (`view/create/edit/publish/close/archive/import/...`) | — |

### Línea base de verificación (ejecutada antes de tocar código)

```
npx tsc -b --noEmit   → sin errores
npx vitest run        → 13 archivos, 89 pruebas, todas en verde
```

## 2 · Historia relevante en Git

`git log` muestra que el módulo de Evaluaciones **ya fue revertido una vez**:

```
970a7db Revert "ProcessOS + AssessmentOS: rediseño de Procesos y nuevo módulo Evaluaciones"
61a699e Merge pull request #12 …   (reintroducción)
15f1d28 chore: drop playwright dev dependency (was only used for local screenshots)
```

Consecuencias tomadas en cuenta:

1. El módulo es **frágil desde el punto de vista de revisión**: hay que mantener
   los contratos compartidos intactos y no tocar Procesos.
2. **Playwright fue retirado a propósito** del repositorio. Volver a añadirlo
   como dependencia iría contra una decisión explícita del proyecto.

## 3 · Inventario de archivos del módulo Evaluaciones

Todos existen hoy en `src/features/assessments/`:

| Carpeta | Archivos | Qué hace realmente |
| --- | --- | --- |
| `domain/` | `assessment.ts`, `questions.ts`, `policies.ts`, `rules.ts`, `lifecycle.ts`, `categories.ts`, `entities.ts`, `factory.ts`, `index.ts` | Esquemas Zod del agregado `AssessmentDefinition` (definición + `draftVersion` + `publishedVersions[]`), bloques/opciones/secciones, diez políticas, reglas de ramificación y rúbricas. |
| `question-types/` | `registry.ts`, `helpers.ts`, `contentPlugins.ts`, `answerPlugins.ts`, `advancedContracts.ts`, `index.ts` | Registro de plugins de pregunta: **12 bloques de contenido + 29 tipos de respuesta + 11 contratos avanzados detrás de banderas**. |
| `builder/` | `AssessmentBuilder.tsx`, `BuilderCanvas.tsx`, `BuilderInspector.tsx`, `ComponentLibrary.tsx`, `BlockRenderer.tsx`, `builderState.ts`, `pluginIcons.ts` | Constructor de tres paneles con `useReducer`, undo/redo (50 pasos), selección, mover/duplicar/eliminar bloques. |
| `ui/` | `EvaluacionesModule.tsx`, `AssessmentToolbar.tsx`, `AssessmentCards.tsx`, `AssessmentTable.tsx`, `AssessmentSummaryView.tsx`, `AssessmentRowMenu.tsx`, `AssessmentPreview.tsx`, `ImportWizard.tsx`, `listState.ts` | Tablero (tarjetas/tabla/resumen), buscador, menú de fila, vista previa del candidato e importador de hojas de cálculo. |
| `application/` | `assessmentService.ts` | Comandos que orquestan `getProvider().assessments` + auditoría local. |
| `scoring/` | `engine.ts`, `validateContent.ts` | Motor de puntuación en el navegador y validación/estimación de contenido. |
| `versioning/` | `classify.ts`, `operations.ts` | Clasificación de cambios (seguro vs. estructural) y publicación inmutable. |
| `logic/` | `validate.ts` | Validación de reglas de ramificación. |
| `imports/` | `parse.ts`, `convert.ts` | Importación de `.xlsx/.csv/.ods` (usa `fflate`, ya instalado). |
| `audit/` | `auditLog.ts` | Bitácora **local** (`localStorage`). |

Infraestructura relacionada:

- `src/infrastructure/repositories/contracts.ts` — `AssessmentRepository` con
  `list/get/create/updateDraft/publish/pause/close/archive/duplicate/rollback`.
- `src/infrastructure/providers/mock/` — implementación completa en
  `localStorage` con datos sembrados (`seed.ts`: tres evaluaciones de demo).
- `src/infrastructure/providers/google-apps-script/` — adaptador que habla el
  protocolo heredado `POST { type:"evaluacion", action, row }`.
- `src/infrastructure/mappers/assessmentMapper.ts` — convierte el agregado a
  **una sola fila** de la hoja `Evaluaciones` con ~11 columnas JSON.
- `src/infrastructure/mappers/publicDto.ts` — proyección saneada para el portal
  de candidatos (**ya elimina `correct`, `score` y `feedback`**).

## 4 · Backend actual de Apps Script

Archivo único: `docs/backend/Code.gs` (975 líneas). Para Evaluaciones expone:

```
GET  ?action=list_evaluaciones     → { status:"success", rows:[...] }
GET  ?action=get_evaluacion&id=…   → { status:"success", row:{...} }
POST { type:"evaluacion", action:"create"|"update"|"duplicate"|
       "publish"|"pause"|"close"|"archive"|"rollback", … }
```

Hechos comprobados sobre ese backend:

- Guarda **una fila por evaluación** en la hoja `Evaluaciones` con 33 columnas,
  de las cuales `SeccionesJson`, `ReglasJson`, `TemaJson`, `ConfiguracionJson` y
  `VersionesPublicadasJson` son JSON serializado. **No hay normalización**: no
  existen hojas de preguntas ni de opciones.
- **No hay**: `LockService`, idempotencia (`requestId`), hoja de auditoría,
  intentos, respuestas, calificación, endpoints públicos, saneamiento público,
  autorización, verificación de esquema ni función de `setup`.
- `taEscribirFila_` recorre `getDataRange().getValues()` y localiza la fila por
  la **columna 1**, asumiendo que `ID` es la primera columna; no valida
  encabezados por nombre al escribir.
- La respuesta usa el envoltorio heredado `{ status, message }`, normalizado en
  el frontend por `fromLegacy()` en `src/shared/envelope.ts`.

## 5 · Qué funciona y qué no (comprobado leyendo el código)

### Funciona hoy

- El módulo es accesible desde el dock (`DOCK_ITEMS` incluye `evaluaciones`) y
  se carga con `React.lazy`.
- El listado consume la **capa de servicios** (`listAssessments()` →
  `getProvider().assessments.list()`), no un arreglo en línea. Con la
  configuración por omisión (`VITE_DATA_PROVIDER=mock`) los datos provienen del
  proveedor mock con `localStorage`.
- Crear, guardar borrador, publicar, pausar, cerrar, archivar, duplicar y
  revertir están conectados de extremo a extremo **contra el mock**.
- La vista previa del candidato ya pasa por `toPublicAssessmentDTO`, así que no
  filtra respuestas correctas.
- Versionado mayor/menor con snapshots inmutables (12 pruebas lo cubren).

### No funciona / falta (esto es el trabajo real)

1. **La configuración general de la evaluación no se puede editar.** El
   constructor solo edita el *contenido* (`draftVersion.content`). No hay ningún
   campo para `name`, `description`, `estimatedDurationMinutes`,
   `scoringPolicy.passThreshold`, código público ni tipo de acceso. Una
   evaluación creada se queda con el nombre «Nueva evaluación» para siempre.
2. **No hay recuperación de borrador local**: `useUnsavedChangesWarning` avisa
   antes de recargar, pero el contenido en curso se pierde. `useFormDraft`
   existe en el repositorio y no se usa aquí.
3. **No hay panel de revisión previa a la publicación.** `validateContent`
   devuelve `string[]`; no hay forma de navegar del error al campo afectado.
4. **No hay índice de preguntas.** Con decenas de preguntas el lienzo es una
   lista plana sin navegación, búsqueda ni filtro.
5. **No se puede impedir el estado imposible «dos respuestas correctas»** en
   preguntas de respuesta única: `BuilderInspector` marca `correct` con casillas
   independientes.
6. **La validación de publicación es incompleta**: no exige título, no valida
   `durationMinutes > 0` ni `passingScore ∈ [0,100]`, no verifica IDs duplicados
   ni posiciones consecutivas.
7. **El listado no tiene filtros de estado ni ordenamiento** en la interfaz
   (`AssessmentFilters` existe en `listState.ts` pero **ningún componente lo
   escribe**; `activeAssessmentFilterCount` no se usa en ningún sitio).
8. **No hay estructura de intentos ni respuestas** en ningún lado (ni dominio,
   ni contrato, ni hoja).
9. **La calificación vive en el navegador** (`scoring/engine.ts`), lo cual es
   correcto como estimación de autoría pero inaceptable como resultado oficial.
10. **No hay API pública** ni endpoint que el portal de candidatos pueda usar.
11. **El endpoint administrativo no requiere autorización alguna.**
12. `AssessmentRowMenu` solo se abre desde la vista **tabla**; en tarjetas no hay
    acciones de fila, y `archive` no pide confirmación.
13. El menú de fila llama a `pause`/`close` con `permissions.edit`/`close`, pero
    `publish` puede invocarse sobre una evaluación inválida (sin validación).

## 6 · Tipos de pregunta realmente presentes en el repositorio

Inventario extraído de `question-types/` (no inventado). Total: **52 tipos
registrables**, de los cuales 41 se registran siempre y 11 dependen de banderas.

- **Contenido (12, `contentPlugins.ts`)**: `c_title`, `c_subtitle`,
  `c_paragraph`, `c_rich_text`, `c_instructions`, `c_callout`, `c_divider`,
  `c_page_break`, `c_image`, `c_video`, `c_audio`, `c_resource`.
- **Respuesta (29, `answerPlugins.ts`)**: `q_short_text`, `q_long_text`,
  `q_integer`, `q_decimal`, `q_percentage`, `q_currency`, `q_date`, `q_time`,
  `q_datetime`, `q_single_choice`, `q_multiple_choice`, `q_dropdown`,
  `q_multiselect`, `q_true_false`, `q_yes_no_na`, `q_likert`, `q_numeric_scale`,
  `q_stars`, `q_matrix`, `q_likert_matrix`, `q_editable_table`, `q_ranking`,
  `q_ordering`, `q_matching`, `q_categorization`, `q_image_choice`,
  `q_hotspot`, `q_scenario`, `q_multi_step_case`, `q_chart_interpretation`,
  `q_file_response`.
  (29 entradas de plugin; `q_hotspot`, `q_multi_step_case` y `q_file_response`
  están marcados `status: "beta"`.)
- **Contratos avanzados (11, `advancedContracts.ts`, `status: "contract"`)**:
  `q_code`, `q_sql`, `q_spreadsheet_sim`, `q_interactive_video`,
  `q_credit_analysis`, `q_risk_analysis`, `q_cashier_sim`, `q_reconciliation`,
  `q_customer_service_sim`, `q_operations_sim`, `q_financial_statements`.

> El alcance del MVP mencionaba `single_choice` y `true_false`. **Estos tipos ya
> existen y son parte intencional del producto**, así que no se eliminan; se
> documentan e implementan su persistencia, validación, DTO público y estrategia
> de calificación (ver `QUESTION_TYPES.md`).

## 7 · Lenguaje visual encontrado

Ver `VISUAL_AUDIT.md` para el detalle. En resumen: sistema «Liquid Glass» propio
con tokens en `src/index.css` (`--glass-bg`, `--hairline`, `--fill-1..3`,
`--ink*`), temas claro («Daylight») y oscuro («Midnight») conmutados con clases
`.light`/`.dark` en `<html>`, utilidades `.glass`, `.glass-heavy`,
`.liquid-streak`, `.magnetic`, `.fill-soft`, `.fill-softer`, `.text-ink*`, y una
clase global `.reduce-motion` que anula animaciones.

## 8 · Limitaciones del entorno de esta tarea (comprobadas)

- **No hay navegador automatizado disponible.** Playwright no está instalado en
  el repositorio (fue retirado a propósito) y en este entorno la descarga del
  binario de Chromium falla (`Download failure`), igual que la instalación de
  `chromium` por APT (paquete redirigido a snap, sin snapd). Por lo tanto **no se
  capturaron capturas de pantalla reales**; se entrega en su lugar un script
  reproducible (`scripts/visual-qa.mjs`) y ciclos de QA visual ejecutados en
  jsdom. Ver `VISUAL_QA.md`.
- **No hay acceso al Google Sheet ni al proyecto de Apps Script.** El backend se
  entrega como archivos `.gs` listos para copiar, más un arnés de pruebas que
  **ejecuta esos mismos archivos en Node** con un `SpreadsheetApp` simulado.
