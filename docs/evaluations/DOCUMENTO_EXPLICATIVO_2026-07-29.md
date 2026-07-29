# Por qué publicar fallaba y cómo se corrigió

*Documento explicativo del cambio. Julio de 2026.*

**Resumen en una frase:** `publishAssessment` fallaba con `INTERNAL_ERROR` porque
el contenido congelado de una evaluación de 20 preguntas ocupa **51 321
caracteres** y una celda de Google Sheets no admite más de **50 000**. La
evaluación afectada estaba justo al otro lado del acantilado, así que fallaba el
100 % de las veces.

---

## Contexto

### Para quien llega nuevo (sáltatelo si ya conoces el módulo)

El módulo Evaluaciones guarda sus datos en un libro de Google Sheets con nueve
pestañas y los lee mediante un proyecto de Google Apps Script publicado como *Web
App*. El ATS (React + Vite) es donde el reclutador construye la evaluación; el
portal de candidatos (Next.js) es donde alguien la responde escribiendo un código
público como `EVL-NUEV-DB21`.

Lo primero que hay que entender es que **guardar y publicar son dos operaciones
distintas**:

- **Guardar** (`updateAssessment`) escribe el borrador en las pestañas
  `Assessments`, `Sections`, `Questions` y `Options`.
- **Publicar** (`publishAssessment`) congela una copia inmutable de ese borrador
  en la pestaña `Versions` y apunta a ella desde
  `Assessments.current_published_version_id`.

El código público se genera al **crear** el borrador, pero el portal solo sirve
una evaluación cuando se cumplen las tres condiciones que impone
`PublicAssessmentService.gs`:

```javascript
assessment.status === 'published'
  && assessment.publicationStatus === 'published'
  && !!assessment.currentPublishedVersionId
```

> **Por qué el portal miente a propósito**
>
> Para un borrador, `getPublicAssessment` responde `NOT_FOUND` con el mensaje
> «La evaluación no está disponible», exactamente igual que para un código
> inexistente. Es deliberado: si el candidato pudiera distinguir «no existe» de
> «existe pero no está lista», el código público serviría para descubrir qué
> evaluaciones se están preparando. La consecuencia práctica es que **el síntoma
> no distingue entre «nunca se publicó» y «el backend está roto»**, y eso fue lo
> que hizo el diagnóstico difícil.

### El contexto inmediato del fallo

La auditoría del libro exportado dejó cuatro hechos:

1. Una sola evaluación, `EVL-NUEV-DB21`, con `status=draft`,
   `publication_status=unpublished` y `current_published_version_id` vacío. Es
   decir: **nunca se publicó**.
2. Veinte preguntas activas y ochenta opciones activas.
3. Tres filas en `Versions` etiquetadas `v1.0`, `v2.0`, `v3.0`, todas con
   `state=published`, pero con `snapshot_json`, `checksum`, `published_at`,
   `published_by` y `created_at` **vacíos**.
4. Tres entradas de `AuditLog` para `publishAssessment` con `status=error` y
   `code=INTERNAL_ERROR`.

El punto 3 es el que resuelve el caso, y merece mirarse de cerca. Las columnas de
`Versions` están en este orden:

| # | Columna | ¿Tenía valor? |
| --- | --- | --- |
| 1 | `version_id` | Sí |
| 2 | `assessment_id` | Sí |
| 3 | `version` | Sí |
| 4 | `version_minor` | Sí |
| 5 | `version_label` | Sí |
| 6 | `state` | Sí |
| 7 | `notes` | Sí |
| 8 | `snapshot_json` | **No** |
| 9–15 | `snapshot_schema_version` … `created_at` | **No** |

El corte es limpio y cae exactamente en `snapshot_json`. Eso no es aleatorio: es
la firma de una escritura que se detuvo al llegar a una celda concreta.

---

## Intuición

Google Sheets rechaza cualquier celda con más de 50 000 caracteres.
`publishAssessment` serializaba el snapshot completo —la evaluación, las
secciones, las preguntas y las opciones, con todos sus campos— y lo metía tal cual
en una sola celda.

Medido sobre el código real, con textos deliberadamente **cortos** (80 caracteres
por pregunta, 50 por opción):

