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

Todas estas piezas montan la aplicación en un Chromium real y desvían las llamadas
al backend `.gs` cargado en memoria por `scripts/documentacion-backend.mjs`, así
que lo que se ve en pantalla salió del `doPost` de verdad.

### Arnés compartido

`qa/doc-arnes.mjs` es la base de las cinco sondas nuevas. Existe porque todas
necesitan exactamente lo mismo antes de medir algo: arrancar Vite, sembrar el
backend, interceptar `script.google.com` y entrar al módulo con sesión. Copiado
cinco veces, eso serían cinco sitios donde el arnés se desactualiza por separado.

Lo que aporta y conviene conocer:

| Pieza | Para qué |
| --- | --- |
| `arrancarVite(puerto, { produccion })` | `produccion: true` sirve el `dist/` construido. **Obligatorio** para medir rendimiento: en modo desarrollo se mide el compilador, no la aplicación |
| `sembrar({ cuantos })` | Expedientes de todas las ramas, con estados, hojas contadas y observaciones, más los tres catálogos auxiliares |
| `nuevoRegistro({ esperados, erroresEsperados })` | Distingue los rechazos y errores que la sonda **provoca a propósito** de los fallos reales. Sin esto, la única forma de pasar sería no probar el caso |
| `cortarBackend(registro)` | Simula que Apps Script no responde **sin cortar el resto de la red**. `setOffline(true)` corta también `localhost` y lo que se mide entonces es un error del navegador, no el comportamiento del módulo |

### Sondas nuevas

```bash
node qa/sonda-contraste.mjs           # cada nodo de texto, 7 pantallas × 2 temas, contra WCAG AA
npm run build && node qa/sonda-rendimiento.mjs 4   # trabajo, latencias y tareas largas con CPU 4x
node qa/sonda-alta-expediente.mjs     # el alta de punta a punta, comprobada en el libro
node qa/sonda-modal-expediente.mjs    # la ventana del expediente: foco, apilamiento, fugas
node qa/sonda-cache-expedientes.mjs   # precarga, apertura instantánea, conflicto, backend caído
```

**`sonda-contraste.mjs`** mide unos 2 800 nodos de texto por ejecución. Usa una
página por tema, con el tema puesto **antes** de cargar: el fondo lo pinta React,
así que forzar la clase `light` sin cambiar el estado daría un gris intermedio que
no existe en ninguna pantalla real.

**`sonda-rendimiento.mjs`** acepta el factor de estrangulamiento como argumento
(4 por defecto). Afirma sobre **trabajo**, no sobre fotogramas: en un Chromium sin
ventana `requestAnimationFrame` va a 4-5 Hz aunque no se estrangule nada, así que
los fps solo se informan. Tres detalles de calibración que costaron encontrar:

- simula la latencia del backend y **la escala con el factor**, porque estrangular
  la CPU multiplica el pintado y deja la red igual;
- **vacía la caché** antes de la apertura «en frío», porque si no la precarga ya
  la había calentado y las dos mediciones eran la misma;
- separa el presupuesto de una **interacción continua** (teclear, desplazarse) del
  de un **montaje** tras un clic, y atribuye cada tarea larga a su fase.

**`sonda-cache-expedientes.mjs`** es la que encontró que la reconciliación de
versión no se disparaba nunca en el caso real. **`sonda-rendimiento.mjs`** es la
que encontró que el modo ligero no ahorraba nada.

### Sondas anteriores

```bash
node qa/documentacion-app.mjs               # recorrido completo (app entera)
node qa/documentacion-app.mjs congelamiento # ¿sigue respondiendo tras abrir y cerrar paneles?
node qa/documentacion-app.mjs alta          # el asistente de nuevo expediente, de principio a fin
node qa/sonda-foco-expediente.mjs           # ¿se puede ESCRIBIR en el panel del expediente?
node qa/sonda-congelamiento.mjs             # ¿queda el `body` con overflow:hidden?
node qa/sonda-salida-perfil.mjs             # ¿se puede SALIR del formulario de perfil de cargo?
node qa/visual-documentacion.mjs            # las once pantallas + capturas de la documentación
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

## Arnés del módulo de Evaluaciones

Una evaluación publicada se comparte con un enlace, y ese enlace lo abre alguien
de fuera: **el fallo que este arnés persigue solo existe en la diferencia entre
dos navegadores.** `qa/arnes-evaluaciones.mjs` monta los dos: el del reclutador,
con su sesión del ATS y la conexión del módulo guardada, y el del postulante, que
no tiene nada más que un enlace. El backend es el `.gs` real cargado en memoria
por `scripts/evaluaciones-backend.mjs`, y el registro apunta **qué acciones
llevaron llave de administración y cuáles no**.

```bash
npm run build
node qa/sonda-enlace-publico.mjs                  # el camino completo del postulante
node qa/sonda-enlace-publico.mjs enlace-antiguo   # un enlace sin la referencia del despliegue
node qa/sonda-enlace-publico.mjs demostracion     # el módulo avisa de que sus enlaces no salen de aquí
node qa/sonda-enlace-publico.mjs demostracion-propia  # y el reclutador sí puede abrir el suyo
node qa/sonda-enlace-publico.mjs movil            # la portada en 390 px
node qa/sonda-enlace-publico.mjs avalancha        # el cupo de inicios agotado por una convocatoria
```

El escenario `completo` recorre lo que hace una persona real: abre el enlace, lee
la portada, escribe su nombre y su documento, responde, envía, y después se
comprueba **en el libro** que el intento quedó registrado con su nombre. De paso
verifica que ninguna acción del postulante viajó con la llave y que en su
navegador no quedó guardada ninguna.

Con el código anterior, ese escenario terminaba así —y es la reproducción exacta
de lo que reportó el área—:

```
· primeros 200 caracteres: No se pudo abrir la evaluación
  No existe ninguna evaluación con ese código.
· llamadas al backend: ping, listEvaluations      ← ninguna del postulante
```

La última línea es el diagnóstico: el navegador del postulante no llamó a nadie,
se contestó a sí mismo desde un almacén local vacío. El arreglo está explicado en
[`docs/evaluaciones/ENLACE_PUBLICO.md`](../docs/evaluaciones/ENLACE_PUBLICO.md).

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

## Resultado esperado de la sonda de Evaluaciones

| Escenario | Antes | Después |
| --- | --- | --- |
| `completo` | el postulante recibía «No existe ninguna evaluación con ese código» y su navegador no llamaba a nadie | abre la portada, responde y el intento queda en el libro con su nombre |
| `enlace-antiguo` | el mismo mensaje, culpando al código | dice que el enlace no indica a qué servidor pertenece y explica el remedio |
| `demostracion` | se copiaban enlaces que no podían abrir en ningún otro equipo | el módulo lo advierte antes de enviarlos |
| `demostracion-propia` | — | el enlace local abre, con el cartel de «vista local de demostración» |
| `movil` | — | portada en 390 px sin desplazamiento horizontal |
| `avalancha` | ocho de veinte candidatos se quedaban con «se alcanzó el límite» | esperan con cuenta atrás y entran solos |
