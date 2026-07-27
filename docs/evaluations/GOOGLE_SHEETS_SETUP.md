# Configuración de Google Sheets (paso a paso)

> Ninguna operación de esta guía borra datos. La única función que elimina filas
> (`limpiarDatosDePruebaEvaluaciones`) solo toca las evaluaciones cuyo título
> empieza con `[PRUEBA]`.

## 1 · Elegir la hoja de cálculo

Puedes usar **la misma hoja** del resto del sistema (la que ya contiene
`Registro_Postulantes`, `Procesos`, `Evaluaciones`, `perfil_cargo_bdp`…) o una
hoja nueva.

| Opción | Cuándo conviene |
| --- | --- |
| Misma hoja | Quieres un solo lugar y no te molesta que crezca. Los nombres de hoja nuevos no colisionan con ninguno existente. |
| Hoja nueva | Prefieres aislar Evaluaciones (respaldos, permisos y cuotas independientes). Es la opción recomendada para producción. |

Copia el identificador de la hoja desde su URL:

```
https://docs.google.com/spreadsheets/d/  1AbCdEf…XyZ  /edit
                                         ^^^^^^^^^^^^^  ← este es el spreadsheetId
```

## 2 · Hacer un respaldo ANTES de tocar nada

1. `Archivo → Crear una copia` y nombra la copia
   `RESPALDO Evaluaciones AAAA-MM-DD`.
2. Además, `Archivo → Historial de versiones → Asignar nombre a la versión
   actual`: «Antes de configurar Evaluaciones».

Con esas dos cosas el rollback es inmediato (ver `ROLLBACK.md`).

## 3 · Crear las pestañas

**No las crees a mano.** Ejecuta desde el editor de Apps Script:

```
configurarEvaluaciones()
```

La función:

- crea las nueve pestañas que falten, con sus encabezados en la fila 1, en
  negrita y congelada;
- si una pestaña ya existe, **añade al final** los encabezados que falten;
- **nunca** reordena, renombra ni borra columnas ni filas;
- imprime en el registro el informe de lo que hizo.

Pestañas que crea: `Assessments`, `Sections`, `Questions`, `Options`,
`Versions`, `Attempts`, `Answers`, `ProcessedRequests`, `AuditLog`.

## 4 · Encabezados exactos

Los encabezados son la fuente de verdad del esquema y están definidos en
`apps-script/evaluations/Config.gs` (`EVAL_HEADERS`). El detalle de cada columna,
su tipo y su significado está en [`DATA_MODEL.md`](./DATA_MODEL.md).

> **Cómo se comprueba que esta guía no miente:** la prueba
> `appsScript.schema.test.ts` compara `EVAL_HEADERS` con `DATA_MODEL.md` y
> `scripts/check-evaluations.mjs` repite la comprobación en `npm run check`. Si
> alguien añade una columna al código y no la documenta, la verificación falla.

Resumen de cabeceras por pestaña:

| Pestaña | Columnas |
| --- | --- |
| `Assessments` | 34 (17 del contrato + 17 extensiones para categorías, políticas y ciclo de vida) |
| `Sections` | 12 |
| `Questions` | 24 |
| `Options` | 15 |
| `Versions` | 15 |
| `Attempts` | 25 |
| `Answers` | 12 |
| `ProcessedRequests` | 6 |
| `AuditLog` | 9 |

## 5 · Formatos recomendados

No son obligatorios (el backend escribe y lee texto), pero ayudan a leer la hoja:

| Columnas | Formato | Motivo |
| --- | --- | --- |
| `*_at`, `created_at`, `updated_at`, `published_at`, `submitted_at` | **Texto sin formato** | Se guardan como ISO-8601. Si Sheets las convierte a fecha local, se pierde la zona horaria. |
| `*_json`, `snapshot_json` | **Texto sin formato**, ajuste de línea «Recortar» | Evita que Sheets interprete el contenido y mantiene las filas legibles. |
| `score`, `auto_score`, `passing_score` | Número, 2 decimales | — |
| `is_correct`, `active`, `required`, `passed`, `randomize` | Texto sin formato | Se guardan como `TRUE` / `FALSE`. |
| Fila 1 de cada pestaña | Negrita + congelada | `configurarEvaluaciones()` ya lo hace. |

> **Importante:** selecciona las columnas `*_json` y aplica
> `Formato → Número → Texto sin formato` **antes** de cargar datos. Un JSON que
> empieza con `=` o `+` podría interpretarse como fórmula. El backend nunca
> escribe JSON que empiece así, pero si alguien pega datos a mano el formato de
> texto lo protege.

### Regla que no se puede romper

**No reordenes, renombres ni elimines encabezados sin una migración.** El
backend localiza las columnas por nombre, así que reordenarlas es inofensivo…
pero renombrar o borrar una hace que la operación falle con `SCHEMA_ERROR` en
lugar de escribir en la columna equivocada. Si necesitas renombrar:

