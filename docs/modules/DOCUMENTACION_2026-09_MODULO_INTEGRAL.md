# Módulo de Documentación — rediseño integral: legibilidad, velocidad y el papeleo real del área

> Documento explicativo del trabajo de esta iteración. Está escrito para dos
> lectores: quien nunca tocó el módulo y necesita el mapa completo, y quien ya lo
> conoce y quiere ir directo a lo que cambió. Las secciones marcadas como **Fondo**
> pueden saltarse si ya se domina el sistema.
>
> El trabajo anterior sobre este módulo está en
> [`DOCUMENTACION_INTEGRACION_2026-08.md`](./DOCUMENTACION_INTEGRACION_2026-08.md);
> aquello arregló que el módulo *funcionara*. Esto se ocupa de que se pueda
> *usar*: que se lea, que no se trabe, que abra al instante y que pida lo que el
> área pide de verdad.

## Fondo

### El sistema, en una frase

El módulo de Documentación persigue el papeleo de incorporación de cada persona
que entra al Banco de Desarrollo Productivo. Debajo no hay una base de datos
relacional: hay **una hoja de cálculo de Google** y un proyecto de **Google Apps
Script** que la lee y la escribe. El frontend (React, desplegado en Vercel) habla
con ese Apps Script por HTTP.

> **Concepto clave — dos capas sobre una hoja.** Debajo hay hojas «normalizadas»
> (una fila por hecho: un expediente, un documento, una prórroga). Encima, el
> libro anual `CONTROL INGRESOS <año>` que el área reconoce, con sus mismas
> columnas y colores. El modelo normalizado es la verdad; el libro anual es el
> espejo. Quien prefiere trabajar en Sheets sigue pudiendo.

### Las tres piezas que hay que conocer para leer lo que sigue

1. **El catálogo** (`CatalogoDocumentos`) dice qué documentos existen y a qué
   rama aplica cada uno. Su **motor de aplicabilidad** (`doc2Aplicables_`) recorre
   el catálogo y devuelve los requisitos de una rama concreta. El alta, la ficha,
   los reportes y las exportaciones preguntan todos a la misma función: por eso no
   pueden discrepar.
2. **La hoja `Auxiliar`** guarda las listas de valores del área en columnas:
   `agencia_bdp`, `gerencia_bdp` y —desde esta iteración— `cargo_bdp`. Son los
   desplegables del formulario.
3. **El expediente** es una cabecera (quién es, en qué rama está, cuánto avanza) y
   una lista de requisitos, cada uno con su estado, su observación, su prórroga
   y —desde esta iteración— su **conteo de hojas físicas**.

### De qué se quejaba el área

Cinco frases, textuales, que son el origen de todo lo que sigue:

- «no se ve nada, las letras se pierden en el fondo»;
- «se traba al bajar por la lista» y «escribir va con retraso»;
- «abrir un expediente tarda una eternidad»;
- «falta el cargo en el desplegable» y «el carnet no me deja escribirlo como está
  en el documento»;
- «el sistema no pide los documentos que pedimos nosotros» —faltaban las
  subsecciones de garantía, sobraban dos documentos retirados y no había dónde
  anotar cuántas hojas tiene cada documento del legajo físico.

Ninguna de las cinco es una opinión: las cinco se pudieron **medir**, y esa es la
columna vertebral de esta iteración.

## Intuición

Seis ideas. Cada una tiene una frase.

**1 · Un color no es legible porque parezca legible.** El contraste se puede
calcular: la norma WCAG AA pide 4.5:1 para texto normal y 3:1 para texto grande.
Se escribió un motor de contraste y una sonda que mide **cada texto visible** del
módulo, en los dos temas, componiendo los fondos semitransparentes capa por capa
como lo hace el navegador. Aparecieron siete incumplimientos que nadie había visto
a ojo, uno de ellos a 1.5:1 —texto prácticamente invisible—.

**2 · Lo que se traba no siempre es lo que se está mirando.** El módulo apagaba
sus propios efectos en «modo ligero» y no cambiaba nada, porque el gasto estaba
detrás: el fondo del armazón son cuatro círculos de 42 rem con un desenfoque de
120 px **animados en bucle**, más un lienzo WebGL a pantalla completa, más el
vidrio del dock. Medido con la CPU frenada 4×: **4 fotogramas por segundo** al
desplazar la lista. Con el interruptor puesto y llegando hasta el armazón: **45**.

**3 · Abrir un expediente no tiene por qué costar una llamada.** Mientras la
persona mira la lista, el módulo trae en tiempo ocioso el detalle de las filas
visibles, en lotes de doce y con concurrencia limitada. Al elegir una, la ficha
aparece desde la caché en el mismo fotograma y se revalida en silencio. Medido:
**330 ms** la primera vez, **292 ms** la segunda, y **veinticinco** expedientes en
**tres** llamadas en lugar de veinticinco.

**4 · Sin conexión también se trabaja.** Lo que se anota con la red caída entra en
una cola persistente que sobrevive a un recargado y se vacía sola cuando la red
vuelve. Y mientras eso pasa, la pantalla lo dice: nunca finge estar guardado.