| Preguntas (×4 opciones) | `snapshot_json` | ¿Cabe? |
| --- | --- | --- |
| 10 | 26 631 | Sí |
| 15 | 38 976 | Sí |
| **20** | **51 321** | **No** |
| 25 | 63 666 | No |
| 40 | 100 701 | No |

El techo real estaba en unas **16 preguntas**. `EVL-NUEV-DB21` tiene 20. Con
textos realistas el número solo empeora: 56 121 caracteres.

La secuencia completa, y esto explica los cuatro puntos de la auditoría a la vez:

1. `setValues` escribe la fila celda a celda y **aborta** al llegar a
   `snapshot_json`. Las siete primeras columnas quedan grabadas; las ocho
   últimas, vacías. → **hecho 3**.
2. El error que lanza Sheets es un `Error` genérico, sin código tipado, así que el
   enrutador lo convierte en `INTERNAL_ERROR`. → **hecho 4**.
3. La excepción ocurre **antes** de actualizar `Assessments` y antes de registrar
   la escritura idempotente, de modo que los tres estados siguen en borrador y
   `ProcessedRequests` no tiene ninguna entrada. → **hecho 1**.
4. En el siguiente intento, el código busca la última versión para decidir si el
   cambio es estructural. La encuentra (`v1.0`) pero su snapshot está vacío, así
   que lo interpreta como «no había versión anterior», clasifica el cambio como
   estructural y sube la versión mayor: `v2.0`. Y otra vez: `v3.0`. → **las
   etiquetas exactas de la auditoría**.

Todo encaja sin residuos. Ninguna de las hipótesis del diagnóstico preliminar —el
ID del libro, los permisos, el esquema, la sesión administrativa— era la causa.

> **Sobre el `INTERNAL_ERROR` de `listPublicAssessments`**
>
> No es reproducible. Ocho llamadas consecutivas contra el despliegue vivo
> devolvieron `ok:true` con `items:[]`, que es la respuesta **correcta** para un
> libro cuya única evaluación está en borrador. Se trata como un fallo transitorio
> (una lectura de Sheets que expiró) y no como un defecto. Aun así, la corrección
> lo aborda por el lado que importa: los fallos de escritura ya no se disfrazan de
> `INTERNAL_ERROR`.

### Por qué la suite no lo detectó

Esta es la parte incómoda. El repositorio ya tenía un arnés que ejecuta los
archivos `.gs` reales dentro de Node con un `SpreadsheetApp` en memoria, y 336
pruebas en verde.

El `setValues` de ese doble validaba el número de filas y de columnas… y **no** el
límite de caracteres por celda.

> **El doble de prueba era más permisivo que la plataforma real.**
>
> Un test double que acepta lo que producción rechaza no prueba nada sobre ese
> eje. La suite estaba verde porque todas las pruebas existentes usaban
> evaluaciones de una o dos preguntas, muy por debajo del acantilado. La
> corrección empieza, por eso, por hacer el doble fiel.

---

## Código

### 1. Primero, hacer que el arnés diga la verdad

En `scripts/run-apps-script.mjs`, `setValues` respeta ahora el límite real, **y
reproduce el fallo parcial**: escribe celda a celda y aborta en la que se pasa,
igual que Sheets.

```javascript
export const SHEETS_CELL_CHARACTER_LIMIT = 50000;

for (let c = 0; c < this.numColumns; c++) {
  const value = values[r][c];
  // Sheets escribe celda a celda y aborta al llegar a la que se pasa del
  // límite: las anteriores quedan grabadas y las posteriores no. Eso es lo
  // que dejó las filas de `Versions` con las 7 primeras columnas llenas y
  // las 8 últimas vacías.
  if (typeof value === "string" && value.length > SHEETS_CELL_CHARACTER_LIMIT) {
    throw cellTooLongError();
  }
  this.sheet.writeCell(this.row + r, this.column + c, value);
}
```

Con este cambio las 336 pruebas existentes siguieron pasando (ninguna usaba
evaluaciones grandes) y la prueba nueva de 20 preguntas falló, reproduciendo
producción dentro de la suite.

### 2. Comprimir el snapshot cuando no cabe

