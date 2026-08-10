# Evaluaciones · mejoras de agosto de 2026

Documento explicativo del cambio. La versión con capturas, bloques desplegables y
el cuestionario está en Notion:
**[Documento explicativo · Evaluaciones](https://app.notion.com/p/3b8c802d5c4981afbcd9ea913a2fc1c0)**

Este archivo es la versión de repositorio: el mismo contenido, sin las capturas.

---

## 1 · Contexto

El módulo de Evaluaciones se reconstruyó completo en la PR #19: backend propio de
Apps Script sobre un libro independiente, editor de cuatro pasos, runner del
candidato y panel de resultados. Funcionaba, pero el uso diario dejó al
descubierto siete cosas. Tres son las que importan, y las tres tenían la misma
forma: **el sistema hacía lo correcto y no lo mostraba.**

| Síntoma | Lo que en realidad pasaba |
| --- | --- |
| «La negrita no funciona» | Sí se guardaba. El editor del lienzo se monta sin vista previa, así que **el formato era invisible**. |
| «No deja publicar y el error está mal» | La validación era correcta. El bloqueo mostraba un identificador interno y **la vista no se movía**, así que quedabas mirando la primera pregunta —que sí estaba marcada—. |
| «La importación no sirve» | El lector de PDF **no podía** funcionar con ningún PDF real, y el analizador rompía el formato exacto que usa el equipo. |

---

## 2 · Intuición

### 2.1 · El formato tiene que verse donde se escribe

El editor no usa `contentEditable` —decisión de la iteración anterior, y buena: el
estado vive en React y no hay HTML que sanear—. El precio era que el formato no se
veía dentro del área de escritura.

La idea: **un espejo debajo**. El `textarea` conserva su texto en transparente (con
el cursor visible) y un `div` pinta el mismo texto con sus marcas. Las dos capas
comparten la caja tipográfica, así que el texto rompe línea en el mismo sitio.

> **La regla que hace que funcione:** el espejo no puede cambiar el *ancho de
> avance* del texto, porque la composición que manda es la del `textarea`.
> `font-weight: 700` ensancha ~9 % y desalinearía el cursor. Por eso la negrita se
> pinta engrosando el trazo del glifo (`-webkit-text-stroke`), que es pura pintura.
> Medido: `normal` y `stroke` dan **333,9 px** para la misma frase; `font-weight:
> 700` da **363,3 px**.

### 2.2 · Un bloqueo tiene que llevarte al sitio

Antes el panel decía «Puntúa automáticamente pero no tiene respuesta correcta
definida» junto a `preguntas.pr_2d9ed8c5-….respuestaEsperada`, y al pulsarlo la
vista no se movía. Con cuarenta preguntas de opción única eso no dice cuál, y la
conclusión razonable es que el sistema se equivoca.

Ahora el hallazgo dice **«Sección 1 «Auditoría interna» · Pregunta 7»**, la vista
se desplaza hasta el bloque, este destella, y el aviso aparece **dentro de la
pregunta** con un botón que lo resuelve. El mismo mecanismo arregla el índice.

### 2.3 · La clave de respuesta ya está en el documento

Así escribe el equipo sus pruebas en Word: la correcta va **subrayada o
resaltada**, no marcada con un asterisco. Un importador que solo lea texto plano
tira el dato más valioso del documento.

Ahora el lector de `.docx` conserva el formato de cada tramo y el analizador lo usa
como señal. Tres vías, por orden de confianza: **el formato**, **un marcador**
escrito a mano (`*`, `(correcta)`, `[X]`, `✔`) y **la tabla de respuestas** final.

Cuando no hay ninguna —el caso de un PDF, donde el subrayado es un rectángulo
dibujado— el importador **lo dice** y pide las claves con un selector A/B/C/D. No
inventa ninguna: una clave equivocada es peor que una ausente, porque nadie la
revisa.

### 2.4 · Por qué el lector de PDF no podía funcionar

Buscaba literales entre `BT` y `ET` sobre los bytes crudos. Con un PDF real falla
por dos razones independientes: el flujo viene **comprimido**, y los códigos de
`(…)` no son caracteres sino **índices de glifo** de una fuente en subconjunto.

Resultado real del lector antiguo sobre un PDF de prueba:

```
□ Q□□ □r □1□b□o □m □- t□□r □- □u□- □t□- □□- □7 □l □b□m □b□v□|□u□- □1□b[ □m :
```

Del nuevo, sobre el mismo archivo:

```
1. Según las NOGAI, el propósito principal de la auditoría interna es:
A) Elaborar estados financieros.
```

### 2.5 · El puntaje sobre 100

Cada pregunta nacía con 1 punto: una prueba de 20 valía 20 y otra de 33 valía 33,
y «70 puntos para aprobar» significaba cosas distintas. Ahora la evaluación declara
un objetivo (**100** por omisión) y el módulo lo reparte.

> **Por qué no es «100 / n».** 100 entre 3 son 33,333… Si se redondea cada parte, la
> suma da 99,99 y el criterio de aprobación en puntos deja de cuadrar. El reparto
> se hace **en centésimas enteras con resto**: la suma es exactamente el objetivo,
> siempre. Hay una prueba que lo comprueba con 3, 6, 7, 9, 11, 13, 17, 23 y 40
> preguntas.

---

## 3 · Código

| Archivo | Qué hace |
| --- | --- |
| `richtext/RichTextEditor.tsx` | Reescrito: espejo con formato, barra que actúa sobre la palabra del cursor, barra compacta al enfocar. |
| `imports/pdfTexto.ts` *(nuevo)* | Lector de PDF: objetos, `ObjStm`, `/ToUnicode`, operadores de texto, agrupación por posición. |
| `imports/docxTexto.ts` *(nuevo)* | Lector de Word **con formato** por tramos. |
| `imports/questionParser.ts` *(nuevo)* | Analizador de dos pasadas: clasifica líneas y agrupa con contexto. |
| `imports/ImportPanel.tsx` | Tres pasos: origen → revisión (con selector de claves) → borrador. |
| `domain/puntaje.ts` *(nuevo)* | Objetivo de puntaje y reparto exacto con resto. |
| `domain/validation.ts` | Cada hallazgo lleva su ubicación legible y un mensaje que dice qué hacer. |
| `builder/QuestionsStep.tsx` | Salto con destello, avisos en línea con arreglo rápido, opciones compactas con letra. |
| `results/kpis.ts`, `results/ActaIndividual.tsx` *(nuevos)* | Indicadores de la convocatoria y acta individual imprimible y en PDF. |
| `ui/carga.ts` *(nuevo)*, `ui/pieces.tsx` | Progreso por etapas, esqueletos, números animados, texto con recorrido, tonos. |
| `src/index.css` | Tonos semánticos por tema, marcas del editor, barra de carga, impresión del acta. |

### El espejo del editor

```tsx
<div className="relative" style={{ minHeight: `calc(${filas} * 1.55em + 1.35rem)` }}>
  <div aria-hidden className={`rt-mirror ${clasesCaja}`}>
    {spans.map((span, i) => (
      <span key={i} className={(span.m ?? []).map((m) => CLASE_MARCA_EDITOR[m]).join(" ")}>
        {span.x}
      </span>
    ))}
  </div>
  <textarea className={`rt-area absolute inset-0 h-full w-full ${clasesCaja}`} … />
</div>
```

```css
.rt-area { color: transparent; caret-color: var(--ink); }
.rt-area::selection { background: var(--rt-selection); color: transparent; }
.rt-b { -webkit-text-stroke: 0.5px currentColor; }  /* negrita sin métrica */
```

### Las cuatro reglas del analizador

1. **El número tiene que avanzar.** Tras la 16, un `1.` es una enumeración interna.
   Al abrir una sección el contador se reinicia.
2. **La letra tiene que ser la que toca.** Así «A partir de la norma…» no es la
   opción A. Y una `A)` cuando ya había dos opciones abre **otra pregunta**.
3. **Una línea suelta continúa lo anterior.** Recompone los enunciados que el PDF
   partió por el renglón.
4. **Las viñetas dependen del contexto.** Con opciones con letra son parte del
   caso; sin ellas, *son* las opciones.

Consecuencia deliberada: una línea que acaba en `?` dentro de una pregunta sin
opciones es el remate del enunciado, no una pregunta nueva.

### El reparto, en centésimas

```ts
const totalCentesimas = Math.round(objetivo * 100);
const partes = participantes.map((p) => Math.floor((totalCentesimas * p.peso) / sumaPesos));
let resto = totalCentesimas - partes.reduce((s, p) => s + p, 0);
for (let i = 0; resto > 0; i = (i + 1) % partes.length) { partes[i] += 1; resto -= 1; }
```

### Los tonos, en lugar de colores fijos

El módulo repetía `bg-cyan-500/15 text-cyan-200 ring-cyan-400/30` en cincuenta
sitios, elegido mirando el tema oscuro. Ahora el color lo decide el tema y la
interfaz pide el tono. Medido en el navegador sobre el tema claro: **5,4 a 6,8:1**,
por encima del 4,5:1 de WCAG AA.

### Un fallo silencioso que apareció de paso

Desde el editor, «Abrir resultados» **no hacía nada**: el módulo tenía un `return`
temprano cuando hay una evaluación abierta, así que el estado cambiaba y el
componente que lo dibuja se quedaba en la otra rama.

---

## 4 · Verificación

```
npx tsc -b       → sin errores
npx vite build   → limpio (8,2 s)
npm test         → 17 archivos, 234 pruebas, todas en verde
                   (39 nuevas: 23 del analizador, 16 del reparto)
```

Las 23 pruebas del analizador usan **el formato real** del documento del equipo, y
cada caso corresponde a un fallo concreto que la heurística anterior cometía.

En el navegador se ejerció el camino completo: importar un `.docx` → revisar →
crear el borrador → publicar → abrir el enlace público como tres candidatos →
responder → enviar → ver resultados → abrir el acta → descargar el PDF. El PDF
descargado se volvió a leer para comprobar la paginación y la numeración.

Las capturas están en `docs/evaluaciones/mejoras/`.

### Cómo revisarlo a mano

El módulo arranca en **modo demostración** sin configurar nada.

1. **La negrita.** *Nueva evaluación* → *Preguntas* → *Agregar bloque* → *Opción
   única*. Escribe, selecciona dos palabras y pulsa **Ctrl+B**. Prueba también con
   el cursor dentro de una palabra, sin seleccionar.
2. **El bloqueo.** Sin marcar la correcta, ve a *Revisión*: el bloqueo dice sección
   y número. Púlsalo: la vista salta y destella. Usa el botón del aviso.
3. **El índice.** Con seis preguntas, pulsa una del índice.
4. **Importar Word** con la correcta subrayada → «Clave leída del subrayado».
5. **Importar PDF** → avisa de que la clave no se puede detectar; márcalas.
6. **Puntaje.** En *General*, «Puntaje total»; agrega una pregunta y mira el
   reparto. Desactívalo y los puntos vuelven a ser manuales.
7. **Progreso.** Al entrar al módulo y al abrir resultados.
8. **Acta.** *Resultados* → columna **Acta** → *Imprimir* y *Descargar PDF*.
9. **Los dos temas**, con el interruptor del dock.

---

## 5 · Alternativas

### 5.1 · Para el editor: `contentEditable` de verdad

| A favor | En contra |
| --- | --- |
| WYSIWYG completo y real, negrita con su métrica correcta. | El estado real vive en el DOM: hay que leerlo de vuelta y normalizarlo en cada tecleo. |
| Es lo que la gente espera de un editor. | `document.execCommand` está obsoleto y cada navegador produce un HTML distinto. |
| Permitiría pegar con formato desde Word. | Vuelve a meter HTML en la cadena, que es lo que este modelo evita. |
| | Saltos de cursor y bugs de composición en móvil: mucha superficie de regresión. |

Se descartó porque el problema real era la **falta de realimentación visual**, y eso
se resuelve sin cambiar el modelo de datos.

### 5.2 · Para el PDF: usar `pdfjs-dist`

| A favor | En contra |
| --- | --- |
| Biblioteca de referencia, probada contra millones de PDF raros. | ~1 MB de dependencia y un *worker* aparte, para una pantalla de uso ocasional. |
| Soporta PDF cifrados, CID complejos, texto vertical. | El módulo tiene como principio explícito no añadir dependencias de peso. |
| Menos código propio que mantener. | Habría que resolver el empaquetado del worker en Vite y en el despliegue. |

Se escribió el lector propio porque cubre el caso que importa, y porque para el que
no cubre —el escaneo— ninguna biblioteca ayudaría: eso pide OCR. Cambiar de motor
es sustituir un archivo: la frontera es `extraerLineasPdf(bytes) → string[]`.

### 5.3 · Para el puntaje: normalizar al calificar en lugar de repartir

| A favor | En contra |
| --- | --- |
| No toca los datos: cada pregunta conserva su peso natural. | Lo que se lee en el editor y en el acta seguiría en otra escala que la nota. |
| Cambiar la escala no exigiría reescribir puntos. | El criterio de aprobación «en puntos» seguiría siendo ambiguo. |
| | Exigiría cambiar el calificador del servidor: más riesgo, y afecta a intentos ya calificados. |

---

## 6 · Personas sugeridas para consultar

Revisado el historial de `git` de los archivos tocados: **todos los commits de
estos archivos son del agente** (el módulo se creó desde cero en la PR #19, también
generada por IA). No hay una persona del equipo con contexto previo en este código,
y sería deshonesto inventar una lista.

Lo que sí conviene consultar, porque el código depende de decisiones humanas:

1. **Quien redacta las pruebas en Word.** Las reglas del analizador están
   calibradas sobre «PRUEBA AUDITOR PARA REV 1». Conviene pasarle dos o tres
   documentos más de otros procesos.
2. **Quien define la escala de calificación.** El total de 100 y el reparto
   uniforme son la convención asumida; ponderar secciones ya es posible con el peso
   de la sección, pero hay que decidirlo.
3. **Quien archiva los expedientes.** El acta está diseñada como respaldo formal,
   con firmas. Si el expediente exige campos concretos, es un solo componente.

---

## 7 · Cambios que hay que conocer si se opera el backend

**Ninguno obligatorio.** No hay columnas nuevas ni acciones nuevas: el objetivo de
puntaje viaja en `extras`, que el backend ya persiste como JSON (`extras_json` en
la hoja `Evaluaciones`). No hace falta reinstalar, reparar ni volver a desplegar el
Apps Script.

Dos consecuencias que conviene saber:

- Las evaluaciones **ya existentes** no tienen el objetivo declarado, y `undefined`
  se lee como «100 con reparto automático». La primera vez que se guarde una
  evaluación antigua, sus puntos se repartirán sobre 100. Si alguna debe conservar
  su escala, desactiva el reparto en *Configuración general* antes de guardar.
- El **criterio de aprobación en puntos** ahora significa lo mismo en todas las
  evaluaciones. Si alguna tenía «14 puntos para aprobar» sobre un total de 20,
  conviene volver a expresarlo (70 %, o 70 puntos).
