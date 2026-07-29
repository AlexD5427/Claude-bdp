# Guía operativa final del módulo Evaluaciones

Esta guía está escrita para alguien que **no** domina Git, TypeScript, Vercel ni
Google Apps Script. No se salta ningún clic ni ningún nombre de menú. Cada paso
dice qué esperar y qué hacer si algo sale distinto.

Si solo tienes cinco minutos y algo está roto, ve directo a la
[§13, tabla de síntomas](#13-tabla-de-síntomas-significado-y-solución).

---

## Cómo está armado el módulo (contexto de un minuto)

Hay **tres piezas** y las tres tienen que apuntar al mismo sitio:

| Pieza | Qué es | Dónde vive |
| --- | --- | --- |
| El **libro** | Una hoja de cálculo de Google con 9 pestañas. Es la base de datos. | Google Drive |
| El **backend** | Un proyecto de Apps Script publicado como «Web App». Lee y escribe el libro. | script.google.com |
| Los **frontales** | El ATS (donde el reclutador crea evaluaciones) y el portal (donde responde el candidato). | Vercel |

El candidato **nunca** habla con el libro directamente: habla con el Web App, y
el Web App decide qué se le puede mostrar.

> **Concepto clave: guardar no es publicar.**
> Guardar un borrador escribe en las pestañas `Assessments`, `Sections`,
> `Questions` y `Options`. **Publicar** es otra operación: congela una copia
> inmutable del borrador en la pestaña `Versions` y apunta a ella.
> El código público (`EVL-XXXX-XXXX`) se crea al guardar, pero **no funciona
> hasta que publicas**. Un código que existe en la hoja y no abre en el portal
> casi siempre significa «esto nunca se publicó», no «el portal está roto».

---

## 1. Cómo identificar el libro correcto y copiar su ID

1. Abre [drive.google.com](https://drive.google.com).
2. Busca la hoja de cálculo de Evaluaciones (en producción se llama
   **EVALUACIONES BDP**). Ábrela con doble clic.
3. Comprueba que abajo tiene **estas nueve pestañas**, escritas exactamente así:
   `Assessments`, `Sections`, `Questions`, `Options`, `Versions`, `Attempts`,
   `Answers`, `ProcessedRequests`, `AuditLog`.
   - **Si falta alguna pestaña**, estás en el libro equivocado, o el libro nunca
     se inicializó. Ve a la §3 y ejecuta `configurarEvaluaciones`.
4. Mira la barra de direcciones del navegador. Tiene esta forma:

   ```text
   https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890/edit#gid=0
                                          └──────────── esto es el ID ────────────┘
   ```

5. Selecciona con el ratón **solo** el trozo entre `/d/` y `/edit` y cópialo
   (`Ctrl+C`). Ese es el `EVALUATIONS_SPREADSHEET_ID`.

**Cuidado:** el ID no lleva `https://`, ni `/d/`, ni `/edit`. Si lo que copiaste
tiene barras, has copiado de más.

---

## 2. Cómo revisar Script Properties sin exponer secretos

1. Abre [script.google.com](https://script.google.com) con la cuenta **dueña**
   del proyecto.
2. Entra en el proyecto de Evaluaciones.
3. En la barra lateral izquierda pulsa el engranaje ⚙ **«Configuración del
   proyecto»** (en inglés, *Project Settings*).
4. Baja hasta **«Propiedades de la secuencia de comandos»** (*Script
   Properties*).

Debe haber estas filas:

| Propiedad | Qué debe contener | ¿Es secreto? |
| --- | --- | --- |
| `EVALUATIONS_SPREADSHEET_ID` | El ID de la §1 | No |
| `EVALUATIONS_AUTH_MODE` | Exactamente `server_secret` | No |
| `EVALUATIONS_ADMIN_SHARED_SECRET` | Texto largo, mínimo 32 caracteres | **Sí** |
| `EVALUATIONS_AUDIT_ENABLED` | `true` (recomendado) | No |

**Cómo comprobar el secreto sin verlo.** No hace falta leerlo. Usa la prueba de
la §6: si `ping` responde `"configured": true` e `"insecure": false`, el secreto
está puesto y tiene longitud suficiente.

> **Nunca** pegues el valor de `EVALUATIONS_ADMIN_SHARED_SECRET` en un chat, un
> ticket, una captura de pantalla ni un Pull Request. Si crees que se ha visto,
> ve a la §15 y rótalo.

---

## 3. Cómo ejecutar las funciones de mantenimiento

Todas se ejecutan igual. En el editor de Apps Script:

1. Arriba, en la lista desplegable que está junto al botón **«Ejecutar»** (▷),
   elige el nombre de la función.
2. Pulsa **«Ejecutar»**.
3. La primera vez Google pedirá permisos: pulsa **«Revisar permisos»**, elige tu
   cuenta, pulsa **«Avanzado»** → **«Ir a (nombre del proyecto)»** → **«Permitir»**.
4. Abajo se abre el panel **«Registro de ejecución»** con el resultado.

### `configurarEvaluaciones()`

Crea las pestañas y las columnas que falten. **Es aditiva y se puede repetir sin
miedo**: no borra hojas, no borra filas y no toca datos existentes.

Respuesta esperada: un JSON con `createdSheets`, `addedHeaders` y
`verification.ok: true`.

*Si falla* con un error de permisos: la cuenta que ejecuta no tiene acceso al
libro. Comparte el libro con esa cuenta como **Editor** (§7).

### `verificarEsquemaEvaluaciones()`

Solo mira, no escribe. Devuelve, pestaña a pestaña, si existe, cuántas filas de
datos tiene y qué columnas faltan o sobran.

Respuesta esperada: `"ok": true` y `missingHeaders: []` en las nueve.

*Si alguna dice `missingHeaders`*: ejecuta `configurarEvaluaciones()` y repite.

### `diagnosticarEvaluaciones()`

**Esta es la función que responde «¿por qué el portal dice que no está
disponible?».** Imprime un informe legible con:

1. estado del esquema;
2. cada evaluación con sus tres columnas de estado y, si no se puede servir, **el
   motivo exacto**;
3. filas de `Versions` sin snapshot utilizable;
4. preguntas cuyo número de opciones correctas no encaja con su tipo;
5. contradicciones de puntuación;
6. recomendaciones.

Ejemplo de la línea que importa:

```text
2) ESTADO DE PUBLICACIÓN (1 evaluación/es)
   · EVL-NUEV-DB21  ✘ NO SE SIRVE
     status=draft lifecycle=draft publication=unpublished
     puntero=(vacío) entityVersion=5
     secciones=1/2 preguntas=20/20 opciones=80/80 versiones=3
     MOTIVO: status="draft" (debe ser "published")
```

Copia ese informe entero cuando abras un ticket. No contiene secretos ni
respuestas correctas.

### `repararEvaluaciones()`

Marca como `superseded` las filas de `Versions` que dicen `published` pero no
tienen un snapshot utilizable y que ninguna evaluación apunta. Son restos de
publicaciones que se interrumpieron.

**Por omisión no escribe nada.** Ejecutarla desde el editor muestra el plan y
avisa: *«MODO SECO: no se escribió nada»*.

Para aplicarlo de verdad hay que llamarla con un parámetro, y desde el editor no
se pueden pasar parámetros. Añade temporalmente esta función al final de
`Diagnostics.gs`, ejecútala, y bórrala después:

```javascript
function aplicarReparacionEvaluaciones() {
  return repararEvaluaciones({ dryRun: false });
}
```

Nunca borra filas ni vacía columnas: solo cambia la palabra `published` por
`superseded` en la columna `state`.

### `ejecutarPruebasEvaluaciones()`

Ejecuta la batería interna contra el libro real. Crea datos marcados como de
prueba y los limpia. Respuesta esperada: `"failed": 0`.

---

## 4. Cómo leer «Ejecuciones» y encontrar archivo y línea

Cuando algo responde `INTERNAL_ERROR`, la traza real está aquí y **solo** aquí:
al navegador nunca se le manda una traza, a propósito.

1. En el editor de Apps Script, barra lateral izquierda, pulsa el icono de reloj
   ⏱ **«Ejecuciones»** (*Executions*).
2. Verás una lista con la hora, la función (`doGet` o `doPost`) y el estado.
   Busca la fila con **«Con errores»** (*Failed*) cuya hora coincida con tu
   prueba. Las horas están en tu zona horaria.
3. Pulsa la flecha ▸ del principio de esa fila para desplegarla.
4. Aparece el mensaje. Las líneas útiles tienen esta forma:

   ```text
   Error: Your input contains more than the maximum of 50000 characters in a single cell.
       at evalUpsertRows_ (SheetRepository:146)
       at evalPublishAssessment_ (AssessmentService:833)
   ```

   Se lee de abajo hacia arriba: `AssessmentService`, línea 833, llamó a
   `SheetRepository`, línea 146, y ahí reventó.

5. Copia ese bloque al ticket.

*Si la lista de Ejecuciones está vacía* después de una llamada: la petición no
llegó al script. Casi siempre es la URL: revisa la §6 y la §8.

---

## 5. Cómo crear una versión nueva del Web App

**Esto es obligatorio cada vez que cambia el código `.gs`.** Guardar los archivos
en el editor **no** actualiza lo que sirve `/exec`: `/exec` sirve la última
*versión publicada*, no lo último guardado. Es la causa más común de «pero yo ya
lo arreglé».

1. En el editor, arriba a la derecha, pulsa el botón azul **«Implementar»**
   (*Deploy*) → **«Gestionar implementaciones»** (*Manage deployments*).
2. En la implementación que ya existe, pulsa el lápiz ✏ **«Editar»**.
3. En **«Versión»** (*Version*) despliega la lista y elige **«Nueva versión»**
   (*New version*). Este es el paso que casi todo el mundo olvida.
4. Confirma que abajo dice:
   - **«Ejecutar como»** (*Execute as*): **Yo** (el dueño del proyecto).
     Es imprescindible: el candidato no tiene sesión de Google, así que el script
     debe abrir el libro con los permisos del dueño.
   - **«Quién tiene acceso»** (*Who has access*): **Cualquier persona**
     (*Anyone*). Sin esto el portal recibe la pantalla de inicio de sesión de
     Google en lugar de JSON.
5. Pulsa **«Implementar»**.
6. Copia la **«URL del Web App»**. Termina en `/exec`.

> **`/exec` frente a `/dev`.** `/dev` sirve el código guardado sin publicar y
> **solo** responde a cuentas que pueden editar el script. Sirve para probar tú
> mismo; jamás debe usarse en producción. El portal ahora lo rechaza
> explícitamente cuando `NEXT_PUBLIC_APP_ENV=production`.

**Importante:** editar la implementación existente **conserva la misma URL**. Si
en cambio creas una implementación *nueva*, la URL cambia y tendrás que
actualizarla en los dos proyectos de Vercel (§7 y §8).

---

## 6. Cómo verificar `ping`, el listado público y una evaluación concreta

No necesitas herramientas: basta el navegador. Sustituye `TU_URL` por la URL de
la §5.

### 6.1 `ping` — ¿está vivo el despliegue?

Pega en la barra de direcciones:

```text
TU_URL?action=ping
```

Respuesta esperada:

```json
{"ok":true,"requestId":"","data":{"service":"evaluations","schemaVersion":1,
"authMode":"server_secret","adminAuth":{"mode":"server_secret",
"scheme":"hmac-sha256","configured":true,"insecure":false},
"serverTime":"2026-07-29T17:22:15.632Z"},"error":null,"warnings":[]}
```

Lo que hay que mirar:

- `"ok": true` → el despliegue responde.
- `"configured": true` → el secreto administrativo está puesto.
- `"insecure": false` → no está en modo abierto.

*Si sale HTML con «Se requiere autorización»*: en la §5, «Quién tiene acceso» no
está en **Cualquier persona**.

> **`ping` no prueba casi nada.** Solo demuestra que el despliegue arranca y que
> el enrutador carga. **No** demuestra que pueda abrir el libro ni leer las
> pestañas. Para eso está la prueba siguiente, que es la que de verdad toca datos.

### 6.2 Listado público — ¿puede leer el libro?

```text
TU_URL?action=listPublicAssessments
```

Respuesta esperada cuando **no hay nada publicado** (esto es correcto, no un
error):

```json
{"ok":true,"requestId":"","data":{"items":[],"total":0},"error":null,"warnings":[]}
```

*Si sale `SCHEMA_ERROR`*: falta una pestaña o una columna. Ve a la §3,
`configurarEvaluaciones`.

*Si sale `INTERNAL_ERROR`*: el script no pudo leer el libro. Ve a la §4, mira la
traza y comprueba el `EVALUATIONS_SPREADSHEET_ID` (§2) y los permisos (§7).

### 6.3 Una evaluación concreta por su código

```text
TU_URL?action=getPublicAssessment&publicCode=EVL-NUEV-DB21
```

- Si está publicada: `"ok": true` con el título, la duración y las preguntas
  **sin** las respuestas correctas.
- Si está en borrador, pausada, cerrada o archivada:

  ```json
  {"ok":false,"error":{"code":"NOT_FOUND","message":"La evaluación no está disponible."}}
  ```

  **Esto es el comportamiento correcto, no un fallo.** El candidato no debe poder
  distinguir «no existe» de «existe pero no está lista»: si pudiera, el código
  público serviría para descubrir qué evaluaciones se están preparando.

**Cuidado con el nombre del parámetro:** es `publicCode`, no `code`. Con `code`
siempre saldrá `NOT_FOUND`, aunque la evaluación esté perfectamente publicada.

---

## 7. Variables en Vercel para el ATS

1. Entra en [vercel.com](https://vercel.com) y abre el proyecto del **ATS**
   (`Claude-bdp`).
2. Pestaña **«Settings»** → menú izquierdo **«Environment Variables»**.

Variables **de servidor** (secretas, sin el prefijo `VITE_`; el navegador nunca
las ve):

| Nombre | Valor | Notas |
| --- | --- | --- |
| `EVALUATIONS_APPS_SCRIPT_URL` | La URL de la §5, terminada en `/exec` | |
| `EVALUATIONS_ADMIN_SHARED_SECRET` | **El mismo** valor que en Script Properties | Si no coincide carácter a carácter, publicar da `FORBIDDEN` |
| `EVALUATIONS_PANEL_PASSPHRASE` | La frase con la que el reclutador abre el panel | |
| `EVALUATIONS_SESSION_SECRET` | Texto largo aleatorio, mínimo 32 caracteres | Firma la cookie de sesión |

Variables **públicas** (se incrustan en el JavaScript del navegador; solo valores
no secretos). Ya están versionadas en `.env.production`, así que **lo normal es
no crearlas en Vercel**. Si el mismo nombre existe en Vercel, **el valor de
Vercel manda** y puede pisar el correcto:

| Nombre | Valor |
| --- | --- |
| `VITE_ASSESSMENTS_PROVIDER` | `google-apps-script` |
| `VITE_EVALUATIONS_API_URL` | La ruta del backend intermedio del propio ATS |

> **Nunca** pongas un secreto en una variable que empiece por `VITE_` o por
> `NEXT_PUBLIC_`. Ese prefijo significa literalmente «esto se publica en el
> navegador».

Comprobación rápida, con el ATS abierto en el navegador:

```text
https://TU-ATS.vercel.app/api/evaluations/session
```

Debe responder **JSON**. Si responde `FUNCTION_INVOCATION_FAILED`, falta alguna
de las cuatro variables de servidor o el despliegue es anterior al PR #17.

---

## 8. `NEXT_PUBLIC_EVALUATIONS_APPS_SCRIPT_URL` en Vercel para el portal

1. En Vercel, abre el proyecto del **portal** (`postulacionesbdpv2`).
2. **«Settings»** → **«Environment Variables»** → **«Add New»**.
3. Rellena:
   - **Key**: `NEXT_PUBLIC_EVALUATIONS_APPS_SCRIPT_URL`
   - **Value**: la URL **exacta** de la §5, terminada en `/exec`
   - **Environments**: marca **Production**, **Preview** y **Development**.
4. Pulsa **«Save»**.

Tiene que ser **el mismo despliegue que usa el ATS**. No vale:

- el Apps Script general del ATS (el de Postulantes) — es otro proyecto;
- la ruta `/api/evaluations/...` del ATS — ésa es administrativa y va firmada;
- la dirección del **editor** (`script.google.com/home/projects/.../edit`);
- una URL terminada en `/dev` en producción.

El portal comprueba las cuatro cosas y, si algo no cuadra, lo dice por su nombre
en los registros del servidor en lugar de fallar como un error de red genérico.

---

## 9. Qué variables exigen volver a desplegar, y por qué

| Variable | ¿Redespliegue? | Por qué |
| --- | --- | --- |
| `NEXT_PUBLIC_*` (portal) | **Sí, siempre** | Next.js las **incrusta en el JavaScript** al compilar. Cambiar el panel no cambia el archivo ya compilado. |
| `VITE_*` (ATS) | **Sí, siempre** | Igual: Vite las resuelve al compilar. |
| `EVALUATIONS_*` sin prefijo (ATS) | No en teoría, **sí en la práctica** | Las lee el servidor en cada petición, pero Vercel solo las inyecta en despliegues nuevos. |
| Script Properties de Apps Script | **No** | Se leen en cada ejecución. Surten efecto de inmediato. |
| Archivos `.gs` | **Sí**: nueva versión del Web App (§5) | `/exec` sirve la última versión *publicada*, no lo último guardado. |

Regla práctica para no equivocarse: **si tocas cualquier variable en Vercel,
redespliega.**

---

## 10. Cómo redesplegar sin caché

1. En Vercel, pestaña **«Deployments»**.
2. En el despliegue más reciente, pulsa el menú **⋯** de la derecha.
3. Elige **«Redeploy»**.
4. En el diálogo, **desmarca** la casilla **«Use existing Build Cache»**.
   Es el paso importante: con la caché activada, Vercel puede reutilizar el
   JavaScript compilado con los valores **antiguos** de las variables.
5. Pulsa **«Redeploy»** y espera a que ponga **Ready**.

Comprobación: abre el portal, entra en `/evaluaciones`, pulsa `F12` →
**«Network»**, escribe un código y pulsa Enter. Debe aparecer una petición a
`script.google.com`. Pulsa sobre ella y confirma en **«Headers»** que la
dirección es la de la §5.

---

## 11. Cómo publicar una evaluación correctamente desde el ATS

El orden importa. Publicar usa el número de versión que devolvió el **último**
guardado; si usas uno viejo, sale `CONFLICT`.

1. Abre el ATS y entra en **Evaluaciones**.
2. Abre la evaluación (o créala con **«Nueva evaluación»**).
3. Rellena, como mínimo:
   - **Título** (no puede estar vacío);
   - **Duración** en minutos: vacía o **mayor que cero**;
   - **Nota mínima**: vacía o entre **0 y 100**;
   - al menos **una pregunta activa**;
   - cada pregunta de opción única con **exactamente una** opción correcta;
   - cada pregunta de selección múltiple con **al menos una** correcta.
4. Pulsa **«Guardar»** y **espera** a que confirme. No pulses «Publicar» antes:
   el botón se deshabilita mientras hay una operación en curso, justamente para
   evitar esta carrera.
5. Pulsa **«Publicar»**.

Qué debe pasar:

- Aparece una confirmación con el **código público** y la **etiqueta de versión**
  (`v1.0`, `v2.0`…).
- En el libro, la pestaña `Versions` gana **una fila nueva** con `snapshot_json`
  **no vacío**.
- En `Assessments`, esa evaluación queda con `status=published`,
  `lifecycle_status=published`, `publication_status=published` y
  `current_published_version_id` **relleno**.

Si sale un aviso de validación, la evaluación **no** se publica: corrige lo que
señala y repite desde el paso 4. Publicar nunca se fuerza «a la fuerza»; un
borrador incompleto que se sirviera al candidato podría filtrar contenido a medio
escribir.

> **Nota sobre el tamaño.** Al publicar, el contenido congelado se guarda en una
> sola celda, y Google Sheets no admite más de 50 000 caracteres por celda. Por
> eso el snapshot se comprime automáticamente cuando hace falta: verás en
> `snapshot_json` un texto que empieza por `EVALGZ1:`. **Es normal y correcto.**
> El límite práctico queda en varios cientos de preguntas; si alguna vez se
> superara, publicar avisa con un mensaje claro en vez de fallar sin explicación.

---

## 12. Cómo comprobar las filas esperadas en cada pestaña

Después de publicar una evaluación y de que un candidato la responda, el libro
debe verse así:

| Pestaña | Qué buscar |
| --- | --- |
| `Assessments` | 1 fila por evaluación. Las tres columnas de estado en `published` y `current_published_version_id` relleno. |
| `Sections` | 1 fila por sección. Puede haber filas con `active=FALSE`: son bajas lógicas, **no se borran**. |
| `Questions` | 1 fila por pregunta. `position` de las activas empieza en 0 y va sin huecos. |
| `Options` | 1 fila por opción. `question_id` apunta a una fila de `Questions`. |
| `Versions` | 1 fila por publicación. La última con `state=published`; las anteriores, `superseded`. `snapshot_json` **no vacío**. |
| `Attempts` | 1 fila por intento. `version_id` relleno: ancla el intento a la versión que respondió. |
| `Answers` | 1 fila por respuesta. `attempt_id` apunta a `Attempts`. |
| `ProcessedRequests` | 1 fila por escritura completada. Si una operación falló, **no** aparece aquí. |
| `AuditLog` | 1 fila por operación, con `status` y `error_code`. |

La forma rápida y sin riesgo de comprobarlo todo a la vez es ejecutar
`diagnosticarEvaluaciones()` (§3): compara las nueve pestañas y dice qué falla.

Dos lecturas útiles del `AuditLog`:

- Varias filas `publishAssessment` con `status=error`: publicar está fallando.
  Ve a la §4 y busca la traza de esas horas.
- `updateAssessment` con `CONFLICT`: alguien publicó o guardó con un número de
  versión viejo. Recarga la evaluación en el ATS y repite.

---

## 13. Tabla de síntomas, significado y solución

| Síntoma | Qué significa de verdad | Qué hacer |
| --- | --- | --- |
| El portal dice «Esta evaluación no está disponible» y el código **sí** está en `Assessments` | Casi siempre: nunca se completó la publicación | `diagnosticarEvaluaciones()` (§3) y lee el MOTIVO. Si dice `status="draft"`, publica (§11) |
| `getPublicAssessment` da `NOT_FOUND` con un código que **sí** publicaste | O está pausada/cerrada/archivada, o usaste `code=` en vez de `publicCode=` | Revisa el parámetro (§6.3) y las tres columnas de estado |
| `listPublicAssessments` da `ok:true` con `items:[]` | **No es un error.** No hay nada publicado | Publica una evaluación (§11) |
| `listPublicAssessments` da `SCHEMA_ERROR` | Falta una pestaña o una columna | `configurarEvaluaciones()` (§3) |
| `listPublicAssessments` da `INTERNAL_ERROR` | El script no pudo leer el libro | §4 para la traza; revisa el ID (§2) y los permisos (§7) |
| Publicar da `INTERNAL_ERROR` y `Versions` tiene filas con las primeras columnas llenas y el resto vacías | El fallo del 28/07/2026: el snapshot no cabía en una celda | Actualiza el código `.gs` y **crea una versión nueva** del Web App (§5). Después `repararEvaluaciones()` (§3) |
| Publicar da `VALIDATION_ERROR` | El contenido no cumple las reglas | Corrige lo que señala el aviso y repite (§11) |
| Publicar da `CONFLICT` | Se usó un número de versión viejo | Recarga la evaluación en el ATS y vuelve a intentarlo |
| Publicar da `FORBIDDEN` | `EVALUATIONS_ADMIN_SHARED_SECRET` no coincide entre Vercel y Script Properties | Vuelve a ponerlo en los dos sitios y redespliega (§7, §10) |
| `/api/evaluations/session` da `FUNCTION_INVOCATION_FAILED` | Faltan variables de servidor, o el despliegue es viejo | §7 y redespliega sin caché (§10) |
| El portal responde HTML de inicio de sesión de Google | «Quién tiene acceso» no es **Cualquier persona**, o la URL termina en `/dev` | §5 y §8 |
| Arreglaste el `.gs` y nada cambió | `/exec` sirve la última versión **publicada** | Crea una **versión nueva** del Web App (§5) |
| Cambiaste una variable en Vercel y nada cambió | Las `NEXT_PUBLIC_*` y `VITE_*` se incrustan al compilar | Redespliega **sin caché** (§10) |
| «Ejecuciones» está vacío tras probar | La petición no llegó al script | Revisa la URL (§6, §8) |

---

## 14. Cómo hacer rollback

### Vercel (ATS o portal)

1. Pestaña **«Deployments»**.
2. Busca el despliegue anterior que **sí** funcionaba (estado **Ready**).
3. Menú **⋯** → **«Promote to Production»** (en algunos planes,
   **«Rollback»**). Confirma.
4. Tarda menos de un minuto y no borra nada: el despliegue defectuoso sigue en la
   lista.

### Apps Script

1. **«Implementar»** → **«Gestionar implementaciones»**.
2. Pulsa el lápiz ✏ de la implementación.
3. En **«Versión»**, elige del desplegable el **número de versión anterior**.
4. Pulsa **«Implementar»**. La URL no cambia.

> **Antes de volver atrás el código `.gs`, lee esto.** Una versión anterior a
> julio de 2026 **no sabe leer los snapshots comprimidos** (los que empiezan por
> `EVALGZ1:`). Las evaluaciones publicadas con el código nuevo dejarían de abrir
> en el portal, con `NOT_FOUND`. No se pierde ningún dato, pero **hay que volver
> a publicar** esas evaluaciones tras el rollback, o bien volver a poner la
> versión nueva. Los snapshots guardados en JSON plano se leen en las dos
> versiones sin problema.

### Datos del libro

No hace falta rollback manual: nada se borra. Las bajas son lógicas
(`active=FALSE`) y las versiones antiguas se conservan como `superseded`. Si
necesitas volver a una versión anterior de una evaluación, usa la acción
**«Rollback»** del propio ATS, que reapunta `current_published_version_id` sin
tocar los intentos ya realizados.

Google Sheets también guarda historial: **Archivo** → **Historial de versiones**
→ **Ver historial de versiones**.

---

## 15. Cómo rotar el secreto administrativo sin caídas

El truco es que el backend acepta **dos** secretos a la vez durante la rotación.

1. Genera un secreto nuevo, largo y aleatorio (mínimo 32 caracteres).
2. En Apps Script → Script Properties (§2), **añade** la propiedad
   `EVALUATIONS_ADMIN_SHARED_SECRET_NEXT` con el valor nuevo.
   **No toques todavía** `EVALUATIONS_ADMIN_SHARED_SECRET`.
   Ahora el backend acepta el viejo y el nuevo.
3. En Vercel (ATS) → Environment Variables, cambia
   `EVALUATIONS_ADMIN_SHARED_SECRET` al valor **nuevo** y guarda.
4. Redespliega el ATS **sin caché** (§10).
5. Comprueba que publicar sigue funcionando (§11). Si sale `FORBIDDEN`, deshaz el
   paso 3 y revisa que copiaste el valor sin espacios de más.
6. Cuando funcione, en Script Properties pon el valor **nuevo** también en
   `EVALUATIONS_ADMIN_SHARED_SECRET` y **borra**
   `EVALUATIONS_ADMIN_SHARED_SECRET_NEXT`.
7. Vuelve a comprobar `ping` (§6.1): debe seguir diciendo `"configured": true`.

En ningún momento hay una ventana en la que el ATS no pueda publicar.

---

## 16. Cómo exportar el libro a Excel para soporte, sin datos sensibles

El libro contiene nombres, correos y documentos de identidad de candidatos, y
también las **respuestas correctas**. Nada de eso debe salir en un ticket.

1. Abre el libro (§1).
2. **Archivo** → **Hacer una copia**. Nómbrala `EVALUACIONES BDP - SOPORTE`.
   Trabaja **siempre sobre la copia**.
3. En la copia, borra el contenido de estas columnas:
   - `Attempts`: `participant_name`, `participant_email`,
     `participant_document`, `user_agent`.
   - `Answers`: `answer_value_json`.
   - `Options`: `is_correct`, `score_value`, `matching_key` (son las respuestas
     correctas).
   - `AuditLog`: la columna `actor` si contiene correos.
4. **Archivo** → **Descargar** → **Microsoft Excel (.xlsx)**.
5. Adjunta ese archivo.

Para casi todos los diagnósticos **no hace falta el Excel**: el informe de
`diagnosticarEvaluaciones()` (§3) no contiene datos personales ni respuestas
correctas, y suele bastar.

---

## 17. Checklist final imprimible

Recórrela de arriba abajo. Si un paso falla, no sigas: arréglalo primero.

**Libro**

- [ ] Las nueve pestañas existen y se llaman exactamente como toca.
- [ ] `verificarEsquemaEvaluaciones()` dice `ok: true`.
- [ ] La cuenta dueña del Apps Script es **Editor** del libro.

**Apps Script**

- [ ] `EVALUATIONS_SPREADSHEET_ID` es el ID del libro correcto.
- [ ] `EVALUATIONS_AUTH_MODE` vale exactamente `server_secret`.
- [ ] `EVALUATIONS_ADMIN_SHARED_SECRET` está puesto (mínimo 32 caracteres).
- [ ] Se creó una **versión nueva** del Web App tras el último cambio de `.gs`.
- [ ] «Ejecutar como»: **Yo**. «Quién tiene acceso»: **Cualquier persona**.
- [ ] `TU_URL?action=ping` → `ok:true`, `configured:true`, `insecure:false`.
- [ ] `TU_URL?action=listPublicAssessments` → `ok:true`.
- [ ] `diagnosticarEvaluaciones()` no reporta versiones inválidas apuntadas.

**Vercel — ATS**

- [ ] Las cuatro variables de servidor están puestas.
- [ ] `EVALUATIONS_ADMIN_SHARED_SECRET` coincide con Script Properties.
- [ ] Ninguna variable `VITE_*` contiene un secreto.
- [ ] `/api/evaluations/session` responde JSON.
- [ ] Redespliegue **sin caché** hecho tras el último cambio de variables.

**Vercel — portal**

- [ ] `NEXT_PUBLIC_EVALUATIONS_APPS_SCRIPT_URL` puesta en Production, Preview y
      Development.
- [ ] Termina en `/exec` (nunca `/dev` en producción).
- [ ] Es el **mismo** despliegue que usa el ATS.
- [ ] Redespliegue **sin caché** hecho.

**Prueba de extremo a extremo**

- [ ] Crear una evaluación de prueba y guardarla.
- [ ] Publicarla: aparece el código y la etiqueta de versión.
- [ ] `Versions` tiene una fila nueva con `snapshot_json` no vacío.
- [ ] `Assessments`: tres estados en `published` y puntero relleno.
- [ ] Abrir el código en el portal: carga el título y las preguntas.
- [ ] Iniciar el intento, responder y enviar: sale el comprobante.
- [ ] `Attempts` tiene una fila con `status=submitted` y nota.
- [ ] `Answers` tiene una fila por respuesta.
- [ ] El ATS muestra el resultado del intento.
- [ ] Pausar la evaluación: el código deja de abrir.
- [ ] Reanudarla: el código vuelve a abrir.
- [ ] Archivar la evaluación de prueba al terminar.

---

## Documentos relacionados

- [`REPARACION_2026-07.md`](REPARACION_2026-07.md) — historia del incidente y
  variables exactas.
- [`APPS_SCRIPT_SETUP.md`](APPS_SCRIPT_SETUP.md) — instalación del backend desde
  cero.
- [`GOOGLE_SHEETS_SETUP.md`](GOOGLE_SHEETS_SETUP.md) — creación del libro.
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — despliegue completo.
- [`ROLLBACK.md`](ROLLBACK.md) — procedimientos de vuelta atrás.
- [`DATA_MODEL.md`](DATA_MODEL.md) — las nueve pestañas, columna por columna.
- [`SECURITY.md`](SECURITY.md) — qué nunca debe salir al navegador.