Este JSON comprime extraordinariamente bien: las claves se repiten en cada uno de
los cien objetos, los ids comparten prefijo y las fechas son idénticas. Medido:
**43 866 → 2 100 caracteres, un factor de 20,9×**.

El archivo nuevo `apps-script/evaluations/SnapshotCodec.gs` define el formato:

```javascript
var EVAL_SNAPSHOT_GZIP_PREFIX = 'EVALGZ1:';
var EVAL_SNAPSHOT_PLAIN_MAX = 40000;

function evalEncodeSnapshot_(snapshotJson) {
  var text = String(snapshotJson);
  if (text.length <= EVAL_SNAPSHOT_PLAIN_MAX) return text;

  var compressed = EVAL_SNAPSHOT_GZIP_PREFIX + Utilities.base64Encode(
    Utilities.gzip(Utilities.newBlob(text, 'application/json', 'snapshot.json')).getBytes()
  );
  if (compressed.length > EVAL_CONFIG.LIMITS.MAX_CELL_CHARS) {
    throw evalError_('VALIDATION_ERROR',
      'La evaluación es demasiado grande para publicarse: …', { /* tamaños reales */ });
  }
  return compressed;
}
```

Tres decisiones de diseño merecen explicación.

**La codificación viaja dentro del valor, no en una columna nueva.** La
alternativa obvia era añadir una columna `snapshot_encoding` a `Versions`. Se
rechazó porque `evalHeaderMap_` lanza `SCHEMA_ERROR` cuando falta un encabezado
esperado: añadir la columna **rompería el despliegue vivo** hasta que alguien
ejecutara la migración. Con el prefijo dentro del valor, esta mejora **no
necesita migrar ninguna hoja**.

**Los snapshots pequeños siguen guardándose en claro.** Se podría haber comprimido
siempre, pero soporte diagnostica leyendo `snapshot_json` a ojo desde la hoja.
Comprimir solo cuando hace falta conserva esa capacidad en el caso habitual y deja
los libros existentes intactos.

**El lector nunca lanza.** Un snapshot ilegible debe comportarse como «no hay
snapshot» —el llamador responde `NOT_FOUND`— y no tumbar la lectura:

```javascript
function evalDecodeSnapshot_(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'object') return raw;
  var text = String(raw);
  if (text.indexOf(EVAL_SNAPSHOT_GZIP_PREFIX) !== 0) {
    return evalParseJson_(text, null);   // formato antiguo, sin cambios
  }
  try {
    var bytes = Utilities.base64Decode(text.slice(EVAL_SNAPSHOT_GZIP_PREFIX.length));
    return evalParseJson_(Utilities
      .ungzip(Utilities.newBlob(bytes, 'application/x-gzip', 'snapshot.gz'))
      .getDataAsString('UTF-8'), null);
  } catch (error) {
    return null;
  }
}
```

### 3. El checksum se calcula sobre el JSON en claro

Detalle pequeño y fácil de equivocar. El `checksum` identifica **el contenido
congelado**, no cómo se transporta hasta la celda. Si se calculara sobre el texto
comprimido, el mismo contenido daría hashes distintos según si superó el umbral o
no.

```javascript
snapshot_json: evalEncodeSnapshot_(snapshotJson),
// El checksum se calcula sobre el JSON EN CLARO: identifica el contenido
// congelado, no la forma en que se transporta hasta la celda.
checksum: evalChecksum_(snapshotJson),
```

Por la misma razón `snapshot_schema_version` no cambia: describe el esquema
**lógico** del snapshot, que es algo distinto de su codificación.

### 4. Un error tipado, y ninguna fila a medio escribir

Aunque la compresión resuelve el caso concreto, el modo de fallo subyacente seguía
ahí: cualquier valor demasiado largo corrompía una fila. La validación se hace
ahora **antes** de tocar la hoja, en `evalToRowArray_`:

```javascript
if (typeof value === 'string' && value.length > EVAL_CONFIG.LIMITS.MAX_CELL_CHARS) {
  throw evalError_('VALIDATION_ERROR',
    'Un valor es demasiado largo para una celda de la hoja de cálculo.',
    { sheet: sheetName, column: key, characters: value.length,
      limit: EVAL_CONFIG.LIMITS.MAX_CELL_CHARS });
}
```

