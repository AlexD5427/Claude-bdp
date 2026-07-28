# Plan y resultados de pruebas

## 1 · Estrategia

Cuatro niveles, cada uno con un propósito distinto:

| Nivel | Qué prueba | Herramienta |
| --- | --- | --- |
| **Backend real** | Los archivos `.gs` que se copian a Apps Script, ejecutados en Node con `SpreadsheetApp`, `LockService`, `PropertiesService`, `Session`, `Utilities` y `ContentService` simulados. | `scripts/run-apps-script.mjs` + Vitest |
| **Dominio** | Reglas puras: publicación, reducer del constructor, versionado, puntuación, lógica, importación. | Vitest |
| **Contratos** | Capa de API: envoltorio, transporte, mapeadores, saneamiento. | Vitest + `fetch` simulado |
| **Interfaz** | Comportamiento observable: estados, navegación, teclado, temas, movimiento reducido. | Testing Library + jsdom |

La decisión clave es la primera: en lugar de reimplementar la lógica del servidor
en TypeScript para poder probarla (dos implementaciones que se desincronizan), el
arnés **carga los `.gs` reales**. Si alguien cambia `ScoringService.gs`, las
pruebas de este repositorio lo notan.

## 2 · Cobertura por requisito

| Requisito de la tarea | Prueba |
| --- | --- |
| Listado real | `EvaluacionesModule.test.tsx › lists seeded assessments` |
| Estado vacío | `› muestra el estado vacío cuando no hay ninguna evaluación` |
| Error de red | `› muestra el error con reintento y vuelve a pedir los datos` |
| Crear evaluación | `› crear abre el constructor con la evaluación nueva`; `appsScript.lifecycle › crea una evaluación en borrador` |
| Guardar borrador | `AssessmentBuilder › pasa a «Cambios sin guardar» … y a «Guardado»`; `appsScript.lifecycle › guarda un borrador INCOMPLETO` |
| Recuperar borrador | `AssessmentBuilder › ofrece recuperar un borrador guardado localmente`; `› permite descartar` |
| Editar borrador | `AssessmentBuilder › permite editar título, duración y nota mínima` |
| Duplicar | `EvaluacionesModule › duplicar pide confirmación y abre la copia`; `appsScript.lifecycle › duplicar genera identificadores nuevos` |
| Archivar | `EvaluacionesModule › archivar pide confirmación explícita`; `appsScript.lifecycle › archiva, bloquea la edición y restaura` |
| Reordenar preguntas | `AssessmentBuilder › reordena preguntas con los botones accesibles`; `builderOptions › normaliza las posiciones` |
| Reordenar opciones | `builderOptions › reordena opciones y mantiene el orden estable` |
| IDs nuevos al duplicar | `builderOptions › duplicar una pregunta genera identificadores nuevos para el bloque Y sus opciones` |
| Normalizar posiciones | `builderOptions › normaliza las posiciones`; `appsScript.lifecycle › normaliza las posiciones`; `api › normaliza las posiciones al construir la carga` |
| Publicación válida | `AssessmentBuilder › publica una evaluación válida tras confirmar`; `appsScript.lifecycle › publica una versión inmutable` |
| Rechazo sin título | `publish › rechaza sin título propio`; `appsScript.lifecycle › rechaza publicar sin título` |
| Rechazo sin preguntas | `publish › rechaza sin preguntas` |
| Rechazo sin texto | `publish › rechaza una pregunta sin enunciado` |
| Rechazo con menos de dos opciones | `publish › rechaza con menos de dos opciones` |
| Rechazo sin respuesta correcta | `publish › rechaza sin respuesta correcta` |
| Rechazo con dos correctas | `publish › rechaza con dos respuestas correctas en un tipo de respuesta única` |
| Duración inválida | `publish › rechaza una duración inválida` |
| Passing score inválido | `publish › rechaza una nota mínima fuera de 0–100` |
| IDs duplicados | `publish › rechaza identificadores … duplicados`; `appsScript.lifecycle › rechaza identificadores duplicados` |
| Conflicto de versión | `appsScript.lifecycle › detecta el conflicto de versión`; `AssessmentBuilder › un guardado en conflicto se anuncia` |
| Prevención de doble clic | `appsScript.lifecycle › no repite el efecto cuando llega dos veces el mismo requestId`; `AssessmentBuilder › el botón de guardar está deshabilitado sin cambios` |
| Protección de publicada | `appsScript.lifecycle › una publicada NO se edita destructivamente` |
| Sanitización pública | `appsScript.sanitization` (9 pruebas); `publicSanitization` (5) |
| Exclusión de borradores del endpoint público | `appsScript.sanitization › un BORRADOR es invisible` |
| Cálculo 100 | `appsScript.scoring › da 100 cuando todas las respuestas son correctas` |
| Cálculo 0 | `› da 0 cuando ninguna respuesta es correcta` |
| Cálculo 66.67 | `› da 66.67 con dos de tres, redondeado a dos decimales` |
| Opción ajena | `› rechaza una opción que pertenece a otra pregunta` |
| Pregunta ajena | `› rechaza una pregunta que no pertenece a la versión anclada` |
| Datos de score manipulados | `› IGNORA el puntaje, la corrección y el aprobado enviados por el cliente` |
| Idempotencia | `› no procesa dos veces el mismo envío`; `appsScript.lifecycle › no repite el efecto` |
| Verificación de encabezados | `appsScript.schema` (6 pruebas) |
| Regresión de otros módulos | 17 pruebas de `features/processes/**` y 8 de `mappers.test.ts`, **sin modificar** |
| Render tema claro | `AssessmentBuilder › renderiza en tema claro y en tema oscuro sin errores` |
| Render tema oscuro | ídem |
| Reduced motion | `› funciona con prefers-reduced-motion activo` |
| Navegación por teclado | `› es navegable con el teclado desde el encabezado hasta el índice` |
| Apertura y cierre de paneles | `› permite contraer y volver a mostrar el índice` |
| Selección de pregunta | `› selecciona una pregunta y muestra su editor con opciones` |
| Vista previa | `› no revela las respuestas correctas en el modo candidato` (+2 más) |
| Panel de revisión | `› lleva del hallazgo al campo exacto que hay que corregir` |
| Cambio de tipo | `builderOptions › cambiar de tipo conserva el enunciado` |
| Persistencia de configuración por tipo | `api › hace un viaje de ida y vuelta sin perder el contenido` |
| Serialización / deserialización | `api › convierte el bundle en el agregado del dominio` + el viaje de ida y vuelta |
| Validación por tipo | `appsScript.typeParity` (8 pruebas) |
| Recuperación desde Apps Script | `api › rechaza un bundle con la forma equivocada`; `› cae en valores por omisión seguros` |
| Estados de carga y error | `EvaluacionesModule` (vacío, error, reintento) |
| Conflicto | `AssessmentBuilder › un guardado en conflicto se anuncia y ofrece reintentar` |
| Evaluación extensa | `AssessmentBuilder › abre una evaluación extensa sin montar todos los editores` |
| No exposición en vista previa pública | `AssessmentBuilder › no revela las respuestas correctas`; `publicSanitization` |
| Limpieza de listeners | `AssessmentBuilder › no deja errores de consola en el flujo completo` (React avisa por consola de fugas y actualizaciones tras desmontar) |
| Ausencia de errores de consola | 4 pruebas asevera `consoleErrors` vacío |

