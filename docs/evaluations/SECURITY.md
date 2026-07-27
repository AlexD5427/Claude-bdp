# Seguridad del módulo Evaluaciones

Este documento describe lo que el módulo **hace**, lo que **no puede hacer** y qué
queda como limitación reconocida. No presenta ninguna ocultación como seguridad.

## 1 · Modelo de amenazas

| Amenaza | Impacto | Mitigación |
| --- | --- | --- |
| Un candidato lee las respuestas correctas antes de responder. | Invalida la evaluación. | Saneamiento por lista blanca en `Sanitize.gs`, verificado con 25 términos prohibidos sobre la respuesta serializada completa (`appsScript.sanitization.test.ts`). |
| Un candidato manipula su nota en el cliente. | Resultado falso. | `evalStripClientScoring_` descarta `isCorrect`, `pointsAwarded`, `score` y `passed` antes de escribir; la nota la calcula `ScoringService.gs`. |
| Un candidato responde a preguntas de otra evaluación o con opciones ajenas. | Puntuación inválida. | Se verifica la pertenencia pregunta → versión y opción → pregunta; cualquier desvío es `VALIDATION_ERROR`. |
| Un candidato ve un borrador o una evaluación archivada. | Fuga de contenido no aprobado. | El endpoint público exige `status="published"` **y** `publication_status="published"`; el resto responde `NOT_FOUND` sin distinguir el motivo. |
| Alguien sin autorización crea, edita o publica evaluaciones. | Integridad del proceso. | `Auth.gs` con identidad verificada por Google. |
| Doble clic o reintento duplica una escritura. | Datos duplicados. | Idempotencia por `requestId` en `ProcessedRequests`, comprobada dentro del bloqueo. |
| Dos personas guardan a la vez. | Pérdida de cambios. | `ScriptLock` + concurrencia optimista por `entity_version` → `CONFLICT`. |
| Editar una evaluación publicada altera intentos ya rendidos. | Resultados históricos falsos. | Los snapshots de `Versions` se escriben una sola vez; los intentos quedan anclados a su `version_id`. |
| Inyección de fórmulas al exportar a hoja de cálculo. | Ejecución al abrir el CSV. | `guardCsvCell` / `csvField` en `shared/sanitize.ts`; el backend no escribe JSON que empiece por `=`, `+`, `-` o `@`. |
| XSS por contenido de la evaluación. | Ejecución en el navegador. | Nunca se renderiza HTML del backend: todo el texto pasa por React, que escapa por omisión. No hay `dangerouslySetInnerHTML` en el módulo. |
| Contaminación de prototipo vía `configuration_json`. | Comportamiento inesperado del servidor. | `evalPlainObject_` descarta `__proto__`, `constructor` y `prototype`, limita la profundidad y el número de claves. |
| Fuga de datos personales en la bitácora. | Privacidad. | `evalSafeMetadata_` tiene lista negra explícita (nombre, correo, documento, respuestas, snapshots) y solo admite números, booleanos y textos cortos. |

## 2 · Autorización

**No hay ningún token en el frontend.** El bundle no contiene credenciales; lo
verifica `scripts/check-evaluations.mjs` con patrones de clave de API, clave
privada, JWT y credencial literal.

La autorización se resuelve en el servidor con la identidad que Google verifica:

### Modo `google_identity` (recomendado, por omisión)

```
Web App desplegado con «Ejecutar como: usuario que accede»
                     + «Quién tiene acceso: usuarios de la organización»
  → Session.getActiveUser().getEmail() devuelve una identidad verificada
  → se compara con la propiedad de script EVALUATIONS_ADMIN_EMAILS
```

- Sin identidad → `FORBIDDEN`.
- Identidad fuera de la lista → `FORBIDDEN`.
- Lista vacía → basta con ser una cuenta verificable (el acceso ya está limitado
  al dominio por el despliegue).

### Modo `open_admin` (solo pruebas)

Exige **dos** propiedades explícitas: `EVALUATIONS_AUTH_MODE=open_admin` **y**
`EVALUATIONS_ALLOW_ANONYMOUS_ADMIN=true`. Si falta la segunda, responde
`FORBIDDEN`.

Cuando está activo:

- **toda** respuesta incluye `warnings: ["INSECURE_ADMIN_MODE"]`;
- cada escritura queda registrada en `AuditLog` con el actor `anonymous` o
  `sin-verificar:<nombre>`;
- el frontend puede mostrar el aviso porque la advertencia viaja en el envoltorio.

> **Esto no es seguridad.** Es un modo de pruebas declarado. No debe usarse con
> datos reales ni apuntando a la hoja de producción.

### Permisos del frontend

`features/shared/permissions.ts` mapea el rol del perfil a capacidades
(`create`, `edit`, `publish`, `close`, `archive`, `import`, `viewAnalytics`).
**Mejora la experiencia, no sustituye la autorización**: ocultar un botón no
impide una petición. Toda escritura se vuelve a autorizar en el servidor.

## 3 · Saneamiento de la superficie pública

El DTO público se construye **campo por campo** en `Sanitize.gs`, nunca copiando
el objeto interno. Consecuencia deseada: si mañana se añade una columna a
`Questions`, no puede filtrarse por accidente, porque nadie la copia.

Campos garantizadamente ausentes: `is_correct`/`isCorrect`, `correct`,
`correctAnswer`, `answerKey`, `score_value`/`scoreValue`, `points_awarded`,
`max_points`, `scoring_mode`, `matching_key`, `feedback`,
`internal_instructions`, `passing_score`, `created_by`, `updated_by`,
`entity_version`, `tags`, `rules`, `rubrics`, `assessment_id` interno y cualquier
columna de auditoría.