Y `evalUpsertRows_` convierte el lote completo —lo que dispara esa validación—
antes de escribir la primera celda. Antes actualizaba fila por fila dentro del
bucle, así que un lote de tres podía quedar aplicado a la mitad:

```javascript
// Primero se convierte el lote completo (lo que valida longitudes y
// encabezados) y solo después se escribe. Si un objeto es inválido, la hoja no
// se toca: no quedan filas a medias ni lotes aplicados por la mitad.
var toAppend = [];
var toUpdate = [];
for (var o = 0; o < objects.length; o++) { /* … */ }

for (var u = 0; u < toUpdate.length; u++) {
  sheet.getRange(toUpdate[u].row, 1, 1, width).setValues([toUpdate[u].values]);
}
```

### 5. Una corrección latente

Al introducir la compresión apareció un error que habría sido difícil de encontrar
más tarde. La clasificación de versiones leía el snapshot anterior con
`evalParseJson_`, que no entiende el formato comprimido: habría devuelto `null`,
clasificando **cualquier** cambio como estructural y subiendo la versión mayor en
cada publicación.

```javascript
// Debe decodificar, no solo parsear: si la versión anterior quedó comprimida,
// tratarla como «sin snapshot» clasificaría cualquier cambio como estructural
// y subiría la versión mayor en cada publicación.
var previousSnapshot = last ? evalDecodeSnapshot_(last.snapshotJson) : null;
```

### 6. Un diagnóstico que responde la pregunta real

`apps-script/evaluations/Diagnostics.gs` existe porque averiguar por qué el portal
decía «no disponible» obligaba a leer nueve pestañas a mano.
`diagnosticarEvaluaciones()` es de solo lectura e imprime el motivo exacto:

```text
2) ESTADO DE PUBLICACIÓN (1 evaluación/es)
   · EVL-NUEV-DB21  ✘ NO SE SIRVE
     status=draft lifecycle=draft publication=unpublished
     puntero=(vacío) entityVersion=5
     secciones=1/2 preguntas=20/20 opciones=80/80 versiones=3
     MOTIVO: status="draft" (debe ser "published")
```

Informa además de las versiones sin snapshot utilizable, de las preguntas cuyo
número de correctas no encaja con su tipo y de las contradicciones de puntuación.
No contiene datos personales ni respuestas correctas, así que se puede pegar tal
cual en un ticket.

`repararEvaluaciones()` es **seca por omisión**: hay que pasarle
`{ dryRun: false }` explícitamente. Lo único que hace es cambiar `published` por
`superseded` en las filas de `Versions` sin snapshot que nadie apunta. No borra
filas ni vacía columnas.

### 7. El portal: rechazar `/dev` en producción

En `postulacionesbdpv2`, la clasificación del endpoint ya cubría la URL ausente,
relativa, con `http`, administrativa o sin `/exec`. Faltaba un caso: `/dev` se
aceptaba en producción.

```typescript
// A `/dev` deployment serves the code currently saved in the editor and only
// answers to accounts that can edit the script, so candidates would get an
// HTML sign-in page instead of JSON.
if (production && parsed.pathname.endsWith('/dev')) {
  return { status: 'invalid', url: '', diagnostic: `${VARIABLE} apunta a un despliegue /dev…` };
}
```

El indicador de producción se inyecta como parámetro para que la regla sea
comprobable sin mutar `process.env`.

---

## Verificación

### Lo que está demostrado con comandos

**Rojo → verde, aislando la corrección.** Subiendo el umbral de compresión a un
valor inalcanzable se recupera el comportamiento anterior:

```text
--- SIN comprimir (comportamiento anterior) ---
  ✓ el snapshot sin comprimir del caso real ya no cabía en una celda de Sheets
  × publica la evaluación de 20 preguntas que fallaba en producción
  × el código público abre la versión publicada y sirve las 20 preguntas
  × publica evaluaciones muy por encima del caso que fallaba (100 y 250 preguntas)
  ✓ una escritura que no cabe en una celda falla con error tipado…
  Tests  3 failed | 2 passed (5)
```

Con la corrección: **5 de 5 en verde**.

**Suite completa del ATS.** `npm test` → **355 pruebas en 31 archivos, todas en
verde** (336 antes, 19 nuevas). `npx tsc -b --noEmit` sin errores.
`npm run check` sin hallazgos. `npm run build` correcto.