### Cobertura añadida por la refactorización de la autorización

| Requisito | Prueba |
| --- | --- |
| `ping` sigue funcionando sin credencial | `appsScript.authorization › ping funciona sin ninguna credencial`; `adminFlow.e2e › ping sigue funcionando sin sesión` |
| El modo por omisión ya no es `google_identity` | `appsScript.authorization › el modo por omisión es server_secret` |
| Administración sin firma → `FORBIDDEN` | `› una lectura administrativa sin firma se rechaza`; `adminProxy › sin sesión no firma nada` |
| Administración firmada → funciona | `› el ciclo administrativo completo funciona firmado: crear, editar, publicar, archivar` |
| Firma de otro secreto / acción / requestId | `› rechaza una firma hecha con otro secreto` (+2) |
| Credencial caducada o del futuro | `› rechaza una credencial caducada y una del futuro` |
| Repetición de credencial | `› rechaza la repetición de la misma credencial (nonce ya usado)` |
| Esquemas y credenciales inválidas | `› rechaza esquemas desconocidos y credenciales incompletas` |
| Rotación de secreto | `› admite el secreto siguiente para poder rotar sin cortar el servicio` |
| Lista blanca de actores | `› respeta la lista blanca de actores incluso con firma válida` |
| Falla cerrado sin secreto o con secreto corto | `› sin secreto configurado, ninguna operación administrativa pasa`; `› un secreto demasiado corto se trata como no configurado` |
| El rechazo no es un oráculo | `› audita el rechazo con el motivo interno, sin devolvérselo al cliente` |
| `google_identity` intacto | `› google_identity sigue funcionando para quien tenga sesión de Workspace`; `› rechaza cuando Google no expone identidad` |
| `open_admin` sigue exigiendo doble habilitación | `› open_admin exige habilitación explícita y avisa en cada respuesta` |
| Un modo desconocido no abre la puerta | `› un modo desconocido cae en el modo por omisión` |
| `local_execution` no es configurable ni falsificable | `› local_execution NO es seleccionable por configuración`; `› una petición HTTP no puede fingir ser ejecución local` |
| Las funciones del editor siguen operando | `› las funciones del editor sí pueden operar sin firma` |
| Paridad firmante ↔ verificador | `› las tres implementaciones producen la misma cadena canónica y la misma firma` |
| Cookie `HttpOnly` + `Secure` + `SameSite=Strict` | `adminProxy › emite una cookie HttpOnly, Secure y SameSite=Strict` |
| Frase incorrecta indistinguible de vacía | `adminProxy › rechaza una frase incorrecta con el mismo mensaje que una vacía` |
| Ningún secreto en las respuestas del proxy | `adminProxy › nunca devuelve la frase ni el secreto en la respuesta` |
| Origen ajeno rechazado | `adminProxy › rechaza un origen ajeno` |
| Sesión caducada o manipulada | `adminProxy › una sesión caducada o manipulada no vale` |
| El actor lo pone la sesión | `adminProxy › el cliente no puede suplantar a otro` |
| El proxy solo firma acciones administrativas | `adminProxy › solo firma acciones administrativas conocidas` |
| Enrutado público vs. administrativo | `transportRouting` (8 pruebas) |
| Las tres listas de acciones coinciden | `transportRouting › cliente, backend intermedio y Auth.gs declaran exactamente las mismas` |
| Cadena completa sin red | `adminFlow.e2e` (12 pruebas: sesión, crear, editar, conflicto, publicar, API pública saneada, idempotencia, archivar, bitácora, cierre) |
| La interfaz pide la frase cuando hace falta | `EvaluacionesModule › pide la frase de acceso cuando el servidor reclama sesión administrativa` |
| Ningún secreto en el bundle | `npm run build` + `grep` (§4) y las reglas `frontend-importa-backend` / `api-usa-variable-publica` de `npm run check` |

