# Reparación del módulo Evaluaciones — julio de 2026

> **Para quién es este documento.** Para la persona que administra el sistema, no
> necesariamente programadora. Explica **qué estaba roto**, **por qué**, y **qué
> hay que hacer, paso a paso y con nombres exactos**, para que el módulo
> Evaluaciones quede operativo sin tocar los demás módulos.
>
> Si solo quieres las instrucciones, salta a [§3 Puesta en marcha](#3--puesta-en-marcha-paso-a-paso).

---

## 0 · Resumen en una página

El módulo Evaluaciones mostraba:

```
No se pudieron cargar los datos
El servidor no está disponible.
```

Había **tres fallos distintos**, encadenados. Los tres están corregidos o
documentados:

| # | Dónde | Qué pasaba | Estado |
| --- | --- | --- | --- |
| **1** | `api/` (funciones de Vercel) | Los archivos se importaban entre sí sin la extensión `.js`. Node los carga como ESM y **ESM no adivina extensiones**: la función moría antes de ejecutar una línea (`ERR_MODULE_NOT_FOUND`). | ✅ corregido en el código |
| **2** | `api/` (funciones de Vercel) | Las funciones exportaban `export default`. El runtime Node.js de Vercel **solo** usa la API web (`Request` → `Response`) cuando el módulo exporta funciones llamadas `GET`, `POST`, … Con `export default` las invoca al estilo antiguo `(req, res)` y el código estallaba al leer las cabeceras. | ✅ corregido en el código |
| **3** | Variables de Vercel | `VITE_EVALUATIONS_API_URL` estaba puesta con el valor `/api/evaluations/admin` (la ruta del proxy administrativo) en lugar de la dirección `…/exec` del Apps Script. | ⚠️ **hay que corregirlo a mano en Vercel** (§3.2) |

Y una cosa que **no** estaba rota, aunque se sospechaba: **el Apps Script de
Evaluaciones funciona correctamente**. Comprobado en vivo durante el diagnóstico
(§1.6).

---

## 1 · Diagnóstico técnico

### 1.1 · El síntoma, medido

Antes de cambiar nada se reprodujo el fallo contra la producción real:

```
$ curl -i https://bdp-reclutamiento-sistema.vercel.app/api/evaluations/session
HTTP/2 500
x-vercel-error: FUNCTION_INVOCATION_FAILED
content-type: text/plain; charset=utf-8

A server error has occurred
```

Lo mismo con `POST /api/evaluations/admin`. Es decir: **las dos funciones del
backend intermedio se caían al arrancar**, sin llegar a mirar ninguna variable de
entorno y sin llegar a hablar con Google.

Los registros de Vercel decían exactamente por qué:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/api/_lib/adminSession'
  imported from /var/task/api/evaluations/session.js
```

### 1.2 · Causa raíz 1 — ESM exige la extensión `.js`

> [!NOTE]
> **ESM y CommonJS en dos frases.** JavaScript tiene dos sistemas de módulos.
> El antiguo (**CommonJS**, `require`) adivina: si pides `./config`, prueba
> `./config.js`, `./config/index.js`… El moderno (**ESM**, `import`) **no
> adivina nada**: el nombre del archivo tiene que ser literal, extensión
> incluida. Cuál se usa lo decide el `package.json`: este proyecto declara
> `"type": "module"`, o sea **ESM**.

El código escribía:

```ts
import { MIN_SECRET_LENGTH } from "./adminSession";   // ❌ en ESM, no existe
```

En desarrollo nadie lo notaba, por dos motivos:

* Vite/Vitest **empaquetan** el código y ellos sí adivinan extensiones.
* TypeScript estaba configurado con `moduleResolution: "bundler"`, que también
  las adivina. `npx tsc --noEmit` daba luz verde.

En Vercel, en cambio, `api/` **no se empaqueta**: cada archivo se transpila por
separado y Node los carga tal cual. La primera línea de `import` sin extensión
tira la función entera.

**Corrección**: todos los imports relativos de `api/` llevan ahora su `.js`, y
`tsconfig.api.json` pasó de `bundler` a `nodenext`, que es la resolución que Node
usa de verdad. Con eso, olvidar una extensión ya **no compila**:

```
error TS2835: Relative import paths need explicit file extensions…
```

### 1.3 · Causa raíz 2 — la firma que Vercel reconoce

Arreglar los imports no bastaba. Las funciones estaban escritas así:

```ts
export default async function handler(request: Request): Promise<Response> { … }
```

Es la forma «web», elegante y estándar… pero **Vercel no la reconoce en un
`export default`**. El lanzador de la plataforma decide cómo llamar a la función
mirando lo que el módulo exporta
(`vercel/vercel · packages/node/src/serverless-functions/serverless-handler.mts`):

```js
let listener = await import(id);
for (let i = 0; i < 5; i++) { if (listener.default) listener = listener.default; }
const shouldUseWebHandlers =
  HTTP_METHODS.some(method => typeof listener[method] === 'function') ||
  typeof listener.fetch === 'function';
```

Se lee así:

1. Si hay `default`, **lo desenvuelve** y se queda con esa función.
2. Solo si encuentra exportaciones llamadas `GET`, `POST`, `DELETE`… (o `fetch`)
   usa la API web `(Request) => Response`.
3. En cualquier otro caso llama a la función como handler de Node: `(req, res)`.

Vercel lo dice con sus palabras en la
[PR 12873 de su repositorio](https://github.com/vercel/vercel/pull/12873):

> *«Currently Node.js functions can opt-in to the Web API syntax by exporting
> named HTTP methods as request handlers, but there is no way to export a default
> catch-all handler. For backwards compat reasons, we can not change the default
> `export default` as a Node.js HTTP handler syntax…»*

Consecuencia práctica: nuestro `request.headers.get("cookie")` recibía un objeto
de Node, donde `headers` es un diccionario sin método `.get`, lanzaba
`TypeError`, y el resultado volvía a ser… `FUNCTION_INVOCATION_FAILED`. El
segundo fallo estaba escondido **detrás** del primero.

**Corrección**: las funciones exportan métodos con nombre y **no exportan
`default`**:

```ts
export const GET = handleSession;
export const POST = handleSession;
export const DELETE = handleSession;
```

### 1.4 · Causa raíz 3 — una variable con el valor de otra

El bundle publicado revela con qué configuración se compiló. En el JavaScript que
sirve producción aparecía:

```js
VITE_ASSESSMENTS_PROVIDER: "google-apps-script",
VITE_EVALUATIONS_API_URL:  "/api/evaluations/admin"   // ← debería ser …/exec
```

Es decir: en Vercel, la variable del **endpoint público de Apps Script** tenía el
valor del **proxy administrativo**. Con esa configuración, cualquier lectura
pública (el futuro portal de candidatos, la comprobación de una evaluación
publicada) salía hacia nuestro propio proxy en lugar de hacia Google.

Peor aún: si esa variable simplemente se borraba, el código antiguo caía en el
`SCRIPT_URL` general —el Apps Script del **otro** libro de Google Sheets, el de
Postulantes y KPIs—, que no conoce ninguna acción de evaluaciones. Un fallo
silencioso apuntando al backend equivocado.

**Corrección** (dos partes):

* El código **rechaza** un valor que no sea una URL absoluta `http(s)://` y
  devuelve un mensaje que nombra la variable, en lugar de intentarlo contra el
  backend equivocado.
* Los tres valores públicos se versionan en `.env.production`, de modo que un
  despliegue nuevo funciona **sin depender** de que alguien los escriba a mano.
  Ojo: una variable con el mismo nombre en el panel de Vercel **manda** sobre el
  archivo, así que la equivocada hay que borrarla (§3.2).

### 1.5 · Las tres preguntas que faltaban

**¿Por qué `?action=ping` sí funcionaba?**
Porque `ping` es una acción **pública** del Apps Script y se responde en Google,
sin pasar por Vercel. Que `ping` conteste `ok:true` demuestra que el Apps Script
está vivo y bien configurado; **no dice nada** sobre las funciones de Vercel.

**¿Por qué el frontend decía «El servidor no está disponible»?**
El módulo Evaluaciones del panel solo usa acciones **administrativas**
(`listAdminAssessments` para pintar la lista). Esas van al proxy. El proxy
devolvía `HTTP 500`, y el transporte traduce cualquier `HTTP 5xx` a ese mensaje
genérico:

```ts
if (/HTTP 5\d\d/.test(message)) return appError("provider", "El servidor no está disponible.");
```

El mensaje era técnicamente correcto y prácticamente inútil: mandaba a mirar
Google Sheets cuando el problema estaba en el backend intermedio.

**¿Por qué las 326 pruebas pasaban en verde?**
Porque probaban la **lógica** de las funciones importándolas como un módulo más
del proyecto, con el empaquetador de por medio. Nunca probaban el **formato con
el que la plataforma las ejecuta**. Esa es la brecha que cierra la prueba nueva
(§4.5).

### 1.6 · Cómo distinguir un fallo de Vercel de uno de Apps Script

| Prueba | Si falla, el problema está en |
| --- | --- |
| `…/exec?action=ping` | **Apps Script** (proyecto, propiedades, despliegue) |
| `…/exec?action=listPublicAssessments` | **Apps Script** (hojas, encabezados, permisos) |
| `/api/evaluations/session` | **Vercel** (código de `api/`, variables de servidor) |
| `/api/evaluations/admin` | **Vercel**, y si contesta JSON pero con `FORBIDDEN`, el secreto compartido |

Durante este diagnóstico, el 28 de julio de 2026, el Apps Script respondía
correctamente a las dos primeras:

```json
// ?action=ping
{"ok":true,"data":{"service":"evaluations","schemaVersion":1,
 "authMode":"server_secret","adminAuth":{"configured":true,"insecure":false}}}

// ?action=listPublicAssessments
{"ok":true,"data":{"items":[],"total":0},"error":null,"warnings":[]}
```

`items: []` con `total: 0` es la respuesta **correcta** de un libro sin
evaluaciones publicadas todavía; no es un error. El `INTERNAL_ERROR` que se veía
antes correspondía a un estado anterior del proyecto (antes de ejecutar
`configurarEvaluaciones()` o antes de publicar la versión nueva del despliegue) y
**ya no se reproduce**.

También se comprobó que el Apps Script rechaza como debe lo que no está firmado:

```json
// POST {"action":"listAdminAssessments"}  (sin credencial)
{"ok":false,"error":{"code":"FORBIDDEN",
 "message":"Esta operación debe llegar firmada por el backend administrativo autorizado."}}
```

### 1.7 · Los dos libros de Google Sheets

Esta parte conviene tenerla clara, porque es la garantía de que arreglar
Evaluaciones no puede romper nada más:

```
Libro A · «general»                        Libro B · «evaluaciones»
Postulantes, KPIs, Documentación,          Assessments, Sections, Questions,
Perfiles de Cargo, Procesos                Options, Versions, Attempts,
                                           Answers, ProcessedRequests, AuditLog
        │                                          │
Apps Script A (docs/backend/Code.gs)       Apps Script B (apps-script/evaluations/*.gs)
URL /exec propia                           URL /exec propia  ← la de este documento
        │                                          │
src/constants.ts → SCRIPT_URL              VITE_EVALUATIONS_API_URL
```

Son **dos proyectos, dos despliegues y dos versiones independientes**. Ningún
cambio de este trabajo toca el Libro A ni su script. Lo único que había que
evitar —y que el código ahora impide— es que Evaluaciones acabase preguntándole
cosas al Apps Script A por una variable mal puesta.

---

## 2 · Guía exacta de variables

Tres reglas para no equivocarse nunca:

1. **Todo lo que empieza por `VITE_` es público**: acaba dentro del JavaScript
   que descarga cualquier visitante. Ahí solo pueden ir direcciones, nunca
   secretos.
2. **Lo que no empieza por `VITE_` vive solo en el servidor**: lo leen las
   funciones de `api/` y nunca sale al navegador.
3. **Cambiar cualquiera de las dos clases exige volver a desplegar.** Las `VITE_`
   porque se incrustan al compilar; las de servidor porque la función se arranca
   con las que tenía.

### 2.1 · Variables públicas (navegador)

| Variable | Dónde se configura | Formato / ejemplo ficticio | ¿Redespliegue? |
| --- | --- | --- | --- |
| `VITE_ASSESSMENTS_PROVIDER` | `.env.production` del repositorio (ya está) | `google-apps-script` | Sí |
| `VITE_EVALUATIONS_API_URL` | `.env.production` del repositorio (ya está) | `https://script.google.com/macros/s/AKfycbEJEMPLO-NO-REAL/exec` | Sí |
| `VITE_EVALUATIONS_ADMIN_API_URL` | `.env.production` del repositorio (ya está) | `/api/evaluations/admin` | Sí |

> [!IMPORTANT]
> Estas tres **ya no hace falta escribirlas en el panel de Vercel**: están
> versionadas en `.env.production`. Y si existen allí, el valor del panel **gana**
> sobre el archivo. Por eso el paso §3.2 es *borrar* la que está mal.

### 2.2 · Variables de servidor (solo Vercel)

Se crean en **Vercel → tu proyecto → Settings → Environment Variables**, con
*Environment* = **Production** (y **Preview** si quieres que las ramas también
funcionen). **Nunca** les pongas el prefijo `VITE_`.

| Variable | Qué es | Formato / longitud mínima | Ejemplo ficticio |
| --- | --- | --- | --- |
| `EVALUATIONS_APPS_SCRIPT_URL` | La misma URL `…/exec` del Apps Script de Evaluaciones. La usa el proxy para reenviar. | URL absoluta `https://` | `https://script.google.com/macros/s/AKfycbEJEMPLO-NO-REAL/exec` |
| `EVALUATIONS_ADMIN_SHARED_SECRET` | Secreto compartido con Apps Script. Con él el proxy **firma** cada operación administrativa. | ≥ 32 caracteres | `p0nAquiUnSecretoLargoGeneradoAlAzar_48chars` |
| `EVALUATIONS_PANEL_PASSPHRASE` | La frase que teclea el reclutador para abrir el panel. | ≥ 12 caracteres | `frase-de-acceso-del-panel-bdp` |
| `EVALUATIONS_SESSION_SECRET` | Firma la cookie de sesión del panel. **Distinta** del secreto administrativo. | ≥ 32 caracteres | `otroSecretoDistintoTambienLargoDe48Caracteres` |
| `EVALUATIONS_ALLOWED_ORIGINS` | Opcional. Dominios extra admitidos, separados por comas. | `https://otro.dominio` | *(vacío)* |

Cómo generar los secretos (en cualquier terminal o en la consola de Google Cloud
Shell):

```bash
openssl rand -base64 48
```

Si falta alguna, el panel **no adivina**: muestra un mensaje que nombra la
variable ausente, nunca su valor. Si `EVALUATIONS_APPS_SCRIPT_URL` no es una URL
`https` absoluta, lo dice también.

### 2.3 · Script Properties (solo Apps Script)

En el editor de Apps Script: **⚙️ Configuración del proyecto → Propiedades del
script**.

| Propiedad | Valor | Nota |
| --- | --- | --- |
| `EVALUATIONS_SPREADSHEET_ID` | El ID del **Libro B** | Es el trozo largo de la URL de la hoja, entre `/d/` y `/edit`. |
| `EVALUATIONS_AUTH_MODE` | `server_secret` | Modo por omisión: autoriza por firma, no por sesión de Google. |
| `EVALUATIONS_ADMIN_SHARED_SECRET` | **Exactamente el mismo valor** que en Vercel | Si difiere en un solo carácter, todo lo administrativo responde `FORBIDDEN`. |
| `EVALUATIONS_ADMIN_EMAILS` | `ana@banco.com, luis@banco.com` | Opcional; lista blanca de actores para la bitácora. |
| `EVALUATIONS_AUDIT_ENABLED` | `true` | — |

### 2.4 · Lo que NO debe existir en ningún sitio

* Ninguna variable `VITE_EVALUATIONS_ADMIN_SHARED_SECRET`, `VITE_..._PASSPHRASE`,
  `VITE_..._SESSION_SECRET`. Serían públicas.
* Ningún secreto en el repositorio, ni en la documentación, ni en un `.env`
  versionado. `npm run check` falla si aparece algo con forma de credencial.
* El secreto que se expuso alguna vez en una conversación o captura debe
  considerarse **quemado**: rótalo (§6.3) y no vuelvas a usarlo.

---

## 3 · Puesta en marcha paso a paso

> Tiempo estimado: unos 20 minutos, sin prisa. No hace falta saber programar.
> Ve marcando cada casilla.

### 3.1 · Antes de empezar: ten a mano

```
[ ] Acceso al proyecto de Apps Script de Evaluaciones (Libro B)
[ ] Acceso al panel de Vercel del proyecto bdp-reclutamiento-sistema
[ ] Dos secretos nuevos generados con: openssl rand -base64 48
[ ] Una frase de acceso para el panel (12 caracteres o más)
```

### 3.2 · Paso 1 · Corregir la variable equivocada en Vercel

Este es **el paso que no puede hacer el código**, y sin él el módulo seguirá a
medias.

1. Entra en <https://vercel.com> y abre el proyecto del panel.
2. **Settings** (arriba) → **Environment Variables** (menú izquierdo).
3. Busca `VITE_EVALUATIONS_API_URL`.
4. Verás que su valor es `/api/evaluations/admin`. Tienes dos opciones:
   * **Recomendada:** pulsa los tres puntos `⋯` a su derecha → **Remove** →
     confirma. A partir de ahora manda el valor correcto que viaja en el
     repositorio (`.env.production`).
   * **Alternativa:** pulsa **Edit** y sustituye el valor por la URL completa
     `…/exec` del Apps Script de Evaluaciones (la que empieza por
     `https://script.google.com/macros/s/` y termina en `/exec`).
5. Si existe `VITE_EVALUATIONS_ADMIN_API_URL`, comprueba que su valor es
   exactamente `/api/evaluations/admin`. Si tiene una URL de `script.google.com`,
   bórrala.

> [!WARNING]
> No basta con guardar: Vercel **no** recompila solo. El redespliegue es el paso
> §3.5.

### 3.3 · Paso 2 · Crear las cuatro variables de servidor en Vercel

En la misma pantalla (**Settings → Environment Variables**), pulsa **Add
Another** para cada una. Marca los entornos **Production** y **Preview**.

| Key | Value |
| --- | --- |
| `EVALUATIONS_APPS_SCRIPT_URL` | la URL `…/exec` del Apps Script de Evaluaciones |
| `EVALUATIONS_ADMIN_SHARED_SECRET` | tu secreto nuevo nº 1 (≥ 32 caracteres) |
| `EVALUATIONS_PANEL_PASSPHRASE` | la frase de acceso (≥ 12 caracteres) |
| `EVALUATIONS_SESSION_SECRET` | tu secreto nuevo nº 2 (≥ 32 caracteres, distinto del nº 1) |

Consejos prácticos:

* Copia y pega; no escribas los secretos a mano.
* Ojo con los espacios al final al copiar (el código los recorta, pero mejor no
  arriesgar).
* Si Vercel te ofrece marcarlas como *Sensitive*, hazlo: dejan de poder leerse
  desde el panel.

### 3.4 · Paso 3 · Poner el mismo secreto en Apps Script

1. Abre el proyecto de Apps Script de Evaluaciones.
2. **⚙️ Configuración del proyecto** → baja hasta **Propiedades del script** →
   **Editar propiedades del script**.
3. Comprueba o crea:
   * `EVALUATIONS_AUTH_MODE` = `server_secret`
   * `EVALUATIONS_ADMIN_SHARED_SECRET` = **el mismo valor** que pusiste en Vercel
     como `EVALUATIONS_ADMIN_SHARED_SECRET`
   * `EVALUATIONS_SPREADSHEET_ID` = el ID del Libro B
4. **Guardar propiedades del script**.
5. Vuelve al editor y ejecuta, en este orden, desde el desplegable de funciones:
   1. `configurarEvaluaciones()` → crea/repara las nueve hojas y sus encabezados.
   2. `verificarEsquemaEvaluaciones()` → debe registrar `ok: true`.
   3. `ejecutarPruebasEvaluaciones()` → todas las líneas deben decir `OK`.
6. **Muy importante:** publica una versión nueva, o el código guardado no se
   sirve:

   ```
   Implementar → Administrar implementaciones → ✏️ (editar)
   → Versión: «Nueva versión» → Implementar
   ```

   * *Ejecutar como*: **Yo** (el propietario).
   * *Quién tiene acceso*: **Cualquier persona**.
   * La URL `/exec` **no cambia** al crear una versión nueva. Si te da una URL
     distinta, es que creaste un despliegue nuevo en lugar de una versión: usa
     entonces esa URL en todos los sitios, o vuelve al despliegue original.

### 3.5 · Paso 4 · Redesplegar el panel

Con la PR de esta reparación ya fusionada en `main`:

1. Vercel → tu proyecto → pestaña **Deployments**.
2. Localiza el despliegue más reciente de `main`.
3. `⋯` → **Redeploy** → **desmarca** «Use existing Build Cache» → **Redeploy**.
4. Espera a que quede en verde (`Ready`).

### 3.6 · Paso 5 · Comprobar que funciona

Abre estas dos direcciones en el navegador (sustituye el dominio si usas otro):

1. `https://bdp-reclutamiento-sistema.vercel.app/api/evaluations/session`
   → debe responder **JSON** parecido a:

   ```json
   {"ok":true,"requestId":"","data":{"active":false,"actor":"","expiresAt":0},
    "error":null,"warnings":[]}
   ```

   Si ves «A server error has occurred», el redespliegue no incluyó la
   corrección: repite §3.5.

2. `…/exec?action=ping` del Apps Script → `"ok":true` con
   `"adminAuth":{"configured":true}`.

Después, en el panel:

```
[ ] Abre el módulo «Evaluaciones».
[ ] Aparece un diálogo pidiendo la frase de acceso  ← señal de que todo conecta
[ ] Escribe la frase (EVALUATIONS_PANEL_PASSPHRASE) y tu correo
[ ] La lista carga. Vacía es correcto si aún no hay evaluaciones
[ ] Crea una evaluación de prueba, guárdala y publícala
[ ] Vuelve a abrir el módulo: la evaluación sigue ahí (viene de Google Sheets)
[ ] Abre el Libro B: la fila está en la hoja «Assessments»
```

La frase se pide **una vez cada 8 horas** por navegador. No se guarda en el
equipo: lo que queda es una cookie que el JavaScript no puede leer.

---

## 4 · Guía de diagnóstico

### 4.1 · Las seis pruebas, en orden

Ejecútalas de arriba abajo y detente en la primera que falle: ahí está el
problema.

| # | Qué probar | Respuesta correcta |
| --- | --- | --- |
| 1 | `…/exec?action=ping` | `ok:true`, `authMode:"server_secret"`, `adminAuth.configured:true` |
| 2 | `…/exec?action=listPublicAssessments` | `ok:true` con `items:[]` y `total:0` (o las publicadas) |
| 3 | `GET /api/evaluations/session` | `ok:true` con `active:false` |
| 4 | `POST /api/evaluations/session` con `{"passphrase":"…"}` | `ok:true` con `active:true` y una cabecera `Set-Cookie` |
| 5 | `POST /api/evaluations/admin` **sin** cookie | `ok:false`, `code:"FORBIDDEN"`, `details.adminSession:"required"` |
| 6 | El módulo en el navegador | Pide la frase y luego lista |

En consola, las tres primeras:

```bash
BASE=https://bdp-reclutamiento-sistema.vercel.app
EXEC='…/exec'   # pega aquí la URL del Apps Script

curl -s "$EXEC?action=ping"
curl -s "$EXEC?action=listPublicAssessments"
curl -s "$BASE/api/evaluations/session"
curl -s -X POST -H 'Content-Type: application/json' \
     -d '{"action":"listAdminAssessments","requestId":"","payload":{}}' \
     "$BASE/api/evaluations/admin"
```

> [!TIP]
> Para probar el Apps Script con **POST** usa el navegador o `node`, no `curl -L`:
> Google responde con una redirección que `curl` no reenvía igual que un
> navegador y verás una página «Sorry, unable to open the file» que **no** es un
> fallo real del script. Los `GET` sí funcionan con `curl`.
>
> ```bash
> node -e 'fetch(process.argv[1],{method:"POST",redirect:"follow",
>   headers:{"Content-Type":"text/plain;charset=utf-8"},
>   body:JSON.stringify({action:"listPublicAssessments",requestId:"",payload:{}})})
>   .then(r=>r.text()).then(console.log)' "$EXEC"
> ```

### 4.2 · Qué significa cada error

| Lo que ves | Significado | Qué hacer |
| --- | --- | --- |
| `FUNCTION_INVOCATION_FAILED` / «A server error has occurred» | La función de Vercel se cayó al arrancar o al ejecutarse. | Revisa los *Runtime Logs* (§4.3). Si dice `ERR_MODULE_NOT_FOUND`, falta un `.js` en un import. |
| `El backend administrativo no está configurado: faltan …` | Falta una variable de servidor en Vercel. La respuesta nombra cuál. | §3.3 y redespliega. |
| `… son demasiado cortas …` | Un secreto tiene menos caracteres de los exigidos. | Genera uno más largo. |
| `… no son una URL https absoluta …` | `EVALUATIONS_APPS_SCRIPT_URL` no es una dirección `https://…/exec`. | Corrige el valor. |
| `La variable VITE_EVALUATIONS_API_URL está mal configurada…` | La variable pública tiene una ruta interna en lugar de la URL del Apps Script. | §3.2 y redespliega. |
| `details.adminSession: "required"` | Todo bien: simplemente no hay sesión. El panel pedirá la frase. | Nada. |
| `FORBIDDEN · Esta operación debe llegar firmada…` | El Apps Script no acepta la firma. Casi siempre: los secretos no coinciden. | Vuelve a pegar el mismo valor en los dos sitios (§3.3 y §3.4) y publica versión nueva. |
| `INTERNAL_ERROR` en una acción pública | Error dentro del Apps Script. | §4.4. |
| `LOCK_TIMEOUT` | Dos escrituras a la vez sobre la misma hoja. | Reintenta; si es constante, mira las *Ejecuciones*. |
| «Datos de demostración (local)» en pantalla | El módulo está en modo mock: `VITE_ASSESSMENTS_PROVIDER` no llegó como `google-apps-script`. | Comprueba §3.2 y redespliega. |

### 4.3 · Cómo leer los registros de Vercel

1. Vercel → proyecto → pestaña **Logs** (o **Deployments → el despliegue →
   Runtime Logs**).
2. Filtra por `/api/evaluations`.
3. Provoca el error (recarga el módulo) y mira la última entrada.
4. Lo que importa es la **primera línea del error**: `ERR_MODULE_NOT_FOUND`,
   `TypeError`, `AbortError`…

Los registros **no** contienen secretos: el código nunca los imprime.

### 4.4 · Cómo leer las ejecuciones de Apps Script

1. Abre el proyecto de Apps Script.
2. Menú izquierdo → **Ejecuciones** (icono de lista).
3. Cada fila es una llamada: función, estado, duración. Abre una con estado
   *Failed*.
4. La traza indica el archivo y la línea reales, que el envoltorio
   `INTERNAL_ERROR` oculta al cliente por seguridad.

Cosas que se ven ahí y explican casi todos los `INTERNAL_ERROR`:

* falta `EVALUATIONS_SPREADSHEET_ID`, o apunta a otro libro;
* falta una hoja o un encabezado → ejecuta `configurarEvaluaciones()`;
* el usuario que ejecuta no tiene permiso sobre el libro;
* el despliegue sirve una **versión antigua** del código (§3.4, punto 6);
* faltan archivos `.gs` en el proyecto: deben ser **19** más `appsscript.json`.

### 4.5 · Qué vigila ahora la suite de pruebas

`src/features/assessments/__tests__/apiRuntime.test.ts` hace algo que ninguna
prueba hacía: **transpila `api/` a ESM real, lanza un proceso de Node aparte y
carga las funciones ahí**, sin Vite ni alias. Es la reproducción más fiel posible
del entorno de Vercel sin desplegar. Comprueba que:

* todas las funciones cargan (si falta un `.js`, la prueba falla con el mismo
  `ERR_MODULE_NOT_FOUND` que se veía en producción);
* exportan `GET`/`POST`/`DELETE` y **no** exportan `default`;
* `GET /session` sin cookie devuelve JSON con `active:false`;
* `POST /admin` sin sesión devuelve `adminSession:"required"`;
* sin variables de entorno, la respuesta sigue siendo JSON y nombra la que falta;
* ninguna respuesta contiene un secreto.

Además `npm run check` incluye dos reglas estáticas nuevas: ningún import
relativo de `api/` sin `.js`, y ningún `export default` en `api/evaluations/`.

---

## 5 · Checklist final de aceptación

```
Código
[ ] npx tsc -b --noEmit            → sin errores
[ ] npm test                       → 336/336
[ ] npm run check                  → «Sin hallazgos»
[ ] npm run build                  → correcto
[ ] grep de secretos en dist/      → ninguno

Apps Script (Libro B)
[ ] 19 archivos .gs + appsscript.json en el proyecto
[ ] Propiedades: SPREADSHEET_ID, AUTH_MODE=server_secret, ADMIN_SHARED_SECRET
[ ] configurarEvaluaciones()        → sin error
[ ] verificarEsquemaEvaluaciones()  → ok:true
[ ] ejecutarPruebasEvaluaciones()   → todo OK
[ ] Implementación con VERSIÓN NUEVA, ejecutar como propietario, acceso: cualquiera
[ ] ?action=ping                    → ok:true, adminAuth.configured:true
[ ] ?action=listPublicAssessments   → ok:true, items:[] y total:0 si está vacío

Vercel
[ ] VITE_EVALUATIONS_API_URL borrada del panel (o con la URL …/exec correcta)
[ ] EVALUATIONS_APPS_SCRIPT_URL configurada
[ ] EVALUATIONS_ADMIN_SHARED_SECRET configurada e idéntica a la de Apps Script
[ ] EVALUATIONS_PANEL_PASSPHRASE configurada (≥12)
[ ] EVALUATIONS_SESSION_SECRET configurada (≥32, distinta)
[ ] Redespliegue hecho sin caché de compilación
[ ] Runtime Logs sin ERR_MODULE_NOT_FOUND
[ ] GET /api/evaluations/session       → JSON con active:false
[ ] POST /api/evaluations/admin        → adminSession:"required", nunca HTTP 500

Panel
[ ] El módulo pide la frase de acceso
[ ] La lista carga (vacía es válido)
[ ] Crear, guardar y publicar una evaluación funciona
[ ] La fila aparece en la hoja «Assessments» del Libro B
[ ] Los demás módulos (Postulantes, KPIs, Procesos, Perfiles…) siguen igual
```

---

## 6 · Rollback y rotación

### 6.1 · Volver al despliegue anterior de Vercel

1. Vercel → **Deployments**.
2. Elige el último despliegue que funcionaba.
3. `⋯` → **Promote to Production** (o **Rollback**, según la versión del panel).

Tarda segundos y no requiere `git`. Recuerda que un despliegue antiguo lleva
**sus** variables `VITE_` incrustadas.

### 6.2 · Volver a una versión anterior de Apps Script

```
Implementar → Administrar implementaciones → ✏️ (editar)
→ Versión: elige una anterior de la lista → Implementar
```

La URL `/exec` no cambia. Las hojas **no** se revierten: el código antiguo verá
los datos nuevos. Como todas las escrituras son aditivas o bajas lógicas, es
seguro.

### 6.3 · Rotar el secreto compartido sin dejar el sistema abierto

El truco es que Apps Script admite **dos** secretos válidos a la vez, así que no
hay ventana de caída:

1. Genera el secreto nuevo: `openssl rand -base64 48`.
2. En Apps Script, crea la propiedad `EVALUATIONS_ADMIN_SHARED_SECRET_NEXT` con
   el valor **nuevo**. Publica versión nueva. Ahora valen el viejo y el nuevo.
3. En Vercel, cambia `EVALUATIONS_ADMIN_SHARED_SECRET` al valor **nuevo** y
   redesplegía.
4. Comprueba que el panel sigue funcionando (lista, crear, publicar).
5. En Apps Script, pon el valor nuevo en `EVALUATIONS_ADMIN_SHARED_SECRET`,
   **borra** `EVALUATIONS_ADMIN_SHARED_SECRET_NEXT` y publica versión nueva. El
   viejo queda invalidado.

La frase del panel (`EVALUATIONS_PANEL_PASSPHRASE`) y el secreto de sesión
(`EVALUATIONS_SESSION_SECRET`) se cambian directamente en Vercel; cambiar el de
sesión cierra todas las sesiones abiertas, que es justo lo que se quiere si
sospechas de una filtración.

> [!CAUTION]
> Un secreto que se pegó en un chat, en una captura o en un documento compartido
> está quemado. Rótalo con el procedimiento de arriba y no lo reutilices en
> ningún entorno.

---

## 7 · Qué cambió en el código

| Archivo | Cambio |
| --- | --- |
| `api/_lib/config.ts`, `api/evaluations/*.ts` | Imports relativos con extensión `.js`. |
| `api/evaluations/session.ts` | `export default` → `export const GET/POST/DELETE`. |
| `api/evaluations/admin.ts` | `export default` → `export const POST/GET/DELETE`. |
| `api/_lib/config.ts` | Valida que `EVALUATIONS_APPS_SCRIPT_URL` sea una URL `https` absoluta. |
| `tsconfig.api.json` | `moduleResolution: bundler` → `nodenext`: olvidar una extensión ya no compila. |
| `src/shared/flags.ts` | Rechaza una URL pública que no sea absoluta; ignora una URL de Apps Script puesta en la variable del proxy. |
| `src/features/assessments/api/transport.ts` | Mensaje exacto ante configuración incorrecta; distingue «error de negocio» de «función caída». |
| `.env.production` (nuevo) | Los tres valores públicos versionados. |
| `.env.local` | Eliminado del repositorio (estaba versionado por error, con una URL de ejemplo). |
| `scripts/check-evaluations.mjs` | Dos reglas nuevas sobre el formato desplegable de `api/`. |
| `src/features/assessments/__tests__/apiRuntime.test.ts` (nuevo) | Carga `api/` en un Node real y ejerce las respuestas. |
| `src/features/assessments/__tests__/vercelFunction.ts` (nuevo) | Réplica del lanzador de Vercel para que las pruebas invoquen como la plataforma. |

Lo que **no** cambió: el backend de Apps Script (ni un `.gs`), el modelo de
datos, las hojas, la API pública, la lógica de negocio, la calificación en
servidor, la auditoría y ningún otro módulo del sistema.
