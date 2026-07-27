# Modelo de datos — Google Sheets

> **Fuente de verdad de los encabezados.** Las constantes de
> `apps-script/evaluations/Config.gs` deben coincidir exactamente con las tablas
> de este documento. Una prueba automatizada
> (`appsScript.schema.test.ts`) compara ambos y falla si divergen.

## Principios

1. **Las hojas se leen por nombre de encabezado, nunca por posición.** El
   repositorio construye un mapa `encabezado → índice` en cada lectura; si falta
   un encabezado obligatorio la operación falla con `SCHEMA_ERROR` en lugar de
   escribir en la columna equivocada.
2. **El número de fila nunca es identidad.** Toda entidad tiene un `*_id` opaco
   generado en el servidor. Las filas se localizan por ese id.
3. **Nada se borra.** Preguntas y opciones eliminadas se marcan `active=FALSE`
   (borrado lógico), de modo que los intentos históricos siguen resolviendo sus
   referencias.
4. **JSON solo para configuración específica**, siempre con versión de esquema,
   validado antes de escribir y parseado con valores por omisión.
5. **Booleanos** se persisten como `TRUE`/`FALSE` (texto en mayúsculas). El
   repositorio acepta además `true/false/1/0/sí/si/no` al leer.
6. **Fechas** en ISO-8601 UTC (`2026-07-27T20:41:03.512Z`), como texto.

## Índice de hojas

| Hoja | Grano | Filas por evaluación |
| --- | --- | --- |
| `Assessments` | evaluación | 1 |
| `Sections` | sección | 1..n |
| `Questions` | pregunta / bloque | 0..n |
| `Options` | opción | 0..n por pregunta |
| `Versions` | versión publicada (snapshot inmutable) | 0..n |
| `Attempts` | intento de un participante | 0..n |
| `Answers` | respuesta a una pregunta dentro de un intento | 0..n por intento |
| `ProcessedRequests` | solicitud de escritura procesada (idempotencia) | — |
| `AuditLog` | evento auditable | — |

---

## `Assessments`

Las primeras diecisiete columnas son exactamente las pedidas en el enunciado. Las
siguientes son extensiones necesarias para no perder funcionalidad existente
(categorías, políticas, versionado mayor/menor, ciclo de vida ampliado).

| # | Columna | Tipo | Notas |
| --- | --- | --- | --- |
| 1 | `assessment_id` | texto | `asm_<uuid>`. Identidad. Obligatoria y única. |
| 2 | `public_code` | texto | Código legible, p. ej. `EVL-PRES-4F2A`. Único; es lo que consulta el portal público. |
| 3 | `title` | texto | Obligatorio para publicar. |
| 4 | `description` | texto | Interno + resumen público. |
| 5 | `instructions` | texto | Instrucciones **públicas** que ve el candidato. |
| 6 | `status` | enum | `draft` \| `published` \| `archived`. Proyección canónica que usa el endpoint público. |
| 7 | `duration_minutes` | número \| vacío | Nulo = sin límite. Si hay valor debe ser > 0. |
| 8 | `passing_score` | número \| vacío | Nulo = sin nota mínima. Si hay valor, 0–100. |
| 9 | `access_type` | enum | Solo `public`. |
| 10 | `version` | entero | Versión **mayor** publicada actual (1 si no hay ninguna). |
| 11 | `question_count` | entero | Preguntas activas del borrador. Derivado, se recalcula en cada escritura. |
| 12 | `created_at` | ISO | — |
| 13 | `updated_at` | ISO | — |
| 14 | `published_at` | ISO \| vacío | Primera publicación. |
| 15 | `archived_at` | ISO \| vacío | — |
| 16 | `created_by` | texto | Actor. **Nunca** se expone públicamente. |
| 17 | `updated_by` | texto | Ídem. |
| 18 | `version_minor` | entero | Versión menor publicada actual. |
| 19 | `version_label` | texto | `v{version}.{version_minor}`, solo lectura humana. |
| 20 | `lifecycle_status` | enum | `draft·in_review·approved·scheduled·published·paused·closed·archived` (ciclo de vida existente). |
| 21 | `publication_status` | enum | `unpublished·scheduled·published·paused·closed·archived`. |
| 22 | `category` | enum | Las doce categorías de `domain/categories.ts`. |
| 23 | `purpose` | texto | — |
| 24 | `tags_json` | JSON `string[]` | — |
| 25 | `linked_process_ids_json` | JSON `string[]` | Vínculo con ProcessOS. |
| 26 | `policies_json` | JSON objeto | Las diez políticas (`attempt`, `timing`, `navigation`, `resume`, `randomization`, `scoring`, `resultVisibility`, `monitoring`, `consent`, `accessibility`) con `schemaVersion`. |
| 27 | `theme_json` | JSON objeto | Tema del renderizador público. |
| 28 | `rules_json` | JSON arreglo | Reglas de ramificación. |
| 29 | `rubrics_json` | JSON arreglo | Rúbricas. |
| 30 | `internal_instructions` | texto | **Nunca** público. |
| 31 | `current_published_version_id` | texto \| vacío | `ver_…` que se sirve a nuevos candidatos. |
| 32 | `entity_version` | entero | Concurrencia optimista. Se incrementa en cada escritura. |
| 33 | `schema_version` | entero | Versión del esquema de la fila (hoy `1`). |
| 34 | `sync_status` | texto | `synced` cuando la escritura la hizo el servidor. |

