# Decisiones y suposiciones

Cada entrada registra el contexto, la alternativa elegida y por qué. La regla
aplicada en toda decisión menor fue: *inspeccionar la convención existente y
elegir la opción más conservadora*.

---

## D-01 · No se crea una aplicación aparte ni se reemplaza el módulo

El módulo `Evaluaciones` ya existe (`src/features/assessments/`, 30 archivos) y
está registrado en el dock. Se amplía en su sitio. Ningún módulo fuera de
Evaluaciones se modifica salvo cuatro archivos compartidos y estrictamente
necesarios (`contracts.ts`, `providers/index.ts`, `flags.ts`, `catalog.ts`), en
todos los casos **añadiendo** miembros, nunca cambiando ni quitando.

## D-02 · Hojas nuevas y normalizadas; la hoja `Evaluaciones` heredada no se toca

El backend actual guarda una evaluación por fila con once columnas JSON. El
requisito pide normalización. Se crean hojas nuevas (`Assessments`, `Sections`,
`Questions`, `Options`, `Versions`, `Attempts`, `Answers`,
`ProcessedRequests`, `AuditLog`) y **no se renombra, reordena ni borra nada** de
la hoja `Evaluaciones` existente, ni se modifica `docs/backend/Code.gs`.

Consecuencia: durante la transición pueden coexistir ambos esquemas. La
migración es explícita, se ejecuta a mano con `migrarDesdeHojaEvaluaciones()` y
está documentada en `GOOGLE_SHEETS_SETUP.md` con respaldo y rollback.

## D-03 · Se añade una hoja `Sections` que el enunciado no listaba

El producto **ya tiene secciones** (`assessmentSectionSchema`, con título,
descripción, temporizador, aleatorización, `poolSize` y peso). Eliminarlas para
encajar en un esquema plano `Assessments → Questions` destruiría funcionalidad
existente, lo que está prohibido. Se normaliza con una hoja `Sections` y
`Questions.section_id`. Es la opción conservadora: preserva el producto y
mantiene la normalización pedida.

## D-04 · `version` de la hoja se descompone en `version` (mayor) y `version_minor`

El dominio versiona en mayor/menor (`v2.3`) con reglas ya probadas
(`versioning/classify.ts`). El esquema pedido tiene un único `version:number`.
Se conserva `version` como el número **mayor** (compatible con el contrato
pedido) y se añade `version_minor`. El campo textual `version_label` («v2.3»)
existe solo para lectura humana.

## D-05 · Los snapshots de versiones publicadas se guardan como JSON en una hoja `Versions`

Regla en conflicto aparente: *«no conviertas toda la evaluación en un único JSON
dentro de una celda»* frente a *«una evaluación publicada no puede ser editada
destructivamente»*.

Resolución: la evaluación **viva** (la que se edita) está totalmente normalizada
en `Sections` / `Questions` / `Options`. Las **versiones publicadas** son
snapshots históricos inmutables y se guardan en `Versions.snapshot_json`, con
`snapshot_schema_version`, `question_count` y `checksum`. Motivos:

1. Un snapshot no se consulta ni se filtra por campos: se lee completo para
   calificar un intento anclado a esa versión.
2. Normalizarlo exigiría duplicar todas las filas de preguntas y opciones por
   cada publicación, multiplicando el tamaño de la hoja sin ninguna ventaja de
   consulta.
3. El JSON cumple las condiciones exigidas para JSON persistido: esquema
   conocido, versionado, validado antes de guardar, parseo seguro con valores por
   omisión y rechazo de configuraciones incompatibles (`Validation.gs`).

La calificación lee la clave de respuestas del snapshot de la versión anclada al
intento; si no existe snapshot (evaluaciones creadas antes de esta migración),
recurre a `Options` y lo registra en la auditoría.

## D-06 · `configuration_json` solo para configuración específica del tipo

Las propiedades comunes tienen columna propia (`question_text`,
`question_type`, `position`, `required`, `scoring_mode`, `max_points`,
`active`, …). `configuration_json` guarda únicamente lo específico del tipo
(`scaleMin`, `starCount`, `decimals`, `rows`, …) con
`configuration_schema_version`. Igual criterio en `Options`
(`score_value`, `matching_key` como columnas; el resto en JSON).

