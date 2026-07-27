# Tipos de pregunta

> **Fuente de verdad de los tipos implementados.** Las tablas de este documento se
> comprueban automáticamente: `appsScript.typeParity.test.ts` falla si un tipo del
> registro del frontend no aparece aquí, si el servidor no lo conoce, o si la
> estrategia de calificación y las reglas de opciones no coinciden en los dos
> lados.

## Qué se conservó y por qué

El alcance inicial del encargo mencionaba `single_choice` y `true_false`. La
inspección del repositorio encontró **54 tipos ya registrados** en
`src/features/assessments/question-types/`, todos ellos parte intencional del
producto (aparecen en la biblioteca de componentes del constructor y algunos ya
tenían datos sembrados). Eliminarlos habría destruido funcionalidad existente,
así que **ninguno se eliminó**: cada uno tiene ahora persistencia normalizada,
validación, representación pública saneada, formato de respuesta y estrategia de
calificación.

## Cómo se declara un tipo

Un tipo es un objeto `QuestionPlugin` en el registro
(`question-types/registry.ts`). Sus **capacidades** son declarativas:

```ts
interface PluginCapabilities {
  options: boolean;                 // ¿usa lista de opciones?
  minOptions: number;               // mínimo para publicar
  maxOptions: number | null;        // máximo, o sin límite
  exactlyOneCorrect: boolean;       // familia de respuesta única
  fixedOptions: { value: string; label: string }[] | null;
  grading: "none" | "auto" | "manual" | "auto_if_configured";
  control: PluginControl;           // familia de control del renderizador
  expects?: "number" | "text" | "ordering" | "matching";
}
```

Gracias a eso, **añadir un tipo no obliga a tocar archivos no relacionados**: el
renderizador, el editor de opciones, la validación de publicación y el índice de
preguntas leen las capacidades en lugar de contener listas de claves.

El servidor tiene su propio catálogo equivalente en
`apps-script/evaluations/Validation.gs` (`EVAL_QUESTION_TYPES`), porque Apps
Script no puede importar el registro del frontend. La prueba de paridad es lo que
garantiza que ambos digan lo mismo.

## Estrategias de calificación

| Estrategia | Significado | Consecuencia en el intento |
| --- | --- | --- |
| `none` | Bloque de contenido: no recibe respuesta. | No aporta al denominador. |
| `auto` | Criterio objetivo derivado de `is_correct` en las opciones. | Se califica en el servidor al enviar. |
| `auto_if_configured` | Puede ser objetivo, pero solo si el autor definió la clave (`expectedValue` con tolerancia, o `matching_key` en **todas** las opciones). | Si falta la clave, pasa a revisión manual. |
| `manual` | No hay criterio objetivo. | El intento queda `pending_manual_review`. |

> **La plataforma nunca finge calificación automática.** Una pregunta abierta no
> recibe cero automáticamente: el intento se guarda con `grading_status =
> "pending_manual_review"`, con la nota de la parte objetiva en `auto_score` y
> `score` vacío hasta que una persona cierre la revisión.

## Persistencia (idéntica para todos los tipos)

| Aspecto | Dónde vive |
| --- | --- |
| Propiedades comunes | Columnas explícitas de `Questions` (`question_text`, `question_type`, `position`, `required`, `scoring_mode`, `max_points`, `weight`, `active`, `help_text`, `competency`, `code`…). |
| Configuración específica del tipo | `Questions.configuration_json`, con `configuration_schema_version`. Se valida antes de escribir y se parsea con valores por omisión; una versión de esquema mayor que la del servidor se rechaza. |
| Reglas de validación de la respuesta | `Questions.validation_json`. |
| Opciones | Filas de `Options` con `option_text`, `option_value`, `position`, `is_correct`, `score_value`, `matching_key`, `active`. |
| Retroalimentación | `Questions.feedback_json` y `Options.feedback` — **nunca públicos**. |
| Multimedia y accesibilidad | `Questions.media_json` y `Questions.accessibility_json`. |

## DTO administrativo frente a DTO público

| Campo | Administrativo | Público |
| --- | --- | --- |
| Enunciado, ayuda, obligatoriedad, posición | ✅ | ✅ |
| Opciones (`option_id`, `option_value`, `option_text`, `media_url`) | ✅ | ✅ |
| `is_correct`, `score_value`, `matching_key` | ✅ | ❌ |
| `scoring_mode`, `max_points`, `weight`, `competency` | ✅ | ❌ |
| `feedback` | ✅ | ❌ |
| `configuration_json` completo | ✅ | ❌ (solo la lista blanca de presentación) |
| `internal_instructions`, `created_by`, `updated_by`, `tags` | ✅ | ❌ |

La lista blanca de configuración pública está en
`apps-script/evaluations/Sanitize.gs` (`EVAL_PUBLIC_CONFIG_KEYS`) y en
`src/infrastructure/mappers/publicDto.ts`.

## Inventario completo

### Bloques de contenido