**Suite completa del portal.** `npm run typecheck`, `npm run lint` (sin avisos),
`npm run test` (**119 pruebas**), `npm run build`: todo correcto.

**Contra el despliegue vivo**, el 29 de julio de 2026:

| Prueba | Resultado |
| --- | --- |
| `?action=ping` | `ok:true`, `configured:true`, `insecure:false` |
| `?action=listPublicAssessments` × 8 | `ok:true`, `items:[]` — **8 de 8**; el `INTERNAL_ERROR` no se reproduce |
| `?action=getPublicAssessment&publicCode=EVL-NUEV-DB21` | `NOT_FOUND` — correcto: sigue en borrador |
| `POST` con `text/plain` siguiendo el 302 | `ok:true` con el `requestId` devuelto |
| `?action=verifySchema` | `FORBIDDEN` — correcto: exige firma administrativa |

> **Un falso positivo que conviene no repetir**
>
> `curl -L -X POST` contra `/exec` devuelve HTML de «Page Not Found» y un 405. No
> es un defecto del producto: `-X POST` fuerza el método a través de la
> redirección 302, mientras que un navegador (y `fetch` con
> `redirect: 'follow'`) la convierte en `GET`. Siguiendo la redirección a mano, la
> respuesta es el JSON correcto.

### Las tres dudas de la auditoría, resueltas con prueba

| Duda | Veredicto |
| --- | --- |
| La pregunta múltiple con dos correctas, ¿se trata como conjunto exacto? | **Sí.** El conjunto exacto acierta; una sola de las dos falla; las dos más una incorrecta, también. |
| `score_value = 0` con `max_points = 5`, ¿da siempre cero? | **No.** El modo `exact` califica por `is_correct`; la nota es aciertos ÷ calificables × 100. 11 de 20 → 55, aprobado con mínimo 51. |
| `policies_json.scoring.mode = "none"`, ¿contradice a las preguntas? | **Es inerte.** El motor nunca lee esa política. El diagnóstico lo avisa como `POLICY_IGNORED` para que nadie crea que cambiándola cambia la nota. |

### QA manual, paso a paso

1. Copia los archivos de `apps-script/evaluations/` al proyecto de Apps Script.
   Son **23**, incluidos los nuevos `SnapshotCodec.gs` y `Diagnostics.gs`.
2. **«Implementar» → «Gestionar implementaciones» → lápiz → Versión: «Nueva
   versión» → «Implementar».** Sin este paso, `/exec` sigue sirviendo el código
   viejo.
3. Ejecuta `diagnosticarEvaluaciones()`. Debe decir `MOTIVO: status="draft"` para
   `EVL-NUEV-DB21`.
4. En el ATS, abre esa evaluación, pulsa **Guardar**, espera la confirmación y
   pulsa **Publicar**.
5. En el libro, `Versions` debe tener una fila nueva `v4.0` con `snapshot_json`
   **no vacío** (empezará por `EVALGZ1:`, que es lo correcto) y `checksum`,
   `published_at` y `created_at` rellenos.
6. En `Assessments`, los tres estados en `published` y
   `current_published_version_id` relleno.
7. Abre `TU_URL?action=getPublicAssessment&publicCode=EVL-NUEV-DB21`. Debe
   responder `ok:true`. **El parámetro es `publicCode`, no `code`.**
8. Abre el código desde el portal, responde y envía. Comprueba una fila nueva en
   `Attempts` con nota y veinte en `Answers`.
9. Pausa la evaluación: el código deja de abrir. Reanúdala: vuelve a abrir.
10. Ejecuta `repararEvaluaciones()` (seca) y revisa el plan: debe proponer marcar
    `v1.0`, `v2.0` y `v3.0` como `superseded`. Aplícalo solo si estás de acuerdo.

Guía completa, sin saltarse un clic: [`GUIA_OPERATIVA_FINAL.md`](GUIA_OPERATIVA_FINAL.md).

---

## Alternativas

### A. Repartir el snapshot en varias celdas o en una pestaña nueva

Guardar el JSON en claro troceado en `snapshot_json_1..n`, o en una pestaña
`VersionChunks` con una fila por trozo.