## D-07 · No se instala GSAP

`framer-motion` ya es el motor de animación del sistema completo (dock,
comparador, diálogos, toasts, listas) y cubre todo lo necesario: `layout`,
`layoutId`, `AnimatePresence`, springs y orquestación con `staggerChildren`.
Añadir GSAP significaría dos motores de animación en el mismo bundle para el
mismo problema. Ver `MOTION_SYSTEM.md`.

## D-08 · No se añade un canvas Three.js dentro del módulo

`three` ya está instalado y se usa **una sola vez**, como fondo global diferido
(`ThreeBackground`) que ya aporta la profundidad del Liquid Glass detrás del
módulo. Un segundo canvas dentro de Evaluaciones competiría por GPU con el
fondo, añadiría trabajo de limpieza y no aportaría información. La profundidad
extra se logra con CSS (capas translúcidas, gradientes, blur y bordes
luminosos). Decisión reversible y documentada en `MOTION_SYSTEM.md`.

## D-09 · No se instala ESLint

El repositorio no tiene ESLint (verificado). Instalarlo produciría cientos de
hallazgos en módulos fuera del alcance de esta tarea, justo lo que las reglas
prohíben. Como sustituto verificable se añade
`scripts/check-evaluations.mjs` (sin dependencias), que falla si encuentra:
`TODO`/`FIXME`/`XXX` introducidos, `fetch(` dentro de componentes,
`as any`/`: any`, marcadores de respuesta correcta en la ruta pública, secretos
con forma de credencial, o los mocks importados desde código de producción no
encapsulado. `tsc -b` estricto sigue siendo el analizador estático principal.

## D-10 · Autorización: interfaz + identidad de Google, sin token en el frontend

*(Superada por D-22, D-23 y D-24. Se conserva porque el modo `google_identity`
sigue existiendo y porque explica de dónde venía el problema.)*

No existe un proveedor de identidad verificable accesible desde el navegador para
Apps Script sin incrustar un secreto. Se implementa `Auth.gs` con dos modos:

- `google_identity` (recomendado **entonces**): la Web App se despliega
  **ejecutándose como el usuario que accede** y con acceso restringido a la
  organización; `Session.getActiveUser().getEmail()` se compara con la propiedad
  de script `ADMIN_EMAILS`. La identidad la verifica Google, no la aplicación.
- `open_admin`: requiere fijar explícitamente `ALLOW_ANONYMOUS_ADMIN=true`. En
  ese modo **toda** respuesta incluye `warnings: ["INSECURE_ADMIN_MODE"]`, cada
  escritura queda auditada y el frontend muestra un aviso visible. No se
  presenta como seguridad; es un modo de pruebas.

Ningún secreto viaja en el bundle. La URL del Web App es pública por diseño y no
es un secreto.

**Por qué no bastó:** la suposición «el reclutador llega con una sesión de Google
Workspace» es falsa en este ATS. El panel es React en Vercel y no implementa
Google Login, Google Identity Services, OAuth ni sesiones de Workspace, así que
`Session.getActiveUser().getEmail()` devuelve cadena vacía y toda operación
administrativa respondía `FORBIDDEN` con el despliegue correcto. El error fue
tratar la autenticación de Google como el único mecanismo posible en lugar de como
uno de varios.

## D-11 · Selección de proveedor: bandera dedicada para Evaluaciones

`FLAGS.dataProvider` conmuta Procesos y Evaluaciones a la vez. Para permitir el
despliegue por etapas se añade `VITE_ASSESSMENTS_PROVIDER`, que **solo** afecta
a Evaluaciones y por omisión hereda `VITE_DATA_PROVIDER`. Para que no haya mezcla
silenciosa, el módulo muestra siempre el origen activo («Datos de demostración»
o «Google Apps Script») y los datos mock son inalcanzables salvo por
`MockAssessmentService`.

## D-12 · La calificación del navegador se degrada a «estimación de autoría»

`scoring/engine.ts` seguirá existiendo porque el constructor necesita mostrar
puntos totales y duración estimada. Se documenta y se renombra su resultado como
estimación: **la nota oficial la calcula exclusivamente `ScoringService.gs`** y
el frontend nunca envía `score`, `passed`, `isCorrect` ni `pointsAwarded`.

