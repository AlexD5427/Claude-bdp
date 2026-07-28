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
| Alguien sin autorización crea, edita o publica evaluaciones. | Integridad del proceso. | `Auth.gs` + proveedor activo. Por omisión, firma HMAC-SHA256 emitida por el backend intermedio; sin firma válida, `FORBIDDEN`. |
| Alguien copia una firma de un registro y la reutiliza. | Operación administrativa ajena. | La firma caduca en 5 min y su `nonce` solo vale una vez (`CacheService`). |
| Alguien intenta extraer el secreto del bundle de React. | Suplantación del panel. | El secreto solo existe en variables de entorno del backend intermedio y en las Script Properties. `src/` no puede importar `api/` (regla estática). |
| El navegador afirma ser otro reclutador en la bitácora. | Auditoría falsa. | El `actor` lo pone la sesión del backend intermedio, no la carga del cliente, y va dentro de la cadena firmada. |
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
privada, JWT y credencial literal, y además prohíbe que `src/` importe cualquier
archivo de `api/`.

### Por qué ya no se depende de `Session.getActiveUser()`

El panel administrativo es una aplicación React desplegada en Vercel que consume
la API de Apps Script. **No** tiene Google Login, ni Google Identity Services, ni
OAuth, ni sesión de Google Workspace. Durante la ejecución del Web App,
`Session.getActiveUser().getEmail()` devuelve una cadena vacía, así que exigirla
convertía toda operación administrativa en `FORBIDDEN` aunque el despliegue
fuese correcto. El endpoint público (`?action=ping`) siempre funcionó porque no
pasa por esa comprobación.

La respuesta **no** ha sido rebajar la seguridad, sino dejar de confundir
*autenticación* con *autorización*: la identidad ya no tiene que venir de Google
para que la autorización sea real.

### Arquitectura vigente

```
navegador (React, sin secretos)
   │  1. frase de acceso  ──►  /api/evaluations/session
   │                          emite cookie HttpOnly+Secure+SameSite=Strict
   │  2. acción admin     ──►  /api/evaluations/admin
   │                          ¿sesión válida? ¿acción administrativa conocida?
   │                          firma HMAC-SHA256 con el secreto del servidor
   ▼                                     │
Apps Script  ◄───────────────────────────┘
   Signature.gs verifica firma + frescura (5 min) + nonce de un solo uso
   Auth.gs autoriza y pasa a la lógica de negocio solo un `actor`
```

Cadena canónica que se firma (idéntica en `Signature.gs` y en
`api/_lib/appsScriptSignature.ts`, con prueba de paridad):

```
v1 \n acción \n requestId \n timestamp \n nonce \n actor
```

No incluye el cuerpo a propósito: quien firma es el backend intermedio, el canal
es TLS y el navegador nunca ve una firma que pudiera reutilizar con otro cuerpo.
Ligar el cuerpo exigiría que Apps Script reserializase el JSON byte a byte igual,
algo que su runtime no garantiza; se prefirió una invariante verificable a una
falsa garantía.

### Modos disponibles (propiedad `EVALUATIONS_AUTH_MODE`)

| Modo | Uso | Qué exige |
| --- | --- | --- |
| `server_secret` **(por omisión)** | El ATS real. | `EVALUATIONS_ADMIN_SHARED_SECRET` de 32+ caracteres y una credencial firmada por operación. |
| `google_identity` | Despliegues con sesión de Workspace. | «Ejecutar como: usuario que accede» + acceso restringido a la organización. Comportamiento idéntico al anterior. |
| `open_admin` | Solo pruebas. | Además `EVALUATIONS_ALLOW_ANONYMOUS_ADMIN=true`; marca cada respuesta con `INSECURE_ADMIN_MODE`. |

Un valor desconocido **no** abre la puerta: cae en `server_secret`. Y el
proveedor `local_execution` (las funciones de `Setup.gs` ejecutadas a mano en el
editor) no es seleccionable por configuración: solo se alcanza desde
`evalHandleTrustedRequest_()`, y para llegar ahí ya hace falta permiso de edición
del proyecto de Apps Script.

**Falla cerrado.** Sin secreto configurado, o con un secreto de menos de 32
caracteres, ninguna operación administrativa se autoriza. El mensaje nombra la
propiedad que falta (útil para el operador) pero jamás su valor.

### Reparto de secretos

| Secreto | Dónde vive | Quién lo ve |
| --- | --- | --- |
| `EVALUATIONS_ADMIN_SHARED_SECRET` | Script Properties **y** variables de entorno de Vercel | Apps Script y el backend intermedio |
| `EVALUATIONS_PANEL_PASSPHRASE` | Variables de entorno de Vercel | el backend intermedio (y la persona que la teclea) |
| `EVALUATIONS_SESSION_SECRET` | Variables de entorno de Vercel | el backend intermedio |
| — | bundle de React | **nada** |

La URL `/exec` del Web App **no** es un secreto: es un endpoint público cuyo
control de acceso lo aplican `Auth.gs` y el saneamiento.

### Qué protege cada barrera

