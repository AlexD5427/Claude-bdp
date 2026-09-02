# Arnés de QA · Comparador y Postulantes

Un entorno para **reproducir** los fallos reportados antes de arreglarlos y para
comprobar después que dejaron de ocurrir. No forma parte de la aplicación ni del
despliegue: `playwright` se instala aparte a propósito, para no engordar el
`npm ci` de Vercel con un navegador de 150 MB.

## Puesta en marcha

```bash
npm ci
npm i -D playwright && npx playwright install chromium --with-deps   # una sola vez
npm run build

node qa/mock-backend.mjs &                 # backend falso en :8787
npx vite preview --port 4173 --host 127.0.0.1 &
```

El mock imita el contrato del Apps Script real (GET del libro completo, POST de
alta y de edición) y trae a propósito **dos filas con el mismo identificador** y
**una fila sin identificador**: los dos casos de datos sucios que rompían la
identidad de las personas en todo el sistema.

## Recorrido completo

```bash
node qa/run.mjs base            # camino feliz: comparativa, gráficos, alta
node qa/run.mjs red-caida       # sin acceso a script.google.com
node qa/run.mjs cache-red-caida # ya usó la página y luego le cortan la red
node qa/run.mjs backend-html    # el despliegue de Apps Script perdió permisos
node qa/run.mjs movil           # 390×844 con eventos táctiles
```

Cada recorrido registra en consola los errores de JavaScript, los avisos de React
y las peticiones fallidas, y deja capturas en `qa/shots/<escenario>/` (ignoradas
por git).

## Sondas puntuales

Cada sonda aísla **un** síntoma e imprime hechos en lugar de capturas, así que se
puede razonar sobre el fallo sin abrir una imagen:

```bash
node qa/sondas.mjs almacenamiento-bloqueado  # datos del sitio bloqueados
node qa/sondas.mjs navegador-antiguo         # sin ResizeObserver ni matchMedia
node qa/sondas.mjs guardado-mentiroso        # el backend responde HTML 200
node qa/sondas.mjs carrera-optimista         # el GET siguiente al alta va atrasado
node qa/sondas.mjs limite-fantasma           # sesión con identificadores muertos
node qa/sondas.mjs secciones-apagadas        # comparativa con todo oculto
node qa/sondas.mjs punto-sincronizacion      # el punto verde mentía estando sin red
node qa/sondas.mjs duplicados-comparables    # dos filas con el mismo identificador
node qa/sondas.mjs observacion-perdida
node qa/sondas.mjs nota-no-se-borra
```

`qa/legacy-check.mjs <url>` es un atajo para comparar dos despliegues (por
ejemplo `origin/main` frente a una rama) en el perfil de navegador antiguo.

## Arnés del módulo de Documentación

Tres piezas más, añadidas al investigar «la pantalla se congela». Todas montan la
aplicación en un Chromium real y desvían las llamadas al backend `.gs` cargado en
memoria por `scripts/documentacion-backend.mjs`, así que lo que se ve en pantalla
salió del `doPost` de verdad.

```bash
node qa/documentacion-app.mjs               # recorrido completo (app entera)
node qa/documentacion-app.mjs congelamiento # ¿sigue respondiendo tras abrir y cerrar paneles?
node qa/documentacion-app.mjs alta          # el asistente de nuevo expediente, de principio a fin
node qa/sonda-foco-expediente.mjs           # ¿se puede ESCRIBIR en el panel del expediente?
node qa/sonda-congelamiento.mjs             # ¿queda el `body` con overflow:hidden?
node qa/sonda-salida-perfil.mjs             # ¿se puede SALIR del formulario de perfil de cargo?
node qa/visual-documentacion.mjs            # las diez pantallas + capturas de la documentación
node qa/sonda-contraste.mjs                 # ¿se LEE el texto? contraste efectivo en los dos temas
node qa/sonda-rendimiento.mjs [factor]      # fps, tareas largas y memoria con la CPU estrangulada
```

### `sonda-contraste.mjs`

Mide el contraste **efectivo** del texto que se pinta, en los dos temas y en seis
pantallas más el asistente de alta.

Es distinta de `__tests__/contraste.test.ts`, y las dos hacen falta. La prueba de
Vitest mide los **tokens**: garantiza que el valor declarado en
`documentacion.css` cumple 4,5:1 sobre el fondo de referencia. Necesario, y no
suficiente: en la pantalla real puede haber un componente que escriba un color a
mano, un texto sobre una superficie translúcida distinta de la de referencia, o
una clase de Tailwind heredada de la época en que el módulo pintaba con
`text-cyan-200`, pensada solo para fondo oscuro.

Esta sonda resuelve el color y el fondo **efectivos** con `getComputedStyle`,
subiendo por los ancestros hasta el primer fondo opaco y componiendo los
translúcidos por el camino. Aplica el umbral de WCAG que corresponde al tamaño y
al peso de cada texto (3:1 para el grande, 4,5:1 para el resto) y **tolera cero
incidencias**: la tentación de dejar un margen «para los casos raros» es
precisamente lo que dejaría pasar el texto de ayuda y los recuentos, que es donde
el contraste falla y donde más se necesita.

