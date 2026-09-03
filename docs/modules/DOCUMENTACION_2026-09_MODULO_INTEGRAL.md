# Módulo de Documentación — reforma integral: catálogo real, hojas físicas, caché y accesibilidad

> Documento explicativo de esta iteración. Está escrito para dos lectores: quien
> nunca tocó el módulo y necesita el mapa completo, y quien ya lo conoce y quiere
> ir directo a lo que cambió. Las secciones marcadas como **Fondo** pueden
> saltarse si ya se domina el sistema.
>
> **Antes de desplegar, lea la sección [Puesta en marcha](#puesta-en-marcha-pasos-manuales).**
> Hay pasos manuales que no se pueden automatizar, incluido uno que exige pegar
> datos a mano en la hoja `Auxiliar`.

---

## Fondo

### El sistema, en una frase

El módulo de Documentación es una consola web que persigue el papeleo de
incorporación de cada persona que entra al Banco de Desarrollo Productivo. No hay
base de datos relacional detrás: hay **una hoja de cálculo de Google** y un
proyecto de **Google Apps Script** que la lee y la escribe. El frontend (React,
desplegado en Vercel) habla con ese Apps Script por HTTP.

> **Concepto clave — dos capas sobre una hoja.** Debajo hay 19 hojas
> «normalizadas» (una fila por hecho: un expediente, un documento, una prórroga).
> Encima, el libro anual `CONTROL INGRESOS <año>` que el área reconoce, con sus
> mismas columnas y colores. El modelo normalizado es la verdad; el libro anual es
> el espejo. Quien prefiere trabajar en Sheets sigue pudiendo.

### Cómo decide el sistema qué documentos pedir

La pieza central es el **catálogo** (`CatalogoDocumentos`) y su **motor de
aplicabilidad** (`doc2Aplicables_`). Cada documento del catálogo declara a qué
`tipo_funcionario` y a qué `tipo_garantia` aplica. Al crear un expediente con una
rama concreta, el backend recorre el catálogo y genera **solo** los requisitos que
aplican. El formulario, la vista, los reportes y las exportaciones preguntan todos
a la misma función: por eso no pueden discrepar.

> **Concepto clave — rama.** Una rama es el par (tipo de funcionario, tipo de
> garantía). `GENERAL + NINGUNA` pide 16 documentos; `COMERCIAL + COMERCIAL_2`
> pide 25. La rama se elige al crear el expediente y determina su contenido.

### De dónde venía este trabajo

La iteración anterior (PR #33) integró el módulo, arregló la conexión, rediseñó
el alta y dejó el catálogo alineado por rama. Quedaron cinco problemas abiertos, y
son los que motivan esta reforma:

1. **El catálogo no era el del área.** Los nombres de los documentos eran
   aproximaciones («Certificado de antecedentes»), no la redacción literal de la
   lista que el área usa. Y faltaban distinciones que en el papeleo importan: qué
   documento se presenta en físico, cuál en digital, y de qué garante es cada
   documento cuando hay dos.
2. **Nadie contaba las hojas.** El área archiva legajos de papel y necesita saber
   cuántas hojas tiene cada documento para cuadrar el archivador con el sistema.
   Eso no existía.
3. **La hoja `Auxiliar` se leía mal.** Los desplegables de agencia y gerencia
   salían incompletos, y añadir un valor nuevo podía **pisar** uno existente.
4. **Abrir un expediente costaba un viaje de red.** Entre uno y tres segundos con
   la pantalla en esqueleto, treinta veces por sesión de revisión.
5. **El contraste no llegaba a AA en varias superficies**, y no había forma de
   saberlo salvo mirando.

---

## Intuición

Esta iteración hace seis cosas. Cada una tiene una intuición corta.

**1 · El catálogo dice lo que dice la lista del área, palabra por palabra.**
Ya no hay traducción. Los 16 documentos generales llevan la redacción literal, en
su orden, y cada uno declara si se entrega en físico, en digital, o depende
(`CONDICIONAL`). Los dos documentos que el área retiró —certificado de trabajo y
RC-IVA— no se borran: se marcan como **retirados**, porque hay expedientes
guardados que los referencian y borrarlos convertiría su historia en huecos.

**2 · Los documentos de garantía se agrupan por a quién pertenecen.** Un
expediente Tipo 2 tiene dos garantes. Antes eso eran diecisiete filas seguidas
donde «Título de propiedad» aparecía dos veces sin decir de quién. Ahora cada
documento lleva su **subsección** —«1 Garante con Bien Inmueble», «2 Garante
Familiar»— y la pantalla, los reportes y el informe las respetan. La subsección
depende de la rama: el mismo documento es «1 Garante con Bien Inmueble» en Tipo 2
y «Postulante con inmueble propio» en Tipo 3.

**3 · Nueve documentos se cuentan por hojas.** Los que se archivan en papel llevan
un contador. Y el contador distingue tres estados que no son lo mismo: *no lleva
conteo* (es digital), *lleva conteo y está en cero* (falta contarlo), y *lleva
conteo con un número*. Esa distinción viaja hasta el Excel y hasta el PDF que se
imprime, porque es la que decide si alguien tiene que ir al archivador.

**4 · La hoja `Auxiliar` es la fuente de los desplegables, y ahora se lee
completa.** Cabecera localizada de forma normalizada (sin acentos ni mayúsculas),
lectura hasta la última fila del libro sin detenerse en huecos, y escritura
**debajo** de la última fila realmente ocupada. Se añade una tercera columna,
`cargo_bdp`, para que el cargo salga del catálogo del banco y no del teclado.

**5 · Un expediente ya visto se abre sin red.** Hay una caché local con
revalidación: se pinta la copia al instante diciendo su antigüedad, se pregunta al
libro por detrás y, si alguien se adelantó, se avisa sin pisar lo que se está
escribiendo. Y lo que se escribe nunca se pierde: hay una cola de salida
persistente con identificador de solicitud, así que reintentar es seguro.

**6 · El contraste se mide, no se estima.** Hay una sonda que recorre el módulo
en los dos temas, mide **cada nodo de texto** contra el umbral de WCAG AA y falla
si alguno no llega. Son unas 2 800 mediciones por ejecución.

---

## Cómo se investigó: un navegador de verdad

Buena parte de lo que se corrigió aquí **no se puede ver en jsdom**. El foco real,
el candado de scroll, el apilamiento de capas, el coste de pintado y el contraste
computado necesitan un navegador. Así que el módulo tiene ahora un arnés compartido
(`qa/doc-arnes.mjs`) que arranca Vite, siembra el backend `.gs` **real** en memoria,
intercepta las peticiones a `script.google.com` para que lleguen a ese backend, y
entra al módulo con sesión iniciada.

Sobre ese arnés hay cinco sondas nuevas:

| Sonda | Qué afirma |
| --- | --- |
| `qa/sonda-contraste.mjs` | Cada nodo de texto de siete pantallas, en los dos temas, cumple WCAG AA |
| `qa/sonda-rendimiento.mjs` | Con CPU estrangulada 4x: tiempo hasta interactivo, coste de desplazamiento, latencia de apertura, milisegundos por tecla, tareas largas por fase, fugas de memoria |
| `qa/sonda-alta-expediente.mjs` | El alta completa, de punta a punta, comprobando en el libro lo que quedó y contando las llamadas |
| `qa/sonda-modal-expediente.mjs` | La ventana del expediente: foco atrapado y devuelto, apilamiento, veinte ciclos sin dejar basura, el guardado no miente |
| `qa/sonda-cache-expedientes.mjs` | Precarga en lote, apertura instantánea, conflicto de versión, backend caído, vaciado de caché |

Playwright **no** está en las dependencias del proyecto a propósito: son 150 MB de
navegador que no tienen por qué entrar en el `npm ci` de Vercel. Se instala aparte
(`npm i -D playwright && npx playwright install chromium`).

> **Nota sobre el entorno de medición.** En un Chromium sin ventana,
> `requestAnimationFrame` va a 4-5 Hz **incluso sin estrangular la CPU**. Por eso
> la sonda de rendimiento no afirma nada sobre fotogramas por segundo: solo los
> informa. Sus afirmaciones son sobre **trabajo** (milisegundos de tarea) y sobre
> **proporciones**, que es lo que sí se conserva de una máquina a otra.

### Ocho fallos que las sondas encontraron y que ninguna prueba en jsdom habría visto

Vale la pena listarlos, porque son la justificación de que las sondas existan:

1. **El foco robado al abrir una superficie.** `querySelector` con una lista de
   selectores separados por comas devuelve el primer elemento en **orden de
   documento**, no el del primer selector. El botón de cerrar de la cabecera
   ganaba siempre, y quien empezaba a escribir de inmediato perdía los primeros
   caracteres.
2. **La confirmación enterrada.** `Confirmacion` tenía `z-index: 110` y la hoja
   del expediente `120`: «Cerrar y descartar» estaba en pantalla y no se podía
   pulsar.
3. **La apertura del expediente en 1 336 ms** con CPU 4x. Memoizar el árbol de
   secciones, mover la animación de las filas a CSS y pintar la ventana en dos
   tiempos lo dejó en 691 ms.
4. **El modo ligero no ahorraba nada.** Se le quitaba el desenfoque a `.glass` y
   se le dejaba la sombra de 30 px de difusión; y la cabecera pegajosa de la
   tabla —diez celdas con `blur(8px)` fijas sobre contenido que se desplaza, el
   caso más caro que existe— no estaba en ninguna de las dos listas. Medido tras
   arreglarlo: el coste de un recorrido de desplazamiento pasa de **1 046 ms a
   590 ms**.
5. **La reconciliación de versión no se disparaba nunca en el caso real.**
   Comparaba `version_registro` de la cabecera del expediente, y marcar un
   documento como entregado bumpea la versión del **requisito**, no la de la
   cabecera. El aviso «otra persona modificó este expediente» estaba
   correctamente programado y era inalcanzable en la práctica.
6. **El módulo se caía si se montaba sin `ThemeProvider`.** Lo destapó la sonda
   visual, que monta el módulo suelto.
7. **Devolver el foco a `<body>` lo borra.** Cuando la hoja se monta ya abierta,
   nadie tenía el foco, así que lo capturado como «quien la abrió» es el `body`;
   llamar a `body.focus()` al cerrar **eliminaba** el foco activo. La rama pensada
   para no perder el sitio era justamente la que lo perdía.
8. **`GaugeInput` se comía el primer dígito.** Seleccionaba todo el texto al
   recibir el foco dentro de un `requestAnimationFrame`; con la máquina cargada
   ese fotograma llegaba después de la primera tecla, la selección caía sobre el
   dígito ya escrito y el siguiente lo reemplazaba. Una nota de 77 quedaba en 7.
   Este está en el módulo de Registro, no en Documentación: apareció porque la
   suite nueva cargó la máquina lo suficiente para hacerlo visible.

> **Concepto clave — el patrón común.** Los fallos 1, 7 y 8 son el mismo error con
> tres disfraces: **cualquier cosa que mueva el foco o la selección con retardo
> compite con el teclado de la persona, y el teclado gana la carrera en las
> máquinas lentas**, que son justamente donde importa.

---

## El código, sección por sección

### 1 · El catálogo, reescrito con la lista del área (backend)

`11_Domain.gs` sube `DOC2_CATALOGO_VERSION` a 3 y reescribe la semilla: 39
entradas (37 vigentes + 2 retiradas). Cada documento gana cuatro campos:

```javascript
{
  codigo: 'antecedentes-felcc',
  nombre: 'Certificado de Antecedentes Policiales FELCC (original, vigencia 6 meses)',
  presentacionFisica: 'SI',
  presentacionDigital: 'NO',
  requiereConteoHojas: true,
  subseccion: ''
}
```

La subsección puede ser un texto o **un mapa por rama**, porque el mismo documento
cambia de bloque según el tipo de garantía:

```javascript
{
  codigo: 'garante-inmueble',
  subseccion: {
    COMERCIAL_2: '1 Garante con Bien Inmueble',
    COMERCIAL_3: 'Postulante con inmueble propio'
  }
}
```

Una sola función resuelve esa forma para todos los consumidores:

```javascript
/**
 * Acepta las dos formas —texto único o mapa por tipo de garantía— y devuelve
 * cadena vacía cuando el requisito no pertenece a ninguna. Es la función que usan
 * el asistente, la vista del expediente, los reportes y las exportaciones: si
 * cada uno lo resolviera a su manera, el mismo documento acabaría bajo dos
 * títulos distintos.
 */
function doc2ResolverSubseccion_(valor, tipoGarantia) { … }
```

**Los retirados no se borran.** `cert-trabajo` y `rc-iva` llevan `retirado: true`:
no se siembran en expedientes nuevos, pero los expedientes viejos que los tienen
los conservan con su estado y su historia. `20_Migrations.gs` lo respeta
explícitamente (`doc2AportaDato_`): un requisito retirado que el expediente sí
tenía no se toca.

Recuentos, verificados en las tres capas (backend, frontend y `doc:check`):

| Rama | Requisitos |
| --- | --- |
| General | 16 |
| Comercial Tipo 1 | 21 |
| Comercial Tipo 2 | 25 |
| Comercial Tipo 3 | 21 |
| Auditoría | 17 |
| Cumplimiento | 19 |

### 2 · Hojas físicas: el dato que cuadra el archivador (backend + frontend)

Nueve documentos llevan contador: antecedentes FELCC, REJAP, título legalizado,
seguro de accidentes, seguro de vida, impedimento de auditor, declaración jurada de
prohibiciones, LGI-FT y examen de la UIF. La validación vive en un solo sitio:

```javascript
function doc2ValidarHojasFisicas_(valor, fila) {
  var def = doc2CatalogoItem_(fila.codigo_documento);
  if (!(def && def.requiere_conteo_hojas === true)) {
    throw docError_(DOC_CODE.VALIDATION_ERROR,
      'El requisito "' + doc2NombreRequisito_(fila) + '" no lleva conteo de hojas.', …);
  }
  // …entero, sin decimales ni signos, máximo 999.
}
```

El tope de 999 no es arbitrario: un dedo pegado en el teclado que escriba 99 999
hojas contamina los totales del libro anual con cifras que nadie puede explicar.

En el frontend, `ui/ContadorHojas.tsx` es un `input` de tipo **texto**, no
`number`. Un `type="number"` cambia de valor al hacer scroll con el puntero
encima, y en una lista de veinticinco documentos eso es una forma silenciosa de
corromper datos.

La distinción de tres estados llega hasta el final. En el informe mensual:

```ts
// `null` y no `0` cuando el documento no lleva conteo. Un cero se lee como «cero
// hojas», que es una afirmación; `null` es «esta columna no le aplica», que es la
// verdad.
hojasFisicas: r.requiereConteoHojas ? (r.hojasFisicas ?? 0) : null,
```

Y en el HTML que se imprime, un documento entregado que lleva conteo y está en
cero sale marcado **«sin contar»** en ámbar, porque eso es una tarea pendiente.

### 3 · La hoja `Auxiliar`, arreglada (backend)

Tres fallos distintos, tres arreglos en `12_Data.gs`:

```javascript
// 1. La cabecera se localiza NORMALIZADA: «Agencia BDP», «agencia_bdp» y
//    «AGENCIA  BDP» son la misma columna.
function doc2ClaveCabeceraAuxiliar_(valor) { … }

// 2. Se lee hasta getMaxRows(), sin detenerse en el primer hueco y sin topes:
//    una fila vacía en medio de la lista no es el final de la lista.
function doc2LeerAuxiliarCrudo_(columna) { … }

// 3. Se escribe debajo de la ÚLTIMA FILA REALMENTE OCUPADA de esa columna.
//    Antes se usaba el alto de la hoja, así que añadir una agencia podía pisar
//    un valor existente.
function doc2UltimaFilaDeColumna_(hoja, columna) { … }
```

Y se añade `cargo_bdp` como tercera columna auxiliar. El backend **crea la
cabecera**; los valores los pega el área (ver [Puesta en marcha](#puesta-en-marcha-pasos-manuales)).

La gobernanza (`19_Governance.gs`) gana tres hallazgos nuevos, y uno de ellos con
una decisión deliberada: **`cargo-fuera-catalogo` es siempre una advertencia,
nunca un bloqueo**. Un cargo que no está en la lista es un dato que hay que
revisar, no un motivo para impedir que se registre a alguien que ya empezó a
trabajar.

### 4 · El alta, en una sola llamada (backend + frontend)

Antes el alta eran cuatro viajes: crear el expediente, guardar los requisitos,
crear las prórrogas, releer. Con Apps Script y una red de agencia, eso son entre
cuatro y doce segundos, y cualquiera de los tres últimos podía fallar dejando un
expediente a medias.

`15_Expedientes.gs` acepta ahora todo junto:

```javascript
doc2CrearExpediente_({
  expediente: { … },
  requisitos: [ { codigo, estado, observaciones, hojasFisicas } ],
  prorrogas: [ { codigo, fechaProrroga, motivo } ],
  devolverDetalle: true
}, ctx);
```

Y si algo falla a mitad, `doc2RevertirAltaFallida_` deshace el expediente: es
mejor no tener nada que tener un expediente sin sus requisitos. La sonda cuenta el
tráfico y lo confirma: `crear=1, requisitos.guardar=0, expediente.obtener=1`.

El frontend conserva la ruta antigua como recaída automática, para que un backend
sin actualizar siga funcionando.

### 5 · La caché de expedientes (frontend)

`state/cacheExpedientes.ts`: LRU de 40 entradas en memoria, persistida en
IndexedDB con recaída a `localStorage`. Dos plazos con propósitos distintos:

- **60 segundos** — la copia se considera fresca y se muestra sin revalidar.
- **24 horas** — la copia sigue sirviendo para consultar y exportar sin backend.

La revalidación silenciosa compara un sello que incluye **la suma de las versiones
de los requisitos**, no solo la versión de la cabecera:

```ts
/**
 * ── Por qué no basta `version_registro` de la cabecera ──────────────────────
 * Era lo que esta función comparaba al principio, y en una prueba con el backend
 * real quedó claro que casi nunca salta: marcar un documento como entregado o
 * escribir una observación bumpea la versión del REQUISITO, no la de la
 * cabecera. […] Cada versión solo sube, así que la suma solo sube, y cualquier
 * cambio en cualquier documento la mueve.
 */
function selloRequisitos(detalle: ExpedienteOperativo): number { … }
```

Y el mensaje es honesto: solo menciona el número de versión si de verdad cambió.
Escribir «versión 2 → 2» convierte un aviso útil en una incoherencia.

`state/precarga.ts` trae los expedientes de la lista visible antes de que nadie los
pida, con cuatro reglas: nunca compite con lo que la persona pide ahora,
concurrencia limitada a dos, en lotes de ocho en **una** llamada
(`documentacion.expedientes.detalle`), y cancelable al navegar.

La primera regla costó una medición para quedar bien:

```ts
/**
 * La precarga se detiene EN EL CLIC, no cuando empieza la lectura.
 *
 * Esta línea sale de una medición, no de una intuición. […] pausar dentro de
 * `cargar` llega tarde. Entre el clic y el primer pintado de la ventana hay
 * cientos de milisegundos en los que React monta la lista de requisitos, y justo
 * ahí la cola de precarga seguía parseando respuestas y escribiendo en IndexedDB.
 */
pausarPrecarga();
```

### 6 · La cola de salida: lo escrito no se pierde (frontend)

`state/salida.ts` guarda cada bloque de cambios con un **identificador de
solicitud** estable que sobrevive a los reintentos, así que reenviar es seguro:
si el cambio ya llegó al libro, el backend reconoce la solicitud y no la aplica
dos veces.

Dos decisiones que merecen texto:

```ts
/**
 * Encolar NO envía.
 *
 * Es deliberado: quien encola decide cuándo enviar y quiere ESPERAR la
 * confirmación para poder decir la verdad en pantalla. Un envío automático aquí
 * haría que la pantalla no supiera si su cambio se confirmó o si lo confirmó otro
 * bombeo, y entonces solo podría decir «se está guardando», que es justo la
 * información que no sirve.
 */
```

```ts
/**
 * Solo se persisten las entradas NO confirmadas. […] Las que estaban `enviando`
 * cuando se cerró la pestaña vuelven a `pendiente`: no sabemos si llegaron, y su
 * `solicitudId` hace que reenviarlas sea seguro.
 */
```

### 7 · La ventana del expediente (frontend)

`ExpedienteLateral.tsx` pasa a llamarse `ExpedienteVentana.tsx` (con `git mv`,
para conservar la historia) porque dejó de ser un cajón lateral. `HojaCentral` es
una superficie central con aire a los lados, curva de entrada de iOS, candado de
scroll con recuento, foco atrapado y devuelto, y confirmación propia —nunca
`window.confirm`, que no se puede leer con un lector de pantalla ni se parece al
resto del sistema—.

El pintado va en dos tiempos:

```tsx
/* Así que se pinta primero el armazón —cabecera, identidad, pestañas, avance— y
   el cuerpo entra en el fotograma siguiente. La ventana aparece de inmediato y la
   lista se completa sin que nadie espere mirando un vacío. */
const [cuerpoListo, setCuerpoListo] = useState(false);
```

### 8 · Contraste y tokens (sistema de diseño)

`design-system/tokens.ts` mueve `INTENT` a variables CSS (`--intent-*`), de modo
que las intenciones cambian con el tema en lugar de estar fijas. En
`documentacion.css` el módulo gana su propia escala de tinta por tema, y aparecen
dos tokens nuevos:

```css
/* El texto de los rellenos sólidos viene de un token POR TEMA: con la tinta
   oscura fija, el botón primario del tema claro daba 3.53:1 (AA exige 4.5). */
--doc-solido-fg
--doc-solido-peligro-fg
```

`design-system/contraste.ts` es el cálculo WCAG puro, con 19 pruebas unitarias, y
es lo que permite que la sonda afirme y no estime.

### 9 · «Esta pantalla»: autodiagnóstico y preferencias (frontend)

`ui/PestanaEstaPantalla.tsx` es nuevo y responde a una pregunta concreta: qué hace
alguien en una agencia cuando algo no funciona, sin consola de JavaScript y sin
acceso a Apps Script. Cinco botones grandes, que son las cinco cosas que se le
pedirían por teléfono:

- **Probar conexión** — ¿el problema es la red, el backend o la pantalla?
- **Volver a sincronizar** — reintenta los cambios que se quedaron en cola.
- **Vaciar caché local** — descarta copias locales sospechosas.
- **Descargar respaldo** — se lleva lo que tiene antes de tocar nada.
- **Recuperar borrador** — vuelve a poner en cola lo que se dio por perdido.

Debajo, la cola de salida se ve con nombre, antigüedad, número de intentos y el
**error exacto** del backend, con dos salidas: reintentar o descartar sabiendo qué
se pierde. El texto de la confirmación de descarte dice literalmente «NUNCA
llegaron al libro» y «habrá que volver a marcarlo a mano», porque eso es lo que
convierte un botón peligroso en una decisión informada.

La pestaña **no tiene condición de permiso**, a propósito: pedir un rol para
agrandar la letra es la clase de detalle que hace que la gente trabaje incómoda
durante años sin decir nada.

Y una nota de arquitectura que costó un rato ver: la **densidad** ya vivía en
`state/consola.ts` desde antes. El panel la lee de allí y no de las preferencias
nuevas, porque dos claves persistidas para el mismo ajuste dan el resultado
clásico de que la pantalla y el panel muestran valores distintos.

### 10 · El modo ligero, y por qué no apaga la precarga

`state/preferencias.ts` tiene `modoLigero` con tres estados (`auto`, `si`, `no`) y
una decisión que la primera versión tenía mal:

```ts
/**
 * ── Por qué esto NO es el modo ligero ───────────────────────────────────────
 * La primera versión de esto ataba la precarga al modo ligero, y estaba mal. Son
 * dos costes distintos: el modo ligero recorta trabajo de PINTADO —sombras,
 * desenfoques, transiciones—, mientras la precarga gasta RED y cuota de Apps
 * Script. En un equipo lento la precarga es justamente lo que más ayuda, porque
 * abrir un expediente allí es lo que más se nota; apagarla por «modesto» era
 * castigar dos veces a la misma máquina.
 */
export function precargaActiva(prefs = obtenerPreferencias()): boolean { … }
```

Lo que sí apaga la precarga es la señal correcta: el ahorro de datos del sistema
(`navigator.connection.saveData`), que es la persona diciendo explícitamente «no
descargues nada que no te haya pedido».

### 11 · Reportes, exportaciones e informe mensual

Las hojas físicas y la subsección llegan a todo lo que sale del módulo:

- `18_Reports.gs` — el reporte de pendientes/no entregados/observaciones gana
  `Subsección` y `Hojas físicas`; la hoja `Requisitos` de la exportación completa
  gana `Subsección`, `Presentación física`, `Presentación digital` y
  `Hojas físicas`.
- `export/informeMensual.ts` — la hoja `Detalle` gana `Subsección` y
  `Hojas físicas`; la hoja `Resumen` gana el total de hojas por categoría y
  cuántos entregados están sin contar; el HTML de PDF/Word marca los que faltan.

Con una regla de honestidad en las dos capas: la celda queda **vacía** cuando el
documento no lleva conteo. Un 0 en la columna de un documento solo digital se lee
como «no tiene hojas», que es distinto de «esta columna no le aplica».

Y una función única para resolverlo, que lee el **catálogo** y no la semilla:

```javascript
/**
 * Lee el CATÁLOGO, no la semilla: el catálogo es el que se puede editar desde la
 * configuración y es el que manda. Consultar la semilla daría la respuesta
 * correcta el día de la instalación y una respuesta obsoleta a partir del primer
 * cambio.
 */
function doc2PideConteoDeHojas_(codigo) { … }
```

### 12 · La migración

`20_Migrations.gs` añade `4.1.0-hojas-fisicas`: idempotente, con simulación previa
y por lotes. Hace dos cosas y **no** hace una tercera:

- añade las columnas `subseccion` y `hojas_fisicas` a `ExpedienteDocumentos`;
- materializa la subsección de cada requisito según la rama de su expediente;
- **no inventa ningún conteo de hojas.** Todos quedan en cero, que significa «sin
  contar». Rellenarlos con una estimación sería fabricar el dato que el área
  necesita que sea real.

---

## Verificación

### Números medidos

| Métrica | Antes | Después |
| --- | --- | --- |
| Pruebas automatizadas | 626 en 49 archivos | **743 en 56 archivos** |
| Comprobaciones de `npm run doc:check` | 20 | **30** |
| Sondas de navegador | 5 (interacción) | **10** (+ contraste, rendimiento, alta, ventana, caché) |
| `npm run typecheck` | limpio | limpio |
| Chunk `Documentacion` (JS) | 380,1 kB / 97,8 kB gzip | 427,0 kB / 111,5 kB gzip |
| Chunk `Documentacion` (CSS) | 11,8 kB / 3,1 kB gzip | 17,8 kB / 4,3 kB gzip |
| Nodos de texto medidos en contraste | 0 | ~2 800 por ejecución, todos AA |

El chunk crece 47 kB (13,7 kB comprimidos). Es el precio de la caché, la cola de
salida, las preferencias, el panel de autodiagnóstico y el contador de hojas. A
cambio, la apertura de un expediente ya visto deja de costar un viaje de red.

### Rendimiento, con CPU estrangulada 4x y latencia de backend simulada

| Medición | Resultado |
| --- | --- |
| Tiempo hasta interactivo | 3 593 ms (presupuesto 6 000 ms) |
| Primera apertura del expediente (con viaje al backend) | 2 792 ms |
| Segunda apertura, desde la caché | **1 462 ms — 1 330 ms ahorrados** de los 1 600 ms de latencia simulada |
| Milisegundos por carácter tecleado | 206 ms (presupuesto 220 ms) |
| Tarea más larga durante teclado y desplazamiento | 347 ms (presupuesto 350 ms) |
| Tarea más larga al montar la ventana | 388 ms (presupuesto 600 ms) |
| Veinte ciclos de abrir y cerrar | 0 MB de crecimiento, 2 651 nodos |
| Coste de desplazamiento con y sin modo ligero | 1 046 ms → **590 ms** |
| Desenfoques y sombras proyectadas en modo ligero | 11 → 0 y 3 → 0 |

> **Cómo se calibraron esos presupuestos.** Dos de ellos habían quedado mal y se
> corrigieron en esta iteración:
>
> - **La latencia del backend se simula, y escalada.** El backend de las sondas es
>   el `.gs` real pero en proceso: contesta en milisegundos. Sin retardo, la
>   apertura «en frío» no tenía nada de frío y salía igual que la de la caché
>   (1 015 ms contra 1 005 ms). Y el retardo se escala con el factor de
>   estrangulamiento, porque estrangular la CPU multiplica el pintado y deja la
>   red igual, invirtiendo la proporción que existe en producción.
> - **El presupuesto de una interacción continua y el de un montaje son
>   distintos.** Montar una ventana con veintiún requisitos es un trabajo único
>   tras un clic; teclear una letra ocurre cuarenta veces en una frase. Exigirles
>   el mismo máximo hacía fallar la sonda por 7 ms sobre un montaje de 357 ms
>   —unos 89 ms de trabajo real— que nadie percibiría. El presupuesto de montaje
>   son 150 ms de trabajo real, más estricto que el umbral de «buena» respuesta de
>   las métricas web (INP, 200 ms).

### Cómo probarlo a mano

1. **Instale las sondas** (una vez): `npm i -D playwright && npx playwright install chromium`.
   Recuerde **quitar Playwright de `package.json`** antes de subir nada: no debe
   entrar en el `npm ci` de Vercel.
2. `npm run typecheck && npm test && npm run doc:check` — los tres tienen que
   quedar limpios.
3. `npm run build` y luego `node qa/sonda-rendimiento.mjs 4`. La sonda de
   rendimiento **exige** el paquete construido: medir el modo desarrollo es medir
   el compilador, no la aplicación.
4. `node qa/sonda-contraste.mjs`, `node qa/sonda-alta-expediente.mjs`,
   `node qa/sonda-modal-expediente.mjs`, `node qa/sonda-cache-expedientes.mjs`.
5. En el módulo, con el backend real:
   - Cree un expediente Comercial Tipo 2. Compruebe que los requisitos de garantía
     llegan agrupados en «1 Garante…» y «2 Garante…».
   - Anote hojas en el REJAP y guarde. Abra el reporte de pendientes y compruebe
     que la columna `Hojas físicas` trae el número, y que está **vacía** en los
     documentos solo digitales.
   - Abra el mismo expediente dos veces. La segunda tiene que pintarse al
     instante, con el aviso de antigüedad de la copia.
   - Vaya a Configuración › Esta pantalla. Pulse «Probar conexión». Cambie el
     tamaño de la letra y compruebe que el módulo entero escala.
   - Con la pestaña abierta, edite el mismo expediente desde la hoja de cálculo.
     Al recargar tiene que aparecer «Otra persona modificó algún documento de este
     expediente».

---

## Puesta en marcha (pasos manuales)

> **Nada de esto es opcional.** El frontend se despliega solo; el backend de Apps
> Script y la hoja `Auxiliar` no.

### A · Frontend (automático)

Al fusionar la solicitud de extracción, Vercel construye y publica. **No hay
variables de entorno nuevas.** No hay nada que hacer.

### B · Backend de Apps Script (manual, en este orden)

1. Abra el proyecto de Apps Script **de Documentación** (no el del talento).
2. **Pegue los 22 archivos `.gs`** de `apps-script/documentacion/` sobre los
   existentes, uno por uno, respetando los nombres. Guarde.
3. Recargue la hoja de cálculo. En el menú **Documentación**:
   1. **Respaldar** — primero, siempre. Es la marcha atrás.
   2. **Instalar o actualizar modelo** — crea las columnas nuevas
      (`subseccion`, `hojas_fisicas` en `ExpedienteDocumentos`; `subseccion`,
      `presentacion_fisica`, `presentacion_digital`, `requiere_conteo_hojas` en
      `CatalogoDocumentos`) y la cabecera `cargo_bdp` en la hoja `Auxiliar`.
   3. **Simular migración** — muestra qué va a cambiar sin cambiar nada. Léalo.
   4. **Migrar** — aplica `4.1.0-hojas-fisicas`.
4. **Publique una VERSIÓN NUEVA de la implementación.** Este paso se olvida y es
   el que hace que «pegué el código y sigue igual»:
   `Implementar › Gestionar implementaciones › ✎ Editar › Versión: Versión nueva › Implementar`.
   Ejecutar **«Como yo»**, acceso **«Cualquier usuario»**.
5. Copie la URL `…/exec` y péguela en el módulo:
   **Documentación › Configuración › Conexión y esquema › Guardar y probar**.

### C · La hoja `Auxiliar`: un paso que solo puede hacer el área

El backend crea la **cabecera** `cargo_bdp`, pero no puede inventar los valores.

1. Abra la hoja `Auxiliar` del libro.
2. Localice la columna con la cabecera `cargo_bdp` (la crea el paso B.3.2).
3. **Pegue debajo la lista de cargos del banco**, uno por fila, sin filas en
   blanco al principio.
4. Compruebe que `agencia_bdp` y `gerencia_bdp` siguen completas. Si antes
   aparecían truncadas en los desplegables, con el arreglo de lectura deberían
   salir enteras ahora.

Los tres desplegables permiten **añadir un valor nuevo** desde el propio módulo, y
lo escriben debajo de la última fila ocupada de su columna. Ya no pisan nada.

### D · Lista de comprobación posterior

- [ ] Configuración › Conexión y esquema dice **Conectado** y muestra el libro.
- [ ] «Esquema normalizado» marca la versión **5**.
- [ ] Mantenimiento › Diagnosticar no reporta `auxiliar-sin-cabecera`.
- [ ] Un expediente nuevo General trae **16** requisitos; uno Comercial Tipo 2,
      **25**.
- [ ] Los desplegables de cargo, agencia y gerencia traen los valores del libro.
- [ ] El REJAP de un expediente muestra el contador de hojas; la fotografía 4x4,
      no.
- [ ] Un expediente Tipo 2 muestra las subsecciones de los dos garantes.
- [ ] El reporte de pendientes trae las columnas `Subsección` y `Hojas físicas`.
- [ ] Los expedientes anteriores a la migración siguen mostrando sus requisitos
      retirados (certificado de trabajo, RC-IVA) si los tenían.

### E · Reversión, en dos palancas independientes

| Qué salió mal | Qué hacer |
| --- | --- |
| El backend responde mal o no responde | Apps Script › Gestionar implementaciones › Editar › elija la **versión anterior** › Implementar. El frontend nuevo sigue funcionando con el backend viejo: la ruta de alta tiene recaída automática. |
| La interfaz tiene un problema | Revierta la solicitud de extracción en GitHub. Vercel republica la anterior. El backend nuevo atiende también al frontend viejo: las columnas nuevas se ignoran. |
| Los datos quedaron mal | Menú Documentación › **Restaurar respaldo** (el del paso B.3.1). |

Las dos primeras palancas son independientes a propósito: **no hace falta revertir
las dos cosas** para arreglar una.

---

## Alternativas consideradas

### La caché de expedientes: ¿en memoria o en IndexedDB?

| IndexedDB con recaída (elegido) | Solo memoria |
| --- | --- |
| Sobrevive a recargas y a cerrar la pestaña | Se pierde con F5, que es lo que la gente pulsa cuando algo va raro |
| Permite consultar y exportar sin backend | Sin backend, pantalla vacía |
| Hay que versionar el esquema y borrar al cambiar de perfil | Cero riesgo de datos personales en disco |
| API asíncrona y verbosa | Tres líneas de código |

Se eligió IndexedDB porque el caso que hay que defender es una agencia con red
intermitente. El coste —versionado y borrado al cambiar de perfil— es real y está
resuelto: `VERSION_CACHE` descarta lo viejo y `vaciarCache()` se ejecuta al cambiar
de perfil y desde el botón del autodiagnóstico.

### El conteo de hojas: ¿campo por requisito o total por expediente?

| Campo por requisito (elegido) | Un total por expediente |
| --- | --- |
| Se puede cuadrar documento a documento contra el archivador | Solo se puede cuadrar el legajo entero |
| Se sabe QUÉ documento falta contar | Si el total no cuadra, hay que revisar todo |
| Una columna nueva en `ExpedienteDocumentos` y una migración | Una columna en `Expedientes`, sin migración de filas |
| El total se calcula sumando | El detalle no se puede reconstruir |

El motivo decisivo: el área no pregunta «¿cuántas hojas tiene este legajo?», sino
«¿de qué documento me faltan hojas?».

### La subsección: ¿en el catálogo o en el expediente?

| En el catálogo, materializada al crear (elegido) | Calculada al leer |
| --- | --- |
| Los expedientes viejos conservan su agrupación aunque el catálogo cambie | Cambiar el catálogo reagrupa expedientes cerrados |
| Los reportes la leen sin resolver nada | Toda lectura tiene que resolver la rama |
| Necesita una migración para los existentes | Cero migración |

Pesó más la primera fila: un expediente cerrado hace ocho meses no debería cambiar
de forma porque alguien renombre un bloque hoy.

---

## Limitaciones conocidas

- **La sonda de rendimiento no puede afirmar nada sobre fotogramas por segundo**
  en este entorno: el `requestAnimationFrame` de un Chromium sin ventana va a
  4-5 Hz aunque no se estrangule nada. Sus afirmaciones son sobre trabajo y
  proporciones.
- **La migración no rellena los conteos de hojas.** Todos quedan en cero, que
  significa «sin contar». Es una decisión, no una omisión: inventarlos sería
  fabricar el dato que el área necesita que sea real. La consecuencia práctica es
  que, tras migrar, todos los documentos físicos ya entregados aparecerán como
  «sin contar» hasta que alguien los cuente.
- **El modo auditoría no respeta las columnas ocultas.** Es deliberado: es la
  vista que se imprime para demostrar algo, y poder ocultarle columnas sería poder
  producir una prueba incompleta sin darse cuenta.
- **La cola de salida solo cubre los cambios de requisitos.** Es la escritura que
  ocurre cien veces al día; el resto (crear un expediente, decidir una revisión)
  sigue siendo síncrona y con su propio manejo de error.
- **Playwright hay que instalarlo aparte**, y las sondas no corren en integración
  continua. Es un compromiso consciente para no meter 150 MB de navegador en el
  despliegue.

---

## Personas con contexto

- **AlexD5427** — dueño del repositorio; fusionó la arquitectura del módulo
  (PR #31), su rediseño de interfaz (PR #32) y la integración anterior (PR #33).
  Es quien pega los `.gs` a mano en Apps Script, así que conoce el estado real del
  despliegue y es la persona que tiene que hacer los pasos manuales de este
  documento.
- **AlexanderBd** (`harley8@postmodule.com`) — co-autor del backend normalizado:
  `11_Domain.gs`, `12_Data.gs` y `18_Reports.gs` llevan sus commits. Es la persona
  a la que preguntar antes de tocar el catálogo, el motor de aplicabilidad o las
  migraciones, que son los cambios con más radio de impacto del módulo.
- **Alex Jhonson** (`reese.a@axisnimbus.com`) — participó en `design-system/tokens.ts`
  y en los almacenes de `src/lib`. Esta iteración movió `INTENT` a variables CSS y
  añadió `contraste.ts` al sistema de diseño, así que conviene revisar esos dos
  cambios con él antes de extenderlos a otros módulos.

Si va a tocar el catálogo, la aplicabilidad por rama o la migración, hable con los
dos primeros.

---

## Cuestionario

<details>
<summary>1. ¿Por qué el aviso «otra persona modificó este expediente» no se disparaba nunca antes de esta iteración?</summary>

- **A.** El backend no devolvía la versión del expediente.
- **B.** La reconciliación comparaba `version_registro` de la cabecera, y las
  ediciones habituales —marcar un documento, escribir una observación— bumpean la
  versión del **requisito**, no la de la cabecera. ✅
- **C.** El aviso estaba comentado.

La cabecera solo cambia cuando se toca el expediente en sí: el cargo, la agencia,
el estado. Eso es la minoría de las ediciones. El sello nuevo suma las versiones
de los requisitos, que solo suben, así que cualquier cambio en cualquier documento
mueve la suma. Se comprobó con el backend real en `cacheYSalida.test.ts`.
</details>

<details>
<summary>2. Un documento solo digital, ¿qué lleva en la columna «Hojas físicas» del reporte?</summary>

- **A.** Un `0`.
- **B.** Nada: la celda queda vacía. ✅
- **C.** El texto «N/A».

Un 0 afirma que el documento tiene cero hojas, que es distinto de «esta columna no
le aplica». La misma regla vale para el informe mensual, donde el campo es `null` y
no `0`, y para el HTML impreso, donde un documento entregado que **sí** lleva
conteo y está en cero sale marcado «sin contar» en ámbar.
</details>

<details>
<summary>3. ¿Por qué la precarga en segundo plano NO se apaga con el modo ligero?</summary>

- **A.** Por un descuido; debería apagarse.
- **B.** Porque son dos costes distintos: el modo ligero recorta trabajo de
  pintado y la precarga gasta red y cuota de Apps Script. En un equipo lento la
  precarga es justamente lo que más ayuda. ✅
- **C.** Porque el modo ligero no llega al estado, solo al CSS.

La primera versión sí las ataba, y eso castigaba dos veces a la misma máquina:
abrir un expediente es más lento en un equipo modesto, así que traerlo antes es
donde más se nota. Lo que sí apaga la precarga es
`navigator.connection.saveData`, que es la persona pidiendo explícitamente que no
se descargue nada que no haya pedido.
</details>

<details>
<summary>4. ¿Por qué la sonda de rendimiento simula latencia del backend y la escala con el factor de estrangulamiento?</summary>

- **A.** Para que la sonda tarde más y dé tiempo a que React se estabilice.
- **B.** Porque sin latencia la apertura «en frío» no tenía nada de frío y salía
  igual que la de la caché; y porque estrangular la CPU multiplica el pintado
  dejando la red igual, lo que invierte la proporción que existe en producción. ✅
- **C.** Para probar el manejo de tiempos de espera agotados.

Medido: sin retardo, 1 015 ms en frío contra 1 005 ms desde la caché —con la caché
saliendo peor—. Con el retardo escalado (400 ms × factor), la misma comparación da
2 792 ms contra 1 462 ms. También hizo falta vaciar la caché antes de la medición
«en frío»: la precarga ya había traído ese expediente, así que las dos aperturas
usaban la caché.
</details>

<details>
<summary>5. Al cerrar la ventana del expediente, ¿por qué no basta con hacer <code>anterior.current?.focus?.()</code>?</summary>

- **A.** Porque `focus()` puede lanzar en algunos navegadores.
- **B.** Porque `anterior.current` puede ser `document.body` —si la hoja se montó
  ya abierta, nadie tenía el foco— y enfocar el `body` **borra** el foco activo.
  También puede ser un nodo que ya no está en el documento. ✅
- **C.** Porque hay que esperar a que termine la animación de salida.

La rama pensada para no perder el sitio era justamente la que lo perdía: quien
cerraba con Escape se quedaba sin punto de partida para el teclado. Ahora se
comprueba que el destino exista, esté conectado y no sea `body` ni `html`; si no
hay nada sensato a donde volver, no se toca el foco.
</details>

<details>
<summary>6. ¿Por qué el contador de hojas es un <code>input type="text"</code> y no <code>type="number"</code>?</summary>

- **A.** Porque `type="number"` no admite el atributo `inputMode`.
- **B.** Porque un `type="number"` cambia de valor al hacer scroll con el puntero
  encima, y en una lista de veinticinco documentos eso corrompe datos en
  silencio. ✅
- **C.** Porque hay que admitir valores como «12 hojas».

La validación de que es un entero entre 0 y 999 está en el backend
(`doc2ValidarHojasFisicas_`), que es donde tiene que estar. El campo usa
`inputMode="numeric"` para que el teclado del móvil salga numérico, sin heredar el
comportamiento de rueda del control nativo. La sonda de la ventana del expediente
lo comprueba con un scroll real.
</details>
