# Entrega al portal de candidatos

Este documento es el contrato para el segundo frontend (público) que leerá las
evaluaciones publicadas y enviará respuestas. Todo lo que describe **existe y está
probado hoy** desde este repositorio.

## 1 · Lo que ya está hecho

| Pieza | Estado | Dónde |
| --- | --- | --- |
| Endpoint público de listado | ✅ implementado y probado | `listPublicAssessments` |
| Endpoint público de detalle saneado | ✅ | `getPublicAssessment` |
| Apertura de intento | ✅ | `startAttempt` |
| Envío y calificación de intento | ✅ | `submitAttempt` |
| Saneamiento (sin claves de respuesta) | ✅ 9 pruebas | `Sanitize.gs`, `appsScript.sanitization.test.ts` |
| Calificación en servidor | ✅ 16 pruebas | `ScoringService.gs` |
| Idempotencia de envíos | ✅ | `ProcessedRequests` |
| Anclaje a la versión publicada | ✅ | `Attempts.version_id` + snapshot |
| Estados de calificación | ✅ | `automatically_graded` / `pending_manual_review` / `fully_graded` |
| Cliente TypeScript de referencia | ✅ | `src/features/assessments/api/publicApi.ts` |
| Tipos y esquemas Zod del DTO público | ✅ | `src/features/assessments/api/dto.ts` |

## 2 · Cómo empezar

1. Pide al equipo del panel la **URL del Web App** (`…/exec`) y comprueba que
   responde:

   ```bash
   curl -sL "URL?action=ping"
   ```

2. Copia al portal estos tres archivos como punto de partida (son autónomos salvo
   por `shared/result.ts` y `shared/flags.ts`):

   ```
   src/features/assessments/api/contract.ts    envoltorio + errores tipados
   src/features/assessments/api/dto.ts         esquemas Zod (solo la parte pública)
   src/features/assessments/api/publicApi.ts   las cuatro acciones públicas
   ```

3. El transporte (`api/transport.ts`) también sirve, pero recuerda las dos reglas
   que no se pueden omitir:

   - `redirect: "follow"` en toda petición (Google responde `302`).
   - `Content-Type: text/plain;charset=utf-8` en los `POST` (el despliegue por
     omisión no contesta el *preflight* de CORS).

4. Antes de que el portal sea accesible desde fuera, el panel debe cambiar el
   despliegue a **«Quién tiene acceso: cualquier persona»** (ver
   `APPS_SCRIPT_SETUP.md §8`). Las acciones administrativas seguirán exigiendo
   identidad: un anónimo recibe `FORBIDDEN`.

## 3 · Flujo del candidato

```
1. El candidato llega con un código público (EVL-XXXX-YYYY), por enlace o correo.
2. getPublicAssessment(publicCode)
     → título, instrucciones, duración, secciones y preguntas SIN claves.
     → NOT_FOUND si el código no existe, o si la evaluación está en borrador,
       pausada, cerrada o archivada (el candidato no puede distinguir el motivo).
3. (Opcional) startAttempt(requestId, { publicCode, participant })
     → attemptId + versionId: ancla la evaluación a la versión vigente y marca
       el inicio para medir el tiempo.
4. El candidato responde. El portal guarda el progreso donde quiera
   (localStorage, su propio backend…). El servidor NO guarda progreso parcial.
5. submitAttempt(requestId, { publicCode, attemptId?, participant, answers })
     → el servidor califica y responde el resultado permitido por la política.
6. Si el requestId se repite: warnings: ["IDEMPOTENT_REPLAY"], sin duplicar.
```

## 4 · Forma exacta de las respuestas a enviar

```ts
interface PublicAnswerInput {
  questionId: string;
  /** Tipos de una sola opción. */
  selectedOptionId?: string;
  /** Tipos de varias opciones. */
  selectedOptionIds?: string[];
  /** Texto, número, fecha, o el mapa { optionId: clave } de orden/emparejamiento. */
  value?: string | number | boolean | Record<string, unknown> | null;
}
```

Por tipo de control (`QUESTION_TYPES.md` tiene la tabla completa):

| Control | Qué enviar |
| --- | --- |
| `radio`, `select` | `selectedOptionId` |
| `checkbox` | `selectedOptionIds[]` |
| `text`, `textarea` | `value` como cadena |
| `number` | `value` como número |
| `date`, `time`, `datetime` | `value` como cadena ISO |
| `ordering` | `value` = `{ "<optionId>": "<posición o categoría>" }` |
| `matrix`, `upload`, `pending` | `value` libre; siempre pasa a revisión humana |

> **Nunca envíes** `isCorrect`, `pointsAwarded`, `score` ni `passed`. El servidor los
> descarta antes de escribir (`evalStripClientScoring_`), así que enviarlos no
> aporta nada y ensucia la carga. Hay una prueba que verifica que el cliente de
> referencia no los incluye.

