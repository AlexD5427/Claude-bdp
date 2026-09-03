# Evaluaciones · el enlace del postulante, que ahora abre para cualquiera

> Documento explicativo del arreglo. Está escrito para dos lectores: quien nunca
> tocó el módulo y necesita el mapa completo, y quien ya lo conoce y quiere ir
> directo a lo que cambió. Las secciones marcadas como **Fondo** se pueden saltar
> si ya se domina el sistema.

## El síntoma, en las palabras del área

> «Creo una evaluación, la publico, me da un enlace. **A mí me abre. A nadie
> más**: dice *No se pudo abrir la evaluación · No existe ninguna evaluación con
> ese código*.»

Un módulo de evaluaciones cuyo enlace solo funciona en el equipo de quien lo
generó no sirve para nada: la prueba existe para que la responda alguien de
fuera.

## Fondo

### Las tres piezas

1. **El ATS** (esta aplicación React, en Vercel) es donde el área crea, publica y
   revisa evaluaciones. Se entra con perfil y contraseña.
2. **El backend de Evaluaciones** es un proyecto de **Google Apps Script** sobre
   un libro de cálculo propio. Se publica como *aplicación web* y responde en una
   URL que termina en `/exec`.
3. **El runner** es la página que abre el postulante con el enlace público. Vive
   en la misma aplicación pero **fuera del acceso**: no hay dock, no hay módulos,
   no hay sesión. Es una página para alguien de fuera de la organización.

> **Concepto clave — dos superficies, una puerta.** El mismo `/exec` atiende al
> reclutador y al postulante. La diferencia no es la dirección: es la **llave de
> administración**. Las acciones del reclutador la llevan; las cinco del
> postulante (`openAssessment`, `startAttempt`, `saveProgress`, `heartbeat`,
> `submitAttempt`) no la necesitan y no la envían. Eso ya estaba bien hecho y no
> se ha tocado.

### Cómo se decide con qué servidor habla el navegador

El módulo dejó atrás las cinco variables de entorno de su primera versión: la
configuración —modo, URL del `/exec` y llave— se edita en **Evaluaciones →
Conexión** y se guarda en `localStorage`. Se configura una vez y no vuelve a
pedirse.

Ahí está la trampa, y hay que decirla con todas sus letras:

> **`localStorage` es de UN navegador.** La configuración del reclutador vive en
> el navegador del reclutador. En el teléfono del postulante no hay nada.

## La causa

El enlace era exactamente esto:

```
https://…/#/evaluacion/EV-ANAL-E7AV
```

El código, y nada más. Cuando alguien lo abría, el runner preguntaba «¿a qué
backend llamo?» y la respuesta salía del navegador de quien estaba mirando:

| Quién abre | Qué hay en su `localStorage` | Con quién habla | Qué ve |
| --- | --- | --- | --- |
| El reclutador | su configuración | el libro real (o la demostración local) | **la prueba** |
| Un postulante | nada | modo demostración → almacén **vacío** | «No existe ninguna evaluación con ese código» |

El mensaje era, además, el peor posible: culpaba al **código**. Y el código
estaba perfecto. Quien lo leía revisaba el enlace, lo copiaba otra vez, lo
reenviaba… y volvía a fallar, porque el problema no estaba ahí.

> **Y el modo demostración lo remataba.** Si nadie había configurado el backend,
> el módulo funciona igual —para eso existe ese modo— pero la evaluación vive en
> `localStorage`. Un enlace a algo que solo existe en un navegador **no puede**
> abrir en otro. El módulo lo anunciaba («modo demostración») pero no decía la
> consecuencia, que es la que importa: *los enlaces que publiques aquí no abrirán
> en el equipo de nadie más*.

## Intuición

Cuatro ideas.

**1 · El enlace tiene que decir de dónde viene.** Si un enlace no dice a qué
servidor pertenece, solo lo puede resolver quien ya lo sepa. Ahora lo lleva
dentro:

