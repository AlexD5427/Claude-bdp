# Auditoría de estabilidad · Comparador y Postulantes

**Fecha:** agosto de 2026 · **Alcance:** todo el sistema, con foco en los módulos
**Comparador** y **Postulantes** · **Motivo:** un usuario reporta de forma
insistente que «el comparador no funciona» y que «no puede añadir postulantes»,
mientras el resto del equipo no reproduce ninguno de los dos síntomas en varios
dispositivos.

---

## 0 · Veredicto en una página

**El usuario no estaba mintiendo, y no era su computadora.** Los dos síntomas
existían en el código y los dos son *invisibles* para quien usa la aplicación de
otra manera. Esa es exactamente la razón por la que no se reproducían:

| Síntoma reportado | Causa encontrada | Por qué sólo le pasaba a esa persona |
| --- | --- | --- |
| «El comparador no funciona: agrego a uno y ya no me deja agregar más» | El buscador de candidatos abría su lista **sólo** al recibir el foco. Tras agregar a alguien, el componente devuelve el foco al campo; desde ese momento el campo ya estaba enfocado, así que **hacer clic en él no emitía ningún evento `focus`** y la lista no volvía a abrirse nunca. | Quien busca **escribiendo** no lo nota (teclear sí abría la lista). Sólo lo sufre quien **hace clic** en el campo esperando ver la lista —y todo el que usa **pantalla táctil**, donde tocar un campo ya enfocado tampoco emite `focus`. |
| «Registré al postulante y no está» | El alta daba por buena la escritura **sin leer la respuesta del servidor**: si la hoja rechazaba la fila (`{status:"error"}`, que Apps Script devuelve con un `200`), la aplicación decía «Postulante registrado correctamente», borraba el borrador y cerraba el cuestionario. Y si el POST no salía del equipo, insertaba una fila **sólo en memoria** que desaparecía al refresco siguiente. | Depende de que la hoja rechace (identificador repetido, permisos) o de que la red del equipo bloquee el POST (proxy, antivirus, extensión). En un equipo «limpio» nunca se ve. |
| Extra (encontrado, no reportado) | Un **paquete de configuración personal** corrupto —viaja en la hoja `Perfiles_y_Configuracion`, columna `config_personal_perfil`, y se aplica al iniciar sesión— podía dejar `maxComparador` en `0`. El buscador aparecía **deshabilitado** con «Límite alcanzado (0/0)». | Es el vector perfecto del «a mí no me funciona»: al vivir en la hoja, **sigue a la persona a cualquier equipo** en el que entre, mientras el resto del equipo ve el módulo perfecto. |

Los tres están corregidos, con pruebas de regresión que fallan sin la corrección.
Además se cerraron nueve fallos más (detalle en §3) y se blindaron las fronteras
por las que entran datos de la hoja, que es de donde venían dos de los tres.

---

## 1 · Cómo se auditó

No se auditó leyendo: se auditó **ejecutando**. Se levantó un entorno de QA con
navegador real (Chromium vía Playwright) y un **doble del backend**: todas las
llamadas a `script.google.com` se interceptan y responden con una fixture que
reproduce a propósito la suciedad de la hoja real.

```js
// La fixture incluye, deliberadamente:
//  · números como texto ("88") y decimales con coma
//  · JSON dentro de columnas de texto, y JSON mal formado ("{}", "no-es-json")
//  · campos ausentes, nulos y filas casi vacías
//  · tres postulantes EMPATADOS en Nota CAP (para forzar el desempate)
//  · un identificador DUPLICADO
//  · una fila sin identificador
```

Sobre ese entorno se ejecutaron cinco recorridos automatizados:

| Recorrido | Qué comprueba |
| --- | --- |
| `smoke` | Login → alta de postulante → comparación de cuatro personas |
| `deep` | Ranking y desempate, inversión de orden, modo compacto, visor ampliado, visibilidad por fila y por sección, gráficos, edición |
| `responsive` | 390×844 (móvil), 768×1024 (tablet) y 1440×900, en tema claro y oscuro |
| `print` | Emulación de `@media print` + PDF Carta real |
| `modulos` | Los diez módulos del dock, contando errores de consola |

