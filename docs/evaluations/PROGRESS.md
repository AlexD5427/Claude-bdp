# Registro de progreso

> Documento de continuidad. Si la sesión se reinicia o se compacta el contexto,
> este archivo dice exactamente dónde se quedó el trabajo y cómo verificarlo.

**Rama:** `claude/evaluaciones-appsscript-3aae1a47860b8064ae5a00a919af8abe`
**Commit base:** `fffd817` (`main`)

## Línea base medida antes de tocar código

```
npx tsc -b --noEmit   → sin salida (sin errores)
npx vitest run        → Test Files 13 passed (13) · Tests 89 passed (89)
```

## Estado de las fases

| Fase | Estado |
| --- | --- |
| 0 · Auditoría y documentos de estado/impacto/plan | ✅ completada |
| 1 · Modelo de datos + contrato de API | ✅ completada |
| 2 · Backend Apps Script modular | ✅ completada |
| 3 · Capa de servicios del frontend | ✅ completada |
| 4 · Capacidades por tipo de pregunta | ✅ completada |
| 5 · Validación de publicación navegable | ✅ completada |
| 6 · Rediseño del constructor | ✅ completada |
| 7 · Listado, filtros y resultados | ✅ completada |
| 8 · Documentación y verificación final | ✅ completada |

## Comandos de verificación

```bash
npm ci
npx tsc -b --noEmit        # typecheck
npm run build              # tsc -b + vite build
npm test                   # vitest run
npm run check              # verificaciones estáticas del módulo Evaluaciones
node scripts/visual-qa.mjs # capturas (requiere navegador local; ver VISUAL_QA.md)
```

Los resultados reales de la última ejecución están en `TEST_PLAN.md` §Resultados.

## Puntos de retomada si algo queda a medias

1. **Backend**: `apps-script/evaluations/`. El arnés
   `scripts/run-apps-script.mjs` carga los `.gs` en Node con `SpreadsheetApp`,
   `LockService`, `PropertiesService`, `Utilities` y `Session` simulados; las
   pruebas viven en `src/features/assessments/__tests__/appsScript.*.test.ts`.
   Cualquier cambio en los encabezados debe reflejarse en `DATA_MODEL.md`: hay
   una prueba que compara ambos.
2. **Frontend**: el seam único es `getAssessmentRepository()` en
   `src/infrastructure/providers/index.ts`. Los mocks solo son alcanzables por
   `MockAssessmentService`.
3. **Tipos de pregunta**: `QUESTION_TYPES.md` es la fuente de verdad; una prueba
   de paridad exige que el catálogo de `Validation.gs` cubra todos los tipos del
   registro del frontend.
