# TESTING

## Commands

```bash
npm run typecheck   # tsc -b --noEmit (strict; noUnusedLocals/Parameters)
npm run test        # vitest run
npm run build       # tsc -b && vite build (production build)
```

> There is no ESLint configuration in this repository; the strict TypeScript
> compiler (with `noUnusedLocals` / `noUnusedParameters`) is the static-analysis
> gate. If ESLint is added later, wire it into an `npm run lint` script.

## Suites

Unit + component tests live next to the code they cover (Vitest + Testing
Library, jsdom):

- `features/processes/domain/process.test.ts` — process factory, statuses,
  duplication, summary projection.
- `features/processes/ui/listState.test.ts` — filters, lifecycle, search, sort,
  facet counts.
- `features/processes/ui/ProcesosModule.test.tsx` — module renders, lists seeded
  data, filters by search (mock provider).
- `features/processes/application/processService.test.ts` — create/edit/publish,
  process↔assessment linking, duplicate, and assessment publish→served version.
- `features/assessments/versioning/versioning.test.ts` — change classification
  (none/safe/structural), version numbering, immutability of published content,
  rollback, cloning.
- `features/assessments/scoring/scoring.test.ts` — plugin registry + graceful
  fallback, scoring modes, no-auto-reject, manual review, content validation.
- `features/assessments/logic/logic.test.ts` — invalid refs, missing targets,
  unreachable sections, contradictions, circular branches.
- `features/assessments/imports/imports.test.ts` — CSV parsing, Spanish header
  mapping, conversion to a draft (never published), issue detection, exclusion,
  CSV injection guard.
- `features/assessments/builder/builderState.test.ts` — add/remove/duplicate/
  move blocks, contiguous order, undo/redo, selection.
- `features/assessments/ui/EvaluacionesModule.test.tsx` — dashboard renders,
  disclaimer visible, Spanish affordances.
- `infrastructure/mappers/mappers.test.ts` — row round-trips, enum coercion,
  and **public DTO answer-key exclusion**.
- `content/locale/__tests__/locale.test.ts` — es-MX active, Spanish copy, no
  leftover English in key labels, formatters.

## Results

At delivery: **typecheck passes**, **all Vitest suites pass**, and the
**production build succeeds**. See the PR description for the exact counts from
the final run.

## Manual QA

1. Run `npm run dev`, log in, open **Procesos**.
2. Create a process; fill Resumen/Job/Publication; add public content; link an
   assessment; save; publish (confirm); watch the toast and status pill.
3. Switch views (table/cards/kanban/summary); drag a kanban card and move one
   with the keyboard; use filters and search.
4. Open **Evaluaciones**; create one; add sections/questions in the builder;
   set a correct answer + points; check the status area; preview (candidate mode
   shows no answer keys); publish (v1.0), edit help text, publish again (minor),
   change points, publish again (major).
5. Use **Importar desde Excel** with a small CSV; map columns; review issues;
   create a draft; confirm it opens unpublished in the builder.

## Suites del catálogo v3 (2026-09)

| Archivo | Pruebas | Qué vigila |
| --- | --- | --- |
| `__tests__/contraste.test.ts` | 25 | Cada token de tinta y de estado en los dos temas, midiendo el **CSS real** (no una copia de los valores). Incluye la regresión que impide volver a heredar `var(--ink-*)` en `--doc-text-muted` y `--doc-text-faint`, que es lo que dejaba el texto de ayuda a 2,99:1 en tema claro. |
| `__tests__/hojasYSubsecciones.test.ts` | 16 | Que el contador de hojas se **deduzca** de la presentación física documento a documento (imposible un digital con contador), el asterisco como dato, el cero frente al vacío, la validación, el `N/A` que conserva el conteo, la llegada a `PAGINAS` y al `DETALLE JSON`, y el documento compartido entre Tipo 1 y Tipo 3. |
| `__tests__/identificadorYAlta.test.ts` | 13 | Siete formatos reales de carnet, la obligatoriedad, el duplicado con los datos del expediente existente, la búsqueda por el carnet escrito de otra forma, la idempotencia, el alta en una sola llamada, la reversión y los topes de la lectura por lotes. |
| `__tests__/cacheYCola.test.ts` | 15 | Coalescencia, idempotencia en el reintento, lo que **no** se reintenta, la supervivencia a un recargado, el desalojo del menos usado, el borrado al cambiar de perfil, la precarga que no repite lo fresco y la reconciliación que no pisa lo que se está escribiendo. |

### Por qué hacen falta dos pruebas de contraste

`contraste.test.ts` mide los **tokens**; `qa/sonda-contraste.mjs` mide el
**texto que se pinta**. Las dos son necesarias, y esta iteración lo demostró: la
prueba de tokens estaba verde mientras la sonda encontraba **29 textos por debajo
de AA** en el navegador. Eran dos casos que un token no puede ver:

- 77 usos de `text-ink-faint` / `text-ink-soft` —la escala **global**— repartidos
  en cinco componentes del módulo, a 4,26:1;
- el color del botón primario escrito a mano (`#04121f`), que en tema oscuro sobra
  y en tema claro daba **3,53:1** en «Guardar», «Continuar» y «Nuevo expediente».

Los dos están corregidos y la sonda mide ahora **1712 textos con 0 incidencias**.

### Una prueba no se debilita para que pase

Las 52 pruebas que rompieron al publicar el catálogo v3 se **reescribieron**
explicando el cambio de contrato, no se ajustaron los números en silencio. Cuando
una usaba `cert-trabajo` como «un general que admite prórroga» —código retirado—
se cambió el **dato** por `titulo-legalizado`, que cumple ese papel en el proceso
vigente, y se dejó una nota del porqué. La expectativa es la misma.