## 3 · Pruebas manuales de extremo a extremo

Requieren el despliegue real (ver `APPS_SCRIPT_SETUP.md`). Recorrido completo:

1. **Configurar.** `configurarEvaluaciones()` →
   `verificarEsquemaEvaluaciones()` responde `ok: true`.
2. **Conectar.** `VITE_ASSESSMENTS_PROVIDER=google-apps-script` y
   `VITE_EVALUATIONS_API_URL=…/exec`. El módulo debe mostrar «Google Apps Script».
2 bis. **Autorización.** Con `EVALUATIONS_ADMIN_SHARED_SECRET` en Apps Script y las
   cuatro variables del backend intermedio en Vercel:
   - `curl ?action=ping` → `adminAuth.configured:true`;
   - abrir el módulo → el listado pide la frase de acceso;
   - frase incorrecta → mismo mensaje que frase vacía, sin sesión;
   - frase correcta → el listado carga y `AuditLog` registra `proxy:<tu correo>`;
   - `POST` directo a `…/exec` con `action=listAdminAssessments` sin `auth` →
     `FORBIDDEN`, y `AuditLog` con `status=denied` y `reason=missing_credential`;
   - esperar a que caduque la sesión (8 h) o borrar la cookie → el módulo vuelve a
     pedir la frase en lugar de mostrar un error sin salida.