| Identificador | Nombre mostrado | Estado | Control | Reglas de opciones | Estrategia de calificación | Formato de respuesta |
| --- | --- | --- | --- | --- | --- | --- |
| `c_title` | Título | estable | `content` | — | No se califica | — |
| `c_subtitle` | Subtítulo | estable | `content` | — | No se califica | — |
| `c_paragraph` | Párrafo | estable | `content` | — | No se califica | — |
| `c_rich_text` | Texto enriquecido | estable | `content` | — | No se califica | — |
| `c_instructions` | Instrucciones | estable | `content` | — | No se califica | — |
| `c_callout` | Aviso destacado | estable | `content` | — | No se califica | — |
| `c_divider` | Separador | estable | `content` | — | No se califica | — |
| `c_page_break` | Salto de página | estable | `content` | — | No se califica | — |
| `c_image` | Imagen | estable | `content` | — | No se califica | — |
| `c_video` | Video accesible | estable | `content` | — | No se califica | — |
| `c_audio` | Audio accesible | estable | `content` | — | No se califica | — |
| `c_resource` | PDF / recurso | estable | `content` | — | No se califica | — |

### Preguntas de opción

| Identificador | Nombre mostrado | Estado | Control | Reglas de opciones | Estrategia de calificación | Formato de respuesta |
| --- | --- | --- | --- | --- | --- | --- |
| `q_single_choice` | Opción única | estable | `radio` | mín. 2, exactamente 1 correcta | Automática | `selected_option_id` |
| `q_multiple_choice` | Opción múltiple | estable | `checkbox` | mín. 2, ≥1 correcta | Automática | `selectedOptionIds[]` |
| `q_dropdown` | Lista desplegable | estable | `select` | mín. 2, exactamente 1 correcta | Automática | `selected_option_id` |
| `q_multiselect` | Selección múltiple | estable | `checkbox` | mín. 2, ≥1 correcta | Automática | `selectedOptionIds[]` |
| `q_true_false` | Verdadero / Falso | estable | `content` | mín. 2, máx. 2, exactamente 1 correcta, opciones fijas: Verdadero / Falso | Automática | `selected_option_id` |
| `q_yes_no_na` | Sí / No / N/A | estable | `radio` | mín. 2, exactamente 1 correcta | Automática | `selected_option_id` |
| `q_image_choice` | Pregunta con imagen | estable | `radio` | mín. 2, exactamente 1 correcta | Automática | `selected_option_id` |
| `q_likert` | Escala Likert | estable | `radio` | mín. 2, exactamente 1 correcta | Automática | `selected_option_id` |

### Orden y emparejamiento

| Identificador | Nombre mostrado | Estado | Control | Reglas de opciones | Estrategia de calificación | Formato de respuesta |
| --- | --- | --- | --- | --- | --- | --- |
| `q_ranking` | Ranking | estable | `ordering` | mín. 2 | Automática si todas las opciones tienen `matching_key` | `answer_value_json` = `{ "<option_id>": "<clave>" }` |
| `q_ordering` | Ordenamiento | estable | `ordering` | mín. 2 | Automática si todas las opciones tienen `matching_key` | `answer_value_json` = `{ "<option_id>": "<clave>" }` |
| `q_matching` | Emparejamiento | estable | `ordering` | mín. 2 | Automática si todas las opciones tienen `matching_key` | `answer_value_json` = `{ "<option_id>": "<clave>" }` |
| `q_categorization` | Categorización | estable | `ordering` | mín. 2 | Automática si todas las opciones tienen `matching_key` | `answer_value_json` = `{ "<option_id>": "<clave>" }` |

### Texto, numérico y fecha

| Identificador | Nombre mostrado | Estado | Control | Reglas de opciones | Estrategia de calificación | Formato de respuesta |
| --- | --- | --- | --- | --- | --- | --- |
| `q_integer` | Entero | estable | `number` | — | Automática si hay `expectedValue` (con tolerancia) | `answer_value_json` = número |
| `q_decimal` | Decimal | estable | `number` | — | Automática si hay `expectedValue` (con tolerancia) | `answer_value_json` = número |
| `q_percentage` | Porcentaje | estable | `number` | — | Automática si hay `expectedValue` (con tolerancia) | `answer_value_json` = número |
| `q_currency` | Moneda | estable | `number` | — | Automática si hay `expectedValue` (con tolerancia) | `answer_value_json` = número |
| `q_date` | Fecha | estable | `date` | — | Automática si hay `expectedValue` | `answer_value_json` = texto |
| `q_time` | Hora | estable | `time` | — | Automática si hay `expectedValue` | `answer_value_json` = texto |
| `q_datetime` | Fecha y hora | estable | `datetime` | — | Automática si hay `expectedValue` | `answer_value_json` = texto |

### Escalas, matrices y tipos ricos