**5 · El expediente es un documento, no un cajón.** La ficha pasó de ser un panel
lateral estrecho —donde una lista de veinticinco requisitos con sus chips no
cabía— a una **hoja centrada** con la cabecera, cuatro cifras y sus pestañas.

**6 · El sistema tiene que pedir lo que el área pide.** El catálogo se reescribió
con la redacción literal de la tabla del área: dieciséis generales vigentes, dos
retirados que no se borran (los expedientes viejos los tienen), diecisiete de
garantía **agrupados por subsección**, y nueve documentos con **contador de
hojas** porque el legajo físico se archiva y se cuenta.

## Cómo se investigó: sondas, no opiniones

Ninguna de las decisiones de esta iteración se tomó mirando la pantalla. Se tomó
mirando números que salen de un navegador de verdad, con el backend `.gs` real
cargado en memoria y un libro sembrado con veinticinco expedientes de las cinco
ramas. Las sondas viven en `qa/` y comparten un arnés
(`qa/arnes-documentacion.mjs`) que siembra el libro, arranca la aplicación
**construida** y desvía las llamadas a `script.google.com` al `doPost` de verdad.

| Sonda | Qué mide |
| --- | --- |
| `sonda-contraste.mjs` | contraste real de cada texto visible, 8 pantallas × 2 temas |
| `sonda-rendimiento.mjs` | fps al desplazar, tareas largas, tiempo hasta interactivo y memoria, con la CPU estrangulada y el modo ligero apagado/encendido |
| `sonda-alta-expediente.mjs` | el alta completa: carnet libre, duplicado, cargo del libro, hojas, prórroga y cuántas llamadas cuesta guardar |
| `sonda-modal-expediente.mjs` | foco, `Escape`, candado del fondo, pestañas y apilamiento de la ventana |
| `sonda-cache-expedientes.mjs` | precarga en lotes, apertura instantánea, revalidación y trabajo **sin conexión** |

> **Concepto clave — medir con la CPU frenada.** En una máquina de desarrollo todo
> va fluido y el problema no existe. Con `Emulation.setCPUThrottlingRate` a 4× —un
> equipo de oficina modesto— aparece exactamente lo que describe el área. Los
> números absolutos de la sonda son peores que los de un equipo real (el Chromium
> de pruebas no tiene pantalla ni GPU y dibuja los desenfoques en el procesador),
> así que sirven para **comparar** los dos modos, no como promesa.

## El código, sección por sección

### 1 · El motor de contraste y su sonda

`src/features/documentacion/domain/contraste.ts` es aritmética de color pura, sin
React: analiza un color CSS, **compone** los semitransparentes sobre lo que tienen
detrás, calcula la luminancia relativa y devuelve el cociente de contraste con el
umbral que le toca al tamaño de letra.

```ts
export function contraste(frente: Color, fondo: Color): number {
  const a = luminancia(frente);
  const b = luminancia(fondo);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
```

La sonda recorre el DOM real, resuelve la pila de fondos de cada texto —esto es lo
que ninguna herramienta automática hacía bien, porque el módulo usa vidrio
semitransparente sobre un degradado— y compara contra AA. **1897 textos medidos**
en ocho pantallas y dos temas.

Lo que encontró, y que esta iteración arregla:

| Hallazgo | Antes | Ahora |
| --- | --- | --- |
| `--ink-faint` en tema claro | 2.89:1 | 4.6:1 |
| `--ink-faint` en tema oscuro | 4.26:1 | 5.1:1 |
| `INTENT` de `tokens.ts` en tema claro | 1.6:1 | usa los tonos del tema |
| Botón primario en tema claro | 3.53:1 | par fondo/tinta por tema |
| Acento de categoría como color de texto | 1.5–2.4:1 | `colorClaro` por categoría |
| Vidrio del armazón sobre el módulo | ningún texto claro llegaba a AA | vidrio atemperado dentro de `.doc-console` |

> **Caso excepcional que costó entender.** El vidrio del armazón (`.glass`) aclara
> lo que tiene detrás hasta una luminancia de ≈0.15. Sobre eso, **ningún** texto
> claro llega a 4.5:1, por muy blanco que sea. No se arregla eligiendo otro gris:
> se arregla haciendo que la superficie del módulo sea más opaca. De ahí
> `.doc-hoja` y el atemperado de `.glass` dentro de `.doc-console`.

### 2 · El modo ligero, y por qué tuvo que salir del módulo

El interruptor existía y no servía de nada: apagaba el desenfoque de las
superficies del módulo, que no era donde estaba el gasto. Se midió capa por capa,
apagando una cosa a la vez, en la lista de expedientes con la CPU frenada 4×:

| Estado | fps |
| --- | --- |
| tal cual | 4 |
| escondiendo los cuatro círculos animados del fondo | 33 |
| además, sin `backdrop-filter` en el dock y la tira de indicadores | 53 |
| además, sin el lienzo WebGL del armazón | 59 |

Por eso el modo ligero ahora marca `<html>` mientras Documentación está abierta:

