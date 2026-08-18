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
```

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