| A favor | En contra |
| --- | --- |
| Sin techo práctico de tamaño | Exige **migrar el esquema**; con una columna nueva, `evalHeaderMap_` lanza `SCHEMA_ERROR` y tumba el despliegue vivo hasta migrar |
| El snapshot sigue siendo texto legible | Una pestaña nueva rompe el contrato de «nueve hojas» que asumen documentación, `verifySchema` y las pruebas |
| No depende de `Utilities.gzip` | Hay que garantizar orden e integridad de los trozos: más superficie para corromper una versión |
| | Más lecturas por cada apertura pública |

Descartada porque la compresión resuelve el problema real —de ~16 a varios
cientos de preguntas— sin migración ninguna. Si algún día hicieran falta más de
mil preguntas, el troceado se puede añadir **encima** de este códec sin deshacer
nada.

### B. Adelgazar el snapshot en vez de comprimirlo

Guardar solo los campos que necesitan el DTO público y el motor de calificación,
descartando `createdAt`, `updatedBy`, `competency`, `tags`, `rubrics` y compañía.

| A favor | En contra |
| --- | --- |
| El snapshot queda legible **y** más pequeño | Reduce el tamaño ~40 %: el techo pasaría de ~16 a ~38 preguntas. Sigue habiendo un acantilado, solo más lejos |
| Sin dependencias nuevas | El snapshot deja de ser una copia fiel; una necesidad futura obligaría a republicar todo |
| Menos datos administrativos duplicados | Hay que decidir campo por campo qué es prescindible: cada acierto o error queda congelado en versiones inmutables |

Descartada porque no elimina el modo de fallo, solo lo aleja, y sacrifica la
fidelidad del snapshot, que es justamente su razón de existir.

---

## Personas sugeridas para consultar

El historial de Git de los archivos tocados dice algo que conviene decir en voz
alta: **todo el módulo Evaluaciones fue generado por IA**.
`AssessmentService.gs`, `SheetRepository.gs`, `PublicAssessmentService.gs` y el
arnés de pruebas tienen como único autor previo a `Claude
<noreply@anthropic.com>`, en los PR #11 a #17.

- **AlexRCM** — es el único humano con contexto operativo real: configuró el
  libro, las Script Properties y las variables de Vercel, y vio el fallo en vivo.
  Es quien debe validar los pasos manuales y confirmar que `EVL-NUEV-DB21`
  publica de verdad.
- **Nadie más, y eso es un riesgo en sí mismo.** No hay un revisor humano con
  conocimiento independiente de este código. Se recomienda revisar con especial
  atención dos cosas: que `evalDecodeSnapshot_` acepta los snapshots antiguos en
  JSON plano (hay prueba, pero es el punto de compatibilidad crítico) y la
  advertencia de rollback: una versión anterior del backend **no** entiende
  `EVALGZ1:`.

---

## Cuestionario

<details>
<summary>1. ¿Por qué las tres filas de <code>Versions</code> tenían las siete primeras columnas llenas y las ocho últimas vacías?</summary>

**a)** Porque `evalToRowArray_` construía un arreglo de solo siete elementos.
**b)** Porque `setValues` escribe celda a celda y abortó al llegar a
`snapshot_json`, la octava columna. ✅
**c)** Porque una migración incompleta borró las últimas columnas.
**d)** Porque `evalUpsertRows_` escribe las columnas en dos llamadas separadas.

**b) es correcta.** El corte cae exactamente en `snapshot_json`, que es la columna
8 y la única que excedía el límite. Sheets grabó las anteriores y abortó en ella.

**a) es falsa:** el arreglo se construye siempre con la anchura completa de la
hoja, rellenando con cadena vacía. **c) es falsa:** ninguna migración toca
`Versions`, y las tres filas se corresponden una a una con los tres intentos
fallidos del `AuditLog`. **d) es falsa:** era una sola llamada a `setValues` sobre
el rango completo de la fila.
</details>

<details>
<summary>2. ¿Por qué las etiquetas fueron <code>v1.0</code>, <code>v2.0</code>, <code>v3.0</code> y no <code>v1.0</code>, <code>v1.1</code>, <code>v1.2</code>?</summary>