```tsx
useEffect(() => {
  const raiz = document.documentElement;
  if (!ligero) return;
  raiz.classList.add("doc-ligero-global");
  return () => raiz.classList.remove("doc-ligero-global");
}, [ligero]);
```

Y la hoja de estilos esconde los círculos —esconder y no «quitar el desenfoque»,
que dejaría cuatro discos de borde duro— y apaga el vidrio:

```css
html.doc-ligero-global .animate-blob { display: none; }
html.doc-ligero-global .glass,
html.doc-ligero-global .glass-heavy {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
```

El lienzo WebGL necesita algo más que CSS: esconderlo no detiene su bucle de
dibujado. `ThreeBackground` lee la marca y se **desmonta**, con lo que el bucle
se detiene y el contexto se libera. Es la única modificación de esta iteración
fuera del módulo, y se retira al salir de Documentación: no toca lo que el usuario
haya elegido en Configuración.

> **Concepto clave — por qué una clase y no un ajuste global.** El modo ligero es
> una preferencia de *un módulo* y tiene que poder convivir con el resto del
> sistema tal como está. Una clase en `<html>` se pone al entrar y se quita al
> salir; un ajuste guardado se queda para siempre y en otra pantalla.

### 3 · La caché de expedientes y la cola de salida

Tres archivos nuevos en `state/`:

- **`cacheExpedientes.ts`** — memoria con LRU (tope de 120 fichas) + IndexedDB,
  con recaída a `localStorage`. Vida de 30 minutos, versión de esquema para
  descartar volcados viejos y **borrado al cambiar de perfil**: son datos
  personales de terceros y no tienen por qué seguir en el equipo cuando quien los
  consultó se fue.
- **`precarga.ts`** — `precargarExpedientes` (lotes de 12, concurrencia 2,
  cancelable, solo en tiempo ocioso) y `useExpedienteAbierto`, que pinta la copia
  local en el mismo fotograma y revalida en silencio.
- **`colaSalida.ts`** — cola persistente con identificador de solicitud, orden,
  **coalescencia** (dos cambios del mismo requisito se funden), espera creciente
  entre reintentos y distinción entre error reintentable (red) y error definitivo
  (validación).

```ts
// 1. Lo que ya se sabe, en el mismo fotograma.
const enCache = leerDeCache(expedienteId);
setVistaPrevia(enCache);
// 2. La verdad, en silencio.
void docApi.obtenerExpediente(expedienteId, { historial: 80 }, { signal })
  .then((completo) => {
    if (pendientesDe(expedienteId) > 0 && datos) return;  // no se pisa lo que se edita
    if (enCache && enCache.version !== completo.expediente.version) setConflicto(true);
    setDatos(completo);
  })
  .catch(setError);  // con copia local, un backend caído no deja la pantalla vacía
```

> **Caso excepcional — no pisar lo que se está editando.** Si la revalidación
> llegara mientras hay cambios en vuelo, sustituiría la pantalla por debajo de las
> manos. La condición `pendientesDe(...) > 0 && datos` es lo que lo evita. Y si la
> versión del libro cambió, se avisa en lugar de sobreescribir en silencio.

### 4 · Honestidad sobre lo que se ve

La cabecera de la ficha dice de cuándo es el dato, y distingue tres situaciones
distintas que antes se contaban igual:

```tsx
{conflicto
  ? "Este expediente cambió en el libro mientras estaba abierto: se muestra la versión actualizada."
  : sinRespuesta
    ? `Copia de este equipo, guardada hace ${antiguedad} s. No se pudo comprobar contra el libro: puede haber cambiado.`
    : `Copia de este equipo, guardada hace ${antiguedad} s. Se está comprobando contra el libro…`}
```

La versión intermedia decía «se está comprobando contra el libro…» también cuando
la comprobación ya había fallado. Lo encontró `sonda-cache-expedientes.mjs`
cortando la red.

### 5 · El catálogo, con la redacción del área

`DOC2_CATALOGO_SEMILLA` se reescribió entero: **39 filas**, de las cuales 37
vigentes y 2 retiradas. `DOC2_CATALOGO_VERSION` pasa a 3 y
`DOC2_SCHEMA_VERSION` a 5.

| Rama | Requisitos |
| --- | --- |
| General | 16 |
| Comercial · garantía tipo 1 | 21 |
| Comercial · garantía tipo 2 | 25 |
| Comercial · garantía tipo 3 | 21 |
| Auditoría | 17 |
| Cumplimiento | 19 |

Tres cosas nuevas por documento:

- **`subseccion`** — los diecisiete documentos de garantía se agrupan como en la
  hoja del área («1 Garante con Bien Inmueble», «2 Garante Familiar»…). Dos de
  ellos (`garante-inmueble`, `garante-folio`) cambian de subsección según la rama,
  así que la subsección se resuelve por rama y no por documento;
- **`fisica` / `digital`** (`SI`, `NO`, `CONDICIONAL`) — cómo se presenta cada
  documento. `CONDICIONAL` se pinta «Físico\*» con su leyenda: el área pide la
  copia física solo en algunos casos;
- **`requiereConteoHojas`** — los nueve documentos que se archivan en papel piden
  el número de hojas.