El arnés vive **fuera del repositorio** (Playwright no es una dependencia del
proyecto y no conviene que lo sea sólo para esto): se levanta contra
`npm run dev` o `npm run preview` y todo lo que necesita para reconstruirse está
descrito arriba. Cada recorrido recoge errores de página, avisos de consola y
peticiones fallidas. **Punto de partida:** 259 pruebas verdes, `tsc` limpio… y dos errores
de consola reproducibles en cada carga (claves duplicadas de React).
**Punto de llegada:** 287 pruebas verdes, `tsc` limpio, `build` limpio y **cero**
errores de consola en los diez módulos.

---

## 2 · Los tres fallos que explican el reporte

### 2.1 · El buscador que se quedaba mudo (Comparador)

**Qué hacía el código.** `CandidateSearchSelect` abría la lista de sugerencias
en un único sitio: `onFocus`. Y al elegir a alguien hacía esto:

```ts
function choose(c: Candidate) {
  onAdd(c.id);
  setQuery("");
  setOpen(false);              // cierra la lista para dejar ver la comparativa
  skipOpenOnFocus.current = true;
  inputRef.current?.focus();   // devuelve el foco para escribir el siguiente
}
```

La intención era buena: cerrar la lista para no tapar la comparativa y dejar el
cursor listo. El efecto secundario es lo que rompe el módulo: **el campo se queda
con el foco**. Un `focus` sólo se emite cuando el foco *cambia*, así que el
siguiente clic sobre el campo no emitía nada y `setOpen(true)` no volvía a
ejecutarse jamás. Salidas posibles, ninguna evidente: teclear una letra, pulsar
la flecha abajo, o hacer clic fuera y volver.

**Medido en el navegador, antes de la corrección:**

```
1) clic en el campo               → aria-expanded = true  | sugerencias: 7
2) agrega al primero              → aria-expanded = false | sugerencias: 0
3) VUELVE A HACER CLIC en el campo → aria-expanded = false | sugerencias: 0   ← atrapado
   document.activeElement es el buscador: true
4) si en cambio TECLEA una letra  → aria-expanded = true  | sugerencias: 5
```

En el recorrido automatizado, un bucle que intentaba agregar cuatro personas
lograba agregar **una**.

**La corrección.** La apertura pasa a colgar del **gesto** y no del cambio de
foco, que es la señal correcta: un clic o un toque sobre el campo siempre
significa «quiero ver la lista», tenga el foco donde lo tenga.

```tsx
onPointerDown={() => {
  skipOpenOnFocus.current = false;
  setOpen(true);
}}
```

`onFocus` se mantiene (para llegar por tabulador) y `skipOpenOnFocus` también,
porque el foco *programático* de después de agregar no debe reabrir la lista que
se acaba de cerrar a propósito.

**Después:** `3) VUELVE A HACER CLIC en el campo → aria-expanded = true | sugerencias: 6`,
y el bucle agrega las cuatro personas.

> [!NOTE]
> **La lección, más allá del parche.** `focus` describe un cambio de estado;
> `pointerdown` describe una intención. Cuando un componente se re-enfoca a sí
> mismo, cualquier lógica montada sobre `focus` tiene un punto ciego del tamaño
> exacto de «el usuario repite el gesto». Es el mismo motivo por el que fallaba
> en táctil sin que nadie tocara nada del código táctil.

De paso, cuando se alcanza el máximo de columnas el campo ya no se queda
simplemente deshabilitado: aparece un aviso que explica cómo seguir («quite a
alguien de la lista…»), porque un control apagado sin explicación se lee como una
avería.

### 2.2 · El alta que decía «listo» sin haber guardado (Postulantes)

**Qué hacía el código.**

```ts
await fetch(SCRIPT_URL, { method: "POST", /* … */ });
setRaw((prev) => [candidate, ...prev]);
return { ok: true, message: "Postulante registrado correctamente." };
```

No se leía la respuesta. Con eso, dos escenarios cotidianos terminaban con el
postulante perdido y el analista convencido de haberlo registrado:

1. **La hoja rechaza la fila.** Apps Script contesta
   `{"status":"error","message":"…"}` con un `200`. La aplicación cerraba el
   cuestionario, **borraba el borrador** y felicitaba al analista.
2. **El POST no sale del equipo** (proxy corporativo, antivirus, extensión, red
   caída). El `catch` insertaba la fila **sólo en memoria** y anunciaba que se
   había guardado «localmente». A los sesenta segundos el refresco en segundo
   plano traía la hoja de verdad y la tarjeta desaparecía sin rastro.

Reproducido en el navegador (interceptando el POST):

```
caso=error      · modal aún abierto: false · mensaje: (ninguno) · postulante: perdido
caso=bloqueado  · modal aún abierto: true  · «Se guardó localmente…» · tarjeta fantasma: sí
```