Solo se reenvía la lista blanca de configuración de presentación
(`EVAL_PUBLIC_CONFIG_KEYS`): `placeholder`, `min`, `max`, `step`, `rows`,
`maxLength`, `minLength`, `scaleMin`, `scaleMax`, `scaleStep`, `columns`,
`currency`, `decimals`, `allowMultiple`, `maxSelections`, `minSelections`,
`icon`, `starCount`, `labelMin`, `labelMax`, `matrixRows`, `matrixColumns`.
En particular, `expectedValue` y `tolerance` **no** están en la lista.

### Doble barrera

| Capa | Archivo | Se prueba en |
| --- | --- | --- |
| Servidor | `apps-script/evaluations/Sanitize.gs` | `appsScript.sanitization.test.ts` (9 pruebas) |
| Frontend (vista previa) | `src/infrastructure/mappers/publicDto.ts` | `publicSanitization.test.ts` (5 pruebas) |
| Estática | — | `scripts/check-evaluations.mjs`, regla `clave-de-respuesta-en-ruta-publica` |

La vista previa del reclutador pasa por el **mismo** mapeador público, así que si
algo se filtrara ahí también se filtraría en producción. El modo administrativo
«ver respuestas correctas» es una vista separada que lee el contenido local y
nunca el DTO público, y lo avisa en pantalla.

## 4 · Integridad de las escrituras

Orden exacto de cada escritura (`RequestService.gs` + servicio):

1. Autorizar.
2. Adquirir `ScriptLock` (máximo 25 s; si no, `LOCK_TIMEOUT`).
3. Comprobar idempotencia (`ProcessedRequests`) **dentro** del bloqueo.
4. Validar la carga completa antes de tocar la hoja.
5. Comprobar la concurrencia optimista (`entity_version`).
6. Normalizar posiciones, escribir por lotes y dar de baja lógica lo que ya no llega.
7. Registrar `ProcessedRequests`.
8. Registrar `AuditLog`.
9. Liberar el bloqueo en `finally` (probado también en el camino de error).

No hay transacciones en Sheets. La estrategia es: **validar todo antes de
escribir** y escribir en bloques contiguos, de modo que una escritura parcial sea
improbable y, si ocurriera, detectable por `AuditLog` y por `question_count`.

## 5 · Datos personales

- `Attempts` guarda nombre, correo y documento del participante **si el portal los
  envía**; si no, se genera un `anonymous_token` opaco.
- El `user_agent` se trunca a 300 caracteres. No se guarda dirección IP.
- `AuditLog` **nunca** guarda datos del participante ni contenido de respuestas.
- El resultado que se devuelve al candidato respeta
  `policies.resultVisibility.candidate` y por omisión no incluye la nota.
- No hay proctoring, cámara ni biometría, ni contrato para ello.

## 6 · Lo que NO está implementado (limitaciones reconocidas)

| Limitación | Consecuencia | Mitigación disponible |
| --- | --- | --- |
| No hay autenticación de candidatos. | Cualquiera con el `publicCode` puede rendir la evaluación. | El código es aleatorio de 8 caracteres útiles; se puede exigir consentimiento y datos del participante; el portal puede añadir su propia capa. |
| No hay límite de intentos por persona en el endpoint público. | Un candidato podría enviar varios intentos con `requestId` distintos. | `attemptPolicy.maxAttempts` existe en el modelo pero su aplicación pertenece al portal (`PORTAL_CANDIDATES_HANDOFF.md` §Pendientes). |
| No hay límite de tasa. | Un cliente podría agotar la cuota de Apps Script. | Cuotas propias de Google; se puede añadir un contador por `participant_email` en una fase posterior. |
| El temporizador es del cliente. | Un candidato podría exceder la duración. | `Attempts.duration_seconds` queda registrado para revisión; el cierre por tiempo del lado servidor es trabajo del portal. |
| La revisión manual no tiene interfaz. | Los intentos con preguntas abiertas quedan `pending_manual_review` sin forma de cerrarlos desde el panel. | El estado y los datos ya existen; la interfaz de revisión es la fase siguiente. |
| Sin firma de las respuestas del portal. | Un cliente podría enviar respuestas arbitrarias. | Toda respuesta se valida contra el snapshot; lo peor que puede lograr es un intento inválido, nunca una nota falsa. |

## 7 · Cómo verificar la seguridad tú mismo

```bash
npm run check     # incluye la búsqueda de secretos y de claves en la ruta pública
npm test          # 14 pruebas dedicadas al saneamiento y a la calificación
```

Y contra el despliegue real:

```bash
curl -sL "URL?action=getPublicAssessment&publicCode=TU-CODIGO" \
  | grep -Eo 'isCorrect|is_correct|answerKey|scoreValue|passingScore|feedback' \
  || echo "sin fugas ✔"
```

## 8 · Qué revisar en cada cambio futuro

- ¿Se añadió una columna a `Questions` u `Options`? Comprueba que **no** aparezca
  en `Sanitize.gs` salvo que sea deliberadamente pública.
- ¿Se añadió una acción al enrutador? Debe estar en `EVAL_ADMIN_ACTIONS` o en
  `EVAL_PUBLIC_ACTIONS`; si no, `evalAuthorize_` la rechaza con
  `UNSUPPORTED_ACTION`.
- ¿Se añadió una clave de configuración? Solo llega al candidato si se agrega a
  `EVAL_PUBLIC_CONFIG_KEYS`, y eso debe ser una decisión consciente.
- ¿Se añadió un tipo de pregunta? La prueba de paridad exige declararlo en los dos
  catálogos con la misma estrategia de calificación.