Los dos retirados (`cert-trabajo`, `rc-iva`) entran con `activo: false,
retirado: true`: **no se borran**, porque los expedientes de años anteriores los
tienen y borrarlos dejaría filas huérfanas; simplemente no se piden nunca más.

### 6 · Un bug de destrucción de datos en la hoja `Auxiliar`

Este merece su propio apartado porque **perdía datos del área**.

```js
// Antes: la fila donde escribir se calculaba con la lista YA DEDUPLICADA.
var fila = 2 + actuales.length;
hoja.getRange(fila, columna).setValue(valor);
```

`actuales` es la lista de valores únicos. Si la columna tenía duplicados o huecos
—y las columnas escritas a mano los tienen—, `2 + actuales.length` apuntaba a una
fila **con contenido**, y el valor nuevo lo pisaba. Ahora se busca la última fila
con contenido de esa columna concreta:

```js
var fila = doc2UltimaFilaDeColumna_(hoja, columna) + 1;
```

Del mismo tirón, la cabecera de la columna se compara **normalizada**: con
`===`, un `Cargo_BDP` o un espacio al final dejaba el desplegable vacío y el
backend creaba una segunda columna al lado.

### 7 · El alta, en una sola llamada

Antes, guardar un expediente eran **cuatro** llamadas: crear, leer, guardar
estados, crear prórrogas. Cada una podía fallar por su cuenta y un corte a mitad
dejaba un expediente creado y sin marcar. Ahora `documentacion.expediente.crear`
acepta las listas `requisitos` y `prorrogas` y lo aplica todo en una escritura
idempotente, informando de lo que no pudo aplicar:

```js
{ expedienteId, creado, completa: true, aplicados: 5, prorrogasCreadas: 1, fallidos: [] }
```

El campo `completa` es lo que permite convivir con un backend anterior: el
frontend se despliega solo al fusionar, y el `.gs` se publica a mano. Si la
respuesta no trae `completa: true`, el asistente **recae** en la ruta antigua de
cuatro pasos en lugar de perder lo marcado.

Medido por `sonda-alta-expediente.mjs`: `crear: 1`, `guardar: 0`,
`prórrogas: 0`, y en el libro 21 requisitos, 5 entregados, 8 hojas contadas y la
prórroga creada.

### 8 · El carnet, libre, y el duplicado avisado a tiempo

El identificador ya no tiene formato impuesto: se escribe como está en el
documento. Y el duplicado se avisa **mientras se escribe**, no después de cinco
pasos:

```ts
useEffect(() => {
  const escrito = form.identificador.trim();
  if (soloAlfanumerico(escrito).length < 5) return;
  const temporizador = setTimeout(() => {
    void docApi.expedientePorCarnet(escrito, { signal })
      .then((r) => { if (r.encontrado) setDuplicado({ ... }); })
      .catch(() => { /* el guardado lo comprobará de todas formas */ });
  }, 700);
  return () => { clearTimeout(temporizador); controlador.abort(); };
}, [form.identificador]);
```

La consulta nueva `documentacion.expediente.porCarnet` compara por la **clave de
identidad** (solo dígitos y letras), no por texto: en el libro el mismo documento
vive como «1234567 LP», «1234567 - 45 - 2026» y «1234567-lp», y una búsqueda por
subcadena no reconoce ninguna de las otras dos. El aviso ofrece **abrir el
expediente que existe** y no borra nada de lo escrito.

> **Caso excepcional.** La normalización para *detectar duplicados* es más
> agresiva que la que alimenta `doc2StableId_`. Se añadió una función aparte
> (`doc2ClaveIdentidad_`) y **no** se tocó `doc2NormalizarIdentificador_`: cambiar
> esta última habría cambiado el identificador estable de todos los expedientes
> existentes.

### 9 · El contador de hojas

Un control pequeño con tres decisiones que importan:

```tsx
<input
  // Nunca `type="number"`: la rueda del ratón cambiaría el valor al hacer scroll.
  type="text"
  inputMode="numeric"
```

- **nunca `type="number"`** — con foco, la rueda del ratón altera el valor; en una
  lista de veinticinco requisitos eso significa alterar conteos al bajar por la
  pantalla sin que nadie lo note;
- **se acota al soltar el campo, no al teclear** — recortar mientras se escribe
  impide llegar a «12» pasando por «1»;
- **un cambio que no cambia nada no es un cambio** — `confirmar` también corre al
  salir del campo con el tabulador. Sin esta guarda, recorrer los requisitos con
  el teclado marcaba el expediente como modificado y, al cerrar, preguntaba si
  descartar un trabajo que nadie había hecho. Lo encontró
  `sonda-modal-expediente.mjs`, y la misma idea está en `ponerBorrador`: cada
  campo del parche se compara con lo que hay en el libro y se queda solo lo que
  difiere.

### 10 · La ventana del expediente

`ExpedienteLateral.tsx` pasó a ser `ExpedienteVentana.tsx`, y `Lateral` y
`Ventana` comparten ahora un solo hook, `useSuperficieModal`: candado de scroll
con recuento, trampa de foco, `Escape` y confirmación de cierre. Se borró
`DocExpedienteHeader.tsx`, que era código muerto.