**La corrección.** Toda escritura pasa por `postToSheet`, que:

- **lee el sobre de respuesta** y trata `status !== "success"` como fallo,
  devolviendo el mensaje del servidor;
- distingue un **error HTTP** (`El servidor respondió 500…`);
- impone un **tiempo máximo de 25 s** con `AbortController` (antes un POST colgado
  dejaba el botón en «Guardando…» para siempre);
- marca como `pendiente` el caso en el que la petición salió pero no volvió, que
  es el único honesto: no sabemos si la hoja guardó;
- y **no inserta nada** en memoria si no hubo confirmación.

```ts
if (!res.ok) return { ok: false, message: `El servidor respondió ${res.status}…` };
const data = parseEnvelope(await res.text());
if (data?.status && data.status !== "success") {
  return { ok: false, message: data.message || "El servidor rechazó la operación." };
}
return { ok: true, message: "" };
```

Un despliegue antiguo que responde `200` con el cuerpo vacío se sigue aceptando:
la corrección no rompe compatibilidad hacia atrás.

Al fallar, el cuestionario **permanece abierto**, con lo escrito intacto, el
borrador local sin tocar y el motivo a la vista:

> ⚠ *No se pudo contactar con el servidor. Revise su conexión (o el
> antivirus/proxy de su equipo) y reintente; su avance sigue guardado en este
> equipo.*

Lo mismo se aplicó a la edición de postulantes y a las tres operaciones de
Perfiles de Cargo, que compartían el patrón.

### 2.3 · La configuración que dejaba el módulo apagado

`applyBundle` aplicaba el paquete personal del perfil con `setConfig(...)`, y
`setConfig` no validaba nada. El paquete viene de `localStorage` **o de la hoja**
(`Perfiles_y_Configuracion` → `config_personal_perfil`), y esa celda se edita a
mano. Un `maxComparador: 0` colado por ahí produce esto:

```
placeholder del buscador: «Límite alcanzado (0/0)»
¿habilitado?: false
maxComparador vigente: 0
```

El Comparador queda inservible **para ese perfil, en cualquier equipo**, mientras
el resto del equipo lo ve funcionando. No hay forma de que el usuario lo
explique mejor de lo que lo explicó.

**La corrección** es sanear en la frontera, no en cada consumidor:
`sanitizeConfig` acota los números a su rango usable, descarta lo que no es
número (con cuidado: `Number(null)` es `0`, un valor «válido» inventado de la
nada), valida las opciones cerradas contra su catálogo, exige booleanos en los
interruptores y una lista en la biblioteca de correos. Se aplica en `load()` **y
en cada `setConfig`**, así que ya no queda ningún camino por el que un valor
imposible llegue al estado vivo.

Se blindó también el otro contenido del paquete: `importLayout` no daba por hecho
que cada elemento fuera un objeto (`w.id` sobre un `null` lanzaba **dentro del
inicio de sesión**, lo que habría dejado a ese perfil sin poder entrar), y
`applyBundle` prefiere entrar con las preferencias por omisión antes que no
entrar.

---

## 3 · Los otros nueve fallos