3. **Crear.** «Nueva evaluación» → aparece en la hoja `Assessments` con
   `status=draft` y una fila en `Sections`.
4. **Configurar la evaluación.** Título, instrucciones, duración 20, nota mínima 70
   → «Guardar borrador» → el indicador pasa a «Guardado» y las columnas de la hoja
   se actualizan.
5. **Preguntas.** Agregar una de opción única, una de verdadero/falso y una abierta
   → filas en `Questions` y `Options`, con `position` 0,1,2.
6. **Borrador incompleto.** Dejar una pregunta sin enunciado y guardar: **debe
   guardar** (un borrador puede estar incompleto).
7. **Revisión.** Ir a «Revisión»: debe listar el enunciado faltante y llevar al
   campo al pulsarlo.
8. **Recuperación.** Editar sin guardar y recargar la página con F5: el navegador
   avisa; al volver, aparece «Se recuperó un borrador local sin guardar».
9. **Publicar.** Corregir y publicar → fila en `Versions` con `snapshot_json`,
   `checksum` y `gradable_question_count`; `Assessments.status=published`.
10. **Endpoint público.** `curl "URL?action=getPublicAssessment&publicCode=…"` y
    comprobar con `grep` que no aparece ninguna clave de respuesta.
11. **Intento.** `submitAttempt` con dos correctas de tres → `Attempts.score=66.67`,
    tres filas en `Answers`, `grading_status=automatically_graded`. Con la pregunta
    abierta respondida → `pending_manual_review` y `score` vacío.
12. **Idempotencia.** Repetir el `submitAttempt` con el mismo `requestId`: una sola
    fila en `Attempts` y `warnings: ["IDEMPOTENT_REPLAY"]`.
13. **Resultados.** En el módulo, menú de fila → «Resultados»: el intento aparece
    con su nota y su estado de calificación.
14. **Conflicto.** Abrir la misma evaluación en dos pestañas, guardar en la primera
    y luego en la segunda → «Conflicto de versión» con botón de reintento.
15. **Archivar y restaurar.** Archivar → desaparece del endpoint público
    (`NOT_FOUND`); restaurar → vuelve a borrador.
16. **Regresión.** Recorrer Dashboard, Tablero, Cara a Cara, Comparador, Procesos,
    Postulantes, Perfiles, Documentación y Configuración: ninguno debe cambiar.
17. **Limpieza.** `limpiarDatosDePruebaEvaluaciones()` si se trabajó sobre datos
    marcados `[PRUEBA]`.

## 4 · Resultados reales de la última ejecución

Entorno: Node 22.22.0, npm 10.9.4, rama
`claude/auth-evaluaciones-3ab49d36efe680b18d9b00a9685dfc25` (la refactorización de
la capa de autorización). Los resultados de la entrega anterior se conservan más
abajo cuando siguen siendo válidos.

### `npx tsc -b --noEmit` (typecheck)

```
(sin salida — cero errores)
```

### `npm run build`