La cabecera responde «¿cómo va esto?» sin bajar por la lista: identidad, rama con
su icono **y su etiqueta** —el color no comunica solo—, y cuatro cifras (avance,
faltan, observados, próximo plazo), cada una con una línea de detalle debajo y un
enlace al siguiente requisito pendiente.

### 11 · El desplegable de cargo, y un nombre accesible que mentía

`SelectorAuxiliar` se reescribió para las tres columnas (`agencia_bdp`,
`gerencia_bdp`, `cargo_bdp`) con ventaneo de 60 elementos, recuento «N de M»,
`aria-activedescendant`, `Home`/`End` y cierre con `Escape`.

Y se le puso nombre propio:

```tsx
aria-label={`${NOMBRE_COLUMNA[columna]}: ${valor || "sin elegir"}`}
```

Sin eso, el nombre accesible lo decidía el `<label>` que `Campo` pone alrededor
—un `<button>` es un control etiquetable—, y lo que se anunciaba era la etiqueta
con **todo su texto de ayuda**, sin decir nunca qué estaba elegido. Ahora se oye
«Cargo: OFICIAL DE NEGOCIOS».

### 12 · La pantalla de carga y el autodiagnóstico

`PantallaCarga` es un logo de documentos animado con SVG y CSS, con dos topes: no
aparece menos de 420 ms —un destello es peor que nada— ni más de 3200 ms, tras lo
cual la consola entra con esqueletos. Con `prefers-reduced-motion` o en modo
ligero, se queda quieta.

`DocAutodiagnostico` es la pestaña «¿Algo va mal?» de Configuración: seis botones
grandes —probar conexión, resincronizar, vaciar la copia local, descargar
respaldo, comprobar catálogo, medir fluidez—, la lista de cambios pendientes de
sincronizar y el conmutador de modo ligero. Es lo que el área puede intentar antes
de escribir a nadie.

### 13 · Reportes, exportación e informe

Tres columnas nuevas —«Subsección», «Presentación» y «Hojas físicas»— en los
reportes de pendientes y observaciones, en el de completitud, en la hoja
`Requisitos` de la exportación y en el detalle del informe mensual. El espejo del
libro anual escribe las hojas contadas en la columna `PAGINAS` del bloque de
gestión, que es donde el área ya las anotaba a mano.

### 14 · La migración

`5.0.0-hojas-fisicas` es idempotente, se puede **simular** antes de aplicar y
trabaja en lotes: crea las columnas nuevas, siembra el catálogo v3, crea y siembra
`cargo_bdp` con los cargos que ya están en los expedientes y **recupera** los
conteos de hojas que estuvieran en el `DETALLE JSON` del libro sin pisar lo que se
haya escrito a mano.

## Verificación

Todo lo que sigue se ejecutó en esta rama. Los números de «antes» son de la misma
rama antes de los cambios.

| Comprobación | Antes | Ahora |
| --- | --- | --- |
| `npm run typecheck` | limpio (19,5 s) | limpio |
| `npm test` | 627 pruebas · 49 archivos | **724 pruebas · 54 archivos** |
| `npm run doc:check` | 20 comprobaciones | **26 comprobaciones**, sin avisos |
| `npm run build` | 9,55 s | 8,1 s |
| Paquete del módulo | 380,06 kB (97,80 gzip) | 424,79 kB (111,53 gzip) |
| CSS del módulo | 11,84 kB | 19,07 kB (4,47 gzip) |
| Paquete inicial (`index-*.js`) | 919,00 kB | 916,54 kB |

> **Sobre el tamaño.** El módulo pesa 44 kB más (13,7 kB comprimidos) y el
> **arranque no crece**: el módulo se carga aparte, cuando se entra en él. Lo que
> se compra con esos kilobytes son la caché, la cola de salida, la precarga, el
> motor de contraste y la pantalla de carga.

### Las sondas, con sus números

**Rendimiento** (`node qa/sonda-rendimiento.mjs`, CPU estrangulada 4×):

| Medida | Con todos los efectos | En modo ligero |
| --- | --- | --- |
| fps al desplazar la lista | 4 | **50** |
| fps al desplazar los requisitos | 3 | **43** |
| saltos de fotograma | 17 | **2** |
| tareas largas al abrir la ficha | 16 | 4 |
| peor tarea | 334 ms | 231 ms |
| tiempo hasta interactivo | 3071 ms | 2992 ms |
| escribir 48 caracteres | 6165 ms · 21 tareas largas | **2811 ms · 1 tarea larga** |
| memoria tras seis aperturas | 15 → 15 MB | 16 → 16 MB |

**Contraste** (`node qa/sonda-contraste.mjs`): **1897 textos** medidos en 8
pantallas × 2 temas, ninguno por debajo del umbral AA que le toca.

**Alta** (`node qa/sonda-alta-expediente.mjs`): el guardado hace **una** llamada
(`crear: 1`, `guardar: 0`, `prórrogas: 0`); en el libro quedan 21 requisitos, 5
entregados, el conteo de 8 hojas hecho con el teclado, la observación y la
prórroga; los 16 generales vigentes se muestran y los 2 retirados no aparecen; el
desplegable de cargo trae los cargos del libro; los requisitos de garantía salen
agrupados por subsección.