| # | Módulo | Fallo | Efecto observable | Corrección |
| --- | --- | --- | --- | --- |
| 1 | Postulantes / Comparador | **Identificador duplicado** en la hoja: `id` = identificador, así que dos filas producían dos objetos con la misma clave | `Warning: Encountered two children with the same key` en cada carga; React puede **omitir o duplicar** tarjetas; el comparador resolvía las dos columnas al **mismo** expediente; abrir el perfil de cualquiera mostraba el primero | `normaliseCandidates` da un `id` propio a cada repetición (`…#2`) y marca todas las filas implicadas; la interfaz muestra una chapa ámbar **«ID duplicado»** en la tarjeta y en la columna del comparador |
| 2 | Postulantes | Nada impedía **crear** un identificador que ya existía | Se generaban dos expedientes indistinguibles, y una edición posterior escribía siempre sobre el primero | Aviso en vivo bajo el campo mientras se escribe y bloqueo del guardado, con la salida indicada («use Editar…») |
| 3 | Postulantes | La **coma decimal** en Valor Esperado/Obtenido se escribía **directamente en el DOM** de un `input[type=number]` | El navegador rechaza `"3."` por no ser un número válido y **deja el campo en blanco**: teclear la coma borraba el número | La coma se traduce a punto en el estado, que es la única fuente de verdad del campo |
| 4 | Postulantes | El velocímetro convertía la coordenada vertical del puntero con un alto de **120** mientras el `viewBox` medía **116** | Cada clic sobre el dial caía ~3 % más abajo de donde se apuntaba; hasta **1 punto** de desvío cerca de los extremos | Una sola fuente de verdad (`VIEW_W`/`VIEW_H`). Verificado: 5 %, 10 %, 25 %, 50 %, 75 %, 90 % y 95 % ahora dan **exacto** |
| 5 | Postulantes | Una nota puesta por error **no se podía dejar vacía** | Había que cerrar el cuestionario y perder el avance; y un `0` no significa lo mismo que «no evaluado» en la comparativa | Vaciar el campo vuelve el valor a «sin dato» |
| 6 | Global | `Modal` tenía el cierre en las dependencias de su efecto, y los llamadores lo declaran en el cuerpo (identidad nueva por dibujado) | El efecto se desmontaba y montaba **en cada tecla**: quitar y poner el escuchador de teclado y reescribir el `overflow` del `<body>` | El cierre vive en una referencia; el efecto depende sólo de `open`. Además se restaura la posición de la página al cerrar |
| 7 | Comparador | Las celdas de Observaciones recibían un **arreglo nuevo en cada dibujado** (`observationTags` dentro del JSX) | Cada re-dibujado rehacía la medición del desborde y creaba un `ResizeObserver` nuevo **por celda** | El troceo se hace una vez por comparación (`useMemo`) y la medición depende de una **firma** del contenido |
| 8 | Indicadores | `recordCurrent` **reemplazaba** el mes en curso y no comparaba antes de escribir; el tablero y la barra montan los dos el mismo grabador | Dos POST idénticos a Apps Script en cada navegación, sin aportar un dato nuevo | Los valores se **fusionan** y no se escribe ni se envía nada si el mes ya está igual |
| 9 | Global | `useMediaQuery` comprobaba `"matchMedia" in window` | Hay entornos donde la propiedad existe pero **no es invocable**: `window.matchMedia is not a function` tumba la aplicación entera en un solo equipo. Y Safari < 14 sólo tiene `addListener` | Se comprueba `typeof … === "function"` y se acepta la API antigua |

Y tres detalles menores del mismo saco: los `<span>` de Observaciones usaban el
texto como clave de React (las etiquetas repetidas que ya vienen de la hoja
provocaban claves duplicadas, y quitar una borraba todas sus gemelas); el mapa de
referencias del constructor de listas no soltaba los nodos de las filas
eliminadas; y la primera columna de la comparativa era `0.8fr`, de modo que con
dos o tres candidatos se quedaba con **casi la mitad de la pantalla** para
escribir «Nota CAP» (ahora tiene un techo fijo).

---

## 4 · Lo que se revisó y estaba bien

Conviene decirlo con el mismo detalle, porque también es resultado de la
auditoría:

- **El ranking y el desempate son correctos.** Con tres postulantes empatados en
  Nota CAP 88 %, el orden sale por Índice de Desempate y coincide con la
  aritmética documentada: `85.25`, `83.15`, `80.95`. Invertir el orden invierte
  las columnas **sin tocar los puestos** (verificado: la lista invertida es el
  reverso exacto). Quien no tiene Nota CAP queda al final sin romper nada.
- **La normalización aguanta la suciedad de la hoja.** Números como texto,
  decimales con coma, `"{}"`, `"no-es-json, pero-es-lista"`, campos nulos y filas
  vacías: ninguno produce una excepción; el texto libre cae al listado por comas,
  como estaba previsto.
- **La regresión del envío implícito sigue cerrada.** Pulsar Intro en un campo, o
  dentro de un conocimiento técnico, o en el `<select>` de nivel, **no** registra
  la ficha. `Ctrl/⌘+Intro` sí.
- **La edición no pierde lo escrito** cuando la base se refresca en segundo plano,
  y «Guardar Cambios» sigue deshabilitado hasta que hay un cambio real.
- **La impresión está completa.** En papel, las celdas de texto largo se expanden
  (no hay puntero que revele nada), los chips de competencia mantienen Ajuste y
  Brecha, y el PDF Carta sale en tres páginas legibles, con la banderola
  institucional. Verificado generando el PDF real.
- **Los diez módulos** cargan sin un solo error de consola, en el build de
  producción, en tema claro y oscuro, y a 390 px de ancho sin desbordamiento
  horizontal.