## D-13 · Preguntas manuales: la nota queda pendiente, no cero

Si un intento contiene preguntas sin criterio objetivo (`q_long_text`,
`q_short_text`, `q_file_response`, contratos de simulación), el intento se guarda
con `grading_status = "pending_manual_review"`, con `auto_score` calculado sobre
las preguntas objetivas y `score` en blanco. No se otorga cero automáticamente.
`passed` permanece vacío hasta que la revisión concluya.

## D-14 · La fórmula pedida se aplica a las preguntas calificables automáticamente

`score = correctAnswers / totalGradableQuestions * 100`, redondeado a dos
decimales, con peso igual por pregunta. `totalGradableQuestions` cuenta solo las
preguntas activas con calificación automática de la versión anclada; si es cero,
el resultado es `0` y el intento se marca `pending_manual_review` cuando existan
preguntas manuales, evitando la división por cero.

## D-15 · `accessType` se modela como enumeración de un solo valor

El requisito fija `accessType: "public"`. Se persiste la columna `access_type`
con el único valor admitido `public` y se valida contra una lista blanca, de modo
que añadir modos futuros sea un cambio de datos y no de esquema.

## D-16 · Los prefijos de ID pedidos se adoptan tal cual en el backend

`asm_`, `qst_`, `opt_`, `att_`, `ans_`, `req_`, más `sec_`, `ver_` y `aud_` para
las entidades adicionales. El dominio del frontend ya usaba `asm_`, `blk_`,
`opt_`, `sec_`, `ver_`. Al persistir, los bloques de tipo pregunta se guardan con
su ID existente **sin renombrarlo** (los IDs son estables y opacos); los IDs
nuevos que genera el servidor usan `qst_`. Se documenta que ambos prefijos son
válidos y que el ID nunca se interpreta.

## D-17 · Los IDs temporales del cliente se distinguen y se reemplazan al guardar

Los elementos creados en el constructor y aún no guardados llevan el ID que
genera `newId()` en el navegador. El servidor los acepta como identidad si son
opacos y únicos; solo genera IDs nuevos cuando faltan o cuando la entidad se
duplica. Así el estado del formulario no se pierde al guardar.

## D-18 · Sin paginación en la interfaz

El sistema no pagina en ningún módulo (Procesos y Postulantes tampoco). El
contrato `ListQuery` ya soporta paginación y el backend devuelve `total`, pero la
interfaz mantiene la convención existente: búsqueda + filtros sobre la lista
completa. Se documenta el umbral a partir del cual convendría paginar.

## D-19 · Sin arrastrar y soltar nuevo

No hay librería de *drag and drop* en el repositorio. El reordenamiento se hace
con botones «mover arriba / abajo» accesibles y con las flechas del teclado sobre
el elemento enfocado, que es el patrón que ya usa `BuilderCanvas` y el Kanban de
Procesos. Es además la alternativa accesible obligatoria.

## D-20 · Capturas de pantalla: no se fabrican

No hay navegador automatizado en este entorno (Playwright no descarga Chromium y
el paquete `chromium` de APT redirige a snap sin snapd). En lugar de afirmar
capturas inexistentes se entregan: (a) ciclos de QA visual ejecutados en jsdom
con aserciones reales, (b) `scripts/visual-qa.mjs` para reproducir la matriz
completa de capturas en una máquina con navegador, y (c) la limitación declarada
en `VISUAL_QA.md`.

## D-21 · Modelo y esfuerzo de razonamiento: no verificable

No existe ninguna capacidad en este entorno que exponga el identificador del
modelo activo ni su nivel de esfuerzo: no hay variable de entorno, endpoint ni
herramienta que lo devuelva. Conforme a la instrucción recibida, **no se afirma
estar usando Claude Opus 5 con effort max**. Lo verificable es el trabajo
entregado: los comandos ejecutados y sus salidas reales están en
`TEST_PLAN.md` y en el informe final.

---

## D-22 · La autorización se abstrae en proveedores; `google_identity` deja de ser el modo por omisión

`Auth.gs` dependía directamente de `Session.getActiveUser()`. Ahora responde solo
a dos preguntas — *¿esta acción es administrativa?* y *¿está autorizada?* — y
delega el «cómo» en un proveedor (`AuthProviders.gs`) con esta interfaz:

```js
{ id, label, identify(request), authorizeAdmin(request), describe() }
```

Registro de proveedores: `server_secret` (por omisión), `google_identity`,
`open_admin`, y `local_execution` (no seleccionable por configuración, solo
alcanzable desde `evalHandleTrustedRequest_()` para las funciones del editor).

| Alternativa considerada | Por qué no |
| --- | --- |
| Implementar Google Login completo en el panel | Es exactamente lo que la tarea prohíbe: obliga a Workspace, cambia el modelo de sesión de todo el ATS y no sirve para el futuro portal de candidatos. |
| Mantener `google_identity` por omisión y documentar el fallo | Deja el módulo roto en el despliegue real. |
| Usar `open_admin` en producción | Administración anónima. Descartado sin discusión. |

Consecuencias buscadas: la lógica de negocio no menciona el mecanismo de
autorización; un modo desconocido cae en `server_secret` (fail-closed); y añadir
OAuth en el futuro es registrar un proveedor más.

## D-23 · Las operaciones administrativas se firman en un backend intermedio, no en el navegador

El navegador no puede custodiar un secreto: cualquier valor que llegue al bundle
es público. Por tanto, si la autorización requiere un secreto de servidor, hace
falta un servidor. Se añaden dos funciones serverless en `api/evaluations/`:

- `session.ts`: valida la frase de acceso del panel y emite una cookie
  `HttpOnly` + `Secure` + `SameSite=Strict` de 8 horas.
- `admin.ts`: comprueba la sesión, comprueba que la acción esté en su propia lista
  blanca administrativa, firma con HMAC-SHA256 y reenvía a Apps Script tal cual.

El reparto es explícito: React dice *qué* quiere hacer; el proxy dice *quién* lo
pide y lo firma; Apps Script verifica, valida, bloquea, audita y escribe. El
secreto vive en variables de entorno del proyecto de Vercel y en las Script
Properties, y en ningún otro sitio (dos reglas estáticas nuevas lo comprueban:
`src/` no puede importar `api/` y `api/` no puede leer variables `VITE_`).

| Alternativa considerada | Por qué no |
| --- | --- |
| Token permanente en el bundle o en `localStorage` | Secreto público. Prohibido explícitamente. |
| «Seguridad» por URL secreta del Web App | No es seguridad; además la URL viaja en cada petición del navegador. |
| Firmar en el navegador con un secreto derivado | Cualquier derivación reversible en el cliente equivale a publicar el secreto. |
| Cloudflare Worker / otro proveedor | Equivalente; se eligió Vercel porque es donde ya vive el panel y no añade infraestructura nueva. |

**Limitación declarada:** la frase de acceso es compartida, así que la identidad
que se audita es *afirmada* por el proxy (se registra como `proxy:<actor>`), no
verificada por un proveedor de identidad. Es la única pieza que Google Login
mejoraría, y está aislada en un solo archivo.

## D-24 · Detalles de la credencial firmada: HMAC-SHA256, frescura de 5 minutos y nonce de un solo uso

La credencial viaja en el campo `auth` de la solicitud (campo **nuevo y
opcional**; el resto del contrato no cambia) y firma
`v1 \n acción \n requestId \n timestamp \n nonce \n actor`.

- **`timestamp`** con ventana de ±5 minutos: una firma capturada caduca sola.
- **`nonce`** recordado en `CacheService`: la misma firma no vale dos veces.
- **Comparación de tiempo constante**: no se filtra el secreto por temporización.
- **Dos secretos válidos** (`…_SECRET` y `…_SECRET_NEXT`) para rotar sin caída.
- **El `actor` va dentro de la firma**: el navegador no puede suplantar a otro
  reclutador en la bitácora, aunque manipule la carga.
- **El motivo del rechazo solo se audita**, nunca se devuelve: el endpoint no es
  un oráculo que diga si falló la firma, el reloj o el nonce.

No se firma el cuerpo de la solicitud. Hacerlo exigiría que Apps Script
reserializase el JSON exactamente igual que el firmante, y su runtime no lo
garantiza (el orden de claves numéricas cambia); una invariante que no se puede
verificar es peor que no tenerla. El cuerpo está protegido por TLS y el navegador
nunca ve la firma. Queda anotado como limitación en `SECURITY.md`.
