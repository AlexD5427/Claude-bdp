# Configuración y despliegue de Apps Script (paso a paso)

Backend: [`apps-script/evaluations/`](../../apps-script/evaluations/).
Requisito previo: haber completado [`GOOGLE_SHEETS_SETUP.md`](./GOOGLE_SHEETS_SETUP.md).

## 1 · Crear el proyecto

Dos opciones:

| Opción | Cómo | Recomendación |
| --- | --- | --- |
| **Proyecto independiente** | [script.google.com](https://script.google.com) → *Nuevo proyecto*. Requiere fijar `EVALUATIONS_SPREADSHEET_ID`. | ✅ Recomendada: se despliega, versiona y revierte sin tocar el Web App existente del resto del sistema. |
| Vinculado a la hoja | En la hoja: `Extensiones → Apps Script`. | Solo si prefieres tenerlo dentro de la hoja. Convive con el script actual, pero comparten cuota y despliegues. |

Nombra el proyecto `Evaluaciones · API`.

> **No modifiques `docs/backend/Code.gs`.** Ese es el Web App del resto del
> sistema (postulantes, KPIs, documentación, perfiles de cargo, Procesos y la hoja
> `Evaluaciones` heredada). Este backend es independiente y tiene su propia URL,
> de modo que un fallo aquí no puede afectar a los demás módulos.

## 2 · Copiar los archivos

Crea un archivo de secuencia de comandos por cada `.gs` **con el mismo nombre** y
pega su contenido completo:

```
Config.gs          Response.gs      IdService.gs      SheetRepository.gs
Sanitize.gs        Validation.gs    Signature.gs      AuthProviders.gs
Auth.gs            RequestService.gs                  AuditService.gs
AssessmentService.gs                PublicAssessmentService.gs
AttemptService.gs  ScoringService.gs                  Router.gs
Code.gs            Setup.gs         Tests.gs
```

El orden no afecta al funcionamiento (Apps Script concatena todo en un único
ámbito global), pero copiarlos en ese orden hace el proyecto legible.

## 3 · Configurar `appsscript.json`

`Configuración del proyecto → ☑ Mostrar el archivo de manifiesto
"appsscript.json"`. Sustituye su contenido por el de
[`appsscript.json.example`](../../apps-script/evaluations/appsscript.json.example):

```json
{
  "timeZone": "America/La_Paz",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/userinfo.email"
  ],
  "webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS" }
}
```

| Campo | Por qué ese valor |
| --- | --- |
| `runtimeVersion: "V8"` | El código usa sintaxis moderna. |
| `spreadsheets` | Leer y escribir las nueve pestañas. |
| `userinfo.email` | Solo lo usa el modo `google_identity`. Con `server_secret` no hace falta, pero dejarlo permite cambiar de modo sin volver a autorizar. |
| `executeAs: USER_DEPLOYING` | El script accede a la hoja con TU cuenta. La identidad del llamador ya no se usa para autorizar: la autorización es la firma del backend intermedio. |
| `access: ANYONE_ANONYMOUS` | El panel de Vercel y el futuro portal de candidatos llaman sin sesión de Google. Lo que protege la administración es la firma, no la visibilidad del endpoint. |

> **¿Y si tu organización sí tiene Google Login?** Entonces puedes desplegar con
> `USER_ACCESSING` + `DOMAIN` y poner `EVALUATIONS_AUTH_MODE=google_identity`. Ese
> modo se conserva íntegro. Ver §8.

## 4 · Configurar las Script Properties

`Configuración del proyecto → Propiedades de la secuencia de comandos → Añadir
propiedad`. **Aquí no hay secretos del frontend**: son valores de servidor que el
navegador nunca ve.

| Propiedad | Ejemplo | Obligatoria | Qué hace |
| --- | --- | --- | --- |
| `EVALUATIONS_SPREADSHEET_ID` | `1AbCdEf…XyZ` | Sí, si el proyecto es independiente | Hoja de cálculo destino. Sin ella se usa la hoja contenedora. |
| `EVALUATIONS_ADMIN_SHARED_SECRET` | 32+ caracteres aleatorios | **Sí** (modo por omisión) | Secreto que comparten Apps Script y el backend intermedio de Vercel. Sin él, ninguna operación administrativa se autoriza. |
| `EVALUATIONS_ADMIN_SHARED_SECRET_NEXT` | 32+ caracteres aleatorios | No | Segundo secreto válido, para rotar sin cortar el servicio. |
| `EVALUATIONS_ADMIN_EMAILS` | `ana@banco.com, luis@banco.com` | Recomendada | Lista blanca de actores. Vacía = cualquier actor que llegue con firma válida. |
| `EVALUATIONS_AUTH_MODE` | `server_secret` | No (valor por omisión) | `server_secret`, `google_identity` u `open_admin`. Un valor desconocido cae en `server_secret`. |
| `EVALUATIONS_ALLOW_ANONYMOUS_ADMIN` | `false` | No | Debe valer exactamente `true` para habilitar `open_admin`. |
| `EVALUATIONS_AUDIT_ENABLED` | `true` | No | `false` desactiva la bitácora (no recomendado). |

Genera el secreto **fuera** del repositorio y no lo pegues en ningún archivo:

```bash
openssl rand -base64 48
```

Ejemplo de configuración **de pruebas** (sin secretos reales):

```
EVALUATIONS_SPREADSHEET_ID          = 1QA_pruebas_reemplazar_por_el_tuyo
EVALUATIONS_ADMIN_SHARED_SECRET     = (pegar aquí el valor de openssl rand)
EVALUATIONS_ADMIN_EMAILS            = tu.correo@ejemplo.com
EVALUATIONS_AUTH_MODE               = server_secret
EVALUATIONS_ALLOW_ANONYMOUS_ADMIN   = false
EVALUATIONS_AUDIT_ENABLED           = true
```

> El **mismo** valor de `EVALUATIONS_ADMIN_SHARED_SECRET` debe existir en las
> variables de entorno del proyecto de Vercel (§9 bis). Si no coinciden, el panel
> recibe `FORBIDDEN` y la bitácora registra `reason: bad_signature`.

## 5 · Conceder permisos por primera vez

1. Selecciona `verificarEsquemaEvaluaciones` en el desplegable de funciones.
2. `Ejecutar`.
3. Google pedirá autorización: `Revisar permisos → tu cuenta → Permitir`.
4. En `Ver → Registro de ejecución` debe aparecer `"ok": true`.

Si aparece «No hay hoja de cálculo asociada», falta
`EVALUATIONS_SPREADSHEET_ID`.

## 6 · Inicializar y validar

```
configurarEvaluaciones()          → crea las pestañas y los encabezados
verificarEsquemaEvaluaciones()    → debe responder ok: true
ejecutarPruebasEvaluaciones()     → todas las líneas deben empezar con "OK"
```

Salida esperada de las pruebas:

```
OK   · El esquema declara las nueve hojas
OK   · Los tipos de pregunta cubren opción única y verdadero/falso
OK   · La calificación da 100 con todas correctas
OK   · La calificación da 0 con todas incorrectas
OK   · La calificación da 66.67 con dos de tres
OK   · Una opción ajena se rechaza
OK   · Una pregunta ajena se rechaza
OK   · Se ignora el puntaje enviado por el cliente
OK   · Las preguntas manuales dejan la nota pendiente
OK   · El DTO público no expone respuestas correctas
OK   · La validación de publicación exige título y opciones
```

## 7 · Desplegar como aplicación web

`Implementar → Nueva implementación → ⚙ → Aplicación web`:

| Campo | Valor |
| --- | --- |
| Descripción | `Evaluaciones API v1` |
| **Ejecutar como** | **Usuario que accede a la aplicación web** |
| **Quién tiene acceso** | Según §8 |

`Implementar` y copia la **URL del Web App**, que termina en `/exec`.

## 8 · Elegir la identidad de ejecución y el acceso

| Escenario | Ejecutar como | Quién tiene acceso | Modo | Consecuencia |
| --- | --- | --- | --- | --- |
| **Panel React en Vercel** (el ATS real) | Yo | Cualquier persona, incluso anónima | `server_secret` | La administración exige firma del backend intermedio; el endpoint público queda disponible para el futuro portal. |
| Organización con Google Login | Usuario que accede | Usuarios de tu organización | `google_identity` | La identidad la verifica Google, como antes. El panel debe configurarse con `VITE_EVALUATIONS_ADMIN_API_URL=direct`. |
| Pruebas locales | Yo | Cualquier persona | `open_admin` | ⚠️ Exige `ALLOW_ANONYMOUS_ADMIN=true`. Toda respuesta trae `INSECURE_ADMIN_MODE`. **No usar con datos reales.** |

> **Por qué «Cualquier persona» no es un agujero:** el control de acceso no es la
> visibilidad de la URL, sino la firma. Sin credencial válida, toda acción
> administrativa responde `FORBIDDEN` y queda auditada; las públicas solo
> devuelven evaluaciones publicadas y saneadas. Con «Usuario que accede» el panel
> de Vercel no puede autenticarse en absoluto, porque no hay sesión de Google en
> el navegador.

## 9 · Configurar el frontend

En `.env.local` del repositorio (y en las variables de entorno de Vercel, las
`VITE_` como «públicas»):

```bash
VITE_ASSESSMENTS_PROVIDER=google-apps-script
VITE_EVALUATIONS_API_URL=https://script.google.com/macros/s/AKfycb…/exec
# Opcional: por omisión ya vale /api/evaluations/admin
# VITE_EVALUATIONS_ADMIN_API_URL=/api/evaluations/admin
```

Y reinicia `npm run dev`. El módulo mostrará «Google Apps Script» en el indicador
de origen de datos.

Para volver a los datos de demostración basta con quitar
`VITE_ASSESSMENTS_PROVIDER` (o ponerlo en `mock`).

> La URL del Web App **no es un secreto**: es un endpoint público cuyo control de
> acceso lo aplican `Auth.gs` y el saneamiento. Aun así, no la publiques
> innecesariamente.

## 9 bis · Configurar el backend intermedio (Vercel)

Las operaciones administrativas no salen del navegador hacia Apps Script: van a
las funciones de `api/evaluations/`, que son las que custodian el secreto. En
`Vercel → Project → Settings → Environment Variables` (sin prefijo `VITE_`, para
que **no** puedan acabar en el bundle):

| Variable | Valor | Qué hace |
| --- | --- | --- |
| `EVALUATIONS_APPS_SCRIPT_URL` | `https://script.google.com/…/exec` | A dónde reenvía el proxy. |
| `EVALUATIONS_ADMIN_SHARED_SECRET` | el mismo valor que en Script Properties | Firma cada operación administrativa. |
| `EVALUATIONS_PANEL_PASSPHRASE` | 12+ caracteres | Frase que el reclutador teclea una vez para abrir la sesión. |
| `EVALUATIONS_SESSION_SECRET` | 32+ caracteres | Firma la cookie de sesión. |
| `EVALUATIONS_ALLOWED_ORIGINS` | (opcional) `https://otro-dominio` | Orígenes admitidos además del propio. |

Después de guardarlas hay que **volver a desplegar** para que las funciones las
lean.

En el panel, la primera acción administrativa abrirá el diálogo «Desbloquear la
administración de evaluaciones». La frase viaja una sola vez a nuestra propia
función y lo que queda en el navegador es una cookie `HttpOnly` de 8 horas.

Comprobación rápida del proxy:

```bash
# Sin sesión: el proxy no firma nada.
curl -s -X POST https://TU-PANEL.vercel.app/api/evaluations/admin \
  -H 'Content-Type: application/json' \
  -d '{"action":"listAdminAssessments","requestId":"","payload":{}}'
# → {"ok":false,…"details":{"adminSession":"required"}}

# Con sesión (guarda la cookie y reutilízala):
curl -s -c /tmp/eval.cookie -X POST https://TU-PANEL.vercel.app/api/evaluations/session \
  -H 'Content-Type: application/json' \
  -d '{"passphrase":"LA-FRASE","actor":"ana@banco.com"}'
curl -s -b /tmp/eval.cookie -X POST https://TU-PANEL.vercel.app/api/evaluations/admin \
  -H 'Content-Type: application/json' \
  -d '{"action":"listAdminAssessments","requestId":"","payload":{}}'
# → {"ok":true,"data":{"items":[…]}}
```

## 10 · Crear una versión nueva después de cada cambio

Apps Script **no sirve el código nuevo hasta que creas una versión**:

```
Implementar → Administrar implementaciones → ✏️ (editar)
  → Versión: Nueva versión
  → Descripción: "Evaluaciones API v2 — <qué cambió>"
  → Implementar
```

La URL `/exec` no cambia, así que el frontend no necesita ajustes.

## 11 · Probar las acciones con `curl`

Sustituye `URL` por tu `/exec`. Las acciones administrativas exigen una firma que
solo emite el backend intermedio, así que desde `curl` contra Apps Script se
prueban las públicas; para las administrativas usa el proxy (§9 bis).

**Comprobación de vida:**

```bash
curl -sL "URL?action=ping"
```

```jsonc
{"ok":true,"requestId":"","data":{"service":"evaluations","schemaVersion":1,
 "authMode":"server_secret",
 "adminAuth":{"mode":"server_secret","scheme":"hmac-sha256","configured":true,"insecure":false},
 "serverTime":"2026-07-27T21:00:00.000Z"},
 "error":null,"warnings":[]}
```

`adminAuth.configured:false` significa que falta
`EVALUATIONS_ADMIN_SHARED_SECRET` (o tiene menos de 32 caracteres): es la forma
más rápida de diagnosticar un `FORBIDDEN`.

**Listado público** (necesita al menos una evaluación publicada):

```bash
curl -sL "URL?action=listPublicAssessments"
```

```jsonc
{"ok":true,"data":{"items":[{"publicCode":"EVL-PRUE-A6BE",
 "title":"[PRUEBA] Conocimientos de riesgo","description":"…",
 "instructions":"","durationMinutes":15,"questionCount":3,
 "versionLabel":"v1.0"}],"total":1},"error":null,"warnings":[]}
```

**Detalle público** (usa el `publicCode` de `crearDatosDePruebaEvaluaciones`):

```bash
curl -sL "URL?action=getPublicAssessment&publicCode=EVL-PRUE-A6BE"
```

La respuesta trae `sections[].questions[].options[]` **sin** `isCorrect`,
`scoreValue`, `feedback`, `maxPoints` ni `passingScore`. Compruébalo:

```bash
curl -sL "URL?action=getPublicAssessment&publicCode=EVL-PRUE-A6BE" \
  | grep -Eo 'isCorrect|is_correct|answerKey|scoreValue|passingScore' || echo "sin fugas ✔"
```

**Enviar un intento** (POST con `text/plain`, como el frontend):

```bash
curl -sL -X POST "URL" \
  -H 'Content-Type: text/plain;charset=utf-8' \
  -d '{
    "action":"submitAttempt",
    "requestId":"req_prueba_manual_1",
    "payload":{
      "publicCode":"EVL-PRUE-A6BE",
      "participant":{"name":"Ana Prueba","email":"ana@ejemplo.com"},
      "answers":[
        {"questionId":"<qst_1>","selectedOptionId":"<opt_1a>"},
        {"questionId":"<qst_2>","selectedOptionId":"<opt_2a>"}
      ]
    }
  }'
```

```jsonc
{"ok":true,"requestId":"req_prueba_manual_1",
 "data":{"attemptId":"att_…","status":"submitted",
         "gradingStatus":"pending_manual_review","received":2},
 "error":null,"warnings":[]}
```

**Comprobar la idempotencia:** repite el comando anterior sin cambiar
`requestId`. La respuesta debe traer `"warnings":["IDEMPOTENT_REPLAY"]` y en la
pestaña `Attempts` debe seguir habiendo **una sola** fila.

**Error esperado con un código inexistente:**

```bash
curl -sL "URL?action=getPublicAssessment&publicCode=NO-EXISTE"
```

```jsonc
{"ok":false,"data":null,
 "error":{"code":"NOT_FOUND","message":"La evaluación no está disponible.","details":{}},
 "warnings":[]}
```

## 12 · Revisar los registros

- `Ver → Ejecuciones` en el editor: estado, duración y errores de cada llamada.
- La pestaña `AuditLog` de la hoja: quién hizo qué, cuándo y con qué resultado
  (sin datos sensibles ni claves de respuesta).
- La pestaña `ProcessedRequests`: solicitudes de escritura ya aplicadas.

Si aparece `LOCK_TIMEOUT` con frecuencia, hay escrituras concurrentes largas:
revisa el tamaño de las evaluaciones y la cuota de ejecución.

## 13 · Rollback

Ver [`ROLLBACK.md`](./ROLLBACK.md). En resumen: `Administrar implementaciones →
editar → seleccionar una versión anterior → Implementar`. La URL no cambia y el
frontend vuelve al comportamiento previo sin desplegar nada.

## 14 · Lista de comprobación

- [ ] Proyecto creado y nombrado.
- [ ] 19 archivos `.gs` copiados con su nombre exacto.
- [ ] `appsscript.json` actualizado (V8, alcances, webapp).
- [ ] Script Properties configuradas (`SPREADSHEET_ID`, `ADMIN_SHARED_SECRET`, `ADMIN_EMAILS`).
- [ ] Permisos concedidos ejecutando `verificarEsquemaEvaluaciones()`.
- [ ] `configurarEvaluaciones()` ejecutado.
- [ ] `ejecutarPruebasEvaluaciones()` todo en «OK» (incluidas las cuatro de autorización).
- [ ] Desplegado como Web App según el escenario de §8.
- [ ] URL `/exec` copiada a `VITE_EVALUATIONS_API_URL` **y** a `EVALUATIONS_APPS_SCRIPT_URL`.
- [ ] `VITE_ASSESSMENTS_PROVIDER=google-apps-script`.
- [ ] Variables del backend intermedio configuradas en Vercel y proyecto redesplegado.
- [ ] `curl ?action=ping` responde `ok:true` y `adminAuth.configured:true`.
- [ ] Sin sesión, `/api/evaluations/admin` responde `adminSession:"required"`.
- [ ] Con la frase de acceso, el listado administrativo carga en el panel.
- [ ] `grep` de fugas en el detalle público responde «sin fugas».
- [ ] Idempotencia comprobada repitiendo un `requestId`.
- [ ] Datos de prueba limpiados si se crearon en producción.
