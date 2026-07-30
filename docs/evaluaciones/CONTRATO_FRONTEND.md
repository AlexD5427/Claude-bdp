# Contrato del módulo de Evaluaciones — documentación para otra IA o frontend

> **Léeme antes de escribir una sola línea contra este módulo.** Este documento es
> la fuente de verdad del contrato. Si algo aquí contradice al código, el código
> gana y este documento es un error que hay que corregir.

Versión del backend: **2.0.0** · esquema de hojas: **2** · snapshot: **2** ·
texto enriquecido: **1**

---

## 1 · Mapa de piezas

| Pieza | Dónde vive | Qué hace |
| --- | --- | --- |
| Backend | `apps-script/evaluaciones/*.gs` | Toda la lógica, la calificación y la persistencia. Es la única autoridad. |
| Libro de cálculo | Google Sheets (independiente del ATS) | Almacenamiento. Se instala y se repara solo. |
| Cliente del ATS | `src/features/evaluaciones/` | Autoría, resultados y runner de referencia. |
| Arnés de pruebas | `scripts/evaluaciones-backend.mjs` | Ejecuta los `.gs` en Node con un `SpreadsheetApp` simulado. |

Reglas invariantes:

1. **El servidor manda.** El navegador nunca calcula una nota, nunca decide un
   estado y nunca ve una clave de respuesta.
2. **La clave de respuestas jamás sale.** La proyección pública se construye
   campo por campo (`13_Public.gs`) y hay una prueba que serializa el payload y
   comprueba que no aparezcan `correcta`, `claveEmparejamiento`,
   `respuestaEsperada`, `puntajeAprobacion`, `notasInternas`, `modoPuntaje` ni
   `retroalimentacion`.
3. **El reloj es del servidor.** El límite se calcula al iniciar el intento y se
   recalcula en cada latido y en cada guardado.

---

## 2 · Transporte

Un solo endpoint: la URL `…/exec` del despliegue del Web App.

```http
POST https://script.google.com/macros/s/…/exec
Content-Type: text/plain;charset=utf-8
```

```json
{
  "accion": "startAttempt",
  "solicitudId": "req_9f2c…",
  "cliente": "cli_a1b2…",
  "actor": "ana@banco.example",
  "llaveAdmin": "solo en acciones administrativas",
  "payload": { }
}
```

Tres reglas que **hay que** cumplir:

| Regla | Por qué |
| --- | --- |
| `redirect: "follow"` | Google responde 302 al Web App; sin seguirlo la llamada falla con 404. |
| `Content-Type: text/plain;charset=utf-8` | Un Web App no puede contestar el *preflight* de CORS que dispara `application/json`. |
| `solicitudId` único por intención, y el MISMO al reintentar | Es lo que hace la escritura idempotente. |

Las lecturas también admiten `GET` con parámetros sueltos:

```
GET …/exec?accion=openAssessment&codigo=EV-RIES-4F2A
```

### Envoltorio de respuesta

Siempre esta forma, también en los errores:

```json
{
  "ok": true,
  "accion": "startAttempt",
  "solicitudId": "req_9f2c…",
  "datos": { },
  "error": null,
  "avisos": ["SOLICITUD_REPETIDA"],
  "meta": {
    "traza": "tz_7a1b…",
    "horaServidor": "2026-07-30T21:40:12.004Z",
    "milisegundos": 214,
    "backend": "2.0.0",
    "esquema": 2,
    "textoEnriquecido": 1,
    "modoAuth": "llave",
    "instalado": true,
    "contadores": { "sheetsRead": 3, "rowsRead": 41, "rowsWritten": 5, "cacheHits": 0 }
  }
}
```

Cuando `ok` es `false`:

```json
{
  "error": {
    "codigo": "CONFLICT",
    "mensaje": "Otra sesión guardó esta evaluación después de que la abriste (revisión 7, la tuya es la 5).",
    "pista": "Vuelve a cargarla para no perder el trabajo de la otra sesión, o confirma que quieres sobrescribirlo.",
    "detalle": { "revisionBase": 5, "revisionActual": 7, "puedeForzar": true },
    "traza": "tz_7a1b…"
  }
}
```

**No descartes `pista`, `detalle` ni `traza` al cruzar tu frontera.** La pista es
lo que convierte un error en una instrucción; la traza permite encontrar la
entrada exacta del diario en la hoja `Registro`.

Códigos: `BAD_REQUEST`, `UNSUPPORTED_ACTION`, `VALIDATION_ERROR`, `NOT_FOUND`,
`CONFLICT`, `FORBIDDEN`, `RATE_LIMITED`, `NOT_INSTALLED`, `SCHEMA_ERROR`, `BUSY`,
`EXPIRED`, `INTERNAL_ERROR`.