```
https://…/#/evaluacion/EV-ANAL-E7AV?b=AKfycbz…
                                     └─ el despliegue al que pertenece
```

**2 · Que no pueda apuntar a cualquier sitio.** Lo que va en el enlace no es una
URL, es el **identificador del despliegue**, y la dirección se reconstruye en el
código. Así, aunque alguien manipule el parámetro, lo único que puede conseguir
es señalar otro despliegue de Apps Script: nunca un servidor propio al que
desviar los datos del postulante.

**3 · Un enlace no puede sacar la llave de casa.** Cuando el destino lo impone un
enlace, la llave de administración **no viaja**, ni siquiera si quien abre el
enlace es el reclutador y su navegador la tiene guardada. En esa pantalla es una
visita anónima, y se comporta como tal.

**4 · Lo que no se puede resolver, se dice.** Con un enlace de los antiguos y un
navegador sin configuración no hay forma de saber a qué libro pertenece la
evaluación. Antes se caía a la demostración en silencio y salía el mensaje
equivocado. Ahora dice exactamente lo que pasa y qué pedir:

> «Este enlace no indica a qué servidor pertenece la evaluación. Pide a quien te
> lo envió que copie el enlace otra vez desde el módulo de Evaluaciones.»

Volver a copiar y reenviar **arregla los enlaces antiguos**: el código de la
evaluación no cambia.

## Cómo se investigó

El fallo no se puede reproducir en una prueba de unidad, porque su causa es la
diferencia entre **dos navegadores**. Así que se montó una sonda con dos:

```bash
node qa/sonda-enlace-publico.mjs              # el camino completo del postulante
node qa/sonda-enlace-publico.mjs enlace-antiguo
node qa/sonda-enlace-publico.mjs demostracion
node qa/sonda-enlace-publico.mjs demostracion-propia
node qa/sonda-enlace-publico.mjs movil
node qa/sonda-enlace-publico.mjs avalancha
```

El arnés (`qa/arnes-evaluaciones.mjs`) siembra el backend `.gs` **real** en
memoria, publica una evaluación de verdad, sirve la aplicación construida y abre
dos contextos de Chromium: uno con la sesión y la configuración del reclutador,
otro completamente limpio. Las llamadas a `script.google.com` se desvían al
`doPost` real, y el arnés apunta **qué acciones llevaron llave y cuáles no**.

Con el código anterior, la primera pasada dio esto:

```
▸ El postulante abre ese mismo enlace en su navegador
  · primeros 200 caracteres: No se pudo abrir la evaluación
    No existe ninguna evaluación con ese código.
  ✗ el postulante NO recibe «No se pudo abrir la evaluación»
  ✗ la portada muestra el título de la evaluación
  · llamadas al backend: ping, listEvaluations      ← ninguna del postulante
```

La última línea es la prueba del diagnóstico: el navegador del postulante **no
llamó a nadie**. Se contestó a sí mismo desde un almacén local vacío.

## El código, sección por sección

### 1 · La referencia del despliegue (`api/connection.ts`)

Apps Script publica en dos formas y solo en dos, así que la conversión es cerrada
en los dos sentidos:

```ts
export function despliegueDeUrl(url: string): Despliegue | null {
  if (parsed.hostname !== "script.google.com") return null;
  const conDominio = /^\/a\/macros\/([A-Za-z0-9.-]+)\/s\/([A-Za-z0-9_-]+)\/exec\/?$/.exec(parsed.pathname);
  if (conDominio) return { id: conDominio[2], dominio: conDominio[1] };
  const simple = /^\/macros\/s\/([A-Za-z0-9_-]+)\/exec\/?$/.exec(parsed.pathname);
  if (simple) return { id: simple[1], dominio: "" };
  return null;
}

export function urlDeDespliegue(d: Despliegue): string {
  if (!RE_ID.test(d.id)) return "";
  if (d.dominio) { … return `https://script.google.com/a/macros/${d.dominio}/s/${d.id}/exec`; }
  return `https://script.google.com/macros/s/${d.id}/exec`;
}
```

> **Por qué el parámetro va DENTRO del hash.** Lo que sigue a la almohadilla no se
> envía al servidor que sirve la página: la referencia no aparece en los registros
> del alojamiento ni en el `Referer` que viaja a terceros. Y no hace falta ninguna
> regla de reescritura en el alojamiento, que es lo que hace que el enlace
> funcione en cualquier sitio estático.

### 2 · El orden de resolución (`resolverConexionPublica`)

```
1. el enlace            → nombra el despliegue donde vive esa evaluación
2. valor de compilación → hace funcionar los enlaces antiguos sin reenviarlos
3. este navegador       → el reclutador abriendo su propio enlace
4. la demostración local, SOLO si esa evaluación está ahí de verdad
5. nada                 → y se dice exactamente eso
```

El paso 5 es el arreglo del mensaje equivocado: **no se cae a la demostración en
silencio**. El paso 4 es su contrapeso: quien está probando el módulo sin haber
configurado nada tiene que poder abrir su propio enlace, así que si la evaluación
está en la demostración de ese navegador se abre —y la pantalla dice, arriba, que
es una **vista local** que nadie más podrá abrir—. La diferencia entre el 4 y el 5
es que el 4 comprueba que la prueba exista antes de contestar.

### 3 · La llave nunca sale hacia un destino ajeno (`api/transport.ts`)

```ts
const permitida = opciones.conLlave !== false && !conexionEsDeEnlace() && !opciones.destino;
if (permitida && activa.llave) cuerpo.llaveAdmin = activa.llave;
```

Y la conexión que impone un enlace nace sin llave, así que hay dos cierres
independientes para lo mismo.

### 4 · Comprobar el enlace antes de enviarlo (`api/verificarEnlace.ts`)

Reproduce lo que hará el postulante: resuelve el despliegue **del propio enlace**
y llama a `openAssessment` **sin llave**. Es lo que convierte «el enlace
funciona» de suposición en hecho:

```
✓ Comprobado como lo verá el postulante. Responde correctamente:
  «Analista de riesgo crediticio», 4 pregunta(s).