**Ventana** (`node qa/sonda-modal-expediente.mjs`): el foco entra al abrir y no se
escapa en **25 tabulaciones**; el fondo queda quieto y vuelve a moverse al cerrar;
cinco ciclos de apertura y cierre no dejan la página trancada; mirar la ficha no
la marca como modificada.

**Caché y sin conexión** (`node qa/sonda-cache-expedientes.mjs`): veinticinco
expedientes en **3 lotes** y **0** llamadas sueltas; 330 ms la primera apertura,
**292 ms** la segunda; con la red cortada la ficha abre en 252 ms diciendo que es
una copia de este equipo; lo anotado sin conexión queda en la cola y **termina
escrito en el libro** al volver la red.

### Cómo probarlo a mano

1. Entra en **Documentación → Expedientes** y quédate mirando la lista tres
   segundos. Abre cualquier expediente: debe aparecer sin pantalla vacía.
2. Ciérralo y vuelve a abrirlo: ahora es instantáneo.
3. En la ficha, pestaña **Requisitos**: los que van en papel llevan un contador de
   hojas y el filtro «En físico» los deja solos, con el total de hojas.
4. Recorre la ficha con el tabulador sin cambiar nada y ciérrala: **no** debe
   preguntar si descartar cambios.
5. Escribe una observación larga: la frase entera tiene que llegar y el cursor
   quedarse en el campo.
6. **Nuevo expediente**: escribe un carnet que ya exista (tal como esté en el
   libro, con guiones o sin ellos). A los pocos segundos debe avisar y ofrecer
   abrir el que existe, sin borrar nada de lo escrito.
7. Elige un cargo del desplegable. Si la lista está vacía, ve al punto 4 de los
   pasos manuales.
8. Termina el alta con un comercial tipo 1: el paso de requisitos debe mostrarlos
   agrupados por subsección de garantía.
9. Configuración → **¿Algo va mal?** → **Medir fluidez**. Si el equipo va justo,
   enciende **modo ligero**: el fondo deja de moverse y la lista se desplaza sin
   saltos.
10. Corta el wifi, cambia un estado y pulsa guardar: debe decir que quedó
    pendiente. Vuelve a conectar: se sincroniza solo y lo dice.

## Puesta en marcha (pasos manuales, con todo el detalle)

El frontend se despliega solo al fusionar. **El backend no**: Apps Script se
publica a mano y hasta que se publique, el módulo funcionará con la ruta antigua
—sin hojas físicas, sin subsecciones y sin el aviso de carnet repetido—.

### A · Frontend (automático)

Al fusionar la solicitud, Vercel construye y publica. **No hay variables de
entorno nuevas.**

### B · Backend de Apps Script (manual, en este orden)

1. Abre el libro del área → **Extensiones › Apps Script**.
2. Pega el contenido de los **22 archivos** de `apps-script/documentacion/`, uno a
   uno, respetando los nombres. Guarda.
3. Vuelve al libro y recarga la página para que aparezca el menú.
4. Menú **Documentación › Respaldar** (una copia antes de tocar nada).
5. Menú **Documentación › Instalar o actualizar modelo**.
6. Menú **Documentación › Simular migración** — lee el informe: dice qué columnas
   va a crear y cuántas filas va a tocar, sin escribir nada.
7. Menú **Documentación › Migrar** — aplica `5.0.0-hojas-fisicas`. Es idempotente:
   si se corta, se vuelve a ejecutar.
8. **Publica una VERSIÓN NUEVA de la implementación.** Esto es lo que más veces se
   olvida y hace pensar que «no funcionó nada»: guardar el código **no** cambia lo
   que responde la URL `/exec`.
   - **Implementar › Gestionar implementaciones**.
   - En la implementación existente, el lápiz (**Editar**).
   - **Versión: Versión nueva**. Descripción: «hojas físicas y catálogo v3».
   - **Ejecutar como: Yo**. **Quién tiene acceso: Cualquier usuario**.
   - **Implementar**. Copia la URL que termina en `/exec`.
9. En la aplicación: **Documentación › Configuración › Conexión y esquema**, pega
   la URL y pulsa **Guardar y probar**. Debe decir la versión del esquema (5) y la
   del catálogo (3).

### C · La hoja `Auxiliar` y los cargos (manual)

10. Abre la hoja **`Auxiliar`** del libro. El backend crea la cabecera
    **`cargo_bdp`** si falta, pero los cargos del banco los pone el área:
    **pega la lista de cargos** en esa columna, uno por fila, sin filas vacías en
    medio.
11. Comprueba de paso `agencia_bdp` y `gerencia_bdp`: si alguna cabecera tiene
    espacios de más o mayúsculas distintas, ya no importa —el backend las
    reconoce normalizadas—, pero conviene dejarlas limpias.
12. En la aplicación, en el desplegable de cargo del asistente, pulsa
    **Actualizar** si acabas de pegar valores: hay una caché de diez minutos y el
    botón la salta.