En `VALIDATION_ERROR`, `detalle.issues` trae los hallazgos con su ruta:

```json
{ "code": "SIN_CLAVE", "message": "…", "path": "preguntas.pr_a1.respuestaEsperada", "details": {} }
```

---

## 3 · Autorización

Dos superficies y una sola idea por superficie.

**Administración** (crear, guardar, publicar, ver resultados): se envía
`llaveAdmin`, que es el valor de la propiedad `EV_ADMIN_KEY` del script. Si esa
propiedad no existe, el backend opera en modo abierto y lo anuncia con el aviso
`ADMIN_SIN_LLAVE` en cada respuesta y con un hallazgo de severidad alta en el
diagnóstico. **Nunca hay un modo insegura y silencioso.**

**Candidato**: no hay cuentas. `startAttempt` devuelve un `token` firmado (HMAC)
ligado a ese intento; `saveProgress`, `heartbeat` y `submitAttempt` lo exigen. El
token no vale para otro intento y no se puede fabricar sin el secreto del script.

Acciones del candidato (nunca envíes la llave desde su navegador):
`openAssessment`, `startAttempt`, `heartbeat`, `saveProgress`, `submitAttempt`.

---

## 4 · Acciones

### Administrativas

| Acción | Tipo | `payload` mínimo | Devuelve |
| --- | --- | --- | --- |
| `ping` | lectura | — | estado, versión, instalación, autorización |
| `diagnose` | lectura | `{ profundo?: boolean }` | hallazgos con severidad y remedio |
| `install` / `repair` | escritura | — | acciones aplicadas + informe del esquema |
| `listEvaluations` | lectura | `{ buscar?, estados?, incluirPapelera? }` | `{ items, total, sincronizadoEn }` |
| `getEvaluation` | lectura | `{ id }` | `{ evaluacion, secciones, versiones }` |
| `createEvaluation` | escritura | `{ titulo, categoria }` | documento completo |
| `saveEvaluation` | escritura | `{ id, revisionBase?, forzar?, evaluacion, secciones }` | documento completo |
| `duplicateEvaluation` | escritura | `{ id, titulo? }` | documento de la copia |
| `publishEvaluation` | escritura | `{ id, notas? }` | `{ documento, version, enlacePublico, advertencias }` |
| `transitionEvaluation` | escritura | `{ id, transicion }` | documento completo |
| `relaunchEvaluation` | escritura | `{ id, ventanaInicio?, ventanaFin? }` | documento completo |
| `rollbackEvaluation` | escritura | `{ id, versionId }` | documento completo |
| `deleteEvaluation` | escritura | `{ id }` | `{ id, estado: "papelera" }` |
| `purgeEvaluation` | escritura | `{ id, confirmacion: "ELIMINAR" }` | conteos de lo borrado |
| `listAttempts` | lectura | `{ evaluacionId, estados?, buscar?, soloRiesgo? }` | `{ evaluacion, intentos, resumen }` |
| `getAttempt` | lectura | `{ intentoId }` | intento + respuestas + eventos + cronología |
| `exportAttempt` | lectura | `{ intentoId }` | paquete listo para el informe |
| `gradeAnswer` | escritura | `{ intentoId, preguntaId, puntos, comentario?, forzar? }` | nota y veredicto recompuestos |
| `annulAttempt` | escritura | `{ intentoId, motivo?, restablecer? }` | estado nuevo |
| `listLogs` / `getMetrics` / `pruneLogs` | — | — | diario y métricas |

Transiciones válidas: `pausar`, `reanudar`, `cerrar`, `archivar`, `restaurar`,
`despublicar`. Una transición imposible responde `CONFLICT` con
`detalle.estadosValidos`.

### Del candidato

```
openAssessment  { codigo }
  → { codigo, disponible, motivo, mensaje, titulo, instrucciones, duracionMinutos,
      totalPreguntas, participante:{campos,…}, integridad, tema, horaServidor }
    NO trae preguntas: para leer la prueba hay que iniciar el intento.

startAttempt    { codigo, participante:{nombre,documento,…}, consentimiento? }
  → { intentoId, token, retomado, horaServidor, iniciadoEn, limiteEn,
      segundosRestantes, respuestasPrevias, prueba }

heartbeat       { intentoId, token }
  → { estado, horaServidor, limiteEn, segundosRestantes, expirado }

saveProgress    { intentoId, token, respuestas[], eventos[] }
  → { guardadoEn, respuestasGuardadas, segundosRestantes, expirado }

submitAttempt   { intentoId, token, respuestas[], eventos[], automatico }
  → resultado según `visibilidadResultado`
```