---

## 5 · Si el usuario vuelve a reportarlo

Los tres fallos están corregidos, pero dos de ellos podían dejar **rastro** en la
máquina o en la hoja. Si después de este despliegue el síntoma persiste, el
orden de revisión es:

1. **Pedirle una captura del buscador del Comparador.** Si dice «Límite alcanzado
   (0/0)» o «(1/1)», su configuración personal sigue corrupta: entrar a
   *Configuración → Máx. candidatos a comparar* y subirlo, o limpiar la celda
   `config_personal_perfil` de su fila en `Perfiles_y_Configuracion`. Con el
   saneamiento nuevo, el valor imposible ya no puede volver a entrar.
2. **Verificar que el POST sale de su equipo.** Con el cuestionario abierto y las
   herramientas de desarrollo en *Red*, registrar una ficha de prueba: tiene que
   aparecer una petición `POST` a `script.google.com` con estado `200`. Si sale
   `(blocked)`, `failed` o se queda pendiente, el problema es el proxy/antivirus
   de la máquina y no la aplicación —y ahora la propia aplicación lo dice en
   pantalla en lugar de fingir que guardó.
3. **Buscar chapas ámbar «ID duplicado»** en el listado. Si aparecen, la hoja
   tiene filas repetidas: conservar una sola. Mientras existan las dos, editar a
   esa persona escribirá siempre sobre la primera.
4. **Pedirle el navegador y su versión.** El sistema apunta a `es2020`; un
   navegador anterior a 2021 no ejecutará el bundle. El aviso de `matchMedia` que
   se blindó en §3.9 es el tipo de fallo que sólo aparece en un equipo.

---

## 6 · Recomendaciones que quedan fuera de este cambio

Se detectaron y **no** se tocaron, por ser decisiones de producto y no fallos:

- **El filtro universal no alcanza al listado ni al comparador.** La barra de
  filtros (Gerencia / Agencia / Modalidad / Estado / periodo) gobierna los
  indicadores, pero el listado de Postulantes y el pozo de candidatos del
  Comparador leen la base completa. Con un filtro activo se ve «3 candidatos» en
  el indicador y siete tarjetas debajo. Conviene decidir si el filtro debe
  alcanzarlos o si la barra debería ocultarse donde no aplica.
- **La unicidad del identificador debería vivir en el backend.** El aviso nuevo
  evita el duplicado por descuido desde esta interfaz, pero la hoja se edita
  también a mano y desde otros frontends. La comprobación definitiva es del lado
  de Apps Script.
- **`hiring_status` y `kpi_snapshot` se envían sin que el backend los atienda.**
  Son escrituras a ciegas: si algún día se implementan, conviene que devuelvan el
  mismo sobre `{status}` que ya valida `postToSheet`.
- **El bundle sigue por encima de 500 kB.** Se separaron React y Framer Motion en
  sus propios archivos para que un cambio nuestro no invalide un megabyte de
  caché del navegador; el resto exigiría partir el módulo de Evaluaciones, que es
  el chunk grande.

---

## 7 · Verificación final

```
tsc -b --noEmit                → limpio
vitest run                     → 287 pruebas verdes (23 archivos), antes 259
vite build                     → limpio, 11 s
vite preview + recorrido de QA → login, alta y comparación correctos en el
                                 build de producción
10 módulos                     → 0 errores de página, 0 errores de consola
```

Pruebas de regresión añadidas (fallan sin la corrección, comprobado):

| Archivo | Cubre |
| --- | --- |
| `src/components/CandidateSearchSelect.test.tsx` | El buscador reabre al hacer clic con el campo ya enfocado; el foco programático no lo reabre; exclusión de los ya elegidos; filtrado por nombre e identificador; teclado; aviso al alcanzar el máximo |
| `src/context/TalentDataContext.test.tsx` | El alta sólo se confirma con la hoja; error de sobre, error HTTP y fallo de red no pintan filas fantasma; compatibilidad con un `200` sin cuerpo |
| `src/lib/candidates.test.ts` | Identificadores repetidos: `id` único por fila, marca en todas, identificador de negocio intacto |
| `src/lib/configStore.test.ts` | Saneamiento de la configuración: rangos, tipos, catálogos cerrados y retazos vacíos |
| `src/modules/RegistrationForm.test.tsx` | Bloqueo del identificador repetido y cuestionario que sobrevive a un rechazo de la hoja |