| Barrera | Contra qué | Dónde |
| --- | --- | --- |
| Cookie `HttpOnly` + `SameSite=Strict` | robo de sesión por JavaScript y CSRF | `api/_lib/adminSession.ts` |
| Comprobación de `Origin` | uso de la cookie desde otro sitio | `api/_lib/http.ts` |
| Límite de intentos de frase | ensayo y error trivial | `api/_lib/adminSession.ts` (por instancia; ver §6) |
| Lista blanca de acciones en el proxy | firmar algo que no es administrativo | `api/_lib/adminActions.ts` |
| Firma HMAC + frescura + nonce | llamadas directas al Web App y repeticiones | `Signature.gs` |
| Lista blanca de actores | cuentas no autorizadas | `EVALUATIONS_ADMIN_EMAILS` |
| Comparación de tiempo constante | filtración del secreto por temporización | `Signature.gs`, `adminSession.ts` |
| Motivo del rechazo solo en la bitácora | convertir el endpoint en un oráculo de firmas | `AuditService.gs` |

### Rotación del secreto

`EVALUATIONS_ADMIN_SHARED_SECRET_NEXT` permite tener dos secretos válidos a la
vez: se añade el nuevo como «siguiente», se actualiza Vercel, se comprueba y se
promueve. Sin ventana de caída.

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
| La puerta del panel es una frase de acceso compartida, no una identidad por persona. | La bitácora registra el actor que declara la sesión, no una identidad verificada (se marca `proxy:`). | Es transitorio y está aislado: cuando entre Google Login/OIDC, solo cambia cómo se emite la sesión (§Cómo añadir Google Login). Mientras tanto, `EVALUATIONS_ADMIN_EMAILS` limita quién puede actuar. |
| El límite de intentos de la frase de acceso es por instancia serverless. | Un atacante distribuido podría intentar más veces de lo que sugiere el contador. | La protección real es la longitud de la frase; se puede añadir un almacén compartido (KV) si hace falta. |
| La firma no liga el cuerpo de la solicitud. | Un atacante con acceso al canal TLS entre proxy y Apps Script podría alterar la carga. | TLS lo impide; el navegador nunca ve la firma. Documentado como decisión consciente en DECISIONS.md. |

## 6 bis · Hallazgos de la revisión de seguridad de esta PR

La revisión manual del diff encontró dos hallazgos con impacto de seguridad, ya
corregidos y con prueba de regresión:

- **F1**: `rollbackAssessment` y `resumeAssessment` estaban enrutadas pero sin
  clasificar como administrativas. Ahora una prueba exige que **toda** acción del
  enrutador esté en exactamente una de las dos listas.
- **F2**: el listado público informaba el conteo de preguntas del **borrador** en
  lugar de el de la versión servida, filtrando el tamaño de trabajo no publicado.

El detalle completo, con los otros ocho hallazgos, está en
[`CODE_REVIEW.md`](./CODE_REVIEW.md).

## 6 ter · Cómo añadir Google Login en el futuro sin tocar el negocio

1. Registrar un proveedor nuevo en `AuthProviders.gs` (por ejemplo
   `google_oauth`) que valide el `id_token` que envíe el frontend, y ponerlo en
   `EVALUATIONS_AUTH_MODE`.
2. En el backend intermedio, sustituir la frase de acceso por el intercambio
   OAuth y emitir la misma cookie de sesión (o dejar de proxyear si el token
   viaja directo).
3. No hay paso 3: `Router.gs`, `AssessmentService.gs`, `AttemptService.gs`,
   `ScoringService.gs`, la idempotencia, el bloqueo, la auditoría y el
   saneamiento no cambian, porque nunca supieron cómo se autorizaba la llamada.

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

Y que la administración no es alcanzable sin firma:

```bash
curl -sL -X POST "URL" -H 'Content-Type: text/plain;charset=utf-8' \
  -d '{"action":"listAdminAssessments","requestId":"","payload":{}}' \
  | grep -q FORBIDDEN && echo "administración protegida ✔"
```

## 8 · Qué revisar en cada cambio futuro

- ¿Se añadió una columna a `Questions` u `Options`? Comprueba que **no** aparezca
  en `Sanitize.gs` salvo que sea deliberadamente pública.
- ¿Se añadió una acción al enrutador? Debe estar en `EVAL_ADMIN_ACTIONS` o en
  `EVAL_PUBLIC_ACTIONS`; si no, `evalAuthorize_` la rechaza con
  `UNSUPPORTED_ACTION`. Y si es administrativa, debe añadirse también a
  `api/_lib/adminActions.ts` y a `src/features/assessments/api/adminActions.ts`
  (hay una prueba que compara las tres listas).
- ¿Se tocó la cadena canónica de la firma? Debe cambiarse en los dos lados y
  subir la versión (`v1` → `v2`); la prueba de paridad falla si se separan.
- ¿Se añadió una clave de configuración? Solo llega al candidato si se agrega a
  `EVAL_PUBLIC_CONFIG_KEYS`, y eso debe ser una decisión consciente.
- ¿Se añadió un tipo de pregunta? La prueba de paridad exige declararlo en los dos
  catálogos con la misma estrategia de calificación.