`motivo` de indisponibilidad: `no_publicada`, `pausada`, `cerrada`,
`no_disponible`, `sin_version`, `aun_no_abre`, `ventana_cerrada`.

Si el candidato vuelve a abrir el enlace con un intento en curso, `startAttempt`
devuelve `retomado: true` con el MISMO `intentoId`, su tiempo restante real y sus
`respuestasPrevias`. **Recargar no reinicia nada.**

---

## 5 · Formato del valor de respuesta, por forma

El calificador del servidor espera exactamente esto:

| Forma | Tipos | `payload` de la respuesta |
| --- | --- | --- |
| `opcion` | `opcion_unica`, `desplegable`, `verdadero_falso`, `si_no_na`, `casilla_aceptacion`, `opcion_imagen` | `{ opciones: ["op_a"] }` |
| `opciones` | `opcion_multiple` | `{ opciones: ["op_a","op_b"] }` |
| `texto` | `texto_corto`, `texto_largo`, `correo`, `telefono`, `enlace`, `codigo` | `{ valor: "texto" }` |
| `numero` | `numero`, `decimal`, `porcentaje`, `moneda`, `duracion` | `{ valor: 1250.5 }` |
| `escala` | `escala_lineal`, `estrellas`, `deslizador` | `{ valor: 4 }` |
| `fecha` / `hora` | `fecha`, `hora`, `fecha_hora` | `{ valor: "2026-07-30" }` |
| `matriz` | `cuadricula_opcion`, `likert` | `{ valor: { "op_fila1": "Alto" } }` |
| `matriz` múltiple | `cuadricula_casillas` | `{ valor: { "op_fila1": ["A","B"] } }` |
| `orden` | `ordenar` | `{ valor: ["op_3","op_1","op_2"] }` (el orden elegido) |
| `emparejamiento` | `emparejar` | `{ valor: { "op_a": "clave elegida" } }` |
| `clasificacion` | `clasificar` | `{ valor: { "op_a": "Grupo A" } }` |
| `huecos` | `rellenar_huecos` | `{ valor: { "h1": "corriente", "h2": "liquidez" } }` |
| `archivo` | `archivo_enlace` | `{ valor: "https://…" }` |

Campos opcionales por respuesta: `segundos`, `visitas`, `cambios`. Cualquier
`correcta`, `puntosObtenidos`, `nota` o `aprobado` que envíes **se descarta**.

El catálogo completo con los 39 tipos está en `08_Types.gs` (servidor) y en
`src/features/evaluaciones/domain/questionTypes.ts` (cliente). Una prueba compara
ambos: si añades un tipo, añádelo en los dos.

---

## 6 · Texto enriquecido

Todos los campos con formato (enunciados, ayudas, instrucciones, descripciones de
sección, textos de opción) usan este modelo:

```json
{
  "v": 1,
  "b": [
    { "t": "p", "s": [
      { "x": "El cliente presenta " },
      { "x": "mora de 45 días", "m": ["b"] },
      { "x": " según la norma", "l": "https://banco.example/norma" }
    ] }
  ]
}
```

- Bloques (`t`): `p`, `h1`, `h2`, `h3`, `ul`, `ol`, `quote`, `code`.
- Marcas (`m`): `b` negrita, `i` cursiva, `u` subrayado, `s` tachado, `c` monoespaciado.
- Enlaces (`l`): solo `http`, `https` y `mailto`. Cualquier otro esquema se
  descarta en el servidor **y** en el cliente.

**Cómo renderizarlo (obligatorio):** recorre bloques y fragmentos y compón nodos.
**No uses `innerHTML` ni `dangerouslySetInnerHTML`.** El modelo se diseñó para que
renderizarlo fuera seguro sin sanear nada; meterlo en HTML tira ese diseño a la
basura. Implementación de referencia:
`src/features/evaluaciones/richtext/RichText.tsx`.

Bloques `ul` y `ol` consecutivos deben agruparse en una sola lista; si no, la
numeración se reinicia y los lectores de pantalla anuncian «lista de un elemento»
una vez por línea.

Cada campo enriquecido se guarda además como texto plano en la columna hermana
(`enunciado_texto`, `instrucciones_texto`…) para que el libro sea legible y
buscable. Ese espejo es de solo lectura: la fuente es el JSON.

---

## 7 · Modelo de datos en el libro

Trece hojas, todas declaradas en `00_Manifest.gs`, que es la fuente única del
esquema. Nunca escribas en el libro directamente: usa las acciones.