### D · Verificación posterior (lista de comprobación)

- [ ] Configuración › Conexión y esquema dice **esquema 5** y **catálogo 3**.
- [ ] Configuración › Mantenimiento no muestra migraciones pendientes.
- [ ] Un expediente comercial tipo 1 tiene **21** requisitos.
- [ ] Un expediente de auditoría tiene **17**.
- [ ] El desplegable de **cargo** trae los cargos del banco.
- [ ] Un requisito físico (por ejemplo el REJAP) muestra el contador de hojas.
- [ ] La hoja `CONTROL INGRESOS <año>` muestra las hojas contadas en `PAGINAS`.
- [ ] Un reporte de pendientes trae las columnas Subsección, Presentación y Hojas
      físicas.
- [ ] Los expedientes anteriores siguen abriéndose y conservan sus estados.

### E · Reversión, en dos palancas

1. **El backend**: Implementar › Gestionar implementaciones › Editar › elige la
   **versión anterior** › Implementar. La URL no cambia. Los datos migrados no
   estorban: las columnas nuevas quedan ahí, ignoradas.
2. **El frontend**: revertir la solicitud en GitHub; Vercel republica solo.

Las dos son independientes: se puede volver atrás el frontend y dejar el backend
nuevo, o al revés.

## Alternativas consideradas

### La caché de expedientes, ¿en IndexedDB o solo en memoria?

| A favor de IndexedDB (lo elegido) | En contra |
| --- | --- |
| Sobrevive a un recargado y a cerrar la pestaña, que es lo que hace posible trabajar sin conexión | Es asíncrona: hay que tratar el caso «todavía no cargó» |
| Aguanta megabytes; `localStorage` se llena con veinte fichas | Más código: apertura, versiones, recaída si el navegador la bloquea |
| Permite borrar por perfil sin tocar el resto | Hay que decidir y documentar qué datos personales quedan en el equipo |

Solo en memoria habría sido la mitad de código y cero riesgo de datos en el
equipo, pero también cero utilidad sin conexión: al recargar, la persona vuelve a
esperar. Se eligió IndexedDB **con** vida de 30 minutos y borrado al cambiar de
perfil, que es el punto medio honesto.

### El modo ligero, ¿interruptor manual o automático?

| A favor de «auto + manual» (lo elegido) | En contra |
| --- | --- |
| El equipo modesto lo enciende solo tras medir la fluidez real | Medir cuesta un segundo la primera vez |
| Quien prefiera los efectos puede forzarlos, y quien prefiera velocidad también | Tres estados (auto/sí/no) son más difíciles de explicar que dos |
| La preferencia se guarda y se valida al leerla | Hay que documentar qué apaga exactamente |

Detectar solo por hardware (`deviceMemory`, `hardwareConcurrency`) habría sido más
simple y también más ciego: esos datos no dicen si el equipo tiene aceleración
gráfica, que es justo lo que decide si el desenfoque es gratis o costoso.

### El aviso de carnet repetido, ¿en el cliente o en el servidor?

| A favor de preguntar al servidor (lo elegido) | En contra |
| --- | --- |
| El libro es la única fuente que conoce todos los expedientes, incluidos los archivados | Una llamada más por alta (con retardo de 700 ms, una sola) |
| Compara por clave de identidad, así que reconoce el mismo carnet escrito de otra forma | Necesita una acción nueva en el backend y, por tanto, republicar |
| Si falla, no rompe nada: el guardado lo vuelve a comprobar | Sin red no avisa hasta el final |

Comparar contra la lista que el cliente ya tiene en memoria habría sido gratis,
pero esa lista está paginada y filtrada: el homónimo puede estar en la página
cuatro o archivado.

## Personas con contexto

Los archivos que esta iteración toca más a fondo son
`apps-script/documentacion/*.gs`, `src/features/documentacion/**` y
`src/components/ThreeBackground.tsx`. Según el historial de la rama, **todo el
código del módulo lo han escrito hasta ahora agentes automáticos a petición de
Alexx** (`blair.4@drivesonata.com`), que es también quien conoce el papeleo real
del área y la operación del libro.

Por eso la conversación útil aquí no es con otro desarrollador, sino con:

- **Alexx (`blair.4@drivesonata.com`)** — dueño del módulo y del libro. Es quien
  puede confirmar la redacción del catálogo, la lista de cargos y si las
  subsecciones de garantía son las que el área usa.
- **Quien opera el libro a diario en el área de personal** — es la única persona
  que sabe si los conteos de hojas que hay en `PAGINAS` son fiables y si el
  «Físico\*» condicional está bien entendido.
- **Quien administre el proyecto de Apps Script** — para el paso de publicar la
  versión nueva de la implementación, que es el único que no se puede automatizar
  desde aquí.

## Cuestionario

<details>
<summary>1. El «modo ligero» del módulo apagaba el desenfoque de sus propias superficies y la lista seguía a 4 fps. ¿Por qué?</summary>

- **A.** Porque el desenfoque no cuesta nada.
- **B.** Porque el gasto estaba fuera del módulo: el fondo del armazón son cuatro
  círculos de 42 rem con `blur(120px)` animados en bucle, más un lienzo WebGL a
  pantalla completa, más el vidrio del dock. ✅