```

Corre **sola al publicar** —en el acuse, que ahora se queda en pantalla en lugar
de ser un destello de dos segundos— y a mano desde un botón, junto al enlace.

### 5 · Avisar cuando el enlace no puede funcionar (`ui/EnlacePublico.tsx`)

`diagnosticoEnlace` devuelve `portatil`, `motivo` y `remedio`. Con eso:

- en la lista y en la cabecera del editor, un distintivo **«Solo en este equipo»**;
- al copiar, un aviso en lugar de un «copiado» que engaña;
- en el módulo, el cartel de modo demostración dice ahora la consecuencia: *los
  enlaces que publiques aquí no abrirán en el equipo de nadie más*;
- en **Conexión**, debajo de la URL, se dice si de esa dirección se puede extraer
  la referencia —y por tanto si los enlaces serán portátiles— antes de guardar.

### 6 · Una convocatoria entera entrando a la vez

El backend limita los inicios de intento por enlace y minuto para que nadie cree
miles de intentos. Estaba en **12**, y una convocatoria de veinte personas
abriendo el enlace al mismo tiempo lo agotaba: ocho candidatos recibían «se
alcanzó el límite de inicios de prueba por minuto», que no es algo que un
postulante pueda resolver.

- el límite pasa a **40** por minuto y por enlace (el freno sigue existiendo);
- y, sobre todo, el runner **reintenta solo**, con cuenta atrás visible y
  reutilizando el mismo `solicitudId` —así, si el primer intento sí se creó, el
  servidor devuelve ese mismo y no se duplica nada—:

> «Hay muchas personas entrando a la vez. Se reintenta automáticamente en 20 s:
> no cierres esta página ni vuelvas a pulsar.»

## Verificación

| Comprobación | Antes | Ahora |
| --- | --- | --- |
| `npm run typecheck` | limpio | limpio |
| `npm test` | 743 pruebas · 57 archivos | **763 pruebas · 57 archivos** |
| `node scripts/evaluaciones-backend-check.mjs` | ✅ | ✅ |
| `npm run doc:check` | 30 comprobaciones | 30 comprobaciones |
| `npm run build` | ✅ | ✅ |

Las 20 pruebas nuevas (`__tests__/enlacePublico.test.ts`) fijan las propiedades
que no se pueden volver a perder: la referencia se escribe y se lee, solo
reconstruye direcciones de `script.google.com`, el orden de resolución, que no se
cae a la demostración en silencio, y que **la llave no viaja** a un destino
impuesto por un enlace.

### La sonda, escenario por escenario

| Escenario | Qué demuestra |
| --- | --- |
| `completo` | el postulante abre, lee la portada, escribe nombre y documento, responde, envía; el intento queda en el libro con su nombre; ninguna llamada llevó llave; en su navegador no quedó ninguna llave guardada |
| `enlace-antiguo` | un enlace sin referencia dice que no sabe a qué servidor pertenece, explica el remedio y **no llama a ningún backend a ciegas** |
| `demostracion` | el módulo avisa de que sus enlaces no abrirán en otros equipos |
| `demostracion-propia` | el reclutador abre su enlace de demostración: se abre, con el cartel de «vista local» |
| `movil` | la portada abre en 390 px sin desplazamiento horizontal y el formulario se puede rellenar |
| `avalancha` | con el cupo agotado, el postulante ve la espera y **entra solo** cuando el minuto pasa |

## Alternativas consideradas

### ¿Y por qué no una variable de entorno en Vercel?

| A favor del enlace autodescriptivo (lo elegido) | En contra |
| --- | --- |
| Cero pasos manuales: publicar y copiar el enlace basta | El enlace es más largo (unos 50 caracteres más) |
| Funciona con varias instalaciones o libros a la vez, cada enlace apuntando al suyo | Hay que validar el parámetro con cuidado (se hace: solo `script.google.com`) |
| Cambiar de despliegue no invalida los enlaces ya enviados mientras el anterior exista | Un enlace recortado por un chat pierde la referencia y vuelve al caso «no lo sé» |

Una variable de entorno resuelve el caso de UNA instalación y a cambio pide un
paso manual en cada despliegue, se olvida al migrar de proyecto y no arregla
nada si alguien cambia el libro. Aun así se conserva como respaldo —junto con
`api/despliegue.ts`, que es una línea en el repositorio— porque es lo que hace
abrir los enlaces **antiguos** sin reenviarlos.

### ¿Y meter la evaluación entera en el enlace?

Se puede: un `base64` del cuestionario cabría en una URL para pruebas pequeñas, y
entonces el enlace no necesitaría servidor **para leerse**. Pero una prueba no
solo se lee: se responde, y las respuestas tienen que llegar a algún sitio. Sin
backend no hay dónde recibirlas, así que el enlace abriría la prueba y perdería
el trabajo del postulante al enviarla. Peor que fallar al principio.

## Limitaciones, dichas en voz alta

- **Un enlace antiguo sigue sin poder resolverse solo.** El remedio es volver a
  copiarlo y reenviarlo (el código no cambia), o rellenar `api/despliegue.ts`.
- **Si el enlace pierde el `?b=…`** —un chat que lo recorta, alguien que copia a
  mano solo la primera parte— vuelve al caso «no sé a qué servidor pertenece».
  Por eso el mensaje explica el remedio en lugar de culpar al código.
- **En modo demostración ningún enlace puede funcionar fuera del navegador.** No
  es un defecto que se pueda arreglar en el cliente: sin servidor no hay dónde
  recibir las respuestas. El módulo ahora lo dice en tres sitios distintos.
- **Si se borra el despliegue anterior**, los enlaces que lo nombran dejan de
  responder. Mientras exista, siguen funcionando aunque se publique otro.
- El límite de 40 inicios por minuto y enlace sigue siendo un límite: una
  convocatoria de cien personas simultáneas verá esperas de un minuto (con su
  cuenta atrás y su reintento automático).
- **Lo que NO se ha tocado, y se sabe:** las opciones de respuesta se dibujan con
  botones y `aria-pressed`, no con la semántica de `radiogroup`/`checkbox`. Se
  pueden usar con teclado y con lector de pantalla —son botones— pero no se
  anuncian como «opción 2 de 4», y en una cuadrícula eso importa. Cambiarlo toca
  el campo de respuesta de los treinta y nueve tipos de pregunta y merece su
  propia iteración, con su propia sonda: meterlo aquí habría mezclado un arreglo
  urgente con un rediseño.

## Cuestionario

<details>
<summary>1. ¿Por qué el enlace funcionaba para el reclutador y no para el postulante?</summary>

- **A.** Porque el código de la evaluación caducaba.
- **B.** Porque el enlace solo llevaba el código, y el backend con el que hablar se
  resolvía leyendo el `localStorage` de quien abría: el reclutador lo tiene
  configurado, un postulante no. Su navegador caía al modo demostración, cuyo
  almacén está vacío. ✅
- **C.** Porque faltaba iniciar sesión.

Lo demuestra el registro de la sonda: en la pasada con el código anterior, el
navegador del postulante no hizo **ninguna** llamada al backend.
</details>

<details>
<summary>2. ¿Por qué el enlace lleva el identificador del despliegue y no la URL completa?</summary>

- **A.** Para que el enlace sea más corto.
- **B.** Porque la dirección se reconstruye en el código y siempre queda en
  `script.google.com`: un parámetro manipulado solo puede señalar otro despliegue
  de Apps Script, nunca un servidor ajeno al que enviar los datos del postulante. ✅
- **C.** Porque Apps Script no admite URLs en parámetros.

Lo corto es un beneficio secundario. El motivo es que el conjunto de destinos
posibles queda cerrado por construcción.
</details>

<details>
<summary>3. Un reclutador con la llave guardada abre un enlace de otra instalación. ¿Viaja su llave?</summary>

- **A.** Sí, porque su navegador la tiene.
- **B.** No: cuando el destino lo impone un enlace, la conexión nace sin llave y el
  transporte además la suprime explícitamente. En esa pantalla es una visita
  anónima. ✅
- **C.** Solo si la evaluación es de su libro.

Son dos cierres independientes para la misma propiedad, y hay una prueba que
inspecciona el cuerpo enviado por la red.
</details>

<details>
<summary>4. ¿Qué se ve al abrir un enlace de los antiguos en un navegador nuevo?</summary>

- **A.** «No existe ninguna evaluación con ese código.»
- **B.** «Este enlace no indica a qué servidor pertenece la evaluación», con el
  remedio: pedir que lo copien otra vez desde el módulo. ✅
- **C.** La demostración local, vacía.

Y no se llama a ningún backend a ciegas: sin destino no hay a quién preguntar.
</details>

<details>
<summary>5. ¿Por qué el acuse de publicación dejó de ser un destello de dos segundos?</summary>

- **A.** Por estética.
- **B.** Porque ahora tiene algo que decir: el enlace y el resultado de comprobarlo
  como lo verá el postulante. Es el único momento en el que un enlace que no va a
  funcionar se puede detectar antes de enviarlo a diez personas. ✅
- **C.** Porque la animación daba problemas.
</details>

<details>
<summary>6. Veinte personas abren el enlace a la vez y el cupo se agota. ¿Qué pasa?</summary>

- **A.** Ocho se quedan fuera con «se alcanzó el límite».
- **B.** El cupo se subió a 40 por minuto y, si aun así se topa, el runner espera
  con cuenta atrás y reintenta solo reutilizando el mismo `solicitudId`, así que no
  se duplica ningún intento. ✅
- **C.** El intento se crea a medias.

La sonda `avalancha` agota el cupo a propósito y comprueba que el postulante
acaba dentro sin pulsar nada.
</details>