```
> tsc -b && vite build
vite v5.4.21 building for production...
✓ 2232 modules transformed.
dist/index.html                         1.14 kB │ gzip:   0.60 kB
dist/assets/index-*.css                86.46 kB │ gzip:  14.90 kB
dist/assets/index-*.js                 46.26 kB │ gzip:  11.79 kB
dist/assets/fields-*.js                81.73 kB │ gzip:  23.77 kB
dist/assets/index-*.js                162.35 kB │ gzip:  41.48 kB
dist/assets/three.module-*.js         688.38 kB │ gzip: 177.03 kB
dist/assets/index-*.js                850.35 kB │ gzip: 235.73 kB
✓ built in ~7s
```

#### Impacto medido en el bundle

Comparación real contra `main` (compilado en un *worktree* aparte con las mismas
dependencias):

| Recurso | `main` (gzip) | Esta rama (gzip) | Δ |
| --- | --- | --- | --- |
| CSS | 14,57 kB | 14,90 kB | **+0,33 kB** |
| Entrada de la aplicación | 12,33 kB | 11,79 kB | **−0,54 kB** |
| Chunk principal | 234,92 kB | 235,73 kB | **+0,81 kB** |
| Chunk `fields` (compartido) | 16,46 kB | 23,77 kB | **+7,31 kB** |
| Chunk diferido de Procesos/Evaluaciones | 24,76 kB | 41,48 kB | **+16,72 kB** |
| `three` | 177,03 kB | 177,03 kB | **0** |
| **Total** | **480,07 kB** | **504,70 kB** | **+24,63 kB** |

Lo relevante: **la carga inicial casi no cambia** (+0,33 kB de CSS y +0,81 kB del
chunk principal, con −0,54 kB en la entrada). El peso nuevo (+24 kB comprimidos)
está en los chunks que se cargan **de forma diferida** al abrir Procesos o
Evaluaciones, porque `App.tsx` ya montaba esos módulos con `React.lazy`.

**Sin dependencias nuevas**: `package.json` no añade ni quita ningún paquete; solo
dos scripts (`check` y `visual-qa`). El aviso de «chunks mayores de 500 kB` ya
existía antes del cambio y lo produce `three` junto al chunk principal.

### `npm test`

```
Test Files  27 passed (27)
      Tests  326 passed (326)
```

Desglose de la refactorización de la autorización (todo lo anterior sigue
pasando, sin borrar ni debilitar ninguna prueba):

```
✓ src/features/assessments/__tests__/appsScript.authorization.test.ts  (28)
✓ src/features/assessments/__tests__/adminProxy.test.ts                (16)
✓ src/features/assessments/__tests__/adminFlow.e2e.test.ts             (12)
✓ src/features/assessments/api/transportRouting.test.ts                 (8)
✓ src/features/assessments/ui/EvaluacionesModule.test.tsx               (16, +1)
✓ src/features/assessments/__tests__/appsScript.lifecycle.test.ts       (21, adaptada 1)
```

La única prueba existente adaptada fue «exige requestId en toda escritura», que
ahora firma la credencial para que lo comprobado siga siendo la idempotencia y no
la autorización; y el bloque `apps-script · autorización` de `lifecycle` se movió,
ampliado, a su suite propia.

#### Comprobación de secretos en el bundle compilado

```
$ for t in SHARED_SECRET PANEL_PASSPHRASE SESSION_SECRET adminSecret hmac-sha256; do
    echo "$t: $(grep -ro "$t" dist/assets | wc -l)"; done