1. Añade la columna nueva con `configurarEvaluaciones()` tras cambiar
   `Config.gs`.
2. Copia los valores de la antigua a la nueva.
3. Deja la antigua en su sitio hasta confirmar que todo funciona.
4. Ejecuta `verificarEsquemaEvaluaciones()` y revisa `extraHeaders`.

## 6 · Verificar el esquema

```
verificarEsquemaEvaluaciones()
```

Debe imprimir `"ok": true` y, para cada pestaña, `missingHeaders: []`. Los
`extraHeaders` no son un error: son columnas tuyas que el backend ignora.

La misma verificación está disponible por API para el frontend:

```jsonc
POST { "action": "verifySchema", "requestId": "req_…", "payload": {} }
```

## 7 · Crear datos de prueba

```
crearDatosDePruebaEvaluaciones()
```

Crea **una** evaluación publicada llamada `[PRUEBA] Conocimientos de riesgo`, con
tres preguntas (opción única, verdadero/falso y una abierta de revisión manual) y
devuelve su `publicCode`. Sirve para:

- comprobar el endpoint público con `curl` (ver `APPS_SCRIPT_SETUP.md` §11);
- comprobar la calificación enviando un intento;
- ver el módulo del reclutador con datos reales.

## 8 · Limpiar SOLO los datos de prueba

```
limpiarDatosDePruebaEvaluaciones()
```

Borra únicamente las filas cuyo título empieza con `[PRUEBA]`, más sus secciones,
preguntas, opciones, versiones, intentos y respuestas. Imprime cuántas filas
eliminó. **No toca ninguna otra evaluación.**

## 9 · Separar pruebas y producción

Tres formas, de más a menos aislada:

| Estrategia | Cómo | Aislamiento |
| --- | --- | --- |
| **Dos hojas de cálculo** (recomendada) | Dos proyectos de Apps Script, cada uno con su `EVALUATIONS_SPREADSHEET_ID` y su despliegue. En el frontend, `VITE_EVALUATIONS_API_URL` distinta por entorno. | Total: datos, cuotas y permisos. |
| **Una hoja, dos proyectos** | Mismo `spreadsheetId`, distintos `EVALUATIONS_ADMIN_EMAILS`. | Parcial: los datos se comparten. |
| **Marcador `[PRUEBA]`** | Todo en la misma hoja, distinguiendo por título. | Mínimo: sirve para una prueba rápida, no para trabajar en paralelo. |

Nunca apuntes el entorno de pruebas a la hoja de producción con el modo
administrativo abierto (`EVALUATIONS_ALLOW_ANONYMOUS_ADMIN=true`).

## 10 · Migrar desde la hoja `Evaluaciones` heredada

Si ya tienes evaluaciones en la hoja `Evaluaciones` (una fila por evaluación con
columnas JSON), puedes importarlas al esquema normalizado:

```
migrarDesdeHojaEvaluaciones()
```

Qué hace y qué **no** hace:

| Hace | No hace |
| --- | --- |
| Lee la hoja `Evaluaciones` por nombre de encabezado. | No modifica ni borra esa hoja. |
| Crea filas en `Assessments`, `Sections`, `Questions`, `Options`. | No crea versiones publicadas. |
| Conserva los identificadores existentes cuando son válidos. | No sobrescribe una evaluación ya migrada (es idempotente por `assessment_id`). |
| Deja todo en **borrador** a propósito. | No publica nada automáticamente. |
| Devuelve un informe con `migrated`, `skipped` y `failed[]`. | No falla toda la migración por una fila mala. |

Después de migrar:

1. Revisa el informe: cada entrada de `failed[]` trae el id y el motivo.
2. Abre cada evaluación migrada en el módulo del reclutador.
3. Revisa el panel de revisión y **vuelve a publicarla** para generar su snapshot
   de versión (mientras no lo tenga, la calificación de un intento leería la
   clave de las hojas vivas y avisaría con `LEGACY_ANSWER_KEY_SOURCE`).

## 11 · Lista de comprobación

- [ ] Respaldo hecho (copia + versión con nombre).
- [ ] `spreadsheetId` copiado.
- [ ] `configurarEvaluaciones()` ejecutado sin errores.
- [ ] `verificarEsquemaEvaluaciones()` responde `ok: true`.
- [ ] Columnas `*_json` y `*_at` en «Texto sin formato».
- [ ] `crearDatosDePruebaEvaluaciones()` ejecutado y `publicCode` anotado.
- [ ] Endpoint público probado con ese `publicCode`.
- [ ] `limpiarDatosDePruebaEvaluaciones()` ejecutado si la prueba era en producción.
- [ ] Entorno de pruebas separado del de producción.
- [ ] (Opcional) `migrarDesdeHojaEvaluaciones()` ejecutado y su informe revisado.