## 5 · Errores que el portal debe manejar

| Código | Situación | Qué mostrar |
| --- | --- | --- |
| `NOT_FOUND` | Código inexistente o evaluación no disponible. | «Esta evaluación no está disponible». Sin más detalle. |
| `VALIDATION_ERROR` | Pregunta u opción ajena, respuestas duplicadas, demasiadas respuestas. | Error genérico + registro para el equipo. Indica un fallo del portal, no del candidato. |
| `CONFLICT` | El intento ya se envió. | «Ya recibimos tus respuestas». |
| `LOCK_TIMEOUT` | Servidor ocupado. | «Inténtalo de nuevo en unos segundos», reintentando **con el mismo `requestId`**. |
| `SCHEMA_ERROR` | La hoja no tiene el esquema esperado. | Error genérico + alerta al equipo. |
| `INTERNAL_ERROR` | Inesperado. | Error genérico. Ya quedó en `AuditLog`. |

Los mensajes que devuelve el servidor son seguros para mostrar, pero conviene que
el portal use su propia redacción orientada al candidato.

## 6 · Lo que el candidato puede recibir al terminar

Depende de `policies.resultVisibility.candidate`, configurable por evaluación:

| Valor | Respuesta |
| --- | --- |
| `none` (por omisión) | `attemptId`, `status`, `gradingStatus`, `received` |
| `submission_only` | Igual que `none` |
| `score` | Añade `score` y `passed` |
| `score_and_feedback` | Añade `score` y `passed` (la retroalimentación por pregunta **no** está implementada) |

Cuando `gradingStatus` es `pending_manual_review`, `score` viene en `null`: hay
preguntas abiertas y la nota final aún no existe. El portal **no debe mostrar 0**
en ese caso; el texto correcto es «Tus respuestas están en revisión».

## 7 · Trabajo pendiente del lado del portal

Está fuera del alcance de esta entrega y le corresponde al portal:

1. **Renderizado de los controles interactivos.** El backend entrega
   `questionType`, `configuration` (lista blanca de presentación) y `options`.
   Los controles de `ordering`, `matrix` y `upload` hay que construirlos.
2. **Temporizador.** `durationMinutes` y `timing` viajan en el DTO, pero el cierre
   por tiempo es del cliente. El servidor registra `duration_seconds` para
   auditoría.
3. **Guardado de progreso parcial.** No hay endpoint de progreso: `submitAttempt`
   es un envío único. Si se necesita reanudar, el portal debe guardarlo localmente
   o pedir un endpoint nuevo.
4. **Límite de intentos por persona.** `attemptPolicy.maxAttempts` existe en el
   modelo pero el endpoint público no lo aplica: un candidato podría enviar varios
   intentos con `requestId` distintos. Aplicarlo requiere decidir la identidad del
   candidato (correo, documento, sesión) y añadir la comprobación en
   `AttemptService.gs`.
5. **Consentimiento.** `consent.requireConsent` y `consentText` viajan en el DTO;
   mostrarlos y bloquear el inicio hasta la aceptación es del portal.
6. **Accesibilidad del renderizador.** El DTO trae `accessibility.ariaLabel` y
   `longDescription` por pregunta: úsalos.
7. **Aleatorización.** `randomizationPolicy` existe en el modelo pero el DTO público
   entrega el orden autoral. Aleatorizar de forma determinista por intento
   requiere añadirlo en `Sanitize.gs` con la semilla del `attemptId`.

## 8 · Trabajo pendiente del lado del panel (no del portal)

1. **Interfaz de revisión manual.** Los intentos con `pending_manual_review` se
   guardan con todos sus datos, pero cerrar la calificación (asignar puntos y pasar
   a `fully_graded`) todavía no tiene pantalla. El estado, las columnas
   (`graded_at`, `graded_by`) y la lectura ya existen.
2. **Exportación de resultados.** `shared/sanitize.ts` ya trae `csvField` y
   `guardCsvCell` contra inyección de fórmulas.
3. **Notificación al candidato.** El sistema de plantillas de correo existe en
   Configuración; no está conectado a Evaluaciones.

## 9 · Reglas que el portal no puede romper

- **No pedir ni cachear el DTO administrativo.** El portal solo usa las cuatro
  acciones públicas.
- **No calcular notas.** Si el portal muestra un número, tiene que venir de
  `submitAttempt`.
- **No inferir respuestas correctas** de la configuración: no está ahí. Si algún día
  apareciera un dato que permita inferirla, es un fallo de seguridad que hay que
  reportar (y hay pruebas para que no ocurra).
- **Reutilizar el `requestId`** al reintentar un envío. Generar uno nuevo crearía un
  segundo intento.
