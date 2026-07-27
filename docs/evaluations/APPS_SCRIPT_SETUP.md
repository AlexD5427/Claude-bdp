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
Sanitize.gs        Validation.gs    Auth.gs           RequestService.gs
AuditService.gs    AssessmentService.gs               PublicAssessmentService.gs
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
  "webapp": { "executeAs": "USER_ACCESSING", "access": "DOMAIN" }
}
```

| Campo | Por qué ese valor |
| --- | --- |
| `runtimeVersion: "V8"` | El código usa sintaxis moderna. |
| `spreadsheets` | Leer y escribir las nueve pestañas. |
| `userinfo.email` | `Session.getActiveUser().getEmail()`, base de la autorización. |
| `executeAs: USER_ACCESSING` | Sin esto la identidad no es verificable y las acciones administrativas responden `FORBIDDEN`. |
| `access: DOMAIN` | Restringe a la organización. Ver §8 para el caso del portal público. |

## 4 · Configurar las Script Properties

`Configuración del proyecto → Propiedades de la secuencia de comandos → Añadir
propiedad`. **Aquí no hay secretos del frontend**: son valores de servidor que el
navegador nunca ve.

| Propiedad | Ejemplo | Obligatoria | Qué hace |
| --- | --- | --- | --- |
| `EVALUATIONS_SPREADSHEET_ID` | `1AbCdEf…XyZ` | Sí, si el proyecto es independiente | Hoja de cálculo destino. Sin ella se usa la hoja contenedora. |
| `EVALUATIONS_ADMIN_EMAILS` | `ana@banco.com, luis@banco.com` | Recomendada | Lista blanca de administradores. Vacía = cualquier cuenta verificable del dominio. |
| `EVALUATIONS_AUTH_MODE` | `google_identity` | No (valor por omisión) | `google_identity` o `open_admin`. |
| `EVALUATIONS_ALLOW_ANONYMOUS_ADMIN` | `false` | No | Debe valer exactamente `true` para habilitar `open_admin`. |
| `EVALUATIONS_AUDIT_ENABLED` | `true` | No | `false` desactiva la bitácora (no recomendado). |

Ejemplo de configuración **de pruebas** (sin secretos reales):

```
EVALUATIONS_SPREADSHEET_ID          = 1QA_pruebas_reemplazar_por_el_tuyo
EVALUATIONS_ADMIN_EMAILS            = tu.correo@ejemplo.com
EVALUATIONS_AUTH_MODE               = google_identity
EVALUATIONS_ALLOW_ANONYMOUS_ADMIN   = false
EVALUATIONS_AUDIT_ENABLED           = true
```

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

| Escenario | Ejecutar como | Quién tiene acceso | Consecuencia |
| --- | --- | --- | --- |
| **Solo panel del reclutador** (hoy) | Usuario que accede | Usuarios de tu organización | Identidad verificada por Google. Las acciones administrativas funcionan; el endpoint público solo para la organización. |
| **Panel + portal de candidatos** (fase siguiente) | Usuario que accede | Cualquier persona | El endpoint público queda accesible a candidatos externos. Las acciones administrativas siguen exigiendo identidad: un anónimo recibe `FORBIDDEN`. |
| Pruebas locales sin cuenta de organización | Yo | Cualquier persona | ⚠️ Exige `EVALUATIONS_AUTH_MODE=open_admin` + `ALLOW_ANONYMOUS_ADMIN=true`. Toda respuesta trae `INSECURE_ADMIN_MODE`. **No usar con datos reales.** |

> **Por qué «Usuario que accede» es lo correcto:** con «Yo», Apps Script ejecuta
> todo con TU cuenta y `Session.getActiveUser().getEmail()` deja de identificar a
> quien llama, así que la autorización no puede distinguir usuarios.

## 9 · Configurar el frontend

En `.env.local` del repositorio:

```bash
VITE_ASSESSMENTS_PROVIDER=google-apps-script
VITE_EVALUATIONS_API_URL=https://script.google.com/macros/s/AKfycb…/exec
```

Y reinicia `npm run dev`. El módulo mostrará «Google Apps Script» en el indicador
de origen de datos.

Para volver a los datos de demostración basta con quitar
`VITE_ASSESSMENTS_PROVIDER` (o ponerlo en `mock`).

> La URL del Web App **no es un secreto**: es un endpoint público cuyo control de
> acceso lo aplica Google y `Auth.gs`. Aun así, no la publiques innecesariamente.

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

Sustituye `URL` por tu `/exec`. Las acciones administrativas requieren sesión de
Google, así que desde `curl` solo se prueban cómodamente las públicas.

**Comprobación de vida:**

```bash
curl -sL "URL?action=ping"
```

```jsonc
{"ok":true,"requestId":"","data":{"service":"evaluations","schemaVersion":1,
 "authMode":"google_identity","serverTime":"2026-07-27T21:00:00.000Z"},
 "error":null,"warnings":[]}
```

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
- [ ] 17 archivos `.gs` copiados con su nombre exacto.
- [ ] `appsscript.json` actualizado (V8, alcances, webapp).
- [ ] Script Properties configuradas (`SPREADSHEET_ID`, `ADMIN_EMAILS`).
- [ ] Permisos concedidos ejecutando `verificarEsquemaEvaluaciones()`.
- [ ] `configurarEvaluaciones()` ejecutado.
- [ ] `ejecutarPruebasEvaluaciones()` todo en «OK».
- [ ] Desplegado como Web App con «Usuario que accede».
- [ ] Acceso configurado según el escenario.
- [ ] URL `/exec` copiada a `VITE_EVALUATIONS_API_URL`.
- [ ] `VITE_ASSESSMENTS_PROVIDER=google-apps-script`.
- [ ] `curl ?action=ping` responde `ok:true`.
- [ ] `grep` de fugas en el detalle público responde «sin fugas».
- [ ] Idempotencia comprobada repitiendo un `requestId`.
- [ ] Datos de prueba limpiados si se crearon en producción.
