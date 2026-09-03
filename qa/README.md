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

Todas las sondas del módulo comparten `qa/arnes-documentacion.mjs`: siembra un
libro con **veinticinco expedientes** de las cinco ramas (con estados, hojas
físicas, observaciones y prórrogas), arranca `vite preview` sobre `dist/`, abre un
Chromium con la sesión iniciada y desvía las llamadas a `script.google.com` al
backend `.gs` cargado en memoria por `scripts/documentacion-backend.mjs`. Lo que
sale en pantalla salió del `doPost` de verdad: un cambio en un `.gs` se nota aquí.

El arnés lleva además un **registro** de la ejecución —cuántas llamadas se
hicieron, a qué acciones, cuáles fallaron, qué errores dejó la consola del
navegador y si el navegador se cayó—, que es lo que permite afirmar cosas como
«veinticinco expedientes se traen en tres llamadas» con un número y no con fe.

> Se usa la versión **construida** y no el servidor de desarrollo: las sondas de
> rendimiento tienen que medir el código que se despliega, con su minificado y su
> reparto de paquetes. Antes de cualquier sonda: `npm run build`.

```bash
node qa/documentacion-app.mjs               # recorrido completo (app entera)
node qa/documentacion-app.mjs congelamiento # ¿sigue respondiendo tras abrir y cerrar paneles?
node qa/documentacion-app.mjs alta          # el asistente de nuevo expediente, de principio a fin
node qa/sonda-alta-expediente.mjs           # alta completa: carnet libre, duplicado, hojas, prórroga, UNA llamada
node qa/sonda-modal-expediente.mjs          # la ventana del expediente: foco, Escape, candado, pestañas
node qa/sonda-cache-expedientes.mjs         # precarga, apertura instantánea y trabajo SIN CONEXIÓN
node qa/sonda-contraste.mjs                 # contraste real de 1897 textos en 8 pantallas × 2 temas
node qa/sonda-rendimiento.mjs [freno]       # fps, tareas largas y memoria con la CPU estrangulada
node qa/sonda-foco-expediente.mjs           # ¿se puede ESCRIBIR en la ficha del expediente?
node qa/sonda-congelamiento.mjs             # ¿queda el `body` con overflow:hidden?
node qa/sonda-salida-perfil.mjs             # ¿se puede SALIR del formulario de perfil de cargo?
node qa/visual-documentacion.mjs            # las catorce pantallas + capturas de la documentación
```

### Qué encontró cada una

`sonda-foco-expediente.mjs` encontró el fallo que empezó todo: escribe una
observación letra a letra y compara lo escrito con lo que llegó. Antes del arreglo
devolvía `"F"` en lugar de la frase completa, y el foco terminaba en un `<button>`.

`sonda-salida-perfil.mjs` encontró el otro fallo grave: la confirmación de «¿salir
sin guardar?» se montaba por detrás del formulario (`z-index` 110 contra 115), así
que no se podía pulsar y la única salida era recargar la página.

`sonda-contraste.mjs` mide el contraste **real** —composiendo los fondos
semitransparentes capa por capa, como lo hace el navegador— de cada texto visible
en las ocho pantallas del módulo y en los dos temas. Encontró siete
incumplimientos de la norma AA que ninguna revisión a ojo había visto, entre ellos
un `--ink-faint` a 2.89:1 en tema claro y el botón primario a 3.53:1.

`sonda-rendimiento.mjs` mide con la CPU estrangulada (4× por omisión) los
fotogramas por segundo al desplazar, las tareas largas, el tiempo hasta
interactivo y la memoria del montón, con el **modo ligero apagado y encendido**.
Fue la que demostró que el gasto no estaba en el módulo sino en el fondo animado
del armazón y en el vidrio del dock: 4 → 50 fps en la lista y 3 → 43 en los
requisitos al encender el interruptor.

`sonda-cache-expedientes.mjs` corta la red de verdad (aborta las peticiones como
`ERR_INTERNET_DISCONNECTED`) para comprobar que un expediente ya visto se abre
igual, que la pantalla dice que es una copia local y que lo anotado sin conexión
termina escrito en el libro cuando la red vuelve.

`sonda-modal-expediente.mjs` vigila las obligaciones de una superficie modal que
ninguna prueba en jsdom demuestra: el foco entra y no se escapa con veinticinco
tabulaciones, el fondo queda quieto y vuelve a moverse al cerrar, y cinco ciclos
de apertura y cierre no dejan la página trancada.

A diferencia de `visual-documentacion.mjs` —que monta solo la consola—,
`documentacion-app.mjs` monta la **aplicación completa** (acceso, dock y
superposiciones globales): es el único entorno donde se reproducen los fallos que
nacen de la convivencia entre módulos.

### Ayudantes del arnés

| Función | Para qué |
| --- | --- |
| `sembrarLibro()` | libro con 25 expedientes, catálogos auxiliares (incluido `cargo_bdp`), estados, hojas, observaciones y prórrogas |
| `nuevaPagina()` | Chromium con sesión, backend desviado y registro de llamadas |
| `abrirDocumentacion()` / `abrirExpedientes()` | entra al módulo esperando a que se vaya la pantalla de carga |
| `abrirFila(n)` | abre el expediente de la fila `n` y devuelve su ventana |
| `cerrarVentana()` | cierra la ventana contestando la confirmación de cambios sin guardar |
| `comprobar()` / `dato()` / `seccion()` | informe legible; `comprobar` decide el código de salida |
| `registro.sinRed` | corta la red a mitad de la sonda |
| `registro.erroresEsperados` | errores de consola que la sonda provoca a propósito |

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

## Resultado esperado de las sondas de Documentación

| Sonda | Antes | Después |
| --- | --- | --- |
| `sonda-foco-expediente` | llegaba `"F"` al campo; el foco acababa en un botón | la frase entera, foco en el `textarea` |
| `sonda-salida-perfil` | la confirmación quedaba detrás y no se podía pulsar | se pulsa y el formulario se cierra |
| `sonda-congelamiento` | `body` con `overflow:hidden` tras apilar dos paneles | 7 de 7 ciclos liberan el candado |
| `sonda-contraste` | 7 textos por debajo de 4.5:1 (mínimo 1.5:1) | 1897 textos medidos, ninguno por debajo |
| `sonda-rendimiento` | 4 fps en la lista, 17 saltos, 21 tareas largas al teclear | 50 fps, 2 saltos, 1 tarea larga en modo ligero |
| `sonda-alta-expediente` | el duplicado se descubría tras cinco pasos; el alta eran 4 llamadas | aviso al escribir el carnet; el alta es 1 llamada |
| `sonda-modal-expediente` | — (superficie nueva) | foco atrapado, candado liberado, 5 ciclos limpios |
| `sonda-cache-expedientes` | abrir un expediente costaba de 1,2 a 4 s y sin red no se podía trabajar | 292 ms la segunda vez; sin red se abre y lo anotado se sincroniza al volver |