Sale con código 1 si algo no cumple, e imprime el ratio medido, el tamaño, el
color, el fondo y la clase, para poder ir directo al componente.

### `sonda-rendimiento.mjs`

Estrangula el hilo principal con Chrome DevTools Protocol (4× por defecto, se le
puede pasar otro factor) y mide sobre 60 expedientes sembrados:

- tiempo hasta que la consola **responde**, no hasta que llega el HTML;
- fotogramas por segundo al desplazar la lista y al desplazar la ficha, contando
  `requestAnimationFrame` reales;
- tiempo de abrir un expediente, que es la interacción más pesada del módulo;
- **milisegundos por letra** al escribir una observación: es la prueba del fallo
  histórico del módulo, y con la CPU estrangulada se ve como una latencia que
  crece con la lista;
- tareas largas (> 50 ms), que son las que bloquean la respuesta al clic;
- memoria del montón de JavaScript;
- capas compuestas: cuántos nodos llevan `backdrop-filter`, sombra de radio grande
  o `will-change` permanente. Es el coste que la estética de cristal introduce, y
  el número que hay que vigilar al añadir superficies.

**No falla por umbral, a propósito.** Un umbral inventado en una máquina de
integración continua compartida da falsos negativos y acaba desactivado, que es
peor que no tenerlo. Imprime números para comparar antes y después.

> **Por qué con la CPU estrangulada.** En el portátil donde se programa esto el
> módulo va bien. En los equipos del área —sin GPU dedicada, con el antivirus
> corporativo comiéndose un núcleo— se traba. Medir sin estrangular mide el equipo
> del programador, que es exactamente el equipo que no importa.

`sonda-foco-expediente.mjs` es la que encontró el fallo grave de esta iteración:
escribe una observación letra a letra y compara lo escrito con lo que llegó. Antes
del arreglo devolvía `"F"` en lugar de la frase completa, y el foco terminaba en un
`<button>`.

`sonda-salida-perfil.mjs` encontró el otro fallo grave: la confirmación de «¿salir
sin guardar?» se montaba por detrás del formulario (`z-index` 110 contra 115), así
que no se podía pulsar y la única salida era recargar la página.

A diferencia de `visual-documentacion.mjs` —que monta solo la consola—,
`documentacion-app.mjs` monta la **aplicación completa** (acceso, dock y
superposiciones globales): es el único entorno donde se reproducen los fallos que
nacen de la convivencia entre módulos.

## Resultado esperado tras las correcciones

| Sonda                     | Antes                                            | Después                                        |
| ------------------------- | ------------------------------------------------ | ---------------------------------------------- |
| `almacenamiento-bloqueado`| `#root` vacío · pantalla en blanco               | entra al sistema, 0 errores                    |
| `navegador-antiguo`       | `matchMedia is not a function` · app en blanco   | Comparador y alta funcionando, 0 errores       |
| `guardado-mentiroso`      | modal cerrado, ficha en pantalla, 0 POST         | modal abierto, motivo del fallo, sin ficha     |
| `carrera-optimista`       | el alta desaparece de la lista                   | se mantiene visible                            |
| `limite-fantasma`         | buscador deshabilitado en «10/10»                | buscador libre en «0/10»                       |
| `secciones-apagadas`      | comparativa en blanco sin explicación            | aviso con el remedio en el sitio               |
| `punto-sincronizacion`    | «Sincronizado» sin red                           | «Sin conexión…» en rojo                        |
| `duplicados-comparables`  | la segunda fila era inalcanzable                 | ambas comparables, sin avisos de React         |

## Lo que encontraron las sondas del catálogo v3

Dos fallos que las pruebas unitarias no podían ver, porque solo aparecen con el
catálogo real cargado en un navegador:

| Sonda | Qué encontró |
| --- | --- |
| `documentacion-app.mjs alta` | El asistente pintaba **18** generales en lugar de 16: filtraba por sección pero no por `activo`, así que ofrecía los dos requisitos que el área acababa de retirar. Vigilado ahora también en `wizard.test.tsx`. |
| `documentacion-app.mjs alta` | Confirmó que los cinco contadores de hojas aparecen **solo** en los cinco generales de papel, y que los de garantía no llevan ninguno: es la comprobación de que la interfaz lo deduce del catálogo y no de una lista propia. |

El recorrido `alta` comprueba además, en un Chromium real:

- que el carnet `9.988.776-1A` —con puntos y complemento, el formato que la
  validación anterior rechazaba— se acepta;
- que **Cargo** filtra la lista de `cargo_bdp` al escribir;
- que los títulos de subsección del Tipo 2 se muestran, y que sus dos garantes
  familiares se distinguen en bloques (`innerText` los devuelve en mayúsculas
  porque el CSS los pinta en versalitas: la comprobación es sin distinguir caja);
- que el asistente es una **superficie central** y no pantalla completa, medido
  sobre la caja real (`1077 px` de `1500 px`, con `211 px` de margen).