**a)** Porque publicar siempre sube la versión mayor.
**b)** Porque el snapshot de la versión anterior estaba vacío, se leyó como «no
había versión previa» y el cambio se clasificó como estructural. ✅
**c)** Porque `version_minor` no se escribía por el fallo.
**d)** Porque cada intento usaba un `requestId` distinto.

**b) es correcta.** La clasificación compara el snapshot anterior con el borrador.
Al estar vacío, `evalParseJson_` devolvía `null`, y sin snapshot previo el cambio
se considera estructural, lo que incrementa la mayor y pone la menor a cero.

**a) es falsa:** un cambio no estructural sube solo la menor. **c) es falsa:**
`version_minor` es la columna 4 y sí se escribió, con valor 0. **d) es falsa:** el
`requestId` gobierna la idempotencia, no la numeración de versiones.
</details>

<details>
<summary>3. ¿Por qué la codificación viaja dentro de <code>snapshot_json</code> en lugar de en una columna <code>snapshot_encoding</code>?</summary>

**a)** Porque `Versions` ya tiene el máximo de columnas permitido.
**b)** Porque una columna nueva haría que `evalHeaderMap_` lanzara `SCHEMA_ERROR`
y tumbaría el despliegue vivo hasta ejecutar la migración. ✅
**c)** Porque así el checksum se puede calcular sobre el texto comprimido.
**d)** Porque gzip exige que el marcador esté en el mismo campo.

**b) es correcta.** `evalHeaderMap_` exige que estén todos los encabezados
esperados y lanza `SCHEMA_ERROR` si falta uno. Publicar el código nuevo antes de
migrar el libro habría roto todas las lecturas de `Versions`.

**a) es falsa:** Sheets admite miles de columnas. **c) es falsa y además al
revés:** el checksum se calcula deliberadamente sobre el JSON **en claro**.
**d) es falsa:** gzip no impone nada sobre dónde se guarda el marcador.
</details>

<details>
<summary>4. Una evaluación con <code>scoring_mode = "exact"</code>, <code>max_points = 5</code> y todas sus opciones con <code>score_value = 0</code>. ¿Qué nota saca quien acierta 11 de 20?</summary>

**a)** 0, porque todas las opciones valen cero.
**b)** 55. ✅
**c)** 100, porque `max_points` es 5 en las veinte.
**d)** Queda pendiente de revisión manual.

**b) es correcta.** El modo `exact` califica por `is_correct`, no por
`score_value`, y la nota es aciertos ÷ preguntas calificables × 100 = 11 ÷ 20 ×
100 = 55. Aprueba con el mínimo de 51. Hay una prueba que lo fija.

**a) es la trampa:** `score_value` solo interviene en los modos `partial` y
`per_option`. Precisamente por eso el diagnóstico avisa con `ZERO_SCORE_VALUES`
**solo** en esos modos. **c) es falsa:** `max_points` no altera la fórmula del
MVP, que pesa igual todas las preguntas. **d) es falsa:** la opción única y la
múltiple son de calificación automática.
</details>

<details>
<summary>5. Se vuelve atrás el código <code>.gs</code> a una versión de junio de 2026, manteniendo el libro actual. ¿Qué pasa con una evaluación publicada con el código nuevo?</summary>

**a)** Nada: el formato es compatible en las dos direcciones.
**b)** El portal responde `NOT_FOUND` porque la versión antigua no entiende
`EVALGZ1:`, aunque no se pierde ningún dato. ✅
**c)** El libro se corrompe y hay que restaurarlo del historial.
**d)** El backend responde `SCHEMA_ERROR` porque falta una columna.

**b) es correcta.** La compatibilidad es solo hacia atrás: el código nuevo lee los
snapshots antiguos, pero el antiguo no reconoce el prefijo. `evalParseJson_`
devolvería `null`, `evalLoadVersionSnapshot_` daría `null` y el llamador responde
`NOT_FOUND`. Los datos siguen intactos: basta volver a poner la versión nueva o
republicar. Está documentado en la §14 de la guía operativa.

**a) es falsa:** solo una de las dos direcciones funciona. **c) es falsa:** nada
se borra ni se sobrescribe. **d) es falsa:** justamente por eso se evitó añadir
columnas; los encabezados no cambian.
</details>