`status` deriva de `lifecycle_status`: `archived → archived`; `published`,
`paused`, `closed` → `published` si existe una versión publicada, y en cualquier
otro caso `draft`. **Solo `status = "published"` es visible públicamente**, y
`publication_status` debe ser `published` (una evaluación pausada o cerrada deja
de servirse).

## `Sections`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `section_id` | texto | `sec_…` |
| `assessment_id` | texto | Padre. |
| `title` | texto | — |
| `description` | texto | — |
| `position` | entero | 0-based, consecutivo y sin huecos por evaluación. |
| `time_limit_seconds` | número \| vacío | — |
| `randomize` | bool | — |
| `pool_size` | número \| vacío | — |
| `weight` | número | Por omisión 1. |
| `active` | bool | Borrado lógico. |
| `created_at` / `updated_at` | ISO | — |

## `Questions`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `question_id` | texto | `qst_…` (se aceptan ids preexistentes opacos, p. ej. `blk_…`). |
| `assessment_id` | texto | Padre. |
| `section_id` | texto | Sección contenedora; debe existir y pertenecer a la misma evaluación. |
| `question_text` | texto | Enunciado. Obligatorio para publicar. |
| `question_type` | texto | Clave del registro de tipos (`q_single_choice`, `c_title`, …). Validada contra la lista blanca de `Validation.gs`. |
| `position` | entero | 0-based, consecutivo dentro de la sección. |
| `required` | bool | — |
| `scoring_mode` | enum | `none·exact·partial·per_option·weighted·manual·rubric`. |
| `max_points` | número | Puntos máximos de la pregunta. |
| `weight` | número | Peso relativo (por omisión 1; el MVP usa peso igual). |
| `active` | bool | Borrado lógico. |
| `help_text` | texto | — |
| `description` | texto | — |
| `competency` | texto | Dimensión a la que aporta. |
| `code` | texto | Código de autoría opcional; único dentro de la evaluación cuando no está vacío. |
| `configuration_json` | JSON objeto | Configuración específica del tipo. |
| `validation_json` | JSON objeto | Reglas de validación de la respuesta (`min`, `max`, `minLength`, `maxSelections`, …). |
| `feedback_json` | JSON objeto | `{correct, incorrect, general}`. **Nunca** público. |
| `media_json` | JSON objeto \| vacío | `{kind, url, alt}`. |
| `accessibility_json` | JSON objeto | `{ariaLabel, longDescription}`. |
| `tags_json` | JSON `string[]` | — |
| `configuration_schema_version` | entero | Hoy `1`. Se rechaza un valor mayor al soportado. |
| `created_at` / `updated_at` | ISO | — |

## `Options`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `option_id` | texto | `opt_…` |
| `question_id` | texto | Padre. **Autoridad** de pertenencia. |
| `assessment_id` | texto | Índice mantenido por el servidor; se valida contra `Questions`. |
| `option_text` | texto | Obligatorio para publicar. |
| `option_value` | texto | Valor estable enviado por el candidato; por omisión el `option_id`. |
| `position` | entero | 0-based consecutivo dentro de la pregunta. |
| `is_correct` | bool | **Clave de respuesta. Nunca sale por el endpoint público.** |
| `score_value` | número | Puntos de la opción (`partial` / `per_option`). |
| `matching_key` | texto | Clave de emparejamiento (`q_matching`, `q_categorization`). |
| `active` | bool | Borrado lógico. |
| `feedback` | texto | **Nunca** público. |
| `media_url` | texto \| vacío | — |
| `configuration_json` | JSON objeto | Configuración específica de la opción. |
| `created_at` / `updated_at` | ISO | — |

## `Versions`

Snapshots **inmutables** de cada publicación (ver decisión D-05).

| Columna | Tipo | Notas |
| --- | --- | --- |
| `version_id` | texto | `ver_…` |
| `assessment_id` | texto | — |
| `version` | entero | Mayor. |
| `version_minor` | entero | Menor. |
| `version_label` | texto | `v2.3`. |
| `state` | enum | `published` \| `superseded`. |
| `notes` | texto | Notas de la versión. |
| `snapshot_json` | JSON | `{ schemaVersion, assessment, sections, questions, options }` en el momento de publicar. Se escribe una sola vez. |
| `snapshot_schema_version` | entero | — |
| `question_count` | entero | — |
| `gradable_question_count` | entero | Preguntas con calificación automática. |
| `checksum` | texto | Hash del snapshot para detectar alteraciones. |
| `published_at` / `published_by` | ISO / texto | — |
| `created_at` | ISO | — |