- **C.** Porque el modo ligero no se guardaba.

Se midió apagando una capa a la vez: 4 fps tal cual, 33 al esconder los círculos,
53 al quitar además el desenfoque del vidrio, 59 al desmontar el lienzo. Por eso el
interruptor marca ahora `<html>` mientras Documentación está abierta.
</details>

<details>
<summary>2. ¿Por qué esconder el lienzo WebGL con CSS no habría bastado?</summary>

- **A.** Porque `display:none` no funciona en un `<canvas>`.
- **B.** Porque el bucle de dibujado seguiría corriendo contra un lienzo
  invisible: se sigue pagando el sombreador en cada fotograma. ✅
- **C.** Porque el lienzo está en otro documento.

`ThreeBackground` lee la marca de `<html>` y se desmonta, con lo que el efecto se
limpia, el bucle se detiene y el contexto se libera.
</details>

<details>
<summary>3. Recorrer los requisitos con el tabulador marcaba el expediente como modificado. ¿Qué lo causaba?</summary>

- **A.** El foco escribía en el libro.
- **B.** El contador de hojas confirma su valor al **perder el foco**, y avisaba
  del cambio aunque el número fuera el mismo, así que el borrador se llenaba de
  entradas idénticas al libro. ✅
- **C.** La caché volvía a pintar la ficha.

Ahora `confirmar` no avisa si el número no cambió, y `ponerBorrador` compara cada
campo del parche con lo que hay en el expediente y descarta lo que no difiere. Si
no queda nada, borra la entrada: así el indicador vuelve a «sin cambios» al
deshacer a mano lo que se acababa de tocar.
</details>

<details>
<summary>4. ¿Por qué el aviso de carnet repetido no compara por texto?</summary>

- **A.** Porque comparar texto es lento.
- **B.** Porque el mismo documento vive en el libro como «1234567 LP»,
  «1234567 - 45 - 2026» y «1234567-lp», y una búsqueda por subcadena no reconoce
  ninguna de las otras dos. La acción nueva compara por la clave de identidad:
  solo dígitos y letras. ✅
- **C.** Porque el backend no sabe buscar texto.

Y esa clave de identidad es una función **aparte** de la que alimenta
`doc2StableId_`: tocar esa otra habría cambiado el identificador estable de todos
los expedientes existentes.
</details>

<details>
<summary>5. ¿Por qué los dos documentos retirados siguen en el catálogo en lugar de borrarse?</summary>

- **A.** Por si el área cambia de opinión.
- **B.** Porque los expedientes de años anteriores tienen requisitos que apuntan a
  esos códigos: borrarlos dejaría filas huérfanas y reportes que no cuadran.
  Entran con `activo: false, retirado: true` y no se piden nunca más. ✅
- **C.** Porque el catálogo no admite borrados.

El asistente los filtra por `retirado !== true`, así que el paso de generales
muestra dieciséis y no dieciocho, mientras la ficha de un expediente antiguo sigue
mostrando lo que ese expediente tiene.
</details>

<details>
<summary>6. La revalidación silenciosa trae la versión del libro mientras la ficha está abierta. ¿Qué pasa si había cambios sin guardar?</summary>

- **A.** Se sustituye la pantalla por la versión del libro.
- **B.** No se pisa: si hay cambios en vuelo se conserva lo que la persona está
  editando, y si la versión del libro cambió se avisa del conflicto en lugar de
  sobreescribir en silencio. ✅
- **C.** Se cierra la ficha.

Es la condición `pendientesDe(expedienteId) > 0 && datos` del efecto de
`useExpedienteAbierto`, más el aviso «este expediente cambió en el libro mientras
estaba abierto».
</details>

<details>
<summary>7. ¿Por qué el desplegable de cargo necesitó un <code>aria-label</code> propio?</summary>

- **A.** Para que Playwright lo encontrara.
- **B.** Porque un `<button>` es un control etiquetable y `Campo` lo envuelve en un
  `<label>`: el nombre accesible pasaba a ser la etiqueta con todo su texto de
  ayuda, sin decir nunca qué estaba elegido. ✅
- **C.** Porque no tenía texto.

Ahora se anuncia «Cargo: OFICIAL DE NEGOCIOS». Que la sonda lo encontrara antes o
después es una consecuencia, no el motivo.
</details>

<details>
<summary>8. ¿Por qué el alta manda los estados y las prórrogas dentro de la llamada de creación, y qué pasa con un backend antiguo?</summary>

- **A.** Para ahorrar ancho de banda.
- **B.** Porque con cuatro llamadas un corte a mitad dejaba un expediente creado y
  sin marcar. Si la respuesta no trae `completa: true`, el asistente recae en la
  ruta antigua de cuatro pasos. ✅
- **C.** El backend antiguo deja de funcionar.

La recaída existe porque el frontend se despliega al fusionar y el `.gs` se publica
a mano: entre las dos cosas hay minutos u horas, y en ese hueco el asistente tiene
que seguir funcionando.
</details>