| Identificador | Nombre mostrado | Estado | Control | Reglas de opciones | Estrategia de calificación | Formato de respuesta |
| --- | --- | --- | --- | --- | --- | --- |
| `q_short_text` | Texto corto | estable | `text` | — | Revisión manual | `answer_value_json` = texto |
| `q_long_text` | Texto largo | estable | `textarea` | — | Revisión manual | `answer_value_json` = texto |
| `q_numeric_scale` | Escala numérica | estable | `number` | — | Revisión manual | `answer_value_json` = texto |
| `q_stars` | Estrellas / iconos | estable | `number` | — | Revisión manual | `answer_value_json` = texto |
| `q_matrix` | Matriz | estable | `matrix` | — | Revisión manual | `answer_value_json` = texto |
| `q_likert_matrix` | Matriz Likert | estable | `matrix` | — | Revisión manual | `answer_value_json` = texto |
| `q_editable_table` | Tabla editable | estable | `matrix` | — | Revisión manual | `answer_value_json` = texto |
| `q_hotspot` | Zona interactiva (base) | beta | `pending` | — | Revisión manual | `answer_value_json` = texto |
| `q_scenario` | Escenario | estable | `textarea` | — | Revisión manual | `answer_value_json` = texto |
| `q_multi_step_case` | Caso multi-paso | beta | `textarea` | — | Revisión manual | `answer_value_json` = texto |
| `q_chart_interpretation` | Interpretación de tabla/gráfico | estable | `textarea` | — | Revisión manual | `answer_value_json` = texto |
| `q_file_response` | Respuesta con archivo | estable | `content` | — | Revisión manual | `answer_value_json` = texto |

### Contratos de simulación (detrás de banderas)

| Identificador | Nombre mostrado | Estado | Control | Reglas de opciones | Estrategia de calificación | Formato de respuesta |
| --- | --- | --- | --- | --- | --- | --- |
| `q_code` | Pregunta de código | estable | `content` | — | Revisión manual | `answer_value_json` = texto |
| `q_sql` | Consulta SQL | estable | `content` | — | Revisión manual | `answer_value_json` = texto |
| `q_spreadsheet_sim` | Simulación de hoja de cálculo | estable | `content` | — | Revisión manual | `answer_value_json` = texto |
| `q_interactive_video` | Video interactivo | estable | `content` | — | Revisión manual | `answer_value_json` = texto |
| `q_credit_analysis` | Análisis de crédito | estable | `content` | — | Revisión manual | `answer_value_json` = texto |
| `q_risk_analysis` | Análisis de riesgo | estable | `content` | — | Revisión manual | `answer_value_json` = texto |
| `q_cashier_sim` | Simulación de caja | estable | `content` | — | Revisión manual | `answer_value_json` = texto |
| `q_reconciliation` | Conciliación | estable | `content` | — | Revisión manual | `answer_value_json` = texto |
| `q_customer_service_sim` | Simulación de servicio al cliente | estable | `content` | — | Revisión manual | `answer_value_json` = texto |
| `q_operations_sim` | Simulación de operaciones | estable | `content` | — | Revisión manual | `answer_value_json` = texto |
| `q_financial_statements` | Análisis de estados financieros | estable | `content` | — | Revisión manual | `answer_value_json` = texto |

## Compatibilidad con vista previa y resultados

| Control | Vista previa del candidato | Panel de resultados |
| --- | --- | --- |
| `content` | Renderiza el contenido tal cual. | No aplica. |
| `radio`, `checkbox`, `select` | Controles nativos accesibles. | Muestra la opción elegida y si fue correcta. |
| `text`, `textarea`, `number`, `date`, `time`, `datetime` | Campo correspondiente. | Muestra el valor; corrección solo si hay valor esperado. |
| `ordering` | Lista numerada de solo lectura (la interacción de arrastre queda para el portal). | Muestra el valor enviado. |
| `matrix`, `upload` | Aviso explicativo: la respuesta la califica una persona. | Marca «Revisión». |
| `pending` | Aviso de que el editor interactivo está pendiente. | Marca «Revisión». |

## Tipos que requieren revisión manual

`q_short_text`, `q_long_text`, `q_numeric_scale`, `q_stars`, `q_matrix`,
`q_likert_matrix`, `q_editable_table`, `q_hotspot`, `q_scenario`,
`q_multi_step_case`, `q_chart_interpretation`, `q_file_response` y los once
contratos de simulación. Los tipos `auto_if_configured` caen en este grupo
mientras el autor no defina su clave objetiva; el constructor lo indica con la
etiqueta «La califica una persona» en el panel de propiedades.

## Tipos potenciales que NO se agregaron

El encargo listaba tipos candidatos. Los que **ya existían** se conservaron e
implementaron. No se agregó ninguno nuevo, porque un tipo ornamental sin modelo,
validación, persistencia, recuperación, representación pública, formato de
respuesta, estrategia de evaluación y pruebas sería deuda, no una función. En
particular no existían ni se crearon: proctoring por cámara, calificación por IA,
certificados, aleatorización avanzada ni banco global de preguntas.