| Hoja | Para qué |
| --- | --- |
| `Evaluaciones` | Una fila por evaluación: metadatos, aplicación, integridad, tema. |
| `Secciones` · `Preguntas` · `Opciones` | El borrador, normalizado. Bajas lógicas con `activo = FALSE`. |
| `Versiones` | Metadatos de cada publicación, con huella SHA-256. |
| `VersionesBloques` | El snapshot publicado, troceado en piezas de 40 000 caracteres. |
| `Intentos` · `Respuestas` | Lo que envió cada candidato y su calificación. |
| `Integridad` | Eventos del navegador durante el intento. |
| `Solicitudes` | Registro de idempotencia. |
| `Auditoria` | Quién hizo qué. |
| `Registro` | Diario de diagnóstico, correlacionado por `traza_id`. |
| `Metricas` | Duración y coste de cada acción. |

Añadir un campo = añadir una entrada en `EV_SCHEMA` y ejecutar «Instalar o
reparar». Las columnas nuevas se añaden **al final** y en blanco; los datos
existentes no se mueven. Las columnas que tú añadas a mano se respetan y solo se
informan en el diagnóstico.

---

## 8 · Cosas que se hicieron de una manera concreta y por qué

Si vas a modificar el módulo, estas son las decisiones que no conviene deshacer
sin entender el problema que resuelven.

**Conflictos conscientes del cliente.** `saveEvaluation` acepta `revisionBase`. Si
no coincide con la revisión del servidor pero el último que escribió fue el MISMO
`cliente`, se guarda igual. Solo hay `CONFLICT` cuando escribió otro cliente, y
entonces `detalle.puedeForzar` es `true`. La versión anterior comparaba solo
números y respondía «otro usuario actualizó este registro» al mismo autor en la
misma pestaña, lo que hacía imposible guardar borradores.

**Snapshots troceados, no comprimidos.** Una celda de Sheets admite 50 000
caracteres. La versión anterior guardaba el snapshot en una celda y publicar
fallaba con «error interno» al superarlo. Aquí se trocea en filas y se valida con
una huella al leer. Probado con una evaluación de 306 KB.

**Un solo eje de estado.** `estado` ∈ `borrador · publicada · pausada · cerrada ·
archivada · papelera`. La versión anterior tenía tres campos de estado que podían
contradecirse, y de ahí venía que pausar o cerrar «no hiciera nada».

**Unidad de trabajo sobre Sheets.** Cada hoja se lee una vez por petición y las
escrituras se agrupan en rangos contiguos. Guardar 40 preguntas con 160 opciones
pasa de ~200 llamadas al servicio a 5.

**Ids de tres caracteres como mínimo.** `evIsId_` los exige. Un id de un carácter
es indistinguible de un valor de opción y colisiona con facilidad.

**Los puntos por pregunta SÍ se muestran al candidato.** Son el peso, no la clave.

**Una pregunta cerrada sin clave no se puede publicar** y, si llegara en ese
estado, se marca para revisión humana en lugar de otorgar cero.

---

## 9 · Cómo probar lo que escribas

```bash
npm test                    # 195 pruebas; 159 ejercitan el backend real en Node
npm run backend:check       # comprobación rápida del backend fuera de Vitest
npm run typecheck
```

El arnés (`scripts/evaluaciones-backend.mjs`) ejecuta los mismos archivos `.gs`
que se copian a Apps Script, con un doble de `SpreadsheetApp` que **reproduce a
propósito** el límite de 50 000 caracteres por celda y su modo de fallo. Un doble
más permisivo que la realidad no prueba nada.

Dentro del proyecto de Apps Script hay además una suite propia
(`22_Tests.gs`, menú «Ejecutar pruebas del backend») que corre contra el libro
real y limpia lo que crea.

---

## 10 · Puesta en marcha, en cinco pasos

1. Crea un libro de Google Sheets nuevo, solo para Evaluaciones.
2. Extensiones → Apps Script. Copia los archivos de `apps-script/evaluaciones/`
   respetando el orden numérico y pega `appsscript.json.example` en el manifiesto.
3. Ejecuta el menú **⚙️ Evaluaciones → Instalar o reparar estructura** y después
   **Generar llave de administración**. Copia la llave.
4. Implementar → Nueva implementación → *Aplicación web*: ejecutar «como yo»,
   acceso «cualquier usuario». Copia la URL que acaba en `/exec`.
5. En el ATS: Evaluaciones → Conexión. Pega la URL y la llave y pulsa «Guardar y
   probar».

Si algo no cuadra, el diagnóstico dice qué falta y qué hacer. No hay ninguna
variable de entorno obligatoria y no hay ninguna frase de acceso.