## `Attempts`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `attempt_id` | texto | `att_…` |
| `request_id` | texto | `req_…` del envío; garantiza idempotencia. |
| `assessment_id` | texto | — |
| `assessment_version` | entero | Versión mayor a la que quedó anclado el intento. |
| `version_id` | texto | Snapshot exacto usado para calificar. |
| `participant_name` / `participant_email` / `participant_document` | texto | Datos que envía el portal. Saneados. |
| `anonymous_token` | texto | Token opaco cuando no hay identificación. |
| `status` | enum | `in_progress` \| `submitted` \| `abandoned`. |
| `started_at` / `submitted_at` | ISO | — |
| `score` | número \| vacío | **Nota final oficial**. Vacía mientras haya revisión manual pendiente. |
| `auto_score` | número | Nota de la parte objetiva (0–100, dos decimales). |
| `correct_answers` | entero | — |
| `total_questions` | entero | Preguntas activas de la versión. |
| `gradable_questions` | entero | Denominador de la fórmula. |
| `manual_pending_count` | entero | Preguntas pendientes de revisión. |
| `grading_status` | enum | `automatically_graded` \| `pending_manual_review` \| `fully_graded`. |
| `passed` | bool \| vacío | Vacío si no hay nota mínima o si la nota aún no es final. |
| `graded_at` / `graded_by` | ISO / texto | Cierre de la calificación. |
| `duration_seconds` | número \| vacío | — |
| `user_agent` | texto | Truncado a 300 caracteres. |
| `process_id` | texto | Proceso de reclutamiento asociado, si el portal lo envía. |

## `Answers`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `answer_id` | texto | `ans_…` |
| `attempt_id` | texto | — |
| `assessment_id` | texto | — |
| `question_id` | texto | Debe pertenecer a la versión anclada. |
| `question_type` | texto | Copiado del snapshot. |
| `selected_option_id` | texto \| vacío | Debe pertenecer a esa pregunta. |
| `answer_value_json` | JSON | Valor crudo para tipos sin opciones (texto, numérico, orden, emparejamiento…). |
| `is_correct` | bool \| vacío | **Calculado en el servidor.** Vacío si requiere revisión. |
| `points_awarded` | número \| vacío | **Calculado en el servidor.** |
| `max_points` | número | Del snapshot. |
| `requires_manual_review` | bool | — |
| `answered_at` | ISO | — |

Cualquier `is_correct`, `points_awarded`, `score` o `passed` que llegue del
cliente **se descarta antes de escribir** (`Validation.gs → stripClientScoring_`).

## `ProcessedRequests`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `request_id` | texto | Clave de idempotencia. Única. |
| `action` | texto | Acción original. |
| `result_reference` | texto | Id de la entidad creada/afectada. |
| `processed_at` | ISO | — |
| `actor` | texto | — |
| `result_summary_json` | JSON | Resumen pequeño para responder la repetición sin recalcular. |

Cuando llega un `requestId` ya presente, el servidor **no repite el efecto**:
responde con el mismo `result_reference` y `warnings: ["IDEMPOTENT_REPLAY"]`.

## `AuditLog`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `audit_id` | texto | `aud_…` |
| `request_id` | texto | — |
| `action` | texto | — |
| `entity_type` | texto | `assessment` \| `question` \| `option` \| `attempt` \| `schema`. |
| `entity_id` | texto | — |
| `actor` | texto | — |
| `status` | texto | `ok` \| `error` \| `denied` \| `replay`. |
| `created_at` | ISO | — |
| `metadata_json` | JSON | Metadatos **no sensibles**. Nunca claves de respuesta. |

---

## Integridad referencial

Al escribir una evaluación completa (`updateAssessment`) el servidor, dentro del
`LockService`:

1. Valida la carga entera antes de tocar la hoja.
2. Recalcula `position` de secciones, preguntas y opciones a `0..n-1`.
3. Marca `active=FALSE` en secciones/preguntas/opciones que ya no llegan, en
   lugar de borrarlas.
4. Rechaza preguntas cuya `section_id` no exista, y opciones cuya `question_id`
   no exista o pertenezca a otra evaluación (evita huérfanos).
5. Rechaza ids duplicados dentro de la carga.
6. Escribe por lotes (`setValues` de bloques contiguos) y actualiza
   `question_count`, `entity_version` y `updated_at`.
7. Registra `ProcessedRequests` y `AuditLog`.
8. Libera el bloqueo en `finally`.

## Umbral de paginación

Con una fila por evaluación y JSON de configuración acotado, `listAdminAssessments`
lee la hoja completa. A partir de **~2 000 evaluaciones** conviene paginar en
servidor; el contrato ya devuelve `total`, y `ListQuery` del frontend soporta
`page`/`pageSize` sin cambios de tipos.