SHARED_SECRET: 0
PANEL_PASSPHRASE: 0
SESSION_SECRET: 0
adminSecret: 0
hmac-sha256: 0
```

Desglose:

| Archivo | Pruebas |
| --- | --- |
| `builder/AssessmentBuilder.test.tsx` | 31 |
| `__tests__/appsScript.lifecycle.test.ts` | 25 |
| `domain/publish.test.ts` | 22 |
| `api/api.test.ts` | 21 |
| `builder/builderOptions.test.ts` | 17 |
| `__tests__/appsScript.scoring.test.ts` | 16 |
| `ui/EvaluacionesModule.test.tsx` | 15 |
| `versioning/versioning.test.ts` | 12 |
| `imports/imports.test.ts` | 12 |
| `lib/perfilCargo.test.ts` | 12 |
| `__tests__/appsScript.sanitization.test.ts` | 12 |
| `scoring/scoring.test.ts` | 9 |
| `__tests__/appsScript.typeParity.test.ts` | 8 |
| `mappers/mappers.test.ts` | 8 |
| `builder/builderState.test.ts` | 6 |
| `logic/logic.test.ts` | 6 |
| `__tests__/appsScript.schema.test.ts` | 6 |
| `processes/ui/listState.test.ts` | 6 |
| `content/locale/locale.test.ts` | 5 |
| `mappers/publicSanitization.test.ts` | 5 |
| `processes/application/processService.test.ts` | 4 |
| `processes/domain/process.test.ts` | 4 |
| `processes/ui/ProcesosModule.test.tsx` | 3 |

Las tres últimas pruebas de saneamiento provienen de la revisión de código: dos
cubren la clasificación de acciones (hallazgo F1) y una, el conteo público de
preguntas (F2). Ver [`CODE_REVIEW.md`](./CODE_REVIEW.md).

Línea base antes del cambio: **13 archivos, 89 pruebas**. Las 89 siguen pasando;
ninguna se borró ni se debilitó. Las dos únicas modificaciones a pruebas
existentes fueron adaptaciones obligadas por tipos más amplios:
`assessmentListStore.set({...})` necesita el campo `sort`, y
`EvaluacionesModule.test.tsx` añadió el arranque de permisos de prueba.

### `npm run check`

```
Archivos inspeccionados: 110
· Encabezados verificados contra DATA_MODEL.md: 109
· Archivos .gs declarados: 19
· Documentos presentes: 21

Sin hallazgos. ✔
```

Se añadieron dos reglas: `src/` no puede importar `api/` (el backend intermedio)
y `api/` no puede leer variables `VITE_`. Además, la detección de credenciales
literales dejó de dar falsos positivos con los NOMBRES de variables de entorno y
ahora exige que los datos de prueba se declaren como tales en su propio valor.

### Revisión de código y seguridad

Diez hallazgos confirmados, todos corregidos, dos de ellos con prueba de
regresión propia. El detalle está en [`CODE_REVIEW.md`](./CODE_REVIEW.md).

### `npm run visual-qa`

No ejecutable en este entorno (sin navegador). Ver `VISUAL_QA.md §Limitación`.

### Pruebas del propio Apps Script (`ejecutarPruebasEvaluaciones`)

Ejecutadas a través del arnés en Node; las **quince** líneas devuelven «OK» (las
once originales más cuatro de autorización: modo por omisión, rechazo sin firma,
verificación de firma y acciones públicas anónimas). La misma función está
disponible en el editor de Apps Script para verificar el despliegue real, y una
prueba del repositorio comprueba que no imprime ningún «FALLA».

## 5 · Lint

**El repositorio no tiene ESLint ni Prettier** (verificado: no hay
`eslint.config.*`, `.eslintrc*`, `.prettierrc*` ni script `lint`; los comentarios
`// eslint-disable-next-line` que existen son residuales y hoy no los procesa
ninguna herramienta).

Instalar ESLint produciría cientos de hallazgos en módulos fuera del alcance de
esta tarea, justo lo que las reglas del encargo prohíben. En su lugar:

| Sustituto | Qué cubre |
| --- | --- |
| `npx tsc -b --noEmit` con `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` | El análisis estático principal. |
| `npm run check` (`scripts/check-evaluations.mjs`, sin dependencias) | `TODO`/`FIXME`, funciones vacías, `fetch` fuera del transporte, `any` y `@ts-ignore`, claves de respuesta en la ruta pública, secretos, mocks en producción, encabezados sin documentar, `.gs` sin declarar y documentos faltantes. |

Si el equipo decide adoptar ESLint, conviene hacerlo en un cambio propio que
abarque todo el repositorio, no dentro de esta PR.
